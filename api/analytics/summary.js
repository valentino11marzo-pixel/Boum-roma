// Admin-only aggregate for /behavior. Raw anonymous journeys never reach the browser.
import { requireRole, setCors } from '../_auth.js';
import { fsList } from '../homie/_lib.js';
import BEHAVIOR from '../../js/behavior-engine.js';

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  const days = Math.max(1, Math.min(90, Math.round(Number(req.query?.days) || 14)));
  const since = new Date(Date.now() - days * 86400000);
  try {
    const rows = await fsList('webJourneys', {
      filter: { field: 'receivedAt', op: 'GREATER_THAN_OR_EQUAL', value: since }, limit: 2500
    });
    return res.status(200).json({ ok: true, days, sample: rows.length,
      truncated: rows.length === 2500, data: BEHAVIOR.summarize(rows) });
  } catch (e) {
    console.error('[analytics/summary] read failed:', e.message);
    return res.status(503).json({ ok: false, error: 'temporarily_unavailable' });
  }
}
