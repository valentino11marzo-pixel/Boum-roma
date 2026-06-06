// api/homie/inbox-sync.js
// Homie → Inbox reconciliation. After Homie has scanned ALL of WhatsApp it
// calls this once with a batch of conversation updates: close what's resolved,
// re-open / flag what was forgotten ("qualcosa che si è perso"), refresh the
// AI summary / suggested reply, snooze, tag. This is the "update the status of
// things" pass — it does NOT append messages (use /api/homie/message for that).
//
// Method:   POST
// URL:      /api/homie/inbox-sync
// Headers:  X-Homie-Secret: <HOMIE_SECRET>
// Body (JSON):
//   updates: [{
//     // address the conversation by the explicit pair OR by phone:
//     conversationId?: string,
//     contactType?: 'lead'|'tenant'|'landlord'|'pfs'|'client'|'whatsapp',
//     contactId?:    string,
//     phone?:        string,
//     // any of these fields to set:
//     status?:        'open'|'snoozed'|'closed',
//     needsReply?:    boolean,
//     urgency?:       'low'|'medium'|'high',
//     aiSummary?:     string,
//     suggestedReply?:string,
//     tags?:          string[],
//   }, ...]
//
// Response: { ok, updated, skipped, results: [{ conversationId, ok, error? }] }

import { fsPatch, fsList, logActivity, requireSecret, readJson } from './_lib.js';

function normalizePhone(p) {
  if (!p) return '';
  let s = String(p).replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (!s.startsWith('+')) {
    if (s.startsWith('3') || s.startsWith('0')) s = '+39' + s.replace(/^0/, '');
  }
  return s;
}
function convIdFor(contactType, contactId) {
  return 'conv_' + contactType + '_' + String(contactId).replace(/[^A-Za-z0-9_-]/g, '');
}

async function resolveCid(u) {
  if (u.conversationId) return String(u.conversationId);
  if (u.contactType && u.contactId) return convIdFor(u.contactType, u.contactId);
  if (u.phone) {
    const norm = normalizePhone(u.phone);
    // Find an existing conversation by its normalized phone.
    for (const val of [norm, u.phone]) {
      try {
        const rows = await fsList('conversations', { filter: { field: 'contactPhone', op: 'EQUAL', value: val }, limit: 1 });
        if (rows && rows.length) return rows[0].id;
      } catch { /* keep trying */ }
    }
    // Fall back to the standalone WhatsApp id shape.
    return convIdFor('whatsapp', norm.replace(/^\+/, ''));
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!requireSecret(req, res)) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const updates = body && Array.isArray(body.updates) ? body.updates : null;
  if (!updates) return res.status(400).json({ ok: false, error: 'updates_array_required' });
  if (updates.length > 500) return res.status(400).json({ ok: false, error: 'too_many_updates (max 500)' });

  const results = [];
  let updated = 0, skipped = 0;
  const now = new Date();

  for (const u of updates) {
    const cid = await resolveCid(u);
    if (!cid) { skipped++; results.push({ conversationId: null, ok: false, error: 'unresolved' }); continue; }

    const patch = { updatedAt: now, lastSource: 'homie' };
    if (u.status && ['open', 'snoozed', 'closed'].includes(u.status)) patch.status = u.status;
    if (typeof u.needsReply === 'boolean') patch.needsReply = u.needsReply;
    if (u.urgency && ['low', 'medium', 'high'].includes(u.urgency)) patch.urgency = u.urgency;
    if (u.aiSummary != null) { patch.aiSummary = String(u.aiSummary).slice(0, 1000); patch.aiUpdatedAt = now; }
    if (u.suggestedReply != null) { patch.suggestedReply = String(u.suggestedReply).slice(0, 2000); patch.aiUpdatedAt = now; }
    if (Array.isArray(u.tags)) patch.tags = u.tags.slice(0, 20).map(String);

    // Only the bookkeeping fields would be patched → nothing meaningful.
    const meaningful = Object.keys(patch).some(k => !['updatedAt', 'lastSource'].includes(k));
    if (!meaningful) { skipped++; results.push({ conversationId: cid, ok: false, error: 'no_fields' }); continue; }

    try {
      await fsPatch('conversations/' + cid, patch);
      updated++;
      results.push({ conversationId: cid, ok: true });
    } catch (e) {
      skipped++;
      results.push({ conversationId: cid, ok: false, error: 'patch_failed' });
    }
  }

  await logActivity('inbox_sync', 'inbox', { count: updates.length, updated, skipped });
  return res.status(200).json({ ok: true, updated, skipped, results });
}
