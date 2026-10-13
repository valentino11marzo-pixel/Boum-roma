// api/payments/pay.js
// Canone via BOOM — the tenant pays a scheduled rent installment (or the
// deposit balance) by card from "La tua casa BOOM" (/casa). One tap →
// Stripe Checkout for the installment amount PLUS a transparent service
// fee (line item of its own, never hidden in the rent figure). The
// webhook's RENT branch marks the payment doc paid (paidVia:'stripe') and
// emails the receipt — the bank-transfer path stays untouched.
//
// Fee model: see rentFee() below (measured Stripe cost, RENT_FEE_* knobs)
// and feeFor(): the card rule of BOOM_RENT.cardPolicy decides whether a fee
// line exists at all — a contract taken over by the Palazzo has the card OFF
// without a collection mandate, and no fee unless 'surcharge' was chosen.
// A fee of zero adds NO line to the Checkout.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>   (tenant or admin)
// Body:     { paymentId, lang?: 'en'|'it' }
// Response: { ok, checkoutUrl, amount, fee, total } | 409 card_not_enabled
//           | 503 card_unverified (il contratto non si è potuto leggere: non
//             si sa se la carta sia permessa, quindi non si apre la Checkout)

import Stripe from 'stripe';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import RENT from '../../js/rent-engine.js';
import { existingCheckout } from './_checkout.js';

const eur2 = n => Math.round(n * 100) / 100;

// ─── La commissione: misurata, non indovinata ─────────────────────────────
// Una percentuale fissa non può andare a pari: la stessa carta costa a Stripe
// l'1,5% se europea e il 3,25% se americana, e il paese non lo sappiamo prima
// dell'addebito. Un 2,5% uguale per tutti quindi guadagna sugli europei e
// PERDE su ogni carta estera — e l'inquilino BOOM è un expat.
//
// Quindi non si indovina un tasso: si misura. Il webhook salva su ogni rata il
// costo reale (balance_transaction.fee) e aggiorna settings/rentFeeStats; qui
// la commissione è il costo medio davvero sostenuto + un margine deciso da te.
//
//   RENT_FEE_BUFFER   margine sopra il costo, in euro (default 0 → si va a pari)
//   RENT_FEE_MAX_PCT  tetto di sicurezza in % (default 4)
//   RENT_FEE_PCT      forzatura manuale: se impostata, vince su tutto
//
// Finché non c'è storia si parte dal caso peggiore (3% + €0,30): meglio
// partire prudenti e scendere man mano che i dati arrivano, che partire in
// perdita e accorgersene a fine trimestre.
// Il seed copre il CASO PEGGIORE reale (carta extra-SEE: 3,25% + €0,25), non
// una media ottimista: prima che ci siano dati non si sa quale carta arriverà,
// e partire sotto costo è esattamente il difetto che questa formula elimina.
// Sembra alto perché la carta È alta — ed è per questo che accanto, in /casa,
// c'è il bonifico a zero.
const SEED_PCT = 3.3, SEED_FIXED = 0.30, MIN_SAMPLE = 8;

export function measuredCost(stats, amount) {
  const n = Number((stats || {}).count) || 0;
  const volume = Number((stats || {}).volumeEur) || 0;
  const cost = Number((stats || {}).costEur) || 0;
  if (n < MIN_SAMPLE || volume <= 0 || cost <= 0) {
    return { cost: amount * SEED_PCT / 100 + SEED_FIXED, basis: 'seed', n };
  }
  // Regressione a una riga: parte proporzionale sul volume, parte fissa media.
  // costEur è il costo VERO di Stripe, fisso compreso (balance_transaction
  // .fee): la quota proporzionale si calcola quindi sul costo MENO il fisso,
  // e il fisso medio si aggiunge una volta sola. Prima il fisso entrava due
  // volte (nel rapporto costo/volume e di nuovo sommato), e il «buffer 0 →
  // si va a pari» chiedeva ~€0,25 in più a ogni incasso.
  const fixedTot = Math.max(0, Math.min(cost, Number((stats || {}).fixedEur) || 0));
  const pct = (cost - fixedTot) / volume;
  const fixed = fixedTot / n;
  return { cost: amount * pct + fixed, basis: 'measured', n, pct: pct * 100 };
}

