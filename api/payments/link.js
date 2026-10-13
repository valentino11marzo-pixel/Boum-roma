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
//   … &lang=en|it   la lingua delle pagine e di Stripe (senza: Accept-Language,
//                   poi l'italiano di sempre)
//   … &from=rata    si arriva dalla pagina /rata: il ritorno da Stripe (riuscito
//                   o annullato) torna LÌ, nella stessa lingua
//
// Il token è derivato (api/payments/_token.js): nessuna scrittura, nessuna
// scadenza, e ruotando HOMIE_SECRET si revocano tutti i link insieme.
//
// Casi non-felici gestiti come pagine vere, non come JSON: già pagato,
// link non valido, pagamenti non configurati. Chi apre un link e vede
// `{"error":"not_found"}` pensa di essere stato truffato.
//
// La carta segue la regola unica di BOOM_RENT.cardPolicy: una rata di un
// contratto preso in carico dal Palazzo senza mandato all'incasso NON apre
// una Checkout (i soldi finirebbero sul conto Stripe di BOOM invece che su
// quello del locatore): la pagina lo dice e porta al bonifico su /rata.

import Stripe from 'stripe';
import { fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { verifyPayToken, collectionFor } from './_token.js';
import { rentFee, paymentLabel, payLang, feeFor, intentData, createCheckout, cardContext, checkoutRecorded } from './pay.js';
import RENT from '../../js/rent-engine.js';
import { existingCheckout } from './_checkout.js';

const BASE = 'https://www.boomrome.com';
const MONTHS = {
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
// Cifre all'italiana o all'inglese, deterministiche: niente toLocaleString,
// che con una ICU ridotta degrada in silenzio (la lezione di /executive).
const eurOf = (lang) => (n) => {
  const [int, dec] = Number(n || 0).toFixed(2).split('.');
  const sep = lang === 'en' ? [',', '.'] : ['.', ','];
  return '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, sep[0]) + sep[1] + dec;
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeHref = (value) => {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; }
  catch (_) { return ''; }
};
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

function monthLabel(value, lang) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ''));
  return m ? MONTHS[lang][+m[2] - 1] + ' ' + m[1] : '';
}

