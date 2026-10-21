// tests/cities/checkout.mjs — the till of the city desks, on the REAL handlers.
//
// BOOM_CITIES_BRIEF.md v1.1 (14/10): a search desk with `checkout: true` sells
// its three plans through the Rome Services 2.0 rail — api/service-checkout.js
// (POST { city, kind }) → Stripe Checkout → api/stripe-webhook.js SERVICE
// branch → a paid lead in the shared `leads` schema WITH the market, so the
// Commerciale stands down and the Telegram card speaks of the city.
//
// What breaks if this goes red:
//   - a waitlist desk (Barcelona, Paris, Berlin) or a search desk whose till
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
    const doc = store.get(clean);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: clean, fields: {} });
  }
  throw new Error('fetch non stubbata: ' + url);
};
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(t) { this.body = t; return this; }, end() { return this; } });
let ipSeq = 0;
const post = async (handler, body, ip) => { const r = mkRes(); await handler({ method: 'POST', headers: { 'x-forwarded-for': ip || `10.7.0.${++ipSeq}` }, body, socket: {} }, r); return r; };
const stream = (obj) => ({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(obj)); } });
const event = (metadata, over = {}) => ({ type: 'checkout.session.completed', data: { object: { id: over.id || 'cs_city_1', amount_total: over.amount_total ?? 50000, currency: 'eur', customer_email: 'anna@example.com', customer_details: over.customer_details || null, payment_intent: 'pi_1', metadata } } });

const { default: checkout } = await import('../../api/service-checkout.js');
const { default: webhook, withdrawalWindow } = await import('../../api/stripe-webhook.js');
const { CITY_MARKETS, CITY_PLANS, cityOffer, isCityMarket, cityReplyText, cityLabel, cityMode } = await import('../../api/_market.js');
const ANNA = { name: 'Anna Keller', email: 'anna@example.com' };

// ── 1 · the offer resolver: what may be sold, and why not ──────────────────
check(cityOffer('amsterdam', 'full-search').ok === true && cityOffer('amsterdam', 'full-search').eur === 500 && cityOffer('Madrid', 'attended-viewing').eur === 149,
  'cityOffer: a search desk with the till open sells its plans at CITY_PLANS prices (city key case-insensitive)');
check(['barcelona', 'paris', 'berlin'].every((c) => cityOffer(c, 'full-search').error === 'checkout_closed'), 'cityOffer: every waitlist desk is checkout_closed — shown is not charged');
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
  const r3 = await post(checkout, { city: 'barcelona', kind: 'attended-viewing', ...ANNA });
  check(r2.body.error === 'checkout_closed' && r3.body.error === 'checkout_closed' && globalThis.__stripeCalls.length === before, 'paris and barcelona: the same refusal');
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
  check(call.success_url === 'https://www.boomrome.com/amsterdam?paid=full-search&start=0&session_id={CHECKOUT_SESSION_ID}#contact' && call.cancel_url === 'https://www.boomrome.com/amsterdam#services',
    'success lands back on the city page (?paid=<plan>&start=0), cancel on its plates — never the Rome thank-you page');
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
  check(lead && /^AMSTERDAM — paid order · Full Search · €500 paid\. Notes: move-in 1 Feb\.$/.test(lead.message), 'the summary the operator reads: the city, "paid order", the plan, the amount', lead && lead.message);
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
  const lead0 = store.get('leads/svc_cs_city_mad_wait') || store.get([...store.keys()].filter((k) => k.startsWith('leads/svc_')).at(-1));
  const admin0 = emails[e0], client0 = emails[e0 + 1];
  check(lead0 && /^MADRID — paid order · Full Search · €500 paid\. Start: NOT asked to start now\. Withdrawal period runs to the end of 30 March 2026; the work begins on 31 March 2026\./.test(lead0.message),
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
  const lead12 = store.get('leads/svc_cs_city_mad_hol') || store.get([...store.keys()].filter((k) => k.startsWith('leads/svc_')).at(-1));
  check(lead12 && lead12.city && lead12.city.withdrawalEndsOn === '2026-10-13' && lead12.city.workFrom === '2026-10-14',
    'a Madrid order: the desk country\'s holiday (12 October) moves the end of the period — the webhook passes the desk\'s country', lead12 && JSON.stringify(lead12.city));
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
  const lead1 = store.get('leads/svc_cs_city_mad_now') || store.get([...store.keys()].filter((k) => k.startsWith('leads/svc_')).at(-1));
  const client1 = emails[e1 + 1];
  check(lead1 && /^MADRID — paid order · Full Search · €500 paid\. Start: asked to start now \(inside the 14-day withdrawal period\)\./.test(lead1.message) && lead1.city.startNow === true && lead1.city.workFrom === null,
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
}
{
  // a city the registry does not know cannot be smuggled into a market
  const r = await webhook(stream(event({ service: 'SERVICE', kind: 'full-search', city: 'gotham', name: 'X', email: 'x@y.z' }, { id: 'cs_gotham_1' })), mkRes());
  const lead = store.get('leads/svc_csgotham1');
  check(r.code === 200 && lead && lead.market === undefined && !isCityMarket(lead) && lead.intent === 'service', 'an unknown city in the metadata files a plain service lead, never an invented market');
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
  check(/C\.CHECKOUT === true \? (?:document\.getElementById|\$)\('ov'\) : null/.test(js) && /if \(C\.CHECKOUT !== true \|\| !form\) return;/.test(js),
    'the page JS mounts the till and reads ?paid= ONLY when the build set CHECKOUT true');
  check(/city: C\.SLUG, kind: id/.test(js) && !/\beur:\s*p\.eur\b/.test(js.slice(js.indexOf('function pay()'), js.indexOf('go.addEventListener'))),
    'the sheet posts the city and the plan id — never a price');
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
