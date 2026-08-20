// tests/diagnosi/run.mjs — IL WATCHDOG E LA DIAGNOSI: mai più un fallimento muto.
//
// La segnalazione del fondatore (19/08): "elimino o modifico ed è lento o
// non esegue; le modifiche sembrano mai salvate; badge che non si azzerano
// da mesi". Le promesse di questa risposta, pinnate sul sorgente:
//  1. il watchdog avvolge OGNI via di scrittura del compat SDK e non
//     altera mai il contratto dei chiamanti (restituisce la promise
//     originale, il suo catch è una FORCELLA);
//  2. la Diagnosi scrive SOLO su documenti _diag_* (mai un dato vero),
//     tenta SEMPRE la pulizia, e legge i battiti solo da teamHealth e
//     pfsRadarHealth;
//  3. il campanello si azzera anche in locale (delete + segna-tutte).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const reg = readFileSync(join(ROOT, 'js/portal-actions.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Il watchdog ──────────────────────────────────────────────────────
const wd = app.slice(app.indexOf('function _wdWatch'), app.indexOf('armWriteWatchdog._armed') + 4000);
ok(app.includes('function _wdWatch'), 'il watchdog esiste');
ok(/return promise;/.test(app.slice(app.indexOf('function _wdWatch'), app.indexOf('function _wdWatch') + 2200)),
  'il watchdog RESTITUISCE la promise originale (i chiamanti non cambiano)');
ok(/promise\.then\(\(\) =>/.test(app) && !/promise = promise\./.test(wd),
  'il monitor è una forcella: osserva, non riscrive la catena');
for (const m of ["'set'", "'update'", "'delete'"]) ok(wd.includes(m), `via di scrittura coperta: ${m}`);
ok(/CR\.add = function/.test(app) && /WB\.commit = function/.test(app), 'coperti anche add e batch.commit');
ok(/permission-denied/.test(wd) && /RIFIUTATA dal server/.test(app), 'un rifiuto del server si GRIDA, non si logga soltanto');
ok(/_wdLastSlow|_wdLastDeny/.test(app) && /30000/.test(wd), 'i toast sono rate-limitati (mai una tempesta)');
ok(/armWriteWatchdog\._armed/.test(app), 'il patch è idempotente');
ok(/il watchdog non deve MAI rompere una scrittura/.test(app), 'tutto il watchdog è in guardia try/catch');

// ── 2. La Diagnosi ──────────────────────────────────────────────────────
const dg = app.slice(app.indexOf('const DIAG_COLLS'), app.indexOf('window.runWriteDiagnosis'));
ok(/'_diag_' \+ Date\.now\(\)/.test(dg), 'la Diagnosi scrive SOLO su id _diag_* — mai un documento vero');
ok(!/\.doc\((?!id\))'?[a-zA-Z]/.test(dg.replace(/\.doc\(id\)/g, '')), 'nessun doc() con id cablato dentro la diagnosi');
ok(/la pulizia si tenta SEMPRE/.test(dg) && dg.split('ref.delete()').length === 2, 'cleanup tentato incondizionatamente');
ok(/\['teamHealth', 'pfsRadarHealth'\]/.test(dg), 'i battiti si leggono solo dalle due collection di salute');
ok(/_diagTimeout/.test(dg) && /6000|8000/.test(dg), 'ogni prova ha un tetto di tempo (mai una diagnosi appesa)');
ok(/FIREBASE_TOKEN/.test(dg), 'una riga rossa NOMINA la cura (il secret), non solo il sintomo');
ok(/isAdmin\(\)/.test(dg.slice(0, 400)) || /if \(!isAdmin\(\)\) return/.test(app.slice(app.indexOf('async function runWriteDiagnosis'), app.indexOf('async function runWriteDiagnosis') + 300)),
  'solo admin può lanciarla');
ok(reg.includes("fn: 'runWriteDiagnosis'"), 'la Diagnosi si trova dal Prontuario (⌘K / Menu)');

// ── 3. Il campanello coerente ───────────────────────────────────────────
const delN = app.slice(app.indexOf('async function deleteNotification'), app.indexOf('async function deleteNotification') + 600);
ok(/filter\(n => n\.id !== notifId\)/.test(delN) && /updateNotifBadge\(\)/.test(delN),
  'eliminare una notifica azzera anche il locale (badge subito giusto)');
const mAll = app.slice(app.indexOf('async function markAllNotificationsRead'), app.indexOf('async function markAllNotificationsRead') + 800);
ok(/n\.read = true/.test(mAll) && /updateNotifBadge\(\)/.test(mAll),
  '"segna tutte lette" aggiorna il locale senza aspettare il listener');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Nessun fallimento resta muto — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