function dateLabel(value, lang) {
  const day = String(value || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return '';
  const date = new Date(day + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return '';
  return (+m[3]) + ' ' + MONTHS[lang][+m[2] - 1] + ' ' + m[1];
}

// Le parole delle pagine, nelle due lingue. Una sola tabella: una frase
// nuova in una lingua sola si vede subito.
const T = {
  it: {
    brand: 'BOOM ROMA · PAGAMENTI', details: 'Dettagli del pagamento', period: 'Periodo', due: 'Scadenza', unknownPeriod: 'Non indicato', unknownAmount: 'Da verificare',
    invoice: 'Fattura BOOM', rentLabel: 'Canone di locazione', amountInvoice: 'Importo fattura', amountRent: 'Importo canone', amountOther: 'Importo addebito',
    feeNote: 'Eventuali commissioni di pagamento sono separate.', feeNone: 'Nessuna commissione per il pagamento con carta.',
    help: 'Per assistenza,', helpLink: 'contatta BOOM su WhatsApp', back: 'Torna alla tua rata', cont: 'Continua',
    invalidH: 'Link non valido', invalidP: 'Non riusciamo a verificare questo link. Contatta BOOM per ricevere il link corretto.',
    errH: 'Errore temporaneo', errP: 'Riprova fra un minuto.',
    notFoundH: 'Documento non trovato', notFoundP: 'Il pagamento a cui punta questo link non esiste più.',
    paidH: 'Pagamento confermato', paidP: (d, r) => `Il pagamento risulta registrato${d ? ' il ' + d : ''}. Non devi pagare di nuovo.${r ? '' : ' Puoi richiedere la ricevuta a BOOM.'}`,
    receipt: 'Vedi la ricevuta', cancelledH: 'Pagamento annullato', cancelledP: 'Questa richiesta di pagamento è stata annullata. Per chiarimenti, contatta BOOM.',
    checkH: 'Pagamento da verificare', checkP: 'Contatta BOOM per verificare questo documento prima di effettuare il pagamento.',
    reviewP: 'Su questo pagamento è in corso un rimborso o una contestazione: BOOM lo sta verificando. Non pagare di nuovo finché BOOM non ti contatta.',
    reportedH: 'Pagamento segnalato · in verifica', reportedP: 'È stato segnalato un pagamento con bonifico. BOOM deve verificare l’incasso: non pagare di nuovo.',
    reportedRata: ' Se la segnalazione è un errore, puoi annullarla dalla pagina della rata.', reportedArea: ' Se la segnalazione è un errore, puoi gestirla dalla tua area personale.',
    reportedOther: ' Se la segnalazione è un errore, scrivi a BOOM.',
    procH: 'Pagamento in elaborazione', procSdd: 'L\'addebito automatico SEPA è in corso. Non occorre pagare di nuovo. Qui potrai verificare la conferma.',
    procCard: 'Il pagamento è in corso. Non occorre pagare di nuovo. Qui potrai verificare la conferma.', refresh: 'Aggiorna lo stato',
    comingH: 'Conferma in arrivo', comingP: 'Stiamo verificando l\'esito del pagamento. Non effettuare un altro pagamento mentre attendi la conferma.',
    comingDone: 'L\'operazione su Stripe è completata. Stiamo aggiornando il portale: non occorre pagare di nuovo.',
    stoppedH: 'Pagamento interrotto', stoppedP: 'Il pagamento non risulta ancora confermato. Puoi riprendere dal punto in cui ti sei fermato.', resume: 'Riprendi il pagamento',
    closedH: 'Niente da pagare', closedP: 'Questa rata è di un periodo dopo la fine del contratto: non è dovuta. Se hai dubbi, scrivi a BOOM.',
    offH: 'Pagamento con carta non attivo', offP: 'Per questa rata si paga con bonifico, al conto indicato nella pagina della rata. Il bonifico non ha commissioni.', toBank: 'Vai al bonifico',
    unverH: 'Pagamento con carta non disponibile ora', unverP: 'Non riusciamo a verificare adesso se per questa rata si può pagare con carta. Puoi pagare con bonifico dalla pagina della rata, oppure riprovare fra qualche minuto.', retry: 'Riprova',
    unconfH: 'Pagamenti non disponibili', unconfP: 'Il pagamento con carta non è disponibile al momento. Contatta BOOM per assistenza.',
    amountH: 'Importo da verificare', amountP: 'Contatta BOOM per verificare l\'importo prima di effettuare il pagamento.',
    stripeH: 'Pagamento non disponibile', stripeP: 'Non siamo riusciti ad aprire il pagamento. Puoi riprovare più tardi o contattare BOOM.',
    lineDesc: 'BOOM Roma · pagamento tracciato, ricevuta via email.', feeLine: 'Commissione pagamento con carta',
    onBehalf: (n) => `Incassato da Egidi Immobiliare S.r.l. (BOOM) per conto di ${n}, su suo mandato. Ricevuta via email.`,
  },
  en: {
    brand: 'BOOM ROME · PAYMENTS', details: 'Payment details', period: 'Period', due: 'Due date', unknownPeriod: 'Not stated', unknownAmount: 'To be checked',
    invoice: 'BOOM invoice', rentLabel: 'Rent', amountInvoice: 'Invoice amount', amountRent: 'Rent amount', amountOther: 'Amount',
    feeNote: 'Any payment fees are shown separately.', feeNone: 'No fee for paying by card.',
    help: 'Need help?', helpLink: 'Message BOOM on WhatsApp', back: 'Back to your rent', cont: 'Continue',
    invalidH: 'Invalid link', invalidP: 'We can’t verify this link. Ask BOOM for the correct link.',
    errH: 'Temporary error', errP: 'Try again in a minute.',
    notFoundH: 'Document not found', notFoundP: 'The payment this link points to no longer exists.',
    paidH: 'Payment confirmed', paidP: (d, r) => `The payment is recorded${d ? ' on ' + d : ''}. You don’t need to pay again.${r ? '' : ' You can ask BOOM for the receipt.'}`,
    receipt: 'View the receipt', cancelledH: 'Payment cancelled', cancelledP: 'This payment request was cancelled. Message BOOM if anything is unclear.',
    checkH: 'Payment to be checked', checkP: 'Message BOOM to check this document before paying.',
    reviewP: 'A refund or a dispute is open on this payment and BOOM is checking it. Don’t pay again until BOOM contacts you.',
    reportedH: 'Payment reported · being checked', reportedP: 'A bank transfer was reported for this payment. BOOM has to check it arrived: don’t pay again.',
    reportedRata: ' If the report is a mistake, you can cancel it on the rent page.', reportedArea: ' If the report is a mistake, you can manage it from your home page.',
    reportedOther: ' If the report is a mistake, message BOOM.',
    procH: 'Payment in progress', procSdd: 'The automatic SEPA debit is in progress. No need to pay again. You can check the confirmation here.',
    procCard: 'The payment is in progress. No need to pay again. You can check the confirmation here.', refresh: 'Refresh the status',
    comingH: 'Confirmation on its way', comingP: 'We’re checking the result of the payment. Please don’t make another payment while you wait.',
    comingDone: 'The operation on Stripe is complete. We’re updating our records: no need to pay again.',
    stoppedH: 'Payment interrupted', stoppedP: 'The payment isn’t confirmed yet. You can pick up where you left off.', resume: 'Resume the payment',
    closedH: 'Nothing to pay', closedP: 'This instalment is for a period after your lease ended: it is not due. If anything is unclear, message BOOM.',
    offH: 'Card payment not available', offP: 'This instalment is paid by bank transfer, to the account shown on your rent page. A bank transfer has no fees.', toBank: 'Go to the bank transfer',
    unverH: 'Card payment unavailable right now', unverP: 'We can’t check right now whether this instalment can be paid by card. You can pay by bank transfer from your rent page, or try again in a few minutes.', retry: 'Try again',
    unconfH: 'Payments unavailable', unconfP: 'Card payment isn’t available right now. Message BOOM for help.',
    amountH: 'Amount to be checked', amountP: 'Message BOOM to check the amount before paying.',
    stripeH: 'Payment unavailable', stripeP: 'We couldn’t open the payment. You can try again later or message BOOM.',
    lineDesc: 'BOOM Rome · tracked payment, receipt by email.', feeLine: 'Card payment fee',
    onBehalf: (n) => `Collected by Egidi Immobiliare S.r.l. (BOOM) on behalf of ${n}, under the landlord’s mandate. Receipt by email.`,
  },
};

// La lingua: ?lang vince; poi il browser (un telefono non italiano legge
// inglese); senza nessuna indicazione resta l'italiano di sempre.
export function langOf(req) {
  const q = payLang((req.query || {}).lang);
  if (q) return { lang: q, detected: true };
  const al = String(((req.headers || {})['accept-language']) || '').trim().toLowerCase();
  if (al) return { lang: al.startsWith('it') ? 'it' : 'en', detected: true };
  return { lang: 'it', detected: false };
}

// Solo dati del documento già letto e autorizzato dal token. La pagina non
// cerca altri dati e non interpreta il ritorno dal checkout come incasso.
function documentContext(doc, kind, lang, policy) {
  const t = T[lang], eur = eurOf(lang);
  const invoice = kind === 'inv', rent = !invoice && RENT.isRentPayment(doc);
  const start = monthLabel(doc.month, lang), end = monthLabel(doc.coversTo, lang);
  return {
    label: invoice ? `${t.invoice}${doc.number ? ' · ' + String(doc.number).slice(0, 80) : ''}` : rent ? t.rentLabel : paymentLabel(doc, lang),
    description: String(invoice ? doc.service || '' : !rent ? doc.description || '' : '').slice(0, 250),
    period: start ? start + (end && String(doc.coversTo) > String(doc.month) ? ' – ' + end : '') : '',
    amount: RENT.amount(doc.amount), eur,
    amountLabel: invoice ? t.amountInvoice : rent ? t.amountRent : t.amountOther,
    feeNote: invoice ? '' : policy && policy.available && policy.fee === 'absorbed' ? t.feeNone : policy && !policy.available ? '' : t.feeNote,
    dueDate: dateLabel(doc.dueDate, lang),
  };
}

function page(lang, title, message, opts = {}) {
  const t = T[lang];
  const href = safeHref(opts.href), context = opts.context, back = safeHref(opts.back);
  const cta = href ? `<a class="action" href="${esc(href)}">${esc(opts.ctaLabel || t.cont)}</a>` : '';
  const backLink = back && back !== href ? `<a class="back" href="${esc(back)}">${esc(opts.backLabel || t.back)}</a>` : '';
  const details = context ? `<section class="document" aria-label="${esc(t.details)}">
    <h2>${esc(context.label)}</h2>${context.description ? `<p class="description">${esc(context.description)}</p>` : ''}
    <dl><div><dt>${esc(t.period)}</dt><dd>${esc(context.period || t.unknownPeriod)}</dd></div>
    ${context.dueDate ? `<div><dt>${esc(t.due)}</dt><dd>${esc(context.dueDate)}</dd></div>` : ''}</dl>
    <div class="amount"><span>${esc(context.amountLabel)}</span><strong>${context.amount == null ? esc(t.unknownAmount) : esc(context.eur(context.amount))}</strong></div>
    ${context.feeNote ? `<p class="fee-note">${esc(context.feeNote)}</p>` : ''}
  </section>` : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — BOOM</title>
<meta name="robots" content="noindex"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#f5f4ef;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;padding:28px 18px}
main{width:100%;max-width:480px;padding:32px;border:1px solid #29292c;border-radius:18px;background:#111113}.brand{margin:0 0 28px;font-size:11px;letter-spacing:2.5px;color:#d4b66a}
h1{margin:0;font-size:27px;line-height:1.2;font-weight:500;letter-spacing:-.5px}.message{margin:14px 0 0;color:#b9b9bd;font-size:15px;line-height:1.65}
.document{margin-top:26px;padding-top:22px;border-top:1px solid #303033}h2{margin:0;font-size:16px;font-weight:500;line-height:1.45;overflow-wrap:anywhere}.description{color:#b9b9bd;font-size:14px;line-height:1.6;overflow-wrap:anywhere;margin:6px 0 0}
dl{margin:16px 0 20px;font-size:13px}dl>div{display:flex;justify-content:space-between;gap:20px;margin-top:9px}dt{color:#aaaab0}dd{margin:0;text-align:right;line-height:1.5}
.amount{display:flex;justify-content:space-between;align-items:baseline;gap:18px;font-size:13px;color:#b9b9bd}.amount strong{font-size:26px;font-weight:400;color:#f5f4ef;font-variant-numeric:tabular-nums;white-space:nowrap}.fee-note{margin:8px 0 0;font-size:12px;line-height:1.5;color:#aaaab0}
.action{display:block;margin-top:28px;padding:14px 20px;border-radius:10px;background:#d4b66a;color:#14120c;text-decoration:none;font-size:14px;font-weight:600;text-align:center}.back{display:block;margin-top:14px;padding:13px 20px;border-radius:10px;border:1px solid #3a3a3e;color:#f5f4ef;text-decoration:none;font-size:14px;text-align:center}.help{margin:26px 0 0;padding-top:20px;border-top:1px solid #29292c;font-size:13px;line-height:1.6;color:#aaaab0}.help a{color:#dfc888;text-underline-offset:3px}a:focus-visible{outline:2px solid #f5f4ef;outline-offset:5px}
@media(max-width:380px){main{padding:24px 20px}h1{font-size:24px}.amount{flex-wrap:wrap;gap:6px}}
</style></head><body><main>
  <p class="brand">${esc(t.brand)}</p>
  <h1>${esc(title)}</h1><p class="message" role="status">${esc(message)}</p>
  ${details}${cta}${backLink}
  <p class="help">${esc(t.help)} <a href="https://wa.me/393313251961">${esc(t.helpLink)}</a>.</p>
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
  const { lang, detected } = langOf(req);
  const t = T[lang];

  if (!collection || !id || !verifyPayToken(kind, id, token)) {
    return html(res, 404, page(lang, t.invalidH, t.invalidP));
  }
  let doc;
  try { doc = await fsGet(`${collection}/${id}`); }
  catch (e) {
    console.error('[payments/link] lookup', e.message);
    return html(res, 500, page(lang, t.errH, t.errP));
  }
  if (!doc) {
    return html(res, 404, page(lang, t.notFoundH, t.notFoundP));
  }
  const fromRata = kind === 'pay' && String(req.query.from || '') === 'rata';
  // Il link resta quello stabile; lingua e provenienza viaggiano con lui, così
  // «Aggiorna lo stato» e «Riprendi» non cambiano lingua a metà strada.
  const keep = (detected && req.query.lang ? `&lang=${lang}` : '') + (fromRata ? '&from=rata' : '');
  const stableUrl = `${BASE}/api/payments/link?k=${kind}&id=${encodeURIComponent(id)}&t=${token}${keep}`;
  // La pagina della rata: stesso token (kind 'pay'), è il posto dove si paga
  // col bonifico e dove si gestisce una segnalazione.
  const rataUrl = kind === 'pay' ? `${BASE}/rata?id=${encodeURIComponent(id)}&t=${token}&lang=${lang}` : '';

  // La regola della carta per questa rata (contratto + immobile). Una fattura
  // BOOM non ha la regola del Palazzo e non ha commissione.
  let card = { contract: null, property: null, policy: { available: true, reason: '', fee: 'none', imported: false, mandateAt: '' } };
  if (kind === 'pay') card = await cardContext(doc);
  const policy = card.policy;

  const context = documentContext(doc, kind, lang, policy);
  const paymentPage = (title, message, opts = {}) => page(lang, title, message, { ...opts, context });
  // «Torna alla tua rata»: per chi arriva da /rata e per chi un'area
  // personale non ce l'ha (gli inquilini presi in carico dal Palazzo).
  const backOnly = fromRata || (kind === 'pay' && !doc.tenantId) ? rataUrl : '';
  const refreshAction = { href: stableUrl + '&return=success', ctaLabel: t.refresh, back: backOnly };
  const blocked = RENT.paymentBlockReason(doc, kind === 'inv' ? 'invoice' : 'rent');
  if (blocked === 'already_paid' || blocked === 'payment_cancelled') {
    const paid = blocked === 'already_paid';
    const paidDate = dateLabel(doc.paidDate, lang), receipt = paid ? safeHref(doc.receiptUrl) : '';
    return html(res, 200, paymentPage(paid ? t.paidH : t.cancelledH,
      paid ? t.paidP(paidDate, !!receipt) : t.cancelledP,
      { href: receipt, ctaLabel: t.receipt, back: backOnly }));
  }
  if (blocked === 'payment_review') {
    return html(res, 200, paymentPage(t.checkH, t.reviewP, { back: backOnly }));
  }
  if (blocked === 'payment_not_payable') {
    return html(res, 200, paymentPage(t.checkH, t.checkP));
  }
  if (blocked === 'payment_reported') {
    // Chi non ha un'area personale (gli inquilini presi in carico dal
    // Palazzo) gestisce la segnalazione dalla pagina della rata.
    const tail = fromRata || (kind === 'pay' && !doc.tenantId) ? t.reportedRata : doc.tenantId ? t.reportedArea : t.reportedOther;
    return html(res, 200, paymentPage(t.reportedH, t.reportedP + tail, { ...refreshAction, back: backOnly }));
  }
  if (blocked) {
    return html(res, 200, paymentPage(t.procH, blocked === 'sdd_processing' ? t.procSdd : t.procCard, refreshAction));
  }
  // Una rata dopo la chiusura vera del contratto (chiuso da «Modifica», dati
  // vecchi): non è dovuta, nessuna Checkout — si dice.
  if (kind === 'pay' && card.contract && RENT.afterClose(doc, card.contract)) {
    return html(res, 200, paymentPage(t.closedH, t.closedP, { back: backOnly }));
  }

  // Il ritorno da Stripe NON deve aprire un'altra sessione: il webhook può
  // arrivare dopo il browser. Il parametro descrive il percorso, non prova
  // un pagamento: soltanto il documento aggiornato dà la ricevuta sopra.
  if (req.query.return === 'success') {
    return html(res, 200, paymentPage(t.comingH, t.comingP, refreshAction));
  }
  if (req.query.return === 'cancel') {
    return html(res, 200, paymentPage(t.stoppedH, t.stoppedP,
      { href: stableUrl, ctaLabel: t.resume, back: backOnly }));
  }
  // Carta spenta per questa rata (contratto del Palazzo senza mandato
  // all'incasso): nessuna Checkout, la strada è il bonifico.
  if (!policy.available) {
    // Contratto illeggibile (guasto momentaneo): niente Checkout, ma nemmeno
    // «si paga con bonifico» come fosse la regola — si dice che non si sa e
    // si può riprovare (il link stabile).
    if (policy.reason === 'unverified') {
      return html(res, 503, paymentPage(t.unverH, t.unverP, { href: rataUrl, ctaLabel: t.toBank, back: stableUrl, backLabel: t.retry }));
    }
    return html(res, 200, paymentPage(t.offH, t.offP, { href: rataUrl, ctaLabel: t.toBank }));
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return html(res, 503, paymentPage(t.unconfH, t.unconfP, { back: backOnly }));
  }

  const amountValue = RENT.amount(doc.amount);
  const cents = amountValue == null ? 0 : Math.round(amountValue * 100);
  if (amountValue == null || cents < 100 || cents > 12000000) {
    return html(res, 400, paymentPage(t.amountH, t.amountP, { back: backOnly }));
  }
  const amount = cents / 100;

  // La commissione esiste SOLO sul canone ed è decisa dalla regola della carta
  // (feeFor): 'standard' = la misurata di sempre, 'absorbed' = zero (nessuna
  // riga), 'surcharge' = la misurata, solo se scelta. Su una fattura BOOM non
  // si applica: sarebbe farsi pagare due volte lo stesso servizio.
  const isInvoice = kind === 'inv';
  let feeStats = null;
  if (!isInvoice && policy.fee !== 'absorbed') {
    try { feeStats = await fsGet('settings/rentFeeStats'); } catch (_) {}
  }
  // La commissione misurata di sempre resta scritta per esteso sul ramo
  // 'standard' (i contratti normali): è la riga che la suite paymentlinks
  // rimette sbagliata per controllare che il test se ne accorga.
  const fee = isInvoice ? 0 : policy.fee === 'standard' ? rentFee(amount, feeStats) : feeFor(policy, amount, feeStats);

  const label = isInvoice
    ? `${lang === 'en' ? 'Invoice' : 'Fattura'} ${doc.number || ''}`.trim() + (doc.service ? ` — ${doc.service}` : '')
    : paymentLabel(doc, lang);

  // Su un contratto del Palazzo (carta solo col mandato) la riga dice CHI
  // incassa e per conto di chi: i soldi vanno sul conto di BOOM, non su
  // quello del locatore scritto nel contratto.
  const landlord = !isInvoice && policy.imported ? String((card.contract && card.contract.landlordName) || '').trim().slice(0, 120) : '';
  const lineItems = [{
    price_data: {
      currency: 'eur',
      product_data: {
        name: label.slice(0, 250),
        description: String(doc.description || (landlord ? t.onBehalf(landlord) : t.lineDesc)).slice(0, 250),
      },
      unit_amount: cents,
    },
    quantity: 1,
  }];
  if (fee > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: t.feeLine },
        unit_amount: Math.round(fee * 100),
      },
      quantity: 1,
    });
  }
  // La ricevuta va a chi paga: l'email della rata, poi quella del contratto
  // (le rate prese in carico dal Palazzo non la portano). Senza, Stripe la
  // chiede e il webhook la legge da customer_details.
  const prefill = [doc.recipientEmail, doc.tenantEmail, card.contract && card.contract.tenantEmail]
    .map(v => String(v || '').trim()).find(v => EMAIL_RE.test(v)) || undefined;
  const back = fromRata ? rataUrl : '';

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // Una Checkout già registrata come incasso su una rata riaperta non è un
    // pagamento in arrivo (checkoutRecorded): se ne apre una nuova.
    const prior = checkoutRecorded(doc) ? { state: 'none' } : await existingCheckout(stripe, doc, kind, id, cents + Math.round(fee * 100));
    if (prior.state === 'complete') {
      return html(res, 200, paymentPage(t.comingH, t.comingDone, refreshAction));
    }
    if (prior.state === 'open') {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.redirect(303, prior.session.url);
    }
    const session = await createCheckout(stripe, {
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: prefill,
      ...(detected ? { locale: lang } : {}),
      line_items: lineItems,
      metadata: isInvoice
        ? {
            service: 'INVOICE', invoiceId: id,
            number: String(doc.number || ''), recipientId: String(doc.recipientId || doc.clientId || ''),
            amount: String(amount), via: 'link', ...(detected ? { lang } : {}),
          }
        : {
            service: 'RENT', paymentId: id,
            contractId: String(doc.contractId || ''), tenantId: String(doc.tenantId || ''),
            month: String(doc.month || ''), amount: String(amount), fee: String(fee), via: fromRata ? 'rata' : 'link',
            feeMode: policy.fee, ...(detected ? { lang } : {}),
          },
      ...(isInvoice ? {} : { payment_intent_data: intentData(doc, id, { contract: card.contract, property: card.property, via: fromRata ? 'rata' : 'link', lang: detected ? lang : '' }) }),
      // Da /rata si torna a /rata (che sa dire pagata, in corso, annullata e
      // tiene il bonifico a portata di mano); dagli altri link, alla pagina
      // di sola lettura qui sopra.
      success_url: back ? back + '&return=success' : stableUrl + '&return=success',
      cancel_url: back ? back + '&return=cancel' : stableUrl + '&return=cancel',
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
    return html(res, 502, paymentPage(t.stripeH, t.stripeP, { back: backOnly }));
  }
}
