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
//   - the page pre-ticking "Start now" (the payer's own request, Directive 2011/83/EU art. 7(3));
//   - a policy since 12/11/2026: a pack whose money went back (refunded in
//     full or in part, or disputed) still opening Full Search at the credited
//     price — a withdrawal STATEMENT alone does not close it; a Stripe refund
//     that leaves no trace on the order; the client's own order email without
//     the personal link; the pages, the Terms and llms.txt saying another
//     number of days than the server's;
//   - the other door (a pack holder pays Full Search in full): a credit
//     marked or promised on an e-mail match alone; a second delivery applying
//     today's state instead of what the order recorded; a refund promised
//     twice; a stamp that goes backwards; a failed mark answered 200;
//   - Berlin (Terms §12.5): a pack or a viewing charged on top of a Full
//     Search with nobody told.
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
// fault injection: one GET of a document answers 503 (failGetOnce), or N of them (failGets {path, times}); a
// callback right after a document is written; N failing queries; N failing commits on a document (503, not a
// conflict: failCommits {path, times}); a callback right BEFORE a commit touches a document (a concurrent writer).
// `queries` records every runQuery (field, value, limit).
const hooks = { failGetOnce: null, afterWrite: null, failGets: null, failQueries: 0, failCommits: null, beforeCommit: null, queries: [] };

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
      hooks.queries.push({ coll, field: ff ? ff.field.fieldPath : null, value: ff ? fromFsV(ff.value) : null, limit: sq.limit });
      if (hooks.failQueries > 0) { hooks.failQueries--; return new Response('unavailable', { status: 503 }); }
      const out = [];
      for (const k of store.keys()) {
        if (!k.startsWith(coll + '/') || k.split('/').length !== 2) continue;
        if (ff && nested(store.get(k), ff.field.fieldPath) !== fromFsV(ff.value)) continue;
        // like Firestore: never more rows than the query's limit
        if (Number(sq.limit) > 0 && out.length >= Number(sq.limit)) break;
        out.push({ document: docJson(k) });
      }
      return okJson(out.length ? out : [{}]);
    }
    if (p.startsWith(':commit')) {
      const writes = JSON.parse(opts.body).writes || [];
      const pathOf = (n) => String(n).split('/documents/')[1];
      const keys = writes.map((w) => pathOf((w.update && w.update.name) || w.delete));
      if (hooks.beforeCommit) for (const k of keys) { if (hooks.beforeCommit) hooks.beforeCommit(k); }
      if (hooks.failCommits && hooks.failCommits.times > 0 && keys.includes(hooks.failCommits.path)) { hooks.failCommits.times--; return new Response('unavailable', { status: 503 }); }
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
      if (hooks.afterWrite) hooks.afterWrite(key);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      if (qs.get('currentDocument.exists') === 'false' && store.has(clean)) return new Response('exists', { status: 409 });
      const flat = store.get(clean) || {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) flat[k] = fromFsV(v);
      store.set(clean, flat); bump(clean); if (hooks.afterWrite) hooks.afterWrite(clean); return okJson({});
    }
    if (hooks.failGetOnce && hooks.failGetOnce === clean) { hooks.failGetOnce = null; return new Response('unavailable', { status: 503 }); }
    if (hooks.failGets && hooks.failGets.times > 0 && hooks.failGets.path === clean) { hooks.failGets.times--; return new Response('unavailable', { status: 503 }); }
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
// over.created = the time the payment completed (Stripe's event.created, in seconds)
const event = (metadata, over = {}) => ({ type: 'checkout.session.completed', ...(over.created ? { created: over.created } : {}), data: { object: { id: over.id || 'cs_live_up_1', amount_total: over.amount_total ?? 30100, currency: over.currency || 'eur', customer_email: metadata.email || 'dana@example.com', customer_details: over.customer_details || null, payment_intent: 'pi_1', metadata } } });

const { upgradeOffer, publicUpgrade, isUpgradeLeadId, UPGRADE_DAYS, UPGRADE_PATHS, upgradeLine, upgradeFact, upgradeTillHint, upgradePathsOf, upgradeVoidReason, upgradeMoneyBackNote, upgradeDaysOf, upgradeDeadline, openCreditFor, samePhone, fullSearchHeld, upgradeHubLine } = await import('../../api/_upgrade.js');
const TOK = await import('../../api/payments/_token.js');
const { default: checkout } = await import('../../api/service-checkout.js');
const { default: cityLead } = await import('../../api/city-lead.js');
const { default: webhook, stampRefund, stampDispute } = await import('../../api/stripe-webhook.js');
const { default: withdraw } = await import('../../api/withdraw.js');
const { serviceLeadId, CITY_PLANS, CITY_PLAN_DESC, cityOffer } = await import('../../api/_market.js');
const BOT = await import('../../api/telegram/_upgrade.js');

const DAY = 86400000;
const NOW = Date.now();
const AP_ID = 'svc_csliveAPorderSample0000001';
const apLead = (over = {}) => ({
  type: 'service', service: 'SERVICE', kind: 'application-pack', status: 'new', paid: true, source: 'web', intent: 'city_order',
  name: 'Dana Sample', email: 'dana@example.com', phone: '+34600000001',
  amount_paid: 19900, amount_eur: 199, currency: 'eur', paid_at: new Date(NOW - DAY).toISOString(), createdAt: new Date(NOW - DAY).toISOString(),
  market: 'madrid', sourceRef: 'city-madrid', leadType: 'tenant',
  city: { key: 'madrid', label: 'Madrid', mode: 'search', service: 'application-pack', paid: true, startNow: true, file: 'BM SAMPL', at: new Date(NOW - DAY).toISOString() },
  ...over,
});
const seed = (id, lead) => { store.set('leads/' + id, JSON.parse(JSON.stringify(lead))); bump('leads/' + id); };

