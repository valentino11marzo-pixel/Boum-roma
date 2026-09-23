// api/portal/ingest.js — L'INNESTO: da documento/testo a dati strutturati.
//
// Prende quello che l'operatore ha DAVVERO in mano (il PDF del contratto, la
// foto della carta d'identità, la visura, il messaggio WhatsApp del
// proprietario, due righe scritte a mano — anche TUTTI insieme, in una
// lettura sola) e ne ricava una PROPOSTA nello schema esatto del portale:
// proprietario, immobile, inquilino, co-conduttori, contratto — con, per ogni
// campo, la frase del documento da cui è stato letto.
//
// Non scrive NIENTE su Firestore. Restituisce solo la proposta: la creazione
// avviene nel portale, dopo che l'operatore l'ha vista, corretta e confermata.
// Questo è deliberato — un import che scrive da solo è un import che sporca
// l'archivio senza che nessuno se ne accorga.
//
// LA LEZIONE DEL 14 SETTEMBRE 2026 (letta nei log di produzione, non dedotta).
// Alle 08:30 l'Innesto è morto su un documento vero con
//     why=truncated len=3365 fenced=1 stop=end_turn
// cioè: il modello aveva FINITO (stop=end_turn, non max_tokens), ma il JSON
// scritto a mano libera dentro un recinto ```json non chiudeva le graffe —
// una virgoletta non escapata dentro una nota basta — e la lettura lo ha
// diagnosticato come «troncato». All'operatore è arrivato il consiglio
// SBAGLIATO («il documento è troppo lungo, allega meno pagine») per un guasto
// che non c'entrava con la lunghezza. Un JSON di 120 campi chiesto come testo
// libero a un modello è una lotteria, e la lotteria l'operatore la leggeva
// come «non riesce mai a leggere i file».
//
// Tre cambi di classe:
//  1. IL JSON ARRIVA GIÀ PARSATO. La risposta non è testo da leggere: è la
//     chiamata di UNO strumento (`proposta`: tools + tool_choice) il cui
//     input l'API consegna come OGGETTO JSON — valido per costruzione — con
//     lo schema (INGEST_SCHEMA) come input_schema. `_modeljson.js` resta come
//     rete per il solo caso in cui il modello risponda a parole.
//     LA TERZA LEZIONE DEL 21 SETTEMBRE 2026: la prima via era l'output
//     strutturato (output_config.format con json_schema), che compila lo
//     schema in una GRAMMATICA. Tolte le 99 unioni (seconda lezione), il
//     primo documento vero ha risposto 400 «The compiled grammar is too
//     large, which would cause performance issues»: oltre ai 16/24 documentati
//     c'è un tetto INTERNO sulla grammatica compilata, dichiarato nei docs
//     senza un numero («Additional internal limits»), e 148 parametri lo
//     superano. Uno strumento NON strict non compila niente: nessuna
//     grammatica, nessun tetto — e il JSON resta un oggetto, perché così
//     l'API consegna l'input di un tool_use. L'aderenza allo schema è del
//     modello, non della grammatica: il motore (dataops-engine) legge "",
//     null, numeri e booleani allo stesso modo, e i test lo provano.
//  2. IL MODELLO GIUSTO. Un contratto registrato all'AdE vale più di un
//     inventario, e l'inventario legge già con claude-opus-5 («il documento
//     vale sul deposito: qui non si risparmia»). Qui idem. Il tempo lo paga
//     vercel.json (maxDuration 120) — prima questa funzione non c'era nemmeno
//     e girava col default della piattaforma.
//  3. LO SCHEMA È IL DIZIONARIO. Prima si estraevano 36 campi e il PDF ne
//     stampa ~70 (js/contract-fields.js): documento d'identità, catasto a
//     caselle, co-conduttori, corso di studi, conviventi — tutto quello che
//     poi usciva come puntini. Ora si legge ciò che il contratto stampa.
//
// Auth: Firebase ID token (admin/owner/landlord) come le altre superfici
// chiamate dal browser loggato. La chiave Anthropic resta lato server.

import { PDFDocument } from 'pdf-lib';
import { requireRole } from '../_auth.js';
import { fsList } from '../homie/_lib.js';
import { parseModelJson, jsonFailureLine, jsonFailureHint } from '../_modeljson.js';
import { aiSignal } from '../_budget.js';
import { recordUsage } from '../_ai.js';
import { CATS } from '../documents/_smista.js';
import D from '../../js/dataops-engine.js';
import FIELDS from '../../js/contract-fields.js';

// Scopo `direct` nel registro (js/ai-registry.js, 'portal.ingest', come il
// proxy del Doc Parser): lo strumento `proposta`, il thinking adattivo e la
// scala dei 400 di forma qui sotto sono del cloud — non si instrada, ma si
// CONTA (recordUsage): è la voce più cara del registro e /ai deve vederla.
// Il registro pinna lo stesso modello (tests/ai: un `direct` che lo scrive a
// mano deve scriverlo uguale, o il costo in /ai sarebbe quello di un altro).
export const MODEL = 'claude-opus-5';
export const EFFORT = 'medium';   // output_config.effort — vedi askModel
import { sniffType, extractText, TEXTY, TEXTY_LABEL, FORMATS_HUMAN } from '../_doctext.js';

export const MAX_FILES = 8;
// LA SECONDA LEZIONE DEL 21/09/2026: 8 MB per file era un tetto NOSTRO, non
// della piattaforma (Anthropic accetta 32 MB a richiesta, base64 compreso):
// un PDF scansionato da 9 MB veniva rifiutato «per grandezza» senza motivo.
// 20 MB per file e per giro → 26,7 MB in base64, sotto il tetto vero.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 60;                       // oltre, si leggono le prime 60 e lo si dice
export const MAX_TOTAL_PAGES = 100;                // Anthropic: 100 pagine PDF per RICHIESTA — non per file
const MAX_TEXT = 60000;                            // ~15k token di testo incollato
const MAX_B64 = Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4;
export const MAX_TEXT_DOC = 150000;                // caratteri per documento testuale (Word/Excel/email): oltre, si legge la testa e lo si dice
const AI_MS = 100000;                              // sotto il maxDuration 120 di vercel.json

// LA LEZIONE DEL 28 AGOSTO 2026: il body di una function Vercel ha un tetto
// di PIATTAFORMA di 4,5 MB — il 413 lo emette l'edge PRIMA che questo file
// parta, quindi il sizeLimit qui sotto non lo alza. La via per i file grandi
// è fileUrl: il client li carica sul NOSTRO Storage (transito, cancellato a
// lettura finita) e qui si scaricano server-side, dove il tetto non esiste.
export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

const MEDIA_OK = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;   // i BINARI che il modello legge; il resto passa da _doctext come testo
const mbOf = (n) => (n / 1024 / 1024).toFixed(1);
const MEDIA_HEIC = /^image\/hei[cf]$/i;

async function fetchTransit(fileUrl) {
  let u;
  try { u = new URL(String(fileUrl)); } catch (_) { throw new Error('bad_file_url'); }
  // Solo il NOSTRO Storage: i byte scaricati finiscono ad Anthropic, quindi
  // un URL libero trasformerebbe l'endpoint in un proxy verso host arbitrari.
  if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') {
    throw new Error('bad_file_url');
  }
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error('fetch_file_failed_' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) throw new Error('file_too_large');
  const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
  return { buf, mediaType: ct };
}

// Un PDF di 120 pagine (contratto + allegati + planimetrie) si legge nelle
// prime MAX_PAGES: i dati stanno in testa, il resto sono allegati. pdf-lib è
// già una dipendenza; su un PDF cifrato o rotto si passa il file com'è.
async function clipPdf(buf) {
  try {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const n = src.getPageCount();
    if (n <= MAX_PAGES) return { buf, pages: n, clipped: false };
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, Array.from({ length: MAX_PAGES }, (_, i) => i));
    pages.forEach((p) => out.addPage(p));
    return { buf: Buffer.from(await out.save()), pages: n, clipped: true };
  } catch (_) {
    return { buf, pages: null, clipped: false };
  }
}

