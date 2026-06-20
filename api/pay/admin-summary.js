// api/pay/admin-summary.js
// BOOM Pay — admin Collections Command Center data. Aggregates the whole book:
// this-month money movement, the recovery queue (failed/overdue with a ready
// bilingual dunning draft), and the recent money ledger.
//
// POST {} — Auth: admin Firebase ID token.

import { requireRole, setCors } from '../_auth.js';
import { fsGet, fsList, readJson } from '../homie/_lib.js';
import { setPayCors } from './_pay.js';

function dunningText(name, propertyName, amount, month) {
  const who = name || 'there';
  const prop = propertyName ? ` for ${propertyName}` : '';
  const en = `Hi ${who}, a quick heads-up: this month's rent${prop} (€${amount}) couldn't be collected automatically. Could you make sure the funds are available so we can retry? If anything's changed with your account, just reply here and we'll sort it. — BOOM`;
  const it = `Ciao ${who}, un promemoria veloce: l'affitto di questo mese${prop} (€${amount}) non è stato addebitato automaticamente. Puoi assicurarti che i fondi siano disponibili così riproviamo? Se è cambiato qualcosa sul tuo conto, rispondi qui e risolviamo. — BOOM`;
  return { en, it };
}

export default async function handler(req, res) {
  setCors(req, res);
  setPayCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  await readJson(req); // drain body if any

  try {
    const payments = await fsList('payments', { limit: 300 });
    const month = new Date().toISOString().slice(0, 7);
    const cents = (n) => Math.round(Number(n || 0) * 100);

    const stats = {
      expectedThisMonthCents: 0, collectedThisMonthCents: 0,
      inTransitCents: 0, failedCount: 0, overdueCount: 0,
      onRailsCount: 0, paidAllTimeCents: 0, feesAllTimeCents: 0,
    };
    const recoveryRaw = [];
    for (const p of payments) {
      const a = cents(p.amount);
      if (p.status === 'paid') stats.paidAllTimeCents += cents(p.chargedAmount || p.amount);
      if (p.month === month) {
        stats.expectedThisMonthCents += a;
        if (p.status === 'paid') stats.collectedThisMonthCents += cents(p.chargedAmount || p.amount);
        if (p.status === 'processing') stats.inTransitCents += cents(p.chargedAmount || p.amount);
      }
      if (p.status === 'failed') stats.failedCount += 1;
      if (p.status === 'overdue') stats.overdueCount += 1;
      if (p.paymentRail === 'sdd' && (p.status === 'processing' || p.status === 'paid')) stats.onRailsCount += 1;
      if (p.status === 'failed' || p.status === 'overdue') recoveryRaw.push(p);
    }
    // fee total: feeLandlord/feeTenant are stored in cents already
    stats.feesAllTimeCents = payments
      .filter(p => p.status === 'paid')
      .reduce((s, p) => s + (Number(p.feeLandlord) || 0) + (Number(p.feeTenant) || 0), 0);

    // Recovery queue — newest-due first, enrich a bounded slice.
    recoveryRaw.sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
    const recovery = [];
    for (const p of recoveryRaw.slice(0, 20)) {
      let tenantName = '', propertyName = '';
      try {
        const c = p.contractId ? await fsGet('contracts/' + p.contractId) : null;
        tenantName = (c && c.tenantName) || '';
        const prop = p.propertyId ? await fsGet('properties/' + p.propertyId) : null;
        propertyName = (prop && (prop.name || prop.address)) || '';
      } catch (_) {}
      recovery.push({
        id: p.id, month: p.month, dueDate: p.dueDate, amount: p.amount,
        status: p.status, attemptCount: p.attemptCount || 0,
        failureReason: p.failureReason || '', contractId: p.contractId || '',
        tenantName, propertyName,
        dunning: dunningText(tenantName, propertyName, Number(p.amount || 0).toLocaleString('it-IT'), p.month),
      });
    }

    let ledger = [];
    try {
      ledger = await fsList('payEvents', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 25 });
    } catch (_) {
      ledger = await fsList('payEvents', { limit: 25 });
    }

    return res.status(200).json({ ok: true, month, stats, recovery, ledger });
  } catch (e) {
    console.error('[pay/admin-summary] error:', e.message);
    return res.status(500).json({ ok: false, error: 'admin_summary_failed', detail: e.message });
  }
}
