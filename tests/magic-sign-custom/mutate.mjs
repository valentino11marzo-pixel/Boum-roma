import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const expected = {
  storage: 'simultaneous creation returns one request',
  consent: 'consent and valid image required', retry: 'PDF failure preserves signatures', cas: 'simultaneous signers conflict',
  fields: 'original bytes and fields cannot change', bytes: 'original bytes and fields cannot change', final: 'PDF failure preserves signatures',
};
const results = await Promise.all(Object.entries(expected).map(([mutation, assertion]) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--loader', new URL('./mutation-loader.mjs', import.meta.url).href, new URL('./run.mjs', import.meta.url).pathname], { env: { ...process.env, BOOM_CUSTOM_SIGN_MUTATION: mutation }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', reject); child.on('close', code => resolve({ mutation, assertion, code, output }));
})));
for (const r of results) { assert(r.code !== 0 && r.output.includes('FAIL ' + r.assertion), 'Mutation must fail its behavioral assertion: ' + r.mutation + '\n' + r.output); console.log('PASS mutation caught: ' + r.mutation); }
