// api/preagreement/submit.js
// Public — the client self-fills their identity on the document page and
// accepts the pre-agreement. Persists identity + consent under admin creds,
// stamps a quotable reference, and (when something is due at signing)
// returns a Stripe Checkout URL so the lock is immediate.
//
// Method: POST
// Body: { token, tenant:{ fullName, dob?, birthPlace?, nationality?,
//         address?, cf?, idDoc?, email, phone }, accept: true }
// Response: { ok, ref, checkoutUrl|null }

import Stripe from 'stripe';
import { fsList, fsPatch, readJson, logActivity } from '../homie/_lib.js';

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const b = await readJson(req);
  const token = b && typeof b.token === 'string' ? b.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });
  if (!b.accept) return res.status(400).json({ ok: false, error: 'consent_required' });

  const t = b.tenant || {};
  const fullName = clip(t.fullName, 120);
  const email = clip(t.email, 160);
  const phone = clip(t.phone, 60);
  if (!fullName || fullName.length < 3) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email_required' });
  if (!phone || phone.length < 6) return res.status(400).json({ ok: false, error: 'phone_required' });

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, data } = hit;
    if (data.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });
    if (data.status === 'accepted') return res.status(200).json({ ok: true, ref: data.ref || null, checkoutUrl: null, already: true });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const ref = 'BOOM-' + Date.now().toString(36).toUpperCase();
    const tenant = {
      fullName, email, phone,
      dob: clip(t.dob, 20), birthPlace: clip(t.birthPlace, 120),
      nationality: clip(t.nationality, 80), address: clip(t.address, 200),
      cf: clip(t.cf, 40), idDoc: clip(t.idDoc, 80),
    };
    await fsPatch(`preAgreements/${id}`, {
      tenant, status: 'accepted', ref,
      acceptedAt: new Date().toISOString(),
      consent: { at: new Date().toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) },
    });
    logActivity('preagreement_accepted', 'preagreement', { id, ref, tenant: fullName, address: (data.property || {}).address }, 'web')
      .catch(() => {});

    // Stripe checkout for whatever is due at signing (best-effort: acceptance
    // is already recorded; a failed checkout never voids the acceptance).
    let checkoutUrl = null;
    const due = Math.round(Number((data.money || {}).dueAtSigning) || 0);
    if (due > 0 && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const eur = Math.max(50, Math.min(20000, due));
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: email,
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Pre-agreement ${ref} — ${(data.property || {}).address || 'Rome apartment'}`,
                description: 'Amount due at signing per your BOOM pre-agreement. Deposit terms per the agreement.',
              },
              unit_amount: eur * 100,
            },
            quantity: 1,
          }],
          metadata: {
            service: 'PREAGREEMENT', ref, token,
            address: clip((data.property || {}).address, 200) || '',
            name: fullName, email, phone,
          },
          success_url: 'https://www.boomrome.com/pre-agreement?t=' + token + '&paid=1',
          cancel_url: 'https://www.boomrome.com/pre-agreement?t=' + token,
        });
        checkoutUrl = session.url;
        fsPatch(`preAgreements/${id}`, { checkoutSessionId: session.id }).catch(() => {});
      } catch (e) {
        console.error('[preagreement/submit] stripe failed:', e.message);
      }
    }

    return res.status(200).json({ ok: true, ref, checkoutUrl });
  } catch (e) {
    console.error('[preagreement/submit] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'submit_failed' });
  }
}
