// Real handlers; only Stripe and Firestore/IdentityToolkit network mocked.
// No real checkout, financial write, email, or other network can escape.
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
Object.assign(process.env, { FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'admin@example.test', FIREBASE_ADMIN_PASS: 'p',
  FIREBASE_PROJECT_ID: 'test', STRIPE_SECRET_KEY: 'sk_test_mock', HOMIE_SECRET: 'test-payment-link-secret' });
for (const key of ['RENT_FEE_PCT', 'RENT_FEE_MIN', 'RENT_FEE_BUFFER', 'RENT_FEE_MAX_PCT']) delete process.env[key];

let passed = 0, failed = 0;
const check = (name, ok) => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const store = new Map();
const writes = [];
let reportConflict=false;
globalThis.__checkout = { calls: [], sessions: new Map(), expired: [] };
const stripe = globalThis.__checkout;
const identities = { admin: { localId: 'admin1', email: 'admin@example.test' }, tenant: { localId: 'tenant1', email: 'tenant@example.test' }, owner: { localId: 'owner1' } };
const fsValue = value => {
  if (value == null) return { nullValue: null };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } };
  if (typeof value === 'object') return { mapValue: { fields: fields(value) } };
  return { stringValue: String(value) };
};
const fields = doc => Object.fromEntries(Object.entries(doc).map(([key, value]) => [key, fsValue(value)]));
const fromFs = value => {
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, fromFs(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFs);
  if ('integerValue' in value) return Number(value.integerValue);
  return Object.values(value)[0];
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
globalThis.fetch = async (input, opts = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    if (url.pathname.includes('signInWithPassword')) return json({ idToken: 'server-token' });
    const who = identities[JSON.parse(opts.body).idToken];
    return json(who ? { users: [who] } : {}, who ? 200 : 400);
  }
  if (url.hostname !== 'firestore.googleapis.com') throw new Error('Network not mocked: ' + url.hostname);
  const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
  if (url.pathname.endsWith('/documents:commit')) {
    const batch=JSON.parse(opts.body).writes;
    if(reportConflict || batch.some(w=>w.currentDocument?.updateTime!=='2026-09-18T00:00:00.000000Z'))return json({error:{status:'FAILED_PRECONDITION'}},409);
    for(const w of batch){const key=w.update.name.split('/documents/')[1], patch=Object.fromEntries(Object.entries(w.update.fields).map(([k,v])=>[k,fromFs(v)]));writes.push(key);store.set(key,{...store.get(key),...patch});}
    return json({writeResults:[]});
  }
  if (opts.method === 'POST') {
    const id = url.searchParams.get('documentId') || 'test_' + writes.length;
    const doc = Object.fromEntries(Object.entries(JSON.parse(opts.body).fields).map(([k, v]) => [k, fromFs(v)]));
    writes.push(path + '/' + id); store.set(path + '/' + id, doc);
    return json({ name: path + '/' + id });
  }
  if (opts.method === 'PATCH') {
    const doc = Object.fromEntries(Object.entries(JSON.parse(opts.body).fields).map(([k, v]) => [k, fromFs(v)]));
    writes.push(path); store.set(path, { ...store.get(path), ...doc });
    return json({ name: path });
  }
  return store.has(path) ? json({ name: url.pathname, fields: fields(store.get(path)), updateTime:'2026-09-18T00:00:00.000000Z' }) : json({}, 404);
};
store.set('users/admin1', { role: 'admin' });
store.set('users/tenant1', { role: 'tenant' });
store.set('users/owner1', { role: 'owner' });
store.set('properties/prop1', { ownerId: 'owner1' });
store.set('settings/rentFeeStats', { count: 10, volumeEur: 9000, costEur: 180 });
const { default: pay } = await import('../../api/payments/pay.js');
const { default: link } = await import('../../api/payments/link.js');
const { default: linkFor } = await import('../../api/payments/link-for.js');
const { payToken } = await import('../../api/payments/_token.js');
const res = () => ({ code: 0, body: null, headers: {},
  status(n) { this.code = n; return this; }, json(o) { this.body = o; return this; }, send(o) { this.body = o; return this; },
  end() { return this; }, setHeader(k, v) { this.headers[k] = v; }, redirect(n, url) { this.code = n; this.url = url; return this; } });
