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
  return store.has(path) ? json({ name: url.pathname, fields: fields(store.get(path)) }) : json({}, 404);
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

console.log(`\nPayment links safety: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
