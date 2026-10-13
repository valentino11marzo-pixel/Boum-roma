// tests/palazzo/leftovers.mjs — LE COSE RIMASTE FRA I FILONI (S9).
//
// Le voci che i filoni del Palazzo si sono passati e che nessuno aveva ancora
// chiuso, provate sugli handler VERI (Firestore in memoria con commit e
// runQuery, Storage, Stripe e nodemailer finti — jspdf e pdf-lib veri) e
// sulle funzioni VERE del portal (estratte da js/portal-app.js ed eseguite in
// un contesto con Firestore finto). Dati inventati: nomi di prova, +39 000…,
// @example.invalid. Nessuna rete.
//
//  A · carta e segnaposto non ricevono MAI un PDF dal modello BOOM
//  B · /sign: 409 not_signable prima di timbri, ping e PDF
//  C · /snapshot su Telegram: «da firmare» e «scaduti» onesti
//  D · send-sign e resolve: il cancello del proprietario (paOwnerGuard)
//  E · OCR e Q&A: solo admin, e mai un URL fuori dal nostro Storage
//  F · i conti della carta in paymentCosts, mai sulla rata
//  G · una segnalazione ritirata o revocata si toglie tutta (e resta storia)
//  H · una sola traslitterazione (wa di _pdfbrand) nei PDF fiscali
//  I · il piede dell'email nella sua lingua, link lunghi interi
//  (J · i telefoni normalizzati dei contatti: tests/palazzo/contatti.mjs)
//  K · il rendiconto dal 1° al 5, la Squadra lo dice, la CI prova Storage
//  L · il portal fuori dal Palazzo (review, copia a Valentino, feed, rate
//      29-31, ASPI su carta, guasto col contratto, sollecito senza profilo,
//      409 dei link di firma, OCR solo admin, costi in egidi)
//  M · /casa scarta le ricevute annullate, la console chiede l'immobile
//  N · la receptionist riconosce il conduttore senza dire niente di lui
//
// In fondo: il driver delle mutazioni — un processo figlio per difetto
// rimesso (tests/palazzo/leftovers-loader.mjs), e la suite deve cadere.
// Uso: node tests/palazzo/leftovers.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
register('./leftovers-loader.mjs', import.meta.url);

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const CHILD = !!process.env.LEFTOVERS_MUTATION;

Object.assign(process.env, {
  FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'svc@example.invalid', FIREBASE_ADMIN_PASS: 'p', FIREBASE_PROJECT_ID: 'test-proj',
  HOMIE_SECRET: 'segreto-di-prova-s9', STRIPE_SECRET_KEY: 'sk_test_s9', STRIPE_WEBHOOK_SECRET: 'whsec_s9',
  TELEGRAM_BOT_TOKEN: 'tg-test', TELEGRAM_CHAT_ID: '1', GMAIL_USER: 'boom-mailbox@example.invalid', GMAIL_APP_PASS: 'x',
  ANTHROPIC_API_KEY: 'chiave-finta-mai-usata',
});
for (const k of ['RENT_FEE_PCT', 'RENT_FEE_MIN', 'RENT_FEE_BUFFER', 'RENT_FEE_MAX_PCT', 'PUBLIC_BASE_URL', 'FIREBASE_STORAGE_BUCKET', 'ADMIN_NOTIFY_EMAIL', 'CAF_EMAIL']) delete process.env[k];

let passed = 0, failed = 0;
const fails = [];
async function check(name, fn) {
  try { await fn(); passed++; if (!CHILD) console.log('✓ ' + name); }
  catch (e) { failed++; fails.push(name); console.log('✗ ' + name + ' — ' + (e && e.message)); }
}

// ═══ Firestore in memoria (versionato, commit, runQuery), Storage, Telegram ═
const store = new Map(), versions = new Map(), uploads = [], tg = [], external = [], writes = [];
let tick = 0, auto = 0;
const put = (k, v) => { store.set(k, v); versions.set(k, ++tick); };
const ut = k => '2026-01-01T00:00:00.' + String(versions.get(k) || 0).padStart(6, '0') + 'Z';
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
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const SESSIONS = { 'tok-admin': 'admin1', 'tok-own1': 'owner1', 'tok-own2': 'owner2', 'tok-t1': 't1' };
const docName = k => 'projects/test-proj/databases/(default)/documents/' + k;

