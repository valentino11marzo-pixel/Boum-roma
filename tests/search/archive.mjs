import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Archive = require('../../js/portal-search-archive.js');
let assertions = 0;
const check = (value, expected, label) => { assert.deepEqual(value, expected, label); assertions++; };
const user = uid => ({ uid });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const page = (ids, hasMore = false) => ({ rows: ids.map(id => ({ id })), lastId: ids.at(-1) || '', hasMore });
const settle = () => Promise.resolve();
function fixture(readPage, options = {}) {
  let scope = { user: user('admin'), admin: true };
  const changes = [];
  const reader = Archive.create({ readPage, getScope: () => scope, onChange: (...args) => changes.push(args), ...options });
  return { reader, changes, get scope() { return scope; }, set scope(value) { scope = value; } };
}

// Both module consumers execute the actual reader, not a test implementation.
const browser = { self: {} };
vm.runInNewContext(readFileSync(new URL('../../js/portal-search-archive.js', import.meta.url), 'utf8'), browser);
check(typeof browser.self.BOOM_PORTAL_SEARCH_ARCHIVE.create, 'function', 'browser UMD export');
check(Object.keys(Archive.SOURCES).length, 15, 'bounded source allowlist');
for (const size of [0, -1, 201, 1.5, '200']) {
  assert.throws(() => Archive.create({ readPage() {}, getScope() {}, pageSize: size }), RangeError); assertions++;
}

// Each explicit load reads at most one page, including exact-boundary sources.
for (const count of [0, 200, 201]) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: String(i + 1).padStart(4, '0') }));
  const calls = [];
  const f = fixture(async (collection, request) => {
    calls.push({ collection, ...request });
    const start = request.afterId ? rows.findIndex(r => r.id === request.afterId) + 1 : 0;
    const chunk = rows.slice(start, start + request.limit);
    return { rows: chunk, lastId: chunk.at(-1)?.id || '', hasMore: start + chunk.length < rows.length };
  });
  check(calls.length, 0, 'creation does not read');
  check(f.reader.state('property').complete, false, 'idle is not complete');
  check(calls.length, 0, 'state does not read');
  await f.reader.load('property', 'properties');
  check(calls.length, 1, 'exactly one page on explicit load');
  check(calls[0], { collection: 'properties', afterId: null, limit: 200 }, 'bounded first page');
  check(f.reader.state('property').rows.length, Math.min(200, count), 'first-page size');
  check(f.reader.state('property').complete, count <= 200, 'exhaustion comes from adapter');
  if (count === 201) {
    await f.reader.load('property', 'properties');
    check(calls[1].afterId, '0200', 'next page uses previous cursor');
    check(f.reader.state('property').rows.length, 201, 'all rows remain searchable');
  }
  const before = calls.length;
  await f.reader.load('property', 'properties');
  check(calls.length, before, 'complete source performs no extra IO');
  check(f.reader.state('property').hasMore, false, 'complete source has no more pages');
  check(f.changes.every(args => args.length === 0), true, 'notifications carry no data');
}

// Single flight per source, while unrelated sources can load independently.
{
  const reads = [], pending = {};
  const f = fixture((collection) => { reads.push(collection); return (pending[collection] = deferred()).promise; });
  const first = f.reader.load('property', 'properties'), duplicate = f.reader.load('property', 'properties');
  check(first === duplicate, true, 'double load shares the same promise');
  const other = f.reader.load('contract', 'contracts');
  await settle();
  check(reads, ['properties', 'contracts'], 'one IO per source, independent concurrency');
  check(f.reader.state('property').status, 'loading', 'loading is observable');
  pending.contracts.resolve(page(['contract-a'])); await other;
  check(f.reader.state('property').status, 'loading', 'other source does not replace pending state');
  pending.properties.resolve(page(['house-a'])); await first;
  check(f.reader.state('contract').rows.map(r => r.id), ['contract-a'], 'source isolation');
}

