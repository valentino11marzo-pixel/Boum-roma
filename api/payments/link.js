// api/payments/link.js — GET pubblico: il link di pagamento che non scade.
//
// L'operatore, dal portale, copia un link e lo manda su WhatsApp. Chi lo
// apre — inquilino o proprietario, senza login, anche settimane dopo —
// finisce dentro una Stripe Checkout aperta per l'importo esatto di
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
import { rentFee, paymentLabel } from './pay.js';
import RENT from '../../js/rent-engine.js';
import { existingCheckout } from './_checkout.js';

// The page speaks the document's language: English for an invoice that says
// so (`lang:'en'` — the fees of the desks abroad, v1.8, whose payers are
// expats), Italian for everything else, byte for byte as before. An English
// amount and date are written from fixed tables (never toLocaleString, which
// degrades in silence with a small ICU).
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const en2 = (n) => { const [i, d] = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d; };
const eur = (n, lang) => lang === 'en'
  ? '€' + en2(n)
  : '€' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeHref = (value) => {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; }
  catch (_) { return ''; }
};

function monthLabel(value, lang) {
  const month = String(value || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return '';
  if (lang === 'en') return `${MONTHS_EN[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  return new Date(month + '-15T12:00:00Z').toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function dateLabel(value, lang) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(day + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return '';
  if (lang === 'en') return `${Number(day.slice(8, 10))} ${MONTHS_EN[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Every string the page prints, in the two languages. Italian is the text the
// page always had; English is for an invoice with lang 'en'.
const T = {
  it: {
    html: 'it', brand: 'BOOM ROMA · PAGAMENTI', site: 'BOOM Roma', details: 'Dettagli del pagamento',
    period: 'Periodo', notStated: 'Non indicato', due: 'Scadenza', toCheck: 'Da verificare', cont: 'Continua',
    help: 'Per assistenza, <a href="https://wa.me/393313251961">contatta BOOM su WhatsApp</a>.',
    invoiceLabel: (n) => `Fattura BOOM${n ? ' · ' + String(n).slice(0, 80) : ''}`, invoiceAmount: 'Importo fattura',
    invalid: ['Link non valido', 'Non riusciamo a verificare questo link. Contatta BOOM per ricevere il link corretto.'],
    temp: ['Errore temporaneo', 'Riprova fra un minuto.'],
    notFound: ['Documento non trovato', 'Il pagamento a cui punta questo link non esiste più.'],
    refresh: 'Aggiorna lo stato',
    paidT: 'Pagamento confermato', cancelledT: 'Pagamento annullato', receipt: 'Vedi la ricevuta',
    paidM: (date, receipt) => `Il pagamento risulta registrato${date ? ' il ' + date : ''}. Non devi pagare di nuovo.${receipt ? '' : ' Puoi richiedere la ricevuta a BOOM.'}`,
    cancelledM: 'Questa richiesta di pagamento è stata annullata. Per chiarimenti, contatta BOOM.',
    notPayable: ['Pagamento da verificare', 'Contatta BOOM per verificare questo documento prima di effettuare il pagamento.'],
    reported: ['Pagamento segnalato · in verifica', 'Hai segnalato un pagamento. BOOM deve verificare l’incasso: non pagare di nuovo. Se la segnalazione è un errore, puoi gestirla dalla tua area personale.'],
    processingT: 'Pagamento in elaborazione',
    sddM: 'L\'addebito automatico SEPA è in corso. Non occorre pagare di nuovo. Qui potrai verificare la conferma.',
    processingM: 'Il pagamento è in corso. Non occorre pagare di nuovo. Qui potrai verificare la conferma.',
    back: ['Conferma in arrivo', 'Stiamo verificando l\'esito del pagamento. Non effettuare un altro pagamento mentre attendi la conferma.'],
    stopped: ['Pagamento interrotto', 'Il pagamento non risulta ancora confermato. Puoi riprendere dal punto in cui ti sei fermato.'], resume: 'Riprendi il pagamento',
    off: ['Pagamenti non disponibili', 'Il pagamento con carta non è disponibile al momento. Contatta BOOM per assistenza.'],
    badAmount: ['Importo da verificare', 'Contatta BOOM per verificare l\'importo prima di effettuare il pagamento.'],
    complete: ['Conferma in arrivo', 'L\'operazione su Stripe è completata. Stiamo aggiornando il portale: non occorre pagare di nuovo.'],
    failed: ['Pagamento non disponibile', 'Non siamo riusciti ad aprire il pagamento. Puoi riprovare più tardi o contattare BOOM.'],
    stripeName: (doc) => `Fattura ${doc.number || ''}`.trim() + (doc.service ? ` — ${doc.service}` : ''),
    stripeDesc: 'BOOM Roma · pagamento tracciato, ricevuta automatica via email.',
  },
  en: {
    html: 'en', brand: 'BOOM · PAYMENTS', site: 'BOOM', details: 'Payment details',
    period: 'Period', notStated: 'Not stated', due: 'Due', toCheck: 'To be checked', cont: 'Continue',
    help: 'For help, <a href="https://wa.me/393313251961">write to BOOM on WhatsApp</a>.',
    invoiceLabel: (n) => `BOOM invoice${n ? ' · ' + String(n).slice(0, 80) : ''}`, invoiceAmount: 'Invoice amount',
    invalid: ['Invalid link', 'We can’t verify this link. Ask BOOM for the right one.'],
    temp: ['Temporary error', 'Please try again in a minute.'],
    notFound: ['Document not found', 'The payment this link points to no longer exists.'],
    refresh: 'Refresh the status',
    paidT: 'Payment confirmed', cancelledT: 'Payment cancelled', receipt: 'See the receipt',
    paidM: (date, receipt) => `The payment is recorded${date ? ' on ' + date : ''}. You don’t need to pay again.${receipt ? '' : ' You can ask BOOM for the receipt.'}`,
    cancelledM: 'This payment request was cancelled. For any question, contact BOOM.',
    notPayable: ['Payment to be checked', 'Please contact BOOM to check this document before you pay.'],
    reported: ['Payment reported · being checked', 'You reported a payment. BOOM has to check it: please do not pay again.'],
    processingT: 'Payment in progress',
    sddM: 'The SEPA direct debit is in progress. No need to pay again. You can check the confirmation here.',
    processingM: 'The payment is in progress. No need to pay again. You can check the confirmation here.',
    back: ['Confirmation on its way', 'We are checking the outcome of the payment. Please don’t make another payment while you wait.'],
    stopped: ['Payment interrupted', 'The payment is not confirmed yet. You can pick up where you left off.'], resume: 'Resume the payment',
    off: ['Payments unavailable', 'Card payment is not available right now. Contact BOOM for help.'],
    badAmount: ['Amount to be checked', 'Please contact BOOM to check the amount before you pay.'],
    complete: ['Confirmation on its way', 'The payment on Stripe is complete. We are updating our records: no need to pay again.'],
    failed: ['Payment unavailable', 'We couldn’t open the payment. You can try again later or contact BOOM.'],
    stripeName: (doc) => `BOOM invoice · ${doc.number || ''}`.trim().replace(/ ·$/, ''),
    stripeDesc: 'BOOM · tracked payment, receipt by email.',
  },
};
const langOf = (doc) => (doc && doc.lang === 'en' ? 'en' : 'it');

// Solo dati del documento già letto e autorizzato dal token. La pagina non
// cerca altri dati e non interpreta il ritorno dal checkout come incasso.
function documentContext(doc, kind) {
  const invoice = kind === 'inv', rent = !invoice && RENT.isRentPayment(doc);
  const lang = invoice ? langOf(doc) : 'it', t = T[lang];
  const start = monthLabel(doc.month, lang), end = monthLabel(doc.coversTo, lang);
  return {
    lang,
    label: invoice ? t.invoiceLabel(doc.number) : rent ? 'Canone di locazione' : paymentLabel(doc),
    description: String(invoice ? doc.service || '' : !rent ? doc.description || '' : '').slice(0, 250),
    period: start ? start + (end && String(doc.coversTo) > String(doc.month) ? ' – ' + end : '') : '',
    amount: RENT.amount(doc.amount),
    amountLabel: invoice ? t.invoiceAmount : rent ? 'Importo canone' : 'Importo addebito',
    feeNote: invoice ? '' : 'Eventuali commissioni di pagamento sono separate.',
    dueDate: dateLabel(doc.dueDate, lang),
  };
}

function page(title, message, opts = {}) {
  const href = safeHref(opts.href), context = opts.context;
  const lang = opts.lang === 'en' || (context && context.lang === 'en') ? 'en' : 'it', t = T[lang];
  const cta = href ? `<a class="action" href="${esc(href)}">${esc(opts.ctaLabel || t.cont)}</a>` : '';
  const details = context ? `<section class="document" aria-label="${esc(t.details)}">
    <h2>${esc(context.label)}</h2>${context.description ? `<p class="description">${esc(context.description)}</p>` : ''}
    <dl><div><dt>${esc(t.period)}</dt><dd>${esc(context.period || t.notStated)}</dd></div>
    ${context.dueDate ? `<div><dt>${esc(t.due)}</dt><dd>${esc(context.dueDate)}</dd></div>` : ''}</dl>
    <div class="amount"><span>${esc(context.amountLabel)}</span><strong>${context.amount == null ? esc(t.toCheck) : esc(eur(context.amount, lang))}</strong></div>
    ${context.feeNote ? `<p class="fee-note">${esc(context.feeNote)}</p>` : ''}
  </section>` : '';
  return `<!doctype html><html lang="${t.html}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — ${esc(t.site)}</title>
<meta name="robots" content="noindex"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#f5f4ef;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;padding:28px 18px}
main{width:100%;max-width:480px;padding:32px;border:1px solid #29292c;border-radius:18px;background:#111113}.brand{margin:0 0 28px;font-size:11px;letter-spacing:2.5px;color:#d4b66a}
h1{margin:0;font-size:27px;line-height:1.2;font-weight:500;letter-spacing:-.5px}.message{margin:14px 0 0;color:#b9b9bd;font-size:15px;line-height:1.65}
.document{margin-top:26px;padding-top:22px;border-top:1px solid #303033}h2{margin:0;font-size:16px;font-weight:500;line-height:1.45;overflow-wrap:anywhere}.description{color:#b9b9bd;font-size:14px;line-height:1.6;overflow-wrap:anywhere;margin:6px 0 0}
dl{margin:16px 0 20px;font-size:13px}dl>div{display:flex;justify-content:space-between;gap:20px;margin-top:9px}dt{color:#aaaab0}dd{margin:0;text-align:right;line-height:1.5}
.amount{display:flex;justify-content:space-between;align-items:baseline;gap:18px;font-size:13px;color:#b9b9bd}.amount strong{font-size:26px;font-weight:400;color:#f5f4ef;font-variant-numeric:tabular-nums;white-space:nowrap}.fee-note{margin:8px 0 0;font-size:12px;line-height:1.5;color:#aaaab0}
.action{display:block;margin-top:28px;padding:14px 20px;border-radius:10px;background:#d4b66a;color:#14120c;text-decoration:none;font-size:14px;font-weight:600;text-align:center}.help{margin:26px 0 0;padding-top:20px;border-top:1px solid #29292c;font-size:13px;line-height:1.6;color:#aaaab0}.help a{color:#dfc888;text-underline-offset:3px}a:focus-visible{outline:2px solid #f5f4ef;outline-offset:5px}
@media(max-width:380px){main{padding:24px 20px}h1{font-size:24px}.amount{flex-wrap:wrap;gap:6px}}
</style></head><body><main>
  <p class="brand">${esc(t.brand)}</p>
  <h1>${esc(title)}</h1><p class="message" role="status">${esc(message)}</p>
  ${details}${cta}
  <p class="help">${t.help}</p>
</main></body></html>`;
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
  // Before the document is read its language is not known: an invoice of a
  // desk abroad (cityfee_…) is English by construction (api/payments/_citysign.js).
  const pre = kind === 'inv' && /^cityfee_/.test(id) ? 'en' : 'it';

  if (!collection || !id || !verifyPayToken(kind, id, token)) {
    return html(res, 404, page(T[pre].invalid[0], T[pre].invalid[1], { icon: '🔒', lang: pre }));
  }
  let doc;
  try { doc = await fsGet(`${collection}/${id}`); }
  catch (e) {
    console.error('[payments/link] lookup', e.message);
    return html(res, 500, page(T[pre].temp[0], T[pre].temp[1], { icon: '⏳', lang: pre }));
  }
  if (!doc) {
    return html(res, 404, page(T[pre].notFound[0], T[pre].notFound[1], { icon: '🔍', lang: pre }));
  }
  const stableUrl = `https://www.boomrome.com/api/payments/link?k=${kind}&id=${encodeURIComponent(id)}&t=${token}`;
  const context = documentContext(doc, kind);
  const t = T[context.lang];
  const paymentPage = (title, message, opts = {}) => page(title, message, { ...opts, context });
  const refreshAction = { href: stableUrl + '&return=success', ctaLabel: t.refresh };
  const blocked = RENT.paymentBlockReason(doc, kind === 'inv' ? 'invoice' : 'rent');
  if (blocked === 'already_paid' || blocked === 'payment_cancelled') {
    const paid = blocked === 'already_paid';
    const paidDate = dateLabel(doc.paidDate, context.lang), receipt = paid ? safeHref(doc.receiptUrl) : '';
    return html(res, 200, paymentPage(paid ? t.paidT : t.cancelledT,
      paid ? t.paidM(paidDate, receipt) : t.cancelledM,
      { href: receipt, ctaLabel: t.receipt }));
  }
  if (blocked === 'payment_not_payable') {
    return html(res, 200, paymentPage(t.notPayable[0], t.notPayable[1]));
  }
  if (blocked === 'payment_reported') {
    return html(res, 200, paymentPage(t.reported[0], t.reported[1], refreshAction));
  }
  if (blocked) {
    return html(res, 200, paymentPage(t.processingT,
      blocked === 'sdd_processing' ? t.sddM : t.processingM, refreshAction));
  }

  // Il ritorno da Stripe NON deve aprire un'altra sessione: il webhook può
  // arrivare dopo il browser. Il parametro descrive il percorso, non prova
  // un pagamento: soltanto il documento aggiornato dà la ricevuta sopra.
  if (req.query.return === 'success') {
    return html(res, 200, paymentPage(t.back[0], t.back[1], refreshAction));
  }
  if (req.query.return === 'cancel') {
    return html(res, 200, paymentPage(t.stopped[0], t.stopped[1],
      { href: stableUrl, ctaLabel: t.resume }));
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return html(res, 503, paymentPage(t.off[0], t.off[1]));
  }

  const amountValue = RENT.amount(doc.amount);
  const cents = amountValue == null ? 0 : Math.round(amountValue * 100);
  if (amountValue == null || cents < 100 || cents > 12000000) {
    return html(res, 400, paymentPage(t.badAmount[0], t.badAmount[1]));
  }
  const amount = cents / 100;

  // La commissione di servizio esiste SOLO sul canone (è il costo della
  // carta, dichiarato come voce a sé). Su una fattura BOOM non si applica:
  // sarebbe farsi pagare due volte lo stesso servizio.
  const isInvoice = kind === 'inv';
  let feeStats = null;
  if (!isInvoice) {
    try { feeStats = await fsGet('settings/rentFeeStats'); } catch (_) {}
  }
  const fee = isInvoice ? 0 : rentFee(amount, feeStats);

  const label = isInvoice ? t.stripeName(doc) : paymentLabel(doc);

  const lineItems = [{
    price_data: {
      currency: 'eur',
      product_data: {
        name: label.slice(0, 250),
        description: String(doc.description || t.stripeDesc).slice(0, 250),
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
    const prior = await existingCheckout(stripe, doc, kind, id, cents + Math.round(fee * 100));
    if (prior.state === 'complete') {
      return html(res, 200, paymentPage(t.complete[0], t.complete[1], refreshAction));
    }
    if (prior.state === 'open') {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.redirect(303, prior.session.url);
    }
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
      success_url: stableUrl + '&return=success',
      cancel_url: stableUrl + '&return=cancel',
      // La sessione può scadere: il LINK no. Finché è aperta si riusa;
      // dopo la scadenza una nuova apertura genera il checkout successivo.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await fsPatch(`${collection}/${id}`, { checkoutSessionId: session.id, linkOpenedAt: new Date().toISOString() });
    logActivity('payment_link_opened', 'payment', { kind, id, amount, fee }, 'link').catch(() => {});

    res.setHeader('Cache-Control', 'private, no-store');
    return res.redirect(303, session.url);
  } catch (e) {
    console.error('[payments/link] stripe failed:', e.message);
    return html(res, 502, paymentPage(t.failed[0], t.failed[1]));
  }
}
