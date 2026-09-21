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
//   timestamp?:   ISO string     (required with timezone for backlog; otherwise default now)
//   mediaUrls?:   string[]
//   intakeMode?:  'backlog_review' (explicit silent intake; absence = normal)
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

import crypto from 'node:crypto';
import { fsCreate, fsGet, fsPatch, fsList, fsGetVersioned, fsCommit, logActivity, requireSecret, readJson } from './_lib.js';
import { smistaDocument, MAX_DOC_BYTES } from '../documents/_smista.js';
import { loadDocumentRelations, documentRelation } from '../documents/_relation.js';
import { runBudget, aiSignal } from '../_budget.js';
import {
  isNoise, matchListing, mergeMessage, buildLead, recentLeadByPhone, loadCatalog,
  normalizePhone, phoneVariants,
} from './_lead.js';
// STATIC imports (la lezione nodemailer di CLAUDE.md: il bundler Vercel non
// traccia i lazy import — un modulo mancante in produzione è un turno perso).
import SEG from '../../js/segretaria-engine.js';
import { segretariaTurn, segretariaOffConv } from '../segretaria/_core.js';
import { checkTimestamp, refreshTrackedFollowUp } from '../segretaria/_follow-up.js';

// ── Pure helpers (mirror js/conversations.js so the id/phone logic matches) ──
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
  // Ogni forma sotto cui quel numero può essere stato archiviato: WhatsApp
  // manda l'internazionale, i portali salvano il nazionale. Cercare una sola
  // forma significa non riconoscere un inquilino e trattarlo da sconosciuto.
  const candidates = phoneVariants(phone);
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

async function repairStoredMessage(stored, documentBudget) {
  const storedCid = stored.conversationId;
  const backlogReview = stored.intakeMode === 'backlog_review';
  let followUp = null;
  if (stored.direction === 'in' || stored.direction === 'out') {
    try {
      if (!/^[\w.-]{1,180}$/.test(String(storedCid || ''))) throw new Error('invalid_stored_conversation');
      const conv = await fsGet('conversations/' + storedCid);
      if (!conv) throw new Error('stored_conversation_missing');
      const messageVersion = (await fsGetVersioned('messages/' + stored.id))?.updateTime;
      const tracked = await refreshTrackedFollowUp({ cid: storedCid, conv,
        direction: stored.direction, text: stored.body, messageId: stored.waMessageId || stored.id, messageVersion, now: new Date(stored.at).getTime(),
        receivedAt: stored.receivedAt ? new Date(stored.receivedAt).getTime() : new Date(stored.at).getTime(),
        preserveNewer: backlogReview });
      if (tracked) followUp = { id: tracked.id, tracked: true };
      if (conv.followUpTrackingError) await fsPatch('conversations/' + storedCid, { followUpTrackingError: null });
    } catch {
      const error = 'Messaggio ricevuto; seguito non aggiornato. Verificare il caso in Oggi.';
      followUp = { tracked: false, error };
      if (/^[\w.-]{1,180}$/.test(String(storedCid || ''))) {
        await fsPatch('conversations/' + storedCid, { ...(backlogReview || stored.direction !== 'in' ? {} : { needsReply: true }), followUpTrackingError: error }).catch(() => {});
      }
      console.warn('[homie/message] follow-up retry failed');
    }
  }
  // Il testo è già salvo; un retry può recuperare un allegato fallito
  // o rinviato per budget, usando gli URL persistiti, non nuovi input.
  if (!backlogReview && stored.direction === 'in' && stored.channel === 'whatsapp' && stored.attachments?.length) {
    try {
      const originalContact = await fsGet('conversations/' + stored.conversationId);
      await fileWhatsAppAttachments({ urls: stored.attachments, text: stored.body,
        contactType: originalContact?.contactType || 'whatsapp',
        contactId: originalContact?.contactId, entity: null, budget: documentBudget });
    } catch { console.warn('[homie/message] attachments retry: failed'); }
  }
  return { ok: true, conversationId: storedCid, messageId: stored.id,
    created: false, dedupHit: true, ...(followUp ? { followUp } : {}) };
}