export function rentFee(amount, stats) {
  const forced = process.env.RENT_FEE_PCT;
  const maxPct = Math.max(0.5, Math.min(10, Number(process.env.RENT_FEE_MAX_PCT || 4)));
  const cap = amount * maxPct / 100;
  if (forced != null && forced !== '') {
    const pct = Math.max(0, Math.min(10, Number(forced)));
    const min = Math.max(0, Math.min(100, Number(process.env.RENT_FEE_MIN || 0)));
    return eur2(Math.min(cap, Math.max(min, amount * pct / 100)));
  }
  const buffer = Math.max(0, Math.min(50, Number(process.env.RENT_FEE_BUFFER || 0)));
  const { cost } = measuredCost(stats, amount);
  return eur2(Math.min(cap, Math.max(0, cost + buffer)));
}

// Il tipo del documento guida il nome anche su Stripe: un altro addebito
// contrattuale non diventa canone solo perché usa lo stesso checkout.
// lang 'en' per chi paga da /rata in inglese (l'inquilino BOOM è un expat);
// senza lingua resta l'italiano di sempre.
export function paymentLabel(payment, lang) {
  const en = lang === 'en';
  const type = String(payment.type || '').trim().toLowerCase();
  if (type === 'deposit-balance') return en ? 'Security deposit balance' : 'Saldo deposito cauzionale';
  if (type === 'deposit') return en ? 'Security deposit' : 'Deposito cauzionale';
  if (RENT.isRentPayment(payment)) return `${en ? 'Rent' : 'Canone di locazione'} — ${payment.month || String(payment.dueDate || '').slice(0, 7)}`;
  return en ? 'Contract charge' : 'Addebito contrattuale';
}

/** La lingua di una richiesta: solo 'it' o 'en', mai altro testo dentro Stripe. */
export function payLang(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'en' || v === 'it' ? v : '';
}

// La commissione davvero applicata a QUESTA rata, secondo la regola della
// carta (BOOM_RENT.cardPolicy): 'standard' = la commissione misurata di
// sempre; 'absorbed' = zero (il costo della carta resta a BOOM, nessuna riga
// all'inquilino); 'surcharge' = la misurata, solo se scelta esplicitamente.
export function feeFor(policy, amount, stats) {
  if (!policy || !policy.available) return 0;
  if (policy.fee === 'absorbed' || policy.fee === 'none') return 0;
  return rentFee(amount, stats);
}

// Cosa lega l'addebito alla rata ANCHE dopo il checkout: Stripe non copia i
// metadata della sessione sul PaymentIntent, quindi rimborsi e contestazioni
// (charge.refunded, charge.dispute.*) arrivavano senza sapere quale rata
// fossero. Un descrittore riconoscibile sull'estratto conto riduce le
// contestazioni di chi non riconosce l'addebito («CANONE», corto: il
// prefisso dell'account più il suffisso stanno in 22 caratteri).
// La descrizione segue la lingua della Checkout (`lang`): Stripe la riporta
// nella ricevuta che arriva a chi paga, e una ricevuta in inglese con la riga
// in italiano dice che qualcuno si è dimenticato di lui.
export function intentData(payment, paymentId, { contract, property, via, lang } = {}) {
  const deposit = /^deposit/.test(String(payment.type || '').trim().toLowerCase());
  const pr = property || {}, c = contract || {};
  const building = String(pr.palazzoNome || String(pr.address || c.propertyAddress || '').split(',')[0] || pr.name || '').trim();
  const interno = String(pr.interno || c.unit || '').trim();
  const where = [building, interno ? (lang === 'en' ? 'flat ' : 'int. ') + interno : ''].filter(Boolean).join(' ');
  return {
    metadata: { service: 'RENT', paymentId: String(paymentId), contractId: String(payment.contractId || c.id || ''),
      propertyId: String(payment.propertyId || c.propertyId || ''), month: String(payment.month || ''), via: String(via || '') },
    description: (paymentLabel(payment, lang) + (where ? ' · ' + where : '')).slice(0, 250),
    statement_descriptor_suffix: deposit ? 'DEPOSITO' : 'CANONE',
  };
}

