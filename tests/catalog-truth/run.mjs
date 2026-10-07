// La disponibilità pubblica non nasce da una build vecchia o da un invio HTTP tentato.
import { readFileSync } from 'node:fs';
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
function formFixture(fetchResult) {
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
    c: { id: 'unit-test', nome: 'Test home', prezzo: 1000, zona: 'Rome', libera: false,
      lane: 'closed', dal: null }, VERO: true,
    console, Date, Promise,
    fetch: fetchResult,
    setTimeout() { return 1; }, clearTimeout() {},
    rifaiDataApply: () => {},
  };
  runInNewContext(applyScript, context);
  return { submit: listeners.submit, form, button, error, success };
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

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
  const res = { statusCode: 0, setHeader() {}, end(s) { html = s; } };
  await listingHandler({ query: { id } }, res);
  check(res.statusCode === expected, 'handler listing vero risponde ' + expected);
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
  const res = { statusCode: 0, payload: null, setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; } };
  await listingsHandler({ query }, res);
  check(res.statusCode === 200, 'endpoint listings vero risponde 200');
  return res.payload;
}
try {
  const all = await catalog();
  check(all.count === 1 && all.listings[0].id === 'unit-test',
    'collection esclude annuncio privato esplicito');
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
  return { ok: true, status: 200, json: async () => ({ documents: [publicDoc, privateDoc, unpublishedDoc] }) };
};
try {
  const all = await catalog();
  check(adminReads === 1 && all.count === 1
    && !JSON.stringify(all).includes('operator-secret'),
    'fallback admin non apre campi o annunci privati al pubblico');
} finally {
  globalThis.fetch = originalFetch;
  if (oldEmail === undefined) delete process.env.FIREBASE_ADMIN_EMAIL;
  else process.env.FIREBASE_ADMIN_EMAIL = oldEmail;
  if (oldPass === undefined) delete process.env.FIREBASE_ADMIN_PASS;
  else process.env.FIREBASE_ADMIN_PASS = oldPass;
}

console.log(`Catalog truth: ${passed} passed`);
