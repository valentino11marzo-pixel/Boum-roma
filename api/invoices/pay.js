// api/invoices/pay.js
// Il pulsante "Paga con carta" della fattura: crea la sessione Stripe.
//
// Pubblico come /api/invoices/lookup — il token derivato basta. L'importo NON
// arriva dal client: si legge dal documento su Firestore. Un importo passato
// dal browser sarebbe un invito a pagare €1 una fattura da €1.900.

import Stripe from 'stripe';
import { fsGet, fsPatch } from '../homie/_lib.js';
import { setCors } from '../_auth.js';
import { parsePayRef, isPayable, amountCents, SITE } from './_link.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(501).json({ error: 'stripe_unconfigured' });

  const ref = (req.body && req.body.t) || '';
  const id = parsePayRef(ref);
  if (!id) return res.status(404).json({ error: 'not_found' });

  let inv = null;
  try { inv = await fsGet(`invoices/${id}`); } catch (_) {}
  if (!inv || inv.kind === 'receipt') return res.status(404).json({ error: 'not_found' });

  // Ricontrollo lato server: la pagina può essere vecchia di ore e la
  // fattura nel frattempo incassata per bonifico.
  if (!isPayable(inv)) {
    return res.status(409).json({
      error: inv.status === 'paid' ? 'already_paid' : 'not_payable',
      status: inv.status || null,
    });
  }

  const cents = amountCents(inv);
  if (cents < 50) return res.status(400).json({ error: 'amount_too_small' });

  const b = inv.buyer || {};
  const email = b.email || inv.recipientEmail || undefined;
  const label = `${inv.docType === 'TD06' ? 'Parcella' : 'Fattura'} n. ${inv.number}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: (inv.currency || 'EUR').toLowerCase(),
          unit_amount: cents,
          product_data: {
            name: label,
            description: (inv.lines || []).map((l) => l.description).filter(Boolean).join(' · ').slice(0, 300)
              || 'Servizi BOOM',
          },
        },
      }],
      // La causale di riferimento sull'estratto conto del cliente: senza,
      // sul suo estratto compare solo "BOOM" e non sa cosa ha pagato.
      payment_intent_data: { description: label },
      metadata: {
        service: 'INVOICE',
        invoiceId: id,
        invoiceNumber: String(inv.number || ''),
        amount: String(cents / 100),
      },
      success_url: `${SITE}/fattura?t=${encodeURIComponent(ref)}&paid=1`,
      cancel_url: `${SITE}/fattura?t=${encodeURIComponent(ref)}`,
    });

    // Traccia del tentativo: se il cliente abbandona, /api/payments/recover-checkouts
    // vede una sessione scaduta e l'operatore sa che ci ha provato.
    try {
      await fsPatch(`invoices/${id}`, {
        lastCheckoutId: session.id,
        lastCheckoutAt: new Date().toISOString(),
      });
    } catch (_) {}

    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[invoices/pay]', e.message);
    return res.status(500).json({ error: 'stripe_error', detail: e.message });
  }
}
