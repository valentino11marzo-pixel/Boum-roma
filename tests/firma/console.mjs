// tests/firma/console.mjs — LA CONSOLE PRE-AGREEMENT RENDE LO STATO VERO.
//
// Il caso Inês (12/09/2026): contratto firmato da entrambi e attivo, e la
// riga della console ferma su «paid · 🖊 Reinvia Magic Sign · dopo la firma
// dell'inquilino…». Qui si MONTA la console vera (i suoi <script>) in un
// contesto Node con un DOM minimo e un Firestore finto, si consegnano
// quattro deal nei quattro stati possibili e si legge l'HTML che paRow
// produce davvero — non una regex sulla sorgente:
//   A  contratto creato, nessuna firma      → 🖊 Reinvia Magic Sign
//   B  l'inquilino ha firmato               → link del proprietario, MAI Reinvia
//   C  firmato da entrambi (delega)         → PDF firmato + certificato
//   D  contratto non (ancora) letto         → il ripiego: la stampa sulla proposta
// Uso: node tests/firma/console.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'pre-agreement-admin.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// ── DOM minimo: solo ciò che la console tocca al boot e nel render ──
const els = {};
const mkEl = (id) => els[id] || (els[id] = {
  id, innerHTML: '', textContent: '', style: {}, value: '',
  classList: { toggle() {}, add() {}, remove() {} },
  querySelectorAll: () => [], querySelector: () => ({ textContent: '' }),
  addEventListener() {}, scrollIntoView() {}, getAttribute() { return null; },
});
const chipI = {};
const chips = ['all', 'open', 'close', 'paid', 'signed', 'reserve', 'revoked'].map(f => ({
  getAttribute: () => f, querySelector: () => (chipI[f] || (chipI[f] = { textContent: '' })), classList: { toggle() {} },
}));
mkEl('fchips').querySelectorAll = () => chips;

// ── Firestore finto: consegna gli snapshot quando il test decide ──
let paApply = null; const cWatch = {};
const firestore = () => ({ collection: () => ({
  orderBy: () => ({ limit: () => ({ onSnapshot: (fn) => { paApply = fn; }, get: async () => { throw new Error('offline'); } }) }),
  doc: (id) => ({ onSnapshot: (fn) => { cWatch[id] = fn; }, get: async () => { throw new Error('offline'); } }),
  limit: () => ({ get: async () => ({ forEach() {} }) }),
}) });
const ctx = {
  console, setTimeout, clearTimeout, Promise, JSON, Math, Date, String, Number, Array, Object,
  encodeURIComponent, decodeURIComponent, parseFloat, parseInt, isNaN, Intl, RegExp, Error,
  document: { getElementById: mkEl, addEventListener() {}, createElement: () => mkEl('tmp' + Math.random()), body: { appendChild() {} }, querySelectorAll: () => [], head: { appendChild() {} } },
  location: { origin: 'https://www.boomrome.com', hash: '' }, navigator: { clipboard: { writeText() {} } },
  localStorage: { getItem: () => null, setItem() {} }, alert() {}, prompt: () => null,
  firebase: { firestore },
  BoomPortal: { requireAuth: () => ({ then: (fn) => { fn({ user: { email: 'op@x', uid: 'u1', getIdToken: async () => 't' } }); return { catch() {} }; } }) },
  fetch: async () => ({ json: async () => ({ ok: true }) }),
};
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const s of scripts) vm.runInContext(s, ctx);
if (!paApply) { console.error('FAIL la console non si è agganciata a preAgreements'); process.exit(1); }