// ─── LO SCHEMA (input_schema dello strumento `proposta`) ─────────────────
// Regole della piattaforma: ogni oggetto con additionalProperties:false e
// TUTTE le chiavi in required; il "manca" si esprime con "" (vedi sotto). Le
// descrizioni sono parte del prompt: dicono al modello cosa va in ogni campo.
// ─── «Manca» = stringa vuota, MAI null ───────────────────────────────────
// LA LEZIONE DEL 21 SETTEMBRE 2026: la prima versione scriveva ogni campo
// facoltativo come anyOf [tipo, null] — 99 unioni — e OGNI lettura moriva con
// 400 «Schemas contains too many parameters with union types», che il
// portal mostrava come «errore (400), riprova»: l'operatore incolpava il PDF.
// L'API compila lo schema in una grammatica e ha limiti DOCUMENTATI per
// richiesta: 16 parametri con unione (anyOf o type array) e 24 parametri
// fuori da `required`. Su 120 campi né «nullable» né «facoltativo» sono
// strade: TUTTE le chiavi restano in required, nessuna unione, e «manca» è
// "" — che il motore (dataops-engine: num/str/date/yesno) tratta già come
// null. Anche i numeri viaggiano come stringhe di cifre: 0 non può fare da
// sentinella (filled(0) è vero: «0 mq» sarebbe un dato) e un number nullable
// sarebbe un'unione.
// LA LEZIONE DEL 22 SETTEMBRE 2026 — LO SCHEMA È SPARSO. Con lo strumento
// NON strict (la terza lezione del 21/09) nessuna grammatica viene compilata,
// quindi i limiti 16/24 non valgono più — e il `required` completo era
// rimasto solo come COSTO: il modello stampava ~150 chiavi con "" a OGNI
// lettura, ~900 token di output pagati e attesi (a ~100 token/s sono ~9 s per
// giro; su un testo catastale incollato erano metà dei 23 s misurati nei log).
// Ora nessun `required`: una chiave omessa = «manca», e il prompt dice di
// omettere le vuote. Il motore leggeva già "" e undefined allo stesso modo
// (num/str/date/yesno), quindi la forma piatta non cambia. SCHEMA_LIMITS
// resta esportata come memoria: vale SOLO per output_config.format / tool
// strict, che qui non si usano più.
export const SCHEMA_LIMITS = { unionParams: 16, optionalParams: 24 };   // documentati (structured outputs → Schema complexity limits) — solo per una grammatica, che qui non c'è
const VUOTO = ' Omettila se il materiale non lo dice.';
const nstr = (d) => ({ type: 'string', description: d + VUOTO });
const nnum = (d) => ({ type: 'string', description: d + ' Numero puro scritto come stringa di sole cifre (es. "1100", "65.5"), senza simboli né separatori delle migliaia.' + VUOTO });
const nint = (d) => ({ type: 'string', description: d + ' Numero intero scritto come stringa di cifre (es. "3").' + VUOTO });
const nbool = (d) => ({ type: 'string', enum: ['si', 'no', ''], description: d + ' "si" oppure "no"; omettila se non detto.' });
const nenum = (values, d) => ({ type: 'string', enum: values.concat(['']), description: d + ' Omettila se non determinabile.' });
// Nessun `required`, di proposito (22/09): una chiave omessa è «manca».
const obj = (props, d) => ({ type: 'object', description: d, properties: props, additionalProperties: false });
const arr = (items, d) => ({ type: 'array', items, description: d });

const DOC_TYPE = ['passport', 'id', 'permit', 'patente'];
const KIND_KEYS = Object.keys(CATS);

const personProps = (extra) => Object.assign({
  name: nstr('Nome e cognome come scritti sul documento (per una società: la ragione sociale)'),
  email: nstr('Email'),
  phone: nstr('Telefono con prefisso'),
  codiceFiscale: nstr('Codice fiscale, 16 caratteri (11 cifre per una società). Trascrivilo carattere per carattere.'),
  address: nstr('Residenza o domicilio: via, numero, CAP, città'),
  birthDate: nstr('Data di nascita AAAA-MM-GG'),
  birthPlace: nstr('Luogo di nascita: Comune (e Paese se estero)'),
  nationality: nstr('Nazionalità / cittadinanza'),
  docType: nenum(DOC_TYPE, 'Tipo di documento d\'identità: passport, id (carta d\'identità), permit (permesso di soggiorno), patente'),
  docNum: nstr('Numero del documento d\'identità'),
  docIssuer: nstr('Ente che ha rilasciato il documento (es. "Comune di Roma", "Ministero dell\'Interno")'),
  docIssueDate: nstr('Data di rilascio del documento AAAA-MM-GG'),
}, extra || {});

