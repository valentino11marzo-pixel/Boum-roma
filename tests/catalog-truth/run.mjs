// La disponibilità pubblica non nasce da una build vecchia o da un invio HTTP tentato.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const source = readFileSync(join(root, 'apartment-detail.html'), 'utf8');
let passed = 0;
function check(ok, message) {
  if (!ok) throw new Error(message);
  passed++;
}

// Esegue il vero listener del form in un DOM minimo: una risposta pendente non
// può diventare "Sent"; un errore conserva i dati e riabilita il bottone.
const start = source.indexOf('  /* ── L\'APPLY');
const end = source.indexOf('  /* ── LA LENTE', start);
check(start >= 0 && end > start, 'listener APPLY trovato nella pagina reale');
const applyScript = source.slice(start, end);
function formFixture(fetchResult, state = {}) {
  const listeners = {};
  const fields = {
    '#apNome': { value: 'Test Client', focus() {} },
    '#apMail': { value: 'test@example.invalid', focus() {} },
    '#apQuando': { value: '', min: '', dataset: {}, addEventListener() {}, focus() {} },
    '#apMesi': { value: '12' },
  };
  const button = { disabled: false, textContent: 'Send application' };
  const form = {
    style: {},
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector(selector) { return selector === 'button[type="submit"]' ? button : fields[selector]; },
    querySelectorAll() { return []; },
  };
  const error = { hidden: true, textContent: '' };
  const success = { classList: { added: false, add() { this.added = true; } }, scrollIntoView() {} };
  const under = { style: {} };
  const document = {
    getElementById(id) { return ({ modApplica: form, applicaErrore: error,
      applicaSotto: under, applicaFatto: success })[id] || null; },
    querySelectorAll() { return []; }, addEventListener() {}, dispatchEvent() {},
  };
  const values = { nome: 'Test Client', email: 'test@example.invalid', telefono: '',
    quando: '', mesi: '12', reddito: '', garante: '', chi: '', occupazione: '',
    firmatari: '1', company: '' };
  const context = { document, window: { AbortController }, AbortController,
    FormData: class { get(k) { return values[k] ?? ''; } },
    c: { id: 'unit-test', nome: 'Test home', prezzo: 1000, zona: 'Rome', libera: true,
      lane: 'now', dal: null, ...state }, VERO: true,
    console, Date, Promise,
    fetch: fetchResult,
    setTimeout() { return 1; }, clearTimeout() {},
    rifaiDataApply: () => {},
  };
  runInNewContext(applyScript, context);
  return { submit: listeners.submit, form, button, error, success };
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

// Esegue la selezione dell'ID nella pagina reale: un URL inesistente non
// deve ereditare la prima casa della fotografia statica.
const idStart = source.indexOf('  function mostraIndisponibile()');
const idEnd = source.indexOf('  /* ── la scena', idStart);
check(idStart >= 0 && idEnd > idStart, 'selezione ID trovata nella pagina reale');
const idScript = source.slice(idStart, idEnd);
function identify(pathname) {
  const page = { innerHTML: 'first-home' };
  const hidden = Array.from({ length: 3 }, () => ({ style: {} }));
  const document = { title: '', querySelector: () => page,
    querySelectorAll: () => hidden };
  const context = { window: {}, location: { pathname, hash: '', search: '' },
    CASE: [{ id: 'first-home', nome: 'First home' }],
    casaDaListing: () => { throw new Error('no SSR record'); }, document };
  runInNewContext('(function () {' + idScript + 'globalThis.selected = c; })()', context);
  return { page, hidden, document, selected: context.selected };
}
const missingPage = identify('/listing/missing-id');
check(missingPage.selected === undefined && missingPage.page.innerHTML.includes('Home unavailable')
  && !missingPage.page.innerHTML.includes('first-home')
  && missingPage.hidden.every(el => el.style.display === 'none'),
  'ID inesistente mostra solo pagina indisponibile e nasconde la scheda campione');
check(identify('/apartment-detail').selected.id === 'first-home',
  'solo un URL senza ID mantiene il fallback storico');

// Le superfici pubbliche non devono leggere Firestore dal browser dopo il
// futuro cambio rules. I tool admin/legacy hanno un percorso separato.
const publicPages = ['index.html', 'apartments.html', 'board.html', 'book.html',
  'apartment-detail.html', 'detail-v2.html', 'design/pages-deco/ld-regia.html',
  ...readdirSync(join(root, 'apartments-in')).filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => 'apartments-in/' + f)];
