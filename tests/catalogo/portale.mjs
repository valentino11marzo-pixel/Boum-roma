// tests/catalogo/portale.mjs — IL MODULO ANNUNCIO DEL PORTALE DICE I FATTI
// COME IL SITO, E NON RISCRIVE QUELLO CHE NON HA TOCCATO (suite
// `catalogoportale`).
//
// I DIFETTI (15/10/2026). Il sito leggeva già le camere con UNA regola
// (FACTS.bedroomsOf, js/listing-facts.js), ma il modulo annuncio del portale
// aveva regole sue e le applicava a OGNI salvataggio:
//  · precompilava `data.bedrooms || 1` e scriveva `parseInt(..) || 1`: un
//    monolocale (0) tornava 1, un valore ignoto diventava 1;
//  · non aveva un campo per l'arredo, che la macchina delle descrizioni dice
//    SOLO se dichiarato ('yes' | 'partial' | 'no');
//  · riscriveva `description` lasciando descriptionSource 'ai': una
//    correzione a mano restava «della macchina» e la rigenerazione dopo la
//    cancellava (nessuno dei 27 annunci del catalogo ha l'impronta
//    descriptionAiHash, quindi era l'unica difesa);
//  · la tabella annunci mostrava `l.beds || …`: il testo libero del bot
//    («3» sul bilocale di Via dei Cappellari) al posto delle camere;
//  · IL RISCHIO DEL RILASCIO: il salvataggio riscriveva TUTTI i campi con la
//    copia del modulo. Il portale resta aperto per ore: dopo l'«Applica» di
//    /catalogo (nomi nuovi, camere corrette) una scheda aperta prima, al
//    primo «Salva» di un annuncio — anche solo per il prezzo — riportava
//    nome, zona, tipo, letti, piano, tag, stato, disponibilità e copertina
//    alla copia vecchia;
//  · i valori entravano CRUDI negli attributi: una virgoletta nel nome
//    spezzava il campo, e un salvataggio avrebbe scritto il nome troncato.
//
// Qui il pezzo VERO del portale (gli helper, saveListing, getModal,
// setExistingImage, adminflatsPage estratti da js/portal-app.js — mai una
// copia) gira prima in Node con un modulo finto costruito DALL'HTML che
// getModal produce (con la «sanificazione» del browser e il campo nascosto
// che non ricorda il valore d'apertura) e un Firestore finto che fonde gli
// update; poi in un Chromium vero: DOM, entità, validazione nativa, il caso
// esatto del rischio, il caricamento dell'immagine e il wizard mobile M2 a
// 390px. Le due regole di macchina (regenVerdict di api/wizard/describe.js e
// machineWritten di js/catalogo-correzioni.js) giudicano il documento DOPO
// il salvataggio. Senza playwright la parte browser si salta (lo dice), la
// parte Node no.
//
// MUTAZIONI (verificate il 15/10/2026 su copie mutate, via BOOM_MUTANT_APP /
// BOOM_MUTANT_HTML; ognuna fa uscire la suite con 1):
//  · listingFactsFields con `value="${b || 1}"`; saveListing con
//    `bedrooms: parseInt(..) || 1`; ripiego di listingBedrooms con
//    `parseInt(v) || 1`;
//  · la guardia «solo se cambiato» tolta su UN campo (name, tags, …), su
//    tutti, sull'immagine, sulla disponibilità, o col campo assente che vale
//    «toccato»; il salvataggio senza cambiamenti che scrive updatedAt;
//  · data-orig tolto dal campo immagine (il caricamento si perderebbe);
//    la sanificazione dei numeri/del testo tolta da listingOpenedValue;
//  · arredo `|| 'no'`, select tolta, select senza `selected`, ripiego di
//    listingFurnished divergente da furnishedOf;
//  · descrizione: niente descriptionSource, firma anche a testo invariato,
//    descriptionOriginal nel patch, confronto con S.listings, textarea senza
//    esc();
//  · esc() tolto dal nome (o da un altro valore) del modulo di modifica;
//  · listingRoomsCell tornata a `l.beds || …`; portal.html senza
//    /js/listing-facts.js; badge «1-18 mesi».
//
// Esegui: node tests/catalogo/portale.mjs

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadChromium, launchOptions } from '../_browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const require = createRequire(import.meta.url);
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// le credenziali finte PRIMA di caricare describe.js (homie/_lib le legge
// al caricamento); nessuna rete in questa suite
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'k';
process.env.FIREBASE_ADMIN_EMAIL = process.env.FIREBASE_ADMIN_EMAIL || 'admin@test.boom';
process.env.FIREBASE_ADMIN_PASS = process.env.FIREBASE_ADMIN_PASS || 'x';
process.env.HOMIE_SECRET = process.env.HOMIE_SECRET || 'portale-secret';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';

const FACTS = require('../../js/listing-facts.js');
const DISPO = require('../../js/dispo-engine.js');
const CAT = require('../../js/catalogo-correzioni.js');
const DESCRIBE = await import('../../api/wizard/describe.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + String(detail).slice(0, 500) : '')); }
}
const J = (v) => JSON.stringify(v);
// uguaglianza profonda che non guarda l'ordine delle chiavi
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const same = (a, b) => J(sortKeys(a)) === J(sortKeys(b));
const diff = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => J(a?.[k]) !== J(b?.[k])).join(',');

// ── il catalogo vero ────────────────────────────────────────────────────
const FIX = JSON.parse(readFileSync(join(here, 'fixture-listings-2026-10-15.json'), 'utf8'));
const BY = Object.fromEntries(FIX.map(({ _id, ...rest }) => [_id, { id: _id, ...rest }]));
const CAPRI = 'wvX0h0lBoNKOMuTuHkVI';       // bedrooms 2, beds «Living , 1 bedroom with balcony , 1 bedroom…», zona «Conca d'Oro»
const CAPPELLARI = 'OLLVsiKhPrhpT1fx8XmB';  // bilocale: bedrooms 1, beds «3», descriptionSource 'ai'
const BARBERINI = 'XcAnljWiqqx2s7msgWUR';   // «Studio with Bath»: /catalogo scrive bedrooms 0
// Barberini come sarà DOPO la correzione di /catalogo (js/catalogo-correzioni.js
// porta fix: { bedrooms: 0 }); scritto qui per esteso, così la suite non
// dipende da come l'altro strumento formula le sue correzioni
const BARBERINI_FIXED = { ...BY[BARBERINI], bedrooms: 0 };
const ADMIN_EMAIL = 'admin@boomrome.com';

// IL CASO DEL RISCHIO: la copia che il portale ha in memoria (OLD) e il
// documento come lo lascia l'«Applica» di /catalogo mentre il modulo è
// aperto (nome nuovo dall'indirizzo, camere corrette) — più ogni altro campo
// che un altro scrittore (Photo Lab, macchina delle descrizioni, il bot)
// può aver cambiato nel frattempo: niente di tutto questo deve tornare
// indietro se l'operatore cambia SOLO il prezzo.
const OLD = { ...BY[BARBERINI] };
const CATALOGO = {
  ...OLD,
  name: 'Avignonesi Studio', nameOriginal: OLD.name, bedrooms: 0,
  address: 'Via degli Avignonesi 16', zone: 'Centro', type: 'Monolocale', beds: 'Monolocale con bagno',
  floor: '2', size: '65 m²', sqm: 66, tags: ['All inclusive', 'Ristrutturato'], features: ['AC', 'Lavatrice'],
  status: 'available', availableDate: '2026-11-01', availableFrom: '2026-11-01', availableKind: 'date',
  availablePrecision: 'day', availableRaw: '1 novembre', file: 'apartment-detail.html?id=' + BARBERINI,
  image: 'https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fenhanced%2Fcover.jpg?alt=media',
  furnished: 'yes', description: 'Testo nuovo della macchina.', descriptionSource: 'ai',
};
// valori che spezzavano un attributo crudo, in OGNI campo di testo
const NASTY = {
  id: 'nasty1', price: 1350, status: 'available',
  name: 'La "Perla" d\'Oro <b>x</b> & Co &copy;', type: 'Loft "chic" <i>', address: 'Via dell\'Orso 5 "A" & <b>',
  zone: 'Conca d\'Oro <Nord>', floor: '2° "nobile"', size: '65 m² & "terrazzo"', beds: '1 "matrimoniale" <b>',
  tags: ['a "b"', "c'd", '<e>'], features: ['x & y', '"z"'], file: 'apartment-detail.html?id=x&copy=1"',
  image: 'https://x.test/a.jpg?alt=media&copy=1&token="t"',
};

