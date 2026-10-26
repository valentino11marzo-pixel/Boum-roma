// tests/cities/checkout.mjs — the till of the city desks, on the REAL handlers.
//
// BOOM_CITIES_BRIEF.md v1.1 (14/10): a search desk with `checkout: true` sells
// its three plans through the Rome Services 2.0 rail — api/service-checkout.js
// (POST { city, kind }) → Stripe Checkout → api/stripe-webhook.js SERVICE
// branch → a paid lead in the shared `leads` schema WITH the market, so the
// Commerciale stands down and the Telegram card speaks of the city.
//
// What breaks if this goes red:
//   - a waitlist desk (Paris, Berlin) or a search desk whose till
//     is closed being charged by a hand-made POST (400 checkout_closed, no
//     Stripe call) — shown is not charged;
//   - the price coming from the browser instead of CITY_PLANS;
//   - the paid lead filed as a Rome service (no market → the Commerciale
//     drafts a Rome reply to someone who just paid for Amsterdam);
//   - the retry of a Stripe event sending the emails twice;
//   - the Rome services changing behaviour (phone still required, thank-you
//     page still the landing).
//
// 'stripe' is mocked by the money suite's loader; Firestore and EmailJS by a
// fetch stub with an in-memory store. No network.

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
register('../money/loader.mjs', import.meta.url);

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.EMAILJS_PRIVATE_KEY = 'ek';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? ` — ${why}` : '')));
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

console.log('\n\x1b[1m▸ citiescheckout\x1b[0m  the till of the city desks: the real checkout and webhook, shown is not charged');

// ── Firestore + EmailJS in memory ───────────────────────────────────────────
const store = new Map();
const emails = [];
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fromFsV = (v) => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFsV);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFsV(x); return o; }
  return null;
};
globalThis.__stripeCalls = [];
let failClientMail = false;
// a transient Firestore failure on a GET, injected per document path: the
// next n reads answer 503 (review 22/10: the file_ref read is retried once,
// and a read that fails twice is written on the lead, never taken as absent)
const failGets = new Map(), getReads = new Map();
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'admin1' }] });
  if (url.includes('api.emailjs.com')) {
    const tp = JSON.parse(opts.body).template_params;
    if (failClientMail && tp.to_email !== 'valentino@boom-rome.com') return new Response('quota', { status: 500 });
    emails.push(tp); return new Response('OK', { status: 200 });
  }
  if (url.includes('api.telegram.org')) return okJson({ ok: true });
  if (url.includes('firestore.googleapis.com')) {
    const p = url.split('/documents')[1] || '';
    const clean = p.replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (p.startsWith(':runQuery')) return okJson([{}]);
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = clean + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      const flat = {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) flat[k] = fromFsV(v);
      store.set(key, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') { const flat = store.get(clean) || {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) flat[k] = fromFsV(v); store.set(clean, flat); return okJson({}); }
    getReads.set(clean, (getReads.get(clean) || 0) + 1);
    if ((failGets.get(clean) || 0) > 0) { failGets.set(clean, failGets.get(clean) - 1); return new Response('unavailable', { status: 503 }); }
    const doc = store.get(clean);
    if (!doc) return new Response('not found', { status: 404 });
    // scalars AND maps, like the real Firestore: the webhook's readDoc
    // flattens maps to null on its own, fsGet (the file_ref check, the
    // GET ?paid= of /api/city-lead) reads the nested `city` block
    const toFsV = (v) => {
      if (v === null || v === undefined) return { nullValue: null };
      if (typeof v === 'string') return { stringValue: v };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsV) } };
      if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFsV(x); return { mapValue: { fields: f } }; }
      return { nullValue: null };
    };
    const fields = {};
    for (const [k, v] of Object.entries(doc)) fields[k] = toFsV(v);
    return okJson({ name: 'projects/p/databases/(default)/documents/' + clean, fields });
  }
  throw new Error('fetch non stubbata: ' + url);
};
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(t) { this.body = t; return this; }, end() { return this; } });
let ipSeq = 0;
const post = async (handler, body, ip) => { const r = mkRes(); await handler({ method: 'POST', headers: { 'x-forwarded-for': ip || `10.7.0.${++ipSeq}` }, body, socket: {} }, r); return r; };
const stream = (obj) => ({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(obj)); } });
const event = (metadata, over = {}) => ({ type: 'checkout.session.completed', data: { object: { id: over.id || 'cs_city_1', amount_total: over.amount_total ?? 50000, currency: 'eur', customer_email: 'anna@example.com', customer_details: over.customer_details || null, payment_intent: 'pi_1', metadata } } });

const { default: checkout } = await import('../../api/service-checkout.js');
const { default: webhook, withdrawalWindow, HOLIDAY_KEYS } = await import('../../api/stripe-webhook.js');
// the lead the webhook writes: leads/svc_<session id, alphanumerics only, 30 chars>
const svcLead = (sid) => store.get('leads/svc_' + sid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30));
const { CITY_MARKETS, CITY_PLANS, cityOffer, isCityMarket, cityReplyText, cityLabel, cityMode, serviceLeadId } = await import('../../api/_market.js');
const { default: cityLead } = await import('../../api/city-lead.js');
const SCALO = (await import('../../js/scalo-codes.js')).default;
const getPaid = async (q, ip) => { const r = mkRes(); await cityLead({ method: 'GET', headers: { 'x-forwarded-for': ip || `10.8.0.${++ipSeq}` }, query: q, url: '/api/city-lead' }, r); return r; };
const ANNA = { name: 'Anna Keller', email: 'anna@example.com' };

// ── 1 · the offer resolver: what may be sold, and why not ──────────────────
check(cityOffer('amsterdam', 'full-search').ok === true && cityOffer('amsterdam', 'full-search').eur === 500 && cityOffer('Madrid', 'attended-viewing').eur === 149,
  'cityOffer: a search desk with the till open sells its plans at CITY_PLANS prices (city key case-insensitive)');
check(['paris', 'berlin'].every((c) => cityOffer(c, 'full-search').error === 'checkout_closed'), 'cityOffer: every waitlist desk is checkout_closed — shown is not charged');
check(cityOffer('barcelona', 'full-search').ok === true && cityOffer('barcelona', 'full-search').eur === 500 && cityOffer('barcelona', 'attended-viewing').eur === 149,
  'cityOffer: Barcelona sells from 22/10 at the CITY_PLANS prices');
check(cityOffer('rome', 'full-search').error === 'unknown_city' && cityOffer('amsterdam', 'concierge').error === 'unknown_service', 'cityOffer: unknown city, unknown plan');
check(Object.keys(CITY_PLANS).join() === 'full-search,application-pack,attended-viewing' && CITY_PLANS['full-search'].eur === 500 && CITY_PLANS['application-pack'].eur === 199 && CITY_PLANS['attended-viewing'].eur === 149,
  'CITY_PLANS is the brief\'s grid: 500 / 199 / 149');
check(Object.values(CITY_MARKETS).every((c) => c.plans === CITY_PLANS) && Object.entries(CITY_MARKETS).every(([, c]) => c.checkout !== true || c.mode === 'search'),
  'every desk carries the grid; only a search desk may carry checkout:true');
check(/Refunded in full if we decline the search in the first call/.test(CITY_PLANS['full-search'].desc), 'the Full Search product description carries the refund rule the page promises');