// The primary message and head commit together. The same WA ID is one message
// even under concurrent retries; earlier events never replace a newer head.
async function storeMessage(cid, msg, header, initialConversation) {
  const backlogReview = msg.intakeMode === 'backlog_review';
  const id = msg.waMessageId ? 'homie_' + crypto.createHash('sha256').update(msg.waMessageId).digest('hex').slice(0, 40)
    : 'homie_' + crypto.randomUUID();
  const messagePath = 'messages/' + id;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await fsGet(messagePath);
    if (stored) return { id, stored };
    const snapshot = await fsGetVersioned('conversations/' + cid), current = snapshot?.data;
    const incomingAt = msg.at.getTime(), currentAt = Date.parse(current?.lastMessageAt);
    // Equal timestamps use the serialization order of new, distinct receipts;
    // no ordering is inferred from WhatsApp IDs. Backlog retains its strict rule.
    const canUpdate = !current?.lastMessageAt || (Number.isFinite(currentAt)
      && (backlogReview ? currentAt < incomingAt : currentAt <= incomingAt));
    const { status, createdAt, tags, ...observedHeader } = header;
    let fields = !current ? header : canUpdate ? {
      ...(!backlogReview ? observedHeader : {}),
      channel: current.channel && current.channel !== msg.channel ? 'mixed' : msg.channel,
      lastMessageAt: msg.at, lastMessagePreview: preview(msg.body), lastDirection: msg.direction,
      lastSource: 'homie', updatedAt: msg.at,
      ...(msg.direction === 'in' ? { unread: (Number(current.unread) || 0) + 1, needsReply: backlogReview ? true : header.needsReply }
        : msg.direction === 'out' ? { unread: 0, needsReply: false } : {}),
    } : null;
    // A late incoming message is still newly unread; an older OUT cannot clear
    // newer unread messages. Backlog deliberately preserves its previous policy.
    if (current && !backlogReview && msg.direction === 'in') fields = { ...fields, unread: (Number(current.unread) || 0) + 1 };
    if (fields) fields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const identityFields = ['contactType', 'contactId', 'contactUid', 'assignedLandlordId', 'contactPhone', 'contactEmail', 'contactName'];
    // The transport resolved identity before the first read. If another writer
    // changed that identity meanwhile, its current ACLs win this retry. A first
    // association is allowed only while that original identity is unchanged.
    if (current && fields && !backlogReview && (!initialConversation
      || identityFields.some(key => (current[key] ?? null) !== (initialConversation[key] ?? null)))) {
      for (const key of identityFields) if (key in fields) fields[key] = current[key] ?? null;
    }
    const conversation = { ...current, ...fields };
    const persisted = { ...msg, contactUid: conversation.contactUid || null,
      assignedLandlordId: conversation.assignedLandlordId || null };
    const writes = [{ docPath: messagePath, fields: persisted, precondition: { exists: false } }];
    // Even when keeping the head, bind message access fields to this version.
    writes.push({ docPath: 'conversations/' + cid, fields: fields || { lastMessageAt: current.lastMessageAt },
      precondition: snapshot ? { updateTime: snapshot.updateTime } : { exists: false } });
    try {
      const committed = await fsCommit(writes);
      return { id, created: !current, conversation, messageVersion: committed.writeResults?.[0]?.updateTime };
    } catch (e) { if (!e?.conflict) throw e; }
  }
  throw new Error('message_changed_concurrently');
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
  if (body.intakeMode !== undefined && body.intakeMode !== 'backlog_review')
    return res.status(400).json({ ok: false, error: 'invalid_intake_mode' });
  const backlogReview = body.intakeMode === 'backlog_review';
  if (backlogReview && (typeof body.messageId !== 'string' || !body.messageId.trim() || body.messageId.length > 512))
    return res.status(400).json({ ok: false, error: 'backlog_message_id_required' });
  // An undated archive row must never acquire today's timestamp and replace
  // the current conversation head. Normal intake retains its optional date.
  if (backlogReview && !Number.isFinite(checkTimestamp(body.timestamp)))
    return res.status(400).json({ ok: false, error: 'invalid_timestamp' });

  const direction = body.direction;
  const documentBudget = runBudget(60_000, 6_000);
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
  let documentContact = null;

  if (!contactType || !contactId) {
    let resolved = null;
    if (contactPhone || body.phone) resolved = await resolveByPhone(body.phone || contactPhone);
    if (resolved) {
      const e = resolved.entity;
      documentContact = e;
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
  const analysis = !backlogReview && (body.analysis && typeof body.analysis === 'object') ? body.analysis : null;

  // ── Idempotency: skip if we already logged this WhatsApp message id ─────
  if (body.messageId) {
    try {
      const dup = await fsList('messages', { filter: { field: 'waMessageId', op: 'EQUAL', value: String(body.messageId) }, limit: 1 });
      if (dup && dup.length) {
        // A retry can repair the secondary case after the primary message was
        // stored. Its identity and words come only from that stored message.
        // Keep errors inside this branch: falling through would append twice.
        return res.status(200).json(await repairStoredMessage(dup[0], documentBudget));
      }
    } catch {
      if (backlogReview) return res.status(503).json({ ok: false, error: 'backlog_dedup_unavailable' });
      /* normal intake: preserve its existing best-effort fallback */
    }
  }

  // ── Read current conversation (for unread math + create flag) ───────────
  let existing = null;
  try { existing = await fsGet('conversations/' + cid); } catch { /* treat as new */ }
  let created = !existing;
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
    receivedAt: new Date(),
  };
  if (body.messageId) msg.waMessageId = String(body.messageId);
  if (backlogReview) msg.intakeMode = 'backlog_review';
  if (Array.isArray(body.mediaUrls) && body.mediaUrls.length) msg.attachments = body.mediaUrls.slice(0, 10).map(String);

  let messageId;
  let messageVersion;
  let trackedConversation = null;
  try {
    const r = await storeMessage(cid, msg, header, existing);
    if (r.stored) return res.status(200).json(await repairStoredMessage(r.stored, documentBudget));
    messageId = r.id;
    messageVersion = r.messageVersion;
    created = r.created; trackedConversation = r.conversation;
  } catch (e) {
    console.error('[homie/message] message write', e);
    return res.status(500).json({ ok: false, error: 'message_write_failed' });
  }

  await logActivity('inbox_message_' + direction, 'inbox', {
    conversationId: cid, contactType, contactId, channel,
    preview: preview(text, 60), needsReply: !!header.needsReply,
  });

  // ── IL LEAD: qui Homie smette di dover pensare. ─────────────────────────
  // Un inbound da un numero che non è già un contatto BOOM diventa un lead
  // nello schema che tutto il resto legge già — e da lì la macchina parte da
  // sola: Lead Brain (batch, con tetto) → ping Telegram col bottone WhatsApp
  // → bozza del Commerciale. Nessuna AI in più rispetto a oggi, e una in
  // meno per messaggio sul Mac.
  let leadInfo = null;
  try { if (!backlogReview) leadInfo = await syncLead({ direction, text, contactType, contactId, contactPhone, contactName, cid, existing, now, messageId: body.messageId }); }
  catch (e) { console.warn('[homie/message] lead sync:', e.message); }

  // The case remains followed when a person takes over the conversation.
  // Explicit preparation rollout may enrol a new case; this never enables
  // automatic replies. The primary message is already safely stored.
  let followUp = null;
  if (direction === 'in' || direction === 'out') {
    try {
      const tracked = await refreshTrackedFollowUp({ cid,
        conv: { ...(trackedConversation || { ...existing, ...header }), leadId: trackedConversation?.leadId || existing?.leadId || leadInfo?.leadId || null },
        direction, text, messageId: body.messageId || messageId, messageVersion, now: now.getTime(), receivedAt: msg.receivedAt.getTime(),
        preserveNewer: backlogReview });
      if (tracked) {
        followUp = { id: tracked.id, tracked: true };
        if (existing?.followUpTrackingError) await fsPatch('conversations/' + cid, { followUpTrackingError: null });
      }
    } catch {
      const error = 'Messaggio ricevuto; seguito non aggiornato. Verificare il caso in Oggi.';
      followUp = { tracked: false, error };
      await fsPatch('conversations/' + cid, { ...(backlogReview || direction !== 'in' ? {} : { needsReply: true }), followUpTrackingError: error }).catch(() => {});
      console.warn('[homie/message] follow-up tracking failed');
    }
  }

  // ── LA SEGRETARIA (STUDIO_SEGRETARIA_2026-08.md) ────────────────────────
  // Su una conversazione CONSEGNATA (il 🤖 sulla card del lead): un inbound
  // riceve il suo turno; un 'out' MANUALE dell'operatore la spegne su quella
  // chat (D4) — ma le SUE risposte tornano dal Mac proprio come 'out', e
  // senza il riconoscimento dell'eco si spegnerebbe da sola al primo turno.
  // Best-effort: un errore qui non fa mai perdere il messaggio, che è già
  // scritto sopra.
  let segretaria = null;
  try {
    if (!backlogReview && existing && existing.segretaria) {
      if (direction === 'out') {
        if (!SEG.isSegretariaEcho(existing, text, now.getTime())) {
          await segretariaOffConv(cid, 'l\'operatore ha risposto a mano');
          segretaria = { off: true };
        }
      } else if (direction === 'in' && !followUp?.error) {
        const conv = { ...existing, contactType, contactId, contactPhone: contactPhone || existing.contactPhone, contactName, leadId: existing.leadId || (leadInfo && leadInfo.leadId) || null };
        let lead = null;
        if (conv.leadId) { try { const l = await fsGet(`leads/${conv.leadId}`); if (l) lead = { id: conv.leadId, ...l }; } catch { /* non-fatal */ } }
        segretaria = await segretariaTurn({ cid, conv, lead, text, messageId: body.messageId, now: now.getTime() });
      }
    }
  } catch (e) { console.warn('[homie/message] segretaria:', e.message); }

  // Gli allegati sono secondari: messaggio, lead e turno sono già persistiti.
  if (!backlogReview && direction === 'in' && channel === 'whatsapp' && msg.attachments?.length) {
    try {
      await fileWhatsAppAttachments({ urls: msg.attachments, text, contactType, contactId,
        entity: documentContact, budget: documentBudget });
    } catch { console.warn('[homie/message] attachments: failed'); }
  }

  return res.status(200).json({ ok: true, conversationId: cid, messageId, created, ...(leadInfo || {}), ...(segretaria ? { segretaria } : {}), ...(followUp ? { followUp } : {}) });
}

