// api/_upgrade.js — the upgrade credit of a city desk (06/11/2026).
//
// A client who paid the Application Pack on a desk that charges at the till
// can move to Full Search on the same desk within UPGRADE_DAYS of paying for
// the pack: what they paid is credited, once. The first case was a Madrid
// client: the founder promised the credit on the call, and the till had no
// way to honour it except a manual refund after charging the full price.
//
// The server decides everything: which order can be upgraded, to what, the
// amount left to pay, the deadline and the single use. The link is personal
// and derived (api/payments/_token.js upgradeToken, never stored); the page
// /upgrade only shows what GET /api/city-lead?upgrade= answers and posts the
// choice to /api/service-checkout, which charges what this module computes.
// The Stripe webhook marks the credit as used on the pack's lead
// (credit.usedBy), under a version precondition.
//
// A desk that charges at signing never qualifies: nothing was paid at the
// order, so there is nothing to credit. (Paris and Berlin charged at signing
// until 06/11/2026; since then they take the card at the order, and a pack
// paid there is credited like any other.)
//
// A POLICY SINCE 12/11/2026 (the founder, after the first client used it):
// the credit is no longer the operator's personal offer. Every desk that
// sells says it in the pack's ticket, in the fact sheet and in the Offer; the
// Terms state it (§12.2); the client's own order email carries the personal
// link. The words are HERE, one copy (upgradeLine, upgradeFact): the build
// prints them, the tests compare them with the Terms and llms.txt.
// On the Berlin desk the credit has NO deadline (upgradeDaysOf): its terms
// never charge a pack on top of a Full Search (§12.5), so a deadline would
// make the till do what the terms exclude.
// A pack whose money went back carries no credit (state 'void'): refunded on
// Stripe, in full or in part (the webhook stamps charge.refunded on the
// pack's lead → refundedAt), or disputed with the bank (disputedAt, cleared
// if the dispute is won). A withdrawal STATEMENT alone does not close it:
// /api/withdraw matches a statement by e-mail, so it may be late, without
// effect, or typed by someone else — a withdrawal that takes effect ends in
// a refund, and the refund closes the credit.
// THE OTHER DOOR. The credit is applied through the personal link. A pack
// holder who pays the target plan in full on the desk page is found by the
// webhook (openCreditFor, by the payer's e-mail) on the FIRST delivery of
// that payment: the order records what is owed back (city.creditDue) and the
// operator gets an urgent card — the Terms promise that refund (§12.2).
// Nothing is changed on the pack then: an e-mail address is not an identity.
// The operator's refund is the act: when a partial refund of at least the
// pack amount is stamped on that order, the pack's credit is closed
// (credit.via 'full-price'). The client is told in writing only when the
// phone number is the pack's too (samePhone) and no withdrawal statement is
// on file for the pack.
// THE SAME LOOKUP, BERLIN'S RULE (fullSearchHeld): on a desk whose terms
// charge nothing alongside a Full Search (§12.5), a pack or a viewing paid by
// someone who already holds one is recorded on the order (city.stackedOn) and
// rung to the operator, who refunds it if that search is still running.

import { CITY_MARKETS, CITY_PLANS, cityOffer } from './_market.js';

export const UPGRADE_DAYS = 30;
// from the plan that was paid → to the plan it can become
export const UPGRADE_PATHS = Object.freeze({ 'application-pack': 'full-search' });

// THE POLICY IN WORDS, one copy. No amount in either sentence: the credit is
// what the client paid, in the desk's currency (£ in London), so a figure
// here would be wrong somewhere.
/** The ✓ line inside the ticket of the plan that can be upgraded. `days` null = no deadline on that desk (Berlin). */
export const upgradeLine = (toLabel, days = UPGRADE_DAYS) => `Credited in full if you move to ${toLabel}${days ? ` within ${days} days` : ''}.`;
/** The sentence of the fact sheet's Fees row and of the Offer: what, for how long, through which door. */
export const upgradeFact = (fromLabel, toLabel, days = UPGRADE_DAYS) =>
  `The ${fromLabel} fee is credited in full towards ${toLabel} ${days ? `for ${days} days from payment` : 'with no time limit'}, through the personal link in the order email.`;
/**
 * The hub's line: one page for every desk, so it says WHICH desk the credit holds on (the pack's own) — on a
 * desk's page the context is that desk. `days` is the window most desks give; `openDesks` names, in brackets,
 * the desks that give none (Berlin).
 */