// ── 2 · the checkout endpoint ──────────────────────────────────────────────
{
  const r = await post(checkout, { city: 'amsterdam', kind: 'full-search', ...ANNA, company: 'bot' });
  check(r.code === 200 && r.body.url === '/' && globalThis.__stripeCalls.length === 0, 'honeypot: 200, Stripe never called');
}
{
  const before = globalThis.__stripeCalls.length;
  const r = await post(checkout, { city: 'berlin', kind: 'full-search', ...ANNA });
  check(r.code === 400 && r.body.error === 'checkout_closed' && globalThis.__stripeCalls.length === before, 'berlin (waitlist): 400 checkout_closed, no Stripe session — a hand-made POST cannot buy a desk that is not open');
  const r2 = await post(checkout, { city: 'paris', kind: 'application-pack', ...ANNA });
  check(r2.body.error === 'checkout_closed' && globalThis.__stripeCalls.length === before, 'paris: the same refusal');
  const r4 = await post(checkout, { city: 'rome', kind: 'full-search', ...ANNA });
  const r5 = await post(checkout, { city: 'amsterdam', kind: 'virtual-viewing', ...ANNA });
  check(r4.code === 400 && r4.body.error === 'unknown_city' && r5.code === 400 && r5.body.error === 'unknown_service' && globalThis.__stripeCalls.length === before,
    'unknown city 400; a Rome service id under a city 400 (the city grid is closed)');
  const r6 = await post(checkout, { city: 'amsterdam', kind: 'full-search', name: 'Anna', email: 'nope' });
  check(r6.code === 400 && r6.body.error === 'missing_fields' && globalThis.__stripeCalls.length === before, 'a broken email: 400, nothing created');
}
{
  const r = await post(checkout, { city: 'amsterdam', kind: 'full-search', ...ANNA, notes: 'move-in 1 Feb', eur: 1, price: 1, amount: 1 });
  const call = globalThis.__stripeCalls.at(-1);
  check(r.code === 200 && r.body.ok && call.line_items[0].price_data.unit_amount === 50000, 'amsterdam Full Search: €500 from the server grid — a tampered price in the body is ignored');
  check(call.line_items[0].price_data.product_data.name === 'BOOM Amsterdam — Full Search' && /Refunded in full/.test(call.line_items[0].price_data.product_data.description),
    'the Stripe product is named for the desk and the plan, with the refund rule');
  check(call.metadata.service === 'SERVICE' && call.metadata.kind === 'full-search' && call.metadata.city === 'amsterdam' && call.metadata.market === 'amsterdam' && call.metadata.notes === 'move-in 1 Feb' && call.metadata.amount_eur === '500',
    'the metadata carries the city twice (city, market) for the webhook');
  // review 22/10: no #contact on the success URL — a fragment makes the
  // browser re-apply its own scroll at `load` (late in production: gtag.js
  // holds it) and undo the page's landing on the ticket
  check(call.success_url === 'https://www.boomrome.com/amsterdam?paid=full-search&start=0&session_id={CHECKOUT_SESSION_ID}' && call.cancel_url === 'https://www.boomrome.com/amsterdam#fares',
    'success lands back on the city page (?paid=<plan>&start=0, no fragment: the page lands on the ticket itself), cancel on its plates — never the Rome thank-you page', call.success_url);
  check(call.metadata.start_now === '0', 'no tick posted: start_now "0" — the work waits for the 14 days');
  await post(checkout, { city: 'amsterdam', kind: 'application-pack', ...ANNA, startNow: true });
  const ticked = globalThis.__stripeCalls.at(-1);
  check(ticked.metadata.start_now === '1' && /\?paid=application-pack&start=1&session_id=/.test(ticked.success_url), 'the tick travels: start_now "1" and &start=1 on the way back');
  await post(checkout, { city: 'amsterdam', kind: 'application-pack', ...ANNA, startNow: 'true' });
  check(globalThis.__stripeCalls.at(-1).metadata.start_now === '0', 'only a real boolean true is the payer\'s request: the string "true" is not');
  check(call.phone_number_collection && call.phone_number_collection.enabled === true, 'no phone given: Stripe collects one at checkout');
  const r2 = await post(checkout, { city: 'madrid', kind: 'attended-viewing', ...ANNA, phone: '+34 600 000 000' });
  const c2 = globalThis.__stripeCalls.at(-1);
  check(r2.code === 200 && c2.line_items[0].price_data.unit_amount === 14900 && c2.phone_number_collection === undefined && c2.metadata.phone === '+34 600 000 000' && c2.success_url.startsWith('https://www.boomrome.com/madrid?paid=attended-viewing'),
    'madrid Attended Viewing: €149, the phone given travels in the metadata, Stripe does not ask again');
  const r3 = await post(checkout, { city: 'barcelona', kind: 'full-search', ...ANNA });
  const c3 = globalThis.__stripeCalls.at(-1);
  check(r3.code === 200 && c3.line_items[0].price_data.unit_amount === 50000 && c3.metadata.city === 'barcelona' && c3.metadata.start_now === '0'
    && c3.success_url === 'https://www.boomrome.com/barcelona?paid=full-search&start=0&session_id={CHECKOUT_SESSION_ID}' && c3.cancel_url === 'https://www.boomrome.com/barcelona#fares',
    'barcelona (live from 22/10): Full Search €500 opens a Stripe session that comes back to /barcelona', JSON.stringify(c3 && { s: c3.success_url, m: c3.metadata }));
  check(/until you sign or tell us to stop/.test(c3.line_items[0].price_data.product_data.description || ''), 'the Full Search product says how long the search runs (the founder, 22/10): until you sign or tell us to stop');
}
// the Rome services are untouched
{
  const before = globalThis.__stripeCalls.length;
  const r = await post(checkout, { kind: 'contract-check-express', ...ANNA });
  check(r.code === 400 && r.body.error === 'missing_fields' && globalThis.__stripeCalls.length === before, 'a Rome service still requires the phone (the slot is coordinated on WhatsApp)');
  const r2 = await post(checkout, { kind: 'contract-check-express', ...ANNA, phone: '333' });
  const c = globalThis.__stripeCalls.at(-1);
  check(r2.code === 200 && c.line_items[0].price_data.unit_amount === 4900 && c.metadata.city === undefined && c.metadata.market === undefined && /thank-you\.html\?service=contract-check-express/.test(c.success_url) && c.phone_number_collection === undefined,
    'a Rome service: catalog price, no market, the thank-you page, as before');
}
{
  let last;
  for (let i = 0; i < 10; i++) last = await post(checkout, { city: 'amsterdam', kind: 'full-search', ...ANNA }, '10.7.9.9');
  check(last.code === 429, 'the rate limit per IP still holds on the city till');
}