async function fileWhatsAppAttachments({ urls, text, contactType, contactId, entity, budget }) {
  if (!budget.afford(45_000)) return; // download 5s + modello 20s + primo upload 20s
  // Q3: gli allegati degli altri contatti restano nel messaggio. Nemmeno
  // un indirizzo email dell'operatore trasforma WhatsApp in una porta libera.
  if (!['tenant', 'landlord'].includes(contactType)) return;
  const person = entity || await fsGet(`users/${contactId}`);
  if (!person || person.role !== contactType) return;
  const relation = documentRelation(await loadDocumentRelations(), {
    email: person.email, contactType, contactId,
  });
  if (!relation) return;
  for (const url of urls) {
    if (!budget.afford(45_000)) break;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) continue;
      const docId = 'wa_' + crypto.createHash('sha1').update(url).digest('hex');
      if (await fsGet('documents/' + docId)) continue;
      const response = await fetch(url, { signal: aiSignal(5_000), redirect: 'error' });
      if (!response.ok) throw new Error('attachment_download');
      const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(mediaType)
        || Number(response.headers.get('content-length')) > MAX_DOC_BYTES) {
        await response.body?.cancel();
        continue;
      }
      // Il Content-Length può mancare o mentire: limite anche sullo stream.
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_DOC_BYTES) throw new Error('attachment_too_large');
        chunks.push(Buffer.from(chunk));
      }
      if (!size || !budget.afford(40_000)) continue;
      let fileName = parsed.pathname.split('/').pop() || 'allegato';
      try { fileName = decodeURIComponent(fileName); } catch { /* nome grezzo: non perdere il documento */ }
      await smistaDocument({ base64: Buffer.concat(chunks).toString('base64'), mediaType,
        fileName,
        hint: text, origin: 'whatsapp', docId, relation });
    } catch { console.warn('[homie/message] attachment: failed'); }
  }
}