// Failure preserves rows and cursor; duplicate IDs update without duplicate hits.
{
  let attempts = 0;
  const cursors = [];
  const f = fixture(async (_, request) => {
    cursors.push(request.afterId); attempts++;
    if (attempts === 1) return { rows: [{ id: 'a', label: 'old' }, { id: 'b' }], lastId: 'b', hasMore: true };
    if (attempts === 2) throw new Error('Network failure containing private content');
    return { rows: [{ id: 'a', label: 'new' }, { id: 'c', label: 'first' }, { id: 'c', label: 'last' }], lastId: 'c', hasMore: false };
  });
  await f.reader.load('property', 'properties');
  const failed = await f.reader.load('property', 'properties');
  check(failed.status, 'error', 'network error is explicit');
  check(failed.error, true, 'error is a boolean, never private exception text');
  check(failed.rows.map(r => r.id), ['a', 'b'], 'failure preserves earlier page');
  check(failed.hasMore, true, 'failed page remains retryable');
  await f.reader.load('property', 'properties');
  check(cursors, [null, 'b', 'b'], 'retry uses the unchanged cursor');
  check(f.reader.state('property').rows, [{ id: 'a', label: 'new' }, { id: 'b' }, { id: 'c', label: 'last' }], 'duplicates within/across pages collapse by ID');
  check(f.reader.state('property').error, false, 'retry clears the error');
  const exposed = f.reader.state('property'); exposed.rows[0].label = 'tampered'; exposed.rows.pop();
  check(f.reader.state('property').rows[0].label, 'new', 'snapshot top-level fields are detached');
  check(f.reader.state('property').rows.length, 3, 'snapshot array is detached');
}

// The same UID on a different auth object is still a different session.
for (const mode of ['account', 'same-uid', 'role', 'logout', 'reset']) {
  const requests = [];
  const f = fixture(() => { const d = deferred(); requests.push(d); return d.promise; });
  const pending = f.reader.load('property', 'properties'); await settle();
  if (mode === 'account') f.scope = { user: user('other'), admin: true };
  if (mode === 'same-uid') f.scope = { user: user('admin'), admin: true };
  if (mode === 'role') f.scope.admin = false;
  if (mode === 'logout') f.scope = null;
  if (mode === 'reset') f.reader.reset();
  requests[0].resolve(page(['private-old']));
  check((await pending).rows, [], `${mode}: stale promise does not disclose rows`);
  check(f.reader.state('property').rows, [], `${mode}: stale completion never commits`);
  check(f.reader.state('property').status, 'idle', `${mode}: stale completion does not mark ready`);
  if (mode === 'role' || mode === 'logout') {
    await f.reader.load('property', 'properties');
    check(requests.length, 1, `${mode}: invalid scope performs no IO`);
  }
}

// Old requests cannot alter a newer load, including failure completions.
for (const fails of [false, true]) {
  const requests = [];
  const f = fixture(() => { const d = deferred(); requests.push(d); return d.promise; });
  const first = f.reader.load('property', 'properties'); await settle();
  f.scope = { user: user('next'), admin: true };
  const second = f.reader.load('property', 'properties'); await settle();
  requests[1].resolve(page(['current'])); await second;
  if (fails) requests[0].reject(new Error('old account')); else requests[0].resolve(page(['old']));
  check((await first).rows, [], 'stale response does not return current account rows either');
  check(f.reader.state('property').rows.map(r => r.id), ['current'], 'newer load survives old completion');
  check(f.reader.state('property').status, 'ready', 'old failure cannot overwrite current status');
}

// An observed role change invalidates pending work even after restoration.
{
  const d = deferred(), f = fixture(() => d.promise);
  const pending = f.reader.load('property', 'properties'); await settle();
  f.scope.admin = false;
  check(f.reader.state('property').rows, [], 'state invalidates revoked scope without notification');
  const changes = f.changes.length;
  f.scope.admin = true;
  f.reader.state('property');
  check(f.changes.length, changes, 'state/getScope never notify recursively');
  d.resolve(page(['before-revocation'])); await pending;
  check(f.reader.state('property').rows, [], 'restored admin cannot revive old request');
}

