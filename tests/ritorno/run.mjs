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

// ── 3. La resurrezione delle schede vecchie ─────────────────────────────
// La trappola vista il 22/08: una scheda Safari di GIORNI prima, riesumata
// con un modale aperto su un annuncio ormai sparito e i bottoni di una
// versione superata. Una scheda ripresa dopo 1h+ deve ripartire fresca.
const bp = src('js/boom-portal.js');
const fm = bp.match(/BP\.freshOnReturn = function[\s\S]*?\n    \};/);
ok(!!fm, 'freshOnReturn esiste nella libreria condivisa');

// si guida la funzione VERA con document/window/location finti
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function harness() {
  const listeners = {};
  const fakeDoc = { visibilityState: 'visible', addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
  const fakeWin = { addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
  const fakeLoc = { reloads: 0, reload() { this.reloads++; } };
  const make = new Function('document', 'window', 'location', 'var BP={};' + fm[0].replace('BP.freshOnReturn', 'BP.freshOnReturn') + ' return BP;');
  const BP2 = make(fakeDoc, fakeWin, fakeLoc);
  return { listeners, fakeDoc, fakeLoc, arm: (min) => BP2.freshOnReturn(min) };
}
{
  const h = harness();
  h.arm(0.0001); // limite ~6ms: il tempo si comprime, la logica è la stessa
  h.fakeDoc.visibilityState = 'hidden'; h.listeners.visibilitychange.forEach((f) => f());
  await wait(25);
  h.fakeDoc.visibilityState = 'visible'; h.listeners.visibilitychange.forEach((f) => f());
  ok(h.fakeLoc.reloads === 1, 'assenza oltre il limite → la pagina riparte fresca');
}
{
  const h = harness();
  h.arm(60); // limite vero: un cambio-tab di un secondo NON ricarica
  h.fakeDoc.visibilityState = 'hidden'; h.listeners.visibilitychange.forEach((f) => f());
  h.fakeDoc.visibilityState = 'visible'; h.listeners.visibilitychange.forEach((f) => f());
  ok(h.fakeLoc.reloads === 0, 'assenza breve → nessun reload (mai buttare il lavoro per un alt-tab)');
}
ok(/pageshow/.test(fm[0]) && /e\.persisted/.test(fm[0]), 'copre anche la riesumazione bfcache (pageshow persisted)');

// il cablaggio: le console SENZA form ce l'hanno, quelle coi form NO
for (const f of ['pfs-command.html', 'banca.html', 'team.html', 'salute.html', 'photo-lab.html']) {
  ok(src(f).includes('freshOnReturn(60)'), `${f}: scheda vecchia → riparte fresca`);
}
for (const f of ['manuale.html', 'media-studio.html', 'pre-agreement-admin.html', 'verbale.html']) {
  ok(!src(f).includes('freshOnReturn'), `${f}: MAI un reload automatico (c'è un form da non buttare)`);
}

console.log(`\n${fail ? '✗' : '✓'} ritorno: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
