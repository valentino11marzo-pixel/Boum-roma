// api/payments/link.js — GET pubblico: il link di pagamento che non scade.
//
// L'operatore, dal portale, copia un link e lo manda su WhatsApp. Chi lo
// apre — inquilino o proprietario, senza login, anche settimane dopo —
// finisce dentro una Stripe Checkout appena creata per l'importo esatto di
// quel documento. Al pagamento, il webhook segna il documento pagato: la
// gestione e la fatturazione restano allineate da sole.
//
//   /api/payments/link?k=pay&id=<paymentId>&t=<token>   rata / saldo deposito
//   /api/payments/link?k=inv&id=<invoiceId>&t=<token>   fattura BOOM
//
// Il token è derivato (api/payments/_token.js): nessuna scrittura, nessuna
// scadenza, e ruotando HOMIE_SECRET si revocano tutti i link insieme.
//
// Casi non-felici gestiti come pagine vere, non come JSON: già pagato,
// link non valido, pagamenti non configurati. Chi apre un link e vede
// `{"error":"not_found"}` pensa di essere stato truffato.

import Stripe from 'stripe';
import { fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { verifyPayToken, collectionFor } from './_token.js';
import { rentFee } from './pay.js';

const eur = (n) => '€' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function page(title, message, opts = {}) {
  const cta = opts.href
    ? `<a href="${opts.href}" style="display:inline-block;margin-top:26px;padding:14px 28px;background:#D4AF37;color:#0a0a0a;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600">${opts.ctaLabel || 'Continua'}</a>`
    : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — BOOM Roma</title>
<meta name="robots" content="noindex"></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08080A;color:#fff;
 font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Inter,sans-serif;padding:24px">
<div style="max-width:420px;text-align:center">
  <div style="font-size:11px;letter-spacing:4px;color:#D4AF37;margin-bottom:20px">BOOM ROMA</div>
  <div style="font-size:40px;margin-bottom:14px">${opts.icon || '💳'}</div>
  <div style="font-size:19px;font-weight:500;margin-bottom:10px">${title}</div>
  <div style="font-size:14px;line-height:1.6;color:#9a9a9a">${message}</div>
  ${cta}
  <div style="margin-top:30px;font-size:12px;color:#5a5a5a">
    Serve aiuto? <a href="https://wa.me/393313251961" style="color:#D4AF37">Scrivici su WhatsApp</a>
  </div>
</div></body></html>`;
}

const html = (res, code, body) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(code).send(body);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const kind = String(req.query.k || 'pay');
  const id = String(req.query.id || '').trim().slice(0, 200);
  const token = String(req.query.t || '');
  const collection = collectionFor(kind);

  if (!collection || !id || !verifyPayToken(kind, id, token)) {
    return html(res, 404, page('Link non valido',
      'Questo link di pagamento non è più valido o è stato digitato male. Chiedine uno nuovo e lo rifacciamo in un secondo.',
      { icon: '🔒' }));
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return html(res, 503, page('Pagamenti non disponibili',
      'Il pagamento con carta è momentaneamente non attivo. Scrivici e ti diamo subito un\'alternativa.', { icon: '🛠' }));
  }

  let doc;
  try { doc = await fsGet(`${collection}/${id}`); }
  catch (e) {
    console.error('[payments/link] lookup', e.message);
    return html(res, 500, page('Errore temporaneo', 'Riprova fra un minuto.', { icon: '⏳' }));
  }
  if (!doc) {
    return html(res, 404, page('Documento non trovato',
      'Il pagamento a cui punta questo link non esiste più.', { icon: '🔍' }));
  }
  if (doc.status === 'paid' || doc.status === 'cancelled') {
    const paid = doc.status === 'paid';
    return html(res, 200, page(paid ? 'Risulta già pagato' : 'Pagamento annullato',
      paid
        ? `Questo importo${doc.paidDate ? ' risulta pagato il <b>' + doc.paidDate + '</b>' : ' risulta già saldato'}. Non serve fare altro.`
        : 'Questo pagamento è stato annullato. Se pensi sia un errore, scrivici.',
      { icon: paid ? '✅' : '—', href: doc.receiptUrl || null, ctaLabel: 'Vedi la ricevuta' }));
  }

  const cents = Math.round((Number(doc.amount) || 0) * 100);
  if (cents < 100 || cents > 12000000) {
    return html(res, 400, page('Importo non valido',
      'C\'è qualcosa che non torna nell\'importo. Segnalacelo e lo sistemiamo subito.', { icon: '⚠️' }));
  }
  const amount = cents / 100;

  // La commissione di servizio esiste SOLO sul canone (è il costo della
  // carta, dichiarato come voce a sé). Su una fattura BOOM non si applica:
  // sarebbe farsi pagare due volte lo stesso servizio.
  const isInvoice = kind === 'inv';
  const fee = isInvoice ? 0 : rentFee(amount);

  const label = isInvoice
    ? `Fattura ${doc.number || ''}`.trim() + (doc.service ? ` — ${doc.service}` : '')
    : doc.type === 'deposit-balance'
      ? 'Saldo deposito cauzionale'
      : `Canone di locazione — ${doc.month || String(doc.dueDate || '').slice(0, 7)}`;

  const lineItems = [{
    price_data: {
      currency: 'eur',
      product_data: {
        name: label.slice(0, 250),
        description: (doc.description || 'BOOM Roma · pagamento tracciato, ricevuta automatica via email.').slice(0, 250),
      },
      unit_amount: cents,
    },
    quantity: 1,
  }];
  if (fee > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: 'Commissione servizio BOOM', description: 'Pagamento con carta, ricevuta e archivio nel tuo portale.' },
        unit_amount: Math.round(fee * 100),
      },
      quantity: 1,
    });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: doc.recipientEmail || doc.tenantEmail || undefined,
      line_items: lineItems,
      metadata: isInvoice
        ? {
            service: 'INVOICE', invoiceId: id,
            number: String(doc.number || ''), recipientId: String(doc.recipientId || doc.clientId || ''),
            amount: String(amount), via: 'link',
          }
        : {
            service: 'RENT', paymentId: id,
            contractId: String(doc.contractId || ''), tenantId: String(doc.tenantId || ''),
            month: String(doc.month || ''), amount: String(amount), fee: String(fee), via: 'link',
          },
      success_url: `https://www.boomrome.com/api/payments/link?k=${kind}&id=${encodeURIComponent(id)}&t=${token}`,
      cancel_url: `https://www.boomrome.com/api/payments/link?k=${kind}&id=${encodeURIComponent(id)}&t=${token}`,
      // La sessione può scadere: il LINK no. Alla riapertura se ne crea
      // un'altra, quindi 30 minuti bastano e restringono la finestra in cui
      // due sessioni vive potrebbero produrre un doppio incasso.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    fsPatch(`${collection}/${id}`, { checkoutSessionId: session.id, linkOpenedAt: new Date().toISOString() }).catch(() => {});
    logActivity('payment_link_opened', 'payment', { kind, id, amount, fee }, 'link').catch(() => {});

    res.setHeader('Cache-Control', 'private, no-store');
    return res.redirect(303, session.url);
  } catch (e) {
    console.error('[payments/link] stripe failed:', e.message);
    return html(res, 502, page('Pagamento non disponibile',
      'Non siamo riusciti ad aprire la pagina di pagamento. Riprova tra poco o scrivici.', { icon: '⏳' }));
  }
}
