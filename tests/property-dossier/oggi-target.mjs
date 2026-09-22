// Pure Oggi → property navigation: exact confirmed references, no reads/writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const E = require('../../js/segretaria-casi-engine.js');
const source = readFileSync(new URL('../../js/segretaria-casi-engine.js', import.meta.url), 'utf8');
const TASK_ID = 'sg_' + 'a'.repeat(32);
let checks = 0;
function test(label, run) { run(); checks++; console.log('  ✓ ' + label); }
function task(changes = {}, taskChanges = {}) {
  return { id: TASK_ID, status: 'open', followUp: { confirmed: true, ambiguous: false, needsReview: false, practiceRef: 'contracts/c1', propertyRef: 'properties/p1', ...changes }, ...taskChanges };
}
function state() { return { properties: [{ id: 'p1', name: 'Casa Uno', ownerId: 'owner' }, { id: 'p2', name: 'Casa Due', ownerId: 'owner' }], listings: [{ id: 'p1', title: 'Separate listing' }], contracts: [{ id: 'c1', propertyId: 'p2' }] }; }
function dossier(changes = {}) { return { identityIncomplete: false, identityAmbiguous: false, practices: [{ ref: 'contracts/c1', propertyRefs: ['properties/p1'] }], properties: [{ ref: 'properties/p1', label: 'Casa Uno' }], ...changes }; }
function reject(t, d, s = state(), engine = E) { const result = engine.propertyTarget(t, d, s); assert.equal(result.id, null); assert.equal(typeof result.reason, 'string'); assert.ok(result.reason.length > 0); return result; }
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

