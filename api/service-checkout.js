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
//
// THE CITY DESKS (BOOM_CITIES_BRIEF.md, 14/10): `{ city, kind }` sells one of
// a city page's plans — Full Search / Application Pack / Attended Viewing —
// at the price in CITY_PLANS (api/_market.js), the one copy the server
// trusts. cityOffer() refuses a waitlist desk and a search desk whose
// checkout is not open (400 checkout_closed): the page shows the price and
// opens the file, nobody is charged. The phone is optional here (Stripe
// collects one at checkout); the webhook files the lead with market = the
// city, so the Commerciale stands down and the Telegram card speaks of the
// right city — the same door as /api/city-lead, with the money in.
//
// ONE NUMBER PER PERSON (v1.4): a city order may carry `fileRef`, the id of
// the lead /api/city-lead opened for this visitor in this tab
// (city_<requestId>). Only a city offer reads it, only when it matches
// /^city_[a-z0-9_]{8,48}$/, and it travels as metadata.file_ref — nothing
// more: the webhook decides whether that lead exists in the SAME city
// before reusing its file number. Anything else is ignored in silence (a
// bad reference must never block a payment); Rome services ignore it.

import Stripe from 'stripe';
import { CATALOG } from './_catalog.js';
import { cityOffer } from './_market.js';

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

const clip = (v, n = 200) => (v == null ? '' : String(v).trim().slice(0, n));
const FILE_REF_RE = /^city_[a-z0-9_]{8,48}$/;

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

  const kind = clip(body.kind, 40);
  const cityKey = clip(body.city, 30).toLowerCase();
  let svc, offer = null;
  if (cityKey) {
    offer = cityOffer(cityKey, kind);
    if (!offer.ok) return res.status(400).json({ ok: false, error: offer.error });
    svc = { eur: offer.eur, label: offer.label, desc: offer.desc };
  } else {
    svc = CATALOG[kind];
    if (!svc) return res.status(400).json({ ok: false, error: 'unknown_service' });
  }

  // city offers only: a pattern-valid reference to the file this visitor opened
  const fileRef = offer && typeof body.fileRef === 'string' && FILE_REF_RE.test(body.fileRef) ? body.fileRef : null;

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);
  // A Rome service coordinates its slot on WhatsApp: the phone is required.
  // A city order asks for it on the page and Stripe asks again at checkout.
  if (!name || !email.includes('@') || !email.includes('.') || (!phone && !offer)) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      ...(offer && !phone ? { phone_number_collection: { enabled: true } } : {}),
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: offer ? offer.name : `BOOM ${svc.label}`, description: svc.desc },
          unit_amount: svc.eur * 100,
        },
        quantity: 1,
      }],
      metadata: {
        service: 'SERVICE',
        kind,
        ...(offer ? { city: offer.city, market: offer.city } : {}),
        ...(fileRef ? { file_ref: fileRef } : {}),
        name, email, phone,
        listing: clip(body.listing, 400),
        notes: clip(body.notes, 400),
        amount_eur: String(svc.eur),
        // Codice del consumo (artt. 50 c.3, 57 c.3, 59) — Direttiva 2011/83/UE
        // art. 7(3) per i desk città: sul Pacchetto concordato e su un ordine
        // città il cliente che chiede di iniziare durante i 14 giorni del
        // recesso lo dice con una spunta sua; senza, si comincia allo scadere
        // dei 14 giorni. Le altre pagine non hanno ancora la spunta: niente
        // campo, e il webhook non dice nulla.
        ...(body.kind === 'concordato-pack' || offer ? { start_now: body.startNow === true ? '1' : '0' } : {}),
      },
      // A city order lands back on ITS page, which shows the paid state and
      // what happens next (the board spells PAID); a Rome service keeps the
      // thank-you page — and the Pacchetto carries its «inizio subito» choice
      // there, so the page says the right time (48 hours from the data, or
      // after the 14 days).
      // No #contact on the way back (review 22/10): the page lands the payer
      // on the ticket itself, and a fragment makes the browser re-apply its
      // own scroll to #contact at `load` — which, with gtag.js holding `load`
      // in production, arrives AFTER the page's landing and undoes it.
      success_url: offer
        ? `${offer.url}?paid=${encodeURIComponent(kind)}&start=${body.startNow === true ? '1' : '0'}&session_id={CHECKOUT_SESSION_ID}`
        : 'https://www.boomrome.com/thank-you.html?service=' + encodeURIComponent(body.kind) +
          (body.kind === 'concordato-pack' ? '&start=' + (body.startNow === true ? '1' : '0') : '') +
          '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: offer ? `${offer.url}#services` : 'https://www.boomrome.com' + svc.cancel,
    });
    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    console.error('Service checkout error:', err);
    return res.status(500).json({ ok: false, error: 'stripe_failed' });
  }
}
