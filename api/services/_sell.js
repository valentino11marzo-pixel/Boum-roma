// api/services/_sell.js
// IL LINK CHE VENDE — the operator's checkout, inside the conversation.
//
// Why this exists: every euro BOOM has ever taken came from a channel with a
// human in it (WhatsApp, a deal, a direct search). That channel had no button
// to charge with: the operator convinced someone, then had to send them off to
// find a page. This closes that gap — one tap produces a link that opens
// Stripe on the right service, at the catalog price, with the client's name
// already on it.
//
// The signature is DERIVED, never stored (same pattern as the viewings'
// manageToken and the scheda tokens): every service in the catalog already has
// a valid operator link, there is nothing to migrate, and rotating
// HOMIE_SECRET revokes every link ever handed out.
//
// The security rule that must not drift: a BARE link (no signature) can still
// only buy `EMAIL_BUYABLE` kinds — the ones safe to sell with no context. The
// signature is what unlocks the rest, and only the operator can mint it.

import crypto from 'crypto';
import { CATALOG } from '../_catalog.js';

const SITE = 'https://www.boomrome.com';

function salt() {
  return process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
}

/**
 * The token that authorises selling ANY catalog kind from a link.
 * Bound to the kind so a link for a €49 check can never be replayed as a €350
 * one; NOT bound to the email, so the operator can send the same link to a
 * client who then types their own address on Stripe (the webhook already
 * prefers what the buyer typed).
 */
export function sellToken(kind) {
  return crypto.createHash('sha256')
    .update(`service-sell:${kind}:${salt()}`)
    .digest('hex').slice(0, 16);
}

/** Timing-safe check. Unknown kinds are rejected before any comparison. */
export function verifySell(kind, sig) {
  if (!kind || !sig || !CATALOG[kind]) return false;
  const a = Buffer.from(String(sig), 'utf8');
  const b = Buffer.from(sellToken(kind), 'utf8');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

/**
 * The shareable URL. `e`/`n` are optional conveniences (prefill), `ref` is
 * free-form context that rides into the Stripe metadata — a lead id, a
 * contract id, "whatsapp".
 */
export function sellUrl(kind, { email = '', name = '', ref = '' } = {}) {
  if (!CATALOG[kind]) return null;
  const q = new URLSearchParams({ kind, sig: sellToken(kind) });
  if (email) q.set('e', email);
  if (name) q.set('n', name);
  if (ref) q.set('ref', ref);
  return `${SITE}/api/services/buy?${q}`;
}

/** Catalog as a list, cheapest first — what the operator picks from. */
export function sellables() {
  return Object.entries(CATALOG)
    .map(([kind, v]) => ({ kind, eur: v.eur, label: v.label }))
    .sort((a, b) => a.eur - b.eur);
}

/**
 * Resolve what the operator typed to a catalog kind: exact id, unique prefix,
 * or a unique word match on the label. AMBIGUOUS is returned rather than
 * guessed — sending a client the wrong price is worse than asking again.
 */
export function matchKind(input) {
  const q = String(input || '').trim().toLowerCase();
  if (!q) return null;
  if (CATALOG[q]) return q;
  const keys = Object.keys(CATALOG);
  const starts = keys.filter(k => k.startsWith(q));
  if (starts.length === 1) return starts[0];
  const words = keys.filter(k =>
    k.includes(q) || CATALOG[k].label.toLowerCase().includes(q));
  if (words.length === 1) return words[0];
  return words.length > 1 || starts.length > 1 ? 'AMBIGUOUS' : null;
}