globalThis.fetch = async (input, opts = {}) => {
  const url = String(input);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? json({ users: [{ localId: uid, email: uid + '@example.invalid' }] }) : json({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return json({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('api.telegram.org')) { tg.push(JSON.parse(opts.body || '{}').text || ''); return json({ ok: true, result: { message_id: 1 } }); }
  if (url.includes('firebasestorage.googleapis.com')) {
    const name = decodeURIComponent(url.split('name=')[1] || url);
    uploads.push({ name, type: (opts.headers || {})['Content-Type'] });
    writes.push('storage:' + name);
    return json({ name, downloadTokens: 'dl' });
  }
  if (!url.includes('firestore.googleapis.com')) { external.push(url); throw new Error('rete inattesa: ' + url); }
  const after = url.slice(url.indexOf('/documents') + 10);
  const method = (opts.method || 'GET').toUpperCase();
  if (after.startsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery, coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
    const val = ff ? fromFs(ff.value) : null;
    const rows = [...store.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2)
      .filter(([, d]) => !ff || (ff.op === 'IN' ? val.includes(d[ff.field.fieldPath]) : d[ff.field.fieldPath] === val))
      .slice(0, q.limit || 1000);
    return json(rows.map(([k, d]) => ({ document: { name: docName(k), fields: toFields(d), updateTime: ut(k) } })));
  }
  if (after.startsWith(':batchGet')) {
    const docs = JSON.parse(opts.body || '{}').documents || [];
    return json(docs.map(n => { const k = n.split('/documents/')[1]; return store.has(k) ? { found: { name: n, fields: toFields(store.get(k)), updateTime: ut(k) } } : { missing: n }; }));
  }
  if (after.startsWith(':commit')) {
    const ws = JSON.parse(opts.body).writes;
    for (const w of ws) {
      if (!w.update) continue;
      const k = w.update.name.split('/documents/')[1], cd = w.currentDocument || {};
      if (cd.updateTime && cd.updateTime !== ut(k)) return json({ error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
      if (cd.exists === false && store.has(k)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    }
    for (const w of ws) {
      if (!w.update) continue;
      const k = w.update.name.split('/documents/')[1], cur = { ...(store.get(k) || {}) };
      for (const f of w.updateMask.fieldPaths) { if (f in w.update.fields) cur[f] = fromFs(w.update.fields[f]); else delete cur[f]; }
      put(k, cur); writes.push('commit:' + k);
    }
    return json({ writeResults: ws.map(() => ({})) });
  }
  const [rawPath, qs] = after.replace(/^\//, '').split('?');
  const path = decodeURIComponent(rawPath);
  const params = new URLSearchParams(qs || '');
  if (method === 'POST') {
    const id = params.get('documentId') || 'auto' + (++auto);
    const key = path + '/' + id;
    if (store.has(key)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    put(key, Object.fromEntries(Object.entries(JSON.parse(opts.body).fields || {}).map(([k, v]) => [k, fromFs(v)])));
    writes.push('create:' + key);
    return json({ name: docName(key), fields: toFields(store.get(key)) });
  }
  if (method === 'PATCH') {
    if (params.get('currentDocument.exists') === 'false' && store.has(path)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    if (params.get('currentDocument.exists') === 'true' && !store.has(path)) return json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
    const mask = params.getAll('updateMask.fieldPaths').map(decodeURIComponent);
    const incoming = JSON.parse(opts.body).fields || {};
    const cur = { ...(store.get(path) || {}) };
    for (const f of (mask.length ? mask : Object.keys(incoming))) { if (f in incoming) cur[f] = fromFs(incoming[f]); else delete cur[f]; }
    put(path, cur); writes.push('patch:' + path);
    return json({ name: docName(path), fields: toFields(cur) });
  }
  if (method === 'DELETE') { store.delete(path); writes.push('delete:' + path); return json({}); }
  if (!store.has(path)) return json({}, 404);
  return json({ name: docName(path), fields: toFields(store.get(path)), updateTime: ut(path) });
};

function mkRes() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; }, send(o) { this.body = o; return this; } };
}
let ipN = 0;
async function call(handler, { token, body, method = 'POST', query = {}, headers = {} } = {}) {
  const res = mkRes();
  await handler({ method, query, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'x-forwarded-for': '10.9.0.' + (++ipN % 250), ...headers }, body }, res);
  return res;
}
const mails = () => globalThis.__mails || [];
const keysOf = (col) => [...store.keys()].filter(k => k.startsWith(col + '/'));

// ── il palazzo d'esempio ──
put('users/admin1', { role: 'admin', name: 'Operatore', email: 'operatore@example.invalid' });
put('users/owner1', { role: 'landlord', name: 'Chiara Prova', email: 'chiara@example.invalid' });
put('users/owner2', { role: 'landlord', name: 'Altro Proprietario', email: 'altro@example.invalid' });
put('users/t1', { role: 'tenant', name: 'Inquilina Uno', email: 't1@example.invalid' });
put('properties/p7', { ownerId: 'owner1', address: 'Piazzale Prova 42, Roma', interno: '7', name: 'Int. 7' });
put('properties/p8', { ownerId: 'owner1', address: 'Piazzale Prova 42, Roma', interno: '8', name: 'Int. 8' });
put('properties/p9', { ownerId: 'owner1', address: 'Piazzale Prova 42, Roma', interno: '9', name: 'Int. 9' });
put('properties/p_altrui', { ownerId: 'owner2', address: 'Via Altra 3, Roma' });
const PAPER = { propertyId: 'p7', status: 'active', source: 'palazzo-import', signatureStatus: 'paper', tenantName: 'Şule Prova', tenantPhone: '+39 000 000 0071',
  coTenants: [{ name: 'Mehmet Prova', phone: '+39 000 000 0072' }], startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, type: 'studenti' };
put('contracts/cPaper', PAPER);
put('contracts/cHole', { propertyId: 'p8', status: 'active', source: 'palazzo-import', contractMissing: true, tenantName: 'Pavel Prova' });
put('contracts/cDigital', { propertyId: 'p9', status: 'active', tenantId: 't1', tenantName: 'Inquilina Uno', tenantEmail: 't1@example.invalid',
  startDate: '2026-11-01', endDate: '2027-10-31', rent: 900, type: 'transitorio' });
put('signTokens/cPaper', { contractId: 'cPaper', tenant: 'tok-sign-paper-0001', landlord: 'tok-sign-paper-0002' });
put('signTokens/cHole', { contractId: 'cHole', tenant: 'tok-sign-hole-00001' });
put('signTokens/cDigital', { contractId: 'cDigital', tenant: 'tok-sign-digital-001' });

const cpdf = await import('../../api/sign/_contractpdf.js');
const lookup = (await import('../../api/magic-sign/lookup.js')).default;
const { snapshotLines } = await import('../../api/telegram/webhook.js');
const ocr = await import('../../api/documents/ocr.js');
const qa = (await import('../../api/documents/qa.js')).default;
const webhook = (await import('../../api/stripe-webhook.js')).default;
const report = (await import('../../api/payments/report.js')).default;
const notify = await import('../../api/notify/send.js');
const tools = await import('../../api/phone/agent-tools.js');
const sendSign = (await import('../../api/preagreement/send-sign.js')).default;
const resolvePa = (await import('../../api/preagreement/resolve.js')).default;
const RENT = require('../../js/rent-engine.js');
const CS = require('../../js/contract-state.js');

// ═══ A · carta e segnaposto: nessun PDF dal modello ═════════════════════════
await check('A · ensureContractPdf su un contratto di CARTA (anche con force): null, nessun upload, nessuna scrittura', async () => {
  const w0 = writes.length;
  assert.equal(await cpdf.ensureContractPdf('cPaper', { ...store.get('contracts/cPaper'), id: 'cPaper' }, { force: true }), null);
  assert.equal(await cpdf.ensureContractPdf('cPaper', null, { force: true }), null, 'anche letto dal server (la Scheda)');
  assert.deepEqual(writes.slice(w0), []);
  assert.ok(!('generatedPDF' in store.get('contracts/cPaper')));
});
await check('A · …né su un SEGNAPOSTO; renderContractPdf null e buildContractPdfBytes rifiuta (no_model_pdf)', async () => {
  const w0 = writes.length;
  assert.equal(await cpdf.ensureContractPdf('cHole', null, { force: true }), null);
  assert.equal(await cpdf.renderContractPdf('cHole', store.get('contracts/cHole')), null, 'revise ↺ Modello BOOM');
  assert.throws(() => cpdf.buildContractPdfBytes({ contractId: 'cPaper', contract: store.get('contracts/cPaper') }), e => e.code === 'no_model_pdf');
  assert.deepEqual(writes.slice(w0), []);
});
await check('A · controllo: un contratto DIGITALE senza PDF lo riceve davvero (jspdf vero, upload, generatedPDF)', async () => {
  const url = await cpdf.ensureContractPdf('cDigital');
  assert.ok(url && /^https:\/\//.test(url), String(url));
  assert.ok(uploads.some(u => /contracts\/cDigital\/contract\.pdf/.test(u.name)));
  assert.ok(store.get('contracts/cDigital').generatedPDF);
});

// ═══ B · /sign: 409 prima di tutto ═══════════════════════════════════════════
await check('B · lookup col link di un contratto su CARTA: 409 not_signable «paper», nessun timbro, ping o PDF', async () => {
  const w0 = writes.length;
  const r = await call(lookup, { body: { token: 'tok-sign-paper-0001' } });
  assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'not_signable'); assert.equal(r.body.reason, 'paper');
  assert.deepEqual(writes.slice(w0), []);
  assert.ok(!store.get('contracts/cPaper').signViewedTenantAt);
});
await check('B · …anche il link del locatore (prima del blocco sequenziale) e il segnaposto: contract_missing', async () => {
  const r1 = await call(lookup, { body: { token: 'tok-sign-paper-0002' } });
  assert.equal(r1.statusCode, 409); assert.equal(r1.body.error, 'not_signable');
  const r2 = await call(lookup, { body: { token: 'tok-sign-hole-00001' } });
  assert.equal(r2.statusCode, 409); assert.equal(r2.body.reason, 'contract_missing');
  assert.ok(!keysOf('agentNotifications').length, 'nessun «ha aperto il contratto»');
});
await check('B · controllo: il contratto digitale si apre (200, ruolo inquilino)', async () => {
  const r = await call(lookup, { body: { token: 'tok-sign-digital-001' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.role, 'tenant');
});

// ═══ C · /snapshot ══════════════════════════════════════════════════════════
await check('C · /snapshot: «da firmare» esclude carta, segnaposto e complete; «scaduti» = BOOM_RENT, i segnalati a parte', async () => {
  const lines = snapshotLines({
    leads: [{ status: 'new' }, { status: 'contacted' }],
    contracts: [
      { status: 'active', signatureStatus: 'paper' }, { status: 'active', contractMissing: true },
      { status: 'active', tenantSignature: 'x' }, { status: 'active', signatureStatus: 'complete', tenantSignature: 'x', landlordSignature: 'y' },
      { status: 'draft' },
    ],
    payments: [
      { status: 'pending', amount: 100, dueDate: '2026-09-05' },
      { status: 'pending', amount: 100, dueDate: '2026-09-05', tenantReported: true },
      { status: 'overdue', amount: 100, dueDate: '2026-09-05', tenantReported: true },
      { status: 'pending', amount: 100, dueDate: '2026-12-05' },
      { status: 'paid', amount: 100, dueDate: '2026-09-05' },
    ],
    pendingActions: [{}], now: new Date('2026-10-13T10:00:00Z'),
  });
  const text = lines.join('\n');
  assert.match(text, /Contratti attivi: 4 · da firmare: 1\b/);
  assert.match(text, /Pagamenti scaduti: 1 · segnalati da verificare: 2/);
  assert.match(text, /Lead: 2 \(1 nuovi\)/);
});

// ═══ D · send-sign e resolve: il cancello del proprietario ═════════════════
put('preAgreements/pa_altrui', { token: 'b'.repeat(32), status: 'accepted', propertyId: 'p_altrui', tenant: { fullName: 'Altro Cliente', email: 'altro.cliente@example.invalid' } });
for (const [name, h] of [['send-sign', sendSign], ['resolve', resolvePa]]) {
  await check('D · ' + name + ': la proprietaria sulla proposta di un ALTRO → 403 forbidden_property, nessuna scrittura né email', async () => {
    const w0 = writes.length, m0 = mails().length;
    const r = await call(h, { token: 'tok-own1', body: { id: 'pa_altrui' } });
    assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'forbidden_property');
    assert.deepEqual(writes.slice(w0), []); assert.equal(mails().length, m0);
  });
}

// ═══ E · OCR e Q&A ═══════════════════════════════════════════════════════════
await check('E · storageUrlAllowed: solo https://firebasestorage.googleapis.com/v0/b/<bucket>/o/…', () => {
  const ok = ocr.storageUrlAllowed;
  assert.equal(ok('https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/documents%2Fa.pdf?alt=media&token=t'), true);
  for (const u of ['http://firebasestorage.googleapis.com/v0/b/x/o/a', 'https://firebasestorage.googleapis.com.evil.example.invalid/v0/b/x/o/a',
    'https://evil.example.invalid/a.pdf', 'https://u:p@firebasestorage.googleapis.com/v0/b/x/o/a', 'https://firebasestorage.googleapis.com:8443/v0/b/x/o/a',
    'https://firebasestorage.googleapis.com/other', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', '']) assert.equal(ok(u), false, u);
});
await check('E · OCR: la proprietaria riceve 403 (il modello non parte), l\'admin non scarica mai un host esterno (400)', async () => {
  const e0 = external.length;
  const r = await call(ocr.default, { token: 'tok-own1', body: { fileUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf' } });
  assert.equal(r.statusCode, 403);
  const a = await call(ocr.default, { token: 'tok-admin', body: { fileUrl: 'https://evil.example.invalid/secret.pdf' } });
  assert.equal(a.statusCode, 400); assert.equal(a.body.error, 'fileUrl_not_allowed');
  assert.equal(external.length, e0, 'nessuna richiesta verso un host esterno');
});
await check('E · Q&A: la proprietaria riceve 403 prima di qualunque lettura', async () => {
  const w0 = writes.length;
  const r = await call(qa, { token: 'tok-own1', body: { question: 'Quanto ho pagato di IMU?' } });
  assert.equal(r.statusCode, 403); assert.deepEqual(writes.slice(w0), []);
});

// ═══ F · i conti della carta ════════════════════════════════════════════════
put('payments/rCard', { contractId: 'cDigital', propertyId: 'p9', tenantId: 't1', type: 'rent', month: '2026-11', amount: 900, status: 'pending', dueDate: '2026-11-05' });
await check('F · carta incassata: la rata porta solo i fatti (pagata, data, via, ricevuta); commissione, costo, margine e carta in paymentCosts', async () => {
  const st = (globalThis.__rataStripe ||= { calls: [], sessions: new Map(), expired: [], intents: new Map(), rejectSuffix: false });
  st.intents.set('pi_s9_1', { id: 'pi_s9_1', metadata: { service: 'RENT', paymentId: 'rCard' },
    latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/s9', balance_transaction: { fee: 2605 }, payment_method_details: { card: { country: 'TR', brand: 'visa' } } } });
  const event = { id: 'evt_s9_1', type: 'checkout.session.completed', data: { object: { id: 'cs_s9_1', payment_intent: 'pi_s9_1', amount_total: 93000,
    customer_details: { email: 't1@example.invalid' }, metadata: { service: 'RENT', paymentId: 'rCard', amount: '900', fee: '30', contractId: 'cDigital' } } } };
  const res = mkRes(), raw = Buffer.from(JSON.stringify(event));
  await webhook({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield raw; } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const p = store.get('payments/rCard'), c = store.get('paymentCosts/rCard') || {};
  assert.equal(p.status, 'paid'); assert.equal(p.paidVia, 'stripe'); assert.ok(p.receiptUrl);
  for (const k of ['serviceFeeEur', 'stripeCostEur', 'marginEur', 'cardCountry', 'cardBrand']) assert.ok(!(k in p), k + ' sulla rata');
  assert.equal(c.serviceFeeEur, 30); assert.equal(c.stripeCostEur, 26.05); assert.equal(c.marginEur, 3.95);
  assert.equal(c.cardCountry, 'TR'); assert.equal(c.cardBrand, 'visa'); assert.equal(c.paidVia, 'stripe'); assert.equal(c.paymentId, 'rCard');
});
await check('F · BOOM_RENT.agencyCollections legge paymentCosts (rate nuove) E i campi storici sulla rata (la rata vince)', () => {
  const pays = [
    { id: 'n1', status: 'paid', amount: 900, paidDate: '2026-11-04', paidVia: 'stripe' },
    { id: 'old', status: 'paid', amount: 800, paidDate: '2026-10-04', paidVia: 'stripe', serviceFeeEur: 20, stripeCostEur: 15 },
    { id: 'n2', status: 'paid', amount: 700, paidDate: '2026-11-04', paidVia: 'sepa' },
  ];
  const costs = [{ id: 'n1', serviceFeeEur: 30, stripeCostEur: 26.05 }, { paymentId: 'old', serviceFeeEur: 99, stripeCostEur: 99 }];
  const b = RENT.agencyCollections(pays, 2026, costs);
  assert.equal(b.fees, 50); assert.equal(b.cardFees, 50); assert.equal(b.knownCosts, 41.05); assert.equal(b.unknownFeeCount, 1, 'la SEPA senza costi è dichiarata');
  assert.equal(RENT.agencyCollections(pays, 2026, { n1: { serviceFeeEur: 30 } }).fees, 50, 'anche un indice per id');
  assert.equal(RENT.agencyCollections(pays, 2026).unknownFeeCount, 2, 'senza paymentCosts nessuna commissione inventata');
});

// ═══ G · la segnalazione ritirata si toglie tutta ═══════════════════════════
const REPORTED = { contractId: 'cDigital', propertyId: 'p9', tenantId: 't1', type: 'rent', amount: 900, status: 'pending', dueDate: '2099-12-05',
  tenantReported: true, tenantReportedAt: '2026-10-10T09:00:00Z', tenantReportDate: '2026-10-09', tenantNotes: 'bonifico dalla banca X',
  proofUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/prova.jpg', proofName: 'prova.jpg',
  tenantReports: [{ at: '2026-10-10T09:00:00Z', date: '2026-10-09', note: 'bonifico dalla banca X', proofUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/prova.jpg', proofName: 'prova.jpg', via: 'link' }] };
await check('G · l\'inquilino ritira da /casa: data, nota, ricevuta ed elenco puliti, la segnalazione resta come storia', async () => {
  put('payments/rW1', { ...REPORTED, month: '2099-12' });
  const r = await call(report, { token: 'tok-t1', body: { paymentId: 'rW1', action: 'withdraw' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const p = store.get('payments/rW1');
  for (const k of ['tenantReportDate', 'tenantNotes', 'proofUrl', 'proofName', 'tenantReports']) assert.equal(p[k], null, k);
  assert.equal(p.tenantReported, false);
  assert.equal(p.tenantReportWithdrawn.by, 'tenant');
  assert.equal(p.tenantReportWithdrawn.reports[0].proofUrl, REPORTED.proofUrl);
});
await check('G · l\'operatore revoca (review_withdraw): stessa pulizia, motivo e reviewId nella storia, audit scritto', async () => {
  put('payments/rW2', { ...REPORTED, month: '2099-11' });
  const r = await call(report, { token: 'tok-admin', body: { paymentId: 'rW2', action: 'review_withdraw', reason: 'ricevuta di un altro conto, non corrisponde' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const p = store.get('payments/rW2');
  for (const k of ['tenantReportDate', 'tenantNotes', 'proofUrl', 'proofName', 'tenantReports']) assert.equal(p[k], null, k);
  const w = p.tenantReportWithdrawn;
  assert.equal(w.by, 'admin'); assert.equal(w.reviewId, r.body.reviewId); assert.match(w.reason, /altro conto/);
  assert.equal(w.reports.length, 1); assert.equal(w.reports[0].note, 'bonifico dalla banca X');
  assert.ok(store.has('activityLog/' + r.body.reviewId));
});

// ═══ H · una sola traslitterazione nei PDF fiscali ══════════════════════════
await check('H · fascicolo, valutazione e lettera di diffida usano wa() di _pdfbrand (nessuna copia locale): i nomi non latini restano leggibili', async () => {
  for (const f of ['api/fiscal/fascicolo.js', 'api/fiscal/valutazione.js', 'api/documents/demand-letter.js']) {
    const src = read(f);
    assert.ok(!/function wa\(|const wa = /.test(src), f + ': copia locale di wa()');
    assert.match(src, /import \{[^}]*\bwa\b[^}]*\} from '\.\.\/_pdfbrand\.js'/, f + ': wa() non viene da _pdfbrand');
  }
  const { wa } = await import('../../api/_pdfbrand.js');
  // il filtro vecchio dava «Çar ahin» e una stringa VUOTA per il cirillico
  assert.equal(wa('Çağrı Şahin'), 'Çagri Sahin');
  assert.equal(wa('Иван Петров'), 'Ivan Petrov');
  assert.equal(wa('€ 1.250,00 — l’unità…'), '€ 1.250,00 — l’unità…');
});

// ═══ I · il piede dell'email ═════════════════════════════════════════════════
await check('I · emailLang: lang dichiarata vince; un testo inglese → EN; pareggio o nessun indizio → IT', () => {
  assert.equal(notify.emailLang({ lang: 'en', heading: 'Pagamento ricevuto' }), 'en');
  assert.equal(notify.emailLang({ heading: 'Payment notification.', intro: 'Your payment has been received', cta_text: 'View payments' }), 'en');
  assert.equal(notify.emailLang({ heading: 'Pagamento ricevuto', intro: 'Il pagamento della rata è registrato' }), 'it');
  assert.equal(notify.emailLang({ heading: 'BOOM' }), 'it');
});
await check('I · l\'email inglese esce col piede inglese, l\'italiana con l\'italiano; un link di Storage lungo arriva INTERO', async () => {
  const long = 'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/' + encodeURIComponent('contracts/c1/ricevute/RIC-0001_' + 'a'.repeat(600) + '.pdf') + '?alt=media&token=' + 'b'.repeat(36);
  assert.ok(long.length > 300 && long.length <= notify.PORTAL_LINK_MAX);
  const r1 = await call(notify.default, { token: 'tok-admin', body: { to: 'tenant@example.invalid', params: { heading: 'Payment received.', intro: 'Your payment has been received. Thank you!', cta_text: 'View your receipt', portal_link: long } } });
  assert.equal(r1.statusCode, 200, JSON.stringify(r1.body));
  const html = mails().at(-1).html;
  assert.ok(html.includes('Automated message from the BOOM Portal.') && !html.includes('Messaggio automatico'));
  assert.ok(html.includes(long.replace(/&/g, '&amp;')), 'il link non è troncato');
  const r2 = await call(notify.default, { token: 'tok-admin', body: { to: 'operatore@example.invalid', params: { heading: 'Pagamento ricevuto', intro: 'Il pagamento della rata è registrato' } } });
  assert.equal(r2.statusCode, 200); assert.ok(mails().at(-1).html.includes('Messaggio automatico del BOOM Portal.'));
});
await check('I · un link oltre il tetto (2048) è 400 bad_link e nessuna email (mai troncato in silenzio)', async () => {
  const m0 = mails().length;
  const r = await call(notify.default, { token: 'tok-admin', body: { to: 'x@example.invalid', params: { heading: 'x', cta_text: 'Apri', portal_link: 'https://www.boomrome.com/' + 'a'.repeat(2100) } } });
  assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'bad_link'); assert.equal(mails().length, m0);
});

// ═══ N · la receptionist riconosce il conduttore ═══════════════════════════
await check('N · op=caller: il numero del co-intestatario → conduttore noto, SOLO nome di battesimo e ruolo (mai indirizzo, interno, id)', async () => {
  const r = await call(tools.default, { method: 'GET', query: { op: 'caller', phone: '+390000000072' }, headers: { 'x-homie-secret': process.env.HOMIE_SECRET } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.known, true); assert.equal(r.body.kind, 'cotenant'); assert.equal(r.body.firstName, 'Mehmet');
  const blob = JSON.stringify(r.body);
  for (const bad of ['Piazzale', 'Int. 7', 'cPaper', 'p7', 'Prova 42', '1600']) assert.ok(!blob.includes(bad), bad);
  assert.match(r.body.note, /never reveal or confirm/i);
});
await check('N · un numero sconosciuto → known:false; senza numero 400; senza chiave 401', async () => {
  const r = await call(tools.default, { method: 'GET', query: { op: 'caller', phone: '+390000000099' }, headers: { 'x-homie-secret': process.env.HOMIE_SECRET } });
  assert.equal(r.body.known, false);
  assert.equal((await call(tools.default, { method: 'GET', query: { op: 'caller' }, headers: { 'x-homie-secret': process.env.HOMIE_SECRET } })).statusCode, 400);
  assert.equal((await call(tools.default, { method: 'GET', query: { op: 'caller', phone: '+390000000072' } })).statusCode, 401);
});
await check('N · callerView puro: titolare → tenant col nome di battesimo; nulla → nuova richiesta', () => {
  assert.deepEqual(Object.keys(tools.callerView({ name: 'Şule Prova', role: 'tenant', propertyLabel: 'X', contractId: 'c' })).sort(), ['firstName', 'kind', 'known', 'note', 'ok']);
  assert.equal(tools.callerView({ name: 'Şule Prova', role: 'tenant' }).firstName, 'Şule');
  assert.equal(tools.callerView(null).known, false);
});

// ═══ K · cron, Squadra, CI ═══════════════════════════════════════════════════
await check('K · rendiconto: cron «10 6 1-5 * *» e CRON_DAYS del codice coincidono; la Squadra dichiara anteprima e invio incerto', async () => {
  const v = JSON.parse(read('vercel.json'));
  const cron = (v.crons || []).find(c => c.path === '/api/owners/rendiconto');
  assert.equal(cron && cron.schedule, '10 6 1-5 * *');
  const { CRON_DAYS } = await import('../../api/owners/rendiconto.js');
  assert.deepEqual([...CRON_DAYS], [1, 2, 3, 4, 5]);
  const SQ = require('../../js/squadra-registry.js');
  const a = SQ.get('rendiconto');
  assert.ok(a.autonomy.solo.some(x => /modalità automatica/.test(x)));
  assert.ok(a.autonomy.porta.some(x => /anteprima all'operatore/.test(x) && /presi in carico/.test(x)));
  assert.ok(a.autonomy.mai.some(x => /due volte lo stesso mese/.test(x)) && a.autonomy.mai.some(x => /incerto/.test(x) && /non si ritenta/.test(x)));
});
await check('K · CI: il job delle regole prova anche storage.rules (emulatori firestore+storage, storage.mjs)', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.slice(ci.indexOf('  firestore-rules:'), ci.indexOf('\n  smoke:'));
  assert.match(job, /cp \.\.\/\.\.\/storage\.rules \.\/storage\.rules/);
  assert.match(job, /emulators:exec --only firestore,storage --project demo-boom-rules 'node storage\.mjs'/);
});

// ═══ M · /casa e la console ═════════════════════════════════════════════════
await check('M · una ricevuta annullata non è una ricevuta (motore) e /casa la scarta anche con un motore in cache', () => {
  assert.equal(RENT.isReceiptDocument({ type: 'receipt', paymentId: 'x', voided: true }, 'x'), false);
  assert.equal(RENT.isReceiptDocument({ type: 'receipt', paymentId: 'x' }, 'x'), true);
  const casa = read('tenant.html');
  assert.match(casa, /receipt\.voided===true\|\|!window\.BOOM_RENT\.isReceiptDocument\(receipt,p\.id\)/);
});
await check('M · console proposte: il proprietario legge SOLO i suoi immobili, l\'immobile è obbligatorio, il 403 si dice', () => {
  const html = read('pre-agreement-admin.html');
  assert.match(html, /if\(ROLE!=='admin'&&USER&&USER\.uid\)q=q\.where\('ownerId','==',USER\.uid\)/);
  assert.match(html, /if\(ROLE!=='admin'&&!body\.propertyId\)\{err\.textContent='Scegli il tuo immobile/);
  assert.match(html, /code==='forbidden_property'/);
});

// ═══ L · il portal (funzioni VERE estratte, Firestore finto) ═════════════════
const SRC = read('js/portal-app.js');
function region(src, from, to) {
  const a = src.indexOf(from); if (a < 0) throw new Error('regione mancante: ' + from);
  const b = src.indexOf(to, a + from.length); if (b < 0) throw new Error('fine regione mancante: ' + to);
  return src.slice(a, b);
}
function fnSrc(src, name) {
  const at = src.indexOf('function ' + name + '('); if (at < 0) throw new Error('funzione mancante: ' + name);
  const start = src.lastIndexOf('\n', at) + 1;
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
  return src.slice(start, i + 1);
}
function portal(src = SRC, { admin = true, notifyOwner = true } = {}) {
  const st = new Map(), ws = [], ml = [], toasts = [], adds = [];
  const el = new Map();
  const getEl = id => { if (!el.has(id)) el.set(id, { innerHTML: '', textContent: '', value: '', checked: false, disabled: false, style: { display: 'none' }, files: [] }); return el.get(id); };
  const DEL = { __delete: true };
  const apply = (cur, data) => { const out = structuredClone(cur || {}); for (const [k, v] of Object.entries(data)) { if (v === DEL) delete out[k]; else if (v && v.__union) out[k] = [...(out[k] || []), ...v.__union]; else out[k] = structuredClone(v); } return out; };
  const snap = p => ({ id: p.split('/')[1], exists: st.has(p), data: () => (st.has(p) ? structuredClone(st.get(p)) : undefined) });
  const ref = p => ({ id: p.split('/')[1], path: p, get: async () => snap(p),
    update: async d => { if (!st.has(p)) throw new Error('not_found ' + p); st.set(p, apply(st.get(p), d)); ws.push(['update', p]); },
    set: async d => { st.set(p, apply({}, d)); ws.push(['set', p]); } });
  let n = 0;
  const db = {
    collection(col) {
      return { doc: id => ref(col + '/' + (id || 'auto' + (++n))),
        add: async d => { const id = col.slice(0, 3) + (++n); st.set(col + '/' + id, apply({}, d)); adds.push([col, d]); ws.push(['add', col + '/' + id]); return { id }; },
        where(f, op, v) { const fl = [[f, v]]; const q = { where(f2, o2, v2) { fl.push([f2, v2]); return q; }, limit() { return q; }, orderBy() { return q; },
          async get() { return { docs: [...st.keys()].filter(k => k.startsWith(col + '/') && fl.every(([a, b]) => st.get(k)[a] === b)).map(snap) }; } }; return q; },
        limit() { return { get: async () => ({ docs: [...st.keys()].filter(k => k.startsWith(col + '/')).map(snap) }) }; } };
    },
    async runTransaction(fn) {
      const staged = [];
      const res = await fn({ get: async r => snap(r.path), update: (r, d) => staged.push(['update', r.path, d]), set: (r, d) => staged.push(['set', r.path, d]) });
      for (const [k, p, d] of staged) { if (k === 'update') { if (!st.has(p)) throw new Error('not_found ' + p); st.set(p, apply(st.get(p), d)); } else st.set(p, apply({}, d)); ws.push([k, p]); }
      return res;
    },
  };
  const S = { profile: { id: admin ? 'admin' : 'own1', role: admin ? 'admin' : 'landlord', name: 'Operatore' }, users: [], properties: [], contracts: [], payments: [], documents: [], invoices: [], page: 'payments' };
  const ctx = vm.createContext({
    S, db, URL, setTimeout, clearTimeout, structuredClone, console: { log() {}, warn() {}, error() {}, info() {} },
    window: { BOOM_RENT: RENT, BOOM_CONTRACT_STATE: CS, location: { origin: 'https://www.boomrome.com', pathname: '/portal' } },
    document: { getElementById: getEl, body: { classList: { add() {}, remove() {} } }, querySelectorAll: () => [], hidden: false },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS', delete: () => DEL, arrayUnion: (...v) => ({ __union: v }) } }, storage: () => ({ ref: () => ({}) }) },
    auth: { currentUser: { uid: 'admin', getIdToken: async () => 'tok' } },
    fetch: async (url, opts) => {
      if (String(url).includes('/api/notify/send')) { ml.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
      if (String(url).includes('/api/sign/links')) return { ok: false, status: 409, json: async () => ({ ok: false, error: 'not_signable', reason: 'paper' }) };
      throw new Error('rete non prevista: ' + url);
    },
    toast: (...a) => toasts.push(a), confirm: () => true, logActivity: async () => {}, refresh: async () => {}, renderPage() {}, buildNav() {}, closeModal() {},
    isAdmin: () => admin, isTenant: () => false, isLandlord: () => !admin, sendBrowserNotification() {}, goTo() {}, notifyMaintenanceRequest: async () => {},
    COMPANY: { name: 'BOOM', legal: 'Egidi Immobiliare S.r.l.', iban: 'IT00X0000000000000000000000' },
    NOTIFY_OWNER: { enabled: notifyOwner, email: 'operatore@example.invalid', phone: '390000000000' }, EMAILJS_CONFIG: { templates: { notification: 'tpl' } },
    BOOM_INTERNAL_EMAILS: ['valentino@boom-rome.com'], boomEmailDenied() {},
  });
  const code = [
    region(src, '    const paymentFilters =', '    async function sendPaymentReminder('),
    region(src, '    async function sendPaymentReminder(', '    function refreshPaymentsView('),
    region(src, '    async function markPaymentPaid(', '    // ── Next invoice number'),
    region(src, '    async function notifyPaymentReceived(', '    async function notifyPaymentDueSoon('),
    region(src, '    async function createNotification(', '    async function notifyMultipleUsers('),
    fnSrc(src, 'sendBoomEmail'), fnSrc(src, 'esc'), fnSrc(src, 'jsq'), fnSrc(src, 'fmtDate'),
    fnSrc(src, 'agentFeedTs'), fnSrc(src, 'agentFeedMerge'), fnSrc(src, 'fetchSignLinks'), fnSrc(src, 'signLinkProblem'),
    "    const ASPI_ALLEGABILI = ['ape', 'planimetria', 'visura', 'delega', 'id_conduttore', 'id_locatore', 'esigenza'];\n" + fnSrc(src, '_aspiChecklistHtml'),
    fnSrc(src, 'saveTenantMaintenance'), fnSrc(src, 'handleFile'), 'let selectedFile = null;',
  ].join('\n');
  vm.runInContext(code, ctx);
  const seed = (data) => { st.clear(); for (const k of Object.keys(data)) { S[k] = structuredClone(data[k]); for (const d of data[k]) st.set(k + '/' + d.id, structuredClone(Object.fromEntries(Object.entries(d).filter(([x]) => x !== 'id')))); } };
  return { ctx, run: c => vm.runInContext(c, ctx), st, ws, ml, toasts, adds, getEl, seed, S };
}
const FIX = () => ({
  users: [{ id: 'own1', role: 'landlord', name: 'Chiara Prova', email: 'chiara@example.invalid' }, { id: 't9', role: 'tenant', name: 'Profilo Inquilino', email: 'profilo@example.invalid' }],
  properties: [{ id: 'p7', name: 'Int. 7', address: 'Piazzale Prova 42, Roma', ownerId: 'own1' }, { id: 'p9', name: 'Int. 9', address: 'Piazzale Prova 42, Roma', ownerId: 'own1', currentContractId: 'c9old' }],
  contracts: [
    { id: 'c7', propertyId: 'p7', status: 'active', tenantName: 'Şule Prova', tenantPhone: '+39 000 000 0071', source: 'palazzo-import', signatureStatus: 'paper', startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600 },
    { id: 'c9', propertyId: 'p9', tenantId: 't9', status: 'active', tenantName: 'Profilo Inquilino', startDate: '2026-10-01', endDate: '2027-09-30', rent: 900 },
    { id: 'c9old', propertyId: 'p9', tenantId: 't9', status: 'expired', tenantName: 'Profilo Inquilino', startDate: '2025-10-01', endDate: '2026-09-30', rent: 850 },
  ],
  payments: [
    { id: 'pRefund', contractId: 'c9', propertyId: 'p9', tenantId: 't9', type: 'rent', month: '2026-10', amount: 900, dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-04', paidVia: 'stripe',
      stripeSessionId: 'cs_r1', checkoutSessionId: 'cs_r1', refundedAt: '2026-10-10T10:00:00Z', refundedAmount: 900, refundedFull: true },
    { id: 'pDispute', contractId: 'c9', propertyId: 'p9', tenantId: 't9', type: 'rent', month: '2026-11', amount: 900, dueDate: '2026-11-05', status: 'paid', paidDate: '2026-11-04', paidVia: 'stripe',
      stripeSessionId: 'cs_d1', checkoutSessionId: 'cs_d1', disputeStatus: 'open', disputeAt: '2026-11-10T10:00:00Z' },
    { id: 'pLost', contractId: 'c9', propertyId: 'p9', tenantId: 't9', type: 'rent', month: '2026-12', amount: 900, dueDate: '2026-12-05', status: 'paid', paidDate: '2026-12-04', paidVia: 'stripe',
      stripeSessionId: 'cs_l1', checkoutSessionId: 'cs_l1', disputeStatus: 'lost' },
    { id: 'pCard', contractId: 'c9', propertyId: 'p9', tenantId: 't9', type: 'rent', month: '2027-01', amount: 900, dueDate: '2027-01-05', status: 'paid', paidDate: '2027-01-04', paidVia: 'stripe', stripeSessionId: 'cs_c1' },
    { id: 'pDue', contractId: 'c9', propertyId: 'p9', tenantId: 't9', type: 'rent', month: '2026-09', amount: 900, dueDate: '2026-09-05', status: 'pending' },
    { id: 'p7due', contractId: 'c7', propertyId: 'p7', type: 'rent', month: '2026-09', amount: 1600, dueDate: '2026-09-15', status: 'pending' },
  ],
  documents: [], invoices: [],
});

await check('L · Canoni: «review» ha la sua etichetta e il suo filtro Stato (mai «Da verificare» generico)', () => {
  const P = portal();
  assert.equal(P.run("rentStateLabel('review')"), 'Rimborso/contestazione');
  assert.match(SRC, /\['review','Rimborso\/contestazione'\]/);
  assert.match(SRC, /review:'! Rimborso'/);
  assert.equal(RENT.paymentState(FIX().payments[0]), 'review');
});
await check('L · undoIncasso: un rimborso TOTALE riapre la rata; sessioni Stripe e segni del rimborso restano come storia', async () => {
  const P = portal(); P.seed(FIX());
  assert.equal(await P.run("undoIncasso('pRefund')"), true);
  const p = P.st.get('payments/pRefund');
  assert.equal(p.status, 'pending'); assert.equal(p.stripeSessionId, 'cs_r1'); assert.equal(p.checkoutSessionId, 'cs_r1');
  assert.equal(p.refundedFull, true); assert.equal(p.incassoAnnullato.was.reopenedFor, 'refund');
  assert.ok(!('paidDate' in p) && !('paidVia' in p));
});
await check('L · …la contestazione PERSA anche; con la contestazione APERTA no (si aspetta l\'esito), e un incasso con carta normale resta intoccabile', async () => {
  const P = portal(); P.seed(FIX());
  assert.equal(await P.run("undoIncasso('pLost')"), true);
  assert.equal(P.st.get('payments/pLost').incassoAnnullato.was.reopenedFor, 'dispute_lost');
  const w0 = P.ws.length;
  assert.equal(await P.run("undoIncasso('pDispute')"), false);
  assert.match(P.toasts.at(-1)[1], /Contestazione in corso/);
  assert.equal(await P.run("undoIncasso('pCard')"), false);
  assert.match(P.toasts.at(-1)[1], /Incasso automatico/);
  assert.equal(P.ws.length, w0, 'nessuna scrittura');
});
await check('L · «Registra incasso» fatto dall\'operatore: nessuna email-copia a Valentino (prima due per incasso, con la riga IBAN)', async () => {
  const P = portal(); P.seed(FIX());
  assert.equal(await P.run("markPaymentPaid('pDue',{paidDate:'2026-09-04',paidVia:'bonifico',paidEvidence:'conferma-proprietaria',notifyTenant:false})"), true);
  // la copia all'operatore parte senza await (fire-and-forget): si lascia il tempo di arrivare
  await new Promise(r => setTimeout(r, 40));
  assert.equal(P.ml.filter(m => m.to === 'operatore@example.invalid').length, 0);
  // una notifica d'altro tipo continua ad arrivare in copia
  await P.run("createNotification('t9','maintenance','Aggiornamento','Il tecnico passa domani',{propertyId:'p9'})");
  await new Promise(r => setTimeout(r, 40));
  assert.equal(P.ml.filter(m => m.to === 'operatore@example.invalid').length, 1);
});
await check('L · il feed degli avvisi: storico + finestra recente uniti per id, solo pending, il più recente prima (ISO e timestamp)', () => {
  const P = portal();
  P.ctx.__parts = {
    legacy: Array.from({ length: 50 }, (_, i) => ({ id: 'old' + i, status: 'pending', createdAt: '2026-01-0' + (1 + (i % 9)) + 'T10:00:00Z' })),
    iso: [{ id: 'payrep_x_1', status: 'pending', createdAt: '2026-10-12T09:00:00Z', priority: 'high' }, { id: 'old3', status: 'pending', createdAt: '2026-01-04T10:00:00Z' }, { id: 'done', status: 'sent', createdAt: '2026-10-12T08:00:00Z' }],
    ts: [{ id: 'maint_y', status: 'pending', createdAt: { seconds: Date.parse('2026-10-12T11:00:00Z') / 1000 } }],
  };
  const feed = P.run('agentFeedMerge(__parts)');
  assert.equal(feed.slice(0, 2).map(a => a.id).join(','), 'maint_y,payrep_x_1');
  assert.equal(feed.length, 52); assert.ok(!feed.some(a => a.id === 'done'));
  const body = fnSrc(SRC, 'startAgentFeedListener');
  assert.match(body, /where\('createdAt', '>=', since\.toISOString\(\)\)\.orderBy\('createdAt', 'desc'\)/);
  assert.match(body, /where\('createdAt', '>=', since\)\.orderBy\('createdAt', 'desc'\)/);
});
await check('L · le rate col giorno 29-31: il portal e la firma digitale danno lo STESSO piano (scadenza dentro il mese)', async () => {
  const { rentSchedule } = await import('../../api/magic-sign/submit.js');
  const head = 'async function generateMonthlyPayments(contractId, contract) {';
  const at = SRC.indexOf(head);
  let depth = 0, end = -1;
  for (let i = at + head.length - 1; i < SRC.length; i++) { if (SRC[i] === '{') depth++; else if (SRC[i] === '}') { depth--; if (!depth) { end = i + 1; break; } } }
  const body = SRC.slice(at, end);
  const plan = async (contract) => {
    const sets = [];
    const db = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }), doc: id => ({ id }) }),
      batch: () => ({ set: (r, d) => sets.push({ id: r.id, ...d }), commit: async () => {} }) };
    const gen = new Function('db', 'firebase', 'console', body + '\nreturn generateMonthlyPayments;')(db, { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } }, { log() {}, warn() {} });
    await gen('cX', contract);
    return sets.map(s => [s.month, s.dueDate, s.amount, s.installmentMonths, s.coversTo].join('|'));
  };
  let diff = 0, n = 0;
  for (const start of ['2026-11-01', '2027-01-01', '2026-02-01', '2027-03-01']) {
    for (const payDay of [29, 30, 31]) {
      for (const step of [1, 3]) {
        const s = new Date(start + 'T00:00:00Z');
        const e = new Date(Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate() - 1)).toISOString().slice(0, 10);
        const c = { startDate: start, endDate: e, rent: 900, paymentDay: payDay, installmentMonths: step };
        const a = rentSchedule(c).map(x => [x.month, x.dueDate, x.amount, x.installmentMonths, x.coversTo].join('|')), b = await plan(c);
        n++; if (a.join(';') !== b.join(';')) diff++;
        for (const row of b) assert.equal(row.split('|')[1].slice(0, 7), row.split('|')[0], 'scadenza fuori dal mese: ' + row);
      }
    }
  }
  assert.equal(diff, 0, diff + ' piani diversi su ' + n);
});
await check('L · ASPI: la riga «contratto» di un contratto su CARTA ha il tasto 📎 (flag del server); senza flag no', () => {
  const P = portal();
  P.ctx.__items = [{ key: 'contratto', label: 'Contratto firmato su carta', state: 'missing', allegabile: true, accept: 'application/pdf' }];
  assert.match(P.run('_aspiChecklistHtml(__items)'), /aspiAllega\('contratto'\)/);
  P.ctx.__items = [{ key: 'contratto', label: 'Contratto', state: 'ok' }];
  assert.ok(!/aspiAllega/.test(P.run('_aspiChecklistHtml(__items)')));
  assert.match(fnSrc(SRC, 'aspiAllega'), /inp\.accept = item\.accept \|\|/);
});
await check('L · il guasto dal portal porta il contratto ATTIVO dell\'inquilino (le rules lo pretendono)', async () => {
  const P = portal(); P.seed(FIX());
  P.S.profile = { id: 't9', role: 'tenant', name: 'Profilo Inquilino' };
  P.ctx.FormData = function () { return Object.entries({ propertyId: 'p9', title: 'Perdita lavandino', category: 'plumbing', priority: 'high', description: 'goccia' }); };
  await P.run('saveTenantMaintenance({preventDefault(){},target:null})');
  const [col, d] = P.adds.at(-1);
  assert.equal(col, 'maintenance'); assert.equal(d.contractId, 'c9', 'il contratto attivo, non il corrente scaduto');
  P.S.contracts = P.S.contracts.filter(c => c.id !== 'c9');
  await P.run('saveTenantMaintenance({preventDefault(){},target:null})');
  assert.equal(P.adds.at(-1)[1].contractId, 'c9old', 'senza attivo, il corrente dell\'immobile');
  P.S.contracts = [];
  await P.run('saveTenantMaintenance({preventDefault(){},target:null})');
  assert.ok(!('contractId' in P.adds.at(-1)[1]), 'nessun contratto: nessun campo inventato');
});
await check('L · sollecito di chi non ha profilo, numero sicuro: WhatsApp col link della SUA rata e la lingua inglese', async () => {
  const P = portal(); P.seed(FIX());
  P.ctx.fetch = async (url, opts) => {
    if (String(url).includes('/api/payments/rata')) { const b = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true, links: { [b.paymentIds[0]]: 'https://www.boomrome.com/rata?id=' + b.paymentIds[0] + '&t=prova' }, skipped: {} }) }; }
    throw new Error('rete non prevista: ' + url);
  };
  await P.run("sendPaymentReminder('p7due')");
  const html = P.getEl('modals').innerHTML;
  assert.match(html, /wa\.me\/390000000071/);
  assert.ok(html.includes('rata?id=p7due&amp;t=prova&amp;lang=en'));
  assert.match(html, /Hello Şule, this is BOOM/);
  assert.equal(P.ml.length, 0);
});
await check('L · i link di firma: il 409 not_signable porta codice e motivo, e si dice «Niente da firmare», mai «link non disponibile»', async () => {
  const P = portal();
  let err = null;
  try { await P.run("fetchSignLinks('c7')"); } catch (e) { err = e; }
  assert.ok(err); assert.equal(err.code, 'not_signable'); assert.equal(err.reason, 'paper');
  P.ctx.__e = err;
  const why = P.run('signLinkProblem(__e)');
  assert.equal(why.level, 'info'); assert.equal(why.title, 'Niente da firmare'); assert.match(why.text, /firmato su carta/);
  P.ctx.__e2 = Object.assign(new Error('HTTP 500'), { code: 'HTTP 500' });
  assert.equal(P.run('signLinkProblem(__e2)').level, 'error');
  const firma = fnSrc(SRC, 'openFirmaOra');
  assert.match(firma, /if \(e && e\.code === 'not_signable'\) \{ const why = signLinkProblem\(e\); return toast/);
});
await check('L · OCR del portal: il tasto «Analizza con AI» compare solo all\'admin', () => {
  for (const [admin, shown] of [[true, 'inline-flex'], [false, 'none']]) {
    const P = portal(SRC, { admin });
    const fake = { files: [{ name: 'f.pdf', size: 100 }] };
    P.ctx.__in = fake;
    P.run('handleFile(__in)');
    assert.equal(P.getEl('ocrBtn').style.display, shown, 'admin=' + admin);
  }
  assert.match(fnSrc(SRC, 'runDocOCR'), /if \(!isAdmin\(\)\) return;/);
});
await check('L · Egidi: commissioni e costi delle rate NUOVE arrivano da paymentCosts (e la lettura è solo admin)', () => {
  const P = portal();
  const a = SRC.indexOf('    function egidiPaymentBreakdown(');
  vm.runInContext(SRC.slice(a, SRC.indexOf('    function egidiAgencyFundsBlock(', a)), P.ctx);
  P.S.payments = [{ id: 'n1', status: 'paid', amount: 900, paidDate: '2026-11-04', paidVia: 'stripe' }];
  P.S.paymentCosts = [{ id: 'n1', serviceFeeEur: 30, stripeCostEur: 26.05 }];
  const b = P.run('egidiPaymentBreakdown(2026)');
  assert.equal(b.fees, 30); assert.equal(b.knownCosts, 26.05); assert.equal(b.unknownFeeCount, 0);
  assert.match(fnSrc(SRC, 'ensurePaymentCosts'), /if \(!isAdmin\(\)\) return Promise\.resolve\(\[\]\)/);
});

// ═══ Le mutazioni: rimesso il difetto, la suite deve cadere ═══════════════
if (!CHILD) {
  const { MUTATIONS } = await import('./leftovers-loader.mjs');
  for (const key of Object.keys(MUTATIONS)) {
    const r = spawnSync(process.execPath, [SELF], { env: { ...process.env, LEFTOVERS_MUTATION: key }, encoding: 'utf8', timeout: 120000 });
    await check('mutazione presa: ' + key, () => {
      const out = (r.stdout || '') + (r.stderr || '');
      assert.ok(!/non applicata/.test(out), 'mutazione non applicata (sorgente cambiato): ' + out.slice(-300));
      assert.notEqual(r.status, 0, 'la suite resta verde col difetto rimesso');
    });
  }
}

if (CHILD) { console.log('[' + process.env.LEFTOVERS_MUTATION + '] ' + passed + ' passed, ' + failed + ' failed' + (fails.length ? ': ' + fails.join(' | ') : '')); process.exit(failed ? 1 : 0); }
console.log(`\n${passed} passed, ${failed} failed — le cose rimaste fra i filoni (S9), handler e funzioni veri, dati inventati.`);
if (failed) { console.log('FALLITI: ' + fails.join(' | ')); process.exit(1); }
