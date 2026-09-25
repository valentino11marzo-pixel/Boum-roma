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
      && retry.messageId === task.followUp.lastMessageId && retry.followUpFingerprint === decisionFingerprint && PROPOSTA.contextCurrent(task, retry)
      && retry.version === version && ['retry_wait', 'review_required'].includes(retry.state) ? retry : null;
  }
  function reviewCurrent(task, { decisionFingerprint } = {}) {
    return !!(openCase(task) && task.preparation?.status === 'needs_context' && !task.preparation.approval && PROPOSTA.contextCurrent(task)
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
// The quiet window (23/09/2026): WhatsApp arrives in bursts («ciao» ·
// «cercavo un bilocale» · «per settembre») and every inbound bumps
// contextRevision, so a preparation started mid-burst is paid in full and
// obsolete on arrival. A new-event row waits until the chat has been silent
// for quietMs and is then prepared ONCE, on the whole burst. A confirmed
// deadline or a dated request within the hour never waits: the same rank
// that outranks new events in chooseNext. Rechecks and operator decisions
// are not bursts and never wait.
// Both directions (25/09/2026): the operator's own replies come in bursts too
// («ok» · «ti mando il link» · the link) and each OUT invalidates the
// proposal through contextRevision, so «chat ferma» counts the last inbound
// AND the last outbound (task.lastOutboundAt, stamped by the OUT invalidation;
// absent on legacy rows = inbound only, exactly as before).
function quiet(row, now, quietMs) {
  if (!row || row.reason !== 'event' || !(quietMs > 0)) return false;
  const last = Math.max(stamp(row.task?.followUp?.lastInboundAt), stamp(row.task?.lastOutboundAt));
  if (!(last > 0) || now - last >= quietMs) return false;
  return !(dueAt(row.task) <= now + 3600000);
}
  return Object.freeze({ retryCurrent, reviewCurrent, retryDelayMinutes, dueAt, chooseNext, quiet });
});
