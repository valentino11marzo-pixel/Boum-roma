// api/wizard/describe.js
// AI listing-copy endpoint for the Telegram listing wizard bot.
//
// The bot can't call Claude directly (the ANTHROPIC_API_KEY lives only on
// Vercel, never on the Mac mini). This endpoint takes the structured listing
// the wizard has collected and returns a polished EN + IT description.
// Authed with the same shared secret as /api/wizard/publish.
//
// Method: POST
// Headers: X-Wizard-Secret (or X-Homie-Secret)
// Body:   { type, zone, address, sqm, floor, beds, bedrooms, bathrooms,
//           furnished, features[], concordato }
//         (price e availableDate si accettano ma NON arrivano al modello, e
//         dell'indirizzo arriva la via senza il civico: vedi la lezione del
//         15 ottobre qui sotto)
// Response 200: { ok:true, en:"...", it:"...", aiHash:"…", issues:[] }
//         aiHash = l'impronta del testo (textHash): chi pubblica la copia la
//         conserva in descriptionAiHash, così una correzione a mano si
//         riconosce dopo.
//         Il testo passa da copyIssues come quello dello sweep: se dice un
//         prezzo, una data, un civico, una durata, un arredo inventato o le
//         camere sbagliate, la risposta è { ok:true, en:"", it:"",
//         aiHash:null, issues:[…] } — il bot, con en vuoto, ripiega sul suo
//         modello (o lascia la scheda vuota), e lo sweep notturno la riscrive
//         passando dal controllo. Il bot pubblica senza che nessuno legga:
//         un testo sbagliato non deve arrivargli.
//         Un JSON del modello senza "en" stringa (o troncato) torna come
//         en:"" — mai il JSON grezzo, che il bot pubblicherebbe come
//         descrizione; il testo grezzo torna solo se il modello ha risposto
//         in prosa, senza nessun oggetto JSON.
//
// SWEEP — GET ?mode=sweep[&limit=N], auth like the other wizard crons (Vercel
// cron Bearer CRON_SECRET, X-Homie-Secret, or an admin Firebase ID token).
// A listing page with no text is invisible to search AND uncitable by AI
// answer engines, which reward specific facts and skip generic filler. On
// 2026-07-28 the live catalog had 10 listings with an EMPTY description and 10
// carrying the bot's fallback template — including raw database keys
// ("washing_machine", "double_glazing") served to crawlers verbatim through
// /llms-listings.txt. This closes both, nightly, without anyone typing.
//
// What it will NOT do: rewrite a human's words. Length is the wrong test —
// the real catalog's human descriptions run 67-203 chars while the template
// reaches 203, so a "too short" rule would delete "perfect for Luiss students"
// and keep "Features include ac, balcony". Only EMPTY text and the template's
// own signature qualify, and whatever is overwritten is kept: the text just
// replaced in descriptionPrevious, the first one ever in descriptionOriginal
// (written only when it is missing — never over a human original).
//
// LA LEZIONE DEL 15 OTTOBRE 2026 — la macchina inventava, letto sui 27
// annunci veri. Nove descrizioni pubbliche dicevano «unfurnished» su case
// il cui arredo nessuno aveva dichiarato (buildFacts trasformava il campo
// ASSENTE in 'unfurnished'); il bilocale di Via dei Cappellari era scritto
// «three bedrooms» (le camere si leggevano da `beds`, il testo libero del
// bot, invece che dal campo `bedrooms`); canone e data finivano nel testo —
// «Available from 1 March at €1500/month» — dove invecchiano mentre la
// pagina accanto cambia; e il civico («Via Endertà 9») arrivava al modello e
// da lì nel testo pubblico. Ora: l'arredo solo se dichiarato, le camere da
// FACTS.bedroomsOf (la stessa regola di tutto il sito: 0 = monolocale), la
// via senza il civico, niente prezzi né date né durate del soggiorno tra i
// fatti né nel testo — con BOOM si affitta per almeno 3 mesi, e una frase
// come «ideal for stays from one month» è una promessa che non si mantiene
// —, e il testo nuovo si CONTROLLA prima di scriverlo (copyIssues): il
// prompt chiede, il controllo garantisce.
//
// REGENERATE — POST { mode:'regenerate', ids:[…] } (al massimo 6 id). Per
// riscrivere le descrizioni GIÀ sbagliate. Solo un admin (token ID con
// ruolo 'admin') o il cron: MAI il segreto del bot né quello di Homie, che
// vivono sul Mac (il bot ricade su HOMIE_SECRET quando WIZARD_SECRET manca).
// Riscrive SOLO: un testo della macchina (descriptionSource esattamente 'ai'
// e ancora identico a come la macchina l'ha scritto, se ne porta
// l'impronta), un testo vuoto, o il template del bot. Tutto il resto è di
// una persona e si salta col motivo: i testi 'lotto12' sono le correzioni
// scritte e approvate dall'operatore il 16/08 (api/ops/_lotto12.js), le
// correzioni dal portale portano 'portal:<email>', il Media Studio
// 'studio:<email>'. La scrittura è condizionata alla versione letta: se
// qualcuno salva l'annuncio mentre il modello scrive, non si sovrascrive
// niente.
// Risposta { ok, mode, results:[{ id, outcome:'written'|'skipped'|'failed',
// reason, note, … }], written:[…], skipped:[…], failed:[…] } — gli stessi
// esiti divisi per esito, come la risposta dello sweep.
//
// L'IMPRONTA: ogni testo che la macchina scrive (sweep e rigenerazione)
// porta descriptionAiHash, l'impronta di quel testo. Se poi qualcuno lo
// riscrive senza toccare descriptionSource, l'impronta non torna più e la
// rigenerazione lo salta. I testi scritti prima del 15/10 non ce l'hanno:
// lì vale solo descriptionSource, e il portale da qui marca le correzioni a
// mano con 'portal:<email>'. Niente passata a ritroso: ciò che è stato
// corretto a mano prima, senza che nessuno lo registrasse, non si può più
// distinguere — se viene riscritto, il testo resta in descriptionPrevious.

