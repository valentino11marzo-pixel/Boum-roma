// api/payments/_citysign.js — THE CHARGE AT SIGNING of a desk that books
// orders (Paris and Berlin, the orders booked between the v1.8 flip of
// 05/11 and the card flip of 06/11/2026; spec §6, D1 D3 D4 D7 D15 D16).
//
// The order (api/_cityorder.js) took no money and no card: the fee becomes
// due only when a lease is signed, and only for the home the fare names. The
// operator — never a cron — declares the signing on Telegram
// (api/telegram/_firmato.js: /firmato BM X7K2Q 2026-12-10), answers ONE
// question that IS the attestation of the facts the law makes the fee depend
// on, and a tap issues the Egidi invoice with the stable pay link of the
// commission rail (api/payments/link.js, the INVOICE webhook). Nothing is
// ever charged automatically, no card is ever saved (option B stays off).
//
//   signingFee(city, plan, facts)   the amount, from CITY_PLANS only (pure)
//   signingGates(lead, facts, ctx)  §6.3 in order, each refusal says why (pure)
//   attestationOf(lead, facts)      the question, verbatim (pure)
//   draftSigning                    /firmato: the draft + the card's key
//   chargeAtSigning                 cfy: claim → invoice (409 = reuse) → one
//                                   email → invoiced (§6.5)
//   declineAtSigning                cfx: no fee, the order closes
//   draftClose / closeOrder         /chiudi + cch
//   remindInvoice                   🔔 Ricorda: only after the due date (or
//                                   to a corrected address), on a tap
//
// The amount NEVER comes from the caller: the callback carries a lead id and
// the draft's key, the server reads the draft it wrote and recomputes. Every
// write is conditional (updateTime of the read, or exists:true) and awaited
// (the 13/09 lesson); `signing` is a top-level map rewritten whole, never
// `city` (top-level masks replace whole maps).

import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsCommit, fsCreate, fsList, logActivity } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, hero } from '../preagreement/_notify.js';
import { CITY_MARKETS, CITY_PLANS, cityMarketOf, orderChargeAt } from '../_market.js';
import { payLink, orderToken } from './_token.js';

export const PLAN_CODE = Object.freeze({ 'full-search': 'FS', 'application-pack': 'AP', 'attended-viewing': 'AV' });
export const VIEWINGS_MAX = Object.freeze({ 'full-search': 10, 'attended-viewing': 5 });
export const CLAIM_STALE_MS = 2 * 60 * 1000;
export const DUE_DAYS = 7;
const MAIL_CAP_MS = 8000;
const REMIND_GAP_MS = 20 * 60 * 60 * 1000;
const DESK_EMAIL = 'hello@boom-rome.com';

