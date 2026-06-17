// api/payments/pay-rent.js
// POST — create a rent PaymentIntent for one contract + period (SEPA debit,
// collected into BOOM's account). Two modes:
//   • on_session (manual "Paga ora"): returns a client_secret for the browser
//     to confirm with Stripe.js (saved IBAN or a freshly entered one).
//   • off_session (autopay): server confirms immediately using the saved
//     SEPA payment method on the contract.
// The webhook (/api/payments/webhook) advances the ledger to paid/failed.
//
// Body: { contractId, period, amountCents?, offSession?, paymentMethodId? }
// Auth: test mode -> X-Pay-Test-Secret; live mode -> Firebase ID token.

import { setCors, requireRole } from '../_auth.js';
import { readJson, fsGet, fsPatch } from '../homie/_lib.js';
import { resolveStripe, requireTestSecret, isLive, ledgerId, estSepaFeeCents } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (isLive()) {
    const auth = await requireRole(req, res, ['tenant', 'admin', 'landlord', 'owner']);
    if (!auth) return;
  } else if (!requireTestSecret(req, res)) {
    return;
  }

  const { stripe, mode, error } = resolveStripe();
  if (error) return res.status(503).json({ ok: false, error });

  const body = (await readJson(req)) || {};
  const contractId = String(body.contractId || '').trim();
  const period = String(body.period || '').trim(); // e.g. "2026-07"
  if (!contractId || !period) return res.status(400).json({ ok: false, error: 'contractId_and_period_required' });

  const id = ledgerId(contractId, period);

  try {
    // Idempotency: if this period is already settled or in flight, don't re-charge.
    const existing = await fsGet('rentPayments/' + id).catch(() => null);
    if (existing && ['paid', 'processing'].includes(existing.status)) {
      return res.status(200).json({ ok: true, mode, status: existing.status, idempotent: true, paymentIntentId: existing.stripePaymentIntent || null });
    }

    const contract = await fsGet('contracts/' + contractId).catch(() => null);
    const amountCents = Number(body.amountCents)
      || (contract?.rent ? Math.round(contract.rent * 100) : 0)
      || (contract?.lease?.rent ? Math.round(contract.lease.rent * 100) : 0);
    if (!amountCents || amountCents < 50) return res.status(400).json({ ok: false, error: 'amount_unresolved' });

    const customerId = contract?.payment?.stripeCustomerId || body.customerId;
    if (!customerId) return res.status(400).json({ ok: false, error: 'no_customer_setup_mandate_first' });

    const savedPm = body.paymentMethodId || contract?.payment?.sepaPmId || null;
    const offSession = !!body.offSession;

    const meta = { service: 'RENT', contractId, period };
    const base = {
      amount: amountCents,
      currency: 'eur',
      customer: customerId,
      payment_method_types: ['sepa_debit'],
      description: `Affitto ${period} — contratto ${contractId}`,
      metadata: meta,
      // Make every future debit reusable (mandate) and keep the method on file.
      setup_future_usage: 'off_session',
    };

    let intent;
    if (offSession) {
      // Autopay — confirm now with the saved mandate, tenant not present.
      if (!savedPm) return res.status(400).json({ ok: false, error: 'no_saved_payment_method_for_autopay' });
      intent = await stripe.paymentIntents.create(
        { ...base, payment_method: savedPm, confirm: true, off_session: true },
        { idempotencyKey: 'rent_' + id }
      );
    } else {
      // Manual — browser confirms. Pre-attach the saved method if we have one.
      intent = await stripe.paymentIntents.create(
        savedPm ? { ...base, payment_method: savedPm } : base,
        { idempotencyKey: 'rent_' + id }
      );
    }

    // Open the ledger row; the webhook moves it to paid/failed on settlement.
    await fsPatch('rentPayments/' + id, {
      contractId, period,
      amount: amountCents,
      fee: estSepaFeeCents(amountCents),
      net: amountCents - estSepaFeeCents(amountCents),
      currency: 'eur',
      status: intent.status === 'processing' ? 'processing' : 'created',
      method: 'sepa_debit',
      stripePaymentIntent: intent.id,
      mode,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.status(200).json({
      ok: true,
      mode,
      paymentIntentId: intent.id,
      status: intent.status,
      clientSecret: offSession ? undefined : intent.client_secret,
    });
  } catch (err) {
    // Stripe off_session failures surface as a specific error with a PI we can log.
    if (err?.raw?.payment_intent) {
      await fsPatch('rentPayments/' + id, {
        status: 'failed', failReason: err.code || err.message,
        stripePaymentIntent: err.raw.payment_intent.id, updatedAt: new Date(),
      }).catch(() => {});
    }
    console.error('[payments/pay-rent]', err);
    return res.status(500).json({ ok: false, error: err.message, code: err.code || null });
  }
}
