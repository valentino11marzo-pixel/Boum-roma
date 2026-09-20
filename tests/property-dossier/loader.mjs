// Execute the portal's actual loaders and the dossier's actual source adapter.
// Only Firestore, browser storage/timers and unrelated app rendering are mocked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Rent = require('../../js/rent-engine.js');
const Engine = require('../../js/property-dossier-engine.js');
const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const dossier = readFileSync(new URL('../../js/property-dossier.js', import.meta.url), 'utf8');
const start = portal.indexOf('    async function loadData()');
const end = portal.indexOf('    // Dismissed system alerts', start);
assert.ok(start > 0 && end > start, 'real loader boundaries must exist');
const loaders = portal.slice(start, end);
const CORE_LIMITS = { users: 800, properties: 400, contracts: 800, payments: 3000, maintenance: 600, clients: 1200, documents: 1500, invoices: 1200, rules: 200, ruleExecutions: 50 };
let checks = 0;
async function test(label, run) { await run(); checks++; console.log('  ✓ ' + label); }

function base() {
  return { page: 'property/p1/overview', profile: { id: 'admin-test', role: 'admin' },
    properties: [{ id: 'p1', name: 'Old property', ownerId: 'owner' }],
    users: [{ id: 'owner', name: 'Owner' }, { id: 'tenant', name: 'Tenant' }],
    contracts: [{ id: 'c1', propertyId: 'p1', tenantId: 'tenant', status: 'active', rent: 1000, startDate: '2026-01-01', endDate: '2027-12-31' }],
    payments: [{ id: 'r1', propertyId: 'p1', contractId: 'c1', tenantId: 'tenant', status: 'pending', amount: 1000, month: '2026-09', dueDate: '2020-01-01' }],
    documents: [], maintenance: [], tasks: [{ id: 'old-task', propertyId: 'p1', status: 'pending' }], clients: [], invoices: [], rules: [], ruleExecutions: [] };
}
function harness({ network = {}, cache = null, failure = '', hold = false } = {}) {
  const S = base(), reads = [], writes = [], timers = [], sourceStates = [], rendered = [], storage = new Map();
  if (cache) storage.set('boom_data_cache', JSON.stringify(cache));
  let release;
  const gate = hold ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const document = { activeElement: null, addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const db = {
    collection(name) {
      let cap = null, sort = null;
      const forbidden = op => { writes.push({ name, op }); throw Error('Unexpected business write: ' + op); };
      const query = {
        limit(n) { cap = n; return this; }, orderBy(...args) { sort = args; return this; },
        async get() {
          reads.push({ name, cap, sort });
          await gate;
          if (failure === name) throw Error('Simulated read failure');
          return { docs: (network[name] || []).slice(0, cap == null ? undefined : cap).map(record => ({
            id: record.id, data() { const { id, ...data } = structuredClone(record); return data; }
          })) };
        },
        add() { return forbidden('add'); }, doc() { return { set: () => forbidden('set'), update: () => forbidden('update'), delete: () => forbidden('delete') }; }
      };
      return query;
    }, batch() { writes.push({ op: 'batch' }); throw Error('Unexpected batch'); }, runTransaction() { writes.push({ op: 'transaction' }); throw Error('Unexpected transaction'); }
  };
  const context = vm.createContext({ S, db, document, window: { document, BOOM_RENT: Rent, BOOM_PROPERTY_DOSSIER_ENGINE: Engine },
    URL, Date, Intl, JSON, String, Number, Array, Set, Map, Promise,
    console: { log() {}, error() {}, warn() {} }, performance: { now: () => 0 }, isSafariDesktop: false,
    isAdmin: () => S.profile.role === 'admin', isLandlord: () => false,
    checkAlerts() {}, invalidateRentSnapshot() {}, renderPage() {}, buildNav() {}, toast() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  });
  vm.runInContext(dossier, context);
  const UI = context.window.BOOM_PROPERTY_DOSSIER;
  UI.configure({ state: () => S, render: () => rendered.push(UI.render(S, UI.parseRoute(S.page), UI.load)), navigate() {}, refresh() {}, actions: {} });
  const realSetSource = UI.setSourceState;
  UI.setSourceState = status => { sourceStates.push(status); realSetSource(status); };
  vm.runInContext(loaders, context);
  return { S, UI, reads, writes, timers, sourceStates, rendered, storage, release,
    run: code => vm.runInContext(code, context), setFailure: value => { failure = value; },
    async timer(delay) { const idx = timers.findIndex(t => t.delay === delay); assert.ok(idx >= 0, 'timer exists: ' + delay); const [timer] = timers.splice(idx, 1); return timer.callback(); }
  };
}
function data() { const rows = base(); delete rows.page; delete rows.profile; rows.properties[0].name = 'Fresh property'; rows.tasks = [{ id: 'fresh-task', propertyId: 'p1', status: 'pending' }]; return rows; }

await test('actual admin loader reports loading before data arrives and ready only after every core read', async () => {
  const network = data(), h = harness({ network, hold: true });
  const before = JSON.stringify(h.S);
  const pending = h.run('loadDataFresh(false)');
  assert.equal(h.UI.load.status, 'loading');
  assert.equal(h.UI.load.checkedAt, null);
  assert.equal(JSON.stringify(h.S), before);
  h.release();
  await pending;
  assert.deepEqual(h.sourceStates, ['loading', 'ready']);
  assert.equal(h.S.properties[0].name, 'Fresh property');
  assert.ok(h.UI.load.checkedAt);
  assert.equal(h.UI.load.counts.properties, 1);
  assert.ok(h.rendered.at(-1).includes('Ultima lettura'));
  assert.deepEqual(Object.fromEntries(h.reads.map(r => [r.name, r.cap])), CORE_LIMITS);
  assert.equal(h.writes.length, 0);
});
await test('a failed refresh retains every previous core record and does not issue a new freshness stamp', async () => {
  const h = harness({ network: data() });
  await h.run('loadDataFresh(false)');
  const before = JSON.stringify(h.S), checkedAt = h.UI.load.checkedAt;
  h.setFailure('documents');
  await h.run('loadDataFresh(false)');
  assert.equal(JSON.stringify(h.S), before);
  assert.equal(h.UI.load.status, 'error');
  assert.equal(h.UI.load.checkedAt, checkedAt);
  assert.deepEqual(h.sourceStates.slice(-2), ['loading', 'error']);
  assert.ok(h.rendered.at(-1).includes('Aggiornamento non riuscito'));
  assert.ok(!h.rendered.at(-1).includes('Ultima lettura'));
  assert.equal(h.writes.length, 0);
});
await test('same-user cache boots as cached, clears the old stamp and refreshes through the actual delayed loader', async () => {
  const h = harness({ network: data(), cache: { uid: 'admin-test', role: 'admin', timestamp: Date.now(), data: { ...data(), properties: [{ id: 'p1', name: 'Cached property', ownerId: 'owner' }] } } });
  h.UI.setSourceState('ready');
  assert.ok(h.UI.load.checkedAt);
  await h.run('loadData()');
  assert.equal(h.UI.load.status, 'cached');
  assert.equal(h.UI.load.checkedAt, null);
  assert.equal(h.S.properties[0].name, 'Cached property');
  assert.equal(h.reads.length, 0);
  assert.ok(h.rendered.at(-1).includes('Ultimi dati salvati'));
  await h.timer(2000);
  assert.equal(h.UI.load.status, 'ready');
  assert.equal(h.S.properties[0].name, 'Fresh property');
  assert.deepEqual(h.sourceStates.slice(-3), ['cached', 'loading', 'ready']);
  assert.equal(h.writes.length, 0);
});
await test('cache from another user is discarded and never appears in the dossier', async () => {
  const h = harness({ network: data(), cache: { uid: 'other-user', role: 'admin', timestamp: Date.now(), data: { properties: [{ id: 'p1', name: 'Foreign private cache' }] } } });
  await h.run('loadData()');
  assert.equal(h.UI.load.status, 'ready');
  assert.equal(h.sourceStates.includes('cached'), false);
  assert.ok(h.rendered.every(html => !html.includes('Foreign private cache')));
  assert.equal(h.storage.has('boom_data_cache'), false);
});
await test('a full core query advertises partial coverage instead of claiming a complete archive', async () => {
  const network = data();
  network.properties.push(...Array.from({ length: 399 }, (_, i) => ({ id: 'other-' + i, name: 'Other property', ownerId: 'owner' })));
  const h = harness({ network });
  await h.run('loadDataFresh(false)');
  assert.equal(h.UI.load.counts.properties, 400);
  assert.ok(h.rendered.at(-1).includes('Archivio parziale: raggiunto il limite di caricamento'));
  assert.equal(h.writes.length, 0);
});
await test('lazy task loading and overdue display make no database writes or payment settlement claims', async () => {
  const network = data(), before = JSON.stringify(network), h = harness({ network });
  await h.run('loadDataFresh(false)');
  assert.equal(h.S.payments[0].status, 'overdue');
  assert.equal(network.payments[0].status, 'pending');
  assert.equal(h.S.tasks[0].id, 'old-task');
  await h.timer(500);
  assert.equal(h.S.tasks[0].id, 'fresh-task');
  assert.equal(h.reads.find(r => r.name === 'tasks').cap, 800);
  assert.equal(h.writes.length, 0);
  assert.equal(JSON.stringify(network), before);
  assert.equal(h.S.payments[0].paidDate, undefined);
  assert.equal(h.S.payments[0].bankTxId, undefined);
});
console.log(`\n${checks} verifiche caricamento fascicolo superate; rete simulata, zero scritture di gestione.`);
