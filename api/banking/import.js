// api/banking/import.js — import manuale dell'estratto conto (admin)
//
// The zero-setup path: works with no API and no email automation. Upload
// the CSV the bank's home-banking exports and the movements land in the
// same `bankTransactions` pipeline (categorized, deduped by content hash,
// reconciled against pending payments). Parsing + ingestion live in
// _lib.js (`parseBankCsv` + `ingestBankTransactions`), shared with the
// email scanner (scan-inbox.js).
//
// POST { csv: string, accountLabel?: string }
//   → { ok, imported, skipped, matched, suggested }

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { parseBankCsv, ingestBankTransactions, logActivity } from './_lib.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const csv = String(req.body?.csv || '');
  if (csv.length < 10) return res.status(400).json({ ok: false, error: 'csv required' });
  if (csv.length > 2_000_000) return res.status(400).json({ ok: false, error: 'csv too large (max ~2MB)' });
  const accountLabel = String(req.body?.accountLabel || 'import-manuale').slice(0, 60);

  try {
    const { txs, error, header } = parseBankCsv(csv);
    if (error) return res.status(400).json({ ok: false, error, header });
    if (!txs.length) return res.status(400).json({ ok: false, error: 'nessun movimento valido nel file' });

    const out = await ingestBankTransactions(txs, { accountId: 'manual:' + accountLabel, source: 'import', actor: 'import' });

    await logActivity('Estratto conto importato', 'banking', { ...out, accountLabel }, actor);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
