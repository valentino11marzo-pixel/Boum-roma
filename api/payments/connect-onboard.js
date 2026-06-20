// api/payments/connect-onboard.js
// POST — provision a Stripe Connect *Custom* account for a landlord so rent can
// be paid out directly to their IBAN. The landlord never creates a Stripe
// account: BOOM creates it from the IBAN + name they give us, then returns a
// hosted onboarding link where Stripe collects the legally-required identity
// verification (KYC) + ToS acceptance. After verification, destination charges
// (see pay-rent.js) route rent straight to this account. See PAYMENTS.md §7.
//
// Body: { contractId, holderName, iban, email?, businessType?, returnUrl?, refreshUrl? }
// Auth: test mode -> X-Pay-Test-Secret; live mode -> Firebase ID token.

import { setCors } from '../_auth.js';
import { readJson, fsGet } from '../homie/_lib.js';
import { resolveStripe, requirePayAuth, mergeContractPayment } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!(await requirePayAuth(req, res, ['admin', 'landlord', 'owner']))) return;

  const { stripe, mode, error } = resolveStripe();
  if (error) return res.status(503).json({ ok: false, error });

  const body = (await readJson(req)) || {};
  const contractId = String(body.contractId || '').trim();
  const holderName = String(body.holderName || '').trim();
  const iban = String(body.iban || '').replace(/\s+/g, '');
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });
  if (!iban || iban.length < 15) return res.status(400).json({ ok: false, error: 'valid_iban_required' });

  const origin = req.headers.origin || 'https://www.boomrome.com';
  const returnUrl = body.returnUrl || `${origin}/preview-owner-payouts.html`;
  const refreshUrl = body.refreshUrl || returnUrl;

  try {
    const contract = await fsGet('contracts/' + contractId).catch(() => null);
    let accountId = contract?.payment?.landlordAccountId || null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'custom',
        country: 'IT',
        email: body.email || contract?.ownerEmail || undefined,
        business_type: body.businessType || 'individual',
        // Connected account only needs to RECEIVE transfers — the SEPA charge
        // itself happens on the BOOM platform account. Lighter KYC than a full
        // payments account.
        capabilities: { transfers: { requested: true } },
        business_profile: {
          mcc: '6513', // Real estate agents/managers — rentals
          product_description: 'Affitto immobile residenziale',
        },
        external_account: {
          object: 'bank_account',
          country: 'IT',
          currency: 'eur',
          account_holder_name: holderName || undefined,
          account_holder_type: body.businessType === 'company' ? 'company' : 'individual',
          iban,
        },
        metadata: { service: 'RENT', contractId },
      });
      accountId = account.id;
      await mergeContractPayment(contractId, {
        landlordAccountId: accountId, payoutModel: 'direct', payoutStatus: 'verification_pending',
      });
    }

    // Hosted onboarding — Stripe collects identity docs + ToS (the mandatory KYC).
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    return res.status(200).json({ ok: true, mode, accountId, onboardingUrl: link.url, expiresAt: link.expires_at });
  } catch (err) {
    console.error('[payments/connect-onboard]', err);
    return res.status(500).json({ ok: false, error: err.message, code: err.code || null });
  }
}
