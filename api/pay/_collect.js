// api/pay/_collect.js
// Shared BOOM Pay collection core — the single source of truth for charging
// one month's rent. Called by:
//   • api/pay/collect.js          (manual admin trigger)
//   • api/reminder-cron.js        (autonomous, on the due date)
// so both paths behave identically.
//
// Never throws for expected conditions: returns { ok, code, httpStatus, ... }.
// On a Stripe failure it records the failure on the payments doc (so the retry
// ladder + recovery queue can see it) and returns ok:false.

import { fsGet, fsPatch, fsCreate } from '../homie/_lib.js';
import { getStripe, computeFees, eur } from './_pay.js';

async function ledger(event, details) {
  try { await fsCreate('payEvents', { event, ...details, createdAt: new Date() }); }
  catch (e) { console.warn('[pay/_collect] ledger failed:', e.message); }
}

// Codes that mean "not on the rails (yet)" — the caller should NOT keep
// retrying every cron tick; it's a manual/un-onboarded payment.
export const INELIGIBLE_CODES = [
  'landlord_not_onboarded', 'landlord_connect_incomplete',
  'no_active_mandate', 'stripe_unconfigured',
  'payment_missing_contract_or_amount', 'contract_not_found', 'owner_unresolved',
];

export async function collectPayment(paymentId, { source = 'manual' } = {}) {
  let stripe;
  try { stripe = getStripe(); }
  catch (e) { return { ok: false, code: 'stripe_unconfigured', httpStatus: 500 }; }

  const pay = await fsGet('payments/' + paymentId);
  if (!pay) return { ok: false, code: 'payment_not_found', httpStatus: 404 };
  if (pay.status === 'paid' || pay.status === 'processing') {
    return { ok: false, code: 'already_' + pay.status, httpStatus: 409 };
  }
  if (!pay.contractId || !pay.amount) {
    return { ok: false, code: 'payment_missing_contract_or_amount', httpStatus: 400 };
  }

  const contract = await fsGet('contracts/' + pay.contractId);
  if (!contract) return { ok: false, code: 'contract_not_found', httpStatus: 404 };

  const property = pay.propertyId ? await fsGet('properties/' + pay.propertyId) : null;
  const ownerId = (property && property.ownerId) || contract.ownerId || null;
  if (!ownerId) return { ok: false, code: 'owner_unresolved', httpStatus: 400 };

  const profile = await fsGet('payProfiles/' + ownerId);
  if (!profile || !profile.stripeAccountId) return { ok: false, code: 'landlord_not_onboarded', httpStatus: 412 };
  if (!profile.chargesEnabled || !profile.payoutsEnabled) return { ok: false, code: 'landlord_connect_incomplete', httpStatus: 412 };

  const mandate = await fsGet('mandates/' + pay.contractId);
  if (!mandate || mandate.status !== 'active' || !mandate.stripeCustomerId || !mandate.stripePaymentMethodId) {
    return { ok: false, code: 'no_active_mandate', httpStatus: 412 };
  }

  const fees = computeFees(pay.amount, {
    feeLandlordBps: profile.feeLandlordBps,
    feeTenantBps: profile.feeTenantBps,
  });
  const attempt = (Number(pay.attemptCount) || 0) + 1;

  try {
    const pi = await stripe.paymentIntents.create({
      amount: fees.chargeAmount,
      currency: 'eur',
      customer: mandate.stripeCustomerId,
      payment_method: mandate.stripePaymentMethodId,
      payment_method_types: ['sepa_debit'],
      confirm: true,
      off_session: true,
      application_fee_amount: fees.applicationFee,
      transfer_data: { destination: profile.stripeAccountId },
      metadata: {
        kind: 'rent', paymentId, contractId: pay.contractId,
        ownerId, month: pay.month || '', source,
      },
      description: `BOOM rent ${pay.month || ''} · ${property ? (property.name || property.address || '') : ''}`.trim(),
    }, { idempotencyKey: `rent_${paymentId}_a${attempt}` });

    await fsPatch('payments/' + paymentId, {
      status: 'processing',
      paymentRail: 'sdd',
      stripePaymentIntentId: pi.id,
      mandateId: pay.contractId,
      chargedAmount: fees.chargeAmount,
      applicationFee: fees.applicationFee,
      feeLandlord: fees.landlordFee,
      feeTenant: fees.tenantFee,
      landlordNet: fees.landlordNet,
      attemptCount: attempt,
      lastAttemptAt: new Date(),
      failureReason: '',
      passPaidPushed: false,
    });

    await ledger('collect_initiated', {
      paymentId, contractId: pay.contractId, ownerId, source,
      paymentIntentId: pi.id, chargeEur: eur(fees.chargeAmount),
      applicationFeeEur: eur(fees.applicationFee), piStatus: pi.status,
    });

    return {
      ok: true, code: 'processing', httpStatus: 200,
      paymentIntentId: pi.id, piStatus: pi.status,
      charged: eur(fees.chargeAmount), applicationFee: eur(fees.applicationFee),
      landlordNet: eur(fees.landlordNet),
    };
  } catch (e) {
    await fsPatch('payments/' + paymentId, {
      status: 'failed',
      failureReason: e.message || 'collect_error',
      attemptCount: attempt,
      lastAttemptAt: new Date(),
    });
    await ledger('collect_failed', { paymentId, ownerId, source, error: e.message });
    return { ok: false, code: 'collect_failed', httpStatus: 502, detail: e.message };
  }
}
