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

// ── 9. LE AZIONI CONTESTUALI (fascicolo/pack/scheda di UN record) ───────
// Qui la promessa è doppia: la funzione esiste (già coperto sopra) E il
// record giusto si può trovare. La seconda metà si rompe in silenzio se
// qualcuno rinomina la funzione che handleSearch mette nella riga.
const ctx = P.ACTIONS.filter((a) => a.need);
ok(ctx.length >= 20, `il registro porta le azioni contestuali (${ctx.length})`);
ok(ctx.every((a) => P.KINDS[a.need]), 'ogni azione contestuale punta a un tipo di record dichiarato');
ok(Object.values(P.KINDS).every((k) => k.ask && k.icon && k.label && k.via.length),
  'ogni tipo di record sa come si chiama, come si chiede e come si riconosce');

// La riga di handleSearch che apre un contratto DEVE essere `viewContract('id')`:
// è così che il selettore riconosce il tipo. Se cambia, il selettore smette
// di trovare quel tipo — silenziosamente. Questo è il test che lo impedisce.
const hs = app.slice(app.indexOf('function handleSearch'), app.indexOf('function handleSearch') + 4200);
for (const [kind, k] of Object.entries(P.KINDS)) {
  const found = k.via.some((fn) => new RegExp(`action: \`${fn}\\('`).test(hs));
  ok(found, `tipo "${kind}": handleSearch produce davvero una riga ${k.via.join('/')}(...)`);
}

// I segnaposto diventano valori, e restano dati per tutto il percorso
ok(JSON.stringify(P.fillArgs(['$id'], { id: 'abc' })) === '["abc"]', 'fillArgs: $id diventa l\'id del record');
ok(P.fillArgs(['$id', '$year'], { id: 'x' })[1] === new Date().getFullYear(), 'fillArgs: $year è l\'anno corrente (numero, non stringa)');
ok(P.fillArgs(['/verbale?c=$id'], { id: 'k9' })[0] === '/verbale?c=k9', 'fillArgs: $id dentro una stringa (il link del verbale)');
ok(JSON.stringify(P.fillArgs(['$id', 'tenant'], { id: 'c1' })) === '["c1","tenant"]', 'fillArgs: gli argomenti fissi restano intatti');

// LA GUARDIA: contestuale senza record NON parte. Lanciare openFascicolo()
// su undefined aprirebbe un modale vuoto e l'operatore penserebbe di aver
// sbagliato lui.
let fasc = null;
const ctxWin = { openFascicolo: (id) => { fasc = id === undefined ? 'UNDEFINED' : id; } };
const aFasc = P.ACTIONS.find((a) => a.fn === 'openFascicolo');
ok(P.run(aFasc, ctxWin) === false && fasc === null, 'un\'azione contestuale SENZA record non parte (mai una chiamata su undefined)');
ok(P.run(aFasc, ctxWin, { id: '' }) === false && fasc === null, 'un record senza id non conta come record');
ok(P.run(aFasc, ctxWin, { id: 'ct7' }) === true && fasc === 'ct7', 'col record scelto parte con l\'id VERO');

// ── 10. Il selettore guida la ricerca VERA (nessun secondo indice) ──────
// Si costruisce la tendina ESATTAMENTE come la disegna portal-app.js e si
// pretende che findRecords tenga solo le righe del tipo chiesto.
function fakeWinWithSearch() {
  const rows = [];
  const mk = (onclick, label, sub) => ({
    getAttribute: (n) => (n === 'onclick' ? onclick : null),
    querySelector: () => ({ children: [{ textContent: label }, { textContent: sub }] })
  });
  const dd = {
    children: rows,
    parentNode: { removeChild() { dd.removed = true; } },
    removed: false
  };
  return {
    _dd: dd,
    handleSearch(q) {
      rows.length = 0;
      if (q === 'rossi') {
        rows.push(mk("viewContract('ct1');document.getElementById('searchResults')?.remove()", 'Contratto Via Cavour', 'Mario Rossi · €900/mese'));
        rows.push(mk("viewUserProfile('u9');document.getElementById('searchResults')?.remove()", 'Mario Rossi', 'tenant · m@r.it'));
        rows.push(mk("goTo('payments')", '€900 - 2026-08', 'Via Cavour · pending'));
      }
    },
    document: { getElementById: (id) => (id === 'searchResults' ? dd : (id === 'globalSearch' ? {} : null)) }
  };
}
let fw = fakeWinWithSearch();
const gotC = P.findRecords('rossi', 'contract', fw);
ok(gotC.length === 1 && gotC[0].id === 'ct1', 'findRecords: dal risultato globale tiene SOLO i contratti');
ok(gotC[0].label === 'Contratto Via Cavour' && gotC[0].sub.includes('Mario Rossi'), 'findRecords: la riga porta etichetta e sottotitolo veri');
ok(fw._dd.removed === true, 'findRecords: la tendina della ricerca viene rimossa (non resta appesa in pagina)');
fw = fakeWinWithSearch();
const gotP = P.findRecords('rossi', 'person', fw);
ok(gotP.length === 1 && gotP[0].id === 'u9', 'findRecords: lo stesso risultato dà la PERSONA quando serve una persona');
ok(P.findRecords('rossi', 'contract', { handleSearch: null }).length === 0, 'findRecords: senza motore di ricerca torna vuoto, non esplode');
ok(P.findRecords('r', 'contract', fakeWinWithSearch()).length === 0, 'findRecords: una lettera sola non cerca (la ricerca del portale parte da 2)');
ok(P.findRecords('rossi', 'contract', { handleSearch() {}, document: { getElementById: () => null } }).length === 0,
  'findRecords: senza #globalSearch nel DOM non chiama handleSearch (che lancerebbe)');

