// api/pay/connect.js
// BOOM Pay — landlord Stripe Connect (Express) onboarding + status.
//
// POST { action: 'onboard' }  → ensures a Connect Express account exists for
//   the landlord, returns a one-time onboarding URL (hosted by Stripe).
// POST { action: 'status' }   → re-syncs charges/payouts enablement from
//   Stripe into payProfiles/<ownerId> and returns it.
//
// Auth: Firebase ID token (admin / owner / landlord). A landlord onboards
// themselves (ownerId = their uid); an admin may pass body.ownerId to onboard
// on a landlord's behalf.

import { requireRole, setCors } from '../_auth.js';
import { fsGet, fsPatch, readJson } from '../homie/_lib.js';
import { getStripe, RETURN_BASE, setPayCors } from './_pay.js';

export default async function handler(req, res) {
  setCors(req, res);
  setPayCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return; // requireRole already wrote the response

  const body = (await readJson(req)) || {};
  const action = body.action || 'onboard';
  // Landlords act on themselves; only admins may target another ownerId.
  const ownerId = (auth.profile.role === 'admin' && body.ownerId) ? body.ownerId : auth.uid;

  let stripe;
  try { stripe = getStripe(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'stripe_unconfigured' }); }

  try {
    const profile = (await fsGet('payProfiles/' + ownerId)) || {};
    let accountId = profile.stripeAccountId || null;

    // ── status: just resync from Stripe ───────────────────────────────────
    if (action === 'status') {
      if (!accountId) return res.status(200).json({ ok: true, onboarded: false, hasAccount: false });
      const acct = await stripe.accounts.retrieve(accountId);
      const synced = await syncAccount(ownerId, acct);
      return res.status(200).json({ ok: true, ...synced });
    }

    // ── onboard: ensure account + return hosted onboarding link ───────────
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        country: 'IT',
        email: auth.email || profile.email || undefined,
        business_type: 'individual',
        capabilities: {
          transfers: { requested: true },
          sepa_debit_payments: { requested: true },
        },
        metadata: { ownerId, platform: 'boom-pay' },
      });
      accountId = acct.id;
      await fsPatch('payProfiles/' + ownerId, {
        ownerId,
        stripeAccountId: accountId,
        email: auth.email || '',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${RETURN_BASE}/boom-pay.html?connect=refresh`,
      return_url: `${RETURN_BASE}/boom-pay.html?connect=done`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ ok: true, url: link.url, accountId });
  } catch (e) {
    console.error('[pay/connect] error:', e.message);
    return res.status(500).json({ ok: false, error: 'connect_failed', detail: e.message });
  }
}

async function syncAccount(ownerId, acct) {
  const out = {
    onboarded: !!(acct.charges_enabled && acct.payouts_enabled),
    hasAccount: true,
    chargesEnabled: !!acct.charges_enabled,
    payoutsEnabled: !!acct.payouts_enabled,
    detailsSubmitted: !!acct.details_submitted,
  };
  await fsPatch('payProfiles/' + ownerId, {
    chargesEnabled: out.chargesEnabled,
    payoutsEnabled: out.payoutsEnabled,
    detailsSubmitted: out.detailsSubmitted,
    updatedAt: new Date(),
  });
  return out;
}
