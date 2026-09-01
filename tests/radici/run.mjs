// tests/radici/run.mjs — NESSUNA SUITE PUÒ ESSERE VERDE SU UNA MACCHINA SOLA.
//
// Il 31/08/2026 la CI su main era ROSSA da giorni, a ogni singolo push, e
// nessuno lo sapeva: la suite `anteprima` moriva sul runner mentre in locale
// passava sempre. La causa, dentro `design/pages-deco/anteprima.py`, era il
// percorso assoluto del sandbox di chi l'ha scritta, assegnato alla radice.
// È la STESSA lezione già pagata il 19/08 e già scritta in
// `tests/_browser.mjs` — «un percorso cablato vale come SUGGERIMENTO, mai
// come dichiarazione» — tornata sei giorni dopo in un altro linguaggio, dove
// quella nota non si legge.
//
// Il danno peggiore non è nemmeno il rosso in CI. Su una macchina dove quel
// percorso ESISTE (il sandbox di un altro agente, il portatile di chi l'ha
// scritta) lo script non fallisce: legge un ALTRO albero, in silenzio, e
// costruisce la pagina sbagliata dichiarandola giusta. Verificato per
// differenza: con la radice derivata il costruttore legge l'albero da cui è
// stato lanciato, con quella cablata ne legge un altro.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// Si cerca la casa di qualcuno DENTRO UNA STRINGA — cioè usata come valore,
// non raccontata in un commento. La distinzione non è pedanteria: la nota che
// spiega il difetto è la memoria che ne impedisce il ritorno, e una guardia
// che la segnalasse verrebbe zittita cancellando proprio quella. Quindi si
// tolgono prima commenti e docstring, poi si guarda nei letterali.
const CASA = /['"`](\/(?:home|Users)\/[A-Za-z0-9._-]+\/[^'"`\n]*)['"`]/g;
const TRIPLE = new RegExp("'''[\\s\\S]*?'''|" + '"""[\\s\\S]*?"""', 'g');

function soloCodice(src, file) {
  let s = src;
  if (file.endsWith('.py')) {
    s = s.replace(TRIPLE, ' ');                 // docstring
    s = s.replace(/^[ \t]*#.*$/gm, '');         // commenti su riga intera
    s = s.replace(/([^'"\n])#.*$/gm, '$1');     // commenti in coda
  } else if (/\.(m?js|cjs|sh)$/.test(file)) {
    s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
    s = s.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    if (file.endsWith('.sh')) s = s.replace(/^[ \t]*#.*$/gm, '');
  }
  return s;
}

// 1) i file delle suite, presi dal registro vero
const runAll = read('tests/run-all.mjs');
const suites = [...runAll.matchAll(/file: '([^']+)'/g)].map((m) => m[1]);
ok(suites.length > 40, `il registro delle suite si legge (${suites.length} suite) — un elenco vuoto passerebbe sempre`);

// 2) e i file che quelle suite LANCIANO (python, node, script del repo):
//    è dove si nascondeva il difetto — la suite era pulita, il costruttore no.
const lanciati = new Set();
for (const s of suites) {
  if (!existsSync(join(ROOT, s))) continue;
  for (const m of read(s).matchAll(/['"`]([\w./-]+\.(?:py|mjs|cjs|sh))['"`]/g)) {
    const p = m[1].replace(/^\.\//, '');
    if (!p.startsWith('/') && existsSync(join(ROOT, p))) lanciati.add(p);
  }
}
ok(lanciati.size > 0, `si vedono anche gli attrezzi lanciati dalle suite (${lanciati.size}) — è lì che stava il difetto`);
ok([...lanciati].some((p) => p.endsWith('anteprima.py')),
  "fra questi c'è design/pages-deco/anteprima.py: il caso vero è coperto per costruzione, non per elenco");

const colpevoli = [];
for (const f of [...suites, ...lanciati]) {
  if (!existsSync(join(ROOT, f))) continue;
  if (f === 'tests/_browser.mjs' || f === 'tests/_browser.cjs') continue;  // elenca SUGGERIMENTI e li verifica con existsSync
  for (const m of soloCodice(read(f), f).matchAll(CASA)) {
    if (/\/opt\//.test(m[1])) continue;
    colpevoli.push(`${f} → ${m[1]}`);
  }
}
ok(colpevoli.length === 0,
  'nessun file eseguito da npm test porta la casa di qualcuno'
  + (colpevoli.length ? ':\n    ' + colpevoli.join('\n    ') : ''));

// la guardia VEDE davvero un percorso cablato? (una regola che non trova mai
// niente è indistinguibile da una che non guarda)
// il campione si COMPONE a pezzi: scritto per intero, questo file
// risulterebbe colpevole della propria regola — e l'unica via d'uscita
// sarebbe esentarlo, cioè creare il primo file che la regola non guarda.
const FINTA = "/" + "home" + "/tizio/repo/";
ok(soloCodice("R = '" + FINTA + "'", 'x.py').match(CASA) !== null
   && soloCodice("# R = '" + FINTA + "'", 'x.py').match(CASA) === null,
  'la guardia distingue il codice dalla nota che racconta il difetto');

// 3) e il costruttore delle anteprime deriva davvero la sua radice
const ap = read('design/pages-deco/anteprima.py');
ok(/os\.path\.dirname\(os\.path\.abspath\(__file__\)\)/.test(ap), 'anteprima.py deriva la radice dal proprio file');

// 4) quando il costruttore muore, il chiamante lo DICE
// (il traceback usciva come Uint8Array di byte: due giri di correzioni sono
// stati spesi al buio proprio perché l'errore non si poteva leggere)
const wrap = read('design/pages-deco/test-anteprima.cjs');
ok(/stdio: \['ignore', 'pipe', 'inherit'\]/.test(wrap),
  'test-anteprima lascia parlare python invece di stampare byte grezzi');
ok(/anteprima\.py non ha costruito/.test(wrap), 'e dice quale pagina non è stata costruita');

console.log(`\n${fail ? '✗' : '✓'} radici: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
