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
  availableDate: yesterday, price: 1000,
  description: 'The apartment is furnished. Available from an old date.',
  images: ['https://example.invalid/one.jpg', 'https://example.invalid/two.jpg'] };
const enc = v => Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, status: 200,
  json: async () => ({ fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, enc(v)])) }) });
async function render() {
  let html = '';
  const res = { statusCode: 0, setHeader() {}, end(s) { html = s; } };
  await listingHandler({ query: { id: 'unit-test' } }, res);
  check(res.statusCode === 200, 'handler listing vero risponde 200');
  return html;
}
try {
  let html = await render();
  const noscript = html.match(/<noscript><section[\s\S]*?<\/section><\/noscript>/)?.[0] || '';
  check(noscript.includes('Currently rented.') && !noscript.includes('Available from an old date'),
    'SEO senza JS non ripete descrizione con vecchia data su casa affittata');
  check(html.includes('window.__LISTING=') && html.includes('two.jpg'),
    'SSR consegna le foto correnti alla pagina');
  raw.status = 'draft';
  html = await render();
  const unknownNoscript = html.match(/<noscript><section[\s\S]*?<\/section><\/noscript>/)?.[0] || '';
  check(unknownNoscript.includes('Availability to confirm')
    && !html.includes('"availability":"https://schema.org/InStock"'),
    'stato ignoto non diventa disponibile neppure nel JSON-LD');
} finally { globalThis.fetch = originalFetch; }

console.log(`Catalog truth: ${passed} passed`);