export const INGEST_SCHEMA = obj({
  files: arr(obj({
    index: { type: 'integer', description: 'Indice del documento come nell\'intestazione "DOCUMENTO n" (1-based)' },
    kind: { type: 'string', enum: KIND_KEYS, description: 'Che cosa è il documento (tassonomia dell\'archivio)' },
    title: nstr('Titolo breve in italiano, es. "Contratto transitorio Via Cavour 12", "Carta d\'identità di Marta Neri (fronte)"'),
    pages: nint('Pagine lette, se è un PDF'),
    legible: { type: 'boolean', description: 'false se il documento è illeggibile (scansione storta, buia, mossa) o vuoto' },
    summary: nstr('Una frase: cosa contiene e, se illeggibile, perché'),
    party: nenum(['tenant', 'landlord', 'cotenant', 'unknown'], 'Per un documento d\'identità: a quale parte appartiene'),
  }), 'Un elemento per ogni DOCUMENTO n ricevuto (e uno per il testo incollato, se c\'è)'),
  material: nenum(['contratto', 'proposta', 'identita', 'immobile', 'messaggio', 'fattura', 'altro'],
    'Che cosa è il materiale NEL SUO INSIEME: contratto (di locazione, anche bozza) · proposta (pre-accordo / rental proposal / offerta con provvigione e dovuto alla firma) · identita (solo documenti d\'identità) · immobile (visura, APE, planimetria, descrizione) · messaggio (WhatsApp, email o richiesta di un potenziale cliente) · fattura (fattura, ricevuta, estratto conto) · altro.'),
  landlord: obj(personProps({
    kind: nenum(['fisica', 'giuridica'], 'Persona fisica o società/ente'),
    businessName: nstr('Ragione sociale se il locatore è una società'),
    partitaIva: nstr('Partita IVA (11 cifre) se società'),
    iban: nstr('IBAN su cui va pagato il canone, senza spazi'),
  }), 'Il LOCATORE / parte locatrice / concedente (chi dà in affitto). Tutti i campi "" se il materiale non lo nomina.'),
  tenant: obj(personProps({
    permessoNumero: nstr('Numero del permesso di soggiorno o del visto (solo extra-UE)'),
    permessoScadenza: nstr('Scadenza del permesso AAAA-MM-GG'),
  }), 'Il CONDUTTORE principale / parte conduttrice / locatario / inquilino (il primo nominato). Tutti i campi "" se assente.'),
  coTenants: arr(obj(personProps()), 'Gli ALTRI conduttori che firmano (secondo, terzo…). Vuoto se è uno solo. Mai fondere due persone in una.'),
  property: obj({
    name: nstr('Nome breve dell\'immobile, es. "Via Cavour 12, int. 5"'),
    address: nstr('Via e numero civico dell\'IMMOBILE LOCATO (dopo "sito in / posto in / ubicato in"), NON la residenza delle parti'),
    city: nstr('Comune dell\'immobile (vuoto = Roma)'),
    floor: nstr('Piano (es. "3", "T" per terra, "R" per rialzato)'),
    scala: nstr('Scala, se indicata'),
    interno: nstr('Interno / numero dell\'appartamento'),
    sqm: nnum('Superficie in mq'),
    rooms: nint('Numero di vani/stanze (oltre cucina e servizi)'),
    bathrooms: nint('Numero di bagni'),
    accessories: nstr('Pertinenze e accessori: cantina, soffitta, posto auto, balcone…'),
    furnished: nbool('Ammobiliato.'),
    energyClass: nstr('Classe energetica APE (A4…G)'),
    propertyType: nenum(['apartment', 'room', 'studio', 'house', 'office', 'other'], 'Tipologia'),
    cadastral: obj({
      sezione: nstr('Sezione urbana, se presente'),
      foglio: nstr('Foglio catastale'),
      particella: nstr('Particella / mappale'),
      sub: nstr('Subalterno'),
      categoria: nstr('Categoria catastale, es. A/2'),
      rendita: nnum('Rendita catastale in euro'),
    }, 'Dati catastali: da contratto, visura o attestazione'),
    tabelle: obj({
      proprieta: nnum('Millesimi di proprietà'),
      riscaldamento: nnum('Millesimi riscaldamento'),
      acqua: nnum('Millesimi acqua'),
      altre: nstr('Altre tabelle millesimali, in testo'),
    }, 'Tabelle millesimali se riportate'),
  }, 'L\'IMMOBILE locato. Tutti i campi "" se il materiale non lo descrive.'),
  contract: obj({
    type: nenum(['transitorio', 'studenti', '3+2', '4+4', 'ordinaria'], 'transitorio (L.431/98 art.5 c.1, 1-18 mesi) · studenti (art.5 c.2-3) · 3+2 (art.2 c.3, canone concordato) · 4+4 (art.2 c.1, canone libero) · ordinaria (altro)'),
    startDate: nstr('Decorrenza AAAA-MM-GG'),
    endDate: nstr('Scadenza AAAA-MM-GG'),
    durationMonths: nint('Durata in mesi se il documento la dichiara ("mesi 12", "un anno")'),
    rent: nnum('Canone MENSILE in euro (numero puro). Se il documento dà l\'annuo, dividi per 12 e dillo in notes'),
    deposit: nnum('Deposito cauzionale in euro, se scritto come importo'),
    depositMonths: nint('Deposito come numero di mensilità, se scritto così'),
    paymentDay: nint('Giorno del mese entro cui si paga (1-28)'),
    installmentMonths: nenum(['1', '2', '3', '6', '12'], 'Cadenza delle rate in mesi: "1" mensile, "2" bimestrale, "3" trimestrale, "6" semestrale, "12" annuale'),
    accessoryCharges: nnum('Oneri accessori / spese condominiali a carico del conduttore, in euro AL MESE'),
    condoMode: nenum(['incluso', 'consuntivo'], 'Spese condominiali incluse nel canone o a consuntivo'),
    cedolareSecca: nbool('"si" se il locatore opta per la cedolare secca, "no" se si applica il regime ordinario (registro + bollo).'),
    transitionalReason: nstr('Motivazione dell\'esigenza transitoria (solo transitorio), come scritta nel documento'),
    transitionalDocs: nstr('Documento che attesta l\'esigenza, se citato'),
    esigenzaDi: nenum(['conduttore', 'locatore'], 'Di chi è l\'esigenza transitoria'),
    studenti: obj({
      corsoStudi: nstr('Corso di studi'),
      universita: nstr('Università'),
      universitaIndirizzo: nstr('Indirizzo dell\'università'),
      tipoIscrizione: nstr('Tipo di iscrizione (triennale, magistrale, dottorato, erasmus…)'),
      annoAccademico: nstr('Anno accademico, es. 2026/2027'),
    }, 'Solo per il contratto studenti'),
    cohabitants: nstr('Persone autorizzate a convivere col conduttore (nomi), se indicate'),
    otherClauses: nstr('Altre clausole particolari, in breve'),
    signaturePlace: nstr('Luogo di firma'),
    signatureDate: nstr('Data di firma AAAA-MM-GG'),
    paymentMethod: nstr('Modalità di pagamento (bonifico, contanti…)'),
    istatPct: nstr('Percentuale di aggiornamento ISTAT pattuita, se presente (es. "75")'),
    notes: nstr('Note sul contratto utili all\'operatore'),
  }, 'Il CONTRATTO. Tutti i campi "" se il materiale non è un contratto (una carta d\'identità non ha canone).'),
  preagreement: obj({
    ref: nstr('Riferimento della proposta BOOM stampato sul documento, es. "BOOM-3K9F2A" (forma BOOM-XXXXXX)'),
    isBoom: nbool('"si" se è una proposta / pre-accordo / rental proposal emessa da BOOM (intestazione BOOM, boomrome.com, Egidi).'),
    status: nenum(['sent', 'accepted', 'paid', 'signed'], 'Stato che il documento dichiara: sent (inviata), accepted (accettata/firmata dal cliente), paid (pagata), signed (contratto firmato)'),
    acceptedAt: nstr('Data di accettazione AAAA-MM-GG, se stampata'),
    feePct: nnum('Provvigione / onorario agenzia in % del canone ANNUO'),
    feeMonths: nnum('Provvigione in mensilità di canone, se espressa così'),
    feeEur: nnum('Provvigione in euro, se scritta come importo (senza IVA)'),
    feeVatPct: nnum('IVA sulla provvigione in %'),
    feeDue: nenum(['move-in', 'signing', 'separate'], 'Quando è dovuta la provvigione: move-in (all\'ingresso), signing (alla firma della proposta), separate (a parte)'),
    energyCredit: nnum('Quota / credito energia mensile inclusa nel canone, in euro'),
    depositSplitPct: nnum('Percentuale del deposito dovuta alla firma della proposta (il resto all\'ingresso)'),
    dueAtSigning: nnum('Importo totale dovuto alla firma della proposta, in euro'),
    validUntil: nstr('Validità dell\'offerta AAAA-MM-GG'),
    extras: nstr('Altre voci economiche della proposta come "etichetta: importo", separate da ";"'),
  }, 'La PROPOSTA / pre-accordo / rental proposal: i termini economici del deal oltre al contratto. Tutti i campi "" se il materiale non è una proposta.'),
  lead: obj({
    name: nstr('Nome (e cognome) di chi scrive'),
    email: nstr('Email di chi scrive'),
    phone: nstr('Telefono di chi scrive, con prefisso'),
    request: nstr('La richiesta con le parole del cliente, in breve (max 300 caratteri): cosa cerca o cosa propone'),
    zone: nstr('Zona / quartiere di Roma cercato o dell\'immobile proposto'),
    budget: nnum('Budget mensile in euro'),
    bedrooms: nint('Camere cercate'),
    moveIn: nstr('Data di ingresso desiderata AAAA-MM-GG (o AAAA-MM se dice solo il mese)'),
    durationMonths: nint('Durata desiderata in mesi'),
    household: nenum(['solo', 'couple', 'family', 'flatmates'], 'Chi abiterà'),
    occupation: nenum(['employed', 'self-employed', 'student', 'relocating'], 'Situazione di chi scrive'),
    language: nenum(['it', 'en'], 'Lingua in cui scrive la persona'),
    side: nenum(['tenant', 'landlord', 'company'], 'Chi scrive: tenant (cerca casa), landlord (propone il proprio immobile), company (ente/azienda che scrive per altri)'),
    listing: nstr('Immobile / annuncio a cui si riferisce, se lo nomina'),
    channel: nenum(['whatsapp', 'email', 'portal', 'phone', 'other'], 'Canale del messaggio, se riconoscibile'),
  }, 'Il MESSAGGIO di un potenziale cliente (WhatsApp, email, richiesta dal portale, nota vocale trascritta). Tutti i campi "" se il materiale non è un messaggio di un cliente.'),
  evidence: arr(obj({
    path: { type: 'string', description: 'Percorso del campo, es. "contract.rent", "tenant.codiceFiscale", "property.cadastral.foglio", "coTenants[0].name", "lead.phone", "preagreement.feePct"' },
    quote: { type: 'string', description: 'La frase ESATTA del documento da cui hai letto il valore (max 200 caratteri)' },
    file: nint('Indice del DOCUMENTO n (1-based) da cui viene; "" se dal testo incollato.'),
    page: nint('Pagina, se è un PDF'),
  }), 'Una citazione per OGNI campo valorizzato. Un campo senza citazione non può essere valorizzato.'),
  notes: arr({ type: 'string' }, 'Osservazioni per l\'operatore, in italiano: cosa manca, cosa è stato derivato, cosa non torna'),
  confidence: { type: 'integer', description: 'Quanto sei sicuro complessivamente, 0-100' },
  summary: nstr('Una riga in italiano che riassume il materiale, es. "Contratto transitorio Via Cavour 12 — Rossi → Neri, 01/09/2026–31/08/2027, €1.100/mese"'),
}, 'La proposta per il gestionale');

