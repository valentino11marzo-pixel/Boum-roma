import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let failed = 0;
for (const mutation of ['guards', 'fee', 'return', 'reuse', 'labels']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, PAYMENT_LINKS_MUTATION: mutation },
  });
  const failures = (result.stdout.match(/^FAIL /gm) || []).length;
  const caught = result.status !== 0 && failures > 0;
  console.log(`${caught ? 'PASS' : 'FAIL'} restored ${mutation} defect: ${failures} checks reject it`);
  if (!caught) { failed++; console.error(result.stdout, result.stderr); }
}
process.exitCode = failed ? 1 : 0;
