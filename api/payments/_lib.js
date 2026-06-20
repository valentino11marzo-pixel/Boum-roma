// api/payments/_lib.js
// Shared helpers for the rent-payment endpoints (SEPA Direct Debit, collect
// into BOOM's account). Built on the same Firestore-REST + admin-token pattern
// as the rest of /api. See PAYMENTS.md for the economics and architecture.
//
// SAFETY: rent payments default to Stripe TEST. They only operate against a
// live key when RENT_PAYMENTS_LIVE === 'true' AND STRIPE_SECRET_KEY is a real
// sk_live_ key. This means the new money code can be deployed and validated
// end-to-end with zero risk of a real charge until the operator explicitly
// flips it live. The existing live STRIPE_SECRET_KEY (PFS / reservations) is
// never used for rent unless that flag is set.
//
// Env vars:
//   RENT_PAYMENTS_LIVE          'true' to operate live; anything else = test
//   STRIPE_SECRET_KEY_TEST      sk_test_... (rent test mode)
//   STRIPE_SECRET_KEY           sk_live_... (only used for rent when LIVE)
//   STRIPE_PUBLISHABLE_KEY_TEST pk_test_... (client Elements, test)
//   STRIPE_PUBLISHABLE_KEY      pk_live_... (client Elements, live)
//   STRIPE_RENT_WEBHOOK_SECRET  whsec_... for /api/payments/webhook
//   PAY_TEST_SECRET             shared secret guarding the test harness

import Stripe from 'stripe';
import { secretEqual, getAdminToken, FS_BASE, toFsValue, fsGet, fsPatch } from '../homie/_lib.js';
import { requireRole } from '../_auth.js';

export function isLive() {
  return process.env.RENT_PAYMENTS_LIVE === 'true';
}

// Resolve a Stripe client safely. Returns { stripe, mode } or { error }.
export function resolveStripe() {
  const testKey = process.env.STRIPE_SECRET_KEY_TEST || '';
  const mainKey = process.env.STRIPE_SECRET_KEY || '';
  if (isLive()) {
    if (!mainKey.startsWith('sk_live_')) {
      return { error: 'RENT_PAYMENTS_LIVE=true but STRIPE_SECRET_KEY is not an sk_live_ key' };
    }
    return { stripe: new Stripe(mainKey), mode: 'live' };
  }
  // Test mode — prefer an explicit test key; tolerate STRIPE_SECRET_KEY only if
  // it is itself a test key. Never touch an sk_live_ key in test mode.
  const key = testKey || (mainKey.startsWith('sk_test_') ? mainKey : '');
  if (!key) return { error: 'Test mode: set STRIPE_SECRET_KEY_TEST (sk_test_...)' };
  if (key.startsWith('sk_live_')) return { error: 'Refusing to use a live key in test mode' };
  return { stripe: new Stripe(key), mode: 'test' };
}

export function publishableKey() {
  return isLive()
    ? (process.env.STRIPE_PUBLISHABLE_KEY || '')
    : (process.env.STRIPE_PUBLISHABLE_KEY_TEST || '');
}

// Test-harness auth: a shared secret, ONLY accepted while in test mode. In live
// mode the harness is disabled outright (real flows use Firebase auth instead).
export function requireTestSecret(req, res) {
  if (isLive()) {
    res.status(403).json({ ok: false, error: 'test_endpoint_disabled_in_live_mode' });
    return false;
  }
  const supplied = req.headers['x-pay-test-secret'] || req.headers['X-Pay-Test-Secret'] || '';
  const expected = process.env.PAY_TEST_SECRET || '';
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: PAY_TEST_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied), expected)) { res.status(401).json({ ok: false, error: 'invalid_test_secret' }); return false; }
  return true;
}

// Deterministic ledger id so every write for a given contract+period collapses
// onto one row — double taps, retries and webhook races are all idempotent.
export function ledgerId(contractId, period) {
  return String(contractId).replace(/[^a-zA-Z0-9_-]/g, '') + '_' + String(period).replace(/[^a-zA-Z0-9_-]/g, '');
}

// Informational only — what BOOM will pay Stripe on an inbound SEPA debit, so
// the ledger can store fee/net. NOT used to charge the tenant. 0.8% + €0.30,
// capped at €6.00 (+ the fixed part). Confirm exact cap in the live dashboard.
export function estSepaFeeCents(amountCents) {
  const pct = Math.round(amountCents * 0.008);
  return Math.min(pct, 600) + 30;
}

// ─── Unified auth gate ────────────────────────────────────────────────────
// LIVE: only a Firebase ID token (the real tenant/owner/admin UI).
// TEST: either the harness secret (X-Pay-Test-Secret) OR a real Firebase token
// — so the *real* logged-in UI can be exercised end-to-end against test keys
// (no real money) before going live, while the secret still drives the
// headless harness. Returns true on success; on failure it has already written
// the response and the caller should `return`.
export async function requirePayAuth(req, res, roles) {
  if (isLive()) {
    const auth = await requireRole(req, res, roles);
    return !!auth;
  }
  if (req.headers['x-pay-test-secret'] || req.headers['X-Pay-Test-Secret']) {
    return requireTestSecret(req, res);
  }
  const auth = await requireRole(req, res, roles);
  return !!auth;
}

