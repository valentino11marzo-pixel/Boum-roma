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
//  1. OUTPUT STRUTTURATO (output_config.format, json_schema): la risposta è
//     JSON valido PER COSTRUZIONE, aderente allo schema. `_modeljson.js`
//     resta come rete, non come via.
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
import { parseModelJson, jsonFailureLine, jsonFailureHint } from '../_modeljson.js';
import { aiSignal } from '../_budget.js';
import { CATS } from '../documents/_smista.js';
import D from '../../js/dataops-engine.js';
import FIELDS from '../../js/contract-fields.js';

export const MODEL = 'claude-opus-5';
export const MAX_FILES = 8;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;     // per file (stesso tetto del client)
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;   // Anthropic: 32 MB a richiesta, base64 +33%
export const MAX_PAGES = 60;                       // oltre, si leggono le prime 60 e lo si dice
export const MAX_TOTAL_PAGES = 100;                // Anthropic: 100 pagine PDF per RICHIESTA — non per file
const MAX_TEXT = 60000;                            // ~15k token di testo incollato
const MAX_B64 = 8 * 1024 * 1024;
const AI_MS = 100000;                              // sotto il maxDuration 120 di vercel.json

// LA LEZIONE DEL 28 AGOSTO 2026: il body di una function Vercel ha un tetto
// di PIATTAFORMA di 4,5 MB — il 413 lo emette l'edge PRIMA che questo file
// parta, quindi il sizeLimit qui sotto non lo alza. La via per i file grandi
// è fileUrl: il client li carica sul NOSTRO Storage (transito, cancellato a
// lettura finita) e qui si scaricano server-side, dove il tetto non esiste.
export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

const MEDIA_OK = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;
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

// ─── LO SCHEMA (json_schema per l'output strutturato) ────────────────────
// Regole della piattaforma: ogni oggetto con additionalProperties:false e
// TUTTE le chiavi in required; il "manca" si esprime con null. Le
// descrizioni sono parte del prompt: dicono al modello cosa va in ogni campo.
const nul = (t, description) => ({ anyOf: [{ type: t }, { type: 'null' }], description });
const nstr = (d) => nul('string', d);
const nnum = (d) => nul('number', d);
const nint = (d) => nul('integer', d);
const nbool = (d) => nul('boolean', d);
const nenum = (values, d) => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }], description: d });
const obj = (props, d) => ({ type: 'object', description: d, properties: props, required: Object.keys(props), additionalProperties: false });
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
  landlord: obj(personProps({
    kind: nenum(['fisica', 'giuridica'], 'Persona fisica o società/ente'),
    businessName: nstr('Ragione sociale se il locatore è una società'),
    partitaIva: nstr('Partita IVA (11 cifre) se società'),
    iban: nstr('IBAN su cui va pagato il canone, senza spazi'),
  }), 'Il LOCATORE / parte locatrice / concedente (chi dà in affitto). Tutto null se il materiale non lo nomina.'),
  tenant: obj(personProps({
    permessoNumero: nstr('Numero del permesso di soggiorno o del visto (solo extra-UE)'),
    permessoScadenza: nstr('Scadenza del permesso AAAA-MM-GG'),
  }), 'Il CONDUTTORE principale / parte conduttrice / locatario / inquilino (il primo nominato). Tutto null se assente.'),
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
    furnished: nbool('Ammobiliato: true / false / null se non detto'),
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
  }, 'L\'IMMOBILE locato. Tutto null se il materiale non lo descrive.'),
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
    cedolareSecca: nbool('true se il locatore opta per la cedolare secca, false se si applica il regime ordinario (registro + bollo), null se il documento non lo dice'),
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
  }, 'Il CONTRATTO. Tutto null se il materiale non è un contratto (una carta d\'identità non ha canone).'),
  evidence: arr(obj({
    path: { type: 'string', description: 'Percorso del campo, es. "contract.rent", "tenant.codiceFiscale", "property.cadastral.foglio", "coTenants[0].name"' },
    quote: { type: 'string', description: 'La frase ESATTA del documento da cui hai letto il valore (max 200 caratteri)' },
    file: nint('Indice del DOCUMENTO n (1-based) da cui viene, null se dal testo incollato'),
    page: nint('Pagina, se è un PDF'),
  }), 'Una citazione per OGNI campo valorizzato. Un campo senza citazione non può essere valorizzato.'),
  notes: arr({ type: 'string' }, 'Osservazioni per l\'operatore, in italiano: cosa manca, cosa è stato derivato, cosa non torna'),
  confidence: { type: 'integer', description: 'Quanto sei sicuro complessivamente, 0-100' },
  summary: nstr('Una riga in italiano che riassume il materiale, es. "Contratto transitorio Via Cavour 12 — Rossi → Neri, 01/09/2026–31/08/2027, €1.100/mese"'),
}, 'La proposta per il gestionale');

