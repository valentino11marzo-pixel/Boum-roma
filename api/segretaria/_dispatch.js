// Confirmation is the only bridge from a prepared case to action_queue.
// Recipient, identity and practice come from current records, never the model.
import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { normalizePhone } from '../homie/_lead.js';
import { runExecutor } from '../employees/_fiducia.js';
import { romeDateKey } from '../viewings/_avail.js';
import { personaDossier } from './_persona.js';
import { loadCaseContext, contextFingerprint, contactFingerprint } from './_context.js';
import { checkTimestamp, followUpDecisionHash } from './_follow-up.js';
import { executionPayloadHash, followUpInputHash, preparationContentHash } from './_execution-guard.js';
import { replyOwner } from './_reply-owner.js';

const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : '';
const email = value => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim()) ? value.trim().toLowerCase() : '';
const phone = value => /^\+[1-9]\d{6,14}$/.test(normalizePhone(value)) ? normalizePhone(value) : '';
const validRef = ref => /^(users|landlords|clients|pfsClients|leads)\/[\w.-]{1,180}$/.test(ref || '');
const stableId = (id, revision, messageId) => 'sgreply_' + crypto.createHash('sha256')
  .update(JSON.stringify([id, revision, messageId, 'reply'])).digest('hex').slice(0, 40);
const sourceRefs = sources => (Array.isArray(sources) ? sources : []).slice(0, 40).map(s => ({
  ref: text(s?.ref, 240), at: text(s?.at, 80) || null,
  hash: typeof s?.text === 'string' ? crypto.createHash('sha256').update(s.text).digest('hex') : null,
})).filter(s => s.ref); // No source prose or file contents copied into the action.

export async function readPreparationDelivery(id, actionId, cached = false) {
  if (!actionId) return { code: 200, id, confirmed: true, delivery: 'follow_up_only', cached };
  const a = await fsGet('action_queue/' + actionId);
  const base = { id, actionId, confirmed: true, cached };
  if (!a) return { ...base, code: 503, error: 'approved_action_missing', delivery: 'needs_review' };
  if (a.status === 'executed') {
    if (a.payload?.channel === 'whatsapp' && a.segretariaDeliveryBlock && !a.segretaria?.delivery && !a.waSentAt)
      return { ...base, code: 409, error: a.segretariaDeliveryBlock.reason || 'whatsapp_delivery_blocked', delivery: 'needs_review' };
    if (a.payload?.channel === 'whatsapp' && a.segretaria?.delivery?.state === 'claimed' && !a.waSentAt
        && Date.now() - Date.parse(a.segretaria.delivery.claimedAt) > 120000)
      return { ...base, code: 409, error: 'whatsapp_delivery_unconfirmed', delivery: 'needs_review' };
    if (a.payload?.channel === 'whatsapp') return { ...base, code: 200,
      delivery: a.waSentAt ? 'sent' : a.waSendError ? 'needs_review' : 'queued',
      ...(a.waSendError ? { error: 'whatsapp_delivery_needs_review' } : {}) };
    if (a.executionResult?.email?.sent) return { ...base, code: 200, delivery: 'sent' };
  }
  if (a.status === 'approved' && !a.segretaria?.execution) return { ...base, code: 202, delivery: 'pending_execution' };
  return { ...base, code: 409, error: 'execution_needs_review', delivery: 'needs_review' };
}

async function dispatchApproved(id, actionId, cached = false) {
  const state = await readPreparationDelivery(id, actionId, cached);
  if (state.delivery !== 'pending_execution') return state;
  // The executor claims once, verifies the exact approval and forbids overrides.
  let result;
  try { result = await runExecutor(actionId); } catch { /* committed confirmation survives */ }
  try {
    const after = await readPreparationDelivery(id, actionId, cached);
    if (after.delivery === 'pending_execution' && result?.status >= 400) return { ...after,
      code: result.status, error: result.body?.error || 'execution_unavailable',
      delivery: result.status === 409 ? 'needs_review' : 'pending_execution' };
    return after;
  }
  catch { return { code: 503, id, actionId, confirmed: true, delivery: 'needs_review', error: 'execution_state_unavailable' }; }
}

