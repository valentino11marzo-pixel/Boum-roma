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
import { paidOnRecord } from './_state.js';
import { paymentTermsFor, checkoutParams } from './_checkout.js';

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
    // Stessa regola di submit: conta il FATTO. Un documento incassato ma con
    // lo status rimasto indietro (webhook in ritardo, o degradato da un
    // secondo invio) non deve mai riaprire un pagamento già ricevuto — sono
    // soldi presi due volte e un rimborso da fare.
    if (paidOnRecord(pa)) return res.status(409).json({ ok: false, error: 'already_paid' });
    if (pa.status !== 'accepted') return res.status(409).json({ ok: false, error: 'not_accepted' });

    let paymentTerms;
    try { paymentTerms = paymentTermsFor(pa); }
    catch { return res.status(409).json({ ok: false, error: 'invalid_payment_terms' }); }
    const due = paymentTerms.totalCents;
    if (!(due > 0)) return res.status(409).json({ ok: false, error: 'nothing_due' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unavailable' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create(checkoutParams({ ...pa, token }, paymentTerms));
    await fsPatch(`preAgreements/${id}`, { checkoutSessionId: session.id }).catch(() => {});
    return res.status(200).json({ ok: true, checkoutUrl: session.url, paymentDueEur: due / 100 });
  } catch (e) {
    console.error('[preagreement/pay] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pay_failed' });
  }
}
