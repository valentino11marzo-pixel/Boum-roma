// A phone callback has one authoritative source: the already saved phoneCall.
// No model, lead creation, notification or call transport belongs in this step.
import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsList, fsCreate, fsCommit } from '../homie/_lib.js';
import { normalizePhone, phoneVariants } from '../homie/_lead.js';
import { personaDossier } from './_persona.js';
import { captureFollowUp } from './_follow-up.js';

const validId = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' ? value.trim() : '';
const email = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : '';
const phone = value => {
  const p = normalizePhone(typeof value === 'string' ? value : '');
  return /^\+?[0-9]{7,15}$/.test(p) ? p : '';
};
const condition = snapshot => snapshot ? { updateTime: snapshot.updateTime } : { exists: false };
const fail = code => { const e = new Error(code); e.code = code; throw e; };

function messageSource(call, callId) {
  const at = new Date(call.createdAt || call.processedAt);
  if (!Number.isFinite(at.getTime())) fail('call_time_missing');
  const dialog = text(call.transcript);
  const callerWords = text(call.callerWords) || (call.source === 'elevenlabs' ? '' : dialog);
  return {
    direction: 'in', channel: 'phone', by: 'centralino', source: 'phone',
    phoneCallId: callId, sourceRef: 'phoneCalls/' + callId, eventId: 'phone:' + callId,
    body: dialog ? (call.source === 'elevenlabs' ? dialog : '👤 ' + dialog) : 'Chiamata senza trascrizione disponibile. Consulta la fonte.',
    callerWords: callerWords || null, analysisText: callerWords || null,
    speakerFormat: call.source === 'elevenlabs' ? 'labelled_dialogue' : 'caller_only',
    at: at.toISOString(),
  };
}

async function route(call, callId) {
  const from = phone(call.from), mail = email(call.email || call.contactEmail);
  const dossier = await personaDossier({ phone: from, email: mail,
    leadId: validId(call.leadId) ? call.leadId : undefined });
  const candidates = new Map();
  let capped = false;
  const lookups = [
    ...(from ? [{ field: 'contactPhone', op: 'IN', value: phoneVariants(from) }] : []),
    ...(mail ? [{ field: 'contactEmail', op: 'EQUAL', value: mail }] : []),
  ];
  await Promise.all(lookups.map(async filter => {
    const rows = await fsList('conversations', { filter, limit: 31 });
    if (rows.length >= 31) capped = true;
    for (const c of rows) if (validId(c.id) && c.contactType !== 'phone') candidates.set(c.id, c);
  }));
  const rows = [...candidates.values()];
  const contradicted = rows.some(c => (from && phone(c.contactPhone) && phone(c.contactPhone) !== from)
    || (mail && email(c.contactEmail) && email(c.contactEmail) !== mail));
  const ambiguous = rows.length > 1 || contradicted || dossier.identityAmbiguous;
  const incomplete = capped || dossier.identityIncomplete;
  const matched = rows.length === 1 && !ambiguous && !incomplete ? rows[0].id : null;
  // The same number reuses an intake. A caller ID is a route, never proof
  // of a person's identity or permission to disclose a contract.
  return { cid: matched || 'conv_phone_' + hash(from ? 'number:' + from : 'call:' + callId),
    matched: !!matched, from, email: mail, ambiguous, incomplete,
    candidateConversationIds: rows.map(c => c.id).sort().slice(0, 31),
    candidatePersonRefs: dossier.people.map(p => p.ref).sort(),
  };
}

