// tests/actions/run.mjs — IL PRONTUARIO: ciò che è dichiarato deve esistere.
//
// Il registro promette all'operatore che ogni voce cercata FA qualcosa. La
// promessa si rompe in silenzio il giorno in cui qualcuno rinomina una
// funzione o un tipo di documento in portal-app.js: la voce resta nella
// palette, il tap non fa niente. Qui ogni `fn`, ogni tipo documento, ogni
// sezione e ogni modale dichiarati vengono verificati SUL SORGENTE VERO —
// la stessa disciplina della mappa WIZ di M2.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const require = createRequire(import.meta.url);

const P = require(join(ROOT, 'js', 'portal-actions.js'));
const app = read('js/portal-app.js');
const html = read('portal.html');
const sw = read('sw.js');
const desk = read('js/portal-desktop.js');
const mob = read('js/portal-mobile.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Ogni funzione invocata esiste davvero (o è nativa del browser) ───
const NATIVE = new Set(['open']);            // window.open per le console
const fns = [...new Set(P.ACTIONS.map((a) => a.fn))];
for (const fn of fns) {
  if (NATIVE.has(fn)) { ok(true, `fn "${fn}" è nativa del browser`); continue; }
  const declared = new RegExp(`function ${fn}\\s*\\(|window\\.${fn}\\s*=`).test(app);
  ok(declared, `fn "${fn}" esiste in portal-app.js`);
}

// ── 2. Ogni documento dichiarato è un tipo VERO di openTemplateModal ────
// (la mappa `titles` dentro la funzione è l'autorità)
const titlesBlock = app.slice(app.indexOf('function openTemplateModal'), app.indexOf('function openTemplateModal') + 3000);
for (const t of P.DOC_TYPES) {
  ok(new RegExp(`(^|[\\s{,])${t}\\s*:`, 'm').test(titlesBlock), `documento "${t}" è un tipo reale di openTemplateModal`);
}
ok(P.DOC_TYPES.length === 22, `tutti i 22 documenti sono nel registro (trovati ${P.DOC_TYPES.length})`);

// ── 3. Ogni sezione e ogni modale dichiarati sono reali ─────────────────
for (const a of P.ACTIONS.filter((x) => x.fn === 'goTo')) {
  ok(app.includes(`case '${a.args[0]}':`), `sezione "${a.args[0]}" è un case reale del router`);
}
for (const a of P.ACTIONS.filter((x) => x.fn === 'openModal')) {
  ok(app.includes(`type === '${a.args[0]}'`), `modale "${a.args[0]}" è un tipo reale di getModal`);
}

// ── 4. Igiene del registro ──────────────────────────────────────────────
const ids = P.ACTIONS.map((a) => a.id);
ok(new Set(ids).size === ids.length, 'nessun id duplicato');
ok(P.ACTIONS.every((a) => a.label && a.keywords && a.icon), 'ogni azione ha etichetta, icona e parole chiave');
ok(P.ACTIONS.every((a) => Array.isArray(a.args)), 'ogni azione porta args come array (nessun eval, nessuna stringa di codice)');
ok(!/eval\(|new Function/.test(read('js/portal-actions.js')), 'il registro non usa MAI eval');
// Le azioni contestuali (fascicolo/pack di UN record) non stanno qui: non
// avrebbero su cosa agire da una ricerca globale.
ok(P.ACTIONS.every((a) => (a.args || []).every((v) => typeof v === 'string' && !/^[a-zA-Z0-9]{18,}$/.test(v))),
  'nessuna azione porta un id di record: solo azioni globali');

// ── 5. La ricerca fa quello che serve all'operatore ─────────────────────
const first = (q) => (P.search(q, { limit: 5 })[0] || {}).label;
ok(first('ricevuta pigione') === 'Ricevuta pigione', 'ricerca: "ricevuta pigione" → Ricevuta pigione');
ok(first('ricev pig') === 'Ricevuta pigione', 'ricerca: prefissi parziali ("ricev pig")');
ok(first('sollecito') === 'Sollecito pagamento', 'ricerca: "sollecito" → Sollecito pagamento');
ok(first('disdetta') === 'Disdetta contratto', 'ricerca: "disdetta"');
ok(P.search('quietanza', { limit: 5 }).some((a) => a.label === 'Ricevuta pigione'), 'ricerca per SINONIMO ("quietanza")');
ok(P.search('zzzznulla', { limit: 5 }).length === 0, 'ricerca senza risultati non inventa nulla');
// AND fra i termini: due parole restringono
ok(P.search('contratto studenti', { limit: 9 }).length < P.search('contratto', { limit: 30 }).length,
  'due termini restringono il risultato (AND, non OR)');
// accenti e maiuscole
ok(first('DISDETTA') === 'Disdetta contratto', 'ricerca insensibile alle maiuscole');
ok(P.search('disponibilita', { limit: 5 }).some((a) => a.label.includes('Disponibilità')), 'ricerca insensibile agli accenti');
// non-admin non vede le azioni admin
ok(P.search('ricevuta', { isAdmin: false, limit: 9 }).length === 0, 'un non-admin non vede le azioni admin');

// ── 6. run() esegue per riferimento, mai per stringa ────────────────────
let called = null;
const fakeWin = { openTemplateModal: (t) => { called = t; } };
const doc = P.ACTIONS.find((a) => a.id === 'doc:ricevuta_pigione');
ok(P.run(doc, fakeWin) === true && called === 'ricevuta_pigione', 'run() invoca la funzione vera con i suoi argomenti');
ok(P.run({ fn: 'nonEsiste', args: [] }, fakeWin) === false, 'run() su una funzione assente ritorna false, non esplode');

// ── 7. Wiring: caricato prima dei layer che lo leggono ──────────────────
const iAct = html.indexOf('/js/portal-actions.js');
const iMob = html.indexOf('/js/portal-mobile.js');
const iDesk = html.indexOf('/js/portal-desktop.js');
const iApp = html.indexOf('<script src="/js/portal-app.js">');
ok(iAct > iApp, 'portal-actions.js caricato dopo portal-app.js');
ok(iAct < iMob && iAct < iDesk, 'portal-actions.js caricato PRIMA dei due layer che lo leggono');
ok(sw.includes('/js/portal-actions.js'), 'sw.js: il registro è network-first col tetto 6s');

// ── 8. Le due facce leggono LO STESSO registro ──────────────────────────
ok(desk.includes('window.BOOM_ACTIONS'), 'la palette desktop legge il registro');
ok(mob.includes('window.BOOM_ACTIONS'), 'il Menu mobile legge il registro');
ok(/if \(!P \|\| typeof P\.search !== 'function'\) return/.test(desk), 'desktop: se il registro manca, la palette resta quella di prima');
ok(/if \(!P \|\| typeof P\.search !== 'function'\) return null/.test(mob), 'mobile: se il registro manca, il Menu resta quello di prima');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Niente più funzioni sepolte — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
