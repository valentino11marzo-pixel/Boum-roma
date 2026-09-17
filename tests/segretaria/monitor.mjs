import assert from 'node:assert/strict';
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test', FIREBASE_ADMIN_PASS: 'fixture' });
const NOW = Date.parse('2026-09-16T22:30:00Z'); // 17 September in Rome.
const DB = new Map(), reads = [];
let failing = '';
const encode = value => value === null ? { nullValue: null }
  : typeof value === 'boolean' ? { booleanValue: value }
  : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  : typeof value === 'string' ? { stringValue: value }
  : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const json = (value, status = 200) => ({ ok: status === 200, status, json: async () => value, text: async () => JSON.stringify(value) });
  if (url.hostname === 'identitytoolkit.googleapis.com') return json({ idToken: 'fixture' });
  assert.equal(url.hostname, 'firestore.googleapis.com');
  assert.equal(options.method || 'GET', 'GET', 'Monitoring must never write or trigger a worker');
  const path = url.pathname.split('/documents/')[1]; reads.push(path);
  if (path === failing) return json({ error: 'unavailable' }, 503);
  if (!DB.has(path)) return json({}, 404);
  return json({ name: url.pathname, fields: Object.fromEntries(Object.entries(DB.get(path)).map(([k, v]) => [k, encode(v)])) });
};
const { readPreparationMonitor } = await import('../../api/segretaria/_monitor.js');
const monitor = () => readPreparationMonitor({ now: NOW });
const heartbeat = data => DB.set('heartbeat/segretaria-preparer', { at: new Date(NOW - 20000).toISOString(), prepared: 1, ...data });
DB.set('settings/segretaria', { enabled: true, prepareCases: true, dailyCap: 5 });
heartbeat({ queue: { openCases: 93, pending: 88, scope: 'all' }, checked: 2, cached: 0, remaining: 87 });
let r = await monitor();
assert.equal(r.status, 'working'); assert.equal(r.usedToday, 0); assert.equal(r.counts.pending, 88);
assert.equal(r.scope, 'preparation_only'); assert.ok(reads.includes('heartbeat/segretaria-preparations-2026-09-17'));
assert.equal(r.mode, 'continuous'); assert.equal(r.dailyCap, null); assert.equal(r.remainingToday, null);
assert.equal(r.queueScope, 'all'); assert.equal(r.queueIncomplete, false);
for (const used of [5, 50, 5000]) {
  DB.set('heartbeat/segretaria-preparations-2026-09-17', { count: used });
  r = await monitor(); assert.equal(r.status, 'working'); assert.equal(r.usedToday, used);
  assert.equal(r.dailyCap, null); assert.equal(r.remainingToday, null);
}
heartbeat({ queue: { openCases: 200, awaitingReview: 7, retrying: 3, scope: 'page',
  retryReasons: { preparation_unavailable: 2, model_unavailable: 1, invalid: -1, 'bad reason': 10 },
  nextRetryAt: new Date(NOW + 60000).toISOString() }, incomplete: false });
r = await monitor(); assert.equal(r.counts.awaitingReview, 7); assert.equal(r.queueScope, 'page');
assert.equal(r.queueIncomplete, true); assert.equal(r.incomplete, false);
assert.deepEqual(r.retryReasons, { preparation_unavailable: 2, model_unavailable: 1 });
assert.equal(r.nextRetryAt, new Date(NOW + 60000).toISOString());
heartbeat({ readingDegraded: true }); assert.equal((await monitor()).incomplete, true);
heartbeat({ stoppedBy: 'daily_cap' });
r = await monitor(); assert.equal(r.status, 'unavailable'); assert.equal(r.stoppedBy, null);
heartbeat({});
DB.set('settings/segretaria', { enabled: true, prepareCases: false, dailyCap: 5 });
assert.equal((await monitor()).status, 'paused');
DB.set('settings/segretaria', { enabled: false, prepareCases: true, dailyCap: 5 });
assert.equal((await monitor()).status, 'disabled');
DB.set('settings/segretaria', { enabled: true, prepareCases: true, dailyCap: 5 });
DB.set('heartbeat/segretaria-preparations-2026-09-17', { count: 1 });
heartbeat({ at: new Date(NOW - 240000).toISOString() });
assert.equal((await monitor()).status, 'delayed');
heartbeat({ at: new Date(NOW + 240000).toISOString() });
assert.equal((await monitor()).status, 'unknown');
heartbeat({ error: 'preparation_unavailable' });
assert.equal((await monitor()).status, 'unavailable');
heartbeat({ schedulerDegraded: true });
assert.equal((await monitor()).incomplete, true);
heartbeat({}); failing = 'settings/segretaria';
r = await monitor(); assert.equal(r.status, 'unavailable'); assert.equal(r.enabled, null); assert.equal(r.dailyCap, null);
failing = 'heartbeat/segretaria-preparations-2026-09-17';
r = await monitor(); assert.equal(r.usedToday, null); assert.equal(r.status, 'unavailable');
failing = '';
for (const count of [-1, '5', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  DB.set('heartbeat/segretaria-preparations-2026-09-17', { count });
  r = await monitor(); assert.equal(r.status, 'unavailable'); assert.equal(r.incomplete, true);
}
DB.delete('heartbeat/segretaria-preparations-2026-09-17'); DB.delete('heartbeat/segretaria-preparer');
r = await monitor(); assert.equal(r.status, 'unknown'); assert.equal(r.lastRunAt, null);
console.log('PASS monitor: continuous read-only processing, no daily ceiling, midnight Rome, pause, heartbeat freshness, retry/review visibility, partial-page scope and corrupted counters.');
