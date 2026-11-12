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
// Which pack: among the open packs under that e-mail, the payer's own (same
// phone) first (openCreditsFor). A refund on that order closes the pack by
// the EVENT's own amount, never by the order the events arrive in
// (refundCreditVerdict); when the phone did not match, only a refund of
// exactly the pack amount does. What became of a credit owed is derived in
// one place (creditDueState) from the order and the pack, so the cards, the
// bot and the withdrawal card cannot say different things. The pack's own
// state comes first: once its credit is spent, refunded or with the bank, no
// text says it is "due" or "open". An order paid in full WAITS for a credit
// (claimWaits) while it is paid, not refunded whole and not given back by the
// bank: a dispute still open only suspends it.
// THE SAME LOOKUP, BERLIN'S RULE (fullSearchHeld): on a desk whose terms
// charge nothing alongside a Full Search (§12.5), a pack or a viewing paid by
// someone who already holds one — paid by card, or booked at signing on 5–6
// November 2026 — is recorded on the order (city.stackedOn) and rung to the
// operator, who refunds it if that search is still running. With only the
// e-mail in common (match 'check') the buyer may be another person: that pack
// keeps the link the page promises, and the bot says what to verify first.

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
 * opts: { statement: a withdrawal statement, not a refund; pack: the lead of
 * the pack an order paid in full names (creditDue.from) as read now; id: the
 * order's own id when the lead does not carry it }.
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
  // paid in full by someone who held an open pack credit: what became of the pack amount owed back on THIS order
  // (opts.pack = the pack's lead as read now; undefined = the caller could not read it)
  if (c.creditDue && typeof c.creditDue === 'object' && c.creditDue.from) return creditDueClause(lead, opts.pack, fmt, opts.id);
  // the lookup of the payer's earlier orders had failed at the payment: nobody knows whether a credit was owed here
  // (only on the plan a pack leads to: no other payment can owe a credit back)
  if (c.creditUnverified === true && Object.values(UPGRADE_PATHS).includes(String(c.service || lead.kind || ''))) return 'al pagamento di questo ordine non avevo potuto leggere gli ordini precedenti di chi paga: se un rimborso su questo ordine è il credito di un pack, quel credito NON si chiude da solo (non so quale pack sia)';
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
  return openCreditsFor(orders, cityKey, kind, nowMs)[0] || null;
}
/**
 * EVERY open credit under those orders for `kind` on this desk, the oldest
 * payment first (then by id: the answer never depends on the order Firestore
 * lists them in). One address can hold more than one pack — a couple, a
 * relocation office — and the payer's own is the one whose phone matches.
 */
