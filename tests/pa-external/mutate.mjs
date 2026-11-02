// Ogni difetto reintrodotto deve far cadere la suite: se una mutazione
// passa, il test non protegge quello che dice di proteggere.
import { spawnSync } from 'node:child_process';
const mutations = ['no-occupancy', 'no-obligations', 'welcome-twice', 'welcome-partial-twice', 'fee-at-signing', 'invoice-rewritten', 'profile-role-blind', 'profile-duplicate', 'no-pa-stamp', 'schedule-unasked'];
for (const mutation of mutations) {
  const r = spawnSync(process.execPath, [new URL('./run.mjs', import.meta.url).pathname], { env: { ...process.env, PAEXT_MUTATION: mutation }, encoding: 'utf8', timeout: 60000 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  if (r.error || r.status === 0 || !/AssertionError|FAIL/.test(out)) throw Error('Mutation not caught: ' + mutation + '\n' + out.slice(-2000));
  console.log('KILLED ' + mutation);
}
console.log(`PA external: ${mutations.length} mutations killed`);