const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clip = (v, n) => (v == null ? '' : String(v).trim().slice(0, n));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// ── dates: Rome days, fixed month tables (never Intl's month names) ────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROME = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
export function romeDay(at) {
  const p = {};
  for (const x of ROME.formatToParts(at instanceof Date ? at : new Date(at))) if (x.type !== 'literal') p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
export function romeDayOf(v) {
  if (v == null || v === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? romeDay(new Date(t)) : null;
}
/** A real calendar day 'YYYY-MM-DD' (2026-02-30 is not). */
export function isDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const d = new Date(String(iso) + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
export function addDays(iso, n) {
  const d = new Date(String(iso) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayLong = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const dayShort = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
/** '10/12' — the Italian card's day */
export const dm = (iso) => { const [, m, d] = String(iso || '').split('-').map(Number); return iso ? `${d}/${m}` : ''; };
/** '4/5/2027' */
export const dmy = (iso) => { const [y, m, d] = String(iso || '').split('-').map(Number); return iso ? `${d}/${m}/${y}` : ''; };

// ── money, as each reader writes it ────────────────────────────────────────
function money(n, lang) {
  const v = round2(n);
  const [i, d] = (Number.isInteger(v) ? String(v) : v.toFixed(2)).split('.');
  const sep = lang === 'it' ? ['.', ','] : [',', '.'];
  return '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, sep[0]) + (d ? sep[1] + d : '');
}
export const eurEn = (n) => money(n, 'en');
export const eurIt = (n) => money(n, 'it');

// a promise under a cap: { ok:true } | { ok:false, error }; the timer never
// outlives the race
function capped(promise, ms) {
  let t;
  const cap = new Promise((r) => { t = setTimeout(() => r({ ok: false, error: 'timeout' }), ms); });
  return Promise.race([
    Promise.resolve(promise).then(() => ({ ok: true }), (e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 300) })),
    cap,
  ]).finally(() => clearTimeout(t));
}

// ═══ THE AMOUNT (§6.4) — from CITY_PLANS only ═══════════════════════════════
/**
 * What a fare costs at the signing, never from a caller:
 *  · Full Search, Paris: 500 + 149 × (viewings − 1) — the extra viewings at the
 *    Attended Viewing price, stated in the mandate (D14), 1–10;
 *  · Full Search, Berlin: min(500, 2 × net cold rent × (1 + 19 %)) — WoVermRG
 *    §3(2), the cap the registry's `feeCap` names (D2: €500 flat, capped);
 *    viewings are included (D15), so none is ever added;
 *  · Application Pack: 199;
 *  · Attended Viewing: 149 × viewings, 1–5.
 * → { ok:true, amount, listPrice, cap, viewings, extras, extraEach }
 *   | { ok:false, error }
 */
export function signingFee(cityKey, plan, facts = {}) {
  const k = String(cityKey || '').toLowerCase().trim();
  const desk = own(CITY_MARKETS, k);
  // the desk's order book (`order`), not its mode today: an order booked at
  // signing is invoiced at signing after the desk moved to the card (06/11)
  if (!desk || !desk.order) return { ok: false, error: 'not_signing_desk' };
  const p = own(CITY_PLANS, String(plan || ''));
  if (!p || !own(PLAN_CODE, plan)) return { ok: false, error: 'unknown_plan' };
  const list = Number(p.eur);
  const nOf = (max) => {
    const n = facts.viewings == null ? 1 : facts.viewings;
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  };
  if (plan === 'full-search') {
    if (desk.feeCap) {
      const kalt = Number(facts.coldRent);
      if (!(kalt > 0)) return { ok: false, error: 'cold_rent_required' };
      const cap = round2(Number(desk.feeCap.months) * kalt * (1 + Number(desk.feeCap.vatPct) / 100));
      if (!(cap > 0)) return { ok: false, error: 'cap_unreadable' };
      return { ok: true, amount: round2(Math.min(list, cap)), listPrice: list, cap, viewings: null, extras: 0, extraEach: 0 };
    }
    const n = nOf(VIEWINGS_MAX['full-search']);
    if (n == null) return { ok: false, error: 'viewings_out_of_range' };
    const each = Number(CITY_PLANS['attended-viewing'].eur);
    return { ok: true, amount: round2(list + each * (n - 1)), listPrice: list, cap: null, viewings: n, extras: n - 1, extraEach: each };
  }
  if (plan === 'attended-viewing') {
    const n = nOf(VIEWINGS_MAX['attended-viewing']);
    if (n == null) return { ok: false, error: 'viewings_out_of_range' };
    return { ok: true, amount: round2(list * n), listPrice: list, cap: null, viewings: n, extras: 0, extraEach: 0 };
  }
  return { ok: true, amount: round2(list), listPrice: list, cap: null, viewings: null, extras: 0, extraEach: 0 };
}

// ═══ THE QUESTION (§6.2) — the attestation, recorded verbatim ═══════════════
/** Italian, one question per fare: the operator's «Sì» is the attestation. */
export function attestationOf(lead, facts = {}) {
  const l = obj(lead), c = obj(l.city), k = cityMarketOf(l);
  const desk = k ? CITY_MARKETS[k] : {};
  const plan = c.service;
  const head = `Contratto di locazione firmato da entrambe le parti il ${dm(facts.signedOn)}`;
  let q;
  if (plan === 'full-search' && desk.goAhead) {
    const fee = signingFee(k, plan, facts);
    q = `${head} per una casa che il proprietario ci ha autorizzato per iscritto (il ${facts.goAheadOn ? dm(facts.goAheadOn) : '—'}) a offrire SOLO a lei, dopo il suo ordine e il suo "Confirmed", non affidata a un'agenzia? Kaltmiete ${Number(facts.coldRent) > 0 ? eurIt(facts.coldRent) : '—'} → tetto ${fee.ok ? eurIt(fee.cap) : '—'}`;
  } else if (plan === 'full-search') {
    q = `${head} per una casa trovata o proposta da noi?`;
  } else if (plan === 'application-pack') {
    q = `${head} per una casa a cui il cliente si è candidato col nostro dossier?`;
  } else {
    const n = facts.viewings == null ? 1 : facts.viewings;
    q = `${head} per la casa che abbiamo visitato (${n} ${n === 1 ? 'visita' : 'visite'} di quella casa)?`;
  }
  // Berlin AP/AV: outside the WoVermRG only while the CLIENT found the home
  // and BOOM never dealt with the landlord or its agent (X1, §16 O18)
  if (plan !== 'full-search' && desk.noStacking) q += " La casa l'ha trovata il cliente e non abbiamo trattato col proprietario o il suo agente?";
  return q;
}

// ═══ THE GATES (§6.3) — in order, each refusal says why ═════════════════════
// kind: 'state' (the order cannot be signed now: message only), 'input' (the
// command is wrong: message only, nothing written), 'law' (no fee can be
// owed: the card offers only «nessun compenso»).
const refuse = (kind, gate, why) => ({ ok: false, kind, gate, why });

/** Is this lead an order of a desk that charges at signing? */
export function isSigningOrder(l) {
  const k = cityMarketOf(obj(l));
  return !!l && /^book_/.test(String(l.id || '')) && l.booked === true && !!k && orderChargeAt(l) === 'signing';
}

/**
 * §6.3, pure. `facts` = { signedOn, viewings, coldRent, goAheadOn, early };
 * ctx = { today (Rome day), otherOrders (the same email's other leads, for
 * Berlin's no-stacking rule) }.
 */
export function signingGates(lead, facts = {}, { today, otherOrders = [] } = {}) {
  const l = obj(lead), c = obj(l.city), o = obj(c.order), s = obj(l.signing);
  const k = cityMarketOf(l);
  // 1 · the order, and its state
  if (!isSigningOrder(l)) return refuse('state', 'not_order', 'Non è un ordine di un desk che incassa alla firma.');
  const desk = CITY_MARKETS[k];
  const plan = c.service;
  if (!own(PLAN_CODE, plan)) return refuse('state', 'not_order', 'L\'ordine non dice quale tariffa.');
  const wAt = l.withdrawnAt || (l.withdrawal && l.withdrawal.at);
  if (wAt) return refuse('state', 'withdrawn', `Il cliente ha esercitato il recesso il ${dmy(romeDayOf(wAt))}: nessun compenso. Decidi tu, mai in automatico.`);
  if (l.closedAt) return refuse('state', 'closed', `Ordine chiuso il ${dmy(romeDayOf(l.closedAt))}${l.closeReason ? ` (${l.closeReason})` : ''}.`);
  if (l.paid === true) return refuse('state', 'paid', 'Già pagato: niente da emettere.');
  if (s.status === 'invoiced') return refuse('state', 'invoiced', 'Fattura già emessa.');
  if (s.status === 'no_fee') return refuse('state', 'no_fee', 'Già chiuso senza compenso.');
  // 2 · the signing day: a real date, not in the future, not before the order
  const orderDay = romeDayOf(c.orderedAt || l.createdAt);
  if (!isDay(facts.signedOn)) return refuse('input', 'date', 'La data della firma non è una data vera (AAAA-MM-GG, oppure «oggi»).');
  if (today && facts.signedOn > today) return refuse('input', 'future', `La firma il ${dmy(facts.signedOn)} è nel futuro: si dichiara quando è avvenuta.`);
  if (orderDay && facts.signedOn < orderDay) return refuse('input', 'before_order', `La firma (${dmy(facts.signedOn)}) è prima dell'ordine (${dmy(orderDay)}): questo ordine non l'ha prodotta.`);
  // 3 · Paris: the mandate runs six months (Hoguet art. 7, F4)
  if (o.expiresOn && facts.signedOn > o.expiresOn) return refuse('law', 'expired', `Il mandato è scaduto il ${dmy(o.expiresOn)}, la firma è del ${dmy(facts.signedOn)}: nessun compenso è dovuto.`);
  // 4 · the withdrawal window: work done inside it without an express request
  // costs the client nothing (CRD art. 14(4)(a)(ii))
  if (c.startNow === false && c.withdrawalEndsOn && facts.signedOn <= c.withdrawalEndsOn && !facts.early) {
    return refuse('law', 'window', `Il cliente non ha chiesto di iniziare subito e la firma (${dmy(facts.signedOn)}) cade nel recesso (fino al ${dmy(c.withdrawalEndsOn)}): senza la sua richiesta scritta non è dovuto nulla. Se l'ha chiesto per iscritto, rimanda il comando con «anticipo».`);
  }
  // 5 · Berlin Full Search: only a home the landlord let us offer to this
  // client alone, in writing, after the order (Bestellerprinzip, W3/W4)
  if (plan === 'full-search' && desk.goAhead) {
    if (!(Number(facts.coldRent) > 0) || !facts.goAheadOn) {
      return refuse('law', 'goahead_missing', `Manca ${!(Number(facts.coldRent) > 0) ? 'la Kaltmiete («kalt <euro>»)' : ''}${!(Number(facts.coldRent) > 0) && !facts.goAheadOn ? ' e ' : ''}${!facts.goAheadOn ? 'la data del via libero scritto del proprietario («ok AAAA-MM-GG»)' : ''}. Rimanda /firmato coi dati; se la casa non ci è stata data per lei sola, nessun compenso.`);
    }
    if (!isDay(facts.goAheadOn)) return refuse('input', 'goahead_date', 'La data del via libero («ok») non è una data vera.');
    if (orderDay && facts.goAheadOn < orderDay) return refuse('law', 'goahead_before_order', `Il via libero (${dmy(facts.goAheadOn)}) è prima dell'ordine (${dmy(orderDay)}): la casa non è stata ottenuta per questo ordine, nessun compenso.`);
    if (facts.goAheadOn > facts.signedOn) return refuse('input', 'goahead_after_signing', `Il via libero (${dmy(facts.goAheadOn)}) non può venire dopo la firma (${dmy(facts.signedOn)}).`);
  }
  // 6 · Berlin AP/AV: never alongside a Full Search of the same client (§3(3), W9)
  if (plan !== 'full-search' && desk.noStacking) {
    const fs = (otherOrders || []).find((x) => x && x.id !== l.id && /^book_/.test(String(x.id || '')) && x.booked === true
      && x.market === k && obj(x.city).service === 'full-search' && !x.withdrawnAt && !(x.withdrawal && x.withdrawal.at) && !x.closedAt);
    if (fs) return refuse('law', 'stacking', `La stessa cliente ha un Full Search aperto (${(obj(obj(fs.city).order).number) || fs.id}): a Berlino nessun altro compenso accanto al Full Search.`);
  }
  // 7 · the viewings
  const max = plan === 'full-search' && !desk.feeCap ? VIEWINGS_MAX['full-search'] : plan === 'attended-viewing' ? VIEWINGS_MAX['attended-viewing'] : null;
  if (max && facts.viewings != null && !(Number.isInteger(facts.viewings) && facts.viewings >= 1 && facts.viewings <= max)) {
    return refuse('input', 'viewings', `Visite fuori intervallo: da 1 a ${max} per ${c.serviceLabel || plan}.`);
  }
  return { ok: true };
}

// the options that do not apply to this fare, said on the card (never applied)
export function ignoredOptions(lead, facts = {}) {
  const c = obj(obj(lead).city), k = cityMarketOf(obj(lead));
  const desk = k ? CITY_MARKETS[k] : {};
  const berlinFs = c.service === 'full-search' && !!desk.goAhead;
  const out = [];
  if (facts.coldRent != null && !berlinFs) out.push('kalt (vale solo per il Full Search di Berlino)');
  if (facts.goAheadOn && !berlinFs) out.push('ok (vale solo per il Full Search di Berlino)');
  if (facts.viewings != null && (c.service === 'application-pack' || (c.service === 'full-search' && desk.feeCap))) {
    out.push(c.service === 'full-search' ? 'visite (a Berlino sono comprese nel Full Search)' : 'visite (l\'Application Pack non ne ha)');
  }
  return out;
}

// ═══ THE INVOICE (§3.4) ═════════════════════════════════════════════════════
export const cityFeeInvoiceId = (leadId) => 'cityfee_' + String(leadId || '').replace(/[^\w-]/g, '').slice(0, 80);

/**
 * The payable record, pure (NOT the SDI e-invoice). Due within 7 days of the
 * emailed invoice, as the order terms say («payable within 7 days»): on the
 * day of the signing that is signedOn + 7; a signing declared later never
 * gives an invoice already overdue.
 */
export function cityFeeInvoiceDoc({ lead, signing, fee, today, by, now = new Date() }) {
  const l = obj(lead), c = obj(l.city), o = obj(c.order), k = cityMarketOf(l), desk = CITY_MARKETS[k];
  const code = PLAN_CODE[c.service];
  const issue = today > signing.signedOn ? today : signing.signedOn;
  const extra = fee.extras > 0 ? ` · incl. ${fee.extras} extra viewing${fee.extras === 1 ? '' : 's'} at ${eurEn(fee.extraEach)}` : '';
  const capped = fee.cap != null && fee.amount < fee.listPrice ? ` · capped at two months' net cold rent plus VAT (${eurEn(fee.cap)})` : '';
  return {
    number: `${o.number}-${code}`,
    service: `BOOM ${desk.label} — ${c.serviceLabel}`,
    description: clip(`BOOM ${desk.label} — ${c.serviceLabel} · order ${o.number} · lease signed ${dayShort(signing.signedOn)}${extra}${capped}`, 250),
    recipientName: clip(l.name, 120), recipientEmail: clip(l.email, 160), recipientId: '', clientId: '', recipientType: 'tenant',
    amount: fee.amount, netAmount: null, vatPct: null, vatAmount: null,
    vatCountry: String(desk.country || '').toUpperCase(), currency: 'eur', lang: 'en',
    status: 'pending', date: issue, dueDate: addDays(issue, DUE_DAYS),
    source: 'city-signing', cityLeadId: l.id, cityOrderNumber: o.number || null,
    createdAt: now.toISOString(), createdBy: by || 'telegram',
  };
}

/** One invoice per order (fsCreate on the deterministic id; 409 = reuse, an
 *  issued invoice is never rewritten). */
export async function ensureCityFeeInvoice({ lead, signing, fee, today, by, now }) {
  const id = cityFeeInvoiceId(lead.id);
  let inv = await fsGet('invoices/' + id);
  let created = false;
  if (!inv) {
    const doc = cityFeeInvoiceDoc({ lead, signing, fee, today, by, now });
    try { await fsCreate('invoices', doc, id); inv = { id, ...doc }; created = true; }
    catch (e) {
      if (!(e && e.exists)) throw e;
      inv = await fsGet('invoices/' + id);
      if (!inv) throw e;
    }
  }
  return { id, invoice: inv, created, amountChanged: round2(inv.amount) !== round2(fee.amount) };
}

// ═══ THE EMAILS (English, the shared design system) ════════════════════════
const SITE = 'https://www.boomrome.com';
const fromOf = (desk) => (process.env.GMAIL_USER ? { from: `BOOM ${desk.label} <${process.env.GMAIL_USER}>` } : {});
const firstOf = (l) => String(obj(l).name || '').trim().split(/\s+/)[0] || 'there';
const manageUrlOf = (l, desk) => `${desk.url}?order=${encodeURIComponent(l.id)}&t=${orderToken(l.id)}`;
const link = (href, label) => `<a href="${esc(href)}" style="color:#8A6D1D">${esc(label || href)}</a>`;

/** The invoice email (§6.5 step 4). Exported for the test. */
export function invoiceEmail({ lead, invoice, payUrl }) {
  const l = obj(lead), c = obj(l.city), k = cityMarketOf(l), desk = CITY_MARKETS[k];
  const amount = eurEn(invoice.amount);
  const manage = manageUrlOf(l, desk);
  const inner = [
    para(`Hi ${esc(firstOf(l))},`),
    hero({ eyebrow: `Invoice ${invoice.number}`, value: `${esc(c.serviceLabel)} · ${esc(amount)}`, note: `VAT included · due by ${esc(dayLong(invoice.dueDate))}` }),
    para(`Congratulations on the new home. The BOOM fee for ${esc(c.serviceLabel)}: ${esc(amount)}, VAT included. Invoice ${esc(invoice.number)} from Egidi Immobiliare S.r.l. Pay securely: ${link(payUrl)} — due by ${esc(dayLong(invoice.dueDate))}.`),
    btn(payUrl, 'Pay securely'),
    fine(`${esc(invoice.description)}.`),
    fine(`Manage your order: ${link(manage, 'Manage your order')}. Questions? Reply to this email or write to ${link('mailto:' + DESK_EMAIL, DESK_EMAIL)}.`),
  ].join('');
  return {
    subject: 'Your lease is signed — the BOOM fee',
    html: shell(inner, `Invoice ${invoice.number} · ${amount} · due by ${dayLong(invoice.dueDate)}`, { tag: `BOOM ${desk.label} · tenant side` }),
  };
}

function reminderEmail({ lead, invoice, payUrl }) {
  const l = obj(lead), c = obj(l.city), k = cityMarketOf(l), desk = CITY_MARKETS[k];
  const amount = eurEn(invoice.amount);
  const inner = [
    para(`Hi ${esc(firstOf(l))}, a reminder about the ${esc(c.serviceLabel)} invoice (${esc(amount)}) for your new home: ${link(payUrl)}. Thank you.`),
    btn(payUrl, 'Pay securely'),
    fine(`Invoice ${esc(invoice.number)} from Egidi Immobiliare S.r.l., VAT included, due by ${esc(dayLong(invoice.dueDate))}. Manage your order: ${link(manageUrlOf(l, desk), 'Manage your order')}.`),
  ].join('');
  return {
    subject: `Reminder — your BOOM fee invoice ${invoice.number}`,
    html: shell(inner, `Invoice ${invoice.number} · ${amount}`, { tag: `BOOM ${desk.label} · tenant side` }),
  };
}

function noFeeEmail({ lead }) {
  const l = obj(lead), c = obj(l.city), o = obj(c.order), k = cityMarketOf(l), desk = CITY_MARKETS[k];
  const inner = [
    para(`Hi ${esc(firstOf(l))}, congratulations on the new home. Your lease is signed, and nothing is due to BOOM for it.`),
    para(`Your order ${esc(o.number || '')} is now closed. Nothing was charged.`),
    fine(`Manage your order: ${link(manageUrlOf(l, desk), 'Manage your order')}.`),
  ].join('');
  return {
    subject: `Your BOOM ${desk.label} order ${o.number || ''} — nothing is due`,
    html: shell(inner, 'Your lease is signed, and nothing is due to BOOM for it.', { tag: `BOOM ${desk.label} · tenant side` }),
  };
}

function closedEmail({ lead }) {
  const l = obj(lead), c = obj(l.city), o = obj(c.order), k = cityMarketOf(l), desk = CITY_MARKETS[k];
  const inner = [
    para(`Hi ${esc(firstOf(l))},`),
    para(`Your order ${esc(o.number || '')} is closed. Nothing was charged, and nothing is due.`),
    fine(`If you want us to search again, reply to this email. Manage your order: ${link(manageUrlOf(l, desk), 'Manage your order')}.`),
  ].join('');
  return {
    subject: `Your BOOM ${desk.label} order ${o.number || ''} is closed`,
    html: shell(inner, 'Nothing was charged, and nothing is due.', { tag: `BOOM ${desk.label} · tenant side` }),
  };
}

/** The WhatsApp text the card offers after the invoice (EN, never sent by itself). */
export function invoiceWhatsApp({ lead, invoice, payUrl }) {
  const l = obj(lead), c = obj(l.city);
  const first = String(l.name || '').trim().split(/\s+/)[0] || '';
  return `Hi${first ? ' ' + first : ''}, congratulations on the lease. Here is the invoice for ${c.serviceLabel}: ${eurEn(invoice.amount)}, VAT included. Pay securely here: ${payUrl}`;
}

async function raise(docId, fields) {
  try { await fsCreate('agentNotifications', { status: 'pending', actor: 'city-signing', createdAt: new Date().toISOString(), attempts: 0, dedupKey: docId, ...fields }, docId); }
  catch (e) { if (!(e && e.exists)) console.warn('[city-signing] notification failed:', e && e.message); }
}

// the same client's other orders (Berlin's no-stacking rule): a read that
// fails stops the charge (the rule is never skipped for lack of data)
async function otherOrdersOf(lead) {
  if (!lead.email) return [];
  const rows = await fsList('leads', { filter: { field: 'email', op: 'EQUAL', value: lead.email }, limit: 20 });
  return (rows || []).filter((x) => x && x.id !== lead.id);
}
const needsStacking = (lead) => {
  const k = cityMarketOf(lead), c = obj(lead.city);
  return !!k && !!(CITY_MARKETS[k] || {}).noStacking && c.service !== 'full-search';
};
const factsOf = (s) => ({
  signedOn: s.signedOn || null, viewings: s.viewings == null ? null : s.viewings,
  coldRent: s.coldRent == null ? null : s.coldRent, goAheadOn: s.goAheadOn || null,
  early: !!(s.earlyStart && s.earlyStart.inWriting === true),
});

// ═══ /firmato — the draft (§6.1) ════════════════════════════════════════════
/**
 * Writes `signing:{ status:'draft', … }` with the read's updateTime and
 * returns what the card prints. A 'law' refusal is still a draft (the card
 * offers only «nessun compenso»); a 'state' or 'input' refusal writes nothing.
 * → { ok:true, lead, signing, fee, refusal } | { ok:false, kind, gate, why, … }
 */
export async function draftSigning({ leadId, facts = {}, by = 'telegram', now = new Date() }) {
  const v = await fsGetVersioned('leads/' + leadId);
  if (!v) return { ok: false, kind: 'state', gate: 'not_found', why: 'Ordine non trovato.' };
  const lead = { ...v.data, id: leadId };
  const s = obj(lead.signing);
  if (s.status === 'invoicing') {
    const age = now.getTime() - Date.parse(s.claimedAt || s.at || 0);
    return { ok: false, kind: 'state', gate: age >= CLAIM_STALE_MS ? 'resumable' : 'in_flight', why: age >= CLAIM_STALE_MS ? 'Fattura rimasta a metà: riprendo.' : 'Fattura in corso: aspetta un minuto.', lead };
  }
  const today = romeDay(now);
  const f = { ...facts, signedOn: facts.signedOn === 'oggi' ? today : facts.signedOn };
  let others = [];
  if (needsStacking(lead)) {
    try { others = await otherOrdersOf(lead); }
    catch (_) { return { ok: false, kind: 'state', gate: 'unavailable', why: 'Non riesco a leggere gli altri ordini della cliente: riprova.', lead }; }
  }
  const g = signingGates(lead, f, { today, otherOrders: others });
  if (!g.ok && g.kind !== 'law') return { ...g, lead };
  const c = obj(lead.city), k = cityMarketOf(lead), desk = CITY_MARKETS[k];
  const berlinFs = c.service === 'full-search' && !!desk.goAhead;
  const usesViewings = (c.service === 'full-search' && !desk.feeCap) || c.service === 'attended-viewing';
  const fee = g.ok ? signingFee(k, c.service, f) : null;
  if (g.ok && !fee.ok) return { ok: false, kind: 'input', gate: fee.error, why: `Importo non calcolabile (${fee.error}).`, lead };
  const key = crypto.randomBytes(3).toString('hex');
  const at = now.toISOString();
  const signing = {
    status: 'draft', key, fare: c.service, signedOn: f.signedOn, bothSigned: true,
    basis: c.service === 'full-search' ? (berlinFs ? 'goahead' : 'found') : c.service === 'application-pack' ? 'dossier' : 'viewed',
    attestation: attestationOf(lead, { ...f, viewings: usesViewings ? (f.viewings == null ? 1 : f.viewings) : null }),
    coldRent: berlinFs && Number(f.coldRent) > 0 ? round2(f.coldRent) : null,
    goAheadOn: berlinFs && f.goAheadOn ? f.goAheadOn : null,
    viewings: usesViewings ? (f.viewings == null ? 1 : f.viewings) : null,
    earlyStart: f.early ? { inWriting: true, by, at } : null,
    amount: fee ? fee.amount : null, listPrice: fee ? fee.listPrice : null, cap: fee ? fee.cap : null,
    feeAllowed: g.ok, refusal: g.ok ? null : g.why,
    attempt: Number(s.attempt) || 0, by, at,
  };
  try { await fsCommit([{ docPath: 'leads/' + leadId, fields: { signing }, precondition: { updateTime: v.updateTime } }]); }
  catch (e) {
    if (e && e.conflict) return { ok: false, kind: 'state', gate: 'busy', why: 'L\'ordine è cambiato mentre lo leggevo: rimanda il comando.', lead };
    throw e;
  }
  return { ok: true, lead: { ...lead, signing }, signing, fee, refusal: g.ok ? null : g, ignored: ignoredOptions(lead, f) };
}

// ═══ cfy — claim, invoice, email (§6.5) ═════════════════════════════════════
/**
 * → { ok:true, lead, signing, invoice, payUrl, created, emailOk, emailError }
 *   | { ok:false, error, why?, lead?, signing? }
 * error: not_found · already_invoiced · no_fee · in_flight · no_draft ·
 *        stale_card · fee_refused · gate · invoice_failed · <fee error>
 */
export async function chargeAtSigning({ leadId, key, by = 'telegram', now = new Date() }) {
  const v = await fsGetVersioned('leads/' + leadId);
  if (!v) return { ok: false, error: 'not_found' };
  const lead = { ...v.data, id: leadId };
  const s = obj(lead.signing);
  const nowIso = now.toISOString(), today = romeDay(now);
  if (s.status === 'invoiced') return { ok: false, error: 'already_invoiced', lead, signing: s };
  if (s.status === 'no_fee') return { ok: false, error: 'no_fee', lead, signing: s };
  let resuming = false;
  if (s.status === 'invoicing') {
    const age = now.getTime() - Date.parse(s.claimedAt || s.at || 0);
    if (!(age >= CLAIM_STALE_MS)) return { ok: false, error: 'in_flight', lead, signing: s };
    resuming = true;
  } else if (s.status !== 'draft') return { ok: false, error: 'no_draft', lead };
  if (key != null && key !== s.key) return { ok: false, error: 'stale_card', lead, signing: s };
  const facts = factsOf(s);
  if (!resuming) {
    if (s.feeAllowed === false) return { ok: false, error: 'fee_refused', why: s.refusal, lead, signing: s };
    // the gates again, on the order as it is NOW (a withdrawal or a closure
    // may have arrived since the draft)
    let others = [];
    if (needsStacking(lead)) {
      try { others = await otherOrdersOf(lead); }
      catch (_) { return { ok: false, error: 'gate', why: 'Non riesco a leggere gli altri ordini della cliente: riprova.', lead }; }
    }
    const g = signingGates({ ...lead, signing: { ...s, status: 'draft' } }, facts, { today, otherOrders: others });
    if (!g.ok) return { ok: false, error: 'gate', why: g.why, gate: g, lead };
  }
  const c = obj(lead.city), k = cityMarketOf(lead);
  const fee = signingFee(k, c.service, facts);
  if (!fee.ok) return { ok: false, error: fee.error, lead };
  // 2 · the claim: of two taps, one wins
  const attempt = resuming ? (Number(s.attempt) || 1) : (Number(s.attempt) || 0) + 1;
  let sg = {
    ...s, status: 'invoicing', attempt, claimedAt: nowIso, claimedBy: by,
    amount: fee.amount, listPrice: fee.listPrice, cap: fee.cap,
    attestedAt: s.attestedAt || nowIso, attestedBy: s.attestedBy || by,
    invoiceId: cityFeeInvoiceId(leadId), error: null,
  };
  const claim = { docPath: 'leads/' + leadId, fields: { signing: sg }, precondition: { updateTime: v.updateTime } };
  try { await fsCommit([claim]); }
  catch (e) {
    if (e && e.conflict) return { ok: false, error: 'in_flight', lead };
    throw e;
  }
  const record = async (next) => {
    try { await fsCommit([{ docPath: 'leads/' + leadId, fields: { signing: next }, precondition: { exists: true } }]); return true; }
    catch (e) { console.warn('[city-signing] record failed:', e && e.conflict ? 'conflict' : 'commit_failed'); return false; }
  };
  // 3 · the invoice: one per order
  let r;
  try { r = await ensureCityFeeInvoice({ lead, signing: sg, fee, today, by, now }); }
  catch (e) {
    console.error('[city-signing] invoice failed:', e && e.message);
    await record({ ...sg, error: 'invoice_failed' });
    return { ok: false, error: 'invoice_failed', lead, signing: sg };
  }
  const inv = { ...r.invoice, id: r.id };
  const payUrl = payLink('inv', r.id);
  const desk = CITY_MARKETS[k];
  // 4 · the client's email, once (a resumed attempt never sends it again)
  let emailOk = !!sg.clientEmailSentAt, emailError = null;
  if (!sg.clientEmailSentAt) {
    const m = invoiceEmail({ lead, invoice: inv, payUrl });
    const to = clip(lead.email, 160) || inv.recipientEmail;
    const res = to ? await capped(sendEmail({ to, subject: m.subject, html: m.html, ...fromOf(desk) }), MAIL_CAP_MS) : { ok: false, error: 'no_email' };
    const at = new Date().toISOString();
    emailOk = res.ok; emailError = res.ok ? null : res.error;
    sg = res.ok ? { ...sg, clientEmailSentAt: at, clientEmailTo: to, clientEmailError: null } : { ...sg, clientEmailFailedAt: at, clientEmailError: res.error };
    await record(sg);
  }
  // 5 · invoiced
  sg = { ...sg, status: 'invoiced', invoiceNumber: inv.number || null, dueDate: inv.dueDate || null, linkUrl: payUrl, invoicedAt: sg.invoicedAt || new Date().toISOString() };
  await record(sg);
  // the operator's copy (portal feed; the card itself is the Telegram copy)
  await raise('cityfee-' + leadId, {
    type: 'city.fee_invoiced', priority: 'normal', ref: { collection: 'invoices', id: r.id },
    summary: `🧾 ${String(desk.labelIt || desk.label).toUpperCase()} · fattura ${inv.number} ${eurIt(inv.amount)} emessa — ${clip(lead.name, 80)} · scade il ${dmy(inv.dueDate)}${emailOk ? ' · link inviato' : ' · ⚠️ email NON partita'}`,
  });
  await logActivity(`Firma ${desk.label} ${obj(c.order).number}: fattura ${inv.number} ${eurEn(inv.amount)}`, 'payment',
    { leadId, invoiceId: r.id, created: r.created, amount: inv.amount, resumed: resuming, emailOk }, 'city-signing');
  return { ok: true, lead: { ...lead, signing: sg }, signing: sg, invoice: inv, payUrl, created: r.created, amountChanged: r.amountChanged, emailOk, emailError, resumed: resuming };
}

// ═══ cfx — no fee, the order closes ═════════════════════════════════════════
export async function declineAtSigning({ leadId, key, by = 'telegram', now = new Date() }) {
  const v = await fsGetVersioned('leads/' + leadId);
  if (!v) return { ok: false, error: 'not_found' };
  const lead = { ...v.data, id: leadId };
  const s = obj(lead.signing);
  if (s.status === 'no_fee') return { ok: false, error: 'no_fee', lead };
  if (s.status === 'invoiced' || s.status === 'invoicing') return { ok: false, error: s.status === 'invoiced' ? 'already_invoiced' : 'in_flight', lead, signing: s };
  if (s.status !== 'draft') return { ok: false, error: 'no_draft', lead };
  if (key != null && key !== s.key) return { ok: false, error: 'stale_card', lead };
  if (lead.paid === true) return { ok: false, error: 'paid', lead };
  if (lead.withdrawnAt || lead.closedAt) return { ok: false, error: 'closed', lead };
  const at = now.toISOString();
  const reason = s.feeAllowed === false ? s.refusal : 'Attestazione: no (la casa non è quella della tariffa).';
  const sg = { ...s, status: 'no_fee', decidedAt: at, decidedBy: by, reason: clip(reason, 400) };
  try {
    await fsCommit([{ docPath: 'leads/' + leadId, fields: { signing: sg, closedAt: at, closeReason: 'no_fee', closeNote: clip(reason, 400) }, precondition: { updateTime: v.updateTime } }]);
  } catch (e) {
    if (e && e.conflict) return { ok: false, error: 'busy', lead };
    throw e;
  }
  const desk = CITY_MARKETS[cityMarketOf(lead)];
  const m = noFeeEmail({ lead });
  const res = lead.email ? await capped(sendEmail({ to: lead.email, subject: m.subject, html: m.html, ...fromOf(desk) }), MAIL_CAP_MS) : { ok: false, error: 'no_email' };
  const out = res.ok ? { closeEmailSentAt: new Date().toISOString() } : { closeEmailFailedAt: new Date().toISOString(), closeEmailError: res.error };
  try { await fsCommit([{ docPath: 'leads/' + leadId, fields: out, precondition: { exists: true } }]); }
  catch (e) { console.warn('[city-signing] close outcome not recorded:', e && e.conflict ? 'conflict' : 'commit_failed'); }
  await logActivity(`Firma ${desk.label} ${obj(obj(lead.city).order).number}: nessun compenso`, 'lead', { leadId, reason: clip(reason, 200) }, 'city-signing');
  return { ok: true, lead: { ...lead, signing: sg, closedAt: at, closeReason: 'no_fee' }, emailOk: res.ok, emailError: res.ok ? null : res.error };
}

// ═══ /chiudi + cch — the order closes, nothing is due ══════════════════════
export const CLOSE_REASONS = Object.freeze(['declined', 'stopped', 'expired', 'other']);
export async function draftClose({ leadId, reason, note, by = 'telegram', now = new Date() }) {
  if (!CLOSE_REASONS.includes(reason)) return { ok: false, kind: 'input', gate: 'reason', why: `Motivo sconosciuto: ${CLOSE_REASONS.join(' · ')}.` };
  const v = await fsGetVersioned('leads/' + leadId);
  if (!v) return { ok: false, kind: 'state', gate: 'not_found', why: 'Ordine non trovato.' };
  const lead = { ...v.data, id: leadId };
  const s = obj(lead.signing);
  if (!isSigningOrder(lead)) return { ok: false, kind: 'state', gate: 'not_order', why: 'Non è un ordine di un desk che incassa alla firma.', lead };
  if (lead.paid === true) return { ok: false, kind: 'state', gate: 'paid', why: 'Già pagato: non si chiude da qui.', lead };
  if (lead.withdrawnAt || (lead.withdrawal && lead.withdrawal.at)) return { ok: false, kind: 'state', gate: 'withdrawn', why: 'Il cliente ha già esercitato il recesso.', lead };
  if (lead.closedAt) return { ok: false, kind: 'state', gate: 'closed', why: `Già chiuso il ${dmy(romeDayOf(lead.closedAt))}.`, lead };
  if (s.status === 'invoiced' || s.status === 'invoicing') return { ok: false, kind: 'state', gate: 'invoiced', why: 'C\'è una fattura emessa: annullala dal portale prima di chiudere l\'ordine.', lead };
  const closeDraft = { reason, note: clip(note, 300) || null, key: crypto.randomBytes(3).toString('hex'), by, at: now.toISOString() };
  try { await fsCommit([{ docPath: 'leads/' + leadId, fields: { closeDraft }, precondition: { updateTime: v.updateTime } }]); }
  catch (e) {
    if (e && e.conflict) return { ok: false, kind: 'state', gate: 'busy', why: 'L\'ordine è cambiato mentre lo leggevo: rimanda il comando.', lead };
    throw e;
  }
  return { ok: true, lead: { ...lead, closeDraft }, closeDraft };
}

export async function closeOrder({ leadId, key, by = 'telegram', now = new Date() }) {
  const v = await fsGetVersioned('leads/' + leadId);
  if (!v) return { ok: false, error: 'not_found' };
  const lead = { ...v.data, id: leadId };
  const d = obj(lead.closeDraft), s = obj(lead.signing);
  if (lead.closedAt) return { ok: false, error: 'closed', lead };
  if (!d.key) return { ok: false, error: 'no_draft', lead };
  if (key != null && key !== d.key) return { ok: false, error: 'stale_card', lead };
  if (lead.paid === true) return { ok: false, error: 'paid', lead };
  if (lead.withdrawnAt || (lead.withdrawal && lead.withdrawal.at)) return { ok: false, error: 'withdrawn', lead };
  if (s.status === 'invoiced' || s.status === 'invoicing') return { ok: false, error: 'already_invoiced', lead };
  const at = now.toISOString();
  try {
    await fsCommit([{ docPath: 'leads/' + leadId, fields: { closedAt: at, closeReason: d.reason, closeNote: d.note || null, closeDraft: { ...d, doneAt: at, doneBy: by } }, precondition: { updateTime: v.updateTime } }]);
  } catch (e) {
    if (e && e.conflict) return { ok: false, error: 'busy', lead };
    throw e;
  }
  const desk = CITY_MARKETS[cityMarketOf(lead)];
  const m = closedEmail({ lead });
  const res = lead.email ? await capped(sendEmail({ to: lead.email, subject: m.subject, html: m.html, ...fromOf(desk) }), MAIL_CAP_MS) : { ok: false, error: 'no_email' };
  const out = res.ok ? { closeEmailSentAt: new Date().toISOString() } : { closeEmailFailedAt: new Date().toISOString(), closeEmailError: res.error };
  try { await fsCommit([{ docPath: 'leads/' + leadId, fields: out, precondition: { exists: true } }]); }
  catch (e) { console.warn('[city-signing] close outcome not recorded:', e && e.conflict ? 'conflict' : 'commit_failed'); }
  await logActivity(`Ordine ${desk.label} ${obj(obj(lead.city).order).number} chiuso (${d.reason})`, 'lead', { leadId, reason: d.reason }, 'city-signing');
  return { ok: true, lead: { ...lead, closedAt: at, closeReason: d.reason }, emailOk: res.ok, emailError: res.ok ? null : res.error };
}

// ═══ 🔔 Ricorda — operator reminders only after the due date, on a tap ═══════
/**
 * → { ok:true, sent:'invoice'|'reminder', to } | { ok:false, error, dueDate? }
 * The invoice email again when it never left or the client's address was
 * corrected since (a bounce); otherwise a reminder, only past the due date and
 * at most once in 20 hours. Never automatic.
 */
export async function remindInvoice({ leadId, by = 'telegram', now = new Date() }) {
  const v = await fsGetVersioned('leads/' + leadId);
  if (!v) return { ok: false, error: 'not_found' };
  const lead = { ...v.data, id: leadId };
  const s = obj(lead.signing);
  if (s.status !== 'invoiced' || !s.invoiceId) return { ok: false, error: 'not_invoiced', lead };
  let inv;
  try { inv = await fsGet('invoices/' + s.invoiceId); } catch (_) { return { ok: false, error: 'unavailable', lead }; }
  if (!inv) return { ok: false, error: 'no_invoice', lead };
  inv = { ...inv, id: s.invoiceId };
  if (lead.paid === true || inv.status === 'paid') return { ok: false, error: 'paid', lead };
  const to = clip(lead.email, 160) || inv.recipientEmail;
  if (!to) return { ok: false, error: 'no_email', lead };
  const today = romeDay(now);
  const resend = !s.clientEmailSentAt || (s.clientEmailTo && s.clientEmailTo !== to);
  if (!resend) {
    if (inv.dueDate && today <= inv.dueDate) return { ok: false, error: 'not_due', dueDate: inv.dueDate, lead };
    const last = Date.parse(s.remindedAt || '');
    if (Number.isFinite(last) && now.getTime() - last < REMIND_GAP_MS) return { ok: false, error: 'recent', at: s.remindedAt, lead };
  }
  // the claim: of two taps, one email
  const at = now.toISOString();
  let sg = resend ? { ...s, resentAt: at, resentBy: by } : { ...s, remindedAt: at, remindedBy: by, reminders: (Number(s.reminders) || 0) + 1 };
  try { await fsCommit([{ docPath: 'leads/' + leadId, fields: { signing: sg }, precondition: { updateTime: v.updateTime } }]); }
  catch (e) {
    if (e && e.conflict) return { ok: false, error: 'busy', lead };
    throw e;
  }
  const desk = CITY_MARKETS[cityMarketOf(lead)];
  const payUrl = payLink('inv', inv.id);
  const m = resend ? invoiceEmail({ lead, invoice: inv, payUrl }) : reminderEmail({ lead, invoice: inv, payUrl });
  const res = await capped(sendEmail({ to, subject: m.subject, html: m.html, ...fromOf(desk) }), MAIL_CAP_MS);
  const done = new Date().toISOString();
  sg = res.ok
    ? (resend ? { ...sg, clientEmailSentAt: done, clientEmailTo: to, clientEmailError: null } : { ...sg, lastReminderError: null })
    : (resend ? { ...sg, clientEmailFailedAt: done, clientEmailError: res.error } : { ...sg, lastReminderError: res.error });
  try { await fsCommit([{ docPath: 'leads/' + leadId, fields: { signing: sg }, precondition: { exists: true } }]); }
  catch (e) { console.warn('[city-signing] reminder outcome not recorded:', e && e.conflict ? 'conflict' : 'commit_failed'); }
  await logActivity(`Fattura ${inv.number}: ${resend ? 'rimandata' : 'promemoria'}`, 'payment', { leadId, invoiceId: inv.id, ok: res.ok }, 'city-signing');
  if (!res.ok) return { ok: false, error: 'email_failed', why: res.error, lead };
  return { ok: true, sent: resend ? 'invoice' : 'reminder', to, invoice: inv, payUrl, lead: { ...lead, signing: sg } };
}

// ═══ finding the order (the card's /firmato BM X7K2Q or book_…) ════════════
/** → the signing-desk orders the reference names (0, 1, or a collision). */
export async function findOrders(ref) {
  if (ref && ref.id) {
    const l = await fsGet('leads/' + ref.id);
    return l && isSigningOrder({ ...l, id: ref.id }) ? [{ ...l, id: ref.id }] : [];
  }
  if (ref && ref.file) {
    const rows = await fsList('leads', { filter: { field: 'city.file', op: 'EQUAL', value: ref.file }, limit: 10 });
    return (rows || []).filter(isSigningOrder);
  }
  return [];
}
