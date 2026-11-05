// api/_cityorder.js — THE ORDER of a desk that charges at signing (Paris and
// Berlin from the v1.8 flip; spec §3.4, §5.2–§5.4, D1 D5 D8 D18).
//
// The six desks sell through a Stripe Checkout at the order. A signing desk
// never opens a payment session (api/service-checkout.js branches here right
// after cityOffer, and its belt refuses the session if this branch were ever
// removed): the order is concluded on BOOM's own button, the server answers
// BOOKED, and the email IS the contract — in Paris the numbered,
// non-exclusive search mandate, six months at most; in Berlin the search
// order in text form. The fee is invoiced only when a lease is signed
// (api/payments/_citysign.js, stage A2), with the stable pay link of the
// commission rail. No card is taken here (D1, `cardStep:false`).
//
// What one POST does, in order (every write awaited — the 13/09 lesson):
//   1. validates the name, the email and the TERMS VERSION the page was built
//      with (api/_cityterms.js): an older page is refused with 409
//      terms_changed and nothing is written — a client is never given terms
//      other than the ones on the page they ordered from;
//   2. the id is decided BEFORE the write: leads/book_<the page's per-load
//      requestId> (book_srv_<12 hex> without one), so a double tap or a retry
//      after a timeout lands on the same document; the file nickname is
//      fileCode(id) (js/scalo-codes.js), like every city lead;
//   3. an OPEN order of the same person (email), desk and fare is answered
//      as it is (a new tab, a second visit): one order, one number, one email;
//   4. the 14-day withdrawal window is counted from NOW on the desk's
//      calendar (api/_withdrawal.js, the six's copy) — always, because the
//      right exists whatever the tick says; the work starts after it unless
//      the client ticked "Start now";
//   5. ONE conditional commit writes the order AND moves the desk's counter
//      (heartbeat/city-orders-<slug>: the number is <PREFIX>-<Rome year>-
//      <0000>, gapless, chronological — Paris's register of mandates).
//      A conflict re-reads: our order already in = a retry, answered; else
//      someone else took the number, so we read the counter again — at most
//      12 attempts with 20–100 ms of jitter (ten writers at once need up to
//      ten), then 503 busy;
//   6. the order document is built IN MEMORY (api/_cityorderpdf.js; no
//      Storage), after the commit — the number exists only then. The
//      client's name prints as typed; a character the document font cannot
//      print (a Chinese name, an emoji) prints as «?», is recorded on the
//      order (orderPdf.unprinted) and raises agentNotifications/book-pdf-<id>:
//      the contract copy never loses a letter in silence (finding F4);
//   7. the client's email (Nodemailer, the shared design system) and the
//      operator's copy (Italian), both with the PDF, under one 8 s cap; the
//      outcome is RECORDED on the order (never assumed), and a failed client
//      email raises agentNotifications/book-mail-<id>: the email is the
//      durable medium of the withdrawal right, so the operator sends it by
//      hand;
//   8. the operator's card (agentNotifications/lead-<id> → Telegram) and the
//      activity log, under a 5 s cap;
//   9. the answer the page stamps BOOKED with: { ok, booked, id, file,
//      number, plan, startNow, workFromLabel }.
// A retry that finds an order whose email outcome was never recorded (the
// function died between the commit and the email) and is older than 90 s
// raises the same book-mail alarm: nothing is resent automatically.
//
// The order record is a TENANT lead in the shared `leads` schema, so the
// existing machine reads it (market = the desk: the Commerciale stands down,
// the card names the city). It is `booked: true, paid: false` and its intent
// is `city_booking` — NEVER `city_order`, the six's PAID orders.

import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsCommit, fsCreate, fsList, logActivity } from './homie/_lib.js';
import { sendEmail } from './agent/_lib.js';
import { shell, para, fine, btn, hero, tiles, timeline, rule } from './preagreement/_notify.js';
import { CITY_MARKETS, cityPhone, moneyOf } from './_market.js';
import { ORDER_TERMS, termsHash, renderOrderTerms, orderExpiresOn } from './_cityterms.js';
import { withdrawalWindow, WITHDRAWAL_FORM_URL, WITHDRAWAL_FORM_TEXT } from './_withdrawal.js';
import { buildOrderPdf } from './_cityorderpdf.js';
import { orderToken } from './payments/_token.js';
import { attributionFromReq } from './_attribution.js';
import SCALO from '../js/scalo-codes.js';

