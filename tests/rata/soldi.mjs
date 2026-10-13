// tests/rata/soldi.mjs — i soldi della rata senza login: la carta che si
// accende solo col mandato, la commissione che non c'è se non scelta, la
// ricevuta che arriva a chi ha pagato, il ritorno da Stripe su /rata, la data
// di Roma, la seconda segnalazione che non sparisce, il doppio incasso che
// suona, i rimborsi e le contestazioni che tolgono il "pagato".
//
// Handler VERI (api/payments/rata.js, link.js, pay.js, api/stripe-webhook.js)
// su un Firestore in memoria che versiona i documenti; finti solo Stripe,
// nodemailer, Storage, Telegram e Identity Toolkit (tests/rata/loader.mjs).
// Il motore (js/rent-engine.js) si prova anche puro, caricato in una vm così
// che una mutazione del suo sorgente faccia cadere la suite.
// Dati inventati: nomi d'esempio, +39 000…, @example.invalid, IBAN di prova.
//
// Uso: node tests/rata/soldi.mjs   (mutazioni: node tests/rata/soldi-mutate.mjs)
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
register('./loader.mjs', import.meta.url);

Object.assign(process.env, {
  FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'svc@example.invalid', FIREBASE_ADMIN_PASS: 'p', FIREBASE_PROJECT_ID: 'test-proj',
  HOMIE_SECRET: 'segreto-di-prova-rata', STRIPE_SECRET_KEY: 'sk_test_rata', STRIPE_WEBHOOK_SECRET: 'whsec_rata',
  TELEGRAM_BOT_TOKEN: 'tg-test', TELEGRAM_CHAT_ID: '1', GMAIL_USER: 'boom@example.invalid',
});
for (const k of ['RENT_FEE_PCT', 'RENT_FEE_MIN', 'RENT_FEE_BUFFER', 'RENT_FEE_MAX_PCT', 'PUBLIC_BASE_URL', 'FIREBASE_STORAGE_BUCKET']) delete process.env[k];

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { const ok = await fn(); if (ok === false) throw new Error('condizione falsa'); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ' — ' + (e && e.message)); }
};
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((what || '') + ' atteso ' + JSON.stringify(b) + ', trovato ' + JSON.stringify(a)); return true; };
const ok = (c, what) => { if (!c) throw new Error(what || 'falso'); return true; };

// ─── Firestore in memoria (versionato), Storage, Telegram ──────────────────
const store = new Map(), versions = new Map(), uploads = [], tg = [];
let tick = 0, auto = 0;
const failGet = new Set();
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
const SESSIONS = { 'tok-admin': 'admin1', 'tok-t1': 't1' };