import { secretEqual, readJson, fsList, fsGet, fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { parseModelJson } from '../_modeljson.js';
import { ai } from '../_ai.js';
import { runBudget } from '../_budget.js';
import FACTS from '../../js/listing-facts.js';

// Il modello sta nel registro: js/ai-registry.js, scopo 'wizard.describe'.

export const FEATURE_LABELS = {
  ac: 'air conditioning', elevator: 'elevator', balcony: 'balcony',
  terrace: 'terrace', washing_machine: 'washing machine', dishwasher: 'dishwasher',
  parking: 'parking space', storage: 'storage room', pets_allowed: 'pets allowed',
  wifi: 'WiFi included', double_glazing: 'double glazing', doorman: 'doorman',
};

// I testi che la macchina può riscrivere perché li ha scritti lei: solo lo
// sweep e la rigenerazione, che scrivono descriptionSource 'ai'. Il confronto
// è ESATTO — 'AI', ' ai', 'ai:…' non sono la macchina. 'lotto12' NON è qui:
// sono correzioni scritte e approvate dall'operatore il 16/08, cioè parole
// di una persona. js/catalogo-correzioni.js (MACHINE) deve dire lo stesso.
export const MACHINE_SOURCES = ['ai'];
export const REGEN_MAX_IDS = 6;

// Il tempo: una chiamata resta sotto i ~45s (la funzione ne ha 60 in
// vercel.json). Si comincia un annuncio solo se c'è il tempo di FINIRLO —
// la domanda di api/_budget.js è «ce la faccio?», non «sono in ritardo?»:
// lettura, modello, contatori della centrale (4s di tetto in api/_ai.js) e
// scrittura.
const REGEN_BUDGET_MS = 45_000;
const AI_TIMEOUT_MS = 20_000;    // il tetto di sempre di una descrizione
const AI_MIN_MS = 8_000;         // sotto, la chiamata scade prima di rispondere
const AFTER_AI_MS = 6_000;       // contatori AI + scrittura condizionata

// ── pure helpers (exported for tests) ───────────────────────────────────────

// The bot's fallback template, recognised by its own shape:
//   "Beautiful bilocale in Centro, 60sqm on floor 1, fully furnished. 3 beds,
//    1 bathroom. Features include ac, balcony, washing_machine. €1,500/month."
// Any ONE of these markers is conclusive — no human writes them, and every
// templated row in the live catalog carries at least the "Nsqm on floor" one.
export function isBoilerplate(text) {
  const t = String(text || '');
  if (!t.trim()) return false;                       // empty is its own case
  if (/\d+\s*sqm on floor/i.test(t)) return true;
  if (/\bFeatures include\b/i.test(t)) return true;
  // a raw database key that escaped into public copy
  return Object.keys(FEATURE_LABELS).some(k => k.includes('_') && t.includes(k));
}

// Why this listing needs copy — or null to leave it alone.
export function copyGap(l) {
  const status = String(l.status || 'available').toLowerCase();
  if (status !== 'available' && status !== 'waitlist') return null;  // not public
  const t = String(l.description || '').trim();
  if (!t) return 'missing';
  if (isBoilerplate(t)) return 'boilerplate';
  return null;                                       // human words: never touched
}

// Worst and most valuable first: a rentable page with NO text at all is both
// the biggest hole and the one being sold today. Ties keep document order.
export function copyOrder(candidates) {
  const rank = (c) => {
    const live = String(c.js.status || 'available').toLowerCase() === 'available' ? 0 : 2;
    return live + (copyGap(c.js) === 'missing' ? 0 : 1);
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b));
}

// L'arredo SOLO come l'ha dichiarato qualcuno — o null. Il campo assente
// diventava 'unfurnished', e da lì «unfurnished» nella vetrina di case che
// nessuno aveva mai descritto. I tre valori sono quelli del bot e del
// modulo annuncio del portal; letti come js/catalogo-correzioni.js, che
// segnala all'assistente un arredo inventato con la stessa regola.
export function furnishingOf(L) {
  const s = String(L == null || L.furnished == null ? '' : L.furnished).trim().toLowerCase();
  if (s === 'yes') return 'fully furnished';
  if (s === 'partial') return 'partially furnished';
  if (s === 'no') return 'unfurnished';
  return null;
}

// LA VIA, SENZA IL CIVICO. La lista dell'assistente dice «nomina la via, non
// il numero»: il civico nel testo pubblico dice a chiunque dov'è il portone
// di una casa abitata, e quando la casa cambia il testo resta. Il modello
// riceve solo la via — e il quartiere, se l'indirizzo lo porta dopo la
// virgola («Viale Angelico, Mazzini»). Si toglie: il numero in coda alla via
// (anche «n. 9», «9/A», «9 int. 3»), un numero da solo dopo la virgola, CAP e
// città. Un numero che FA PARTE del nome resta: «Viale 21 Aprile»,
// «Via 4 Novembre» (il numero sta prima del nome, non in coda).
const STREET_WORDS = ['via', 'viale', 'piazza', 'piazzale', 'piazzetta', 'largo', 'vicolo', 'vico', 'corso',
  'lungotevere', 'circonvallazione', 'borgo', 'salita', 'clivo', 'passeggiata', 'strada', 'rampa',
  'scalinata', 'galleria', 'lungomare', 'contrada', 'traversa', 'v\\.le', 'p\\.zza', 'p\\.za', 'p\\.le', 'c\\.so', 'l\\.go'];
const STREET_RE = STREET_WORDS.join('|');
const RE_STARTS_STREET = new RegExp(`^(?:${STREET_RE})(?=[\\s.]|$)`, 'i');
const RE_LEAD_NUMBER = new RegExp(`^\\d{1,4}[a-z]?\\s*,?\\s+(?=(?:${STREET_RE})\\b)`, 'i');
const RE_TAIL_NUMBER = /(?:\s*,\s*|\s+|^)(?:(?:n|nr|no|num|civico)\b\.?\s*)?\d{1,4}[a-z]?(?:\s*\/\s*[a-z0-9]{1,3})?(?:\s*,?\s*(?:int|interno|scala|sc|piano|p)\b\.?\s*[\w°-]{1,4})*\s*$/i;
const RE_TAIL_CITY = /(\d[a-z]?)\s*[-–,]?\s*(?:\d{5}\s*)?(?:roma|rome|rm)\b\.?\s*$/i;
const RE_ONLY_CITY = /^(?:\d{5}\s*)?(?:roma|rome|rm|italia|italy)?\.?$/i;
const RE_ONLY_EXTRA = /^(?:int|interno|scala|sc|piano|p)\b\.?\s*[\w°-]{0,4}$/i;

export function streetOf(address) {
  const parts = String(address == null ? '' : address).split(/\s*,\s*|\s+[-–]\s+/).map((p) => {
    let s = p.trim().replace(/\s+/g, ' ');
    if (RE_ONLY_EXTRA.test(s)) return '';             // «int. 4», «scala B»
    s = s.replace(RE_LEAD_NUMBER, '');                // «9 Via Endertà»
    s = s.replace(RE_TAIL_CITY, '$1');                // «Via Dei Laghi 14 Roma»
    s = s.replace(RE_TAIL_NUMBER, '').trim();         // «Via Endertà 9», «9»
    return s;
  }).filter((s) => s && !RE_ONLY_CITY.test(s) && !RE_ONLY_EXTRA.test(s) && /[a-zà-ÿ]/i.test(s));
  return parts.join(', ');
}

