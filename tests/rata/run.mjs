// tests/rata/run.mjs — la porta della rata senza login (api/payments/rata.js).
// Il handler VERO su un Firestore in memoria che versiona i documenti come
// quello vero (updateTime, :commit con precondizione); si fingono solo la rete
// (Identity Toolkit, Firestore REST, Storage). Le regole: un link apre UNA
// rata, segnalare il bonifico non segna MAI pagato, la scrittura è condizionata,
// la commissione della carta si dice prima, il conto è quello del contratto.
// Uso: node tests/rata/run.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'segreto-di-prova';
delete process.env.RENT_FEE_PCT; delete process.env.RENT_FEE_BUFFER;

let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✓ ' + name); };

const store = new Map(), versions = new Map(), uploads = [];
let auto = 0, tick = 0, storageDown = false, racer = '';
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const fromFs = v => v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue !== undefined ? v.doubleValue
  : v.booleanValue !== undefined ? v.booleanValue : v.timestampValue !== undefined ? v.timestampValue : v.nullValue !== undefined ? null
  : v.arrayValue ? (v.arrayValue.values || []).map(fromFs) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : null;
const toFields = o => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
const docName = k => 'projects/test-proj/databases/(default)/documents/' + k;
const ut = k => '2026-01-01T00:00:' + String(versions.get(k) || 0).padStart(2, '0') + '.000000Z';
const put = (k, v) => { store.set(k, v); versions.set(k, ++tick); };
const SESSIONS = { 'tok-admin': 'admin1', 'tok-owner': 'owner1', 'tok-tenant': 't1' };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? okJson({ users: [{ localId: uid, email: uid + '@example.invalid' }] }) : okJson({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return okJson({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (storageDown) return new Response('denied', { status: 403 });
    const name = decodeURIComponent(url.split('name=')[1] || '');
    uploads.push({ name, type: opts.headers['Content-Type'], size: opts.body.length });
    return okJson({ name, downloadTokens: 'dl' });
  }
  if (url.includes('firestore.googleapis.com')) {
    const after = url.slice(url.indexOf('/documents') + 10);
    if (after.startsWith(':batchGet')) {
      const docs = JSON.parse(opts.body || '{}').documents || [];
      return okJson(docs.map(n => { const k = n.split('/documents/')[1]; return store.has(k) ? { found: { name: n, fields: toFields(store.get(k)), updateTime: ut(k) } } : { missing: n }; }));
    }
    if (after.startsWith(':commit')) {
      const writes = JSON.parse(opts.body).writes;
      for (const w of writes) {
        const k = w.update.name.split('/documents/')[1];
        if (w.currentDocument.updateTime && w.currentDocument.updateTime !== ut(k)) return okJson({ error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
      }
      for (const w of writes) {
        const k = w.update.name.split('/documents/')[1], cur = { ...(store.get(k) || {}) };
        for (const f of w.updateMask.fieldPaths) cur[f] = f in w.update.fields ? fromFs(w.update.fields[f]) : undefined;
        put(k, cur);
      }
      return okJson({ writeResults: writes.map(() => ({})) });
    }
    const [path, qs] = after.replace(/^\//, '').split('?');
    if (opts.method === 'POST') {
      const id = (qs && new URLSearchParams(qs).get('documentId')) || 'auto' + (++auto);
      const key = path + '/' + id;
      if (store.has(key)) return okJson({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
      put(key, Object.fromEntries(Object.entries(JSON.parse(opts.body).fields || {}).map(([k, v]) => [k, fromFs(v)])));
      return okJson({ name: docName(key), fields: toFields(store.get(key)) });
    }
    if (opts.method && opts.method !== 'GET') throw new Error('scrittura inattesa: ' + opts.method + ' ' + path);
    if (!store.has(path)) return okJson({}, 404);
    const body = { name: docName(path), fields: toFields(store.get(path)), updateTime: ut(path) };
    if (racer === path) { racer = ''; versions.set(path, ++tick); }   // un pagamento con carta arriva fra lettura e scrittura
    return okJson(body);
  }
  throw new Error('rete inattesa: ' + url);
};

put('users/admin1', { role: 'admin', name: 'Operatore' });
put('users/owner1', { role: 'landlord', name: 'Proprietaria' });
put('users/t1', { role: 'tenant', name: 'Inquilina' });
put('properties/p1', { ownerId: 'owner1', address: 'Piazzale Esempio 42, Roma', interno: '7', name: 'Piazzale Esempio 42 int. 7' });
put('contracts/c1', { propertyId: 'p1', tenantName: 'Giulia Bianchi', tenantPhone: '+393331234567', tenantEmail: 'giulia@example.invalid',
  landlordName: 'Proprietaria Esempio', landlordIban: 'IT60 X054 2811 1010 0000 0123 456' });
put('contracts/c2', { propertyId: 'p1', tenantName: 'Senza Iban' });
put('payments/r1', { contractId: 'c1', propertyId: 'p1', type: 'rent', month: '2026-10', amount: 850, status: 'pending', dueDate: '2026-10-05' });
put('payments/r2', { contractId: 'c2', propertyId: 'p1', type: 'rent', month: '2026-10', amount: 900, status: 'pending', dueDate: '2026-10-05' });
put('payments/r3', { contractId: 'c1', propertyId: 'p1', type: 'rent', month: '2026-09', amount: 850, status: 'paid', dueDate: '2026-09-05', paidDate: '2026-09-03' });
put('payments/r4', { contractId: 'c1', propertyId: 'p1', type: 'rent', month: '2026-11', amount: 850, status: 'pending', dueDate: '2026-11-05' });

const mod = await import('../../api/payments/rata.js');
const { default: handler, rataLink, rataView } = mod;
const { payToken } = await import('../../api/payments/_token.js');
let ipN = 0;
async function call(body, { token, ip } = {}) {
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
  const headers = { 'x-forwarded-for': ip || '10.0.0.' + (++ipN) };
  if (token) headers.authorization = 'Bearer ' + token;
  const req = { method: 'POST', headers, body, query: {} };
  await handler(req, res);
  return res;
}
const t = id => payToken('pay', id);
const notes = () => [...store.keys()].filter(k => k.startsWith('agentNotifications/'));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');

await check('il link: /rata con il token DERIVATO del link di pagamento, una rata sola', async () => {
  assert.equal(rataLink('r1'), 'https://www.boomrome.com/rata?id=r1&t=' + t('r1'));
  assert.equal(rataLink('../x'), '');
  assert.equal((await call({ op: 'lookup', id: 'r1', t: 'sbagliato' })).statusCode, 404);
  assert.equal((await call({ op: 'lookup', id: 'r2', t: t('r1') })).statusCode, 404, 'il token di una rata non apre l\'altra');
  assert.equal((await call({ op: 'lookup', id: 'nessuna', t: t('nessuna') })).statusCode, 404);
});
await check('lookup: importo, scadenza, commissione della carta DETTA prima, conto del contratto, causale', async () => {
  const r = await call({ op: 'lookup', id: 'r1', t: t('r1') });
  assert.equal(r.statusCode, 200);
  const v = r.body.rata;
  assert.equal(v.amount, 850); assert.equal(v.kind, 'rent'); assert.equal(v.month, '2026-10'); assert.ok(v.canPay);
  assert.ok(v.cardFee > 0, 'senza statistiche, il caso peggiore: mai sotto costo');
  assert.deepEqual(v.where, { building: 'Piazzale Esempio 42', interno: '7' });
  assert.equal(v.bonifico.iban, 'IT60X0542811101000000123456');
  assert.equal(v.bonifico.beneficiary, 'Proprietaria Esempio');
  assert.ok(/^BOOM-[2-9A-HJ-NP-Z]{6} canone 2026-10$/.test(v.bonifico.causale), v.bonifico.causale);
  assert.equal(r.body.payUrl, 'https://www.boomrome.com/api/payments/link?k=pay&id=r1&t=' + t('r1'), 'la carta passa dal link di pagamento che esiste già');
  const raw = JSON.stringify(r.body);
  assert.ok(!raw.includes('Giulia') && !raw.includes('333') && !raw.includes('example.invalid'), 'la pagina non dice chi abita lì');
  assert.equal(r.headers['cache-control'], 'private, no-store');
});
await check('senza IBAN nel contratto non se ne inventa uno (mai il conto di BOOM al posto di quello pattuito)', async () => {
  const v = (await call({ op: 'lookup', id: 'r2', t: t('r2') })).body.rata;
  assert.deepEqual([v.bonifico.iban, v.bonifico.beneficiary], ['', '']);
});
await check('«ho pagato con bonifico»: la rata diventa SEGNALATA, mai pagata; il ping parte DOPO', async () => {
  const before = notes().length;
  const r = await call({ op: 'report', id: 'r1', t: t('r1'), date: '2026-10-03', note: 'pagato dal conto di mia madre' });
  assert.equal(r.statusCode, 200); assert.equal(r.body.state, 'reported'); assert.equal(r.body.proof, false);
  const p = store.get('payments/r1');
  assert.equal(p.status, 'pending', 'segnalare non è pagare');
  assert.ok(!p.paidDate);
  assert.deepEqual([p.tenantReported, p.tenantReportDate, p.tenantNotes, p.reportedVia], [true, '2026-10-03', 'pagato dal conto di mia madre', 'link']);
  const n = notes().slice(before);
  assert.equal(n.length, 1);
  const doc = store.get(n[0]);
  assert.equal(doc.priority, 'high'); assert.equal(doc.type, 'payment.reported');
  assert.deepEqual(doc.ref, { collection: 'payments', id: 'r1' });
  assert.ok(doc.summary.includes('Piazzale Esempio 42 · int. 7') && doc.summary.includes('Giulia Bianchi') && doc.summary.includes('senza ricevuta'), doc.summary);
});
await check('una seconda segnalazione non raddoppia niente; la pagina ora dice "segnalato"', async () => {
  const before = notes().length;
  const r = await call({ op: 'report', id: 'r1', t: t('r1') });
  assert.equal(r.body.already, true);
  assert.equal(notes().length, before);
  const v = (await call({ op: 'lookup', id: 'r1', t: t('r1') })).body;
  assert.equal(v.rata.state, 'reported'); assert.equal(v.rata.canPay, false); assert.equal(v.payUrl, '', 'niente carta su una rata segnalata: due pagamenti per lo stesso mese');
  assert.equal(v.rata.reportedDate, '2026-10-03'); assert.equal(v.rata.canWithdraw, true);
});
await check('annullare una segnalazione sbagliata riapre la rata; con la ricevuta sale su Storage', async () => {
  const w = await call({ op: 'withdraw', id: 'r1', t: t('r1') });
  assert.equal(w.statusCode, 200);
  assert.equal(store.get('payments/r1').tenantReported, false);
  const r = await call({ op: 'report', id: 'r1', t: t('r1'), proof: { base64: JPEG, type: 'image/jpeg', name: 'ricevuta bonifico.jpg' } });
  assert.equal(r.body.proof, true);
  const up = uploads.at(-1);
  assert.ok(/^payment-proofs\/link-r1\/\d+\.jpg$/.test(up.name), up.name);
  assert.equal(up.type, 'image/jpeg');
  const p = store.get('payments/r1');
  assert.ok(p.proofUrl.startsWith('https://firebasestorage.googleapis.com/') && p.proofName === 'ricevuta bonifico.jpg');
  assert.ok(store.get(notes().at(-1)).summary.includes('ricevuta allegata'));
});
await check('le porte strette: ricevuta di tipo sbagliato, data futura, rata pagata, honeypot — nessuna scrittura', async () => {
  const v0 = versions.get('payments/r4'), n0 = notes().length;
  assert.equal((await call({ op: 'report', id: 'r4', t: t('r4'), proof: { base64: JPEG, type: 'image/gif' } })).statusCode, 400);
  assert.equal((await call({ op: 'report', id: 'r4', t: t('r4'), date: '2999-01-01' })).statusCode, 400);
  const hp = await call({ op: 'report', id: 'r4', t: t('r4'), company: 'spam srl' });
  assert.equal(hp.body.honeypot, true);
  assert.equal(versions.get('payments/r4'), v0);
  const paid = await call({ op: 'report', id: 'r3', t: t('r3') });
  assert.equal(paid.statusCode, 409);
  assert.equal(notes().length, n0);
  const v = (await call({ op: 'lookup', id: 'r3', t: t('r3') })).body.rata;
  assert.deepEqual([v.state, v.paidDate, v.canPay], ['paid', '2026-09-03', false]);
});
await check('un pagamento con carta arrivato fra lettura e scrittura vince: 409, nessuna segnalazione sopra', async () => {
  const n0 = notes().length;
  racer = 'payments/r4';
  const r = await call({ op: 'report', id: 'r4', t: t('r4') });
  assert.equal(r.statusCode, 409);
  assert.ok(!store.get('payments/r4').tenantReported);
  assert.equal(notes().length, n0, 'nessun ping per una segnalazione mai scritta');
});
await check('Storage giù: la segnalazione resta, e la pagina sa che la ricevuta non è arrivata', async () => {
  storageDown = true;
  const r = await call({ op: 'report', id: 'r4', t: t('r4'), proof: { base64: JPEG, type: 'image/jpeg' } });
  storageDown = false;
  assert.equal(r.statusCode, 200);
  assert.deepEqual([r.body.proof, r.body.proofFailed], [false, true]);
  assert.equal(store.get('payments/r4').tenantReported, true);
  assert.ok(!store.get('payments/r4').proofUrl);
});
await check('links: solo l\'admin, e solo per le rate ancora da pagare (le altre dicono perché)', async () => {
  assert.equal((await call({ op: 'links', paymentIds: ['r2'] })).statusCode, 401);
  assert.equal((await call({ op: 'links', paymentIds: ['r2'] }, { token: 'tok-owner' })).statusCode, 403);
  assert.equal((await call({ op: 'links', paymentIds: ['r2'] }, { token: 'tok-tenant' })).statusCode, 403);
  const r = await call({ op: 'links', paymentIds: ['r2', 'r3', 'r1', 'manca', '../x'] }, { token: 'tok-admin' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.links, { r2: rataLink('r2') });
  assert.deepEqual(r.body.skipped, { r3: 'already_paid', r1: 'payment_reported', manca: 'not_found' });
});
await check('troppe segnalazioni dallo stesso indirizzo: 429', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = await call({ op: 'withdraw', id: 'r2', t: t('r2') }, { ip: '9.9.9.9' });
  assert.equal(last.statusCode, 429);
});
await check('rataView pura: la commissione si mostra solo su una rata pagabile, il saldo deposito ha il suo nome', async () => {
  const v = rataView({ id: 'd1', type: 'deposit-balance', amount: 400, status: 'pending', dueDate: '2026-10-10' }, {});
  assert.equal(v.kind, 'depbal'); assert.ok(v.cardFee > 0);
  assert.equal(rataView({ id: 'x', amount: 400, status: 'paid', paidDate: '2026-10-01' }, {}).cardFee, 0);
});
await check('giunzioni: la pagina parla con questa porta, dice la commissione, è noindex/no-store; il Palazzo la usa', async () => {
  const page = readFileSync(new URL('../../rata.html', import.meta.url), 'utf8');
  assert.ok(page.includes("fetch('/api/payments/rata'") && page.includes('noindex'));
  assert.ok(page.includes('cardFee') && page.includes('Il bonifico non costa niente'));
  const vercel = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  assert.ok(vercel.includes('|rata|rata.html)(.*)'));
  const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  assert.ok(portal.includes("body: JSON.stringify({ op: 'links', paymentIds })") && portal.includes('record: id => confirmRentPayment(id)'));
  const view = readFileSync(new URL('../../js/palazzo.js', import.meta.url), 'utf8');
  assert.ok(view.includes('data-plz="rata"') && view.includes("act === 'rata-all'"));
});

console.log(`\n${count} check — la rata senza login, handler vero su Firestore in memoria.`);