// ── 3 · the webhook: a paid order is a tenant in the right market ──────────
{
  const meta = { service: 'SERVICE', kind: 'full-search', city: 'amsterdam', market: 'amsterdam', name: 'Anna Keller', email: 'anna@example.com', phone: '', notes: 'move-in 1 Feb', amount_eur: '500' };
  const e0 = emails.length;
  const r = await webhook(stream(event(meta, { id: 'cs_city_ams_1', customer_details: { email: 'anna@example.com', phone: '+31612345678' } })), mkRes());
  const key = [...store.keys()].find((k) => k.startsWith('leads/svc_'));
  const lead = key ? store.get(key) : null;
  check(r.code === 200 && !!lead, 'the paid order becomes a lead (leads/svc_<session>)');
  check(lead && lead.paid === true && lead.status === 'new' && lead.source === 'web' && lead.leadType === 'tenant' && lead.intent === 'city_order' && lead.amount_eur === 500,
    'paid:true, status new (the Brain sees it), a TENANT with intent city_order', JSON.stringify(lead));
  check(lead && lead.market === 'amsterdam' && lead.sourceRef === 'city-amsterdam' && isCityMarket(lead) && cityMode(lead) === 'search' && cityLabel(lead) === '🇳🇱 Amsterdam',
    'the lead carries the MARKET: api/_market.js recognises Amsterdam — the Commerciale stands down, the card names the city');
  const fileAms = SCALO.fileCode(serviceLeadId('cs_city_ams_1'));
  // the file number sits in the HEAD (review 22/10): the Telegram card quotes
  // the first 240 characters, and a long note used to push it out
  check(lead && /^AMSTERDAM — paid order · Full Search · €500 paid · file BM [A-HJ-NP-Z2-9]{5}\. Notes: move-in 1 Feb\.$/.test(lead.message) && lead.message.startsWith('AMSTERDAM — paid order · Full Search · €500 paid · file ' + fileAms + '. '),
    'the summary the operator reads: the city, "paid order", the plan, the amount and the file number — then the notes', lead && lead.message);
  check(lead && lead.city && lead.city.file === fileAms && /^BM [A-HJ-NP-Z2-9]{5}$/.test(fileAms) && lead.city.fileLeadId === null,
    'no file_ref: the paid lead\'s file number is fileCode of its own id (svc_…), and no fileLeadId', lead && JSON.stringify(lead.city));
  check(lead && lead.phone === '+31612345678', 'the phone Stripe collected lands on the lead when the sheet left it empty');
  const reply = cityReplyText({ ...lead, city: { serviceLabel: 'Full Search' } });
  check(/Payment received for Full Search in Amsterdam/.test(reply) && reply.endsWith(CITY_MARKETS.amsterdam.url), 'the pre-written WhatsApp reply acknowledges the payment and links /amsterdam');
  check(emails.length === e0 + 2, 'two emails: the operator and the client');
  const admin = emails[e0], client = emails[e0 + 1];
  check(admin && admin.to_email === 'valentino@boom-rome.com' && /AMSTERDAM — FULL SEARCH — €500 paid/.test(admin.heading) && admin.r4_label === 'Desk' && /Amsterdam/.test(admin.r4_value) && admin.r3_value === '+31612345678',
    'the operator\'s email names the desk and the plan, and carries the phone', admin && admin.heading);
  check(client && client.to_email === 'anna@example.com' && /Your Amsterdam — Full Search starts now/.test(client.heading) && client.portal_link === 'https://www.boomrome.com/amsterdam' && /Brief call|brief call/i.test(client.r1_label) && /Dossier in one working day/.test(client.r2_label),
    'the client\'s email: the desk\'s own next steps, the CTA back to the city page — never the Rome catalogue', client && JSON.stringify([client.heading, client.portal_link, client.r1_label]));
  const r2 = await webhook(stream(event(meta, { id: 'cs_city_ams_1' })), mkRes());
  check(admin && admin.closing.includes('Your file: ' + fileAms) && client && client.closing.includes('Your file: ' + fileAms) && client.closing.startsWith('Your file: ' + fileAms + '. '),
    'both city emails carry "Your file: BM XXXXX" — the client\'s as its first line', admin && JSON.stringify([admin.closing.slice(0, 80), client && client.closing.slice(0, 80)]));
  check(r2.body && r2.body.duplicate === true && emails.length === e0 + 2, 'a Stripe retry of the same session: duplicate, no second email');
}
// the 14-day withdrawal right, on the durable medium (Directive 2011/83/EU art. 8(7)).
// The period is counted from the Stripe EVENT (the payment, i.e. the conclusion),
// in Rome calendar days: the conclusion day does not count (Reg. 1182/71), and
// a period crossing the spring DST change is still 14 calendar days, never 14×24h.
{
  const base = { service: 'SERVICE', kind: 'full-search', city: 'madrid', market: 'madrid', name: 'Luis Gómez', email: 'luis@example.com', phone: '+34600000000', notes: '', amount_eur: '500' };
  // 23:30 UTC on 15 March 2026 = 00:30 on 16 March in Rome: the Rome day is the 16th
  const created = Date.UTC(2026, 2, 15, 23, 30, 0) / 1000;
  const e0 = emails.length;
  const ev0 = event({ ...base, start_now: '0' }, { id: 'cs_city_mad_wait' }); ev0.created = created;
  await webhook(stream(ev0), mkRes());
  const lead0 = svcLead('cs_city_mad_wait');
  const admin0 = emails[e0], client0 = emails[e0 + 1];
  check(lead0 && /^MADRID — paid order · Full Search · €500 paid · file BM [A-HJ-NP-Z2-9]{5}\. Start: NOT asked to start now\. Withdrawal period runs to the end of 30 March 2026; the work begins on 31 March 2026\./.test(lead0.message),
    'no tick: the start line comes FIRST in the lead, with the last day of the period and the day the work begins (Rome calendar, across the DST change)', lead0 && lead0.message);
  check(lead0 && lead0.city && lead0.city.startNow === false && lead0.city.workFrom === '2026-03-31' && lead0.city.withdrawalEndsOn === '2026-03-30' && lead0.city.workFromLabel === '31 March 2026',
    'no tick: the lead carries the choice and the dates as fields, not only as words', lead0 && JSON.stringify(lead0.city));
  const reply0 = lead0 ? cityReplyText(lead0) : '';
  check(/Payment received for Full Search in Madrid/.test(reply0) && /we start on 31 March 2026, the day after your 14-day withdrawal period ends/.test(reply0) && !/today|opening your file now/i.test(reply0),
    'no tick: the operator\'s ready reply repeats the start day — never "today"', reply0);
  check(admin0 && /did NOT ask to start now/.test(JSON.stringify(admin0)) && /30 March 2026/.test(JSON.stringify(admin0)) && /31 March 2026/.test(JSON.stringify(admin0)) && /invoice from Egidi Immobiliare/.test(JSON.stringify(admin0)),
    'the operator is told the work begins on 31 March and to issue the invoice');
  check(client0 && /is booked$/.test(client0.heading) && /Here's what happens from 31 March 2026, the day after your 14-day withdrawal period ends/.test(client0.intro)
    && /your 14-day withdrawal period runs to the end of 30 March 2026 and the work begins on 31 March 2026/.test(client0.closing)
    && /To withdraw within 14 days of payment, email hello@boom-rome\.com or use the model withdrawal form at https:\/\/www\.boomrome\.com\/withdrawal/.test(client0.closing)
    && /fully performed/.test(client0.closing) && /invoice from Egidi Immobiliare S\.r\.l\./.test(client0.closing),
    'the client: "booked", the steps begin on 31 March, how to withdraw (email or the model form), and the invoice', client0 && JSON.stringify([client0.heading, client0.intro, client0.closing]));
  check(/you can still withdraw within the 14 days, paying only for the work already done, and once the service is fully performed the right to withdraw ends/.test(reply0)
    && !/until the work is complete/.test(reply0),
    'no tick: the ready reply says the 14-day right and its end, never "until the work is complete" (the right ends at 14 days or on full performance, whichever first)', reply0);
  check(client0 && /model withdrawal form at https:\/\/www\.boomrome\.com\/withdrawal\?desk=Madrid&service=full-search \(its text is at the end of this email\)/.test(client0.closing)
    && /MODEL WITHDRAWAL FORM \(complete and return this form only if you wish to withdraw from the contract\)/.test(client0.closing)
    && /To Egidi Immobiliare S\.r\.l\. \(BOOM\), Via dei Coronari 181\/184, 00186 Roma, Italy, e-mail hello@boom-rome\.com/.test(client0.closing)
    && /Signature of consumer\(s\) \(only if this form is notified on paper\)/.test(client0.closing),
    'the confirmation carries the model withdrawal form itself, with our details (Dir. 2011/83/EU art. 6(1)(h), 8(7): the email is the durable medium), and the link names the desk and the service', client0 && client0.closing);
  // the desk's own holidays reach the order: paid on 28 September 2026 in
  // Madrid, +14 = Monday 12 October, the Fiesta Nacional → Tuesday 13
  const ev12 = event({ ...base, start_now: '0' }, { id: 'cs_city_mad_hol' }); ev12.created = Date.UTC(2026, 8, 28, 10, 0, 0) / 1000;
  await webhook(stream(ev12), mkRes());
  const lead12 = svcLead('cs_city_mad_hol');
  check(lead12 && lead12.city && lead12.city.withdrawalEndsOn === '2026-10-13' && lead12.city.workFrom === '2026-10-14',
    'a Madrid order: the desk country\'s holiday (12 October) moves the end of the period — the webhook passes the desk\'s country', lead12 && JSON.stringify(lead12.city));
  // and Barcelona reads its OWN calendar, not Madrid's: paid on 10 September
  // 2026, +14 = Thursday 24 September, La Mercè (a working day in Madrid)
  const evB = event({ ...base, city: 'barcelona', market: 'barcelona', name: 'Marta Puig', email: 'marta@example.com' }, { id: 'cs_city_bcn_hol' });
  evB.data.object.metadata.start_now = '0'; evB.created = Date.UTC(2026, 8, 10, 10, 0, 0) / 1000;
  const eB = emails.length;
  await webhook(stream(evB), mkRes());
  // the till promises documents in Catalan or Spanish and the fulls oficials:
  // the operator's email of a Barcelona order reminds him of both (the check
  // read meta.city.slug, which CITY_MARKETS never had — it never fired)
  const opB = emails.slice(eB).find((m) => m.to_email === 'valentino@boom-rome.com');
  check(opB && /Catalan or Spanish/.test(opB.intro || '') && /fulls oficials/.test(opB.intro || ''), 'a Barcelona order: the operator\'s email reminds him of the Catalan or Spanish documents and the fulls oficials', opB && String(opB.intro).slice(-260));
  const leadB = svcLead('cs_city_bcn_hol');
  check(leadB && leadB.market === 'barcelona' && leadB.city && leadB.city.withdrawalEndsOn === '2026-09-25' && leadB.city.workFrom === '2026-09-28' && /^BARCELONA — paid order · Full Search · €500 paid/.test(leadB.message),
    'a Barcelona order: the webhook passes the desk\'s holiday key (es-bcn) — La Mercè moves the end of the period, which the Madrid calendar would not', leadB && JSON.stringify([leadB.message, leadB.city]));
  // the number a payer types on the desk's sheet is stored in E.164 with the
  // desk's country, as /api/city-lead does: the client's WhatsApp reply
  // (E.164) must find THIS lead, not open a new Rome one
  const evP = event({ ...base, city: 'barcelona', market: 'barcelona', name: 'Pau Vidal', email: 'pau@example.com', phone: '612 345 678' }, { id: 'cs_city_bcn_phone' });
  await webhook(stream(evP), mkRes());
  const leadP = svcLead('cs_city_bcn_phone');
  check(leadP && leadP.phone === '+34612345678', 'a Barcelona payer\'s "612 345 678" is stored as +34612345678', leadP && leadP.phone);
  const evI = event({ ...base, city: 'barcelona', market: 'barcelona', name: 'Gianni R', email: 'gianni@example.com', phone: '333 1234567' }, { id: 'cs_city_bcn_itphone' });
  await webhook(stream(evI), mkRes());
  const leadI = svcLead('cs_city_bcn_itphone');
  check(leadI && leadI.phone === '333 1234567', 'an Italian mobile typed on /barcelona is not given +34: it stays as typed, for the Rome rule', leadI && leadI.phone);
  // the Rome Pacchetto: the same form, in Italian
  const eIt = emails.length;
  await webhook(stream(event({ service: 'SERVICE', kind: 'concordato-pack', name: 'Giulia Rossi', email: 'giulia@example.com', phone: '+393331234567', notes: '', amount_eur: '349', start_now: '0' }, { id: 'cs_pack_it', amount_total: 34900 })), mkRes());
  const clientIt = emails.slice(eIt).find((x) => x.to_email === 'giulia@example.com');
  check(clientIt && /MODULO DI RECESSO TIPO \(compilare e restituire il presente modulo solo se si desidera recedere dal contratto\)/.test(clientIt.closing)
    && /Destinatario: Egidi Immobiliare S\.r\.l\. \(BOOM\), Via dei Coronari 181\/184, 00186 Roma/.test(clientIt.closing)
    && /https:\/\/www\.boomrome\.com\/withdrawal\?desk=Rome&service=concordato-pack/.test(clientIt.closing)
    && /partiamo allo scadere dei 14 giorni/.test(clientIt.closing),
    'the Rome Pacchetto confirmation carries the modulo di recesso tipo too (Codice del consumo art. 49(1)(h))', clientIt && clientIt.closing);
  const e1 = emails.length;
  await webhook(stream(event({ ...base, start_now: '1' }, { id: 'cs_city_mad_now' })), mkRes());
  const lead1 = svcLead('cs_city_mad_now');
  const client1 = emails[e1 + 1];
  check(lead1 && /^MADRID — paid order · Full Search · €500 paid · file BM [A-HJ-NP-Z2-9]{5}\. Start: asked to start now \(inside the 14-day withdrawal period\)\./.test(lead1.message) && lead1.city.startNow === true && lead1.city.workFrom === null,
    'the tick: the lead says the payer asked to start now', lead1 && lead1.message);
  check(client1 && /starts now$/.test(client1.heading) && /Here's exactly what happens next/.test(client1.intro) && /You asked us to start straight away/.test(client1.closing) && /refund the price minus the work already done/.test(client1.closing)
    && /model withdrawal form at https:\/\/www\.boomrome\.com\/withdrawal/.test(client1.closing),
    'the tick: "starts now", the steps begin in the first desk hour, the partial-refund rule and the model form are still said');
  // no email promises speed the desk hours cannot keep: no reply or
  // application "within the hour", no work "today" (applications go out as
  // listings appear, the dossier one working day after the papers)
  const all = JSON.stringify(emails.slice(e0));
  check(!/within the hour|starts today|start today|in 24 hours/i.test(all), 'no email promises a reply or an application within the hour, work "today", or a dossier "in 24 hours"');
}
// The client's confirmation is a durable-medium email: its delivery is
// recorded, and a failure alerts the operator (a Stripe retry would answer
// "duplicate" and never resend it).
{
  const meta = { service: 'SERVICE', kind: 'application-pack', city: 'amsterdam', start_now: '1', name: 'Bo Ek', email: 'bo@example.com' };
  await webhook(stream(event(meta, { id: 'cs_city_mail_ok', amount_total: 19900 })), mkRes());
  const ok1 = store.get('leads/svc_cscitymailok');
  check(ok1 && typeof ok1.clientEmailSentAt === 'string' && !ok1.clientEmailError && !store.has('agentNotifications/svc-mail-cscitymailok'), 'a delivered confirmation is recorded on the lead, no alert');
  failClientMail = true;
  const rFail = mkRes();
  await webhook(stream(event(meta, { id: 'cs_city_mail_ko', amount_total: 19900 })), rFail);
  failClientMail = false;
  const ko1 = store.get('leads/svc_cscitymailko');
  const alert = store.get('agentNotifications/svc-mail-cscitymailko');
  check(rFail.body && rFail.body.clientEmail === 'failed' && ko1 && /EmailJS 500/.test(ko1.clientEmailError || '') && alert && alert.priority === 'high' && /NON è partita/.test(alert.summary) && /recesso/.test(alert.summary),
    'a failed confirmation: the lead says so, and the operator gets an alert to send it by hand (with the withdrawal text)', JSON.stringify(alert));
  // a first run killed before it recorded the client email (a hung send, a
  // 60s kill): the Stripe retry answers "duplicate" but tells the operator
  const old = new Date(Date.now() - 5 * 60000).toISOString();
  store.set('leads/svc_cscityhang', { type: 'service', market: 'amsterdam', createdAt: old });
  store.set('leads/svc_cscityfresh', { type: 'service', market: 'amsterdam', createdAt: new Date().toISOString() });
  const e1 = emails.length;
  const rHang = mkRes(), rFresh = mkRes();
  await webhook(stream(event(meta, { id: 'cs_city_hang', amount_total: 19900 })), rHang);
  await webhook(stream(event(meta, { id: 'cs_city_fresh', amount_total: 19900 })), rFresh);
  const aHang = store.get('agentNotifications/svc-mail-cscityhang');
  check(rHang.body && rHang.body.duplicate === true && emails.length === e1 && aHang && aHang.priority === 'high' && /nessuna traccia/.test(aHang.summary) && /recesso/.test(aHang.summary),
    'a retry on a paid order whose client email was never recorded: still duplicate (no resend), but the operator is alerted', JSON.stringify(aHang));
  check(rFresh.body && rFresh.body.duplicate === true && !store.has('agentNotifications/svc-mail-cscityfresh'), 'a retry overlapping a first run still in flight (under 90s) raises no false alert');
  check(/signal: AbortSignal\.timeout\(\d+\)/.test(read('api/stripe-webhook.js').split('async function sendEmailJS')[1].split('\n}')[0]),
    'EmailJS has a time limit: a hung send becomes a recorded failure, not a 60s kill');
}
// The withdrawal window, alone: Rome calendar days from the conclusion day,
// across midnight, both DST changes, the year end and a leap year — and a
// last day on a Saturday, a Sunday or a public holiday moves to the next
// working day (Reg. 1182/71 art. 3(4)), the work beginning the working day after.
{
  const w = (iso, c = null) => withdrawalWindow(Date.parse(iso) / 1000, c);
  const cases = [
    ['2026-10-19T22:30:00Z', '2026-11-03', '2026-11-04'],   // 00:30 on 20 Oct in Rome
    ['2026-10-20T21:59:00Z', '2026-11-03', '2026-11-04'],   // 23:59 on 20 Oct in Rome
    ['2026-10-20T22:01:00Z', '2026-11-04', '2026-11-05'],   // 00:01 on 21 Oct in Rome
    ['2026-10-20T10:00:00Z', '2026-11-03', '2026-11-04'],   // autumn DST (25 Oct) inside the period
    ['2026-10-17T10:00:00Z', '2026-11-02', '2026-11-03'],   // +14 = Sat 31 Oct, Sun 1 Nov (Ognissanti) → Mon 2 Nov
    ['2026-10-23T10:00:00Z', '2026-11-06', '2026-11-09'],   // +14 = Fri 6 Nov: the period ends Friday, work begins Monday
    ['2026-12-11T10:00:00Z', '2026-12-28', '2026-12-29'],   // +14 = Fri 25 Dec, then 26 (Sat), 27 (Sun) → Mon 28
    ['2027-03-15T12:00:00Z', '2027-03-30', '2027-03-31'],   // spring DST inside; +14 = Easter Monday 29 Mar → Tue 30
    ['2027-12-25T12:00:00Z', '2028-01-10', '2028-01-11'],   // the year end; +14 = Sat 8 Jan → Mon 10
    ['2028-02-20T12:00:00Z', '2028-03-06', '2028-03-07']    // a leap February; +14 = Sun 5 Mar → Mon 6
  ];
  check(cases.every(([at, last, start]) => w(at).lastDay === last && w(at).startDay === start),
    'withdrawalWindow: conclusion day + 14 Rome calendar days, a weekend or holiday last day moves to the next working day, work from the working day after (DST, midnight, year end, leap year, Easter Monday)',
    JSON.stringify(cases.map(([at]) => [at, w(at).lastDay, w(at).startDay])));
  // the desk's country adds its own holidays on top of Italy's
  const nl1 = w('2027-04-22T10:00:00Z', 'nl'), it1 = w('2027-04-22T10:00:00Z');
  check(nl1.lastDay === '2027-05-07' && nl1.startDay === '2027-05-10' && it1.lastDay === '2027-05-06',
    'withdrawalWindow (nl): +14 = Thu 6 May 2027, Hemelvaartsdag → Fri 7, work from Mon 10; the Italian calendar alone keeps 6 May',
    JSON.stringify([nl1, it1]));
  const nl2 = w('2027-05-03T10:00:00Z', 'nl');
  check(nl2.lastDay === '2027-05-18' && nl2.startDay === '2027-05-19' && w('2027-05-03T10:00:00Z').lastDay === '2027-05-17',
    'withdrawalWindow (nl): +14 = Pinkstermaandag 17 May 2027 → Tue 18', JSON.stringify(nl2));
  check(w('2026-09-28T10:00:00Z', 'es').lastDay === '2026-10-13' && w('2026-09-28T10:00:00Z').lastDay === '2026-10-12',
    'withdrawalWindow (es): +14 = Mon 12 Oct, Fiesta Nacional in Madrid → Tue 13; the Italian calendar alone keeps 12 Oct',
    JSON.stringify([w('2026-09-28T10:00:00Z', 'es'), w('2026-09-28T10:00:00Z')]));
  // Barcelona: Catalonia's DOGC calendar plus the city's two local days
  // (Pasqua Granada, La Mercè) — never Madrid's. Each case is a weekday the
  // Madrid calendar does not know, or one it knows and Barcelona does not.
  const bcn = [
    ['2026-09-10T10:00:00Z', '2026-09-25', '2026-09-28', 'La Mercè (Thu 24 Sep 2026) → Fri 25, work from Mon 28 (the 25th is a working day in 2026)'],
    ['2028-09-11T10:00:00Z', '2028-09-26', '2028-09-27', 'La Mercè on a Sunday (24 Sep 2028): the city keeps it on Monday the 25th → Tue 26'],
    ['2026-08-28T10:00:00Z', '2026-09-14', '2026-09-15', 'the Diada (Fri 11 Sep 2026) → Mon 14'],
    ['2026-06-10T10:00:00Z', '2026-06-25', '2026-06-26', 'Sant Joan (Wed 24 Jun 2026) → Thu 25'],
    ['2026-05-11T10:00:00Z', '2026-05-26', '2026-05-27', 'Pasqua Granada (Mon 25 May 2026) → Tue 26'],
    ['2027-05-03T10:00:00Z', '2027-05-18', '2027-05-19', 'Pasqua Granada (Mon 17 May 2027) → Tue 18'],
    ['2027-03-11T10:00:00Z', '2027-03-25', '2027-03-30', 'Thu 25 Mar 2027 is a working day in Catalonia (no Dijous Sant), then Good Friday and Easter Monday'],
  ];
  check(bcn.every(([at, last, start]) => w(at, 'es-bcn').lastDay === last && w(at, 'es-bcn').startDay === start),
    'withdrawalWindow (es-bcn): Sant Joan, the Diada, La Mercè, Pasqua Granada — and no Jueves Santo', JSON.stringify(bcn.map(([at]) => [at, w(at, 'es-bcn').lastDay, w(at, 'es-bcn').startDay])));
  check(w('2026-09-10T10:00:00Z', 'es').lastDay === '2026-09-24' && w('2027-03-11T10:00:00Z', 'es').lastDay === '2027-03-30',
    'the Madrid calendar is a different one: it keeps La Mercè a working day and has Jueves Santo — the reason Barcelona has its own key');
  // the national days Catalonia keeps, on a weekday: Fiesta Nacional (Mon 12
  // Oct 2026) and Constitución + Immaculada (Mon 6 and Wed 8 Dec 2027)
  check(w('2026-09-28T10:00:00Z', 'es-bcn').lastDay === '2026-10-13' && w('2027-11-22T10:00:00Z', 'es-bcn').lastDay === '2027-12-07' && w('2027-11-22T10:00:00Z', 'es-bcn').startDay === '2027-12-09',
    'withdrawalWindow (es-bcn): Fiesta Nacional (12 Oct) → 13 Oct; Constitución (Mon 6 Dec 2027) → Tue 7, and the Immaculada (Wed 8) moves the start to Thu 9',
    JSON.stringify([w('2026-09-28T10:00:00Z', 'es-bcn'), w('2027-11-22T10:00:00Z', 'es-bcn')]));
  check(Object.entries(CITY_MARKETS).filter(([, d]) => d.checkout === true).length >= 3 && Object.entries(CITY_MARKETS).filter(([, d]) => d.checkout === true).every(([, d]) => HOLIDAY_KEYS.includes(d.holidays || d.country)),
    'every desk that takes money names a calendar the webhook knows (an unknown key would fall back to Italy alone, in silence); a desk opening its till needs its calendar first',
    JSON.stringify(Object.entries(CITY_MARKETS).map(([k, d]) => [k, d.holidays || d.country])));
  check(CITY_MARKETS.barcelona.holidays === 'es-bcn' && CITY_MARKETS.barcelona.country === 'es' && CITY_MARKETS.madrid.holidays === undefined,
    'CITY_MARKETS: Barcelona reads the es-bcn calendar; its country stays es (the +34 phone reading)');
  // 4 Oct 2026 is a Sunday anyway: only 2027, a Monday, proves the San Francesco holiday
  check(w('2027-09-20T10:00:00Z').lastDay === '2027-10-05' && w('2027-09-20T10:00:00Z').startDay === '2027-10-06',
    'withdrawalWindow (it): +14 = Mon 4 Oct 2027 (San Francesco, a national holiday again from 2026) → Tue 5 Oct',
    JSON.stringify(w('2027-09-20T10:00:00Z')));
  check(w('2026-10-19T22:30:00Z').lastLabel === '3 November 2026' && w('2026-10-19T22:30:00Z').startLabel === '4 November 2026', 'withdrawalWindow: the labels read as dates, in English');
}
{
  // a Rome service event is what it was
  const e0 = emails.length;
  const r = await webhook(stream(event({ service: 'SERVICE', kind: 'virtual-viewing', name: 'Ada B', email: 'ada@x.it', phone: '333' }, { id: 'cs_rome_1', amount_total: 8900 })), mkRes());
  const lead = store.get('leads/svc_csrome1');
  check(r.code === 200 && lead && lead.market === undefined && lead.intent === 'service' && !isCityMarket(lead) && emails.length === e0 + 2 && /VIRTUAL VIEWING/.test(emails[e0].heading) && emails[e0 + 1].portal_link === 'https://www.boomrome.com/apartments.html',
    'a Rome service: no market, intent service, the Rome emails — unchanged');
  check(!/Your file:|· file BM/.test(JSON.stringify([emails.slice(e0), lead && lead.message])) && !(lead && lead.city), 'a Rome service gets no file number (the file is a city-desk idea)');
}
{
  // a city the registry does not know cannot be smuggled into a market
  const r = await webhook(stream(event({ service: 'SERVICE', kind: 'full-search', city: 'gotham', name: 'X', email: 'x@y.z' }, { id: 'cs_gotham_1' })), mkRes());
  const lead = store.get('leads/svc_csgotham1');
  check(r.code === 200 && lead && lead.market === undefined && !isCityMarket(lead) && lead.intent === 'service', 'an unknown city in the metadata files a plain service lead, never an invented market');
}

