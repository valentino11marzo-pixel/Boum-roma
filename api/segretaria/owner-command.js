// Admin-only surface for person resolution and proposal preparation.
// Caller ID and spoken names are inputs to review, never authorization.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { ownerCommandError, prepareOwnerCommand, resolvePeople } from './_owner-command.js';
import { runBudget } from '../_budget.js';

export default async function handler(req, res) {
  const budget = runBudget(60_000, 7_000);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'invalid_request' });
  try {
    if (body.op === 'resolve') return res.status(200).json({ ok: true, operation: 'resolve', ...(await resolvePeople(body.query)) });
    if (body.op === 'prepare-only') return res.status(200).json({ ok: true, operation: 'prepare-only',
      ...(await prepareOwnerCommand(body, { actor: auth.uid, budget })) });
    return res.status(400).json({ ok: false, error: 'unknown_operation' });
  } catch (error) {
    // Payload, contacts and model context never enter logs.
    const failure = ownerCommandError(error);
    return res.status(failure.status).json({ ok: false, error: failure.error });
  }
}
