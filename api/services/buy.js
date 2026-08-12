// api/services/buy.js
// ONE-TAP BUY from an email. The journey emails (and any BOOM message) can
// link straight here: this creates the Stripe Checkout session server-side
// and 302-redirects the client into it — no form, no login, no app.
//
// The price and the copy come from the SAME server-side catalog the Services
// 2.0 pages use (api/service-checkout.js CATALOG), so an email can never
// quote a price the server doesn't honour. The webhook's SERVICE branch does
// the rest (paid lead + confirmation emails) exactly as for the web flow.
//
// Method: GET  /api/services/buy?kind=movein-pack&e=<email>&n=<name>&ref=<contractId>
// → 302 to Stripe Checkout · 400 unknown kind · 429 rate limited · 503 unset

import Stripe from 'stripe';
import { CATALOG, EMAIL_BUYABLE } from '../_catalog.js';
import { verifySell } from './_sell.js';

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 12;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  // evict the oldest entries instead of wiping every counter at once —
  // clearing the whole map would hand a free reset to anyone cycling IPs
  if (HITS.size > 5000) for (const k of [...HITS.keys()].slice(0, 1000)) HITS.delete(k);
  return arr.length > MAX_PER_WINDOW;
}
const clip = (v, n = 160) => (v == null ? '' : String(v).trim().slice(0, n));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// A branded dead end — never a raw JSON error in the face of a client who
// just tapped "buy" in an email.
function oops(res, code, msg) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(code).send(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BOOM</title>
<body style="margin:0;background:#050506;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:300;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">
<div><div style="letter-spacing:8px;font-size:13px;color:#D4AF37">BOOM</div>
<p style="margin:18px 0 6px;font-size:19px;font-weight:200">${msg}</p>
<p style="font-size:13px;color:rgba(255,255,255,.5)">Write to us and we'll sort it in a minute.</p>
<a href="https://wa.me/393313251961" style="display:inline-block;margin-top:18px;border:1px solid rgba(37,211,102,.4);color:#25D366;border-radius:100px;padding:12px 22px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none">WhatsApp BOOM</a></div>`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const q = req.query || {};
  const kind = clip(q.kind, 40);
  // Only the journey products can be bought from a BARE link: the others are
  // sold from their page, which collects the context they need. A link the
  // OPERATOR minted (`sig`, see _sell.js) carries that context in the
  // conversation itself, so it unlocks the whole catalog — that signature is
  // the only difference, and it can only come from someone holding the secret.
  const signed = verifySell(kind, clip(q.sig, 64));
  const item = (signed || EMAIL_BUYABLE.includes(kind)) ? CATALOG[kind] : null;
  if (!item) return oops(res, 400, 'This service is not available from this link.');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return oops(res, 429, 'One moment — too many requests in a row.');
  if (!process.env.STRIPE_SECRET_KEY) return oops(res, 503, 'Payments are unavailable right now.');

  // an address that doesn't validate is DROPPED, never carried into the
  // metadata: the webhook prefers what the buyer types on the Stripe page,
  // and a malformed one there would shadow it
  const emailRaw = clip(q.e, 160);
  const email = EMAIL_RE.test(emailRaw) ? emailRaw : '';
  const name = clip(q.n, 120);
  const ref = clip(q.ref, 80);

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `BOOM ${item.label}`, description: item.desc.slice(0, 500) },
          unit_amount: item.eur * 100,
        },
        quantity: 1,
      }],
      // same metadata contract as the web checkout → same webhook branch
      metadata: { service: 'SERVICE', kind, name, email, phone: '', source: signed ? 'operator' : 'email', ref },
      // A journey link is tapped by a tenant who already lives in /casa; an
      // operator link is tapped by someone who may not be a client at all, so
      // it lands on the branded thank-you that closes the GA4 funnel.
      success_url: signed
        ? 'https://www.boomrome.com/thank-you?service=' + encodeURIComponent(kind) + '&session_id={CHECKOUT_SESSION_ID}'
        : 'https://www.boomrome.com/casa?bought=' + encodeURIComponent(kind),
      cancel_url: 'https://www.boomrome.com' + (item.cancel || '/concierge'),
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.writeHead(302, { Location: session.url });
    return res.end();
  } catch (e) {
    console.error('[services/buy] stripe failed:', e.message);
    return oops(res, 502, 'We could not open the payment page.');
  }
}
