// api/sign/deposit-checkout.js
// Deposit-at-signature: creates the Stripe Checkout session for a contract's
// security deposit. The credential is the single-use depositPayToken that
// /api/magic-sign/submit issues to the TENANT at the moment they sign (their
// sign token is nulled by then). Completion is confirmed by the signed
// Stripe webhook (service: DEPOSIT), never by the browser.
//
// Request:  POST { payToken }
// Response: { ok, url }  |  { ok:false, error: invalid_token|already_paid|no_deposit }

import Stripe from 'stripe';
import { fsList, fsGet } from '../homie/_lib.js';
import { setCors, rateOk } from '../magic-sign/_shared.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const BASE = 'https://www.boomrome.com';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 15)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const payToken = body && typeof body.payToken === 'string' ? body.payToken.trim() : '';
  if (!payToken || payToken.length < 16 || payToken.length > 100) {
    return res.status(400).json({ ok: false, error: 'invalid_token' });
  }

  try {
    const rows = await fsList('contracts', {
      filter: { field: 'depositPayToken', op: 'EQUAL', value: payToken },
      limit: 1,
    });
    const contract = rows && rows[0];
    if (!contract) return res.status(404).json({ ok: false, error: 'invalid_token' });
    if (contract.depositPaid) return res.status(409).json({ ok: false, error: 'already_paid' });

    const amountEur = Number(contract.deposit || 0);
    if (!(amountEur > 0)) return res.status(409).json({ ok: false, error: 'no_deposit' });

    let label = 'your BOOM Rome lease';
    try {
      const p = contract.propertyId ? await fsGet('properties/' + contract.propertyId) : null;
      if (p && (p.name || p.address)) label = p.name || p.address;
    } catch (_) {}
    let email = contract.tenantEmail || '';
    try {
      if (!email && contract.tenantId) {
        const t = await fsGet('users/' + contract.tenantId);
        email = (t && t.email) || '';
      }
    } catch (_) {}

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Deposito cauzionale — ${String(label).slice(0, 80)}`,
            description: 'Security deposit for your BOOM Rome lease. Held and returned per contract terms (Art. 11 L.392/78).',
          },
          unit_amount: Math.round(amountEur * 100),
        },
        quantity: 1,
      }],
      metadata: { service: 'DEPOSIT', contractId: contract.id },
      success_url: `${BASE}/sign?deposit=success`,
      cancel_url: `${BASE}/sign?deposit=retry&pt=${encodeURIComponent(payToken)}`,
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[deposit-checkout]', e.message);
    return res.status(502).json({ ok: false, error: 'checkout_failed' });
  }
}
