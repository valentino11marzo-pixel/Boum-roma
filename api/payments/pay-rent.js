// api/payments/pay-rent.js
// POST — create a rent PaymentIntent for one contract + period (SEPA debit).
// Two modes:
//   • on_session (manual "Paga ora"): returns a client_secret for the browser
//     to confirm with Stripe.js (saved IBAN or a freshly entered one).
//   • off_session (autopay): server confirms immediately using the saved
//     SEPA payment method on the contract.
// The charge logic lives in _lib.js (chargeRentPeriod) so autopay-run.js runs
// the exact same code. The webhook (/api/payments/webhook) advances the ledger
// to paid/failed and bridges the wallet/portal schedule.
//
// Body: { contractId, period, amountCents?, offSession?, paymentMethodId? }
// Auth: live -> Firebase ID token; test -> harness secret OR Firebase token.

import { setCors } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { resolveStripe, requirePayAuth, chargeRentPeriod } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!(await requirePayAuth(req, res, ['tenant', 'admin', 'landlord', 'owner']))) return;

  const { stripe, mode, error } = resolveStripe();
  if (error) return res.status(503).json({ ok: false, error });

  const body = (await readJson(req)) || {};
  const r = await chargeRentPeriod(stripe, mode, {
    contractId: body.contractId,
    period: body.period,
    amountCents: body.amountCents,
    offSession: body.offSession,
    paymentMethodId: body.paymentMethodId,
    customerId: body.customerId,
  });

  if (!r.ok) {
    const code = ['contractId_and_period_required', 'amount_unresolved',
      'no_customer_setup_mandate_first', 'no_saved_payment_method_for_autopay'].includes(r.error) ? 400 : 500;
    return res.status(code).json({ ok: false, error: r.error, code: r.code || null });
  }
  return res.status(200).json({
    ok: true, mode,
    paymentIntentId: r.paymentIntentId,
    status: r.status,
    idempotent: r.idempotent || undefined,
    clientSecret: r.clientSecret,
  });
}
