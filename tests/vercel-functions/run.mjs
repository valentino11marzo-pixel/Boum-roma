// Offline deployment regression. Only literal paths and finite brace alternatives
// are admitted: a future wildcard needs an explicit review, never a wider match.
// Vercel documents node-glob semantics for functions keys. No new dependencies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const before = JSON.parse(readFileSync(new URL('./before.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url)));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const group = 'api/homie/{wa-outbox,wa-outbox-single}.js';
const selected = ['wa-outbox', 'wa-outbox-single'].map(x => `api/homie/${x}.js`).sort();

function expand(pattern) {
  assert.match(pattern, /^api\/[a-zA-Z0-9_./{},-]+\.js$/, `Unsupported pattern: ${pattern}`);
  assert.ok(!pattern.includes('..') && !pattern.includes('//'), `Invalid path: ${pattern}`);
  const match = pattern.match(/^([^{}]*)\{([a-zA-Z0-9_-]+(?:,[a-zA-Z0-9_-]+)+)\}([^{}]*)$/);
  if (match) {
    const paths = match[2].split(',').map(x => match[1] + x + match[3]);
    assert.equal(new Set(paths).size, paths.length, `Duplicate alternative: ${pattern}`);
    return paths;
  }
  assert.ok(!/[{},]/.test(pattern), `Invalid alternatives: ${pattern}`);
  return [pattern];
}

function mapping(rules, inventory) {
  const result = {};
  for (const [pattern, settings] of Object.entries(rules)) {
    for (const path of expand(pattern)) {
      assert.ok(inventory.includes(path), `Missing handler: ${path}`);
      assert.ok(!Object.hasOwn(result, path), `Overlapping rules: ${path}`);
      result[path] = settings;
    }
  }
  return result;
}

const expected = mapping(before.functions, files);
function validate(rules, inventory = files) {
  assert.ok(Object.keys(rules).length <= 50, 'More than 50 function rules');
  const actual = mapping(rules, inventory);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), 'Configured handler set changed');
  // Includes every tracked file, so defaults cannot silently acquire overrides.
  for (const file of inventory) assert.deepEqual(actual[file], expected[file], `Settings changed: ${file}`);
  assert.deepEqual(expand(group).sort(), selected, 'Selected handler set changed');
  assert.deepEqual(rules[group], { maxDuration: 60 }, 'Single-delivery group missing or changed');
  return actual;
}

assert.equal(Object.keys(before.functions).length, 51);
assert.equal(Object.keys(config.functions).length, 50);
assert.equal(Object.keys(validate(config.functions)).length, 52);
let mutations = 0;
function rejected(name, mutate, error, inventory = files) {
  const candidate = structuredClone(config.functions);
  mutate(candidate);
  assert.throws(() => validate(candidate, inventory), error, name);
  mutations++;
  console.log(`PASS mutation: ${name}`);
}
assert.throws(() => validate(before.functions), /More than 50/, 'Original 51-rule regression');
mutations++;
rejected('identical overlapping rule', r => { delete r['api/homie/miniera.js']; r['api/homie/message.js'] = { maxDuration: 60 }; }, /Overlapping/);
rejected('divergent overlapping rule', r => { delete r['api/homie/miniera.js']; r['api/homie/message.js'] = { maxDuration: 30 }; }, /Overlapping/);
rejected('group timeout changed', r => { r[group].maxDuration = 30; }, /Settings changed/);
rejected('unrelated timeout changed', r => { r['api/portal/ingest.js'].maxDuration = 60; }, /Settings changed/);
rejected('memory removed', r => { delete r['api/photos/enhance.js'].memory; }, /Settings changed/);
rejected('memory changed', r => { r['api/ops/gtfs-tempi.js'].memory = 1024; }, /Settings changed/);
const includeKey = Object.keys(config.functions).find(k => config.functions[k].includeFiles);
assert.ok(includeKey, 'Fixture must exercise includeFiles');
rejected('included file removed', r => { delete r[includeKey].includeFiles; }, /Settings changed/);
rejected('selected handler omitted', r => {
  r['api/homie/wa-outbox.js'] = r[group]; delete r[group];
}, /handler set changed/);
rejected('widened wildcard', r => { r['api/homie/*.js'] = r[group]; delete r[group]; }, /Unsupported pattern/);
rejected('nonexistent handler', r => { delete r['api/homie/miniera.js']; r['api/homie/not-a-handler.js'] = { maxDuration: 60 }; }, /Missing handler/);
rejected('removed tracked handler', () => {}, /Missing handler/, files.filter(f => f !== selected[0]));
const unconfigured = files.find(f => /^api\/.*\.js$/.test(f) && !expected[f]);
assert.ok(unconfigured, 'Fixture must exercise a default/unconfigured API file');
rejected('new override on unconfigured file', r => { delete r['api/homie/miniera.js']; r[unconfigured] = { maxDuration: 60 }; }, /handler set changed/);
rejected('duplicate brace alternative', r => {
  r['api/homie/{wa-outbox,wa-outbox,wa-outbox-single}.js'] = r[group]; delete r[group];
}, /Duplicate alternative/);
console.log('passed ' + JSON.stringify({ trackedFiles: files.length, rulesBefore: 51, rulesAfter: 50,
  configuredFiles: 52, selected, preservedSettings: true, overlaps: 0, mutationsRejected: mutations }));
