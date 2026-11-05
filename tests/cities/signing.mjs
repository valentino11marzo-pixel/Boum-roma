// tests/cities/signing.mjs — THE ORDER of the desks that charge at signing
// (Paris and Berlin from the v1.8 flip; spec §5.2–§5.4, §13.1), on the REAL
// handlers: api/service-checkout.js → api/_cityorder.js (+ _cityorderpdf,
// _cityterms, _withdrawal) and the managed ticket of api/city-lead.js.
//
// What breaks if this goes red:
//   - a signing desk opening a payment session (the branch removed, the belt
//     is the last guard: 500, never a session — tested by mutation);
//   - an order without its record, its number, its email or its PDF; an
//     order email that does not carry the contract (Paris: the numbered,
//     non-exclusive mandate, six months at most; Berlin: the ‘Confirmed’
//     reply), the withdrawal (online, email, the model form), the trigger
//     of the fare or the manage link;
//   - two orders for one tap (same requestId), or two open orders of the
//     same person, desk and fare;
//   - the register of orders with a gap or a duplicate (ten at once), or a
//     new year that does not restart at 0001;
//   - an old page's order accepted on terms it never showed (409);
//   - the 14-day window counted on the wrong calendar (14 July in Paris,
//     3 October in Berlin);
//   - a client email that failed without the operator knowing (book-mail);
//   - the managed ticket answering a wrong token, leaking a name or an
//     email, or saying DUE when the fee is paid; a ?paid= on a signing desk.
//
// The registry is patched in try/finally with the flip's lines (spec §3.1)
// until the flip commit writes them; production stays dark (cityOffer
// still says checkout_closed for Paris and Berlin until then).
// Firestore, Identity Toolkit, Stripe and Nodemailer are in memory; pdf-lib
// is the real one. No network.

import { register } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
register('./signing-loader.mjs', import.meta.url);

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'synthetic-signing';
process.env.GMAIL_USER = 'desk@example.test';
process.env.GMAIL_APP_PASS = 'synthetic';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '5538';
process.env.CRON_SECRET = 'cron-signing';
delete process.env.TELEGRAM_WEBHOOK_SECRET;
delete process.env.ADMIN_NOTIFY_EMAIL;

const SELF = fileURLToPath(import.meta.url);
const R = path.resolve(path.dirname(SELF), '../..');
const PROBE = (process.argv.find((a) => a.startsWith('--probe=')) || '').slice(8);
let ok = 0, ko = 0;
const check = (cond, t, why = '') => { if (cond) { ok++; if (!PROBE) console.log('  \x1b[32m✓\x1b[0m ' + t); } else { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t + (why ? ` — ${why}` : '')); } };
const section = (t) => { if (!PROBE) console.log('\n  \x1b[1m' + t + '\x1b[0m'); };
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
if (!PROBE) console.log('\n\x1b[1m▸ citiessigning\x1b[0m  the order of the desks that charge at signing: booked on our button, the email is the contract, never a payment session');

// ── the clock: fixed when a test needs a date, the real one otherwise ───────
const RealDate = Date;
let fakeNow = null;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0 && fakeNow != null) super(fakeNow); else super(...a); }
  static now() { return fakeNow != null ? fakeNow : RealDate.now(); }
}
globalThis.Date = FakeDate;
const at = (iso) => { fakeNow = RealDate.parse(iso); };