// The facts block handed to the model. Exported so a test can prove the sweep
// never smuggles a raw database key into the prompt (and so from there into
// the public copy). Niente canone né data di disponibilità: stanno altrove
// nella pagina, cambiano, e scritti in un testo invecchiano senza che
// nessuno se ne accorga. Niente civico (streetOf).
export function buildFacts(L) {
  L = L || {};
  const s = (v) => String(v == null ? '' : v).trim();
  const feats = Array.isArray(L.features) ? L.features.map(f => FEATURE_LABELS[f] || f) : [];
  const furnishing = furnishingOf(L);
  // la regola unica del sito: 0 = monolocale, e si dice come tale — mai
  // «Bedrooms: 0», mai un numero dal testo libero
  const bedrooms = FACTS.bedroomsOf(L);
  const zone = s(L.zone);
  const street = streetOf(L.address);
  const facts = [
    `Type: ${s(L.type) || 'apartment'}`,
    // la città sempre: «Trieste» e «Africano» sono quartieri di Roma, e il
    // modello aveva descritto Trieste-quartiere come la città sull'Adriatico
    'City: Rome, Italy',
    zone ? `Neighbourhood: ${zone}` : null,
    street ? `Street: ${street}` : null,
    L.sqm ? `Size: ${L.sqm} sqm` : null,
    s(L.floor) ? `Floor: ${s(L.floor)}` : null,
    bedrooms === 0 ? 'Bedrooms: studio (no separate bedroom)'
      : bedrooms ? `Bedrooms: ${bedrooms}` : null,
    L.bathrooms ? `Bathrooms: ${L.bathrooms}` : null,
    furnishing ? `Furnishing: ${furnishing}` : null,
    (L.concordato === true) ? 'Rent-controlled (canone concordato) contract available' : null,
    feats.length ? `Features: ${feats.join(', ')}` : null,
  ].filter(Boolean).join('\n');
  return facts;
}