// ─── contracts/<id>.payment — atomic nested merge ─────────────────────────
// fsPatch(contracts/<id>, {payment:{…}}) sets updateMask=`payment` and REPLACES
// the whole map, so the mandate write would clobber the Connect write (and vice
// versa). This patches only the given nested keys (updateMask=payment.<key>),
// leaving sibling fields intact — the correct way to evolve `payment` across
// the mandate, charge and payout sub-flows.
export async function mergeContractPayment(contractId, partial) {
  const keys = Object.keys(partial || {}).filter((k) => partial[k] !== undefined);
  if (!keys.length) return;
  const token = await getAdminToken();
  const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent('payment.' + k)}`).join('&');
  const fields = { payment: { mapValue: { fields: {} } } };
  for (const k of keys) fields.payment.mapValue.fields[k] = toFsValue(partial[k]);
  const res = await fetch(`${FS_BASE}/contracts/${contractId}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`mergeContractPayment failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── Shared rent charge core ──────────────────────────────────────────────
// Single source of truth for creating a rent PaymentIntent for one
// contract+period. Used by pay-rent.js (manual "Paga ora", on/off-session) and
// autopay-run.js (cron off-session). Idempotent on contract+period via the
// ledger row + the Stripe Idempotency-Key. Never throws; returns a result obj.
export async function chargeRentPeriod(stripe, mode, opts = {}) {
  const contractId = String(opts.contractId || '').trim();
  const period = String(opts.period || '').trim();
  if (!contractId || !period) return { ok: false, error: 'contractId_and_period_required' };
  const id = ledgerId(contractId, period);

  const existing = await fsGet('rentPayments/' + id).catch(() => null);
  if (existing && ['paid', 'processing'].includes(existing.status)) {
    return { ok: true, status: existing.status, idempotent: true, id, paymentIntentId: existing.stripePaymentIntent || null };
  }

  const contract = await fsGet('contracts/' + contractId).catch(() => null);
  const amountCents = Number(opts.amountCents)
    || (contract?.rent ? Math.round(contract.rent * 100) : 0)
    || (contract?.lease?.rent ? Math.round(contract.lease.rent * 100) : 0);
  if (!amountCents || amountCents < 50) return { ok: false, error: 'amount_unresolved' };

  const customerId = contract?.payment?.stripeCustomerId || opts.customerId;
  if (!customerId) return { ok: false, error: 'no_customer_setup_mandate_first' };

  const savedPm = opts.paymentMethodId || contract?.payment?.sepaPmId || null;
  const offSession = !!opts.offSession;

  const base = {
    amount: amountCents, currency: 'eur', customer: customerId,
    payment_method_types: ['sepa_debit'],
    description: `Affitto ${period} — contratto ${contractId}`,
    metadata: { service: 'RENT', contractId, period },
    setup_future_usage: 'off_session',
  };

  // Direct-to-IBAN (Connect Custom) when the landlord's payout account is active.
  const destination = contract?.payment?.landlordAccountId || null;
  const direct = !!(destination && contract?.payment?.payoutStatus === 'active');
  if (direct) {
    base.transfer_data = { destination };
    base.on_behalf_of = destination;
    const feeCents = Number(contract?.payment?.mgmtFeeCents) || 0;
    if (feeCents > 0) base.application_fee_amount = feeCents;
  }

  let intent;
  try {
    if (offSession) {
      if (!savedPm) return { ok: false, error: 'no_saved_payment_method_for_autopay' };
      intent = await stripe.paymentIntents.create(
        { ...base, payment_method: savedPm, confirm: true, off_session: true },
        { idempotencyKey: 'rent_' + id }
      );
    } else {
      intent = await stripe.paymentIntents.create(
        savedPm ? { ...base, payment_method: savedPm } : base,
        { idempotencyKey: 'rent_' + id }
      );
    }
  } catch (err) {
    if (err?.raw?.payment_intent) {
      await fsPatch('rentPayments/' + id, {
        status: 'failed', failReason: err.code || err.message,
        stripePaymentIntent: err.raw.payment_intent.id, updatedAt: new Date(),
      }).catch(() => {});
    }
    return { ok: false, error: err.message, code: err.code || null, id };
  }

  await fsPatch('rentPayments/' + id, {
    contractId, period,
    amount: amountCents,
    fee: estSepaFeeCents(amountCents),
    net: amountCents - estSepaFeeCents(amountCents),
    currency: 'eur',
    status: intent.status === 'processing' ? 'processing' : 'created',
    method: 'sepa_debit',
    payoutModel: direct ? 'direct' : 'boom',
    landlordAccountId: direct ? destination : '',
    stripePaymentIntent: intent.id,
    mode,
    createdAt: existing ? undefined : new Date(),
    updatedAt: new Date(),
  });

  return {
    ok: true, id, status: intent.status, direct,
    paymentIntentId: intent.id,
    clientSecret: offSession ? undefined : intent.client_secret,
  };
}
