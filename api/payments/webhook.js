// api/payments/webhook.js
// Dedicated Stripe webhook for RENT events — kept separate from the live
// api/stripe-webhook.js (PFS / reservations) so rent work can never disturb
// the working money path. Point a second Stripe webhook endpoint at this URL
// with its own signing secret (STRIPE_RENT_WEBHOOK_SECRET).
//
// Handles: setup_intent.succeeded · payment_intent.processing ·
// payment_intent.succeeded · payment_intent.payment_failed · charge.refunded
// — only for events whose metadata.service === 'RENT'. All writes are
// idempotent (fsPatch create-or-update on rentPayments/<contract_period>).

import { fsPatch, fsGet, logActivity } from '../homie/_lib.js';
import { resolveStripe, ledgerId, mergeContractPayment } from './_lib.js';

// Bridge a settled rent period onto the wallet/portal schedule doc the rest of
// the app already reads (`payments/pay_<contractId>_<period>`, created by
// api/magic-sign/submit.js). Marking it paid lets reminder-cron flip the tenant
// Apple Wallet pass to "Pagato ✓" and the portal payment views to settled.
// Only patches a schedule row that already exists — never creates a stray one.
async function bridgeSchedule(contractId, period, patch) {
  if (!contractId || !period) return;
  const docId = 'pay_' + contractId + '_' + period;
  try {
    const existing = await fsGet('payments/' + docId);
    if (existing) await fsPatch('payments/' + docId, patch);
  } catch (e) { console.warn('[payments/webhook] schedule bridge:', e.message); }
}

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const RENT_EVENTS = new Set([
  'setup_intent.succeeded',
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { stripe, error } = resolveStripe();
  if (error) { console.error('[payments/webhook] stripe unresolved:', error); return res.status(503).send(error); }

  const secret = process.env.STRIPE_RENT_WEBHOOK_SECRET;
  if (!secret) return res.status(500).send('STRIPE_RENT_WEBHOOK_SECRET unset');

  const sig = req.headers['stripe-signature'];
  const raw = await getRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error('[payments/webhook] signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (!RENT_EVENTS.has(event.type)) {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const obj = event.data.object;
  const meta = obj.metadata || {};
  if (meta.service !== 'RENT') {
    return res.status(200).json({ received: true, skipped: 'not_rent' });
  }

  try {
    // ── Mandate set up: persist the SEPA method + mandate onto the contract ──
    if (event.type === 'setup_intent.succeeded') {
      const contractId = meta.contractId;
      let last4 = null;
      try {
        if (obj.payment_method) {
          const pm = await stripe.paymentMethods.retrieve(obj.payment_method);
          last4 = pm?.sepa_debit?.last4 || null;
        }
      } catch { /* non-fatal */ }
      await mergeContractPayment(contractId, {
        stripeCustomerId: obj.customer || '',
        sepaPmId: obj.payment_method || '',
        mandateId: obj.mandate || '',
        ibanLast4: last4 || '',
        status: 'active',
      });
      await logActivity('rent_mandate_active', 'payments', { contractId, last4 }, 'stripe');
      return res.status(200).json({ received: true, handled: 'mandate_active' });
    }

    // ── Payment lifecycle: advance the ledger row for contract+period ──
    const contractId = meta.contractId;
    const period = meta.period;
    const id = ledgerId(contractId, period);
    const piId = obj.payment_intent || obj.id; // charge events carry payment_intent

    let patch = { contractId, period, stripePaymentIntent: piId, updatedAt: new Date() };

    if (event.type === 'payment_intent.processing') {
      patch.status = 'processing';
    } else if (event.type === 'payment_intent.succeeded') {
      patch.status = 'paid';
      patch.settledAt = new Date();
      patch.amount = obj.amount_received || obj.amount || undefined;
      // Mark this period paid on the contract too (drives portal status).
      await fsPatch('contracts/' + contractId, { lastPaidPeriod: period, lastPaidAt: new Date() }).catch(() => {});
      // Bridge → the wallet/portal schedule doc flips to paid ("Pagato ✓").
      const nowIso = new Date().toISOString();
      await bridgeSchedule(contractId, period, {
        status: 'paid', paidAt: nowIso, paidDate: nowIso.split('T')[0],
        paidVia: 'sepa', passPaidPushed: false,
      });
    } else if (event.type === 'payment_intent.payment_failed') {
      patch.status = 'failed';
      patch.failReason = obj.last_payment_error?.message || obj.last_payment_error?.code || 'failed';
    } else if (event.type === 'charge.refunded') {
      patch.status = 'refunded';
      patch.refundedAt = new Date();
    }

    await fsPatch('rentPayments/' + id, patch);
    await logActivity('rent_payment_' + patch.status, 'payments', { contractId, period, piId }, 'stripe');
    return res.status(200).json({ received: true, handled: patch.status });
  } catch (err) {
    console.error('[payments/webhook] handler error:', err);
    // 500 so Stripe retries — handlers are idempotent, retry is safe.
    return res.status(500).json({ received: false, error: err.message });
  }
}