// ── il pezzo vero del portale ───────────────────────────────────────────
// BOOM_MUTANT_APP / BOOM_MUTANT_HTML: una COPIA mutata da leggere al posto
// del sorgente — così le mutazioni si provano senza toccare i file che
// altri stanno usando. Senza le due variabili si legge il repo, sempre.
const APP = process.env.BOOM_MUTANT_APP ? readFileSync(process.env.BOOM_MUTANT_APP, 'utf8') : src('js/portal-app.js');
const HTML = process.env.BOOM_MUTANT_HTML ? readFileSync(process.env.BOOM_MUTANT_HTML, 'utf8') : src('portal.html');
function between(a, b) {
  const i = APP.indexOf(a);
  const j = i < 0 ? -1 : APP.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error('blocco non trovato in portal-app.js: ' + a.trim() + ' … ' + b.trim());
  return APP.slice(i, j);
}
function braces(header) {
  const start = APP.indexOf(header);
  if (start < 0) throw new Error('funzione non trovata in portal-app.js: ' + header.trim());
  let i = APP.indexOf('{', start), depth = 0;
  for (; i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}') { depth--; if (!depth) return APP.slice(start, i + 1); }
  }
  throw new Error('graffe sbilanciate: ' + header.trim());
}
// helper + saveListing (tutto il blocco, costante LISTING_FURNISHED compresa)
const BLOCK = between('    function listingBedrooms(', '\n    function editListing(');
const MODALS = between('    function getModal(', '\n    function updateInvAmount(');
const EDIT_MODAL = MODALS.slice(MODALS.indexOf("        if (type === 'editListing')"));
const CODE = [
  braces('    function esc('),
  braces('    function jsq('),
  braces('    function setExistingImage('),
  between('    function adminflatsPage(', '\n    function listingBedrooms('),
  BLOCK,
  MODALS,
].join('\n');

const EXPORTS = 'return { esc, listingBedrooms, listingFurnished, LISTING_FURNISHED, listingOpenedValue, listingFieldTouched, ' +
  'listingDescriptionText, listingDescriptionPatch, listingFactsFields, listingRoomsCell, saveListing, getModal, adminflatsPage };';

class FakeFormData {
  constructor(form) { this.e = form.__fields.filter((f) => f.name).map((f) => [f.name, f.value]); }
  [Symbol.iterator]() { return this.e[Symbol.iterator](); }
}
// store: un Firestore finto che FONDE gli update nel documento, come il vero
function mount({ facts = true, listings = [], user = { email: ADMIN_EMAIL }, store = null } = {}) {
  const writes = [], toasts = [];
  const apply = (id, d) => { if (store) store.set(id, { ...(store.get(id) || {}), ...structuredClone(d) }); };
  const db = {
    collection: (c) => ({
      doc: (id) => ({ update: async (d) => { writes.push({ op: 'update', c, id, d }); apply(id, d); } }),
      add: async (d) => {
        writes.push({ op: 'add', c, d }); apply('nuovo1', d);
        return { id: 'nuovo1', update: async (x) => { writes.push({ op: 'update', c, id: 'nuovo1', d: x }); apply('nuovo1', x); } };
      },
    }),
  };
  const firebase = { firestore: { FieldValue: { serverTimestamp: () => '__ts__' } } };
  const win = facts ? { BOOM_FACTS: FACTS, BOOM_DISPO: DISPO } : { BOOM_DISPO: DISPO };
  const S = { listings, users: [], user };
  const fn = new Function('window', 'BOOM_FACTS', 'BOOM_DISPO', 'S', 'db', 'firebase', 'toast', 'logActivity', 'closeModal',
    'refresh', 'FormData', 'uploadingImage', 'listingImageUrl', 'openModal', 'document', CODE + '\n' + EXPORTS);
  const api = fn(win, facts ? FACTS : undefined, DISPO, S, db, firebase, (...a) => toasts.push(a), () => {}, () => {},
    async () => {}, FakeFormData, false, '', () => {}, undefined);
  return Object.assign(api, { writes, toasts, S });
}

