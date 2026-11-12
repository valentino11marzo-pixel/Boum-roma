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
// A desk that charges at signing (Paris, Berlin) never qualifies: nothing was
// paid at the order, so there is nothing to credit.

import { CITY_MARKETS, CITY_PLANS, cityOffer } from './_market.js';

export const UPGRADE_DAYS = 30;
// from the plan that was paid → to the plan it can become
export const UPGRADE_PATHS = Object.freeze({ 'application-pack': 'full-search' });

// leads/svc_<session>: the id the SERVICE webhook writes (serviceLeadId)
const LEAD_RE = /^svc_[A-Za-z0-9]{8,30}$/;
export const isUpgradeLeadId = (id) => LEAD_RE.test(String(id || ''));

const DAY_MS = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Can this paid order be upgraded now, and for how much?
 * Pure: the lead as read from Firestore (fsGet), its id, the clock.
 * @returns {{ok:true,state:'open',city,cityLabel,from,fromLabel,to,toLabel,list,credit,pay,currency,file,paidAt,expiresAt,name,email,phone,desc}
 *         | {ok:false,state:'not_found'|'not_upgradable'|'used'|'expired', city?, file?, usedBy?, expiresAt?}}
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
  const paidAt = Date.parse(lead.paid_at || lead.createdAt || c.at || '');
  if (!Number.isFinite(paidAt)) return { ok: false, state: 'not_found' };
  const expiresAt = new Date(paidAt + UPGRADE_DAYS * DAY_MS).toISOString();
  if (nowMs > paidAt + UPGRADE_DAYS * DAY_MS) return { ok: false, state: 'expired', city: cityKey, file, expiresAt };
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
    file, paidAt: new Date(paidAt).toISOString(), expiresAt,
    desc: offer.desc,
    name: String(lead.name || ''), email: String(lead.email || ''), phone: String(lead.phone || ''),
  };
}

/** What the page may see: no name, email or phone (the link travels on WhatsApp). */
export function publicUpgrade(o) {
  if (!o || !o.ok) return { ok: false, state: (o && o.state) || 'not_found', city: (o && o.city) || null, file: (o && o.file) || null, expiresAt: (o && o.expiresAt) || null };
  const { name, email, phone, ...rest } = o; // eslint-disable-line no-unused-vars
  return rest;
}
