// Proactive preparation only. No recipient, reply sending or Telegram card.
import { fsGet, fsGetVersioned, fsCommit, secretEqual } from '../homie/_lib.js';
import { listFollowUps, followUpDecisionHash } from './_follow-up.js';
import { prepareCase } from './_prepare.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import PRIORITY from '../../js/segretaria-priority-engine.js';
import { runBudget } from '../_budget.js';

const MAX_CASES = 3;
const stamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const decisionHash = task => followUpDecisionHash(task.followUp);
const decisionCurrent = task => PROPOSTA.currentContext(task)
  && (task.preparation.approval?.followUpFingerprint || task.preparation.followUpFingerprint) === decisionHash(task);
const reviewCurrent = task => PRIORITY.reviewCurrent(task, { decisionFingerprint: decisionHash(task) });
const pendingReason = (task, now) => reviewCurrent(task) ? null : !PROPOSTA.current(task) ? 'event'
  : !decisionCurrent(task) || (stamp(task.followUp.checkAt) > 0 && stamp(task.followUp.checkAt) <= now
    && task.preparation.recheckFor !== task.followUp.checkAt) ? 'recheck' : null;
const retryCurrent = task => PRIORITY.retryCurrent(task, { decisionFingerprint: decisionHash(task) });
const safeError = error => /^[a-z][a-z0-9_]{0,100}$/.test(error || '') ? error : 'preparation_unavailable';

function queueSnapshot(rows, now, scope) {
  const review = rows.filter(task => reviewCurrent(task) || retryCurrent(task)?.state === 'review_required');
  const pending = rows.map(task => ({ task, reason: pendingReason(task, now) }))
    .filter(row => row.reason && retryCurrent(row.task)?.state !== 'review_required');
  const delayed = pending.filter(({ task }) => retryCurrent(task)?.state === 'retry_wait' && stamp(retryCurrent(task).after) > now);
  const oldest = Math.min(...pending.map(({ task }) => stamp(task.followUp.lastInboundAt)).filter(at => at > 0));
  const retryReasons = {};
  for (const task of rows) {
    const retry = retryCurrent(task);
    if (retry && ['retry_wait', 'review_required'].includes(retry.state)) {
      const reason = safeError(retry.reason); retryReasons[reason] = (retryReasons[reason] || 0) + 1;
    }
  }
  const nextRetry = Math.min(...delayed.map(({ task }) => stamp(retryCurrent(task).after)));
  return { scope, openCases: rows.length, currentProposals: rows.filter(task => decisionCurrent(task) && !reviewCurrent(task)).length,
    pending: pending.length, eligible: pending.length - delayed.length, awaitingReview: review.length,
    newEvents: pending.filter(row => row.reason === 'event').length, rechecks: pending.filter(row => row.reason === 'recheck').length,
    retrying: delayed.length, retryReasons, nextRetryAt: Number.isFinite(nextRetry) ? new Date(nextRetry).toISOString() : null,
    oldestPendingAt: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null };
}

