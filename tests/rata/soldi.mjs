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
await check('rata · annullare pulisce TUTTO (ricevuta compresa): la nuova segnalazione senza ricevuta non risulta "con ricevuta"', async () => {
  const w = await rata({ op: 'withdraw', id: 'rImp', t: tk('rImp') });
  const p = store.get('payments/rImp');
  eq([w.statusCode, p.tenantReported, p.proofUrl, p.proofName, p.tenantReportDate, p.tenantNotes, p.tenantReports], [200, false, null, null, null, null, null], 'pulita');
  eq(p.tenantReportWithdrawn.reports.length, 2, 'la storia resta a parte');
  await rata({ op: 'report', id: 'rImp', t: tk('rImp'), date: '2026-10-05' });
  const v = (await rata({ op: 'lookup', id: 'rImp', t: tk('rImp') })).body.rata;
  return eq([v.state, v.hasProof, v.reports.length], ['reported', false, 1]);
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
  return eq([pid.statement_descriptor_suffix, /int\. 8/.test(pid.description || '')], ['CANONE', true]);
});
await check('link · la ricevuta va a chi paga: l\'email del contratto quando la rata non la porta', async () =>
  eq(stripe().calls.at(-1).customer_email, 'lena@example.invalid'));
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

console.log(`\nRata · soldi: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
