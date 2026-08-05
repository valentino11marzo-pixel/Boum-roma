// tests/sdd/run.mjs — il canone automatico SEPA, blindato.
//
// LE REGOLE DEI SOLDI: un addebito per rata PER COSTRUZIONE (idempotency
// key + guardia sddPiId), solo il canone (mai il deposito), mai una rata
// scaduta prima del mandato, un fallimento NON si ritenta da solo, una rata
// pagata per altra via non si sovrascrive MAI (allarme doppio incasso), la
// commissione parte dal seed e converge sul costo misurato — media PER
// ADDEBITO, perché il costo SEPA è flat. Poi il giro vero: collector →
// webhook succeeded/failed → /casa, su Firestore in memoria e Stripe mock.
// Uso: node tests/sdd/run.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p'; process.env.FIREBASE_PROJECT_ID = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
delete process.env.SDD_FEE_EUR; delete process.env.SDD_FEE_BUFFER;
delete process.env.SDD_FEE_MAX_PCT; delete process.env.SDD_LEAD_DAYS;

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };

// ─── Firestore in memoria ───────────────────────────────────────────────────
const store = new Map();
const js2fs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(js2fs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = js2fs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
};
const fs2js = (v) => {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fs2js);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fs2js(x); return o; }
  return null;
};
const DOCROOT = '/databases/(default)/documents';
const pathOf = (url) => decodeURIComponent(String(url).split(DOCROOT + '/')[1] || '').split('?')[0];
const deep = (obj, dotted) => String(dotted).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  if (url.includes('identitytoolkit')) {
    if (url.includes('signInWithPassword')) return new Response(JSON.stringify({ idToken: 'admin-tok' }), { status: 200 });
    if (url.includes('accounts:lookup')) {
      const tok = JSON.parse(opts.body).idToken;
      const who = { 'tok-ten': { localId: 'ten1', email: 'julie@x.com' }, 'tok-admin': { localId: 'adm1', email: 'v@boom.com' } }[tok];
      return new Response(JSON.stringify(who ? { users: [who] } : {}), { status: who ? 200 : 400 });
    }
  }
  if (url.includes(DOCROOT + ':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId;
    let rows = [...store.entries()].filter(([p]) => p.startsWith(coll + '/'));
    const ff = q.where && q.where.fieldFilter;
    if (ff && ff.op === 'EQUAL') rows = rows.filter(([, d]) => deep(d, ff.field.fieldPath) === fs2js(ff.value));
    return new Response(JSON.stringify(rows.slice(0, q.limit || 50).map(([p, d]) => ({
      document: { name: 'projects/test' + DOCROOT + '/' + p, fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, js2fs(v)])) },
    }))), { status: 200 });
  }
  if (url.includes(DOCROOT + '/') || url.includes(DOCROOT + '?')) {
    // POST di creazione con documentId (writeDoc): 409 se esiste
    if (method === 'POST') {
      const coll = pathOf(url) || decodeURIComponent(url.split(DOCROOT + '/')[1] || '').split('?')[0];
      const docId = new URL(url).searchParams.get('documentId');
      const full = coll + '/' + docId;
      if (store.has(full)) return new Response('exists', { status: 409 });
      const incoming = {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) incoming[k] = fs2js(v);
      store.set(full, incoming);
      return new Response(JSON.stringify({ name: 'projects/test' + DOCROOT + '/' + full }), { status: 200 });
    }
    const path = pathOf(url);
    if (method === 'GET') {
      if (!store.has(path)) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ name: 'projects/test' + DOCROOT + '/' + path, fields: Object.fromEntries(Object.entries(store.get(path)).map(([k, v]) => [k, js2fs(v)])) }), { status: 200 });
    }
    if (method === 'PATCH') {
      if (url.includes('currentDocument.exists=false') && store.has(path)) return new Response('exists', { status: 409 });
      const incoming = {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) incoming[k] = fs2js(v);
      store.set(path, { ...(store.get(path) || {}), ...incoming });
      return new Response(JSON.stringify({ name: path }), { status: 200 });
    }
  }
  throw new Error('unstubbed ' + method + ' ' + url);
};

