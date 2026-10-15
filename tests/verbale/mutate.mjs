import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const loader = new URL('./mutation-loader.mjs', import.meta.url).href;
const suite = new URL('./run.mjs', import.meta.url).pathname;
const run = mutation => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--loader', loader, suite], {
    env: { ...process.env, BOOM_VERBALE_MUTATION: mutation }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', reject); child.on('close', code => resolve({ code, output }));
});
for (const [mutation, result] of await Promise.all(['name', 'image'].map(async m => [m, await run(m)]))) {
  assert(result.code !== 0 && /FAIL (nome vuoto|PNG corrotto)/.test(result.output), 'Mutation must break a behavioral assertion: ' + mutation + '\n' + result.output);
  console.log('PASS restored ' + mutation + ' defect is detected by real-handler tests');
}
