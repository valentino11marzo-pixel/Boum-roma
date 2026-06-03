import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/reserve-checkout
 * Creates a Stripe Checkout session for a REFUNDABLE holding deposit that
 * reserves a specific apartment off-market while BOOM processes the application.
 * Amount is provided by the client (computed from the listing) but clamped
 * server-side to a safe range; the listing + applicant land in metadata so the
 * team can reconcile and refund/deduct manually.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { listingId, listingName, amount, name, email, phone, move_in_date } = req.body || {};
    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Safety: clamp the deposit (euros) to [100, 2000]; default 300 if absent/invalid.
    let eur = Math.round(Number(amount) || 0);
    if (!eur || eur < 100) eur = 300;
    if (eur > 2000) eur = 2000;

    const clip = (v) => String(v || '').substring(0, 500);
    const apt = clip(listingName) || 'Apartment';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Refundable holding deposit — ${apt}`,
            description: 'Reserves this Rome apartment off-market while BOOM processes your application. Fully refundable if not approved; deducted from your first month if you move in.',
          },
          unit_amount: eur * 100,
        },
        quantity: 1,
      }],
      metadata: {
        service: 'RESERVE',
        listingId: clip(listingId),
        listingName: apt,
        name: clip(name),
        email: clip(email),
        phone: clip(phone),
        move_in_date: clip(move_in_date),
        amount_eur: String(eur),
      },
      success_url: 'https://www.boomrome.com/thank-you.html?reserved=1&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.boomrome.com/apartment-detail?id=' + encodeURIComponent(clip(listingId)),
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Reserve checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
