// api/service-checkout.js
// One-tap Stripe Checkout for the productised services (Services 2.0).
// The catalog lives HERE — the client only names the `kind`; price, product
// copy and refund language are decided server-side so the amount can never
// be tampered with from the browser.
//
// PUBLIC endpoint — same layered hardening as /api/apply-lead:
// honeypot (`company`), length caps, per-IP rate limit.
//
// Method: POST
// Body: { kind('virtual-viewing'|'deal-assistance'), name, email, phone,
//         listing(optional — URL or address the service applies to),
//         notes(optional), company(honeypot) }
// Response 200: { ok:true, url } → redirect to Stripe Checkout
// The webhook (service:'SERVICE') writes the paid lead + sends both emails.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const CATALOG = {
  'virtual-viewing': {
    eur: 89,
    label: 'Virtual Viewing — live video tour',
    desc: 'We walk the apartment for you, live on video — HD photo set + honest written report, scheduled within 48 hours. Credited to your agency fee if you rent the home with BOOM; refunded in full if we cannot reach the property.',
    cancel: '/virtual-viewing',
  },
  'deal-assistance': {
    eur: 249,
    label: 'Deal Assistance — rent safely',
    desc: 'Clause-by-clause contract review in English, landlord & property verification, and negotiation on the apartment you found. First review within 24 hours of payment.',
    cancel: '/deal-assistance',
  },
  'deposit-recovery': {
    eur: 99,
    label: 'Deposit Recovery — we get it back',
    desc: 'Formal demand under Italian law (art. 1590 c.c.), negotiation with the landlord and escalation path for your withheld deposit. €99 to start; success fee of 20% only on what we actually recover.',
    cancel: '/deposit-recovery',
  },
  'contract-check-express': {
    eur: 49,
    label: 'Contract Check Express — verdict in 24h',
    desc: 'A written traffic-light verdict on your rental contract within 24 hours: what is fine, what is unfair, what is missing. Credited in full if you upgrade to Deal Assistance.',
    cancel: '/contract-check-express',
  },
};

const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? '' : String(v).trim().slice(0, n));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  if (body.company) return res.status(200).json({ ok: true, url: '/' }); // honeypot

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const svc = CATALOG[clip(body.kind, 40)];
  if (!svc) return res.status(400).json({ ok: false, error: 'unknown_service' });

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);
  if (!name || !email.includes('@') || !email.includes('.') || !phone) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `BOOM ${svc.label}`, description: svc.desc },
          unit_amount: svc.eur * 100,
        },
        quantity: 1,
      }],
      metadata: {
        service: 'SERVICE',
        kind: clip(body.kind, 40),
        name, email, phone,
        listing: clip(body.listing, 400),
        notes: clip(body.notes, 400),
        amount_eur: String(svc.eur),
      },
      success_url: 'https://www.boomrome.com/thank-you.html?service=' + encodeURIComponent(body.kind) + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.boomrome.com' + svc.cancel,
    });
    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    console.error('Service checkout error:', err);
    return res.status(500).json({ ok: false, error: 'stripe_failed' });
  }
}
