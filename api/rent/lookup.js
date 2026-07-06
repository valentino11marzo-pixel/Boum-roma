// api/rent/lookup.js
// Public endpoint behind the /pay page. The credential is the per-payment
// payToken (random, issued by the cron / checkout endpoint) — same trust
// model as magic-sign tokens and the deposit payToken. Returns a sanitized
// view of the payment plus the contract's payment history so the page can
// render "you're up to date" / "2 months outstanding" without any login.
//
// Request:  POST { token }
// Response: { ok, payment, property, history } | { ok:false, error }

import { setCors, rateOk } from '../magic-sign/_shared.js';
import { readJson, fsList } from '../homie/_lib.js';
import { findPaymentByToken, paymentContext, monthLabel } from './_lib.js';

const sanitize = (p) => ({
  id: p.id,
  month: p.month || '',
  monthLabel: monthLabel(p.month),
  dueDate: p.dueDate || '',
  amount: Number(p.amount || 0),
  status: p.status === 'paid' ? 'paid' : (p.status || 'pending'),
  paidDate: p.paidDate || p.paidAt || null,
  receiptUrl: null, // only exposed for the token's own payment (below)
});

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 30)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); } catch { body = null; }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });

  try {
    const payment = await findPaymentByToken(token);
    if (!payment) return res.status(404).json({ ok: false, error: 'invalid_token' });

    const ctx = await paymentContext(payment);

    // History: every schedule row of the same contract, oldest first.
    // Sanitized — no tokens or receipt links of other months ever leave.
    // Contract-less payments get no history query: contractId '' would
    // match every other contract-less doc across all tenants.
    let history = [];
    if (payment.contractId) {
      try {
        const rows = await fsList('payments', {
          filter: { field: 'contractId', op: 'EQUAL', value: payment.contractId },
          limit: 60,
        });
        history = rows
          .filter(r => r.month && r.type !== 'deposit')
          .map(sanitize)
          .sort((a, b) => String(a.month).localeCompare(String(b.month)));
      } catch (_) { /* history is decorative — never block the payment */ }
    }

    const own = sanitize(payment);
    own.receiptUrl = payment.receiptUrl || null;

    return res.status(200).json({
      ok: true,
      payment: own,
      property: { label: ctx.propLabel },
      tenantFirstName: ctx.tenantFirstName,
      history,
    });
  } catch (e) {
    console.error('[rent/lookup]', e.message);
    return res.status(502).json({ ok: false, error: 'lookup_failed' });
  }
}