export const upgradeHubLine = (toLabel, days = UPGRADE_DAYS, openDesks = '') =>
  `Credited in full towards ${toLabel} at the same desk${days ? ` within ${days} days` : ''}${days && openDesks ? ` (${openDesks}: no time limit)` : ''}.`;
/** The till's line when the plan being paid is the one a credit leads to: the door that applies it. */
export const upgradeTillHint = (fromLabel) => `Already paid for the ${fromLabel} on this desk? Use the personal link in your order email: what you paid comes off this price.`;
/**
 * The upgrade paths a desk's own plans allow: [{ from, to, fromLabel, toLabel }].
 * `plans` is the desk's list (cities/<slug>.json pricing.plans, or the
 * registry's map as [{id,label}]); a path whose two ends the desk does not
 * both sell is not offered.
 */
export function upgradePathsOf(plans) {
  const by = new Map((Array.isArray(plans) ? plans : []).filter((p) => p && p.id).map((p) => [String(p.id), p]));
  return Object.entries(UPGRADE_PATHS).filter(([from, to]) => by.has(from) && by.has(to))
    .map(([from, to]) => ({ from, to, fromLabel: String(by.get(from).label || from), toLabel: String(by.get(to).label || to) }));
}

/**
 * Why a paid pack no longer carries a credit: 'refunded' (Stripe returned
 * money for it, in full or in part — the webhook's refundedAt) or 'disputed'
 * (the payer's bank took the money back, or may: disputedAt, cleared when a
 * dispute is won); null while BOOM holds the money. A withdrawal statement
 * on file is NOT a reason: only its refund is.
 */
export function upgradeVoidReason(lead) {
  if (!lead || typeof lead !== 'object') return null;
  if (lead.refundedAt || Number(lead.refundedAmount) > 0) return 'refunded';
  if (lead.disputedAt) return 'disputed';
  return null;
}

/**
 * What the operator must know about the credit when money for an order goes
 * back (a refund on Stripe, a withdrawal statement): one Italian clause, or ''
 * when the order has nothing to do with the credit. One copy, read by the
 * Stripe webhook (charge.refunded) and by /api/withdraw's card.
 *  - a pack whose credit was ALREADY used: the client has had the credit and
 *    now gets the pack back too — the difference is settled on the upgrade
 *    (when it was closed by a refund on an order paid in full, this is a
 *    second refund of the same credit);
 *  - an order paid in full by a pack holder: the pack amount is owed back on
 *    it (the refund card itself is written by the webhook's settle step);
 *  - a Full Search paid with a credit: the refund is counted on what was paid
 *    for THAT order (Terms §12.2);
 *  - a pack with the credit still open: it is closed from now on.
 */
export function upgradeMoneyBackNote(lead, fmt = (n) => String(n), opts = {}) {
  if (!lead || typeof lead !== 'object') return '';
  const c = lead.city && typeof lead.city === 'object' ? lead.city : null;
  if (!c) return '';
  const used = lead.credit && typeof lead.credit === 'object' && lead.credit.usedBy ? String(lead.credit.usedBy) : null;
  // closed the other way round: the target plan was paid in full and the pack amount was ALREADY refunded on that
  // order (the mark is written when that refund is stamped) — money for the pack going back now is a second refund
  if (used && lead.credit.via === 'full-price') return `ATTENZIONE: il credito di questo ordine è già stato rimborsato sull'ordine ${used}, pagato a prezzo pieno: un rimborso di questo pack è un secondo rimborso dello stesso credito`;
  if (used) return `ATTENZIONE: il credito di upgrade di questo ordine è già stato usato da ${used} — il cliente ha già avuto il credito: regola la differenza su quell'ordine`;
  // paid in full by someone who held an open pack credit: the pack amount is owed back on THIS order
  const due = c.creditDue && typeof c.creditDue === 'object' && c.creditDue.from ? c.creditDue : null;
  if (due) return `su questo ordine è dovuto il rimborso del credito di ${String(due.from)}${Number(due.amount) > 0 ? ` (${fmt(Number(due.amount))})` : ''}${lead.refundedAt ? ': un rimborso è già segnato su questo ordine' : ''}`;
  const paidWith = c.credit && typeof c.credit === 'object' && c.credit.from ? c.credit : null;
  if (paidWith) return `ordine pagato col credito di ${String(paidWith.from)}${Number(paidWith.amount) > 0 ? ` (${fmt(Number(paidWith.amount))})` : ''}: il rimborso si calcola su quanto pagato per QUESTO ordine (Termini §12.2)`;
  const from = String(c.service || lead.kind || '');
  if (!Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, from)) return '';
  // a withdrawal statement returns no money by itself: the credit closes when the refund is made on Stripe
  return opts.statement ? 'il credito di upgrade di questo ordine si chiude da solo quando lo rimborsi su Stripe (una dichiarazione da sola non lo chiude)' : 'il credito di upgrade di questo ordine non vale più';
}