globalThis.fetch = async (input, opts = {}) => {
  const url = String(input);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? json({ users: [{ localId: uid, email: uid + '@example.invalid' }] }) : json({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return json({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('api.telegram.org')) { tg.push(JSON.parse(opts.body || '{}').text || ''); return json({ ok: true }); }
  if (url.includes('firebasestorage.googleapis.com')) {
    const name = decodeURIComponent(url.split('name=')[1] || '');
    uploads.push({ name, type: (opts.headers || {})['Content-Type'] });
    return json({ name, downloadTokens: 'dl' });
  }
  if (!url.includes('firestore.googleapis.com')) throw new Error('rete inattesa: ' + url);
  const after = url.slice(url.indexOf('/documents') + 10);
  const method = (opts.method || 'GET').toUpperCase();
  if (after.startsWith(':batchGet')) {
    const docs = JSON.parse(opts.body || '{}').documents || [];
    return json(docs.map(n => { const k = n.split('/documents/')[1]; return store.has(k) ? { found: { name: n, fields: toFields(store.get(k)), updateTime: ut(k) } } : { missing: n }; }));
  }
  if (after.startsWith(':runQuery')) {
    // Il minimo per fsList (api/payments/_sdd.js): una collezione, un filtro
    // EQUAL anche su un campo annidato (sdd.status), un tetto.
    const q = JSON.parse(opts.body || '{}').structuredQuery || {}, coll = q.from[0].collectionId;
    const ff = q.where && q.where.fieldFilter, want = ff ? fromFs(ff.value) : null;
    const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
    const rows = [...store.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2)
      .filter(([, d]) => !ff || get(d, ff.field.fieldPath) === want).slice(0, q.limit || 50);
    return json(rows.map(([k, d]) => ({ document: { name: 'projects/test-proj/databases/(default)/documents/' + k, fields: toFields(d), updateTime: ut(k) } })));
  }
  if (after.startsWith(':commit')) {
    const writes = JSON.parse(opts.body).writes;
    for (const w of writes) {
      const k = w.update.name.split('/documents/')[1];
      if (w.currentDocument.updateTime && w.currentDocument.updateTime !== ut(k)) return json({ error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
    }
    for (const w of writes) {
      const k = w.update.name.split('/documents/')[1], cur = { ...(store.get(k) || {}) };
      for (const f of w.updateMask.fieldPaths) cur[f] = f in w.update.fields ? fromFs(w.update.fields[f]) : undefined;
      put(k, cur);
    }
    return json({ writeResults: writes.map(() => ({})) });
  }
  const [rawPath, qs] = after.replace(/^\//, '').split('?');
  const path = decodeURIComponent(rawPath);
  const params = new URLSearchParams(qs || '');
  if (method === 'POST') {
    const id = params.get('documentId') || 'auto' + (++auto);
    const key = path + '/' + id;
    if (store.has(key)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    put(key, Object.fromEntries(Object.entries(JSON.parse(opts.body).fields || {}).map(([k, v]) => [k, fromFs(v)])));
    return json({ name: 'projects/test-proj/databases/(default)/documents/' + key, fields: toFields(store.get(key)) });
  }
  if (method === 'PATCH') {
    if (params.get('currentDocument.exists') === 'false' && store.has(path)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    const mask = params.getAll('updateMask.fieldPaths').map(decodeURIComponent);
    const incoming = JSON.parse(opts.body).fields || {};
    const cur = { ...(store.get(path) || {}) };
    for (const f of (mask.length ? mask : Object.keys(incoming))) cur[f] = f in incoming ? fromFs(incoming[f]) : undefined;
    put(path, cur);
    return json({ name: 'projects/test-proj/databases/(default)/documents/' + path, fields: toFields(cur) });
  }
  if (failGet.has(path)) return json({ error: { code: 500 } }, 500);
  if (!store.has(path)) return json({}, 404);
  return json({ name: 'projects/test-proj/databases/(default)/documents/' + path, fields: toFields(store.get(path)), updateTime: ut(path) });
};

// ─── Il palazzo d'esempio ──────────────────────────────────────────────────
const IBAN = 'IT60X0542811101000000123456';
const imported = { source: 'palazzo-import', signatureStatus: 'paper', landlordName: 'Esempio Immobiliare S.r.l.', landlordIban: IBAN };
put('users/admin1', { role: 'admin', name: 'Operatore' });
put('users/t1', { role: 'tenant', name: 'Inquilina Casa' });
put('settings/rentFeeStats', { count: 10, volumeEur: 9000, costEur: 182.5, fixedEur: 2.5 });
const prop = (id, extra) => put('properties/' + id, { ownerId: 'own1', address: 'Piazzale Esempio 42, Roma', interno: '7', name: 'Piazzale Esempio 42 int. 7', source: 'palazzo-import', ...extra });
prop('pImp', {});
prop('pImpOn', { interno: '8', rataCard: { on: true, mandateAt: '2026-10-01', fee: 'absorbed', note: 'mandato firmato', by: 'admin1', at: '2026-10-01T10:00:00Z' } });
prop('pImpSur', { interno: '9', rataCard: { on: true, mandateAt: '2026-10-01', fee: 'surcharge' } });
prop('pImpNoDate', { interno: '10', rataCard: { on: true, mandateAt: null } });
put('properties/pStd', { ownerId: 'own2', address: 'Via Esempio 1, Roma', name: 'Via Esempio 1' });
put('contracts/cImp', { ...imported, propertyId: 'pImp', tenantName: 'Ayse Esempio', tenantPhone: '+39 000 000 0001', tenantEmail: 'ayse@example.invalid',
  landlordBic: 'BPMOIT22XXX', coTenants: [{ name: 'Mehmet Esempio' }] });
put('contracts/cImpOn', { ...imported, propertyId: 'pImpOn', tenantName: 'Lena Esempio', tenantEmail: 'lena@example.invalid' });
put('contracts/cImpSur', { ...imported, propertyId: 'pImpSur', tenantName: 'Omar Esempio' });
put('contracts/cImpNoDate', { ...imported, propertyId: 'pImpNoDate', tenantName: 'Ivan Esempio' });
put('contracts/cStd', { propertyId: 'pStd', tenantId: 't1', tenantName: 'Inquilina Casa', landlordName: 'Proprietario Esempio', landlordIban: 'IT60 X054 2811 1010 0000 0123 456' });
const rate = (id, c, p, extra) => put('payments/' + id, { contractId: c, propertyId: p, type: 'rent', month: '2026-10', amount: 1720, rentAmount: 1600, oneriAmount: 120,
  status: 'pending', dueDate: '2026-10-05', source: 'palazzo-import', ...extra });
rate('rImp', 'cImp', 'pImp');
rate('rImpOn', 'cImpOn', 'pImpOn');
rate('rImpSur', 'cImpSur', 'pImpSur');
rate('rImpNoDate', 'cImpNoDate', 'pImpNoDate');
put('payments/rStd', { contractId: 'cStd', propertyId: 'pStd', tenantId: 't1', type: 'rent', month: '2026-10', amount: 900, status: 'pending', dueDate: '2026-10-05' });
rate('rPro', 'cImp', 'pImp', { month: '2027-08', amount: 500, rentAmount: 465, oneriAmount: 35, dueDate: '2027-08-15', periodFrom: '2027-08-15', periodTo: '2027-08-31', prorated: true });
rate('rPaid', 'cImpOn', 'pImpOn', { month: '2026-09', status: 'paid', paidDate: '2026-09-04', paidVia: 'stripe', receiptUrl: 'https://pay.stripe.com/receipts/esempio' });
rate('rPaidHttp', 'cImpOn', 'pImpOn', { month: '2026-08', status: 'paid', paidDate: '2026-08-04', paidVia: 'stripe', receiptUrl: 'http://insicuro.example.invalid/r' });

const { default: rataH, rataView, romeDay, latestReportDay } = await import('../../api/payments/rata.js');
const { default: linkH } = await import('../../api/payments/link.js');
const { default: payH, measuredCost } = await import('../../api/payments/pay.js');
const { default: webhook } = await import('../../api/stripe-webhook.js');
const { default: reportH } = await import('../../api/payments/report.js');
const { payToken } = await import('../../api/payments/_token.js');
const RENT = (await import('../../js/rent-engine.js')).default;
const stripe = () => globalThis.__rataStripe || (globalThis.__rataStripe = { calls: [], sessions: new Map(), expired: [], intents: new Map(), rejectSuffix: false });
stripe();
const mails = () => globalThis.__rataMails || [];
const tk = id => payToken('pay', id);
const notes = () => [...store.keys()].filter(k => k.startsWith('agentNotifications/'));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]).toString('base64');
const JPEG2 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 1, 1, 1]).toString('base64');

let ipN = 0;
const mkRes = () => ({ statusCode: 200, headers: {}, body: null, url: '',
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }, send(o) { this.body = o; return this; }, end() { return this; },
  redirect(c, u) { this.statusCode = c; this.url = u; return this; } });
async function rata(body, { token } = {}) {
  const res = mkRes(), headers = { 'x-forwarded-for': '10.1.0.' + (++ipN) };
  if (token) headers.authorization = 'Bearer ' + token;
  await rataH({ method: 'POST', headers, body, query: {} }, res);
  return res;
}
async function link(id, extra = {}, headers = {}) {
  const res = mkRes();
  await linkH({ method: 'GET', headers, query: { k: 'pay', id, t: tk(id), ...extra } }, res);
  return res;
}
async function pay(body, token) {
  const res = mkRes();
  await payH({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body }, res);
  return res;
}
async function hook(event) {
  const res = mkRes();
  const raw = Buffer.from(JSON.stringify(event));
  await webhook({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield raw; } }, res);
  return res;
}
// L'orologio fermo su un istante: per mezzanotte a Roma.
const RealDate = Date;
async function at(iso, fn) {
  const fixed = RealDate.parse(iso);
  globalThis.Date = class extends RealDate { constructor(...x) { super(...(x.length ? x : [fixed])); } static now() { return fixed; } };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}

// ═══ 1. IL MOTORE, puro (anche mutato: RATA_MUTATION=engine-*) ═══════════
let engineSrc = readFileSync(new URL('../../js/rent-engine.js', import.meta.url), 'utf8');
const ENGINE_MUT = {
  'engine-moneyback': ["if (DISPUTE_LIVE.includes(key(p.disputeStatus))) return 'dispute';", "if (false) return 'dispute';"],
  'engine-policy': ["if (!imported) return { available: true", "if (true) return { available: true"],
  'engine-review-pay': ["return moneyBack(p) ? 'payment_review' : 'already_paid';", "return 'already_paid';"],
};
const em = ENGINE_MUT[process.env.RATA_MUTATION || ''];
if (em) { const next = engineSrc.replace(em[0], em[1]); if (next === engineSrc) throw new Error('mutazione motore non applicata'); engineSrc = next; }
const sandbox = { module: { exports: {} }, require: (p) => p === './contract-state.js' ? (globalThis.__cs ||= (() => { const m = { exports: {} }; vm.runInNewContext(readFileSync(new URL('../../js/contract-state.js', import.meta.url), 'utf8'), { module: m }); return m.exports; })()) : null, Intl, console };
sandbox.module.exports = {};
vm.runInNewContext(engineSrc, sandbox);
const E = sandbox.module.exports;

await check('motore · carta: un contratto normale resta com\'era (accesa, commissione misurata)', () =>
  eq(E.cardPolicy({ status: 'pending' }, { propertyId: 'x' }, {}), { available: true, reason: '', fee: 'standard', imported: false, mandateAt: '' }));
await check('motore · carta: preso in carico dal Palazzo e senza rataCard = SPENTA', () =>
  eq([E.cardPolicy({}, { source: 'palazzo-import' }, {}).available, E.cardPolicy({}, { source: 'palazzo-import' }, {}).reason], [false, 'card_off']));
await check('motore · carta: anche se il contratto non si legge, la rata importata la spegne da sé', () =>
  eq(E.cardPolicy({ source: 'palazzo-import' }, null, null).available, false));
await check('motore · carta: on:true senza data del mandato resta spenta (no_mandate)', () =>
  eq(E.cardPolicy({}, { source: 'palazzo-import' }, { rataCard: { on: true, mandateAt: '' } }).reason, 'no_mandate'));
await check('motore · carta: col mandato è accesa e la commissione è ASSORBITA per default; surcharge solo se scelta', () =>
  eq([E.cardPolicy({}, { source: 'palazzo-import' }, { rataCard: { on: true, mandateAt: '2026-10-01' } }).fee,
    E.cardPolicy({}, { source: 'palazzo-import' }, { rataCard: { on: true, mandateAt: '2026-10-01', fee: 'surcharge' } }).fee,
    E.cardPolicy({}, { source: 'palazzo-import' }, { rataCard: { on: true, mandateAt: '2026-10-01', fee: 'boh' } }).fee], ['absorbed', 'surcharge', 'absorbed']));
const paidCard = { status: 'paid', amount: 1720, paidDate: '2026-10-04', paidVia: 'stripe' };
await check('motore · rimborso totale: la rata non è più pagata — da verificare, mai pagabile da sola', () =>
  eq([E.paymentState({ ...paidCard, refundedAt: '2026-10-10T10:00:00Z', refundedAmount: 1720, refundedFull: true }),
    E.canPay({ ...paidCard, refundedAt: 'x', refundedFull: true }), E.paymentBlockReason({ ...paidCard, refundedAt: 'x', refundedFull: true })], ['review', false, 'payment_review']));
await check('motore · rimborso della sola commissione: la rata resta pagata', () =>
  eq(E.paymentState({ ...paidCard, refundedAt: 'x', refundedAmount: 25, refundedFull: false }), 'paid'));
await check('motore · contestazione aperta o persa = da verificare; vinta = pagata', () =>
  eq(['open', 'lost', 'won', 'warning_closed'].map(s => E.paymentState({ ...paidCard, disputeStatus: s })), ['review', 'review', 'paid', 'paid']));
await check('motore · una rata riaperta dall\'operatore (pending) torna pagabile anche con i segni del rimborso', () =>
  eq([E.paymentState({ status: 'pending', amount: 1720, dueDate: '2099-01-05', refundedAt: 'x', refundedFull: true }), E.canPay({ status: 'pending', amount: 1720, dueDate: '2099-01-05', disputeStatus: 'lost' })], ['due', true]));
await check('motore · annullata = cancelled, mai pagabile; il conteggio delle rate da verificare esiste', () => {
  eq([E.paymentState({ status: 'cancelled', amount: 1 }), E.canPay({ status: 'cancelled', amount: 1 })], ['cancelled', false]);
  const v = E.overview({ payments: [{ id: 'a', ...paidCard, month: '2026-10', disputeStatus: 'open' }] });
  return eq([v.counts.review, v.counts.paid, v.totals.paid], [1, 0, 0]);
});

// ═══ 2. /rata: la carta, il bonifico, il periodo ═══════════════════════════
await check('rata · contratto del Palazzo senza mandato: niente carta, niente commissione, niente link — solo il bonifico', async () => {
  const r = await rata({ op: 'lookup', id: 'rImp', t: tk('rImp') });
  const v = r.body.rata;
  return eq([r.statusCode, v.canPay, v.card.available, v.card.reason, v.card.fee, v.cardFee, r.body.payUrl], [200, true, false, 'card_off', 0, 0, '']);
});
await check('rata · on:true senza data del mandato: la carta resta spenta', async () =>
  eq((await rata({ op: 'lookup', id: 'rImpNoDate', t: tk('rImpNoDate') })).body.rata.card, { available: false, reason: 'no_mandate', fee: 0, feeMode: 'none', onBehalfOf: '' }));
await check('rata · col mandato: carta accesa, ZERO commissione (assorbita), il link porta from=rata', async () => {
  const r = await rata({ op: 'lookup', id: 'rImpOn', t: tk('rImpOn') });
  return eq([r.body.rata.card, r.body.payUrl.endsWith('&from=rata'), r.body.payUrl.includes('/api/payments/link?k=pay&id=rImpOn')],
    [{ available: true, reason: '', fee: 0, feeMode: 'absorbed', onBehalfOf: 'Esempio Immobiliare S.r.l.' }, true, true]);
});
await check('rata · surcharge scelto: la commissione c\'è ed è detta prima', async () => {
  const c = (await rata({ op: 'lookup', id: 'rImpSur', t: tk('rImpSur') })).body.rata.card;
  return eq([c.available, c.feeMode, c.fee > 0], [true, 'surcharge', true]);
});
await check('rata · contratto normale: carta e commissione misurata come prima', async () => {
  const c = (await rata({ op: 'lookup', id: 'rStd', t: tk('rStd') })).body.rata.card;
  return eq([c.available, c.feeMode, c.fee > 0], [true, 'standard', true]);
});
await check('rata · contratto illeggibile su una rata non importata: la carta si spegne (non si sa), il bonifico resta', async () => {
  put('payments/rErr', { contractId: 'cErr', propertyId: 'pStd', type: 'rent', month: '2026-10', amount: 700, status: 'pending', dueDate: '2026-10-05' });
  put('contracts/cErr', { propertyId: 'pStd' });
  failGet.add('contracts/cErr');
  const r = await rata({ op: 'lookup', id: 'rErr', t: tk('rErr') });
  failGet.delete('contracts/cErr');
  return eq([r.statusCode, r.body.rata.card.available, r.body.rata.card.reason, r.body.payUrl], [200, false, 'unverified', '']);
});
await check('rata · bonifico: beneficiario, IBAN e BIC del contratto; il BIC solo se è un BIC vero', async () => {
  const b = (await rata({ op: 'lookup', id: 'rImp', t: tk('rImp') })).body.rata.bonifico;
  eq([b.iban, b.beneficiary, b.bic], [IBAN, 'Esempio Immobiliare S.r.l.', 'BPMOIT22XXX']);
  const v = rataView({ id: 'x', status: 'pending', amount: 10, dueDate: '2026-10-05' }, { contract: { landlordIban: IBAN, landlordBic: 'NON UN BIC', landlordName: 'Acme' } });
  return eq(v.bonifico.bic, '', 'BIC finto');
});
await check('rata · la rata in proporzione dice periodo e motivo (periodFrom/periodTo/prorated)', async () => {
  const v = (await rata({ op: 'lookup', id: 'rPro', t: tk('rPro') })).body.rata;
  return eq([v.periodFrom, v.periodTo, v.prorated, v.amount], ['2027-08-15', '2027-08-31', true, 500]);
});
await check('rata · pagata: la ricevuta https si mostra, una http no', async () => {
  const a = (await rata({ op: 'lookup', id: 'rPaid', t: tk('rPaid') })).body.rata;
  const b = (await rata({ op: 'lookup', id: 'rPaidHttp', t: tk('rPaidHttp') })).body.rata;
  return eq([a.state, a.receiptUrl, a.paidByCard, b.receiptUrl], ['paid', 'https://pay.stripe.com/receipts/esempio', true, '']);
});

// ═══ 3. /rata: la data di Roma, le segnalazioni ═══════════════════════════
await check('rata · segnalare alle 00:30 di Roma con la data di oggi (ancora "ieri" in UTC) funziona', async () => {
  rate('rMid', 'cImp', 'pImp');
  const r = await at('2026-10-12T22:30:00Z', async () => rata({ op: 'report', id: 'rMid', t: tk('rMid'), date: '2026-10-13' }));
  return eq([r.statusCode, store.get('payments/rMid').tenantReportDate], [200, '2026-10-13']);
});
await check('rata · senza data, la segnalazione porta il giorno di ROMA', async () => {
  rate('rMid2', 'cImp', 'pImp');
  const r = await at('2026-10-12T22:30:00Z', async () => rata({ op: 'report', id: 'rMid2', t: tk('rMid2') }));
  return eq([r.statusCode, store.get('payments/rMid2').tenantReportDate], [200, '2026-10-13']);
});
await check('rata · una data davvero futura (dopodomani) resta un errore bad_date, e non scrive', async () => {
  rate('rFut', 'cImp', 'pImp');
  const v0 = versions.get('payments/rFut');
  const r = await at('2026-10-12T10:00:00Z', async () => rata({ op: 'report', id: 'rFut', t: tk('rFut'), date: '2026-10-14' }));
  return eq([r.statusCode, r.body.error, versions.get('payments/rFut') === v0], [400, 'bad_date', true]);
});
await check('rata · romeDay e il tetto delle date (pure)', () =>
  eq([romeDay(new RealDate('2026-10-12T22:30:00Z')), latestReportDay(new RealDate('2026-10-12T22:30:00Z')), romeDay(new RealDate('2026-12-31T23:30:00Z'))], ['2026-10-13', '2026-10-13', '2027-01-01']));

let firstNotes;
await check('rata · due co-intestatari: la seconda segnalazione con contenuto NUOVO si accoda, con la sua ricevuta e il suo ping', async () => {
  const n0 = notes().length;
  const a = await rata({ op: 'report', id: 'rImp', t: tk('rImp'), date: '2026-10-03', note: 'my half 860' });
  const u0 = uploads.length;
  const b = await rata({ op: 'report', id: 'rImp', t: tk('rImp'), date: '2026-10-04', note: 'Mehmet: my half', proof: { base64: JPEG, type: 'image/jpeg', name: 'receipt.jpg' } });
  const p = store.get('payments/rImp');
  firstNotes = notes().slice(n0);
  eq([a.statusCode, b.statusCode, b.body.already, b.body.count, b.body.proof], [200, 200, undefined, 2, true], 'risposte');
  eq([p.status, p.tenantReported, p.tenantReportDate, p.tenantNotes], ['pending', true, '2026-10-03', 'my half 860'], 'in testa la prima');
  eq([p.tenantReports.length, p.tenantReports[1].date, p.tenantReports[1].note, !!p.tenantReports[1].proofUrl, !!p.proofUrl], [2, '2026-10-04', 'Mehmet: my half', true, true], 'elenco');
  eq([uploads.length - u0, firstNotes.length], [1, 2], 'una ricevuta, due ping');
  return ok(store.get(firstNotes[1]).summary.includes('segnalazione n. 2'), store.get(firstNotes[1]).summary);
});
await check('rata · la stessa segnalazione ripetuta (doppio tocco) non raddoppia niente', async () => {
  const n0 = notes().length, u0 = uploads.length, v0 = versions.get('payments/rImp');
  const r = await rata({ op: 'report', id: 'rImp', t: tk('rImp'), date: '2026-10-04', note: 'Mehmet: my half', proof: { base64: JPEG, type: 'image/jpeg', name: 'receipt.jpg' } });
  const e = await rata({ op: 'report', id: 'rImp', t: tk('rImp') });
  return eq([r.body.already, e.body.already, notes().length - n0, uploads.length - u0, versions.get('payments/rImp') === v0], [true, true, 0, 0, true]);
});
await check('rata · la pagina vede le segnalazioni (date e ricevuta, MAI le note) e può accoglierne un\'altra', async () => {
  const v = (await rata({ op: 'lookup', id: 'rImp', t: tk('rImp') })).body.rata;
  eq([v.state, v.reports, v.hasProof, v.canReportMore, v.canWithdraw], ['reported', [{ date: '2026-10-03', hasProof: false }, { date: '2026-10-04', hasProof: true }], true, true, true]);
  return ok(!JSON.stringify(v).includes('my half'), 'le note restano dell\'operatore');
});
await check('rata · il ping è una card agentNotifications con createdAt ISO (la finestra recente di notify-pending la vede)', () => {
  const d = store.get(firstNotes[0]);
  return eq([d.type, d.priority, d.status, typeof d.createdAt, Number.isFinite(RealDate.parse(d.createdAt)), d.summary.includes('conto del locatore')],
    ['payment.reported', 'high', 'pending', 'string', true, true]);
});
await check('rata · due segnalazioni senza nonce: «annulla» non cancella quella dell\'altro co-intestatario (409, nessuna scrittura)', async () => {
  const v0 = versions.get('payments/rImp'), n0 = notes().length;
  const w = await rata({ op: 'withdraw', id: 'rImp', t: tk('rImp') });
  const x = await rata({ op: 'withdraw', id: 'rImp', t: tk('rImp'), nonce: 'nonce-di-nessuno-01' });
  return eq([w.statusCode, w.body.error, x.statusCode, x.body.error, versions.get('payments/rImp') === v0, notes().length - n0], [409, 'several_reports', 409, 'several_reports', true, 0]);
});
await check('rata · annullare UNA segnalazione (unica) pulisce TUTTO (ricevuta compresa) e lo dice all\'operatore; la nuova senza ricevuta non risulta "con ricevuta"', async () => {
  rate('rOne', 'cImp', 'pImp', { month: '2026-12', dueDate: '2099-12-05' });
  await rata({ op: 'report', id: 'rOne', t: tk('rOne'), date: '2026-10-04', proof: { base64: JPEG, type: 'image/jpeg', name: 'r.jpg' } });
  const n0 = notes().length;
  const w = await rata({ op: 'withdraw', id: 'rOne', t: tk('rOne') });
  const p = store.get('payments/rOne');
  eq([w.statusCode, p.tenantReported, p.proofUrl, p.proofName, p.tenantReportDate, p.tenantNotes, p.tenantReports], [200, false, null, null, null, null, null], 'pulita');
  eq(p.tenantReportWithdrawn.reports.length, 1, 'la storia resta a parte');
  const wd = notes().slice(n0).map(k => store.get(k));
  eq([wd.length, wd[0] && wd[0].type, wd[0] && /torna da pagare/.test(wd[0].summary)], [1, 'payment.report_withdrawn', true], 'una card all\'operatore');
  await rata({ op: 'report', id: 'rOne', t: tk('rOne'), date: '2026-10-05' });
  const v = (await rata({ op: 'lookup', id: 'rOne', t: tk('rOne') })).body.rata;
  return eq([v.state, v.hasProof, v.reports.length], ['reported', false, 1]);
});
await check('rata · co-intestatari: chi annulla col SUO nonce toglie solo la sua; la ricevuta dell\'altro resta in testa e la rata resta segnalata', async () => {
  rate('rTwo', 'cImp', 'pImp', { month: '2027-01', dueDate: '2099-01-05' });
  await rata({ op: 'report', id: 'rTwo', t: tk('rTwo'), date: '2026-10-03', note: 'Ayse half', nonce: 'aaaaaaaaaaaa1001', amount: '860', proof: { base64: JPEG, type: 'image/jpeg', name: 'ayse.jpg' } });
  await rata({ op: 'report', id: 'rTwo', t: tk('rTwo'), date: '2026-10-04', note: 'Mehmet half', nonce: 'bbbbbbbbbbbb2002', amount: '860', another: true });
  const n0 = notes().length;
  const w = await rata({ op: 'withdraw', id: 'rTwo', t: tk('rTwo'), nonce: 'bbbbbbbbbbbb2002' });
  const p = store.get('payments/rTwo');
  eq([w.statusCode, w.body.count, p.tenantReported, p.tenantReports.length, p.tenantReports[0].note, !!p.proofUrl, p.tenantReportDate], [200, 1, true, 1, 'Ayse half', true, '2026-10-03']);
  eq([p.tenantReportWithdrawn.reports.length, p.tenantReportWithdrawn.reports[0].nonce], [1, 'bbbbbbbbbbbb2002'], 'la tolta resta nella storia');
  const card = store.get(notes().slice(n0)[0]);
  eq([card.type, /restano 1 segnalazione/.test(card.summary)], ['payment.report_withdrawn', true]);
  // Togliere la PRIMA porta in testa quella che resta (mai la ricevuta di una tolta).
  await rata({ op: 'report', id: 'rTwo', t: tk('rTwo'), date: '2026-10-06', note: 'Mehmet again', nonce: 'cccccccccccc3003', amount: '860', another: true });
  await rata({ op: 'withdraw', id: 'rTwo', t: tk('rTwo'), nonce: 'aaaaaaaaaaaa1001' });
  const q = store.get('payments/rTwo');
  return eq([q.tenantReports.length, q.tenantReportDate, q.tenantNotes, q.proofUrl, RENT.paymentState(q)], [1, '2026-10-06', 'Mehmet again', null, 'reported']);
});
await check('rata · l\'importo segnalato: «la mia metà» resta metà — la card lo dice con la nota, la pagina non dice «non pagare di nuovo» finché manca il resto', async () => {
  rate('rAmt', 'cImp', 'pImp', { month: '2027-02', dueDate: '2099-02-05' });
  const n0 = notes().length;
  const bad = await rata({ op: 'report', id: 'rAmt', t: tk('rAmt'), date: '2026-10-03', amount: '99999' });
  const r = await rata({ op: 'report', id: 'rAmt', t: tk('rAmt'), date: '2026-10-03', note: 'my half 860', amount: '860', nonce: 'dddddddddddd4004' });
  const card = store.get(notes().slice(n0)[0]);
  ok(/segnalati €860 su €1\.720/.test(card.summary) && card.summary.includes('nota: «my half 860»'), card.summary);
  ok(!/Ayse Esempio dice di aver pagato/.test(card.summary) && card.summary.includes('inviato a Ayse Esempio e co-intestatari'), 'mai «il titolare ha pagato tutto»');
  eq([card.payload.amountReported, card.payload.note], [860, 'my half 860']);
  const v = (await rata({ op: 'lookup', id: 'rAmt', t: tk('rAmt') })).body.rata;
  eq([bad.statusCode, bad.body.error, r.statusCode, v.partial, v.reportedSum, v.reports[0].amount], [400, 'bad_amount', 200, true, 860, 860]);
  await rata({ op: 'report', id: 'rAmt', t: tk('rAmt'), date: '2026-10-04', amount: '860', nonce: 'eeeeeeeeeeee5005', another: true });
  const v2 = (await rata({ op: 'lookup', id: 'rAmt', t: tk('rAmt') })).body.rata;
  return eq([v2.partial, v2.reportedSum], [false, 1720]);
});
await check('rata · oltre il tetto delle segnalazioni: 409 too_many_reports, nessuna scrittura', async () => {
  rate('rMany', 'cImp', 'pImp');
  for (let i = 1; i <= 6; i++) await rata({ op: 'report', id: 'rMany', t: tk('rMany'), date: '2026-10-0' + i });
  const v0 = versions.get('payments/rMany');
  const r = await rata({ op: 'report', id: 'rMany', t: tk('rMany'), date: '2026-10-07' });
  return eq([r.statusCode, r.body.error, store.get('payments/rMany').tenantReports.length, versions.get('payments/rMany') === v0], [409, 'too_many_reports', 6, true]);
});
await check('rata · bonifico segnalato con una Checkout carta ancora aperta: la sessione si chiude', async () => {
  rate('rOpen', 'cImpOn', 'pImpOn');
  stripe().sessions.set('cs_open_1', { id: 'cs_open_1', status: 'open', payment_status: 'unpaid', metadata: { service: 'RENT', paymentId: 'rOpen' } });
  store.get('payments/rOpen').checkoutSessionId = 'cs_open_1';
  const r = await rata({ op: 'report', id: 'rOpen', t: tk('rOpen'), date: '2026-10-03' });
  return eq([r.statusCode, stripe().sessions.get('cs_open_1').status, store.get('payments/rOpen').tenantReported], [200, 'expired', true]);
});
await check('rata · la carta ha GIÀ incassato: niente segnalazione sopra (409 card_completed)', async () => {
  rate('rDone', 'cImpOn', 'pImpOn');
  stripe().sessions.set('cs_done_1', { id: 'cs_done_1', status: 'complete', payment_status: 'paid', metadata: { service: 'RENT', paymentId: 'rDone' } });
  store.get('payments/rDone').checkoutSessionId = 'cs_done_1';
  const n0 = notes().length;
  const r = await rata({ op: 'report', id: 'rDone', t: tk('rDone') });
  return eq([r.statusCode, r.body.error, !!store.get('payments/rDone').tenantReported, notes().length - n0], [409, 'card_completed', false, 0]);
});

// ═══ 4. Il link di pagamento ══════════════════════════════════════════════
await check('link · carta spenta: nessuna Checkout, la pagina porta al bonifico su /rata (stessa lingua)', async () => {
  const c0 = stripe().calls.length;
  const r = await link('rImpNoDate', { lang: 'en', from: 'rata' });
  eq([r.statusCode, stripe().calls.length - c0, /<html lang="en">/.test(r.body)], [200, 0, true]);
  ok(r.body.includes('Card payment not available'), 'titolo EN');
  return ok(r.body.includes('href="https://www.boomrome.com/rata?id=rImpNoDate&amp;t=' + tk('rImpNoDate') + '&amp;lang=en"'), 'link al bonifico');
});
await check('link · carta col mandato: una riga sola (nessuna commissione), Stripe in inglese, ritorno su /rata', async () => {
  const r = await link('rImpOn', { lang: 'en', from: 'rata' });
  const c = stripe().calls.at(-1);
  eq([r.statusCode, c.line_items.length, c.line_items[0].price_data.unit_amount, c.locale], [303, 1, 172000, 'en']);
  eq(c.line_items[0].price_data.product_data.name, 'Rent — 2026-10', 'etichetta EN');
  ok(c.line_items[0].price_data.product_data.description.includes('on behalf of Esempio Immobiliare S.r.l.'), 'la riga dice chi incassa e per conto di chi');
  const back = 'https://www.boomrome.com/rata?id=rImpOn&t=' + tk('rImpOn') + '&lang=en';
  return eq([c.success_url, c.cancel_url, c.metadata.lang, c.metadata.feeMode, c.metadata.via, c.metadata.fee], [back + '&return=success', back + '&return=cancel', 'en', 'absorbed', 'rata', '0']);
});
await check('link · il PaymentIntent porta la rata (metadata), un descrittore riconoscibile e la descrizione con l\'interno', async () => {
  const c = stripe().calls.at(-1);
  const pid = c.payment_intent_data || {};
  eq([pid.metadata && pid.metadata.service, pid.metadata && pid.metadata.paymentId, pid.metadata && pid.metadata.contractId, pid.metadata && pid.metadata.propertyId, pid.metadata && pid.metadata.month],
    ['RENT', 'rImpOn', 'cImpOn', 'pImpOn', '2026-10']);
  // Da /rata in inglese la descrizione è inglese (Stripe la riporta nella ricevuta).
  return eq([pid.statement_descriptor_suffix, pid.description], ['CANONE', 'Rent — 2026-10 · Piazzale Esempio 42 flat 8']);
});
await check('link · la ricevuta va a chi paga: l\'email del contratto quando la rata non la porta', async () =>
  eq(stripe().calls.at(-1).customer_email, 'lena@example.invalid'));
await check('link · da /rata con un co-intestatario nessuna email precompilata: la ricevuta va a chi paga davvero', async () => {
  prop('pImpCo', { interno: '11', rataCard: { on: true, mandateAt: '2026-10-01', fee: 'absorbed' } });
  put('contracts/cImpCo', { ...imported, propertyId: 'pImpCo', tenantName: 'Lena Esempio', tenantEmail: 'lena@example.invalid', coTenants: [{ name: 'Marta Esempio' }] });
  rate('rImpCo', 'cImpCo', 'pImpCo');
  const n0 = stripe().calls.length;
  await link('rImpCo', { lang: 'en', from: 'rata' });
  return eq([stripe().calls.length, stripe().calls.at(-1).customer_email], [n0 + 1, undefined]);
});
await check('link · surcharge scelto: la riga della commissione c\'è, col suo nome vero', async () => {
  await link('rImpSur', { lang: 'it', from: 'rata' });
  const c = stripe().calls.at(-1);
  return eq([c.line_items.length, c.line_items[1].price_data.product_data.name, c.locale], [2, 'Commissione pagamento con carta', 'it']);
});
await check('link · un contratto normale senza lingua: come prima (italiano, commissione, ritorno sul link stabile)', async () => {
  const r = await link('rStd');
  const c = stripe().calls.at(-1);
  return eq([r.statusCode, c.line_items.length, c.locale, c.success_url.endsWith('&return=success') && c.success_url.includes('/api/payments/link?')], [303, 2, undefined, true]);
});
await check('link · Stripe rifiuta il suffisso del descrittore: si riprova UNA volta senza, e si paga lo stesso', async () => {
  rate('rSuf', 'cImpOn', 'pImpOn');
  stripe().rejectSuffix = true;
  const r = await link('rSuf', { lang: 'en', from: 'rata' });
  stripe().rejectSuffix = false;
  const c = stripe().calls.at(-1);
  return eq([r.statusCode, c.metadata.paymentId, c.payment_intent_data.statement_descriptor_suffix, c.payment_intent_data.metadata.paymentId], [303, 'rSuf', undefined, 'rSuf']);
});
await check('link · pagina in inglese da un telefono non italiano (Accept-Language), italiano da uno italiano', async () => {
  const en = await link('rImpNoDate', {}, { 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8' });
  const it = await link('rImpNoDate', {}, { 'accept-language': 'it-IT,it;q=0.9' });
  return eq([/<html lang="en">/.test(en.body), /<html lang="it">/.test(it.body)], [true, true]);
});
await check('link · rata segnalata di chi non ha un\'area personale: si gestisce dalla pagina della rata (e ci si torna)', async () => {
  const r = await link('rImp', { lang: 'en' });
  ok(r.body.includes('cancel it on the rent page') && !r.body.includes('home page'), 'testo');
  return ok(r.body.includes('class="back" href="https://www.boomrome.com/rata?id=rImp'), 'torna alla rata');
});

// ═══ 5. /casa (pay.js) ════════════════════════════════════════════════════
await check('pay · l\'admin al telefono su una rata del Palazzo senza mandato: 409 card_not_enabled, nessuna Checkout', async () => {
  const c0 = stripe().calls.length;
  const r = await pay({ paymentId: 'rImpNoDate' }, 'tok-admin');
  return eq([r.statusCode, r.body.error, r.body.reason, stripe().calls.length - c0], [409, 'card_not_enabled', 'no_mandate', 0]);
});
await check('pay · commissione zero = NESSUNA riga da €0 su Stripe', async () => {
  process.env.RENT_FEE_PCT = '0';
  const r = await pay({ paymentId: 'rStd' }, 'tok-t1');
  delete process.env.RENT_FEE_PCT;
  const c = stripe().calls.at(-1);
  return eq([r.statusCode, r.body.fee, c.line_items.length, c.payment_intent_data.metadata.paymentId], [200, 0, 1, 'rStd']);
});
await check('pay · la commissione misurata non conta due volte la parte fissa (buffer 0 = a pari)', () => {
  const stats = { count: 10, volumeEur: 17200, costEur: 10 * (1720 * 0.015 + 0.25), fixedEur: 2.5 };
  return ok(Math.abs(measuredCost(stats, 1720).cost - (1720 * 0.015 + 0.25)) < 0.01, String(measuredCost(stats, 1720).cost));
});

// ═══ 6. Il webhook: la ricevuta, la data, il doppio incasso ═══════════════
const completed = (id, paymentId, extra = {}) => ({ id: 'evt_' + id, type: 'checkout.session.completed', data: { object: {
  id, amount_total: 172000, currency: 'eur', payment_intent: 'pi_' + id, customer_email: null, customer_details: { email: 'payer@example.invalid' },
  metadata: { service: 'RENT', paymentId, amount: '1720', fee: '0', via: 'rata', lang: 'en', contractId: 'cImpOn' }, ...extra } } });
await check('webhook · carta da /rata alle 00:30 di Roma: pagata col giorno di ROMA, il PaymentIntent e "tenuta da BOOM"', async () => {
  rate('rW1', 'cImpOn', 'pImpOn');
  stripe().intents.set('pi_cs_w1', { id: 'pi_cs_w1', metadata: { service: 'RENT', paymentId: 'rW1' }, latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/w1', balance_transaction: { fee: 2605 }, payment_method_details: { card: { country: 'TR', brand: 'visa' } } } });
  const m0 = mails().length;
  const r = await at('2026-10-05T22:30:00Z', async () => hook(completed('cs_w1', 'rW1')));
  const p = store.get('payments/rW1');
  globalThis.__w1mails = mails().slice(m0);
  return eq([r.statusCode, p.status, p.paidVia, p.paidDate, p.stripePaymentIntentId, p.heldBy, p.receiptUrl], [200, 'paid', 'stripe', '2026-10-06', 'pi_cs_w1', 'boom', 'https://pay.stripe.com/receipts/w1']);
});
await check('webhook · la ricevuta arriva a chi ha pagato (l\'email DIGITATA su Stripe), in inglese, col link alla SUA rata', () => {
  const m = (globalThis.__w1mails || []).find(x => x.to === 'payer@example.invalid');
  ok(m, 'email all\'inquilino');
  ok(/^Receipt — /.test(m.subject), m.subject);
  ok(m.html.includes('/rata?id=rW1&amp;t=' + tk('rW1') + '&amp;lang=en') && !m.html.includes('/casa'), 'link a /rata, non a /casa');
  return ok(!/fee/i.test(m.html.replace(/feeLine/g, '')), 'nessuna commissione nominata quando è zero');
});
await check('webhook · senza email su Stripe, la ricevuta va all\'email del contratto', async () => {
  rate('rW2', 'cImpOn', 'pImpOn');
  const m0 = mails().length;
  await hook(completed('cs_w2', 'rW2', { customer_details: null }));
  return ok(mails().slice(m0).some(x => x.to === 'lena@example.invalid'), 'email del contratto');
});
await check('webhook · bonifico già SEGNALATO + carta che incassa: pagata, prova conservata, allarme alto e Telegram', async () => {
  rate('rDbl', 'cImpOn', 'pImpOn', { month: '2026-11', tenantReported: true, tenantReportDate: '2026-11-03', proofUrl: 'https://firebasestorage.googleapis.com/x', reportedVia: 'link' });
  const tg0 = tg.length;
  const r = await hook(completed('cs_dbl', 'rDbl'));
  const p = store.get('payments/rDbl');
  const alarm = [...store.entries()].find(([k, v]) => k.startsWith('agentNotifications/rent-double-rDbl') && v.priority === 'high');
  eq([r.body.doublePaymentSuspect, p.status, p.doublePaymentSuspect, p.proofUrl, p.tenantReported], [true, 'paid', true, 'https://firebasestorage.googleapis.com/x', true]);
  ok(alarm && alarm[1].summary.includes('SEGNALATO') && alarm[1].summary.includes('int. 8'), 'allarme che nomina interno e segnalazione');
  return ok(tg.slice(tg0).some(x => /doppio incasso/i.test(x)), 'Telegram');
});

// ═══ 7. Rimborsi e contestazioni ══════════════════════════════════════════
const refund = (id, pi, amount, refunded) => ({ id, type: 'charge.refunded', data: { object: { id: 'ch_' + id, object: 'charge', payment_intent: pi, amount, amount_refunded: refunded, metadata: {}, billing_details: { name: 'Pagante Esempio' } } } });
const dispute = (id, type, pi, status) => ({ id, type, data: { object: { id: 'dp_' + pi, object: 'dispute', payment_intent: pi, charge: 'ch_' + pi, amount: 172000, status, reason: 'fraudulent', evidence_details: { due_by: 1790000000 } } } });
await check('rimborso totale: la rata torna DA VERIFICARE, l\'avviso nomina interno e rata', async () => {
  const r = await hook(refund('evt_rf1', 'pi_cs_w1', 172000, 172000));
  const p = store.get('payments/rW1');
  eq([r.body.rataState, p.refundedFull, p.refundedAmount, RENT.paymentState(p), RENT.canPay(p)], ['review', true, 1720, 'review', false]);
  const n = store.get('agentNotifications/stripe-evt_rf1');
  return ok(n && n.priority === 'high' && n.summary.includes('int. 8') && n.summary.includes('DA VERIFICARE') && n.paymentId === 'rW1', n && n.summary);
});
await check('rimborso: il retry di Stripe non suona due volte', async () => {
  const tg0 = tg.length;
  const r = await hook(refund('evt_rf1', 'pi_cs_w1', 172000, 172000));
  return eq([r.body.duplicate, tg.length - tg0], [true, 0]);
});
await check('rimborso della sola commissione: la rata resta pagata', async () => {
  rate('rPart', 'cImpOn', 'pImpOn', { month: '2026-07', status: 'paid', paidVia: 'stripe', paidDate: '2026-07-03', stripePaymentIntentId: 'pi_part', amount: 1720 });
  stripe().intents.set('pi_part', { id: 'pi_part', metadata: { service: 'RENT', paymentId: 'rPart' } });
  const r = await hook(refund('evt_rf2', 'pi_part', 177000, 5000));
  return eq([r.body.rataState, RENT.paymentState(store.get('payments/rPart'))], ['paid', 'paid']);
});
await check('contestazione aperta = da verificare; vinta = di nuovo pagata; un "aperta" arrivato tardi non la riapre', async () => {
  rate('rDsp', 'cImpOn', 'pImpOn', { month: '2026-06', status: 'paid', paidVia: 'stripe', paidDate: '2026-06-03', stripePaymentIntentId: 'pi_dsp' });
  stripe().intents.set('pi_dsp', { id: 'pi_dsp', metadata: { service: 'RENT', paymentId: 'rDsp' } });
  await hook(dispute('evt_d1', 'charge.dispute.created', 'pi_dsp', 'needs_response'));
  const s1 = RENT.paymentState(store.get('payments/rDsp'));
  await hook(dispute('evt_d2', 'charge.dispute.closed', 'pi_dsp', 'won'));
  const s2 = RENT.paymentState(store.get('payments/rDsp'));
  await hook(dispute('evt_d3', 'charge.dispute.created', 'pi_dsp', 'needs_response'));
  return eq([s1, s2, store.get('payments/rDsp').disputeStatus, RENT.paymentState(store.get('payments/rDsp'))], ['review', 'paid', 'won', 'paid']);
});
await check('contestazione persa: la rata resta da verificare', async () => {
  rate('rLost', 'cImpOn', 'pImpOn', { month: '2026-05', status: 'paid', paidVia: 'stripe', paidDate: '2026-05-03', stripePaymentIntentId: 'pi_lost' });
  stripe().intents.set('pi_lost', { id: 'pi_lost', metadata: { service: 'RENT', paymentId: 'rLost' } });
  await hook(dispute('evt_l1', 'charge.dispute.created', 'pi_lost', 'needs_response'));
  await hook(dispute('evt_l2', 'charge.dispute.closed', 'pi_lost', 'lost'));
  return eq([store.get('payments/rLost').disputeStatus, RENT.paymentState(store.get('payments/rLost'))], ['lost', 'review']);
});
await check('rata pagata prima (senza PaymentIntent registrato): la si ritrova dalla sessione Checkout', async () => {
  rate('rLeg', 'cImpOn', 'pImpOn', { month: '2026-04', status: 'paid', paidVia: 'stripe', paidDate: '2026-04-03', stripeSessionId: 'cs_leg' });
  stripe().sessions.set('cs_leg', { id: 'cs_leg', status: 'complete', payment_intent: 'pi_leg', metadata: { service: 'RENT', paymentId: 'rLeg' } });
  stripe().intents.set('pi_leg', { id: 'pi_leg', metadata: {} });
  const r = await hook(refund('evt_rf3', 'pi_leg', 172000, 172000));
  return eq([r.body.paymentId, r.body.rataState, RENT.paymentState(store.get('payments/rLeg'))], ['rLeg', 'review', 'review']);
});
await check('rimborso di un addebito SEPA: la rata torna da verificare (stessa regola della carta)', async () => {
  rate('rSdd', 'cImpOn', 'pImpOn', { month: '2026-02', status: 'paid', paidVia: 'sepa', paidDate: '2026-02-03', sddPiId: 'pi_sdd1' });
  stripe().intents.set('pi_sdd1', { id: 'pi_sdd1', metadata: { service: 'RENT_SDD', paymentId: 'rSdd' } });
  const r = await hook(refund('evt_rf5', 'pi_sdd1', 172000, 172000));
  return eq([r.body.rataState, RENT.paymentState(store.get('payments/rSdd'))], ['review', 'review']);
});
await check('rimborso del DOPPIO incasso (rata pagata con bonifico): la rata non si tocca, e l\'avviso lo dice', async () => {
  rate('rBank', 'cImpOn', 'pImpOn', { month: '2026-03', status: 'paid', paidVia: 'bonifico', paidDate: '2026-03-03' });
  stripe().intents.set('pi_dup', { id: 'pi_dup', metadata: { service: 'RENT', paymentId: 'rBank' } });
  const v0 = versions.get('payments/rBank');
  const r = await hook(refund('evt_rf4', 'pi_dup', 172000, 172000));
  const n = store.get('agentNotifications/stripe-evt_rf4');
  return eq([r.body.rataState, versions.get('payments/rBank') === v0, n.summary.includes('NON toccata'), RENT.paymentState(store.get('payments/rBank'))], ['untouched', true, true, 'paid']);
});
await check('rata da verificare: /rata lo dice e niente carta; il link mostra "da verificare" senza Checkout', async () => {
  const v = (await rata({ op: 'lookup', id: 'rW1', t: tk('rW1') })).body;
  const c0 = stripe().calls.length;
  const l = await link('rW1', { lang: 'en' });
  return eq([v.rata.state, v.rata.canPay, v.payUrl, l.statusCode, l.body.includes('Payment to be checked'), stripe().calls.length - c0], ['review', false, '', 200, true, 0]);
});

// ═══ 8. Dalla revisione: la ricevuta revocata, la carta rimborsata e
// riaperta, il contratto illeggibile, le due metà dello stesso giorno ═══════
async function adminReport(body) {
  const res = mkRes();
  await reportH({ method: 'POST', headers: { authorization: 'Bearer tok-admin', 'x-forwarded-for': '10.9.0.' + (++ipN) }, body, query: {} }, res);
  return res;
}
await check('revisione · ricevuta REVOCATA dall\'operatore: la nuova segnalazione senza ricevuta non la eredita (e la vecchia resta come storia)', async () => {
  rate('rRev', 'cImp', 'pImp', { month: '2026-12', dueDate: '2026-12-05' });
  const a = await rata({ op: 'report', id: 'rRev', t: tk('rRev'), date: '2026-10-09', note: 'prima', proof: { base64: JPEG, type: 'image/jpeg', name: 'a.jpg' } });
  const revoked = store.get('payments/rRev').proofUrl;
  const rv = await adminReport({ paymentId: 'rRev', action: 'review_withdraw', reason: 'ricevuta non corrispondente al conto' });
  // Dal 13/10/2026 la revoca (payments/report review_withdraw) pulisce la
  // testa come il ritiro di /rata e conserva la segnalazione come storia.
  const w = store.get('payments/rRev').tenantReportWithdrawn || {};
  eq([a.statusCode, rv.statusCode, !!revoked, store.get('payments/rRev').proofUrl, store.get('payments/rRev').tenantReports, (w.reports || [])[0] && w.reports[0].proofUrl === revoked, w.by, w.reviewId === rv.body.reviewId],
    [200, 200, true, null, null, true, 'admin', true], 'la revoca pulisce la testa e conserva la ricevuta come storia');
  const b = await rata({ op: 'report', id: 'rRev', t: tk('rRev'), date: '2026-10-10', note: 'seconda, senza ricevuta' });
  const p = store.get('payments/rRev');
  const v = (await rata({ op: 'lookup', id: 'rRev', t: tk('rRev') })).body.rata;
  eq([b.statusCode, b.body.proof, p.proofUrl, p.proofName, p.tenantReports.length, p.tenantReportDate], [200, false, null, null, 1, '2026-10-10'], 'testa riscritta');
  eq([v.state, v.hasProof, v.reports], ['reported', false, [{ date: '2026-10-10', hasProof: false }]], 'la pagina');
  return eq([p.tenantReportWithdrawn.reports.length, p.tenantReportWithdrawn.reports[0].proofUrl === revoked, !!p.tenantReportWithdrawn.reviewId, !!p.tenantReportSuperseded], [1, true, true, false], 'storia');
});
// La revoca vecchia (prima del 13/10/2026) lasciava proofUrl sulla testa:
// quelle rate esistono ancora. La nuova segnalazione senza ricevuta deve
// riscrivere la testa da sé, non contare sulla pulizia della revoca.
await check('revisione · testa REVOCATA prima del 13/10 (la ricevuta rimasta sulla rata): la nuova segnalazione senza ricevuta non la eredita', async () => {
  rate('rLeg', 'cImp', 'pImp', { month: '2027-01', dueDate: '2027-01-05' });
  put('payments/rLeg', { ...store.get('payments/rLeg'), tenantReported: false, tenantReportReviewId: 'rv_vecchia',
    proofUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/vecchia', proofName: 'vecchia.jpg' });
  const b = await rata({ op: 'report', id: 'rLeg', t: tk('rLeg'), date: '2026-10-11', note: 'senza ricevuta' });
  const p = store.get('payments/rLeg');
  const v = (await rata({ op: 'lookup', id: 'rLeg', t: tk('rLeg') })).body.rata;
  return eq([b.statusCode, b.body.proof, p.proofUrl, p.proofName, v.hasProof], [200, false, null, null, false]);
});
await check('revisione · la ricevuta si legge dall\'elenco delle segnalazioni in corso, non da una testa rimasta indietro (pura)', () => {
  const base = { status: 'pending', amount: 100, dueDate: '2099-01-05', tenantReported: true, tenantReportDate: '2026-10-10' };
  return eq([
    rataView({ ...base, proofUrl: 'https://firebasestorage.googleapis.com/vecchia', tenantReports: [{ date: '2026-10-10', proofUrl: '' }] }).hasProof,
    rataView({ ...base, proofUrl: 'https://firebasestorage.googleapis.com/x', tenantReports: [{ date: '2026-10-10', proofUrl: 'https://firebasestorage.googleapis.com/x' }] }).hasProof,
    rataView({ ...base, proofUrl: 'https://firebasestorage.googleapis.com/legacy' }).hasProof,
  ], [false, true, true]);
});

// La rata pagata con carta, rimborsata e riaperta dall'operatore (come
// undoIncasso: pending, paidDate/paidVia/receiptUrl puliti). La sessione
// salvata resta quella completata — ed è già registrata come incasso.
const undone = (id) => {
  rate(id, 'cImpOn', 'pImpOn', { month: '2027-02', dueDate: '2099-02-05', checkoutSessionId: 'cs_' + id, stripeSessionId: 'cs_' + id,
    refundedAt: '2026-10-11T10:00:00Z', refundedAmount: 1720, refundedFull: true, incassoAnnullato: { at: '2026-10-11T11:00:00Z', by: 'admin1', was: { status: 'paid', paidVia: 'stripe' } } });
  stripe().sessions.set('cs_' + id, { id: 'cs_' + id, status: 'complete', payment_status: 'paid', currency: 'eur', amount_total: 172000, url: null,
    payment_intent: 'pi_' + id, metadata: { service: 'RENT', paymentId: id, amount: '1720' } });
};
await check('revisione · carta incassata, rimborsata e riaperta: il bonifico si segnala (non «non pagare di nuovo»)', async () => {
  rate('rUndo', 'cImpOn', 'pImpOn', { month: '2026-12', dueDate: '2099-12-05' });
  const l = await link('rUndo', { from: 'rata', lang: 'en' });
  const sid = store.get('payments/rUndo').checkoutSessionId, sess = stripe().sessions.get(sid);
  Object.assign(sess, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_undo' });
  stripe().intents.set('pi_undo', { id: 'pi_undo', metadata: { service: 'RENT', paymentId: 'rUndo' }, latest_charge: null });
  const w = await hook({ id: 'evt_undo1', type: 'checkout.session.completed', data: { object: { id: sid, payment_intent: 'pi_undo', amount_total: 172000, metadata: sess.metadata, customer_details: { email: 'x@example.invalid' } } } });
  const rf = await hook(refund('evt_undo2', 'pi_undo', 172000, 172000));
  const cur = store.get('payments/rUndo');
  put('payments/rUndo', { ...cur, status: 'pending', paidDate: null, paidVia: null, receiptUrl: null, incassoAnnullato: { at: 'x', by: 'admin1', was: { status: 'paid' } } });
  eq([l.statusCode, w.body.rent, rf.body.rataState, RENT.paymentState(store.get('payments/rUndo')), RENT.canPay(store.get('payments/rUndo'))], [303, true, 'review', 'due', true], 'giro');
  const r = await rata({ op: 'report', id: 'rUndo', t: tk('rUndo'), date: '2026-10-10', note: 'pagato con bonifico dopo il rimborso' });
  eq([r.statusCode, r.body.state, store.get('payments/rUndo').tenantReported], [200, 'reported', true]);
  // Stripe ri-consegna l'evento della sessione già registrata: la rata
  // riaperta dall'operatore NON torna pagata da sola.
  const v0 = versions.get('payments/rUndo');
  const again = await hook({ id: 'evt_undo1', type: 'checkout.session.completed', data: { object: { id: sid, payment_intent: 'pi_undo', amount_total: 172000, metadata: sess.metadata, customer_details: { email: 'x@example.invalid' } } } });
  return eq([again.body.duplicate, again.body.reopened, store.get('payments/rUndo').status, versions.get('payments/rUndo') === v0], [true, true, 'pending', true]);
});
await check('revisione · stessa rata riaperta: il link apre una Checkout NUOVA invece di «non serve pagare di nuovo»', async () => {
  undone('rUndoL');
  const c0 = stripe().calls.length;
  const r = await link('rUndoL', { from: 'rata', lang: 'en' });
  return eq([r.statusCode, stripe().calls.length - c0, store.get('payments/rUndoL').checkoutSessionId !== 'cs_rUndoL'], [303, 1, true]);
});
await check('revisione · stessa rata riaperta, dall\'admin al telefono (pay.js): Checkout nuova, non 409 payment_processing', async () => {
  undone('rUndoP');
  const r = await pay({ paymentId: 'rUndoP' }, 'tok-admin');
  return eq([r.statusCode, !!r.body.checkoutUrl, store.get('payments/rUndoP').checkoutSessionId !== 'cs_rUndoP'], [200, true, true]);
});
await check('revisione · una Checkout completata MAI registrata (webhook in arrivo) blocca ancora il bonifico', async () => {
  undone('rUndoW');
  store.get('payments/rUndoW').stripeSessionId = 'cs_altra_vecchia';
  const r = await rata({ op: 'report', id: 'rUndoW', t: tk('rUndoW') });
  return eq([r.statusCode, r.body.error], [409, 'card_completed']);
});

await check('revisione · contratto illeggibile su una rata rigenerata dal portale (senza source): il link NON apre la Checkout e lo dice', async () => {
  put('payments/rGen', { contractId: 'cImp', propertyId: 'pImp', type: 'rent', month: '2027-01', amount: 1720, status: 'pending', dueDate: '2099-01-05', autoGenerated: true });
  failGet.add('contracts/cImp');
  const c0 = stripe().calls.length;
  const l = await link('rGen', { lang: 'en' });
  const pp = await pay({ paymentId: 'rGen' }, 'tok-admin');
  const v = (await rata({ op: 'lookup', id: 'rGen', t: tk('rGen') })).body;
  failGet.delete('contracts/cImp');
  eq([l.statusCode, stripe().calls.length - c0, l.body.includes('Card payment unavailable right now')], [503, 0, true], 'link');
  ok(l.body.includes('href="https://www.boomrome.com/rata?id=rGen&amp;t=' + tk('rGen') + '&amp;lang=en"') && l.body.includes('>Try again<'), 'bonifico e riprova');
  eq([pp.statusCode, pp.body.error], [503, 'card_unverified'], 'pay');
  return eq([v.rata.card.available, v.rata.card.reason, v.payUrl], [false, 'unverified', ''], '/rata, stessa regola');
});
await check('revisione · lo stesso link, col contratto leggibile: «carta non attiva» (Palazzo senza mandato), mai Stripe', async () => {
  const c0 = stripe().calls.length;
  const l = await link('rGen', { lang: 'en' });
  return eq([l.statusCode, l.body.includes('Card payment not available'), stripe().calls.length - c0], [200, true, 0]);
});

await check('revisione · due metà lo STESSO giorno coi valori proposti: due moduli (due nonce) = due segnalazioni e due ping', async () => {
  rate('rHalf', 'cImp', 'pImp', { month: '2026-11', dueDate: '2099-11-05' });
  const n0 = notes().length;
  const a = await rata({ op: 'report', id: 'rHalf', t: tk('rHalf'), date: '2026-10-10', note: '', nonce: 'aaaaaaaaaaaa0001', another: false });
  const b = await rata({ op: 'report', id: 'rHalf', t: tk('rHalf'), date: '2026-10-10', note: '', nonce: 'bbbbbbbbbbbb0002', another: true });
  const p = store.get('payments/rHalf');
  return eq([a.statusCode, b.statusCode, b.body.already, b.body.count, p.tenantReports.length, notes().length - n0, p.tenantReports.map(x => x.nonce)],
    [200, 200, undefined, 2, 2, 2, ['aaaaaaaaaaaa0001', 'bbbbbbbbbbbb0002']]);
});
await check('revisione · il doppio tocco dello stesso modulo (stesso nonce) non raddoppia niente', async () => {
  const n0 = notes().length, v0 = versions.get('payments/rHalf');
  const r = await rata({ op: 'report', id: 'rHalf', t: tk('rHalf'), date: '2026-10-10', note: '', nonce: 'bbbbbbbbbbbb0002', another: true });
  return eq([r.statusCode, r.body.already, r.body.count, notes().length - n0, versions.get('payments/rHalf') === v0], [200, true, 2, 0, true]);
});
await check('revisione · una pagina aperta PRIMA della prima segnalazione (modulo suo, senza «another») è un bonifico in più', async () => {
  const r = await rata({ op: 'report', id: 'rHalf', t: tk('rHalf'), date: '2026-10-10', note: '', nonce: 'cccccccccccc0003' });
  return eq([r.statusCode, r.body.already, r.body.count], [200, undefined, 3]);
});
await check('revisione · pagina vecchia senza nonce: «un altro bonifico» identico è doppio tocco entro 2 minuti, un bonifico dopo', async () => {
  rate('rHalf2', 'cImp', 'pImp', { month: '2026-11', dueDate: '2099-11-05' });
  const t0 = RealDate.parse('2026-10-10T09:00:00Z');
  await at(new RealDate(t0).toISOString(), () => rata({ op: 'report', id: 'rHalf2', t: tk('rHalf2'), date: '2026-10-10' }));
  const soon = await at(new RealDate(t0 + 60_000).toISOString(), () => rata({ op: 'report', id: 'rHalf2', t: tk('rHalf2'), date: '2026-10-10', another: true }));
  const later = await at(new RealDate(t0 + 3 * 60_000).toISOString(), () => rata({ op: 'report', id: 'rHalf2', t: tk('rHalf2'), date: '2026-10-10', another: true }));
  const plain = await at(new RealDate(t0 + 10 * 60_000).toISOString(), () => rata({ op: 'report', id: 'rHalf2', t: tk('rHalf2'), date: '2026-10-10' }));
  return eq([soon.body.already, later.body.already, later.body.count, plain.body.already, plain.body.count], [true, undefined, 2, true, 2]);
});
await check('revisione · un nonce malformato non vale (si ricade sul confronto del contenuto)', async () => {
  const r = await rata({ op: 'report', id: 'rHalf', t: tk('rHalf'), date: '2026-10-10', nonce: 'x<script>' });
  return eq([r.body.already, (store.get('payments/rHalf').tenantReports || []).some(x => x.nonce === 'x<script>')], [true, false]);
});

await check('revisione · la descrizione del PaymentIntent segue la lingua (italiano dal link italiano, inglese da /rata in inglese)', async () => {
  rate('rLangIt', 'cImpOn', 'pImpOn', { month: '2027-03', dueDate: '2099-03-05' });
  await link('rLangIt', { lang: 'it', from: 'rata' });
  const it = stripe().calls.at(-1);
  rate('rLangEn', 'cImpOn', 'pImpOn', { month: '2027-04', dueDate: '2099-04-05' });
  await link('rLangEn', { lang: 'en', from: 'rata' });
  const en = stripe().calls.at(-1);
  return eq([it.locale, it.payment_intent_data.description, en.locale, en.payment_intent_data.description],
    ['it', 'Canone di locazione — 2027-03 · Piazzale Esempio 42 int. 8', 'en', 'Rent — 2027-04 · Piazzale Esempio 42 flat 8']);
});
await check('revisione · /rata: il modulo manda nonce e «another», e l\'inglese dice «made on» (mai «of» davanti a una data)', () => {
  const html = readFileSync(new URL('../../rata.html', import.meta.url), 'utf8');
  ok(/nonce: nonce, another: another/.test(html), 'il corpo della segnalazione porta nonce e another');
  ok(/more\.onclick = function \(\) \{ openForm\(true\)/.test(html) && /'bank'\)\.onclick = function \(\) \{ openForm\(false\)/.test(html), 'un nonce per ogni modulo aperto');
  return ok(html.includes("(d ? ' made on ' + d : '')") && !html.includes("(d ? ' of ' + d : '')"), 'testo inglese');
});

// ═══ La rata DOPO la chiusura del contratto (13/10/2026) ═══════════════════
// Un contratto chiuso da «Modifica» (o dati vecchi) lasciava «da pagare» le
// rate dei mesi dopo l'uscita: il Palazzo diceva «libero», ma /rata le faceva
// pagare, il link apriva una Checkout e il SEPA le addebitava all'ex inquilino.
// La regola è UNA (BOOM_RENT.afterClose) e combacia col motore del Palazzo.
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const Pz = req('../../js/palazzo-engine.js');
  const R = req('../../js/rent-engine.js');
  await check('afterClose · la regola del server è QUELLA del Palazzo (terminato, scaduto, attivo oltre la fine, periodo scritto o dedotto)', () => {
    const properties = ['pa', 'pb', 'pc', 'pd'].map(id => ({ id, address: 'Via Prova 1, Roma', interno: id }));
    const contracts = [
      { id: 'ca', propertyId: 'pa', status: 'terminated', terminatedAt: '2026-11-30', startDate: '2026-09-15', endDate: '2027-08-14' },
      { id: 'cb', propertyId: 'pb', status: 'expired', startDate: '2025-01-01', endDate: '2025-12-31' },
      { id: 'cc', propertyId: 'pc', status: 'active', startDate: '2025-01-01', endDate: '2025-06-30' },
      { id: 'cd', propertyId: 'pd', status: 'terminated', startDate: '2026-01-10', endDate: '2026-05-31' },
    ];
    const pays = [];
    const add = (c, m, extra = {}) => pays.push({ id: c + '_' + m + (extra.tag || ''), contractId: c, type: 'rent', month: m, amount: 900, dueDate: m + '-05', status: 'pending', ...extra });
    ['2026-10', '2026-11', '2026-12', '2027-01'].forEach(m => add('ca', m));
    add('ca', '2026-12', { tag: 'p', status: 'paid', paidDate: '2026-12-03' });
    ['2025-12', '2026-01'].forEach(m => add('cb', m));
    add('cb', '2026-01', { tag: 'pf', periodFrom: '2025-12-31' });
    ['2025-06', '2025-07', '2025-08'].forEach(m => add('cc', m));
    ['2026-05', '2026-06'].forEach(m => add('cd', m));
    add('cd', '2026-06', { tag: 'd', month: '', dueDate: '2026-06-12' });
    const ctx = Pz.context({ now: new Date('2027-03-01T10:00:00Z'), properties, contracts, payments: pays, users: [] });
    const engine = new Set();
    Object.values(ctx.afterClose).forEach(a => [...a.open, ...a.paid].forEach(r => engine.add(r.id)));
    const byId = Object.fromEntries(contracts.map(c => [c.id, c]));
    const mine = new Set(pays.filter(p => R.afterClose(p, byId[p.contractId])).map(p => p.id));
    return eq([...mine].sort(), [...engine].sort(), 'rate dopo la chiusura') && ok(mine.has('ca_2026-12') && mine.has('cb_2026-01') && !mine.has('cb_2026-01pf') && !mine.has('cc_2025-08') && mine.has('cd_2026-06d'));
  });
  put('properties/pClosed', { ownerId: 'own1', address: 'Piazzale Esempio 42, Roma', interno: '11', source: 'palazzo-import', rataCard: { on: true, mandateAt: '2026-01-01', fee: 'absorbed' } });
  put('contracts/cClosed', { ...imported, propertyId: 'pClosed', tenantName: 'Ex Inquilina', status: 'terminated', terminatedAt: '2026-09-30', startDate: '2026-01-01', endDate: '2026-12-31' });
  rate('rAfter', 'cClosed', 'pClosed', { month: '2026-10', dueDate: '2026-10-05', periodFrom: '2026-10-01' });
  rate('rBefore', 'cClosed', 'pClosed', { month: '2026-09', dueDate: '2026-09-05', periodFrom: '2026-09-01' });
  await check('afterClose · /rata: la rata dopo la chiusura dice «niente da pagare», senza carta né bonifico, e una segnalazione non passa', async () => {
    const l = await rata({ op: 'lookup', id: 'rAfter', t: tk('rAfter') });
    const before = await rata({ op: 'lookup', id: 'rBefore', t: tk('rBefore') });
    const r = await rata({ op: 'report', id: 'rAfter', t: tk('rAfter'), date: '2026-10-03' });
    return eq([l.body.rata.state, l.body.rata.canPay, l.body.rata.card.available, l.body.payUrl, before.body.rata.canPay, r.statusCode, store.get('payments/rAfter').tenantReported],
      ['closed', false, false, '', true, 409, undefined]);
  });
  await check('afterClose · il link di pagamento non apre una Checkout e dice perché; /api/payments/pay risponde 409', async () => {
    const n0 = stripe().calls.length;
    const l = await link('rAfter', { lang: 'en' });
    const p = await pay({ paymentId: 'rAfter' }, 'tok-admin');
    return eq([stripe().calls.length - n0, /Nothing to pay/.test(String(l.body)), p.statusCode, p.body.error], [0, true, 409, 'payment_after_close']);
  });
  await check('afterClose · /rata in browser ha la sua scheda «Nothing to pay» (IT ed EN)', () => {
    const html = readFileSync(new URL('../../rata.html', import.meta.url), 'utf8');
    return ok(/if \(r\.state === 'closed'\)/.test(html) && html.includes("closedH: 'Nothing to pay'") && html.includes("closedH: 'Niente da pagare'"));
  });
  await check('afterClose · il SEPA non addebita la rata dopo la chiusura e la conta; quella dentro il contratto parte', async () => {
    const { collectSdd } = await import('../../api/payments/_sdd.js');
    put('contracts/cSdd', { propertyId: 'pStd', tenantName: 'Ex Sepa', status: 'expired', startDate: '2026-01-01', endDate: '2026-09-30',
      sdd: { status: 'active', customerId: 'cus_x', paymentMethodId: 'pm_x', activatedAt: '2026-01-01' } });
    put('payments/rSddIn', { contractId: 'cSdd', type: 'rent', month: '2026-09', amount: 900, status: 'pending', dueDate: '2026-09-30' });
    put('payments/rSddAfter', { contractId: 'cSdd', type: 'rent', month: '2026-10', amount: 900, status: 'pending', dueDate: '2026-10-01' });
    const n0 = (stripe().piCreated || []).length;
    const out = await at('2026-09-28T09:00:00Z', () => collectSdd({ cap: 10 }));
    const made = (stripe().piCreated || []).slice(n0).map(x => x.metadata.paymentId);
    return eq([made, out.afterClose, store.get('payments/rSddAfter').sddPiId], [['rSddIn'], 1, undefined]);
  });
}

console.log(`\nRata · soldi: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
