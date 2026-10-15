// Lettura assistita di un annuncio esterno; nessuna scrittura o pubblicazione.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { extractListing } from './_extract.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireRole(req, res, ['admin']);
  if (!actor) return;
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const result = await extractListing(body?.url);
  return res.status(result.ok ? 200 : 400).json(result);
}
