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
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), method = opts.method || 'GET';
  if (u.hostname === 'identitytoolkit.googleapis.com') return json({ idToken: 'tok' });
  if (u.hostname === 'api.telegram.org') return json({ ok: true });
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
      .filter((k) => !ff || (ff.op === 'EQUAL' && DB.get(k)[ff.field.fieldPath] === dec(ff.value)))
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
