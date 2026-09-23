import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const loader = new URL('./outbox-single-mutation-loader.mjs', import.meta.url).href;
const register = 'data:text/javascript,' + encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(loader)});`);
const cases = [
  ['selection', 'selection binding rejects wrong revision'],
  ['ack_binding', 'bulk ACK cannot bypass selected binding'],
  ['claim_cas', 'CAS vetoes concurrent queue modification'],
  ['case_cas', 'CAS vetoes concurrent task modification'],
  ['expiry', 'expired or unverifiable time is refused'],
  ['exact_text', 'approved whitespace, Unicode and >2000 chars survive transport unchanged'],
  ['one_payload', 'claim returns exactly the target'],
  ['inspect_readonly', 'inspect returns one valid selection'],
  ['inspect_private', 'inspect returns metadata only'],
];
for (const [name, assertion] of cases) {
  const result = spawnSync(process.execPath, ['--import', register,
    fileURLToPath(new URL('./outbox-single.mjs', import.meta.url))], {
    env: { ...process.env, HOMIE_SINGLE_TEST_MUTATION: name }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 1, `mutant ${name} must fail (${result.stderr})`);
  assert.ok(result.stderr.includes('MUTATION_APPLIED:' + name), name + ' actually applied');
  assert.ok(result.stderr.includes(assertion), `mutant ${name} must fail its behavioral assertion: ${result.stderr}`);
  console.log('PASS mutation killed: ' + name);
}
console.log(`\n${cases.length}/${cases.length} mutations killed`);