const { sddFee, measuredSddCost, eligibleForCharge, collectSdd } = await import('../../api/payments/_sdd.js');

// ═══ La commissione: seed prudente, poi il misurato ═══
check('default: seed €0.50 + margine €1.50 = €2', sddFee(900, null) === 2);
check('SDD_FEE_EUR forza flat', (process.env.SDD_FEE_EUR = '3.5', sddFee(900, null) === 3.5));
delete process.env.SDD_FEE_EUR;
check('tetto % sui canoni piccoli: €50 → max €0.75', sddFee(50, null) === 0.75);
check('misurato: media PER ADDEBITO (flat), non sul volume', sddFee(900, { count: 10, costEur: 3.5 }) === 1.85 && measuredSddCost({ count: 10, costEur: 3.5 }).basis === 'measured');
check('sotto campione minimo resta il seed', measuredSddCost({ count: 3, costEur: 1 }).basis === 'seed');

// ═══ Chi si addebita e chi NO ═══
const today = new Date().toISOString().slice(0, 10);
const plus = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const SDD = { status: 'active', customerId: 'cus_1', paymentMethodId: 'pm_1', activatedAt: '2026-08-01T00:00:00Z' };
const P = { status: 'pending', dueDate: plus(3), amount: 900 };
check('rata in finestra + mandato attivo → si addebita', eligibleForCharge(P, SDD, today) === true);
check('mandato cancellato → no', eligibleForCharge(P, { ...SDD, status: 'cancelled' }, today) === false);
check('rata già pagata → no', eligibleForCharge({ ...P, status: 'paid' }, SDD, today) === false);
check('addebito già iniziato (sddPiId) → mai due volte', eligibleForCharge({ ...P, sddPiId: 'pi_x' }, SDD, today) === false);
check('guasto noto (sddInitError) → non si gira a vuoto', eligibleForCharge({ ...P, sddInitError: 'x' }, SDD, today) === false);
check('saldo deposito → MAI automatico', eligibleForCharge({ ...P, type: 'deposit-balance' }, SDD, today) === false);
check('fuori finestra (t+40) → non ancora', eligibleForCharge({ ...P, dueDate: plus(40) }, SDD, today) === false);
check('scaduta PRIMA del mandato → niente sorprese su debiti vecchi', eligibleForCharge({ ...P, dueDate: '2026-07-15' }, SDD, today) === false);
check('scaduta DOPO il mandato → si recupera da sola', eligibleForCharge({ ...P, dueDate: plus(-2) }, SDD, today) === true);

// ═══ Il collector sul Firestore finto ═══
store.set('contracts/ct1', { tenantName: 'Julie', tenantEmail: 'julie@x.com', tenantId: 'ten1', sdd: { ...SDD, email: 'julie@x.com' } });
store.set('payments/p1', { contractId: 'ct1', tenantId: 'ten1', status: 'pending', dueDate: plus(3), amount: 900, month: '2026-08' });
store.set('payments/p2', { contractId: 'ct1', status: 'pending', dueDate: plus(40), amount: 900, month: '2026-09' });
store.set('payments/p3', { contractId: 'ct1', status: 'paid', dueDate: plus(1), amount: 900 });

let out = await collectSdd();
const S = globalThis.__sdd;
const pi1 = S.pis[0];
check('un giro → UN addebito (p1), p2 fuori finestra e p3 pagata restano fuori', out.charged === 1 && S.pis.length === 1);
check('importo = rata + fee, in centesimi esatti', pi1.opts.amount === 90200 && pi1.opts.currency === 'eur');
check('off-session sul mandato giusto', pi1.opts.customer === 'cus_1' && pi1.opts.payment_method === 'pm_1' && pi1.opts.confirm === true && pi1.opts.off_session === true);
check('idempotency key deterministica sdd_<paymentId>', pi1.idempotencyKey === 'sdd_p1');
check('metadata completi (service, rata, email per la ricevuta)', pi1.opts.metadata.service === 'RENT_SDD' && pi1.opts.metadata.paymentId === 'p1' && pi1.opts.metadata.email === 'julie@x.com' && pi1.opts.metadata.fee === '2');
check('la rata è marcata processing con la fee', store.get('payments/p1').sddPiId === 'pi_test_1' && store.get('payments/p1').sddStatus === 'processing' && store.get('payments/p1').sddFeeEur === 2);