// ── 1. The rule, pure ────────────────────────────────────────────────────────
{
  check(UPGRADE_DAYS === 30 && UPGRADE_PATHS['application-pack'] === 'full-search' && Object.keys(UPGRADE_PATHS).length === 1, 'the only path is Application Pack → Full Search, for 30 days');
  check(isUpgradeLeadId(AP_ID) && !isUpgradeLeadId('book_abc12345') && !isUpgradeLeadId('city_abc12345') && !isUpgradeLeadId('svc_../x'), 'only a paid-order id (svc_…) can carry a credit');
  const o = upgradeOffer(apLead(), AP_ID, NOW);
  check(o.ok && o.state === 'open' && o.list === 500 && o.credit === 199 && o.pay === 301 && o.currency === 'eur', 'a Madrid pack paid yesterday: €500 − €199 = €301 today', JSON.stringify(o));
  check(o.file === 'BM SAMPL' && o.to === 'full-search' && o.toLabel === 'Full Search' && o.fromLabel === 'Application Pack' && o.country === 'es', 'it names the file, the plans and the desk country (LAU art. 20 note on the page)');
  // the deadline is the END of the Rome day, 30 days after the day of payment: "valid until 12 December" holds all of 12 December
  const paidFix = Date.parse('2026-11-12T08:00:00Z'), lastFix = Date.parse('2026-12-12T22:59:59.999Z');
  const fixed = (now) => upgradeOffer(apLead({ paid_at: new Date(paidFix).toISOString() }), AP_ID, now);
  check(fixed(paidFix + DAY).expiresAt === '2026-12-12T22:59:59.999Z' && upgradeDeadline(paidFix, UPGRADE_DAYS) === lastFix, 'paid on 12 November (any hour): valid through 12 December, 23:59:59 Rome time', fixed(paidFix + DAY).expiresAt);
  check(fixed(lastFix).state === 'open' && fixed(paidFix + 30 * DAY + 3600000).state === 'open' && fixed(lastFix + 1).state === 'expired', 'still open 30 days and an hour after the payment and at the last millisecond of that day; expired the millisecond after');
  check(upgradeDeadline(Date.parse('2026-11-11T23:30:00Z'), 30) === lastFix && upgradeDeadline(Date.parse('2026-11-12T22:59:00Z'), 30) === lastFix && upgradeDeadline(Date.parse('2026-11-12T23:00:00Z'), 30) === lastFix + DAY,
    'the day of payment is the ROME day (00:30 in Rome is already the 12th; 23:59 still is; midnight starts the 13th)');
  check(upgradeDeadline(Date.parse('2027-03-10T10:00:00Z'), 30) === Date.parse('2027-04-09T21:59:59.999Z') && upgradeDeadline(Date.parse('2027-10-10T10:00:00Z'), 30) === Date.parse('2027-11-09T22:59:59.999Z'),
    'across the clock changes the deadline is still the end of the calendar day (calendar days, never 30 × 24 h)');
  // fixed instants (never "now minus n × 24 h": across a clock change that lands on another Rome day, and the suite
  // would go red by the hour it runs at): evenings before both changes, a year end, an ordinary morning
  const spans = ['2026-11-12T08:00:00Z', '2026-10-24T21:30:00Z', '2026-09-26T21:30:00Z', '2027-02-27T22:30:00Z', '2027-03-27T22:30:00Z', '2026-12-31T22:30:00Z'].map((t) => upgradeDeadline(Date.parse(t), UPGRADE_DAYS) - Date.parse(t));
  check(spans.every((d) => d >= UPGRADE_DAYS * DAY - 3600000 && d < (UPGRADE_DAYS + 1) * DAY + 3600000), 'never shorter than 30 days from the payment (less the hour a clock change takes), never more than a day longer', spans.map((d) => (d / DAY).toFixed(3)).join(' '));
  const pub = publicUpgrade(o);
  check(!('email' in pub) && !('name' in pub) && !('phone' in pub) && !JSON.stringify(pub).includes('dana@example.com'), 'the public view carries no name, email or phone');
  check(upgradeOffer(apLead({ credit: { usedBy: 'svc_other' } }), AP_ID, NOW).state === 'used', 'a credit already used is used');
  check(upgradeOffer(apLead({ paid_at: new Date(NOW - 33 * DAY).toISOString() }), AP_ID, NOW).state === 'expired'
    && upgradeOffer(apLead({ paid_at: '2026-10-12T22:30:00Z' }), AP_ID, Date.parse('2026-11-12T22:30:00Z')).state === 'open' && upgradeOffer(apLead({ paid_at: '2026-10-12T21:30:00Z' }), AP_ID, Date.parse('2026-11-12T22:30:00Z')).state === 'expired',
    'after its 30 days it has expired — counted in Rome days (paid at 00:30 on 13 October: open all of 12 November; paid at 23:30 on the 12th: expired)');
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
  // a policy since 12/11: a pack the client did not keep carries no credit
  const vr = upgradeOffer(apLead({ refundedAt: new Date(NOW).toISOString(), refundedAmount: 199, refundedFull: true }), AP_ID, NOW);
  const vp = upgradeOffer(apLead({ refundedAmount: 50 }), AP_ID, NOW);
  const vd = upgradeOffer(apLead({ disputedAt: new Date(NOW).toISOString(), disputeStatus: 'needs_response' }), AP_ID, NOW);
  check(!vr.ok && vr.state === 'void' && vr.reason === 'refunded' && vp.state === 'void' && vp.reason === 'refunded' && vd.state === 'void' && vd.reason === 'disputed' && vr.file === 'BM SAMPL',
    'a pack whose money went back (refunded in full or in part, or disputed with the bank) carries no credit: state "void", with the reason', JSON.stringify([vr, vp, vd]));
  // a withdrawal STATEMENT alone closes nothing: it is matched by e-mail, so it may be late, without effect or someone else's — its refund closes the credit
  const vw = upgradeOffer(apLead({ withdrawal: { at: new Date(NOW).toISOString(), via: 'online' }, withdrawnAt: new Date(NOW).toISOString() }), AP_ID, NOW);
  check(vw.ok && vw.state === 'open' && upgradeVoidReason(apLead({ withdrawal: { at: 'x' } })) === null, 'a withdrawal statement on file does not close the credit (only the refund does)', JSON.stringify(vw).slice(0, 120));
  check(upgradeVoidReason(apLead({ disputedAt: null, disputeStatus: 'won' })) === null && upgradeOffer(apLead({ disputedAt: null, disputeStatus: 'won' }), AP_ID, NOW).state === 'open', 'a dispute that was won gives the credit back');
  check(upgradeOffer(apLead({ disputedAt: new Date(NOW).toISOString(), refundedAmount: 199 }), AP_ID, NOW).reason === 'refunded', 'refunded and disputed: the reason said is the refund');
  check(upgradeOffer(apLead({ refundedAt: new Date(NOW).toISOString(), refundedAmount: 199, credit: { usedBy: 'svc_other' } }), AP_ID, NOW).state === 'used', 'a credit already used stays "used" when the pack is refunded later');
  check(upgradeOffer(apLead({ refundedAmount: 199, paid_at: new Date(NOW - 40 * DAY).toISOString() }), AP_ID, NOW).state === 'void', 'a refunded pack past its 30 days answers "void", never "expired" (the reason the client reads is the true one)');
  check(publicUpgrade(vr).state === 'void' && publicUpgrade(vr).reason === 'refunded' && !('email' in publicUpgrade(vr)) && !('name' in publicUpgrade(vr)), 'the public view of a void credit carries the reason and no personal data');
  check(upgradeVoidReason(apLead()) === null && upgradeVoidReason(null) === null && upgradeVoidReason(apLead({ refundedAmount: 0, withdrawal: null })) === null, 'a pack the client keeps is not void (a zero refund is no refund)');
  // Berlin never charges a pack on top of a Full Search (Terms §12.5, the registry's noStacking): there the credit has no deadline
  const berlinPack = (over = {}) => apLead({ market: 'berlin', city: { ...apLead().city, key: 'berlin', label: 'Berlin', file: 'BM BERLN' }, ...over });
  const b40 = upgradeOffer(berlinPack({ paid_at: new Date(NOW - 40 * DAY).toISOString() }), AP_ID, NOW), b400 = upgradeOffer(berlinPack({ paid_at: new Date(NOW - 400 * DAY).toISOString() }), AP_ID, NOW);
  check(upgradeDaysOf('berlin') === null && upgradeDaysOf('madrid') === UPGRADE_DAYS && upgradeDaysOf('paris') === UPGRADE_DAYS && upgradeDaysOf('nowhere') === UPGRADE_DAYS && upgradeDaysOf('__proto__') === UPGRADE_DAYS,
    'the credit runs 30 days on every desk but Berlin, where it has no deadline (an unknown desk gets the 30 days)');
  check(b40.ok && b40.state === 'open' && b40.pay === 301 && b40.expiresAt === null && b40.days === null && b400.ok && publicUpgrade(b40).expiresAt === null, 'a Berlin pack paid 40 days ago (or 400) is still credited: no deadline, no date', JSON.stringify(b40));
  check(o.days === UPGRADE_DAYS && upgradeOffer(apLead({ paid_at: new Date(NOW - 40 * DAY).toISOString() }), AP_ID, NOW).state === 'expired', 'Madrid keeps its 30 days: the same pack 40 days old has expired');
  check(upgradeOffer(berlinPack({ refundedAmount: 199 }), AP_ID, NOW).state === 'void' && upgradeOffer(berlinPack({ credit: { usedBy: 'svc_x' } }), AP_ID, NOW).state === 'used', 'a refunded or already used Berlin pack is void or used like anywhere');
  // the policy in words: one copy, and a desk offers the path only when it sells both ends
  check(upgradeLine('Full Search') === 'Credited in full if you move to Full Search within 30 days.'
    && upgradeFact('Application Pack', 'Full Search') === 'The Application Pack fee is credited in full towards Full Search for 30 days from payment, through the personal link in the order email.'
    && upgradeLine('X').includes(String(UPGRADE_DAYS)) && upgradeFact('A', 'B').includes(String(UPGRADE_DAYS)), 'the policy words are one copy, carry the server\'s number of days and name the door that applies the credit');
  check(upgradeLine('Full Search', null) === 'Credited in full if you move to Full Search.'
    && upgradeFact('Application Pack', 'Full Search', null) === 'The Application Pack fee is credited in full towards Full Search with no time limit, through the personal link in the order email.'
    && !/\d/.test(upgradeLine('X', null) + upgradeFact('A', 'B', null)), 'on a desk with no deadline (Berlin) the same words name no number of days');
  check(upgradeTillHint('Application Pack') === 'Already paid for the Application Pack on this desk? Use the personal link in your order email: what you paid comes off this price.', 'the till of the plan a credit leads to points a pack holder to the personal link');
  const three = [{ id: 'full-search', label: 'Full Search' }, { id: 'application-pack', label: 'Application Pack' }, { id: 'attended-viewing', label: 'Attended Viewing' }];
  check(JSON.stringify(upgradePathsOf(three)) === '[{"from":"application-pack","to":"full-search","fromLabel":"Application Pack","toLabel":"Full Search"}]'
    && upgradePathsOf([three[1], three[2]]).length === 0 && upgradePathsOf([three[0]]).length === 0 && upgradePathsOf(null).length === 0, 'a desk offers the path only when it sells both ends');
  // what the operator is told when money for an order goes back
  const eurFmt = (n) => '€' + n;
  check(/già stato usato da svc_up1/.test(upgradeMoneyBackNote(apLead({ credit: { usedBy: 'svc_up1' } }), eurFmt))
    && /pagato col credito di svc_pack1 \(€199\).*QUESTO ordine/.test(upgradeMoneyBackNote(apLead({ kind: 'full-search', city: { ...apLead().city, service: 'full-search', credit: { from: 'svc_pack1', amount: 199 } } }), eurFmt))
    && upgradeMoneyBackNote(apLead(), eurFmt) === 'il credito di upgrade di questo ordine non vale più'
    && upgradeMoneyBackNote(apLead(), eurFmt, { statement: true }) === 'il credito di upgrade di questo ordine si chiude da solo quando lo rimborsi su Stripe (una dichiarazione da sola non lo chiude)'
    && upgradeMoneyBackNote(apLead({ kind: 'full-search', city: { ...apLead().city, service: 'full-search', creditDue: { from: 'svc_pack1', amount: 199 } } }), eurFmt) === 'su questo ordine è dovuto il rimborso del credito di svc_pack1 (€199)'
    && /dovuto il rimborso del credito di svc_pack1 \(€199\): un rimborso è già segnato su questo ordine$/.test(upgradeMoneyBackNote(apLead({ kind: 'full-search', refundedAt: 'x', city: { ...apLead().city, service: 'full-search', creditDue: { from: 'svc_pack1', amount: 199 } } }), eurFmt))
    && /^ATTENZIONE: il credito di questo ordine è già stato rimborsato sull'ordine svc_fs1, pagato a prezzo pieno: un rimborso di questo pack è un secondo rimborso dello stesso credito$/.test(upgradeMoneyBackNote(apLead({ credit: { usedBy: 'svc_fs1', via: 'full-price' } }), eurFmt))
    && upgradeMoneyBackNote(apLead({ kind: 'attended-viewing', city: { ...apLead().city, service: 'attended-viewing' } }), eurFmt) === ''
    && upgradeMoneyBackNote({ kind: 'virtual-viewing', paid: true }, eurFmt) === '' && upgradeMoneyBackNote(null) === '',
    'the money-back note: a used credit warns, an upgrade says what the refund is counted on, an open pack closes (with its refund, when only a statement arrived), an order paid in full says what is owed, anything else is silent');
  // the Full Search each desk really sells: Paris and Berlin have their own description (Stripe page, upgrade page)
  const par = upgradeOffer(apLead({ market: 'paris', city: { ...apLead().city, key: 'paris' } }), AP_ID, NOW), ber = upgradeOffer(berlinPack(), AP_ID, NOW);
  check(o.desc === CITY_PLANS['full-search'].desc && cityOffer('madrid', 'full-search').desc === CITY_PLANS['full-search'].desc && cityOffer('london', 'application-pack').desc === CITY_PLANS['application-pack'].desc, 'six desks keep the shared Full Search description');
  check(par.desc === CITY_PLAN_DESC.paris['full-search'] && /each further viewing €149/.test(par.desc) && /six months at most/.test(par.desc) && /Refunded in full if we decline the search in the first call\./.test(par.desc),
    'Paris: one attended viewing, further ones €149, six months at most (its own terms), the refund rule', par.desc);
  check(ber.desc === CITY_PLAN_DESC.berlin['full-search'] && /offer them to you alone/.test(ber.desc) && /attended viewings included/.test(ber.desc) && /two months' net cold rent plus VAT: we refund the difference/.test(ber.desc) && !/one attended viewing/.test(ber.desc),
    'Berlin: homes offered to you alone, viewings included, the fee within the legal cap — never "one attended viewing"', ber.desc);
  // the same phone in two spellings; a missing or too short number never matches
  check(samePhone('+34 600 000 001', '600000001') && samePhone('+34600000001', '0034 600-000-001') && !samePhone('+34600000001', '+34600000002') && !samePhone('', '') && !samePhone('+34600000001', '') && !samePhone(null, undefined) && !samePhone('12345', '12345'),
    'two spellings of one phone are the same phone; a missing or too short number is never "the same"');
  // Berlin (Terms §12.5): the Full Search a payer already holds, when they pay anything else there
  const berFs = { ...apLead({ market: 'berlin', kind: 'full-search', amount_eur: 500, city: { ...apLead().city, key: 'berlin', label: 'Berlin', service: 'full-search', file: 'BM BERFS' } }), id: 'svc_berlinfs000001' };
  check(fullSearchHeld([berFs], 'berlin', 'attended-viewing').id === 'svc_berlinfs000001' && fullSearchHeld([berFs], 'berlin', 'application-pack').file === 'BM BERFS'
    && fullSearchHeld([berFs], 'berlin', 'full-search') === null && fullSearchHeld([berFs], 'berlin', '') === null && fullSearchHeld([{ ...berFs, market: 'madrid' }], 'madrid', 'attended-viewing') === null
    && fullSearchHeld([{ ...berFs, refundedFull: true }], 'berlin', 'attended-viewing') === null && fullSearchHeld([{ ...berFs, disputedAt: 'x' }], 'berlin', 'attended-viewing') === null
    && fullSearchHeld([{ ...berFs, paid: false }], 'berlin', 'attended-viewing') === null && fullSearchHeld([{ ...berFs, id: 'city_freedoor00001' }], 'berlin', 'attended-viewing') === null
    && fullSearchHeld([{ ...berFs, refundedAmount: 199, refundedFull: false }], 'berlin', 'attended-viewing') !== null && fullSearchHeld(null, 'berlin', 'attended-viewing') === null,
    'Berlin: a paid Full Search of that desk whose money is still BOOM\'s counts (a partial refund too); never on a desk that stacks, never for a Full Search itself, never one refunded in full or disputed');
  check(upgradeHubLine('Full Search', 30, 'Berlin') === 'Credited in full towards Full Search at the same desk within 30 days (Berlin: no time limit).' && upgradeHubLine('Full Search') === 'Credited in full towards Full Search at the same desk within 30 days.' && upgradeHubLine('Full Search', null, 'Berlin') === 'Credited in full towards Full Search at the same desk.',
    'the hub\'s line says WHICH desk (the pack\'s own): one page presents all eight');
  // the other door, pure: which of the payer's own orders carries an open credit towards the plan being paid
  const mine = [{ ...apLead(), id: 'city_freedoor00001' }, { ...apLead({ credit: { usedBy: 'svc_x' } }), id: 'svc_usedpack0001' }, { ...apLead({ market: 'amsterdam' }), id: 'svc_amspack00001' }, { ...apLead(), id: 'svc_openpack0001' }];
  const hit = openCreditFor(mine, 'madrid', 'full-search', NOW);
  check(hit && hit.id === 'svc_openpack0001' && hit.offer.credit === 199 && openCreditFor(mine, 'madrid', 'attended-viewing', NOW) === null && openCreditFor(mine, 'london', 'full-search', NOW) === null
    && openCreditFor(mine.slice(0, 3), 'madrid', 'full-search', NOW) === null && openCreditFor(null, 'madrid', 'full-search', NOW) === null,
    'the payer\'s open credit: a paid pack of THIS desk, not used, towards THIS plan — a free-door lead, a used pack or another desk\'s pack never count');
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
  check(r.code === 200 && r.body.ok && r.body.pay === 301 && r.body.city === 'madrid' && r.body.file === 'BM SAMPL', 'a valid link reads the open credit', JSON.stringify(r.body));
  check(!JSON.stringify(r.body).includes('dana@example.com') && !JSON.stringify(r.body).includes('Sample') && !JSON.stringify(r.body).includes('+34600000001'), 'no name, email or phone in the answer');
  check(r.headers['cache-control'] === 'no-store', 'never cached');
  const bad = await get(cityLead, { upgrade: AP_ID, t: 'x'.repeat(24) });
  const ghost = await get(cityLead, { upgrade: 'svc_csliveNoSuchOrder00000001', t: TOK.upgradeToken('svc_csliveNoSuchOrder00000001') });
  check(bad.code === 404 && ghost.code === 404 && JSON.stringify(bad.body) === JSON.stringify(ghost.body), 'a wrong token and an unknown order answer the same 404');
  // a pack whose money went back: 410 with the reason, and still no personal data
  const REF_ID = 'svc_csliveRefundedPack00000001', WDR_ID = 'svc_csliveWithdrawnPack0000001', DSP_ID = 'svc_csliveDisputedPack00000001';
  seed(REF_ID, apLead({ refundedAt: new Date(NOW).toISOString(), refundedAmount: 199, refundedFull: true, city: { ...apLead().city, file: 'BM REFND' } }));
  seed(WDR_ID, apLead({ withdrawal: { at: new Date(NOW).toISOString(), via: 'online', statementId: 'W-1' }, city: { ...apLead().city, file: 'BM WDRWN' } }));
  seed(DSP_ID, apLead({ disputedAt: new Date(NOW).toISOString(), disputeStatus: 'needs_response', city: { ...apLead().city, file: 'BM DSPTD' } }));
  const vr = await get(cityLead, { upgrade: REF_ID, t: TOK.upgradeToken(REF_ID) });
  const vd = await get(cityLead, { upgrade: DSP_ID, t: TOK.upgradeToken(DSP_ID) });
  const vw = await get(cityLead, { upgrade: WDR_ID, t: TOK.upgradeToken(WDR_ID) });
  check(vr.code === 410 && vr.body.state === 'void' && vr.body.reason === 'refunded' && vd.code === 410 && vd.body.state === 'void' && vd.body.reason === 'disputed', 'a refunded or disputed pack answers 410 "void" with its reason', JSON.stringify([vr.body, vd.body]));
  check(!JSON.stringify(vr.body).includes('dana@example.com') && !JSON.stringify(vd.body).includes('Sample') && !('pay' in vr.body) && !('pay' in vd.body), 'and carries no amount to pay and no personal data');
  check(vw.code === 200 && vw.body.state === 'open' && vw.body.pay === 301, 'a pack with only a withdrawal statement on file still answers its open credit', JSON.stringify(vw.body).slice(0, 120));
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
  check(li && /€199 Application Pack credited/.test(li.product_data.name) && /file BM SAMPL/.test(li.product_data.description), 'the Stripe page says what is credited and which file');
  check(s && s.customer_email === 'dana@example.com' && s.metadata.name === 'Dana Sample' && s.metadata.phone === '+34600000001', 'the payer is the person of the paid order (the page asks nothing)');
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
  // the till never opens on a pack whose money went back
  const n2 = (globalThis.__stripeCalls || []).length;
  const REF_ID = 'svc_csliveRefundedPack00000001', DSP_ID = 'svc_csliveDisputedPack00000001';
  const v1 = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: REF_ID, t: TOK.upgradeToken(REF_ID) }, startNow: true });
  const v2 = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: DSP_ID, t: TOK.upgradeToken(DSP_ID) } });
  check(v1.code === 410 && v1.body.error === 'upgrade_void' && v2.code === 410 && v2.body.error === 'upgrade_void' && (globalThis.__stripeCalls || []).length === n2, 'a refunded or disputed pack: 410 upgrade_void, no Stripe session', JSON.stringify([v1.body, v2.body]));
  // Paris and Berlin: the Stripe page describes the Full Search THAT desk sells
  const BER_ID = 'svc_csliveBerlinPackOrder00001';
  seed(BER_ID, apLead({ market: 'berlin', paid_at: new Date(NOW - 40 * DAY).toISOString(), city: { ...apLead().city, key: 'berlin', label: 'Berlin', file: 'BM BERLN' } }));
  const nb = (globalThis.__stripeCalls || []).length;
  const vb = await post(checkout, { city: 'berlin', kind: 'full-search', upgrade: { lead: BER_ID, t: TOK.upgradeToken(BER_ID) } });
  const sb = (globalThis.__stripeCalls || [])[nb];
  check(vb.code === 200 && sb && sb.line_items[0].price_data.unit_amount === 30100 && /offer them to you alone/.test(sb.line_items[0].price_data.product_data.description) && !/one attended viewing/.test(sb.line_items[0].price_data.product_data.description),
    'a Berlin pack paid 40 days ago opens a €301 session through the real till, described as Berlin\'s Full Search', sb && sb.line_items[0].price_data.product_data.description);
  await post(checkout, { city: 'paris', kind: 'full-search', name: 'Pia Paris', email: 'pia@example.com' });
  const sp = (globalThis.__stripeCalls || [])[(globalThis.__stripeCalls || []).length - 1];
  check(sp && sp.line_items[0].price_data.unit_amount === 50000 && /six months at most/.test(sp.line_items[0].price_data.product_data.description) && /each further viewing €149/.test(sp.line_items[0].price_data.product_data.description), 'a Paris Full Search bought on the page is described with Paris\'s own terms', sp && sp.line_items[0].price_data.product_data.description);
}

