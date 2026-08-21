// tests/segnala/run.mjs — 🐞 SEGNALA: mai più un «ha problemi» senza indirizzo.
//
// Il buco misurato dallo studio Arsenale II: tra il pollice dell'operatore
// e questo repo non c'era un canale — i bug arrivavano come «il pfs command
// ha problemi», senza pagina né tap. Le promesse pinnate qui:
//  1. l'anello degli errori (boom-err) ricorda gli ultimi 5 SEMPRE, anche
//     i duplicati che la telemetria non rispedisce;
//  2. la segnalazione porta il contesto DA SOLA (pagina, dispositivo,
//     errori) e il testo dell'operatore non passa MAI da innerHTML;
//  3. il ping Telegram parte entro un minuto, UNA volta per segnalazione,
//     col messaggio escapato;
//  4. la collection è admin-only nelle rules (lezione propertyLocks).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const err = readFileSync(join(ROOT, 'js/boom-err.js'), 'utf8');
const bp = readFileSync(join(ROOT, 'js/boom-portal.js'), 'utf8');
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const reg = readFileSync(join(ROOT, 'js/portal-actions.js'), 'utf8');
const pfs = readFileSync(join(ROOT, 'pfs-command.html'), 'utf8');
const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
const np = readFileSync(join(ROOT, 'api/telegram/notify-pending.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. L'anello degli errori ────────────────────────────────────────────
ok(/window\.__boomErrs = window\.__boomErrs \|\| \[\]/.test(err), "l'anello esiste in boom-err");
ok(/ring\.length > 5\) ring\.shift\(\)/.test(err), 'tetto a 5: mai una coda infinita in memoria');
const ringIdx = err.indexOf('__boomErrs');
const gateIdx = err.indexOf('sent[message] || count >= MAX');
ok(ringIdx > -1 && gateIdx > ringIdx, "l'anello si riempie PRIMA del dedupe: il contesto ricorda anche i duplicati");
ok(/catch \(e2\)/.test(err), "l'anello è in guardia propria: rompersi lì non spegne la telemetria");

// ── 2. Il modulo condiviso (console) ────────────────────────────────────
ok(/BP\.reportBug = function/.test(bp), 'BoomPortal.reportBug esiste (ogni console lo eredita)');
const rb = bp.slice(bp.indexOf('BP.reportBug'), bp.indexOf('BP.reportBug') + 4200);
ok(/collection\('bugReports'\)\.add\(/.test(rb), 'scrive su bugReports');
ok(/__boomErrs/.test(rb) && /errs: errs/.test(rb), 'gli errori recenti viaggiano allegati da soli');
ok(/msg\.slice\(0, 1200\)/.test(rb), 'il testo è clippato');
ok(!/innerHTML[^=]*=.*msg/.test(rb) && !/\+ msg \+/.test(rb), "il testo dell'operatore non passa MAI da innerHTML (niente XSS self-inflitto)");
ok(/getElementById\('bp-bug-ov'\)\) return/.test(rb), 'idempotente: mai due overlay');

// ── 3. Il portale (Prontuario + modale nativa) ──────────────────────────
ok(/function openBugReport\(\)/.test(app) && /window\.openBugReport = openBugReport/.test(app), 'openBugReport esiste ed è globale');
ok(/function sendBugReport\(\)|async function sendBugReport\(\)/.test(app) && /collection\('bugReports'\)\.add\(/.test(app.slice(app.indexOf('function sendBugReport'), app.indexOf('function sendBugReport') + 1600)), 'il portale scrive lo stesso schema');
ok(/tool:segnala/.test(reg) && /fn: 'openBugReport'/.test(reg), 'il Prontuario (⌘K / Menu) lo trova');

// ── 4. La plancia PFS ───────────────────────────────────────────────────
ok(/BoomPortal\.reportBug\(\{page:'pfs-command'\}\)/.test(pfs), 'il bottone 🐞 in plancia chiama il modulo condiviso');
ok(/boom-err\.js/.test(pfs), 'la plancia ora ha anche la telemetria (prima era cieca)');

// ── 5. Le regole ────────────────────────────────────────────────────────
ok(/match \/bugReports\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules), 'bugReports è admin-only nelle rules (lezione propertyLocks)');

// ── 6. Il ping Telegram ─────────────────────────────────────────────────
const bugSec = np.slice(np.indexOf('Bug reports'), np.indexOf('Bug reports') + 1600);
ok(bugSec.length > 100 && /fsList\('bugReports'/.test(bugSec), 'notify-pending scandaglia bugReports');
ok(/telegramNotifiedAt/.test(bugSec) && /filter\(b => !b\.telegramNotifiedAt\)/.test(bugSec), 'una segnalazione suona UNA volta (marcata sul doc)');
ok(/esc\(String\(b\.message/.test(bugSec) || /esc\(b\.message/.test(bugSec), 'il messaggio è escapato prima di Telegram (HTML parse mode)');
ok(/\.slice\(0, 5\)/.test(bugSec) && /limit: 20/.test(bugSec), 'tetti per giro: mai una tempesta di ping');
ok(/catch \(_\)/.test(bugSec) || /catch \(_\) \{/.test(np.slice(np.indexOf('let bugs'), np.indexOf('let bugs') + 400)), 'rules non ancora deployate → non-fatale');

console.log(`\n${fail ? '✗' : '✓'} segnala: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