async function bind(callId, source, sourceHash) {
  const receiptPath = 'heartbeat/segretaria-phone-' + hash(callId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const receipt = await fsGet(receiptPath);
    if (receipt) {
      if (receipt.phoneCallId !== callId || receipt.sourceHash !== sourceHash || !validId(receipt.conversationId)
          || receipt.messageId !== 'phone_' + hash(callId)) fail('call_binding_conflict');
      return receipt;
    }
    const snapshot = await fsGetVersioned('phoneCalls/' + callId);
    if (!snapshot?.data.processedAt) fail('call_not_processed');
    if (hash(JSON.stringify(messageSource(snapshot.data, callId))) !== sourceHash) fail('call_source_changed');
    const selection = await route(snapshot.data, callId);
    const existing = await fsGetVersioned('conversations/' + selection.cid);
    if (selection.matched && !existing) continue;
    const previous = existing?.data;
    const newer = !previous?.lastMessageAt || Date.parse(source.at) >= Date.parse(previous.lastMessageAt);
    const header = {
      needsReply: true, unread: Math.max(0, Number(previous?.unread) || 0) + 1,
      ...(newer ? { lastMessageAt: source.at, lastDirection: 'in', lastSource: 'phone',
        lastMessagePreview: (source.callerWords || 'Chiamata da verificare').replace(/\s+/g, ' ').slice(0, 90) } : {}),
      ...(previous ? {} : {
        contactType: 'phone', contactId: hash(selection.from ? 'number:' + selection.from : 'call:' + callId),
        contactName: text(snapshot.data.callerName) || 'Chiamante da verificare',
        contactPhone: selection.from, contactEmail: selection.email, contactUid: null, leadId: null,
        status: 'open', channel: 'phone', segretaria: false, createdAt: source.at,
        identityStatus: 'caller_unverified', identityAmbiguous: selection.ambiguous, identityIncomplete: selection.incomplete,
        candidateConversationIds: selection.candidateConversationIds, candidatePersonRefs: selection.candidatePersonRefs,
      }),
    };
    const fields = { phoneCallId: callId, conversationId: selection.cid,
      messageId: 'phone_' + hash(callId), sourceHash,
      candidateConversationIds: selection.candidateConversationIds, candidatePersonRefs: selection.candidatePersonRefs,
      identityAmbiguous: selection.ambiguous, identityIncomplete: selection.incomplete };
    try {
      await fsCommit([
        { docPath: receiptPath, fields, precondition: { exists: false } },
        { docPath: 'conversations/' + selection.cid, fields: header, precondition: condition(existing) },
        { docPath: 'phoneCalls/' + callId, fields: { inboxConversationId: selection.cid, inboxMessageId: fields.messageId },
          precondition: condition(snapshot) },
      ]);
      return fields;
    } catch (e) { if (!e.conflict) throw e; }
  }
  fail('call_binding_busy');
}

/** Best-effort secondary intake. The original phoneCall never fails with it. */
export async function syncCallCase(callId) {
  if (!validId(callId)) return { ok: false, error: 'invalid_phone_call' };
  try {
    const call = await fsGet('phoneCalls/' + callId);
    if (!call?.processedAt) return { ok: true, skipped: 'call_not_processed' };
    const source = messageSource(call, callId), sourceHash = hash(JSON.stringify(source));
    const binding = await bind(callId, source, sourceHash);
    const msg = { ...source, conversationId: binding.conversationId,
      candidateConversationIds: binding.candidateConversationIds, candidatePersonRefs: binding.candidatePersonRefs,
      identityAmbiguous: binding.identityAmbiguous, identityIncomplete: binding.identityIncomplete };
    try { await fsCreate('messages', msg, binding.messageId); }
    catch (e) {
      if (!e.exists) throw e;
      const prior = await fsGet('messages/' + binding.messageId);
      if (!prior || Object.keys(msg).some(key => JSON.stringify(prior[key]) !== JSON.stringify(msg[key]))) fail('call_message_conflict');
    }
    const conv = await fsGet('conversations/' + binding.conversationId);
    if (!conv) fail('call_conversation_missing');
    const task = await captureFollowUp({ cid: binding.conversationId, conv,
      messageId: source.eventId, text: source.callerWords || '', now: Date.parse(source.at) });
    if (!task) fail('call_follow_up_missing');
    if (call.followUpError) await fsCommit([{ docPath: 'phoneCalls/' + callId,
      fields: { followUpError: null }, precondition: { exists: true } }]);
    return { ok: true, conversationId: binding.conversationId, messageId: binding.messageId, taskId: task.id };
  } catch {
    const error = 'Chiamata registrata; richiesta non collegata alla Segreteria. Riprovare o verificare in Oggi.';
    // A failed read must never create a phantom phoneCall just to record an error.
    await fsCommit([{ docPath: 'phoneCalls/' + callId,
      fields: { followUpError: error }, precondition: { exists: true } }]).catch(() => {});
    return { ok: false, error };
  }
}
