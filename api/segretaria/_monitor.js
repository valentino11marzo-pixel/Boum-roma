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
  const dailyCap = configReadable ? cfg.dailyCap : null;
  const usedToday = result[2].status !== 'fulfilled' ? null : counter === null ? 0 : count(counter.count);
  const lastRunAt = date(heartbeat?.at);
  const age = lastRunAt ? now - Date.parse(lastRunAt) : null;
  const enabled = configReadable ? cfg.enabled : null;
  const prepareCases = configReadable ? settings?.prepareCases === true : null;
  let status = incomplete || usedToday === null ? 'unavailable' : 'unknown';
  if (enabled === false) status = 'disabled';
  else if (prepareCases === false) status = 'paused';
  else if (dailyCap !== null && usedToday !== null && usedToday >= dailyCap) status = 'daily_cap';
  else if (!incomplete && usedToday !== null && age !== null && age >= 0) {
    status = age > 180000 ? 'delayed' : heartbeat?.error ? 'unavailable'
      : Number(heartbeat?.prepared || 0) > 0 ? 'working' : 'idle';
  }
  const counts = {};
  const values = { open: heartbeat?.queue?.openCases, pending: heartbeat?.queue?.pending,
    current: heartbeat?.queue?.currentProposals, retrying: heartbeat?.queue?.retrying,
    attempted: heartbeat?.checked, prepared: heartbeat?.prepared, cached: heartbeat?.cached,
    remaining: heartbeat?.remaining };
  for (const [key, value] of Object.entries(values)) {
    const n = count(value);
    if (n !== null) counts[key] = n;
  }
  return { enabled, prepareCases, dailyCap, usedToday,
    remainingToday: dailyCap === null || usedToday === null ? null : Math.max(0, dailyCap - usedToday),
    status, lastRunAt, checkedAt: new Date(now).toISOString(), counts,
    stoppedBy: ['daily_cap', 'time_budget', 'disabled', 'batch_limit'].includes(heartbeat?.stoppedBy) ? heartbeat.stoppedBy : null,
    queueIncomplete: heartbeat?.incomplete === true,
    incomplete: incomplete || usedToday === null || heartbeat?.schedulerDegraded === true,
    scope: 'preparation_only' };
}
