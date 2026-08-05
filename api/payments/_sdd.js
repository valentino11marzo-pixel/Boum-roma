// api/payments/_sdd.js — CANONE AUTOMATICO via SEPA Direct Debit.
//
// Il tassello che chiude il cerchio dei soldi: l'inquilino autorizza UNA
// volta (mandato SDD raccolto da /casa via Stripe Checkout mode=setup) e da
// lì ogni rata parte da sola — niente carta da tirare fuori, niente
// bonifico da ricordare. L'addebito viene INIZIATO in anticipo
// (SDD_LEAD_DAYS, default 7) perché SEPA regola in ~5 giorni lavorativi:
// così i soldi arrivano intorno alla scadenza, non una settimana dopo.
//
// La commissione: stessa filosofia della carta (api/payments/pay.js) — si
// MISURA, non si indovina. Il webhook salva il costo reale di ogni addebito
// in settings/sddFeeStats; qui la fee è il costo medio osservato + il
// margine BOOM. Differenza dalla carta: il costo SEPA è FISSO per
// transazione (non proporzionale), quindi la media giusta è per-addebito,
// non sul volume. E a differenza della carta il margine di default NON è
// zero: SDD_FEE_BUFFER default €1.50 — è il "piccolo margine BOOM" chiesto
// esplicitamente, dichiarato al cliente come voce di servizio (resta molto
// meno della carta: ~€2 contro ~€30 su un canone da 900).
//
//   SDD_FEE_EUR      forzatura manuale flat: se impostata vince su tutto
//   SDD_FEE_BUFFER   margine sopra il costo medio (default 1.50)
//   SDD_FEE_MAX_PCT  tetto di sicurezza in % della rata (default 1.5)
//   SDD_LEAD_DAYS    anticipo di addebito sulla scadenza (default 7)
//
// Regole di sicurezza (tutte testate in tests/sdd/run.mjs):
//   · UN addebito per rata, per costruzione: chiave di idempotenza Stripe
//     sdd_<paymentId> + guardia sddPiId sul doc — un cron doppio o un patch
//     fallito a metà non addebitano mai due volte;
//   · si addebita SOLO il canone (mai il saldo deposito: il mandato è stato
//     dato per l'affitto mensile, non per una una-tantum grossa);
//   · mai una rata scaduta PRIMA dell'attivazione del mandato: niente
//     sorprese su debiti vecchi il giorno dell'attivazione;
//   · un addebito fallito NON si ritenta da solo (SEPA fallisce quasi solo
//     per fondi insufficienti: insistere genera commissioni e attriti) — la
//     rata torna pagabile con carta/bonifico e l'operatore è avvisato.

import Stripe from 'stripe';
import { fsGet, fsList, fsPatch } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';

const eur2 = (n) => Math.round(n * 100) / 100;

const SEED_COST = 0.50;   // costo per addebito prima di avere storia (SEPA IT ≈ €0.35 flat)
const MIN_SAMPLE = 8;

export function measuredSddCost(stats) {
  const n = Number((stats || {}).count) || 0;
  const cost = Number((stats || {}).costEur) || 0;
  if (n < MIN_SAMPLE || cost <= 0) return { cost: SEED_COST, basis: 'seed', n };
  // Il costo SEPA è per-transazione: la media per addebito È il modello giusto.
  return { cost: cost / n, basis: 'measured', n };
}

export function sddFee(amount, stats) {
  const maxPct = Math.max(0.2, Math.min(5, Number(process.env.SDD_FEE_MAX_PCT || 1.5)));
  const cap = amount * maxPct / 100;
  const forced = process.env.SDD_FEE_EUR;
  if (forced != null && forced !== '') {
    return eur2(Math.min(cap, Math.max(0, Number(forced) || 0)));
  }
  const buffer = Math.max(0, Math.min(20, Number(process.env.SDD_FEE_BUFFER ?? 1.5)));
  const { cost } = measuredSddCost(stats);
  return eur2(Math.min(cap, Math.max(0, cost + buffer)));
}

/**
 * Questa rata va addebitata ADESSO? Pura, testata.
 * pay: doc payments · sdd: contract.sdd · todayISO: 'YYYY-MM-DD'
 */
