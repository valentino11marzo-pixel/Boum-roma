// api/homie/message.js
// Homie → Inbox bridge. The Mac-side Homie agent watches WhatsApp (and email),
// and calls this endpoint for every message it sees — inbound from a contact or
// outbound that Homie itself sent. The message lands in the SAME conversations +
// messages collections the portal Inbox already reads (no fork), so the operator
// sees everything live, without re-logging or re-typing anything.
//
// Method:   POST
// URL:      /api/homie/message
// Headers:  X-Homie-Secret: <HOMIE_SECRET>
// Body (JSON):
//   direction:    'in' | 'out' | 'note'                              [required]
//   body:         string                                             [required]
//   channel?:     'whatsapp' | 'email' | 'note'   (default whatsapp)
//   // ── contact resolution (give the explicit pair when known, else a phone/email) ──
//   contactType?: 'lead'|'tenant'|'landlord'|'pfs'|'client'|'whatsapp'
//   contactId?:   string         (doc id of the linked entity)
//   phone?:       string         (WhatsApp number, any format)
//   email?:       string
//   name?:        string         (display name if Homie knows it)
//   contactUid?:  string         (Firebase Auth uid, if known)
//   assignedLandlordId?: string
//   // ── message metadata ──
//   messageId?:   string         (WhatsApp message id — idempotency key)
//   timestamp?:   ISO string     (when the message was sent; default now)
//   mediaUrls?:   string[]
//   // ── optional analysis Homie attaches after reading ──
//   analysis?: {
//     summary?: string,          (what this thread is about / what's pending)
//     intent?: string,
//     needsReply?: boolean,      (true → flagged "da rispondere" in the Inbox)
//     urgency?: 'low'|'medium'|'high',
//     suggestedReply?: string,   (one-tap into the composer)
//   }
//
// Response: { ok, conversationId, messageId, created, dedupHit? }

import { fsCreate, fsGet, fsPatch, fsList, logActivity, requireSecret, readJson } from './_lib.js';