// ─── IL PROMPT DI SISTEMA (stabile: viene messo in cache) ─────────────────
export const SYSTEM = `Sei l'assistente di back-office di BOOM, agenzia immobiliare a Roma. Dal materiale che ricevi (uno o più documenti: PDF, foto, testo incollato) estrai i dati per il gestionale, nello schema richiesto.

REGOLE NON NEGOZIABILI
1. NON INVENTARE MAI. Se un dato non è scritto nel materiale, lascia null. Un campo vuoto è corretto; un campo inventato finisce in un contratto registrato all'Agenzia delle Entrate.
2. OGNI VALORE HA UNA CITAZIONE. Per ogni campo che valorizzi metti in "evidence" la frase esatta da cui l'hai letto (documento e pagina). Se non riesci a citare, non valorizzare.
3. Trascrivi codici fiscali, IBAN, numeri di documento CARATTERE PER CARATTERE, senza "correggerli". Se una lettera è ambigua (0/O, 1/I, 5/S) scegli quella più probabile per il contesto e dillo in notes.
4. Date sempre AAAA-MM-GG ("1° settembre 2026" → 2026-09-01). Importi come numeri puri in euro (1100, non "€ 1.100,00"). Il canone è quello MENSILE: se il documento dà l'annuo, dividi per 12 e scrivilo in notes.
5. Non fondere mai due persone in una. Se i conduttori sono più d'uno, il primo nominato è "tenant" e gli altri vanno in "coTenants".
6. I nomi in archivio che ti vengono forniti servono SOLO per usare la stessa grafia: non prenderne mai un dato.
7. Rispondi nello schema JSON richiesto, in italiano, senza testo attorno.

COME SI LEGGE UN CONTRATTO DI LOCAZIONE ITALIANO (il materiale è quasi sempre questo)
- "Locatore" / "parte locatrice" / "concedente" = landlord. "Conduttore" / "parte conduttrice" / "locatario" / "inquilino" = tenant. Stanno in cima al documento nell'ordine locatore-poi-conduttore, ma verifica sempre dalle etichette, non dalla posizione.
- Ogni parte è di solito introdotta così: "Sig. Nome Cognome, nato/a a … il …, residente in …, C.F. …, identificato/a mediante carta d'identità/passaporto n. … rilasciato/a da … il …". Tutti questi dati vanno nella persona giusta.
- Il locatore può essere una società ("la società X S.r.l., P.IVA …, con sede in …, in persona del legale rappresentante …"): kind = giuridica, businessName, partitaIva, e il nome è la ragione sociale.
- Il canone è spesso scritto in lettere E in cifre ("euro millecento/00 (€ 1.100,00)"): usa la cifra.
- "canone annuo di € 13.200" → rent 1100 (annuo diviso 12) e nota. "rate mensili anticipate" = installmentMonths "1", "trimestrali" = "3", "semestrali" = "6", "annuale" = "12".
- "deposito cauzionale pari a n. X mensilità" → depositMonths X (e deposit solo se l'importo è scritto). "entro il giorno X di ogni mese" → paymentDay X.
- Tipo: "transitorio" / "esigenze transitorie" / art. 5 c. 1 → transitorio; "studenti universitari" / art. 5 c. 2-3 → studenti; "3+2" / "canone concordato" / art. 2 c. 3 → 3+2; "4+4" / "canone libero" / art. 2 c. 1 → 4+4.
- Per il transitorio la motivazione dell'esigenza ("per motivi di lavoro/studio/salute", "esigenza di transitorietà del conduttore") va in transitionalReason ed esigenzaDi dice di chi è.
- "cedolare secca" con opzione esercitata → cedolareSecca true; "regime ordinario", "imposta di registro a carico 50%" o opzione non esercitata → false; se il contratto non ne parla → null.
- "oneri accessori" / "spese condominiali" a carico del conduttore → accessoryCharges (mensili); "comprese nel canone" → condoMode incluso, "a consuntivo" → consuntivo.
- Dati catastali ("foglio 12, particella 345, subalterno 6, categoria A/2, rendita € 812,50") → property.cadastral. Classe energetica / APE → energyClass.
- L'indirizzo dell'immobile è quello dopo "sito in" / "posto in" / "ubicato in", con piano, scala, interno; NON la residenza delle parti.
- Persone "autorizzate a convivere" / "il conduttore dichiara che abiteranno con lui…" → cohabitants (nomi).
- Se il nome dell'immobile non è indicato, componilo dall'indirizzo (es. "Via Cavour 12, int. 5").

ALTRI DOCUMENTI CHE PUOI RICEVERE
- Documento d'identità (carta d'identità, passaporto, permesso di soggiorno, patente): dà i dati anagrafici di UNA persona (nome, nascita, CF se stampato, numero, ente e data di rilascio, scadenza, cittadinanza). Se nel materiale c'è anche un contratto, assegnalo alla parte che porta quel nome; altrimenti mettilo come tenant e dillo in notes. Mai un contratto da una carta d'identità.
- Visura catastale: immobile (indirizzo, foglio/particella/sub, categoria, rendita, vani) e intestatario (landlord, con CF).
- APE: energyClass e indirizzo. Planimetria: vani/mq se leggibili.
- Email o messaggio WhatsApp: prendi solo ciò che è scritto (un IBAN, un telefono, una data di disponibilità), mai ciò che è sottinteso.
- Se lo stesso documento arriva due volte (PDF e testo incollato), è UN documento: non raddoppiare persone né note.
- Un documento illeggibile (scansione storta, buia, mossa, pagina bianca) va dichiarato in files[].legible=false con il motivo: non tirare a indovinare.`;