for (const file of publicPages) {
  const page = readFileSync(join(root, file), 'utf8');
  check(page.includes('/api/listings')
    && !/\.collection\(['"]listings['"]\)|documents\/listings|listings\?pageSize=300/.test(page),
    file + ' legge la proiezione pubblica e non la collection Firestore');
}

// Il booking usa il payload dell'API e tiene solo lo stato available
// esplicito; una risposta fallita non diventa un catalogo vuoto credibile.
const bookSource = readFileSync(join(root, 'book.html'), 'utf8');
const bookStart = bookSource.indexOf('async function loadListings(){');
const bookEnd = bookSource.indexOf('function propCard(', bookStart);
check(bookStart >= 0 && bookEnd > bookStart, 'loader booking trovato nella pagina reale');
async function loadBook(fetchResult) {
  const cardContainer = { innerHTML: '' };
  const context = { document: { getElementById: () => cardContainer },
    window: { _L: {} }, ST: { all: [] }, fetch: fetchResult,
    paintProps() { context.painted = true; }, Error };
  runInNewContext(bookSource.slice(bookStart, bookEnd) + '\nglobalThis.loadBook = loadListings;', context);
  await context.loadBook();
  return { cardContainer, context };
}
const book = await loadBook(async () => ({ ok: true, json: async () => ({ ok: true,
  listings: [{ id: 'public', status: 'available' }, { id: 'rented', status: 'rented' },
    { id: 'unknown' }] }) }));
check(book.context.painted && book.context.ST.all.length === 1
  && book.context.ST.all[0].id === 'public' && !book.context.window._L.rented,
  'booking offre solo case pubbliche con stato available esplicito');
const failedBook = await loadBook(async () => ({ ok: false }));
check(failedBook.cardContainer.innerHTML.includes("Couldn't load the catalog")
  && !failedBook.context.painted,
  'booking distingue errore API da nessuna casa disponibile');

const refreshStart = source.indexOf('  if (VERO) setTimeout(function () {',
  source.indexOf('/* seconda: la rilettura viva'));
const refreshEnd = source.indexOf('  /* ── le altre case', refreshStart);
check(refreshStart >= 0 && refreshEnd > refreshStart, 'refresh della scheda trovato nella pagina reale');
async function refreshDetail(payload) {
  const result = { hidden: 0, digest: null, url: '' };
  const context = { VERO: true, c: { id: 'unit-test' }, Promise,
    setTimeout(fn) { fn(); },
    fetch(url) { result.url = url; return Promise.resolve({ ok: true, json: async () => payload }); },
    mostraIndisponibile() { result.hidden++; },
    digest(number, string) { result.digest = { price: number('price'), status: string('status') }; } };
  runInNewContext(source.slice(refreshStart, refreshEnd), context);
  await settle();
  return result;
}
const privateRefresh = await refreshDetail({ ok: true, listing: null });
check(privateRefresh.url === '/api/listings?id=unit-test'
  && privateRefresh.hidden === 1 && privateRefresh.digest === null,
  'scheda nasconde un ID ritirato dalla proiezione pubblica');
const publicRefresh = await refreshDetail({ ok: true,
  listing: { id: 'unit-test', price: 1250, status: 'available' } });
check(publicRefresh.hidden === 0 && publicRefresh.digest.price === 1250
  && publicRefresh.digest.status === 'available',
  'scheda aggiorna i fatti dal record proiettato');

const applyStart = source.indexOf('  /* La candidatura segue la corsia corrente');
const applyEnd = source.indexOf('  /* il canone sui Solari', applyStart);
check(applyStart >= 0 && applyEnd > applyStart, 'render candidatura trovato nella pagina reale');
const applyEls = Object.fromEntries([
  'modApplica', 'applicaAlternativa', 'applicaAlternativaLink', 'applicaPassi',
  'applicaTitoloNeutro', 'applicaTitoloAperto', 'applicaTitoloChiuso', 'applicaSotto',
].map(id => [id, { hidden: false, href: '' }]));
const applyButton = { disabled: false, textContent: 'Send application' };
const applyContext = { c: { lane: 'closed', libera: false, stato: 'Rented' },
  document: { getElementById(id) { return applyEls[id] || null; },
    querySelector(selector) { return selector === '.chiedi-wa'
      ? { href: 'https://wa.me/fixture?text=home' } : applyButton; } },
  Date };
runInNewContext(source.slice(applyStart, applyEnd), applyContext);
check(applyEls.modApplica.hidden && !applyEls.applicaAlternativa.hidden
  && applyEls.applicaPassi.hidden && applyEls.applicaTitoloAperto.hidden
  && !applyEls.applicaTitoloChiuso.hidden && applyEls.applicaTitoloNeutro.hidden
  && applyEls.applicaAlternativaLink.href.includes('wa.me/fixture'),
  'casa RENTED nasconde candidatura e propone un contatto contestuale');
applyContext.c.lane = 'ahead';
applyContext.scriviApply();
check(!applyEls.modApplica.hidden && applyEls.applicaAlternativa.hidden
  && !applyEls.applicaPassi.hidden && !applyEls.applicaTitoloAperto.hidden,
  'data di rilascio confermata riapre la candidatura senza ricaricare la pagina');

const descriptionStart = source.indexOf('  /* ── il racconto e ciò che c\'è dentro');
const descriptionEnd = source.indexOf("  per('#dentroCasa')", descriptionStart);
check(descriptionStart >= 0 && descriptionEnd > descriptionStart,
  'render descrizione trovato nella pagina reale');
const copyEls = { '#raccontoCasa': { textContent: '', hidden: false },
  '#dispoAvviso': { hidden: true } };
const copyContext = { c: { dispoReview: true,
  racconto: 'Old listing says available from July 2026.' },
  per(selector) { return copyEls[selector]; } };
runInNewContext(source.slice(descriptionStart, descriptionEnd), copyContext);
check(copyEls['#raccontoCasa'].textContent === ''
  && copyEls['#raccontoCasa'].hidden && !copyEls['#dispoAvviso'].hidden,
  'descrizione con disponibilità da rivedere non viene esposta né riaperta');
copyContext.c.dispoReview = false;
copyContext.scriviRacconto();
check(copyEls['#raccontoCasa'].textContent.includes('Old listing')
  && !copyEls['#raccontoCasa'].hidden && copyEls['#dispoAvviso'].hidden,
  'descrizione torna visibile solo quando il motore non chiede revisione');

let closedCalls = 0;
const closed = formFixture(() => { closedCalls++; return Promise.resolve({ ok: true }); },
  { lane: 'closed', libera: false });
closed.submit({ preventDefault() {} });
check(closedCalls === 0 && !closed.success.classList.added && !closed.button.disabled,
  'submit programmato su RENTED non invia una candidatura');

let resolveRequest;
const pending = formFixture(() => new Promise(resolve => { resolveRequest = resolve; }));
pending.submit({ preventDefault() {} });
check(pending.button.disabled && !pending.success.classList.added && pending.form.style.display !== 'none',
  'richiesta pendente: il form resta visibile e non dichiara Sent');
resolveRequest({ ok: true, json: async () => ({ ok: true, id: 'lead-test' }) });
await settle();
check(pending.success.classList.added && pending.form.style.display === 'none',
  'solo il successo confermato dalla porta mostra Sent');

const failed = formFixture(async () => ({ ok: false, json: async () => ({ ok: false }) }));
failed.submit({ preventDefault() {} });
await settle();
check(!failed.button.disabled && !failed.error.hidden && !failed.success.classList.added
  && failed.form.style.display !== 'none',
  'errore della porta: dati e retry restano disponibili');

// Handler SSR vero con Firestore REST finto, nessun record di produzione.
const { default: listingHandler } = await import('../../api/listing.js');
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const raw = { name: 'Test home', zone: 'Rome', status: 'rented',
  availableDate: yesterday, price: 1000, concordato: false,
  description: 'The apartment is furnished. Available from an old date.',
  images: ['https://example.invalid/one.jpg', 'https://example.invalid/two.jpg'],
  geo: { lat: 41, lng: 12, src: 'zone', q: 'zone: test',
    privateMetadata: 'operator-secret' },
  imagesVariants: [{ src: 'https://example.invalid/one.jpg',
    w960: 'https://example.invalid/one-960.jpg', operatorNote: 'operator-secret' }],
  secretSynthetic: 'operator-secret' };
const enc = v => Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(
    Object.entries(v).map(([k, value]) => [k, enc(value)])) } }
  : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const fields = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)]));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, status: 200,
  json: async () => ({ fields: fields(raw) }) });