// ── 5. The webhook: the order, the file, the credit marked once ──────────────
const meta = (over = {}) => ({ service: 'SERVICE', kind: 'full-search', city: 'madrid', market: 'madrid', name: 'Dana Sample', email: 'dana@example.com', phone: '+34600000001', listing: '', notes: '', amount_eur: '301', currency: 'eur', start_now: '1', credit_from: AP_ID, credit_amount: '199', credit_plan: 'application-pack', ...over });
{
  emails.length = 0;
  const r = await webhook(stream(event(meta(), { id: 'cs_live_up_1' })), mkRes());
  const fs1 = store.get('leads/' + serviceLeadId('cs_live_up_1'));
  check(fs1 && fs1.paid && fs1.city && fs1.city.service === 'full-search' && fs1.amount_eur === 301, 'the Full Search order is written, €301 paid');
  check(fs1 && fs1.city.file === 'BM SAMPL' && fs1.city.fileLeadId === AP_ID, 'it keeps the pack\'s file number: one person, one file');
  check(fs1 && fs1.city.credit && fs1.city.credit.from === AP_ID && fs1.city.credit.amount === 199 && fs1.city.credit.verified === true, 'the credit is written on the order');
  check(fs1 && /€301 paid \(€199 Application Pack credited\)/.test(fs1.message), 'the summary says €301 paid and €199 credited', fs1 && fs1.message);
  const ap = store.get('leads/' + AP_ID);
  check(ap.credit && ap.credit.usedBy === serviceLeadId('cs_live_up_1') && ap.credit.amount === 199, 'the pack\'s credit is marked used by this order');
  const op = emails.find((e) => e.to_email === 'valentino@boom-rome.com'), cl = emails.find((e) => e.to_email === 'dana@example.com');
  check(op && /Upgrade: €199 credited from the Application Pack \(file BM SAMPL\); invoice what was paid, €301\./.test(op.intro), 'the operator email names the upgrade and the amount to invoice', op && op.intro);
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
  // a policy since 12/11: the CLIENT's own confirmation carries the link too, with the rule in one sentence
  const cl9 = emails.find((e) => e.to_email === 'dana@example.com');
  check(cl9 && cl9.closing.includes(`Your personal link: https://www.boomrome.com/upgrade?l=${id9}&t=${TOK.upgradeToken(id9)} `)
    && cl9.closing.includes(`The €199 you paid is credited in full if you move to Full Search on this desk within ${UPGRADE_DAYS} days of this payment, once.`),
    'the client\'s pack confirmation carries the personal link and the rule (what is credited, where, by when, once)', cl9 && cl9.closing);
  check(cl9 && /To withdraw within 14 days of payment/.test(cl9.closing) && /MODEL WITHDRAWAL FORM/.test(cl9.closing) && cl9.closing.indexOf('Your personal link') < cl9.closing.indexOf('To withdraw within 14 days'), 'and keeps the withdrawal text and the model form after it');
  check(op9 && /also in their own email/.test(op9.closing), 'the operator email says the client already has the link');
  // Berlin: the same email without a deadline (the credit never expires there)
  emails.length = 0;
  await webhook(stream(event({ ...meta(), kind: 'application-pack', city: 'berlin', market: 'berlin', name: 'Bea Berlin', email: 'bea@example.com', phone: '+4915112345678', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_ber', amount_total: 19900 })), mkRes());
  const clB = emails.find((e) => e.to_email === 'bea@example.com'), opB = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  check(clB && clB.closing.includes('The €199 you paid is credited in full if you move to Full Search on this desk, once. Your personal link: https://www.boomrome.com/upgrade?l=') && !/within \d+ days of this payment/.test(clB.closing)
    && opB && /\(no deadline on this desk; the client's personal link/.test(opB.closing) && !/valid \d+ days/.test(opB.closing), 'a Berlin pack: both emails carry the link and name no deadline', clB && clB.closing.slice(0, 260));
  // no link where there is nothing to upgrade: a Full Search, an Attended Viewing, a Rome service
  emails.length = 0;
  await webhook(stream(event({ ...meta(), name: 'Fay Full', email: 'fay@example.com', phone: '+34600000002', credit_from: '', credit_amount: '', credit_plan: '', amount_eur: '500' }, { id: 'cs_live_fs_10', amount_total: 50000 })), mkRes());
  await webhook(stream(event({ ...meta(), kind: 'attended-viewing', credit_from: '', credit_amount: '', credit_plan: '', amount_eur: '149' }, { id: 'cs_live_av_11', amount_total: 14900 })), mkRes());
  await webhook(stream(event({ service: 'SERVICE', kind: 'virtual-viewing', name: 'Rome Client', email: 'rome@example.com', phone: '+393331112223', listing: '', notes: '', amount_eur: '89' }, { id: 'cs_live_vv_12', amount_total: 8900 })), mkRes());
  check(emails.length === 6 && emails.every((e) => !/upgrade\?l=/.test(e.closing) && !/credited in full/.test(e.closing)), 'a Full Search, an Attended Viewing and a Rome service order carry no upgrade link', String(emails.length));
  const fs10 = store.get('leads/' + serviceLeadId('cs_live_fs_10'));
  check(fs10 && !fs10.city.creditDue && ![...store.keys()].some((k) => k.startsWith('agentNotifications/upgrade-owed-')) && !/PAID IN FULL/.test(emails.map((e) => e.intro).join(' ')), 'a Full Search paid in full by someone with no pack owes nothing: no creditDue, no alert');

  // ── a refund on Stripe is stamped on the order, and the credit is void ──
  const TG = (re) => tg.some((x) => re.test(String(x.text || '')));
  const refundEvt = (id, pi, amount, refunded, created = 1794300000) => ({ id, type: 'charge.refunded', created, data: { object: { id: 'ch_' + id, payment_intent: pi, amount, amount_refunded: refunded, currency: 'eur', billing_details: { name: 'Dana Sample' } } } });
  check((await get(cityLead, { upgrade: id9, t: TOK.upgradeToken(id9) })).code === 200, 'before the refund the new pack\'s link is open');
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_9', payment_intent: 'pi_pack_9' }];
  tg.length = 0;
  const r1 = await webhook(stream(refundEvt('evt_ref_1', 'pi_pack_9', 19900, 19900)), mkRes());
  const l9 = store.get('leads/' + id9);
  check(r1.code === 200 && l9.refundedAmount === 199 && l9.refundedFull === true && l9.refundedAt === new Date(1794300000 * 1000).toISOString() && l9.paid === true && l9.city.file, 'a full refund is stamped on the pack\'s lead (amount, full, the event\'s time) and nothing else changes', JSON.stringify({ a: l9.refundedAmount, f: l9.refundedFull, t: l9.refundedAt }));
  check(TG(/RIMBORSO totale/) && TG(new RegExp('Ordine ' + id9 + ' \\(Madrid · Application Pack · BM [A-Z2-9]{5}\\): segnato rimborsato — il credito di upgrade di questo ordine non vale più\\.')), 'the operator\'s card names the order and says its credit is closed', JSON.stringify(tg.map((x) => x.text)));
  const g9 = await get(cityLead, { upgrade: id9, t: TOK.upgradeToken(id9) });
  const nS = (globalThis.__stripeCalls || []).length;
  const p9 = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: id9, t: TOK.upgradeToken(id9) } });
  check(g9.code === 410 && g9.body.state === 'void' && g9.body.reason === 'refunded' && p9.code === 410 && (globalThis.__stripeCalls || []).length === nS, 'after the refund the link answers 410 and the till opens no session');
  // a Stripe retry of the same event: no second card, the stamp stays
  const tgN = tg.length;
  const r1b = await webhook(stream(refundEvt('evt_ref_1', 'pi_pack_9', 19900, 19900)), mkRes());
  check(r1b.body && r1b.body.duplicate === true && tg.length === tgN && store.get('leads/' + id9).refundedAmount === 199, 'a retry of the refund event rings once and keeps the stamp');
  // a partial refund voids too, and a second partial one overwrites the total
  const PART = 'svc_cslivepack13';
  await webhook(stream(event({ ...meta(), kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_13', amount_total: 19900 })), mkRes());
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_13', payment_intent: 'pi_pack_13' }];
  await webhook(stream(refundEvt('evt_ref_2', 'pi_pack_13', 19900, 5000)), mkRes());
  const lp = store.get('leads/' + PART);
  check(serviceLeadId('cs_live_pack_13') === PART && lp.refundedAmount === 50 && lp.refundedFull === false && upgradeOffer(lp, PART, NOW).state === 'void', 'a partial refund is stamped as partial and voids the credit too');
  await webhook(stream(refundEvt('evt_ref_3', 'pi_pack_13', 19900, 12000, 1794400000)), mkRes());
  check(store.get('leads/' + PART).refundedAmount === 120 && store.get('leads/' + PART).refundedAt === new Date(1794400000 * 1000).toISOString(), 'a second partial refund writes the new cumulative total');
  // the stamps only go forward (Stripe does not deliver in order): the FIRST partial refund under a late event changes
  // nothing and is not announced as a repair…
  tg.length = 0;
  const rOld = await webhook(stream(refundEvt('evt_ref_2late', 'pi_pack_13', 19900, 5000, 1794300000)), mkRes());
  check(rOld.code === 200 && store.get('leads/' + PART).refundedAmount === 120 && store.get('leads/' + PART).refundedAt === new Date(1794400000 * 1000).toISOString() && TG(/già segnato rimborsato per €120 \(questo evento è precedente\)/) && !TG(/✅/),
    'an older refund event delivered late never lowers the stamp: the card says the order already carries more', JSON.stringify(tg.map((x) => x.text)));
  // …and the very same first event delivered again (a plain retry: nothing had failed) rings nothing and repairs nothing
  tg.length = 0;
  const rDup = await webhook(stream(refundEvt('evt_ref_2', 'pi_pack_13', 19900, 5000)), mkRes());
  check(rDup.code === 200 && rDup.body.duplicate === true && tg.length === 0 && store.get('leads/' + PART).refundedAmount === 120 && !store.get('agentNotifications/stripe-evt_ref_2').repairedAt,
    'the first event delivered again after the second: no "✅ repaired" (nothing had failed), and the total stays', JSON.stringify(tg.map((x) => x.text)));
  // the session Stripe returns must be the one of THIS payment: another intent's session stamps nothing
  const OTHER = 'svc_cslivepack14';
  await webhook(stream(event({ ...meta(), kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_14', amount_total: 19900 })), mkRes());
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_14', payment_intent: 'pi_pack_14' }];
  tg.length = 0;
  await webhook(stream(refundEvt('evt_ref_4', 'pi_someone_else', 90000, 90000)), mkRes());
  check(!('refundedAt' in store.get('leads/' + OTHER)) && upgradeOffer(store.get('leads/' + OTHER), OTHER, NOW).state === 'open' && TG(/RIMBORSO totale/) && !TG(/segnato rimborsato/), 'a refund of another payment never stamps this order (the session must carry the charge\'s own PaymentIntent)');
  // two refund events for the same order processed together: the smaller one, losing the race, does not write over the larger
  hooks.beforeCommit = (k) => { if (k === 'leads/' + OTHER) { hooks.beforeCommit = null; store.set(k, { ...store.get(k), refundedAt: new Date(1794450000 * 1000).toISOString(), refundedAmount: 150, refundedFull: false }); bump(k); } };
  const rRace = await webhook(stream(refundEvt('evt_ref_4race', 'pi_pack_14', 19900, 5000)), mkRes());
  hooks.beforeCommit = null;
  check(rRace.code === 200 && store.get('leads/' + OTHER).refundedAmount === 150, 'a stamp is written under the version it read: a larger refund that landed in between is not overwritten', String(store.get('leads/' + OTHER).refundedAmount));
  // a rent, a deposit, an invoice: no svc_ lead exists and none is created
  globalThis.__stripeSessions = [{ id: 'cs_live_rent_77', payment_intent: 'pi_rent_77' }];
  const before = store.size;
  tg.length = 0;
  await webhook(stream(refundEvt('evt_ref_5', 'pi_rent_77', 120000, 120000)), mkRes());
  check(!store.has('leads/' + serviceLeadId('cs_live_rent_77')) && store.size === before + 1 && TG(/RIMBORSO totale/) && !TG(/segnato rimborsato/), 'a refund with no paid order behind it (a rent, a deposit) creates no lead: only its notification');
  check((await stampRefund({ payment_intent: '', amount: 100, amount_refunded: 100 }, 1)) === null && (await stampRefund(null, 1)) === null, 'a charge with no PaymentIntent stamps nothing');
  // the pack whose credit was ALREADY used, refunded later: the card warns the operator
  globalThis.__stripeSessions = [{ id: 'cs_live_ap_origin', payment_intent: 'pi_ap_origin' }];
  const ORIGIN = serviceLeadId('cs_live_ap_origin');
  seed(ORIGIN, apLead({ credit: { usedBy: 'svc_csliveup1', usedAt: new Date(NOW).toISOString(), amount: 199, currency: 'eur' } }));
  tg.length = 0;
  await webhook(stream(refundEvt('evt_ref_6', 'pi_ap_origin', 19900, 19900)), mkRes());
  check(TG(/segnato rimborsato — ATTENZIONE: il credito di upgrade di questo ordine è già stato usato da svc_csliveup1/) && store.get('leads/' + ORIGIN).credit.usedBy === 'svc_csliveup1', 'a refunded pack whose credit was already used: the card warns, the mark stays', JSON.stringify(tg.map((x) => x.text)));
  // the Full Search paid with the credit, refunded: the card says what the refund is counted on
  globalThis.__stripeSessions = [{ id: 'cs_live_up_1', payment_intent: 'pi_1' }];
  tg.length = 0;
  await webhook(stream(refundEvt('evt_ref_7', 'pi_1', 30100, 30100)), mkRes());
  check(TG(new RegExp('pagato col credito di ' + AP_ID + ' \\(€199\\): il rimborso si calcola su quanto pagato per QUESTO ordine')) && store.get('leads/' + serviceLeadId('cs_live_up_1')).refundedAmount === 301, 'a refunded upgrade: the card says the refund is counted on what was paid for it (€301)', JSON.stringify(tg.map((x) => x.text)));
  globalThis.__stripeSessions = [];

  // ── an upgrade PAID on a pack that was refunded meanwhile (a session opened before the refund) ──
  const VOID_ID = 'svc_csliveRefundedPack00000001';
  emails.length = 0;
  await webhook(stream(event(meta({ credit_from: VOID_ID }), { id: 'cs_live_up_void' })), mkRes());
  const fv = store.get('leads/' + serviceLeadId('cs_live_up_void'));
  const opV = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  const alertV = store.get('agentNotifications/upgrade-void-' + serviceLeadId('cs_live_up_void').slice(4));
  check(fv && fv.city.credit.verified === false && fv.city.credit.voided === 'refunded' && fv.city.file === 'BM REFND' && !store.get('leads/' + VOID_ID).credit, 'an upgrade paid on a refunded pack: the credit is NOT verified and never marked (the order keeps the person\'s file)', fv && JSON.stringify(fv.city.credit));
  check(alertV && alertV.priority === 'high' && alertV.type === 'service.upgrade_credit_void' && /era stato rimborsato/.test(alertV.summary), 'and an urgent alert tells the operator no credit was due', alertV && alertV.summary);
  check(opV && /the pack was refunded, so NO credit was due/.test(opV.intro) && !/could NOT be verified/.test(opV.intro), 'the operator email says why, in words', opV && opV.intro);
  const nA = [...store.keys()].filter((k) => k.startsWith('agentNotifications/upgrade-void-')).length;
  await webhook(stream(event(meta({ credit_from: VOID_ID }), { id: 'cs_live_up_void' })), mkRes());
  check([...store.keys()].filter((k) => k.startsWith('agentNotifications/upgrade-void-')).length === nA, 'a Stripe retry does not ring the alert twice');
}

// ── 5b. An online withdrawal STATEMENT does not close the credit: its refund does (the REAL /api/withdraw) ──
{
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Wanda Withdraw', email: 'wanda@example.com', phone: '+34611222333', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_15', amount_total: 19900 })), mkRes());
  const WID = serviceLeadId('cs_live_pack_15');
  const file = store.get('leads/' + WID).city.file, t = TOK.upgradeToken(WID);
  check((await get(cityLead, { upgrade: WID, t })).code === 200, 'a pack paid a moment ago has its credit open');
  const r = await post(withdraw, { name: 'Wanda Withdraw', email: 'wanda@example.com', ref: file, desk: 'Madrid', service: 'application-pack', requestId: 'wreq0000' + 'a'.repeat(8) });
  const lead = store.get('leads/' + WID);
  check(r.code === 200 && r.body && r.body.ok === true && lead.withdrawal && lead.withdrawal.via === 'online' && lead.paid === true && !lead.withdrawnAt, 'the real online withdrawal writes its map on the paid pack (and decides nothing else)', JSON.stringify({ code: r.code, body: r.body, w: lead.withdrawal || null }));
  const g = await get(cityLead, { upgrade: WID, t });
  check(g.code === 200 && g.body.state === 'open' && g.body.pay === 301, 'the statement alone leaves the credit open: nothing was refunded yet', JSON.stringify(g.body).slice(0, 100));
  const stmt = [...store.entries()].find(([k, v]) => k.startsWith('agentNotifications/withdraw-') && v && v.match && v.match.leadId === WID);
  check(stmt && /il credito di upgrade di questo ordine si chiude da solo quando lo rimborsi su Stripe \(una dichiarazione da sola non lo chiude\)\. Nessun rimborso automatico\./.test(stmt[1].summary), 'the operator\'s withdrawal card says the credit closes with the refund, not with the statement', stmt && stmt[1].summary);
  // a statement typed by someone else (another name, only the client's e-mail): the credit is untouched
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Vera Victim', email: 'vera@example.com', phone: '+34611222555', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_17', amount_total: 19900 })), mkRes());
  const VID = serviceLeadId('cs_live_pack_17');
  const r3 = await post(withdraw, { name: 'Xy', email: 'vera@example.com', desk: 'other', requestId: 'wreq2222' + 'c'.repeat(8) });
  check(r3.code === 200 && (await get(cityLead, { upgrade: VID, t: TOK.upgradeToken(VID) })).code === 200, 'a statement sent by someone who only knows the client\'s e-mail cannot close the client\'s credit');
  // the upgrade PAID on a pack with a statement on file: the credit holds, and the operator is told before refunding the pack
  emails.length = 0;
  await webhook(stream(event(meta({ credit_from: WID, name: 'Wanda Withdraw', email: 'wanda@example.com', phone: '+34611222333' }), { id: 'cs_live_up_15' })), mkRes());
  const up15 = store.get('leads/' + serviceLeadId('cs_live_up_15'));
  const alW = store.get('agentNotifications/upgrade-wdr-' + serviceLeadId('cs_live_up_15').slice(4));
  const opW = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  check(up15 && up15.city.credit.verified === true && store.get('leads/' + WID).credit.usedBy === serviceLeadId('cs_live_up_15'), 'an upgrade paid on a pack with a statement on file: the credit is verified and marked used');
  check(alW && alW.priority === 'high' && alW.type === 'service.upgrade_credit_statement' && /dichiarazione di recesso non ancora rimborsata: il credito è stato USATO/.test(alW.summary) && opW && /a withdrawal statement is on file for that pack: the credit is now SPENT/.test(opW.intro),
    'and the operator is warned (alert + email): a later refund of that pack must count the credit', alW && alW.summary);
  // …and when the pack is then refunded on Stripe, the card warns that its credit was already used
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_15', payment_intent: 'pi_pack_15' }];
  tg.length = 0;
  await webhook(stream({ id: 'evt_ref_15', type: 'charge.refunded', created: 1794300000, data: { object: { id: 'ch_15', payment_intent: 'pi_pack_15', amount: 19900, amount_refunded: 19900, currency: 'eur', billing_details: { name: 'Wanda Withdraw' } } } }), mkRes());
  check(tg.some((x) => /ATTENZIONE: il credito di upgrade di questo ordine è già stato usato da /.test(String(x.text || ''))), 'refunding that pack afterwards: the card says its credit was already used');
  globalThis.__stripeSessions = [];
  // a withdrawal from a pack whose credit was ALREADY used: the card warns
  const USED = serviceLeadId('cs_live_pack_16');
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Ugo Used', email: 'ugo@example.com', phone: '+34611222444', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_16', amount_total: 19900 })), mkRes());
  await webhook(stream(event(meta({ credit_from: USED, name: 'Ugo Used', email: 'ugo@example.com', phone: '+34611222444' }), { id: 'cs_live_up_16' })), mkRes());
  check(store.get('leads/' + USED).credit.usedBy === serviceLeadId('cs_live_up_16'), '(a second client upgrades: the credit of their pack is marked)');
  await post(withdraw, { name: 'Ugo Used', email: 'ugo@example.com', ref: USED, desk: 'Madrid', service: 'application-pack', requestId: 'wreq1111' + 'b'.repeat(8) });
  const cards = [...store.entries()].filter(([k, v]) => k.startsWith('agentNotifications/withdraw-') && v && /ugo@example\.com|Ugo Used/.test(JSON.stringify(v)));
  // pack and upgrade share the email and the file number: the statement matches BOTH, nothing is written, and the card says which is which
  const UP16 = serviceLeadId('cs_live_up_16');
  check(cards.length === 1 && /più ordini corrispondono \(2: /.test(cards[0][1].summary) && cards[0][1].summary.includes(`leads/${USED} madrid svc_paid · Application Pack`) && cards[0][1].summary.includes(`leads/${UP16} madrid svc_paid · Full Search`)
    && cards[0][1].summary.includes(`${UP16} è l'upgrade pagato col credito di ${USED}`) && /da abbinare a mano\. Nessuna modifica\./.test(cards[0][1].summary) && !store.get('leads/' + USED).withdrawal && !store.get('leads/' + UP16).withdrawal,
    'a withdrawal after the upgrade matches both orders: nothing is written, and the card names the pack, the upgrade and what a refund is counted on', cards.map(([, v]) => v.summary).join(' || '));
}