// Crea la sessione; se Stripe rifiutasse il suffisso del descrittore (prefisso
// dell'account troppo lungo), riprova UNA volta senza: un dettaglio
// dell'estratto conto non deve mai impedire di pagare.
export async function createCheckout(stripe, params) {
  try { return await stripe.checkout.sessions.create(params); }
  catch (e) {
    const pid = params && params.payment_intent_data;
    if (!pid || !pid.statement_descriptor_suffix || !/statement_descriptor/i.test(String(e && e.message))) throw e;
    const { statement_descriptor_suffix, ...rest } = pid;
    return stripe.checkout.sessions.create({ ...params, payment_intent_data: rest });
  }
}

// Legge contratto e immobile di una rata per decidere la carta. Una lettura
// fallita su una rata presa in carico non accende mai la carta: la rata
// stessa porta source 'palazzo-import' e la regola resta spenta. Una lettura
// del contratto FALLITA (non un contratto assente) su una rata senza quel
// segno — le rate rigenerate dal portale non lo portano — spegne la carta
// come 'unverified': non si sa se il contratto sia del Palazzo, e aprire la
// Checkout vorrebbe dire incassare su BOOM senza mandato. Stessa regola di
// /rata (rataView, contractError).
export async function cardContext(pay) {
  const ok = id => typeof id === 'string' && /^[\w.-]{1,200}$/.test(id);
  let contractError = false;
  const contract = ok(pay.contractId) ? await fsGet('contracts/' + pay.contractId).catch(() => { contractError = true; return null; }) : null;
  const pid = pay.propertyId || (contract && contract.propertyId);
  const property = ok(pid) ? await fsGet('properties/' + pid).catch(() => null) : null;
  if (contractError && String(pay.source || '') !== 'palazzo-import') {
    return { contract, property, contractError, policy: { available: false, reason: 'unverified', fee: 'none', imported: false, mandateAt: '' } };
  }
  return { contract, property, contractError, policy: RENT.cardPolicy(pay, contract, property) };
}

