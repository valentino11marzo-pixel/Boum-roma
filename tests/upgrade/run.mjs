// tests/upgrade/run.mjs — the upgrade credit of a city desk (06/11/2026).
//
// A paid Application Pack on a desk that charges at the till becomes Full
// Search with what was paid credited, once, within 30 days (api/_upgrade.js).
// The REAL handlers: GET /api/city-lead?upgrade=, POST /api/service-checkout
// with { upgrade }, the SERVICE branch of the Stripe webhook, the bot's
// /upgrade, and the page /upgrade read as a file.
//
// What breaks if this goes red:
//   - a price taken from the browser, or a credit given without a valid token;
//   - a credit used twice, or after its 30 days;
//   - a desk charged at signing (Paris, Berlin) "crediting" a pack nobody paid;
//   - the client's name, email or phone readable by whoever holds the link;
//   - the upgrade getting a new file number instead of the pack's;
//   - the page pre-ticking "Start now" (the payer's own request, Directive 2011/83/EU art. 7(3)).
//
// 'stripe' is mocked by the money suite's loader; Firestore, EmailJS and
// Telegram by a fetch stub with an in-memory store. No network.

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
process.env.HOMIE_SECRET = 'test-homie-secret';
process.env.TELEGRAM_BOT_TOKEN = 'tg-test';
process.env.TELEGRAM_CHAT_ID = '123';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const check = (cond, t, why = '') => { if (cond) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); } else { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t + (why ? ` — ${why}` : '')); } };
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

console.log('\n\x1b[1m▸ upgrade\x1b[0m  the upgrade credit: Application Pack → Full Search, what was paid credited once, the server decides');

// ── Firestore + EmailJS + Telegram in memory ────────────────────────────────
const store = new Map();
const emails = [];
const tg = [];
const VER = new Map();
let verSeq = 0;
const verOf = (k) => VER.get(k) || '2026-11-06T09:00:00.000000Z';
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
const toFsV = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsV) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFsV(x); return { mapValue: { fields: f } }; }
  return { nullValue: null };
};
const docJson = (k) => { const fields = {}; for (const [f, v] of Object.entries(store.get(k))) fields[f] = toFsV(v); return { name: 'projects/p/databases/(default)/documents/' + k, fields, updateTime: verOf(k) }; };
const bump = (k) => VER.set(k, `2026-11-06T10:00:00.${String(++verSeq).padStart(6, '0')}Z`);
const nested = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'admin1' }] });
  if (url.includes('api.emailjs.com')) { emails.push(JSON.parse(opts.body).template_params); return new Response('OK', { status: 200 }); }
  if (url.includes('api.telegram.org')) { tg.push(JSON.parse(opts.body || '{}')); return okJson({ ok: true, result: { message_id: 1 } }); }
  if (url.includes('firestore.googleapis.com')) {
    const p = url.split('/documents')[1] || '';
    const clean = p.replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (p.startsWith(':runQuery')) {
      const sq = JSON.parse(opts.body).structuredQuery || {};
      const coll = ((sq.from || [])[0] || {}).collectionId;
      const ff = (sq.where || {}).fieldFilter;
      const out = [];
      for (const k of store.keys()) {
        if (!k.startsWith(coll + '/') || k.split('/').length !== 2) continue;
        if (ff && nested(store.get(k), ff.field.fieldPath) !== fromFsV(ff.value)) continue;
        out.push({ document: docJson(k) });
      }
      return okJson(out.length ? out : [{}]);
    }
    if (p.startsWith(':commit')) {
      const writes = JSON.parse(opts.body).writes || [];
      const pathOf = (n) => String(n).split('/documents/')[1];
      for (const w of writes) {
        const k = pathOf((w.update && w.update.name) || w.delete), pc = w.currentDocument || {};
        if ((pc.exists === false && store.has(k)) || (pc.exists === true && !store.has(k)) || (pc.updateTime && pc.updateTime !== verOf(k))) {
          return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 409 });
        }
      }
      for (const w of writes) {
        if (!w.update) continue;
        const k = pathOf(w.update.name), flat = { ...(store.get(k) || {}) };
        for (const [f, v] of Object.entries(w.update.fields || {})) flat[f] = fromFsV(v);
        store.set(k, flat); bump(k);
      }
      return okJson({ writeResults: writes.map(() => ({})) });
    }
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = clean + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      const flat = {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) flat[k] = fromFsV(v);
      store.set(key, flat); bump(key);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      if (qs.get('currentDocument.exists') === 'false' && store.has(clean)) return new Response('exists', { status: 409 });
      const flat = store.get(clean) || {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) flat[k] = fromFsV(v);
      store.set(clean, flat); bump(clean); return okJson({});
    }
    if (!store.has(clean)) return new Response('not found', { status: 404 });
    return okJson(docJson(clean));
  }
  throw new Error('fetch non stubbata: ' + url);
};

