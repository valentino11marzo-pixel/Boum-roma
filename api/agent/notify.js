// api/agent/notify.js — universal event ingestion for the realtime path.
//
// ANYONE on the BOOM stack — a public form on the website, the Magic-Sign
// flow, a tenant filing a maintenance ticket, an operator hitting "approva"
// on Telegram — can fire an event here, and the Mac-side Agent OS daemon
// picks it up within seconds (instead of waiting for the next 15-min pulse).
//
// We don't push to the Mini directly because it doesn't have a public URL.
// Instead we write the event to Firestore `agentNotifications` (one of the
// cheapest collections you can have — a few small docs/day), and the Mini
// long-polls `/api/agent/queue` for pending ones. This means:
//   - no ngrok / tunnels / open ports on the Mini
//   - automatic durability: if the Mini is offline, events queue and
//     drain when it comes back up
//   - everything is observable in the Firestore console
//
// Auth: X-Homie-Secret (Mac bridge or internal API → API) OR
//       X-Agent-Public-Secret (public website forms, scoped narrower).
// The latter lets a static page POST a "new lead" event without leaking
// the full HOMIE_SECRET to the browser bundle.
//
// Body: {
//   type:       'lead.new' | 'contract.signed' | 'payment.overdue' |
//               'maintenance.opened' | 'action.approved' | 'custom'
//   summary:    short human label (shown to the agent)
//   ref:        { collection: string, id: string }     (e.g. leads/abc123)
//   ownerId?:   string                                  (for landlord-scoped)
//   priority?:  'urgent' | 'high' | 'normal' | 'low'   default 'normal'
//   payload?:   object                                  free-form context
//   dedupKey?:  string                                  upserts if exists
// }
//
// Returns: { ok, id } where id is the notification doc id (or the
// existing one if dedupKey matched and was still pending).

import { fsCreate, fsList, fsPatch, readJson } from '../homie/_lib.js';
import { okJson, errJson } from './_lib.js';

const ALLOWED_TYPES = new Set([
  'lead.new', 'lead.update',
  'contract.signed', 'contract.expired',
  'payment.received', 'payment.overdue',
  'maintenance.opened', 'maintenance.updated',
  'action.approved', 'action.rejected',
  'document.uploaded',
  'custom',
]);

const ALLOWED_PRIORITIES = new Set(['urgent', 'high', 'normal', 'low']);

function authOk(req) {
  const homie = req.headers['x-homie-secret'];
  if (homie && homie === process.env.HOMIE_SECRET) return 'homie';
  const pub = req.headers['x-agent-public-secret'];
  if (pub && pub === process.env.AGENT_PUBLIC_SECRET) return 'public';
  return null;
}

export default async function handler(req, res) {
  // CORS preflight — public sources (e.g. apartment-detail.html on
  // boomrome.com) may call this from the browser.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, X-Homie-Secret, X-Agent-Public-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return errJson(res, 405, 'method_not_allowed');

  const actor = authOk(req);
  if (!actor) return errJson(res, 401, 'invalid_auth');

  const body = await readJson(req).catch(() => null);
  if (!body || typeof body !== 'object') return errJson(res, 400, 'no_body');

  const type = String(body.type || '').trim();
  if (!ALLOWED_TYPES.has(type)) return errJson(res, 400, 'invalid_type', { allowed: [...ALLOWED_TYPES] });

  const summary = String(body.summary || '').slice(0, 280);
  if (!summary) return errJson(res, 400, 'missing_summary');

  const priority = ALLOWED_PRIORITIES.has(body.priority) ? body.priority : 'normal';

  // The public secret is narrower: it can ONLY create lead.new events
  // (limits what a leaked client-side key can do).
  if (actor === 'public' && type !== 'lead.new') {
    return errJson(res, 403, 'public_secret_can_only_create_leads');
  }

  // Idempotent upsert by dedupKey: avoids duplicate wakes when the same
  // form gets submitted twice or a webhook gets retried.
  const dedupKey = body.dedupKey ? String(body.dedupKey).slice(0, 120) : null;
  if (dedupKey) {
    try {
      const existing = await fsList('agentNotifications', {
        filter: { field: 'dedupKey', op: 'EQUAL', value: dedupKey },
        limit: 5,
      });
      const stillPending = (existing || []).find(d => d.status === 'pending');
      if (stillPending) return okJson(res, { id: stillPending.id, deduped: true });
    } catch (e) { /* fall through and create */ }
  }

  const doc = {
    type,
    summary,
    priority,
    ref: body.ref || null,
    ownerId: body.ownerId || null,
    payload: body.payload || null,
    dedupKey,
    status: 'pending',
    actor,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  try {
    const created = await fsCreate('agentNotifications', doc);
    return okJson(res, { id: created.id });
  } catch (e) {
    return errJson(res, 500, 'create_failed', { message: String(e.message || e) });
  }
}
