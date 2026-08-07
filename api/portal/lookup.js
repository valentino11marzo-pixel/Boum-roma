// api/portal/lookup.js
// Public endpoint for the PFS client portal. Resolves a client's portal data
// from their access code, under admin credentials (pfsClients is admin-only in
// firestore.rules, so the browser can no longer read it directly).
//
// Method:    POST
// URL:       /api/portal/lookup
// Body:      { code: string }
// Response:  200 { ok:true, client:{...} }
//            404 { ok:false, error:'invalid_code' }
//            400 { ok:false, error:'missing_code' }

import { readJson } from '../homie/_lib.js';
import { setCors, findClientByCode, mapClientForPortal } from './_shared.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const code = body && typeof body.code === 'string' ? body.code.trim() : '';
  if (!code || code.length < 4) return res.status(400).json({ ok: false, error: 'missing_code' });

  let c;
  try { c = await findClientByCode(code); }
  catch (e) {
    console.error('[portal/lookup] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!c) return res.status(404).json({ ok: false, error: 'invalid_code' });

  return res.status(200).json({ ok: true, client: mapClientForPortal(c) });
}