const snap = (rows) => ({ forEach: (fn) => rows.forEach(r => fn({ id: r.id, data: () => r })) });
const base = {
  status: 'paid', paidEur: 1450, paidAt: '2026-08-20', ref: 'BOOM-X', createdAt: '2026-08-10',
  tenant: { fullName: 'Ines Test', phone: '+39333' }, landlord: { name: 'Giulia', phone: '+39334' },
  property: { address: 'Viale Angelico 9' }, money: { rent: 1450, dueAtSigning: 2000 },
  lease: { months: 12, startDate: '2026-09-01' }, propertyId: 'p1', signSentAt: '2026-08-21',
  tenantSignUrl: 'https://www.boomrome.com/sign?sign=T', landlordSignUrl: 'https://www.boomrome.com/sign?sign=L',
};
paApply(snap([
  { ...base, id: 'A', contractId: 'pa_A' },
  { ...base, id: 'B', contractId: 'pa_B' },
  { ...base, id: 'C', contractId: 'pa_C', delegated: true },
  { ...base, id: 'D', contractId: 'pa_D', contractSignatureStatus: 'partial', tenantSignedAt: '2026-09-01T10:00:00Z' },
]));
const before = els.paRows.innerHTML;
cWatch['pa_A']({ exists: true, data: () => ({ signatureStatus: 'none' }) });
cWatch['pa_B']({ exists: true, data: () => ({ tenantSignature: 'x', tenantSignedAt: '2026-09-02T09:00:00Z', signatureStatus: 'partial' }) });
cWatch['pa_C']({ exists: true, data: () => ({ tenantSignature: 'x', landlordSignature: 'y', tenantSignedAt: '2026-09-02T09:00:00Z', landlordSignedAt: '2026-09-03T09:00:00Z', fullySignedAt: '2026-09-03T09:00:00Z', signatureStatus: 'complete', signedPdfUrl: 'https://s/signed.pdf', signingCertificateUrl: 'https://s/cert.pdf', finalizedAt: 'x' }) });
await new Promise(r => setTimeout(r, 200));   // scheduleRender è debounced

const rows = els.paRows.innerHTML.split('<div class="parow').slice(1);
const has = (i, re) => re.test(rows[i] || '');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

ok(rows.length === 4 && Object.keys(cWatch).length === 4, 'quattro deal renderizzati, quattro contratti in ascolto');
ok(before.split('<div class="parow').length === 5 && !/chip signed/.test(before) && /chip signing">✍ firmato inquilino/.test(before),
  'PRIMA che i contratti arrivino la lista è intera e il ripiego (stampa sulla proposta) già parla');
ok(has(0, /Reinvia Magic Sign/) && has(0, /Firma su WhatsApp/) && !has(0, /chip sign/),
  'A · nessuna firma: 🖊 Reinvia Magic Sign + Firma su WhatsApp, nessun chip firma');
ok(has(1, /chip signing">✍ firmato inquilino/) && has(1, /pbtn prim wa[^>]*>📲 Firma proprietario/) && !has(1, /Reinvia Magic Sign/)
  && has(1, /L’inquilino ha firmato<\/b> il 2026-09-02/) && has(1, /non serve più/),
  'B · inquilino firmato: chip ✍, link del proprietario PRIMARIO, mai più Reinvia Magic Sign');
ok(has(2, /chip signed">✓ firmato/) && has(2, /📥 Contratto firmato/) && has(2, /Certificato FES/)
  && !has(2, /Copia link delega/) && !has(2, /Reinvia Magic Sign/) && has(2, /st-paid st-signed/)
  && has(2, /Contratto firmato da entrambi<\/b> il 2026-09-03/) && has(2, /attivo: certificato FES/),
  'C · firmato da entrambi: chip ✓, PDF firmato + certificato, niente inviti, prossimo passo = registrazione');
ok(has(3, /chip signing">✍ firmato inquilino/) && !has(3, /Reinvia Magic Sign/),
  'D · contratto non letto: la stampa sulla proposta basta a togliere il Reinvia');
ok(/^1 <small>\/ 4 creati<\/small>$/.test(els.kContr.innerHTML), 'KPI: 1 contratto firmato su 4 creati');
ok(chipI.signed.textContent === 1 || chipI.signed.textContent === '1', 'chip Firmati conta 1');

// filtro Firmati: solo C
ctx.setFilter('signed', chips[4]);
const onlySigned = els.paRows.innerHTML.split('<div class="parow').slice(1);
ok(onlySigned.length === 1 && /chip signed/.test(onlySigned[0]), 'filtro Firmati → resta solo il deal firmato da entrambi');

console.log(`\n${fail ? '✗' : '✓'} console PA: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
