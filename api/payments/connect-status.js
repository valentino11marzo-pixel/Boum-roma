// api/payments/connect-status.js
// POST — check whether a landlord's Connect account is ready to receive payouts.
// Drives the owner portal's "Incassi attivi" state and gates direct charges.
//
// Body: { contractId } or { accountId }
// Auth: test mode -> X-Pay-Test-Secret; live mode -> Firebase ID token.

import { setCors, requireRole } from '../_auth.js';
import { readJson, fsGet, fsPatch } from '../homie/_lib.js';
import { resolveStripe, requireTestSecret, isLive } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (isLive()) {
    const auth = await requireRole(req, res, ['admin', 'landlord', 'owner']);
    if (!auth) return;
  } else if (!requireTestSecret(req, res)) {
    return;
  }

  const { stripe, mode, error } = resolveStripe();
  if (error) return res.status(503).json({ ok: false, error });

  const body = (await readJson(req)) || {};
  const contractId = String(body.contractId || '').trim();
  let accountId = String(body.accountId || '').trim();

  try {
    if (!accountId && contractId) {
      const contract = await fsGet('contracts/' + contractId).catch(() => null);
      accountId = contract?.payment?.landlordAccountId || '';
    }
    if (!accountId) return res.status(400).json({ ok: false, error: 'account_not_found' });

    const acct = await stripe.accounts.retrieve(accountId);
    const ext = acct.external_accounts?.data?.[0] || null;
    const ready = !!(acct.charges_enabled || acct.payouts_enabled) && (acct.requirements?.currently_due || []).length === 0;
    const status = ready ? 'active' : (acct.requirements?.disabled_reason ? 'blocked' : 'verification_pending');

    if (contractId) {
      await fsPatch('contracts/' + contractId, { payment: { payoutStatus: status } }).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      mode,
      accountId,
      status,
      payoutsEnabled: !!acct.payouts_enabled,
      chargesEnabled: !!acct.charges_enabled,
      ibanLast4: ext?.last4 || null,
      currentlyDue: acct.requirements?.currently_due || [],
      disabledReason: acct.requirements?.disabled_reason || null,
    });
  } catch (err) {
    console.error('[payments/connect-status]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