// ── Pure helpers (mirror js/conversations.js so the id/phone logic matches) ──
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
function preview(t, max = 90) {
  if (!t) return '';
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Try to resolve an existing BOOM entity from a phone number, scanning the
// collections a WhatsApp contact could live in. Returns { contactType, entity }.
async function resolveByPhone(phone) {
  const norm = normalizePhone(phone);
  const candidates = [norm, phone].filter(Boolean);
  const scans = [
    { type: 'lead',     coll: 'leads',      field: 'phone' },
    { type: 'tenant',   coll: 'users',      field: 'phone', roleEq: 'tenant' },
    { type: 'landlord', coll: 'users',      field: 'phone', roleEq: 'landlord' },
    { type: 'pfs',      coll: 'pfsClients', field: 'phone' },
    { type: 'client',   coll: 'clients',    field: 'phone' },
  ];
  for (const val of candidates) {
    for (const s of scans) {
      try {
        const rows = await fsList(s.coll, { filter: { field: s.field, op: 'EQUAL', value: val }, limit: 5 });
        const hit = s.roleEq ? rows.find(r => r.role === s.roleEq) : rows[0];
        if (hit) return { contactType: s.type, entity: hit };
      } catch { /* keep scanning */ }
    }
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
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const direction = body.direction;
  const text = String(body.body || '').trim();
  const channel = body.channel || 'whatsapp';
  if (!['in', 'out', 'note'].includes(direction)) return res.status(400).json({ ok: false, error: 'invalid_direction' });
  if (!text) return res.status(400).json({ ok: false, error: 'empty_body' });

  // ── Resolve the conversation's contact ─────────────────────────────────
  let contactType = body.contactType || null;
  let contactId   = body.contactId || null;
  let contactName = body.name || '';
  let contactPhone = normalizePhone(body.phone || '');
  let contactEmail = body.email || '';
  let contactUid  = body.contactUid || null;
  let assignedLandlordId = body.assignedLandlordId || null;

  if (!contactType || !contactId) {
    let resolved = null;
    if (contactPhone || body.phone) resolved = await resolveByPhone(body.phone || contactPhone);
    if (resolved) {
      const e = resolved.entity;
      contactType = resolved.contactType;
      contactId   = e.id;
      contactName = contactName || e.name || ((e.firstName ? (e.firstName + ' ' + (e.lastName || '')).trim() : '') ) || e.email || contactPhone;
      contactPhone = contactPhone || normalizePhone(e.phone || '');
      contactEmail = contactEmail || e.email || '';
      if (resolved.contactType === 'tenant' || resolved.contactType === 'landlord') contactUid = contactUid || e.id;
      if (resolved.contactType === 'landlord') assignedLandlordId = assignedLandlordId || e.id;
      if (e.convertedUserId) contactUid = contactUid || e.convertedUserId;
      if (e.ownerId) assignedLandlordId = assignedLandlordId || e.ownerId;
    } else {
      // Unknown number → a standalone WhatsApp contact keyed by the phone.
      if (!contactPhone) return res.status(400).json({ ok: false, error: 'no_contact: provide contactType+contactId or a phone' });
      contactType = 'whatsapp';
      contactId   = contactPhone.replace(/^\+/, '');
      contactName = contactName || contactPhone;
    }
  }

  const cid = convIdFor(contactType, contactId);
  const now = body.timestamp ? new Date(body.timestamp) : new Date();
  const analysis = (body.analysis && typeof body.analysis === 'object') ? body.analysis : null;

  // ── Idempotency: skip if we already logged this WhatsApp message id ─────
  if (body.messageId) {
    try {
      const dup = await fsList('messages', { filter: { field: 'waMessageId', op: 'EQUAL', value: String(body.messageId) }, limit: 1 });
      if (dup && dup.length) {
        return res.status(200).json({ ok: true, conversationId: cid, messageId: dup[0].id, created: false, dedupHit: true });
      }
    } catch { /* non-fatal — fall through and write */ }
  }

  // ── Read current conversation (for unread math + create flag) ───────────
  let existing = null;
  try { existing = await fsGet('conversations/' + cid); } catch { /* treat as new */ }
  const created = !existing;
  const prevUnread = existing && Number(existing.unread) ? Number(existing.unread) : 0;

  // ── Upsert the conversation header ──────────────────────────────────────
  const header = {
    contactType, contactId,
    contactUid: contactUid || null,
    contactName: contactName || 'Senza nome',
    contactPhone: contactPhone || '',
    contactEmail: contactEmail || '',
    assignedLandlordId: assignedLandlordId || null,
    channel: existing && existing.channel && existing.channel !== channel ? 'mixed' : channel,
    lastMessageAt: now,
    lastMessagePreview: preview(text),
    lastDirection: direction,
    lastSource: 'homie',
    updatedAt: now,
  };
  if (created) {
    header.status = 'open';
    header.createdAt = now;
    header.tags = [];
  }
  // Unread + needs-reply: an inbound bumps unread and flags "da rispondere"
  // unless Homie explicitly says no reply is needed; an outbound clears both.
  if (direction === 'in') {
    header.unread = prevUnread + 1;
    header.needsReply = analysis && analysis.needsReply === false ? false : true;
  } else if (direction === 'out') {
    header.unread = 0;
    header.needsReply = false;
  }
  if (analysis) {
    if (analysis.summary != null)        header.aiSummary = String(analysis.summary).slice(0, 1000);
    if (analysis.intent != null)         header.aiIntent = String(analysis.intent).slice(0, 200);
    if (analysis.suggestedReply != null) header.suggestedReply = String(analysis.suggestedReply).slice(0, 2000);
    if (analysis.urgency != null)        header.urgency = ['low', 'medium', 'high'].includes(analysis.urgency) ? analysis.urgency : 'medium';
    if (analysis.needsReply != null)     header.needsReply = !!analysis.needsReply;
    header.aiUpdatedAt = now;
  }

  try {
    await fsPatch('conversations/' + cid, header);
  } catch (e) {
    console.error('[homie/message] conversation upsert', e);
    return res.status(500).json({ ok: false, error: 'conversation_write_failed' });
  }

  // ── Append the message ──────────────────────────────────────────────────
  const msg = {
    conversationId: cid,
    direction,
    channel,
    body: text,
    by: 'homie',
    source: 'homie',
    contactUid: contactUid || null,
    assignedLandlordId: assignedLandlordId || null,
    at: now,
  };
  if (body.messageId) msg.waMessageId = String(body.messageId);
  if (Array.isArray(body.mediaUrls) && body.mediaUrls.length) msg.attachments = body.mediaUrls.slice(0, 10).map(String);

  let messageId;
  try {
    const r = await fsCreate('messages', msg);
    messageId = r.id;
  } catch (e) {
    console.error('[homie/message] message write', e);
    return res.status(500).json({ ok: false, error: 'message_write_failed' });
  }

  await logActivity('inbox_message_' + direction, 'inbox', {
    conversationId: cid, contactType, contactId, channel,
    preview: preview(text, 60), needsReply: !!header.needsReply,
  });

  return res.status(200).json({ ok: true, conversationId: cid, messageId, created });
}