const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(t) { this.body = t; return this; }, end() { return this; } });
let ipSeq = 0;
const post = async (handler, body) => { const r = mkRes(); await handler({ method: 'POST', headers: { 'x-forwarded-for': `10.9.0.${++ipSeq}` }, body, socket: {} }, r); return r; };
const get = async (handler, query) => { const r = mkRes(); await handler({ method: 'GET', headers: { 'x-forwarded-for': `10.8.0.${++ipSeq}` }, query, socket: {} }, r); return r; };
const stream = (obj) => ({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(obj)); } });
const event = (metadata, over = {}) => ({ type: 'checkout.session.completed', data: { object: { id: over.id || 'cs_live_up_1', amount_total: over.amount_total ?? 30100, currency: over.currency || 'eur', customer_email: metadata.email || 'daniel@example.com', customer_details: over.customer_details || null, payment_intent: 'pi_1', metadata } } });

const { upgradeOffer, publicUpgrade, isUpgradeLeadId, UPGRADE_DAYS, UPGRADE_PATHS } = await import('../../api/_upgrade.js');
const TOK = await import('../../api/payments/_token.js');
const { default: checkout } = await import('../../api/service-checkout.js');
const { default: cityLead } = await import('../../api/city-lead.js');
const { default: webhook } = await import('../../api/stripe-webhook.js');
const { serviceLeadId } = await import('../../api/_market.js');
const BOT = await import('../../api/telegram/_upgrade.js');

const DAY = 86400000;
const NOW = Date.now();
const AP_ID = 'svc_csliveAPorderDaniel0000001';
const apLead = (over = {}) => ({
  type: 'service', service: 'SERVICE', kind: 'application-pack', status: 'new', paid: true, source: 'web', intent: 'city_order',
  name: 'Daniel Poliakov', email: 'daniel@example.com', phone: '+34692304765',
  amount_paid: 19900, amount_eur: 199, currency: 'eur', paid_at: new Date(NOW - DAY).toISOString(), createdAt: new Date(NOW - DAY).toISOString(),
  market: 'madrid', sourceRef: 'city-madrid', leadType: 'tenant',
  city: { key: 'madrid', label: 'Madrid', mode: 'search', service: 'application-pack', paid: true, startNow: true, file: 'BM BEAEV', at: new Date(NOW - DAY).toISOString() },
  ...over,
});
const seed = (id, lead) => { store.set('leads/' + id, JSON.parse(JSON.stringify(lead))); bump('leads/' + id); };

