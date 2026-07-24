// tests/money/run.mjs — test dei percorsi soldi (senza rete, senza emulatore).
// 'stripe' è mockato via loader ESM; Firestore/IdentityToolkit/EmailJS via
// stub di global.fetch con uno store in-memory. Copre la NOSTRA logica:
// validazione, honeypot, prezzi server-side, idempotenza su retry Stripe,
// conversione pre-agreement idempotente.
// Uso: node tests/money/run.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.EMAILJS_PRIVATE_KEY = 'ek';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub fetch: store Firestore in-memory ───────────────────────────────
const store = new Map();        // 'collection/docId' → plain fields object
const emails = [];              // template_params delle email inviate
const queries = [];             // structuredQuery dei runQuery
globalThis.__stripeCalls = [];

const FS = 'firestore.googleapis.com';
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

function toFsFieldsShallow(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null) f[k] = { nullValue: null };
    else if (typeof v === 'boolean') f[k] = { booleanValue: v };
    else if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else f[k] = { stringValue: String(v) };
  }
  return f;
}

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'admin1' }] });
  if (url.includes('api.emailjs.com')) {
    emails.push(JSON.parse(opts.body).template_params);
    return new Response('OK', { status: 200 });
  }
  if (url.includes(FS)) {
    const path = url.split('/documents')[1] || '';
    if (path.startsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery;
      queries.push(q);
      const coll = q.from[0].collectionId;
      const field = q.where?.fieldFilter?.field?.fieldPath;
      const val = q.where?.fieldFilter?.value?.stringValue;
      const rows = [];
      for (const [key, fields] of store) {
        if (!key.startsWith(coll + '/')) continue;
        if (field && String(fields[field]) !== String(val)) continue;
        rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + key, fields: toFsFieldsShallow(fields) } });
      }
      return okJson(rows.length ? rows : [{}]);
    }
    const clean = path.replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = clean + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      const fields = JSON.parse(opts.body).fields || {};
      const flat = {};
      for (const [k, v] of Object.entries(fields)) flat[k] = v.stringValue ?? v.booleanValue ?? (v.integerValue ? +v.integerValue : v.doubleValue ?? null);
      store.set(key, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const fields = JSON.parse(opts.body).fields || {};
      const flat = store.get(clean) || {};
      for (const [k, v] of Object.entries(fields)) flat[k] = v.stringValue ?? v.booleanValue ?? (v.integerValue ? +v.integerValue : v.doubleValue ?? null);
      store.set(clean, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + clean });
    }
    // GET doc
    const doc = store.get(clean);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + clean, fields: toFsFieldsShallow(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

// ── Helpers req/res ─────────────────────────────────────────────────────
const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  send(t) { this.body = t; return this; },
  end() { return this; },
});
const mkReq = (body, headers = {}) => ({ method: 'POST', headers, body });
const mkStreamReq = (obj) => ({
  method: 'POST',
  headers: { 'stripe-signature': 'sig' },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(obj)); },
});
const sessionEvent = (metadata, over = {}) => ({
  type: 'checkout.session.completed',
  data: { object: { id: over.id || 'cs_live_abc123', amount_total: over.amount_total ?? 8900, currency: 'eur', customer_email: 'c@x.it', payment_intent: 'pi_1', metadata } },
});

// ═══ 1. service-checkout ═══
const svc = (await import('../../api/service-checkout.js')).default;
{
  let r = mkRes();
  await svc(mkReq({ kind: 'virtual-viewing', name: 'A', email: 'a@b.it', phone: '333', company: 'BOT' }, { 'x-forwarded-for': '1.1.1.1' }), r);
  check('service: honeypot → finto ok, Stripe NON chiamato', r.body?.url === '/' && globalThis.__stripeCalls.length === 0);

  r = mkRes();
  await svc(mkReq({ kind: 'not-a-service', name: 'A', email: 'a@b.it', phone: '333' }, { 'x-forwarded-for': '1.1.1.2' }), r);
  check('service: kind sconosciuto → 400', r.code === 400);

  r = mkRes();
  await svc(mkReq({ kind: 'contract-check-express', name: 'A', email: 'a@b.it', phone: '333' }, { 'x-forwarded-for': '1.1.1.3' }), r);
  const call = globalThis.__stripeCalls.at(-1);
  check('service: prezzo dal catalogo server (€49)', call?.line_items?.[0]?.price_data?.unit_amount === 4900);
}

// ═══ 2. create-checkout (PFS €350) ═══
const pfs = (await import('../../api/create-checkout.js')).default;
{
  let r = mkRes();
  await pfs(mkReq({ name: 'A', email: 'a@b.it', phone: '3', company: 'BOT' }, { 'x-forwarded-for': '2.2.2.1' }), r);
  check('pfs: honeypot attivo', r.body?.url === '/');

  r = mkRes();
  await pfs(mkReq({ name: 'A', email: 'niente-chiocciola', phone: '3' }, { 'x-forwarded-for': '2.2.2.2' }), r);
  check('pfs: email senza @ → 400', r.code === 400);

  const before = globalThis.__stripeCalls.length;
  r = mkRes();
  await pfs(mkReq({ name: 'A', email: 'a@b.it', phone: '3' }, { 'x-forwarded-for': '2.2.2.3' }), r);
  const c = globalThis.__stripeCalls.at(-1);
  check('pfs: €350 hardcoded server-side', globalThis.__stripeCalls.length === before + 1 && c.line_items[0].price_data.unit_amount === 35000);

  let last;
  for (let i = 0; i < 10; i++) { last = mkRes(); await pfs(mkReq({ name: 'A', email: 'a@b.it', phone: '3' }, { 'x-forwarded-for': '9.9.9.9' }), last); }
  check('pfs: rate-limit per IP → 429', last.code === 429);
}

