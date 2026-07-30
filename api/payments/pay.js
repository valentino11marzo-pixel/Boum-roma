// api/payments/pay.js
// Canone via BOOM — the tenant pays a scheduled rent installment (or the
// deposit balance) by card from "La tua casa BOOM" (/casa). One tap →
// Stripe Checkout for the installment amount PLUS a transparent service
// fee (line item of its own, never hidden in the rent figure). The
// webhook's RENT branch marks the payment doc paid (paidVia:'stripe') and
// emails the receipt — the bank-transfer path stays untouched.
//
// Fee model (configurable):
//   RENT_FEE_PCT   — % of the installment (default 2.5)
//   RENT_FEE_MIN   — floor in EUR (default 9)
// Card processing costs ~1.5% + €0.25, so the default keeps a real margin
// at any rent level while staying honest on the checkout page.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>   (tenant or admin)
// Body:     { paymentId }
// Response: { ok, checkoutUrl, amount, fee, total }

import Stripe from 'stripe';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

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
  // Con pochi campioni non si separa quota e fisso in modo affidabile, quindi
  // si usa il rapporto costo/volume più il fisso medio osservato.
  const pct = cost / volume;
  const fixed = Number((stats || {}).fixedEur) ? Number(stats.fixedEur) / n : 0;
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
  if (pay.status === 'paid') return res.status(409).json({ ok: false, error: 'already_paid' });

  // Cents-exact: deposit balances routinely carry .50 — the charge must
  // equal the payment doc to the cent or reconciliation never closes.
  const cents = Math.round((Number(pay.amount) || 0) * 100);
  // ceiling sized for a full ANNUAL instalment (rent × 12), not one month
  if (cents < 1000 || cents > 12000000) {
    return res.status(400).json({ ok: false, error: 'bad_amount', amount: Number(pay.amount) || 0 });
  }
  const amount = cents / 100;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unconfigured' });

  // Il costo medio davvero sostenuto sugli incassi passati (settings/
  // rentFeeStats, aggiornato dal webhook). Assente = si parte dal caso
  // peggiore, mai da un tasso ottimista.
  let feeStats = null;
  try { feeStats = await fsGet('settings/rentFeeStats'); } catch (_) {}
  const fee = rentFee(amount, feeStats);
  const isDeposit = pay.type === 'deposit-balance';
  const label = isDeposit
    ? 'Saldo deposito cauzionale'
    : `Canone di locazione — ${pay.month || String(pay.dueDate || '').slice(0, 7)}`;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: auth.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: label, description: 'BOOM Roma · pagamento tracciato, ricevuta automatica via email.' },
            unit_amount: cents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Commissione servizio BOOM', description: 'Pagamento con carta, ricevuta e archivio nel tuo portale.' },
            unit_amount: Math.round(fee * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        service: 'RENT', paymentId,
        contractId: String(pay.contractId || ''), tenantId: String(pay.tenantId || ''),
        month: String(pay.month || ''), amount: String(amount), fee: String(fee),
      },
      success_url: 'https://www.boomrome.com/casa?paid=' + encodeURIComponent(paymentId),
      cancel_url: 'https://www.boomrome.com/casa',
      // Short expiry: abandoned sessions die in 30 min instead of Stripe's
      // 24h default — shrinks the stale-session double-payment window.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    fsPatch('payments/' + paymentId, { checkoutSessionId: session.id }).catch(() => {});
    logActivity('rent_checkout_opened', 'payment', { paymentId, amount, fee, by: auth.email }, auth.email || 'tenant').catch(() => {});
    return res.status(200).json({ ok: true, checkoutUrl: session.url, amount, fee, total: eur2(amount + fee) });
  } catch (e) {
    console.error('[payments/pay] stripe failed:', e.message);
    return res.status(502).json({ ok: false, error: 'stripe_failed' });
  }
}
