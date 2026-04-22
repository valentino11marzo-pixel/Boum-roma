import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      name, email, phone, move_in_date, budget, bedrooms,
      preferred_areas, must_haves, additional_info
    } = req.body;

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

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
