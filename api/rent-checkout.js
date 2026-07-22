// api/rent-checkout.js
// One-tap rent payment for tenants. The portal's "💳 Paga" button used to
// post to a Firebase Cloud Function (createCheckoutSession) that does not
// exist in this project — a tenant trying to pay rent hit a dead end. This
// is the real rail: the amount comes from the payments doc SERVER-SIDE
// (never from the browser), completion is confirmed only by the signed
// Stripe webhook (service: RENT).
//
// Request:  POST { paymentId }   Authorization: Bearer <firebase-id-token>
// Response: { ok, url } | { ok:false, error }

import Stripe from 'stripe';
import { fsGet } from './homie/_lib.js';
import { requireRole, setCors } from './_auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const BASE = 'https://www.boomrome.com';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unavailable' });

  const auth = await requireRole(req, res, ['tenant', 'admin']);
  if (!auth) return;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const paymentId = body && typeof body.paymentId === 'string' ? body.paymentId.trim().slice(0, 120) : '';
  if (!paymentId) return res.status(400).json({ ok: false, error: 'paymentId_required' });

  try {
    const payment = await fsGet('payments/' + paymentId);
    if (!payment) return res.status(404).json({ ok: false, error: 'not_found' });
    if (payment.status === 'paid') return res.status(409).json({ ok: false, error: 'already_paid' });
    // A tenant can only pay THEIR OWN schedule; admins can pay any (support).
    if (auth.profile.role !== 'admin' && payment.tenantId !== auth.uid) {
      return res.status(403).json({ ok: false, error: 'not_your_payment' });
    }

    const amountEur = Number(payment.amount || 0);
    if (!(amountEur > 0)) return res.status(409).json({ ok: false, error: 'no_amount' });

    let label = 'your BOOM Rome lease';
    try {
      const p = payment.propertyId ? await fsGet('properties/' + payment.propertyId) : null;
      if (p && (p.name || p.address)) label = p.name || p.address;
    } catch (_) {}

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: auth.email || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Affitto ${payment.month || ''} — ${String(label).slice(0, 80)}`.trim(),
            description: 'Monthly rent for your BOOM Rome lease. Receipt available in your tenant portal.',
          },
          unit_amount: Math.round(amountEur * 100),
        },
        quantity: 1,
      }],
      metadata: {
        service: 'RENT',
        paymentId,
        contractId: payment.contractId || '',
        month: payment.month || '',
      },
      // portal-app.js checkStripeReturn() reads ?payment=success|cancelled
      success_url: `${BASE}/portal?payment=success`,
      cancel_url: `${BASE}/portal?payment=cancelled`,
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[rent-checkout]', e.message);
    return res.status(502).json({ ok: false, error: 'checkout_failed' });
  }
}
