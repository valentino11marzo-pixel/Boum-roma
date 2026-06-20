// api/pay/mandate-setup.js
// BOOM Pay — tenant SEPA Direct Debit mandate setup.
//
// POST { contractId } → creates (or reuses) a Stripe Customer for the tenant
// and a SetupIntent for a SEPA Direct Debit mandate, then returns the
// clientSecret + publishable key for the browser to confirm with the tenant's
// IBAN via Stripe Elements. The mandate doc is written 'pending'; the
// setup_intent.succeeded webhook flips it 'active' with the saved payment
// method + mandate id.
//
// Auth: Firebase ID token. A tenant sets up their own mandate (must own the
// contract). An admin may set one up on a tenant's behalf.

import { requireRole, setCors } from '../_auth.js';
import { fsGet, fsPatch, readJson } from '../homie/_lib.js';
import { getStripe, setPayCors } from './_pay.js';

export default async function handler(req, res) {
  setCors(req, res);
  setPayCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['tenant', 'admin', 'owner', 'landlord']);
  if (!auth) return;

  const body = (await readJson(req)) || {};
  const contractId = String(body.contractId || '').trim();
  if (!contractId) return res.status(400).json({ ok: false, error: 'missing_contractId' });

  let stripe;
  try { stripe = getStripe(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'stripe_unconfigured' }); }

  try {
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });

    // A tenant may only set up a mandate for their own contract.
    if (auth.profile.role === 'tenant' && contract.tenantId !== auth.uid) {
      return res.status(403).json({ ok: false, error: 'not_your_contract' });
    }

    const existing = (await fsGet('mandates/' + contractId)) || {};
    let customerId = existing.stripeCustomerId || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.email || contract.tenantEmail || undefined,
        name: contract.tenantName || undefined,
        metadata: { contractId, tenantId: contract.tenantId || '', platform: 'boom-pay' },
      });
      customerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['sepa_debit'],
      usage: 'off_session',
      metadata: { kind: 'mandate', contractId, tenantId: contract.tenantId || '' },
    });

    await fsPatch('mandates/' + contractId, {
      contractId,
      tenantId: contract.tenantId || '',
      propertyId: contract.propertyId || '',
      stripeCustomerId: customerId,
      setupIntentId: setupIntent.id,
      status: existing.status === 'active' ? 'active' : 'pending',
      updatedAt: new Date(),
      createdAt: existing.createdAt ? existing.createdAt : new Date(),
    });

    return res.status(200).json({
      ok: true,
      clientSecret: setupIntent.client_secret,
      customerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    });
  } catch (e) {
    console.error('[pay/mandate-setup] error:', e.message);
    return res.status(500).json({ ok: false, error: 'mandate_setup_failed', detail: e.message });
  }
}