async function render(expected = 200, id = 'unit-test') {
  let html = '';
  const headers = {};
  const res = { statusCode: 0, setHeader(k, v) { headers[k] = v; }, end(s) { html = s; } };
  await listingHandler({ query: { id } }, res);
  check(res.statusCode === expected, 'handler listing vero risponde ' + expected);
  if (expected === 200) check(headers['Cache-Control'] === 'public, max-age=0, s-maxage=120',
    'SSR limita la cache edge senza servire una copia stale dopo la revoca');
  return html;
}
try {
  let html = await render();
  const noscript = html.match(/<noscript><section[\s\S]*?<\/section><\/noscript>/)?.[0] || '';
  check(noscript.includes('Currently rented.') && !noscript.includes('Available from an old date'),
    'SEO senza JS non ripete descrizione con vecchia data su casa affittata');
  check(html.includes('window.__LISTING=') && html.includes('two.jpg'),
    'SSR consegna le foto correnti alla pagina');
  const dataScript = html.match(/<script>(window\.__LISTING=[\s\S]*?)<\/script>/)?.[1];
  const hydrated = { window: {} };
  check(!!dataScript, 'script di idratazione SSR presente');
  runInNewContext(dataScript, hydrated);
  check(hydrated.window.__LISTING_ID === 'unit-test'
    && hydrated.window.__LISTING.images.length === 2,
    'ID e dati SSR si eseguono come JavaScript valido');
  check(!html.includes('operator-secret') && !html.includes('secretSynthetic')
    && !html.includes('privateMetadata') && !html.includes('operatorNote'),
    'SSR pubblica solo la proiezione e scarta campi riservati anche annidati');
  raw.status = 'mystery';
  html = await render();
  const unknownNoscript = html.match(/<noscript><section[\s\S]*?<\/section><\/noscript>/)?.[0] || '';
  check(unknownNoscript.includes('Availability to confirm')
    && !html.includes('"availability":"https://schema.org/InStock"'),
    'stato ignoto non diventa disponibile neppure nel JSON-LD');
  raw.status = 'draft';
  html = await render(404);
  check(!html.includes('window.__LISTING') && !html.includes('operator-secret'),
    'annuncio esplicitamente privato non esce dal rendering SSR');
  raw.status = 'available';
  html = await render(200, 'unit-test</script><script>alert(1)</script>');
  check(!html.includes('unit-test</script>') && html.includes('unit-test\\u003c/script>'),
    'id della rotta non può chiudere lo script SSR');
  const maliciousDataScript = html.match(/<script>(window\.__LISTING=[\s\S]*?)<\/script>/)?.[1];
  const maliciousHydrated = { window: {} };
  runInNewContext(maliciousDataScript, maliciousHydrated);
  check(maliciousHydrated.window.__LISTING_ID === 'unit-test</script><script>alert(1)</script>',
    'ID con caratteri HTML rimane un valore stringa nello script');
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  html = await render(404, 'missing-id');
  check(html.includes('Home unavailable') && !html.includes('window.__LISTING')
    && !html.includes('Bilocale Trastevere'),
    'SSR su ID inesistente dà 404 senza la prima casa della build');
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  html = await render(503, 'read-failed');
  check(html.includes('Home unavailable') && !html.includes('window.__LISTING')
    && !html.includes('Bilocale Trastevere'),
    'errore Firestore dà 503 e non una casa diversa');
} finally { globalThis.fetch = originalFetch; }

