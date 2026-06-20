// api/agent/ack.js — acknowledge a queued event.
//
// Called by the Mac daemon after processing each item returned by
// /api/agent/queue. Marks the notification as done/failed, captures the
// outcome for audit, and lets failed items be retried by re-flipping them
// to 'pending' (caller can pass retry=true if attempts < 5).
//
// Body: {
//   id:      string                                  notification doc id
//   status:  'done' | 'failed'                       outcome
//   detail?: string                                  short note for audit
//   retry?:  boolean                                 if true and status='failed',
//                                                    flip back to 'pending'
//                                                    (capped at 5 attempts)
// }

import { fsPatch, fsGet, readJson, requireSecret } from '../homie/_lib.js';
import { okJson, errJson } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return errJson(res, 405, 'method_not_allowed');
  if (!requireSecret(req, res)) return;

  const body = await readJson(req).catch(() => null);
  if (!body || typeof body !== 'object') return errJson(res, 400, 'no_body');

  const id = String(body.id || '').trim();
  if (!id) return errJson(res, 400, 'missing_id');

  const status = body.status === 'done' ? 'done'
              : body.status === 'failed' ? 'failed' : null;
  if (!status) return errJson(res, 400, 'invalid_status');

  const now = new Date().toISOString();
  try {
    const doc = await fsGet(`agentNotifications/${id}`).catch(() => null);
    const attempts = doc?.attempts || 0;

    // Retry path — if caller asks and we haven't blown the cap, re-queue.
    if (status === 'failed' && body.retry === true && attempts < 5) {
      await fsPatch(`agentNotifications/${id}`, {
        status: 'pending',
        lastFailedAt: now,
        lastDetail: String(body.detail || '').slice(0, 500),
      });
      return okJson(res, { id, requeued: true, attempts });
    }

    await fsPatch(`agentNotifications/${id}`, {
      status,
      closedAt: now,
      detail: String(body.detail || '').slice(0, 500),
    });
    return okJson(res, { id, status });
  } catch (e) {
    return errJson(res, 500, 'ack_failed', { message: String(e.message || e) });
  }
}