const SITE = 'https://www.boomrome.com';
const DESK_EMAIL = 'hello@boom-rome.com';
const operatorAddress = () => process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const REQUEST_RE = /^[a-z0-9]{8,40}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_ATTEMPTS = 12;
const MAIL_CAP_MS = 8000;
const CARD_CAP_MS = 5000;
const ALARM_AFTER_MS = 90 * 1000;

// What the page of a signing desk prints too: the fee trigger of each fare
// and the three next steps of the BOOKED card (cities/<slug>.json
// pricing.plans[].trigger and checkoutCopy.booked.next / nextWait — spec §4,
// D18). The email repeats them word for word; tests/cities/signing.mjs
// compares the two copies once the desk JSON carries them (the flip).
const TRIGGER_AP = 'Nothing is charged unless you sign for a home you applied to with our dossier.';
const TRIGGER_AV = 'Nothing is charged unless you sign for the home we viewed.';
const STEP_BRIEF = 'your brief: dates, budget, who’s moving';
const STEP_FEE = ['When you sign', 'the fee, once, with the invoice'];
export const ORDER_COPY = Object.freeze({
  paris: {
    triggers: {
      'full-search': 'Nothing is charged before you sign the lease we helped you get, and nothing if you never do.',
      'application-pack': TRIGGER_AP,
      'attended-viewing': TRIGGER_AV,
    },
    next: [['First desk hour', 'your order by email, with what we need'], ['Same working day', STEP_BRIEF], STEP_FEE],
    nextWait: [['First desk hour', 'your order by email, with your start date'], ['When the 14 days end', STEP_BRIEF], STEP_FEE],
  },
  berlin: {
    triggers: {
      'full-search': 'Nothing is charged before you sign a lease for a home we brought you, and nothing if you never do.',
      'application-pack': TRIGGER_AP,
      'attended-viewing': TRIGGER_AV,
    },
    next: [['First desk hour', 'your order by email: reply ‘Confirmed’'], ['Same working day', STEP_BRIEF], STEP_FEE],
    nextWait: [['First desk hour', 'your order by email: reply ‘Confirmed’'], ['When the 14 days end', STEP_BRIEF], STEP_FEE],
  },
});

const clip = (v, n) => (v == null ? '' : String(v).trim().slice(0, n));
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── dates: Rome, from fixed month tables (never Intl's month names) ────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROME = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
function romeDay(at) {
  const p = {};
  for (const x of ROME.formatToParts(at)) if (x.type !== 'literal') p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
const dayLong = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const dayShort = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
const dayIt = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const giorno = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} ${MESI[m - 1]} ${y}`; };

// a promise under a cap: { ok:true } | { ok:false, error }; the timer never
// outlives the race (a pending timer would hold the function open)
function capped(promise, ms) {
  let t;
  const cap = new Promise((r) => { t = setTimeout(() => r({ ok: false, error: 'timeout' }), ms); });
  return Promise.race([
    Promise.resolve(promise).then(() => ({ ok: true }), (e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 300) })),
    cap,
  ]).finally(() => clearTimeout(t));
}

/**
 * Is this stored lead an OPEN order of this desk and fare? Open = a booking
 * (book_…, booked:true) not paid, not withdrawn, not closed, whose lease has
 * not been declared signed (signing invoicing / invoiced / no_fee), and — for
 * an order with a length (Paris, six months) — not past its last day.
 * Exported for the test.
 */
export function isOpenOrder(l, city, plan, today) {
  if (!l || !/^book_/.test(String(l.id || '')) || l.booked !== true || l.market !== city) return false;
  const c = l.city && typeof l.city === 'object' ? l.city : {};
  if (c.service !== plan) return false;
  if (l.paid === true || l.withdrawnAt || l.closedAt) return false;
  if (l.signing && ['invoicing', 'invoiced', 'no_fee'].includes(l.signing.status)) return false;
  const exp = c.order && c.order.expiresOn;
  if (exp && String(today) > String(exp)) return false;
  return true;
}

// the answer the page stamps BOOKED with, from a stored order (a retry, the
// same person again): the STORED plan and start, never the new request's
function answerOf(l, extra) {
  const c = (l && l.city) || {};
  return {
    ok: true, booked: true, id: l.id,
    file: c.file || null,
    number: (c.order && c.order.number) || null,
    plan: c.service || null,
    startNow: c.startNow === true,
    workFromLabel: c.workFromLabel || null,
    ...extra,
  };
}

async function raise(docId, fields) {
  try { await fsCreate('agentNotifications', { status: 'pending', actor: 'city-order', createdAt: new Date().toISOString(), attempts: 0, dedupKey: docId, ...fields }, docId); }
  catch (e) { if (!(e && e.exists)) console.warn('[city-order] notification failed:', e && e.message); }
}

// the function died between the commit and the email (no outcome recorded)
// and the order is older than 90 s (a first run still in flight is not a
// failure): the operator is told — the email is never resent by itself
async function alarmIfSilent(l) {
  if (!l || l.clientEmailSentAt || l.clientEmailFailedAt) return;
  const c = l.city || {};
  const born = Date.parse(c.orderedAt || l.createdAt || '');
  if (!Number.isFinite(born) || Date.now() - born <= ALARM_AFTER_MS) return;
  const desk = CITY_MARKETS[l.market] || {};
  await raise('book-mail-' + l.id, {
    type: 'city.order_email_missing', priority: 'high',
    ref: { collection: 'leads', id: l.id },
    summary: `📭 Ordine ${(c.order && c.order.number) || l.id} (${desk.labelIt || desk.label || l.market}): nessuna traccia dell'email d'ordine al cliente — verificare e mandarla a mano, col testo del recesso e il PDF dell'ordine.`,
  });
}

