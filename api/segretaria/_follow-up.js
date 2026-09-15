// Operational follow-up lives in the existing operatorTasks collection.
// Reading a conversation or sending a reply never fulfils an obligation.
import crypto from 'node:crypto';
import { fsGet, fsList, fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { romeDateKey } from '../viewings/_avail.js';

export const FOLLOW_UP_LIMIT = 200;
const idPart = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value);
const clean = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const inputText = (value, max) => typeof value === 'string' && value.length <= max ? clean(value, max) : '';
export const followUpId = (cid, event) => 'sg_' + crypto.createHash('sha256').update(JSON.stringify([cid, event])).digest('hex').slice(0, 32);
// Bind a preparation to the operator's existing decision, not only its message.
export const followUpDecisionHash = f => crypto.createHash('sha256').update(JSON.stringify({
  nextAction: f?.nextAction || null, waitingOn: f?.waitingOn || null, waitingLabel: f?.waitingLabel || null,
  checkAt: f?.checkAt || null, practiceRef: f?.practiceRef || null, propertyRef: f?.propertyRef || null,
  confirmed: f?.confirmed === true, needsReview: f?.needsReview === true,
  confirmedAt: f?.confirmedAt || null, confirmedBy: f?.confirmedBy || null,
})).digest('hex');
const precondition = snapshot => snapshot ? { updateTime: snapshot.updateTime } : { exists: false };

// Tracking survives manual takeover. New enrolment is an explicit preparation
// rollout, independent of automatic replies; old imports stay out of the rollout.
export async function refreshTrackedFollowUp(input) {
  if (!idPart(input?.cid)) return null;
  const cursor = await fsGet('heartbeat/segretaria-case-' + followUpId(input.cid, 'cursor').slice(3));
  if (cursor) return captureFollowUp(input);
  const config = await fsGet('settings/segretaria');
  const since = checkTimestamp(config?.prepareSince);
  const receivedAt = input.receivedAt ?? input.now;
  if (config?.enabled === false || config?.prepareCases !== true || !Number.isFinite(since)
    || !Number.isFinite(receivedAt) || receivedAt < since) return null;
  return captureFollowUp(input);
}

// Require an explicit timezone and a real calendar date (Date.parse alone
// accepts and normalizes February 30, making an operator's date untrue).
export function checkTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1
      || +m[3] > new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
      || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return NaN;
  return Date.parse(value);
}

export async function captureFollowUp({ cid, conv, messageId, text, now = Date.now() }) {
  if (!idPart(cid) || typeof messageId !== 'string' || !messageId.trim() || messageId.length > 512) return null;
  const event = messageId;
  const receiptPath = 'heartbeat/segretaria-event-' + followUpId(cid, event).slice(3);
  const cursorPath = 'heartbeat/segretaria-case-' + followUpId(cid, 'cursor').slice(3);
  // Event receipts, the conversation cursor and the card commit together.
  // The cursor serializes simultaneous different events; permanent receipts
  // also stop an older retry rolling a newer message or a closed card back.
  for (let attempt = 0; attempt < 3; attempt++) {
    const receipt = await fsGet(receiptPath);
    if (receipt) return fsGet('operatorTasks/' + receipt.taskId);
    const cursor = await fsGetVersioned(cursorPath);
    // One open case is the current context, but a new message still needs review.
    // With multiple cases we create an unassigned intake; no practice is guessed.
    const known = await fsList('operatorTasks', {
      filter: { field: 'followUp.conversationId', op: 'EQUAL', value: cid }, limit: 30,
    });
    const active = known.filter(t => t.status === 'open' && t.followUp);
    const at = new Date(now).toISOString();
    let current = null;
    if (active.length === 1 && known.length < 30) {
      current = await fsGetVersioned('operatorTasks/' + active[0].id);
      if (!current || current.data.status !== 'open') continue;
    }
    const id = current ? current.data.id : followUpId(cid, event);
    const checkAt = new Date(now + 2 * 3600000).toISOString();
    const row = {
      title: 'Seguire ' + clean(conv?.contactName || 'la richiesta', 100),
      due: romeDateKey(new Date(checkAt)), dueTime: null, status: 'open', kind: 'auto',
      source: 'segretaria', calendarize: false, createdAt: new Date(now), createdBy: 'segretaria',
      followUp: { open: true, conversationId: cid, contactName: clean(conv?.contactName, 100),
        lastMessageId: event, lastInboundAt: at, preview: clean(text, 240),
        practiceRef: null, propertyRef: null, nextAction: 'Verificare la richiesta e confermare il seguito',
        waitingOn: 'valentino', waitingLabel: 'Valentino', checkAt,
        checkBasis: 'proposta interna: due ore dalla ricezione, nessun orario promesso al cliente',
        confirmed: false, needsReview: true, ambiguous: active.length > 1 || known.length >= 30 },
    };
    const fields = current ? {
      followUp: { ...current.data.followUp, lastMessageId: event, lastInboundAt: at,
        preview: clean(text, 240), needsReview: true }, updatedAt: new Date(now),
    } : row;
    try {
      await fsCommit([
        { docPath: receiptPath, fields: { taskId: id, at }, precondition: { exists: false } },
        { docPath: cursorPath, fields: { taskId: id, at }, precondition: precondition(cursor) },
        { docPath: 'operatorTasks/' + id, fields, precondition: precondition(current) },
      ]);
      return { ...(current?.data || {}), id, ...fields };
    }
    catch (e) {
      if (!e?.conflict) throw e;
    }
  }
  throw new Error('Follow-up changed concurrently');
}