const post = (body, role = 'admin') => ({ method: 'POST', headers: { authorization: 'Bearer ' + role }, body });
const get = (id, extra = {}, kind = 'pay') => ({ method: 'GET', query: { k: kind, id, t: payToken(kind, id), ...extra } });
const installment = (id, over = {}) => { store.set('payments/' + id, { status: 'pending', tenantId: 'tenant1', propertyId: 'prop1', contractId: 'ctr1', amount: 900, dueDate: '2026-09-10', ...over }); };
const call = async (handler, req) => { const r = res(); await handler(req, r); return r; };

for (const [label, over, error] of [
  ['paid', { status: 'paid' }, 'already_paid'], ['cancelled', { status: 'cancelled' }, 'payment_cancelled'],
  ['SDD processing', { sddPiId: 'pi_sdd', sddStatus: 'processing' }, 'sdd_processing'],
  ['SDD legacy in progress', { sddPiId: 'pi_sdd' }, 'sdd_processing'],
  ['reported transfer', {tenantReported:true}, 'payment_reported'],
  ['legacy reported', {status:'reported'}, 'payment_reported'],
  ['card processing', { status: 'processing' }, 'payment_processing'],
  ['unknown status', { status: 'refunded' }, 'payment_not_payable'],
]) {
  installment('guard', over);
  const before = stripe.calls.length, beforeWrites = writes.length;
  let r = await call(pay, post({ paymentId: 'guard' }, 'tenant'));
  check(`${label}: authenticated pay blocks`, r.code === 409 && r.body.error === error);
  r = await call(linkFor, post({ kind: 'pay', id: 'guard' }));
  check(`${label}: operator cannot issue payment link`, r.code === 409 && r.body.error === error);
  r = await call(link, get('guard'));
  check(`${label}: stable public link shows status, never redirects`, r.code === 200 && !r.url);
  check(`${label}: no Stripe session or Firestore write`, stripe.calls.length === before && writes.length === beforeWrites);
}
installment('paid-receipt', { status: 'paid', receiptUrl: 'https://pay.stripe.com/receipts/test', paidDate: '2026-09-15' });
delete process.env.STRIPE_SECRET_KEY;
let r = await call(link, get('paid-receipt'));
check('already paid receipt remains available with new checkout disabled', r.code === 200 && r.body.includes('https://pay.stripe.com/receipts/test'));
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
installment('other', { tenantId: 'tenant2' });
let before = stripe.calls.length;
r = await call(pay, post({ paymentId: 'other' }, 'tenant'));
check('tenant cannot pay another tenant installment', r.code === 403 && stripe.calls.length === before);
installment('other-owner', { propertyId: 'prop2' });
r = await call(linkFor, post({ kind: 'pay', id: 'other-owner' }, 'owner'));
check('owner cannot generate another property link', r.code === 403);
for (const badAmount of [true, null, '900,50', '900.501']) {
  installment('bad-amount', { amount: badAmount });
  before = stripe.calls.length;
  r = await call(pay, post({ paymentId: 'bad-amount' }, 'tenant'));
  check(`malformed amount ${String(badAmount)} blocks authenticated payment`, r.code === 400 && stripe.calls.length === before);
  r = await call(link, get('bad-amount'));
  check(`malformed amount ${String(badAmount)} blocks public checkout`, r.code === 400 && stripe.calls.length === before);
}

