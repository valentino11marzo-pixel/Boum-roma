// api/create-checkout.js
// Stripe Checkout for the €350 Property Finding Service (PFS).
//
// PUBLIC endpoint — same layered hardening as /api/service-checkout:
// honeypot (`company`), length caps, per-IP rate limit. The intake is also
// captured as a `leads` doc BEFORE Stripe (status 'checkout_started') so an
// abandoned checkout still leaves a contactable lead in the pipeline; the
// webhook upgrades the same doc on completion (pfsClients is the real
// client record — the lead is the funnel trace).

import Stripe from 'stripe';
import { fsPatch } from './homie/_lib.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Missing required fields' });

    if (body.company) return res.status(200).json({ url: '/' }); // honeypot

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

    const {
      name, email, phone, move_in_date, budget, bedrooms,
      preferred_areas, must_haves, additional_info
    } = body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const clip = (v) => String(v || '').substring(0, 500);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'BOOM Property Finding Service',
            description: 'Full-service apartment search in Rome: curated shortlist, viewings, negotiation, contract.',
          },
          unit_amount: 35000,
        },
        quantity: 1,
      }],
      metadata: {
        service: 'PFS',
        name: clip(name),
        email: clip(email),
        phone: clip(phone),
        move_in_date: clip(move_in_date),
        budget: clip(budget),
        bedrooms: clip(bedrooms),
        preferred_areas: clip(preferred_areas),
        must_haves: clip(must_haves),
        additional_info: clip(additional_info),
      },
      success_url: 'https://www.boomrome.com/thank-you.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.boomrome.com/property-finding.html',
    });

    // Lead BEFORE Stripe — an abandoned €350 checkout with typed contact
    // info must stay contactable. Best-effort: never blocks the checkout.
    const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
    await fsPatch('leads/pfs_' + docId, {
      type: 'pfs',
      service: 'PFS',
      status: 'checkout_started',
      paid: false,
      source: 'web',
      intent: 'property-finding',
      name: clip(name), email: clip(email), phone: clip(phone),
      moveIn: clip(move_in_date),
      message: `Property Finding (€350) — checkout started. Budget: ${clip(budget) || '—'} · ${clip(bedrooms) || '—'} bed · Areas: ${clip(preferred_areas) || '—'}. Must-haves: ${clip(must_haves) || '—'}. ${clip(additional_info)}`,
      amount_eur: 350,
      stripe_session_id: session.id,
      createdAt: new Date().toISOString(),
    }).catch(err => console.error('[create-checkout] lead capture failed:', err.message));

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
