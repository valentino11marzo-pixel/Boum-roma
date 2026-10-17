import { requireRole, setCors } from '../../_auth.js';
import { bodyOf, createRequest, createResult } from './_protocol.js';

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const caller = await requireRole(req, res, ['admin']); if (!caller) return;
  try { return res.status(200).json(createResult(await createRequest(bodyOf(req), `admin:${caller.uid}`))); }
  catch (e) { return res.status(e.status || 502).json({ ok: false, error: e.code || 'upstream' }); }
}
