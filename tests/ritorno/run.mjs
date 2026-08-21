// tests/ritorno/run.mjs — LA VIA DEL RITORNO: nessuna console è una trappola.
//
// La segnalazione del fondatore (21/08): «pfs command se lo clicco apre la
// pagina … senza via d'uscita». Il portale vive come PWA in home — NESSUNA
// chrome del browser, nessun tasto indietro — e sei console si aprivano
// senza un solo link verso il portale: ognuna era un vicolo cieco da cui
// si usciva solo uccidendo l'app. La regola pinnata qui: OGNI pagina
// console porta un href="/portal" visibile. E la plancia, che su telefono
// è la più usata, tiene la topbar tascabile.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Ogni console ha la via del ritorno ───────────────────────────────
const CONSOLES = [
  'pfs-command.html', 'banca.html', 'team.html', 'salute.html',
  'photo-lab.html', 'manuale.html', 'risposte.html', 'scheda-canone.html',
  'pre-agreement-admin.html', 'media-studio.html', 'boom_doc_parser.html',
  'verbale.html',
];
ok(CONSOLES.length === 12, 'la lista delle console è pinnata (12 — una nuova console entra QUI o non entra)');
for (const f of CONSOLES) {
  ok(/href="\/portal(?:\.html)?"/.test(src(f)), `${f}: porta un link verso il portale`);
}

// ── 2. La plancia su telefono ───────────────────────────────────────────
const cmd = src('pfs-command.html');
ok(/class="tb-back" href="\/portal"/.test(cmd), 'plancia: la freccia ← è nella topbar, sempre visibile');
ok(/data-target="mercato"/.test(cmd), 'plancia: la sezione Mercato è raggiungibile dalla bottom-nav mobile');
ok(/@media \(max-width: 640px\)[\s\S]{0,200}\.tb-label \{ display: none; \}/.test(cmd),
  'plancia ≤640px: «Aggiungi annuncio» diventa ➕ — la topbar non domina più il primo schermo');
ok(/tb-label"> Aggiungi annuncio<\/span>/.test(cmd), "l'etichetta è avvolta davvero (non solo il CSS)");

console.log(`\n${fail ? '✗' : '✓'} ritorno: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
