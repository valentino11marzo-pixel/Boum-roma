// One server-side pickup, permanently claimed before returning text to the Mac.
// No acknowledgement means unknown outcome, never an automatic second pickup.
import { fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { whatsappDeliveryWindow } from '../homie/_wa-delivery.js';
import { segretariaApprovalProblem, loadReviewedSegretariaContext, preparationContentHash } from './_execution-guard.js';

const deny = error => ({ allowed: false, code: 409, error });
export const isPreparedAction = action => !!action?.segretaria || action?.proposedBy === 'segretaria-proposal';

// Only this claim-before-payload protocol proves that an unclaimed message
// never left the server. Match the old approval, even after a newer inbound.
export function canExpireUnclaimedSegretariaDelivery({ id, action, task, now = Date.now(), allowClosed = false }) {
  if (!/^sgreply_[a-f0-9]{40}$/.test(id || '') || segretariaApprovalProblem(action)
      || action.status !== 'executed' || action.payload?.channel !== 'whatsapp'
      || action.segretaria.execution?.state !== 'started' || action.segretaria.delivery
      || action.waSentAt || action.waSendError || action.waSendAttemptAt
      || whatsappDeliveryWindow(action, now) !== 'expired') return false;
  const s = action.segretaria, p = task?.preparation, receipt = p?.approval;
  const eligibleCase = task?.status === 'open' && task.followUp?.open === true
    || allowClosed && task?.status === 'done' && task.followUp?.open === false;
  return task?.source === 'segretaria' && eligibleCase
    && task.id === s.caseId && task.followUp.conversationId === s.conversationId
    && p?.revision === s.proposalRevision && p.messageId === s.sourceMessageId
    && preparationContentHash(p) === s.preparationHash
    && receipt?.actionId === id && receipt.revision === s.proposalRevision
    && receipt.messageId === s.sourceMessageId && receipt.payloadHash === s.payloadHash
    && receipt.approvedBy === s.reviewedBy && receipt.approvedAt === s.reviewedAt;
}

// A refused pickup is a reviewable block, never evidence of a failed send.
export async function markSegretariaDeliveryBlocked({ id, reason, now = Date.now() }) {
  try {
    const snapshot = await fsGetVersioned('action_queue/' + id), current = snapshot?.data;
    if (!isPreparedAction(current) || current.status !== 'executed' || current.segretaria?.delivery
        || current.waSentAt || current.waSendError) return { marked: false };
    const safeReason = typeof reason === 'string' && /^[a-z_]{1,80}$/.test(reason) ? reason : 'delivery_unavailable';
    if (current.segretariaDeliveryBlock?.reason === safeReason) return { marked: true };
    await fsCommit([{ docPath: 'action_queue/' + id,
      fields: { segretariaDeliveryBlock: { at: new Date(now).toISOString(), reason: safeReason } },
      precondition: { updateTime: snapshot.updateTime } }]);
    return { marked: true };
  } catch (e) {
    // A competing pickup or receipt wins. Never replace it with this marker.
    if (e?.conflict) return { marked: false };
    throw e;
  }
}

export async function claimSegretariaDelivery({ id, action, now = Date.now() }) {
  const problem = segretariaApprovalProblem(action);
  if (problem) return problem;
  if (action.status !== 'executed' || action.payload?.channel !== 'whatsapp'
      || action.segretaria.execution?.state !== 'started') return deny('delivery_not_ready');
  if (action.waSentAt || action.waSendError || action.segretaria.delivery) return deny('delivery_already_claimed');
  try {
    const checked = await loadReviewedSegretariaContext({ id, action, now });
    if (!checked.allowed) return checked;
    const { queue, task, conversation } = checked, current = queue.data;
    if (current.status !== 'executed' || current.waSentAt || current.waSendError || current.segretaria.delivery)
      return deny('delivery_already_claimed');
    // Context reads can cross the pickup deadline: check the actual clock here.
    const claimNow = Math.max(now, Date.now()), window = whatsappDeliveryWindow(current, claimNow);
    if (window !== 'current') return deny(window === 'expired' ? 'whatsapp_delivery_expired' : 'whatsapp_delivery_time_invalid');
    const conv = conversation.data;
    await fsCommit([
      { docPath: 'operatorTasks/' + action.segretaria.caseId, fields: { preparation: task.data.preparation },
        precondition: { updateTime: task.updateTime } },
      { docPath: 'conversations/' + action.segretaria.conversationId,
        fields: { contactPhone: conv.contactPhone || null, contactEmail: conv.contactEmail || null },
        precondition: { updateTime: conversation.updateTime } },
      { docPath: 'action_queue/' + id, fields: { segretariaDeliveryBlock: null, segretaria: { ...current.segretaria,
        delivery: { state: 'claimed', claimedAt: new Date(claimNow).toISOString() } } },
        precondition: { updateTime: queue.updateTime } },
    ]);
    return { allowed: true };
  } catch (e) {
    return { allowed: false, code: e?.conflict ? 409 : 503,
      error: e?.conflict ? 'delivery_changed' : 'delivery_unavailable' };
  }
}

export async function acknowledgeSegretariaDelivery({ id, ok, error, now = Date.now() }) {
  if (!/^sgreply_[a-f0-9]{40}$/.test(id || '') || typeof ok !== 'boolean')
    return { code: 400, error: 'invalid_delivery_ack' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await fsGetVersioned('action_queue/' + id), a = snapshot?.data;
    if (!a || !isPreparedAction(a)) return { code: 404, error: 'delivery_action_missing' };
    const receipt = a.segretaria?.delivery;
    if (a.status !== 'executed' || !receipt?.claimedAt) return { code: 409, error: 'delivery_not_claimed' };
    if (['sent', 'failed'].includes(receipt.state)) return receipt.state === (ok ? 'sent' : 'failed')
      ? { code: 200, cached: true, delivery: receipt.state }
      : { code: 409, error: 'delivery_outcome_already_recorded', delivery: receipt.state };
    if (receipt.state !== 'claimed') return { code: 409, error: 'delivery_not_claimed' };
    // Do not erase a separately recorded outcome (e.g. manual delivery).
    if (a.waSentAt || a.waSendError) return { code: 409, error: 'delivery_outcome_already_recorded' };
    const at = new Date(now), state = ok ? 'sent' : 'failed';
    const fields = { segretaria: { ...a.segretaria, delivery: { ...receipt, state, acknowledgedAt: at.toISOString() } },
      ...(ok ? { waSentAt: at, waSentBy: 'homie-wacli', waSendError: null }
        : { waSendError: String(error || 'send failed').slice(0, 200), waSendAttemptAt: at }) };
    try {
      await fsCommit([{ docPath: 'action_queue/' + id, fields, precondition: { updateTime: snapshot.updateTime } }]);
      return { code: 200, cached: false, delivery: state };
    } catch (e) {
      if (!e?.conflict) return { code: 503, error: 'delivery_ack_unavailable' };
    }
  }
  return { code: 409, error: 'delivery_ack_changed' };
}
