// api/agent/queue.js — pull endpoint for the Mac-side realtime daemon.
//
// The daemon long-polls this every ~15s. Returns pending agentNotifications
// (oldest first) and atomically marks them `processing` so two daemons —
// or the same daemon retrying — don't double-fire.
//
// Body: {
//   limit?: number       max items to return (default 5, max 20)
//   maxAge?: number      ignore items older than X seconds (default 86400)
// }
//
// Returns: { ok, items: [{ id, type, summary, priority, ref, payload,
//                          ownerId, attempts, createdAt }] }
//
// After processing each item, the daemon MUST call /api/agent/ack with
// { id, status: 'done' | 'failed', detail? } so it doesn't get re-served.

import { fsList, fsPatch, readJson, requireSecret } from '../homie/_lib.js';
import { okJson, errJson } from './_lib.js';

const PRIORITY_WEIGHT = { urgent: 0, high: 1, normal: 2, low: 3 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return errJson(res, 405, 'method_not_allowed');
  if (!requireSecret(req, res)) return;

  const body = await readJson(req).catch(() => ({})) || {};
  const limit = Math.min(20, Math.max(1, parseInt(body.limit ?? 5, 10) || 5));
  const maxAgeSec = Math.max(60, parseInt(body.maxAge ?? 86400, 10) || 86400);

  try {
    const pending = await fsList('agentNotifications', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      limit: 50, // fetch more than `limit` so we can sort by priority client-side
    });

    const cutoff = Date.now() - maxAgeSec * 1000;
    const fresh = (pending || []).filter(d => {
      const created = Date.parse(d.createdAt || '') || 0;
      return created >= cutoff;
    });

    // Sort: priority weight, then createdAt asc (oldest first).
    fresh.sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.priority] ?? 2;
      const pb = PRIORITY_WEIGHT[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0);
    });

    const batch = fresh.slice(0, limit);
    const now = new Date().toISOString();

    // Atomically claim: flip status to 'processing'. If somebody else
    // already claimed it the patch will still go through, but the
    // ownership marker (claimedAt) lets the daemon detect contention.
    const claimed = [];
    for (const d of batch) {
      try {
        await fsPatch(`agentNotifications/${d.id}`, {
          status: 'processing',
          claimedAt: now,
          attempts: (d.attempts || 0) + 1,
        });
        claimed.push({
          id: d.id,
          type: d.type,
          summary: d.summary,
          priority: d.priority,
          ref: d.ref,
          payload: d.payload,
          ownerId: d.ownerId,
          attempts: (d.attempts || 0) + 1,
          createdAt: d.createdAt,
        });
      } catch (e) {
        // Skip — likely a concurrent claim. The next poll will pick up
        // whatever's still pending.
      }
    }

    return okJson(res, { items: claimed });
  } catch (e) {
    return errJson(res, 500, 'queue_failed', { message: String(e.message || e) });
  }
}
