// api/rent/checkout.js
// Creates the Stripe Checkout session for one monthly rent payment.
// Two auth paths:
//   1. { token }      — the per-payment payToken from a reminder email /
//                       the /pay page (anonymous, mirrors deposit-checkout)
//   2. { paymentId }  + Authorization: Bearer <Firebase ID token> — the
//                       logged-in portal (tenant paying own rent, or admin).
// Completion is confirmed exclusively by the signed Stripe webhook
// (service: RENT) — never by the browser redirect.
//
// Response: { ok, url } | { ok:false, error }

import Stripe from 'stripe';
import { setCors, rateOk } from '../magic-sign/_shared.js';
import { readJson, fsGet, fsPatch } from '../homie/_lib.js';
import { bearerFrom, verifyIdToken } from '../_auth.js';
import { findPaymentByToken, paymentContext, newPayToken, monthLabel, BASE } from './_lib.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 15)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); } catch { body = null; }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  try {
    // ── Resolve the payment through one of the two credentials ──
    let payment = null;
    if (typeof body.token === 'string' && body.token.trim()) {
      payment = await findPaymentByToken(body.token.trim());
      if (!payment) return res.status(404).json({ ok: false, error: 'invalid_token' });
    } else if (typeof body.paymentId === 'string' && body.paymentId.trim()) {
      const idToken = bearerFrom(req);
      if (!idToken) return res.status(401).json({ ok: false, error: 'missing_auth' });
      const user = await verifyIdToken(idToken);
      if (!user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
      const p = await fsGet('payments/' + body.paymentId.trim().replace(/[^\w-]/g, ''));
      if (!p) return res.status(404).json({ ok: false, error: 'not_found' });
      const profile = await fsGet('users/' + user.localId).catch(() => null);
      const isAdmin = profile && profile.role === 'admin';
      if (!isAdmin && p.tenantId !== user.localId) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      payment = p;
    } else {
      return res.status(400).json({ ok: false, error: 'missing_credential' });
    }

    if (payment.status === 'paid') return res.status(409).json({ ok: false, error: 'already_paid' });
    const amountEur = Number(payment.amount || 0);
    if (!(amountEur > 0)) return res.status(409).json({ ok: false, error: 'no_amount' });

    // Double-charge guard: if a session already exists for this instalment,
    // reconcile against Stripe before minting another. A settled session
    // whose webhook is still in flight self-heals the doc here; an open
    // session for the same amount is reused instead of duplicated.
    if (payment.checkoutSessionId) {
      try {
        const prev = await stripe.checkout.sessions.retrieve(payment.checkoutSessionId);
        if (prev && prev.payment_status === 'paid') {
          const now = new Date().toISOString();
          await fsPatch('payments/' + payment.id, {
            status: 'paid',
            paidDate: now,
            paidAt: now,
            paidVia: 'stripe',
            stripeSessionId: prev.id,
            stripePaymentIntent: typeof prev.payment_intent === 'string' ? prev.payment_intent : '',
          });
          return res.status(409).json({ ok: false, error: 'already_paid' });
        }
        if (prev && prev.status === 'open' && prev.url
            && prev.amount_total === Math.round(amountEur * 100)) {
          return res.status(200).json({ ok: true, url: prev.url });
        }
      } catch (_) { /* stale/expired session — fall through and create anew */ }
    }

    // Ensure the payment carries a payToken: the success/cancel URLs land on
    // /pay, which needs it to render state (also lets the portal path hand
    // the tenant a durable link).
    let payToken = payment.payToken;
    if (!payToken) {
      payToken = newPayToken();
      await fsPatch('payments/' + payment.id, { payToken });
    }

    const ctx = await paymentContext(payment);

    // No payment_method_types: Stripe shows every method enabled on the
    // account (cards, Apple/Google Pay, Link) — one dashboard switch away.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: ctx.tenantEmail || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Affitto ${monthLabel(payment.month, 'it')} — ${String(ctx.propLabel).slice(0, 80)}`,
            description: `Monthly rent · ${monthLabel(payment.month)} · BOOM Rome`,
          },
          unit_amount: Math.round(amountEur * 100),
        },
        quantity: 1,
      }],
      metadata: {
        service: 'RENT',
        paymentId: payment.id,
        contractId: payment.contractId || '',
        month: payment.month || '',
      },
      success_url: `${BASE}/pay?t=${encodeURIComponent(payToken)}&paid=1`,
      cancel_url: `${BASE}/pay?t=${encodeURIComponent(payToken)}`,
    });

    // Remember the session so the guard above can reconcile/reuse it.
    try {
      await fsPatch('payments/' + payment.id, {
        checkoutSessionId: session.id,
        checkoutCreatedAt: new Date().toISOString(),
      });
    } catch (e) { console.warn('[rent/checkout] session record:', e.message); }

    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[rent/checkout]', e.message);
    return res.status(502).json({ ok: false, error: 'checkout_failed' });
  }
}