// La stessa proiezione passa anche dall'endpoint collection e ?id, incluso
// quando il server può leggere più campi di un utente anonimo.
const { default: listingsHandler } = await import('../../api/listings.js');
const publicDoc = { name: 'projects/test/databases/(default)/documents/listings/unit-test',
  fields: fields({ ...raw, status: 'available' }) };
const privateDoc = { name: 'projects/test/databases/(default)/documents/listings/private-test',
  fields: fields({ name: 'Private test', status: 'available', visibility: 'private',
    secretSynthetic: 'operator-secret' }) };
const unpublishedDoc = { name: 'projects/test/databases/(default)/documents/listings/unpublished-test',
  fields: fields({ name: 'Unpublished test', status: 'available', published: false,
    secretSynthetic: 'operator-secret' }) };
globalThis.fetch = async url => ({ ok: true, status: 200, json: async () =>
  String(url).includes('/listings?') ? { documents: [publicDoc, privateDoc, unpublishedDoc] }
    : String(url).includes('/private-test?') ? privateDoc
      : String(url).includes('/unpublished-test?') ? unpublishedDoc : publicDoc });
async function catalog(query = {}) {
  const headers = {};
  const res = { statusCode: 0, payload: null, setHeader(k, v) { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; } };
  await listingsHandler({ query }, res);
  check(res.statusCode === 200, 'endpoint listings vero risponde 200');
  check(headers['Cache-Control'] === 'public, max-age=0, s-maxage=120',
    'API catalogo limita la cache edge senza stale extension');
  return res.payload;
}
try {
  const all = await catalog();
  check(all.count === 1 && all.listings[0].id === 'unit-test',
    'collection esclude annuncio privato esplicito');
  const compatible = await catalog({ format: 'firestore' });
  check(compatible.count === 1 && compatible.documents[0].name.endsWith('/unit-test')
    && compatible.documents[0].fields.price.integerValue === '1000'
    && compatible.documents[0].fields.images.arrayValue.values.length === 2,
    'home, griglia e board ricevono la forma Firestore dei soli dati proiettati');
  check(!JSON.stringify(compatible).includes('operator-secret')
    && !JSON.stringify(compatible).includes('private-test'),
    'forma compatibile non ripubblica campi segreti o annunci privati');
  check(!JSON.stringify(all).includes('operator-secret')
    && !JSON.stringify(all).includes('secretSynthetic'),
    'collection scarta i campi riservati sintetici');
  const one = await catalog({ id: 'unit-test' });
  check(one.listing && one.listing.images.length === 2
    && !JSON.stringify(one).includes('operator-secret'),
    'endpoint ?id conserva foto pubbliche senza campi riservati');
  check(one.listing.concordato === false && one.listing.geo.src === 'zone'
    && one.listing.imagesVariants[0].w960.includes('one-960.jpg'),
    'proiezione conserva i campi letti da pin, media studio e galleria');
  const hidden = await catalog({ id: 'private-test' });
  check(hidden.listing === null, 'endpoint ?id non serve annuncio privato esplicito');
  const unpublished = await catalog({ id: 'unpublished-test' });
  check(unpublished.listing === null, 'published=false chiude l’annuncio');
} finally { globalThis.fetch = originalFetch; }