test('a saved confirmed property reference opens that exact loaded property without needing a dossier', () => {
  assert.deepEqual(E.propertyTarget(task(), null, state()), { id: 'p1', reason: '' });
  assert.deepEqual(E.propertyTarget(task(), undefined, state()), { id: 'p1', reason: '' });
});
test('a provided dossier must agree with the explicitly selected practice', () => {
  assert.deepEqual(E.propertyTarget(task(), dossier(), state()), { id: 'p1', reason: '' });
  reject(task(), dossier({ practices: [{ ref: 'contracts/c1', propertyRefs: ['properties/p2'] }] }));
});
test('multiple practices remain usable when the chosen practice has one matching property', () => {
  const d = dossier({ ambiguous: true, practices: [{ ref: 'contracts/c1', propertyRefs: ['properties/p1'] }, { ref: 'contracts/c2', propertyRefs: ['properties/p2'] }] });
  assert.equal(E.propertyTarget(task(), d, state()).id, 'p1');
});
test('a listing with the same ID as a managed property never crosses namespace boundaries', () => {
  reject(task({ propertyRef: 'listings/p1' }), null);
  reject(task({ propertyRef: 'listings/p1' }), dossier({ practices: [{ ref: 'contracts/c1', propertyRefs: ['listings/p1'] }] }));
});
test('unconfirmed, ambiguous and review-required cases do not offer property navigation', () => {
  for (const changes of [{ confirmed: false }, { confirmed: undefined }, { confirmed: 'true' }, { ambiguous: true }, { needsReview: true }]) reject(task(changes), null);
});
test('closed or malformed cases are unavailable even with a known property reference', () => {
  for (const status of ['closed', 'done', 'pending', '', undefined]) reject(task({}, { status }), dossier());
  for (const id of ['', 'task1', 'sg_bad', null]) reject(task({}, { id }), dossier());
  reject(null, null);
  reject(task({}, { followUp: null }), null);
  reject(task({}, { followUp: [] }), null);
});
test('practice and property references must be explicit, with no inference from a contract or a name', () => {
  for (const practiceRef of ['', ' ', null, undefined]) reject(task({ practiceRef }), null);
  for (const propertyRef of ['', null, undefined]) reject(task({ propertyRef, propertyName: 'Casa Due', contactName: 'owner' }), dossier());
  reject(task({ propertyRef: 'contracts/c1' }), null);
});
test('property reference grammar rejects empty, nested, control, dot and padded path segments', () => {
  for (const propertyRef of ['properties/', 'properties/p1/extra', 'properties/p1\n', 'properties/p1\u0000', 'properties/p1\u007f', 'properties/.', 'properties/..', ' properties/p1', 'properties/p1 ', 'properties/ p1', '/properties/p1', 42, {}]) reject(task({ propertyRef }), null);
});
test('valid special-character IDs remain literal and need an exact loaded record', () => {
  const id = 'casa ?#&é';
  assert.equal(E.propertyTarget(task({ propertyRef: 'properties/' + id }), null, { properties: [{ id }] }).id, id);
  reject(task({ propertyRef: 'properties/%70%31' }), null);
});
test('unloaded properties cannot be replaced by a matching listing, owner, name or dossier label', () => {
  reject(task(), dossier(), { properties: [{ id: 'p2', name: 'Casa Uno', ownerId: 'owner' }], listings: [{ id: 'p1' }] });
  reject(task(), dossier(), {});
  reject(task(), dossier(), { properties: null });
});
test('identity blocks in a provided dossier veto navigation', () => {
  reject(task(), dossier({ identityIncomplete: true }));
  reject(task(), dossier({ identityAmbiguous: true }));
});
test('missing, duplicate and malformed selected-practice evidence is unavailable', () => {
  for (const d of [{}, { practices: null }, { practices: [] }, { practices: [{ ref: 'contracts/other', propertyRefs: ['properties/p1'] }] }, { practices: [null] }, [], 'bad dossier']) reject(task(), d);
  reject(task(), dossier({ practices: [{ ref: 'contracts/c1', propertyRefs: ['properties/p1'] }, { ref: 'contracts/c1', propertyRefs: ['properties/p2'] }] }));
});
test('missing, conflicting or multiple propertyRefs never silently select the first match', () => {
  for (const propertyRefs of [undefined, null, 'properties/p1', [], ['properties/p2'], ['properties/p1', 'properties/p2'], ['properties/p1', 'properties/p1'], ['listings/p1']]) reject(task(), dossier({ practices: [{ ref: 'contracts/c1', propertyRefs }] }));
});
test('a changed association is re-evaluated from current inputs instead of a cached target', () => {
  const t = task(), d = dossier(), s = state();
  assert.equal(E.propertyTarget(t, d, s).id, 'p1');
  t.followUp.propertyRef = 'properties/p2';
  reject(t, d, s);
  d.practices[0].propertyRefs = ['properties/p2'];
  assert.equal(E.propertyTarget(t, d, s).id, 'p2');
  s.properties = s.properties.filter(p => p.id !== 'p2');
  reject(t, d, s);
});
test('deeply frozen inputs are unchanged and unrelated properties do not alter the selected target', () => {
  const t = freeze(task()), d = freeze(dossier()), s = freeze(state());
  const before = JSON.stringify({ t, d, s });
  assert.equal(E.propertyTarget(t, d, s).id, 'p1');
  assert.equal(JSON.stringify({ t, d, s }), before);
});
function browserEngine(code) { const context = { window: {} }; vm.runInNewContext(code, context); return context.window.BOOM_SEGRETARIA_CASI; }
test('browser UMD exposes the same property target without IO dependencies', () => {
  const browser = browserEngine(source);
  assert.equal(browser.propertyTarget(task(), dossier(), state()).id, 'p1');
  reject(task({ propertyRef: 'listings/p1' }), null, state(), browser);
});
test('mutation: accepting listings as managed properties breaks the namespace invariant', () => {
  const from = '^properties\\/';
  assert.ok(source.includes(from), 'namespace mutation target exists');
  reject(task({ propertyRef: 'listings/p1' }), null, state(), browserEngine(source));
  const mutant = browserEngine(source.replace(from, '^(?:properties|listings)\\/'));
  assert.throws(() => reject(task({ propertyRef: 'listings/p1' }), null, state(), mutant));
});
test('mutation: ignoring contradictory propertyRefs breaks the same selection invariant', () => {
  const from = '!Array.isArray(refs) || refs.length !== 1 || refs[0] !== ref';
  assert.ok(source.includes(from), 'conflict mutation target exists');
  const d = dossier({ practices: [{ ref: 'contracts/c1', propertyRefs: ['properties/p2'] }] });
  reject(task(), d, state(), browserEngine(source));
  const mutant = browserEngine(source.replace(from, 'false'));
  assert.throws(() => reject(task(), d, state(), mutant));
});
console.log(`\n${checks} verifiche Oggi → immobile superate; nessuna lettura o scrittura.`);
