// api/pay/collect.js
// BOOM Pay — collect one month's rent for a single `payments` doc.
//
// POST { paymentId } → creates a PaymentIntent off the tenant's saved SEPA
// mandate, charging (rent + tenantFee), skimming BOOM's application_fee
// (landlordFee + tenantFee) at the rail, and routing the rest to the
// landlord's Connect account (transfer_data.destination). The `payments` doc
// becomes status:'processing'; the stripe-webhook flips it to 'paid' (SEPA
// settles asynchronously) or 'failed'.
//
// This is the manual-trigger Phase-1 entrypoint. Phase 2 wires the same call
// into reminder-cron.js so collection happens automatically on the due date.
//
// Auth: admin Firebase ID token, OR the Vercel cron secret (Bearer) for the
// future automated path.

import { requireRole, bearerFrom, setCors } from '../_auth.js';
import { fsGet, fsPatch, fsCreate, readJson } from '../homie/_lib.js';
import { getStripe, computeFees, setPayCors, eur } from './_pay.js';

export default async function handler(req, res) {
  setCors(req, res);
  setPayCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Allow either an admin browser call or the cron secret.
  const cronOk = process.env.CRON_SECRET && bearerFrom(req) === process.env.CRON_SECRET;
  if (!cronOk) {
    const auth = await requireRole(req, res, ['admin']);
    if (!auth) return;
  }

  const body = (await readJson(req)) || {};
  const paymentId = String(body.paymentId || '').trim();
  if (!paymentId) return res.status(400).json({ ok: false, error: 'missing_paymentId' });

  let stripe;
  try { stripe = getStripe(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'stripe_unconfigured' }); }

  try {
    const pay = await fsGet('payments/' + paymentId);
    if (!pay) return res.status(404).json({ ok: false, error: 'payment_not_found' });
    if (pay.status === 'paid' || pay.status === 'processing') {
      return res.status(409).json({ ok: false, error: 'already_' + pay.status });
    }
    if (!pay.contractId || !pay.amount) {
      return res.status(400).json({ ok: false, error: 'payment_missing_contract_or_amount' });
    }

    const contract = await fsGet('contracts/' + pay.contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });

    // ownerId comes from the property (a landlord can own several).
    const property = pay.propertyId ? await fsGet('properties/' + pay.propertyId) : null;
    const ownerId = (property && property.ownerId) || contract.ownerId || null;
    if (!ownerId) return res.status(400).json({ ok: false, error: 'owner_unresolved' });

    const profile = await fsGet('payProfiles/' + ownerId);
    if (!profile || !profile.stripeAccountId) {
      return res.status(412).json({ ok: false, error: 'landlord_not_onboarded' });
    }
    if (!profile.chargesEnabled || !profile.payoutsEnabled) {
      return res.status(412).json({ ok: false, error: 'landlord_connect_incomplete' });
    }

    const mandate = await fsGet('mandates/' + pay.contractId);
    if (!mandate || mandate.status !== 'active' || !mandate.stripeCustomerId || !mandate.stripePaymentMethodId) {
      return res.status(412).json({ ok: false, error: 'no_active_mandate' });
    }

    const fees = computeFees(pay.amount, {
      feeLandlordBps: profile.feeLandlordBps,
      feeTenantBps: profile.feeTenantBps,
    });

    const attempt = (Number(pay.attemptCount) || 0) + 1;

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
        kind: 'rent',
        paymentId,
        contractId: pay.contractId,
        ownerId,
        month: pay.month || '',
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
      // let the wallet cron re-push "Pagato ✓" once it settles
      passPaidPushed: false,
    });

    await ledger('collect_initiated', {
      paymentId, contractId: pay.contractId, ownerId,
      paymentIntentId: pi.id, chargeEur: eur(fees.chargeAmount),
      applicationFeeEur: eur(fees.applicationFee), piStatus: pi.status,
    });

    return res.status(200).json({
      ok: true,
      paymentIntentId: pi.id,
      piStatus: pi.status, // 'processing' for SEPA (settles async)
      charged: eur(fees.chargeAmount),
      applicationFee: eur(fees.applicationFee),
      landlordNet: eur(fees.landlordNet),
    });
  } catch (e) {
    // Off-session failures (e.g. inactive mandate) surface here.
    console.error('[pay/collect] error:', e.message);
    try {
      await fsPatch('payments/' + paymentId, {
        status: 'failed',
        failureReason: e.message || 'collect_error',
        lastAttemptAt: new Date(),
      });
      await ledger('collect_failed', { paymentId, error: e.message });
    } catch (_) {}
    return res.status(502).json({ ok: false, error: 'collect_failed', detail: e.message });
  }
}

async function ledger(event, details) {
  try { await fsCreate('payEvents', { event, ...details, createdAt: new Date() }); }
  catch (e) { console.warn('[pay/collect] ledger failed:', e.message); }
}