installment('rent');
r = await call(link, get('rent'));
let first = stripe.calls.at(-1), firstId = store.get('payments/rent').checkoutSessionId;
check('public rent uses measured fee (€18, same as authenticated flow)', first.line_items[1].price_data.unit_amount === 1800);
check('public link checkout exposes card wallets through hosted Stripe', first.payment_method_types.join() === 'card' && r.code === 303);
check('success and cancel return to read-only landing', first.success_url.endsWith('&return=success') && first.cancel_url.endsWith('&return=cancel'));
before = stripe.calls.length;
r = await call(link, get('rent'));
check('resending/reopening public link reuses the same open checkout', stripe.calls.length === before && r.url.endsWith(firstId));
r = await call(pay, post({ paymentId: 'rent' }, 'tenant'));
check('switching public link to portal reuses same checkout', stripe.calls.length === before && r.body.checkoutUrl.endsWith(firstId) && r.body.fee === 18);
stripe.sessions.get(firstId).status = 'complete'; stripe.sessions.get(firstId).payment_status = 'paid';
r = await call(link, get('rent'));
check('Stripe complete before webhook does not open another public checkout', r.code === 200 && r.body.includes('Conferma in arrivo') && stripe.calls.length === before);
r = await call(pay, post({ paymentId: 'rent' }, 'tenant'));
check('Stripe complete before webhook blocks portal recharge', r.code === 409 && r.body.error === 'payment_processing' && stripe.calls.length === before);
check('Stripe completion never marks Firestore paid without webhook', store.get('payments/rent').status === 'pending');

installment('return-without-session');
before = stripe.calls.length;
for (const status of ['success', 'cancel']) {
  r = await call(link, get('return-without-session', { return: status }));
  check(`${status} return is read-only even without a saved checkout`, r.code === 200 && !r.url && stripe.calls.length === before);
}
check('return parameter is not proof of payment', store.get('payments/return-without-session').status === 'pending');

installment('failed-sdd', { sddPiId: 'pi_failed', sddStatus: 'failed' });
r = await call(pay, post({ paymentId: 'failed-sdd' }, 'tenant'));
check('failed SDD allows a manual card retry', r.code === 200 && r.body.ok);
let retryId = store.get('payments/failed-sdd').checkoutSessionId;
stripe.sessions.get(retryId).status = 'expired';
before = stripe.calls.length;
r = await call(link, get('failed-sdd'));
check('expired checkout permits one fresh public checkout', r.code === 303 && stripe.calls.length === before + 1);

installment('corrected');
await call(link, get('corrected'));
let oldId = store.get('payments/corrected').checkoutSessionId;
store.get('payments/corrected').amount = 1000;
r = await call(pay, post({ paymentId: 'corrected' }));
check('correcting amount expires old payable checkout before replacement', stripe.expired.includes(oldId) && r.body.amount === 1000);
check('replacement exact principal matches corrected record', stripe.calls.at(-1).line_items[0].price_data.unit_amount === 100000);
stripe.readError = true; before = stripe.calls.length;
r = await call(link, get('corrected'));
check('Stripe lookup uncertainty fails closed without a new checkout', r.code === 502 && stripe.calls.length === before);
stripe.readError = false;
installment('wrong-pointer', { checkoutSessionId: oldId });
r = await call(pay, post({ paymentId: 'wrong-pointer' }));
check('checkout from another document never reused or replaced silently', r.code === 502 && stripe.calls.length === before);
installment('missing-pointer', { checkoutSessionId: 'cs_missing' });
r = await call(pay, post({ paymentId: 'missing-pointer' }));
check('missing saved Stripe checkout fails closed: disappearance is not expiry', r.code === 502 && stripe.calls.length === before);
installment('same-total');
await call(link, get('same-total'));
oldId = store.get('payments/same-total').checkoutSessionId;
store.get('payments/same-total').amount = 918;
process.env.RENT_FEE_PCT = '0';
r = await call(pay, post({ paymentId: 'same-total' }));
check('same total with different rent/fee split replaces the old principal', stripe.expired.includes(oldId) && r.body.amount === 918 && r.body.fee === 0);
delete process.env.RENT_FEE_PCT;

