// api/banking/export.js — estratto conto / prima nota per la commercialista
//
// POST (admin) {
//   from: 'YYYY-MM-DD', to: 'YYYY-MM-DD',   default: current quarter
//   accountId?: string,                      default: all linked accounts
//   type?: 'estratto' | 'primanota',         default 'estratto'
//   format?: 'csv' | 'json'                  default 'csv'
// }
//
// estratto  → the plain bank statement: one row per movement, Italian CSV
//             (semicolon, DD/MM/YYYY, decimal comma — Excel it-IT opens it
//             clean). Columns the commercialista expects: data operazione,
//             data valuta, descrizione, controparte, entrate, uscite, conto.
// primanota → the same movements grouped for bookkeeping: category column
//             first, plus a summary block per category appended at the end
//             (totale entrate/uscite per categoria nel periodo).
//
// CSV responses set Content-Disposition so the browser downloads a named
// file: estratto-conto_2026-04-01_2026-06-30.csv

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { fsList, toItalianCsv } from './_lib.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const body = req.body || {};
  const now = new Date();
  const qStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from || '') ? body.from : qStart.toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(body.to || '') ? body.to : now.toISOString().slice(0, 10);
  const type = body.type === 'primanota' ? 'primanota' : 'estratto';
  const format = body.format === 'json' ? 'json' : 'csv';

  try {
    // Single-field range filter keeps us off composite indexes; account and
    // upper bound filtered in code.
    let txs = await fsList('bankTransactions', {
      filter: { field: 'bookingDate', op: 'GREATER_THAN_OR_EQUAL', value: from },
      orderBy: { field: 'bookingDate', direction: 'ASCENDING' },
      limit: 2000,
    });
    txs = txs.filter(t => t.bookingDate <= to && (!body.accountId || t.accountId === body.accountId));

    const accounts = await fsList('bankAccounts', { limit: 20 }).catch(() => []);
    const ibanByAcc = {}; accounts.forEach(a => { ibanByAcc[a.id] = a.iban || a.name || a.id; });

    if (format === 'json') {
      return res.status(200).json({ ok: true, from, to, type, count: txs.length, transactions: txs });
    }

    const baseCols = [
      { label: 'Data operazione', key: 'bookingDate', date: true },
      { label: 'Data valuta', key: 'valueDate', date: true },
      { label: 'Descrizione', key: 'description' },
      { label: 'Controparte', key: 'counterparty' },
      { label: 'Entrate', get: t => (t.amount > 0 ? t.amount : null) },
      { label: 'Uscite', get: t => (t.amount < 0 ? Math.abs(t.amount) : null) },
      { label: 'Conto', get: t => ibanByAcc[t.accountId] || t.accountId || '' },
    ];

    let csv;
    if (type === 'estratto') {
      csv = toItalianCsv(txs, baseCols);
    } else {
      const cols = [{ label: 'Categoria', key: 'category' }, ...baseCols];
      const sorted = [...txs].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.bookingDate.localeCompare(b.bookingDate));
      csv = toItalianCsv(sorted, cols);
      // Riepilogo per categoria in coda — la commercialista vede subito i
      // totali del periodo senza pivot.
      const sums = {};
      for (const t of txs) {
        const k = t.category || 'altro';
        sums[k] = sums[k] || { in: 0, out: 0 };
        if (t.amount > 0) sums[k].in += t.amount; else sums[k].out += Math.abs(t.amount);
      }
      const fmtN = n => n.toFixed(2).replace('.', ',');
      csv += '\r\nRIEPILOGO PERIODO;;;;;;\r\nCategoria;Entrate;Uscite;;;;\r\n';
      for (const [k, v] of Object.entries(sums).sort()) csv += `${k};${fmtN(v.in)};${fmtN(v.out)};;;;\r\n`;
    }

    const fname = `${type === 'estratto' ? 'estratto-conto' : 'prima-nota'}_${from}_${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
