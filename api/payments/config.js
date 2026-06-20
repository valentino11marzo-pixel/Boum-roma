// api/payments/config.js
// GET — returns the (public) Stripe publishable key + current mode so the
// browser (tenant portal / test harness) can initialise Stripe.js. The
// publishable key is safe to expose; the secret key never leaves the server.

import { setCors } from '../_auth.js';
import { resolveStripe, publishableKey, isLive } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { error, mode } = resolveStripe();
  const pk = publishableKey();
  return res.status(200).json({
    ok: !error && !!pk,
    mode: mode || (isLive() ? 'live' : 'test'),
    publishableKey: pk || null,
    method: 'sepa_debit',
    configError: error || (!pk ? 'publishable_key_unset' : null),
  });
}