// ── 11. Le due funzioni RECUPERATE ──────────────────────────────────────
// Erano scritte, complete, e non le lanciava nessuno. La prova che erano
// orfane sta nel conteggio dei chiamanti: definizione e basta.
for (const [fn, why] of [['openTemplateForClient', 'contratto di servizio precompilato col cliente dentro'],
                         ['preOpenBoomCardGenerator', 'BOOM Card Generator'],
                         ['sendBulkReminders', 'solleciti in blocco a tutte le rate scadute']]) {
  const uses = (app.match(new RegExp(`\\b${fn}\\b`, 'g')) || []).length;
  ok(uses === 1, `"${fn}" era orfana in portal-app.js (1 sola occorrenza = la definizione, trovate ${uses})`);
  ok(P.ACTIONS.some((a) => a.fn === fn), `"${fn}" è ora raggiungibile dal Prontuario — ${why}`);
}

// ── 12. Le due facce sanno chiedere il record ───────────────────────────
ok(/openPicker\(/.test(desk) && /function renderPicker/.test(desk), 'desktop: la palette ha il selettore del record');
ok(/if \(e\.keep\)/.test(desk), 'desktop: un\'azione che deve ancora chiedere NON chiude la palette');
ok(/if \(!closePicker\(\)\) closePalette\(\)/.test(desk), 'desktop: Esc torna al passo prima invece di chiudere tutto');
ok(/P\.run\(a, window, r\)/.test(desk), 'desktop: il record scelto arriva a run() come terzo argomento');
ok(/function pick\(a, k\)/.test(mob) && /function unpick/.test(mob), 'mobile: il Menu ha il selettore e la via di ritorno');
ok(/P\.run\(a, window, r\)/.test(mob), 'mobile: il record scelto arriva a run() come terzo argomento');
ok(/picking \? renderPick\(\) : render\(\)/.test(mob), 'mobile: si scrive nello STESSO campo, cambia solo cosa si cerca');

// ── 13. L'isola rimossa non torna ───────────────────────────────────────
// Il "MULTI-PORTAL LISTINGS PUBLISHER" (editor annunci con bozze in
// localStorage, "pubblica" = copia negli appunti + apri una scheda) era
// un'isola chiusa e non raggiungibile, superata da wizard bot + Photo Lab +
// Pubblicista. Rimosso il 2026-08-19. Se ricompare, o è un ripristino per
// sbaglio o è una SECONDA via di pubblicazione che diverge dalla prima:
// entrambe le cose vanno viste, non subite.
// (si tolgono i commenti: la nota che SPIEGA la rimozione nomina per forza
//  ciò che è stato rimosso — è testo, non codice)
const appCode = app.replace(/^\s*\/\/.*$/gm, '');
ok(!/\blistingState\b/.test(appCode), 'l\'editor annunci legacy resta rimosso (nessun listingState nel codice)');
ok(!/function publishToImmobiliare|function publishToIdealista/.test(app),
  'nessuna seconda via di pubblicazione sui portali accanto al Pubblicista');
ok(app.includes('MULTI-PORTAL LISTINGS PUBLISHER — RIMOSSO'), 'la rimozione è spiegata sul posto, non silenziosa');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Niente più funzioni sepolte — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