// ── 5c. THE OTHER DOOR: a pack holder pays Full Search in full on the desk page ──
// The order records what is owed back (city.creditDue) and the operator is told; nothing is written on the pack
// until the operator's REFUND is stamped — that refund is the act that closes the pack's credit.
{
  const TG = (re) => tg.some((x) => re.test(String(x.text || '')));
  const ORIGIN = 'https://www.boomrome.com';
  const owedKeys = () => [...store.keys()].filter((k) => k.startsWith('agentNotifications/upgrade-owed-'));
  const pack = (id, over) => webhook(stream(event({ ...meta(), kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '', ...over }, { id, amount_total: 19900 })), mkRes());
  const full = (id, over, ev = {}) => webhook(stream(event({ ...meta(), credit_from: '', credit_amount: '', credit_plan: '', amount_eur: '500', ...over }, { id, amount_total: 50000, ...ev })), mkRes());
  const refund = (evtId, pi, amount, refunded, created = 1794300000) => webhook(stream({ id: evtId, type: 'charge.refunded', created, data: { object: { id: 'ch_' + evtId, payment_intent: pi, amount, amount_refunded: refunded, currency: 'eur', billing_details: { name: 'A Payer' } } } }), mkRes());
  const sessions = (...pairs) => { globalThis.__stripeSessions = pairs.map(([id, pi]) => ({ id, payment_intent: pi })); };
  const L = (id) => store.get('leads/' + id);
  const owedAlert = (fsId) => store.get('agentNotifications/upgrade-owed-' + fsId.slice(4));

  // (a) the same person (same e-mail, same phone), no statement on the pack
  const olga = { name: 'Olga Owed', email: 'olga@example.com', phone: '+34611000001' };
  await pack('cs_live_pack_20', olga);
  const PK = serviceLeadId('cs_live_pack_20'), FS = serviceLeadId('cs_live_fs_20');
  const pkFile = L(PK).city.file;
  check(L(PK).emailKey === 'olga@example.com', 'every paid order keeps the payer\'s address in lower case (emailKey): what the other door looks for');
  emails.length = 0; tg.length = 0;
  const r = await full('cs_live_fs_20', olga);
  const fsl = L(FS);
  check(r.code === 200 && fsl && fsl.amount_eur === 500 && fsl.city.creditDue && fsl.city.creditDue.from === PK && fsl.city.creditDue.amount === 199 && fsl.city.creditDue.currency === 'eur' && fsl.city.creditDue.plan === 'application-pack'
    && fsl.city.creditDue.match === 'same' && !('statement' in fsl.city.creditDue) && fsl.creditDueFrom === PK && !fsl.city.credit && !fsl.city.creditUnverified,
    'the Full Search order paid in full records what is owed back: the pack amount (creditDue, match "same"), not a credit', fsl && JSON.stringify(fsl.city.creditDue));
  check(fsl.city.file === pkFile && fsl.city.fileLeadId === PK && /€500 paid \(€199 Application Pack credit to refund\) · file /.test(fsl.message), 'the same person keeps the pack\'s file number, and the summary says the refund that is due', fsl.message);
  const gl = await get(cityLead, { upgrade: PK, t: TOK.upgradeToken(PK) });
  check(!L(PK).credit && gl.code === 200 && gl.body.state === 'open', 'NOTHING is written on the pack at the payment: an e-mail address is not an identity (the credit closes with the operator\'s refund)', JSON.stringify(L(PK).credit || null));
  const al = owedAlert(FS);
  check(al && al.priority === 'high' && al.type === 'service.upgrade_credit_owed' && /PREZZO PIENO \(€500\)/.test(al.summary) && /stesso telefono/.test(al.summary) && /rimborsa €199 su questo pagamento/.test(al.summary)
    && /Il credito del pack si chiude da solo quando quel rimborso è segnato\./.test(al.summary) && /Il cliente lo ha letto nell'email di conferma\./.test(al.summary) && al.summary.includes(PK) && !/VERIFICA/.test(al.summary) && !/segnato come usato/.test(al.summary),
    'an urgent alert tells the operator to refund the pack amount on this payment, and that the refund is what closes the credit', al && al.summary);
  const op = emails.find((e) => e.to_email === 'valentino@boom-rome.com'), cl = emails.find((e) => e.to_email === 'olga@example.com');
  check(op && op.intro.includes(`PAID IN FULL while holding an open Application Pack credit (order ${PK}, file ${pkFile}; same phone).`) && op.intro.includes('refund €199 of this payment on Stripe') && /Terms §12\.2/.test(op.intro) && /The client read it in their confirmation\./.test(op.intro),
    'the operator email says it in words, with the order and the file', op && op.intro.slice(-330));
  check(cl && cl.closing.includes('You already paid for the Application Pack on this desk (€199): it is credited in full, so we refund €199 of this payment to the card you used. ') && /To withdraw within 14 days/.test(cl.closing) && !/upgrade\?l=/.test(cl.closing),
    'the client\'s confirmation says the pack is credited and what comes back (the durable medium), and carries no upgrade link', cl && cl.closing.slice(0, 220));
  // a Stripe retry: one order, one alert, no second email, still nothing on the pack
  const nE = emails.length, nA = owedKeys().length;
  const r2 = await full('cs_live_fs_20', olga);
  check(r2.code === 200 && r2.body && r2.body.duplicate === true && emails.length === nE && owedKeys().length === nA && !L(PK).credit, 'a Stripe retry sends nothing, rings nothing and writes nothing on the pack');
  // a withdrawal statement now: pack and full-price order share the e-mail and the file — nothing is written, and the card names the pair
  await post(withdraw, { name: 'Olga Owed', email: 'olga@example.com', ref: pkFile, desk: 'Madrid', requestId: 'wreq3333' + 'd'.repeat(8) });
  const cardO = [...store.entries()].filter(([k, v]) => k.startsWith('agentNotifications/withdraw-') && v && /olga@example\.com/.test(JSON.stringify(v)));
  check(cardO.length === 1 && /più ordini corrispondono \(2: /.test(cardO[0][1].summary) && cardO[0][1].summary.includes(`${FS} è stato pagato a prezzo pieno da chi aveva il credito di ${PK}: su ${FS} è dovuto il rimborso di quel credito`) && !L(PK).withdrawal && !L(FS).withdrawal,
    'a withdrawal statement that matches both orders writes nothing, and its card says which order the pack refund is owed on', cardO.map(([, v]) => v.summary).join(' || '));
  // the bot, before the refund: the open pack gets NO link while an order paid in full waits for its credit
  const claims = await BOT.pendingClaims(PK);
  const botPk = BOT.upgradeReply(L(PK), PK, NOW, ORIGIN, claims), botFs = BOT.upgradeReply(L(FS), FS, NOW, ORIGIN);
  check(claims.join() === FS && botPk.includes(`${FS} (pagato a prezzo pieno) aspetta il rimborso di questo credito: rimborsa lì, non mandare il link.`) && !/upgrade\?l=/.test(botPk)
    && /Pagato a prezzo pieno da chi aveva un credito aperto: su questo ordine è dovuto il rimborso di €199/.test(botFs) && /Il credito del pack si chiude quando il rimborso è segnato\. Nessun link\./.test(botFs) && !/verifica che sia la stessa persona/.test(botFs),
    'the bot: the pack with an order waiting for its credit gets no link; the full-price order says what is owed on it', botPk + ' || ' + botFs);
  check(/Non ho potuto controllare se un ordine pagato a prezzo pieno aspetta questo credito/.test(BOT.upgradeReply(L(PK), PK, NOW, ORIGIN, null)) && !/upgrade\?l=/.test(BOT.upgradeReply(L(PK), PK, NOW, ORIGIN, null)), 'and when that lookup fails the bot says so and gives no link');
  tg.length = 0;
  await BOT.handleUpgradeCommand(123, pkFile);
  check(tg.length === 2 && tg.some((x) => /aspetta il rimborso di questo credito/.test(x.text)) && tg.every((x) => !/upgrade\?l=/.test(x.text)), 'the command, by the shared file number, answers for both orders and sends no link', JSON.stringify(tg.map((x) => x.text)));

  // the operator's refunds on THAT payment
  sessions(['cs_live_fs_20', 'pi_fs_20'], ['cs_live_pack_20', 'pi_pack_20']);
  tg.length = 0;
  await refund('evt_ref_20a', 'pi_fs_20', 50000, 5000, 1794300000);
  check(TG(/RIMBORSO parziale: €50/) && TG(new RegExp('segnato rimborsato — su questo ordine è dovuto il rimborso del credito di ' + PK + ' \\(€199\\): questo rimborso è inferiore, il credito di quel pack resta aperto\\.')) && !L(PK).credit,
    'a refund smaller than the credit is not the credit: the card says so and the pack keeps it', JSON.stringify(tg.map((x) => x.text)));
  tg.length = 0;
  const rr = await refund('evt_ref_20', 'pi_fs_20', 50000, 19900, 1794310000);
  check(rr.code === 200 && TG(/RIMBORSO parziale: €199/) && TG(new RegExp('segnato rimborsato — era il rimborso del credito di ' + PK + ' \\(€199\\): il credito di quel pack è chiuso\\.'))
    && L(PK).credit && L(PK).credit.usedBy === FS && L(PK).credit.via === 'full-price' && L(PK).credit.amount === 199 && L(PK).credit.currency === 'eur' && L(FS).refundedAmount === 199,
    'the €199 refunded on that payment IS the act: the pack\'s credit is closed (used by that order, via "full-price"), and the card says so', JSON.stringify(tg.map((x) => x.text)));
  const gl2 = await get(cityLead, { upgrade: PK, t: TOK.upgradeToken(PK) });
  const nS = (globalThis.__stripeCalls || []).length;
  const pl = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: PK, t: TOK.upgradeToken(PK) } });
  check(gl2.code === 410 && gl2.body.state === 'used' && pl.code === 410 && (globalThis.__stripeCalls || []).length === nS, 'from then on the personal link answers 410 "used" and opens no till');
  tg.length = 0;
  const rr2 = await refund('evt_ref_20', 'pi_fs_20', 50000, 19900, 1794310000);
  check(rr2.body.duplicate === true && tg.length === 0 && L(PK).credit.usedBy === FS, 'a retry of that refund event rings nothing and keeps the mark');
  tg.length = 0;
  await refund('evt_ref_20c', 'pi_fs_20', 50000, 50000, 1794320000);
  check(TG(/RIMBORSO totale: €500/) && TG(new RegExp('il credito di ' + PK + ' \\(€199\\) era già stato rimborsato su questo ordine: quel credito resta chiuso')) && L(PK).credit.usedBy === FS && (await BOT.pendingClaims(PK)).length === 0,
    'the rest refunded later (the search declined): the credit that already went back stays closed', JSON.stringify(tg.map((x) => x.text)));
  tg.length = 0;
  await refund('evt_ref_21', 'pi_pack_20', 19900, 19900, 1794330000);
  check(TG(new RegExp('ATTENZIONE: il credito di questo ordine è già stato rimborsato sull\'ordine ' + FS + ', pagato a prezzo pieno: un rimborso di questo pack è un secondo rimborso dello stesso credito')),
    'and if the PACK is refunded as well, the card says it is a second refund of the same credit', JSON.stringify(tg.map((x) => x.text)));
  check(/Il credito è già stato rimborsato sull'ordine .*, pagato a prezzo pieno\. Nessun link\./.test(BOT.upgradeReply(L(PK), PK, NOW, ORIGIN)), 'the bot says the pack\'s credit was refunded on the full-price order');

  // (a2) the WHOLE order refunded in one go: nothing was credited, the pack keeps its credit
  const nina = { name: 'Nina Whole', email: 'ninaw@example.com', phone: '+34611000021' };
  await pack('cs_live_pack_21', nina); await full('cs_live_fs_21', nina);
  const P21 = serviceLeadId('cs_live_pack_21');
  sessions(['cs_live_fs_21', 'pi_fs_21']);
  tg.length = 0;
  await refund('evt_ref_22', 'pi_fs_21', 50000, 50000);
  check(TG(new RegExp('rimborso totale: il credito di ' + P21 + ' \\(€199\\) che era dovuto su questo ordine non lo è più — quel pack tiene il suo credito')) && !L(P21).credit && (await get(cityLead, { upgrade: P21, t: TOK.upgradeToken(P21) })).code === 200,
    'a full refund of the order returns everything: the credit is no longer owed there and the pack keeps it (its link still opens)', JSON.stringify(tg.map((x) => x.text)));

  // (b) only the e-mail matches (another phone, another name): record, ask the operator to verify, promise nothing
  await pack('cs_live_pack_37', { name: 'Mara Match', email: 'mara@example.com', phone: '+34611000107' });
  const P37 = serviceLeadId('cs_live_pack_37'), F37 = serviceLeadId('cs_live_fs37stranger');
  emails.length = 0;
  await full('cs_live_fs37stranger', { name: 'Someone Else', email: 'mara@example.com', phone: '+34611000199' });
  const f37 = L(F37), al37 = owedAlert(F37);
  const op37 = emails.find((e) => e.to_email === 'valentino@boom-rome.com'), cl37 = emails.find((e) => e.to_email === 'mara@example.com');
  check(f37.city.creditDue && f37.city.creditDue.from === P37 && f37.city.creditDue.match === 'check' && f37.city.file !== L(P37).city.file && f37.city.fileLeadId === null && /€199 Application Pack credit to check/.test(f37.message) && !L(P37).credit,
    'another phone on the same e-mail: the credit is recorded as "check", the order takes its OWN file number, and the holder\'s pack is untouched', JSON.stringify(f37.city.creditDue));
  const paid37 = await get(cityLead, { paid: 'cs_live_fs37stranger', city: 'madrid' });
  check(paid37.code === 200 && paid37.body.paid === true && paid37.body.file === f37.city.file && paid37.body.file !== L(P37).city.file, 'the payer\'s return page shows the order\'s own file, never the pack holder\'s', JSON.stringify(paid37.body));
  check(al37 && /con l'email di chi ha un Application Pack col credito aperto/.test(al37.summary) && /il telefono non coincide e i nomi sono diversi \(«Mara Match» \/ «Someone Else»\): VERIFICA che sia la stessa persona prima di rimborsare\./.test(al37.summary)
    && /Al cliente non ho promesso niente per iscritto\./.test(al37.summary) && !/stesso telefono/.test(al37.summary) && !/Il cliente lo ha letto/.test(al37.summary),
    'the alert tells the operator to VERIFY the person before refunding, and that nothing was promised', al37 && al37.summary);
  check(cl37 && !/You already paid for the Application Pack/.test(cl37.closing) && !/refund €199/.test(cl37.closing) && !/credited in full/.test(cl37.closing) && op37 && /VERIFY it is the same person before refunding\./.test(op37.intro) && /Nothing was promised to the client in writing\./.test(op37.intro),
    'the automatic confirmation promises no refund on an e-mail match alone; the operator e-mail carries the same caution', cl37 && cl37.closing.slice(0, 160));
  check((await get(cityLead, { upgrade: P37, t: TOK.upgradeToken(P37) })).code === 200 && /prima verifica che sia la stessa persona: il telefono non coincide/.test(BOT.upgradeReply(f37, F37, NOW, ORIGIN)), 'the holder\'s own link still opens, and the bot repeats the caution on the full-price order');

  // (c) a withdrawal statement is on file for the pack: ONE refund is due, not two
  const sara = { name: 'Sara Statement', email: 'sara@example.com', phone: '+34611000120' };
  await pack('cs_live_pack_22', sara);
  const P22 = serviceLeadId('cs_live_pack_22'), F22 = serviceLeadId('cs_live_fs_22');
  await post(withdraw, { name: 'Sara Statement', email: 'sara@example.com', ref: L(P22).city.file, desk: 'Madrid', service: 'application-pack', requestId: 'wreq4444' + 'e'.repeat(8) });
  check(!!L(P22).withdrawal, '(a withdrawal statement is on file for a pack)');
  emails.length = 0;
  await full('cs_live_fs_22', sara);
  const al22 = owedAlert(F22), cl22 = emails.find((e) => e.to_email === 'sara@example.com'), op22 = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  check(L(F22).city.creditDue.statement === true && L(F22).city.creditDue.match === 'same' && /€199 Application Pack credit to check/.test(L(F22).message)
    && al22 && /dichiarazione di recesso non ancora rimborsata: rimborsa UNA volta sola — o il pack \(recesso\) o €199 su questo pagamento \(credito\), mai entrambi\./.test(al22.summary) && /Al cliente non ho promesso niente per iscritto\./.test(al22.summary)
    && cl22 && !/You already paid for the Application Pack/.test(cl22.closing) && !/refund €199/.test(cl22.closing) && op22 && /refund ONCE — the pack \(withdrawal\) or €199 of this payment \(the credit\), never both\./.test(op22.intro),
    'a pack with a withdrawal statement on file: the alert and the operator e-mail say ONE refund, and the client is promised nothing', al22 && al22.summary);
  sessions(['cs_live_pack_22', 'pi_pack_22'], ['cs_live_fs_22', 'pi_fs_22']);
  tg.length = 0;
  await refund('evt_ref_23', 'pi_pack_22', 19900, 19900);
  check(TG(new RegExp('segnato rimborsato — il credito di upgrade di questo ordine non vale più\\. ATTENZIONE: ' + F22 + ' \\(pagato a prezzo pieno\\) aspettava il rimborso di questo credito: ora NON è più dovuto — non rimborsarlo anche là\\.')),
    'the pack refunded first (the withdrawal): its card names the order that was waiting for the credit and says it is no longer due there', JSON.stringify(tg.map((x) => x.text)));
  tg.length = 0;
  await refund('evt_ref_24', 'pi_fs_22', 50000, 19900);
  check(TG(new RegExp('ATTENZIONE: il pack ' + P22 + ' risulta già rimborsato: il suo credito non era più dovuto — se questo rimborso era il credito, è un secondo rimborso dello stesso pack')) && !L(P22).credit,
    '…and if €199 goes back on the Full Search all the same, the card says it is a second refund of the same pack (nothing is marked)', JSON.stringify(tg.map((x) => x.text)));
  // a pack refunded when the question "is an order waiting for this credit?" cannot be asked: the card says so
  const zed = { name: 'Zed Query', email: 'zed@example.com', phone: '+34611000147' };
  await pack('cs_live_pack_47', zed);
  sessions(['cs_live_pack_47', 'pi_pack_47']);
  hooks.failQueries = 1; tg.length = 0;
  await refund('evt_ref_47', 'pi_pack_47', 19900, 19900);
  hooks.failQueries = 0;
  check(TG(/il credito di upgrade di questo ordine non vale più \(non ho potuto controllare se un ordine pagato a prezzo pieno aspettava il rimborso di questo credito\)\./), 'a failed lookup of the waiting orders is said on the card, never passed off as "none"', JSON.stringify(tg.map((x) => x.text)));

  // (d) a lookup that FAILS is not "no credit": the order says so and the operator checks by hand
  const fay1 = { name: 'Fay Lookup', email: 'fayl@example.com', phone: '+34611000123' };
  await pack('cs_live_pack_23', fay1);
  const F23 = serviceLeadId('cs_live_fs_23');
  hooks.failQueries = 99; emails.length = 0;
  const rF = await full('cs_live_fs_23', fay1);
  hooks.failQueries = 0;
  const chk = store.get('agentNotifications/upgrade-check-' + F23.slice(4));
  const op23 = emails.find((e) => e.to_email === 'valentino@boom-rome.com'), cl23 = emails.find((e) => e.to_email === 'fayl@example.com');
  check(rF.code === 200 && L(F23) && L(F23).city.creditUnverified === true && !L(F23).city.creditDue && /earlier orders NOT checked/.test(L(F23).message) && chk && chk.priority === 'high' && /NON ho potuto leggere gli ordini precedenti/.test(chk.summary)
    && op23 && /Could NOT read this payer's earlier orders on this desk/.test(op23.intro) && cl23 && !/You already paid for the Application Pack/.test(cl23.closing) && !/refund €199/.test(cl23.closing) && !L(serviceLeadId('cs_live_pack_23')).credit,
    'a failed lookup: the order is written with creditUnverified, an urgent card asks the operator to check by hand, and the client is promised nothing', chk && chk.summary);
  check(/Al pagamento non ho potuto leggere gli ordini precedenti/.test(BOT.upgradeReply(L(F23), F23, NOW, ORIGIN)), 'the bot repeats it on that order');
  const fay2 = { name: 'Fay Retry', email: 'fayr@example.com', phone: '+34611000124' };
  await pack('cs_live_pack_24', fay2);
  hooks.failQueries = 1;
  await full('cs_live_fs_24', fay2);
  check(hooks.failQueries === 0 && L(serviceLeadId('cs_live_fs_24')).city.creditDue && !L(serviceLeadId('cs_live_fs_24')).city.creditUnverified, 'one failing read is retried: the credit is found');
  // a list cut at its limit is a lookup that did not finish (no silent cap); one row less is a complete answer
  for (let i = 0; i < 50; i++) seed('city_lots' + String(i).padStart(4, '0') + 'aaaa', { intent: 'city_search', market: 'madrid', email: 'lots@example.com', emailKey: 'lots@example.com', createdAt: new Date(NOW - DAY).toISOString() });
  for (let i = 0; i < 49; i++) seed('city_some' + String(i).padStart(4, '0') + 'aaaa', { intent: 'city_search', market: 'madrid', email: 'some@example.com', emailKey: 'some@example.com', createdAt: new Date(NOW - DAY).toISOString() });
  await full('cs_live_fs_25', { name: 'Lots Leads', email: 'lots@example.com', phone: '+34611000125' });
  await full('cs_live_fs_26', { name: 'Some Leads', email: 'some@example.com', phone: '+34611000126' });
  check(L(serviceLeadId('cs_live_fs_25')).city.creditUnverified === true && store.has('agentNotifications/upgrade-check-' + serviceLeadId('cs_live_fs_25').slice(4))
    && !L(serviceLeadId('cs_live_fs_26')).city.creditUnverified && !L(serviceLeadId('cs_live_fs_26')).city.creditDue && hooks.queries.filter((q) => q.field === 'emailKey').length > 10 && hooks.queries.filter((q) => q.field === 'emailKey').every((q) => q.limit === 50),
    'a list that comes back full (50 rows) counts as a failed lookup; 49 rows is an answer');

  // (e) the address: any capitals since emailKey; the three forms for orders from before it
  await pack('cs_live_pack_36', { name: 'Eva Rossi', email: 'Eva.Rossi@Example.com', phone: '+34611000106' });
  await full('cs_live_fs_36', { name: 'Eva Rossi', email: 'eva.rossi@example.com', phone: '+34611000106' });
  await pack('cs_live_pack_36b', { name: 'Cora Case', email: 'cora@example.com', phone: '+34611000116' });
  await full('cs_live_fs_36b', { name: 'Cora Case', email: 'CORA@EXAMPLE.COM', phone: '+34611000116' });
  check(L(serviceLeadId('cs_live_fs_36')).city.creditDue && L(serviceLeadId('cs_live_fs_36')).city.creditDue.from === serviceLeadId('cs_live_pack_36')
    && L(serviceLeadId('cs_live_fs_36b')).city.creditDue && L(serviceLeadId('cs_live_fs_36b')).city.creditDue.from === serviceLeadId('cs_live_pack_36b'),
    'the same address in any capitals is the same address, in both directions (emailKey)');
  const legacy = (id, email, phone) => seed(id, apLead({ name: 'Leg Acy', email, phone, city: { ...apLead().city, file: 'BM LEGAC' } }));
  legacy('svc_cslivelegacytyped001', 'MiXed@example.com', '+34611000131');
  legacy('svc_cslivelegacylower001', 'low@example.com', '+34611000132');
  legacy('svc_cslivelegacycap00001', 'Cap@example.com', '+34611000133');
  await full('cs_live_fs_31t', { name: 'Leg Acy', email: 'MiXed@example.com', phone: '+34611000131' });
  await full('cs_live_fs_32l', { name: 'Leg Acy', email: 'LOW@example.com', phone: '+34611000132' });
  await full('cs_live_fs_33c', { name: 'Leg Acy', email: 'cap@example.com', phone: '+34611000133' });
  const dueOf = (sid) => (L(serviceLeadId(sid)).city.creditDue || {}).from;
  check(!('emailKey' in L('svc_cslivelegacytyped001')) && dueOf('cs_live_fs_31t') === 'svc_cslivelegacytyped001' && dueOf('cs_live_fs_32l') === 'svc_cslivelegacylower001' && dueOf('cs_live_fs_33c') === 'svc_cslivelegacycap00001',
    'an order from before emailKey is found by the address as typed, in lower case, or with a capital first letter (each form on its own)', [dueOf('cs_live_fs_31t'), dueOf('cs_live_fs_32l'), dueOf('cs_live_fs_33c')].join());

  // (f) the clock is the PAYMENT's (the event's time), not the delivery's
  const lia = { name: 'Lia Late', email: 'lia@example.com', phone: '+34611000140' };
  seed('svc_cslivepackpaidlong01', apLead({ ...lia, paid_at: new Date(NOW - 40 * DAY).toISOString(), createdAt: new Date(NOW - 40 * DAY).toISOString(), city: { ...apLead().city, file: 'BM LATEE' } }));
  await full('cs_live_fs_40', lia, { created: Math.floor((NOW - 30 * DAY) / 1000) });
  await full('cs_live_fs_40n', lia);
  check(dueOf('cs_live_fs_40') === 'svc_cslivepackpaidlong01' && !L(serviceLeadId('cs_live_fs_40n')).city.creditDue,
    'a payment made while the credit was open is owed its refund even when Stripe delivers the event after the deadline; a payment made after it is not');
  const paula = { name: 'Paula Post', email: 'paula@example.com', phone: '+34611000141' };
  seed('svc_cslivepackboughtlate1', apLead({ ...paula, city: { ...apLead().city, file: 'BM PAULA' } }));
  const b41 = owedKeys().length;
  await full('cs_live_fs_41', paula, { created: Math.floor((NOW - 3 * DAY) / 1000) });
  check(!L(serviceLeadId('cs_live_fs_41')).city.creditDue && owedKeys().length === b41, 'a pack bought AFTER the payment is not a credit that payment held');

  // (g) a second delivery never looks the payer up again: the ORDER says what the payment owed
  const rita = { name: 'Rita Retry', email: 'rita@example.com', phone: '+34611000109' };
  await pack('cs_live_pack_39', rita);
  const P39 = serviceLeadId('cs_live_pack_39'), F39 = serviceLeadId('cs_live_fs_39');
  await full('cs_live_fs_39', rita);
  store.delete('agentNotifications/upgrade-owed-' + F39.slice(4));                                   // the first run died before ringing
  store.set('leads/' + P39, { ...L(P39), credit: { usedBy: 'svc_cslivelinkupgrade39', usedAt: 'x', amount: 199, currency: 'eur' } }); bump('leads/' + P39);   // spent through the link meanwhile
  seed('svc_cslivesecondpack0039', apLead({ ...rita, city: { ...apLead().city, file: 'BM RITA2' } }));   // and a second open pack under the same e-mail
  const r39 = await full('cs_live_fs_39', rita);
  const al39 = owedAlert(F39);
  check(r39.body.duplicate === true && al39 && al39.summary.includes(P39) && !al39.summary.includes('svc_cslivesecondpack0039') && L(F39).city.creditDue.from === P39 && !L('svc_cslivesecondpack0039').credit && L(P39).credit.usedBy === 'svc_cslivelinkupgrade39',
    'a retry after a first run that died before ringing: the alert rings from what the ORDER recorded — another open pack under that e-mail is not touched or named', al39 && al39.summary);
  const nora = { name: 'Nora Nopack', email: 'nora@example.com', phone: '+34611000142' };
  await full('cs_live_fs_42', nora);
  await pack('cs_live_pack_42', nora);
  const b42 = owedKeys().length;
  const r42 = await full('cs_live_fs_42', nora);
  check(r42.body.duplicate === true && owedKeys().length === b42 && !L(serviceLeadId('cs_live_fs_42')).city.creditDue && !L(serviceLeadId('cs_live_pack_42')).credit,
    'a Full Search paid with no pack, a pack bought later, the Full Search event delivered again: nothing is owed and the new pack is not touched');
  // the link path, delivered again after its pack was refunded: it had spent the credit while it was open
  const lena = { name: 'Lena Link', email: 'lenal@example.com', phone: '+34611000143' };
  await pack('cs_live_pack_43', lena);
  const P43 = serviceLeadId('cs_live_pack_43'), U43 = serviceLeadId('cs_live_up_43');
  await webhook(stream(event(meta({ credit_from: P43, ...lena }), { id: 'cs_live_up_43' })), mkRes());
  sessions(['cs_live_pack_43', 'pi_pack_43']);
  await refund('evt_ref_43', 'pi_pack_43', 19900, 19900);
  const r43 = await webhook(stream(event(meta({ credit_from: P43, ...lena }), { id: 'cs_live_up_43' })), mkRes());
  check(r43.code === 200 && r43.body.duplicate === true && !store.has('agentNotifications/upgrade-void-' + U43.slice(4)) && L(P43).credit.usedBy === U43,
    'an upgrade delivered again after its pack was refunded is not called "a credit that was not due"');

  // (h) the settle never writes over another order's mark, and writes under the version it read
  const gus = { name: 'Gus Guard', email: 'gus@example.com', phone: '+34611000144' };
  await pack('cs_live_pack_44', gus); await full('cs_live_fs_44', gus);
  const P44 = serviceLeadId('cs_live_pack_44');
  store.set('leads/' + P44, { ...L(P44), credit: { usedBy: 'svc_cslivelinkupgrade44', usedAt: 'x', amount: 199, currency: 'eur' } }); bump('leads/' + P44);
  sessions(['cs_live_fs_44', 'pi_fs_44']);
  tg.length = 0;
  await refund('evt_ref_44', 'pi_fs_44', 50000, 19900);
  check(TG(new RegExp('ATTENZIONE: il credito di ' + P44 + ' risulta già usato da svc_cslivelinkupgrade44: su questo ordine non era più dovuto — se questo rimborso era il credito, è un doppione')) && L(P44).credit.usedBy === 'svc_cslivelinkupgrade44' && !L(P44).credit.via,
    'a credit spent through the link before the refund: the settle never writes over that mark, and the card says the refund was not due', JSON.stringify(tg.map((x) => x.text)));
  const hal = { name: 'Hal Race', email: 'hal@example.com', phone: '+34611000145' };
  await pack('cs_live_pack_45', hal); await full('cs_live_fs_45', hal);
  const P45 = serviceLeadId('cs_live_pack_45');
  sessions(['cs_live_fs_45', 'pi_fs_45']);
  hooks.beforeCommit = (k) => { if (k === 'leads/' + P45) { hooks.beforeCommit = null; store.set(k, { ...L(P45), credit: { usedBy: 'svc_csliveraceupgrade45', usedAt: 'x', amount: 199, currency: 'eur' } }); bump(k); } };
  tg.length = 0;
  const r45 = await refund('evt_ref_45', 'pi_fs_45', 50000, 19900);
  hooks.beforeCommit = null;
  check(r45.code === 200 && L(P45).credit.usedBy === 'svc_csliveraceupgrade45' && TG(/risulta già usato da svc_csliveraceupgrade45/),
    'a link upgrade that lands between the settle\'s read and its write is not overwritten (the mark is written under the version just read)', JSON.stringify(L(P45).credit));
  // a mark that cannot be written: 500, so Stripe delivers the refund again; the redelivery closes the credit and says so
  const ida = { name: 'Ida Fail', email: 'ida@example.com', phone: '+34611000146' };
  await pack('cs_live_pack_46', ida); await full('cs_live_fs_46', ida);
  const P46 = serviceLeadId('cs_live_pack_46'), F46 = serviceLeadId('cs_live_fs_46');
  sessions(['cs_live_fs_46', 'pi_fs_46']);
  hooks.failCommits = { path: 'leads/' + P46, times: 3 };
  tg.length = 0;
  const r46 = await refund('evt_ref_46', 'pi_fs_46', 50000, 19900);
  const n46 = store.get('agentNotifications/stripe-evt_ref_46');
  check(r46.code === 500 && r46.body.error === 'order_stamp_failed' && !L(P46).credit && L(F46).refundedAmount === 199 && TG(/non sono riuscito a chiudere il credito del pack/) && n46 && n46.stampFailed === true && n46.priority === 'high',
    'a credit that cannot be closed (three failed writes) is answered 500, with the order already stamped and the operator told', JSON.stringify(r46.body));
  tg.length = 0;
  const r46b = await refund('evt_ref_46', 'pi_fs_46', 50000, 19900);
  const n46b = store.get('agentNotifications/stripe-evt_ref_46');
  check(r46b.code === 200 && L(P46).credit && L(P46).credit.usedBy === F46 && tg.length === 1 && TG(/✅ Ordine .*era il rimborso del credito di .*il credito di quel pack è chiuso\. La prima consegna di questo evento non c'era riuscita: ora è a posto\./) && n46b.stampFailed === false && !!n46b.repairedAt,
    'the redelivery closes the credit, tells the operator once and repairs the stored record', JSON.stringify(tg.map((x) => x.text)));
  sessions(['cs_live_fs_44', 'pi_fs_44']);
  hooks.failGets = { path: 'leads/' + serviceLeadId('cs_live_pack_44'), times: 1 };
  const r44b = await refund('evt_ref_44b', 'pi_fs_44', 50000, 25000, 1794400000);
  hooks.failGets = null;
  check(r44b.code === 500, 'a pack that cannot be READ when the refund lands is answered 500 too (never "no pack")');
  globalThis.__stripeSessions = [];

  // who is NOT found: another desk's pack, an expired pack, a refunded pack, a disputed pack
  const none = async (label, packOver, seedOver, fsOver, idn) => {
    await pack('cs_live_pack_' + idn, packOver);
    const pid = serviceLeadId('cs_live_pack_' + idn);
    if (seedOver) { store.set('leads/' + pid, { ...L(pid), ...seedOver }); bump('leads/' + pid); }
    const before = owedKeys().length;
    await full('cs_live_fs_' + idn, fsOver);
    const f = L(serviceLeadId('cs_live_fs_' + idn));
    check(f && !f.city.creditDue && !f.creditDueFrom && owedKeys().length === before && !L(pid).credit, label, f && JSON.stringify(f.city.creditDue || null));
  };
  const who = (i) => ({ name: 'Nina None' + i, email: `nina${i}@example.com`, phone: '+3461100010' + i });
  await none('a pack on ANOTHER desk is not this desk\'s credit', { ...who(1), city: 'amsterdam', market: 'amsterdam' }, null, who(1), 31);
  await none('an expired pack (Madrid, 40 days ago) owes nothing', who(2), { paid_at: new Date(NOW - 40 * DAY).toISOString() }, who(2), 32);
  await none('a refunded pack owes nothing', who(3), { refundedAt: new Date(NOW).toISOString(), refundedAmount: 199 }, who(3), 33);
  await none('a disputed pack owes nothing', who(4), { disputedAt: new Date(NOW).toISOString() }, who(4), 34);
  // an Attended Viewing paid by a pack holder is not the plan a credit leads to (and Madrid stacks freely: no lookup at all)
  await pack('cs_live_pack_35', who(5));
  const b35 = owedKeys().length, q35 = hooks.queries.length;
  await webhook(stream(event({ ...meta(), ...who(5), kind: 'attended-viewing', credit_from: '', credit_amount: '', credit_plan: '', amount_eur: '149' }, { id: 'cs_live_av_35', amount_total: 14900 })), mkRes());
  check(owedKeys().length === b35 && !L(serviceLeadId('cs_live_pack_35')).credit && hooks.queries.length === q35, 'an Attended Viewing bought by a pack holder touches no credit (Madrid: the payer\'s orders are not even read)');
  // Berlin: a pack paid 40 days ago and a Full Search paid in full — no deadline there (Terms §12.5)
  await pack('cs_live_pack_38', { name: 'Bert Berlin', email: 'bert@example.com', phone: '+4915100000038', city: 'berlin', market: 'berlin' });
  const P38 = serviceLeadId('cs_live_pack_38');
  store.set('leads/' + P38, { ...L(P38), paid_at: new Date(NOW - 40 * DAY).toISOString() }); bump('leads/' + P38);
  await full('cs_live_fs_38', { name: 'Bert Berlin', email: 'bert@example.com', phone: '+4915100000038', city: 'berlin', market: 'berlin' });
  const f38 = L(serviceLeadId('cs_live_fs_38'));
  check(f38 && f38.city.creditDue && f38.city.creditDue.from === P38 && f38.city.creditDue.match === 'same' && !L(P38).credit, 'Berlin, pack paid 40 days ago, Full Search paid in full: the pack amount is owed back (no pack on top of a Full Search, Terms §12.5)');
}

