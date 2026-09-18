/* Shared preparation scheduling policy. Pure: no network, storage, clock or model. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./segretaria-proposta-engine.js') : root.BOOM_PROPOSTA);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_SEGRETARIA_PRIORITY = api;
})(typeof window !== 'undefined' ? window : this, function (PROPOSTA) {
  'use strict';
  const RETRY_MINUTES = Object.freeze([1, 5, 15, 60, 360]);
  const stamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  const openCase = task => task?.source === 'segretaria' && task.status === 'open'
    && task.followUp?.open === true && typeof task.followUp.lastMessageId === 'string' && !!task.followUp.lastMessageId;
  function retryCurrent(task, { decisionFingerprint, version = PROPOSTA.VERSION } = {}) {
    const retry = task?.preparationRetry;
    return openCase(task) && retry && typeof decisionFingerprint === 'string' && !!decisionFingerprint
      && retry.messageId === task.followUp.lastMessageId && retry.followUpFingerprint === decisionFingerprint
      && retry.version === version && ['retry_wait', 'review_required'].includes(retry.state) ? retry : null;
  }
  function reviewCurrent(task, { decisionFingerprint } = {}) {
    return !!(openCase(task) && task.preparation?.status === 'needs_context' && !task.preparation.approval
      && task.preparation.messageId === task.followUp.lastMessageId && typeof decisionFingerprint === 'string'
      && !!decisionFingerprint && task.preparation.followUpFingerprint === decisionFingerprint);
  }
  function retryDelayMinutes(attempts) {
    const count = Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 1;
    return RETRY_MINUTES[Math.min(count - 1, RETRY_MINUTES.length - 1)];
  }
// Only a confirmed operator deadline or an explicit, dated intake request can
// outrank new messages. The ordinary internal +2h suggestion is not an SLA.
function dueAt(task) {
  const f = task.followUp, intake = f.intakeTiming, dates = [];
  if (f.confirmed === true || (f.confirmedAt && f.confirmedBy)) dates.push(stamp(f.checkAt));
  if (intake?.status === 'resolved' && intake.sourceMessageId && stamp(intake.sourceAt) && intake.quote)
    dates.push(stamp(intake.requestedAt));
  return Math.min(...dates.filter(at => at > 0));
}
// Two slots prioritize overdue/near deadlines, then new events, then waits;
// every third slot serves the oldest checked/inbound case on the scanned page.
function chooseNext(candidates, cursor, now) {
  const priority = row => dueAt(row.task) <= now ? 0 : dueAt(row.task) <= now + 3600000 ? 1 : row.reason === 'event' ? 2 : 3;
  const order = cursor === 2
    ? (a, b) => stamp(a.task.preparationCheckedAt || a.task.followUp.lastInboundAt || a.task.followUp.checkAt)
      - stamp(b.task.preparationCheckedAt || b.task.followUp.lastInboundAt || b.task.followUp.checkAt)
    : (a, b) => priority(a) - priority(b)
      || (priority(a) <= 1 ? dueAt(a.task) - dueAt(b.task) : a.reason === 'event'
        ? stamp(b.task.followUp.lastInboundAt) - stamp(a.task.followUp.lastInboundAt)
        : stamp(a.task.followUp.checkAt) - stamp(b.task.followUp.checkAt));
  return [...candidates].sort((a, b) => order(a, b)
    || stamp(a.task.followUp.checkAt) - stamp(b.task.followUp.checkAt)
    || String(a.task.id).localeCompare(String(b.task.id)))[0]?.task || null;
}
  return Object.freeze({ retryCurrent, reviewCurrent, retryDelayMinutes, dueAt, chooseNext });
});
