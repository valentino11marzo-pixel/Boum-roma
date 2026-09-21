// Operational follow-up lives in the existing operatorTasks collection.
// Reading a conversation or sending a reply never fulfils an obligation.
import crypto from 'node:crypto';
import { fsGet, fsList, fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { romeDateKey } from '../viewings/_avail.js';
import INTAKE from '../../js/segretaria-intake-engine.js';
import PRIORITY from '../../js/segretaria-priority-engine.js';

export const FOLLOW_UP_LIMIT = 200;
export const validFollowUpCursor = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value) && !['.', '..'].includes(value);
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
// A transient retry marker is not an operator decision. Project only a current,
// deterministic review requirement; the browser never owns or recomputes its hash.
export function currentPreparationReview(task) {
  if (task?.status !== 'open' || task.followUp?.open !== true) return null;
  const retry = PRIORITY.retryCurrent(task, { decisionFingerprint: followUpDecisionHash(task.followUp) });
  return retry?.state === 'review_required' ? { reason: /^[a-z][a-z0-9_]{0,100}$/.test(retry.reason || '')
    ? retry.reason : 'preparation_review_required' } : null;
}
const precondition = snapshot => snapshot ? { updateTime: snapshot.updateTime } : { exists: false };
// Firestore updateTime is the primary commit order, unlike the order in which
// secondary tracking finishes. Keep sub-millisecond precision for tied WA dates.
const committedVersion = value => {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  return match && Number.isFinite(Date.parse(value)) ? match[1] + '.' + (match[2] || '').padEnd(9, '0') + 'Z' : null;
};
const nextContextRevision = task => {
  const value = task?.contextRevision ?? 0;
  if (!Number.isSafeInteger(value) || value < 0 || value === Number.MAX_SAFE_INTEGER) throw new Error('invalid_context_revision');
  return value + 1;
};

// Tracking survives manual takeover. New enrolment is an explicit preparation
// rollout, independent of automatic replies; old imports stay out of the rollout.
export async function refreshTrackedFollowUp(input) {
  if (!idPart(input?.cid)) return null;
  const cursor = await fsGet('heartbeat/segretaria-case-' + followUpId(input.cid, 'cursor').slice(3));
  if (input.direction === 'out') return cursor ? invalidateTrackedContext(input) : null;
  if (cursor) return captureFollowUp(input);
  const config = await fsGet('settings/segretaria');
  const since = checkTimestamp(config?.prepareSince);
  const receivedAt = input.receivedAt ?? input.now;
  if (config?.enabled === false || config?.prepareCases !== true || !Number.isFinite(since)
    || !Number.isFinite(receivedAt) || receivedAt < since) return null;
  return captureFollowUp(input);
}

// Outgoing evidence changes preparation, never the client's last inbound or an
// operator decision. Only already tracked, open cases are eligible. Per-case
// receipts make a partially interrupted pass repairable without double bumps.
async function invalidateTrackedContext({ cid, messageId, now = Date.now() }) {
  if (typeof messageId !== 'string' || !messageId.trim() || messageId.length > 512) return null;
  let afterId = null, result = null;
  do {
    const rows = await fsList('operatorTasks', { filter: { field: 'followUp.conversationId', op: 'EQUAL', value: cid },
      limit: FOLLOW_UP_LIMIT, afterId });
    for (const row of rows.filter(t => t.source === 'segretaria' && t.status === 'open' && t.followUp?.open === true)) {
      const receiptPath = 'heartbeat/segretaria-context-' + followUpId(cid, [row.id, messageId]).slice(3);
      let completed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await fsGet(receiptPath)) { result = await fsGet('operatorTasks/' + row.id); completed = true; break; }
        const current = await fsGetVersioned('operatorTasks/' + row.id), task = current?.data;
        if (task?.status !== 'open' || task.followUp?.open !== true || task.followUp.conversationId !== cid) { completed = true; break; }
        const contextRevision = nextContextRevision(task);
        try {
          await fsCommit([
            { docPath: receiptPath, fields: { taskId: row.id, at: new Date(now).toISOString() }, precondition: { exists: false } },
            { docPath: 'operatorTasks/' + row.id, fields: { contextRevision }, precondition: precondition(current) },
          ]);
          result = { ...task, contextRevision }; completed = true; break;
        } catch (error) { if (!error?.conflict) throw error; }
      }
      if (!completed) throw new Error('Follow-up context changed concurrently');
    }
    afterId = rows.length === FOLLOW_UP_LIMIT ? rows[rows.length - 1].id : null;
  } while (afterId);
  return result;
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

