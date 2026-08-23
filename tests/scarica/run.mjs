// tests/scarica/run.mjs — I DOWNLOAD CHE NON VANNO (la lezione del doppione).
//
// La segnalazione del fondatore (23/08): «quando clicco per scaricare
// documenti non va, o sono lentissimi». Due cause vere, trovate insieme:
//  1. IL DOPPIONE — portal-app.js definiva downloadContractPDF DUE volte;
//     in uno script classico vince l'ultima, che rigenerava l'INTERO PDF
//     con jsPDF a ogni click su 📄 invece di scaricare quello già pronto.
//     La versione giusta (fast path sul PDF salvato) era codice morto.
//  2. IL data: MORTO — window.open su un data: URI è BLOCCATO dai browser
//     moderni: sui documenti legacy in base64 il click non faceva nulla e
//     il toast diceva «Download avviato» (mentiva).
// Le regole pinnate: ZERO funzioni duplicate (l'intera classe muore),
// il PDF salvato si scarica senza rigenerare, boomOpen consegna anche i
// data: e non mente mai.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. ZERO funzioni duplicate al livello del file ──────────────────────
const names = [...app.matchAll(/^\s{4}(?:async )?function (\w+)\s*\(/gm)].map((m) => m[1]);
ok(names.length > 500, `il rilevatore VEDE le funzioni (${names.length} — se fosse 0 il check sotto passerebbe a vuoto)`);
const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
ok(dupes.length === 0, 'nessuna funzione definita due volte' + (dupes.length ? ' — DOPPIONI: ' + dupes.join(', ') : ' (la seconda vincerebbe in silenzio)'));

// ── 2. Il PDF contratto si SCARICA, non si rigenera ─────────────────────
ok(names.filter((n) => n === 'downloadContractPDF').length === 1, 'downloadContractPDF esiste UNA volta sola');
const dl = app.slice(app.indexOf('async function downloadContractPDF'), app.indexOf('async function downloadContractPDF') + 3500);
const iStored = dl.indexOf('fresh.generatedPDF');
const iFallback = dl.indexOf('No stored PDF');
ok(iStored > -1 && iFallback > iStored, 'il fast path sul PDF salvato viene PRIMA della rigenerazione (che resta solo fallback)');
ok(/link\.download = fileName/.test(dl) && /URL\.createObjectURL/.test(dl), 'consegna con <a download> e nome file vero');
ok(/window\.downloadContractPDF = downloadContractPDF/.test(app), 'esportata (Prontuario e onclick la trovano)');

// ── 3. boomOpen: anche i data: legacy si consegnano, e mai una bugia ────
const bo = app.slice(app.indexOf('function boomOpen'), app.indexOf('function boomOpen') + 1600);
ok(bo.length > 100 && /data:/.test(bo) && /atob/.test(bo) && /new Blob/.test(bo) && /link\.download/.test(bo),
  'un data: URI diventa Blob + <a download> (window.open lo bloccherebbe in silenzio)');
ok(/if \(!w\)/.test(bo) && /pop-up/.test(bo), 'popup bloccato → errore ONESTO che dice la cura');
const dd = app.slice(app.indexOf('async function downloadDocument'), app.indexOf('async function downloadDocument') + 600);
ok(/if \(boomOpen\(/.test(dd), 'il toast di successo parte SOLO se l\'apertura è partita davvero');
ok(!/window\.open\('\$\{d\.fileUrl\}|window\.open\('\$\{encodeURI\(d\.fileUrl\)/.test(app),
  'nessuna riga documento apre più i file con window.open crudo: passano tutte da boomOpen');

// ── 4. copyToClipboard: resta solo la versione coi paracadute ───────────
const cc = app.slice(app.indexOf('async function copyToClipboard'), app.indexOf('async function copyToClipboard') + 900);
ok(names.filter((n) => n === 'copyToClipboard').length === 1 && /execCommand\('copy'\)/.test(cc),
  'una sola copyToClipboard, quella con i fallback Safari (execCommand/prompt)');

console.log(`\n${fail ? '✗' : '✓'} scarica: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