function knownLine(label, list) {
  const items = Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 60).map((x) => x.slice(0, 90)) : [];
  return items.length ? `${label}: ${items.join(' · ')}` : '';
}

// ─── L'INPUT: uno o più file, inline o in transito ────────────────────────
async function readFiles(body) {
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
    if (buf.length > MAX_FILE_BYTES) throw Object.assign(new Error('file_too_large'), { status: 413 });
    if (MEDIA_HEIC.test(mediaType)) {
      // Anthropic non legge HEIC/HEIF e il browser non sempre riesce a
      // convertirlo (Chrome no): all'operatore serve il rimedio, non un 400.
      throw Object.assign(new Error('unsupported_media_type'), { status: 400,
        detail: 'foto in formato HEIC: su iPhone imposta Fotocamera → Formati → "Più compatibile", oppure esporta in JPEG' });
    }
    if (!MEDIA_OK.test(mediaType)) throw Object.assign(new Error('unsupported_media_type'), { status: 400 });
    total += buf.length;
    if (total > MAX_TOTAL_BYTES) throw Object.assign(new Error('files_too_large'), { status: 413 });
    const isPdf = /pdf/i.test(mediaType);
    let pages = null, clipped = false;
    if (isPdf) { const c = await clipPdf(buf); buf = c.buf; pages = c.pages; clipped = c.clipped; }
    out.push({
      index: out.length + 1,
      name: String(f.name || ('documento-' + (out.length + 1))).slice(0, 120),
      mediaType: isPdf ? 'application/pdf' : (mediaType === 'image/jpg' ? 'image/jpeg' : mediaType),
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

async function askModel(content) {
  const key = process.env.ANTHROPIC_API_KEY;
  const base = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: INGEST_SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  };
  const call = (withFallback) => fetch('https://api.anthropic.com/v1/messages', {
    signal: aiSignal(AI_MS),   // un modello appeso non deve uccidere la funzione
    method: 'POST',
    headers: Object.assign({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }, withFallback ? { 'anthropic-beta': FALLBACK_BETA } : {}),
    body: JSON.stringify(withFallback ? Object.assign({ fallbacks: 'default' }, base) : base),
  });
  // Il ripiego server-side (un rifiuto di policy riparte da solo su un altro
  // modello) è opt-in; se la piattaforma dovesse non riconoscerlo, si
  // riprova UNA volta senza — la lettura non deve dipendere da un beta.
  let resp = await call(true);
  if (resp.status === 400) {
    const t = await resp.text();
    if (/fallback|beta/i.test(t)) resp = await call(false);
    else return { ok: false, status: 400, text: t };
  }
  if (!resp.ok) return { ok: false, status: resp.status, text: await resp.text() };
  return { ok: true, data: await resp.json() };
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// Il 400 con cui l'API dice «troppo materiale» (finestra di contesto o tetto
// pagine): non si ripara riprovando, si ripara togliendo pagine.
const TOO_LONG_RE = /prompt is too long|too many pages|pages?\b[^.]*\b(exceed|limit|maximum)|(exceed|limit|maximum)[^.]*\bpages?\b/i;
const PATH_RE = /^(landlord|tenant|property|contract|coTenants\[\d+\])(\.[a-zA-Z]+)+$/;

function sanitizeEvidence(list, nFiles) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const path = clip(e.path, 80), quote = clip(e.quote, 240);
    if (!PATH_RE.test(path) || !quote) continue;
    const file = Number.isInteger(e.file) && e.file >= 1 && e.file <= nFiles ? e.file : null;
    const page = Number.isInteger(e.page) && e.page >= 1 ? e.page : null;
    out.push({ path, quote, file, page });
    if (out.length >= 120) break;
  }
  return out;
}

function sanitizeFiles(list, files) {
  const byIndex = new Map();
  (Array.isArray(list) ? list : []).forEach((f) => {
    if (!f || typeof f !== 'object' || !Number.isInteger(f.index)) return;
    byIndex.set(f.index, f);
  });
  return files.map((f) => {
    const m = byIndex.get(f.index) || {};
    const kind = KIND_KEYS.indexOf(m.kind) >= 0 ? m.kind : 'altro';
    return {
      index: f.index, name: f.name, bytes: f.bytes, mediaType: f.mediaType,
      kind, label: CATS[kind].label, docType: CATS[kind].type, category: CATS[kind].category, folder: CATS[kind].folder,
      title: clip(m.title, 120), summary: clip(m.summary, 300),
      legible: m.legible !== false,
      party: ['tenant', 'landlord', 'cotenant'].indexOf(m.party) >= 0 ? m.party : null,
      pages: f.pages != null ? f.pages : (Number.isInteger(m.pages) ? m.pages : null),
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

  // ── Il materiale, documento per documento, ETICHETTATO ──────────────
  const content = [];
  files.forEach((f) => {
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
  const known = (body.context && body.context.known) || {};
  const tail = [
    knownLine('Proprietari già in archivio (stessa grafia se è la stessa persona)', known.landlords),
    knownLine('Inquilini già in archivio', known.tenants),
    knownLine('Immobili già in archivio', known.properties),
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
    console.error('[portal/ingest] ai ' + (timedOut ? 'timeout' : 'failed') + ' files=' + files.length + ' ms=' + (Date.now() - t0));
    return res.status(timedOut ? 504 : 502).json({ ok: false, error: timedOut ? 'ai_timeout' : 'ai_provider_error',
      detail: timedOut
        ? 'La lettura ha superato i 100 secondi. Allega meno pagine (le prime due di un contratto bastano quasi sempre) o un documento per volta.'
        : 'Il servizio di lettura non ha risposto. Riprova tra qualche istante.' });
  }
  if (!out.ok) {
    console.error('[portal/ingest] anthropic', out.status, clip(out.text, 200));
    const rate = out.status === 429;
    const tooLong = out.status === 400 && TOO_LONG_RE.test(out.text || '');
    if (tooLong) {
      const pagesSent = files.reduce((s, f) => s + (f.readPages || 0), 0);
      return res.status(413).json({ ok: false, error: 'ai_too_long',
        detail: `Troppo materiale in un giro (${pagesSent} pagine di PDF${files.length > 1 ? ', ' + files.length + ' documenti' : ''}): i dati di un contratto stanno nelle prime pagine. Allega meno pagine o meno documenti, oppure leggi in due giri: la seconda lettura integra la prima.` });
    }
    return res.status(502).json({ ok: false, error: rate ? 'ai_rate_limited' : 'ai_provider_error',
      detail: rate ? 'Troppe letture in questo momento: riprova tra un minuto.' : 'Il servizio di lettura ha risposto con un errore (' + out.status + '). Riprova; se ricapita, incolla il testo invece del file.' });
  }
  const data = out.data;
  const ms = Date.now() - t0;
  if (data.stop_reason === 'refusal') {
    console.error('[portal/ingest] refusal files=' + files.length);
    return res.status(502).json({ ok: false, error: 'ai_refused', detail: 'Il modello ha rifiutato di leggere questo materiale. Se contiene solo un documento d\'identità o un contratto, riprova con una foto più nitida o incolla il testo.' });
  }
  const raw = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  if (data.stop_reason === 'max_tokens') {
    console.error('[portal/ingest] ' + jsonFailureLine(raw, 'truncated', data.stop_reason));
    return res.status(502).json({ ok: false, error: 'ai_truncated', detail: 'La risposta è stata tagliata: allega meno documenti per volta.' });
  }
  // Con l'output strutturato il JSON è valido per costruzione; la lettura
  // difensiva resta come rete (e nei log va la forma, mai il contenuto: qui
  // dentro ci sono codici fiscali e IBAN di persone reali).
  const read = parseModelJson(raw);
  if (!read.ok) {
    console.error('[portal/ingest] ' + jsonFailureLine(raw, read.why, data.stop_reason));
    return res.status(502).json({ ok: false, error: 'ai_bad_json', why: read.why, detail: jsonFailureHint(read.why) });
  }
  const parsed = read.value || {};

  try {
    // Whitelist e forma: SOLO le sezioni che il materiale porta (una carta
    // d'identità non fa nascere una card «Contratto» vuota), normalizzate nello
    // schema che il portale salva, con le derivazioni dichiarate e i controlli
    // (CF con checksum, CF che conferma data e nome, IBAN, date, durate).
    const pruned = D.pruneProposal(parsed);
    const proposal = D.deriveProposal(D.normalizeProposal(pruned), { parseCadastral: FIELDS.parseCadastral });
    const derived = proposal.derived || {};
    delete proposal.derived;
    const checks = D.validateProposal(proposal);
    const filesRead = sanitizeFiles(parsed.files, files);
    const evidence = sanitizeEvidence(parsed.evidence, files.length + (text.trim() ? 1 : 0));
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n) => typeof n === 'string' && n.trim()).slice(0, 14).map((n) => clip(n, 300)) : [];
    files.forEach((f) => { if (f.clipped) notes.unshift(`«${f.name}»: ${f.pages} pagine, lette le prime ${MAX_PAGES}.`); });
    const confidence = Number.isFinite(Number(parsed.confidence))
      ? Math.max(0, Math.min(100, Math.round(Number(parsed.confidence)))) : null;
    const usage = data.usage || {};
    const meta = {
      model: data.model || MODEL, ms,
      inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0, cacheWriteTokens: usage.cache_creation_input_tokens || 0,
      files: files.length, pages: files.reduce((a, f) => a + (f.pages || 0), 0),
    };
    console.log(`[portal/ingest] ok files=${meta.files} pages=${meta.pages} in=${meta.inputTokens} out=${meta.outputTokens} ms=${ms} sections=${Object.keys(proposal).join(',') || '-'}`);

    if (!Object.keys(proposal).length) {
      return res.status(200).json({ ok: true, proposal: {}, empty: true, files: filesRead, evidence, notes, confidence,
        summary: clip(parsed.summary, 400), usage: meta,
        message: filesRead.some((f) => !f.legible)
          ? 'Documento illeggibile: ' + filesRead.filter((f) => !f.legible).map((f) => f.summary || f.name).join(' · ')
          : 'Nessun dato riconoscibile nel materiale fornito.' });
    }
    return res.status(200).json({ ok: true, proposal, derived, checks, files: filesRead, evidence, notes, confidence,
      summary: clip(parsed.summary, 400), usage: meta });
  } catch (e) {
    console.error('[portal/ingest] post', e && e.message);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