store.set('invoices/inv1', { status: 'pending', amount: 300, number: '2026/001' });
r = await call(link, get('inv1', {}, 'inv'));
check('company invoice keeps zero rent fee and INVOICE identity', r.code === 303 && stripe.calls.at(-1).line_items.length === 1 && stripe.calls.at(-1).metadata.service === 'INVOICE');
before = stripe.calls.length;
r = await call(link, get('inv1', {}, 'inv'));
check('company invoice repeat link also reuses session', r.code === 303 && stripe.calls.length === before);
store.set('invoices/inv-sent', { status: 'sent', amount: 300 });
r = await call(linkFor, post({ kind: 'inv', id: 'inv-sent' }));
check('issued company invoice status sent remains linkable', r.code === 200 && r.body.ok);
store.set('invoices/inv-draft', { status: 'draft', amount: 300 });
before = stripe.calls.length;
r = await call(link, get('inv-draft', {}, 'inv'));
check('draft invoice needs verification rather than being charged', r.code === 200 && r.body.includes('Pagamento da verificare') && stripe.calls.length === before);

// Inspect the provider payload from BOTH real handlers, so UI-only labels
// cannot conceal a utility bill being described as rent at checkout.
for (const route of ['pay', 'link']) {
  for (const [type, expected] of [
    ['utilities', 'Addebito contrattuale'], ['service-fee', 'Addebito contrattuale'],
    ['deposit', 'Deposito cauzionale'], ['deposit-balance', 'Saldo deposito cauzionale'],
    ['rent', 'Canone di locazione — 2026-09'],
  ]) {
    const id = `label-${route}-${type}`;
    const description = type === 'utilities' ? 'Conguaglio utenze settembre' : `Dettaglio ${type}`;
    installment(id, { type, description, amount: 120.50 });
    before = stripe.calls.length;
    r = route === 'pay'
      ? await call(pay, post({ paymentId: id }, 'tenant'))
      : await call(link, get(id));
    const principal = stripe.calls.at(-1).line_items[0].price_data;
    check(`${route}: ${type} has its correct provider label and original description`,
      stripe.calls.length === before + 1 && (route === 'pay' ? r.code === 200 : r.code === 303) &&
      principal.product_data.name === expected && principal.product_data.description === description && principal.unit_amount === 12050);
  }
}