export async function listFollowUps() {
  const rows = await fsList('operatorTasks', { filter: { field: 'followUp.open', op: 'EQUAL', value: true }, limit: FOLLOW_UP_LIMIT });
  return { rows: rows.filter(t => t.status === 'open' && t.followUp)
    .sort((a, b) => String(a.followUp.checkAt).localeCompare(String(b.followUp.checkAt))),
  incomplete: rows.length >= FOLLOW_UP_LIMIT };
}

export async function updateFollowUp({ id, input, actor, dossier, now = Date.now() }) {
  if (!/^sg_[a-f0-9]{32}$/.test(String(id || ''))) return { code: 400, error: 'invalid_case' };
  const snapshot = await fsGetVersioned('operatorTasks/' + id);
  const cur = snapshot?.data;
  if (!cur?.followUp || cur.source !== 'segretaria') return { code: 404, error: 'case_not_found' };
  if (cur.status !== 'open') return { code: 409, error: 'case_closed' };
  if (input.lastMessageId !== cur.followUp.lastMessageId) return { code: 409, error: 'new_message_reload' };
  if (input.op === 'close') {
    const outcome = inputText(input.outcome, 500);
    if (!outcome) return { code: 400, error: 'outcome_required' };
    try { await fsCommit([{ docPath: 'operatorTasks/' + id, precondition: precondition(snapshot),
      fields: { status: 'done', doneAt: new Date(now), doneVia: 'segretaria',
        followUp: { ...cur.followUp, open: false, outcome, closedBy: actor, needsReview: false } } }]); }
    catch (e) { if (e.conflict) return { code: 409, error: 'new_message_reload' }; throw e; }
    return { code: 200, id, closed: true };
  }
  if (input.op !== 'confirm') return { code: 400, error: 'unknown_operation' };
  const nextAction = inputText(input.nextAction, 240);
  const waitingLabel = inputText(input.waitingLabel, 100);
  const waitingOn = input.waitingOn;
  const checkTime = checkTimestamp(input.checkAt);
  if (!nextAction || !['valentino', 'client', 'collaborator', 'boom'].includes(waitingOn)
      || !waitingLabel || !Number.isFinite(checkTime) || checkTime <= now
      || checkTime > now + 365 * 86400000) return { code: 400, error: 'invalid_follow_up' };
  const practiceRef = input.practiceRef || null;
  const practice = practiceRef && dossier?.practices?.find(p => p.ref === practiceRef);
  if (practiceRef && (!practice || dossier.identityIncomplete || dossier.identityAmbiguous))
    return { code: 409, error: 'practice_not_verified' };
  // A missing selection remains explicit, even when only one candidate exists.
  const followUp = { ...cur.followUp, practiceRef, propertyRef: practice?.propertyRefs?.length === 1 ? practice.propertyRefs[0] : null,
    nextAction, waitingOn, waitingLabel, checkAt: new Date(checkTime).toISOString(), checkBasis: 'confermato dall’operatore',
    confirmed: !!practiceRef, ambiguous: !practiceRef, needsReview: !practiceRef,
    confirmedAt: new Date(now).toISOString(), confirmedBy: actor };
  try { await fsCommit([{ docPath: 'operatorTasks/' + id, precondition: precondition(snapshot),
    fields: { followUp, due: romeDateKey(new Date(checkTime)), updatedAt: new Date(now) } }]); }
  catch (e) { if (e.conflict) return { code: 409, error: 'new_message_reload' }; throw e; }
  return { code: 200, id, followUp };
}
