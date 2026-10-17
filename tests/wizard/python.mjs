// tests/wizard/python.mjs — i test python dei bracci sul Mac dentro npm test.
//
// Il bot Telegram, il Pubblicista, lo Scatto, il Contatto e il Postino girano
// sul Mac e si aggiornano da main: i loro test (funzioni pure estratte
// dall'AST o moduli caricati con le dipendenze finte — mai .env, Telegram o
// rete) esistevano ma si lanciavano a mano, quindi la CI non ne vedeva mai uno
// rosso. Il 15/10/2026 il bot scriveva «unfurnished», «monolocale» e
// «Available now» su case dettate senza quei dati: tests/wizard/dati_onesti.py
// lo ferma, ed è giusto che lo fermi a ogni PR. tests/locale/runner.py resta
// fuori: apre un server vero e un Ollama finto su porte locali.
// Senza python3 la suite si salta e lo dice.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUITES = [
  'tests/wizard/local_brain.py',
  'tests/wizard/dati_onesti.py',
  'tests/wizard/disponibilita.py',
  'tests/publisher/runner.py',
  'tests/scout/runner.py',
  'tests/contatto/runner.py',
  'tests/postino/runner.py',
];

const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  console.log('SKIP: python3 non disponibile — i test dei bracci sul Mac non girano qui');
  process.exit(0);
}

let failed = 0;
for (const rel of SUITES) {
  const r = spawnSync('python3', [path.join(ROOT, rel)], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const last = out.trim().split('\n').pop() || '';
  if (r.status === 0) {
    console.log(`✓ ${rel} — ${last}`);
  } else {
    failed++;
    console.log(`✗ ${rel} (exit ${r.status}${r.error ? ', ' + r.error.message : ''})`);
    for (const line of out.split('\n').filter((l) => /^FAIL|Traceback|Error/.test(l)).slice(0, 12)) console.log('   ' + line);
  }
}
console.log(failed ? `\n${failed} suite python fallite su ${SUITES.length}` : `\n${SUITES.length} suite python passed, 0 failed`);
process.exit(failed ? 1 : 0);