/** actor must come from the authenticated operator endpoint, never request JSON. */
export async function approvePreparation({ id, revision, lastMessageId, actor, now = Date.now() }) {
  if (!/^sg_[a-f0-9]{32}$/.test(id || '') || !text(revision, 200) || !text(lastMessageId, 512) || !text(actor, 200))
    return { code: 400, id, error: 'invalid_approval' };
  let committed = false, actionId = null;
  try {
    const snapshot = await fsGetVersioned('operatorTasks/' + id), task = snapshot?.data;
    if (!task?.followUp || task.source !== 'segretaria') return { code: 404, id, error: 'case_not_found' };
    if (task.status !== 'open' || task.followUp.open === false) return { code: 409, id, error: 'case_closed' };
    const p = task.preparation, f = task.followUp;
    if (lastMessageId !== f.lastMessageId || p?.messageId !== lastMessageId) return { code: 409, id, error: 'new_message_reload' };
    if (p?.revision !== revision) return { code: 409, id, error: 'preparation_changed' };
    if (p.status !== 'ready') return { code: 409, id, error: 'preparation_needs_context' };
    if ((p.approval?.followUpFingerprint || p.followUpFingerprint) !== followUpDecisionHash(f))
      return { code: 409, id, error: 'follow_up_changed_reload' };
    if (p.approval) {
      if (p.approval.revision !== revision || p.approval.messageId !== lastMessageId)
        return { code: 409, id, error: 'approval_mismatch' };
      committed = true; actionId = p.approval.actionId;
      return await dispatchApproved(id, actionId, true);
    }
    if (!/^[\w.-]{1,180}$/.test(f.conversationId || '')) return { code: 409, id, error: 'conversation_missing' };
    const conversation = await fsGetVersioned('conversations/' + f.conversationId), conv = conversation?.data;
    if (!conv) return { code: 409, id, error: 'conversation_missing' };
    if (!p.contactFingerprint || contactFingerprint(conv) !== p.contactFingerprint)
      return { code: 409, id, error: 'contact_changed' };
    const dossier = await personaDossier({ phone: conv.contactPhone, email: conv.contactEmail,
      leadId: conv.leadId || (conv.contactType === 'lead' ? conv.contactId : undefined), conversationId: f.conversationId });
    const n = p.nextAction, checkTime = checkTimestamp(n?.checkAt);
    if (!text(n?.text, 240) || !text(n?.waitingLabel, 100)
        || !['valentino', 'client', 'collaborator', 'boom'].includes(n?.waitingOn)
        || !Number.isFinite(checkTime) || checkTime <= now || checkTime > now + 365 * 86400000)
      return { code: 400, id, error: 'invalid_prepared_follow_up' };
    const blocked = p.identityBlocked || dossier.identityIncomplete || dossier.identityAmbiguous || conv.identityStatus === 'ambiguous';
    const practiceRef = n.practiceRef || null, practice = dossier.practices.find(row => row.ref === practiceRef);
    if (blocked && (p.draft || practiceRef)) return { code: 409, id,
      error: dossier.identityAmbiguous ? 'identity_ambiguous' : 'identity_not_verified' };
    if (practiceRef && !practice) return { code: 409, id, error: 'practice_not_verified' };
    const context = await loadCaseContext({ task, conversation: conv, dossier, now });
    if (!context.coverage?.lastEvent?.present || !p.sourceFingerprint || contextFingerprint(context) !== p.sourceFingerprint)
      return { code: 409, id, error: 'preparation_sources_changed' };
    let payload = null, contactProof = null;
    if (p.draft) {
      const ownership = await replyOwner(conv, { excludeActionId: p.approval?.actionId });
      if (ownership.blocked) return { code: 409, id, error: ownership.incomplete ? 'reply_context_incomplete' : 'reply_already_managed' };
      if (!practice) return { code: 409, id, error: 'practice_selection_required' };
      const d = p.draft;
      if (!['whatsapp', 'email'].includes(d.channel) || !text(d.text, d.channel === 'whatsapp' ? 2000 : 6000)
          || (d.channel === 'email' && (!text(d.subject, 180) || /[\r\n]/.test(d.subject))))
        return { code: 400, id, error: 'invalid_prepared_draft' };
      const recipient = d.channel === 'whatsapp' ? phone(conv.contactPhone) : email(conv.contactEmail);
      if (!recipient) return { code: 409, id, error: 'recipient_missing' };
      const previewRecipient = d.channel === 'whatsapp' ? phone(p.recipientPreview?.address) : email(p.recipientPreview?.address);
      if (p.recipientPreview?.channel !== d.channel || previewRecipient !== recipient)
        return { code: 409, id, error: 'contact_changed' };
      // A persisted conversation + a matching, dossier-related person are required.
      for (const person of dossier.people.filter(row => validRef(row.ref)).slice(0, 12)) {
        const version = await fsGetVersioned(person.ref), row = version?.data;
        const values = d.channel === 'whatsapp' ? [row?.phone, row?.contactPhone, row?.whatsapp].map(phone)
          : [row?.email, row?.contactEmail].map(email);
        if (values.includes(recipient)) { contactProof = { ref: person.ref, ...version }; break; }
      }
      if (!contactProof) return { code: 409, id, error: 'recipient_not_verified' };
      payload = { channel: d.channel, draft: d.text.trim(), conversationId: f.conversationId,
        ...(d.channel === 'whatsapp' ? { phone: recipient } : { to: recipient, subject: d.subject.trim() }) };
      actionId = stableId(id, revision, lastMessageId);
    }
    const at = new Date(now).toISOString();
    const followUp = { ...f, practiceRef, propertyRef: practice?.propertyRefs?.length === 1 ? practice.propertyRefs[0] : null,
      nextAction: n.text.trim(), waitingOn: n.waitingOn, waitingLabel: n.waitingLabel.trim(), checkAt: new Date(checkTime).toISOString(),
      checkBasis: 'proposta approvata dall’operatore', confirmed: !!practiceRef, ambiguous: !practiceRef,
      needsReview: !practiceRef, confirmedAt: at, confirmedBy: actor };
    const action = payload ? { kind: 'reply', leadId: dossier.people.some(row => row.ref === 'leads/' + conv.leadId) ? conv.leadId : null,
      summary: text(p.summary, 240) || 'Risposta preparata dalla Segreteria', tier: 2, confidence: 0,
      proposedBy: 'segretaria-proposal', payload, contextHash: 'segretaria:proposal:' + actionId,
      status: 'approved', autoApplied: false, approvedBy: actor, approvedAt: new Date(now), createdAt: new Date(now), proposedAt: new Date(now) } : null;
    const payloadHash = action ? executionPayloadHash(action) : null;
    const preparation = { ...p, approval: { revision, messageId: lastMessageId, actionId, approvedBy: actor, approvedAt: at, payloadHash,
      followUpFingerprint: followUpDecisionHash(followUp) } };
    const operations = [{ docPath: 'operatorTasks/' + id, fields: { preparation, followUp,
      due: romeDateKey(new Date(checkTime)), updatedAt: new Date(now) }, precondition: { updateTime: snapshot.updateTime } }];
    if (action) {
      action.segretaria = { caseId: id, conversationId: f.conversationId, sourceMessageId: lastMessageId,
        proposalRevision: revision, reviewedRevision: revision, payloadHash, reviewedPayloadHash: payloadHash,
        reviewedBy: actor, reviewedAt: at, inputHash: followUpInputHash(followUp), preparationHash: preparationContentHash(p),
        sourceFingerprint: p.sourceFingerprint, contactFingerprint: p.contactFingerprint,
        sourceIds: [...new Set([...(n.sourceIds || []), ...(p.draft.sourceIds || [])])].filter(x => text(x, 180)).slice(0, 40),
        sources: sourceRefs(context.sources) };
      operations.push({ docPath: 'action_queue/' + actionId, fields: action, precondition: { exists: false } });
      // Exact contact records cannot change between verification and approval.
      operations.push({ docPath: 'conversations/' + f.conversationId, fields: { contactPhone: conv.contactPhone || null,
        contactEmail: conv.contactEmail || null }, precondition: { updateTime: conversation.updateTime } });
      const proofField = payload.channel === 'whatsapp' ? ['phone', 'contactPhone', 'whatsapp'].find(k => phone(contactProof.data[k]) === payload.phone)
        : ['email', 'contactEmail'].find(k => email(contactProof.data[k]) === payload.to);
      operations.push({ docPath: contactProof.ref, fields: { [proofField]: contactProof.data[proofField] }, precondition: { updateTime: contactProof.updateTime } });
    }
    try { await fsCommit(operations); committed = true; }
    catch (e) {
      if (!e?.conflict) throw e;
      const fresh = await fsGet('operatorTasks/' + id);
      if (fresh?.preparation?.approval?.revision === revision && fresh.followUp?.lastMessageId === lastMessageId) {
        committed = true; actionId = fresh.preparation.approval.actionId;
        return await dispatchApproved(id, actionId, true);
      }
      return { code: 409, id, error: 'approval_changed_reload' };
    }
    return await dispatchApproved(id, actionId);
  } catch {
    return { code: 503, id, ...(committed ? { confirmed: true, actionId, delivery: 'needs_review' } : {}), error: 'approval_unavailable' };
  }
}
