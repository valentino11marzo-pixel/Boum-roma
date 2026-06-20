// api/payments/setup-mandate.js
// POST — start a SEPA Direct Debit mandate for a tenant/contract.
// Creates (or reuses) a Stripe Customer and returns a SetupIntent client_secret;
// the browser confirms the IBAN + mandate with Stripe.js. The mandate +
// payment method are persisted onto the contract by the webhook on
// setup_intent.succeeded.
//
// Body: { contractId, tenant?: { name, email } }
// Auth: test mode -> X-Pay-Test-Secret; live mode -> Firebase ID token (tenant/admin/landlord/owner).

import { setCors } from '../_auth.js';
import { readJson, fsGet } from '../homie/_lib.js';
import { resolveStripe, requirePayAuth, mergeContractPayment } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!(await requirePayAuth(req, res, ['tenant', 'admin', 'landlord', 'owner']))) return;

  const { stripe, mode, error } = resolveStripe();
  if (error) return res.status(503).json({ ok: false, error });

  const body = (await readJson(req)) || {};
  const contractId = String(body.contractId || '').trim();
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  try {
    // Reuse the customer if the contract already has one.
    let contract = null;
    try { contract = await fsGet('contracts/' + contractId); } catch { /* tolerate in test */ }
    let customerId = contract?.payment?.stripeCustomerId || null;

    const email = body.tenant?.email || contract?.tenantEmail || contract?.payment?.email || undefined;
    const name = body.tenant?.name || contract?.tenant || undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email, name,
        metadata: { service: 'RENT', contractId },
      });
      customerId = customer.id;
      // Persist immediately so retries reuse the same customer (nested merge —
      // never clobbers a landlord payout account already on the contract).
      await mergeContractPayment(contractId, {
        stripeCustomerId: customerId, email: email || '', status: 'mandate_pending',
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['sepa_debit'],
      usage: 'off_session', // enables future autopay debits without the tenant present
      metadata: { service: 'RENT', contractId },
    });

    return res.status(200).json({
      ok: true,
      mode,
      customerId,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (err) {
    console.error('[payments/setup-mandate]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
