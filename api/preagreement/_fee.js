// api/preagreement/_fee.js — le regole della provvigione in UNA copia.
//
// La cifra è quella che il cliente ha firmato sulla proposta (deriveMoney:
// fee + IVA = feeTotal), mai ricalcolata. La fattura è UNA per proposta
// (`prov_<paId>`). La leggono la console (_external.js: 💶 Link provvigione),
// il journey (promemoria T-7/T-1) e il Gestore (sollecito, digest): modulo
// puro, nessuna dipendenza pesante.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function feeOf(pa) {
  const m = (pa && pa.money) || {};
  const base = r2(m.fee), total = r2(m.feeTotal) || base;
  if (!(total > 0)) return null;
  return {
    totalEur: total, baseEur: base || total,
    vatPct: Number(m.feeVatPct) || 22, vatEur: base ? r2(total - base) : 0,
    due: ['move-in', 'signing', 'separate'].includes(m.feeDue) ? m.feeDue : 'separate',
    mode: m.feeMode || 'pct', pct: Number(m.feePct) || null, months: Number(m.feeMonths) || null,
  };
}
export const feeInvoiceId = (paId) => 'prov_' + String(paId || '').replace(/[^\w-]/g, '').slice(0, 80);

// Perché un link NON si fa: la provvigione dentro il dovuto alla firma
// passa dal link della proposta (un secondo link la farebbe pagare due volte).
export function feeBlock(pa, fee) {
  if (!fee) return 'no_fee';
  if (fee.due === 'signing') return (pa.status === 'paid' || pa.paidAt) ? 'fee_paid_at_signing' : 'fee_in_due_at_signing';
  return null;
}