// ── 3b · one file number per person (v1.4): city-lead → till → webhook → GET ?paid= ──
{
  // serviceLeadId is the formula the webhook used inline until v1.4, in one copy
  const before14 = (sid) => 'svc_' + String(sid).replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  const sids = ['cs_city_ams_1', 'cs_live_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'cs_test_x', 'cs_test_a-b.c_d/e', ''];
  check(sids.every((sid) => serviceLeadId(sid) === before14(sid)), 'serviceLeadId(session.id) is exactly the svc_ formula the webhook used before v1.4', JSON.stringify(sids.map((x) => [serviceLeadId(x), before14(x)])));
  const wh = read('api/stripe-webhook.js');
  const svcSrc = wh.slice(wh.indexOf('async function handleService'), wh.indexOf('async function handleReserve'));
  check(/const svcId = serviceLeadId\(session\.id\);/.test(svcSrc) && !/session\.id\.replace\(/.test(svcSrc) && !/'svc_' \+/.test(svcSrc),
    'the SERVICE branch takes its lead id from serviceLeadId — no second copy of the formula in the webhook');

  // the till: a pattern-valid fileRef travels as metadata, on city offers only
  const tillWith = async (body) => { const n = globalThis.__stripeCalls.length; const r = await post(checkout, body); return { r, call: globalThis.__stripeCalls.length > n ? globalThis.__stripeCalls.at(-1) : null }; };
  const good = await tillWith({ city: 'amsterdam', kind: 'full-search', ...ANNA, fileRef: 'city_abcd1234xyz' });
  check(good.r.code === 200 && good.call && good.call.metadata.file_ref === 'city_abcd1234xyz', 'a city order with a valid fileRef: it travels as metadata.file_ref');
  const bad = ['city_ABCD1234', 'city_short', 'leads/city_abcd1234', 'city_abcd1234/../x', 'svc_abcd12345678', 'city_' + 'a'.repeat(49), 12345678, { x: 1 }];
  const badRuns = [];
  for (const fileRef of bad) badRuns.push(await tillWith({ city: 'amsterdam', kind: 'application-pack', ...ANNA, fileRef }));
  check(badRuns.every(({ r, call }) => r.code === 200 && call && !('file_ref' in call.metadata)),
    'anything else (upper case, too short, a path, another prefix, too long, not a string) is ignored in silence: the payment still opens, without file_ref',
    JSON.stringify(badRuns.map(({ r, call }) => [r.code, call && call.metadata.file_ref])));
  const rome = await tillWith({ kind: 'contract-check-express', ...ANNA, phone: '333', fileRef: 'city_abcd1234xyz' });
  check(rome.r.code === 200 && rome.call && !('file_ref' in rome.call.metadata), 'a Rome service ignores fileRef');
  const tillSrc = read('api/service-checkout.js');
  check(/const fileRef = offer && typeof body\.fileRef === 'string' && FILE_REF_RE\.test\(body\.fileRef\)/.test(tillSrc) && /const FILE_REF_RE = \/\^city_\[a-z0-9_\]\{8,48\}\$\/;/.test(tillSrc),
    'the till reads fileRef only on a city offer, against /^city_[a-z0-9_]{8,48}$/');

  // the round trip: the visitor opens a file, pays, and the page asks
  const ipRT = '10.9.9.1';
  const open = await post(cityLead, { city: 'amsterdam', name: 'Anna Keller', email: 'anna@example.com', service: 'full-search', requestId: 'rtrip0001aa' }, '10.9.0.1');
  const openId = 'city_rtrip0001aa';
  const openFile = SCALO.fileCode(openId);
  check(open.code === 200 && open.body.id === openId && open.body.file === openFile && /^BM [A-HJ-NP-Z2-9]{5}$/.test(openFile)
    && store.get('leads/' + openId) && store.get('leads/' + openId).city.file === openFile,
    'city-lead opens the file: { ok, id, file } with file = fileCode(id), written on lead.city.file', JSON.stringify(open.body));
  const sid = 'cs_test_RoundTrip0001abcd';
  const pend0 = await getPaid({ paid: sid, city: 'amsterdam' }, ipRT);
  check(pend0.code === 200 && pend0.body.ok === true && pend0.body.pending === true && pend0.headers['cache-control'] === 'no-store',
    'GET ?paid= before the webhook: pending, Cache-Control no-store', JSON.stringify([pend0.code, pend0.body, pend0.headers]));
  const till = await tillWith({ city: 'amsterdam', kind: 'full-search', ...ANNA, fileRef: open.body.id });
  check(till.call && till.call.metadata.file_ref === openId, 'the page posts fileRef = city_<requestId>: the till carries it to Stripe');
  const e0 = emails.length;
  const evRT = event({ ...till.call.metadata }, { id: sid, customer_details: { email: 'anna@example.com', phone: '+31612345678' } }); evRT.created = Date.UTC(2026, 9, 20, 10, 0, 0) / 1000;
  await webhook(stream(evRT), mkRes());
  const paidLead = svcLead(sid);
  check(paidLead && paidLead.city && paidLead.city.file === openFile && paidLead.city.fileLeadId === openId && paidLead.message.includes(' · €500 paid · file ' + openFile + '. '),
    'the webhook reuses the number of the file the visitor opened (same city): city.file, city.fileLeadId, the summary', paidLead && JSON.stringify([paidLead.message, paidLead.city]));
  const adminRT = emails[e0], clientRT = emails[e0 + 1];
  check(adminRT && adminRT.closing.includes('Your file: ' + openFile) && clientRT && clientRT.closing.startsWith('Your file: ' + openFile + '. '),
    'both emails carry the SAME number the page showed when the file opened');
  const paid = await getPaid({ paid: sid, city: 'amsterdam' }, ipRT);
  check(paid.code === 200 && paid.body.paid === true && paid.body.plan === 'full-search' && paid.body.file === openFile && paid.body.startNow === false && paid.body.workFromLabel === '4 November 2026'
    && Object.keys(paid.body).sort().join() === 'file,ok,paid,plan,startNow,workFromLabel' && paid.headers['cache-control'] === 'no-store',
    'GET ?paid= after the webhook: paid, the plan, the SAME file, startNow and the webhook\'s start date — those six keys and nothing else', JSON.stringify(paid.body));
  const raw = JSON.stringify(paid.body);
  check(!/anna|keller|example\.com|\+31|500|eur/i.test(raw), 'the paid answer carries no name, email, phone or amount', raw);
  const other = await getPaid({ paid: sid, city: 'madrid' }, ipRT);
  check(other.code === 200 && other.body.pending === true && !('file' in other.body) && Object.keys(other.body).sort().join() === 'ok,pending',
    'the same session asked for ANOTHER city: pending — nothing leaks across desks', JSON.stringify(other.body));
  const bads = await Promise.all([
    getPaid({ paid: sid, city: 'paris' }), getPaid({ paid: sid, city: 'berlin' }), getPaid({ paid: sid, city: 'gotham' }), getPaid({ paid: sid, city: 'constructor' }),
    getPaid({ paid: 'cs_live_short', city: 'amsterdam' }), getPaid({ paid: 'pi_123456789abc', city: 'amsterdam' }), getPaid({ paid: 'cs_test_abc/../x1234', city: 'amsterdam' }), getPaid({ city: 'amsterdam' }),
  ]);
  check(bads.every((r) => r.code === 400 && r.body.ok === false && r.headers['cache-control'] === 'no-store'),
    'a waitlist desk, an unknown city, a malformed or missing session id: 400 (still no-store)', JSON.stringify(bads.map((r) => r.code)));
  // a lead under that id that is NOT a paid city order answers pending
  store.set('leads/' + serviceLeadId('cs_test_NotPaid00001'), { market: 'amsterdam', name: 'X', city: { paid: false, service: 'full-search', file: 'BM AAAAA' } });
  store.set('leads/' + serviceLeadId('cs_test_RomeOrder0001'), { intent: 'service', paid: true, name: 'Ada' });
  const np = await getPaid({ paid: 'cs_test_NotPaid00001', city: 'amsterdam' });
  const ro = await getPaid({ paid: 'cs_test_RomeOrder0001', city: 'amsterdam' });
  check(np.body.pending === true && ro.body.pending === true, 'a lead that is not a paid city order (paid:false, a Rome service) answers pending');
  let lastRL;
  for (let i = 0; i < 31; i++) lastRL = await getPaid({ paid: 'cs_test_RateLimit00001', city: 'amsterdam' }, '10.9.9.77');
  check(lastRL.code === 429 && lastRL.headers['cache-control'] === 'no-store', 'GET ?paid= has its own per-IP limit: 30 per 10 minutes');
  const put = mkRes(); await cityLead({ method: 'PUT', headers: {}, body: {} }, put);
  const opt = mkRes(); await cityLead({ method: 'OPTIONS', headers: {} }, opt);
  check(put.code === 405 && opt.code === 204 && /GET/.test(opt.headers['access-control-allow-methods'] || ''), 'OPTIONS / GET / POST; anything else 405');

  // a reference from ANOTHER city never lends its number; neither does one naming nothing
  const mad = await post(cityLead, { city: 'madrid', name: 'Luis Gómez', email: 'luis@example.com', service: 'full-search', requestId: 'rtripmad01' }, '10.9.0.2');
  check(mad.code === 200 && mad.body.file === SCALO.fileCode('city_rtripmad01'), 'a Madrid file opened');
  await webhook(stream(event({ service: 'SERVICE', kind: 'full-search', city: 'amsterdam', market: 'amsterdam', name: 'Luis Gómez', email: 'luis@example.com', start_now: '1', file_ref: 'city_rtripmad01' }, { id: 'cs_test_CrossCity0001' })), mkRes());
  const cross = svcLead('cs_test_CrossCity0001');
  check(cross && cross.city.file === SCALO.fileCode(serviceLeadId('cs_test_CrossCity0001')) && cross.city.file !== mad.body.file && cross.city.fileLeadId === null,
    'an Amsterdam order whose file_ref names a MADRID lead: the number is NOT reused (own fileCode, no fileLeadId)', cross && JSON.stringify(cross.city));
  await webhook(stream(event({ service: 'SERVICE', kind: 'attended-viewing', city: 'amsterdam', market: 'amsterdam', name: 'Z', email: 'z@example.com', start_now: '1', file_ref: 'city_doesnotexist01' }, { id: 'cs_test_Ghost00001' })), mkRes());
  const ghost = svcLead('cs_test_Ghost00001');
  check(ghost && ghost.city.file === SCALO.fileCode(serviceLeadId('cs_test_Ghost00001')) && ghost.city.fileLeadId === null, 'a file_ref that names no lead: the order\'s own number');
  check(getReads.get('leads/city_doesnotexist01') === 1 && !('fileRefUnverified' in ghost.city), 'a 404 is an answer: read once, not retried, nothing marked unverified');

  // a transient Firestore error on the file_ref read (review 22/10): one
  // retry, and the visitor keeps ONE number; two failures keep the order's
  // own number and say so on the lead — the paid order never fails over it
  const blip = await post(cityLead, { city: 'amsterdam', name: 'Ada Lind', email: 'ada@example.com', service: 'full-search', requestId: 'blip0001aaa' }, '10.9.0.3');
  failGets.set('leads/city_blip0001aaa', 1);
  const rb = mkRes();
  await webhook(stream(event({ service: 'SERVICE', kind: 'full-search', city: 'amsterdam', market: 'amsterdam', name: 'Ada Lind', email: 'ada@example.com', start_now: '1', file_ref: 'city_blip0001aaa' }, { id: 'cs_test_Blip0000001' })), rb);
  const blipLead = svcLead('cs_test_Blip0000001');
  check(rb.code === 200 && blipLead && blipLead.city.file === blip.body.file && blipLead.city.fileLeadId === 'city_blip0001aaa' && !('fileRefUnverified' in blipLead.city) && getReads.get('leads/city_blip0001aaa') === 2,
    'one 503 on the file_ref read: retried once, the visitor keeps the number the OPEN ticket showed', blipLead && JSON.stringify([blipLead.city, getReads.get('leads/city_blip0001aaa')]));
  const down = await post(cityLead, { city: 'amsterdam', name: 'Bo Lind', email: 'bo@example.com', service: 'full-search', requestId: 'down0001aaa' }, '10.9.0.4');
  failGets.set('leads/city_down0001aaa', 2);
  const rd = mkRes();
  await webhook(stream(event({ service: 'SERVICE', kind: 'full-search', city: 'amsterdam', market: 'amsterdam', name: 'Bo Lind', email: 'bo@example.com', start_now: '1', file_ref: 'city_down0001aaa' }, { id: 'cs_test_Down0000001' })), rd);
  const downLead = svcLead('cs_test_Down0000001');
  check(rd.code === 200 && downLead && downLead.paid === true && downLead.city.file === SCALO.fileCode(serviceLeadId('cs_test_Down0000001')) && downLead.city.file !== down.body.file
    && downLead.city.fileLeadId === null && downLead.city.fileRefUnverified === 'city_down0001aaa' && getReads.get('leads/city_down0001aaa') === 2,
    'two 503s: the paid order still lands (200, paid), with its own number and fileRefUnverified naming the file it could not check', downLead && JSON.stringify(downLead.city));
  // the number in the HEAD: a long note never pushes it out of the card's 240 characters
  const longNote = 'We arrive with two cats and need a ground floor near Zuid, ideally with a balcony and a lift, please.';
  await webhook(stream(event({ service: 'SERVICE', kind: 'full-search', city: 'amsterdam', market: 'amsterdam', name: 'Cy Lind', email: 'cy@example.com', start_now: '0', notes: longNote, listing: 'https://www.pararius.com/apartment-for-rent/amsterdam/abcdef12/some-long-street-name' }, { id: 'cs_test_LongNote0001' })), mkRes());
  const longLead = svcLead('cs_test_LongNote0001');
  check(longLead && longLead.message.length > 240 && longLead.message.slice(0, 240).includes('file ' + longLead.city.file) && longLead.message.includes(longNote),
    'a long note and a listing URL: the file number is still inside the first 240 characters the Telegram card quotes', longLead && `${longLead.message.length}: ${longLead.message.slice(0, 120)}`);
}

// ── 4 · the joints, on the source ──────────────────────────────────────────
{
  const src = read('api/service-checkout.js');
  const refuse = src.indexOf("if (!offer.ok) return res.status(400).json({ ok: false, error: offer.error });");
  const create = src.indexOf('stripe.checkout.sessions.create(');
  check(refuse > -1 && create > -1 && refuse < create, 'the offer is refused BEFORE a Stripe session can be created');
  check(/import \{ cityOffer \} from '\.\/_market\.js'/.test(src) && !/CITY_PLANS\s*=/.test(src) && /unit_amount: svc\.eur \* 100/.test(src) && !/body\.(eur|price|amount)/.test(src),
    'the endpoint carries no price of its own: the amount is the registry\'s, never the body\'s');
  const wh = read('api/stripe-webhook.js');
  check(/const cityDesk = CITY_MARKETS\[cityKey\] \|\| null;/.test(wh) && /market: cityKey,\s*sourceRef: `city-\$\{cityKey\}`,/.test(wh) && /intent: cityDesk \? 'city_order' : 'service'/.test(wh),
    'the webhook sets market, sourceRef and city_order only when the metadata names a desk in the registry');
  const notif = read('api/telegram/notify-pending.js');
  check(/isCityMarket\(l\)\s*\?\s*cityReplyText\(l\)/.test(notif), 'the Telegram card uses the city reply (which reads paid:true) for city leads');
  const com = read('api/employees/commerciale.js');
  check(com.indexOf('if (isCityMarket(lead)) continue;') > -1 && com.indexOf('if (isCityMarket(lead)) continue;') < com.indexOf('proposeFirstReply(lead'), 'the Commerciale stands down on a paid city order too (the guard reads the market, not the intent)');
  const js = read('assets/boom-city.js');
  check(/var sell = C\.CHECKOUT === true;/.test(js) && /var till = sell \? \$\('till'\) : null, tf = sell \? \$\('tillForm'\) : null/.test(js) && /function handleReturn\(\) \{\s*if \(!sell\) return;/.test(js),
    'the page JS mounts the till and reads ?paid= ONLY when the build set CHECKOUT true');
  check(/city: C\.SLUG, kind: id/.test(js) && !/\beur:\s*p\.eur\b/.test(js.slice(js.indexOf('function pay()'), js.indexOf('go.addEventListener'))),
    'the sheet posts the city and the plan id — never a price');
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