// ── un modulo finto costruito dall'HTML VERO di getModal ────────────────
// Imita ciò che il browser fa e che conta qui: le entità si decodificano, il
// valore MOSTRATO è «sanificato» (un numero non valido diventa vuoto, gli a
// capo spariscono da una riga), e un <input type="hidden"> ha l'attributo
// che segue .value (quindi defaultValue NON ricorda l'apertura). Il browser
// vero, più sotto, verifica che l'imitazione sia giusta.
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&copy;': '©', '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|copy|nbsp);/g, (m) => ENT[m]);
const attrs = (s) => Object.fromEntries([...s.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)].map((m) => [m[1].toLowerCase(), m[2] === undefined ? '' : m[2]]));
const SANITIZE = {
  number: (v) => (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(v) ? v : ''),
  date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''),
  url: (v) => v.replace(/[\r\n]/g, '').trim(),
  text: (v) => v.replace(/[\r\n]/g, ''),
};
function formFromHtml(html) {
  const body = (html.match(/<form id="mForm"[\s\S]*?<\/form>/) || [''])[0];
  const fields = [];
  const own = (a) => ({ hasAttribute: (n) => Object.prototype.hasOwnProperty.call(a, n), getAttribute: (n) => (Object.prototype.hasOwnProperty.call(a, n) ? decode(a[n]) : null) });
  for (const m of body.matchAll(/<input\b([^>]*)>/g)) {
    const a = attrs(m[1]);
    const type = (a.type || 'text').toLowerCase();
    const raw = decode(a.value || '');
    fields.push({ tagName: 'INPUT', type, name: a.name || '', defaultValue: raw, value: (SANITIZE[type] || ((v) => v))(raw), attrs: a, ...own(a) });
  }
  for (const m of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const a = attrs(m[1]);
    const options = [...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((o) => {
      const oa = attrs(o[1]);
      return { value: decode(oa.value || ''), label: decode(o[2]), defaultSelected: 'selected' in oa };
    });
    const sel = options.find((o) => o.defaultSelected) || options[0];
    fields.push({ tagName: 'SELECT', name: a.name || '', options, value: sel ? sel.value : '', ...own(a) });
  }
  for (const m of body.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const a = attrs(m[1]);
    // come il parser HTML: CRLF → LF, entità decodificate, il PRIMO a capo
    // subito dopo <textarea> si scarta
    let t = decode(m[2].replace(/\r\n?/g, '\n'));
    if (t.startsWith('\n')) t = t.slice(1);
    fields.push({ tagName: 'TEXTAREA', name: a.name || '', defaultValue: t, value: t, ...own(a) });
  }
  const find = (name) => fields.find((f) => f.name === name) || null;
  const title = (html.match(/<h3 class="modal-title">([\s\S]*?)<\/h3>/) || [, ''])[1];
  return {
    __fields: fields, body, title,
    querySelector: (sel) => { const k = sel.match(/^\[name="([^"]+)"\]$/); return k ? find(k[1]) : null; },
    field: find,
    set(name, v) {
      const f = find(name);
      if (!f) throw new Error('campo assente nel modulo: ' + name);
      f.value = v;
      if (f.tagName === 'INPUT' && f.type === 'hidden') f.defaultValue = v; // l'attributo segue .value
      return this;
    },
  };
}
async function save(api, form) {
  const before = api.writes.length;
  await api.saveListing({ preventDefault() {}, target: form });
  return api.writes.slice(before);
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const keysOf = (w) => Object.keys(w?.d || {}).sort().join(',');
const AVAIL_KEYS = ['availabilityUpdatedAt', 'availabilityUpdatedBy', 'availableDate', 'availableFrom', 'availableKind', 'availablePrecision', 'availableRaw'];

// ═══ 1. le regole: camere e arredo, una copia sola ══════════════════════
console.log('\n▸ le regole: FACTS.bedroomsOf e FACTS.furnishedOf, anche nel ripiego');
{
  const withF = mount(), noF = mount({ facts: false });
  const INPUTS = [0, '0', 1, '1', ' 2 ', 3, 10, '10', 11, -1, '-1', 2.5, '2.5', '1.0', '', '  ', null, undefined, 'two', 'Studio', '3 BR', true, false, '0x5', NaN];
  const want = (v) => FACTS.bedroomsOf({ bedrooms: v });
  const bad = INPUTS.filter((v) => withF.listingBedrooms(v) !== want(v) || noF.listingBedrooms(v) !== want(v));
  check('listingBedrooms = bedroomsOf({bedrooms}) su ' + INPUTS.length + ' valori, con listing-facts.js E nel ripiego senza',
    bad.length === 0, bad.map((v) => J(v) + '→' + withF.listingBedrooms(v) + '/' + noF.listingBedrooms(v) + ' vs ' + want(v)).join(', '));
  check('0 resta 0 (monolocale), il vuoto è null, mai 1', withF.listingBedrooms(0) === 0 && withF.listingBedrooms('') === null && withF.listingBedrooms(undefined) === null);
  check('il testo libero `beds` non entra nel campo: un annuncio con solo beds «2 Bedrooms» non ha camere DICHIARATE',
    withF.listingBedrooms(undefined) === null && FACTS.bedroomsOf({ beds: '2 Bedrooms' }) === 2);
  const FURN = ['yes', 'YES ', 'no', ' No', 'partial', 'Partial', true, false, '', null, undefined, 'boh', 'si', 'furnished', 0, 1];
  const map = (f) => (f === true ? 'yes' : f === false ? 'no' : f === 'partial' ? 'partial' : '');
  const badF = FURN.filter((v) => withF.listingFurnished(v) !== map(FACTS.furnishedOf(v)) || noF.listingFurnished(v) !== map(FACTS.furnishedOf(v)));
  check('listingFurnished = furnishedOf riportato alle quattro scelte, con listing-facts.js E nel ripiego senza',
    badF.length === 0, badF.map((v) => J(v) + '→' + withF.listingFurnished(v) + '/' + noF.listingFurnished(v)).join(', '));
}

// ═══ 2. il modulo: cosa si precompila ═══════════════════════════════════
console.log('\n▸ il modulo: camere, arredo e descrizione precompilati come stanno davvero');
{
  const api = mount();
  const ed = (l) => formFromHtml(api.getModal('editListing', l));
  const fb = ed(BARBERINI_FIXED);
  check('Barberini dopo /catalogo (bedrooms 0): il campo mostra 0, non 1', fb.field('bedrooms')?.defaultValue === '0', fb.field('bedrooms')?.defaultValue);
  const fNone = ed({ id: 'x', name: 'Senza camere', price: 900, zone: 'Prati', beds: '2 Bedrooms' });
  check('camere mai dichiarate: il campo è vuoto (prima: 1) e il segnaposto dice il numero del testo «da confermare»',
    fNone.field('bedrooms')?.defaultValue === '' && /2 dal testo letti — da confermare/.test(fNone.field('bedrooms')?.attrs.placeholder || ''),
    J(fNone.field('bedrooms')?.attrs));
  const fBad = ed({ id: 'y', name: 'Camere strane', price: 900, zone: 'Prati', bedrooms: 'two' });
  check('camere salvate illeggibili: campo vuoto e nota che le nomina (mai un numero inventato)',
    fBad.field('bedrooms')?.defaultValue === '' && /Camere salvate non leggibili: «two»/.test(fBad.body));
  const fAdd = formFromHtml(api.getModal('addListing'));
  check('annuncio nuovo: camere vuote (prima il modulo partiva da 1), arredo «non dichiarato»',
    fAdd.field('bedrooms')?.defaultValue === '' && fAdd.field('furnished')?.value === '');
  const b = fb.field('bedrooms');
  check('il campo camere dichiara la regola al browser: intero 0–10', b && b.attrs.min === '0' && b.attrs.max === '10' && b.attrs.step === '1', J(b && b.attrs));

  const sel = fAdd.field('furnished');
  check('c\'è la select «Arredamento» con quattro scelte: non dichiarato · arredato · in parte · vuoto',
    sel && J(sel.options.map((o) => o.value)) === J(['', 'yes', 'partial', 'no']) && /<label class="form-label">Arredamento<\/label><select class="form-select" name="furnished">/.test(fAdd.body),
    J(sel && sel.options));
  const pre = (v) => ed({ id: 'f', name: 'F', price: 900, zone: 'Prati', furnished: v }).field('furnished').value;
  check('precompila il valore attuale: yes · " Partial " · no · true (forma vecchia) · assente',
    pre('yes') === 'yes' && pre(' Partial ') === 'partial' && pre('no') === 'no' && pre(true) === 'yes' && pre(undefined) === '',
    [pre('yes'), pre(' Partial '), pre('no'), pre(true), pre(undefined)].join(','));
  const fBoh = ed({ id: 'g', name: 'G', price: 900, zone: 'Prati', furnished: 'boh' });
  check('arredo salvato non riconosciuto: la select resta su «non dichiarato» e la nota lo nomina',
    fBoh.field('furnished').value === '' && /Arredamento salvato non riconosciuto: «boh»/.test(fBoh.body));

  const TRICKY = '\nBilocale «Avignonesi» — Tom & Jerry &copy; <b>forte</b> "virgolette" \'apostrofo\'\r\nseconda riga</textarea><script>window.__x=1</script>';
  const fd = ed({ id: 'd', name: 'D', price: 900, zone: 'Prati', description: TRICKY, descriptionSource: 'ai' });
  check('la descrizione nel textarea è ESATTAMENTE quella salvata: entità, «<b>», a capo iniziale, CRLF',
    fd.field('description')?.defaultValue === TRICKY.replace(/\r\n/g, '\n'), J(fd.field('description')?.defaultValue));
  check('nessun `</textarea>` del testo chiude il campo (il resto del modulo resta modulo)',
    (fd.body.match(/<\/textarea>/g) || []).length === 1 && !/<script>window\.__x/.test(fd.body));
  check('sotto la descrizione: chi l\'ha scritta e cosa succede se la cambi', /Scritta da: «ai»\. Se cambi il testo qui, la firma diventa la tua/.test(fd.body));
}

// ═══ 3. ogni valore nel modulo è quello salvato, virgolette comprese ════
console.log('\n▸ i valori nel modulo di modifica: escapati tutti, una virgoletta non spezza più niente');
{
  const api = mount({ listings: [NASTY] });
  const f = formFromHtml(api.getModal('editListing', NASTY));
  const expect = { ...NASTY, tags: NASTY.tags.join(', '), features: NASTY.features.join(', '), imageUrl: NASTY.image, price: String(NASTY.price) };
  const off = ['id', 'name', 'type', 'address', 'zone', 'price', 'floor', 'size', 'beds', 'tags', 'features', 'file', 'image', 'imageUrl']
    .filter((k) => f.field(k)?.defaultValue !== expect[k]);
  check('ogni campo si apre col valore salvato INTERO — " \' < & e «&copy;» compresi (nome, tipo, indirizzo, zona, piano, formato, letti, tag, feature, file, immagine)',
    off.length === 0, off.map((k) => k + ': ' + J(f.field(k)?.defaultValue) + ' ≠ ' + J(expect[k])).join(' | '));
  check('il titolo del modulo mostra il nome come testo (mai un <b> vero)', /<h3 class="modal-title">✏️ Modifica: La &quot;Perla&quot; d&#39;Oro &lt;b&gt;x&lt;\/b&gt; &amp; Co &amp;copy;<\/h3>/.test(f.body + api.getModal('editListing', NASTY)), f.title);
  let w = await save(api, f);
  check('aperto e salvato senza toccare: nessuna scrittura (mai un valore troncato)', w.length === 0, J(w));
  const g = formFromHtml(api.getModal('editListing', NASTY));
  w = await save(api, g.set('name', NASTY.name + ' 2'));
  check('il nome con le virgolette, cambiato, si scrive INTERO (prima: troncato alla prima ")', w[0]?.d.name === NASTY.name + ' 2' && keysOf(w[0]) === 'name,updatedAt', J(w[0]?.d));
  const h = formFromHtml(api.getModal('editListing', NASTY));
  w = await save(api, h.set('price', '1500'));
  check('cambiato solo il prezzo: nessuno dei valori con le virgolette viene riscritto', keysOf(w[0]) === 'price,updatedAt', keysOf(w[0]));
}

// ═══ 4. il salvataggio: si scrive solo ciò che l'operatore cambia ═══════
console.log('\n▸ il salvataggio: 0 resta 0, il vuoto non è 1, l\'arredo non dichiarato non è «no»');
{
  const api = mount({ listings: [BARBERINI_FIXED] });
  const open = (l) => formFromHtml(api.getModal('editListing', l));

  let w = await save(api, open(BARBERINI_FIXED));
  check('Barberini aperto e salvato senza cambiamenti: NESSUNA scrittura (nemmeno updatedAt), e lo dice',
    w.length === 0 && api.toasts.some((t) => t[0] === 'info' && /Nessuna modifica/.test(t[1])), J({ w, t: api.toasts.slice(-1) }));
  w = await save(api, open({ ...BY[BARBERINI] }).set('price', '1400'));
  check('modulo aperto sulla copia vecchia (1 camera) e salvato per il prezzo: si scrive SOLO il prezzo',
    keysOf(w[0]) === 'price,updatedAt' && w[0].d.price === 1400, keysOf(w[0]));

  w = await save(api, open(BARBERINI_FIXED).set('bedrooms', '2'));
  check('camere cambiate a 2 → bedrooms 2 (numero)', w[0]?.d.bedrooms === 2 && keysOf(w[0]) === 'bedrooms,updatedAt', J(w[0]?.d));
  w = await save(api, open(BY[CAPPELLARI]).set('bedrooms', ''));
  check('camere svuotate apposta (c\'era 1) → bedrooms null, «non dichiarato» — mai 1', has(w[0]?.d, 'bedrooms') && w[0].d.bedrooms === null, J(w[0]?.d.bedrooms));
  w = await save(api, open(BARBERINI_FIXED).set('bedrooms', '0'));
  check('riscritto 0 su 0: non è un cambiamento, non si scrive niente', w.length === 0);
  w = await save(api, open({ id: 'n1', name: 'Mai dichiarate', price: 800, zone: 'Prati', beds: '2 Bedrooms' }));
  check('camere mai dichiarate, campo lasciato vuoto: non si scrive niente (il testo resta testo)', w.length === 0, J(w));
  w = await save(api, open({ id: 'n2', name: 'Strane', price: 800, zone: 'Prati', bedrooms: 'two' }));
  check('camere illeggibili, campo lasciato vuoto: il valore salvato non si cancella di nascosto', w.length === 0);

  w = await save(api, open({ ...BY[CAPRI] }).set('furnished', 'partial'));
  check('arredo da non dichiarato a «in parte» → furnished \'partial\'', w[0]?.d.furnished === 'partial', J(w[0]?.d.furnished));
  w = await save(api, open({ ...BY[CAPPELLARI] }).set('furnished', ''));
  check('arredo da «yes» a non dichiarato → furnished \'\' (MAI \'no\')', has(w[0]?.d, 'furnished') && w[0].d.furnished === '', J(w[0]?.d.furnished));
  w = await save(api, open({ id: 'b1', name: 'Boh', price: 800, zone: 'Prati', furnished: 'boh' }));
  check('arredo illeggibile e select non toccata: il valore salvato resta', w.length === 0);
  w = await save(api, open({ id: 'b2', name: 'Vero', price: 800, zone: 'Prati', furnished: true }));
  check('arredo booleano vecchio e select non toccata: resta com\'è', w.length === 0);
  // un modulo di modifica che NON ha la gran parte dei campi (un modale
  // futuro, un modulo ridotto): ciò che non c'è non si scrive — mai null, mai ''
  const ridotto = formFromHtml('<form id="mForm"><input type="hidden" name="id" value="' + CAPPELLARI + '"><input name="name" value="Cappellari Flat"><input type="number" name="price" value="1200"><input name="zone" value="Centro"></form>');
  w = await save(mount({ listings: [BY[CAPPELLARI]] }), ridotto.set('price', '1250'));
  check('modulo ridotto, cambiato il prezzo: si scrive SOLO il prezzo (niente camere, arredo, descrizione, immagine, disponibilità)',
    keysOf(w[0]) === 'price,updatedAt', keysOf(w[0]));

  const fresh = formFromHtml(api.getModal('addListing'));
  fresh.set('name', 'Casa Nuova').set('price', '1100').set('zone', 'Monti');
  w = await save(api, fresh);
  let d = w.find((x) => x.op === 'add')?.d || {};
  check('annuncio nuovo senza camere né arredo: bedrooms null (non 1), furnished \'\' (non \'no\')',
    has(d, 'bedrooms') && d.bedrooms === null && has(d, 'furnished') && d.furnished === '', J({ b: d.bedrooms, f: d.furnished }));
  check('…l\'annuncio NUOVO nasce con tutti i campi (nome, zona, prezzo, tipo, stato, disponibilità, immagine, file, tag, descrizione)',
    ['name', 'address', 'zone', 'price', 'type', 'beds', 'size', 'sqm', 'floor', 'image', 'tags', 'features', 'status', 'file', 'description', 'updatedAt', 'createdAt', ...AVAIL_KEYS].every((k) => has(d, k)),
    Object.keys(d).join(','));
  check('…descrizione vuota senza firma (non c\'è niente da firmare)', d.description === '' && !has(d, 'descriptionSource'));
  const fresh0 = formFromHtml(api.getModal('addListing'));
  fresh0.set('name', 'Monolocale Nuovo').set('price', '700').set('zone', 'Monti').set('bedrooms', '0').set('furnished', 'yes').set('description', 'Monolocale luminoso.');
  w = await save(api, fresh0);
  d = w.find((x) => x.op === 'add')?.d || {};
  check('annuncio nuovo monolocale arredato con testo: bedrooms 0, furnished \'yes\', descrizione firmata portal:',
    d.bedrooms === 0 && d.furnished === 'yes' && d.description === 'Monolocale luminoso.' && d.descriptionSource === 'portal:' + ADMIN_EMAIL, J(d));
}

// ═══ 5. IL RISCHIO DEL RILASCIO: il modulo vecchio non riporta indietro ══
console.log('\n▸ il modulo aperto prima dell\'«Applica» di /catalogo: cambia il prezzo, il resto resta quello nuovo');
{
  const store = new Map([[BARBERINI, structuredClone(OLD)]]);
  const api = mount({ listings: [structuredClone(OLD)], store });
  const form = formFromHtml(api.getModal('editListing', OLD));      // il portale apre la copia che ha
  store.set(BARBERINI, structuredClone(CATALOGO));                    // …intanto /catalogo «Applica»
  let w = await save(api, form.set('price', '1400'));                // …e l'operatore cambia SOLO il prezzo
  const doc = store.get(BARBERINI);
  check('nel documento restano il nome NUOVO e le camere corrette (0): non tornano «Barberini Gem» e 1',
    doc.name === 'Avignonesi Studio' && doc.bedrooms === 0 && doc.nameOriginal === 'Barberini Gem', J({ name: doc.name, bedrooms: doc.bedrooms }));
  check('…ed è ESATTAMENTE il documento di /catalogo col prezzo nuovo (zona, tipo, letti, piano, tag, feature, stato, disponibilità, copertina, file, arredo, descrizione intatti)',
    same(doc, { ...CATALOGO, price: 1400, updatedAt: '__ts__' }), diff(doc, { ...CATALOGO, price: 1400, updatedAt: '__ts__' }));
  check('…e il patch spedito è solo { price, updatedAt }', keysOf(w[0]) === 'price,updatedAt', keysOf(w[0]));

  // ogni campo, uno alla volta: cambiato da solo, si scrive da solo (i
  // derivati — tag/feature dal testo, disponibilità dal motore, immagine
  // dalle sue tre sorgenti — solo quando cambia una loro sorgente)
  const ONE = [
    ['name', 'Nome cambiato', 'name'], ['type', 'Attico', 'type'], ['address', 'Via Nuova 1', 'address'], ['zone', 'Monti', 'zone'],
    ['price', '1500', 'price'], ['status', 'waitlist', 'status'], ['beds', '1 matrimoniale', 'beds'], ['bedrooms', '3', 'bedrooms'],
    ['furnished', 'partial', 'furnished'], ['sqm', '70', 'sqm'], ['size', '70 m²', 'size'], ['floor', '3', 'floor'],
    ['tags', 'Uno, Due', 'tags'], ['features', 'AC, Wi-Fi', 'features'], ['file', 'apartment_nuovo.html', 'file'],
    ['availableFromDate', '2027-02-01', AVAIL_KEYS.join(',')], ['availableMode', 'now', AVAIL_KEYS.join(',')],
    ['description', 'Testo scritto a mano.', 'description,descriptionAt,descriptionSource'],
  ];
  const stuck = [];
  for (const [name, value, keys] of ONE) {
    const a = mount({ listings: [structuredClone(OLD)] });
    const ww = await save(a, formFromHtml(a.getModal('editListing', OLD)).set(name, value));
    const got = keysOf(ww[0]).split(',').filter((k) => k !== 'updatedAt').join(',');
    if (got !== keys.split(',').sort().join(',')) stuck.push(name + ' → ' + (got || 'niente'));
  }
  check('ognuno dei ' + ONE.length + ' campi del modulo, cambiato da solo, si scrive da solo (coi suoi derivati e nient\'altro)', stuck.length === 0, stuck.join(' | '));
  const t = mount({ listings: [structuredClone(OLD)] });
  w = await save(t, formFromHtml(t.getModal('editListing', OLD)).set('tags', ' Uno ,, Due '));
  check('i tag cambiati si scrivono come elenco pulito', J(w[0]?.d.tags) === J(['Uno', 'Due']), J(w[0]?.d.tags));

  // la copertina: il campo nascosto non ricorda l'apertura (l'attributo
  // segue .value), conta data-orig
  const NEW_IMG = 'https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fnuova.jpg?alt=media';
  const im = mount({ listings: [structuredClone(OLD)] });
  w = await save(im, formFromHtml(im.getModal('editListing', OLD)).set('image', NEW_IMG));
  check('immagine caricata (il campo nascosto prende l\'URL nuovo): si scrive SOLO image', keysOf(w[0]) === 'image,updatedAt' && w[0].d.image === NEW_IMG, J(w[0]?.d));

  // ciò che il browser MOSTRA diverso dall'attributo non conta come cambiato
  const lo = mount().listingOpenedValue;
  const inp = (type, value, extra = {}) => ({ tagName: 'INPUT', type, defaultValue: value, hasAttribute: (n) => n in extra, getAttribute: (n) => extra[n] ?? null });
  const SAN_CASES = [
    [inp('number', '65 mq'), ''], [inp('number', '1.5'), '1.5'], [inp('number', '1,5'), ''], [inp('number', ' 7'), ''], [inp('number', '.5'), '.5'], [inp('number', '5.'), ''],
    [inp('date', '2026-02-30'), ''], [inp('date', '2026-02-28'), '2026-02-28'], [inp('url', ' https://x.test/a \n'), 'https://x.test/a'],
    [inp('text', 'a\nb\r\nc'), 'abc'], [inp('hidden', 'a\nb'), 'a\nb'], [inp('hidden', 'nuovo', { 'data-orig': 'vecchio' }), 'vecchio'],
  ];
  const sanOff = SAN_CASES.filter(([el, want]) => lo(el, null) !== want);
  check('listingOpenedValue: il valore d\'apertura è quello MOSTRATO (numero non valido → vuoto, data impossibile → vuota, a capo tolti) e data-orig vince',
    sanOff.length === 0, sanOff.map(([el, want]) => el.type + ':' + J(el.defaultValue) + ' → ' + J(lo(el, null)) + ' (atteso ' + J(want) + ')').join(' | '));
  const odd = { id: 'odd1', name: 'Strano', price: 900, zone: 'Prati', sqm: '65 mq', beds: 'uno\ndue', file: 'a\nb.html', status: 'draft' };
  const o = mount({ listings: [odd] });
  w = await save(o, formFromHtml(o.getModal('editListing', odd)).set('zone', 'Monti'));
  check('superficie «65 mq» (il campo numero la mostra vuota), letti e file con un a capo, stato «draft» fuori elenco: cambiata la zona, si scrive SOLO la zona',
    keysOf(w[0]) === 'updatedAt,zone', keysOf(w[0]));
  w = await save(o, formFromHtml(o.getModal('editListing', odd)));
  check('…e aperto e salvato così: nessuna scrittura (prima lo stato «draft» diventava «available», cioè pubblicato)', w.length === 0, J(w));
}

// ═══ 6. la descrizione: chi l'ha scritta ════════════════════════════════
console.log('\n▸ la descrizione: corretta a mano = firmata, invariata = non toccata');
{
  const cap = { ...BY[CAPPELLARI], descriptionOriginal: 'LE PAROLE DEL FONDATORE' };
  const api = mount({ listings: [cap] });
  const open = (l) => formFromHtml(api.getModal('editListing', l));
  const CORRETTA = 'Bilocale luminoso in Via dei Cappellari, una camera, scritto dall\'assistente dopo il giro.';
  const t0 = Date.now();
  let w = await save(api, open(cap).set('description', CORRETTA));
  let d = w[0]?.d || {};
  check('testo cambiato → descriptionSource \'portal:<email dell\'admin>\'', d.descriptionSource === 'portal:' + ADMIN_EMAIL, J(d.descriptionSource));
  const at = Date.parse(d.descriptionAt || '');
  check('…descriptionAt è l\'ora del salvataggio, in ISO', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(d.descriptionAt || '') && at >= t0 - 1000 && at <= Date.now() + 1000, d.descriptionAt);
  check('…il testo nuovo è scritto, descriptionOriginal NON si tocca', d.description === CORRETTA && !has(d, 'descriptionOriginal'), Object.keys(d).join(','));
  const after = { ...cap, ...d };
  const v = DESCRIBE.regenVerdict(after);
  check('dopo il salvataggio la rigenerazione la SALTA (regenVerdict: not_machine) — prima: machine, cioè riscritta',
    v.ok === false && v.reason === 'not_machine', J(v));
  check('…e /catalogo non la conta più «della macchina» (machineWritten falso)', CAT.machineWritten(after) === false);
  check('controllo: lo stesso testo marcato «ai» senza impronta SAREBBE rigenerato (la difesa era solo la firma)',
    DESCRIBE.regenVerdict({ ...after, descriptionSource: 'ai' }).ok === true);

  w = await save(api, open(cap));
  check('testo non toccato (e niente altro): nessuna scrittura, la firma resta \'ai\'', w.length === 0, J(w));
  w = await save(api, open(cap).set('description', cap.description + '\n\n'));
  d = w[0]?.d || {};
  check('cambiano solo spazi e a capo → il testo si scrive, la firma resta della macchina', has(d, 'description') && !has(d, 'descriptionSource'), Object.keys(d).join(','));
  w = await save(api, open(cap).set('description', ''));
  d = w[0]?.d || {};
  check('testo svuotato a mano → è un cambiamento: firmato portal: (lo riempirà lo sweep, come ogni testo vuoto)',
    d.description === '' && d.descriptionSource === 'portal:' + ADMIN_EMAIL, J(d));

  // il modulo vecchio: aperto sul testo di prima, intanto la macchina ha
  // riscritto (S.listings è già fresco) — salvare per il prezzo non ricopre
  const machineNow = { ...cap, description: 'Testo NUOVO della macchina.' };
  const api2 = mount({ listings: [machineNow] });
  w = await save(api2, formFromHtml(api2.getModal('editListing', cap)).set('price', '1300'));
  check('modulo aperto sul testo di prima e non toccato, la macchina ha riscritto intanto: la descrizione nuova non si ricopre',
    keysOf(w[0]) === 'price,updatedAt', keysOf(w[0]));

  const p = api.listingDescriptionPatch('a b', 'a  b\r\n', 'x@y', '2026-10-15T10:00:00.000Z');
  check('listingDescriptionPatch: forma sola → solo il testo; uguale → niente; diverso → testo+firma+ora',
    J(p) === J({ description: 'a  b\n' }) && J(api.listingDescriptionPatch('x', 'x', 'e', 't')) === '{}'
    && J(api.listingDescriptionPatch('x', 'y', 'e', 't')) === J({ description: 'y', descriptionSource: 'portal:e', descriptionAt: 't' }), J(p));
}

// ═══ 7. la tabella annunci ══════════════════════════════════════════════
console.log('\n▸ la tabella annunci: le camere della regola, il testo letti solo accanto');
{
  const api = mount();
  const num = (cell) => { const m = String(cell).match(/^(monolocale|—|\d+ cam)/); return !m ? undefined : m[1] === 'monolocale' ? 0 : m[1] === '—' ? null : parseInt(m[1], 10); };
  const off = FIX.filter((l) => num(api.listingRoomsCell(l)) !== FACTS.bedroomsOf(l));
  check('su tutti i ' + FIX.length + ' annunci del catalogo il numero in tabella è bedroomsOf (quello che legge il cliente)',
    off.length === 0, off.map((l) => l._id + ': ' + api.listingRoomsCell(l)).join(' | '));
  const cap = api.listingRoomsCell(BY[CAPPELLARI]);
  check('Cappellari: «1 cam», e il «3» del testo libero resta visibile accanto, in piccolo', /^1 cam <span[^>]*>· letti «3»<\/span>$/.test(cap), cap);
  const capri = api.listingRoomsCell(BY[CAPRI]);
  check('Capri: «2 cam» (prima la tabella mostrava il testo lungo del bot)', /^2 cam /.test(capri) && /title="Living , 1 bedroom with balcony/.test(capri), capri);
  check('Barberini dopo /catalogo: «monolocale»', /^monolocale /.test(api.listingRoomsCell(BARBERINI_FIXED)), api.listingRoomsCell(BARBERINI_FIXED));
  check('bilocale con beds 1 e bedrooms 1: nessun doppione accanto', api.listingRoomsCell(BY['5QAKCvswE3HN9nuuG82S']) === '1 cam');
  check('il testo libero è escapato', !/<img/.test(api.listingRoomsCell({ bedrooms: 1, beds: '<img src=x onerror=alert(1)>' })));
  const noF = mount({ facts: false });
  check('senza listing-facts.js la cella mostra il campo strutturato (mai il testo come numero)', noF.listingRoomsCell(BY[CAPPELLARI]).startsWith('1 cam') && noF.listingRoomsCell({ beds: '3' }).startsWith('—'));

  const page = mount({ listings: FIX.map((l) => BY[l._id]) }).adminflatsPage();
  check('la pagina AdminFlats si disegna col catalogo vero e usa la cella nuova', /🏢 AdminFlats/.test(page) && /1 cam <span[^>]*>· letti «3»/.test(page) && !/>3 · /.test(page));
}

// ═══ 8. le giunzioni ════════════════════════════════════════════════════
console.log('\n▸ le giunzioni: lo script caricato prima, nessuna regola vecchia rimasta, il badge');
{
  const iFacts = HTML.indexOf('<script src="/js/listing-facts.js"></script>');
  const iApp = HTML.indexOf('<script src="/js/portal-app.js"></script>');
  check('portal.html carica /js/listing-facts.js PRIMA di portal-app.js', iFacts > -1 && iApp > iFacts, iFacts + ' / ' + iApp);
  check('nessuna `bedrooms || 1` / `parseInt(data.bedrooms) || 1` nel modulo annuncio',
    !/data\.bedrooms \|\| 1|parseInt\(data\.bedrooms\) \|\| 1/.test(BLOCK + MODALS));
  const raw = [...EDIT_MODAL.slice(0, EDIT_MODAL.indexOf('\n        return \'\';') > 0 ? EDIT_MODAL.indexOf('\n        return \'\';') : undefined)
    .matchAll(/value="\$\{([^}]*)\}"/g)].map((m) => m[1]).filter((e) => !/^esc\(/.test(e) && !/^b === null/.test(e));
  check('nel modulo di modifica nessun value="${…}" interpolato senza esc()', raw.length === 0, raw.join(' | '));
  check('il campo immagine nascosto porta data-orig (il suo defaultValue segue .value)', /name="image" id="listingImageUrl" value="\$\{esc\(data\.image\)\}" data-orig="\$\{esc\(data\.image\)\}"/.test(EDIT_MODAL));
  check('la tabella usa listingRoomsCell (non più `l.beds || …`)',
    /\$\{listingRoomsCell\(l\)\}/.test(APP) && !/\$\{l\.beds \|\| \(l\.bedrooms/.test(APP));
  check('i due modali usano gli stessi campi (listingFactsFields)', /\$\{listingFactsFields\(\{\}\)\}/.test(APP) && /\$\{listingFactsFields\(data\)\}/.test(APP));
  check('badge Locazione Transitoria: «3-18 mesi (legge 1-18)» — con BOOM minimo 3 mesi',
    /⏱️ Locazione Transitoria<\/span>\s*<span class="badge gray"[^>]*>3-18 mesi \(legge 1-18\)<\/span>/.test(APP) && !/>1-18 mesi</.test(APP));
  check('il nav-item «Catalogo» resta (pacchetto parallelo)', /onclick="window\.open\('\/catalogo','_blank'\)"/.test(APP));
}

// ═══ 9. nel browser vero ════════════════════════════════════════════════
console.log('\n▸ nel browser vero: DOM, validazione nativa, il caso del rischio, wizard mobile a 390px');
const chromium = await loadChromium();
if (!chromium) {
  console.log('  (playwright assente: i controlli in Chromium sono saltati — la parte Node sopra resta)');
} else {
  const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
  const page = (facts, mobile) => `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/portal-mobile.css">
</head><body>
<div class="app active" id="app"><div class="layout">
<aside class="sidebar" id="sidebar"><div class="nav-section"><div class="nav-item active" onclick="goTo('listings')"><span class="nav-icon">🏢</span> AdminFlats</div><div class="nav-item" onclick="goTo('leads')"><span class="nav-icon">📬</span> Lead</div></div></aside>
<main class="main" id="main"></main></div></div>
<div class="toast-container" id="toasts"></div><div id="modals"></div>
${facts ? '<script src="/js/listing-facts.js"></script>' : ''}
<script src="/js/dispo-engine.js"></script>
<script>
window.__writes = []; window.__toasts = []; window.__store = {};
var S = { listings: [], users: [], user: { email: '${ADMIN_EMAIL}' } };
var uploadingImage = false, listingImageUrl = '';
var firebase = { firestore: { FieldValue: { serverTimestamp: function () { return '__ts__'; } } } };
function cap(op, c, id, d) {
  var clean = JSON.parse(JSON.stringify(d));
  __writes.push({ op: op, c: c, id: id, keys: Object.keys(d), d: clean });
  if (id) __store[id] = Object.assign({}, __store[id] || {}, clean);
}
var db = { collection: function (c) { return {
  doc: function (id) { return { update: async function (d) { cap('update', c, id, d); } }; },
  add: async function (d) { cap('add', c, null, d); return { id: 'nuovo1', update: async function (x) { cap('update', c, 'nuovo1', x); } }; } }; } };
function toast() { __toasts.push([].slice.call(arguments)); }
function logActivity() {}
function closeModal() { document.getElementById('modals').innerHTML = ''; }
async function refresh() {}
function goTo() {}
// come il vero openModal: il modale, poi l'immagine esistente nel campo nascosto
function openModal(t, d) {
  listingImageUrl = '';
  document.getElementById('modals').innerHTML = getModal(t, d);
  var o = document.querySelector('.modal-overlay'); if (o) o.classList.add('active');
  if (t === 'editListing' && d && d.image) setExistingImage(d.image);
}
</script>
<script src="/__portale.js"></script>
${mobile ? '<script src="/js/portal-mobile.js"></script>' : ''}
</body></html>`;
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(u.searchParams.get('facts') !== '0', u.searchParams.get('m') === '1')); return; }
    if (u.pathname === '/__portale.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(CODE); return; }
    if (/^\/(css|js)\/[\w.-]+\.(css|js)$/.test(u.pathname)) {
      try { const b = readFileSync(join(ROOT, u.pathname)); res.writeHead(200, { 'content-type': TYPES[extname(u.pathname)] + '; charset=utf-8' }); res.end(b); }
      catch { res.writeHead(404); res.end(); }
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(launchOptions());
  try {
    const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    desk.on('pageerror', (e) => errors.push(String(e)));
    await desk.goto(base + '/?facts=1');
    const TRICKY = '\nBilocale «Avignonesi» — Tom & Jerry &copy; <b>forte</b> "q" \'a\'\r\nseconda riga';
    const BARB = { ...BARBERINI_FIXED, description: TRICKY, descriptionSource: 'ai' };
    const openEdit = (l) => desk.evaluate((l) => { window.__writes = []; window.__toasts = []; openModal('editListing', l); }, l);
    const submit = async () => {
      await desk.evaluate(() => document.getElementById('mForm').requestSubmit());
      await desk.waitForTimeout(80);
      return desk.evaluate(() => window.__writes);
    };
    const val = (name) => desk.evaluate((n) => document.querySelector('#mForm [name="' + n + '"]').value, name);
    const kk = (w) => (w?.keys || []).slice().sort().join(',');

    await openEdit(BARB);
    check('[browser] Barberini (0): il campo camere mostra «0», la select arredo «non dichiarato»', (await val('bedrooms')) === '0' && (await val('furnished')) === '', await val('bedrooms'));
    check('[browser] la descrizione nel textarea è identica a quella salvata (CRLF a parte): &copy;, <b>, a capo iniziale',
      (await val('description')) === TRICKY.replace(/\r\n/g, '\n'), J(await val('description')));
    let w = await submit();
    const t0 = await desk.evaluate(() => window.__toasts);
    check('[browser] aperto e salvato senza cambiamenti: NESSUNA scrittura, e un avviso «Nessuna modifica»',
      w.length === 0 && t0.some((t) => t[0] === 'info' && /Nessuna modifica/.test(t[1])), J({ w, t0 }));

    await openEdit(BARB);
    await desk.fill('#mForm [name="bedrooms"]', '2');
    await desk.selectOption('#mForm [name="furnished"]', 'partial');
    await desk.fill('#mForm [name="description"]', 'Monolocale rifatto, testo dell\'assistente.');
    w = await submit();
    const d = w[0]?.d || {};
    check('[browser] camere 2, arredo «in parte», testo nuovo: il patch è SOLO quei campi (+ firma e ora)',
      kk(w[0]) === 'bedrooms,description,descriptionAt,descriptionSource,furnished,updatedAt' && d.bedrooms === 2 && d.furnished === 'partial', kk(w[0]));
    check('[browser] testo cambiato → descriptionSource portal:' + ADMIN_EMAIL + ' e descriptionAt ISO, descriptionOriginal intatto',
      d.descriptionSource === 'portal:' + ADMIN_EMAIL && /^\d{4}-\d{2}-\d{2}T/.test(d.descriptionAt || '') && !w[0].keys.includes('descriptionOriginal'), J(d));

    await openEdit({ ...BY[CAPPELLARI] });
    await desk.fill('#mForm [name="bedrooms"]', '');
    await desk.selectOption('#mForm [name="furnished"]', '');
    w = await submit();
    check('[browser] camere svuotate → null; arredo da «yes» a non dichiarato → \'\' (mai \'no\')',
      w[0]?.keys.includes('bedrooms') && w[0].d.bedrooms === null && w[0].d.furnished === '', J(w[0]?.d && { b: w[0].d.bedrooms, f: w[0].d.furnished }));

    await openEdit({ ...BY[CAPPELLARI] });
    await desk.evaluate(() => { const t = document.querySelector('#mForm [name="description"]'); t.value = t.value + '   \n'; });
    w = await submit();
    check('[browser] solo spazi in più: il testo si scrive, la firma resta della macchina', kk(w[0]) === 'description,updatedAt', kk(w[0]));

    for (const bad of ['11', '2.5', '-1']) {
      await openEdit({ ...BY[CAPPELLARI] });
      await desk.fill('#mForm [name="bedrooms"]', bad);
      w = await submit();
      check('[browser] camere «' + bad + '»: il browser ferma il salvataggio (intero 0–10), nessuna scrittura', w.length === 0, J(w));
    }

    // IL CASO DEL RISCHIO, nel DOM vero
    await desk.evaluate(({ old, cat, id }) => {
      window.__writes = []; window.__store = {};
      window.__store[id] = JSON.parse(JSON.stringify(old));
      openModal('editListing', old);                          // la copia del portale
      window.__store[id] = JSON.parse(JSON.stringify(cat));   // …intanto /catalogo «Applica»
    }, { old: OLD, cat: CATALOGO, id: BARBERINI });
    await desk.fill('#mForm [name="price"]', '1400');
    w = await submit();
    const doc = await desk.evaluate((id) => window.__store[id], BARBERINI);
    check('[browser] modulo aperto prima di /catalogo, cambiato SOLO il prezzo: nome nuovo e camere corrette restano, il documento è quello di /catalogo + prezzo',
      doc.name === 'Avignonesi Studio' && doc.bedrooms === 0 && same(doc, { ...CATALOGO, price: 1400, updatedAt: '__ts__' }) && kk(w[0]) === 'price,updatedAt',
      diff(doc, { ...CATALOGO, price: 1400, updatedAt: '__ts__' }) + ' · ' + kk(w[0]));

    // la copertina caricata: come handleImageSelect, URL nel campo nascosto
    const NEW_IMG = 'https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fnuova.jpg?alt=media';
    await openEdit({ ...OLD });
    await desk.evaluate((u) => { listingImageUrl = u; document.getElementById('listingImageUrl').value = u; }, NEW_IMG);
    w = await submit();
    check('[browser] immagine caricata: si scrive SOLO image (il campo nascosto non ricorda l\'apertura: vale data-orig)',
      kk(w[0]) === 'image,updatedAt' && w[0].d.image === NEW_IMG, J(w[0]?.d));

    // ciò che il browser MOSTRA diverso dall'attributo: la regola di
    // listingOpenedValue confrontata con input VERI, caso per caso
    const CASES = [['number', '65 mq'], ['number', '1.5'], ['number', '1,5'], ['number', '-3'], ['number', '.5'], ['number', '5.'], ['number', '1e3'], ['number', ' 7'],
      ['date', '2026-02-30'], ['date', '2026-02-28'], ['date', '2026-2-1'], ['url', ' https://x.test/a \n'], ['email', ' a@b.c '], ['text', 'a\nb\r\nc'], ['text', '  spazi  ']];
    const mism = await desk.evaluate((cases) => cases.map(([t, v]) => {
      const el = document.createElement('input'); el.type = t; el.setAttribute('value', v);
      return [t, v, el.value, listingOpenedValue(el, null)];
    }).filter((r) => r[2] !== r[3]), CASES);
    check('[browser] listingOpenedValue dà ciò che il browser MOSTRA su numeri, date, url, email e testo (' + CASES.length + ' casi)',
      mism.length === 0, mism.map((r) => r[0] + ':' + J(r[1]) + ' browser=' + J(r[2]) + ' funzione=' + J(r[3])).join(' | '));
    await openEdit({ id: 'odd1', name: 'Strano', price: 900, zone: 'Prati', sqm: '65 mq', beds: 'uno\ndue', file: 'a\nb.html', status: 'draft' });
    check('[browser] il browser mostra «65 mq» come vuoto e toglie gli a capo (l\'imitazione Node è giusta)',
      (await val('sqm')) === '' && (await val('beds')) === 'unodue' && (await val('file')) === 'ab.html' && (await val('status')) === 'available');
    await desk.fill('#mForm [name="zone"]', 'Monti');
    w = await submit();
    check('[browser] …cambiata la zona, si scrive SOLO la zona (superficie, letti, file e stato «draft» restano)', kk(w[0]) === 'updatedAt,zone', kk(w[0]));

    // ogni valore con le virgolette, nel DOM vero
    await openEdit(NASTY);
    const shown = await desk.evaluate(() => Object.fromEntries(['name', 'type', 'address', 'zone', 'floor', 'size', 'beds', 'tags', 'features', 'file', 'image', 'imageUrl']
      .map((n) => [n, document.querySelector('#mForm [name="' + n + '"]').value])));
    const want = { name: NASTY.name, type: NASTY.type, address: NASTY.address, zone: NASTY.zone, floor: NASTY.floor, size: NASTY.size, beds: NASTY.beds,
      tags: NASTY.tags.join(', '), features: NASTY.features.join(', '), file: NASTY.file, image: NASTY.image, imageUrl: NASTY.image };
    check('[browser] ogni campo mostra il valore INTERO, virgolette e «&copy;» compresi', same(shown, want), diff(shown, want));
    const titleTxt = await desk.evaluate(() => { const h = document.querySelector('.modal-title'); return { t: h.textContent, tags: h.querySelectorAll('*').length }; });
    check('[browser] il titolo è testo: nessun elemento iniettato dal nome', titleTxt.t === '✏️ Modifica: ' + NASTY.name && titleTxt.tags === 0, J(titleTxt));
    w = await submit();
    check('[browser] …e salvato così: nessuna scrittura', w.length === 0, J(w));

    await desk.evaluate(() => { window.__writes = []; openModal('addListing'); });
    await desk.fill('#mForm [name="name"]', 'Casa Nuova');
    await desk.fill('#mForm [name="zone"]', 'Monti');
    await desk.fill('#mForm [name="price"]', '1100');
    w = await submit();
    const add = w.find((x) => x.op === 'add');
    check('[browser] annuncio nuovo lasciato vuoto: bedrooms null, furnished \'\', descrizione senza firma — e tutti i campi scritti',
      add && add.d.bedrooms === null && add.keys.includes('bedrooms') && add.d.furnished === '' && add.d.description === '' && !add.keys.includes('descriptionSource')
      && ['name', 'zone', 'price', 'type', 'status', 'image', 'tags', 'file', 'availableKind'].every((k) => add.keys.includes(k)),
      J(add && add.keys));
    check('[browser] nessun errore di pagina sul desktop', errors.length === 0, errors.join(' | '));
    await desk.close();

    // senza listing-facts.js: il ripiego tiene, il portale non si rompe
    const bare = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const e2 = [];
    bare.on('pageerror', (e) => e2.push(String(e)));
    await bare.goto(base + '/?facts=0');
    await bare.evaluate((l) => { window.__writes = []; openModal('editListing', l); }, BARBERINI_FIXED);
    const v0 = await bare.evaluate(() => document.querySelector('#mForm [name="bedrooms"]').value);
    await bare.fill('#mForm [name="bedrooms"]', '3');
    await bare.evaluate(() => document.getElementById('mForm').requestSubmit());
    await bare.waitForTimeout(80);
    const w2 = await bare.evaluate(() => window.__writes);
    check('[browser] senza /js/listing-facts.js: 0 mostrato come 0, 3 scritto come 3, nessun errore',
      v0 === '0' && w2[0]?.d.bedrooms === 3 && e2.length === 0, J({ v0, w2, e2 }));
    await bare.close();

    // il wizard mobile M2 a 390px: il campo nuovo resta nel suo capitolo
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const e3 = [];
    mob.on('pageerror', (e) => e3.push(String(e)));
    await mob.goto(base + '/?facts=1&m=1');
    await mob.waitForFunction(() => document.body.classList.contains('pm-on'), null, { timeout: 5000 }).catch(() => {});
    await mob.evaluate((l) => { window.__writes = []; window.openModal('editListing', l); }, { ...BY[CAPPELLARI] });
    await mob.waitForSelector('.pm-wiz-pane', { timeout: 5000 }).catch(() => {});
    const where = await mob.evaluate(() => {
      const sel = document.querySelector('#mForm [name="furnished"]');
      const panes = [...document.querySelectorAll('.pm-wiz-pane')];
      const i = panes.findIndex((p) => p.contains(sel));
      const dots = [...document.querySelectorAll('.pm-wiz-dot')];
      // `form.id` qui è l'<input name="id">: il modulo di modifica lo oscura
      return { on: document.body.classList.contains('pm-on'), panes: panes.length, i, title: i >= 0 && dots[i] ? dots[i].title : null, inForm: !!(sel && sel.form && sel.form.getAttribute('id') === 'mForm') };
    });
    check('[browser 390px] il wizard M2 prende il modulo e la select Arredamento sta nel capitolo «🏠 Caratteristiche» (non si perde)',
      where.on && where.panes > 2 && where.title === '🏠 Caratteristiche' && where.inForm, J(where));
    // come l'operatore: Avanti fino al capitolo della select, poi la sceglie
    for (let k = 0; k < 20; k++) {
      const visible = await mob.evaluate(() => { const s = document.querySelector('#mForm [name="furnished"]'); return !!(s && s.closest('.pm-wiz-pane.pm-cur')); });
      if (visible) break;
      await mob.click('.pm-wiz-next');
    }
    await mob.selectOption('#mForm [name="furnished"]', 'no');
    for (let k = 0; k < 20; k++) {
      const last = await mob.evaluate(() => { const ps = [...document.querySelectorAll('.pm-wiz-pane')]; return ps.length ? ps[ps.length - 1].classList.contains('pm-cur') : true; });
      if (last) break;
      await mob.click('.pm-wiz-next');
    }
    const recap = await mob.evaluate(() => (document.querySelector('.pm-wiz-recap') || {}).textContent || '');
    check('[browser 390px] il riepilogo mostra «Arredamento: Vuoto (non arredato)» sotto Caratteristiche',
      /Caratteristiche[\s\S]*Arredamento\s*Vuoto \(non arredato\)/.test(recap), recap.slice(0, 400));
    await mob.click('.pm-wiz-next');
    await mob.waitForTimeout(120);
    const w3 = await mob.evaluate(() => window.__writes);
    check('[browser 390px] «Salva» del wizard spedisce SOLO furnished \'no\' (+ updatedAt)',
      w3.length === 1 && w3[0].d.furnished === 'no' && w3[0].keys.slice().sort().join(',') === 'furnished,updatedAt', J(w3.map((x) => x.keys)));
    check('[browser 390px] nessun errore di pagina', e3.length === 0, e3.join(' | '));
    await mob.close();
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