export async function captureFollowUp({ cid, conv, messageId, messageVersion, text, now = Date.now(), preserveNewer = false }) {
  if (!idPart(cid) || typeof messageId !== 'string' || !messageId.trim() || messageId.length > 512) return null;
  const event = messageId;
  const inboundVersion = committedVersion(messageVersion);
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
    let current = null, keepClosed = false;
    if (active.length === 1 && known.length < 30) {
      current = await fsGetVersioned('operatorTasks/' + active[0].id);
      if (!current || current.data.status !== 'open') continue;
    }
    // A historical event preceding an already completed case is evidence for
    // that case, not a new obligation. Verify its identity and bind the receipt
    // to the closed version; a concurrent change retries the whole decision.
    if (preserveNewer && active.length === 0) {
      const cursorId = cursor?.data.taskId;
      const closed = known.filter(t => t.status === 'done' && Date.parse(t.followUp?.lastInboundAt) > now)
        .sort((a, b) => Date.parse(b.followUp.lastInboundAt) - Date.parse(a.followUp.lastInboundAt))[0];
      const candidates = [...new Set([cursorId, closed?.id])].filter(id => /^sg_[a-f0-9]{32}$/.test(String(id || '')));
      for (const closedId of candidates) {
        const snapshot = await fsGetVersioned('operatorTasks/' + closedId);
        const f = snapshot?.data.followUp;
        if (snapshot?.data.status === 'done' && f?.conversationId === cid
          && (Date.parse(f.lastInboundAt) > now || (closedId === cursorId && Date.parse(cursor.data.at) > now))) {
          current = snapshot;
          keepClosed = true;
          break;
        }
      }
    }
    const id = current ? current.data.id : followUpId(cid, event);
    const timing = INTAKE.proposeInitialCheck({ text, sourceAt: at, sourceMessageId: event,
      now: Math.max(now, Date.now()) });
    const { checkAt, checkBasis, intakeTiming } = timing;
    const row = {
      title: 'Seguire ' + clean(conv?.contactName || 'la richiesta', 100),
      due: romeDateKey(new Date(checkAt)), dueTime: null, status: 'open', kind: 'auto',
      source: 'segretaria', calendarize: false, createdAt: new Date(now), createdBy: 'segretaria',
      followUp: { open: true, conversationId: cid, contactName: clean(conv?.contactName, 100),
        lastMessageId: event, lastInboundAt: at, lastInboundVersion: inboundVersion, preview: clean(text, 240),
        practiceRef: null, propertyRef: null, nextAction: 'Verificare la richiesta e confermare il seguito',
        waitingOn: 'valentino', waitingLabel: 'Valentino', checkAt,
        checkBasis, intakeTiming,
        confirmed: false, needsReview: true, ambiguous: active.length > 1 || known.length >= 30 },
    };
    const prior = current?.data.followUp;
    const priorVersion = committedVersion(prior?.lastInboundVersion);
    const keepRecent = keepClosed || (current && Date.parse(current.data.followUp?.lastInboundAt) > now)
      || (prior && Date.parse(prior.lastInboundAt) === now && inboundVersion && priorVersion && priorVersion > inboundVersion);
    // A new source can bring a deadline forward but never postpone a pending
    // intake on every message or change an operator's decision. Even a manual
    // choice without a verified practice has confirmedAt and stays protected.
    const mayAdvance = intakeTiming && prior && !prior.confirmed && !prior.confirmedAt && !prior.confirmedBy
      && (!Number.isFinite(Date.parse(prior.checkAt)) || Date.parse(checkAt) < Date.parse(prior.checkAt));
    const fields = keepRecent ? { followUp: current.data.followUp,
      ...(!keepClosed ? { contextRevision: nextContextRevision(current.data) } : {}) } : current ? {
      followUp: { ...current.data.followUp, lastMessageId: event, lastInboundAt: at, lastInboundVersion: inboundVersion,
        preview: clean(text, 240), needsReview: true,
        ...(intakeTiming ? { intakeTiming } : {}),
        ...(mayAdvance ? { checkAt, checkBasis } : {}) },
      ...(mayAdvance ? { due: romeDateKey(new Date(checkAt)) } : {}), updatedAt: new Date(now),
    } : row;
    try {
      await fsCommit([
        { docPath: receiptPath, fields: { taskId: id, at }, precondition: { exists: false } },
        { docPath: cursorPath, fields: cursor && Date.parse(cursor.data.at) > now
          ? cursor.data : { taskId: id, at }, precondition: precondition(cursor) },
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

export async function listFollowUps({ afterId = null, maxPages = 5 } = {}) {
  if ((afterId !== null && !validFollowUpCursor(afterId)) || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 5)
    throw new Error('Invalid follow-up pagination');
  const rows = [], end = Date.now() + 5000;
  let cursor = afterId, pages = 0, incomplete = true, readingDegraded = false;
  while (pages < maxPages) {
    const left = end - Date.now();
    if (left <= 0) {
      if (!pages) throw new Error('Follow-up page unavailable');
      break;
    }
    let page;
    try {
      page = await fsList('operatorTasks', { filter: { field: 'followUp.open', op: 'EQUAL', value: true },
        limit: FOLLOW_UP_LIMIT, afterId: cursor, signal: AbortSignal.timeout(left) });
      // The cursor follows RAW documents: a legacy closed row must not strand
      // the scan, and a malformed/repeated page must never silently skip work.
      if (page.some((row, index) => !validFollowUpCursor(row.id)
        || (index ? page[index - 1].id >= row.id : cursor !== null && cursor >= row.id)))
        throw new Error('Invalid follow-up page order');
    } catch (error) {
      if (!pages) throw error;
      readingDegraded = true;
      break;
    }
    pages++;
    rows.push(...page.filter(t => t.status === 'open' && t.followUp));
    if (page.length < FOLLOW_UP_LIMIT) { incomplete = false; cursor = null; break; }
    cursor = page[page.length - 1].id;
  }
  return { rows: rows.sort((a, b) => String(a.followUp.checkAt).localeCompare(String(b.followUp.checkAt)) || a.id.localeCompare(b.id)),
    incomplete, nextCursor: cursor, pages, readingDegraded,
    readError: readingDegraded ? 'follow_up_page_unavailable' : null,
    scope: afterId !== null || incomplete ? 'page' : 'all' };
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