// Validate source pairs and page contracts before any row/cursor is changed.
{
  let reads = 0;
  const f = fixture(async () => { reads++; return page([]); });
  for (const pair of [['unknown', 'properties'], ['property', 'users'], ['__proto__', 'properties'], ['person', 'messages'], [['property'], 'properties']]) {
    await assert.rejects(f.reader.load(...pair), TypeError); assertions++;
  }
  assert.throws(() => f.reader.state('__proto__'), TypeError); assertions++;
  check(reads, 0, 'unknown sources never reach IO');
  for (const [kind, collection] of Object.entries(Archive.SOURCES)) await f.reader.load(kind, collection);
  check(reads, 15, 'all canonical source pairs are accepted');
}
for (const invalid of [null, page(Array.from({ length: 201 }, (_, i) => String(i))),
  { rows: [{ id: 'ok' }, { id: '' }], lastId: 'ok', hasMore: false },
  { rows: [{ id: 'ok' }], lastId: '', hasMore: true },
  { rows: [], lastId: 'still-more', hasMore: true },
  { rows: [], lastId: '', hasMore: 'yes' }]) {
  const f = fixture(async () => invalid);
  await f.reader.load('property', 'properties');
  check(f.reader.state('property').status, 'error', 'invalid page is explicitly rejected');
  check(f.reader.state('property').rows, [], 'invalid page never partially commits');
}

// There is no hidden total-record cap; each additional page needs a user call.
{
  let pages = 0;
  const f = fixture(async () => {
    const start = pages++ * 200;
    return page(Array.from({ length: 200 }, (_, i) => String(start + i).padStart(5, '0')), pages < 26);
  });
  for (let i = 0; i < 26; i++) await f.reader.load('property', 'properties');
  check(pages, 26, 'one page per call beyond 5000 records');
  check(f.reader.state('property').rows.length, 5200, 'no silent source cap');
  check(f.reader.state('property').complete, true, 'last adapter page exhausts the scan');
}

// Scope can change between the explicit action and the first IO microtask.
{
  let reads = 0;
  const f = fixture(async () => { reads++; return page(['private']); });
  const pending = f.reader.load('property', 'properties');
  f.scope = null;
  await pending;
  check(reads, 0, 'logout before dispatch cancels IO');
  check(f.reader.state('property').hasMore, false, 'unauthorized state offers no next page');
}

// Deliberately restore the three critical defects: these scenarios must fail.
const actualSource = readFileSync(new URL('../../js/portal-search-archive.js', import.meta.url), 'utf8');
function mutation(from, to) {
  assert.ok(actualSource.includes(from)); assertions++;
  const context = { self: {} };
  vm.runInNewContext(actualSource.replace(from, to), context);
  return context.self.BOOM_PORTAL_SEARCH_ARCHIVE;
}
async function protectsSession(api, change) {
  let scope = { user: user('admin'), admin: true };
  const d = deferred(), reader = api.create({ readPage: () => d.promise, getScope: () => scope });
  const pending = reader.load('property', 'properties'); await settle();
  scope = change(scope);
  d.resolve(page(['private']));
  assert.equal((await pending).rows.length, 0);
  assert.equal(reader.state('property').rows.length, 0);
}
await protectsSession(Archive, () => ({ user: user('admin'), admin: true }));
await assert.rejects(protectsSession(
  mutation('if (next !== user)', 'if ((next && next.uid) !== (user && user.uid))'),
  () => ({ user: user('admin'), admin: true })
), { code: 'ERR_ASSERTION' }); assertions++;
await protectsSession(Archive, scope => ({ ...scope, admin: false }));
await assert.rejects(protectsSession(
  mutation('scope.admin === true', 'true'),
  scope => ({ ...scope, admin: false })
), { code: 'ERR_ASSERTION' }); assertions++;
async function oneFlight(api) {
  let reads = 0;
  const d = deferred(), current = user('admin');
  const reader = api.create({ readPage: () => { reads++; return d.promise; }, getScope: () => ({ user: current, admin: true }) });
  const first = reader.load('property', 'properties'), second = reader.load('property', 'properties');
  await settle(); d.resolve(page([])); await Promise.all([first, second]);
  assert.equal(reads, 1);
}
await oneFlight(Archive);
await assert.rejects(oneFlight(mutation('if (entry.pending) return entry.pending;', '/* single-flight guard removed */')), { code: 'ERR_ASSERTION' }); assertions++;

console.log(`Portal search archive: ${assertions} assertions passed`);
