// Authenticated operator surface. No model calls, notifications or execution.
import { requireRole } from '../_auth.js';
import { fsGet, readJson } from '../homie/_lib.js';
import { personaDossier } from './_persona.js';
import { listFollowUps, updateFollowUp } from './_follow-up.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  try {
    if (req.method === 'GET' && !req.query?.id) return res.status(200).json({ ok: true, ...await listFollowUps() });
    const body = req.method === 'POST' ? await readJson(req) : { id: req.query.id };
    if (!/^sg_[a-f0-9]{32}$/.test(String(body?.id || ''))) return res.status(400).json({ ok: false, error: 'invalid_case' });
    const task = await fsGet('operatorTasks/' + body.id);
    if (!task?.followUp || task.source !== 'segretaria') return res.status(404).json({ ok: false, error: 'case_not_found' });
    const cid = task.followUp.conversationId;
    if (!/^[\w.-]{1,180}$/.test(String(cid || ''))) return res.status(400).json({ ok: false, error: 'invalid_conversation' });
    const conv = await fsGet('conversations/' + cid);
    if (!conv) return res.status(409).json({ ok: false, error: 'conversation_missing' });
    const dossier = await personaDossier({ phone: conv.contactPhone, email: conv.contactEmail,
      leadId: conv.leadId || (conv.contactType === 'lead' ? conv.contactId : undefined), conversationId: cid });
    if (req.method === 'GET') return res.status(200).json({ ok: true, task, dossier });
    const result = await updateFollowUp({ id: body.id, input: body, actor: auth.uid, dossier });
    return res.status(result.code).json({ ok: result.code === 200, ...result });
  } catch {
    // Do not log payload, contact data, database errors or model context.
    return res.status(503).json({ ok: false, error: 'follow_up_unavailable' });
  }
}
