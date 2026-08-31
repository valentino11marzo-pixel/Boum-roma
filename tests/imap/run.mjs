// tests/imap/run.mjs — IL KILL SENZA BATTITO (i timeout della posta).
//
// Dai log Vercel del 20/08: sei run di scan-inbox (leads + pfs) uccisi al
// limite piattaforma di 60s — con errs=0 nei battiti, perché una funzione
// AMMAZZATA non scrive niente: il guasto e la salute producevano lo stesso
// silenzio (lo stesso difetto del guardiano wizard, altra porta). La causa:
// i default di imapflow — connect 90s, socket idle 5 MINUTI — superano il
// limite della piattaforma, quindi una Gmail lenta garantiva il kill.
// La regola pinnata qui: OGNI ImapFlow in api/** dichiara i suoi tetti,
// tutti DENTRO il budget della funzione, così uno stallo diventa un errore
// CONTATO (reportHealth ok:false → errs cresce → allerta Telegram dopo 3).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Ogni costruttore ImapFlow dichiara i tre tetti, dentro il budget ──
const files = execSync("grep -rl 'new ImapFlow(' api/", { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
ok(files.length >= 4, `la scansione VEDE i siti IMAP (${files.length} file — se fosse 0 tutto passerebbe a vuoto)`);

for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const i = src.indexOf('new ImapFlow(');
  const block = src.slice(i, src.indexOf('});', i) + 3);
  const num = (k) => { const m = block.match(new RegExp(k + '\\s*:\\s*(\\d+)')); return m ? +m[1] : null; };
  const conn = num('connectionTimeout'), greet = num('greetingTimeout'), sock = num('socketTimeout');
  ok(conn != null && conn <= 20000, `${f}: connectionTimeout dichiarato e ≤20s (default 90s > limite piattaforma)`);
  ok(greet != null && greet <= 15000, `${f}: greetingTimeout dichiarato e ≤15s`);
  ok(sock != null && sock <= 30000, `${f}: socketTimeout dichiarato e ≤30s (default 5min = kill garantito)`);
}

// ── 2. Il loop delle ricerche conta il COSTO, non l'orario ───────────────
// Un socket malato può costare un socketTimeout INTERO per ricerca: quattro
// mittenti × 25s sfonderebbero comunque i 60s se il loop non guarda l'ora.
// E guardare l'ora non basta: la scadenza morbida a 48s c'era già, eppure
// nei log del 31/08 questi due erano ancora fra i killati a 60s — perché il
// controllo passava a 47,9s e POI partiva una ricerca da 25. Ora si chiede
// se il tempo residuo copre il costo massimo del passo (api/_budget.js).
for (const f of ['api/pfs/scan-inbox.js', 'api/leads/scan-inbox.js']) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const loop = src.slice(src.indexOf('client.search') - 400, src.indexOf('client.search'));
  ok(/afford\(COST_SEARCH\)\)\s*break/.test(loop), `${f}: il loop ricerche non comincia una ricerca che non può finire`);
  ok(/const COST_SEARCH = 25_000/.test(src) && /socketTimeout: 25000/.test(src),
    `${f}: il costo dichiarato È il socketTimeout vero (un numero scollegato sarebbe un conto finto)`);
}

console.log(`\n${fail ? '✗' : '✓'} imap: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