// ── 1. The rule, pure ────────────────────────────────────────────────────────
{
  check(UPGRADE_DAYS === 30 && UPGRADE_PATHS['application-pack'] === 'full-search' && Object.keys(UPGRADE_PATHS).length === 1, 'the only path is Application Pack → Full Search, for 30 days');
  check(isUpgradeLeadId(AP_ID) && !isUpgradeLeadId('book_abc12345') && !isUpgradeLeadId('city_abc12345') && !isUpgradeLeadId('svc_../x'), 'only a paid-order id (svc_…) can carry a credit');
  const o = upgradeOffer(apLead(), AP_ID, NOW);
  check(o.ok && o.state === 'open' && o.list === 500 && o.credit === 199 && o.pay === 301 && o.currency === 'eur', 'a Madrid pack paid yesterday: €500 − €199 = €301 today', JSON.stringify(o));
  check(o.file === 'BM BEAEV' && o.to === 'full-search' && o.toLabel === 'Full Search' && o.fromLabel === 'Application Pack' && o.country === 'es', 'it names the file, the plans and the desk country (LAU art. 20 note on the page)');
  check(Date.parse(o.expiresAt) - Date.parse(o.paidAt) === UPGRADE_DAYS * DAY, 'the deadline is 30 days from the payment');
  const pub = publicUpgrade(o);
  check(!('email' in pub) && !('name' in pub) && !('phone' in pub) && !JSON.stringify(pub).includes('daniel@example.com'), 'the public view carries no name, email or phone');
  check(upgradeOffer(apLead({ credit: { usedBy: 'svc_other' } }), AP_ID, NOW).state === 'used', 'a credit already used is used');
  check(upgradeOffer(apLead({ paid_at: new Date(NOW - 31 * DAY).toISOString() }), AP_ID, NOW).state === 'expired', 'after 30 days it has expired');
  check(upgradeOffer(apLead({ kind: 'full-search', city: { ...apLead().city, service: 'full-search' } }), AP_ID, NOW).state === 'not_upgradable', 'a Full Search order has nothing to upgrade to');
  // the card flip (06/11): Paris takes the card at the order, so a Paris pack paid by card is credited like Madrid's;
  // a desk the registry charges at signing (Paris patched, try/finally) still never credits: nothing was paid there
  check(upgradeOffer(apLead({ market: 'paris', city: { ...apLead().city, key: 'paris' } }), AP_ID, NOW).state === 'open', 'a Paris pack paid by card (since 06/11) is credited like any desk that charges at the checkout');
  {
    const { CITY_MARKETS } = await import('../../api/_market.js');
    const keep = CITY_MARKETS.paris;
    let st;
    try { CITY_MARKETS.paris = { ...keep, chargeAt: 'signing' }; st = upgradeOffer(apLead({ market: 'paris', city: { ...apLead().city, key: 'paris' } }), AP_ID, NOW).state; } finally { CITY_MARKETS.paris = keep; }
    check(st === 'not_upgradable' && CITY_MARKETS.paris === keep, 'a desk charged at signing (Paris, the registry patched) never credits: nothing was paid at the order');
  }
  check(upgradeOffer(apLead({ paid: false }), AP_ID, NOW).state === 'not_found' && upgradeOffer(apLead({ intent: 'city_search' }), AP_ID, NOW).state === 'not_found', 'an unpaid lead or a free-door lead is not an order');
  check(upgradeOffer(apLead({ currency: 'gbp' }), AP_ID, NOW).state === 'not_upgradable', 'a credit in another currency than the desk\'s is refused');
  check(upgradeOffer(apLead({ amount_eur: 500 }), AP_ID, NOW).state === 'not_upgradable', 'a credit that would cover the whole price is refused');
  const lon = upgradeOffer(apLead({ market: 'london', currency: 'gbp', city: { ...apLead().city, key: 'london' } }), AP_ID, NOW);
  check(lon.ok && lon.pay === 301 && lon.currency === 'gbp', 'London credits in pounds: £500 − £199 = £301');
}

// ── 2. The personal link ─────────────────────────────────────────────────────
{
  const t = TOK.upgradeToken(AP_ID);
  check(/^[0-9a-f]{24}$/.test(t) && TOK.verifyUpgradeToken(AP_ID, t) && !TOK.verifyUpgradeToken(AP_ID, t.slice(0, 23) + (t[23] === 'a' ? 'b' : 'a')), 'the token is derived (96 bits) and checked in constant time');
  check(t !== TOK.orderToken(AP_ID) && t !== TOK.payToken('pay', AP_ID) && !TOK.verifyUpgradeToken('svc_csliveAnotherOrder000001', t), 'it is not an order or payment token, and never transfers to another order');
  check(TOK.collectionFor('upg') === null && TOK.collectionFor('upgrade') === null, '/api/payments/link never opens a till with it (not a KINDS entry)');
  check(TOK.upgradeLink(AP_ID) === `https://www.boomrome.com/upgrade?l=${AP_ID}&t=${t}`, 'the link is /upgrade?l=<order>&t=<token> on www');
}