// Anche quando la lettura anonima è vietata e il server usa credenziali
// admin, la risposta pubblica resta esattamente la stessa proiezione.
const oldEmail = process.env.FIREBASE_ADMIN_EMAIL;
const oldPass = process.env.FIREBASE_ADMIN_PASS;
process.env.FIREBASE_ADMIN_EMAIL = 'catalog-test@example.invalid';
process.env.FIREBASE_ADMIN_PASS = 'fixture-only';
let adminReads = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).includes('signInWithPassword')) return { ok: true, status: 200,
    json: async () => ({ idToken: 'synthetic-token' }) };
  if (!options?.headers?.Authorization) return { ok: false, status: 403 };
  adminReads++;
  return { ok: true, status: 200, json: async () =>
    String(url).includes('/listings?')
      ? ({ documents: [publicDoc, privateDoc, unpublishedDoc] }) : publicDoc };
};
try {
  const all = await catalog();
  check(adminReads === 1 && all.count === 1
    && !JSON.stringify(all).includes('operator-secret'),
    'fallback admin non apre campi o annunci privati al pubblico');
  const compatible = await catalog({ format: 'firestore' });
  check(adminReads === 2 && compatible.count === 1
    && !JSON.stringify(compatible).includes('operator-secret'),
    'forma compatibile resta proiettata anche dietro rules chiuse');
  const html = await render(200);
  check(adminReads === 3 && html.includes('window.__LISTING=')
    && !html.includes('operator-secret'),
    'SSR continua a funzionare con lettura anonima 403 e token admin');
} finally {
  globalThis.fetch = originalFetch;
  if (oldEmail === undefined) delete process.env.FIREBASE_ADMIN_EMAIL;
  else process.env.FIREBASE_ADMIN_EMAIL = oldEmail;
  if (oldPass === undefined) delete process.env.FIREBASE_ADMIN_PASS;
  else process.env.FIREBASE_ADMIN_PASS = oldPass;
}

console.log(`Catalog truth: ${passed} passed`);
