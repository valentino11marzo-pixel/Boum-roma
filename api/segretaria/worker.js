// Proactive preparation only. No recipient, reply sending or Telegram card.
import { fsGet, fsGetVersioned, fsCommit, fsPatch, secretEqual } from '../homie/_lib.js';
import { listFollowUps, followUpDecisionHash } from './_follow-up.js';
import { prepareCase } from './_prepare.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import { runBudget } from '../_budget.js';

const MAX_CASES = 3;
const stamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const decisionCurrent = task => PROPOSTA.currentContext(task)
  && (task.preparation.approval?.followUpFingerprint || task.preparation.followUpFingerprint) === followUpDecisionHash(task.followUp);
const pendingReason = (task, now) => !PROPOSTA.current(task) ? 'event'
  : !decisionCurrent(task) || (stamp(task.followUp.checkAt) > 0 && stamp(task.followUp.checkAt) <= now
    && task.preparation.recheckFor !== task.followUp.checkAt) ? 'recheck' : null;

// Two slots favour new events; the third serves the oldest unchecked case.
// The cursor lives in the existing heartbeat, so a slow single-case run also
// advances fairness. There is no second queue or model-owned memory.
function chooseNext(candidates, cursor) {
  const order = cursor === 2
    ? (a, b) => stamp(a.task.preparationCheckedAt || a.task.followUp.lastInboundAt || a.task.followUp.checkAt)
      - stamp(b.task.preparationCheckedAt || b.task.followUp.lastInboundAt || b.task.followUp.checkAt)
    : (a, b) => Number(b.reason === 'event') - Number(a.reason === 'event')
      || (a.reason === 'event'
        ? stamp(b.task.followUp.lastInboundAt) - stamp(a.task.followUp.lastInboundAt)
        : stamp(a.task.followUp.checkAt) - stamp(b.task.followUp.checkAt));
  return candidates.sort((a, b) => order(a, b)
    || stamp(a.task.followUp.checkAt) - stamp(b.task.followUp.checkAt)
    || String(a.task.id).localeCompare(String(b.task.id))).shift().task;
}

export async function prepareNextCase({ now = Date.now() } = {}) {
  const budget = runBudget(60_000, 7_000);
  const config = await fsGet('settings/segretaria');
  if (config?.enabled === false || config?.prepareCases !== true) return { enabled: false, prepared: 0 };
  const [listed, monitored] = await Promise.allSettled([listFollowUps(), fsGet('heartbeat/segretaria-preparer')]);
  if (listed.status === 'rejected') throw listed.reason;
  const list = listed.value, schedulerDegraded = monitored.status === 'rejected';
  const previous = schedulerDegraded ? null : monitored.value;
  const pending = list.rows.map(task => ({ task, reason: pendingReason(task, now) })).filter(row => row.reason);
  const candidates = pending.filter(({ task }) => !(task.preparationRetry?.messageId === task.followUp.lastMessageId
    && stamp(task.preparationRetry.after) > now));
  const oldest = pending.reduce((oldestAt, { task }) => {
    const at = stamp(task.followUp.lastInboundAt);
    return at && (!oldestAt || at < oldestAt) ? at : oldestAt;
  }, 0);
  const queue = {
    openCases: list.rows.length, currentProposals: list.rows.filter(decisionCurrent).length,
    pending: pending.length, eligible: candidates.length,
    newEvents: pending.filter(row => row.reason === 'event').length,
    rechecks: pending.filter(row => row.reason === 'recheck').length,
    retrying: pending.length - candidates.length, oldestPendingAt: oldest ? new Date(oldest).toISOString() : null,
  };
  let schedulerCursor = Number.isSafeInteger(previous?.schedulerCursor) && previous.schedulerCursor >= 0
    ? previous.schedulerCursor % MAX_CASES : schedulerDegraded ? Math.floor(now / 60000) % MAX_CASES : 0;
  const errors = schedulerDegraded ? [{ error: 'preparation_scheduler_unavailable' }] : [], results = [];
  let last = { id: null, code: null, error: null }, prepared = 0, cached = 0, stoppedBy = null;
  while (candidates.length && results.length < MAX_CASES) {
    if (!budget.afford(35_000)) { stoppedBy = 'time_budget'; break; }
    const next = chooseNext(candidates, schedulerCursor);
    let result;
    try { result = await prepareCase({ id: next.id, actor: 'segretaria-worker', now, background: true, budget }); }
    catch { result = { code: 503, error: 'preparation_unavailable' }; }
    last = { id: next.id, code: result.code, error: result.error || null };
    results.push({ ...last, cached: result.cached === true });
    if (result.code !== 200) errors.push(last);
    // A global pause must not postpone this particular case for ten minutes.
    stoppedBy = result.code === 429 ? 'daily_cap' : result.error === 'preparation_time_budget' ? 'time_budget'
      : result.error === 'preparation_disabled' ? 'disabled' : null;
    if (stoppedBy) break;
    schedulerCursor = (schedulerCursor + 1) % MAX_CASES;
    if (result.code === 200) { if (result.cached) cached++; else prepared++; }
    // Another worker owns the task version until its preparation commits.
    // A retry marker here would invalidate its CAS and discard its AI result.
    if (result.error === 'preparation_in_progress') continue;
    // Only the exact event inspected can receive a retry/check marker. A new
    // inbound event must remain eligible, even if it arrives during the model.
    try {
      const cur = await fsGetVersioned('operatorTasks/' + next.id);
      if (cur?.data.followUp?.lastMessageId === next.followUp.lastMessageId)
        await fsCommit([{ docPath: 'operatorTasks/' + next.id, precondition: { updateTime: cur.updateTime },
          fields: { preparationCheckedAt: new Date(now).toISOString(), preparationError: result.code === 200 ? null : result.error,
            preparationRetry: result.code === 200 ? null : { messageId: next.followUp.lastMessageId, after: new Date(now + 600000).toISOString() } } }]);
    } catch { errors.push({ id: next.id, error: 'preparation_retry_not_saved' }); }
  }
  if (!stoppedBy && candidates.length && results.length === MAX_CASES) stoppedBy = 'batch_limit';
  return { enabled: true, prepared, cached, checked: results.length, ...last, errors, results,
    queue, remaining: Math.max(0, queue.pending - prepared - cached), stoppedBy,
    ...(schedulerDegraded ? {} : { schedulerCursor }), schedulerDegraded, incomplete: list.incomplete };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!process.env.CRON_SECRET || !secretEqual(req.headers?.authorization || '', 'Bearer ' + process.env.CRON_SECRET))
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const out = await prepareNextCase();
    if (out.enabled) await fsPatch('heartbeat/segretaria-preparer', { at: new Date(), ...out });
    return res.status(200).json({ ok: true, ...out });
  } catch { return res.status(503).json({ ok: false, error: 'preparation_unavailable' }); }
}
