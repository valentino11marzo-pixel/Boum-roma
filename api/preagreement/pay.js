// api/preagreement/pay.js
// Public — a client who accepted their pre-agreement but abandoned Stripe
// (closed the tab, card declined, thought about it overnight) can resume
// payment from the SAME document link. The accepted page shows a
// "Complete your reservation" button that calls this; the 24h reminder
// email points at the same flow.
//
// Method: POST   Body: { token }
// Response: { ok, checkoutUrl } | 400/404/409/410

import Stripe from 'stripe';
import { fsList, fsPatch, readJson } from '../homie/_lib.js';

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const b = await readJson(req);
  const token = b && typeof b.token === 'string' ? b.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, ...pa } = hit;   // fsList returns flat rows: {id, ...fields}

    if (pa.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });
    if (pa.status === 'paid') return res.status(409).json({ ok: false, error: 'already_paid' });
    if (pa.status !== 'accepted') return res.status(409).json({ ok: false, error: 'not_accepted' });

    const due = Math.round(Number((pa.money || {}).dueAtSigning) || 0);
    if (!(due > 0)) return res.status(409).json({ ok: false, error: 'nothing_due' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unavailable' });

    const t = pa.tenant || {};
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const eur = Math.max(50, Math.min(20000, due));
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: t.email || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Pre-agreement ${pa.ref || ''} — ${(pa.property || {}).address || 'Rome apartment'}`,
            description: 'Amount due at signing per your BOOM pre-agreement. Deposit terms per the agreement.',
          },
          unit_amount: eur * 100,
        },
        quantity: 1,
      }],
      metadata: {
        service: 'PREAGREEMENT', ref: pa.ref || '', token,
        address: clip((pa.property || {}).address, 200) || '',
        name: t.fullName || '', email: t.email || '', phone: t.phone || '',
      },
      success_url: 'https://www.boomrome.com/pre-agreement?t=' + token + '&paid=1',
      cancel_url: 'https://www.boomrome.com/pre-agreement?t=' + token,
    });
    fsPatch(`preAgreements/${id}`, { checkoutSessionId: session.id }).catch(() => {});
    return res.status(200).json({ ok: true, checkoutUrl: session.url });
  } catch (e) {
    console.error('[preagreement/pay] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pay_failed' });
  }
}