// ─── IL PROMPT DI SISTEMA (stabile: viene messo in cache) ─────────────────
// ─── LO STRUMENTO — il JSON viaggia come chiamata, non come grammatica ───
// NON strict di proposito: uno strumento strict compilerebbe la STESSA
// grammatica di output_config.format e morirebbe allo stesso tetto interno
// (la terza lezione del 21/09, in testa al file). L'input di un tool_use
// arriva già parsato dall'API; lo schema, con le sue descrizioni, guida il
// modello campo per campo.
export const TOOL_NAME = 'proposta';
export const INGEST_TOOL = {
  name: TOOL_NAME,
  description: 'Consegna la proposta per il gestionale BOOM estratta dal materiale ricevuto. SOLO le chiavi che il materiale valorizza: una chiave omessa significa «manca» (mai null, mai "" di riempimento, mai un dato inventato). Numeri come stringhe di sole cifre, date AAAA-MM-GG, una citazione in evidence per ogni valore, un elemento in files per ogni DOCUMENTO n. Una sezione con un solo dato (es. property.cadastral da dati catastali incollati) è una consegna valida. Va chiamato UNA volta sola, con tutto dentro.',
  input_schema: INGEST_SCHEMA,
};

export const SYSTEM = `Sei l'assistente di back-office di BOOM, agenzia immobiliare a Roma. Dal materiale che ricevi (uno o più documenti: PDF, foto, Word/Excel/email/pagine già ridotti a testo, testo incollato) estrai i dati per il gestionale e li consegni chiamando lo strumento \`proposta\`: il suo schema è il tracciato, ogni campo ha la sua descrizione.

REGOLE NON NEGOZIABILI
1. NON INVENTARE MAI. Se un dato non è scritto nel materiale, OMETTI la chiave (o lascia ""): un campo assente è corretto, un campo inventato finisce in un contratto registrato all'Agenzia delle Entrate.
2. OGNI VALORE HA UNA CITAZIONE. Per ogni campo che valorizzi metti in "evidence" la frase esatta da cui l'hai letto (documento e pagina). Se non riesci a citare, non valorizzare.
3. Trascrivi codici fiscali, IBAN, numeri di documento CARATTERE PER CARATTERE, senza "correggerli". Se una lettera è ambigua (0/O, 1/I, 5/S) scegli quella più probabile per il contesto e dillo in notes.
4. Date sempre AAAA-MM-GG ("1° settembre 2026" → 2026-09-01). Importi e misure come numeri puri scritti come stringhe di sole cifre ("1100", non "€ 1.100,00"; "65.5" per i decimali). Il canone è quello MENSILE: se il documento dà l'annuo, dividi per 12 e scrivilo in notes.
5. Non fondere mai due persone in una. Se i conduttori sono più d'uno, il primo nominato è "tenant" e gli altri vanno in "coTenants".
6. I nomi in archivio che ti vengono forniti servono SOLO per usare la stessa grafia: non prenderne mai un dato.
7. Rispondi con UNA sola chiamata allo strumento \`proposta\`, con le SOLE chiavi che valorizzi — OMETTI le chiavi vuote e le sezioni che il materiale non porta (decine di stringhe vuote sono tempo perso) — in italiano; nessun testo fuori dalla chiamata.

COME SI LEGGE UN CONTRATTO DI LOCAZIONE ITALIANO (il materiale è quasi sempre questo)
- "Locatore" / "parte locatrice" / "concedente" = landlord. "Conduttore" / "parte conduttrice" / "locatario" / "inquilino" = tenant. Stanno in cima al documento nell'ordine locatore-poi-conduttore, ma verifica sempre dalle etichette, non dalla posizione.
- Ogni parte è di solito introdotta così: "Sig. Nome Cognome, nato/a a … il …, residente in …, C.F. …, identificato/a mediante carta d'identità/passaporto n. … rilasciato/a da … il …". Tutti questi dati vanno nella persona giusta.
- Il locatore può essere una società ("la società X S.r.l., P.IVA …, con sede in …, in persona del legale rappresentante …"): kind = giuridica, businessName, partitaIva, e il nome è la ragione sociale.
- Il canone è spesso scritto in lettere E in cifre ("euro millecento/00 (€ 1.100,00)"): usa la cifra.
- "canone annuo di € 13.200" → rent 1100 (annuo diviso 12) e nota. "rate mensili anticipate" = installmentMonths "1", "trimestrali" = "3", "semestrali" = "6", "annuale" = "12".
- "deposito cauzionale pari a n. X mensilità" → depositMonths X (e deposit solo se l'importo è scritto). "entro il giorno X di ogni mese" → paymentDay X.
- Tipo: "transitorio" / "esigenze transitorie" / art. 5 c. 1 → transitorio; "studenti universitari" / art. 5 c. 2-3 → studenti; "3+2" / "canone concordato" / art. 2 c. 3 → 3+2; "4+4" / "canone libero" / art. 2 c. 1 → 4+4.
- Per il transitorio la motivazione dell'esigenza ("per motivi di lavoro/studio/salute", "esigenza di transitorietà del conduttore") va in transitionalReason ed esigenzaDi dice di chi è.
- "cedolare secca" con opzione esercitata → cedolareSecca "si"; "regime ordinario", "imposta di registro a carico 50%" o opzione non esercitata → "no"; se il contratto non ne parla → "".
- "oneri accessori" / "spese condominiali" a carico del conduttore → accessoryCharges (mensili); "comprese nel canone" → condoMode incluso, "a consuntivo" → consuntivo.
- Dati catastali ("foglio 12, particella 345, subalterno 6, categoria A/2, rendita € 812,50") → property.cadastral. Classe energetica / APE → energyClass.
- L'indirizzo dell'immobile è quello dopo "sito in" / "posto in" / "ubicato in", con piano, scala, interno; NON la residenza delle parti.
- Persone "autorizzate a convivere" / "il conduttore dichiara che abiteranno con lui…" → cohabitants (nomi).
- Se il nome dell'immobile non è indicato, componilo dall'indirizzo (es. "Via Cavour 12, int. 5").

ALTRI DOCUMENTI CHE PUOI RICEVERE
- Documento d'identità (carta d'identità, passaporto, permesso di soggiorno, patente): dà i dati anagrafici di UNA persona (nome, nascita, CF se stampato, numero, ente e data di rilascio, scadenza, cittadinanza). Se nel materiale c'è anche un contratto, assegnalo alla parte che porta quel nome; altrimenti mettilo come tenant e dillo in notes. Mai un contratto da una carta d'identità.
- Visura catastale: immobile (indirizzo, foglio/particella/sub, categoria, rendita, vani) e intestatario (landlord, con CF).
- DATI NUDI incollati dall'operatore — soli dati catastali (sezione, foglio, particella, subalterno, categoria, classe, consistenza, rendita), un codice fiscale, un IBAN, una classe energetica, anche SENZA indirizzo: sono una lettura VALIDA. Compila la sezione a cui appartengono (property.cadastral, landlord/tenant.codiceFiscale, landlord.iban, property.energyClass) anche se non c'è nient'altro: non serve un indirizzo per riportare un foglio. Per il catasto material = "immobile".
- APE: energyClass e indirizzo. Planimetria: vani/mq se leggibili.
- Email o messaggio WhatsApp: prendi solo ciò che è scritto (un IBAN, un telefono, una data di disponibilità), mai ciò che è sottinteso.
- PROPOSTA / PRE-ACCORDO / RENTAL PROPOSAL (spesso di BOOM stessa: intestazione BOOM, "boomrome.com", riferimento "BOOM-XXXXXX", sezioni "Rental proposal", "due at signing", "agency fee"): è un deal PRIMA del contratto. Compila landlord/tenant/property/contract con ciò che c'è (canone, deposito, decorrenza, durata, cadenza, identità del cliente) E "preagreement" con i termini economici propri della proposta (riferimento, provvigione e quando è dovuta, quota energia, deposito alla firma, dovuto alla firma, validità). material = "proposta".
- MESSAGGIO DI UN CLIENTE (screenshot di WhatsApp, email inoltrata, richiesta dal portale, nota vocale): compila "lead" con nome, recapiti e la richiesta nelle SUE parole; se scrive in inglese language = "en". Chi propone il proprio immobile è side = "landlord". material = "messaggio". Non inventare un contratto da un messaggio.
- "material" dice che cos'è il materiale nel suo insieme: se ci sono un contratto E una carta d'identità, è "contratto"; se è solo la carta, "identita"; una visura o un APE da soli sono "immobile".
- Se in coda c'è il blocco RIGUARDA, l'operatore DICHIARA a quale immobile e a quali persone si riferisce il materiale: sono fatti dichiarati, non deduzioni. Usa quei nomi e quell'indirizzo per property.name / property.address e per i nomi delle parti (citazione in evidence: "dichiarato dall'operatore") e attribuisci a quelle entità ciò che il materiale dice di loro.
- Se lo stesso documento arriva due volte (PDF e testo incollato), è UN documento: non raddoppiare persone né note.
- Un documento illeggibile (scansione storta, buia, mossa, pagina bianca) va dichiarato in files[].legible=false con il motivo: non tirare a indovinare.`;

