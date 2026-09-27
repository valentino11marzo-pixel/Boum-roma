import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const loader = new URL('./owner-command-mutation-loader.mjs', import.meta.url).href;
const register = 'data:text/javascript,' + encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(loader)});`);
const cases = [
  ['first_match', 'omonimi restano due candidati'],
  ['stale_contact', 'recapito stale blocca'],
  ['idempotency_conflict', 'stesso commandId con contenuto diverso'],
  ['caller_id_auth', 'caller ID non autorizza'],
  ['generic_retry_target', 'un recapito cambiato dopo la verifica'],
  ['channel_target', 'un cambio canale non trasforma'],
  ['owner_budget', 'il budget nasce prima del pre-lavoro'],
  ['approval_target', 'la conferma ricontrolla il target owner'],
];
for (const [name, assertion] of cases) {
  const result = spawnSync(process.execPath, ['--import', register,
    fileURLToPath(new URL('./owner-command.mjs', import.meta.url))], {
    env: { ...process.env, OWNER_COMMAND_MUTATION: name }, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(result.status, 1, `mutant ${name} must fail`);
  const output = result.stdout + result.stderr;
  assert.ok(output.includes('FAIL — ' + assertion), `${name} must fail its behavioral assertion: ${output}`);
  console.log('ok — mutation killed: ' + name);
}
console.log(`\nOwner Command mutations: ${cases.length}/${cases.length} killed`);