// ── 5c-bis. BERLIN (Terms §12.5): a pack or a viewing paid by someone who already holds a Full Search there ──
{
  const ORIGIN = 'https://www.boomrome.com';
  const L = (id) => store.get('leads/' + id);
  const stackKeys = () => [...store.keys()].filter((k) => k.startsWith('agentNotifications/upgrade-stack-'));
  const order = (id, kind, amount, who, city = 'berlin') => webhook(stream(event({ ...meta(), ...who, kind, city, market: city, credit_from: '', credit_amount: '', credit_plan: '', amount_eur: String(amount) }, { id, amount_total: amount * 100 })), mkRes());
  const stef = { name: 'Stef Stack', email: 'stef@example.com', phone: '+4915100000070' };
  await order('cs_live_fs_70', 'full-search', 500, stef);
  const FS70 = serviceLeadId('cs_live_fs_70'), AV70 = serviceLeadId('cs_live_av_70'), PK70 = serviceLeadId('cs_live_pack_70');
  emails.length = 0;
  const ra = await order('cs_live_av_70', 'attended-viewing', 149, stef);
  const av = L(AV70), alA = store.get('agentNotifications/upgrade-stack-' + AV70.slice(4));
  const opA = emails.find((e) => e.to_email === 'valentino@boom-rome.com'), clA = emails.find((e) => e.to_email === 'stef@example.com');
  check(ra.code === 200 && av.city.stackedOn && av.city.stackedOn.from === FS70 && av.city.stackedOn.match === 'same' && /€149 paid \(on top of a Full Search: check\)/.test(av.message),
    'Berlin: an Attended Viewing paid by a Full Search client is recorded on the order (stackedOn)', JSON.stringify(av.city.stackedOn || null));
  check(alA && alA.priority === 'high' && alA.type === 'service.stacked_on_full_search' && alA.summary.includes(`Attended Viewing pagato (€149) da chi ha già un Full Search su questo desk (${FS70}`) && /I Termini §12\.5 non fanno pagare altro accanto a un Full Search: se quella ricerca è ancora in corso, rimborsa questo pagamento per intero\./.test(alA.summary) && /Al cliente non ho promesso niente per iscritto\./.test(alA.summary),
    'and the operator is told to refund it if that search is still running (Terms §12.5) — nothing is promised to the client', alA && alA.summary);
  check(opA && /This client already holds a paid Full Search on this desk \(order /.test(opA.intro) && /Terms §12\.5 charge nothing else alongside it — if that search is still running, refund this payment in full\./.test(opA.intro) && clA && !/refund this payment/.test(clA.closing),
    'the operator e-mail says it too; the client\'s confirmation is the usual one', opA && opA.intro.slice(-300));
  emails.length = 0;
  await order('cs_live_pack_70', 'application-pack', 199, stef);
  const clP = emails.find((e) => e.to_email === 'stef@example.com'), opP = emails.find((e) => e.to_email === 'valentino@boom-rome.com');
  check(L(PK70).city.stackedOn && L(PK70).city.stackedOn.from === FS70 && store.has('agentNotifications/upgrade-stack-' + PK70.slice(4)) && clP && !/Your personal link/.test(clP.closing) && !/move to Full Search/.test(clP.closing) && opP && !/upgrade\?l=/.test(opP.closing),
    'a pack paid by a Full Search client: recorded, rung, and its confirmation does not invite them to "move to Full Search"', clP && clP.closing.slice(0, 160));
  const botAv = BOT.upgradeReply(av, AV70, NOW, ORIGIN), botPk = BOT.upgradeReply(L(PK70), PK70, NOW, ORIGIN);
  check(/Pagato avendo già un Full Search su questo desk/.test(botAv) && /§12\.5/.test(botAv) && /Nessun link: ha già il Full Search\./.test(botPk) && !/upgrade\?l=/.test(botPk), 'the bot says it on both orders and gives the pack no link', botPk);
  // another phone on the same e-mail: verify the person first
  await order('cs_live_av_71', 'attended-viewing', 149, { ...stef, name: 'Other Person', phone: '+4915100000099' });
  const al71 = store.get('agentNotifications/upgrade-stack-' + serviceLeadId('cs_live_av_71').slice(4));
  check(L(serviceLeadId('cs_live_av_71')).city.stackedOn.match === 'check' && al71 && /con l'email di chi ha già un Full Search/.test(al71.summary) && /prima verifica che sia la stessa persona \(il telefono non coincide\)/.test(al71.summary), 'another phone on that e-mail: the card asks to verify the person first', al71 && al71.summary);
  // a retry after a first run that died before ringing: from what the order recorded
  store.delete('agentNotifications/upgrade-stack-' + AV70.slice(4));
  const ra2 = await order('cs_live_av_70', 'attended-viewing', 149, stef);
  check(ra2.body.duplicate === true && store.has('agentNotifications/upgrade-stack-' + AV70.slice(4)), 'a Stripe retry rings the card again from the stored order');
  // who is NOT flagged: Madrid (stacking is allowed there), a Full Search refunded in full, a first order
  const b = stackKeys().length;
  const mad = { name: 'Mado Stack', email: 'mado@example.com', phone: '+34611000170' };
  await order('cs_live_fs_72', 'full-search', 500, mad, 'madrid');
  await order('cs_live_av_72', 'attended-viewing', 149, mad, 'madrid');
  const ref = { name: 'Rolf Refunded', email: 'rolf@example.com', phone: '+4915100000073' };
  await order('cs_live_fs_73', 'full-search', 500, ref);
  store.set('leads/' + serviceLeadId('cs_live_fs_73'), { ...L(serviceLeadId('cs_live_fs_73')), refundedAt: 'x', refundedAmount: 500, refundedFull: true }); bump('leads/' + serviceLeadId('cs_live_fs_73'));
  await order('cs_live_av_73', 'attended-viewing', 149, ref);
  await order('cs_live_av_74', 'attended-viewing', 149, { name: 'Nell New', email: 'nell@example.com', phone: '+4915100000074' });
  check(stackKeys().length === b && !L(serviceLeadId('cs_live_av_72')).city.stackedOn && !L(serviceLeadId('cs_live_av_73')).city.stackedOn && !L(serviceLeadId('cs_live_av_74')).city.stackedOn,
    'not flagged: the same pair in Madrid (no such term there), a Full Search refunded in full, a client with no Full Search');
  // the lookup that fails on a Berlin viewing: said, never "no Full Search"
  hooks.failQueries = 99;
  await order('cs_live_av_75', 'attended-viewing', 149, { name: 'Uwe Unknown', email: 'uwe@example.com', phone: '+4915100000075' });
  hooks.failQueries = 0;
  check(L(serviceLeadId('cs_live_av_75')).city.creditUnverified === true && /un Full Search già in corso vuol dire che questo pagamento non era dovuto \(§12\.5\)/.test(store.get('agentNotifications/upgrade-check-' + serviceLeadId('cs_live_av_75').slice(4)).summary),
    'a failed lookup on a Berlin viewing is recorded and rung for a check by hand');
}

// ── 5d. A dispute is stamped on the order: the credit is suspended, and comes back only if it is won ──
{
  const TG = (re) => tg.some((x) => re.test(String(x.text || '')));
  const dsp = (id, type, pi, status, created = 1794500000) => ({ id, type, created, data: { object: { id: 'dp_' + id, payment_intent: pi, amount: 19900, currency: 'eur', reason: 'fraudulent', status, evidence_details: { due_by: 1795000000 } } } });
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Dora Dispute', email: 'dora@example.com', phone: '+34611000201', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_40', amount_total: 19900 })), mkRes());
  const D = serviceLeadId('cs_live_pack_40'), t = TOK.upgradeToken(D);
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_40', payment_intent: 'pi_pack_40' }];
  tg.length = 0;
  const r1 = await webhook(stream(dsp('evt_dsp_1', 'charge.dispute.created', 'pi_pack_40', 'needs_response')), mkRes());
  const d1 = store.get('leads/' + D);
  check(r1.code === 200 && d1.disputedAt === new Date(1794500000 * 1000).toISOString() && d1.disputeStatus === 'needs_response' && d1.paid === true, 'a dispute is stamped on the paid order (disputedAt, its status) and nothing else changes');
  const g1 = await get(cityLead, { upgrade: D, t });
  const nS = (globalThis.__stripeCalls || []).length;
  const p1 = await post(checkout, { city: 'madrid', kind: 'full-search', upgrade: { lead: D, t } });
  check(g1.code === 410 && g1.body.state === 'void' && g1.body.reason === 'disputed' && p1.code === 410 && (globalThis.__stripeCalls || []).length === nS, 'while the payment is disputed the link answers 410 and the till opens no session');
  check(TG(/CONTESTAZIONE \(dispute\): €199/) && TG(new RegExp('Ordine ' + D + ' \\(Madrid · Application Pack · BM [A-Z2-9]{5}\\): pagamento contestato — il credito di upgrade di questo ordine è sospeso finché la contestazione non è vinta\\.')), 'the operator\'s card names the order and says the credit is suspended', JSON.stringify(tg.map((x) => x.text)));
  // lost: the stamp stays
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_2', 'charge.dispute.closed', 'pi_pack_40', 'lost', 1794600000)), mkRes());
  check(store.get('leads/' + D).disputedAt && store.get('leads/' + D).disputeStatus === 'lost' && (await get(cityLead, { upgrade: D, t })).code === 410 && TG(/Dispute PERSA/) && TG(/contestazione chiusa — il credito di upgrade di questo ordine è sospeso/), 'a lost dispute keeps the credit closed');
  // won: the money is BOOM's again, and so is the credit
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Wendy Won', email: 'wendy@example.com', phone: '+34611000202', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_41', amount_total: 19900 })), mkRes());
  const W = serviceLeadId('cs_live_pack_41');
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_41', payment_intent: 'pi_pack_41' }];
  await webhook(stream(dsp('evt_dsp_3', 'charge.dispute.created', 'pi_pack_41', 'needs_response')), mkRes());
  check((await get(cityLead, { upgrade: W, t: TOK.upgradeToken(W) })).code === 410, '(a second pack is disputed: closed)');
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_4', 'charge.dispute.closed', 'pi_pack_41', 'won', 1794600000)), mkRes());
  const gw = await get(cityLead, { upgrade: W, t: TOK.upgradeToken(W) });
  check(store.get('leads/' + W).disputedAt === null && store.get('leads/' + W).disputeStatus === 'won' && gw.code === 200 && gw.body.state === 'open' && TG(/Dispute VINTA/) && TG(/contestazione vinta — il credito di upgrade di questo ordine vale di nuovo/), 'a dispute that is won clears the stamp: the credit is open again, and the card says so', JSON.stringify(tg.map((x) => x.text)));
  // the OPENING delivered again after the won close (Stripe does not deliver in order): the stamp does not come back
  tg.length = 0;
  const rAgain = await webhook(stream(dsp('evt_dsp_3', 'charge.dispute.created', 'pi_pack_41', 'needs_response')), mkRes());
  check(rAgain.code === 200 && rAgain.body.duplicate === true && store.get('leads/' + W).disputedAt === null && (await get(cityLead, { upgrade: W, t: TOK.upgradeToken(W) })).code === 200 && tg.length === 0,
    'the dispute\'s opening delivered again after it was won does not close the credit again, and rings nothing', JSON.stringify(tg.map((x) => x.text)));
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_3older', 'charge.dispute.created', 'pi_pack_41', 'needs_response', 1794400000)), mkRes());
  check(store.get('leads/' + W).disputedAt === null && TG(/evento precedente a uno già segnato — nessuna modifica/), 'an older dispute event under another id changes nothing, and its card says so', JSON.stringify(tg.map((x) => x.text)));
  // an inquiry closed without becoming a dispute: the money never left
  await webhook(stream(dsp('evt_dsp_5', 'charge.dispute.created', 'pi_pack_41', 'warning_needs_response', 1794650000)), mkRes());
  const midway = store.get('leads/' + W).disputedAt;
  await webhook(stream(dsp('evt_dsp_6', 'charge.dispute.closed', 'pi_pack_41', 'warning_closed', 1794700000)), mkRes());
  check(!!midway && store.get('leads/' + W).disputedAt === null && upgradeOffer(store.get('leads/' + W), W, NOW).state === 'open', 'an inquiry suspends the credit while it is open and gives it back when it closes without a dispute');
  // "worth again" only when the link really opens again: a pack past its 30 days does not
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Olda Old', email: 'olda@example.com', phone: '+34611000204', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_44d', amount_total: 19900 })), mkRes());
  const OLD = serviceLeadId('cs_live_pack_44d');
  store.set('leads/' + OLD, { ...store.get('leads/' + OLD), paid_at: new Date(NOW - 40 * DAY).toISOString() }); bump('leads/' + OLD);
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_44d', payment_intent: 'pi_pack_44d' }];
  await webhook(stream(dsp('evt_dsp_44a', 'charge.dispute.created', 'pi_pack_44d', 'needs_response')), mkRes());
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_44b', 'charge.dispute.closed', 'pi_pack_44d', 'won', 1794600000)), mkRes());
  check(TG(/contestazione vinta — il credito di upgrade di questo ordine era comunque scaduto/) && !TG(/vale di nuovo/), 'a won dispute on a pack past its deadline: the card does not say the credit is worth again', JSON.stringify(tg.map((x) => x.text)));
  // a dispute while an order paid in full waits for the pack's credit — on the pack, and on that order
  const dee = { name: 'Dee Dual', email: 'dee@example.com', phone: '+34611000205' };
  await webhook(stream(event({ ...meta(), ...dee, kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_48', amount_total: 19900 })), mkRes());
  await webhook(stream(event({ ...meta(), ...dee, credit_from: '', credit_amount: '', credit_plan: '', amount_eur: '500' }, { id: 'cs_live_fs_48', amount_total: 50000 })), mkRes());
  const P48 = serviceLeadId('cs_live_pack_48'), F48 = serviceLeadId('cs_live_fs_48');
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_48', payment_intent: 'pi_pack_48' }, { id: 'cs_live_fs_48', payment_intent: 'pi_fs_48' }];
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_48', 'charge.dispute.created', 'pi_pack_48', 'needs_response')), mkRes());
  check(TG(new RegExp('sospeso finché la contestazione non è vinta\\. ATTENZIONE: ' + F48 + ' \\(pagato a prezzo pieno\\) aspettava il rimborso di questo credito: non rimborsarlo finché la contestazione non è chiusa\\.')),
    'a dispute on a pack whose credit an order paid in full is waiting for: the card says to hold that refund', JSON.stringify(tg.map((x) => x.text)));
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_49', 'charge.dispute.created', 'pi_fs_48', 'needs_response')), mkRes());
  check(TG(new RegExp('pagamento contestato — su questo ordine era dovuto il rimborso del credito di ' + P48 + ': non rimborsarlo finché la contestazione non è chiusa\\.')),
    'a dispute on the order paid in full: the card says not to refund the credit on it meanwhile', JSON.stringify(tg.map((x) => x.text)));
  // a close whose opening was never seen still stamps; a dispute with no paid order behind it creates nothing
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Lena Late', email: 'lena@example.com', phone: '+34611000203', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_42', amount_total: 19900 })), mkRes());
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_42', payment_intent: 'pi_pack_42' }];
  await webhook(stream(dsp('evt_dsp_7', 'charge.dispute.closed', 'pi_pack_42', 'lost')), mkRes());
  check(!!store.get('leads/' + serviceLeadId('cs_live_pack_42')).disputedAt, 'a lost dispute whose opening was never delivered is stamped at the close');
  globalThis.__stripeSessions = [{ id: 'cs_live_rent_88', payment_intent: 'pi_rent_88' }];
  const size = store.size;
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_8', 'charge.dispute.created', 'pi_rent_88', 'needs_response')), mkRes());
  check(!store.has('leads/' + serviceLeadId('cs_live_rent_88')) && store.size === size + 1 && TG(/CONTESTAZIONE/) && !TG(/pagamento contestato/), 'a dispute on a rent or a deposit (no paid order) creates no lead: only its notification');
  check((await stampDispute({ payment_intent: '' }, 'charge.dispute.created', 1)) === null && (await stampDispute(null, 'charge.dispute.closed', 1)) === null, 'a dispute with no PaymentIntent stamps nothing');
  // a dispute on a pack whose credit was already used: the card warns
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_15', payment_intent: 'pi_pack_15' }];
  tg.length = 0;
  await webhook(stream(dsp('evt_dsp_9', 'charge.dispute.created', 'pi_pack_15', 'needs_response')), mkRes());
  check(TG(/pagamento contestato — ATTENZIONE: il credito di upgrade di questo ordine è già stato usato da /), 'a dispute on a pack whose credit was already used: the card warns');
  globalThis.__stripeSessions = [];
}