// ═══ 3. reserve-checkout (clamp importo) ═══
const rsv = (await import('../../api/reserve-checkout.js')).default;
{
  let r = mkRes();
  await rsv(mkReq({ name: 'A', email: 'a@b.it', phone: '3', amount: 50 }, { 'x-forwarded-for': '3.3.3.1' }), r);
  check('reserve: importo sotto soglia → default €300', globalThis.__stripeCalls.at(-1).line_items[0].price_data.unit_amount === 30000);

  r = mkRes();
  await rsv(mkReq({ name: 'A', email: 'a@b.it', phone: '3', amount: 99999 }, { 'x-forwarded-for': '3.3.3.2' }), r);
  check('reserve: clamp massimo €2000', globalThis.__stripeCalls.at(-1).line_items[0].price_data.unit_amount === 200000);
}

// ═══ 4. stripe-webhook: idempotenza SERVICE ═══
const webhook = (await import('../../api/stripe-webhook.js')).default;
{
  const ev = sessionEvent({ service: 'SERVICE', kind: 'virtual-viewing', name: 'Ada B', email: 'ada@x.it', phone: '333' });
  let r = mkRes();
  const emailsBefore = emails.length;
  await webhook(mkStreamReq(ev), r);
  check('webhook SERVICE: 1° evento → lead scritto', r.code === 200 && [...store.keys()].some(k => k.startsWith('leads/svc_')));
  check('webhook SERVICE: 1° evento → 2 email (admin+cliente)', emails.length === emailsBefore + 2);

  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook SERVICE: retry stessa sessione → duplicate, ZERO nuove email', r.body?.duplicate === true && emails.length === emailsBefore + 2);
}

// ═══ 5. stripe-webhook: idempotenza DEPOSIT ═══
{
  store.set('contracts/ctr1', { tenantId: 't1', propertyId: 'p1', tenantEmail: 't@x.it' });
  const ev = sessionEvent({ service: 'DEPOSIT', contractId: 'ctr1' }, { id: 'cs_dep_1', amount_total: 120000 });
  let r = mkRes();
  const eb = emails.length;
  await webhook(mkStreamReq(ev), r);
  check('webhook DEPOSIT: 1° evento → payment dep_ scritto + contratto marcato', store.has('payments/dep_ctr1') && store.get('contracts/ctr1').depositPaid === true);
  const firstEmails = emails.length - eb;

  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook DEPOSIT: retry → duplicate, niente nuove email', r.body?.duplicate === true && emails.length === eb + firstEmails);
}

// ═══ 6. stripe-webhook: PREAGREEMENT pagato + duplicate ═══
{
  const token = 'a'.repeat(32);
  store.set('preAgreements/pa1', { token, ref: 'BOOM-X', status: 'accepted' });
  const ev = sessionEvent({ service: 'PREAGREEMENT', token }, { id: 'cs_pa_1', amount_total: 50000 });
  let r = mkRes();
  await webhook(mkStreamReq(ev), r);
  const pa = store.get('preAgreements/pa1');
  check('webhook PA: pagamento → status paid + paidSessionId', pa.status === 'paid' && pa.paidSessionId === 'cs_pa_1');

  const eb = emails.length;
  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook PA: retry → duplicate, niente nuove email', r.body?.duplicate === true && emails.length === eb);
}

// ═══ 7. convertPaToContract: idempotente su ID deterministico ═══
{
  const { convertPaToContract } = await import('../../api/preagreement/convert.js');
  store.set('properties/prop9', { ownerId: 'll9', name: 'Casa', ownerName: 'Rossi' });
  store.set('users/u9', { email: 'ten@x.it', role: 'tenant' });
  const pa = {
    status: 'accepted', propertyId: 'prop9', autoConvert: true, ref: 'BOOM-Y',
    tenant: { fullName: 'Teo Neri', email: 'ten@x.it', phone: '333' },
    money: { rent: 1200, deposit: 2400, depositMonths: 2 }, lease: { months: 12, startDate: '2026-09-01' },
  };
  const out1 = await convertPaToContract({ pa, paId: 'pa9' });
  check('convert: 1ª chiamata crea contracts/pa_pa9', out1.ok && out1.contractId === 'pa_pa9' && store.has('contracts/pa_pa9'));
  const out2 = await convertPaToContract({ pa, paId: 'pa9' });   // race/retry: back-link stantio, stesso PA
  check('convert: 2ª chiamata → already, STESSO contratto (niente duplicati)', out2.ok && out2.already === true && out2.contractId === 'pa_pa9');
  const contractDocs = [...store.keys()].filter(k => k.startsWith('contracts/') && store.get(k).preAgreementId === 'pa9');
  check('convert: un solo contratto per il PA', contractDocs.length === 1);
}

console.log('\n' + '─'.repeat(48));
console.log(`Money paths: ${passed} passed, ${failed} failed`);
if (failed) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('Tutti i percorsi soldi si comportano come previsto.');