// Il bersaglio dichiarato dall'operatore («Riguarda» nel portal, 22/09):
// l'immobile e le parti a cui il materiale si riferisce. Al modello vanno
// nome e indirizzo (un id non gli dice niente); l'aggancio VERO lo fa il
// portal per id, deterministico. Solo forma: stringhe clippate, chiavi note.
function declaredLines(target) {
  if (!target || typeof target !== 'object') return [];
  const out = [];
  const one = (label, t, withAddress) => {
    if (!t || typeof t !== 'object') return;
    const name = clip(t.name, 120), address = withAddress ? clip(t.address, 160) : '';
    if (!name && !address) return;
    out.push(`- ${label}: «${[name, address].filter(Boolean).join(' — ')}»`);
  };
  one('Immobile', target.property, true);
  one('Proprietario', target.landlord, false);
  one('Inquilino', target.tenant, false);
  return out;
}
// Quanti valori il modello ha davvero scritto nelle sezioni (files, evidence,
// notes, summary, confidence e material esclusi): distingue «non ha letto
// niente» da «ha letto, ma nessuna sezione è ancorabile». Nei log del 22/09
// `sections=-` non diceva quale dei due fosse.
const SECTION_KEYS = ['landlord', 'tenant', 'coTenants', 'property', 'contract', 'preagreement', 'lead'];
export function filledLeaves(parsed) {
  let n = 0;
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') { Object.values(v).forEach(walk); return; }
    if (typeof v !== 'string' || v.trim() !== '') n++;
  };
  SECTION_KEYS.forEach((k) => walk(parsed && parsed[k]));
  return n;
}

function knownLine(label, list) {
  const items = Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 60).map((x) => x.slice(0, 90)) : [];
  return items.length ? `${label}: ${items.join(' · ')}` : '';
}

