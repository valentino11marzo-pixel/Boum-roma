// New Segreteria proposals carry their approval proof on the existing action.
// A dispatch claim is permanent: an uncertain external effect is never retried.
import crypto from 'node:crypto';
import { fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { personaDossier } from './_persona.js';
import { loadCaseContext, contextFingerprint, contactFingerprint } from './_context.js';
import { normalizePhone } from '../homie/_lead.js';
import { followUpDecisionHash } from './_follow-up.js';
import { replyOwner } from './_reply-owner.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const executionPayloadHash = action => hash({ kind: action.kind, leadId: action.leadId || null, payload: action.payload });
export const preparationContentHash = preparation => hash(Object.fromEntries(Object.entries(preparation || {}).filter(([key]) => key !== 'approval')));
export const followUpInputHash = followUp => hash({ conversationId: followUp?.conversationId,
  lastMessageId: followUp?.lastMessageId, lastInboundAt: followUp?.lastInboundAt, preview: followUp?.preview,
  decisionHash: followUpDecisionHash(followUp) });
const denied = error => ({ allowed: false, code: 409, error });

export function segretariaApprovalProblem(action, override) {
  if (override !== undefined && override !== null) return denied('segretaria_override_requires_review');
  const s = action?.segretaria;
  if (!s || action.proposedBy !== 'segretaria-proposal' || action.kind !== 'reply') return denied('segretaria_approval_missing');
  if (!/^sg_[a-f0-9]{32}$/.test(s.caseId || '') || !s.reviewedBy || !s.reviewedAt
      || !s.proposalRevision || s.reviewedRevision !== s.proposalRevision
      || s.payloadHash !== s.reviewedPayloadHash || executionPayloadHash(action) !== s.payloadHash)
    return denied('segretaria_approval_mismatch');
  return null;
}

export async function loadReviewedSegretariaContext({ id, action, now = Date.now() }) {
  const s = action.segretaria;
  const [queue, task] = await Promise.all([fsGetVersioned('action_queue/' + id), fsGetVersioned('operatorTasks/' + s.caseId)]);
  if (!queue || executionPayloadHash(queue.data) !== s.payloadHash
      || hash(queue.data.segretaria) !== hash(s)) return denied('segretaria_action_changed');
  const t = task?.data, p = t?.preparation, receipt = p?.approval;
  if (!t || t.source !== 'segretaria' || t.status !== 'open' || t.followUp?.open === false
      || t.followUp.conversationId !== s.conversationId || t.followUp.lastMessageId !== s.sourceMessageId
      || p?.revision !== s.proposalRevision || p.messageId !== s.sourceMessageId || p.status !== 'ready' || !PROPOSTA.contextCurrent(t)
      || followUpInputHash(t.followUp) !== s.inputHash
      || preparationContentHash(p) !== s.preparationHash
      || receipt?.actionId !== id || receipt.revision !== s.proposalRevision
      || receipt.messageId !== s.sourceMessageId || receipt.payloadHash !== s.payloadHash
      || receipt.approvedBy !== s.reviewedBy || receipt.approvedAt !== s.reviewedAt)
    return denied('segretaria_context_changed');
  const conversation = await fsGetVersioned('conversations/' + s.conversationId), conv = conversation?.data;
  if (!conv) return denied('segretaria_context_changed');
  const ownership = await replyOwner(conv, { excludeActionId: id });
  if (ownership.blocked) return denied(ownership.incomplete ? 'reply_context_incomplete' : 'reply_already_managed');
  if (!s.contactFingerprint || contactFingerprint(conv) !== s.contactFingerprint) return denied('segretaria_recipient_changed');
  const dossier = await personaDossier({ phone: conv.contactPhone, email: conv.contactEmail,
    leadId: conv.leadId || (conv.contactType === 'lead' ? conv.contactId : undefined), conversationId: s.conversationId });
  if (conv.conversationBindingConflict) return denied('segretaria_conversation_binding_conflict');
  if (dossier.identityIncomplete || dossier.identityAmbiguous || conv.identityStatus === 'ambiguous')
    return denied('segretaria_identity_changed');
  const recipientMatches = action.payload.channel === 'whatsapp'
    ? normalizePhone(conv.contactPhone) === action.payload.phone
    : typeof conv.contactEmail === 'string' && conv.contactEmail.trim().toLowerCase() === action.payload.to;
  if (!recipientMatches) return denied('segretaria_recipient_changed');
  const context = await loadCaseContext({ task: t, conversation: conv, dossier, now });
  if (!s.sourceFingerprint || contextFingerprint(context) !== s.sourceFingerprint)
    return denied('segretaria_sources_changed');
  return { allowed: true, queue, task, conversation };
}

export async function claimSegretariaExecution({ id, action, override, now = Date.now() }) {
  const problem = segretariaApprovalProblem(action, override);
  if (problem) return problem;
  const s = action.segretaria;
  if (['executed', 'rejected'].includes(action.status)) return { allowed: false, cached: true, code: 200,
    status: action.status, result: action.executionResult || null };
  if (action.status !== 'approved') return denied('segretaria_not_approved');
  try {
    const checked = await loadReviewedSegretariaContext({ id, action, now });
    if (!checked.allowed) return checked;
    const { queue, task, conversation } = checked;
    if (queue.data.status !== 'approved' || s.execution) return denied('segretaria_execution_needs_review');
    await fsCommit([
      // Empty masks preserve stored values while checking the same versions.
      // An inbound racing with the claim wins or loses atomically, never hides.
      { docPath: 'operatorTasks/' + s.caseId, fields: {}, precondition: { updateTime: task.updateTime } },
      { docPath: 'conversations/' + s.conversationId, fields: {}, precondition: { updateTime: conversation.updateTime } },
      { docPath: 'action_queue/' + id, fields: { segretaria: { ...s,
        execution: { state: 'started', at: new Date(now).toISOString() } } }, precondition: { updateTime: queue.updateTime } },
    ]);
    return { allowed: true };
  } catch (e) {
    return { allowed: false, code: e?.conflict ? 409 : 503,
      error: e?.conflict ? 'segretaria_context_changed' : 'segretaria_execution_unavailable' };
  }
}