/**
 * The open credit a payer already holds for the plan they are paying in full:
 * among the payer's own orders (same e-mail — read by the caller, each with
 * its id), the first paid order of THIS desk whose path leads to `kind` and
 * whose credit is open now. Pure. Returns { id, offer } or null.
 */
export function openCreditFor(orders, cityKey, kind, nowMs) {
  for (const d of Array.isArray(orders) ? orders : []) {
    if (!d || !isUpgradeLeadId(d.id)) continue;
    const o = upgradeOffer(d, d.id, nowMs);
    if (o.ok && o.city === cityKey && o.to === kind) return { id: String(d.id), offer: o };
  }
  return null;
}

/**
 * A desk whose terms charge nothing alongside a Full Search (Berlin, Terms
 * §12.5 — the registry's noStacking): the paid Full Search this payer already
 * holds there, among their own earlier orders, when the plan now paid is
 * anything else. Pure. Returns { id, file, phone } or null. Whether that
 * search is still RUNNING is not in the data: the operator judges.
 */
export function fullSearchHeld(orders, cityKey, kind) {
  const k = String(cityKey || '').toLowerCase();
  const desk = Object.prototype.hasOwnProperty.call(CITY_MARKETS, k) ? CITY_MARKETS[k] : null;
  if (!desk || desk.noStacking !== true || !kind || String(kind) === 'full-search') return null;
  for (const d of Array.isArray(orders) ? orders : []) {
    const c = d && d.city && typeof d.city === 'object' ? d.city : null;
    if (!c || !isUpgradeLeadId(d.id) || d.market !== k || d.intent !== 'city_order' || d.paid !== true || c.paid !== true) continue;
    if (String(c.service || d.kind || '') !== 'full-search') continue;
    // money that went back in full, or that the bank is taking back, is not a Full Search the client holds
    if (d.refundedFull === true || d.disputedAt) continue;
    return { id: String(d.id), file: typeof c.file === 'string' ? c.file : null, phone: String(d.phone || '') };
  }
  return null;
}

/** The same phone in two spellings (E.164 against a national form): the last nine digits agree. */
export function samePhone(a, b) {
  const digits = (x) => String(x || '').replace(/\D/g, '');
  const x = digits(a), y = digits(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-9) === y.slice(-9);
}

/**
 * How long a desk's credit runs: UPGRADE_DAYS, or null — no limit — on a desk
 * whose terms never charge a pack on top of a Full Search (Berlin: Terms
 * §12.5, the registry's noStacking). There a pack already paid is credited
 * whenever the client moves to Full Search: a deadline would make the till
 * charge both, which those terms exclude.
 */
export function upgradeDaysOf(cityKey) {
  const k = String(cityKey || '').toLowerCase();
  const desk = Object.prototype.hasOwnProperty.call(CITY_MARKETS, k) ? CITY_MARKETS[k] : null;
  return desk && desk.noStacking === true ? null : UPGRADE_DAYS;
}

// leads/svc_<session>: the id the SERVICE webhook writes (serviceLeadId)
const LEAD_RE = /^svc_[A-Za-z0-9]{8,30}$/;
export const isUpgradeLeadId = (id) => LEAD_RE.test(String(id || ''));

const round2 = (n) => Math.round(n * 100) / 100;

