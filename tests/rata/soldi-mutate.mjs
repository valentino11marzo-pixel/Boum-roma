// tests/rata/soldi-mutate.mjs — ogni difetto corretto, rimesso apposta, deve
// far cadere tests/rata/soldi.mjs. La mutazione vive SOLO nel loader (o nella
// vm del motore): nessun file del repo viene toccato.
// Uso: node tests/rata/soldi-mutate.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MUTATIONS = [
  'card-gate', 'fee-line', 'utc-date', 'second-report', 'withdraw-proof', 'receipt-email', 'double-alarm', 'utc-paid',
  'moneyback-patch', 'moneyback-mine', 'pi-metadata', 'return-rata', 'report-rome-default',
  'engine-moneyback', 'engine-policy', 'engine-review-pay',
];
let failed = 0;
for (const mutation of MUTATIONS) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./soldi.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, RATA_MUTATION: mutation }, timeout: 120000,
  });
  const fails = (r.stdout.match(/^FAIL /gm) || []).length;
  const caught = r.status !== 0 && fails > 0;
  console.log(`${caught ? 'PASS' : 'FAIL'} difetto «${mutation}» rimesso: ${fails} controlli lo prendono`);
  if (!caught) { failed++; console.error(r.stdout.slice(-2000), r.stderr.slice(-2000)); }
}
console.log(`\nRata · mutazioni: ${MUTATIONS.length - failed} prese, ${failed} sfuggite`);
process.exitCode = failed ? 1 : 0;
