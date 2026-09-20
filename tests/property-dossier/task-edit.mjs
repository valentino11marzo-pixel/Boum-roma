// Exercise the actual saveTask handler: changing details cannot reopen work.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const begin = source.indexOf('    async function saveTask()');
const end = source.indexOf('    // ═', begin);
assert.ok(begin > 0 && end > begin, 'actual saveTask boundaries exist');
const handler = source.slice(begin, end);
let checks = 0;
async function test(label, run) { await run(); checks++; console.log('  ✓ ' + label); }

function harness({ localStatus = 'done', storedStatus = localStatus, create = false, fail = false, code = handler } = {}) {
  const metadata = { completedAt: '2026-09-19T10:00:00Z', completedBy: 'another-admin', cancelledAt: '2026-09-18T10:00:00Z', cancelledBy: 'operator' };
  const local = { id: 'task1', title: 'Existing task', propertyId: 'p1', contractId: 'c1', status: localStatus, ...metadata };
  const S = { profile: { id: 'admin-test' }, tasks: create ? [] : [local] };
  const records = new Map(create ? [] : [['task1', { ...local, status: storedStatus }]]);
  const writes = [], events = [];
  const values = { taskId: create ? '' : 'task1', taskTitle: 'Updated title', taskCategory: 'contract', taskPriority: 'high', taskDueDate: '2026-10-01', taskNotes: 'Updated note', taskLinkedClient: '', taskRecurringInterval: 'monthly' };
  const context = vm.createContext({ S,
    document: { getElementById: id => ({ value: values[id] || '', checked: false }) },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
    db: { collection(name) {
      assert.equal(name, 'tasks');
      return {
        doc(id) { return { async update(data) {
          writes.push({ operation: 'update', id, data: structuredClone(data) });
          if (fail) throw Error('Simulated update failure');
          records.set(id, { ...records.get(id), ...structuredClone(data) });
        } }; },
        async add(data) {
          writes.push({ operation: 'add', data: structuredClone(data) });
          if (fail) throw Error('Simulated creation failure');
          records.set('new-task', structuredClone(data));
          return { id: 'new-task' };
        }
      };
    } },
    toast: (...args) => events.push(['toast', ...args]), logActivity: (...args) => events.push(['activity', ...args]),
    closeModal: () => events.push(['close']), renderPage: () => events.push(['render']), buildNav: () => events.push(['navigation'])
  });
  vm.runInContext(code, context);
  return { S, records, writes, events, metadata, values, save: () => vm.runInContext('saveTask()', context) };
}

async function verifyPreservedStatus(code, localStatus = 'done', storedStatus = localStatus) {
  const h = harness({ code, localStatus, storedStatus });
  await h.save();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].operation, 'update');
  assert.equal(Object.hasOwn(h.writes[0].data, 'status'), false, 'detail updates omit workflow status entirely');
  assert.equal(h.records.get('task1').status, storedStatus);
  assert.equal(h.S.tasks[0].status, localStatus);
  assert.equal(h.records.get('task1').notes, 'Updated note');
  assert.equal(h.S.tasks[0].notes, 'Updated note');
  return h;
}

await test('editing completed, in-progress or cancelled work preserves its workflow state', async () => {
  for (const status of ['done', 'in_progress', 'cancelled']) await verifyPreservedStatus(handler, status);
});
await test('a newer stored completion wins over a stale pending browser snapshot without a read/write race', async () => {
  const h = await verifyPreservedStatus(handler, 'pending', 'done');
  assert.equal(h.records.get('task1').completedAt, h.metadata.completedAt);
  assert.equal(h.writes[0].data.status, undefined);
});
await test('editing details leaves completion/cancellation metadata and property/contract references untouched', async () => {
  const h = await verifyPreservedStatus(handler);
  for (const [key, value] of Object.entries(h.metadata)) {
    assert.equal(Object.hasOwn(h.writes[0].data, key), false);
    assert.equal(h.records.get('task1')[key], value);
    assert.equal(h.S.tasks[0][key], value);
  }
  assert.equal(h.records.get('task1').propertyId, 'p1');
  assert.equal(h.records.get('task1').contractId, 'c1');
});
await test('creation still starts pending, with author/date and without invented completion metadata', async () => {
  const h = harness({ create: true });
  await h.save();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].operation, 'add');
  assert.equal(h.writes[0].data.status, 'pending');
  assert.equal(h.records.get('new-task').status, 'pending');
  assert.equal(h.records.get('new-task').createdBy, 'admin-test');
  assert.equal(h.records.get('new-task').createdAt, 'server-time');
  assert.equal(h.S.tasks[0].status, 'pending');
  assert.equal(h.S.tasks[0].completedAt, undefined);
});
await test('failed update leaves the local snapshot and completion metadata intact and the editor open', async () => {
  const h = harness({ fail: true }), before = JSON.stringify(h.S), storedBefore = JSON.stringify(h.records.get('task1'));
  await h.save();
  assert.equal(JSON.stringify(h.S), before);
  assert.equal(JSON.stringify(h.records.get('task1')), storedBefore);
  assert.ok(h.events.some(e => e[0] === 'toast' && e[1] === 'error'));
  assert.equal(h.events.some(e => ['close', 'render', 'activity'].includes(e[0])), false);
});
await test('mutation: restoring the pending status in edit fails the same real-handler invariant', async () => {
  assert.ok(handler.includes('delete data.status;'), 'mutation target exists');
  await verifyPreservedStatus(handler);
  const mutant = handler.replace('delete data.status;', '/* regression: status pending leaks into update */');
  await assert.rejects(() => verifyPreservedStatus(mutant));
});
console.log(`\n${checks} verifiche modifica attività superate; rete simulata e stato conservato.`);
