// tests/run-all.mjs — tutte le suite, un comando.
//
//   npm test                    tutte
//   npm test -- money safari    solo quelle nominate
//
// Le suite che richiedono un browser (safari) si auto-skippano quando
// playwright-core non c'è, così `npm test` gira ovunque senza setup.

import { spawn } from 'node:child_process';

const SUITES = [
  { name: 'money',    file: 'tests/money/run.mjs',        what: 'percorsi soldi: checkout, webhook, conversione PA' },
  { name: 'fiscal',   file: 'tests/fiscal/test.mjs',      what: 'motore scadenze fiscali' },
  { name: 'canone',   file: 'tests/fiscal/canone.mjs',    what: 'canone concordato: fasce, cap, superficie convenzionale, verdetto' },
  { name: 'taxpack',  file: 'tests/taxpack/test.mjs',     what: 'pacchetto commercialista' },
  { name: 'journey',  file: 'tests/journey/steps.mjs',    what: 'regole commerciali delle email automatiche' },
  { name: 'review',   file: 'tests/journey/review-url.mjs', what: 'link recensione Google' },
  { name: 'dossier',  file: 'tests/dossier/run.mjs',      what: 'fascicolo ARPE: autorizzazione e upload' },
  { name: 'lock',     file: 'tests/lock/run.mjs',         what: 'lucchetto immobile: due candidati non chiudono lo stesso' },
  { name: 'bonifico', file: 'tests/bonifico/run.mjs',     what: 'bonifico gratuito: causale, abbinamento certo' },
  { name: 'fee',      file: 'tests/bonifico/fee.mjs',     what: 'commissione misurata sul costo reale Stripe' },
  { name: 'parity',   file: 'tests/bonifico/parity.mjs',  what: 'la causale mostrata = quella che la banca riconosce' },
  { name: 'iban',     file: 'tests/iban/run.mjs',         what: 'un IBAN sbagliato non arriva mai in /casa' },
  { name: 'photoreal',file: 'tests/photoreal/run.mjs',    what: '3D isolato: camera prima del tileset, comandi, chiusura' },
  { name: 'photos',   file: 'tests/photos/sweep.mjs',     what: 'sweep notturno: chi si cura e in che ordine' },
  { name: 'copy',     file: 'tests/copy/run.mjs',         what: 'descrizioni: riscrive i template, mai le parole di un umano' },
  { name: 'geo',      file: 'tests/geo/run.mjs',          what: 'precisione dei pin: portone, strada o quartiere — mai spacciati' },
  { name: 'scheda',   file: 'tests/scheda/run.mjs',       what: 'La Scheda: token derivati, prefill, lock post-firma, doppio schema' },
  { name: 'notify',   file: 'tests/notify/run.mjs',       what: 'ciclo email contratto: CAF una volta sola, inviti per ruolo e lingua' },
  { name: 'safari',   file: 'tests/safari/boot.mjs',      what: 'nessuna pagina autenticata resta appesa' },
];

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const suites = want.length ? SUITES.filter((s) => want.includes(s.name)) : SUITES;
if (!suites.length) {
  console.error('Nessuna suite con questo nome. Disponibili: ' + SUITES.map((s) => s.name).join(', '));
  process.exit(2);
}

const run = (file) => new Promise((resolve) => {
  const p = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out }));
});

const B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', X = '\x1b[0m';
let failed = [];
const t0 = Date.now();

for (const s of suites) {
  process.stdout.write(`${B}▸ ${s.name}${X}  ${s.what}\n`);
  const { code, out } = await run(s.file);
  const skipped = /^SKIP:/m.test(out);
  // ultima riga di risultato della suite, qualunque formato usi
  const line = out.split('\n').reverse().find((l) => /passed|failed|SKIP/i.test(l)) || '';
  if (skipped) console.log(`  ${Y}⊘ saltata${X} — ${line.replace(/^SKIP:\s*/, '')}`);
  else if (code === 0) console.log(`  ${G}✓${X} ${line.replace(/\x1b\[[0-9;]*m/g, '').trim()}`);
  else {
    failed.push(s.name);
    console.log(out.split('\n').filter((l) => /✗|FAIL/.test(l)).map((l) => '  ' + l).join('\n') || out.slice(-600));
    console.log(`  ${R}✗ ${s.name} fallita${X}`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n────────────────────────────────────────────────');
if (failed.length) {
  console.log(`${R}${B}${failed.length} suite fallite: ${failed.join(', ')}${X}  (${secs}s)`);
  process.exit(1);
}
console.log(`${G}${B}Tutte le suite passano${X}  (${suites.length} suite, ${secs}s)`);