// ── the emails ─────────────────────────────────────────────────────────────
function clientEmail(o) {
  const copy = ORDER_COPY[o.city];
  const first = o.name.split(/\s+/)[0] || 'there';
  const starts = o.startNow ? 'The desk’s first open hour' : `From ${o.workFromLabel}`;
  const steps = (o.startNow ? copy.next : copy.nextWait).map(([title, note]) => ({ title, note: esc(note) }));
  const online = `${SITE}/withdrawal?desk=${encodeURIComponent(o.deskLabel)}&ref=${encodeURIComponent(o.number)}#online`;
  const form = `${WITHDRAWAL_FORM_URL}?desk=${encodeURIComponent(o.deskLabel)}&service=${encodeURIComponent(o.plan)}`;
  const terms = `${SITE}/terms#city-${o.city}`;
  const a = (href, label) => `<a href="${esc(href)}" style="color:#8A6D1D">${esc(label || href)}</a>`;
  const mandate = o.city === 'paris'
    ? para(`This order is your non-exclusive search mandate, number ${esc(o.number)}. It runs until you sign or stop it, six months at most (until ${esc(dayLong(o.expiresOn))}).`)
    : para(`You asked BOOM ${esc(o.deskLabel)}, run by Egidi Immobiliare S.r.l., to search for a home to rent for you, on your behalf only. <b>Please reply ‘Confirmed’ to this email: we approach landlords only after your reply.</b>`);
  const termsBody = (o.termsEn || []).map((p) => fine(esc(p), 'margin:8px 0 0;')).join('');
  const inner = [
    para(`Hi ${esc(first)}, your order is in. Nothing is charged before you sign a lease.`),
    hero({ eyebrow: `Order ${o.number}`, value: `${esc(o.planLabel)} · ${esc(o.price)}`, note: `VAT included. ${esc(copy.triggers[o.plan])}` }),
    tiles([{ k: 'Order', v: esc(o.number) }, { k: 'File', v: esc(o.file) }, { k: 'Starts', v: esc(starts) }]),
    mandate,
    para(o.startNow
      ? 'You ticked “Start now”: we begin in the desk’s first open hour.'
      : `You did not tick “Start now”: we begin on ${esc(o.workFromLabel)}, after your 14-day withdrawal period. To start sooner, reply to this email.`),
    para('When you sign: an invoice from Egidi Immobiliare S.r.l. with a secure payment link. Nothing before, and nothing if you never sign. We hold no client money, deposit or rent.'),
    timeline(steps),
    para(`You can withdraw within 14 days, until ${esc(dayLong(o.withdrawalEndsOn))}: online at ${a(online, 'Withdraw from contract here')}, by email to ${a('mailto:' + DESK_EMAIL, DESK_EMAIL)}, or with the model withdrawal form at ${a(form)}. Nothing has been paid and nothing will be due.`),
    btn(o.manageUrl, 'Manage your order'),
    fine(`Your order document is attached (${esc(o.filename)}) and its English text is printed below. Terms: ${a(terms)}.`),
    rule(),
    fine(`<b>${esc(o.title)}</b>`, 'margin:0;'),
    termsBody,
    // the model form travels in the email itself (Directive 2011/83/EU art. 6(1)(h), 8(7)): it is in the terms above; said again on its own line only if the terms ever stop carrying it
    (o.termsEn || []).some((p) => p.includes(WITHDRAWAL_FORM_TEXT)) ? '' : fine(esc(WITHDRAWAL_FORM_TEXT)),
  ].join('');
  return {
    subject: `Your BOOM ${o.deskLabel} order — ${o.planLabel} · paid only when you sign`,
    html: shell(inner, `Order ${o.number} · file ${o.file} · nothing is charged before you sign a lease`, { tag: `BOOM ${o.deskLabel} · tenant side` }),
  };
}