// L'impronta del testo che la macchina ha scritto. Il modulo annuncio del
// portal riscrive `description` a ogni salvataggio: senza impronta la
// descrizione corretta a mano resterebbe «della macchina» e la
// rigenerazione dopo la cancellerebbe. Spazi, a capo e la forma degli
// accenti non contano: il textarea li cambia senza che nessuno abbia
// corretto niente.
// Pura e sincrona, niente node:crypto: /catalogo decide nel BROWSER cosa è
// «della macchina» (js/catalogo-correzioni.js, machineWritten) e deve
// arrivare allo stesso verdetto con la stessa funzione — scritta per essere
// spostata così com'è in un UMD di js/. 64 bit (cyrb53 a due metà): basta per
// riconoscere un testo cambiato, nessuno qui ha interesse a forgiarne uno.
export function textHash(text) {
  const s = String(text == null ? '' : text).normalize('NFC').replace(/\s+/g, ' ').trim();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// Il motivo, scritto per chi lo legge in /catalogo: di CHI sono queste
// parole, e perché non si toccano.
function humanNote(source) {
  const s = String(source || '');
  if (!s) return NOTE.not_machine;
  if (s === 'lotto12') {
    return 'È una correzione scritta e approvata dall\'operatore (lotto del 16/08): conta come parole di una persona e non si tocca.';
  }
  if (/^portal:/i.test(s)) {
    const who = s.slice(7).trim().slice(0, 80);
    return `Corretta a mano dal portale${who ? ' (' + who + ')' : ''}: parole di una persona, non si tocca.`;
  }
  if (/^studio:/i.test(s)) return 'Pubblicata dal Media Studio da una persona: non si tocca.';
  return `La fonte è «${s.slice(0, 60)}», non la macchina («ai»): si tratta come parole di una persona e non si tocca.`;
}

// Si può rigenerare questa descrizione? Vuota o template sì; della macchina
// sì, finché il testo è quello che la macchina ha scritto; il resto sono
// parole di una persona, o almeno nessuno ha provato il contrario.
export function regenVerdict(l) {
  l = l || {};
  const t = String(l.description || '').trim();
  // «empty», non «missing»: in /catalogo «missing» vuol dire annuncio
  // non trovato, e una casa riscritta non deve leggersi così
  if (!t) return { ok: true, basis: 'empty' };
  if (isBoilerplate(t)) return { ok: true, basis: 'boilerplate' };
  const source = typeof l.descriptionSource === 'string' && l.descriptionSource !== '' ? l.descriptionSource : null;
  if (!MACHINE_SOURCES.includes(source)) return { ok: false, reason: 'not_machine', source, note: humanNote(source) };
  if (l.descriptionAiHash && l.descriptionAiHash !== textHash(t)) {
    return { ok: false, reason: 'edited_after_machine', source };
  }
  return { ok: true, basis: 'machine', source };
}

// Cosa NON può dire un testo appena scritto — controllato DOPO il modello.
//
// LA REGOLA DI CLASSE, e le sue quattro eccezioni volute. Ogni famiglia
// CONTIENE quella del rilevatore della lista dell'assistente
// (js/catalogo-correzioni.js, descriptionIssues): un testo che passasse qui e
// non lì verrebbe scritto e finirebbe dritto nella lista, segnalato e
// preselezionato per la rigenerazione. Quattro forme il fondatore le ha
// volute più strette di lì, perché sono falsi positivi che bloccavano testi
// giusti: «deposito» (in italiano è anche il ripostiglio) conta solo accanto
// a soldi; «free from» solo se segue un mese o una data («free from
// traffic»); «al mese» / «per month» solo con una cifra accanto («due volte
// al mese»); le camere sono sbagliate solo se NESSUNA occorrenza dà il
// numero giusto («two bedrooms; one bedroom faces the courtyard»), e «una
// camera» senza «da letto» non è un conto. descriptionIssues è ora una
// copia FEDELE di queste regole (estratta da qui, non trascritta): chi
// cambia copyIssues la ricopia in js/catalogo-correzioni.js, e
// tests/catalogo/strumento.mjs cade finché le due non coincidono.
const EN_MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
// «sett» è l'abbreviazione italiana («dal 1 sett.»); «set», «mar», «ago»
// no: «1 set of keys», «2 mar…», «anni ago» sono altre parole
const IT_MONTHS = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|sett';
const MONTHS = EN_MONTHS + '|' + IT_MONTHS;
// una cifra che può essere un canone: almeno tre cifre o le migliaia
// separate («900», «1.500», «1,500») — mai una superficie
const MONEY = '(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{3,5})(?:[.,]\\d{1,2})?';
const NOT_YEAR = '(?!(?:19|20)\\d\\d\\b)';
const NOT_SIZE = '(?!\\s*(?:sqm|sq\\.?\\s?m|mq|m2|m²|square|metri|meters|metres))';
// la frequenza che fa di una cifra un canone
const PER_MONTH = '(?:(?:a|per|each|every)\\s+month|monthly|al\\s+mese|a\\s+mese|per\\s+mese|ogni\\s+mese|mensil[ei])';
const RE_PRICE = new RegExp([
  '€',
  '\\b\\d[\\d.,]*\\s*eur(?:os?)?\\b',                      // «1,500 EUR», «900 euro»
  '\\beur(?:os?)?\\s*\\d',                                // «EUR 1500»
  '\\/\\s?(?:month|mo|mese)\\b',                           // la barra-mese è sempre un prezzo
  // una cifra vicina alla frequenza: «900 a month», «1.500 al mese» — ma
  // «due volte al mese», «cleaned twice per month» non sono un canone
  `\\b${NOT_YEAR}${MONEY}\\b${NOT_SIZE}[^.\\n]{0,25}?\\b${PER_MONTH}\\b`,
  `\\b${MONEY}\\s*(?:€|eur(?:os?)?)?\\s*${PER_MONTH}\\b`,  // attaccata, anche una cifra da anno: «1950 a month»
  `\\b(?:rent|canone|affitto|pigione)\\b[^.\\n\\d]{0,15}${MONEY}\\b${NOT_SIZE}`,   // «Canone 1.500»
].join('|'), 'i');
// «deposito» in italiano è anche il ripostiglio (la feature `storage`): conta
// come soldi solo accanto a soldi — €, euro, mensilità, mesi, canoni, una
// cifra da canone, «cauzionale»; «deposit», «cauzione», «provvigione» sempre
const RE_FEE = new RegExp([
  '\\b(?:agency\\s+)?fees?\\b', '\\bcommissions?\\b', '\\bdeposits?\\b',
  '\\bprovvigion[ei]\\b', '\\bcommission[ei]\\b', '\\bcauzion[ei]\\b', '\\bcauzional[ei]\\b',
  `\\bdeposit[oi]\\b[^.;\\n]{0,40}?(?:€|\\beur(?:os?)?\\b|\\bmensilit|\\bmes[ei]\\b|\\bcanon[ei]\\b|\\b${NOT_YEAR}${MONEY}\\b${NOT_SIZE})`,
  `(?:€|\\bmensilit[àa]|\\bmes[ei]\\b|\\b${NOT_YEAR}${MONEY}\\b${NOT_SIZE})[^.;\\n]{0,25}?\\bdeposit[oi]\\b`,
].join('|'), 'i');
const RE_DATE = new RegExp([
  '\\b(?:available|ready)\\s+(?:from|on|now|immediately|starting)\\b',
  // «free from» solo davanti a una data: «free from traffic» è un'altra cosa
  `\\bfree\\s+(?:from|on|starting(?:\\s+from)?)\\s+(?:the\\s+)?(?:early\\s+|mid[\\s-]?|late\\s+|(?:the\\s+)?(?:end|beginning|start|middle)\\s+of\\s+)?(?:\\d|(?:${MONTHS})\\b|next\\s+(?:week|month|year)\\b|today\\b|tomorrow\\b)`,
  '\\bfree\\s+(?:now|immediately|right\\s+away|straight\\s+away)\\b',
  '\\b(?:immediately|instantly|right\\s+away|straight\\s+away|now)\\s+available\\b',
  '\\bavailable\\s+(?:right\\s+away|straight\\s+away|today|as\\s+of)\\b',
  '\\bready to move\\b', '\\bmove-?in ready\\b',
  '\\bdisponibil[ei]\\s+(?:da|dal|dall|dalla|subito|immediatamente)\\b', '\\bsubito disponibile\\b',
  // «libero da» come «free from»: solo davanti a una data («libero dal traffico» no)
  `\\bliber[oaie]\\s+(?:da|dal|dalla|dall['’]?)\\s*(?:\\d|(?:${IT_MONTHS})\\b|subito\\b|oggi\\b|ora\\b|adesso\\b|inizio\\b|met[àa]\\b|fine\\b|prossim)`,
  '\\bliber[oaie]\\s+subito\\b', '\\bpront[oa] da abitare\\b',
  '\\bsubito\\s+(?:liber|disponibil|abitabil|pront)\\w*',
  '\\b(?:liber|disponibil)\\w*\\s+(?:da\\s+)?(?:subito|ora|adesso|oggi|immediatamente)\\b',
  `\\ba\\s+partire\\s+da(?:l|lla|ll['’])?\\s*(?:\\d|${IT_MONTHS}|subito|ora|oggi|inizio|metà|meta|fine)`,
  `\\b(?:da|dal|dalla|dai)\\s+(?:inizio\\s+|metà\\s+|meta\\s+|fine\\s+)?(?:${IT_MONTHS})\\b`,
  `\\bdall['’]\\s*(?:\\d{1,2}°?\\s+)?(?:${IT_MONTHS})\\b`,
  `\\bfrom\\s+(?:early\\s+|mid[\\s-]?|late\\s+|the\\s+(?:start|end|beginning|middle)\\s+of\\s+)?(?:${MONTHS})\\b`,
  `\\b\\d{1,2}(?:st|nd|rd|th|º|°)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`,          // «1 March», «1° settembre»
  `\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,                         // «September 1st»
  `\\b(?:${MONTHS})\\s+20\\d\\d\\b`,
].join('|'), 'i');
// LA DURATA. Con BOOM si affitta per almeno 3 mesi (decisione del fondatore,
// 15/10): «one month», «short stays», «month-to-month» promettono una cosa
// che non si fa. Il SYSTEM vieta qualsiasi durata; qui si blocca ciò che la
// promette — un soggiorno breve, un minimo, una durata in mesi o settimane.
// «long-term» non è una promessa sbagliata e non si blocca.
const NUM_EN = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|an?|a\\s+few|a\\s+couple\\s+of|\\d{1,2})';
const NUM_IT = '(?:un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|pochi|poche|qualche|\\d{1,2})';
const RE_STAY = new RegExp([
  '\\b(?:one|1|a\\s+single)[\\s-]+months?\\b',
  '\\bmonth[\\s-]+(?:to|by)[\\s-]+month\\b',
  '\\bshort(?:er)?[\\s-]+(?:stays?|terms?|lets?|rentals?|leases?|visits?|periods?|tenanc(?:y|ies))\\b',
  '\\b(?:mid|medium)[\\s-]+term\\b',
  '\\bminimum\\s+(?:stay|term|lease|let|rental|period|tenancy|contract|duration|of)\\b',
  `\\bmin\\.?\\s+${NUM_EN}\\s+(?:months?|weeks?|nights?)\\b`,
  `\\b${NUM_EN}[\\s-]+(?:months?|weeks?|nights?)[\\s-]+(?:minimum|min\\b|stays?|leases?|lets?|rentals?|contracts?|tenanc(?:y|ies))\\b`,
  `\\b(?:stays?|lets?|leases?|rentals?|tenanc(?:y|ies)|contracts?)\\s+(?:of|from|for|starting\\s+(?:at|from))\\s+(?:just\\s+|only\\s+|as\\s+little\\s+as\\s+)?${NUM_EN}\\s+(?:months?|weeks?|nights?)\\b`,
  `\\bfor\\s+(?:just\\s+|only\\s+)?${NUM_EN}\\s+(?:months?|weeks?)\\b`,
  '\\bflexible\\s+(?:stays?|leases?|lets?|rentals?|length|duration)\\b',
  '\\b(?:weekly|nightly)\\s+(?:stays?|rentals?|lets?|rates?)\\b',
  '\\b(?:un|uno|1)\\s+mese\\b',                           // «anche per un mese»
  '\\bmese\\s+per\\s+mese\\b',
  '\\bsoggiorn[oi]\\s+brev[ei]\\b',
  '\\bbrev[ei]\\s+(?:soggiorn[oi]|period[oi]|permanenz[ae]|durat[ae])\\b',
  '\\b(?:affitt[oi]|locazion[ei]|soggiorn[oi])\\s+(?:brev[ei]|di\\s+breve\\s+durata)\\b',
  '\\b(?:breve|medio)\\s+termine\\b',
  '\\b(?:durata|permanenza|soggiorno|locazione|contratto|affitto)\\s+minim[ao]\\b',
  `\\b(?:minimo|almeno|min\\.?)\\s+${NUM_IT}\\s+(?:mes[ei]|settiman[ae]|nott[ei])\\b`,
  `\\b(?:soggiorn[oi]|affitt[oi]|locazion[ei]|contratt[oi])\\s+(?:di|da)\\s+(?:soli?\\s+)?${NUM_IT}\\s+(?:mes[ei]|settiman[ae]|nott[ei])\\b`,
  `\\bper\\s+(?:soli?\\s+)?${NUM_IT}\\s+(?:mes[ei]|settiman[ae])\\b`,
].join('|'), 'i');
// L'arredo nel testo. Con il campo vuoto qualsiasi parola sull'arredo è
// inventata — «fully furnished» quanto «unfurnished», «arredato con gusto»
// quanto «da arredare» o «la casa è vuota»: il modello non l'ha saputo da
// nessuno. Con l'arredo dichiarato (nel campo, o fra feature ed etichette)
// si cerca solo il contrario di ciò che è dichiarato.
const EMPTY_HOME = '\\b(?:casa|appartamento|immobile|alloggio|loft|bilocale|trilocale|quadrilocale|monolocale|attico|mansarda|unità)'
    + '\\s+(?:è\\s+|e[\'’]\\s+|sarà\\s+|resta\\s+|rimane\\s+|viene\\s+(?:\\w+\\s+)?)?(?:completamente\\s+|totalmente\\s+)?vuot[oaie]\\b'
  + '|\\b(?:consegn|affitt|offert|lasci|propost)\\w*\\s+(?:completamente\\s+|totalmente\\s+)?vuot[oaie]\\b'
  + '|\\b(?:flat|apartment|home|house|unit|loft|studio|place|property)\\s+(?:is\\s+|comes\\s+|will\\s+be\\s+|is\\s+(?:let|rented|offered|delivered)\\s+)?(?:completely\\s+|totally\\s+|entirely\\s+)?empty\\b'
  + '|\\b(?:comes|delivered|let|rented|offered|handed\\s+over)\\s+(?:completely\\s+|totally\\s+|entirely\\s+)?empty\\b'
  + '|\\bempty\\s+(?:flat|apartment|home|house|unit|loft|studio)\\b';
const UNFURN = '\\bunfurnished\\b|\\bnot\\s+furnished\\b|\\bwithout\\s+(?:any\\s+)?furniture\\b|\\bno\\s+furniture\\b'
  + '|\\bnon\\s+(?:è\\s+|e\\s+|sono\\s+)?(?:arredat|ammobiliat)\\w*|\\bsenza\\s+(?:arredi|arredamento|mobili)\\b'
  + '|\\bpriv[oaie]\\s+di\\s+(?:arredi|arredamento|mobili)\\b|\\bda\\s+arredare\\b|\\bvuot[oaie]\\s+di\\s+(?:arredi|mobili)\\b'
  + '|' + EMPTY_HOME;
const RE_UNFURNISHED = new RegExp(UNFURN, 'i');
const RE_UNFURNISHED_ALL = new RegExp(UNFURN, 'gi');
// solo gli aggettivi: «bring your own furniture» parla di mobili ed è
// coerente con una casa vuota — non è un «arredata»
const RE_FURNISHED = /\b(?:fully\s+|partially\s+|partly\s+|semi[\s-]?)?furnished\b|\barredat[oaie]\b|\bammobiliat[oaie]\b/i;
const RE_FULLY = /\b(?:fully|completely|entirely)\s+furnished\b|\b(?:completamente|interamente|totalmente)\s+arredat/i;
const RE_PARTLY = /\b(?:partially|partly)\s+furnished\b|\bsemi[\s-]?furnished\b|\bparzialmente\s+arredat|\bsemi[\s-]?arredat/i;
// qualunque parola sull'arredo, anche «la casa è vuota»
const RE_FURNISHING_WORD = new RegExp('\\b(?:un)?furnish\\w*|\\bfurniture\\b|\\barred\\w*|\\bammobiliat\\w*|\\bmobili\\b|' + EMPTY_HOME, 'i');
const RE_FURNISHING_TOLD = /furnish|furnitur|arred|ammobiliat|\bmobili\b/i;
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6 };
// un NUMERO di camere: «three bedrooms», «one-bedroom», «due camere (da
// letto)», «una camera da letto». «Una camera matrimoniale» no: in italiano
// «camera» è anche una stanza qualsiasi descritta da sola, non un conto.
const RE_BEDROOM_COUNT = /\b(\d{1,2}|one|two|three|four|five|six|uno|una|due|tre|quattro|cinque|sei)[\s-]+(?:bedrooms?|camere(?:\s+da\s+letto)?|camera\s+da\s+letto)\b/gi;

// L'arredo che l'operatore ha scritto fra le feature o le etichette quando
// il campo è vuoto: è dichiarato anche così («fully furnished» fra i tag di
// 2SwJ8yD3ITXylrEtYIlL). Le feature arrivano al modello, le etichette no —
// ma sono vere lo stesso, e un testo che le ripete non inventa niente.
function furnishingTold(l) {
  const said = [...(Array.isArray(l.features) ? l.features : []), ...(Array.isArray(l.tags) ? l.tags : [])]
    .map((x) => String(x == null ? '' : x)).filter((x) => RE_FURNISHING_TOLD.test(x));
  if (!said.length) return null;
  const s = said.join(' | ');
  if (RE_UNFURNISHED.test(s)) return 'unfurnished';
  if (RE_PARTLY.test(s)) return 'partially furnished';
  return 'fully furnished';
}

// Il proprio indirizzo non è una data: a Roma «Viale 21 Aprile» si scrive
// anche in cifre, e il controllo lo scambierebbe per «disponibile dal 21
// aprile» — una rigenerazione bloccata per sempre su quella casa.
function withoutPlace(t, l) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const addr = String(l.address || '').trim();
  const street = streetOf(addr);
  let out = t;
  for (const p of [addr, street, ...street.split(', ')]) if (p.length >= 4) out = out.replace(new RegExp(esc(p), 'gi'), ' ');
  return out;
}

// IL CIVICO NEL TESTO. Il modello non lo riceve più (streetOf), quindi un
// numero accanto a una via è inventato o sfuggito: si blocca. Tre forme: la
// via dell'annuncio seguita da un numero (anche «Viale 21 Aprile 12», «Via
// Di Tor Di quinto 39»), qualsiasi via scritta come tale seguita da un
// numero («Via del Corso 75»), e le parole del civico («al civico 9», «house
// number»). Non è un civico il numero che misura altro: «Via Nazionale, 2
// minutes», «Piazza Navona 5 min a piedi», «Via Appia 3 km», «2 stops» —
// e non ci sono vie in «2 bedrooms», «3rd floor», «Metro B».
const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const anyCase = (s) => s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM_TAIL = '(?:\\s*,)?\\s*(?:al\\s+)?(?:(?:[Nn]|[Nn][Rr]|[Nn][Oo]|[Nn]um|[Nn]umero|[Cc]ivico)\\.?\\s*)?\\d{1,4}(?:[A-Z]|\\/[A-Za-z0-9]{1,3})?\\b';
const NAME_PART = '(?:di|de|del|della|dello|delle|dei|degli|da|dal|dalla|dai|san|santa|santo|la|le|lo|il|gli|in|a|al|alla|alle|ai|agli|e|s\\.|ss\\.)';
const NAME_APOS = "(?:d|dell|all|nell|sull|sant)['’]";
const NAME_CAP = "[A-Z][A-Za-z'’.\\-]*";
const RE_STREET_NUMBER = new RegExp(
  `\\b(?:${STREET_WORDS.map(anyCase).join('|')})\\s+(?:${NAME_PART}\\s+|${NAME_APOS}\\s*|${NAME_CAP}\\s+){0,6}${NAME_CAP}${NUM_TAIL}`, 'g');
// «civico» è anche un aggettivo («Museo Civico di Zoologia», a due passi da
// Villa Borghese): conta solo se segue un numero
const RE_CIVICO_WORDS = /\bcivico\s*(?:nr?\.?\s*|numero\s*)?\d|\b(?:numero\s+civico|house\s+number|street\s+number|building\s+number|door\s+number)\b/i;
const RE_NOT_CIVICO = /^[\s\-–]*(?:\d+[\s\-–]*)?(?:mins?\b|minut|km\b|m\b|mt\b|metr|meter|yards?\b|steps?\b|passi|°|º|bed|camer|stanz|rooms?\b|floor|pian|sqm|sq\b|mq\b|m2\b|m²|walk|a\s+piedi|stops?\b|fermat|bus\b|tram\b|lines?\b|line[ae]\b|euro|eur\b|€|%|anni\b|years?\b|secol|centur)/i;

function ownStreetNames(l) {
  return streetOf(l.address).split(', ').map((p) => deaccent(p).trim())
    .filter((p) => p.length >= 4 && RE_STARTS_STREET.test(p));
}

function addressNumberIn(text, l) {
  const t = deaccent(text);
  if (RE_CIVICO_WORDS.test(t)) return true;
  const patterns = ownStreetNames(l).map((n) => new RegExp(anyCase(escRe(n)) + NUM_TAIL, 'g'));
  patterns.push(new RegExp(RE_STREET_NUMBER.source, 'g'));
  for (const re of patterns) {
    let m;
    while ((m = re.exec(t))) {
      if (!RE_NOT_CIVICO.test(t.slice(m.index + m[0].length, m.index + m[0].length + 30))) return true;
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return false;
}

export function copyIssues(text, l) {
  l = l || {};
  const t = String(text || '');
  const out = [];
  if (RE_PRICE.test(t)) out.push('price_in_text');
  if (RE_FEE.test(t)) out.push('fee_in_text');
  if (RE_DATE.test(withoutPlace(t, l))) out.push('date_in_text');
  if (RE_STAY.test(t)) out.push('stay_in_text');
  if (addressNumberIn(t, l)) out.push('address_number');

  const fu = furnishingOf(l) || furnishingTold(l);
  if (fu === null) {
    // nessuno l'ha detto: ogni parola sull'arredo è inventata
    if (RE_FURNISHING_WORD.test(t)) out.push('furnishing_invented');
  } else {
    const said = t.replace(RE_UNFURNISHED_ALL, ' ');    // tolto «unfurnished», resta «furnished»?
    const wrong = fu === 'unfurnished' ? RE_FURNISHED.test(said)
      : fu === 'fully furnished' ? (RE_UNFURNISHED.test(t) || RE_PARTLY.test(t))
        : (RE_UNFURNISHED.test(t) || RE_FULLY.test(t));
    if (wrong) out.push('furnishing_contradicted');
  }

  // una stanza in un appartamento condiviso descrive le camere della CASA
  // («a room in a three-bedroom flat»): lì il conto non si confronta.
  // Il confronto è con FACTS.bedroomsOf, la stessa lettura della lista
  // dell'assistente e di buildFacts.
  const room = /\b(?:room|stanza|shared)\b/i.test(String(l.type || ''));
  if (!room) {
    const b = FACTS.bedroomsOf(l);
    const claims = [];
    let m;
    RE_BEDROOM_COUNT.lastIndex = 0;
    while ((m = RE_BEDROOM_COUNT.exec(t))) {
      const v = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
      if (v != null) claims.push(v);
    }
    if (b == null) {
      // camere che nessuno ha dichiarato: un numero nel testo è dedotto dal
      // tipo o dal nome, cioè inventato (il SYSTEM lo vieta, qui si verifica)
      if (claims.length) out.push('bedrooms_invented');
    } else if ((claims.length && !claims.includes(b))
      // sbagliato solo se NESSUNA occorrenza dà il numero giusto: «two
      // bedrooms; one bedroom faces the courtyard» sono due camere
      || (b >= 1 && /\bmonolocale\b|\bstudio (?:flat|apartment)\b/i.test(t))) {
      out.push('bedrooms_mismatch');
    }
  }
  return out;
}

// Cosa si scrive sull'annuncio insieme al testo nuovo. Niente si perde:
// il testo appena sostituito va in descriptionPrevious (l'italiano in
// descriptionItPrevious), il primo testo in assoluto in descriptionOriginal
// — SOLO se manca, mai sopra un originale umano.
export function machinePatch(l, en, it, at = new Date().toISOString()) {
  l = l || {};
  const prev = String(l.description || '');
  const prevIt = String(l.descriptionIt || '');
  const patch = {
    description: en,
    descriptionSource: 'ai',
    descriptionAt: at,
    descriptionAiHash: textHash(en),
  };
  if (it) {
    patch.descriptionIt = it;
    if (prevIt.trim()) patch.descriptionItPrevious = prevIt;
  }
  if (prev.trim()) {
    patch.descriptionPrevious = prev;
    if (!String(l.descriptionOriginal || '').trim()) patch.descriptionOriginal = prev;
  }
  return patch;
}

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

export const SYSTEM = `You write listing descriptions for BOOM, a premium rental agency in Rome serving international tenants and remote workers. Voice: warm, concrete, trustworthy, understated. Rules, for BOTH languages:
- use ONLY the facts provided — never invent rooms, views, distances or amenities; avoid clichés ("nestled", "stunning", "heart of"); 3-4 sentences; one short line on what makes the neighbourhood appealing for a tenant (it is a neighbourhood of Rome, never a city with the same name);
- furnishing: say whether the home is furnished ONLY as the facts state it (the Furnishing line, or a feature the operator listed); if the facts don't say, do not mention furniture at all — never call it furnished or unfurnished, empty or to be furnished;
- bedrooms: give a number of bedrooms ONLY as the Bedrooms line states it; never deduce it from the type or the name; with no Bedrooms line, give no number of bedrooms;
- address: you may name the street, never a house number;
- never write prices, rent, deposits, fees or commissions, and never say when the home is available (no dates, no "available now", no "ready to move in"): they are shown elsewhere on the page and they change;
- never mention the length of stay, minimum term or short stays.
Return STRICT JSON only: {"en":"<English>","it":"<natural Italian, not a literal translation>"}.`;

// One AI call → { en, it, structured }. Throws on transport/upstream failure
// so the caller decides what that means (a 502 for the bot, a failed row for
// the sweep and for regenerate). `structured` = the model answered in the
// JSON asked for: without it, nothing is written unattended.
async function generateCopy(L, { timeoutMs = AI_TIMEOUT_MS } = {}) {
  const messages = [{ role: 'user', content: `Write the description for this apartment:\n\n${buildFacts(L)}` }];
  let text;
  try {
    text = (await ai({ purpose: 'wizard.describe', system: SYSTEM, messages, maxTokens: 700, timeoutMs, json: true })).text;
  } catch (e) {
    console.error('[wizard/describe] ' + (e.code || e.message));
    throw new Error('ai_failed');
  }
  const read = parseModelJson(text);
  if (read.ok) {
    const v = read.value;
    const obj = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    // JSON, ma non quello chiesto ({"description":…}, en:null): niente, in
    // nessuna lingua. Il JSON grezzo il bot lo pubblicherebbe come
    // descrizione; con en vuoto ripiega sul suo modello, che lo sweep poi
    // riscrive
    if (!obj || typeof obj.en !== 'string') return { en: '', it: '', structured: false };
    return { en: obj.en.trim(), it: typeof obj.it === 'string' ? obj.it.trim() : '', structured: true };
  }
  // JSON cominciato e rotto (troncato, illeggibile): mezzo oggetto non è un testo
  if (read.why === 'truncated' || read.why === 'invalid') return { en: '', it: '', structured: false };
  // prosa, nessun oggetto: il bot la riceve (passata da copyIssues); lo
  // sweep e la rigenerazione non la scrivono mai (structured:false)
  return { en: String(text || '').trim(), it: '', structured: false };
}

const NOTE = {
  machine: 'Riscritta: il testo era della macchina.',
  empty: 'Scritta: non c\'era nessun testo.',
  boilerplate: 'Riscritta: era il modello automatico del bot.',
  missing: 'Scritta: non c\'era nessun testo.',
  not_machine: 'Non è marcata come scritta dalla macchina: si tratta come parole di una persona e non si tocca.',
  edited_after_machine: 'La macchina l\'aveva scritta, ma il testo è cambiato dopo: qualcuno l\'ha corretto a mano. Non si tocca.',
  no_gap: 'Nel frattempo ha già un testo: niente da riempire.',
  time_budget: 'Il tempo della chiamata è finito prima di arrivarci: rimandala con questo id.',
  not_found: 'Annuncio inesistente.',
  read_failed: 'Lettura dell\'annuncio fallita: riprova.',
  ai_failed: 'Il modello non ha risposto: riprova.',
  ai_unreadable: 'Il modello non ha risposto nel formato richiesto: niente scritto, riprova.',
  empty_copy: 'Il modello ha restituito un testo vuoto: niente scritto.',
  no_italian: 'Manca l\'italiano nuovo e quello vecchio direbbe ancora i fatti di prima: niente scritto, riprova.',
  broke_rules: 'Il testo nuovo violava le regole (vedi issues): non pubblicato, riprova.',
  changed_meanwhile: 'L\'annuncio è stato salvato da qualcuno mentre il modello scriveva: niente sovrascritto, riprova.',
  write_failed: 'Scrittura fallita: riprova.',
};
const skipped = (id, reason, extra = {}) => ({ id, outcome: 'skipped', reason, note: NOTE[reason], ...extra });
const failed = (id, reason, extra = {}) => ({ id, outcome: 'failed', reason, note: NOTE[reason], ...extra });

// UN annuncio, dalla lettura alla scrittura — la stessa strada per lo sweep
// e per la rigenerazione. Si legge la versione, si decide sul dato FRESCO,
// si scrive solo se nessuno l'ha toccato nel frattempo.
async function rewriteOne(id, budget, verdictOf) {
  if (!budget.afford(AI_MIN_MS + AFTER_AI_MS)) return skipped(id, 'time_budget');
  let snap;
  try { snap = await fsGetVersioned('listings/' + id); }
  catch { return failed(id, 'read_failed'); }
  if (!snap) return failed(id, 'not_found');
  const l = snap.data || {};
  const v = verdictOf(l);
  if (!v.ok) {
    return skipped(id, v.reason, { ...(v.source !== undefined ? { source: v.source } : {}), ...(v.note ? { note: v.note } : {}) });
  }
  const cap = Math.min(AI_TIMEOUT_MS, budget.left() - AFTER_AI_MS);
  if (cap < AI_MIN_MS) return skipped(id, 'time_budget');
  let copy;
  try { copy = await generateCopy(l, { timeoutMs: cap }); }
  catch { return failed(id, 'ai_failed'); }
  if (!copy.structured) return failed(id, 'ai_unreadable');
  if (!copy.en) return failed(id, 'empty_copy');
  if (!copy.it && String(l.descriptionIt || '').trim()) return failed(id, 'no_italian');
  // tutte e due le lingue: l'italiano è pubblico quanto l'inglese
  const issues = copyIssues(copy.en + '\n' + copy.it, l);
  if (issues.length) return failed(id, 'broke_rules', { issues });
  try {
    await fsCommit([{ docPath: 'listings/' + id, fields: machinePatch(l, copy.en, copy.it),
      precondition: { updateTime: snap.updateTime } }]);
  } catch (e) {
    return failed(id, e && e.conflict ? 'changed_meanwhile' : 'write_failed');
  }
  return { id, outcome: 'written', reason: v.basis, note: NOTE[v.basis], chars: copy.en.length, italian: !!copy.it };
}

// ── the nightly sweep: no public listing stays mute ─────────────────────────
async function sweep(limit) {
  const budget = runBudget(REGEN_BUDGET_MS, 0);
  const rows = await fsList('listings', { limit: 300 });
  const candidates = copyOrder((Array.isArray(rows) ? rows : [])
    .map(r => ({ id: r.id, js: r }))
    .filter(c => c.id && copyGap(c.js)));

  // sul dato fresco si ricontrolla la stessa cosa: un buco che nel
  // frattempo qualcuno ha riempito non si riempie due volte
  const stillGap = (l) => { const gap = copyGap(l); return gap ? { ok: true, basis: gap } : { ok: false, reason: 'no_gap' }; };
  const written = [], failedRows = [], skippedRows = [];
  for (const c of candidates) {
    if (written.length >= limit) break;
    const r = await rewriteOne(c.id, budget, stillGap);
    if (r.outcome === 'written') written.push({ id: c.id, gap: r.reason, chars: r.chars });
    else if (r.reason === 'time_budget') break;    // il resto è `remaining`, non un errore
    else if (r.outcome === 'skipped') skippedRows.push({ id: c.id, note: r.reason });
    else failedRows.push({ id: c.id, note: r.reason, ...(r.issues ? { issues: r.issues } : {}) });
  }
  return {
    ok: true, mode: 'sweep', checked: (Array.isArray(rows) ? rows : []).length,
    candidates: candidates.length, written, failed: failedRows, skipped: skippedRows,
    remaining: Math.max(0, candidates.length - written.length - failedRows.length - skippedRows.length),
  };
}

// ── regenerate: le descrizioni già sbagliate, su richiesta dell'admin ───────

// Un id di Firestore come una via sola: niente «/» (sotto-collezioni), niente
// nomi riservati. Un id storto ferma la richiesta intera: meglio un 400 che
// un lavoro a metà su una lista sbagliata. Un id ripetuto vale una volta:
// riscritto due volte, il testo di prima uscirebbe da descriptionPrevious.
function parseIds(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'ids_required' };
  if (raw.length > REGEN_MAX_IDS) return { error: 'too_many_ids' };
  const ids = [];
  for (const x of raw) {
    const id = typeof x === 'string' ? x.trim() : '';
    if (!/^[^/\s]{1,200}$/.test(id) || /^__.*__$/.test(id) || id === '.' || id === '..') {
      return { error: 'invalid_id', id: String(x).slice(0, 80) };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids };
}

// requireCronOrAdmin apre anche a Homie e ai ruoli owner/landlord: per lo
// sweep va bene, per riscrivere QUALSIASI annuncio no. Qui passano solo il
// cron e un profilo con ruolo 'admin' — le regole Firestore danno la
// scrittura sui listings al solo admin, e il server non deve fare per conto
// di altri ciò che le regole vietano. Un profilo che non si riesce a
// rileggere è un 503, mai un «admin» per difetto.
async function adminOnly(actor, res) {
  if (actor === 'cron') return 'cron';
  if (typeof actor === 'string' && actor.startsWith('admin:')) {
    let profile;
    try { profile = await fsGet('users/' + actor.slice(6)); }
    catch {
      res.status(503).json({ ok: false, error: 'profile_unavailable' });
      return null;
    }
    if (profile && profile.role === 'admin') return 'admin';
  }
  res.status(403).json({ ok: false, error: 'admin_required',
    detail: 'serve il token di un admin o il cron: il segreto del bot (o di Homie) non basta' });
  return null;
}

async function regenerateHandler(req, res, body) {
  const budget = runBudget(REGEN_BUDGET_MS, 0);
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;                                // 401/403 già scritti
  const who = await adminOnly(actor, res);
  if (!who) return;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });

  const parsed = parseIds(body && body.ids);
  if (parsed.error) {
    return res.status(400).json({ ok: false, error: parsed.error, max: REGEN_MAX_IDS,
      ...(parsed.id !== undefined ? { id: parsed.id } : {}) });
  }

  const results = [];
  for (const id of parsed.ids) results.push(await rewriteOne(id, budget, regenVerdict));
  const by = (o) => results.filter(r => r.outcome === o);
  const written = by('written'), skippedRows = by('skipped'), failedRows = by('failed');
  // forma e misura, mai contenuto
  console.log(`[wizard/describe] regenerate by=${who} ids=${parsed.ids.length} written=${written.length} skipped=${skippedRows.length} failed=${failedRows.length}`);
  return res.status(200).json({ ok: true, mode: 'regenerate', results,
    written, skipped: skippedRows, failed: failedRows });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wizard-Secret, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = req.query || {};
  const isSweep = req.method === 'GET' && q.mode === 'sweep';
  if (req.method !== 'POST' && !isSweep) return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // the sweep runs on cron/admin auth
  if (isSweep) {
    if (!(await requireCronOrAdmin(req, res))) return;
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });
    const limit = Math.max(1, Math.min(8, parseInt(q.limit, 10) || 6));
    try { return res.status(200).json(await sweep(limit)); }
    catch (e) {
      console.error('[wizard/describe] sweep', e);
      return res.status(500).json({ ok: false, error: 'internal', detail: String(e.message || '').slice(0, 120) });
    }
  }

  // il corpo decide chi può chiamare: la rigenerazione non passa MAI dal
  // segreto del bot, nemmeno se la richiesta lo porta
  let L;
  try { L = await readJson(req); } catch { L = null; }
  const mode = (L && typeof L === 'object' && typeof L.mode === 'string') ? L.mode : q.mode;
  if (mode === 'regenerate' || q.mode === 'regenerate') return regenerateHandler(req, res, L);

  // the bot's POST keeps its shared secret
  if (!checkSecret(req, res)) return;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });
  if (!L || typeof L !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  try {
    const { en, it } = await generateCopy(L);
    // senza inglese niente: il bot userebbe l'italiano solo accanto a lui
    if (!en) return res.status(200).json({ ok: true, en: '', it: '', aiHash: null, issues: [] });
    // lo stesso controllo dello sweep: il bot pubblica senza che nessuno
    // legga, quindi un testo che viola le regole non gli arriva — en vuoto,
    // e lui ripiega sul suo modello (lo sweep lo riscrive di notte)
    const issues = copyIssues(en + '\n' + it, L);
    if (issues.length) {
      console.log(`[wizard/describe] bot copy withheld issues=${issues.join(',')}`);   // forma, mai testo
      return res.status(200).json({ ok: true, en: '', it: '', aiHash: null, issues });
    }
    return res.status(200).json({ ok: true, en, it, aiHash: textHash(en), issues: [] });
  } catch (e) {
    if (String(e.message) === 'ai_failed') return res.status(502).json({ ok: false, error: 'ai_failed' });
    console.error('[wizard/describe]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
