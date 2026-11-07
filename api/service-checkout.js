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
// trusts, in the desk's currency (cityOffer: London charges in pounds since
// 02/11/2026, every other desk in euros). cityOffer() refuses a waitlist desk and a search desk whose
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
//
// THE DESKS THAT CHARGE AT SIGNING (v1.8; Paris and Berlin from 05/11 until
// the card flip of 06/11/2026, when they moved to this checkout like the six):
// cityOffer says `chargeAt: 'signing'` and the order goes to
// api/_cityorder.js — BOOKED on our button, the email is the contract, the
// fee is invoiced only when a lease is signed. Such a desk NEVER opens a
// payment session here: the branch right after cityOffer hands the request
// over, and THE BELT in front of the Stripe call refuses a signing offer
// that ever reached it (tests/cities/signing.mjs removes the branch and
// expects a 500, never a session).

import Stripe from 'stripe';
import { CATALOG } from './_catalog.js';
import { cityOffer, moneyOf } from './_market.js';
import { createCityOrder } from './_cityorder.js';
import { fsGet } from './homie/_lib.js';
import { upgradeOffer, isUpgradeLeadId } from './_upgrade.js';
import { verifyUpgradeToken } from './payments/_token.js';

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
  let svc, offer = null, upgrade = null;
  if (cityKey) {
    offer = cityOffer(cityKey, kind);
    if (!offer.ok) return res.status(400).json({ ok: false, error: offer.error });
    // a desk that charges at signing books the order on our button: no
    // payment session, no price from here on (api/_cityorder.js)
    if (offer.chargeAt === 'signing') return createCityOrder(req, res, { offer, body, ip });
    // `eur` is the amount in the desk's currency (London: pounds) — see
    // CITY_PLANS in api/_market.js; the currency travels beside it
    svc = { eur: offer.eur, currency: offer.currency, label: offer.label, desc: offer.desc };
    // THE UPGRADE CREDIT (api/_upgrade.js): a personal link /upgrade?l=&t=
    // posts { lead, t }. The server re-reads the paid order and computes the
    // amount: nothing about the price comes from the browser. A wrong token
    // and an unknown order answer the same 404.
    if (body.upgrade != null) {
      const u = body.upgrade && typeof body.upgrade === 'object' ? body.upgrade : {};
      const lid = clip(u.lead, 60);
      const tok = clip(u.t, 60);
      if (!isUpgradeLeadId(lid) || !verifyUpgradeToken(lid, tok)) return res.status(404).json({ ok: false, error: 'upgrade_not_found' });
      let src;
      try { src = await fsGet('leads/' + lid); }
      catch (e) { console.warn('[service-checkout] upgrade read failed:', e && e.message); return res.status(503).json({ ok: false, error: 'unavailable' }); }
      const up = upgradeOffer(src, lid, Date.now());
      if (!up.ok) return res.status(up.state === 'used' || up.state === 'expired' ? 410 : 404).json({ ok: false, error: 'upgrade_' + up.state });
      if (up.city !== offer.city || up.to !== offer.plan) return res.status(400).json({ ok: false, error: 'upgrade_mismatch' });
      upgrade = { lead: lid, token: tok, ...up };
    }
  } else {
    svc = CATALOG[kind];
    if (!svc) return res.status(400).json({ ok: false, error: 'unknown_service' });
  }

  // city offers only: a pattern-valid reference to the file this visitor opened
  const fileRef = offer && typeof body.fileRef === 'string' && FILE_REF_RE.test(body.fileRef) ? body.fileRef : null;

  // an upgrade pays as the same person who bought the pack: the page asks
  // nothing, the server takes name, email and phone from the paid order
  const name  = clip(body.name, 120) || (upgrade ? clip(upgrade.name, 120) : '');
  const email = clip(body.email, 160) || (upgrade ? clip(upgrade.email, 160) : '');
  const phone = clip(body.phone, 40) || (upgrade ? clip(upgrade.phone, 40) : '');
  // the amount charged: the plan's price, or what is left after the credit
  const charge = upgrade ? upgrade.pay : svc.eur;
  const origin = offer ? new URL(offer.url).origin : 'https://www.boomrome.com';
  const upgradeQs = upgrade ? `l=${encodeURIComponent(upgrade.lead)}&t=${encodeURIComponent(upgrade.token)}` : '';
  // A Rome service coordinates its slot on WhatsApp: the phone is required.
  // A city order asks for it on the page and Stripe asks again at checkout.
  if (!name || !email.includes('@') || !email.includes('.') || (!phone && !offer)) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }

  try {
    // THE BELT: a signing desk never opens a payment session — not even if
    // the branch above were removed or bypassed (the catch answers 500)
    if (offer && offer.chargeAt === 'signing') throw Object.assign(new Error('signing desk never opens a payment session'), { code: 'signing_desk' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      ...(offer && !phone ? { phone_number_collection: { enabled: true } } : {}),
      line_items: [{
        price_data: {
          // the desk's currency (cityOffer: 'gbp' for London); a Rome
          // service and every other desk charge in euros
          currency: svc.currency || 'eur',
          product_data: {
            name: offer ? (upgrade ? `${offer.name} — ${moneyOf(upgrade.credit, upgrade.currency)} ${upgrade.fromLabel} credited` : offer.name) : `BOOM ${svc.label}`,
            description: upgrade ? `${svc.desc} Your ${upgrade.fromLabel}${upgrade.file ? ' (file ' + upgrade.file + ')' : ''} is credited: list price ${moneyOf(upgrade.list, upgrade.currency)}, you pay ${moneyOf(upgrade.pay, upgrade.currency)}.` : svc.desc,
          },
          unit_amount: Math.round(charge * 100),
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
        amount_eur: String(charge),
        // the upgrade credit: the paid order it comes from and how much it
        // counts (the webhook re-reads that order and marks the credit used)
        ...(upgrade ? { credit_from: upgrade.lead, credit_amount: String(upgrade.credit), credit_plan: upgrade.from } : {}),
        // the currency of that amount: amount_eur keeps its name for the
        // readers that already know it, and on a London order it is pounds
        currency: svc.currency || 'eur',
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
      // an upgrade lands back on /upgrade, which confirms the payment with
      // GET /api/city-lead?paid= and shows the credited amount
      success_url: upgrade
        ? `${origin}/upgrade?${upgradeQs}&start=${body.startNow === true ? '1' : '0'}&session_id={CHECKOUT_SESSION_ID}`
        : offer
        ? `${offer.url}?paid=${encodeURIComponent(kind)}&start=${body.startNow === true ? '1' : '0'}&session_id={CHECKOUT_SESSION_ID}`
        : 'https://www.boomrome.com/thank-you.html?service=' + encodeURIComponent(body.kind) +
          (body.kind === 'concordato-pack' ? '&start=' + (body.startNow === true ? '1' : '0') : '') +
          '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: upgrade ? `${origin}/upgrade?${upgradeQs}` : offer ? `${offer.url}#fares` : 'https://www.boomrome.com' + svc.cancel,
    });
    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    console.error('Service checkout error:', err);
    return res.status(500).json({ ok: false, error: err && err.code === 'signing_desk' ? 'signing_desk' : 'stripe_failed' });
  }
}
