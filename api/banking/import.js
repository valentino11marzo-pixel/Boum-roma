// Manual statements: preview, explicit confirmation, movement acquisition only.
// Existing automatic bank/email feeds retain their separate reconciliation policy.
import crypto from 'node:crypto';
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { parseBankCsv, ingestBankTransactions } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireRole(req, res, ['admin']);
  if (!actor) return;
  try {
    const body = await readJson(req);
    if (!['preview', 'import'].includes(body?.action)) return res.status(400).json({ ok: false, error: 'anteprima richiesta prima del caricamento' });
    const csv = body.csv, accountLabel = body.accountLabel;
    if (typeof csv !== 'string' || csv.length < 10 || csv.length > 2_000_000) return res.status(400).json({ ok: false, error: 'CSV mancante o troppo grande (max 2 MB)' });
    if (typeof accountLabel !== 'string' || !accountLabel.trim() || accountLabel.length > 60 || /[\x00-\x1f]/.test(accountLabel)) return res.status(400).json({ ok: false, error: 'indica una etichetta conto stabile (max 60 caratteri), uguale per tutti gli estratti dello stesso conto' });
    const label = accountLabel.trim();
    const { txs, error } = parseBankCsv(csv, { strict: true });
    if (error) return res.status(400).json({ ok: false, error });
    if (!txs.length || txs.length > 1000) return res.status(400).json({ ok: false, error: 'servono da 1 a 1000 movimenti validi per file' });
    const digest = crypto.createHash('sha256').update(JSON.stringify({ csv, accountLabel: label })).digest('hex');
    if (body.action === 'import' && (body.confirmed !== true || body.digest !== digest)) return res.status(409).json({ ok: false, error: 'ripeti l’anteprima e conferma lo stesso file e conto' });
    const out = await ingestBankTransactions(txs, { accountId: 'manual:' + label, source: 'import', actor: 'admin:' + actor.uid, reviewOnly: true, dryRun: body.action === 'preview' });
    return res.status(200).json({ ok: true, action: body.action, digest, ...out });
  } catch (e) {
    if (e.message === 'ambiguous_duplicate_rows') return res.status(400).json({ ok: false, error: 'righe identiche nel file: verifica se sono duplicati o movimenti distinti prima del caricamento' });
    // A retry skips movements already created. Never expose financial payloads in errors.
    return res.status(503).json({ ok: false, error: 'importazione non completata: ripeti l’anteprima; gli eventuali movimenti già acquisiti verranno saltati' });
  }
}
