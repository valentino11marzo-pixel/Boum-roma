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
ok(/boomDownloadUrl\([^,]+, fileName\)/.test(dl), 'consegna dal modulo unico, col nome file vero');
ok(/window\.downloadContractPDF = downloadContractPDF/.test(app), 'esportata (Prontuario e onclick la trovano)');

// ── 3. boomOpen: anche i data: legacy si consegnano, e mai una bugia ────
const bo = app.slice(app.indexOf('function boomOpen'), app.indexOf('function boomOpen') + 1600);
ok(bo.length > 100 && /data:/.test(bo) && /atob/.test(bo) && /return boomSave\(new Blob/.test(bo),
  'un data: URI diventa Blob e passa da boomSave (window.open lo bloccherebbe in silenzio)');
ok(/if \(!w\)/.test(bo) && /pop-up/.test(bo), 'popup bloccato → errore ONESTO che dice la cura');
const dd = app.slice(app.indexOf('async function downloadDocument'), app.indexOf('async function downloadDocument') + 600);
ok(/if \(boomOpen\(/.test(dd), 'il toast di successo parte SOLO se l\'apertura è partita davvero');
ok(!/window\.open\('\$\{d\.fileUrl\}|window\.open\('\$\{encodeURI\(d\.fileUrl\)/.test(app),
  'nessuna riga documento apre più i file con window.open crudo: passano tutte da boomOpen');

// ── 4. copyToClipboard: resta solo la versione coi paracadute ───────────
const cc = app.slice(app.indexOf('async function copyToClipboard'), app.indexOf('async function copyToClipboard') + 900);
ok(names.filter((n) => n === 'copyToClipboard').length === 1 && /execCommand\('copy'\)/.test(cc),
  'una sola copyToClipboard, quella con i fallback Safari (execCommand/prompt)');

// ── 5. L'INVARIANTE DI CLASSE: nessun download staccato dal documento ───
// Su Safari il .click() di un <a download> non attaccato al DOM non fa
// NULLA (nove punti ne soffrivano: PDF contratto, export CSV, pack AdE,
// card immobile) e una revoca sincrona annulla il file in volo.
const anchors = [...app.matchAll(/document\.createElement\('a'\)/g)].map((mm) => mm.index);
ok(anchors.length >= 3, `il rilevatore VEDE gli ancoraggi rimasti (${anchors.length})`);
const chiamate = (app.match(/boomSave\(/g) || []).length;
ok(chiamate >= 9, `la consegna è stata accentrata davvero: ${chiamate} usi di boomSave (erano 9 copie a mano, ognuna col suo difetto)`);
const staccati = [], revocheSincrone = [];
for (const at of anchors) {
  const block = app.slice(at, at + 700);
  const iClick = block.search(/\.click\(\)/);
  if (iClick === -1) continue;
  const before = block.slice(0, iClick);
  if (!/appendChild\(/.test(before)) staccati.push(app.slice(0, at).split('\n').length);
  // revoca nella stessa riga o in quella subito dopo il click = sincrona
  const after = block.slice(iClick, iClick + 120);
  if (/revokeObjectURL/.test(after) && !/setTimeout/.test(after)) revocheSincrone.push(app.slice(0, at).split('\n').length);
}
ok(staccati.length === 0, 'ogni <a download> è attaccato al documento prima del click' + (staccati.length ? ' — STACCATI alle righe: ' + staccati.join(', ') : ''));
ok(revocheSincrone.length === 0, 'nessuna revoca sincrona dopo un click' + (revocheSincrone.length ? ' — righe: ' + revocheSincrone.join(', ') : ''));
ok(/function boomSave\(src, name\)/.test(app) && /document\.body\.appendChild\(a\)/.test(app.slice(app.indexOf('function boomSave'), app.indexOf('function boomSave') + 900)),
  'la consegna del file ha UNA copia sola (boomSave), quella giusta');

// ── 6. Il file remoto: tetto di tempo e ripiego, mai un click a vuoto ───
const bd = app.slice(app.indexOf('async function boomDownloadUrl'), app.indexOf('async function boomDownloadUrl') + 1200);
ok(/AbortController/.test(bd) && /12000/.test(bd), 'la richiesta ha un tetto di tempo (una fetch appesa era il "lentissimo")');
ok(/return boomOpen\(url, name\)/.test(bd), 'se la rete o il CORS non collaborano si ripiega sull\'apertura nativa — mai un click che non produce niente');
ok((app.match(/await boomDownloadUrl\(/g) || []).length >= 3, 'i tre percorsi del PDF contratto passano tutti di lì');

console.log(`\n${fail ? '✗' : '✓'} scarica: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