// ── 5e. A stamp that fails: 500, so Stripe delivers again until the order is stamped ──
{
  const TG = (re) => tg.some((x) => re.test(String(x.text || '')));
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Fred Fail', email: 'fred@example.com', phone: '+34611000301', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_50', amount_total: 19900 })), mkRes());
  const F = serviceLeadId('cs_live_pack_50'), t = TOK.upgradeToken(F);
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_50', payment_intent: 'pi_pack_50' }];
  const evt = { id: 'evt_ref_50', type: 'charge.refunded', created: 1794300000, data: { object: { id: 'ch_50', payment_intent: 'pi_pack_50', amount: 19900, amount_refunded: 19900, currency: 'eur', billing_details: { name: 'Fred Fail' } } } };
  hooks.failGetOnce = 'leads/' + F;
  tg.length = 0;
  const r1 = await webhook(stream(evt), mkRes());
  const note = store.get('agentNotifications/stripe-evt_ref_50');
  check(r1.code === 500 && r1.body.error === 'order_stamp_failed' && !store.get('leads/' + F).refundedAt, 'a refund whose stamp fails (Firestore 503) is answered 500: Stripe will deliver the event again', JSON.stringify(r1.body));
  check(TG(/RIMBORSO totale: €199/) && TG(/Non sono riuscito a segnare l'ordine: Stripe riconsegna l'evento da solo e ti avviso quando è segnato/) && note && /Non sono riuscito a segnare l'ordine/.test(note.summary) && note.priority === 'high' && note.stampFailed === true, 'the card rings all the same and says so — and the stored notification keeps the failure (not only the first two lines), at high priority', note && note.summary);
  check((await get(cityLead, { upgrade: F, t })).code === 200, '(until the redelivery the credit is still open: that is why the answer must not be 200)');
  // the redelivery: stamps, answers 200, tells the operator once, repairs the stored record
  tg.length = 0;
  const r2 = await webhook(stream(evt), mkRes());
  const note2 = store.get('agentNotifications/stripe-evt_ref_50');
  check(r2.code === 200 && r2.body.duplicate === true && store.get('leads/' + F).refundedAmount === 199 && (await get(cityLead, { upgrade: F, t })).code === 410, 'the redelivery stamps the order, answers 200 and the credit is closed');
  check(tg.length === 1 && TG(/✅ Ordine .*segnato rimborsato — il credito di upgrade di questo ordine non vale più\. La prima consegna di questo evento non c'era riuscita: ora è a posto\./) && note2 && note2.repairedAt && note2.stampFailed === false && !/Non sono riuscito/.test(note2.summary) && /segnato rimborsato/.test(note2.summary),
    'the operator is told once that it is stamped now, and the stored notification stops saying it failed', JSON.stringify(tg.map((x) => x.text)));
  // a third delivery: nothing more
  tg.length = 0;
  const r3 = await webhook(stream(evt), mkRes());
  check(r3.code === 200 && r3.body.duplicate === true && tg.length === 0, 'a further delivery rings nothing');
  // a failing Stripe lookup and a failing commit are answered 500 the same way; a dispute too
  const keepList = globalThis.__stripeSessions;
  Object.defineProperty(globalThis, '__stripeSessions', { configurable: true, get() { throw new Error('stripe down'); } });
  const r4 = await webhook(stream({ ...evt, id: 'evt_ref_51' }), mkRes());
  Object.defineProperty(globalThis, '__stripeSessions', { configurable: true, writable: true, value: keepList });
  check(r4.code === 500 && r4.body.error === 'order_stamp_failed', 'a Stripe lookup that throws is answered 500 too', JSON.stringify(r4.body));
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Gina Gone', email: 'gina@example.com', phone: '+34611000302', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_52', amount_total: 19900 })), mkRes());
  globalThis.__stripeSessions = [{ id: 'cs_live_pack_52', payment_intent: 'pi_pack_52' }];
  hooks.failGetOnce = 'leads/' + serviceLeadId('cs_live_pack_52');
  const r5 = await webhook(stream({ id: 'evt_dsp_52', type: 'charge.dispute.created', created: 1794500000, data: { object: { id: 'dp_52', payment_intent: 'pi_pack_52', amount: 19900, currency: 'eur', reason: 'fraudulent', status: 'needs_response' } } }), mkRes());
  check(r5.code === 500 && !store.get('leads/' + serviceLeadId('cs_live_pack_52')).disputedAt, 'a dispute whose stamp fails is answered 500 as well');
  const r6 = await webhook(stream({ id: 'evt_dsp_52', type: 'charge.dispute.created', created: 1794500000, data: { object: { id: 'dp_52', payment_intent: 'pi_pack_52', amount: 19900, currency: 'eur', reason: 'fraudulent', status: 'needs_response' } } }), mkRes());
  check(r6.code === 200 && !!store.get('leads/' + serviceLeadId('cs_live_pack_52')).disputedAt, 'and its redelivery stamps it');
  // a failed stamp on a payment with NO desk order behind it (a rent): the redelivery takes the warning back
  const rentEvt = { id: 'evt_ref_90', type: 'charge.refunded', created: 1794300000, data: { object: { id: 'ch_90', payment_intent: 'pi_rent_90', amount: 120000, amount_refunded: 120000, currency: 'eur', billing_details: { name: 'A Tenant' } } } };
  Object.defineProperty(globalThis, '__stripeSessions', { configurable: true, get() { throw new Error('stripe down'); } });
  tg.length = 0;
  const q1 = await webhook(stream(rentEvt), mkRes());
  Object.defineProperty(globalThis, '__stripeSessions', { configurable: true, writable: true, value: [{ id: 'cs_live_rent_90', payment_intent: 'pi_rent_90' }] });
  check(q1.code === 500 && store.get('agentNotifications/stripe-evt_ref_90').stampFailed === true && TG(/Non sono riuscito a segnare l'ordine/), '(a rent refund whose Stripe lookup fails: the operator is told the stamp failed)');
  tg.length = 0;
  const q2 = await webhook(stream(rentEvt), mkRes());
  const nq = store.get('agentNotifications/stripe-evt_ref_90');
  check(q2.code === 200 && tg.length === 1 && TG(/✅ ↩️ RIMBORSO totale: €1\.?200 — dietro questo pagamento non c'è un ordine dei desk da segnare: niente da fare\. La prima consegna di questo evento non c'era riuscita: ora è a posto\./) && nq.stampFailed === false && !!nq.repairedAt && !/Non sono riuscito/.test(nq.summary),
    'the redelivery finds no desk order behind that payment: the operator is told there is nothing to stamp, and the stored warning is taken back', JSON.stringify(tg.map((x) => x.text)));
  tg.length = 0;
  const q3 = await webhook(stream(rentEvt), mkRes());
  check(q3.code === 200 && tg.length === 0, 'a further delivery rings nothing');
  // a duplicate whose own record cannot be read is not answered 200 (the repair would be lost): Stripe delivers again
  hooks.failGetOnce = 'agentNotifications/stripe-evt_ref_90';
  const q4 = await webhook(stream(rentEvt), mkRes());
  check(q4.code === 500 && q4.body.error === 'notification_read_failed', 'a duplicate that cannot read its own notification answers 500');
  globalThis.__stripeSessions = [];
}

// ── 5f. A refund stamped between the upgrade webhook's two reads: never "refunded AND credited" in silence ──
{
  await webhook(stream(event({ ...meta(), kind: 'application-pack', name: 'Rex Race', email: 'rex@example.com', phone: '+34611000401', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_60', amount_total: 19900 })), mkRes());
  const P = serviceLeadId('cs_live_pack_60'), U = serviceLeadId('cs_live_up_60');
  // the pack's refund lands right after the upgrade's own order is written (upgradeCreditFor has already read the pack)
  hooks.afterWrite = (k) => { if (k === 'leads/' + U) { hooks.afterWrite = null; store.set('leads/' + P, { ...store.get('leads/' + P), refundedAt: new Date(NOW).toISOString(), refundedAmount: 199, refundedFull: true }); bump('leads/' + P); } };
  await webhook(stream(event(meta({ credit_from: P, name: 'Rex Race', email: 'rex@example.com', phone: '+34611000401' }), { id: 'cs_live_up_60' })), mkRes());
  hooks.afterWrite = null;
  const al = store.get('agentNotifications/upgrade-void-' + U.slice(4));
  check(store.get('leads/' + U) && !store.get('leads/' + P).credit && al && al.priority === 'high' && /era stato rimborsato: il credito non era dovuto/.test(al.summary), 'a refund that lands between the two reads: the pack is never marked used, and the void alert rings', al && al.summary);
  // a mark that cannot be WRITTEN leaves the credit open: 500 (Stripe delivers again), the operator told, and the redelivery marks it
  const max = { name: 'Max Mark', email: 'max@example.com', phone: '+34611000402' };
  await webhook(stream(event({ ...meta(), ...max, kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_61', amount_total: 19900 })), mkRes());
  const P61 = serviceLeadId('cs_live_pack_61'), U61 = serviceLeadId('cs_live_up_61');
  hooks.failCommits = { path: 'leads/' + P61, times: 6 };
  emails.length = 0; tg.length = 0;
  const rm = await webhook(stream(event(meta({ credit_from: P61, ...max }), { id: 'cs_live_up_61' })), mkRes());
  const am = store.get('agentNotifications/upgrade-mark-' + U61.slice(4));
  // …a second delivery on which the write still fails is a 500 too (Stripe keeps delivering), with no second e-mail
  const rmB = await webhook(stream(event(meta({ credit_from: P61, ...max }), { id: 'cs_live_up_61' })), mkRes());
  check(rmB.code === 500 && rmB.body.duplicate === true && rmB.body.error === 'credit_mark_failed' && emails.length === 2 && !store.get('leads/' + P61).credit && hooks.failCommits.times === 0, 'a redelivery on which the mark still fails answers 500 again, and sends nothing twice', JSON.stringify(rmB.body));
  check(rm.code === 500 && rm.body.error === 'credit_mark_failed' && store.get('leads/' + U61) && emails.length === 2 && !store.get('leads/' + P61).credit && (await get(cityLead, { upgrade: P61, t: TOK.upgradeToken(P61) })).code === 200
    && am && am.markFailed === true && am.priority === 'high' && /non sono riuscito a segnare come usato il credito dell'ordine/.test(am.summary),
    'a credit mark that fails three times: the order and both e-mails are done, the answer is 500 and an urgent card says the link is still open', JSON.stringify(rm.body));
  const rm2 = await webhook(stream(event(meta({ credit_from: P61, ...max }), { id: 'cs_live_up_61' })), mkRes());
  const am2 = store.get('agentNotifications/upgrade-mark-' + U61.slice(4));
  check(rm2.code === 200 && rm2.body.duplicate === true && emails.length === 2 && store.get('leads/' + P61).credit && store.get('leads/' + P61).credit.usedBy === U61 && tg.some((x) => /✅ Upgrade .*ora è segnato come usato\./.test(String(x.text || ''))) && am2.markFailed === false && !!am2.repairedAt,
    'the redelivery marks the credit, sends no second e-mail, and takes the warning back', JSON.stringify(tg.map((x) => x.text)));
  // a write whose answer is lost but that LANDED: read again, find the mark, no failure
  await webhook(stream(event({ ...meta(), name: 'Lou Landed', email: 'lou@example.com', phone: '+34611000403', kind: 'application-pack', amount_eur: '199', credit_from: '', credit_amount: '', credit_plan: '' }, { id: 'cs_live_pack_62', amount_total: 19900 })), mkRes());
  const P62 = serviceLeadId('cs_live_pack_62'), U62 = serviceLeadId('cs_live_up_62');
  hooks.failCommits = { path: 'leads/' + P62, times: 1 };
  hooks.beforeCommit = (k) => { if (k === 'leads/' + P62) { hooks.beforeCommit = null; store.set(k, { ...store.get(k), credit: { usedBy: U62, usedAt: 'x', amount: 199, currency: 'eur' } }); bump(k); } };
  const rl = await webhook(stream(event(meta({ credit_from: P62, name: 'Lou Landed', email: 'lou@example.com', phone: '+34611000403' }), { id: 'cs_live_up_62' })), mkRes());
  hooks.beforeCommit = null; hooks.failCommits = null;
  check(rl.code === 200 && store.get('leads/' + P62).credit.usedBy === U62 && !store.has('agentNotifications/upgrade-mark-' + U62.slice(4)), 'a write that failed to answer but did land is found on the next read: no false failure');
}

// ── 6. The bot: /upgrade BM XXXXX ────────────────────────────────────────────
{
  check(JSON.stringify(BOT.parseUpgradeRef('bm sampl')) === '{"file":"BM SAMPL"}' && JSON.stringify(BOT.parseUpgradeRef('BMSAMPL')) === '{"file":"BM SAMPL"}' && BOT.parseUpgradeRef(AP_ID).id === AP_ID && BOT.parseUpgradeRef('hello') === null, 'the bot reads a file number in any spelling, or an order id');
  const FRESH = 'svc_csliveFreshPackOrder000001';
  const lead = apLead({ city: { ...apLead().city, file: 'BM FRESH' } });
  const txt = BOT.upgradeReply(lead, FRESH, NOW, 'https://www.boomrome.com');
  check(/<b>€301<\/b>/.test(txt) && txt.includes(TOK.upgradeLink(FRESH).replace(/&/g, '&amp;')) && /Messaggio pronto/.test(txt) && /credited, so it's €301/.test(txt), 'an open credit: the amount, the personal link and a ready message');
  check(!/dana@example\.com/.test(txt), 'the bot does not print the client\'s email');
  check(!/\btoday\b/i.test(txt) && /without waiting for the 14-day withdrawal period/.test(txt), 'the ready message promises no "today" (the desk works Mon–Fri) and says what the tick does');
  check(/già stato usato/.test(BOT.upgradeReply(apLead({ credit: { usedBy: 'svc_x' } }), FRESH, NOW)) && !/upgrade\?l=/.test(BOT.upgradeReply(apLead({ credit: { usedBy: 'svc_x' } }), FRESH, NOW)), 'a used credit: no link');
  check(/scaduto/.test(BOT.upgradeReply(apLead({ paid_at: new Date(NOW - 40 * DAY).toISOString() }), FRESH, NOW)), 'an expired credit: no link, the date');
  const botBer = BOT.upgradeReply(apLead({ market: 'berlin', paid_at: new Date(NOW - 40 * DAY).toISOString(), city: { ...apLead().city, key: 'berlin', label: 'Berlin', file: 'BM BERLN' } }), FRESH, NOW, 'https://www.boomrome.com');
  check(/credito €199 senza scadenza su questo desk/.test(botBer) && /upgrade\?l=/.test(botBer) && /valido fino al \d/.test(txt), 'the bot names the deadline where there is one, and says there is none in Berlin', botBer.slice(0, 200));
  const botRef = BOT.upgradeReply(apLead({ refundedAmount: 199 }), FRESH, NOW, 'https://www.boomrome.com'), botDsp = BOT.upgradeReply(apLead({ disputedAt: 'x' }), FRESH, NOW, 'https://www.boomrome.com');
  check(/Questo ordine è stato rimborsato: non c'è più niente da accreditare\. Nessun link\./.test(botRef) && /Il pagamento di questo ordine è contestato in banca: non c'è più niente da accreditare/.test(botDsp) && !/upgrade\?l=/.test(botRef + botDsp), 'a refunded or disputed pack: the bot says why and gives no link', botRef);
  check(/upgrade\?l=/.test(BOT.upgradeReply(apLead({ withdrawal: { at: 'x' } }), FRESH, NOW, 'https://www.boomrome.com')), 'a pack with only a withdrawal statement on file still has its link');
  const fsOrder = apLead({ kind: 'full-search', amount_eur: 301, city: { ...apLead().city, service: 'full-search', credit: { from: AP_ID, plan: 'application-pack', amount: 199, verified: true } } });
  const fsTxt = BOT.upgradeReply(fsOrder, 'svc_csliveTheUpgradeOrder00001', NOW, 'https://www.boomrome.com');
  check(/già l'upgrade: €199 accreditati dall'ordine/.test(fsTxt) && fsTxt.includes(AP_ID) && !/upgrade\?l=/.test(fsTxt), 'the Full Search paid with the credit (same file) says it is the upgrade, no link', fsTxt);
  check(/personal Full Search link/.test(txt), 'the ready message says the link is personal');
  // what the webhook recorded at the payment is said on any answer about that order
  const avSt = apLead({ market: 'berlin', kind: 'attended-viewing', amount_eur: 149, city: { ...apLead().city, key: 'berlin', label: 'Berlin', service: 'attended-viewing', stackedOn: { from: 'svc_berlinfs000001', match: 'check' } } });
  const fsUn = apLead({ kind: 'full-search', amount_eur: 500, city: { ...apLead().city, service: 'full-search', creditUnverified: true } });
  check(/Pagato avendo già un Full Search su questo desk \(svc_berlinfs000001\)/.test(BOT.upgradeReply(avSt, FRESH, NOW, 'https://www.boomrome.com')) && /prima verifica la persona: il telefono non coincide/.test(BOT.upgradeReply(avSt, FRESH, NOW, 'https://www.boomrome.com'))
    && /Al pagamento non ho potuto leggere gli ordini precedenti di chi paga/.test(BOT.upgradeReply(fsUn, FRESH, NOW, 'https://www.boomrome.com')),
    'the bot repeats, on the order, a Berlin plan paid on top of a Full Search and a lookup that failed at the payment');
  seed(FRESH, lead);
  seed('city_freshdoorlead0001', { intent: 'city_search', market: 'madrid', city: { file: 'BM FRESH' } });
  tg.length = 0;
  await BOT.handleUpgradeCommand(123, 'BM FRESH');
  check(tg.length === 1 && tg[0].text.includes(TOK.upgradeLink(FRESH).replace(/&/g, '&amp;')), 'the command finds the PAID order by its file (not the free-door lead with the same number)');
  // the command asks whether an order paid in full is waiting for an OPEN credit: when that question fails, no link
  hooks.failQueries = 0; tg.length = 0;
  const realList = hooks.queries.length;
  await BOT.handleUpgradeCommand(123, FRESH);
  check(hooks.queries.slice(realList).some((q) => q.field === 'creditDueFrom' && q.value === FRESH) && tg.length === 1 && /upgrade\?l=/.test(tg[0].text), 'for an open credit the command looks for orders waiting on it (none: the link)');
  tg.length = 0;
  hooks.failQueries = 1;
  await BOT.handleUpgradeCommand(123, FRESH);
  hooks.failQueries = 0;
  check(tg.length === 1 && /Non ho potuto controllare se un ordine pagato a prezzo pieno aspetta questo credito/.test(tg[0].text) && !/upgrade\?l=/.test(tg[0].text), 'and when that lookup fails it gives no link');
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
  check(/o\.expiresAt \? 'Your credit is valid until ' \+ day\(o\.expiresAt\) \+ ' \(end of day, Rome time\) and can be used once\.' : 'Your credit can be used once\.'/.test(html), 'a credit with no deadline (Berlin) prints no date — never "valid until Invalid Date"');
  check(/o\.state === 'void'/.test(html) && /This credit is no longer available\./.test(html) && /o\.reason === 'disputed' \? 'The payment for the Application Pack it came from is disputed with the bank' : 'The Application Pack it came from was refunded'/.test(html) && !/withdrawn from/.test(html),
    'a void credit is said as it is: no longer available, the pack refunded or its payment disputed');
  check(/<p id="lead">Full Search on your desk, with what you paid for the Application Pack taken off the price\.<\/p>/.test(html) && !/one attended viewing|until you sign/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'the page\'s own words describe no desk\'s Full Search: what it buys comes from the server, per desk');
}

// ── 8. Joints on the source ──────────────────────────────────────────────────
{
  const sc = read('api/service-checkout.js'), wh = read('api/stripe-webhook.js'), bot = read('api/telegram/webhook.js');
  check(/verifyUpgradeToken\(lid, tok\)/.test(sc) && sc.indexOf('verifyUpgradeToken(lid, tok)') < sc.indexOf('stripe.checkout.sessions.create'), 'the token is checked before any Stripe call');
  check(/unit_amount: Math\.round\(charge \* 100\)/.test(sc) && /const charge = upgrade \? upgrade\.pay : svc\.eur;/.test(sc), 'the amount is the server\'s: plan price or what the credit leaves');
  const dupBranch = wh.slice(wh.indexOf('  if (w && w.exists) {\n    // Retry di Stripe'), wh.indexOf('  const marked = await markUpgradeCredit('));
  check(/const again = await markUpgradeCredit\(credit, svcId, docId, currency, paidAmount\);\n    await reportMark\(again, credit, svcId, docId\);\n    await flagVoidCredit\(credit, svcId, docId, paidAmount\);/.test(dupBranch)
    && /return res\.status\(again === 'failed' \? 500 : 200\)\.json\(\{ received: true, duplicate: true/.test(dupBranch) && /return res\.status\(marked === 'failed' \? 500 : 200\)/.test(wh),
    'a retry still marks a credit the first run left unmarked and flags a void one; a mark that failed answers 500 on either delivery');
  check(dupBranch.length > 400 && !/payerOrdersBefore\(|owedCreditIn\(|fullSearchHeld\(|openCreditFor\(/.test(dupBranch) && /sc\.creditDue/.test(dupBranch) && /sc\.stackedOn/.test(dupBranch),
    'a second delivery never looks the payer up again: it reads creditDue and stackedOn from the stored order');
  check(/const paidMs = event && Number\(event\.created\) > 0 \? Number\(event\.created\) \* 1000 : Date\.now\(\);/.test(wh) && /payerLookupNeeded\(cityKey, kindPaid\) \? await payerOrdersBefore\(email, paidMs\) : null;/.test(wh) && !/payerOrdersBefore|openCreditFor|owedCreditIn/.test(sc),
    'the other door is the webhook\'s, after the payment and on the payment\'s clock: the till never applies a credit on a typed e-mail');
  const atPayment = wh.slice(wh.indexOf('async function payerOrdersBefore'), wh.indexOf('async function markUpgradeCredit'));
  check(!/fsCommit\(|fsPatch\(|patchDoc\(/.test(atPayment), 'nothing is written on any lead by the lookup at the payment (the pack is closed by the refund, settleRefundCredit)');
  check(/const voidNow = upgradeVoidReason\(v\.data\);\n    if \(voidNow\) \{ await flagVoidCredit\(\{ \.\.\.credit, voided: voidNow \}, svcId, docId, paidAmount\); return 'void'; \}/.test(wh), 'the mark re-checks, on the versioned read, that the pack\'s money has not gone back meanwhile');
  const bodyOf = (from, to) => wh.slice(wh.indexOf(from), wh.indexOf(to));
  check([bodyOf('async function markUpgradeCredit', 'const MARK_FAILED'), bodyOf('async function stampOrder', 'const isoOf'), bodyOf('async function settleRefundCredit', 'async function pendingClaimsOn')].every((b) => b.length > 200 && /precondition: \{ updateTime: v\.updateTime \}/.test(b) && !/precondition: \{ exists: true \}/.test(b)),
    'the mark, the stamps and the settle are each written under the version just read');
  check(/text === '\/upgrade' \|\| text\.startsWith\('\/upgrade '\)/.test(bot) && /\/upgrade BM XXXXX/.test(bot), 'the bot routes /upgrade and lists it in /help');
  // the refund is stamped BEFORE the notification write: a Stripe retry that finds the notification has still stamped the lead
  check(wh.indexOf('stamped = await stampRefund(o, event.created);') > 0 && wh.indexOf('stamped = await stampRefund(o, event.created);') < wh.indexOf("w = await writeDoc('agentNotifications', notifId, {")
    && wh.indexOf('stamped = await stampDispute(o, event.type, event.created);') < wh.indexOf("w = await writeDoc('agentNotifications', notifId, {"), 'the refund and dispute stamps come before the notification that makes a retry stop');
  check(/if \(!v \|\| !v\.data \|\| v\.data\.paid !== true\) return null;/.test(wh), 'the stamps are written only on a paid lead that exists (money going back never creates one)');
  check(/if \(prev && prev\.stampFailed === true\) \{/.test(wh) && !/stamped\.first/.test(wh), 'a repair is announced only when the stored notification says the stamp had failed — never guessed from the order');
  check((wh.match(/return res\.status\(stampFailed \? 500 : 200\)/g) || []).length === 2, 'a failed stamp answers 500 on the first delivery and on a duplicate one');
  check(/if \(!credit \|\| !credit\.verified\) return 'skip';/.test(wh) && /if \(voided\) credit\.voided = voided;\n    else credit\.verified = true;/.test(wh), 'a void credit is never verified, so never marked');
  check(/o\.state === 'used' \|\| o\.state === 'expired' \|\| o\.state === 'void' \? 410 : 404/.test(read('api/city-lead.js'))
    && /up\.state === 'used' \|\| up\.state === 'expired' \|\| up\.state === 'void' \? 410 : 404/.test(sc) && sc.indexOf("up.state === 'void'") < sc.indexOf('stripe.checkout.sessions.create'), 'GET and POST answer 410 for a void credit, before any Stripe call');
}

// ── 9. The policy in public: the pages, the Terms and llms.txt say the server's rule ──
{
  const terms = read('terms.html'), llms = read('llms.txt');
  const termsText = terms.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check(termsText.includes(`If you paid for an Application Pack and move to Full Search on the same desk within ${UPGRADE_DAYS} days of that payment, what you paid for the pack is credited in full, once: you pay the difference.`), 'Terms §12.2 state the credit with the server\'s number of days', (termsText.match(/Application Pack credit[^.]*\.[^.]*\./) || [''])[0]);
  check(termsText.includes('The credit is applied when you order through the personal link in your order confirmation.')
    && termsText.includes('If you paid for Full Search at its full price on the same desk while your credit was open, we apply it afterwards and return what you paid for the pack to the card you used.'),
    'the Terms name the door (the personal link) and promise the refund to a pack holder who paid the full price');
  check(termsText.includes('A pack that was refunded, in full or in part — for instance after a withdrawal — or whose payment was reversed by your bank carries no credit.') && termsText.includes('A credit you do not use is not paid out in money.') && !/that you withdrew from carries no credit/.test(termsText),
    'the Terms say when there is no credit (the money went back: a refund, a reversed payment) — never a bare withdrawal statement — and that an unused credit is not paid out');
  check(/A refund \(12\.3\) or a withdrawal \(12\.4\) of a Full Search bought with the credit is calculated on what you paid for it\./.test(termsText), 'and what a refund of the upgraded Full Search is counted on');
  check(termsText.indexOf('Application Pack credit.') > termsText.indexOf('12.2') && termsText.indexOf('Application Pack credit.') < termsText.indexOf('12.3'), 'the paragraph sits in §12.2, before §12.3');
  // Berlin: its own terms never charge a pack on top of a Full Search, so the credit has no deadline there — said where Berlin's terms are
  check(/a Full Search client is not charged an Application Pack or an Attended Viewing, and on this desk an Application Pack already paid is credited towards Full Search with no time limit \(12\.2\)\./.test(termsText)
    && upgradeDaysOf('berlin') === null && /an Application Pack already paid is credited towards Full Search there with no time limit/.test(llms), 'Terms §12.5 and llms.txt say Berlin\'s credit has no time limit, as the server applies it');
  check((llms.match(new RegExp(`credited in full towards Full Search[^.\\n]*within ${UPGRADE_DAYS} days`, 'g')) || []).length >= 2, 'llms.txt says the credit twice (the services and the desks\' pricing), with the same number of days');
  check((llms.match(new RegExp(`credited in full towards Full Search[^.\\n]*within ${UPGRADE_DAYS} days[^.\\n]*no time limit (?:on the Berlin desk|in Berlin)[^.\\n]*through the personal link in the order email`, 'g')) || []).length >= 2,
    'and each time it says Berlin\'s exception and the door (the personal link)');
  // every desk that sells prints the server's two sentences; the word-for-word build checks are in tests/cities
  const desks = fs.readdirSync(path.join(R, 'cities')).filter((f) => /^[a-z]+\.json$/.test(f)).map((f) => JSON.parse(read('cities/' + f))).filter((c) => c.live === true && c.checkout === true);
  // each desk with ITS window: 30 days, or none where the server gives none (Berlin)
  const hint = `<p class="t-up" id="tUp" hidden>${upgradeTillHint('Application Pack')}</p>`;
  const missing = desks.filter((c) => {
    const h = read(c.slug + '.html'), days = upgradeDaysOf(c.slug);
    return !h.includes(`<p class="refund">${upgradeLine('Full Search', days)}</p>`) || !h.includes(upgradeFact('Application Pack', 'Full Search', days)) || !h.includes(hint);
  }).map((c) => c.slug);
  check(desks.length >= 8 && missing.length === 0, `the ${desks.length} live desks print the ticket line and the fact with the desk's own window, and the till hint, word for word`, missing.join(', '));
  const berlin = read('berlin.html');
  check(upgradeDaysOf('berlin') === null && !/[Cc]redited in full[^<"]*30 days/.test(berlin) && berlin.includes('credited in full towards Full Search with no time limit'), 'Berlin\'s page names no 30 days for the credit: its Terms (§12.5) and the server give no time limit');
  const openDesks = desks.filter((c) => upgradeDaysOf(c.slug) === null).map((c) => c.city);
  const hubLine = upgradeHubLine('Full Search', UPGRADE_DAYS, openDesks.join(', '));
  check(openDesks.join() === 'Berlin' && read('desks.html').includes(`<p class="refund">${hubLine}</p>`) && /at the same desk/.test(hubLine), 'and the hub prints the line under the Application Pack, saying it holds at the same desk, with the desks that have no deadline named', hubLine);
  check(termsText.includes('If you pay for one of them on the page while your Full Search is running, we refund it.') && /a pack or a viewing paid on the page while a Full Search is running is refunded/.test(llms),
    'Terms §12.5 and llms.txt say what happens when a Berlin Full Search client pays a pack or a viewing on the page: it is refunded');
  // the upgrade page prints the deadline as a DATE from the server: no number of days of its own, except the 14 of the withdrawal
  const dayNumbers = (html) => [...html.matchAll(/(\d+)[ -]days?\b/g)].map((m) => +m[1]).filter((d) => d !== 14);
  const upPage = read('upgrade.html');
  check(dayNumbers(upPage).every((d) => d === UPGRADE_DAYS) && !dayNumbers(upPage.replace('can be used once', 'is valid 45 days')).every((d) => d === UPGRADE_DAYS), 'the upgrade page names no other number of days for the credit (and the check bites on a mutated copy)', dayNumbers(upPage).join(','));
  check(upPage.includes("day(o.expiresAt) + ' (end of day, Rome time) and can be used once.'") && upPage.includes("day(o.expiresAt) + ' (Rome time).'") && /timeZone: 'Europe\/Rome'/.test(upPage),
    'the page prints the deadline as Rome\'s day and SAYS so (a client in London or New York reads which day it is)');
}

console.log(`\n  ${ko ? '\x1b[31m' : '\x1b[32m'}Result: ${ok} passed, ${ko} failed\x1b[0m`);
process.exit(ko ? 1 : 0);
