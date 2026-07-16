// api/banking/import.js — import manuale dell'estratto conto (admin)
//
// The zero-setup fallback: works before (or instead of) the GoCardless
// keys. Paste/upload the CSV the bank's home-banking exports and the
// movements land in the same `bankTransactions` pipeline (categorized,
// deduped by content hash, reconciled against pending payments).
//
// POST { csv: string, accountLabel?: string } → { ok, imported, skipped, matched }
//
// Column detection is heuristic over the header row (it covers the common
// Italian exports: Intesa, Unicredit, BPER, Fineco, N26, Revolut):
//   date    →  data | data operazione | data contabile | date | started date
//   amount  →  importo | amount  (single signed column)
//              oppure entrate/accrediti + uscite/addebiti (two columns)
//   desc    →  descrizione | causale | dettagli | description | note
//   ctrp    →  controparte | beneficiario | ordinante | payee | counterparty

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { categorize, txDocId, reconcile, applyMatch, batchExists, fsPatch, fsList, logActivity } from './_lib.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const csv = String(req.body?.csv || '');
  if (csv.length < 10) return res.status(400).json({ ok: false, error: 'csv required' });
  if (csv.length > 2_000_000) return res.status(400).json({ ok: false, error: 'csv too large (max ~2MB)' });
  const accountLabel = String(req.body?.accountLabel || 'import-manuale').slice(0, 60);

  try {
    const rows = parseCsv(csv);
    if (rows.length < 2) return res.status(400).json({ ok: false, error: 'nessuna riga dati trovata' });
    const map = detectColumns(rows[0]);
    if (map.date == null || (map.amount == null && (map.in == null || map.out == null))) {
      return res.status(400).json({ ok: false, error: 'colonne non riconosciute — servono almeno data e importo (o entrate/uscite)', header: rows[0] });
    }

    const txs = [];
    for (const r of rows.slice(1)) {
      const dateIso = parseItDate(r[map.date]);
      if (!dateIso) continue;
      let amount;
      if (map.amount != null) amount = parseItNumber(r[map.amount]);
      else {
        const inc = parseItNumber(r[map.in]) || 0;
        const out = parseItNumber(r[map.out]) || 0;
        amount = inc - Math.abs(out);
      }
      if (!amount) continue;
      const description = String(map.desc != null ? r[map.desc] : '').slice(0, 400);
      const counterparty = String(map.ctrp != null ? r[map.ctrp] : '').slice(0, 120);
      txs.push({
        accountId: 'manual:' + accountLabel,
        txId: null,
        bookingDate: dateIso,
        valueDate: dateIso,
        amount,
        currency: 'EUR',
        side: amount >= 0 ? 'in' : 'out',
        description,
        counterparty,
        category: categorize({ amount, description, counterparty }),
        source: 'import',
      });
    }
    if (!txs.length) return res.status(400).json({ ok: false, error: 'nessun movimento valido nel file' });

    // Same dedupe + reconcile pipeline as the API sync.
    const withIds = txs.map(tx => ({ tx, docId: txDocId(tx) }));
    const seen = await batchExists('bankTransactions', withIds.map(w => w.docId));
    const fresh = withIds.filter(w => !seen.has(w.docId));

    const [payments, users] = await Promise.all([
      fsList('payments', { limit: 600 }),
      fsList('users', { limit: 1000 }).catch(() => []),
    ]);
    const pending = payments.filter(p => !['paid', 'cancelled'].includes(p.status));
    const tenantNameById = {}; users.forEach(u => { tenantNameById[u.id] = u.name || ''; });

    let matched = 0, suggested = 0;
    const toWrite = [];
    for (const { tx, docId } of fresh) {
      const { match, suggestions } = reconcile(tx, pending, tenantNameById);
      if (match) { const i = pending.findIndex(p => p.id === match.paymentId); if (i >= 0) pending.splice(i, 1); matched++; }
      else if (suggestions.length) suggested++;
      toWrite.push({ tx, docId, match, suggestions });
    }
    for (let i = 0; i < toWrite.length; i += 8) {
      await Promise.all(toWrite.slice(i, i + 8).map(async ({ tx, docId, match, suggestions }) => {
        await fsPatch('bankTransactions/' + docId, { ...tx, matchSuggestions: suggestions.length ? suggestions : null, createdAt: new Date() });
        if (match) await applyMatch(docId, tx, match.paymentId, match.confidence, 'import');
      }));
    }

    await logActivity('Estratto conto importato', 'banking',
      { rows: rows.length - 1, imported: fresh.length, skipped: withIds.length - fresh.length, matched, accountLabel }, actor);
    return res.status(200).json({ ok: true, imported: fresh.length, skipped: withIds.length - fresh.length, matched, suggested });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ─── CSV parsing (separator auto-detect ; , or tab; quoted fields) ─────────
function parseCsv(text) {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined);
  const sep = [';', ',', '\t'].map(s => ({ s, n: firstLine.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}

function detectColumns(header) {
  const h = header.map(x => String(x).toLowerCase());
  const find = (...pats) => {
    for (const p of pats) { const i = h.findIndex(x => x.includes(p)); if (i >= 0) return i; }
    return null;
  };
  return {
    date: find('data operazione', 'data contabile', 'started date', 'data', 'date'),
    amount: find('importo', 'amount'),
    in: find('entrate', 'accrediti', 'avere', 'credit'),
    out: find('uscite', 'addebiti', 'dare', 'debit'),
    desc: find('descrizione', 'causale', 'dettagli', 'description', 'note'),
    ctrp: find('controparte', 'beneficiario', 'ordinante', 'payee', 'counterparty'),
  };
}

// '31/12/2025', '31-12-2025', '2025-12-31' → '2025-12-31'
function parseItDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// '1.234,56' / '1234.56' / '-1.234,56 €' → number
function parseItNumber(s) {
  if (s == null || s === '') return 0;
  let t = String(s).replace(/[€\s]/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}