export function eligibleForCharge(pay, sdd, todayISO, leadDays = Number(process.env.SDD_LEAD_DAYS || 7)) {
  if (!pay || !sdd || sdd.status !== 'active' || !sdd.customerId || !sdd.paymentMethodId) return false;
  if (pay.status !== 'pending') return false;
  if (pay.sddPiId || pay.sddInitError) return false;          // già iniziato, o guasto noto
  if (pay.type && pay.type !== 'rent') return false;          // solo canone, mai il deposito
  const due = String(pay.dueDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  const activated = String(sdd.activatedAt || '').slice(0, 10);
  if (activated && due < activated) return false;             // mai debiti pre-mandato
  const horizon = new Date(new Date(todayISO + 'T00:00:00Z').getTime() + leadDays * 86400000)
    .toISOString().slice(0, 10);
  return due <= horizon;
}

/**
 * Il giro di incasso — chiamato da reminder-cron (finestra oraria).
 * Legge i contratti col mandato attivo, trova le rate nella finestra,
 * crea i PaymentIntent off-session e marca le rate "processing": il
 * pagato/fallito lo scrive il webhook quando SEPA risponde.
 */
export async function collectSdd({ cap = 10 } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) return { skipped: 'unconfigured' };
  const todayISO = new Date().toISOString().slice(0, 10);
  const out = { contracts: 0, eligible: 0, charged: 0, failed: 0 };

  let contracts = [];
  try {
    contracts = await fsList('contracts', {
      filter: { field: 'sdd.status', op: 'EQUAL', value: 'active' }, limit: 200,
    });
  } catch (e) { return { ...out, error: 'contracts_read_failed: ' + e.message }; }
  out.contracts = contracts.length;
  if (!contracts.length) return out;

  let feeStats = null;
  try { feeStats = await fsGet('settings/sddFeeStats'); } catch (_) {}
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  for (const c of contracts) {
    if (out.charged >= cap) break;
    let pays = [];
    try {
      pays = await fsList('payments', {
        filter: { field: 'contractId', op: 'EQUAL', value: c.id }, limit: 400,
      });
    } catch (e) { continue; }

    for (const p of pays) {
      if (out.charged >= cap) break;
      if (!eligibleForCharge(p, c.sdd, todayISO)) continue;
      out.eligible++;

      const cents = Math.round((Number(p.amount) || 0) * 100);
      if (cents < 1000 || cents > 12000000) continue;         // stessa soglia di pay.js
      const amount = cents / 100;
      const fee = sddFee(amount, feeStats);
      const email = c.tenantEmail || (c.sdd && c.sdd.email) || '';
      const label = p.type === 'deposit-balance' ? 'Saldo deposito' : `Canone ${p.month || String(p.dueDate).slice(0, 7)}`;

      try {
        const pi = await stripe.paymentIntents.create({
          amount: cents + Math.round(fee * 100),
          currency: 'eur',
          customer: c.sdd.customerId,
          payment_method: c.sdd.paymentMethodId,
          payment_method_types: ['sepa_debit'],
          confirm: true,
          off_session: true,
          description: `${label} — BOOM Roma (addebito automatico)`,
          metadata: {
            service: 'RENT_SDD', paymentId: p.id,
            contractId: String(c.id), tenantId: String(p.tenantId || c.tenantId || ''),
            month: String(p.month || ''), amount: String(amount), fee: String(fee),
            email,
          },
        }, { idempotencyKey: 'sdd_' + p.id });
        await fsPatch('payments/' + p.id, {
          sddPiId: pi.id, sddInitiatedAt: new Date(), sddStatus: 'processing', sddFeeEur: fee,
        });
        out.charged++;
      } catch (e) {
        out.failed++;
        // Guasto noto → questa rata non si ritenta da sola: la fee di un
        // retry SEPA la paga BOOM, e il cliente ha carta e bonifico in /casa.
        try { await fsPatch('payments/' + p.id, { sddInitError: String(e.message || 'stripe_failed').slice(0, 300) }); } catch (_) {}
        try {
          await tgNotify(`⚠️ <b>Addebito SEPA non partito</b> — ${label} (${p.id})\n${String(e.message || '').slice(0, 200)}\nLa rata resta pagabile con carta/bonifico da /casa.`);
        } catch (_) {}
      }
    }
  }
  return out;
}
