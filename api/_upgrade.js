// api/_upgrade.js — the upgrade credit of a city desk (06/11/2026).
//
// A client who paid the Application Pack on a desk that charges at the till
// can move to Full Search on the same desk within UPGRADE_DAYS of paying for
// the pack: what they paid is credited, once. The first case was Madrid, file
// BM BEAEV: the founder promised the credit on the call, and the till had no
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
// A pack that was refunded (in full or in part) or withdrawn from carries no
// credit: the client did not keep it, so there is nothing to carry over
// (state 'void'). The webhook stamps the refund on the pack's lead
// (charge.refunded → refundedAt); /api/withdraw writes the withdrawal map.

import { CITY_MARKETS, CITY_PLANS, cityOffer } from './_market.js';

export const UPGRADE_DAYS = 30;
// from the plan that was paid → to the plan it can become
export const UPGRADE_PATHS = Object.freeze({ 'application-pack': 'full-search' });

// THE POLICY IN WORDS, one copy. No amount in either sentence: the credit is
// what the client paid, in the desk's currency (£ in London), so a figure
// here would be wrong somewhere.
/** The ✓ line inside the ticket of the plan that can be upgraded. */
export const upgradeLine = (toLabel) => `Credited in full if you move to ${toLabel} within ${UPGRADE_DAYS} days.`;
/** The sentence of the fact sheet's Fees row and of the Offer. */
export const upgradeFact = (fromLabel, toLabel) => `The ${fromLabel} fee is credited in full towards ${toLabel} for ${UPGRADE_DAYS} days from payment.`;
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
 * money for it, in full or in part — the webhook's refundedAt) or 'withdrawn'
 * (a withdrawal statement was matched to this order — /api/withdraw's map);
 * null while the client keeps the pack.
 */
export function upgradeVoidReason(lead) {
  if (!lead || typeof lead !== 'object') return null;
  if (lead.refundedAt || Number(lead.refundedAmount) > 0) return 'refunded';
  if (lead.withdrawnAt || (lead.withdrawal && typeof lead.withdrawal === 'object')) return 'withdrawn';
  return null;
}

/**
 * What the operator must know about the credit when money for an order goes
 * back (a refund on Stripe, a withdrawal statement): one Italian clause, or ''
 * when the order has nothing to do with the credit. One copy, read by the
 * Stripe webhook (charge.refunded) and by /api/withdraw's card.
 *  - a pack whose credit was ALREADY used: the client has had the credit and
 *    now gets the pack back too — the difference is settled on the upgrade;
 *  - a Full Search paid with a credit: the refund is counted on what was paid
 *    for THAT order (Terms §12.2);
 *  - a pack with the credit still open: it is closed from now on.
 */
export function upgradeMoneyBackNote(lead, fmt = (n) => String(n)) {
  if (!lead || typeof lead !== 'object') return '';
  const c = lead.city && typeof lead.city === 'object' ? lead.city : null;
  if (!c) return '';
  const used = lead.credit && typeof lead.credit === 'object' && lead.credit.usedBy ? String(lead.credit.usedBy) : null;
  if (used) return `ATTENZIONE: il credito di upgrade di questo ordine è già stato usato da ${used} — il cliente ha già avuto il credito: regola la differenza su quell'ordine`;
  const paidWith = c.credit && typeof c.credit === 'object' && c.credit.from ? c.credit : null;
  if (paidWith) return `ordine pagato col credito di ${String(paidWith.from)}${Number(paidWith.amount) > 0 ? ` (${fmt(Number(paidWith.amount))})` : ''}: il rimborso si calcola su quanto pagato per QUESTO ordine (Termini §12.2)`;
  const from = String(c.service || lead.kind || '');
  if (Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, from)) return 'il credito di upgrade di questo ordine non vale più';
  return '';
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

const DAY_MS = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;

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
  // a pack the client did not keep (refunded, or withdrawn from) carries nothing over
  const voided = upgradeVoidReason(lead);
  if (voided) return { ok: false, state: 'void', reason: voided, city: cityKey, file };
  const paidAt = Date.parse(lead.paid_at || lead.createdAt || c.at || '');
  if (!Number.isFinite(paidAt)) return { ok: false, state: 'not_found' };
  // the deadline: UPGRADE_DAYS from the payment — none on a desk that never stacks a pack on a Full Search (Berlin)
  const days = upgradeDaysOf(cityKey);
  const expiresAt = days ? new Date(paidAt + days * DAY_MS).toISOString() : null;
  if (days && nowMs > paidAt + days * DAY_MS) return { ok: false, state: 'expired', city: cityKey, file, expiresAt };
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
