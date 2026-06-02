// api/agent/leads.create.js — Tool: agent.leads.create  (Tier 1, auto-applied)
//
// Body: same shape as /api/homie/inbound. Documented in agent/README.md.
//
// Difference from /api/homie/inbound:
//   - This endpoint is the agent-namespaced version. inbound.js stays as the
//     direct "ingestion" path (sources like the intake-form forwarder); the
//     agent layer wraps it so Homie has a uniform tool surface.
//   - Logs to activityLog with actor='homie'.

import { fsCreate, logActivity, guardPost, okJson, errJson } from './_lib.js';

const VALID_SOURCES = new Set(['immobiliare', 'idealista', 'whatsapp', 'web', 'intake', 'manual', 'telegram', 'radar']);

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  const errors = [];
  const src = String(body.source || '').toLowerCase().trim();
  if (!VALID_SOURCES.has(src) && !src.startsWith('radar:')) errors.push('source invalid');
  const name = String(body.name || '').trim();
  if (!name) errors.push('name required');
  const hasContact = (body.email && String(body.email).includes('@')) || (body.phone && /\d/.test(String(body.phone)));
  if (!hasContact && src !== 'radar' && !src.startsWith('radar:')) errors.push('email or phone required');
  if (errors.length) return errJson(res, 400, 'validation', errors);

  const now = new Date();
  const lead = {
    source: src, name,
    email: body.email || null, phone: body.phone || null,
    message: body.message || null, language: body.language || null,
    budget: typeof body.budget === 'number' ? body.budget : null,
    zone: body.zone || null, situation: body.situation || null,
    notes: body.notes || body.message || null,
    propertyId: body.propertyId || null, propertyTitle: body.propertyTitle || null,
    propertyPrice: typeof body.propertyPrice === 'number' ? body.propertyPrice : null,
    propertyUrl: body.propertyUrl || null, propertyAddress: body.propertyAddress || null,
    intakeForm: src === 'intake', status: 'new',
    grade: body.grade || null, intent: body.intent || null,
    confidence: typeof body.confidence === 'number' ? body.confidence : null,
    tier: body.tier === 1 || body.tier === 2 ? body.tier : null,
    ingestedBy: 'agent-tool', sourceRef: body.sourceRef || null,
    raw: body.raw || null,
    createdAt: now, ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    await logActivity('Lead creato (agent)', 'lead', { leadId: id, name, source: src });
    return okJson(res, { id });
  } catch (e) { return errJson(res, 500, e.message || 'internal'); }
}
