// api/pay/collect.js
// BOOM Pay — collect one month's rent for a single `payments` doc (manual
// admin trigger). The actual charge logic lives in ./_collect.js so the
// reminder-cron autonomous path runs the exact same code.
//
// POST { paymentId }
// Auth: admin Firebase ID token, OR the Vercel cron secret (Bearer).

import { requireRole, bearerFrom, setCors } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { setPayCors } from './_pay.js';
import { collectPayment } from './_collect.js';

export default async function handler(req, res) {
  setCors(req, res);
  setPayCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const cronOk = process.env.CRON_SECRET && bearerFrom(req) === process.env.CRON_SECRET;
  if (!cronOk) {
    const auth = await requireRole(req, res, ['admin']);
    if (!auth) return;
  }

  const body = (await readJson(req)) || {};
  const paymentId = String(body.paymentId || '').trim();
  if (!paymentId) return res.status(400).json({ ok: false, error: 'missing_paymentId' });

  const r = await collectPayment(paymentId, { source: cronOk ? 'cron' : 'manual' });
  if (r.ok) {
    return res.status(200).json({
      ok: true, paymentIntentId: r.paymentIntentId, piStatus: r.piStatus,
      charged: r.charged, applicationFee: r.applicationFee, landlordNet: r.landlordNet,
    });
  }
  return res.status(r.httpStatus || 500).json({ ok: false, error: r.code, detail: r.detail });
}
