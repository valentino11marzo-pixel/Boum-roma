import { spawnSync } from 'node:child_process';
const mutations = ['missing-intent', 'package-blind-claim', 'receipt-blind-claim'];
for (const mutation of mutations) {
  const result = spawnSync(process.execPath, [new URL('./run.mjs', import.meta.url).pathname], {
    env: { ...process.env, DELIVERY_MUTATION: mutation }, encoding: 'utf8', timeout: 20000,
  });
  const output = String(result.stdout || '') + String(result.stderr || '');
  if (result.error || result.status === 0 || !/Error: FAIL /.test(output)) {
    console.error(output); throw Error('Mutation not rejected by behavioral assertion: ' + mutation);
  }
  console.log('KILLED ' + mutation + ': ' + output.match(/Error: FAIL ([^\n]+)/)[1]);
}
console.log(`Registration delivery mutations: ${mutations.length} killed`);