// ─── L'INPUT: uno o più file, inline o in transito ────────────────────────
export async function readFiles(body) {
  // Compatibilità: il vecchio client mandava UN file (base64 | fileUrl + mediaType).
  let list = Array.isArray(body.files) ? body.files : [];
  if (!list.length && (body.base64 || body.fileUrl)) {
    list = [{ base64: body.base64, fileUrl: body.fileUrl, mediaType: body.mediaType, name: body.name }];
  }
  if (list.length > MAX_FILES) throw Object.assign(new Error('too_many_files'), { status: 400 });
  const out = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const f = list[i] || {};
    let mediaType = typeof f.mediaType === 'string' ? f.mediaType.split(';')[0].trim().toLowerCase() : '';
    let buf = null;
    if (typeof f.base64 === 'string' && f.base64) {
      const b64 = f.base64.replace(/^data:[^;]+;base64,/, '');
      if (b64.length > MAX_B64) throw Object.assign(new Error('file_too_large'), { status: 413 });
      buf = Buffer.from(b64, 'base64');
    } else if (f.fileUrl) {
      let t;
      try { t = await fetchTransit(f.fileUrl); }
      catch (e) { throw Object.assign(e, { status: e.message === 'file_too_large' ? 413 : 400 }); }
      buf = t.buf;
      mediaType = mediaType || (t.mediaType || '').toLowerCase();
    } else {
      continue;
    }
    if (!buf || !buf.length) continue;
    const shown = clip(f.name || ('documento ' + (out.length + 1)), 60);
    if (buf.length > MAX_FILE_BYTES) {
      throw Object.assign(new Error('file_too_large'), { status: 413,
        detail: `«${shown}» pesa ${mbOf(buf.length)} MB: il lettore accetta fino a ${MAX_FILE_BYTES / 1024 / 1024} MB per file. Esporta il PDF a qualità inferiore, oppure fotografa le pagine che contano.` });
    }
    // Il tipo VERO: prima i byte, poi il nome, poi ciò che il client ha
    // dichiarato (un browser manda "" per .eml e .md, e application/octet-stream
    // per quasi tutto ciò che non conosce).
    mediaType = sniffType(buf, f.name, mediaType);
    if (MEDIA_HEIC.test(mediaType)) {
      // Anthropic non legge HEIC/HEIF e il browser non sempre riesce a
      // convertirlo (Chrome no): all'operatore serve il rimedio, non un 400.
      throw Object.assign(new Error('unsupported_media_type'), { status: 400,
        detail: 'foto in formato HEIC: su iPhone imposta Fotocamera → Formati → "Più compatibile", oppure esporta in JPEG' });
    }
    const texty = TEXTY.has(mediaType);
    if (!texty && !MEDIA_OK.test(mediaType)) {
      throw Object.assign(new Error('unsupported_media_type'), { status: 400,
        detail: `«${shown}» (${mediaType || 'tipo sconosciuto'}) non è un formato che il lettore sa aprire. Vanno bene: ${FORMATS_HUMAN}.` });
    }
    total += buf.length;
    if (total > MAX_TOTAL_BYTES) {
      throw Object.assign(new Error('files_too_large'), { status: 413,
        detail: `i file insieme superano i ${MAX_TOTAL_BYTES / 1024 / 1024} MB: leggili in due giri («Leggi e integra»).` });
    }
    if (texty) {
      // Word, Excel, OpenDocument, .doc, email, HTML, testo: al modello va
      // il TESTO, estratto qui senza dipendenze (api/_doctext.js).
      let ex;
      try { ex = extractText(buf, mediaType); }
      catch (e) {
        throw Object.assign(new Error('unreadable_document'), { status: 422,
          detail: `«${shown}» non si apre come ${TEXTY_LABEL[mediaType] || 'documento'}: il file è danneggiato o protetto. Esportalo di nuovo (anche in PDF) e rileggi.` });
      }
      const full = (ex && ex.text) || '';
      const textClipped = full.length > MAX_TEXT_DOC;
      out.push({
        index: out.length + 1,
        name: String(f.name || ('documento-' + (out.length + 1))).slice(0, 120),
        mediaType, isPdf: false, isText: true, format: (ex && ex.label) || 'testo',
        text: textClipped ? full.slice(0, MAX_TEXT_DOC) : full, chars: full.length, textClipped,
        base64: null, bytes: buf.length, pages: null, clipped: false, readPages: null,
      });
      continue;
    }
    const isPdf = /pdf/i.test(mediaType);
    let pages = null, clipped = false;
    if (isPdf) { const c = await clipPdf(buf); buf = c.buf; pages = c.pages; clipped = c.clipped; }
    out.push({
      index: out.length + 1,
      name: String(f.name || ('documento-' + (out.length + 1))).slice(0, 120),
      mediaType: isPdf ? 'application/pdf' : (mediaType === 'image/jpg' ? 'image/jpeg' : mediaType),
      isText: false, format: isPdf ? 'PDF' : 'immagine',
      base64: buf.toString('base64'), bytes: buf.length, isPdf, pages, clipped,
      readPages: pages == null ? null : Math.min(pages, MAX_PAGES),
    });
  }
  // Il tetto dell'API è per RICHIESTA: due contratti da 60 pagine passano il
  // taglio per file e l'API li rifiuta INSIEME con un 400 — che usciva come
  // «errore (400), riprova», cioè il rimedio sbagliato per un guasto
  // deterministico. Si rifiuta qui, PRIMA di spendere, coi nomi e la via
  // d'uscita: la seconda lettura integra la prima («Leggi e integra»).
  const pagesTotal = out.reduce((s, f) => s + (f.readPages || 0), 0);
  if (pagesTotal > MAX_TOTAL_PAGES) {
    const parts = out.filter((f) => f.readPages).sort((a, b) => b.readPages - a.readPages)
      .map((f) => `«${f.name}» ${f.readPages} pag.`).join(', ');
    throw Object.assign(new Error('too_many_pages'), { status: 400,
      detail: `${pagesTotal} pagine di PDF in un giro (${parts}): il lettore ne accetta ${MAX_TOTAL_PAGES}. Togli il documento più lungo — i dati di un contratto stanno nelle prime pagine — o leggi in due giri: la seconda lettura integra la prima.` });
  }
  return out;
}

// ─── LA CHIAMATA AL MODELLO ──────────────────────────────────────────────
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Un 400 che parla della chiamata forzata dello strumento (la piattaforma
// può non ammetterla insieme al thinking): si scende a tool_choice auto.
const FORCED_RE = /tool_choice|forced tool|tool use[^.]*thinking|thinking[^.]*tool/i;

async function askModel(content) {
  const key = process.env.ANTHROPIC_API_KEY;
  const build = (o) => Object.assign(o.fallback ? { fallbacks: 'default' } : {}, {
    model: MODEL,
    max_tokens: 20000,
    thinking: { type: 'adaptive' },
    // Lo sforzo (22/09): `medium` invece del default `high`. Governa QUANTO
    // il modello pensa (thinking adattivo), non quanto scrive — «changing
    // effort does not reliably shorten responses» (docs effort): la
    // lunghezza la taglia lo schema sparso. Funziona con gli strumenti,
    // senza beta, su claude-opus-5. Costante su ogni richiesta: cambiarlo
    // fra una richiesta e l'altra invalida la cache del prefisso.
    output_config: { effort: EFFORT },
    tools: [INGEST_TOOL],
    tool_choice: o.forced
      ? { type: 'tool', name: TOOL_NAME, disable_parallel_tool_use: true }
      : { type: 'auto', disable_parallel_tool_use: true },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  const call = (o) => fetch('https://api.anthropic.com/v1/messages', {
    signal: aiSignal(AI_MS),   // un modello appeso non deve uccidere la funzione
    method: 'POST',
    headers: Object.assign({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }, o.fallback ? { 'anthropic-beta': FALLBACK_BETA } : {}),
    body: JSON.stringify(build(o)),
  });
  // La scala dei 400 di FORMA — nessuno costa un token, la richiesta viene
  // rifiutata prima che il modello legga: (1) il beta del ripiego
  // server-side (un rifiuto di policy riparte da solo su un altro modello,
  // opt-in) non riconosciuto → si riprova senza, la lettura non dipende da un
  // beta; (2) la chiamata FORZATA dello strumento rifiutata → tool_choice
  // auto: il prompt dice comunque di chiamarlo, e se il modello rispondesse a
  // parole resta la rete di parseModelJson. Qualunque altro 400 esce così
  // com'è: è deterministico e lo dice ingestRead.
  const o = { fallback: true, forced: true };
  for (let i = 0; i < 3; i++) {
    const resp = await call(o);
    if (resp.status !== 400) {
      if (!resp.ok) return { ok: false, status: resp.status, text: await resp.text() };
      return { ok: true, data: await resp.json(), forced: o.forced };
    }
    const t = await resp.text();
    if (o.fallback && /fallback|beta/i.test(t)) { o.fallback = false; continue; }
    if (o.forced && FORCED_RE.test(t)) { o.forced = false; continue; }
    return { ok: false, status: 400, text: t };
  }
  return { ok: false, status: 400, text: 'form retries exhausted' };
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// Gli interi dello schema sono stringhe di cifre ("" = manca); un intero vero
// resta accettato (il worker e i test ne mandano). Tutto il resto è null.
const toInt = (v) => { if (Number.isInteger(v)) return v; const t = String(v == null ? '' : v).trim(); return /^\d{1,7}$/.test(t) ? Number(t) : null; };
// «Structured outputs don't guarantee the capitalization of string enum
// values»: gli enum si confrontano in minuscolo, come fa il motore.
const lowEnum = (v) => String(v == null ? '' : v).trim().toLowerCase();
// Il testo di errore dell'API è JSON {type:'error', error:{message}}: nei log
// e all'operatore va il messaggio, non la busta.
const apiErrorMessage = (text) => { try { const j = JSON.parse(text); return String((j && j.error && j.error.message) || text || ''); } catch (_) { return String(text || ''); } };
// Il 400 con cui l'API dice «troppo materiale» (finestra di contesto o tetto
// pagine): non si ripara riprovando, si ripara togliendo pagine.
const TOO_LONG_RE = /prompt is too long|too many pages|pages?\b[^.]*\b(exceed|limit|maximum)|(exceed|limit|maximum)[^.]*\bpages?\b/i;
const PATH_RE = /^(landlord|tenant|property|contract|preagreement|lead|coTenants\[\d+\])(\.[a-zA-Z]+)+$/;

function sanitizeEvidence(list, nFiles) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const path = clip(e.path, 80), quote = clip(e.quote, 240);
    if (!PATH_RE.test(path) || !quote) continue;
    const fileN = toInt(e.file), pageN = toInt(e.page);
    const file = fileN != null && fileN >= 1 && fileN <= nFiles ? fileN : null;
    const page = pageN != null && pageN >= 1 ? pageN : null;
    out.push({ path, quote, file, page });
    if (out.length >= 120) break;
  }
  return out;
}

function sanitizeFiles(list, files) {
  const byIndex = new Map();
  (Array.isArray(list) ? list : []).forEach((f) => {
    if (!f || typeof f !== 'object') return;
    const idx = toInt(f.index);   // senza grammatica l'indice può arrivare "1"
    if (idx != null) byIndex.set(idx, f);
  });
  return files.map((f) => {
    const m = byIndex.get(f.index) || {};
    const kindRaw = lowEnum(m.kind);
    const kind = KIND_KEYS.indexOf(kindRaw) >= 0 ? kindRaw : 'altro';
    return {
      index: f.index, name: f.name, bytes: f.bytes, mediaType: f.mediaType,
      format: f.format || (f.isPdf ? 'PDF' : 'immagine'), isText: !!f.isText, chars: f.chars != null ? f.chars : null,
      kind, label: CATS[kind].label, docType: CATS[kind].type, category: CATS[kind].category, folder: CATS[kind].folder,
      title: clip(m.title, 120), summary: clip(m.summary, 300),
      legible: !(m.legible === false || lowEnum(m.legible) === 'false' || lowEnum(m.legible) === 'no'),
      party: ['tenant', 'landlord', 'cotenant'].indexOf(lowEnum(m.party)) >= 0 ? lowEnum(m.party) : null,
      pages: f.pages != null ? f.pages : toInt(m.pages),
      clipped: f.clipped, readPages: f.readPages != null ? f.readPages : null,
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });
  }

  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
  const hint = typeof (body.context && body.context.hint) === 'string' ? clip(body.context.hint, 500) : '';
  const hasFileInput = (Array.isArray(body.files) && body.files.length) || body.base64 || body.fileUrl;

  if (!text.trim() && !hasFileInput) {
    return res.status(400).json({ ok: false, error: 'text_or_file_required' });
  }

  let files;
  try { files = await readFiles(body); }
  catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: e.message, detail: e.detail || null });
  }
  if (!files.length && !text.trim()) {
    return res.status(400).json({ ok: false, error: 'text_or_file_required' });
  }

  const known = (body.context && body.context.known) || {};
  const target = (body.context && body.context.target) || null;
  const out = await ingestRead({ files, text, hint, known, target });
  const { status, ...payload } = out;
  return res.status(status).json(payload);
}

