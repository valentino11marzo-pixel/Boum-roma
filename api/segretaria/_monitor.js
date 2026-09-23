// Read-only preparation health. A worker heartbeat never proves WhatsApp
// reception, successful message analysis, or delivery to a customer.
import { fsGet } from '../homie/_lib.js';
import SEG from '../../js/segretaria-engine.js';

const day = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = value => {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

export async function readPreparationMonitor({ now = Date.now() } = {}) {
  const result = await Promise.allSettled([
    fsGet('settings/segretaria'), fsGet('heartbeat/segretaria-preparer'),
    fsGet('heartbeat/segretaria-preparations-' + day(now)),
  ]);
  const [settings, heartbeat, counter] = result.map(r => r.status === 'fulfilled' ? r.value : null);
  const incomplete = result.some(r => r.status !== 'fulfilled');
  const configReadable = result[0].status === 'fulfilled';
  const { cfg } = SEG.mergeConfig(settings);
  const usedToday = result[2].status !== 'fulfilled' ? null : counter === null ? 0 : count(counter.count);
  const lastRunAt = date(heartbeat?.at);
  const age = lastRunAt ? now - Date.parse(lastRunAt) : null;
  const enabled = configReadable ? cfg.enabled : null;
  const prepareCases = configReadable ? settings?.prepareCases === true : null;
  const degraded = heartbeat?.schedulerDegraded === true || heartbeat?.readingDegraded === true
    || heartbeat?.queueObservationsIncomplete === true;
  // Handled 422 outcomes describe cases, not a service outage. The worker
  // either persists their review or observes a newer valid result; failed writes
  // and unresolved races set queueObservationsIncomplete. Inspect the whole batch
  // so a final success cannot hide an earlier transient failure.
  const errors = Array.isArray(heartbeat?.errors) ? heartbeat.errors : [];
  const hasFailures = Boolean(heartbeat?.error) || errors.length > 0;
  const reviewOnlyFailure = (!heartbeat?.error || heartbeat?.code === 422)
    && count(heartbeat?.queue?.awaitingReview) > 0 && errors.length > 0
    && errors.every(error => error?.code === 422 && typeof error.error === 'string' && error.error.length > 0);
  let status = incomplete || usedToday === null ? 'unavailable' : 'unknown';
  if (enabled === false) status = 'disabled';
  else if (prepareCases === false) status = 'paused';
  else if (!incomplete && usedToday !== null && age !== null && age >= 0) {
    status = age > 180000 ? 'delayed' : degraded || (hasFailures && !reviewOnlyFailure) || heartbeat?.stoppedBy === 'daily_cap' ? 'unavailable'
      : Number(heartbeat?.prepared || 0) > 0 ? 'working' : 'idle';
  }
  const counts = {};
  const values = { open: heartbeat?.queue?.openCases, pending: heartbeat?.queue?.pending,
    current: heartbeat?.queue?.currentProposals, retrying: heartbeat?.queue?.retrying,
    awaitingReview: heartbeat?.queue?.awaitingReview, quiet: heartbeat?.queue?.quiet,
    attempted: heartbeat?.checked, prepared: heartbeat?.prepared, cached: heartbeat?.cached,
    remaining: heartbeat?.remaining };
  for (const [key, value] of Object.entries(values)) {
    const n = count(value);
    if (n !== null) counts[key] = n;
  }
  const retryReasons = {};
  for (const [reason, value] of Object.entries(heartbeat?.queue?.retryReasons || {})) {
    if (/^[a-z][a-z0-9_]{0,100}$/.test(reason) && count(value) !== null) retryReasons[reason] = value;
  }
  const queueScope = !heartbeat?.queue ? null : heartbeat?.queue?.scope === 'page' || heartbeat?.incomplete === true
    || heartbeat?.queueScanCursor ? 'page' : heartbeat?.queue?.scope === 'all' ? 'all' : null;
  return { enabled, prepareCases, mode: 'continuous', dailyCap: null, usedToday,
    remainingToday: null,
    status, lastRunAt, checkedAt: new Date(now).toISOString(), counts,
    retryReasons, nextRetryAt: date(heartbeat?.queue?.nextRetryAt), queueScope,
    stoppedBy: ['time_budget', 'disabled', 'batch_limit'].includes(heartbeat?.stoppedBy) ? heartbeat.stoppedBy : null,
    queueIncomplete: heartbeat?.incomplete === true || queueScope === 'page',
    incomplete: incomplete || usedToday === null || degraded,
    scope: 'preparation_only' };
}