out = await collectSdd();
check('secondo giro → zero: la guardia sddPiId comanda', out.charged === 0 && S.pis.length === 1);

store.set('payments/p4', { contractId: 'ct1', status: 'pending', dueDate: today, amount: 800, month: '2026-08b' });
S.failPI = true;
out = await collectSdd();
check('Stripe rifiuta → sddInitError sul doc, mai un crash', out.failed === 1 && String(store.get('payments/p4').sddInitError).includes('sepa_declined'));
S.failPI = false;
out = await collectSdd();
check('il guasto noto parcheggia: nessun retry automatico', out.charged === 0);

// ═══ Il webhook ═══
const webhook = (await import('../../api/stripe-webhook.js')).default;
const mkRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(b) { this.body = b; return this; } });
const whReq = (event) => ({ method: 'POST', headers: { 'stripe-signature': 'sig' }, [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(event)); } });

// — attivazione mandato (checkout mode=setup) —
store.set('contracts/ct2', { tenantName: 'Anouk', tenantEmail: 'anouk@x.com', tenantId: 'ten2', sdd: { status: 'setup', customerId: 'cus_2' } });
S.setupIntent = { payment_method: { id: 'pm_9', sepa_debit: { last4: '4321' } }, mandate: 'mdt_1' };
const setupEvt = { id: 'evt_setup1', type: 'checkout.session.completed', data: { object: { id: 'cs_setup_9', mode: 'setup', setup_intent: 'seti_1', customer: 'cus_2', metadata: { service: 'SDD_SETUP', contractId: 'ct2', email: 'anouk@x.com' } } } };
let r = mkRes();
await webhook(whReq(setupEvt), r);
const ct2 = store.get('contracts/ct2');
check('SDD_SETUP → mandato attivo sul contratto (pm, IBAN, mandate ref)', r.body.sddActive === true && ct2.sdd.status === 'active' && ct2.sdd.paymentMethodId === 'pm_9' && ct2.sdd.ibanLast4 === '4321' && ct2.sdd.mandateRef === 'mdt_1');
r = mkRes();
await webhook(whReq(setupEvt), r);
check('replay del setup → duplicate, nessuna riscrittura', r.body.duplicate === true);

// — addebito riuscito (payment_intent.succeeded, giorni dopo) —
const paidEvt = { id: 'evt_pi1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_test_1', amount: 90200, latest_charge: 'ch_1', metadata: { service: 'RENT_SDD', paymentId: 'p1', contractId: 'ct1', amount: '900', fee: '2', email: 'julie@x.com', month: '2026-08' } } } };
r = mkRes();
await webhook(whReq(paidEvt), r);
const p1 = store.get('payments/p1');
check('succeeded → rata paid · sepa con fee e costo reale', r.body.sdd === true && p1.status === 'paid' && p1.paidVia === 'sepa' && p1.serviceFeeEur === 2 && p1.stripeCostEur === 0.35 && p1.marginEur === 1.65);
check('la statistica costi si aggiorna (media per addebito)', store.get('settings/sddFeeStats').count === 1 && store.get('settings/sddFeeStats').costEur === 0.35);
r = mkRes();
await webhook(whReq(paidEvt), r);
check('replay del succeeded → duplicate', r.body.duplicate === true);

