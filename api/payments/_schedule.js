// api/payments/_schedule.js — il calendario dei canoni di un contratto, in
// UNA copia lato server (il portal ha la sua gemella, generateMonthlyPayments,
// con gli stessi id `pay_<contratto>_<YYYY-MM>`: le due strade non possono
// raddoppiare un calendario).
//
// Fino al 2/11/2026 viveva solo dentro api/magic-sign/submit. Ora lo usa
// anche il contratto firmato FUORI da Magic Sign, quando l'operatore lo
// chiede esplicitamente dalla console (api/contracts/_external.js).
import { fsList, fsPatch } from '../homie/_lib.js';
import { commitWrites } from '../magic-sign/_shared.js';

// Le rate, pure. Cadence: 1 = monthly (default), 2/3/6/12 = bimonthly…annual.
// The unit is a LEASE month (start day → day before the next anniversary),
// not a calendar month, so a lease that begins on the 10th is billed in full
// from day one and never loses its first period. Each instalment is paid in
// advance and covers `step` lease months — the last one is clamped and
// prorated to whatever the lease actually has left.
export function buildRentSchedule(contractId, c) {
  if (!c || !c.startDate || !c.endDate || !c.rent) return [];
  const pStart = new Date(c.startDate);
  const pEnd = new Date(c.endDate);
  const payDay = parseInt(c.paymentDay, 10) || 5;
  const step = [1, 2, 3, 6, 12].includes(Number(c.installmentMonths)) ? Number(c.installmentMonths) : 1;
  const addMonths = (d, n) => {
    const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    // month-end clamp: 31 Jan + 1 month = 28/29 Feb, never 3 March
    if (x.getDate() !== d.getDate()) x.setDate(0);
    return x;
  };
  // how many whole lease months the contract really spans
  let monthsTotal = 0;
  while (monthsTotal < 600 && addMonths(pStart, monthsTotal) <= pEnd) monthsTotal++;
  const perMonth = Math.round(((Number(c.installmentAmount) || c.rent * step) / step) * 100) / 100;
  const rows = [];
  for (let i = 0; i < monthsTotal; i += step) {
    const periodStart = addMonths(pStart, i);
    const covered = Math.min(step, monthsTotal - i);
    // due on the pay day of the period's month, never before the period itself begins
    let due = new Date(periodStart.getFullYear(), periodStart.getMonth(), payDay);
    if (due < periodStart) due = periodStart;
    const month = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
    const lastCovered = addMonths(pStart, i + covered - 1);
    const coversTo = `${lastCovered.getFullYear()}-${String(lastCovered.getMonth() + 1).padStart(2, '0')}`;
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    rows.push({
      id: 'pay_' + contractId + '_' + month,
      fields: {
        contractId,
        tenantId: c.tenantId || '',
        propertyId: c.propertyId || '',
        amount: Math.round(perMonth * covered * 100) / 100,
        month, dueDate, status: 'pending',
        installmentMonths: covered, coversTo,
      },
    });
  }
  return rows;
}

// Only if the MONTHLY schedule doesn't exist yet. Deposit docs (dep_/depbal_,
// type 'deposit'/'deposit-balance') don't count: the PA convert step writes
// depbal_<contractId> BEFORE signing, and it must never suppress the rent
// installments. Throws on a failed write (the caller decides how loud).
export async function ensureRentSchedule(contractId, c) {
  if (!c || !c.startDate || !c.endDate || !c.rent) return { scheduled: 0, created: 0, skipped: 'no_terms' };
  const existing = (await fsList('payments', {
    filter: { field: 'contractId', op: 'EQUAL', value: contractId },
    limit: 10,
  })).filter(p => !String(p.type || '').startsWith('deposit'));
  let scheduled = existing.length, created = 0;
  if (!existing.length) {
    const rows = buildRentSchedule(contractId, c);
    if (rows.length) await commitWrites(rows.map(r => ({ docPath: 'payments/' + r.id, fields: r.fields, serverTimestampFields: ['createdAt'] })));
    scheduled = created = rows.length;
  }
  // Il calendario c'è (appena scritto o già presente): lo si DICE sul
  // contratto. Senza questo timbro il portal vedeva `paymentsGenerated:
  // false` (scritto dalla conversione) e offriva «🚀 Ri-attiva onboarding»,
  // che rimandava il benvenuto.
  if (scheduled) await fsPatch(`contracts/${contractId}`, { paymentsGenerated: true, ...(existing.length ? {} : { paymentsCount: scheduled }) });
  return { scheduled, created };
}