// Recipient-facing status pages identify the authoritative document and
// offer only the action appropriate to that state. URL text is not evidence.
for (const [name, over, query, action] of [
  ['paid', { status: 'paid', paidDate: '2026-09-15', receiptUrl: 'https://pay.stripe.com/receipts/context' }, {}, 'receipt'],
  ['pending confirmation', {}, { return: 'success' }, 'refresh'],
  ['SEPA processing', { sddPiId: 'pi_context', sddStatus: 'processing' }, {}, 'refresh'],
  ['cancelled', { status: 'cancelled', receiptUrl: 'https://pay.stripe.com/receipts/stale' }, {}, 'none'],
]) {
  installment('context', { type: 'utilities', description: 'Conguaglio acqua', month: '2026-09', coversTo: '2026-10', amount: 120.50, ...over });
  const sessionsBefore = stripe.calls.length, writesBefore = writes.length;
  r = await call(link, get('context', { ...query, amount: '99999', month: '2030-01', type: 'rent' }));
  check(`${name}: page identifies actual type, period and principal without trusting query parameters`,
    r.code === 200 && r.body.includes('<h2>Addebito contrattuale</h2>') && r.body.includes('Conguaglio acqua') &&
    r.body.includes('settembre 2026 – ottobre 2026') && r.body.includes('€120,50') &&
    r.body.includes('Eventuali commissioni di pagamento sono separate.') && !r.body.includes('99999') && !r.body.includes('2030'));
  const actions = [...r.body.matchAll(/<a class="action" href="([^"]+)">([^<]+)<\/a>/g)];
  check(`${name}: primary action is ${action}`, action === 'none' ? actions.length === 0
    : actions.length === 1 && (action === 'receipt'
      ? actions[0][1] === 'https://pay.stripe.com/receipts/context' && actions[0][2] === 'Vedi la ricevuta'
      : actions[0][1].endsWith('&amp;return=success') && actions[0][2] === 'Aggiorna lo stato'));
  check(`${name}: status presentation has no financial side effects or automatic reload`,
    stripe.calls.length === sessionsBefore && writes.length === writesBefore && !r.body.includes('<script') && !/http-equiv=["']refresh/i.test(r.body));
}
installment('missing-context', { amount: null, month: '', dueDate: '', status: 'processing' });
r = await call(link, get('missing-context'));
check('missing amount/period are explicitly unknown rather than invented zero or month',
  r.body.includes('<dd>Non indicato</dd>') && r.body.includes('<strong>Da verificare</strong>') && !r.body.includes('€0,00'));

store.set('invoices/escaped-context', { status: 'paid', amount: 500, number: '<img src=x onerror=alert(1)>',
  service: '<script>alert(1)</script>', paidDate: '<img src=x onerror=alert(2)>', receiptUrl: 'javascript:alert(3)' });
r = await call(link, get('escaped-context', {}, 'inv'));
check('stored document context is escaped and unsafe receipt URL is never actionable',
  r.body.includes('&lt;img src=x onerror=alert(1)&gt;') && r.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;') &&
  !r.body.includes('<img') && !r.body.includes('<script') && !r.body.includes('javascript:') && !r.body.includes('class="action"'));
check('paid without available receipt offers assistance without pretending a download exists',
  r.body.includes('Pagamento confermato') && r.body.includes('Puoi richiedere la ricevuta a BOOM.') && !r.body.includes('Vedi la ricevuta'));

const {default:report}=await import('../../api/payments/report.js');
installment('transfer-report');
const preReport=JSON.stringify(store.get('payments/transfer-report'));
r=await call(report,post({paymentId:'transfer-report',action:'report'},'tenant'));
check('report saves only the notice, never amount/status/paid date',r.code===200&&store.get('payments/transfer-report').tenantReported===true&&store.get('payments/transfer-report').status==='pending'&&store.get('payments/transfer-report').amount===900&&!store.get('payments/transfer-report').paidDate);
const reportWrites=writes.length;
r=await call(report,post({paymentId:'transfer-report',action:'report'},'tenant'));
check('duplicate report is idempotent',r.code===200&&writes.length===reportWrites);
r=await call(link,get('transfer-report'));
check('old public link clearly shows reported state and does not reopen checkout',r.code===200&&r.body.includes('Pagamento segnalato')&&!r.url);
r=await call(report,post({paymentId:'transfer-report',action:'withdraw'},'tenant'));
check('tenant can withdraw own mistaken notice without changing the installment',r.code===200&&store.get('payments/transfer-report').tenantReported===false&&store.get('payments/transfer-report').status==='pending');
installment('not-owned',{tenantId:'someone-else'});
const protectedWrites=writes.length;
r=await call(report,post({paymentId:'not-owned',action:'report'},'tenant'));
check('report rejects another tenant installment',r.code===403&&writes.length===protectedWrites);
r=await call(report,post({paymentId:'transfer-report',action:'report'},'admin'));
check('admin preview cannot submit a tenant declaration',r.code===403&&writes.length===protectedWrites);
for(const fields of [{status:'paid'},{status:'cancelled'},{sddPiId:'pi_busy',sddStatus:'processing'},{cardStatus:'processing'},{status:'unknown'},{amount:null}]){
  installment('changed',fields);const n=writes.length;
  r=await call(report,post({paymentId:'changed',action:'report'},'tenant'));
  check('fresh non-payable state refuses report '+JSON.stringify(fields),r.code===409&&writes.length===n);
}
installment('settled',{status:'paid',tenantReported:true});
r=await call(report,post({paymentId:'settled',action:'withdraw'},'tenant'));
check('withdraw never resets an already confirmed payment',r.code===409&&store.get('payments/settled').status==='paid');
installment('cas-race');reportConflict=true;const casWrites=writes.length;
r=await call(report,post({paymentId:'cas-race',action:'report'},'tenant'));reportConflict=false;
check('concurrent change refuses the report rather than overwriting the new state',r.code===409&&writes.length===casWrites&&!store.get('payments/cas-race').tenantReported);
r=await call(report,post({paymentId:'../users/admin1',action:'report'},'tenant'));
check('report rejects arbitrary document paths',r.code===400);
console.log(`\nPayment links safety: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