// — pagata per ALTRA via mentre l'addebito era in volo: mai sovrascrivere —
store.set('payments/p5', { contractId: 'ct1', status: 'paid', paidVia: 'bank', amount: 900, month: '2026-10' });
r = mkRes();
await webhook(whReq({ id: 'evt_pi5', type: 'payment_intent.succeeded', data: { object: { id: 'pi_test_5', amount: 90200, metadata: { service: 'RENT_SDD', paymentId: 'p5', amount: '900', fee: '2' } } } }), r);
check('doppio incasso → allarme, il record bancario resta intatto', r.body.doublePayment === true && store.get('payments/p5').paidVia === 'bank');

// — addebito fallito: la rata torna manuale, mai un retry silenzioso —
store.set('payments/p6', { contractId: 'ct1', status: 'pending', sddPiId: 'pi_test_9', sddStatus: 'processing', amount: 900, month: '2026-11', dueDate: plus(2) });
r = mkRes();
await webhook(whReq({ id: 'evt_pif', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_test_9', metadata: { service: 'RENT_SDD', paymentId: 'p6', email: 'julie@x.com' }, last_payment_error: { message: 'insufficient_funds' } } } }), r);
const p6 = store.get('payments/p6');
check('failed → sddStatus failed, la rata RESTA pending (pagabile a mano)', r.body.sddFailed === true && p6.sddStatus === 'failed' && p6.status === 'pending' && String(p6.sddError).includes('insufficient'));
out = await collectSdd();
check('e il collector non la riprende mai da solo', out.charged === 0);

// — un PI di una Checkout carta NON è roba nostra —
r = mkRes();
await webhook(whReq({ id: 'evt_card', type: 'payment_intent.succeeded', data: { object: { id: 'pi_card_1', metadata: {} } } }), r);
check('PI senza service RENT_SDD → ignorato', r.body.ignored === 'payment_intent.succeeded');

// ═══ L'endpoint di attivazione (/api/payments/sdd-setup) ═══
const setup = (await import('../../api/payments/sdd-setup.js')).default;
store.set('users/ten1', { role: 'tenant', email: 'julie@x.com' });
store.set('users/adm1', { role: 'admin', email: 'v@boom.com' });
store.set('contracts/ct3', { tenantId: 'ten1', tenantName: 'Julie', tenantEmail: 'julie@x.com' });
store.set('contracts/ct4', { tenantId: 'altro', tenantName: 'X' });
const authReq = (tok, body) => ({ method: 'POST', headers: { authorization: 'Bearer ' + tok, origin: 'https://www.boomrome.com' }, body });
const mkRes2 = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });

r = mkRes2();
await setup(authReq('tok-ten', { contractId: 'ct4' }), r);
check('un tenant NON attiva il mandato di un altro → 403', r.code === 403);

r = mkRes2();
await setup(authReq('tok-ten', { contractId: 'ct1' }), r);
check('mandato già attivo → 409', r.code === 409 && r.body.error === 'already_active');

r = mkRes2();
await setup(authReq('tok-ten', { contractId: 'ct3' }), r);
await new Promise((x) => setTimeout(x, 30));
const sess = S.sessions.at(-1);
check('start → Checkout mode=setup sepa_debit con metadata SDD_SETUP', r.code === 200 && String(r.body.url).includes('stripe.test') && sess.mode === 'setup' && sess.payment_method_types[0] === 'sepa_debit' && sess.metadata.service === 'SDD_SETUP' && sess.metadata.contractId === 'ct3');
check('il customer nasce una volta e si persiste subito (riuso sui retry)', S.customers.length === 1 && store.get('contracts/ct3').sdd.customerId === 'cus_test_1');

r = mkRes2();
await setup(authReq('tok-admin', { contractId: 'ct2', action: 'cancel' }), r);
check('cancel (admin) → mandato spento + payment method staccato', r.code === 200 && store.get('contracts/ct2').sdd.status === 'cancelled' && S.detached.includes('pm_9'));
out = await collectSdd();
check('da lì il collector non addebita più quel contratto', out.charged === 0);

console.log(`\nSDD: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
