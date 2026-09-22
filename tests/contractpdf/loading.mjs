// Real portal loader + generator + shared renderer; only DOM/network/storage IO simulated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const html = read('portal.html'), portal = read('js/portal-app.js');
const loader = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('var HEAVY_LIBS'))?.[1];
assert(loader, 'actual heavy library loader');
const named = (name, source = portal) => {
  const start = source.indexOf('    async function ' + name + '(');
  assert(start >= 0, name);
  const next = source.slice(start + 5).search(/\n    (?:async )?function /);
  return source.slice(start, start + 5 + next);
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture({ source = portal, loaderSource = loader, ready = false, uploadFailure = false } = {}) {
  const scripts = [], timers = new Map(), listeners = {}, writes = [], uploads = [], errors = [];
  let timerId = 0;
  const contract = { id: 'synthetic', type: 'transitorio', propertyId: 'p', tenantName: 'Conduttore prova', landlordName: 'Proprietario prova', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1200, deposit: 2400, canone: { monthly: 1200, total: 14400, installments: 12, cedolareSecca: true } };
  const ctx = vm.createContext({
    Blob, TextEncoder, Uint8Array, crypto: webcrypto,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, fn) => listeners[name] = fn,
    requestIdleCallback: fn => listeners.idle = fn,
    document: { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: s => scripts.push(s) } },
    S: { contracts: [contract], properties: [{ id: 'p', address: 'Via di Prova 1', city: 'Roma' }], users: [] },
    firebase: { storage: () => ({ ref: () => ({ child: () => ({
      put: async blob => { if (uploadFailure) throw Error('synthetic storage failure'); uploads.push(blob); },
      getDownloadURL: async () => 'https://storage.invalid/contract.pdf'
    }) }) }), firestore: { FieldValue: { serverTimestamp: () => 'synthetic-time' } } },
    db: { collection: () => ({ doc: () => ({ update: async data => writes.push(data) }) }) }
  });
  ctx.window = ctx;
  if (ready) ctx.jspdf = { jsPDF };
  vm.runInContext(read('js/contract-pdf.js'), ctx);
  vm.runInContext(loaderSource, ctx);
  vm.runInContext(named('generateContractPDF', source) + '\n' + named('generateDocHash', source), ctx);
  return { ctx, scripts, timers, listeners, writes, uploads, errors, contract,
    generate: () => ctx.generateContractPDF('synthetic'),
    pdfScripts: () => scripts.filter(s => s.src.includes('/jspdf/')),
    load: s => { ctx.jspdf = { jsPDF }; s.onload(); },
    fire: ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } }
  };
}
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } }
async function lateGeneration(f) {
  let settled = false;
  const task = f.generate().then(value => { settled = true; return value; });
  await flush();
  assert.equal(settled, false, 'early click must wait instead of failing');
  assert.equal(f.pdfScripts().length, 1, 'click starts one library request before window load');
  assert.equal(f.uploads.length, 0);
  f.load(f.pdfScripts()[0]);
  assert.equal(await task, true);
  assert.equal(f.uploads.length, 1);
  assert.equal((await f.uploads[0].text()).slice(0, 5), '%PDF-');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].sigAnchors.blocks.length, 4);
  assert.match(f.writes[0].pdfHash, /^[a-f0-9]{16}$/);
}
await test('click before idle waits and saves a real PDF with signature anchors', () => lateGeneration(fixture()));
await test('already loaded library generates without injecting another script', async () => {
  const f = fixture({ ready: true }); assert.equal(await f.generate(), true); assert.equal(f.scripts.length, 0);
});
await test('idle preloading and simultaneous requests share one script', async () => {
  const f = fixture(); f.listeners.load(); f.listeners.idle(); await flush();
  assert.equal(typeof f.ctx.boomEnsureJsPDF, 'function');
  const a = f.ctx.boomEnsureJsPDF(), b = f.ctx.boomEnsureJsPDF();
  assert.equal(f.pdfScripts().length, 1); f.load(f.pdfScripts()[0]);
  assert.equal(await a, jsPDF); assert.equal(await b, jsPDF);
  await flush(); assert(f.scripts.some(s => s.src.includes('/html2canvas/')));
});
await test('network error makes no writes and next click can retry', async () => {
  const f = fixture(); const task = f.generate(); await flush();
  assert.equal(f.pdfScripts().length, 1); f.pdfScripts()[0].onerror();
  assert.equal(await task, false); assert.equal(f.uploads.length, 0); assert.equal(f.writes.length, 0);
  const retry = f.generate(); await flush(); assert.equal(f.pdfScripts().length, 2);
  f.load(f.pdfScripts()[1]); assert.equal(await retry, true); assert.equal(f.writes.length, 1);
});
await test('blocked CDN request times out and can be retried without reloading portal', async () => {
  const f = fixture(); const task = f.generate(); await flush();
  assert.equal(f.pdfScripts().length, 1); f.fire(20000);
  assert.equal(await task, false); assert.equal(f.writes.length, 0); assert(f.pdfScripts()[0].removed);
  const retry = f.generate(); await flush(); f.load(f.pdfScripts()[1]); assert.equal(await retry, true);
});
await test('script load without jsPDF constructor is failure, not a stored document', async () => {
  const f = fixture(); const task = f.generate(); await flush();
  assert.equal(f.pdfScripts().length, 1); f.ctx.jspdf = {}; f.pdfScripts()[0].onload();
  assert.equal(await task, false); assert.equal(f.writes.length, 0);
});
await test('failed background preload does not block other heavy libraries or retry', async () => {
  const f = fixture(); f.listeners.load(); f.listeners.idle(); await flush();
  f.pdfScripts()[0].onerror(); await flush();
  assert(f.scripts.some(s => s.src.includes('/html2canvas/')));
  const task = f.generate(); await flush(); assert.equal(f.pdfScripts().length, 2);
  f.load(f.pdfScripts()[1]); assert.equal(await task, true);
});
await test('fallback timer and idle callback never duplicate jsPDF', async () => {
  const f = fixture(); assert.equal(typeof f.ctx.boomEnsureJsPDF, 'function');
  const task = f.ctx.boomEnsureJsPDF(); f.fire(8000); f.listeners.load(); f.listeners.idle(); await flush();
  assert.equal(f.pdfScripts().length, 1); f.load(f.pdfScripts()[0]); await task;
});
await test('Storage failure is still false and never records a successful PDF', async () => {
  const f = fixture({ ready: true, uploadFailure: true }); assert.equal(await f.generate(), false); assert.equal(f.writes.length, 0); assert.equal(f.contract.generatedPDF, undefined);
});
await test('missing local rendering module never uploads or records a PDF', async () => {
  const f = fixture({ ready: true }); f.ctx.BOOM_CONTRACT_PDF = undefined; assert.equal(await f.generate(), false); assert.equal(f.writes.length, 0);
});
if (portal.includes('await window.boomEnsureJsPDF()')) {
  await test('mutation: removing the readiness wait is caught by the early-click test', async () => {
    const source = portal.replace('await window.boomEnsureJsPDF()', 'undefined');
    await assert.rejects(lateGeneration(fixture({ source })), /early click must wait/);
  });
}
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
