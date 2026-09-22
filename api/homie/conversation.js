// Explicit admin open: resolve and, only with verified absence, create in CAS.
import { requireRole } from '../_auth.js';
import { readJson } from './_lib.js';
import { resolveLeadConversation } from './_conversation.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!await requireRole(req, res, ['admin'])) return;
  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const result = await resolveLeadConversation({ leadId: body?.leadId, create: true });
  const ok = ['bound', 'new'].includes(result.status);
  return res.status(ok ? 200 : result.status === 'conflict' ? 409 : 503).json({ ok, cid: result.cid,
    status: result.status, reason: result.reason });
}