// ── 3. GET /api/city-lead?upgrade= ───────────────────────────────────────────
seed(AP_ID, apLead());
{
  const t = TOK.upgradeToken(AP_ID);
  const r = await get(cityLead, { upgrade: AP_ID, t });
  check(r.code === 200 && r.body.ok && r.body.pay === 301 && r.body.city === 'madrid' && r.body.file === 'BM BEAEV', 'a valid link reads the open credit', JSON.stringify(r.body));
  check(!JSON.stringify(r.body).includes('daniel@example.com') && !JSON.stringify(r.body).includes('Poliakov') && !JSON.stringify(r.body).includes('+34692304765'), 'no name, email or phone in the answer');
  check(r.headers['cache-control'] === 'no-store', 'never cached');
  const bad = await get(cityLead, { upgrade: AP_ID, t: 'x'.repeat(24) });
  const ghost = await get(cityLead, { upgrade: 'svc_csliveNoSuchOrder00000001', t: TOK.upgradeToken('svc_csliveNoSuchOrder00000001') });
  check(bad.code === 404 && ghost.code === 404 && JSON.stringify(bad.body) === JSON.stringify(ghost.body), 'a wrong token and an unknown order answer the same 404');
}

// ── 4. POST /api/service-checkout with { upgrade } ───────────────────────────
{
  const t = TOK.upgradeToken(AP_ID);
  const before = (globalThis.__stripeCalls || []).length;
  const r = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: AP_ID, t }, startNow: true, eur: 1, amount: 1 });
  const s = (globalThis.__stripeCalls || [])[before];
  check(r.code === 200 && r.body.ok && s, 'a valid upgrade opens a Stripe session', JSON.stringify(r.body));
  const li = s && s.line_items[0].price_data;
  check(li && li.unit_amount === 30100 && li.currency === 'eur', 'it charges €301: the price comes from the server, never from the body', li && String(li.unit_amount));
  check(li && /€199 Application Pack credited/.test(li.product_data.name) && /file BM BEAEV/.test(li.product_data.description), 'the Stripe page says what is credited and which file');
  check(s && s.customer_email === 'daniel@example.com' && s.metadata.name === 'Daniel Poliakov' && s.metadata.phone === '+34692304765', 'the payer is the person of the paid order (the page asks nothing)');
  check(s && s.metadata.credit_from === AP_ID && s.metadata.credit_amount === '199' && s.metadata.credit_plan === 'application-pack' && s.metadata.amount_eur === '301' && s.metadata.start_now === '1' && s.metadata.city === 'madrid', 'the metadata carry the credit, the amount and the Start-now tick');
  check(s && s.success_url.startsWith(`https://www.boomrome.com/upgrade?l=${AP_ID}&t=${t}&start=1&session_id=`) && s.cancel_url === `https://www.boomrome.com/upgrade?l=${AP_ID}&t=${t}`, 'success and cancel land back on /upgrade');
  const n = (globalThis.__stripeCalls || []).length;
  const forged = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: AP_ID, t: 'f'.repeat(24) }, name: 'X', email: 'x@y.z' });
  check(forged.code === 404 && (globalThis.__stripeCalls || []).length === n, 'a forged token: 404, no session');
  const wrongPlan = await post(checkout, { city: 'madrid', kind: 'application-pack', upgrade: { lead: AP_ID, t } });
  const wrongDesk = await post(checkout, { city: 'amsterdam', kind: 'full-search', upgrade: { lead: AP_ID, t } });
  check(wrongPlan.code === 400 && wrongPlan.body.error === 'upgrade_mismatch' && wrongDesk.code === 400 && (globalThis.__stripeCalls || []).length === n, 'another plan or another desk: 400 upgrade_mismatch, no session');
  const paris = await post(checkout, { city: 'paris', kind: 'full-search', upgrade: { lead: AP_ID, t }, name: 'X', email: 'x@y.z', requestId: 'r'.repeat(16), termsV: 'x' });
  check(paris.body && paris.body.ok !== true || paris.code !== 200 || !(paris.body && paris.body.url), 'a desk charged at signing never takes the upgrade path to Stripe');
  const plain = await post(checkout, { city: 'madrid', kind: 'full-search', name: 'Anna', email: 'anna@example.com' });
  const ps = (globalThis.__stripeCalls || [])[(globalThis.__stripeCalls || []).length - 1];
  check(plain.code === 200 && ps.line_items[0].price_data.unit_amount === 50000 && !ps.metadata.credit_from && ps.success_url.startsWith('https://www.boomrome.com/madrid?paid=full-search'), 'without an upgrade nothing changes: €500 and the desk page on return');
}