// La Checkout salvata sulla rata è QUELLA che il webhook ha già registrato
// come incasso (stripeSessionId uguale a checkoutSessionId). Se la rata è di
// nuovo da pagare l'ha riaperta un umano (incasso annullato dopo un rimborso):
// quella sessione completata non è un pagamento in arrivo, e non deve
// bloccare né la carta (link.js, pay.js) né il bonifico (rata.js) con un
// «non pagare di nuovo» falso. La si tratta come nessuna sessione.
export function checkoutRecorded(doc) {
  const d = doc || {};
  return !!d.checkoutSessionId && !!d.stripeSessionId && String(d.stripeSessionId) === String(d.checkoutSessionId);
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['tenant', 'admin']);
  if (!auth) return;

  const b = await readJson(req);
  const paymentId = b && typeof b.paymentId === 'string' ? b.paymentId.trim().slice(0, 120) : '';
  if (!paymentId) return res.status(400).json({ ok: false, error: 'payment_required' });

  let pay;
  try { pay = await fsGet('payments/' + paymentId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pay) return res.status(404).json({ ok: false, error: 'not_found' });

  // A tenant can only pay their own installments; the admin can pay any
  // (assisted checkout over the phone).
  if (auth.profile.role !== 'admin' && pay.tenantId !== auth.uid) {
    return res.status(403).json({ ok: false, error: 'not_yours' });
  }
  const blocked = RENT.paymentBlockReason(pay);
  if (blocked) return res.status(409).json({ ok: false, error: blocked });

  // Cents-exact: deposit balances routinely carry .50 — the charge must
  // equal the payment doc to the cent or reconciliation never closes.
  const amountValue = RENT.amount(pay.amount);
  const cents = amountValue == null ? 0 : Math.round(amountValue * 100);
  // ceiling sized for a full ANNUAL instalment (rent × 12), not one month
  if (amountValue == null || cents < 1000 || cents > 12000000) {
    return res.status(400).json({ ok: false, error: 'bad_amount', amount: Number(pay.amount) || 0 });
  }
  const amount = cents / 100;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unconfigured' });

  // La carta per QUESTA rata (BOOM_RENT.cardPolicy): un contratto preso in
  // carico dal Palazzo senza mandato all'incasso non apre una Checkout, nemmeno
  // per l'admin al telefono — i soldi finirebbero sul conto di BOOM.
  const lang = payLang(b.lang);
  const ctx = await cardContext(pay);
  if (!ctx.policy.available) {
    // Contratto illeggibile: un guasto momentaneo, non una regola — si riprova.
    if (ctx.policy.reason === 'unverified') return res.status(503).json({ ok: false, error: 'card_unverified', reason: 'unverified' });
    return res.status(409).json({ ok: false, error: 'card_not_enabled', reason: ctx.policy.reason });
  }

  // Il costo medio davvero sostenuto sugli incassi passati (settings/
  // rentFeeStats, aggiornato dal webhook). Assente = si parte dal caso
  // peggiore, mai da un tasso ottimista.
  let feeStats = null;
  try { feeStats = await fsGet('settings/rentFeeStats'); } catch (_) {}
  const fee = feeFor(ctx.policy, amount, feeStats);
  const label = paymentLabel(pay, lang);

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const prior = checkoutRecorded(pay) ? { state: 'none' } : await existingCheckout(stripe, pay, 'pay', paymentId, cents + Math.round(fee * 100));
    if (prior.state === 'complete') return res.status(409).json({ ok: false, error: 'payment_processing' });
    if (prior.state === 'open') {
      return res.status(200).json({ ok: true, checkoutUrl: prior.session.url, amount, fee, total: eur2(amount + fee) });
    }
    const lineItems = [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: label.slice(0, 250),
          description: String(pay.description || (lang === 'en' ? 'BOOM Rome · tracked payment, receipt by email.' : 'BOOM Roma · pagamento tracciato, ricevuta via email.')).slice(0, 250),
        },
        unit_amount: cents,
      },
      quantity: 1,
    }];
    // La riga della commissione esiste solo se c'è una commissione: una riga
    // da €0 su Stripe dice all'inquilino che qualcosa gli è stato addebitato.
    if (fee > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: lang === 'en' ? 'Card payment fee' : 'Commissione pagamento con carta' },
          unit_amount: Math.round(fee * 100),
        },
        quantity: 1,
      });
    }
    const session = await createCheckout(stripe, {
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: auth.email || undefined,
      ...(lang ? { locale: lang } : {}),
      line_items: lineItems,
      metadata: {
        service: 'RENT', paymentId,
        contractId: String(pay.contractId || ''), tenantId: String(pay.tenantId || ''),
        month: String(pay.month || ''), amount: String(amount), fee: String(fee),
        feeMode: ctx.policy.fee, ...(lang ? { lang } : {}),
      },
      payment_intent_data: intentData(pay, paymentId, { contract: ctx.contract, property: ctx.property, via: 'casa', lang }),
      success_url: 'https://www.boomrome.com/casa?paid=' + encodeURIComponent(paymentId),
      cancel_url: 'https://www.boomrome.com/casa',
      // Short expiry: abandoned sessions die in 30 min instead of Stripe's
      // 24h default — shrinks the stale-session double-payment window.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    await fsPatch('payments/' + paymentId, { checkoutSessionId: session.id });
    logActivity('rent_checkout_opened', 'payment', { paymentId, amount, fee, by: auth.email }, auth.email || 'tenant').catch(() => {});
    return res.status(200).json({ ok: true, checkoutUrl: session.url, amount, fee, total: eur2(amount + fee) });
  } catch (e) {
    console.error('[payments/pay] stripe failed:', e.message);
    return res.status(502).json({ ok: false, error: 'stripe_failed' });
  }
}