// ─── IL CUORE — una copia per tutte le porte ─────────────────────────────
// Il portal (HTTP) e il telefono (lo Scrivano: Telegram → coda → worker,
// api/scrivano/_core.js) leggono con QUESTA funzione: stesso prompt, stesso
// schema, stessa sanificazione, stessi errori col rimedio. Riceve i file già
// preparati da readFiles() e torna { status, ...payload }: l'HTTP lo traduce
// in res.status().json(), il worker in una card. Non tocca mai Firestore.
export async function ingestRead({ files = [], text = '', hint = '', known = {}, target = null, tag = 'portal/ingest' } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 500, ok: false, error: 'server_missing_anthropic_key', detail: 'La lettura non è configurata sul server (manca la chiave del modello).' };
  }
  text = typeof text === 'string' ? text.slice(0, MAX_TEXT) : '';
  hint = typeof hint === 'string' ? clip(hint, 500) : '';
  const declared = declaredLines(target);
  if (!files.length && !text.trim()) return { status: 400, ok: false, error: 'text_or_file_required', detail: null };

  // ── Il materiale, documento per documento, ETICHETTATO ──────────────
  const content = [];
  files.forEach((f) => {
    if (f.isText) {
      content.push({ type: 'text', text: `DOCUMENTO ${f.index} — «${f.name}» (${f.format}${f.chars ? ', ' + f.chars + ' caratteri' + (f.textClipped ? ', letti i primi ' + MAX_TEXT_DOC : '') : ', vuoto'}):\n\n${f.text || '(nessun testo leggibile nel file: potrebbe contenere solo immagini)'}` });
      return;
    }
    content.push({ type: 'text', text: `DOCUMENTO ${f.index} — «${f.name}» (${f.isPdf ? 'PDF' + (f.pages ? ', ' + f.pages + ' pagine' + (f.clipped ? ', lette le prime ' + MAX_PAGES : '') : '') : 'immagine'}):` });
    content.push(f.isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.base64 } });
  });
  if (text.trim()) {
    content.push({ type: 'text', text: `TESTO INCOLLATO DALL'OPERATORE (DOCUMENTO ${files.length + 1}):\n\n${text}` });
  }
  // I nomi già in archivio: servono a NON creare doppioni. L'AI non decide
  // l'aggancio (lo fa findMatch lato client, deterministico) ma sapere che
  // "Egidi" esiste già la aiuta a scrivere il nome nella stessa forma.
  const tail = [
    knownLine('Proprietari già in archivio (stessa grafia se è la stessa persona)', known.landlords),
    knownLine('Inquilini già in archivio', known.tenants),
    knownLine('Immobili già in archivio', known.properties),
    declared.length ? 'RIGUARDA (dichiarato dall\'operatore — fatti, non deduzioni: usa questi nomi e questo indirizzo e attribuisci a queste entità ciò che il materiale dice di loro):\n' + declared.join('\n') : '',
    hint ? `Indicazione dell'operatore (ha precedenza sulle deduzioni, ma non inventare ciò che non nomina): "${hint}"` : '',
    `Produci ora la proposta. Hai ricevuto ${files.length} documento/i${text.trim() ? ' più il testo incollato' : ''}.`,
  ].filter(Boolean).join('\n');
  content.push({ type: 'text', text: tail });

  const t0 = Date.now();
  let out;
  try {
    out = await askModel(content);
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('[' + tag + '] ai ' + (timedOut ? 'timeout' : 'failed') + ' files=' + files.length + ' ms=' + (Date.now() - t0));
    await recordUsage({ purpose: 'portal.ingest', backend: 'cloud', ok: false, ms: Date.now() - t0, model: MODEL });
    return { status: timedOut ? 504 : 502, ok: false, error: timedOut ? 'ai_timeout' : 'ai_provider_error',
      detail: timedOut
        ? 'La lettura ha superato i 100 secondi. Allega meno pagine (le prime due di un contratto bastano quasi sempre) o un documento per volta.'
        : 'Il servizio di lettura non ha risposto. Riprova tra qualche istante.' };
  }
  if (!out.ok) {
    console.error('[' + tag + '] anthropic', out.status, clip(apiErrorMessage(out.text), 600));
    await recordUsage({ purpose: 'portal.ingest', backend: 'cloud', ok: false, ms: Date.now() - t0, model: MODEL });
    const rate = out.status === 429;
    const tooLong = out.status === 400 && TOO_LONG_RE.test(out.text || '');
    if (tooLong) {
      const pagesSent = files.reduce((s, f) => s + (f.readPages || 0), 0);
      return { status: 413, ok: false, error: 'ai_too_long',
        detail: `Troppo materiale in un giro (${pagesSent} pagine di PDF${files.length > 1 ? ', ' + files.length + ' documenti' : ''}): i dati di un contratto stanno nelle prime pagine. Allega meno pagine o meno documenti, oppure leggi in due giri: la seconda lettura integra la prima.` };
    }
    if (out.status === 400) {
      // Un 400 che non è «troppo materiale» è DETERMINISTICO: riprovare non
      // cambia nulla. O il documento non si apre (PDF cifrato o rotto), o è la
      // NOSTRA richiesta a essere rifiutata (schema, parametri) — e allora il
      // rimedio non è dell'operatore ma di chi mantiene il server, e va detto
      // così. Il 21/09/2026 lo schema con 99 unioni usciva come «errore (400),
      // riprova; incolla il testo» e l'operatore incolpava il pre-agreement.
      const msg = apiErrorMessage(out.text);
      if (/\bpdf\b|document|image|could not (process|parse|decode|read)|base64|media_type/i.test(msg)) {
        return { status: 422, ok: false, error: 'ai_bad_document',
          detail: 'Il servizio di lettura non riesce ad aprire il documento (' + clip(msg, 160) + '). Esporta di nuovo il PDF senza password, o fotografa le pagine.' };
      }
      return { status: 500, ok: false, error: 'ai_bad_request',
        detail: 'Il servizio di lettura ha rifiutato la RICHIESTA del server, non il documento: ' + clip(msg, 220) + '. Non dipende dal file caricato: va corretta la richiesta sul server, segnalalo.' };
    }
    return { status: 502, ok: false, error: rate ? 'ai_rate_limited' : 'ai_provider_error',
      detail: rate ? 'Troppe letture in questo momento: riprova tra un minuto.' : 'Il servizio di lettura ha risposto con un errore (' + out.status + '). Riprova; se ricapita, incolla il testo invece del file.' };
  }
  const data = out.data;
  const ms = Date.now() - t0;
  // Il conto della centrale (aiUsage/<giorno>, costo dal listino): atteso,
  // perché una scrittura lanciata senza await muore col congelamento della
  // funzione (la lezione del 13/09); non lancia mai, un contatore fallito
  // non tocca la lettura ottenuta.
  await recordUsage({ purpose: 'portal.ingest', backend: 'cloud', ok: true, ms, model: data.model || MODEL, usage: data.usage || null });
  if (data.stop_reason === 'refusal') {
    console.error('[' + tag + '] refusal files=' + files.length);
    return { status: 502, ok: false, error: 'ai_refused', detail: 'Il modello ha rifiutato di leggere questo materiale. Se contiene solo un documento d\'identità o un contratto, riprova con una foto più nitida o incolla il testo.' };
  }
  const blocks = Array.isArray(data.content) ? data.content : [];
  const raw = blocks.filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  if (data.stop_reason === 'max_tokens') {
    console.error('[' + tag + '] ' + jsonFailureLine(raw, 'truncated', data.stop_reason));
    return { status: 502, ok: false, error: 'ai_truncated', detail: 'La risposta è stata tagliata: allega meno documenti per volta.' };
  }
  // La via maestra: l'input dello strumento, che l'API consegna già come
  // oggetto (valido per costruzione, senza grammatica). La rete: se il
  // modello ha risposto a parole (tool_choice auto, o un testo attorno), il
  // JSON si legge dal testo — e nei log va la forma, mai il contenuto: qui
  // dentro ci sono codici fiscali e IBAN di persone reali.
  const tool = blocks.find((c) => c.type === 'tool_use' && c.name === TOOL_NAME) || blocks.find((c) => c.type === 'tool_use');
  let parsed, via;
  if (tool && tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input)) {
    parsed = tool.input; via = 'tool';
  } else {
    const read = parseModelJson(raw);
    if (!read.ok) {
      console.error('[' + tag + '] ' + jsonFailureLine(raw, read.why, data.stop_reason) + ' via=text');
      return { status: 502, ok: false, error: 'ai_bad_json', why: read.why, detail: jsonFailureHint(read.why) };
    }
    parsed = read.value || {}; via = 'text';
  }

  try {
    // Whitelist e forma: SOLO le sezioni che il materiale porta (una carta
    // d'identità non fa nascere una card «Contratto» vuota), normalizzate nello
    // schema che il portale salva, con le derivazioni dichiarate e i controlli
    // (CF con checksum, CF che conferma data e nome, IBAN, date, durate).
    const filled = filledLeaves(parsed);
    const pruned = D.pruneProposal(parsed);
    const proposal = D.deriveProposal(D.normalizeProposal(pruned), { parseCadastral: FIELDS.parseCadastral });
    const derived = proposal.derived || {};
    delete proposal.derived;
    const checks = D.validateProposal(proposal);
    const filesRead = sanitizeFiles(parsed.files, files);
    const evidence = sanitizeEvidence(parsed.evidence, files.length + (text.trim() ? 1 : 0));
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n) => typeof n === 'string' && n.trim()).slice(0, 14).map((n) => clip(n, 300)) : [];
    files.forEach((f) => {
      if (f.clipped) notes.unshift(`«${f.name}»: ${f.pages} pagine, lette le prime ${MAX_PAGES}.`);
      if (f.textClipped) notes.unshift(`«${f.name}»: ${f.chars} caratteri, letti i primi ${MAX_TEXT_DOC}.`);
    });
    const confidence = Number.isFinite(Number(parsed.confidence))
      ? Math.max(0, Math.min(100, Math.round(Number(parsed.confidence)))) : null;
    const usage = data.usage || {};
    const meta = {
      model: data.model || MODEL, ms,
      inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0, cacheWriteTokens: usage.cache_creation_input_tokens || 0,
      files: files.length, pages: files.reduce((a, f) => a + (f.pages || 0), 0),
    };
    console.log(`[${tag}] ok via=${via}${out.forced === false ? '(auto)' : ''} files=${meta.files} pages=${meta.pages} in=${meta.inputTokens} out=${meta.outputTokens} ms=${ms} filled=${filled} sections=${Object.keys(proposal).join(',') || '-'}`);

    // `material` da solo non è una proposta: dice che cos'è il materiale,
    // non porta niente da scrivere (prima passava per «Proposta pronta» a
    // card zero).
    if (!Object.keys(proposal).some((k) => k !== 'material')) {
      return { status: 200, ok: true, proposal: {}, empty: true, files: filesRead, evidence, notes, confidence,
        summary: clip(parsed.summary, 400), usage: meta, stats: { filled },
        message: filesRead.some((f) => !f.legible)
          ? 'Documento illeggibile: ' + filesRead.filter((f) => !f.legible).map((f) => f.summary || f.name).join(' · ')
          : (filled === 0
            ? 'Il modello non ha riconosciuto nessun dato per il gestionale in questo materiale.' + (declared.length ? '' : ' Se sono dati di un immobile o di una persona già in archivio, indicalo in «Riguarda» e rileggi.')
            : `Letti ${filled} valori, ma nessuno identifica un immobile, una persona, un contratto, una proposta o un lead.`) };
    }
    return { status: 200, ok: true, proposal, derived, checks, files: filesRead, evidence, notes, confidence,
      summary: clip(parsed.summary, 400), usage: meta, stats: { filled } };
  } catch (e) {
    console.error('[' + tag + '] post', e && e.message);
    return { status: 500, ok: false, error: 'internal' };
  }
}

// I nomi già in archivio, letti dal Firestore — la STESSA forma che manda il
// portal da S (users per ruolo + landlords, immobili «nome — indirizzo»):
// il telefono non deve leggere con meno contesto del desktop.
export async function knownFromStore() {
  const safe = (pr) => pr.catch(() => []);
  const [users, landlords, properties] = await Promise.all([
    safe(fsList('users', { limit: 400 })), safe(fsList('landlords', { limit: 200 })), safe(fsList('properties', { limit: 200 })),
  ]);
  const name = (x) => String((x && x.name) || '').trim();
  return {
    landlords: users.filter((u) => u.role === 'landlord' || u.role === 'owner').map(name).concat(landlords.map(name)).filter(Boolean).slice(0, 60),
    tenants: users.filter((u) => u.role === 'tenant').map(name).filter(Boolean).slice(0, 60),
    properties: properties.map((pr) => [pr.name, pr.address].filter(Boolean).join(' — ')).filter(Boolean).slice(0, 60),
  };
}
