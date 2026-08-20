// tests/escape/run.mjs — L'APOSTROFO CHE SPEGNEVA I BOTTONI.
//
// Dai log client di produzione (iPhone, sezione #contracts, via lo sheet ⋯
// di M2): SyntaxError "Unexpected identifier 'oro'". La causa: un nome con
// l'apostrofo — "Ca' d'Oro", "Perdita d'acqua", "Lettera d'Incarico" —
// interpolato CRUDO dentro un onclick inline chiudeva la stringa JS a metà.
// Il browser scarta un handler che non compila SENZA dire niente a chi
// tocca: il tap non fa nulla, su mobile E su desktop. È uno dei
// "clicco per eliminare e non esegue davvero" segnalati dal fondatore.
//
// La lezione era già stata imparata DUE volte, localmente (jsName nella
// sezione documenti, col commento che cita proprio "d'Incarico") — ma mai
// globalizzata. Ora c'è UNA copia (jsq) e questa suite pretende:
//  1. jsq escapa per il contesto vero (stringa single-quoted dentro un
//     attributo HTML double-quoted) — verificato COMPILANDO davvero;
//  2. il nome incriminato senza jsq NON compila (il test sa catturare la
//     regressione, non è un test che passa a vuoto);
//  3. nessun sito confirmDelete interpola testo libero crudo, e la vecchia
//     catena di replace duplicata esiste in UNA sola copia;
//  4. lo sheet mobile rende le etichette con esc() — non può reintrodurre
//     il difetto dal suo lato.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const pm = readFileSync(join(ROOT, 'js/portal-mobile.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. jsq estratta dal sorgente (si testa la copia VERA) ───────────────
const m = app.match(/function jsq\(v\) \{[\s\S]*?\n    \}/);
ok(!!m, 'jsq esiste in portal-app.js (funzione top-level, visibile agli onclick)');
const jsq = m ? eval('(' + m[0] + ')') : null;

ok(jsq && jsq("Ca' d'Oro") === "Ca\\' d\\'Oro", "l'apostrofo diventa \\' (la stringa JS non si chiude più a metà)");
ok(jsq && jsq('a\\b') === 'a\\\\b', 'il backslash si escapa PRIMA (mai un doppio-escape del quote)');
ok(jsq && jsq('doc "finale"') === 'doc &quot;finale&quot;', 'il doppio apice non chiude MAI l\'attributo HTML');
ok(jsq && jsq('A&B') === 'A&amp;B', "l'ampersand si neutralizza (round-trip esatto dopo il decode del browser)");
ok(jsq && jsq('riga\nnuova') === 'riga nuova', 'un a-capo non spezza la stringa JS');
ok(jsq && jsq(null) === '' && jsq(undefined) === '', 'null/undefined → stringa vuota, mai "null" cliccabile');

// ── 2. Il giro VERO: template → parser attributi HTML → compilazione ────
// Si costruisce l'attributo esattamente come i template, si decodificano le
// entità come fa il parser HTML (un solo passaggio), e la Function DEVE
// compilare e consegnare il nome ORIGINALE a confirmDelete.
const htmlDecode = (s) => s.replace(/&(amp|quot|lt);/g, (e) => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<' }[e]));
const KILLERS = ["Ca' d'Oro", "Perdita d'acqua", 'Lettera d\'Incarico "finale"', 'C:\\vecchio\\nome', "Sant'Angelo & figli"];
for (const name of KILLERS) {
  let got = null, compiled = true;
  try {
    const attr = `confirmDelete('contract','c1','Contratto ${jsq(name)}')`;
    const fn = new Function('confirmDelete', htmlDecode(attr));
    fn((t, id, n) => { got = n; });
  } catch { compiled = false; }
  ok(compiled && got === 'Contratto ' + name.replace(/\r?\n/g, ' '),
    `compila e consegna il nome intatto: «${name}»`);
}

// Il CONTROLLO (anti-vuoto): lo stesso nome SENZA jsq non deve compilare —
// è la riproduzione esatta del SyntaxError "Unexpected identifier 'oro'".
let rawThrew = false;
try { new Function('confirmDelete', htmlDecode("confirmDelete('contract','c1','Contratto Ca' d'Oro')")); }
catch (e) { rawThrew = e instanceof SyntaxError; }
ok(rawThrew, "il nome crudo NON compila (il test sa catturare la regressione: è il bug 'oro' riprodotto)");

// ── 3. Nessun sito confirmDelete interpola testo libero crudo ───────────
const calls = app.match(/confirmDelete\('[^']*','\$\{[^}]*\}','[^']*'\)/g) || [];
ok(calls.length >= 13, `la scansione VEDE i siti (${calls.length} trovati — se fosse 0 il check sotto passerebbe a vuoto)`);
const bad = [];
for (const c of calls) {
  const third = c.replace(/^confirmDelete\('[^']*','\$\{[^}]*\}',/, '');
  for (const e of third.match(/\$\{[^}]*\}/g) || []) {
    if (!/^\$\{\s*(jsq\(|jsName)/.test(e)) bad.push(c.slice(0, 80));
  }
}
ok(bad.length === 0, 'ogni interpolazione nel terzo argomento passa da jsq/jsName' + (bad.length ? ' — CRUDE: ' + bad.join(' | ') : ''));
ok(app.includes("'Contratto ${jsq(p?.name)}'"), 'il sito segnalato dai log (#contracts, riga contratto) è protetto');
ok(app.includes("'${jsq(m.title)}')"), 'anche i titoli manutenzione ("Perdita d\'acqua") sono protetti');

// ── 4. Una copia sola della logica ──────────────────────────────────────
const chainCount = (app.match(/\.replace\(\/'\/g, "\\\\'"\)/g) || []).length;
ok(chainCount === 1, `la catena di escape vive SOLO dentro jsq (trovate ${chainCount} copie)`);
ok(/const jsName = jsq\(d\.name\);/.test(app) && !/jsName = \(d\.name \|\| ''\)\.replace/.test(app),
  'i due jsName locali sono diventati chiamate a jsq (niente più copie che divergono)');

// ── 5. Lo sheet mobile non può reintrodurre il difetto ──────────────────
ok(/esc\(it\.label\)/.test(pm) && /esc\(it\.icon/.test(pm), 'openSheet rende etichette e icone con esc(), mai HTML crudo');
ok(/try \{ it\.onTap\(\); \} catch/.test(pm), "l'onTap dello sheet resta in guardia try/catch (un'azione rotta non uccide lo sheet)");

console.log(`\n${fail ? '✗' : '✓'} escape: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
