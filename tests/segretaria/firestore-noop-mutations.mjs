import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const loader = new URL('./firestore-noop-mutation-loader.mjs', import.meta.url).href;
const register = 'data:text/javascript,' + encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(loader)});`);
const cases = [
  ['old_task_rewrite', 'claim preserves raw guard document operatorTasks/'],
  ['old_contact_rewrite', 'claim guard uses an explicit empty mask conversations/'],
  ['omitted_mask', 'empty masked write preserves raw data operatorTasks/probe'],
  ['omitted_precondition', 'full microsecond updateTime preconditions remain on wire'],
  ['weakened_precondition', 'full microsecond updateTime preconditions remain on wire'],
  ['omitted_task_guard', 'real claim includes all three CAS documents: present'],
  ['omitted_conversation_guard', 'real claim includes all three CAS documents: present'],
  ['old_execution_task', 'execution guard sends zero replacement fields operatorTasks/'],
  ['old_approval_contact', 'approval guard sends zero replacement fields conversations/'],
  ['old_approval_proof', 'approval guard sends zero replacement fields leads/leadA'],
];
for (const [name, assertion] of cases) {
  const result = spawnSync(process.execPath, ['--import', register,
    fileURLToPath(new URL('./firestore-noop.mjs', import.meta.url))], {
    env: { ...process.env, FIRESTORE_NOOP_MUTATION: name }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 1, `mutant ${name} must fail (${result.stderr})`);
  assert.ok(result.stderr.includes('MUTATION_APPLIED:' + name), name + ' must actually apply');
  assert.ok(result.stderr.includes('AssertionError') && result.stderr.includes(assertion),
    `mutant ${name} must fail the expected behavioral assertion, not fixture setup: ${result.stderr}`);
  console.log('PASS mutation killed: ' + name + ' — ' + assertion);
}
console.log(`\n${cases.length}/${cases.length} Firestore no-op mutations killed; mutation checks passed, all I/O synthetic`);
