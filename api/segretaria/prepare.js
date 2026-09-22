// One operator decision can confirm the prepared follow-up and its shown reply.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { prepareCase } from './_prepare.js';
import { approvePreparation } from './_dispatch.js';
import { runBudget } from '../_budget.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  try {
    const body = await readJson(req);
    if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'invalid_request' });
    if (body.op === 'approve_batch') {
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 5
        || new Set(body.items.map(x => x?.id)).size !== body.items.length)
        return res.status(400).json({ ok: false, error: 'invalid_batch' });
      // Each shown revision is checked independently; partial success is visible
      // and the same retry never resends an already claimed action.
      const results = [];
      const budget = runBudget(60_000, 7_000);
      for (const item of body.items) {
        if (!budget.afford(35_000)) {
          results.push({ id: item.id, code: 503, error: 'batch_time_budget', started: false });
          continue;
        }
        try { results.push(await approvePreparation({ id: item.id, revision: item.revision,
          lastMessageId: item.lastMessageId, actor: auth.uid })); }
        catch { results.push({ id: item.id, code: 503, error: 'preparation_unavailable' }); }
      }
      return res.status(200).json({ ok: true, complete: results.every(r => r.code === 200), results });
    }
    let result;
    if (body.op === 'generate') result = await prepareCase({ id: body.id, actor: auth.uid });
    else if (body.op === 'approve') result = await approvePreparation({ id: body.id,
      revision: body.revision, lastMessageId: body.lastMessageId, actor: auth.uid });
    else return res.status(400).json({ ok: false, error: 'unknown_operation' });
    return res.status(result.code).json({ ok: result.code === 200, ...result });
  } catch { return res.status(503).json({ ok: false, error: 'preparation_unavailable' }); }
}
