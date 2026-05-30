// api/agent/leads.update.js — Tool: agent.leads.update  (Tier 1)
//
// Body: { id: string, ...fieldsToUpdate }
// Allowed updatable fields: status, notes, grade, intent, confidence, tier,
//                           budget, zone, situation, language, respondedAt,
//                           respondedBy.
// Status transitions are not enforced server-side — Homie may legitimately
// flip new→responded, responded→converted, etc.

import { fsPatch, fsGet, logActivity, guardPost, okJson, errJson } from './_lib.js';

const ALLOWED = new Set([
  'status', 'notes', 'grade', 'intent', 'confidence', 'tier',
  'budget', 'zone', 'situation', 'language', 'respondedAt',
  'respondedBy', 'qualification', 'discardedReason',
]);

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const id = String(body.id || '').trim();
  if (!id) return errJson(res, 400, 'id required');

  const existing = await fsGet(`leads/${id}`);
  if (!existing) return errJson(res, 404, 'lead_not_found');

  const update = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'id') continue;
    if (!ALLOWED.has(k)) continue;
    update[k] = v;
  }
  if (Object.keys(update).length === 0) return errJson(res, 400, 'no_updatable_fields');
  update.updatedAt = new Date();
  if (update.status === 'responded' && !update.respondedAt) update.respondedAt = new Date();

  try {
    await fsPatch(`leads/${id}`, update);
    await logActivity('Lead aggiornato (agent)', 'lead', { leadId: id, fields: Object.keys(update) });
    return okJson(res, { id, updated: Object.keys(update) });
  } catch (e) { return errJson(res, 500, e.message); }
}