export async function prepareNextCase({ now = Date.now() } = {}) {
  const budget = runBudget(60_000, 7_000);
  const config = await fsGet('settings/segretaria');
  if (config?.enabled === false || config?.prepareCases !== true) return { enabled: false, prepared: 0 };
  // An unreadable cursor must not restart or skip the scan. Failed reads throw;
  // the endpoint leaves the previous heartbeat untouched and retries next run.
  const monitored = await fsGetVersioned('heartbeat/segretaria-preparer');
  const previous = monitored?.data;
  const afterId = previous?.queueScanCursor || null;
  const list = await listFollowUps({ afterId, maxPages: 1 });
  const scope = afterId || list.incomplete || list.scope === 'page' ? 'page' : 'all';
  const rows = list.rows.filter(task => task.source === 'segretaria'), queueBefore = queueSnapshot(rows, now, scope);
  const candidates = rows.map(task => ({ task, reason: pendingReason(task, now) })).filter(row => row.reason)
    .filter(({ task }) => retryCurrent(task)?.state !== 'review_required'
      && !(retryCurrent(task)?.state === 'retry_wait' && stamp(retryCurrent(task).after) > now));
  let schedulerCursor = Number.isSafeInteger(previous?.schedulerCursor) && previous.schedulerCursor >= 0
    ? previous.schedulerCursor % MAX_CASES : 0;
  const schedulerSweep = Number.isSafeInteger(previous?.schedulerSweep) && previous.schedulerSweep >= 0
    ? previous.schedulerSweep % MAX_CASES : 0;
  // A global third slot alone can always land on the same page. Every third
  // complete scan also gives each page's first attempt to its oldest case.
  const fairnessSweep = schedulerSweep === 2;
  const errors = [], results = [];
  let last = { id: null, code: null, error: null }, prepared = 0, cached = 0, stoppedBy = null, observationsIncomplete = false;
  while (candidates.length && results.length < MAX_CASES) {
    if (!budget.afford(35_000)) { stoppedBy = 'time_budget'; break; }
    const next = PRIORITY.chooseNext(candidates, fairnessSweep && results.length === 0 ? 2 : schedulerCursor, now), inputHash = decisionHash(next);
    candidates.splice(candidates.findIndex(row => row.task === next), 1);
    let result;
    try { result = await prepareCase({ id: next.id, actor: 'segretaria-worker', now, background: true, budget }); }
    catch { result = { code: 503, error: 'preparation_unavailable' }; }
    last = { id: next.id, code: result.code, error: result.code === 200 ? null : safeError(result.error) };
    results.push({ ...last, cached: result.cached === true });
    if (result.code !== 200) errors.push(last);
    stoppedBy = result.error === 'preparation_time_budget' ? 'time_budget'
      : result.error === 'preparation_disabled' ? 'disabled' : null;
    if (stoppedBy) break;
    schedulerCursor = (schedulerCursor + 1) % MAX_CASES;
    if (result.code === 200) { if (result.cached) cached++; else prepared++; }
    // Do not invalidate the lease owner's CAS by writing a competing marker.
    if (result.error === 'preparation_in_progress') { observationsIncomplete = true; continue; }
    try {
      const cur = await fsGetVersioned('operatorTasks/' + next.id);
      if (cur?.data.source === 'segretaria' && cur.data.status === 'open' && cur.data.followUp?.open === true
        && cur.data.followUp.lastMessageId === next.followUp.lastMessageId && decisionHash(cur.data) === inputHash) {
        // A different worker may have completed this version while ours failed.
        if (result.code !== 200 && cur.data.preparation?.revision !== next.preparation?.revision
          && (decisionCurrent(cur.data) || reviewCurrent(cur.data))) {
          Object.assign(next, cur.data); continue;
        }
        const previousRetry = retryCurrent(next);
        const attempts = (Number.isSafeInteger(previousRetry?.attempts) && previousRetry.attempts > 0 ? previousRetry.attempts : 0) + 1;
        const retry = result.code === 200 ? null : { messageId: next.followUp.lastMessageId, followUpFingerprint: inputHash,
          version: PROPOSTA.VERSION, attempts, reason: last.error, state: result.code === 422 ? 'review_required' : 'retry_wait',
          after: result.code === 422 ? null : new Date(now + PRIORITY.retryDelayMinutes(attempts) * 60000).toISOString() };
        const fields = { preparationCheckedAt: new Date(now).toISOString(), preparationError: result.code === 200 ? null : last.error,
          preparationRetry: retry };
        await fsCommit([{ docPath: 'operatorTasks/' + next.id, precondition: { updateTime: cur.updateTime }, fields }]);
        Object.assign(next, cur.data, fields);
      } else {
        if (cur?.data) Object.assign(next, cur.data);
        observationsIncomplete = true;
      }
    } catch { errors.push({ id: next.id, error: 'preparation_retry_not_saved' }); observationsIncomplete = true; }
  }
  if (!stoppedBy && candidates.length && results.length === MAX_CASES) stoppedBy = 'batch_limit';
  const queue = queueSnapshot(rows.filter(task => task.status === 'open' && task.followUp?.open === true), now, scope);
  const out = { enabled: true, prepared, cached, checked: results.length, ...last, errors, results,
    queue, queueBefore, remaining: queue.pending, stoppedBy, schedulerCursor, queueScanCursor: list.nextCursor || null,
    schedulerSweep: list.nextCursor ? schedulerSweep : (schedulerSweep + 1) % MAX_CASES,
    schedulerDegraded: false, incomplete: scope === 'page' || observationsIncomplete,
    queueObservationsIncomplete: observationsIncomplete, scanPages: list.pages || 1 };
  Object.defineProperty(out, 'heartbeatVersion', { value: monitored?.updateTime || null });
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!process.env.CRON_SECRET || !secretEqual(req.headers?.authorization || '', 'Bearer ' + process.env.CRON_SECRET))
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const out = await prepareNextCase();
    if (out.enabled) {
      try {
        await fsCommit([{ docPath: 'heartbeat/segretaria-preparer', fields: { at: new Date(), ...out },
          precondition: out.heartbeatVersion ? { updateTime: out.heartbeatVersion } : { exists: false } }]);
      } catch {
        // Do not overwrite a newer scheduler/page cursor after a concurrent run.
        out.schedulerDegraded = true; out.incomplete = true;
        out.errors.push({ error: 'preparation_scheduler_not_saved' });
      }
    }
    return res.status(200).json({ ok: true, ...out });
  } catch { return res.status(503).json({ ok: false, error: 'preparation_unavailable' }); }
}