/**
 * Tiene allineati conversazione e pipeline. Non lancia mai verso l'alto: un
 * problema qui non deve far fallire la registrazione del messaggio, che è il
 * dato che conta.
 */
async function syncLead({ direction, text, contactType, contactId, contactPhone, contactName, cid, existing, now, messageId }) {
  // Il lead già agganciato a questa conversazione (o quello del portale/sito
  // creato pochi giorni fa dallo stesso numero: una persona, un lead).
  let leadId = (existing && existing.leadId) || null;
  if (!leadId && contactType === 'lead' && contactId) leadId = contactId;

  // ── l'operatore ha risposto a mano → il Commerciale non ci prova ────────
  // Senza questo, l'operatore risponde su WhatsApp e mezz'ora dopo il
  // Commerciale propone la SUA bozza per lo stesso lead: due voci sulla
  // stessa conversazione, ed è il tipo di figura che non si recupera.
  if (direction === 'out') {
    if (!leadId) return null;
    try {
      const lead = await fsGet(`leads/${leadId}`);
      if (lead && (lead.status === 'new' || !lead.status)) {
        await fsPatch(`leads/${leadId}`, {
          status: 'contacted',
          contactedAt: now,
          contactedBy: 'whatsapp',
        });
        return { leadId, leadStatus: 'contacted' };
      }
    } catch { /* non-fatal */ }
    return { leadId };
  }

  if (direction !== 'in') return null;

  // ── un lead che esiste già si ARRICCHISCE, non si duplica ───────────────
  if (leadId) {
    try {
      const lead = await fsGet(`leads/${leadId}`);
      if (!lead) return null;
      const patch = { lastInboundAt: now };
      if (!isNoise(text)) {
        const merged = mergeMessage(lead.message, text);
        if (merged !== lead.message) patch.message = merged;
        // la casa può emergere al terzo messaggio, non al primo
        if (!lead.propertyId) {
          const hit = matchListing(text, await loadCatalog());
          if (hit) Object.assign(patch, { propertyId: hit.id, propertyTitle: hit.name || null, propertyPrice: hit.price || null });
        }
      }
      // ha riscritto dopo che era stato chiuso: torna vivo — a meno che il
      // Brain l'avesse marcato dead (spam), che riscrive proprio perché è spam
      if (['closed', 'archived'].includes(String(lead.status || '')) && lead.grade !== 'dead') {
        patch.status = 'new';
        patch.telegramNotifiedAt = null;      // rifallo squillare: è tornato
      }
      await fsPatch(`leads/${leadId}`, patch);
      return { leadId, leadUpdated: true };
    } catch (e) {
      console.warn('[homie/message] lead enrich:', e.message);
      return null;
    }
  }

  // ── contatti già nostri: inquilini, proprietari, clienti PFS ────────────
  // Scrivono per la caldaia o per il contratto, non per affittare: la loro
  // conversazione è già visibile in Inbox e non deve inquinare la pipeline.
  if (contactType !== 'whatsapp') return null;

  // ── un lead nuovo ───────────────────────────────────────────────────────
  if (isNoise(text)) return null;                       // un 👍 non è un cliente

  const prior = await recentLeadByPhone(contactPhone, now.getTime());
  if (prior) {
    // stesso numero già in pipeline da un'altra porta (portale, form del sito)
    try {
      await fsPatch(`leads/${prior.id}`, {
        message: mergeMessage(prior.message, text),
        lastInboundAt: now,
        ...(prior.phone ? {} : { phone: contactPhone }),
      });
      await fsPatch('conversations/' + cid, { leadId: prior.id });
    } catch { /* non-fatal */ }
    return { leadId: prior.id, leadDeduped: true };
  }

  const listing = matchListing(text, await loadCatalog());
  const doc = buildLead({
    text, phone: contactPhone, name: contactName, listing,
    messageId, conversationId: cid, at: now,
  });
  const { id } = await fsCreate('leads', doc);
  // la conversazione ricorda il suo lead: i messaggi successivi lo arricchiscono
  try { await fsPatch('conversations/' + cid, { leadId: id }); } catch { /* non-fatal */ }
  await logActivity('lead_from_whatsapp', 'lead', { leadId: id, conversationId: cid, listing: doc.propertyTitle }, 'homie');
  return { leadId: id, leadCreated: true };
}