// ── 5. The webhook: the order, the file, the credit marked once ──────────────
const meta = (over = {}) => ({ service: 'SERVICE', kind: 'full-search', city: 'madrid', market: 'madrid', name: 'Daniel Poliakov', email: 'daniel@example.com', phone: '+34692304765', listing: '', notes: '', amount_eur: '301', currency: 'eur', start_now: '1', credit_from: AP_ID, credit_amount: '199', credit_plan: 'application-pack', ...over });
{
  emails.length = 0;
  const r = await webhook(stream(event(meta(), { id: 'cs_live_up_1' })), mkRes());
  const fs1 = store.get('leads/' + serviceLeadId('cs_live_up_1'));
  check(fs1 && fs1.paid && fs1.city && fs1.city.service === 'full-search' && fs1.amount_eur === 301, 'the Full Search order is written, €301 paid');
  check(fs1 && fs1.city.file === 'BM BEAEV' && fs1.city.fileLeadId === AP_ID, 'it keeps the pack\'s file number: one person, one file');
  check(fs1 && fs1.city.credit && fs1.city.credit.from === AP_ID && fs1.city.credit.amount === 199 && fs1.city.credit.verified === true, 'the credit is written on the order');
  check(fs1 && /€301 paid \(€199 Application Pack credited\)/.test(fs1.message), 'the summary says €301 paid and €199 credited', fs1 && fs1.message);
  const ap = store.get('leads/' + AP_ID);
  check(ap.credit && ap.credit.usedBy === serviceLeadId('cs_live_up_1') && ap.credit.amount === 199, 'the pack\'s credit is marked used by this order');
  const op = emails.find((e) => e.to_email === 'valentino@boom-rome.com'), cl = emails.find((e) => e.to_email === 'daniel@example.com');
  check(op && /Upgrade: €199 credited from the Application Pack \(file BM BEAEV\); invoice what was paid, €301\./.test(op.intro), 'the operator email names the upgrade and the amount to invoice', op && op.intro);
  check(cl && /Your Application Pack \(€199\) is credited toward this order\./.test(cl.closing) && /To withdraw within 14 days/.test(cl.closing), 'the client email says what is credited, and keeps the withdrawal text');
  check(r && (await get(cityLead, { upgrade: AP_ID, t: TOK.upgradeToken(AP_ID) })).code === 410, 'the link now answers 410: used');
  // a Stripe retry of the same session: no second order, the mark stays
  const n = emails.length;
  await webhook(stream(event(meta(), { id: 'cs_live_up_1' })), mkRes());
  check(emails.length === n && store.get('leads/' + AP_ID).credit.usedBy === serviceLeadId('cs_live_up_1'), 'a retry sends nothing and keeps the mark');
  // a second session paid with the same credit: never re-marked, an urgent alert
  await webhook(stream(event(meta(), { id: 'cs_live_up_2' })), mkRes());
  const alert = [...store.entries()].find(([k]) => k.startsWith('agentNotifications/upgrade-double-'));
  check(store.get('leads/' + AP_ID).credit.usedBy === serviceLeadId('cs_live_up_1') && alert && alert[1].priority === 'high', 'a credit used twice is never re-marked: urgent alert to settle on Stripe');
  // a credit_from that points at another desk's order is not verified, not marked, and does not lend its file
  const AMS_ID = 'svc_csliveAmsterdamOrder000001';
  seed(AMS_ID, apLead({ market: 'amsterdam', city: { ...apLead().city, key: 'amsterdam', file: 'BM AMSAA' } }));
  emails.length = 0;
  await webhook(stream(event(meta({ credit_from: AMS_ID }), { id: 'cs_live_up_3' })), mkRes());
  const fs3 = store.get('leads/' + serviceLeadId('cs_live_up_3'));
  const op3 = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  check(fs3 && fs3.city.credit.verified === false && fs3.city.file !== 'BM AMSAA' && !(store.get('leads/' + AMS_ID).credit), 'another desk\'s order is not trusted: no file, no mark');
  check(op3 && /could NOT be verified/.test(op3.intro), 'and the operator is told to check the credit by hand');
  // a pack paid on the till: the operator email carries the client's personal upgrade link
  emails.length = 0;
  await webhook(stream(event({ ...meta(), kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_9', amount_total: 19900 })), mkRes());
  const op9 = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  const id9 = serviceLeadId('cs_live_pack_9');
  check(op9 && op9.closing.includes(`https://www.boomrome.com/upgrade?l=${id9}&t=${TOK.upgradeToken(id9)}`) && /valid 30 days/.test(op9.closing), 'a new pack order email carries the upgrade link for the operator', op9 && op9.closing);
}

// ── 6. The bot: /upgrade BM XXXXX ────────────────────────────────────────────
{
  check(JSON.stringify(BOT.parseUpgradeRef('bm beaev')) === '{"file":"BM BEAEV"}' && JSON.stringify(BOT.parseUpgradeRef('BMBEAEV')) === '{"file":"BM BEAEV"}' && BOT.parseUpgradeRef(AP_ID).id === AP_ID && BOT.parseUpgradeRef('hello') === null, 'the bot reads a file number in any spelling, or an order id');
  const FRESH = 'svc_csliveFreshPackOrder000001';
  const lead = apLead({ city: { ...apLead().city, file: 'BM FRESH' } });
  const txt = BOT.upgradeReply(lead, FRESH, NOW, 'https://www.boomrome.com');
  check(/<b>€301<\/b>/.test(txt) && txt.includes(TOK.upgradeLink(FRESH).replace(/&/g, '&amp;')) && /Messaggio pronto/.test(txt) && /credited, so it's €301/.test(txt), 'an open credit: the amount, the personal link and a ready message');
  check(!/daniel@example\.com/.test(txt), 'the bot does not print the client\'s email');
  check(!/\btoday\b/i.test(txt) && /without waiting for the 14-day withdrawal period/.test(txt), 'the ready message promises no "today" (the desk works Mon–Fri) and says what the tick does');
  check(/già stato usato/.test(BOT.upgradeReply(apLead({ credit: { usedBy: 'svc_x' } }), FRESH, NOW)) && !/upgrade\?l=/.test(BOT.upgradeReply(apLead({ credit: { usedBy: 'svc_x' } }), FRESH, NOW)), 'a used credit: no link');
  check(/scaduto/.test(BOT.upgradeReply(apLead({ paid_at: new Date(NOW - 40 * DAY).toISOString() }), FRESH, NOW)), 'an expired credit: no link, the date');
  const fsOrder = apLead({ kind: 'full-search', amount_eur: 301, city: { ...apLead().city, service: 'full-search', credit: { from: AP_ID, plan: 'application-pack', amount: 199, verified: true } } });
  const fsTxt = BOT.upgradeReply(fsOrder, 'svc_csliveTheUpgradeOrder00001', NOW, 'https://www.boomrome.com');
  check(/già l'upgrade: €199 accreditati dall'ordine/.test(fsTxt) && fsTxt.includes(AP_ID) && !/upgrade\?l=/.test(fsTxt), 'the Full Search paid with the credit (same file) says it is the upgrade, no link', fsTxt);
  check(/personal Full Search link/.test(txt), 'the ready message says the link is personal');
  seed(FRESH, lead);
  seed('city_freshdoorlead0001', { intent: 'city_search', market: 'madrid', city: { file: 'BM FRESH' } });
  tg.length = 0;
  await BOT.handleUpgradeCommand(123, 'BM FRESH');
  check(tg.length === 1 && tg[0].text.includes(TOK.upgradeLink(FRESH).replace(/&/g, '&amp;')), 'the command finds the PAID order by its file (not the free-door lead with the same number)');
  tg.length = 0;
  await BOT.handleUpgradeCommand(123, 'nonsense');
  check(tg.length === 1 && /Uso: /.test(tg[0].text), 'a wrong argument gets the usage line');
}

// ── 7. The page /upgrade ─────────────────────────────────────────────────────
{
  const html = read('upgrade.html');
  const madrid = JSON.parse(read('cities/madrid.json'));
  check(/<meta name="robots" content="noindex, nofollow">/.test(html) && /<meta name="referrer" content="no-referrer">/.test(html), 'noindex, and the token never leaves in a Referer');
  check(html.includes(madrid.checkoutCopy.startNow), 'the Start-now sentence is the desks\' own, word for word');
  check(/<input type="checkbox" id="startNow">/.test(html) && !/id="startNow"[^>]*checked/.test(html) && !/\$\('startNow'\)\.checked\s*=\s*true/.test(html), 'Start now is never pre-ticked, not even from the URL');
  check(/upgrade: \{ lead: lead, t: tok \}/.test(html) && !/unit_amount|amount:\s*data\.pay/.test(html), 'the page posts the link, never an amount');
  check(/14 days from payment/.test(html) && /withdrawal\?desk=/.test(html) && /hello@boom-rome\.com/.test(html), 'the withdrawal line with the online form, the email and the model form');
  check(/Optional, chosen in writing/.test(html) && /o\.country !== 'es'/.test(html), 'Spanish desks show "Optional, chosen in writing" (LAU art. 20)');
  check(!/googletagmanager|gtag\(|boom-track/.test(html), 'no tracking on a page that carries a personal token');
  check(/<noscript><style>#loading\{display:none\}<\/style><\/noscript>/.test(html) && /<noscript><section class="state"><p class="big">This page needs JavaScript\.<\/p>[\s\S]*hello@boom-rome\.com/.test(html), 'without JavaScript the page says so and gives the email, never an endless "Checking"');
  check(!/(confirm|start|send|brief)[^.<]{0,40}\btoday\b/i.test(html) && (html.match(/first open hour/g) || []).length >= 2, 'the page promises no work "today": the desk\'s first open hour, as on the desks');
  check(/\/api\/city-lead\?paid=/.test(html) && /cs_\(live\|test\)_/.test(html), 'back from Stripe the payment is confirmed by the server, never by the URL');
}

// ── 8. Joints on the source ──────────────────────────────────────────────────
{
  const sc = read('api/service-checkout.js'), wh = read('api/stripe-webhook.js'), bot = read('api/telegram/webhook.js');
  check(/verifyUpgradeToken\(lid, tok\)/.test(sc) && sc.indexOf('verifyUpgradeToken(lid, tok)') < sc.indexOf('stripe.checkout.sessions.create'), 'the token is checked before any Stripe call');
  check(/unit_amount: Math\.round\(charge \* 100\)/.test(sc) && /const charge = upgrade \? upgrade\.pay : svc\.eur;/.test(sc), 'the amount is the server\'s: plan price or what the credit leaves');
  check(/await markUpgradeCredit\(credit, svcId, docId, currency, paidAmount\);\n    return res\.status\(200\)\.json\(\{ received: true, duplicate: true/.test(wh), 'a retry still marks a credit the first run left unmarked');
  check(/precondition: \{ updateTime: v\.updateTime \}/.test(wh), 'the mark is written under the version just read');
  check(/text === '\/upgrade' \|\| text\.startsWith\('\/upgrade '\)/.test(bot) && /\/upgrade BM XXXXX/.test(bot), 'the bot routes /upgrade and lists it in /help');
}

console.log(`\n  ${ko ? '\x1b[31m' : '\x1b[32m'}Result: ${ok} passed, ${ko} failed\x1b[0m`);
process.exit(ko ? 1 : 0);