function operatorEmail(o) {
  const row = (k, v) => `<tr><td style="padding:6px 14px 6px 0;color:#6E6A60;font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:13px;color:#141414">${v}</td></tr>`;
  const deskIt = o.labelIt || o.deskLabel;
  const inner = [
    para(`Nuovo ordine dal desk di ${esc(deskIt)}: <b>niente è stato addebitato</b>. La provvigione si fattura solo alla firma di una locazione (fattura Egidi + link di pagamento).`),
    hero({ eyebrow: `Ordine ${o.number}`, value: `${esc(o.planLabel)} · ${esc(o.price)}`, note: 'alla firma della locazione, IVA inclusa' }),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">${[
      row('Cliente', esc(o.name)),
      row('Email', esc(o.email)),
      row('Telefono', esc(o.phone || '—')),
      row('Nota', esc(o.note || '—')),
      row('File', esc(o.file)),
      row('Inizio', o.startNow ? 'subito (ha spuntato «Start now»)' : `dal ${esc(giorno(o.workFrom))} — NON ha chiesto di iniziare subito`),
      row('Recesso', `fino al ${esc(giorno(o.withdrawalEndsOn))}`),
      o.expiresOn ? row('Scadenza', `${esc(giorno(o.expiresOn))} (mandato di sei mesi, non esclusivo)`) : '',
      row('Termini', `${esc(o.termsV)} · ${esc(o.termsHash.slice(0, 12))}…`),
      row('Record', `leads/${esc(o.id)}`),
    ].join('')}</table>`,
    o.city === 'berlin'
      ? para('Berlino: nessun locatore va contattato per questo cliente prima che risponda «Confirmed» all\'email d\'ordine (forma testuale).')
      : para(`Parigi: è il mandato n. ${esc(o.number)} del registro dei mandati, in ordine di data.`),
    para(`Quando firma la locazione: <b>/firmato ${esc(o.file)} AAAA-MM-GG</b> su Telegram.`),
    fine(o.pdfOk ? `Il documento d'ordine è allegato (${esc(o.filename)}), lo stesso che riceve il cliente.` : '⚠ Il PDF dell\'ordine NON è stato generato: il cliente riceve i termini nel corpo dell\'email.'),
    o.pdfOk && o.unprinted && o.unprinted.length
      ? fine(`⚠ Nel PDF alcuni caratteri del nome o dell'email non sono stampabili (${esc(o.unprinted.join(' '))}): compaiono come «?». Il nome esatto è quello qui sopra.`)
      : '',
  ].join('');
  return {
    subject: `📌 ${String(deskIt).toUpperCase()} — ORDINE ${o.number} · ${o.planLabel} ${o.price} alla firma (niente addebitato)`,
    html: shell(inner, `${o.name} · ${o.planLabel} · file ${o.file}`, { tag: `BOOM ${o.deskLabel} · ordini` }),
  };
}

