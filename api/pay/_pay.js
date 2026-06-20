// api/pay/_pay.js
// Shared lib for BOOM Pay — the rent rail. Reuses the project's existing
// Firestore-REST-under-admin pattern (api/homie/_lib.js) so no service
// account JSON is needed, and the existing Stripe dependency (^22) so no new
// vendor is introduced.
//
// Money model (fee split — "both part"): the tenant is charged
//   rent + tenantFee
// and BOOM's application_fee skims (landlordFee + tenantFee) at the rail, so
// the landlord nets (rent - landlordFee). Each portion is tunable per
// payProfile, falling back to env, falling back to the constants below.
//
// Compliance spine: every charge uses Stripe Connect with the landlord as the
// connected account (transfer_data.destination). Stripe is the regulated PSP
// and the landlord is the merchant of record — BOOM is a platform taking an
// application fee, never an unlicensed money transmitter. Do NOT collect into
// a BOOM-owned balance and pay landlords manually.
//
// Env consumed:
//   STRIPE_SECRET_KEY        → platform secret key (Connect-enabled)
//   STRIPE_PUBLISHABLE_KEY   → exposed to the browser for SEPA Elements
//   PAY_FEE_LANDLORD_BPS     → optional, default 100 (1.0%)
//   PAY_FEE_TENANT_BPS       → optional, default 100 (1.0%)
//   PAY_RETURN_URL_BASE      → optional, default https://www.boomrome.com

import Stripe from 'stripe';

let _stripe = null;
export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY env var missing');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export const RETURN_BASE = process.env.PAY_RETURN_URL_BASE || 'https://www.boomrome.com';

// Basis points (1 bp = 0.01%). 100 bps = 1%.
const DEFAULT_LANDLORD_BPS = parseInt(process.env.PAY_FEE_LANDLORD_BPS, 10) || 100;
const DEFAULT_TENANT_BPS   = parseInt(process.env.PAY_FEE_TENANT_BPS, 10) || 100;

// Compute the split fee for a rent amount (in euros). Overrides may come from
// the landlord's payProfile (feeLandlordBps / feeTenantBps) or a per-contract
// setting. Returns everything in integer cents — the unit Stripe wants.
//
//   rentCents      what the landlord's rent is, in cents
//   tenantFee      added on top → tenant pays (rentCents + tenantFee)
//   landlordFee    skimmed from the landlord's side
//   chargeAmount   total charged to the tenant      = rentCents + tenantFee
//   applicationFee BOOM's total take at the rail     = landlordFee + tenantFee
//   landlordNet    what lands in the landlord's acct = rentCents - landlordFee
export function computeFees(rentEur, overrides = {}) {
  const rentCents = Math.round(Number(rentEur || 0) * 100);
  const landlordBps = Number.isFinite(overrides.feeLandlordBps) ? overrides.feeLandlordBps : DEFAULT_LANDLORD_BPS;
  const tenantBps   = Number.isFinite(overrides.feeTenantBps)   ? overrides.feeTenantBps   : DEFAULT_TENANT_BPS;
  const landlordFee = Math.round(rentCents * landlordBps / 10000);
  const tenantFee   = Math.round(rentCents * tenantBps   / 10000);
  return {
    rentCents,
    landlordBps,
    tenantBps,
    landlordFee,
    tenantFee,
    chargeAmount: rentCents + tenantFee,
    applicationFee: landlordFee + tenantFee,
    landlordNet: rentCents - landlordFee,
  };
}

// Cents → euros (for human-readable API responses / ledger entries).
export function eur(cents) { return (Number(cents || 0) / 100); }

// CORS for the browser-called pay endpoints. Mirrors api/_auth.js's allowlist
// but kept here so the pay endpoints are self-contained.
export function setPayCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://www.boomrome.com', 'https://boomrome.com'];
  if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