// Rome calendar parts of an instant (the desks' clock; no tz library)
const ROME = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const romeParts = (ms) => Object.fromEntries(ROME.formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
/**
 * The last instant a credit can be used: the END of the Rome calendar day
 * `days` days after the day of payment (the day of payment does not count,
 * as for the withdrawal period). Paid on 12 November at any hour → valid
 * through 12 December, 23:59:59.999 Rome time. Calendar days, never
 * days × 24 h: "valid until 12 December" must hold for the whole of that
 * day, and across the clock changes.
 */
export function upgradeDeadline(paidMs, days) {
  const p = romeParts(paidMs);
  // midnight UTC of the day AFTER the last one; Rome is UTC+1 or UTC+2, so its midnight falls 1 or 2 hours earlier
  const next = Date.UTC(p.year, p.month - 1, p.day + days + 1);
  for (const h of [2, 1]) {
    const q = romeParts(next - h * 3600000);
    if (q.hour === 0 && q.minute === 0) return next - h * 3600000 - 1;
  }
  return next - 3600000 - 1;
}

/**
 * Can this paid order be upgraded now, and for how much?
 * Pure: the lead as read from Firestore (fsGet), its id, the clock.
 * @returns {{ok:true,state:'open',city,cityLabel,from,fromLabel,to,toLabel,list,credit,pay,currency,file,paidAt,expiresAt,days,name,email,phone,desc}
 *         (expiresAt and days are null on a desk whose credit has no deadline)
 *         | {ok:false,state:'not_found'|'not_upgradable'|'used'|'void'|'expired', city?, file?, usedBy?, reason?, expiresAt?}}
 */
export function upgradeOffer(lead, leadId, nowMs) {
  if (!isUpgradeLeadId(leadId) || !lead || typeof lead !== 'object') return { ok: false, state: 'not_found' };
  const c = lead.city && typeof lead.city === 'object' ? lead.city : null;
  const cityKey = String(lead.market || '').toLowerCase();
  const desk = Object.prototype.hasOwnProperty.call(CITY_MARKETS, cityKey) ? CITY_MARKETS[cityKey] : null;
  if (!c || !desk || lead.intent !== 'city_order' || lead.paid !== true || c.paid !== true) return { ok: false, state: 'not_found' };
  const file = typeof c.file === 'string' ? c.file : null;
  const from = String(c.service || lead.kind || '');
  const to = Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, from) ? UPGRADE_PATHS[from] : null;
  if (!to) return { ok: false, state: 'not_upgradable', city: cityKey, file };
  const offer = cityOffer(cityKey, to);
  if (!offer.ok || offer.chargeAt === 'signing') return { ok: false, state: 'not_upgradable', city: cityKey, file };
  const used = lead.credit && typeof lead.credit === 'object' && lead.credit.usedBy ? String(lead.credit.usedBy) : null;
  if (used) return { ok: false, state: 'used', city: cityKey, file, usedBy: used };
  // a pack whose money went back (refunded, or disputed with the bank) carries nothing over
  const voided = upgradeVoidReason(lead);
  if (voided) return { ok: false, state: 'void', reason: voided, city: cityKey, file };
  const paidAt = Date.parse(lead.paid_at || lead.createdAt || c.at || '');
  if (!Number.isFinite(paidAt)) return { ok: false, state: 'not_found' };
  // the deadline: the end of the day, UPGRADE_DAYS after the day of payment — none on a desk that never stacks a
  // pack on a Full Search (Berlin)
  const days = upgradeDaysOf(cityKey);
  const deadline = days ? upgradeDeadline(paidAt, days) : null;
  const expiresAt = deadline === null ? null : new Date(deadline).toISOString();
  if (deadline !== null && nowMs > deadline) return { ok: false, state: 'expired', city: cityKey, file, expiresAt };
  // the credit is what the client actually paid, in the currency they paid in
  const currency = String(lead.currency || 'eur').toLowerCase();
  const paid = Number(lead.amount_eur);
  if (currency !== offer.currency || !Number.isFinite(paid) || paid <= 0 || paid >= offer.eur) {
    return { ok: false, state: 'not_upgradable', city: cityKey, file };
  }
  const credit = round2(paid);
  const plans = desk.plans || CITY_PLANS;
  return {
    ok: true, state: 'open',
    city: cityKey, cityLabel: desk.label, country: desk.country || null, deskUrl: desk.url,
    from, fromLabel: (plans[from] && plans[from].label) || from,
    to, toLabel: offer.label,
    list: offer.eur, credit, pay: round2(offer.eur - credit), currency,
    file, paidAt: new Date(paidAt).toISOString(), expiresAt, days,
    desc: offer.desc,
    name: String(lead.name || ''), email: String(lead.email || ''), phone: String(lead.phone || ''),
  };
}

/** What the page may see: no name, email or phone (the link travels on WhatsApp). */
export function publicUpgrade(o) {
  if (!o || !o.ok) return { ok: false, state: (o && o.state) || 'not_found', city: (o && o.city) || null, file: (o && o.file) || null, expiresAt: (o && o.expiresAt) || null, ...(o && o.reason ? { reason: o.reason } : {}) };
  const { name, email, phone, ...rest } = o; // eslint-disable-line no-unused-vars
  return rest;
}