/**
 * POST /api/service-checkout on a desk whose registry says chargeAt
 * 'signing'. The caller (api/service-checkout.js) has already run the
 * honeypot, the per-IP rate limit and cityOffer (the city sells, the plan
 * exists, the price is the registry's).
 * @param req  the request (headers for attribution)
 * @param res  the response
 * @param ctx  { offer: cityOffer(...) with chargeAt 'signing', body, ip }
 */
export async function createCityOrder(req, res, { offer, body = {}, ip = 'unknown' } = {}) {
  const city = offer.city;
  const plan = offer.plan;
  const desk = CITY_MARKETS[city];
  const T = own(ORDER_TERMS, city);
  const copy = own(ORDER_COPY, city);
  const prefix = desk && desk.order && typeof desk.order.prefix === 'string' ? desk.order.prefix : '';
  // a signing desk without its terms, its copy or its register prefix cannot
  // conclude an order truthfully: refused before anything is written
  if (!desk || !T || !copy || !prefix) return res.status(500).json({ ok: false, error: 'order_unconfigured' });

  // 1 · the fields (the six's till: name, email, note, the tick)
  const name = clip(body.name, 120);
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'name' });
  const email = clip(body.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email' });
  if (String(body.termsV || '') !== T.v) return res.status(409).json({ ok: false, error: 'terms_changed', termsV: T.v });
  const note = clip(body.notes != null ? body.notes : body.note, 400);
  const phoneTyped = clip(body.phone, 40);
  const phone = phoneTyped ? (cityPhone(phoneTyped, city) || phoneTyped) : null;
  const startNow = body.startNow === true;

  // 2 · the id, decided before the write
  const rid = REQUEST_RE.test(String(body.requestId || '')) ? String(body.requestId).toLowerCase() : null;
  const serverId = () => `book_srv_${crypto.randomBytes(6).toString('hex')}`;
  let id = rid ? `book_${rid}` : serverId();
  let file = SCALO.fileCode(id);

  // 4 · the window and the dates, from NOW (the order is concluded on this POST)
  const now = new Date();
  const today = romeDay(now);
  const orderedAt = now.toISOString();
  const win = withdrawalWindow(Math.floor(now.getTime() / 1000), desk.holidays || desk.country || null);
  const workFrom = startNow ? null : win.startDay;
  const workFromLabel = startNow ? null : win.startLabel;
  const expiresOn = orderExpiresOn(city, now);
  const romeYear = Number(today.slice(0, 4));

  // the terms must render for this client BEFORE a number is spent on them
  // (the same shape of number; renderOrderTerms refuses a prefix that is not
  // the desk's, a name or a date it cannot print truthfully)
  try {
    renderOrderTerms({ city, plan, number: `${prefix}-${romeYear}-0001`, name, email, orderedAt, withdrawalEndsOn: win.lastDay, workFrom, expiresOn, startNow });
  } catch (e) {
    console.error('[city-order] terms do not render:', e && e.code);
    return res.status(500).json({ ok: false, error: 'terms_unrenderable' });
  }

  // 3 · the same person's OPEN order of this desk and fare is answered as it is
  try {
    const rows = await fsList('leads', { filter: { field: 'email', op: 'EQUAL', value: email }, limit: 20 });
    const open = (rows || []).find((l) => isOpenOrder(l, city, plan, today));
    if (open) {
      await alarmIfSilent(open);
      return res.status(200).json(answerOf(open, open.id === id ? { duplicate: true } : { duplicate: true, sameOrder: true }));
    }
  } catch (e) {
    // best effort: without the read the order is still written once per page
    // load (the commit below refuses a second book_<requestId>)
    console.warn('[city-order] open-order read failed:', e && e.message);
  }

  // 5 · ONE commit: the order and the desk's counter
  const price = moneyOf(offer.eur, offer.currency);
  const termsHashV = termsHash(city);
  const counterPath = `heartbeat/city-orders-${city}`;
  const buildLead = (number) => {
    const head = `${desk.label.toUpperCase()} — order ${number} · ${offer.label} · ${price} at signing · nothing charged · file ${file} · start: ${startNow ? 'now' : 'from ' + dayShort(workFrom)}`;
    const message = note ? `${head}. Notes: ${note}.` : head;
    return {
      type: 'service',
      status: 'new',
      source: 'web',
      leadType: 'tenant',
      language: 'en',
      market: city,
      sourceRef: `city-${city}`,
      intent: 'city_booking',
      service: `BOOM ${desk.label}`,
      kind: plan,
      name, email, phone, note: note || null,
      attribution: attributionFromReq(req, body),
      message,
      notes: message,
      booked: true,
      paid: false,
      city: {
        key: city, label: desk.label, mode: 'search', chargeAt: 'signing',
        service: plan, serviceLabel: offer.label, price: offer.eur, currency: offer.currency, file,
        startNow, orderedAt, withdrawalEndsOn: win.lastDay, workFrom, workFromLabel,
        order: { number, termsV: T.v, termsHash: termsHashV, expiresOn },
      },
      ingestedBy: 'city-order',
      raw: { city, kind: plan, startNow, requestId: rid, termsV: String(body.termsV), phone: phoneTyped || null, ip },
      createdAt: now,
      ingestedAt: now,
    };
  };

  let number = null;
  let committed = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !committed; attempt++) {
    let cnt;
    try { cnt = await fsGetVersioned(counterPath); }
    catch (e) { console.error('[city-order] counter read failed:', e && e.message); return res.status(503).json({ ok: false, error: 'unavailable' }); }
    // the register runs per Rome year and never backwards: a counter already
    // in a later year (another instance crossed midnight first) keeps it
    // (a counter whose year or next is not a number is refused: renumbering
    // from 0001 could give a number twice — never invented)
    let year = romeYear, n = 1;
    if (cnt && cnt.data) {
      const cy = cnt.data.year;
      if (!Number.isInteger(cy) || (cy >= romeYear && !(Number.isInteger(cnt.data.next) && cnt.data.next >= 1))) {
        console.error('[city-order] counter unreadable:', counterPath);
        return res.status(500).json({ ok: false, error: 'counter_invalid' });
      }
      if (cy >= romeYear) { year = cy; n = cnt.data.next; }
    }
    number = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    try {
      await fsCommit([
        { docPath: counterPath, fields: { year, next: n + 1, updatedAt: now }, precondition: cnt ? { updateTime: cnt.updateTime } : { exists: false } },
        { docPath: `leads/${id}`, fields: buildLead(number), precondition: { exists: false } },
      ]);
      committed = true;
    } catch (e) {
      if (!(e && e.conflict)) {
        console.error('[city-order] commit failed:', e && e.message);
        return res.status(503).json({ ok: false, error: 'unavailable' });
      }
      // our order may already be in: the same page load, retried
      let stored;
      try { stored = await fsGet(`leads/${id}`); }
      catch (_) { return res.status(503).json({ ok: false, error: 'unavailable' }); }
      if (stored && stored.market === city && stored.booked === true) {
        await alarmIfSilent(stored);
        return res.status(200).json(answerOf(stored, { duplicate: true }));
      }
      // a requestId another desk's order already holds (only a hand-made
      // POST can reuse one): this order takes a server id, never the other's
      if (stored) { id = serverId(); file = SCALO.fileCode(id); continue; }
      // someone else took this number: read the counter again
      await sleep(20 + Math.floor(Math.random() * 81));
    }
  }
  if (!committed) return res.status(503).json({ ok: false, error: 'busy' });

  // 6 · the order document, in memory
  const o = {
    city, plan, number, name, email, phone, note, startNow, file, id, price,
    planLabel: offer.label, deskLabel: desk.label, labelIt: desk.labelIt || null,
    orderedAt, withdrawalEndsOn: win.lastDay, workFrom, workFromLabel, expiresOn,
    termsV: T.v, termsHash: termsHashV, title: T.title,
    manageUrl: `${desk.url}?order=${encodeURIComponent(id)}&t=${orderToken(id)}`,
    filename: `BOOM-${number}.pdf`,
  };
  let pdf = null, pdfError = null;
  try { pdf = await buildOrderPdf({ ...o, orderedAt: now }); }
  catch (e) { pdfError = String((e && (e.code || e.message)) || e).slice(0, 200); console.error('[city-order] pdf failed:', pdfError); }
  o.pdfOk = !!pdf;
  o.unprinted = pdf ? pdf.unprinted : [];
  try { o.termsEn = (pdf ? pdf.terms : renderOrderTerms({ ...o, orderedAt: now })).en; }
  catch (_) { o.termsEn = []; }
  const attachments = pdf ? [{ filename: pdf.filename, content: pdf.bytes, contentType: 'application/pdf' }] : undefined;

  // 7 + 8 · the two emails and the operator's card, in parallel, each capped
  const from = process.env.GMAIL_USER ? `BOOM ${desk.label} <${process.env.GMAIL_USER}>` : undefined;
  const ce = clientEmail(o), oe = operatorEmail(o);
  const cardSummary = `${desk.flag} ${String(desk.labelIt || desk.label).toUpperCase()} · ORDINE ${number} · ${offer.label} ${price} alla firma · file ${file} · ${name} · ${startNow ? 'inizio subito' : 'dal ' + dayIt(workFrom)}`;
  const card = fsCreate('agentNotifications', {
    type: 'lead.new', priority: 'high', status: 'pending', actor: 'city-order',
    summary: cardSummary,
    ref: { collection: 'leads', id },
    payload: { name, email, phone, city, service: plan, number, file, source: 'city-order' },
    dedupKey: `lead-${id}`, createdAt: new Date().toISOString(), attempts: 0,
  }, `lead-${id}`).catch((e) => { if (!(e && e.exists)) console.warn('[city-order] card failed:', e && e.message); });
  const activity = Promise.resolve(logActivity(`Ordine ${desk.label} ${number} (${offer.label}, alla firma)`, 'lead', { leadId: id, city, service: plan, number }, 'city-order')).catch(() => {});
  const [cr, orr] = await Promise.all([
    capped(sendEmail({ to: email, subject: ce.subject, html: ce.html, attachments, ...(from ? { from } : {}) }), MAIL_CAP_MS),
    capped(sendEmail({ to: operatorAddress(), subject: oe.subject, html: oe.html, attachments, replyTo: email }), MAIL_CAP_MS),
    capped(Promise.allSettled([card, activity]), CARD_CAP_MS),
  ]);

  // the outcome, RECORDED on the order (top-level fields: the `city` map is never rewritten)
  const at = new Date().toISOString();
  const outcome = {
    orderPdf: pdf
      ? { sha256: pdf.sha256, bytes: pdf.bytes.length, pages: pdf.pages, at, ...(pdf.unprinted.length ? { unprinted: pdf.unprinted } : {}) }
      : { error: pdfError || 'failed', at },
    ...(cr.ok ? { clientEmailSentAt: at } : { clientEmailFailedAt: at, clientEmailError: cr.error }),
    ...(orr.ok ? { operatorEmailSentAt: at } : { operatorEmailError: orr.error }),
  };
  try { await fsCommit([{ docPath: `leads/${id}`, fields: outcome, precondition: { exists: true } }]); }
  catch (e) { console.warn('[city-order] outcome not recorded:', e && e.message); }
  // the contract copy could not print the client's name (or email) as typed:
  // the operator is told what the PDF shows instead; nothing is resent
  if (pdf && pdf.unprinted.length) {
    await raise('book-pdf-' + id, {
      type: 'city.order_pdf_unprinted', priority: 'high',
      ref: { collection: 'leads', id },
      summary: `📄 Ordine ${number} (${desk.labelIt || desk.label}): nel PDF dell'ordine ${pdf.unprinted.length === 1 ? 'un carattere' : pdf.unprinted.length + ' caratteri'} del nome o dell'email del cliente (${pdf.unprinted.join(' ')}) non ${pdf.unprinted.length === 1 ? 'è stampabile e compare' : 'sono stampabili e compaiono'} come «?». Nome registrato: ${name}. Il resto del documento è giusto e l'email al cliente riporta il nome per intero: se serve, chiedigli come scriverlo in caratteri latini.`,
    });
  }
  if (!cr.ok) {
    await raise('book-mail-' + id, {
      type: 'city.order_email_failed', priority: 'high',
      ref: { collection: 'leads', id },
      summary: `📭 Ordine ${number} (${desk.labelIt || desk.label}): l'email d'ordine al cliente NON è partita (${cr.error}) — mandala a mano, col testo del recesso e il PDF dell'ordine.`,
    });
  }

  return res.status(200).json({ ok: true, booked: true, id, file, number, plan, startNow, workFromLabel });
}
