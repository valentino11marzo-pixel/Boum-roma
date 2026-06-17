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
import { secretEqual } from '../homie/_lib.js';

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