// ── Firestore + Identity Toolkit in memory (conditional commits, queries) ──
const DB = new Map();
const VER = new Map();
let seq = 0;
const bump = (p) => VER.set(p, new RealDate(1700000000000 + ++seq).toISOString());
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = enc(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
};
const dec = (v) => {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(dec);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = dec(x); return o; }
  return null;
};
const decFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = dec(v); return o; };
const docOut = (p) => ({ name: 'projects/p/databases/(default)/documents/' + p, fields: Object.fromEntries(Object.entries(DB.get(p)).map(([k, v]) => [k, enc(v)])), updateTime: VER.get(p) });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const fail = { commit: 0, list: 0 };
const counts = { commit: 0, conflicts: 0 };
// every Telegram call, recorded (the /firmato cards, the edits, the acks)
const TG = [];
// a dotted field path (city.file) read through the maps, as Firestore does
const at_ = (o, p) => String(p).split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), method = opts.method || 'GET';
  if (u.hostname === 'identitytoolkit.googleapis.com') return json({ idToken: 'tok' });
  if (u.hostname === 'api.telegram.org') {
    TG.push({ method: u.pathname.split('/').pop(), body: opts.body ? JSON.parse(opts.body) : {} });
    return json({ ok: true, result: { message_id: 7000 + TG.length } });
  }
  if (u.hostname !== 'firestore.googleapis.com') throw new Error('fetch not stubbed: ' + url);
  if (u.pathname.endsWith(':commit')) {
    counts.commit++;
    if (fail.commit > 0) { fail.commit--; return json({ error: { status: 'UNAVAILABLE' } }, 503); }
    const writes = JSON.parse(opts.body).writes;
    for (const w of writes) {
      const p = (w.update ? w.update.name : w.delete).split('/documents/')[1];
      const pc = w.currentDocument || {};
      if ((pc.updateTime && pc.updateTime !== VER.get(p)) || (pc.exists === false && DB.has(p)) || (pc.exists === true && !DB.has(p))) {
        counts.conflicts++;
        return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
    }
    for (const w of writes) {
      if (!w.update) continue;
      const p = w.update.name.split('/documents/')[1];
      const next = { ...(DB.get(p) || {}) }, f = decFields(w.update.fields);
      for (const k of (w.updateMask ? w.updateMask.fieldPaths : Object.keys(f))) { if (k in f) next[k] = f[k]; else delete next[k]; }
      DB.set(p, next); bump(p);
    }
    return json({ writeResults: writes.map(() => ({})) });
  }
  if (u.pathname.endsWith(':runQuery')) {
    if (fail.list > 0) { fail.list--; return json({ error: 'down' }, 503); }
    const q = JSON.parse(opts.body).structuredQuery, col = q.from[0].collectionId;
    const ff = q.where && q.where.fieldFilter;
    const rows = [...DB.keys()].filter((k) => k.startsWith(col + '/') && k.split('/').length === 2)
      .filter((k) => !ff || (ff.op === 'EQUAL' && at_(DB.get(k), ff.field.fieldPath) === dec(ff.value)))
      .slice(0, q.limit || 1000);
    return json(rows.map((k) => ({ document: docOut(k) })));
  }
  const p = decodeURIComponent(u.pathname.split('/documents/')[1] || '');
  if (method === 'GET') return DB.has(p) ? json(docOut(p)) : json({ error: 'not found' }, 404);
  if (method === 'POST') {
    const id = u.searchParams.get('documentId') || 'auto' + (++seq);
    const key = p + '/' + id;
    if (DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, decFields(JSON.parse(opts.body).fields)); bump(key);
    return json(docOut(key));
  }
  if (method === 'PATCH') {
    if (u.searchParams.get('currentDocument.exists') === 'false' && DB.has(p)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(p, { ...(DB.get(p) || {}), ...decFields(JSON.parse(opts.body).fields) }); bump(p);
    return json(docOut(p));
  }
  throw new Error('method not stubbed: ' + method + ' ' + url);
};

// ── the mailbox ─────────────────────────────────────────────────────────────
globalThis.deliveryMails = [];
globalThis.deliveryMailAttempts = [];
globalThis.deliverySmtp = null;
globalThis.__stripeCalls = [];

// ── the handlers ────────────────────────────────────────────────────────────
const M = await import('../../api/_market.js');
const { CITY_MARKETS, cityOffer, chargeAtOf, isSigningDesk, CITY_PLANS } = M;
const { default: checkout } = await import('../../api/service-checkout.js');
const { default: cityLead } = await import('../../api/city-lead.js');
const { ORDER_COPY, isOpenOrder, MAX_ATTEMPTS } = await import('../../api/_cityorder.js');
const { ORDER_TERMS, termsHash } = await import('../../api/_cityterms.js');
const { orderToken, verifyOrderToken, payLink, collectionFor } = await import('../../api/payments/_token.js');
const { WITHDRAWAL_FORM_TEXT } = await import('../../api/_withdrawal.js');
const SCALO = (await import('../../js/scalo-codes.js')).default;
const { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } = await import('pdf-lib');
// the charge at signing (stage A2) and its readers
const SIGN = await import('../../api/payments/_citysign.js');
const FIRMATO = await import('../../api/telegram/_firmato.js');
const { default: tgWebhook } = await import('../../api/telegram/webhook.js');
const { default: stripeWebhook } = await import('../../api/stripe-webhook.js');
const { default: payLinkPage } = await import('../../api/payments/link.js');
const { stage0 } = await import('../../api/leads/brain.js');
const { default: conservazione, orderRegisters } = await import('../../api/ops/conservazione.js');
const { default: scadenzario } = await import('../../api/accounting/scadenzario.js');
const { default: contabile } = await import('../../api/employees/contabile.js');
const RENT = (await import('../../js/rent-engine.js')).default;
const DATAOPS = (await import('../../js/dataops-engine.js')).default;

const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
let ipSeq = 0;
const post = async (body, ip) => { const r = mkRes(); await checkout({ method: 'POST', headers: { 'x-forwarded-for': ip || `10.9.0.${++ipSeq}` }, body, socket: {} }, r); return r; };
const getTicket = async (query, ip) => { const r = mkRes(); await cityLead({ method: 'GET', headers: { 'x-forwarded-for': ip || `10.10.0.${++ipSeq}` }, query, url: '/api/city-lead' }, r); return r; };
const leadsBook = () => [...DB.keys()].filter((k) => k.startsWith('leads/book_'));
const rid = () => crypto.randomBytes(8).toString('hex');
const PARIS_V = ORDER_TERMS.paris.v, BERLIN_V = ORDER_TERMS.berlin.v;
const order = (city, extra = {}) => ({ city, kind: 'full-search', name: 'Anna Keller', email: 'anna@example.com', notes: '', startNow: false, requestId: rid(), termsV: city === 'paris' ? PARIS_V : BERLIN_V, company: '', ...extra });
const mailsTo = (to) => globalThis.deliveryMails.filter((m) => m.to === to);
const WINANSI = { 0x80: '€', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
async function pdfText(bytes) {
  const d = await PDFDocument.load(bytes);
  let out = '';
  for (const pg of d.getPages()) {
    const c = pg.node.Contents();
    for (const ref of (c instanceof PDFArray ? c.asArray() : [c])) {
      const st = d.context.lookup(ref);
      if (st instanceof PDFRawStream) out += Buffer.from(decodePDFRawStream(st).decode()).toString('latin1') + '\n';
    }
  }
  // every text run, decoded from WinAnsi; the legal footer and the page
  // numbers (stamped on every page) are left out, so a paragraph that runs
  // over a page reads whole
  const text = [...out.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => [...Buffer.from(m[1], 'hex')].map((b) => WINANSI[b] || String.fromCharCode(b)).join(''))
    .filter((t) => !/^BOOM® è un marchio|^Egidi Immobiliare S\.r\.l\. — Via dei Coronari|^\d+ \/ \d+$/.test(t)).join(' ');
  return { pages: d.getPageCount(), text, squashed: text.replace(/\s+/g, '') };
}
const sq = (s) => String(s).replace(/\s+/g, '');
// the email HTML as text: tags out, entities back, spaces folded
const htmlText = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#8203;/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── the flip's registry lines (spec §3.1), patched until the flip ───────────
const FLIP = {
  paris: { labelIt: 'Parigi', holidays: 'fr', mode: 'search', checkout: true, chargeAt: 'signing', order: { prefix: 'PAR', months: 6 }, cardStep: false },
  berlin: { labelIt: 'Berlino', holidays: 'de-be', mode: 'search', checkout: true, chargeAt: 'signing', order: { prefix: 'BER', months: null }, feeCap: { months: 2, vatPct: 19 }, goAhead: true, noStacking: true, cardStep: false },
};
const flipped = CITY_MARKETS.paris.chargeAt === 'signing' && CITY_MARKETS.berlin.chargeAt === 'signing';
const saved = { paris: { ...CITY_MARKETS.paris }, berlin: { ...CITY_MARKETS.berlin } };
if (!PROBE) {
  section('0 · dark until the flip');
  if (flipped) console.log('    · the registry has flipped: Paris and Berlin charge at signing for real');
  else {
    check(['paris', 'berlin'].every((c) => cityOffer(c, 'full-search').error === 'checkout_closed') && chargeAtOf('paris') === 'checkout' && chargeAtOf('berlin') === 'checkout',
      'before the flip production is unchanged: Paris and Berlin are checkout_closed, chargeAtOf says checkout');
  }
  check(['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia'].every((c) => chargeAtOf(c) === 'checkout' && cityOffer(c, 'full-search').chargeAt === 'checkout'),
    'the six desks charge at checkout: chargeAtOf and cityOffer say so');
  check(chargeAtOf('rome') === 'checkout' && chargeAtOf('') === 'checkout' && chargeAtOf('__proto__') === 'checkout', 'an unknown key reads checkout (never signing by accident)');
}
for (const k of ['paris', 'berlin']) { delete CITY_MARKETS[k].partner; Object.assign(CITY_MARKETS[k], FLIP[k]); }

try {
  // ═══════════════════════════════════════════════════════════════════════
  // THE CHARGE AT SIGNING (stage A2, spec §6, §13.1 "signing" + "readers"):
  // /firmato on Telegram, the question that IS the attestation, the gates,
  // the amounts, cfy → the Egidi invoice with the stable pay link, cfx and
  // /chiudi, the INVOICE webhook, 🔔 Ricorda; then every reader downstream.
  // The scenario runs in 2029 so its register numbers start clean.
  let cbSeq = 0;
  const CHAT = 5538;
  const tgText = async (text) => { const r0 = mkRes(); await tgWebhook({ method: 'POST', headers: {}, body: { message: { chat: { id: CHAT }, message_id: 11, text } } }, r0); return r0; };
  const tgTap = async (data) => { const r0 = mkRes(); await tgWebhook({ method: 'POST', headers: {}, body: { callback_query: { id: 'cb' + (++cbSeq), data, message: { chat: { id: CHAT }, message_id: 4242, text: 'card' } } } }, r0); return r0; };
  const tgFrom = (n, method) => TG.slice(n).filter((t) => !method || t.method === method);
  const lastSent = (n) => tgFrom(n, 'sendMessage').slice(-1)[0];
  const lastEdit = (n) => tgFrom(n, 'editMessageText').slice(-1)[0];
  const buttons = (t) => ((t && t.body.reply_markup && t.body.reply_markup.inline_keyboard) || []).flat();
  const cbs = (t) => buttons(t).map((b) => b.callback_data).filter(Boolean);
  const place = async (city, extra) => { const b = order(city, extra); const r0 = await post(b); return r0.body.id; };
  const L = (id) => DB.get('leads/' + id);
  const fileOf = (id) => L(id).city.file;
  const numOf = (id) => L(id).city.order.number;
  const mkRes2 = () => ({ code: 0, body: null, headers: {}, url: null, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(o) { this.body = o; return this; }, redirect(c, u) { this.code = c; this.url = u; return this; }, end() { return this; } });
  const stripeHook = async (ev) => { const r0 = mkRes2(); await stripeWebhook({ method: 'POST', headers: { 'stripe-signature': 'sig' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(ev)); } }, r0); return r0; };
  const paidEvent = (invoiceId, sid, amount, email) => ({ type: 'checkout.session.completed', data: { object: { id: sid, amount_total: Math.round(amount * 100), currency: 'eur', customer_email: email, payment_intent: 'pi_' + sid, metadata: { service: 'INVOICE', invoiceId, number: '', amount: String(amount), via: 'link' } } } });
  const tokenOf = (url) => new URL(url).searchParams.get('t');

  // ═════════════════════════════════════════════════════════════════════════
  // the probes: one scenario, run in a child under a SIGNING_MUTATION
  if (PROBE) {
    const out = {};
    if (PROBE === 'belt') {
      const r = await post(order('paris'));
      out.code = r.code; out.error = r.body && r.body.error; out.sessions = globalThis.__stripeCalls.length; out.orders = leadsBook().length;
    } else if (PROBE === 'stale') {
      const r = await post(order('paris', { termsV: 'par-2026-10-0' }));
      out.code = r.code; out.orders = leadsBook().length;
    } else if (PROBE === 'ten') {
      at('2026-11-04T13:07:00Z');
      DB.set('heartbeat/city-orders-paris', { year: 2026, next: 1 }); bump('heartbeat/city-orders-paris');
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => post(order('paris', { email: `p${i}@example.com` }))));
      out.numbers = rs.map((r) => r.body && r.body.number).sort();
    } else if (PROBE === 'token') {
      at('2026-11-04T13:07:00Z');
      const r = await post(order('paris'));
      const g = await getTicket({ order: r.body.id, t: 'f'.repeat(24), city: 'paris' });
      out.code = g.code;
    } else if (PROBE === 'twotaps' || PROBE === 'resend' || PROBE === 'stalekey' || PROBE === 'citystamp') {
      // the charge at signing (A2): one Paris order, a draft, then the scenario
      at('2029-06-01T10:00:00Z');
      const email = `${PROBE}@example.com`;
      const r0 = await post(order('paris', { email, startNow: true }));
      const id = r0.body.id;
      at('2029-06-04T10:00:00Z');
      const d = await SIGN.draftSigning({ leadId: id, facts: { signedOn: PROBE === 'stalekey' ? '2029-06-03' : '2029-06-04' } });
      const emails = () => globalThis.deliveryMails.filter((m) => m.to === email && /lease is signed/.test(m.subject)).length;
      if (PROBE === 'twotaps') {
        await Promise.all([SIGN.chargeAtSigning({ leadId: id, key: d.signing.key }), SIGN.chargeAtSigning({ leadId: id, key: d.signing.key })]);
        out.emails = emails();
      } else if (PROBE === 'resend') {
        await SIGN.chargeAtSigning({ leadId: id, key: d.signing.key });
        const l = DB.get('leads/' + id);
        DB.set('leads/' + id, { ...l, signing: { ...l.signing, status: 'invoicing', claimedAt: new FakeDate(Date.now() - 3 * 60 * 1000).toISOString() } }); bump('leads/' + id);
        await SIGN.chargeAtSigning({ leadId: id });
        out.emails = emails();
      } else if (PROBE === 'stalekey') {
        await SIGN.draftSigning({ leadId: id, facts: { signedOn: '2029-06-04' } });
        const r = await SIGN.chargeAtSigning({ leadId: id, key: d.signing.key });
        out.error = r.error || null; out.invoice = DB.has('invoices/cityfee_' + id);
      } else {
        await SIGN.chargeAtSigning({ leadId: id, key: d.signing.key });
        await stripeHook(paidEvent('cityfee_' + id, 'cs_test_probe1', 500, email));
        out.invoicePaid = (DB.get('invoices/cityfee_' + id) || {}).status === 'paid'; out.paid = DB.get('leads/' + id).paid === true;
      }
    } else if (PROBE === 'window') {
      at('2029-06-04T10:00:00Z');
      const r0 = await post(order('paris', { email: 'window@example.com', startNow: false }));
      at('2029-06-08T10:00:00Z');
      const d = await SIGN.draftSigning({ leadId: r0.body.id, facts: { signedOn: '2029-06-08' } });
      out.feeAllowed = d.ok ? d.signing.feeAllowed : null;
    } else if (PROBE === 'stacking') {
      at('2029-06-04T10:00:00Z');
      await post(order('berlin', { email: 'stacking@example.com', startNow: true }));
      const r1 = await post(order('berlin', { email: 'stacking@example.com', startNow: true, kind: 'attended-viewing' }));
      const d = await SIGN.draftSigning({ leadId: r1.body.id, facts: { signedOn: '2029-06-04' } });
      out.feeAllowed = d.ok ? d.signing.feeAllowed : null;
    }
    console.log('PROBE ' + JSON.stringify(out));
  } else {
    // ═══════════════════════════════════════════════════════════════════════
    section('1 · the registry: one word, read like the currency');
    check(chargeAtOf('paris') === 'signing' && chargeAtOf('Berlin ') === 'signing' && cityOffer('paris', 'full-search').chargeAt === 'signing' && cityOffer('berlin', 'attended-viewing').chargeAt === 'signing',
      'with the flip lines, chargeAtOf and cityOffer say signing for Paris and Berlin (key case- and space-insensitive)');
    check(cityOffer('paris', 'full-search').ok === true && cityOffer('paris', 'full-search').eur === 500 && cityOffer('berlin', 'application-pack').eur === 199,
      'a signing desk sells the same grid: 500 / 199 / 149 from CITY_PLANS');
    check(isSigningDesk({ market: 'paris' }) && isSigningDesk({ sourceRef: 'city-berlin' }) && !isSigningDesk({ market: 'amsterdam' }) && !isSigningDesk({}) && !isSigningDesk(null),
      'isSigningDesk reads the lead\'s market (market, then sourceRef) against the registry');
    check(ORDER_COPY.paris && ORDER_COPY.berlin && ['full-search', 'application-pack', 'attended-viewing'].every((p) => ORDER_COPY.paris.triggers[p] && ORDER_COPY.berlin.triggers[p]),
      'the order copy carries a trigger for every fare of both desks');
    // anti-drift: the email repeats the page word for word (the fare's
    // trigger, the three next steps of the BOOKED card) — from the flip on,
    // when the desk JSON is a signing desk's
    for (const slug of ['paris', 'berlin']) {
      const j = JSON.parse(read(`cities/${slug}.json`));
      if (j.chargeAt !== 'signing') { console.log(`    · ${slug}.json is not a signing desk yet (the flip writes it): the email copy is compared with it from then on`); continue; }
      const plans = (j.pricing && j.pricing.plans) || [];
      check(plans.length === 3 && plans.every((p) => p.trigger === ORDER_COPY[slug].triggers[p.id]), `${slug}: the email's trigger of every fare is the page's`);
      const bk = (j.checkoutCopy && j.checkoutCopy.booked) || {};
      check(JSON.stringify(bk.next) === JSON.stringify(ORDER_COPY[slug].next) && JSON.stringify(bk.nextWait) === JSON.stringify(ORDER_COPY[slug].nextWait),
        `${slug}: the email's next steps are the BOOKED card's (checkoutCopy.booked.next / nextWait)`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('2 · the order: Paris, Full Search — the happy path');
    at('2026-11-04T13:07:00Z');
    const stripeBefore = globalThis.__stripeCalls.length;
    const m0 = globalThis.deliveryMails.length;
    const body = order('paris', { name: 'Anna Keller', email: 'Anna@Example.com', notes: 'A flat near Bastille', requestId: 'abcd1234efgh' });
    const r = await post(body);
    const id = 'book_abcd1234efgh';
    const lead = DB.get('leads/' + id);
    check(r.code === 200 && r.body.ok === true && r.body.booked === true && r.body.id === id, 'POST /api/service-checkout on Paris: 200, booked, the id is book_<requestId>', JSON.stringify(r.body));
    check(globalThis.__stripeCalls.length === stripeBefore, 'ZERO Stripe calls: no payment session, no customer, nothing');
    const file = SCALO.fileCode(id);
    check(r.body.file === file && /^BM [A-HJ-NP-Z2-9]{5}$/.test(file) && r.body.number === 'PAR-2026-0001' && r.body.plan === 'full-search' && r.body.startNow === false && r.body.workFromLabel === '19 November 2026',
      'the answer: the file nickname fileCode(id), the register number PAR-2026-0001, the plan, the start after the 14 days', JSON.stringify(r.body));
    check(Object.keys(r.body).sort().join() === 'booked,file,id,number,ok,plan,startNow,workFromLabel', 'the answer carries exactly the fields the page needs', Object.keys(r.body).join());
    check(!!lead && lead.type === 'service' && lead.status === 'new' && lead.source === 'web' && lead.leadType === 'tenant' && lead.language === 'en'
      && lead.market === 'paris' && lead.sourceRef === 'city-paris' && lead.intent === 'city_booking' && lead.booked === true && lead.paid === false,
      'the order record: a tenant lead of the Paris market, intent city_booking (never city_order), booked:true, paid:false at the top level', JSON.stringify(lead && { t: lead.type, i: lead.intent, b: lead.booked, p: lead.paid }));
    check(lead && lead.email === 'anna@example.com' && lead.name === 'Anna Keller' && lead.note === 'A flat near Bastille' && lead.phone === null,
      'the client: email lowercased, the name, the note, no phone (the till does not ask it)');
    const c = (lead && lead.city) || {};
    check(c.key === 'paris' && c.label === 'Paris' && c.mode === 'search' && c.chargeAt === 'signing' && c.service === 'full-search' && c.serviceLabel === 'Full Search' && c.price === 500 && c.currency === 'eur' && c.file === file,
      'city: the desk, signing, the fare, the price and the file', JSON.stringify(c));
    check(c.startNow === false && c.orderedAt === '2026-11-04T13:07:00.000Z' && c.withdrawalEndsOn === '2026-11-18' && c.workFrom === '2026-11-19' && c.workFromLabel === '19 November 2026',
      'city: the tick, the instant of the order, the 14 days (to 18 November, 11 November inside) and the start on the 19th', JSON.stringify(c));
    check(c.order && c.order.number === 'PAR-2026-0001' && c.order.termsV === PARIS_V && c.order.termsHash === termsHash('paris') && c.order.expiresOn === '2027-05-04',
      'city.order: the number, the terms version and hash the order was placed on, the last day of the six months (4 May 2027)', JSON.stringify(c.order));
    check(lead && lead.message === `PARIS — order PAR-2026-0001 · Full Search · €500 at signing · nothing charged · file ${file} · start: from 19 Nov 2026. Notes: A flat near Bastille.`,
      'the operator\'s summary line: the desk, the number, the fare, "€500 at signing · nothing charged", the file, the start, then the note', lead && lead.message);
    check(lead && lead.message.slice(0, 240).includes('file ' + file), 'the file number sits inside the first 240 characters the Telegram card quotes');
    const counter = DB.get('heartbeat/city-orders-paris');
    check(counter && counter.year === 2026 && counter.next === 2, 'the desk\'s counter moved in the same commit: { year: 2026, next: 2 }', JSON.stringify(counter));
    check(lead && lead.orderPdf && /^[0-9a-f]{64}$/.test(lead.orderPdf.sha256) && lead.orderPdf.pages >= 2 && typeof lead.clientEmailSentAt === 'string' && !lead.clientEmailFailedAt && typeof lead.operatorEmailSentAt === 'string',
      'the outcome is RECORDED on the order: the PDF hash and the client and operator emails sent', JSON.stringify(lead && { pdf: lead.orderPdf, s: lead.clientEmailSentAt }));
    const client = mailsTo('anna@example.com').slice(-1)[0];
    const operator = mailsTo('valentino@boom-rome.com').slice(-1)[0];
    // SIGNING_DUMP=<dir>: the two emails and the PDF on disk, to look at them
    if (process.env.SIGNING_DUMP && client && operator) {
      fs.writeFileSync(path.join(process.env.SIGNING_DUMP, 'order-client.html'), client.html);
      fs.writeFileSync(path.join(process.env.SIGNING_DUMP, 'order-operator.html'), operator.html);
      fs.writeFileSync(path.join(process.env.SIGNING_DUMP, 'order.pdf'), client.attachments[0].content);
    }
    check(globalThis.deliveryMails.length === m0 + 2 && !!client && !!operator, 'two emails: the client and the operator');
    check(client && client.subject === 'Your BOOM Paris order — Full Search · paid only when you sign' && client.from === 'BOOM Paris <desk@example.test>',
      'the client\'s subject and sender name the desk and say "paid only when you sign"', client && client.subject);
    const ct = client ? htmlText(client.html) : '';
    const needles = [
      ['the number and the file', 'PAR-2026-0001'], ['the file', file],
      ['the fare and its price', 'Full Search · €500'], ['VAT included', 'VAT included'],
      ['the Full Search trigger', ORDER_COPY.paris.triggers['full-search']],
      ['the Paris mandate sentence', 'This order is your non-exclusive search mandate, number PAR-2026-0001. It runs until you sign or stop it, six months at most (until 4 May 2027).'],
      ['the start', 'You did not tick “Start now”: we begin on 19 November 2026, after your 14-day withdrawal period.'],
      ['the collection', 'When you sign: an invoice from Egidi Immobiliare S.r.l. with a secure payment link. Nothing before, and nothing if you never sign. We hold no client money, deposit or rent.'],
      ['the withdrawal window', 'You can withdraw within 14 days, until 18 November 2026'],
      ['nothing owed on withdrawal', 'Nothing has been paid and nothing will be due.'],
      ['the model withdrawal form', WITHDRAWAL_FORM_TEXT],
      ...ORDER_COPY.paris.nextWait.map((s, i) => [`next step ${i + 1} (tick off)`, s.join(' ')]),
    ];
    for (const [what, s] of needles) check(ct.includes(htmlText(s).trim()), `client email: ${what}`, s.slice(0, 80));
    const token = orderToken(id);
    check(client && client.html.includes(`https://www.boomrome.com/paris?order=${id}&amp;t=${token}`) && /MANAGE YOUR ORDER/.test(client.html),
      'client email: "Manage your order" → /paris?order=<id>&t=<derived token>');
    check(client && client.html.includes('https://www.boomrome.com/withdrawal?desk=Paris&amp;ref=PAR-2026-0001#online') && client.html.includes('https://www.boomrome.com/withdrawal?desk=Paris&amp;service=full-search') && client.html.includes('mailto:hello@boom-rome.com'),
      'client email: withdraw online (?desk=Paris&ref=<number>#online), by email, or with the model form (?desk=Paris&service=<plan>)');
    check(client && client.html.includes('https://www.boomrome.com/terms#city-paris') && client.html.includes('BOOM Paris · tenant side') && !client.html.includes('Premium rentals · Roma'),
      'client email: the Terms link of the desk, and a masthead that names Paris (never "Roma")');
    check(!/Refunded in full|work already done|minus the work|Payment received|you (have )?paid|€500 paid/i.test(htmlText(client ? client.html : '')),
      'client email: no refund rule of the six, no proportional amount, never "Payment received" (nothing is paid)');
    const att = client && client.attachments && client.attachments[0];
    check(att && att.filename === 'BOOM-PAR-2026-0001.pdf' && att.contentType === 'application/pdf' && crypto.createHash('sha256').update(att.content).digest('hex') === lead.orderPdf.sha256,
      'the PDF is attached (BOOM-PAR-2026-0001.pdf) and its SHA-256 is the one the order records');
    check(operator && operator.attachments && operator.attachments[0] && crypto.createHash('sha256').update(operator.attachments[0].content).digest('hex') === lead.orderPdf.sha256 && operator.replyTo === 'anna@example.com',
      'the operator\'s copy carries the same PDF and replies to the client');
    const ot = operator ? htmlText(operator.html) : '';
    check(/PARIGI — ORDINE PAR-2026-0001 · Full Search €500 alla firma \(niente addebitato\)/.test(operator ? operator.subject : '') && /niente è stato addebitato/.test(ot) && /mandato n\. PAR-2026-0001/.test(ot) && /\/firmato BM [A-HJ-NP-Z2-9]{5} AAAA-MM-GG/.test(ot),
      'the operator\'s copy is in Italian: nothing charged, the mandate number, the /firmato command for the signing', operator && operator.subject);
    const pdf = att ? await pdfText(att.content) : { text: '', squashed: '' };
    const pdfNeedles = [
      ['the bilingual title', 'Mandat de recherche non exclusif / Non-exclusive search mandate'],
      ['the register number', 'Register number (our register of mandates, in date order): PAR-2026-0001.'],
      ['the French register number', "Numéro d'inscription au registre des mandats : PAR-2026-0001."],
      ['the six months', 'This mandate runs for six months from the day it is placed, up to and including 4 May 2027'],
      ['not exclusive', 'It is not exclusive'],
      ['the Full Search fee and its trigger', 'The fee is due only if, while this mandate runs, you sign the lease of a home we found or brought to you.'],
      ['nothing is due before a lease', 'Nothing is due or paid before a lease is signed; if no such lease is signed, nothing is due.'],
      ['the withdrawal deadline', 'for this mandate, on 18 November 2026'],
      ['the withdrawal online', 'https://www.boomrome.com/withdrawal?desk=Paris#online'],
      ['the model form', WITHDRAWAL_FORM_TEXT],
      ['the client', 'Between Anna Keller (anna@example.com), the client'],
      ['the terms hash', termsHash('paris')],
    ];
    for (const [what, s] of pdfNeedles) check(pdf.squashed.includes(sq(s)), `the PDF: ${what}`, s.slice(0, 70));
    check(!/Refunded in full|minus the work|work already done/.test(pdf.text), 'the PDF: never the six desks\' refund rule nor a proportional amount');
    check(pdf.pages >= 2 && pdf.text.indexOf('FRANÇAIS') > -1 && pdf.text.indexOf('ENGLISH') > pdf.text.indexOf('FRANÇAIS'), 'the PDF prints the French text first, then the English');
    const cardDoc = DB.get('agentNotifications/lead-' + id);
    check(cardDoc && cardDoc.type === 'lead.new' && cardDoc.priority === 'high' && cardDoc.status === 'pending' && cardDoc.summary === `🇫🇷 PARIGI · ORDINE PAR-2026-0001 · Full Search €500 alla firma · file ${file} · Anna Keller · dal 19/11`,
      'the operator\'s card (agentNotifications/lead-<id>, high: Telegram within a minute)', cardDoc && cardDoc.summary);
    check([...DB.values()].some((d) => d.category === 'lead' && d.actor === 'city-order' && d.details && d.details.leadId === id), 'the activity log names the order');
    // the PDF is deterministic: the same order, the same bytes (spec §18)
    const { buildOrderPdf } = await import('../../api/_cityorderpdf.js');
    const again = await buildOrderPdf({ city: 'paris', plan: 'full-search', number: 'PAR-2026-0001', name: 'Anna Keller', email: 'anna@example.com', orderedAt: new FakeDate('2026-11-04T13:07:00Z'), withdrawalEndsOn: '2026-11-18', workFrom: '2026-11-19', expiresOn: '2027-05-04', startNow: false, deskLabel: 'Paris', planLabel: 'Full Search' });
    check(again.sha256 === lead.orderPdf.sha256, 'pdf-lib with fixed dates is deterministic: rebuilding the order gives the bytes that were emailed');
    check(!JSON.stringify(lead).includes(CITY_PLANS['full-search'].desc.slice(-60)) && !JSON.stringify(globalThis.deliveryMails.slice(m0)).includes('Refunded in full if we decline'),
      'the Stripe product text of the six (CITY_PLANS desc, with its refund rule) never reaches a signing order');

    // ═══════════════════════════════════════════════════════════════════════
    section('3 · one tap, one order');
    {
      const before = globalThis.deliveryMails.length, cards = [...DB.keys()].filter((k) => k.startsWith('agentNotifications/')).length;
      const r2 = await post(body);
      check(r2.code === 200 && r2.body.duplicate === true && r2.body.id === id && r2.body.number === 'PAR-2026-0001' && r2.body.file === file && !r2.body.sameOrder,
        'the same requestId again (double tap, retry after a timeout): the stored order, duplicate:true', JSON.stringify(r2.body));
      check(globalThis.deliveryMails.length === before && [...DB.keys()].filter((k) => k.startsWith('agentNotifications/')).length === cards && DB.get('heartbeat/city-orders-paris').next === 2,
        'no second email, no second card, no number spent');
      const r3 = await post({ ...body, requestId: 'zzzz9999yyyy', startNow: true });
      check(r3.code === 200 && r3.body.duplicate === true && r3.body.sameOrder === true && r3.body.id === id && r3.body.startNow === false && leadsBook().length === 1,
        'a new tab (new requestId), same email, desk and fare: the open order is answered as it is (its own start), nothing written', JSON.stringify(r3.body));
      const r4 = await post({ ...body, requestId: 'yyyy8888xxxx', kind: 'application-pack' });
      check(r4.code === 200 && !r4.body.duplicate && r4.body.number === 'PAR-2026-0002' && r4.body.plan === 'application-pack', 'another fare is another order: PAR-2026-0002', JSON.stringify(r4.body));
      // the same requestId, now posted for ANOTHER fare: the stored order wins (the page prints r.plan)
      const r5 = await post({ ...body, kind: 'attended-viewing' });
      check(r5.code === 200 && r5.body.duplicate === true && r5.body.id === id && r5.body.plan === 'full-search', 'the same page load re-posting another fare gets its stored order back, never a second one');
      check(DB.get('heartbeat/city-orders-paris').next === 3, 'two orders, two numbers: the counter says next 3');
      // a hand-made POST reusing a Paris requestId on Berlin: never answered with the Paris order
      const parisBefore = JSON.stringify(DB.get('leads/' + id));
      const r7 = await post(order('berlin', { requestId: 'abcd1234efgh', email: 'other@example.com' }));
      check(r7.code === 200 && r7.body.booked === true && r7.body.id !== id && /^book_srv_[0-9a-f]{12}$/.test(r7.body.id) && /^BER-2026-\d{4}$/.test(r7.body.number) && JSON.stringify(DB.get('leads/' + id)) === parisBefore,
        'a requestId already held by another desk\'s order: a server id (book_srv_…), its own number, the other order untouched', JSON.stringify(r7.body));
    }
    // open = not paid, withdrawn, closed, signed, or past its six months
    {
      const base = { id: 'book_x1', booked: true, market: 'paris', city: { service: 'full-search', order: { expiresOn: '2027-05-04' } } };
      check(isOpenOrder(base, 'paris', 'full-search', '2026-12-01') && !isOpenOrder({ ...base, paid: true }, 'paris', 'full-search', '2026-12-01')
        && !isOpenOrder({ ...base, withdrawnAt: 'x' }, 'paris', 'full-search', '2026-12-01') && !isOpenOrder({ ...base, closedAt: 'x' }, 'paris', 'full-search', '2026-12-01')
        && !isOpenOrder({ ...base, signing: { status: 'invoiced' } }, 'paris', 'full-search', '2026-12-01') && isOpenOrder({ ...base, signing: { status: 'draft' } }, 'paris', 'full-search', '2026-12-01')
        && !isOpenOrder(base, 'paris', 'full-search', '2027-05-05') && isOpenOrder(base, 'paris', 'full-search', '2027-05-04')
        && !isOpenOrder({ ...base, id: 'city_x1' }, 'paris', 'full-search', '2026-12-01') && !isOpenOrder(base, 'berlin', 'full-search', '2026-12-01') && !isOpenOrder(base, 'paris', 'application-pack', '2026-12-01'),
        'isOpenOrder: a booking of this desk and fare, not paid, withdrawn, closed or signed, and inside its six months (the last day counts)');
      at('2027-06-01T09:00:00Z');
      const r6 = await post({ ...body, requestId: 'expired00001' });
      check(r6.code === 200 && !r6.body.duplicate && r6.body.number === 'PAR-2027-0001', 'after the six months the same person orders again: a new mandate (and a new year restarts the register at 0001)', JSON.stringify(r6.body));
      const cn = DB.get('heartbeat/city-orders-paris');
      check(cn.year === 2027 && cn.next === 2, 'the counter carries the new year: { year: 2027, next: 2 }', JSON.stringify(cn));
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('4 · the register: gapless under ten writers, per Rome year');
    {
      at('2026-12-02T10:00:00Z');
      DB.delete('heartbeat/city-orders-berlin');
      const conflicts0 = counts.conflicts;
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => post(order('berlin', { email: `b${i}@example.com`, name: `Client ${i}` }))));
      const nums = rs.map((x) => x.body && x.body.number).sort();
      check(rs.every((x) => x.code === 200 && x.body.booked === true), 'ten Berlin orders at once: all booked', JSON.stringify(rs.filter((x) => x.code !== 200).map((x) => x.body)));
      check(nums.join() === Array.from({ length: 10 }, (_, i) => `BER-2026-${String(i + 1).padStart(4, '0')}`).join(), 'BER-2026-0001 … 0010: no gap, no duplicate', nums.join());
      check(DB.get('heartbeat/city-orders-berlin').next === 11 && counts.conflicts > conflicts0, `the CAS did the work (${counts.conflicts - conflicts0} conflicts re-read; at most ${MAX_ATTEMPTS} attempts each)`);
      const recorded = rs.map((x) => DB.get('leads/' + x.body.id).city.order.number).sort();
      check(recorded.join() === nums.join(), 'each order record carries the number its answer gave');
      // the Rome year, not the UTC one: 23:30 UTC on 31 December is already 1 January in Rome
      at('2026-12-31T23:30:00Z');
      const ry = await post(order('berlin', { email: 'newyear@example.com' }));
      check(ry.body && ry.body.number === 'BER-2027-0001', 'an order at 00:30 Rome time on 1 January 2027 is BER-2027-0001 (the Rome year of the order)', ry.body && ry.body.number);
      // a counter already in a later year (another instance crossed midnight first) is never moved back
      at('2027-12-31T22:59:00Z');
      DB.set('heartbeat/city-orders-berlin', { year: 2028, next: 5 }); bump('heartbeat/city-orders-berlin');
      const rl = await post(order('berlin', { email: 'late@example.com' }));
      check(rl.body && rl.body.number === 'BER-2028-0005' && DB.get('heartbeat/city-orders-berlin').year === 2028, 'a counter already in the next year keeps it: the register never runs backwards', rl.body && rl.body.number);
      // a corrupted counter is refused, never renumbered from 1
      DB.set('heartbeat/city-orders-berlin', { year: 2028, next: 'x' }); bump('heartbeat/city-orders-berlin');
      at('2028-01-03T10:00:00Z');
      const n0 = leadsBook().length;
      const rc = await post(order('berlin', { email: 'corrupt@example.com' }));
      check(rc.code === 500 && rc.body.error === 'counter_invalid' && leadsBook().length === n0, 'an unreadable counter: 500 counter_invalid, nothing written (a number is never invented)');
      DB.set('heartbeat/city-orders-berlin', { next: 6 }); bump('heartbeat/city-orders-berlin');
      const rc2 = await post(order('berlin', { email: 'corrupt2@example.com' }));
      check(rc2.code === 500 && rc2.body.error === 'counter_invalid' && leadsBook().length === n0, 'a counter without its year: refused too, never restarted at 0001');
      DB.set('heartbeat/city-orders-berlin', { year: 2028, next: 6 }); bump('heartbeat/city-orders-berlin');
      // a commit that fails for another reason: 503, the page retries the same requestId
      fail.commit = 1;
      const bodyU = order('berlin', { email: 'unavail@example.com' });
      const ru = await post(bodyU);
      check(ru.code === 503 && ru.body.error === 'unavailable' && !DB.has('leads/book_' + bodyU.requestId), 'a commit refused for another reason: 503 unavailable, nothing written');
      const ru2 = await post(bodyU);
      check(ru2.code === 200 && ru2.body.number === 'BER-2028-0006' && !ru2.body.duplicate, 'the retry with the same requestId books it, with the next number');
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('5 · Berlin: the search order in text form');
    {
      // the clock goes back to 2026 here, which no real clock does: the
      // register of section 4 (already in 2028) is started afresh
      DB.delete('heartbeat/city-orders-berlin');
      at('2026-11-04T13:07:00Z');
      const b = order('berlin', { name: 'Jonas Weber', email: 'jonas@example.com', startNow: true, kind: 'application-pack' });
      const rb = await post(b);
      const lb = DB.get('leads/book_' + b.requestId);
      check(rb.code === 200 && rb.body.startNow === true && rb.body.workFromLabel === null && /^BER-2026-\d{4}$/.test(rb.body.number), 'a Berlin order, tick on: booked, no start date', JSON.stringify(rb.body));
      check(lb && lb.city.workFrom === null && lb.city.withdrawalEndsOn === '2026-11-18' && lb.city.order.expiresOn === null && /· start: now$/.test(lb.message),
        'the 14 days are counted even with the tick (the right exists), no expiry (until signed or stopped), "start: now"', lb && JSON.stringify([lb.message, lb.city.order]));
      const mb = mailsTo('jonas@example.com').slice(-1)[0];
      const tb = mb ? htmlText(mb.html) : '';
      check(mb && mb.subject === 'Your BOOM Berlin order — Application Pack · paid only when you sign', 'the Berlin subject', mb && mb.subject);
      check(tb.includes('You asked BOOM Berlin, run by Egidi Immobiliare S.r.l., to search for a home to rent for you, on your behalf only.') && tb.includes('Please reply ‘Confirmed’ to this email: we approach landlords only after your reply.'),
        'the Berlin email asks for the ‘Confirmed’ reply (text form, D18)');
      check(tb.includes('You ticked “Start now”: we begin in the desk’s first open hour.') && ORDER_COPY.berlin.next.every((st) => tb.includes(htmlText(st.join(' ')).trim())) && tb.includes(ORDER_COPY.berlin.triggers['application-pack']),
        'tick on: the email says we begin in the first open hour, with the steps of the tick and the fare\'s trigger');
      check(!/six months|mandate/i.test(tb.replace(/mandatory/g, '')), 'Berlin never says "mandate" or "six months" (that is Paris)');
      const pb = mb && mb.attachments ? await pdfText(mb.attachments[0].content) : { squashed: '', text: '' };
      check(pb.squashed.includes(sq('Suchauftrag / Search order')) && pb.squashed.includes(sq('Order number: ' + rb.body.number)) && pb.squashed.includes(sq("Please reply ‘Confirmed’ to this email")) && !pb.text.includes('FRANÇAIS'),
        'the Berlin PDF: "Suchauftrag / Search order", the order number, the Confirmed sentence, English only');
      const ob = mailsTo('valentino@boom-rome.com').slice(-1)[0];
      check(ob && /BERLINO — ORDINE BER-2026-\d{4}/.test(ob.subject) && /prima che risponda «Confirmed»/.test(htmlText(ob.html)), 'the operator is told: no landlord before the client\'s ‘Confirmed’', ob && ob.subject);
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('6 · the window, on the desk\'s own calendar');
    {
      const win = async (city, iso, startNow) => { at(iso); const bd = order(city, { email: `w${rid()}@example.com`, startNow }); const rr = await post(bd); const l = DB.get('leads/book_' + bd.requestId); return { r: rr, l }; };
      const p1 = await win('paris', '2026-06-30T10:00:00Z', false);
      const b1 = await win('berlin', '2026-06-30T10:00:00Z', false);
      check(p1.l && p1.l.city.withdrawalEndsOn === '2026-07-15' && p1.l.city.workFrom === '2026-07-16' && b1.l && b1.l.city.withdrawalEndsOn === '2026-07-14' && b1.l.city.workFrom === '2026-07-15',
        'ordered Tuesday 30 June 2026: Paris (fr) skips 14 July → ends 15, starts 16; Berlin (de-be) ends on the 14th', JSON.stringify([p1.l && p1.l.city.withdrawalEndsOn, b1.l && b1.l.city.withdrawalEndsOn]));
      const b2 = await win('berlin', '2028-09-19T10:00:00Z', false);
      const p2 = await win('paris', '2028-09-19T10:00:00Z', false);
      check(b2.l && b2.l.city.withdrawalEndsOn === '2028-10-05' && b2.l.city.workFrom === '2028-10-06' && p2.l && p2.l.city.withdrawalEndsOn === '2028-10-03' && p2.l.city.workFrom === '2028-10-05',
        'ordered Tuesday 19 September 2028: Berlin (de-be) skips 3 October → ends 5, starts 6; Paris keeps the 3rd (and Italy\'s 4 October)', JSON.stringify([b2.l && b2.l.city, p2.l && p2.l.city.withdrawalEndsOn]));
      const p3 = await win('paris', '2026-06-30T10:00:00Z', true);
      check(p3.l && p3.l.city.withdrawalEndsOn === '2026-07-15' && p3.l.city.workFrom === null && p3.r.body.workFromLabel === null, 'tick on: the same window, no start date');
      check(b1.l && b1.l.city.order.expiresOn === null && p1.l && p1.l.city.order.expiresOn === '2026-12-30', 'Paris ordered 30 June runs to 30 December (six calendar months); Berlin has no end date');
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('7 · what is refused, and what is written then (nothing)');
    {
      at('2026-11-10T10:00:00Z');
      const snap = () => JSON.stringify([leadsBook().length, DB.get('heartbeat/city-orders-paris'), globalThis.deliveryMails.length]);
      const s0 = snap();
      const st = await post(order('paris', { termsV: 'par-2026-10-0' }));
      const st2 = await post(order('paris', { termsV: undefined }));
      check(st.code === 409 && st.body.error === 'terms_changed' && st.body.termsV === PARIS_V && st2.code === 409 && snap() === s0,
        'an older page (termsV par-2026-10-0) or none: 409 terms_changed, nothing written, no number spent, no email', JSON.stringify(st.body));
      const bad = await post(order('berlin', { termsV: PARIS_V }));
      check(bad.code === 409 && bad.body.error === 'terms_changed', 'Paris\'s terms version on a Berlin order: 409');
      const nm = await post(order('paris', { name: 'A' }));
      const em = await post(order('paris', { email: 'nope' }));
      const em2 = await post(order('paris', { email: 'a@b' }));
      check(nm.code === 400 && nm.body.error === 'name' && em.code === 400 && em.body.error === 'email' && em2.code === 400 && em2.body.error === 'email' && snap() === s0,
        'a one-letter name → 400 name; a broken email → 400 email (the page puts each under its field); nothing written');
      const pl = await post(order('paris', { kind: 'concierge' }));
      check(pl.code === 400 && pl.body.error === 'unknown_service' && snap() === s0, 'an unknown fare: 400 unknown_service (cityOffer), nothing written');
      const hp = await post(order('paris', { company: 'bot' }));
      check(hp.code === 200 && hp.body.url === '/' && !hp.body.booked && snap() === s0 && globalThis.__stripeCalls.length === stripeBefore, 'the honeypot: 200 to the bot, nothing written, no Stripe');
      const price = await post(order('paris', { email: 'price@example.com', eur: 1, price: 1, amount: 1 }));
      const lp = DB.get('leads/' + price.body.id);
      check(price.code === 200 && lp.city.price === 500 && /€500 at signing/.test(lp.message), 'a price in the body is ignored: the record says the registry\'s €500');
      let last;
      for (let i = 0; i < 9; i++) last = await post(order('paris', { email: `rl${i}@example.com` }), '10.99.9.9');
      check(last.code === 429, 'the per-IP rate limit of the till holds on a signing desk too (429 on the ninth)');
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('8 · the email that fails, the email that never ran');
    {
      at('2026-11-11T10:00:00Z');
      globalThis.deliverySmtp = (mail) => { if (mail.to === 'bounce@example.com') throw new Error('smtp 550 mailbox unavailable'); };
      const bf = order('paris', { email: 'bounce@example.com' });
      const rf = await post(bf);
      globalThis.deliverySmtp = null;
      const lf = DB.get('leads/book_' + bf.requestId);
      const alarm = DB.get('agentNotifications/book-mail-book_' + bf.requestId);
      check(rf.code === 200 && rf.body.booked === true, 'a client email that fails does not undo the order: the client is still answered BOOKED');
      check(lf && typeof lf.clientEmailFailedAt === 'string' && /550/.test(lf.clientEmailError) && !lf.clientEmailSentAt && typeof lf.operatorEmailSentAt === 'string',
        'the failure is RECORDED (clientEmailFailedAt + the error), the operator\'s copy still went', lf && JSON.stringify([lf.clientEmailFailedAt, lf.clientEmailError]));
      check(alarm && alarm.priority === 'high' && alarm.status === 'pending' && /mandala a mano/.test(alarm.summary) && /recesso/.test(alarm.summary),
        'agentNotifications/book-mail-<id>, high: "mandala a mano, col testo del recesso"', alarm && alarm.summary);
      // death after the commit, before the email: no outcome on the record
      const silent = order('paris', { email: 'silent@example.com' });
      const sid = 'book_' + silent.requestId;
      DB.set('leads/' + sid, { booked: true, paid: false, market: 'paris', email: 'silent@example.com', city: { service: 'full-search', file: SCALO.fileCode(sid), startNow: false, workFromLabel: '25 November 2026', orderedAt: '2026-11-11T09:00:00.000Z', order: { number: 'PAR-2026-0099', expiresOn: '2027-05-11' } } }); bump('leads/' + sid);
      at('2026-11-11T09:01:00Z');
      const rs1 = await post(silent);
      check(rs1.code === 200 && rs1.body.duplicate === true && rs1.body.number === 'PAR-2026-0099' && !DB.has('agentNotifications/book-mail-' + sid),
        'a retry 60 s after an order with no email outcome: the stored order, no alarm yet (a first run may still be in flight)');
      at('2026-11-11T09:03:00Z');
      const nMails = globalThis.deliveryMails.length;
      const rs2 = await post(silent);
      const al2 = DB.get('agentNotifications/book-mail-' + sid);
      check(rs2.code === 200 && rs2.body.duplicate === true && al2 && al2.priority === 'high' && /nessuna traccia/.test(al2.summary) && globalThis.deliveryMails.length === nMails,
        'past 90 s: the retry raises book-mail-<id> ("nessuna traccia dell\'email") and resends nothing', al2 && al2.summary);
      const rs3 = await post(silent);
      check(rs3.code === 200 && [...DB.keys()].filter((k) => k === 'agentNotifications/book-mail-' + sid).length === 1, 'raised once (409 = already raised)');
      // the open-order read down: the order is still written once
      at('2026-11-12T10:00:00Z');
      fail.list = 1;
      const lo = order('paris', { email: 'listdown@example.com' });
      const rlo = await post(lo);
      check(rlo.code === 200 && rlo.body.booked === true && DB.has('leads/book_' + lo.requestId), 'the open-order read down: the order is still booked (the requestId keeps it single)');
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('9 · the managed ticket: GET /api/city-lead?order=&t=&city=');
    {
      at('2026-11-20T10:00:00Z');
      const t = orderToken(id);
      check(verifyOrderToken(id, t) && !verifyOrderToken(id, t.slice(0, 23) + (t.endsWith('a') ? 'b' : 'a')) && !verifyOrderToken(id, '') && !verifyOrderToken('book_other123', t) && t.length === 24,
        'orderToken: 24 hex, derived from the id, refused for another id or a changed character');
      check(collectionFor('ord') === null && orderToken(id) !== payLink('inv', id).split('t=')[1], 'the order token is not a pay token: /api/payments/link?k=ord stays refused (no collection)');
      const g = await getTicket({ order: id, t, city: 'paris' });
      check(g.code === 200 && g.body.ok === true && g.body.state === 'booked' && g.body.plan === 'full-search' && g.body.file === file && g.body.number === 'PAR-2026-0001'
        && g.body.startNow === false && g.body.workFromLabel === '19 November 2026' && g.body.withdrawalEndsOn === '2026-11-18' && g.body.expiresOn === '2027-05-04' && g.headers['cache-control'] === 'no-store',
        'the booked ticket: plan, file, number, start, the withdrawal end, the six months; no-store', JSON.stringify(g.body));
      const PII = /anna|keller|@|example|cs_|pi_|stripe|phone|email|name/i;
      check(!PII.test(JSON.stringify(g.body)) && Object.keys(g.body).sort().join() === 'expiresOn,file,number,ok,plan,startNow,state,withdrawalEndsOn,workFromLabel',
        'no name, no email, no Stripe id: only the fields the ticket prints', JSON.stringify(Object.keys(g.body)));
      const bt = await getTicket({ order: id, t: 'f'.repeat(24), city: 'paris' });
      const unk = 'book_doesnotexist1';
      const uk = await getTicket({ order: unk, t: orderToken(unk), city: 'paris' });
      check(bt.code === 404 && uk.code === 404 && JSON.stringify(bt.body) === JSON.stringify(uk.body) && JSON.stringify(bt.body) === '{"ok":false}',
        'a wrong token and an unknown order: the SAME 404 {ok:false} (no enumeration)');
      const wrongDesk = await getTicket({ order: id, t, city: 'berlin' });
      check(wrongDesk.code === 404, 'the order of Paris asked on Berlin: 404');
      const nsd = await getTicket({ order: id, t, city: 'amsterdam' });
      const badId = await getTicket({ order: 'city_abc12345', t, city: 'paris' });
      const badId2 = await getTicket({ order: 'book_A', t, city: 'paris' });
      check(nsd.code === 400 && badId.code === 400 && badId2.code === 400, 'a desk that does not charge at signing, a non-order id: 400');
      // DUE: the lease is declared signed, the invoice is pending
      const L = DB.get('leads/' + id);
      DB.set('leads/' + id, { ...L, signing: { status: 'invoiced', invoiceId: 'cityfee_' + id } }); bump('leads/' + id);
      DB.set('invoices/cityfee_' + id, { amount: 500, status: 'pending', recipientEmail: 'anna@example.com', recipientName: 'Anna Keller' }); bump('invoices/cityfee_' + id);
      const gd = await getTicket({ order: id, t, city: 'paris' });
      check(gd.code === 200 && gd.body.state === 'due' && gd.body.amount === 500 && gd.body.payUrl === payLink('inv', 'cityfee_' + id) && !PII.test(JSON.stringify({ ...gd.body, payUrl: '' })),
        'DUE: the amount and the stable pay link of the invoice (payLink inv), still no name or email', JSON.stringify(gd.body));
      // PAID by the invoice (a transfer marked in the portal), the lead not yet stamped
      DB.set('invoices/cityfee_' + id, { ...DB.get('invoices/cityfee_' + id), status: 'paid', paidAt: '2026-11-25T09:00:00.000Z' }); bump('invoices/cityfee_' + id);
      const gp = await getTicket({ order: id, t, city: 'paris' });
      check(gp.code === 200 && gp.body.state === 'paid' && gp.body.paidOn === '2026-11-25' && !gp.body.payUrl, 'PAID when the invoice is paid, even before the lead is stamped — never DUE again', JSON.stringify(gp.body));
      DB.set('invoices/cityfee_' + id, { ...DB.get('invoices/cityfee_' + id), status: 'pending' }); bump('invoices/cityfee_' + id);
      DB.set('leads/' + id, { ...DB.get('leads/' + id), paid: true, paidAt: '2026-11-26T08:00:00.000Z' }); bump('leads/' + id);
      const gp2 = await getTicket({ order: id, t, city: 'paris' });
      check(gp2.body.state === 'paid' && gp2.body.paidOn === '2026-11-26', 'PAID when the lead says paid:true', JSON.stringify(gp2.body));
      // WITHDRAWN and CLOSED
      const w = order('paris', { email: 'withdraw@example.com' });
      await post(w);
      const wid = 'book_' + w.requestId;
      DB.set('leads/' + wid, { ...DB.get('leads/' + wid), withdrawnAt: '2026-11-21T10:00:00.000Z', withdrawal: { at: '2026-11-21T10:00:00.000Z', via: 'online' } }); bump('leads/' + wid);
      const gw = await getTicket({ order: wid, t: orderToken(wid), city: 'paris' });
      check(gw.body.state === 'withdrawn' && gw.body.withdrawnOn === '2026-11-21', 'WITHDRAWN with its day', JSON.stringify(gw.body));
      const cl = order('paris', { email: 'closed@example.com' });
      await post(cl);
      const cid = 'book_' + cl.requestId;
      DB.set('leads/' + cid, { ...DB.get('leads/' + cid), closedAt: '2026-11-22T23:30:00.000Z', closeReason: 'stopped' }); bump('leads/' + cid);
      const gc = await getTicket({ order: cid, t: orderToken(cid), city: 'paris' });
      check(gc.body.state === 'closed' && gc.body.closedOn === '2026-11-23', 'CLOSED with its Rome day (23:30 UTC is already the 23rd in Rome)', JSON.stringify(gc.body));
      // a Berlin ticket has no expiry
      const bk = [...DB.entries()].find(([k, v]) => k.startsWith('leads/book_') && v.market === 'berlin');
      const gb = await getTicket({ order: bk[1].id || bk[0].slice(6), t: orderToken(bk[0].slice(6)), city: 'berlin' });
      check(gb.code === 200 && gb.body.state === 'booked' && !('expiresOn' in gb.body), 'a Berlin ticket: booked, no expiresOn', JSON.stringify(gb.body));
      // ?paid= on a signing desk is a malformed request; a book_ id is never a session
      const gpaid = await getTicket({ paid: 'cs_test_abcdefghijk', city: 'paris' });
      const gpaid2 = await getTicket({ paid: 'book_abcd1234efgh', city: 'amsterdam' });
      check(gpaid.code === 400 && gpaid2.code === 400, '?paid= on a signing desk → 400; a book_ id as ?paid= → 400');
      const gams = await getTicket({ paid: 'cs_test_abcdefghijk', city: 'amsterdam' });
      check(gams.code === 200 && gams.body.pending === true, 'the six keep their ?paid= (Amsterdam: pending for an unknown session)');
      // the budget of the ticket is the ?paid= one (30 per 10 minutes per IP)
      let lastT;
      for (let i = 0; i < 31; i++) lastT = await getTicket({ order: id, t, city: 'paris' }, '10.98.8.8');
      check(lastT.code === 429, 'the managed ticket has the ?paid= budget: 429 after 30');
      // the read down: 503, never a guess
      const realFetch = globalThis.fetch;
      globalThis.fetch = async (u, o) => (String(u).includes('/documents/leads/') ? new Response('down', { status: 503 }) : realFetch(u, o));
      const gdown = await getTicket({ order: id, t, city: 'paris' });
      globalThis.fetch = realFetch;
      check(gdown.code === 503 && gdown.body.error === 'unavailable', 'Firestore down: 503 unavailable, never a guessed state');
    }

    // ═══════════════════════════════════════════════════════════════════════
    section('10 · the joints, on the source');
    {
      const sc = read('api/service-checkout.js');
      const branch = sc.indexOf("if (offer.chargeAt === 'signing') return createCityOrder(req, res, { offer, body, ip });");
      const refuse = sc.indexOf("if (!offer.ok) return res.status(400).json({ ok: false, error: offer.error });");
      const belt = sc.indexOf("if (offer && offer.chargeAt === 'signing') throw");
      const create = sc.indexOf('stripe.checkout.sessions.create(');
      check(refuse > -1 && branch > refuse && belt > branch && create > belt, 'service-checkout: refuse → the signing branch → the belt → the only Stripe call, in that order');
      const co = read('api/_cityorder.js');
      check(!/stripe/i.test(co.replace(/\/\/.*$/gm, '')) && !/checkout\.sessions|paymentIntents|customers\.create/.test(co), 'the order module never touches Stripe (D1: no card at the order)');
      check(/import \{ withdrawalWindow, WITHDRAWAL_FORM_URL, WITHDRAWAL_FORM_TEXT \} from '\.\/_withdrawal\.js'/.test(co) && !/stripe-webhook/.test(co), 'the order counts the window from api/_withdrawal.js, never by loading the webhook');
      check(co.indexOf('renderOrderTerms({ city, plan, number: `${prefix}-${romeYear}-0001`') > -1 && co.indexOf('renderOrderTerms({ city, plan, number: `${prefix}-${romeYear}-0001`') < co.indexOf('await fsCommit(['),
        'the terms are rendered for this client BEFORE a number is spent');
      check(!/^\s*(fsCommit|fsCreate|sendEmail|logActivity)\(/m.test(co), 'every write and send of the order is awaited or capped (the 13/09 lesson)');
      const wd = read('api/_withdrawal.js'), wh = read('api/stripe-webhook.js');
      check(/export \{ withdrawalWindow, withdrawalEnds, WITHDRAWAL_FORM_URL, WITHDRAWAL_FORM_TEXT, WITHDRAWAL_FORM_TEXT_IT \} from '\.\/_withdrawal\.js'/.test(wh) && !/export function withdrawalWindow/.test(wh) && /export function withdrawalWindow/.test(wd) && /import DESK_CAL from '\.\.\/js\/desk-calendar\.js'/.test(wd),
        'the window lives in api/_withdrawal.js (one copy) and the webhook re-exports it');
      const cl = read('api/city-lead.js');
      const paidFn = cl.slice(cl.indexOf('async function paidStatus'), cl.indexOf('async function orderStatus'));
      const orderFn = cl.slice(cl.indexOf('async function orderStatus'), cl.indexOf('const clip = '));
      check(/chargeAtOf\(cityKey\) === 'signing'/.test(paidFn) && /chargeAtOf\(cityKey\) !== 'signing'/.test(orderFn)
        && orderFn.indexOf('verifyOrderToken(id, token)') > -1 && orderFn.indexOf('verifyOrderToken(id, token)') < orderFn.indexOf("fsGet('leads/' + id)"),
        'city-lead: ?paid= refuses a signing desk, ?order= accepts only one, and the token is checked BEFORE any read');
      const tk = read('api/payments/_token.js');
      check(/const KINDS = \{ pay: 'payments', inv: 'invoices' \};/.test(tk), 'the order token is not a pay-link kind (KINDS unchanged)');
    }

    // ═══════════════════════════════════════════════════════════════════════
    const T0 = '2029-03-05T10:00:00Z', T1 = '2029-04-10T09:00:00Z';
    at(T0);
    const P1 = await place('paris', { name: 'Claire Martin', email: 'claire@example.com', startNow: false });
    const P2 = await place('paris', { name: 'Luc Bernard', email: 'luc@example.com', startNow: true, kind: 'attended-viewing' });
    const P3 = await place('paris', { name: 'Marie Dubois', email: 'marie@example.com', startNow: false });
    const P4 = await place('paris', { name: 'Sophie Laurent', email: 'sophie@example.com', startNow: true, kind: 'application-pack' });
    const P5 = await place('paris', { name: 'Paul Moreau', email: 'paul@example.com', startNow: true });
    const B1 = await place('berlin', { name: 'Jonas Becker', email: 'jonas2@example.com', startNow: true });
    const B2 = await place('berlin', { name: 'Jonas Becker', email: 'jonas2@example.com', startNow: true, kind: 'application-pack' });
    const B3 = await place('berlin', { name: 'Lena Fischer', email: 'lena@example.com', startNow: true, kind: 'application-pack' });

    section('12 · /firmato: the draft and the card — one question, the attestation');
    {
      check([P1, P2, P3, P4, P5, B1, B2, B3].every((x) => /^book_/.test(String(x)) && L(x).booked === true), 'eight orders of the scenario booked (Paris and Berlin, 2029)');
      check(numOf(P1) === 'PAR-2029-0001' && numOf(B1) === 'BER-2029-0001', 'the 2029 register starts at 0001 on both desks', `${numOf(P1)} ${numOf(B1)}`);
      check(L(P1).city.withdrawalEndsOn === '2029-03-19' && L(P1).city.workFrom === '2029-03-20' && L(P1).city.order.expiresOn === '2029-09-05', 'Claire\'s order: withdrawal to 19 March, work from the 20th, mandate to 5 September 2029', JSON.stringify(L(P1).city));
      // the grammar, pure
      const pf = FIRMATO.parseFirmato('BM X7K2Q 2029-04-10 visite 3 kalt 1.250,50 ok 2029-04-01 anticipo');
      check(pf.ref.file === 'BM X7K2Q' && pf.signedOn === '2029-04-10' && pf.viewings === 3 && pf.coldRent === 1250.5 && pf.goAheadOn === '2029-04-01' && pf.early === true && !pf.error,
        'parseFirmato: the file, the date, visite, kalt (Italian thousands and decimals), ok, anticipo', JSON.stringify(pf));
      check(FIRMATO.parseFirmato('bmx7k2q oggi').ref.file === 'BM X7K2Q' && FIRMATO.parseFirmato('book_abcd1234efgh oggi').ref.id === 'book_abcd1234efgh' && FIRMATO.parseFirmato('BM X7K2Q oggi').signedOn === 'oggi',
        'parseFirmato: «bmx7k2q» and an id book_… are references too; «oggi» is a date');
      check(FIRMATO.parseFirmato('X7K2Q 2029-04-10').error === 'order' && FIRMATO.parseFirmato('BM X7K2Q 10/04/2029').error === 'date' && FIRMATO.parseFirmato('BM X7K2Q 2029-04-10 forse').error === 'token:forse'
        && FIRMATO.parseFirmato('BM X7K2Q 2029-04-10 kalt mille').error === 'token:kalt' && FIRMATO.parseEuro('0') === null && FIRMATO.parseEuro('€950') === 950,
        'parseFirmato refuses what it does not know: no order, a date it cannot read, a word it does not know, a kalt that is not an amount (never a guess)');
      const pc = FIRMATO.parseChiudi('BM X7K2Q fermato ha trovato da sola');
      check(pc.reason === 'stopped' && pc.note === 'ha trovato da sola' && FIRMATO.parseChiudi('BM X7K2Q boh').error === 'reason', 'parseChiudi: the reason (Italian aliases too) and the note; an unknown reason is refused');
      // the command, on the REAL Telegram webhook
      at(T1);
      const t0 = TG.length;
      const rr = await tgText(`/firmato ${fileOf(P1)} 2029-04-10`);
      const card = lastSent(t0);
      const s = L(P1).signing || {};
      check(rr.code === 200 && !!card && card.body.chat_id === CHAT && card.body.parse_mode === 'HTML', 'the webhook answers 200 and sends ONE card to the operator\'s chat', JSON.stringify(rr.body));
      const head = `✍️ <b>Firma</b> — Claire Martin · 🇫🇷 Parigi · Full Search · ordine ${numOf(P1)} (5/3, scade 5/9/2029) · recesso fino al 19/3 · importo €500`;
      check(card && card.body.text.startsWith(head), 'the card\'s head: name, desk, fare, order (day and six-month end), withdrawal end, amount — spec §6.2', card && card.body.text.split('\n')[0]);
      const q = 'Contratto di locazione firmato da entrambe le parti il 10/4 per una casa trovata o proposta da noi?';
      check(card && card.body.text.includes(`«${q}»`), 'the Paris Full Search question, verbatim', card && card.body.text);
      check(s.status === 'draft' && s.fare === 'full-search' && s.signedOn === '2029-04-10' && s.bothSigned === true && s.basis === 'found' && s.attestation === q
        && s.amount === 500 && s.listPrice === 500 && s.cap === null && s.feeAllowed === true && /^[0-9a-f]{6}$/.test(s.key) && s.viewings === 1 && s.coldRent === null && s.earlyStart === null,
        'the draft on the order: status draft, the facts, the attestation recorded VERBATIM, the amount from the registry, a key for the card', JSON.stringify(s));
      const datas = cbs(card);
      check(datas.join(' ') === `cfy:${P1}:${s.key} cfx:${P1}:${s.key} cfn:${P1}` && buttons(card)[0].text === '✅ Sì — emetti la fattura €500' && buttons(card)[1].text === '✖ No — nessun compenso' && buttons(card)[2].text === 'Annulla',
        'three buttons: ✅ Sì — emetti la fattura €500 (cfy:<id>:<key>) · ✖ No — nessun compenso (cfx) · Annulla (cfn)', datas.join(' '));
      check(datas.every((d) => Buffer.byteLength(d) <= 64) && FIRMATO.cbData('cfy', 'book_' + 'a'.repeat(40), 'abcdef').length <= 64 && FIRMATO.cbData('cfy', 'book_' + 'a'.repeat(60), 'abcdef') === null,
        'every callback ≤ 64 bytes; the longest real id (book_ + 40) fits with its key, a longer one gets no button (one oversized button kills the keyboard)');
      // the same order by its id, and an Attended Viewing with its viewings
      const t1 = TG.length;
      await tgText(`/firmato ${P2} oggi visite 3`);
      const c2 = lastSent(t1), s2 = L(P2).signing;
      check(s2 && s2.signedOn === '2029-04-10' && s2.viewings === 3 && s2.amount === 447 && c2.body.text.includes('«Contratto di locazione firmato da entrambe le parti il 10/4 per la casa che abbiamo visitato (3 visite di quella casa)?»') && c2.body.text.includes('importo €447'),
        'by id with «oggi»: an Attended Viewing of 3 viewings = 3 × €149 = €447, the question names the viewings', c2 && c2.body.text);
      const t2 = TG.length;
      await tgText(`/firmato ${fileOf(P4)} 2029-04-10 kalt 900`);
      const c4 = lastSent(t2);
      check(L(P4).signing.amount === 199 && L(P4).signing.coldRent === null && c4.body.text.includes('per una casa a cui il cliente si è candidato col nostro dossier?') && c4.body.text.includes('Ignorati: kalt (vale solo per il Full Search di Berlino)'),
        'an Application Pack: €199, the dossier question, and an option that does not apply is SAID ignored, never applied', c4 && c4.body.text);
      // Berlin Full Search: the go-ahead and the cap, in the question
      const t3 = TG.length;
      await tgText(`/firmato ${fileOf(B1)} 2029-04-10 kalt 200 ok 2029-03-20`);
      const cb1 = lastSent(t3), sb1 = L(B1).signing;
      check(sb1 && sb1.amount === 476 && sb1.cap === 476 && sb1.listPrice === 500 && sb1.coldRent === 200 && sb1.goAheadOn === '2029-03-20' && sb1.basis === 'goahead',
        'Berlin Full Search, Kaltmiete €200: amount min(500, 2 × 200 × 1.19) = €476, cap and go-ahead on the draft', JSON.stringify(sb1));
      check(cb1.body.text.includes('«Contratto di locazione firmato da entrambe le parti il 10/4 per una casa che il proprietario ci ha autorizzato per iscritto (il 20/3) a offrire SOLO a lei, dopo il suo ordine e il suo "Confirmed", non affidata a un\'agenzia? Kaltmiete €200 → tetto €476»')
        && cb1.body.text.includes('importo €476') && cb1.body.text.includes('listino €500 · tetto (2 × Kaltmiete + IVA 19%) €476'),
        'the Berlin question: the written go-ahead for her alone after the order and the «Confirmed», not agent-listed, the Kaltmiete and the cap (W3/W4)', cb1 && cb1.body.text);
      // Berlin Application Pack: the X1 sentence (a client of a Full Search is refused below)
      const t4 = TG.length;
      await tgText(`/firmato ${fileOf(B3)} 2029-04-10`);
      const cb3 = lastSent(t4);
      check(cb3.body.text.includes("per una casa a cui il cliente si è candidato col nostro dossier? La casa l'ha trovata il cliente e non abbiamo trattato col proprietario o il suo agente?»") && L(B3).signing.amount === 199,
        'Berlin AP/AV: the question adds «La casa l\'ha trovata il cliente e non abbiamo trattato col proprietario o il suo agente?» (X1)', cb3 && cb3.body.text);
      // help, unknown order, and an input error that writes nothing
      const t5 = TG.length;
      await tgText('/firmato');
      check(/\/firmato BM X7K2Q 2026-12-10/.test(lastSent(t5).body.text), '/firmato alone: the grammar, with examples');
      const t6 = TG.length;
      await tgText('/firmato BM ZZZZZ 2029-04-10');
      check(/Nessun ordine di Parigi o Berlino per «BM ZZZZZ»/.test(lastSent(t6).body.text), 'an unknown file: said, nothing written');
      const before5 = JSON.stringify(L(P5));
      const t7 = TG.length;
      await tgText(`/firmato ${fileOf(P5)} 2029-05-01`);
      check(/nel futuro/.test(lastSent(t7).body.text) && JSON.stringify(L(P5)) === before5 && cbs(lastSent(t7)).length === 0, 'a signing in the future: refused on the card, no button, the order untouched');
    }

    section('13 · the gates of §6.3, in order — each refusal says why');
    {
      const today = '2029-04-10';
      const base = (over = {}) => ({ id: 'book_gate000001', booked: true, market: 'paris', email: 'g@example.com', city: { service: 'full-search', serviceLabel: 'Full Search', orderedAt: '2029-03-05T10:00:00.000Z', startNow: true, withdrawalEndsOn: '2029-03-19', order: { number: 'PAR-2029-0099', expiresOn: '2029-09-05' } }, ...over });
      const g = (lead, f, ctx = {}) => SIGN.signingGates(lead, { signedOn: '2029-04-10', ...f }, { today, ...ctx });
      check(g(base()).ok === true, 'a Paris Full Search signed inside the six months, after the order: every gate passes');
      const ga = g({ ...base(), withdrawnAt: '2029-03-10T08:00:00Z' });
      check(ga.ok === false && ga.kind === 'state' && ga.gate === 'withdrawn' && /recesso il 10\/3\/2029/.test(ga.why), '1 · withdrawn: refused, the day said, «mai in automatico»', ga.why);
      check(g({ ...base(), closedAt: '2029-03-30T08:00:00Z', closeReason: 'stopped' }).gate === 'closed' && g({ ...base(), paid: true }).gate === 'paid'
        && g({ ...base(), signing: { status: 'invoiced' } }).gate === 'invoiced' && g({ ...base(), signing: { status: 'no_fee' } }).gate === 'no_fee'
        && g({ ...base(), id: 'svc_x1' }).gate === 'not_order' && g({ ...base(), market: 'amsterdam' }).gate === 'not_order',
        '1 · closed, paid, already invoiced, already no-fee, not a book_ order, not a signing desk: each refused with its reason');
      const gd = g(base(), { signedOn: '2029-02-30' }), gf = g(base(), { signedOn: '2029-04-11' }), gb = g(base(), { signedOn: '2029-03-04' });
      check(gd.gate === 'date' && gf.gate === 'future' && gb.gate === 'before_order' && [gd, gf, gb].every((x) => x.kind === 'input'),
        '2 · a date that is not a date, a future signing, a signing before the order: input refusals (nothing written)', JSON.stringify([gd.gate, gf.gate, gb.gate]));
      check(g(base(), { signedOn: '2029-03-05' }).ok === true, '2 · signed on the order day itself: allowed (≥ the order day)');
      const ge = g(base(), { signedOn: '2029-09-06' }, { today: '2029-09-10' });
      check(ge.ok === false && ge.kind === 'law' && ge.gate === 'expired' && /scaduto il 5\/9\/2029/.test(ge.why), '3 · Paris, signed after the six months: no fee can be owed (law: only «nessun compenso»)', ge.why);
      check(g(base(), { signedOn: '2029-09-05' }, { today: '2029-09-10' }).ok === true, '3 · signed on the last day of the mandate: allowed');
      const win = base({ city: { ...base().city, startNow: false } });
      const gw = g(win, { signedOn: '2029-03-15' }, { today: '2029-03-16' });
      check(gw.ok === false && gw.kind === 'law' && gw.gate === 'window' && /«anticipo»/.test(gw.why), '4 · tick off and a signing inside the 14 days: refused unless «anticipo» (CRD art. 14(4)(a)(ii))', gw.why);
      check(g(win, { signedOn: '2029-03-15', early: true }, { today: '2029-03-16' }).ok === true && g(win, { signedOn: '2029-03-20' }).ok === true && g(base(), { signedOn: '2029-03-15' }, { today: '2029-03-16' }).ok === true,
        '4 · with «anticipo» (asked in writing), after the window, or with the tick on: allowed');
      const ber = (over = {}) => ({ ...base(), market: 'berlin', city: { ...base().city, order: { number: 'BER-2029-0099', expiresOn: null } }, ...over });
      const g5a = g(ber(), {}), g5b = g(ber(), { coldRent: 900 }), g5c = g(ber(), { goAheadOn: '2029-03-20' });
      check([g5a, g5b, g5c].every((x) => x.ok === false && x.kind === 'law' && x.gate === 'goahead_missing') && /Kaltmiete/.test(g5a.why) && /via libero/.test(g5a.why) && !/Kaltmiete/.test(g5b.why),
        '5 · Berlin Full Search without the Kaltmiete or the written go-ahead: only «nessun compenso», and the card says which is missing', g5a.why);
      const g5d = g(ber(), { coldRent: 900, goAheadOn: '2029-03-01' }), g5e = g(ber(), { coldRent: 900, goAheadOn: '2029-04-12' }, { today: '2029-04-20' });
      check(g5d.kind === 'law' && g5d.gate === 'goahead_before_order' && g5e.kind === 'input' && g5e.gate === 'goahead_after_signing' && g(ber(), { coldRent: 900, goAheadOn: '2029-03-20' }).ok === true,
        '5 · a go-ahead before the order earns nothing (law); one after the signing is a typo (input); after the order and before the signing: allowed', JSON.stringify([g5d.gate, g5e.gate]));
      const ap = ber({ id: 'book_gate000002', city: { ...ber().city, service: 'application-pack' } });
      const fsOpen = { id: 'book_gate000003', booked: true, market: 'berlin', email: 'g@example.com', city: { service: 'full-search', order: { number: 'BER-2029-0042' } } };
      const g6 = g(ap, {}, { otherOrders: [fsOpen] });
      check(g6.ok === false && g6.kind === 'law' && g6.gate === 'stacking' && /BER-2029-0042/.test(g6.why), '6 · Berlin AP for a client with an open Full Search: refused (no stacking, §3(3) WoVermRG)', g6.why);
      check(g(ap, {}, { otherOrders: [{ ...fsOpen, withdrawnAt: 'x' }] }).ok === true && g(ap, {}, { otherOrders: [{ ...fsOpen, closedAt: 'x' }] }).ok === true
        && g(ap, {}, { otherOrders: [{ ...fsOpen, market: 'paris' }] }).ok === true && g({ ...ap, market: 'paris', city: { ...ap.city, order: { number: 'PAR-1', expiresOn: '2029-09-05' } } }, {}, { otherOrders: [{ ...fsOpen, market: 'paris' }] }).ok === true,
        '6 · a withdrawn or closed Full Search does not block; Paris has no stacking rule');
      const av = base({ city: { ...base().city, service: 'attended-viewing', serviceLabel: 'Attended Viewing' } });
      check(g(av, { viewings: 0 }).gate === 'viewings' && g(av, { viewings: 6 }).gate === 'viewings' && g(av, { viewings: 5 }).ok === true && g(base(), { viewings: 11 }).gate === 'viewings' && g(base(), { viewings: 10 }).ok === true,
        '7 · Attended Viewing 1–5 viewings, Paris Full Search 1–10: outside, an input refusal');
      // the gates through the card: a law refusal offers only «nessun compenso»
      at('2029-03-12T10:00:00Z');
      const t0 = TG.length;
      await tgText(`/firmato ${fileOf(P3)} 2029-03-12`);
      const cw = lastSent(t0);
      check(L(P3).signing && L(P3).signing.status === 'draft' && L(P3).signing.feeAllowed === false && /recesso/.test(L(P3).signing.refusal) && L(P3).signing.amount === null,
        'Marie (tick off) signed on 12 March, inside her window: the draft says NO fee is allowed, and why', JSON.stringify(L(P3).signing));
      check(cw.body.text.includes('⛔ <b>Nessun compenso possibile</b>') && cbs(cw).join(' ') === `cfx:${P3}:${L(P3).signing.key} cfn:${P3}` && !cbs(cw).some((d) => d.startsWith('cfy')),
        'the card of a law refusal: «Nessun compenso possibile» with the reason, and ONLY ✖ Chiudi senza compenso + Annulla (never ✅)', cbs(cw).join(' '));
      const nc = await SIGN.chargeAtSigning({ leadId: P3, key: L(P3).signing.key });
      check(nc.ok === false && nc.error === 'fee_refused' && !DB.has('invoices/' + SIGN.cityFeeInvoiceId(P3)), 'a cfy forced on that draft (a hand-made callback): refused, no invoice');
      const t1 = TG.length;
      await tgText(`/firmato ${fileOf(P3)} 2029-03-12 anticipo`);
      const ce = lastSent(t1);
      check(L(P3).signing.feeAllowed === true && L(P3).signing.earlyStart && L(P3).signing.earlyStart.inWriting === true && /^telegram:5538$/.test(L(P3).signing.earlyStart.by) && ce.body.text.includes('anticipo chiesto per iscritto') && cbs(ce)[0].startsWith('cfy:'),
        'with «anticipo»: the fee is allowed and earlyStart { inWriting, by, at } is recorded; the card says so', JSON.stringify(L(P3).signing.earlyStart));
      // Berlin AP for the Full Search client, through the card
      at(T1);
      const t2 = TG.length;
      await tgText(`/firmato ${fileOf(B2)} 2029-04-10`);
      const cs = lastSent(t2);
      check(L(B2).signing.feeAllowed === false && /Full Search aperto/.test(L(B2).signing.refusal) && cbs(cs).every((d) => !d.startsWith('cfy')), 'Jonas\'s Berlin AP while his Full Search is open: only «nessun compenso» on the card', cs && cs.body.text);
    }

    section('14 · the amounts (§6.4): from CITY_PLANS, never from the caller');
    {
      const F = SIGN.signingFee;
      check(F('paris', 'full-search', {}).amount === 500 && F('paris', 'full-search', { viewings: 3 }).amount === 798 && F('paris', 'full-search', { viewings: 3 }).extras === 2 && F('paris', 'full-search', { viewings: 10 }).amount === 1841,
        'Paris Full Search: €500, + €149 per extra viewing (3 viewings = €798; 10 = €1,841)');
      check(F('paris', 'full-search', { viewings: 11 }).error === 'viewings_out_of_range' && F('paris', 'attended-viewing', { viewings: 6 }).error === 'viewings_out_of_range', 'out of range: no amount');
      const b200 = F('berlin', 'full-search', { coldRent: 200 }), b1000 = F('berlin', 'full-search', { coldRent: 1000 });
      check(b200.amount === 476 && b200.cap === 476 && b200.listPrice === 500 && b1000.amount === 500 && b1000.cap === 2380 && F('berlin', 'full-search', { coldRent: 210.5 }).amount === 500 && F('berlin', 'full-search', { coldRent: 205 }).amount === 487.9,
        'Berlin Full Search: min(500, 2 × Kaltmiete × 1.19) — €200 → €476.00 (the spec\'s example), €1000 → €500, €205 → €487.90', JSON.stringify([b200, F('berlin', 'full-search', { coldRent: 205 })]));
      check(F('berlin', 'full-search', {}).error === 'cold_rent_required' && F('berlin', 'full-search', { coldRent: 900, viewings: 4 }).amount === 500, 'Berlin: no Kaltmiete, no amount; viewings never add (D15: included)');
      check(F('paris', 'application-pack', {}).amount === 199 && F('berlin', 'application-pack', {}).amount === 199 && F('paris', 'attended-viewing', { viewings: 3 }).amount === 447 && F('berlin', 'attended-viewing', {}).amount === 149,
        'Application Pack €199; Attended Viewing €149 × viewings (both desks)');
      check(F('amsterdam', 'full-search', {}).error === 'not_signing_desk' && F('paris', 'concierge', {}).error === 'unknown_plan' && F('__proto__', 'full-search', {}).error === 'not_signing_desk',
        'a desk that charges at checkout, an unknown plan, a prototype key: no amount');
      const src = read('api/payments/_citysign.js');
      const fn = src.slice(src.indexOf('export function signingFee'), src.indexOf('// ═══ THE QUESTION'));
      check(/CITY_PLANS/.test(fn) && !/\b(500|199|149)\b/.test(fn.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'signingFee reads every price from CITY_PLANS (no price written in its code)');
    }

    section('15 · cfy: claim → the Egidi invoice → one email → invoiced (§6.5)');
    {
      at(T1);
      // Claire: redraft on the signing day and tap ✅
      const t0 = TG.length;
      await tgText(`/firmato ${fileOf(P1)} 2029-04-10`);
      const key = L(P1).signing.key;
      const stripe0 = globalThis.__stripeCalls.length, m0 = globalThis.deliveryMails.length;
      const tap = await tgTap(`cfy:${P1}:${key}`);
      const s = L(P1).signing, invId = SIGN.cityFeeInvoiceId(P1), inv = DB.get('invoices/' + invId);
      check(tap.code === 200 && invId === 'cityfee_' + P1 && !!inv, 'the tap answers 200 and the invoice invoices/cityfee_<leadId> exists');
      check(globalThis.__stripeCalls.length === stripe0, 'ZERO Stripe calls at the signing: the fee is an invoice with a link, never an automatic charge (D1)');
      const payUrl = payLink('inv', invId);
      check(s.status === 'invoiced' && s.invoiceId === invId && s.linkUrl === payUrl && s.amount === 500 && s.listPrice === 500 && s.cap === null && s.attempt === 1
        && s.attestation === 'Contratto di locazione firmato da entrambe le parti il 10/4 per una casa trovata o proposta da noi?' && typeof s.attestedAt === 'string' && s.attestedBy === 'telegram:5538'
        && typeof s.clientEmailSentAt === 'string' && s.clientEmailTo === 'claire@example.com' && s.invoiceNumber === `${numOf(P1)}-FS` && s.dueDate === '2029-04-17',
        'signing: invoiced, the invoice id and the stable link, the amounts, the attestation answered (who, when), the email sent, due 17 April', JSON.stringify(s));
      const mails = globalThis.deliveryMails.slice(m0).filter((m) => m.to === 'claire@example.com');
      const ce = mails[0];
      check(mails.length === 1 && ce.subject === 'Your lease is signed — the BOOM fee' && ce.from === 'BOOM Paris <desk@example.test>', 'ONE email to the client: «Your lease is signed — the BOOM fee», from BOOM Paris', JSON.stringify(mails.map((m) => m.subject)));
      const txt = htmlText(ce.html);
      const want = `Congratulations on the new home.`, fee = `The BOOM fee for Full Search: €500, VAT included. Invoice ${numOf(P1)}-FS from Egidi Immobiliare S.r.l. Pay securely: ${payUrl} — due by 17 April 2029.`;
      check(txt.includes(want) && txt.includes(fee), 'the email says it: congratulations, the fee VAT included, the Egidi invoice number, the secure link, the due date (spec §6.5)', txt.slice(0, 600));
      check(ce.html.includes(payUrl.replace(/&/g, '&amp;')) && /PAY SECURELY/.test(ce.html) && ce.html.includes(`https://www.boomrome.com/paris?order=${P1}&amp;t=${orderToken(P1)}`) && ce.html.includes('BOOM Paris · tenant side'),
        'the email: the pay button, the manage link of the order, the desk\'s masthead');
      check(!/Payment received|Refunded in full|work already done|minus the work/i.test(txt) && !txt.includes(CITY_PLANS['full-search'].desc.slice(-50)), 'never «Payment received» (nothing is paid yet), never the six desks\' refund rule nor the CITY_PLANS product text');
      const edit = lastEdit(t0);
      check(edit && edit.body.message_id === 4242 && edit.body.text.startsWith(`✅ <b>Fattura emessa</b> — ${numOf(P1)}-FS · €500 · scade il 17/4`) && edit.body.text.includes('📧 email al cliente: inviata ✓'),
        'the card is EDITED with the outcome: invoice number, amount, due date, the email sent', edit && edit.body.text);
      const wa = `Hi Claire, congratulations on the lease. Here is the invoice for Full Search: €500, VAT included. Pay securely here: ${payUrl}`;
      check(edit.body.text.includes(`<code>${wa.replace(/&/g, '&amp;')}</code>`) && SIGN.invoiceWhatsApp({ lead: L(P1), invoice: inv, payUrl }) === wa, 'the card carries the WhatsApp one-tap text in English (no phone on file: to copy)', edit.body.text);
      check(cbs(edit).join(' ') === `cfr:${P1}` && buttons(edit)[0].text === '🔔 Ricorda', 'the invoiced card keeps one button: 🔔 Ricorda (cfr:<id>)');
      const note = DB.get('agentNotifications/cityfee-' + P1);
      check(note && note.priority === 'normal' && note.type === 'city.fee_invoiced' && note.summary.startsWith(`🧾 PARIGI · fattura ${numOf(P1)}-FS €500 emessa — Claire Martin · scade il 17/4/2029 · link inviato`),
        'the operator\'s copy: agentNotifications/cityfee-<id> (normal: the portal feed, no second Telegram ping)', note && note.summary);
      check([...DB.values()].some((d) => d.category === 'payment' && d.actor === 'city-signing' && d.details && d.details.invoiceId === invId), 'the activity log names the invoice');
      // a second tap: «già emessa», never a second invoice or email
      const m1 = globalThis.deliveryMails.length, t1 = TG.length;
      await tgTap(`cfy:${P1}:${key}`);
      check(globalThis.deliveryMails.length === m1 && [...DB.keys()].filter((k) => k === 'invoices/' + invId).length === 1 && /Già emessa/.test((lastEdit(t1) || {}).body.text || ''),
        'the same ✅ again: «Già emessa» with the link, no second email, one invoice');
      // two taps AT ONCE on a fresh draft (Luc's Attended Viewing): one wins
      const m2 = globalThis.deliveryMails.length, t2 = TG.length;
      const k2 = L(P2).signing.key;
      await Promise.all([tgTap(`cfy:${P2}:${k2}`), tgTap(`cfy:${P2}:${k2}`)]);
      const lucMails = globalThis.deliveryMails.slice(m2).filter((m) => m.to === 'luc@example.com');
      check(lucMails.length === 1 && L(P2).signing.status === 'invoiced' && DB.get('invoices/cityfee_' + P2).amount === 447 && tgFrom(t2, 'sendMessage').some((t) => /In corso/.test(t.body.text)),
        'two ✅ at the same instant: ONE invoice (€447), ONE email, the other tap told «In corso» (the claim\'s updateTime)', JSON.stringify([lucMails.length, L(P2).signing.status]));
      // a stale card: a newer /firmato replaced the draft
      await tgText(`/firmato ${fileOf(P4)} 2029-04-09`);
      const oldKey = L(P4).signing.key;
      await tgText(`/firmato ${fileOf(P4)} 2029-04-10`);
      const t3 = TG.length;
      await tgTap(`cfy:${P4}:${oldKey}`);
      check(L(P4).signing.status === 'draft' && L(P4).signing.signedOn === '2029-04-10' && !DB.has('invoices/cityfee_' + P4) && tgFrom(t3, 'sendMessage').some((t) => /Card superata/.test(t.body.text)),
        'the ✅ of an OLDER card (another draft since): «Card superata», nothing issued — a card never applies another card\'s facts (the PENDING_NL lesson)');
      // in flight: a claim younger than 2 minutes
      DB.set('leads/' + B3, { ...L(B3), signing: { ...L(B3).signing, status: 'invoicing', claimedAt: new FakeDate(Date.now() - 30 * 1000).toISOString(), attempt: 1 } }); bump('leads/' + B3);
      const r3 = await SIGN.chargeAtSigning({ leadId: B3, key: L(B3).signing.key });
      check(r3.ok === false && r3.error === 'in_flight' && !DB.has('invoices/cityfee_' + B3), 'a claim 30 s old: «in corso», nothing done');
      // death after the invoice, before the email: resumed by /firmato, the invoice reused, ONE email
      const doc = SIGN.cityFeeInvoiceDoc({ lead: { ...L(B3), id: B3 }, signing: L(B3).signing, fee: SIGN.signingFee('berlin', 'application-pack', {}), today: '2029-04-10', by: 'telegram:5538', now: new FakeDate(T1) });
      DB.set('invoices/cityfee_' + B3, doc); bump('invoices/cityfee_' + B3);
      DB.set('leads/' + B3, { ...L(B3), signing: { ...L(B3).signing, claimedAt: new FakeDate(Date.now() - 3 * 60 * 1000).toISOString() } }); bump('leads/' + B3);
      const m3 = globalThis.deliveryMails.length, t4 = TG.length;
      await tgText(`/firmato ${fileOf(B3)} 2029-04-10`);
      const lenaMails = globalThis.deliveryMails.slice(m3).filter((m) => m.to === 'lena@example.com');
      const res4 = lastSent(t4);
      check(L(B3).signing.status === 'invoiced' && L(B3).signing.attempt === 1 && lenaMails.length === 1 && [...DB.keys()].filter((k) => k === 'invoices/cityfee_' + B3).length === 1
        && res4.body.text.includes('Ripresa di una fattura rimasta a metà'),
        'the function died after the invoice: the next /firmato (claim older than 2 min) RESUMES the same attempt — the invoice 409 reused, ONE email, invoiced', JSON.stringify([L(B3).signing.status, lenaMails.length]));
      // death after the email, before the last write: resumed without a second email
      DB.set('leads/' + B3, { ...L(B3), signing: { ...L(B3).signing, status: 'invoicing', claimedAt: new FakeDate(Date.now() - 5 * 60 * 1000).toISOString() } }); bump('leads/' + B3);
      const m4 = globalThis.deliveryMails.length;
      const r4 = await SIGN.chargeAtSigning({ leadId: B3, key: L(B3).signing.key });
      check(r4.ok === true && r4.resumed === true && globalThis.deliveryMails.length === m4 && L(B3).signing.status === 'invoiced', 'died after the email: the resume finishes the record and sends NOTHING again (signing.clientEmailSentAt)');
      // the email that fails: invoiced anyway, the card says so and the link is there to send by hand
      globalThis.deliverySmtp = (mail) => { if (mail.to === 'jonas2@example.com') throw new Error('smtp 550 mailbox unavailable'); };
      const t5 = TG.length;
      await tgTap(`cfy:${B1}:${L(B1).signing.key}`);
      globalThis.deliverySmtp = null;
      const sb = L(B1).signing, eb = lastEdit(t5);
      check(sb.status === 'invoiced' && !sb.clientEmailSentAt && /550/.test(sb.clientEmailError) && DB.get('invoices/cityfee_' + B1).amount === 476
        && eb.body.text.includes('⚠️ email al cliente NON partita') && eb.body.text.includes(payLink('inv', 'cityfee_' + B1).replace(/&/g, '&amp;')),
        'the client email fails: invoiced (€476) all the same, the failure recorded, the card says «NON partita» with the link to send by hand', eb && eb.body.text);
    }

    section('16 · cfx, /chiudi, cfn: the order closes — nothing is due');
    {
      at(T1);
      // Marie: a fresh draft without «anticipo» (law refusal), then ✖
      await tgText(`/firmato ${fileOf(P3)} 2029-03-12`);
      const m0 = globalThis.deliveryMails.length, t0 = TG.length;
      await tgTap(`cfx:${P3}:${L(P3).signing.key}`);
      const lm = L(P3);
      check(lm.signing.status === 'no_fee' && lm.closedAt && lm.closeReason === 'no_fee' && /recesso/.test(lm.closeNote) && lm.signing.decidedBy === 'telegram:5538' && !DB.has('invoices/cityfee_' + P3),
        'cfx: signing no_fee, closedAt, closeReason no_fee, the refusal as the note — and no invoice', JSON.stringify({ s: lm.signing.status, r: lm.closeReason, n: lm.closeNote }));
      const mm = globalThis.deliveryMails.slice(m0).filter((m) => m.to === 'marie@example.com')[0];
      check(mm && mm.subject === `Your BOOM Paris order ${numOf(P3)} — nothing is due` && htmlText(mm.html).includes('Your lease is signed, and nothing is due to BOOM for it.') && typeof lm.closeEmailSentAt === 'string',
        'the client is told «Your lease is signed, and nothing is due to BOOM for it.» (recorded)', mm && mm.subject);
      check(/Nessun compenso/.test(lastEdit(t0).body.text) && /📧 inviata ✓/.test(lastEdit(t0).body.text), 'the card is edited: «Nessun compenso», the email sent');
      const gt = await getTicket({ order: P3, t: orderToken(P3), city: 'paris' });
      check(gt.body.state === 'closed' && gt.body.closedOn === '2029-04-10', 'the managed ticket now reads CLOSED');
      // Sophie's Application Pack, a plain «No»
      await tgTap(`cfx:${P4}:${L(P4).signing.key}`);
      check(L(P4).signing.status === 'no_fee' && /Attestazione: no/.test(L(P4).closeNote), 'a «No» on a fee card: no fee, «Attestazione: no» as the note');
      // /chiudi
      const t1 = TG.length;
      await tgText(`/chiudi ${fileOf(P5)} fermato ha trovato casa da sola`);
      const cc = lastSent(t1), d = L(P5).closeDraft;
      check(d && d.reason === 'stopped' && d.note === 'ha trovato casa da sola' && /^[0-9a-f]{6}$/.test(d.key) && cc.body.text.includes('motivo: fermato dal cliente — ha trovato casa da sola') && cbs(cc).join(' ') === `cch:${P5}:${d.key} cfn:${P5}`,
        '/chiudi: a draft with the reason and the note, and the card asks (cch:<id>:<key> · Annulla)', cc && cc.body.text);
      const t2 = TG.length;
      await tgTap(`cfn:${P5}`);
      check(!L(P5).closedAt && /Annullato/.test(lastEdit(t2).body.text), 'Annulla: nothing written, nothing sent');
      const m1 = globalThis.deliveryMails.length;
      await tgTap(`cch:${P5}:${d.key}`);
      const lp = L(P5);
      const pm = globalThis.deliveryMails.slice(m1).filter((m) => m.to === 'paul@example.com')[0];
      check(lp.closedAt && lp.closeReason === 'stopped' && lp.closeNote === 'ha trovato casa da sola' && pm && pm.subject === `Your BOOM Paris order ${numOf(P5)} is closed` && htmlText(pm.html).includes(`Your order ${numOf(P5)} is closed. Nothing was charged, and nothing is due.`),
        'cch: closedAt, the reason and the note; the client email «Your order … is closed. Nothing was charged, and nothing is due.»', pm && pm.subject);
      const t3 = TG.length;
      await tgText(`/chiudi ${fileOf(P1)} other`);
      check(/fattura emessa/.test(lastSent(t3).body.text) && !L(P1).closeDraft, '/chiudi on an order with an invoice issued: refused (cancel the invoice from the portal first)');
      const t4 = TG.length;
      await tgText(`/firmato ${fileOf(P5)} 2029-04-10`);
      check(/chiuso/.test(lastSent(t4).body.text) && !L(P5).signing, '/firmato on a closed order: refused, nothing written');
    }

    section('17 · the invoice record (§3.4)');
    {
      const inv = DB.get('invoices/cityfee_' + P1);
      check(inv.number === `${numOf(P1)}-FS` && inv.service === 'BOOM Paris — Full Search' && inv.description === `BOOM Paris — Full Search · order ${numOf(P1)} · lease signed 10 Apr 2029`,
        'number <order>-FS, service, description naming the order and the signing (never the Italian fallback of link.js)', JSON.stringify([inv.number, inv.service, inv.description]));
      check(inv.recipientName === 'Claire Martin' && inv.recipientEmail === 'claire@example.com' && inv.recipientId === '' && inv.amount === 500 && inv.netAmount === null && inv.vatPct === null && inv.vatAmount === null
        && inv.vatCountry === 'FR' && inv.currency === 'eur' && inv.lang === 'en' && inv.status === 'pending' && inv.dueDate === '2029-04-17' && inv.date === '2029-04-10'
        && inv.source === 'city-signing' && inv.cityLeadId === P1 && inv.cityOrderNumber === numOf(P1) && inv.createdBy === 'telegram:5538',
        'recipient, €500 VAT included, netAmount/vatPct/vatAmount null, vatCountry FR, lang en, pending, due +7, source city-signing, cityLeadId, cityOrderNumber', JSON.stringify(inv));
      const ib = DB.get('invoices/cityfee_' + B1);
      check(ib.vatCountry === 'DE' && ib.number === `${numOf(B1)}-FS` && ib.description.endsWith("capped at two months' net cold rent plus VAT (€476)"), 'Berlin: vatCountry DE, the cap said on the invoice when it applies');
      check(RENT.isForeignVat(inv) && RENT.isForeignVat(ib) && !RENT.isForeignVat({ amount: 1 }) && !RENT.isForeignVat({ vatCountry: 'IT' }) && !RENT.isForeignVat({ vatCountry: 'it' }), 'RENT.isForeignVat: FR and DE yes, Italian or no country no (one copy for both readers)');
      // declared a week after the signing: never an invoice already overdue
      const late = SIGN.cityFeeInvoiceDoc({ lead: { ...L(P1), id: P1 }, signing: { signedOn: '2029-04-03' }, fee: { amount: 500, listPrice: 500, cap: null, extras: 0 }, today: '2029-04-10', by: 'x' });
      check(late.date === '2029-04-10' && late.dueDate === '2029-04-17', 'a signing declared a week late: issued today, due in 7 days (the terms: «payable within 7 days» of the emailed invoice), never already overdue');
      const extra = SIGN.cityFeeInvoiceDoc({ lead: { ...L(P1), id: P1 }, signing: { signedOn: '2029-04-10' }, fee: SIGN.signingFee('paris', 'full-search', { viewings: 3 }), today: '2029-04-10', by: 'x' });
      check(extra.amount === 798 && extra.description.endsWith('· incl. 2 extra viewings at €149'), 'Paris Full Search with extra viewings: €798 and the description says why');
    }

    section('18 · the fee paid: the pay link in English, the INVOICE webhook stamps the order, the English receipt');
    {
      at('2029-04-12T15:00:00Z');
      const invId = 'cityfee_' + P1, payUrl = payLink('inv', invId);
      const g0 = await getTicket({ order: P1, t: orderToken(P1), city: 'paris' });
      check(g0.body.state === 'due' && g0.body.amount === 500 && g0.body.payUrl === payUrl, 'the managed ticket: DUE, €500, the stable link of the invoice');
      const s0 = globalThis.__stripeCalls.length;
      const pg = mkRes2();
      await payLinkPage({ method: 'GET', query: { k: 'inv', id: invId, t: tokenOf(payUrl) } }, pg);
      const sess = globalThis.__stripeCalls[s0];
      check(pg.code === 303 && sess && sess.mode === 'payment' && sess.line_items.length === 1 && sess.line_items[0].price_data.product_data.name === `BOOM invoice · ${numOf(P1)}-FS`
        && sess.line_items[0].price_data.product_data.description === `BOOM Paris — Full Search · order ${numOf(P1)} · lease signed 10 Apr 2029` && sess.line_items[0].price_data.unit_amount === 50000
        && sess.metadata.service === 'INVOICE' && sess.metadata.invoiceId === invId && sess.customer_email === 'claire@example.com',
        'opening the link: ONE Checkout session, the English product «BOOM invoice · <number>», the invoice description, €500.00, INVOICE metadata (spec §5.5 option A)', JSON.stringify(sess && sess.line_items));
      const back = mkRes2();
      await payLinkPage({ method: 'GET', query: { k: 'inv', id: invId, t: tokenOf(payUrl), return: 'success' } }, back);
      check(back.body.includes('<html lang="en">') && back.body.includes('BOOM · PAYMENTS') && back.body.includes('Confirmation on its way') && back.body.includes('<dt>Due</dt><dd>17 April 2029</dd>') && !/Fattura|Scadenza|PAGAMENTI/.test(back.body),
        'the return page speaks English: lang en, brand, title, due date');
      const m0 = globalThis.deliveryMails.length;
      const wh = await stripeHook(paidEvent(invId, 'cs_test_claire1', 500, 'claire@example.com'));
      const lp = L(P1), ip = DB.get('invoices/' + invId);
      check(wh.code === 200 && wh.body.invoice === true && ip.status === 'paid' && ip.paidVia === 'stripe', 'the INVOICE webhook: the invoice is paid');
      check(lp.paid === true && lp.paidVia === 'link' && lp.paidInvoiceId === invId && typeof lp.paidAt === 'string' && lp.booked === true && lp.city.order.number === numOf(P1),
        'the ORDER is stamped: paid:true, paidAt, paidVia link, paidInvoiceId — and its city map untouched', JSON.stringify({ paid: lp.paid, via: lp.paidVia, inv: lp.paidInvoiceId }));
      const rc = globalThis.deliveryMails.slice(m0).find((m) => m.to === 'claire@example.com');
      const op = globalThis.deliveryMails.slice(m0).find((m) => m.to === 'valentino@boom-rome.com');
      check(rc && rc.subject === `Receipt — invoice ${numOf(P1)}-FS €500 ✓` && htmlText(rc.html).includes(`Payment received ✓ — invoice ${numOf(P1)}-FS for €500 is settled. Thank you.`) && rc.html.includes('BOOM Paris · tenant side') && rc.from === 'BOOM Paris <desk@example.test>' && !/Ricevuta|Pagamento ricevuto/.test(rc.html),
        'the payer\'s receipt in ENGLISH, from BOOM Paris, the desk\'s masthead', rc && rc.subject);
      check(op && /FATTURA INCASSATA €500/.test(op.subject), 'the operator\'s copy stays Italian');
      const g1 = await getTicket({ order: P1, t: orderToken(P1), city: 'paris' });
      check(g1.body.state === 'paid' && g1.body.paidOn === '2029-04-12', 'the managed ticket: PAID');
      // a second payment on the same invoice: the double-collection alarm, no new stamp
      const before = JSON.stringify(L(P1));
      const wh2 = await stripeHook(paidEvent(invId, 'cs_test_claire2', 500, 'claire@example.com'));
      check(wh2.body.doublePayment === true && JSON.stringify(L(P1)) === before && [...DB.keys()].some((k) => k.startsWith('agentNotifications/inv-double-' + invId)), 'a second payment: today\'s double-collection alarm, the order not rewritten');
      // an invoice pointing at an order that does not exist: never a phantom lead
      DB.set('invoices/cityfee_book_ghost00001', { status: 'pending', amount: 199, number: 'PAR-2029-0999-AP', lang: 'en', vatCountry: 'FR', cityLeadId: 'book_ghost00001', cityOrderNumber: 'PAR-2029-0999' }); bump('invoices/cityfee_book_ghost00001');
      const wh3 = await stripeHook(paidEvent('cityfee_book_ghost00001', 'cs_test_ghost1', 199, 'ghost@example.com'));
      check(wh3.code === 200 && DB.get('invoices/cityfee_book_ghost00001').status === 'paid' && !DB.has('leads/book_ghost00001'), 'the stamp is conditional (exists:true): an invoice whose order is gone never creates a phantom lead');
      // an Italian invoice keeps the Italian receipt
      DB.set('invoices/it-inv-1', { status: 'pending', amount: 300, number: '2029/001' }); bump('invoices/it-inv-1');
      const m1 = globalThis.deliveryMails.length;
      await stripeHook(paidEvent('it-inv-1', 'cs_test_it1', 300, 'cliente@example.it'));
      const it = globalThis.deliveryMails.slice(m1).find((m) => m.to === 'cliente@example.it');
      check(it && /^Ricevuta — fattura 2029\/001/.test(it.subject), 'an Italian invoice: the Italian receipt, as before');
    }

    section('19 · 🔔 Ricorda: only after the due date, on a tap — never automatic');
    {
      at('2029-04-15T10:00:00Z');
      const t0 = TG.length, m0 = globalThis.deliveryMails.length;
      await tgTap(`cfr:${P2}`);
      const ack = tgFrom(t0, 'answerCallbackQuery').slice(-1)[0];
      check(ack && /scade il 17\/4\/2029/.test(ack.body.text) && globalThis.deliveryMails.length === m0, 'before the due date (17 April): «il promemoria si manda dopo la scadenza», nothing sent', ack && ack.body.text);
      at('2029-04-18T10:00:00Z');
      await tgTap(`cfr:${P2}`);
      const rm = globalThis.deliveryMails.slice(m0).filter((m) => m.to === 'luc@example.com');
      check(rm.length === 1 && rm[0].subject === `Reminder — your BOOM fee invoice ${numOf(P2)}-AV` && htmlText(rm[0].html).replace(/ \./g, '.').includes(`Hi Luc, a reminder about the Attended Viewing invoice (€447) for your new home: ${payLink('inv', 'cityfee_' + P2)}. Thank you.`)
        && L(P2).signing.reminders === 1 && typeof L(P2).signing.remindedAt === 'string',
        'after the due date: ONE reminder email in English with the same link, counted on the order', rm[0] && rm[0].subject);
      const m1 = globalThis.deliveryMails.length;
      await tgTap(`cfr:${P2}`);
      check(globalThis.deliveryMails.length === m1, 'tapped again within 20 hours: «già mandato», no second reminder');
      // a bounce corrected: the invoice again, to the new address, at once
      DB.set('leads/' + B1, { ...L(B1), email: 'jonas.becker@example.com' }); bump('leads/' + B1);
      at('2029-04-11T10:00:00Z');
      const m2 = globalThis.deliveryMails.length;
      const rr = await SIGN.remindInvoice({ leadId: B1 });
      const resent = globalThis.deliveryMails.slice(m2);
      check(rr.ok === true && rr.sent === 'invoice' && resent.length === 1 && resent[0].to === 'jonas.becker@example.com' && resent[0].subject === 'Your lease is signed — the BOOM fee' && L(B1).signing.clientEmailTo === 'jonas.becker@example.com',
        'the email never left (or the address was corrected after a bounce): Ricorda sends the INVOICE again at once, to the lead\'s address now', JSON.stringify(rr && { sent: rr.sent, to: rr.to }));
      const rp = await SIGN.remindInvoice({ leadId: P1 });
      check(rp.ok === false && rp.error === 'paid', 'a paid invoice: no reminder');
      const rn = await SIGN.remindInvoice({ leadId: P3 });
      check(rn.ok === false && rn.error === 'not_invoiced', 'an order without an invoice: nothing to remind');
    }

    section('20 · the readers downstream (§6.8)');
    {
      // the brain: a booking is an A
      const sb = stage0({ market: 'paris', booked: true, paid: false, email: 'x@example.com', message: 'PARIS — order PAR-2029-0001 · Full Search · €500 at signing' }, new Map());
      check(sb.grade === 'A' && sb.final === true && stage0({ market: 'paris', email: 'x@example.com', message: 'hello' }, new Map()).grade === 'B', 'the Lead Brain: a booked order is an A (a client who said yes), a bare desk lead stays B');
      // the bounce card never says PAGATO for a booking (isPaid untouched)
      const rb = read('api/leads/_rimbalzi.js');
      const isPaidDef = rb.slice(rb.indexOf('const isPaid = '), rb.indexOf('const isDead = '));
      check(!/book_/.test(isPaidDef) && /\/\^\(svc_\|book_\)\/\.test\(p\.id\) && isCityMarket\(p\.doc\) && p\.doc\.clientEmailSentAt/.test(rb),
        'rimbalzi: isPaid never reads book_ (a booking is not «💶 PAGATO», E8); the durable-medium hint covers book_ like svc_');
      // contabile + scadenzario, on the invoices the scenario wrote (two paid: Claire FR €500, the ghost FR €199)
      const sc = mkRes2();
      await scadenzario({ method: 'POST', headers: { authorization: 'Bearer cron-signing' }, query: {}, body: { format: 'json', fiscalYear: 2029 } }, sc);
      check(sc.code === 200 && sc.body.foreignVat && sc.body.foreignVat.label === 'IVA estera — da definire' && sc.body.foreignVat.count === 2 && sc.body.foreignVat.byCountry.FR === 699
        && sc.body.foreignVat.invoices.some((i) => i.id === 'cityfee_' + P1 && i.vatCountry === 'FR' && i.amount === 500),
        'scadenzario: the fees abroad listed on their own line «IVA estera — da definire» (FR €699)', JSON.stringify(sc.body.foreignVat));
      const ivaQ2 = (sc.body.company || []).find((o) => o.key === 'iva_q2_2029');
      check(!!ivaQ2 && Math.round(ivaQ2.amount) === 66, 'scadenzario: the Italian IVA estimate (Q2 2029) counts the Italian €300 invoice only, 22% = €66 — never the €699 abroad', JSON.stringify(ivaQ2));
      const ct = mkRes2();
      await contabile({ method: 'POST', headers: { authorization: 'Bearer cron-signing' }, query: { dry: '1', year: '2029' }, body: {} }, ct);
      check(ct.code === 200 && ct.body.report.foreignVat.count === 2 && ct.body.report.foreignVat.total === 699 && /IVA estera — da definire: €699 \(2 fatture · FR €699\)/.test(ct.body.summary),
        'contabile: the same, in the morning summary', ct.body && ct.body.summary);
      // the ready reply (cityReplyText): BOOKED is never PAID, never a price
      const { cityReplyText } = M;
      const rb1 = cityReplyText({ ...L(P5), closedAt: null, closeReason: null, withdrawnAt: null });
      check(rb1 === `Hi Paul, Valentino here from BOOM Paris. Your Full Search order is in: file ${fileOf(P5)}, order ${numOf(P5)}. Nothing is charged before you sign a lease. By phone or WhatsApp — which day and time suit you for a first call?\nhttps://www.boomrome.com/paris`,
        'booked (tick on): the order is in, file and number, nothing charged before a lease, the first call', rb1);
      const rbw = cityReplyText({ ...L(P3), closedAt: null, signing: null });
      check(/We start on 20 March 2029; to start sooner, reply here\./.test(rbw), 'booked, tick off: «We start on {date}; to start sooner, reply here.»', rbw);
      const rbb = cityReplyText({ ...L(B2), signing: null });
      check(/Please reply 'Confirmed' to our email so we can start\./.test(rbb) && /BOOM Berlin\./.test(rbb), 'Berlin: «Please reply \'Confirmed\' to our email so we can start.»', rbb);
      const all = [rb1, rbw, rbb, cityReplyText(L(B1)), cityReplyText(L(P1)), cityReplyText(L(P5)), cityReplyText({ market: 'paris', name: 'Zoe', intent: 'city_search', city: { file: 'BM ABCDE' } })];
      check(all.every((t) => !/Payment received/.test(t)) && [rb1, rbw, rbb].every((t) => !/€\s?\d/.test(t)), 'never «Payment received» on a signing desk, and never a price on a booking');
      check(cityReplyText(L(P1)) === 'Hi Claire, Valentino here from BOOM Paris. Thank you — the fee is received; the invoice from Egidi Immobiliare S.r.l. is in your email.\nhttps://www.boomrome.com/paris', 'paid on a signing desk: «Thank you — the fee is received; the invoice … is in your email.»');
      check(/Congratulations on the lease\. The invoice for your Full Search fee is in your email/.test(cityReplyText(L(B1))) && /is closed\. Nothing was charged, and nothing is due\./.test(cityReplyText(L(P5))),
        'invoiced: the invoice is in the email; closed: nothing was charged and nothing is due');
      const sell = cityReplyText({ market: 'paris', name: 'Zoe', intent: 'city_search', city: { file: 'BM ABCDE' } });
      check(sell.endsWith("If you'd rather order now — nothing is charged before you sign a lease: https://www.boomrome.com/paris#order-full-search") && !/#pay-full-search/.test(sell),
        'the selling branch on a signing desk ends on #order-full-search («nothing is charged before you sign a lease»), never #pay-', sell);
      check(cityReplyText({ market: 'amsterdam', name: 'Zoe', intent: 'city_search', city: { file: 'BM ABCDE' } }).endsWith("If you'd rather start now: https://www.boomrome.com/amsterdam#pay-full-search"), 'the six keep #pay-full-search');
      // Bonifica: the register is never bulk-deleted
      check(DATAOPS.isProtected('leads', L(P5)) && DATAOPS.isProtected('leads', L(P1)) && !DATAOPS.isProtected('leads', { status: 'new' }), 'Bonifica: every order of the register is protected (booked, or a register number)');
      // the conservation: the month's register as CSV, in the archive email
      at('2029-05-02T05:40:00Z');
      const regs = orderRegisters([...DB.entries()].filter(([k]) => k.startsWith('leads/')).map(([k, v]) => ({ ...v, id: k.slice(6) })), '2029-04');
      const par = regs.find((x) => x.name === 'registre-PAR-2029-04.csv'), berR = regs.find((x) => x.name === 'orders-BER-2029-04.csv');
      check(!!par && !!berR && regs.length === 2, 'orderRegisters: Paris «registre-PAR-2029-04.csv», Berlin «orders-BER-2029-04.csv»', regs.map((x) => x.name).join(' '));
      const lines = par.data.split('\r\n');
      check(par.data.charCodeAt(0) === 0xFEFF && lines[0] === '﻿number;orderedAt;name;email;plan;startNow;expiresOn;status;signedOn;invoice;paidAt;withdrawnAt;closedAt', 'the CSV: BOM, «;», the thirteen columns of spec §6.8', lines[0]);
      const rowClaire = lines.find((x) => x.startsWith(numOf(P1) + ';'));
      check(rowClaire === `${numOf(P1)};2029-03-05 11:00;Claire Martin;claire@example.com;full-search;no;2029-09-05;paid;2029-04-10;cityfee_${P1};2029-04-12;;`,
        'Claire\'s row: number, order date and time (Rome), the client, the fare, the tick, the six months, paid, signed on, the invoice, paid on', rowClaire);
      const rowPaul = lines.find((x) => x.startsWith(numOf(P5) + ';'));
      check(/;closed;;;;;2029-04-10$/.test(rowPaul) && lines.some((x) => x.startsWith(numOf(P3) + ';') && x.includes(';no_fee;')), 'Paul closed (stopped), Marie no_fee: the register says each state', rowPaul);
      check(par.rows === lines.filter((x) => /^PAR-/.test(x)).length && par.rows === 5 && !lines.some((x) => x.startsWith('BER-')), 'one CSV per desk, nothing mixed: the five Paris orders of April', String(par.rows));
      const blines = berR.data.split('\r\n');
      check(berR.rows === 2 && blines.some((x) => x.startsWith(numOf(B1) + ';')) && blines.some((x) => x.startsWith(numOf(B3) + ';')) && !blines.some((x) => x.startsWith(numOf(B2) + ';')),
        'Berlin: the two orders signed in April; Jonas\'s AP with only an unconfirmed /firmato draft is not a fact of the register yet', berR.data);
      const m0 = globalThis.deliveryMails.length;
      const cv = mkRes2();
      await conservazione({ method: 'POST', headers: { authorization: 'Bearer cron-signing' }, query: { month: '2029-04' }, body: {} }, cv);
      const arch = globalThis.deliveryMails.slice(m0).find((m) => /Conservazione 2029-04/.test(m.subject));
      const zip = arch && arch.attachments && arch.attachments[0] && arch.attachments[0].content;
      const names = [];
      for (let o = 0; zip && o + 30 <= zip.length && zip.readUInt32LE(o) === 0x04034b50;) { const nl = zip.readUInt16LE(o + 26), el = zip.readUInt16LE(o + 28), sz = zip.readUInt32LE(o + 22); names.push(zip.slice(o + 30, o + 30 + nl).toString('utf8')); o = o + 30 + nl + el + sz; }
      check(cv.code === 200 && cv.body.counts.orders === par.rows + berR.rows && arch && names.includes('2029-04/registre-PAR-2029-04.csv') && names.includes('2029-04/orders-BER-2029-04.csv') && names.includes('2029-04/00_INDICE.txt') && /registro degli ordini/.test(arch.html),
        'the conservation cron (the 2nd, no contract finalized in the month): the email still leaves, the ZIP carries the two registers and the index', JSON.stringify(names));
      const before = globalThis.deliveryMails.length;
      const cv2 = mkRes2();
      await conservazione({ method: 'POST', headers: { authorization: 'Bearer cron-signing' }, query: { month: '2029-04' }, body: {} }, cv2);
      check(cv2.body.skipped === 'already_archived' && globalThis.deliveryMails.length === before, 'a rerun: already archived, nothing resent');
      // the page's copy never carries the six's Stripe product text
      check(!JSON.stringify([...DB.entries()].filter(([k]) => k.startsWith('invoices/cityfee_'))).includes('Refunded in full'), 'no fee invoice ever carries the six desks\' refund rule (CITY_PLANS desc stays a Stripe text of the six)');
    }

    section('21 · the joints, on the source (signing)');
    {
      const hook = read('api/telegram/webhook.js');
      const dispatch = hook.indexOf('if (FIRMATO_VERBS.includes(verb)) {'), aq = hook.indexOf('const action = await fsGet(`action_queue/${actionId}`);');
      check(dispatch > -1 && aq > dispatch && /handleFirmatoCommand\(chatId, text\.slice\(8\)\.trim\(\)\)/.test(hook) && /handleChiudiCommand\(chatId, text\.slice\(7\)\.trim\(\)\)/.test(hook),
        'webhook: the cf* taps are dispatched BEFORE the action_queue lookup (an order lives in leads); /firmato and /chiudi are routed');
      const cs = read('api/payments/_citysign.js'), fm = read('api/telegram/_firmato.js');
      const code = (x) => x.replace(/\/\/.*$/gm, '');
      check(!/^\s*(fsCommit|fsCreate|sendEmail|logActivity|raise)\(/m.test(code(cs)) && !/^\s*(tgSend|tgEdit)\(/m.test(code(fm).replace(/await tgSend|await tgEdit/g, '')),
        'every write, email and log of the signing is awaited or capped (the 13/09 lesson)');
      check(!/stripe/i.test(code(cs)) && !/paymentIntents|checkout\.sessions|customers\.create|setup_intent/i.test(cs), 'the charge at signing never touches Stripe: no card saved, no off-session charge (option B off, D1)');
      const charge = cs.slice(cs.indexOf('export async function chargeAtSigning'), cs.indexOf('// ═══ cfx'));
      check(/const facts = factsOf\(s\);/.test(charge) && /signingFee\(k, c\.service, facts\)/.test(charge) && !/amount/.test(fm.slice(fm.indexOf('export function cbData'), fm.indexOf('const button'))),
        'the amount is recomputed from the server\'s own draft; the callback carries only the id and the key');
      const wh = read('api/stripe-webhook.js');
      const pa = wh.indexOf('if (inv.preAgreementId) {'), ci = wh.indexOf('if (inv.cityLeadId) {');
      check(pa > -1 && ci > pa && /docPath: 'leads\/' \+ String\(inv\.cityLeadId\), precondition: \{ exists: true \}/.test(wh) && /await fsCommit\(\[\{ docPath: 'leads\/' \+ String\(inv\.cityLeadId\)/.test(wh),
        'stripe-webhook: the order stamp comes after the proposal stamp, conditional (exists:true) and awaited; the pa-external anchor untouched');
    }

    section('11 · the guards, by mutation (each in a child)');
    {
      const probe = (name, mutation) => {
        const p = spawnSync(process.execPath, [SELF, '--probe=' + name], { env: { ...process.env, SIGNING_MUTATION: mutation || '' }, encoding: 'utf8', timeout: 60000 });
        const line = String(p.stdout || '').split('\n').find((l) => l.startsWith('PROBE '));
        return line ? JSON.parse(line.slice(6)) : { crashed: true, err: String(p.stderr || '').slice(-400) };
      };
      const b0 = probe('belt', ''), b1 = probe('belt', 'no-branch');
      check(b0.code === 200 && b0.sessions === 0 && b0.orders === 1, 'unmutated: a Paris order is booked, zero sessions', JSON.stringify(b0));
      check(b1.code === 500 && b1.error === 'signing_desk' && b1.sessions === 0 && b1.orders === 0, 'the signing branch REMOVED: the belt answers 500 signing_desk — never a mode:\'payment\' session', JSON.stringify(b1));
      const s1 = probe('stale', 'no-terms-check');
      check(s1.orders === 1, 'mutation "terms not checked" is caught: an old page\'s order gets written (the 409 above is what stops it)', JSON.stringify(s1));
      const t1 = probe('ten', 'blind-counter');
      check(Array.isArray(t1.numbers) && new Set(t1.numbers).size < t1.numbers.length, 'mutation "counter without its version" is caught: ten writers take the same number', JSON.stringify(t1));
      const k1 = probe('token', 'any-token');
      check(k1.code === 200, 'mutation "any token" is caught: the ticket answers a wrong token', JSON.stringify(k1));
      // the charge at signing (A2): each guard, removed, is caught
      // (each scenario runs twice: unmutated it holds, mutated it breaks)
      const a1u = probe('twotaps', ''), a1 = probe('twotaps', 'blind-claim');
      check(a1u.emails === 1 && a1.emails === 2, 'mutation "claim without its version" is caught: two ✅ at once — one email unmutated, two with the blind claim', JSON.stringify([a1u, a1]));
      const a2u = probe('window', ''), a2 = probe('window', 'no-window');
      check(a2u.feeAllowed === false && a2.feeAllowed === true, 'mutation "no withdrawal-window gate" is caught: a lease signed inside the 14 days without «anticipo» — no fee card unmutated, a fee card without the gate', JSON.stringify([a2u, a2]));
      const a3u = probe('stacking', ''), a3 = probe('stacking', 'no-stacking');
      check(a3u.feeAllowed === false && a3.feeAllowed === true, 'mutation "no stacking gate" is caught: a Berlin AV beside an open Full Search — refused unmutated, a fee card without the gate', JSON.stringify([a3u, a3]));
      const a4u = probe('resend', ''), a4 = probe('resend', 'resend-email');
      check(a4u.emails === 1 && a4.emails === 2, 'mutation "email not guarded" is caught: a resumed charge — one email unmutated, a second one without the guard', JSON.stringify([a4u, a4]));
      const a5u = probe('stalekey', ''), a5 = probe('stalekey', 'no-key-check');
      check(a5u.error === 'stale_card' && a5u.invoice === false && a5.invoice === true && !a5.error, 'mutation "card key not checked" is caught: an older card — «Card superata» unmutated, the newer draft\'s invoice issued without the check', JSON.stringify([a5u, a5]));
      const a6u = probe('citystamp', ''), a6 = probe('citystamp', 'no-city-stamp');
      check(a6u.paid === true && a6.invoicePaid === true && a6.paid === false, 'mutation "no order stamp" is caught: the invoice paid — the order stamped unmutated, still unpaid without the stamp', JSON.stringify([a6u, a6]));
    }
  }
} finally {
  for (const k of ['paris', 'berlin']) { for (const f of Object.keys(CITY_MARKETS[k])) delete CITY_MARKETS[k][f]; Object.assign(CITY_MARKETS[k], saved[k]); }
  globalThis.Date = RealDate;
}

if (!PROBE) {
  check(JSON.stringify(CITY_MARKETS.paris) === JSON.stringify(saved.paris) && JSON.stringify(CITY_MARKETS.berlin) === JSON.stringify(saved.berlin), 'the registry is restored (the patch never leaks into another suite)');
  console.log(`\n  ${ok} passed, ${ko} failed`);
}
process.exit(ko ? 1 : 0);
