// api/payments/pay.js
// Canone via BOOM — the tenant pays a scheduled rent installment (or the
// deposit balance) by card from "La tua casa BOOM" (/casa). One tap →
// Stripe Checkout for the installment amount PLUS a transparent service
// fee (line item of its own, never hidden in the rent figure). The
// webhook's RENT branch marks the payment doc paid (paidVia:'stripe') and
// emails the receipt — the bank-transfer path stays untouched.
//
// Fee model (configurable):
//   RENT_FEE_PCT   — % of the installment (default 2.5)
//   RENT_FEE_MIN   — floor in EUR (default 9)
// Card processing costs ~1.5% + €0.25, so the default keeps a real margin
// at any rent level while staying honest on the checkout page.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>   (tenant or admin)
// Body:     { paymentId }
// Response: { ok, checkoutUrl, amount, fee, total }

import Stripe from 'stripe';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const eur2 = n => Math.round(n * 100) / 100;

export function rentFee(amount) {
  const pct = Math.max(0, Math.min(10, Number(process.env.RENT_FEE_PCT || 2.5)));
  const min = Math.max(0, Math.min(100, Number(process.env.RENT_FEE_MIN || 9)));
  return eur2(Math.max(min, amount * pct / 100));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['tenant', 'admin']);
  if (!auth) return;

  const b = await readJson(req);
  const paymentId = b && typeof b.paymentId === 'string' ? b.paymentId.trim().slice(0, 120) : '';
  if (!paymentId) return res.status(400).json({ ok: false, error: 'payment_required' });

  let pay;
  try { pay = await fsGet('payments/' + paymentId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pay) return res.status(404).json({ ok: false, error: 'not_found' });

  // A tenant can only pay their own installments; the admin can pay any
  // (assisted checkout over the phone).
  if (auth.profile.role !== 'admin' && pay.tenantId !== auth.uid) {
    return res.status(403).json({ ok: false, error: 'not_yours' });
  }
  if (pay.status === 'paid') return res.status(409).json({ ok: false, error: 'already_paid' });

  // Cents-exact: deposit balances routinely carry .50 — the charge must
  // equal the payment doc to the cent or reconciliation never closes.
  const cents = Math.round((Number(pay.amount) || 0) * 100);
  if (cents < 1000 || cents > 2000000) return res.status(400).json({ ok: false, error: 'bad_amount' });
  const amount = cents / 100;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unconfigured' });

  const fee = rentFee(amount);
  const isDeposit = pay.type === 'deposit-balance';
  const label = isDeposit
    ? 'Saldo deposito cauzionale'
    : `Canone di locazione — ${pay.month || String(pay.dueDate || '').slice(0, 7)}`;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: auth.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: label, description: 'BOOM Roma · pagamento tracciato, ricevuta automatica via email.' },
            unit_amount: cents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Commissione servizio BOOM', description: 'Pagamento con carta, ricevuta e archivio nel tuo portale.' },
            unit_amount: Math.round(fee * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        service: 'RENT', paymentId,
        contractId: String(pay.contractId || ''), tenantId: String(pay.tenantId || ''),
        month: String(pay.month || ''), amount: String(amount), fee: String(fee),
      },
      success_url: 'https://www.boomrome.com/casa?paid=' + encodeURIComponent(paymentId),
      cancel_url: 'https://www.boomrome.com/casa',
      // Short expiry: abandoned sessions die in 30 min instead of Stripe's
      // 24h default — shrinks the stale-session double-payment window.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    fsPatch('payments/' + paymentId, { checkoutSessionId: session.id }).catch(() => {});
    logActivity('rent_checkout_opened', 'payment', { paymentId, amount, fee, by: auth.email }, auth.email || 'tenant').catch(() => {});
    return res.status(200).json({ ok: true, checkoutUrl: session.url, amount, fee, total: eur2(amount + fee) });
  } catch (e) {
    console.error('[payments/pay] stripe failed:', e.message);
    return res.status(502).json({ ok: false, error: 'stripe_failed' });
  }
}
