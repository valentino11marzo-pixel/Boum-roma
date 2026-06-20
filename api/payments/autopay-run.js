// api/payments/autopay-run.js
// CRON — automatic monthly rent. For every due, unpaid period on the schedule
// whose contract has an active SEPA mandate and autopay:true:
//   1. sends the SEPA pre-notification email 1–2 days before the due date
//      (legally required; the mandate text reduces the notice to ~1 day), then
//   2. on/after the due date, fires an off-session SEPA debit via the shared
//      chargeRentPeriod core. The webhook settles the ledger + schedule.
//
// Drives off the same `payments/pay_<contractId>_<period>` schedule the rest of
// the app uses, so wallet/portal stay in sync. Idempotent: the ledger + Stripe
// Idempotency-Key make reruns no-ops; flags stop duplicate emails/debits.
//
// Auth: Vercel cron secret (Bearer) or an admin Firebase token (manual run).
// Live-locked exactly like the rest of api/payments (test keys until
// RENT_PAYMENTS_LIVE=true) — safe to schedule before going live.

import nodemailer from 'nodemailer';
import { requireRole } from '../_auth.js';
import { fsList, fsGet, fsPatch } from '../homie/_lib.js';
import { resolveStripe, chargeRentPeriod } from './_lib.js';

let _transporter;
function transporter() {
  if (_transporter === undefined) {
    _transporter = (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS)
      ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS } })
      : null;
  }
  return _transporter;
}

function preNotifyEmail(to, { amountEur, dueDate, ibanLast4 }) {
  const t = transporter();
  if (!t || !to) return Promise.resolve(false);
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0C0C0C;font-family:'Helvetica Neue',sans-serif">
  <div style="max-width:460px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.3em;color:#888;margin-bottom:18px">● BOOM ROMA</div>
    <div style="background:#111;border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden">
      <div style="height:2px;background:linear-gradient(90deg,#D4AF37,#F5D98B)"></div>
      <div style="padding:24px 22px">
        <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#555;margin-bottom:8px">Pre-notifica addebito SEPA</div>
        <div style="font-size:20px;font-weight:300;color:#F2F2F2;margin-bottom:6px">Addebito affitto in arrivo</div>
        <div style="font-size:13px;color:#888;line-height:1.6">Il <b style="color:#D4AF37">${dueDate}</b> addebiteremo <b style="color:#F2F2F2">€${amountEur}</b> sul tuo conto${ibanLast4 ? ` (IBAN ••••${ibanLast4})` : ''} tramite addebito diretto SEPA, secondo il mandato che hai autorizzato. Nessuna azione richiesta — assicurati solo che i fondi siano disponibili.</div>
      </div>
    </div>
    <div style="margin-top:16px;font-size:10px;color:#333;text-align:center">BOOM · Egidi Immobiliare S.r.l. · Roma</div>
  </div></body></html>`;
  return t.sendMail({ from: `BOOM Roma <${process.env.GMAIL_USER}>`, to, subject: `Pre-notifica: addebito affitto €${amountEur} il ${dueDate}`, html })
    .then(() => true).catch((e) => { console.warn('[autopay-run] prenotify mail:', e.message); return false; });
}

export default async function handler(req, res) {
  // Auth: cron secret or admin token.
  const cronOk = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const auth = await requireRole(req, res, ['admin']);
    if (!auth) return;
  }

  const { stripe, mode, error } = resolveStripe();
  if (error) return res.status(200).json({ ok: false, skipped: 'stripe_unconfigured', detail: error });

  const out = { mode, scanned: 0, prenotified: 0, charged: 0, skipped: 0, errors: [] };
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const contractCache = new Map();
  const getContract = async (id) => {
    if (contractCache.has(id)) return contractCache.get(id);
    const c = await fsGet('contracts/' + id).catch(() => null);
    contractCache.set(id, c);
    return c;
  };

  try {
    const pending = await fsList('payments', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 300 });
    out.scanned = pending.length;

    for (const p of pending) {
      try {
        if (!p.contractId || !p.dueDate || !p.month) { out.skipped++; continue; }
        const contract = await getContract(p.contractId);
        if (!contract || contract.payment?.status !== 'active' || !contract.autopay) { out.skipped++; continue; }

        const dueMs = new Date(p.dueDate + 'T00:00:00Z').getTime();
        const daysUntil = (dueMs - now.getTime()) / 86400000;
        const amountEur = Number(p.amount || contract.rent || 0).toLocaleString('it-IT');
        const to = contract.tenantEmail || contract.payment?.email || '';

        // 1) Pre-notification window: due in 0–2 days, not yet notified.
        if (daysUntil <= 2 && daysUntil > 0 && !p.sepaPrenotifiedAt) {
          const sent = await preNotifyEmail(to, { amountEur, dueDate: p.dueDate, ibanLast4: contract.payment?.ibanLast4 });
          await fsPatch('payments/' + p.id, { sepaPrenotifiedAt: new Date() });
          if (sent) out.prenotified++;
          continue; // debit on/after the due date, next run
        }

        // 2) Debit window: due today/overdue, and pre-notified (or 2+ days past).
        const notifiedOrGrace = !!p.sepaPrenotifiedAt || daysUntil <= -2;
        if (daysUntil <= 0 && notifiedOrGrace) {
          const r = await chargeRentPeriod(stripe, mode, { contractId: p.contractId, period: p.month, offSession: true });
          if (r.ok) out.charged++;
          else { out.skipped++; if (r.error) out.errors.push(`${p.id}: ${r.error}`); }
        } else {
          out.skipped++;
        }
      } catch (e) { out.errors.push(`${p.id}: ${e.message}`); }
    }

    return res.status(200).json({ ok: true, timestamp: now.toISOString(), ...out });
  } catch (e) {
    console.error('[autopay-run]', e);
    return res.status(500).json({ ok: false, error: e.message, ...out });
  }
}
