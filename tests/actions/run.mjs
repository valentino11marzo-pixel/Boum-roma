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
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

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

// Il selettore legge la stessa API dati della home e dell'header. Il motore
// reale verifica anche il filtro prima del limite, senza manipolare la tendina.
const searchEngine = require(join(ROOT, 'js', 'portal-search-engine.js'));
const sharedState = {
  clients: Array.from({ length: 20 }, (_, i) => ({ id: 'crm-' + i, name: 'Rossi CRM ' + i })),
  properties: [{ id: 'house-rossi', name: 'Casa Rossi' }],
  users: [{ id: 'person-rossi', name: 'Rossi Persona', role: 'tenant' }],
  contracts: [{ id: 'contract-rossi', propertyId: 'house-rossi', tenantId: 'person-rossi' }]
};
const sharedCalls = [];
const sharedHost = {
  portalSearchRecords(query, kind, limit) {
    sharedCalls.push([query, kind, limit]);
    return searchEngine.search(query, sharedState, { kind, limit });
  },
  handleSearch() { throw Error('Shared data search must not rebuild the dropdown'); }
};
for (const [kind, expected] of [['property', 'house-rossi'], ['person', 'person-rossi'], ['contract', 'contract-rossi'], ['client', 'crm-0']]) {
  const records = P.findRecords('rossi', kind, sharedHost);
  ok(records.some(record => record.id === expected) && records.every(record => record.kind === kind),
    `findRecords: l'API condivisa trova il ${kind} anche oltre i primi clienti`);
  ok(records.length <= 12 && JSON.stringify(sharedCalls.at(-1)) === JSON.stringify(['rossi', kind, 12]),
    `findRecords: ${kind} usa il filtro e il limite espliciti, senza DOM`);
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

// ── 10. Compatibilità con un portal legacy senza API dati condivisa ────
// Il fallback continua a riconoscere solo le righe del tipo chiesto.
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

// ── 14. Ogni pagina aperta dal Prontuario ESISTE ED È SERVITA ───────────
// Un'azione che apre una 404 è peggio di un'azione assente: l'operatore
// pensa che il sistema sia rotto. `.vercelignore` toglie pagine dal
// deploy senza toccare il repo, quindi "il file c'è" non basta.
const ignored = readFileSync(join(ROOT, '.vercelignore'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const servedOk = (rel) => {
  const f = rel.replace(/^\//, '').split('?')[0];
  const cand = [f, f + '.html'].find((c) => { try { readFileSync(join(ROOT, c)); return true; } catch { return false; } });
  if (!cand) return 'manca dal repo';
  const hit = ignored.some((g) => g === cand || (g.endsWith('*.html') && cand.startsWith(g.slice(0, -6))));
  return hit ? 'escluso dal deploy (.vercelignore)' : null;
};
for (const a of P.ACTIONS.filter((x) => x.fn === 'open' && !x.need)) {
  const why = servedOk(a.args[0]);
  ok(!why, `"${a.label}" apre una pagina servita in produzione${why ? ' — ' + why : ''}`);
}

// ── 15. La home apre gli strumenti veri, senza indovinare il contesto ──
const homeCheck = (name, fn) => {
  try { fn(); ok(true, 'home: ' + name); } catch (error) { ok(false, 'home: ' + name); console.error(error.message); }
};
const homeState = {
  properties: [{ id: 'p1', name: 'Casa comune' }, { id: 'p2', name: 'Casa comune' }],
  contracts: [{ id: 'c1', propertyId: 'p1', propertyName: 'Casa comune', status: 'active' },
    { id: 'closed', propertyId: 'p2', status: 'completed' }],
  users: [{ id: 'u1', name: 'Persona comune' }], clients: [{ id: 'crm1', name: 'Persona comune' }]
};
const home = (kind, id, state = homeState, api = P) => api.homeTools({ kind, id }, state, 2027);
const homeAction = (rows, id) => rows.find(a => a.id === 'home:' + id);
const bare = P.homeTools(null, {}, 2027);
homeCheck('sedici strumenti stabili aprono pagine e moduli senza scelta implicita', () => {
  assert.deepEqual(bare.map(a => a.id), ['home:properties', 'home:people', 'home:whatsapp', 'home:email',
    'home:appointments', 'home:calls', 'home:document', 'home:magic-sign', 'home:inventory', 'home:handover',
    'home:maintenance', 'home:payment', 'home:invoices', 'home:listings', 'home:templates', 'home:automations']);
  assert.deepEqual(bare.map(a => a.label), ['Immobili', 'Persone', 'WhatsApp', 'Email', 'Agenda', 'Chiamate',
    'Documenti', 'Magic Sign', 'Inventario', 'Consegna', 'Interventi', 'Incassi', 'Fatture', 'Annunci', 'Modelli', 'Automazioni']);
  assert.deepEqual(bare.map(a => [a.fn, a.args]), [
    ['goTo', ['properties']], ['goTo', ['users']], ['oggiOpenInbox', ['whatsapp']], ['oggiOpenInbox', ['email']],
    ['goTo', ['viewings']], ['open', ['/chiamate']], ['openDocUploadModal', []], ['openMagicSignEditor', []],
    ['open', ['/inventario']], ['open', ['/verbale']], ['openModal', ['addMaintenance']], ['goTo', ['payments']],
    ['goTo', ['invoices']], ['goTo', ['listings']], ['goTo', ['templates']], ['goTo', ['rules']]
  ]);
  assert(bare.every(a => a.label && a.description && a.icon && !a.prefill && !a.disabled));
  assert.deepEqual(P.homeTools(undefined, undefined, 2027), bare);
});
homeCheck('un cliente CRM precompila il wizard, una persona omonima non lo fa', () => {
  const global = P.homeNewClient(null, homeState);
  assert.equal(global.id, 'home:new-client'); assert.equal(global.fn, 'openNewClientWizard'); assert.deepEqual(global.args, []);
  assert.deepEqual(P.homeNewClient({ kind: 'client', id: 'crm1' }, homeState).args, ['crmClient', 'crm1']);
  assert.deepEqual(P.homeNewClient({ kind: 'person', id: 'u1' }, homeState).args, []);
  assert.deepEqual([homeAction(home('client', 'crm1'), 'people').fn, homeAction(home('client', 'crm1'), 'people').args], ['viewClient', ['crm1']]);
  assert.deepEqual(homeAction(home('client', 'crm1'), 'document').args, []);
});
homeCheck('immobile: inventario, documento e manutenzione sullo stesso ID', () => {
  const rows = home('property', 'p1');
  assert.deepEqual([homeAction(rows, 'properties').fn, homeAction(rows, 'properties').args], ['viewProperty', ['p1']]);
  assert.deepEqual(homeAction(rows, 'inventory').args, ['/inventario?p=p1']);
  assert.deepEqual([homeAction(rows, 'document').fn, homeAction(rows, 'document').args], ['openDocUploadForProperty', ['p1', 2027]]);
  assert.deepEqual(homeAction(rows, 'maintenance').prefill, { field: 'propertyId', value: 'p1' });
  assert.equal(homeAction(rows, 'payment').prefill, undefined);
  assert.deepEqual(homeAction(rows, 'handover').args, ['/verbale']);
});
homeCheck('documento persona usa users, senza attribuirle contratti o case', () => {
  const rows = home('person', 'u1');
  assert.deepEqual([homeAction(rows, 'people').fn, homeAction(rows, 'people').args], ['openPerson', ['u1']]);
  assert.deepEqual([homeAction(rows, 'document').fn, homeAction(rows, 'document').args], ['openUserDocUpload', ['u1']]);
  assert.equal(homeAction(rows, 'maintenance').prefill, undefined);
  assert.deepEqual(homeAction(rows, 'inventory').args, ['/inventario']);
});
homeCheck('contratto: verbale e inventario esatti; incassi consultabili e casa tramite ID', () => {
  const rows = home('contract', 'c1');
  assert.deepEqual(homeAction(rows, 'inventory').args, ['/inventario?c=c1']);
  assert.deepEqual(homeAction(rows, 'handover').args, ['/verbale?c=c1']);
  assert.deepEqual([homeAction(rows, 'payment').fn, homeAction(rows, 'payment').args], ['goTo', ['payments']]);
  assert.equal(homeAction(rows, 'payment').prefill, undefined);
  assert.deepEqual(homeAction(rows, 'maintenance').prefill, { field: 'propertyId', value: 'p1' });
  assert.deepEqual([homeAction(rows, 'properties').fn, homeAction(rows, 'properties').args], ['viewProperty', ['p1']]);
  assert.deepEqual([homeAction(rows, 'magic-sign').fn, homeAction(rows, 'magic-sign').args], ['viewContractSignatures', ['c1']]);
  assert.deepEqual(homeAction(rows, 'people').args, ['users']);
  assert.equal(homeAction(rows, 'document').fn, 'openDocUploadModal');
});
homeCheck('Inbox conserva il tipo del contatto e non deduce il destinatario da contratto o casa', () => {
  const sameId = { ...homeState, users: [{ id: 'same', name: 'Omonimo', role: 'tenant' }], clients: [{ id: 'same', name: 'Omonimo' }] };
  for (const channel of ['whatsapp', 'email']) {
    for (const kind of ['person', 'client']) {
      const a = homeAction(home(kind, 'same', sameId), channel);
      assert.equal(a.fn, 'oggiOpenInbox'); assert.deepEqual(a.args, [channel, { kind, id: 'same' }]);
      const calls = [];
      assert.equal(P.run(a, { oggiOpenInbox: (...args) => calls.push(args) }), true);
      assert.deepEqual(calls, [[channel, { kind, id: 'same' }]]);
    }
    for (const [kind, id] of [['property', 'p1'], ['contract', 'c1']]) {
      assert.deepEqual(homeAction(home(kind, id), channel).args, [channel]);
    }
  }
});
homeCheck('contratto non attivo: consultazione incassi disponibile senza aprire una registrazione', () => {
  const a = homeAction(home('contract', 'closed'), 'payment');
  assert.equal(a.disabled, undefined); assert.deepEqual([a.fn, a.args], ['goTo', ['payments']]); assert.equal(a.prefill, undefined);
});
homeCheck('record obsoleto, tipo errato, ID vuoto o duplicato non diventano strumenti globali', () => {
  for (const rec of [{}, { kind: 'lead', id: 'c1' }, { kind: 'contract', id: 'p1' }, { kind: 'property', id: 'gone' },
    { kind: 'property', id: '' }, { kind: 'property', id: '  ' }, { kind: 'property', id: 1 }, { kind: 'toString', id: 'p1' }]) {
    assert.deepEqual(P.homeTools(rec, homeState, 2027), []);
    assert.equal(P.homeNewClient(rec, homeState), null);
  }
  assert.deepEqual(home('property', 'p1', { ...homeState, properties: [...homeState.properties, { id: 'p1' }] }), []);
  assert.deepEqual(home('person', 'u1', { ...homeState, users: null }), []);
  assert.equal(P.homeNewClient({ kind: 'client', id: 'crm1' }, { ...homeState, clients: [...homeState.clients, { id: 'crm1' }] }), null);
});
homeCheck('casa mancante, duplicata o indicata solo per nome non precompila la manutenzione', () => {
  for (const state of [
    { ...homeState, properties: homeState.properties.filter(p => p.id !== 'p1') },
    { ...homeState, properties: [...homeState.properties, { id: 'p1' }] },
    { ...homeState, contracts: [{ id: 'c1', propertyName: 'Casa comune', status: 'active' }] }
  ]) {
    const rows = home('contract', 'c1', state);
    assert.equal(homeAction(rows, 'maintenance').prefill, undefined);
    assert.deepEqual([homeAction(rows, 'properties').fn, homeAction(rows, 'properties').args], ['goTo', ['properties']]);
    assert.deepEqual(homeAction(rows, 'magic-sign').args, ['c1']);
  }
});
homeCheck('gli ID nei link restano dati e non aggiungono parametri', () => {
  const id = 'c&x=#/ spazio';
  const rows = home('contract', id, { contracts: [{ id, status: 'active' }] });
  for (const key of ['inventory', 'handover']) {
    const url = new URL(homeAction(rows, key).args[0], 'https://example.invalid');
    assert.equal(url.searchParams.get('c'), id); assert.equal([...url.searchParams].length, 1); assert.equal(url.hash, '');
  }
});
homeCheck('anno esplicito e indipendenza da ruoli, clock e stato mutabile', () => {
  const freeze = value => { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(value); };
  const frozen = freeze(structuredClone(homeState));
  const registryBefore = JSON.stringify(P.ACTIONS);
  const first = P.homeTools({ kind: 'property', id: 'p1' }, frozen, 2028);
  assert.deepEqual(homeAction(first, 'document').args, ['p1', 2028]);
  first[0].args.push('mutated');
  assert.deepEqual(P.homeNewClient({ kind: 'property', id: 'p1' }, { ...frozen, profile: { role: 'tenant' } }).args, []);
  assert.deepEqual(homeAction(P.homeTools({ kind: 'property', id: 'p1' }, frozen, 2028), 'properties').args, ['p1']);
  const contactTools = home('person', 'u1'); homeAction(contactTools, 'whatsapp').args[1].id = 'changed';
  assert.equal(homeAction(contactTools, 'email').args[1].id, 'u1');
  assert.equal(homeAction(home('person', 'u1'), 'whatsapp').args[1].id, 'u1');
  assert.equal(JSON.stringify(P.ACTIONS), registryBefore);
  assert.equal(homeAction(P.homeTools({ kind: 'property', id: 'p1' }, frozen), 'document').disabled, true);
});
homeCheck('ogni funzione, pagina e campo di prefill corrisponde al prodotto', () => {
  const rows = [...bare, ...home('property', 'p1'), ...home('person', 'u1'), ...home('contract', 'c1'), ...home('client', 'crm1'),
    P.homeNewClient(null, homeState), P.homeNewClient({ kind: 'client', id: 'crm1' }, homeState)];
  for (const a of rows) {
    assert(NATIVE.has(a.fn) || new RegExp(`function ${a.fn}\\s*\\(|window\\.${a.fn}\\s*=`).test(app));
    assert(P.ACTIONS.some(registered => registered.fn === a.fn));
    if (a.fn === 'open') assert.equal(servedOk(a.args[0]), null);
    if (a.fn === 'goTo') assert(app.includes(`case '${a.args[0]}':`));
    if (a.prefill) {
      assert.equal(a.fn, 'openModal');
      const start = app.indexOf(`if (type === '${a.args[0]}')`), end = app.indexOf('\n', start);
      assert(app.slice(start, end).includes(`name="${a.prefill.field}"`));
    }
  }
});
homeCheck('gli strumenti aprono le interfacce, senza generazione o invio impliciti', () => {
  const allowed = new Set(['goTo', 'open', 'oggiOpenInbox', 'openDocUploadModal', 'openMagicSignEditor', 'openModal',
    'viewProperty', 'openPerson', 'viewClient', 'openDocUploadForProperty', 'openUserDocUpload', 'viewContractSignatures']);
  for (const rows of [bare, home('property', 'p1'), home('contract', 'c1'), home('person', 'u1'), home('client', 'crm1')]) {
    for (const a of rows) assert(allowed.has(a.fn), a.fn);
    assert.deepEqual([homeAction(rows, 'automations').fn, homeAction(rows, 'automations').args], ['goTo', ['rules']]);
  }
});
homeCheck('mutazioni: unicità record, relazione per ID e consultazione incassi sono necessarie', () => {
  const source = read('js/portal-actions.js');
  const mutated = (from, to) => {
    assert(source.includes(from)); const sandbox = { module: { exports: {} } };
    runInNewContext(source.replace(from, to), sandbox); return sandbox.module.exports;
  };
  const duplicated = { ...homeState, properties: [...homeState.properties, { id: 'p1' }] };
  const checkUnique = api => assert.equal(home('property', 'p1', duplicated, api).length, 0);
  checkUnique(P); assert.throws(() => checkUnique(mutated('matches.length !== 1', 'matches.length === 0')), assert.AssertionError);
  const checkHouse = api => assert.equal(homeAction(home('contract', 'c1', homeState, api), 'maintenance').prefill?.value, 'p1');
  checkHouse(P); assert.throws(() => checkHouse(mutated('p.id === row.propertyId', 'p.name === row.propertyName')), assert.AssertionError);
  const checkPayment = api => assert.equal(homeAction(home('contract', 'closed', homeState, api), 'payment').fn, 'goTo');
  checkPayment(P); assert.throws(() => checkPayment(mutated("['payment', 'go:payments'", "['payment', 'new:addPayment'")), assert.AssertionError);
  const checkInboxKind = api => assert.equal(homeAction(home('client', 'crm1', homeState, api), 'email').args[1].kind, 'client');
  checkInboxKind(P); assert.throws(() => checkInboxKind(mutated('kind: kind, id: row.id', "kind: 'person', id: row.id")), assert.AssertionError);
  const checkNoRun = api => assert.equal(homeAction(api.homeTools(null, {}, 2027), 'automations').fn, 'goTo');
  checkNoRun(P); assert.throws(() => checkNoRun(mutated("['automations', 'go:rules'", "['automations', 'tool:rules'")), assert.AssertionError);
});

// Run the actual satellite boot: even a single contract waits for a choice.
const verbale = read('verbale.html');
const boot = verbale.slice(verbale.indexOf('BoomPortal.requireAuth('), verbale.indexOf('function loadContract('));
const nodes = {}, opened = [], reads = [];
await runInNewContext(boot, {
  BoomPortal: { requireAuth: async () => ({ user: {}, profile: { role: 'admin' } }) },
  $: id => nodes[id] ||= { style: {} }, URLSearchParams, location: { search: '' },
  firebase: { firestore: () => ({ collection: name => ({ limit: count => ({ get: async () => {
    reads.push([name, count]); return { forEach: cb => cb({ id: 'one-contract', data: () => ({ status: 'active' }) }) };
  } }) }) }) },
  esc: String, dIT: String, loadContract: (_db, id) => opened.push(id), showErr: message => { throw Error(message); }
});
homeCheck('il vero /verbale senza ID aspetta il selettore, anche con un solo contratto', () => {
  assert.deepEqual(reads, [['contracts', 200]]); assert.deepEqual(opened, []);
  assert(nodes.fContract.innerHTML.startsWith('<option value="">Scegli…</option>'));
  nodes.fContract.onchange.call({ value: '' }); assert.deepEqual(opened, []);
  nodes.fContract.onchange.call({ value: 'one-contract' }); assert.deepEqual(opened, ['one-contract']);
});

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Niente più funzioni sepolte — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