export function openCreditsFor(orders, cityKey, kind, nowMs) {
  const out = [];
  for (const d of Array.isArray(orders) ? orders : []) {
    if (!d || !isUpgradeLeadId(d.id)) continue;
    const o = upgradeOffer(d, d.id, nowMs);
    if (o.ok && o.city === cityKey && o.to === kind) out.push({ id: String(d.id), offer: o, phone: String(d.phone || ''), name: String(d.name || '') });
  }
  return out.sort((a, b) => (a.offer.paidAt < b.offer.paidAt ? -1 : a.offer.paidAt > b.offer.paidAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * An order paid in full that still WAITS for the refund of a pack's credit
 * (creditDueFrom on it): paid, not refunded whole, its payment not given back
 * to the payer by the bank. A dispute that is still OPEN only suspends that
 * refund (won, it is due again): the order keeps waiting and the pack's link
 * stays withheld meanwhile. Lost = disputedAt with disputeClosedAt.
 */
export const claimWaits = (d) => !!(d && d.id && d.paid === true && d.refundedFull !== true && !(d.disputedAt && d.disputeClosedAt));

/**
 * What became of the credit an order paid in full owes back (city.creditDue).
 * Pure: the order, and the pack it names as read NOW (`null` = that lead is
 * not there; `undefined` = the caller did not or could not read it).
 *  'due'            still owed on this order
 *  'refunded'       closed by a refund on THIS order (the pack carries its mark)
 *  'order-refunded' the whole order went back: nothing was credited
 *  'order-disputed' the bank holds this order's payment; 'order-lost': it gave it back to the payer
 *  'pack-used'      the pack's credit was spent by another order
 *  'pack-refunded' / 'pack-disputed' / 'pack-lost'  the pack's own money went back / is with the bank / was
 *                   given back by the bank (a dispute closed and not won keeps disputedAt, with disputeClosedAt)
 *  'pack-missing' / 'unknown'
 * Returns null when the order owes no credit.
 */
export function creditDueState(order, pack, orderId) {
  const c = order && order.city && typeof order.city === 'object' ? order.city : null;
  const due = c && c.creditDue && typeof c.creditDue === 'object' && c.creditDue.from ? c.creditDue : null;
  if (!due) return null;
  // the order's own id: a lead read with fsGet does not carry it, so the caller may pass it
  const oid = String(orderId || order.id || '');
  const used = pack && pack.credit && typeof pack.credit === 'object' && pack.credit.usedBy ? String(pack.credit.usedBy) : null;
  if (used && oid && used === oid) return 'refunded';
  if (order.refundedFull === true) return 'order-refunded';
  if (order.disputedAt) return order.disputeClosedAt ? 'order-lost' : 'order-disputed';
  if (pack === undefined) return 'unknown';
  if (pack === null) return 'pack-missing';
  if (used) return 'pack-used';
  const gone = upgradeVoidReason(pack);
  if (gone) return gone === 'disputed' ? (pack.disputeClosedAt ? 'pack-lost' : 'pack-disputed') : 'pack-refunded';
  return 'due';
}
/** The operator's clause (Italian) for an order that owes — or owed — a pack's credit back: one copy for every card and for the bot. */
export function creditDueClause(order, pack, fmt = (n) => String(n), orderId) {
  const state = creditDueState(order, pack, orderId);
  if (!state) return '';
  const due = order.city.creditDue, from = String(due.from), amt = Number(due.amount) || 0;
  const back = amt > 0 ? ` (${fmt(amt)})` : '';
  const used = pack && pack.credit && typeof pack.credit === 'object' && pack.credit.usedBy ? String(pack.credit.usedBy) : '';
  switch (state) {
    case 'refunded': return `il credito di ${from}${back} è già stato rimborsato su questo ordine: per quel credito non è dovuto altro`;
    case 'order-refunded': return `questo ordine è stato rimborsato per intero: il rimborso del credito di ${from}${back} non è più dovuto`;
    case 'order-disputed': return `il pagamento di questo ordine è contestato in banca: il rimborso del credito di ${from}${back} resta sospeso`;
    case 'order-lost': return `la banca ha restituito il pagamento di questo ordine al cliente (contestazione persa): il rimborso del credito di ${from}${back} non è più dovuto`;
    case 'pack-used': return `il credito di ${from}${back} risulta usato dall'ordine ${used}: su questo ordine non è più dovuto`;
    case 'pack-refunded': return `il pack ${from} è stato rimborsato: il suo credito${back} non è più dovuto su questo ordine`;
    case 'pack-disputed': return `il pagamento del pack ${from} è contestato in banca: il rimborso del suo credito${back} resta sospeso`;
    case 'pack-lost': return `la banca ha restituito il pagamento del pack ${from} al cliente (contestazione persa): il suo credito${back} non è più dovuto su questo ordine`;
    case 'pack-missing': return `su questo ordine era dovuto il rimborso del credito di ${from}${back}, ma quell'ordine non si trova: verifica a mano`;
    default: {
      const already = Number(order.refundedAmount) > 0 ? ` — su questo ordine sono già segnati ${fmt(Number(order.refundedAmount))} di rimborso, che non hanno chiuso quel credito` : '';
      const head = due.match === 'same'
        ? `su questo ordine è dovuto il rimborso del credito di ${from}${back}`
        : `su questo ordine potrebbe essere dovuto il rimborso del credito di ${from}${back}: al pagamento il telefono non coincideva con quello del pack — verifica che sia la stessa persona`;
      return head + (due.statement === true ? ' — su quel pack c\'era una dichiarazione di recesso: un rimborso solo, non due' : '') + already
        + (state === 'unknown' ? ' (non ho potuto rileggere quel pack: verifica che non sia già stato rimborsato o usato)' : '');
    }
  }
}

/**
 * A refund stamped on an order paid in full by a pack holder (creditDue):
 * does it close the pack's credit, and what does the operator read? Pure.
 * `ev` = THIS event's own totals — { refunded: Stripe's cumulative amount for
 * the charge, full: whether that is the whole charge } — never the totals the
 * order carries after other events: the answer must not depend on the order
 * the events arrive in. `pack` = the pack's lead as read now (null: gone).
 *  - a refund of the whole order returns everything: nothing was credited;
 *  - a partial refund that reaches the pack amount is the credit going back
 *    and closes the pack — when the phone did not match at the payment
 *    (match 'check') only a refund of EXACTLY the pack amount does: any other
 *    figure may be the payer's own business (a withdrawal), and the pack may
 *    be someone else's;
 *  - never over another order's mark, never on a pack whose money went back:
 *    the PACK's own state is read first — once its credit is spent, refunded
 *    or with the bank, nothing is owed on this order whatever the refund is,
 *    and no sentence says the credit is "due" or "open";
 *  - a refund that comes after the credit was closed here says so;
 *  - what the pack keeps after a refund of the whole order is said as it is
 *    at `nowMs` (still open until its date, or expired).
 * Returns { close: boolean, clause: string }; with close, the caller writes
 * credit { usedBy: orderId, via: 'full-price', atRefund: ev.refunded }.
 */
export function refundCreditVerdict(due, orderId, ev, pack, fmt = (n) => String(n), nowMs = Date.now()) {
  const from = String(due.from), amt = Number(due.amount) || 0, back = amt > 0 ? ` (${fmt(amt)})` : '';
  const total = Number(ev && ev.refunded) || 0, whole = !!(ev && ev.full);
  if (!pack) return { close: false, clause: `su questo ordine era dovuto il rimborso del credito di ${from}${back}, ma quell'ordine non si trova: verifica a mano` };
  const credit = pack.credit && typeof pack.credit === 'object' ? pack.credit : null;
  const used = credit && credit.usedBy ? String(credit.usedBy) : null;
  if (used === String(orderId)) {
    const at = Number(credit.atRefund) || 0;
    if (whole) return { close: false, clause: `il credito di ${from}${back} era già stato rimborsato su questo ordine: quel credito resta chiuso` };
    if (at > 0 && total > at + 0.005) return { close: false, clause: `ATTENZIONE: il credito di ${from}${back} era già stato rimborsato su questo ordine (quando il totale rimborsato era ${fmt(at)}): questo è un rimborso in più, totale ${fmt(total)}` };
    return { close: false, clause: `il rimborso del credito di ${from}${back} è segnato: il credito di quel pack è chiuso` };
  }
  const sure = due.match === 'same';
  const reaches = amt > 0 && total + 0.005 >= amt;
  // the pack carries no credit any more for a reason of its own (spent through the link, refunded, with the bank)
  const gone = used ? null : upgradeVoidReason(pack);
  if (used || gone) {
    const held = gone === 'disputed' && !pack.disputeClosedAt; // a dispute still open: suspended, not over
    const why = used ? `già usato da ${used}` : held ? 'pack contestato in banca' : gone === 'disputed' ? 'la banca ha restituito il pack al cliente' : 'pack già rimborsato';
    if (whole) return { close: false, clause: `rimborso totale: il credito di ${from}${back} che era dovuto su questo ordine non lo è più (${why})` };
    if (!reaches) return { close: false, clause: `il rimborso del credito di ${from}${back} ${held ? 'è sospeso' : 'non è più dovuto su questo ordine'} (${why}): questo rimborso non lo riguarda` };
    return { close: false, clause: used
      ? `ATTENZIONE: il credito di ${from} risulta già usato da ${used}: su questo ordine non era più dovuto — se questo rimborso era il credito, è un doppione`
      : `ATTENZIONE: il pack ${from} risulta ${held ? 'contestato in banca' : gone === 'disputed' ? 'restituito dalla banca al cliente' : 'già rimborsato'}: il suo credito non era più dovuto — se questo rimborso era il credito, ${held ? 'verificalo' : 'è un secondo rimborso dello stesso pack'}` };
  }
  if (whole) return { close: false, clause: `rimborso totale: il credito di ${from}${back} che era dovuto su questo ordine non lo è più — ${packCreditPhrase(pack, from, nowMs)}` };
  if (!reaches) {
    return { close: false, clause: `su questo ordine ${sure ? 'è' : 'potrebbe essere'} dovuto il rimborso del credito di ${from}${back}: questo rimborso è inferiore e non lo chiude` };
  }
  if (!sure && Math.abs(total - amt) > 0.005) {
    return { close: false, clause: `su questo ordine il credito di ${from}${back} era da verificare (al pagamento il telefono non coincideva): questo rimborso, ${fmt(total)} in tutto, non è della cifra del credito, quindi NON chiudo il credito di quel pack — se era il rimborso del credito, il link di upgrade di quel pack resta aperto` };
  }
  return { close: true, clause: `era il rimborso del credito di ${from}${back}: il credito di quel pack è chiuso` };
}

/** What a pack whose credit this refund did NOT close still carries, as it is at `nowMs` (one Italian phrase). */
function packCreditPhrase(pack, from, nowMs) {
  const o = upgradeOffer(pack, from, nowMs);
  if (o.ok) return `quel pack tiene il suo credito${o.expiresAt ? ` (fino al ${dmyRome(o.expiresAt)})` : ''}`;
  if (o.state === 'expired') return `il credito di quel pack è scaduto il ${dmyRome(o.expiresAt)}`;
  return 'quel pack non ha più un credito da usare';
}

// leads/book_<requestId>: an order taken at signing (api/_cityorder.js)
const BOOKED_RE = /^book_[A-Za-z0-9_]{6,60}$/;
/**
 * A desk whose terms charge nothing alongside a Full Search (Berlin, Terms
 * §12.5 — the registry's noStacking): the Full Search this payer already
 * holds there, among their own earlier orders, when the plan now paid is
 * anything else. Two kinds count: one paid by card (not refunded whole, not
 * with the bank) and one booked at signing — the orders of 5–6 November 2026
 * keep the terms they were placed under — until it is withdrawn, closed or
 * ended by a signing. Among several, the payer's own (same phone) comes
 * first. Pure. Returns { id, file, phone } or null. Whether a search paid by
 * card is still RUNNING is not in the data: the operator judges.
 */
export function fullSearchHeld(orders, cityKey, kind, phone = '') {
  const k = String(cityKey || '').toLowerCase();
  const desk = Object.prototype.hasOwnProperty.call(CITY_MARKETS, k) ? CITY_MARKETS[k] : null;
  if (!desk || desk.noStacking !== true || !kind || String(kind) === 'full-search') return null;
  let first = null;
  for (const d of Array.isArray(orders) ? orders : []) {
    const c = d && d.city && typeof d.city === 'object' ? d.city : null;
    if (!c || d.market !== k || String(c.service || d.kind || '') !== 'full-search') continue;
    // money that went back in full, or that the bank is taking back, is not a Full Search the client holds
    const card = isUpgradeLeadId(d.id) && d.intent === 'city_order' && d.paid === true && c.paid === true && d.refundedFull !== true && !d.disputedAt;
    const sg = d.signing && typeof d.signing === 'object' ? String(d.signing.status || '') : '';
    const booked = BOOKED_RE.test(String(d.id || '')) && d.intent === 'city_booking' && d.booked === true && d.paid !== true
      && !d.withdrawnAt && !d.closedAt && sg !== 'invoiced' && sg !== 'no_fee';
    if (!card && !booked) continue;
    const hit = { id: String(d.id), file: typeof c.file === 'string' ? c.file : null, phone: String(d.phone || '') };
    if (samePhone(hit.phone, phone)) return hit;
    if (!first) first = hit;
  }
  return first;
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
// dd/mm/yyyy of an instant on the Rome calendar, built from the parts (no locale data: the order never flips)
const dmyRome = (iso) => {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '—';
  const p = romeParts(t);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
};
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
