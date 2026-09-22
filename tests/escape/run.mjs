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
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const pm = readFileSync(join(ROOT, 'js/portal-mobile.js'), 'utf8');
const dossier = readFileSync(join(ROOT, 'js/property-dossier.js'), 'utf8');
const require = createRequire(import.meta.url);
const dossierEngine = require('../../js/property-dossier-engine.js');

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
const htmlDecode = (s) => s.replace(/&(amp|quot|lt|gt|#39);/g, (e) => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'" }[e]));
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
const inlineCalls = [...app.matchAll(/onclick="(confirmDelete\([^\n]*?\))"/g)].map(m => m[1]);
ok(inlineCalls.length === calls.length && inlineCalls.length > 0, 'lo scanner copre tutti gli onclick confirmDelete attuali, senza ometterne');
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

// Compila i template REALI, non solo un esempio costruito come loro.
function executeInline(sites, name) {
  for (const site of sites) {
    const record = { id: 'record-1', name, title: name, month: name, number: name };
    const scope = { rule: record, d: record, l: record, pay: record, c: record, inv: record, u: record, m: record, p: record, id: record.id, jsName: jsq(name), jsq };
    const attr = new Function(...Object.keys(scope), 'return `' + site + '`;')(...Object.values(scope));
    assert(!attr.includes('"'), 'Il template non deve chiudere l’attributo HTML');
    let received;
    new Function('confirmDelete', htmlDecode(attr))((...args) => { received = args; });
    assert.equal(received?.[1], record.id);
    assert.equal(received?.[2], (/^confirmDelete\('(contract|payment)'/.test(site) ? (site.includes("'contract'") ? 'Contratto ' : 'Pagamento ') : '') + name);
  }
}
for (const name of KILLERS) {
  try { executeInline(inlineCalls, name); ok(true, 'tutti gli onclick reali compilano e conservano «' + name + '»'); }
  catch (error) { ok(false, 'onclick reale: ' + error.message); }
}
let inlineMutationCaught = false;
try { executeInline(inlineCalls.map(site => site.replace('jsq(p?.name)', 'p?.name')), "Ca' d'Oro"); }
catch { inlineMutationCaught = true; }
ok(inlineMutationCaught, 'mutazione: togliere jsq dal vero bottone contratto fa cadere la prova');

// Il tredicesimo sito, l'immobile, ora usa una delega DOM. Lo si conta
// SOLO dopo aver eseguito render → attributi → listener → configure reale
// → confirmDelete → template conferma → compilazione dell'azione finale.
const named = (source, name) => {
  const start = source.indexOf('    function ' + name + '(');
  assert(start >= 0, 'Funzione presente: ' + name);
  const next = source.slice(start + 5).search(/\n    (?:async )?function /);
  return next < 0 ? source.slice(start) : source.slice(start, start + 5 + next);
};
function dossierRoutes(uiSource = dossier, portalSource = app) {
  const id = `casa'"&\\demo`, name = `Ca' d'Oro "finale" & <b>studio</b>`;
  const ids = { contract: `contratto'"&\\1`, maintenance: `richiesta'"&\\1`, task: `attivita'"&\\1`, person: `persona'"&\\1`, payment: `rata'"&\\1` };
  const property = { id, name, ownerId: ids.person };
  const S = { page: 'property/' + encodeURIComponent(id) + '/overview', profile: { role: 'admin' }, properties: [property],
    users: [{ id: ids.person, name }], contracts: [{ id: ids.contract, propertyId: id, status: 'active', rent: 100 }],
    payments: [{ id: ids.payment, propertyId: id, contractId: ids.contract, amount: 100, month: '2026-09', status: 'pending', type: 'rent' }],
    maintenance: [{ id: ids.maintenance, propertyId: id, title: name, status: 'open' }],
    tasks: [{ id: ids.task, propertyId: id, title: name, status: 'pending' }], documents: [] };
  let listener, received, confirmation;
  const document = { addEventListener(type, fn) { assert.equal(type, 'click'); listener = fn; } };
  const window = { document, BOOM_PROPERTY_DOSSIER_ENGINE: dossierEngine };
  const context = vm.createContext({ window, S, URL, document,
    viewContract: value => { received = ['contract', value]; }, viewMaintenance: value => { received = ['maintenance', value]; },
    editTask: value => { received = ['task', value]; }, viewUser: value => { received = ['person', value]; },
    openRentUnit: (...args) => { received = ['payment', ...args]; },
    openValutazione: (...args) => { received = ['valuation', args[2].propertyId]; },
    openModal: (type, value) => { received = [type, value]; if (type === 'confirm') confirmation = value; }
  });
  vm.runInContext(uiSource, context);
  const configStart = portalSource.indexOf('    window.BOOM_PROPERTY_DOSSIER?.configure({');
  assert(configStart >= 0, 'La configurazione del portale esiste');
  vm.runInContext(['esc', 'jsq', 'confirmDelete'].map(name => named(portalSource, name)).join('\n')
    + '\n' + portalSource.slice(configStart, portalSource.indexOf('    // ══', configStart)), context);
  assert.equal(typeof listener, 'function', 'Il configure reale registra la delega');
  const UI = window.BOOM_PROPERTY_DOSSIER;
  assert.equal(UI.parseRoute(UI.routeFor(id)).id, id);
  const buttons = [];
  for (const tab of ['overview', 'contracts', 'rent', 'activity']) {
    const html = UI.render(S, { id, tab });
    assert(html.includes('Ca&#39; d&#39;Oro &quot;finale&quot; &amp; &lt;b&gt;studio&lt;/b&gt;'));
    for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
      const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], htmlDecode(a[2])]));
      if (attrs['data-pdos-action']) buttons.push(attrs);
    }
  }
  const routes = new Set();
  for (const action of ['contract', 'maintenance', 'task', 'person', 'payment', 'edit', 'valuation', 'delete']) {
    received = null;
    const targetId = ids[action] || id;
    const button = buttons.find(b => b['data-pdos-action'] === action && b['data-id'] === targetId);
    assert(button, 'Controllo reale con ID intatto: ' + action);
    const target = { dataset: { pdosAction: button['data-pdos-action'], id: button['data-id'] }, closest(selector) {
      return selector === '[data-pdos-action]' || selector === '.property-dossier' ? this : null;
    } };
    listener({ target, button: 0 });
    if (action === 'delete') {
      assert.equal(received?.[0], 'confirm');
      const confirmBranch = portalSource.match(/if \(type === 'confirm'\) return ([^\n]+);/);
      assert(confirmBranch, 'Template conferma reale presente');
      context.data = confirmation;
      const html = vm.runInContext(confirmBranch[1], context);
      const text = html.match(/<p class="confirm-text">([\s\S]*?)<\/p>/)?.[1];
      assert(text && !text.includes('<'), 'Il nome nella conferma resta testo, mai markup');
      assert(htmlDecode(text).includes(name), 'Il nome nella conferma resta intatto');
      let deleted;
      for (const m of html.matchAll(/onclick="([^"]*)"/g))
        new Function('deleteRecord', 'closeModal', htmlDecode(m[1]))((...args) => { deleted = args; }, () => {});
      assert.deepEqual(deleted, ['propert', id], 'Conferma finale compila e conserva l’ID');
    } else if (action === 'edit') assert.equal(received?.[1], property);
    else if (action === 'payment') { assert.equal(received?.[0], action); assert.equal(received?.[3], targetId); }
    else assert.deepEqual(received, [action, targetId]);
    routes.add(action);
  }
  return routes;
}
let covered = new Set();
try { covered = dossierRoutes(); ok(covered.size === 8, 'otto azioni fascicolo vere conservano etichette e ID con apici fino alla conferma'); }
catch (error) { ok(false, 'azioni fascicolo reali: ' + error.message); }
ok(calls.length + Number(covered.has('delete')) >= 13,
  `la scansione VEDE i siti (${calls.length} inline + ${Number(covered.has('delete'))} delega immobile eseguita; minimo 13 invariato)`);
let delegatedMutationCaught = false;
const unescapedId = dossier.replace('data-id="${esc(id)}"', 'data-id="${id}"');
if (covered.size === 8 && unescapedId !== dossier) {
  try { dossierRoutes(unescapedId); } catch { delegatedMutationCaught = true; }
}
ok(delegatedMutationCaught, 'mutazione: ID HTML crudo nel bottone delegato rompe la prova reale');
for (const [from, to, label] of [
  ['${jsq(id)}', '${id}', 'ID crudo nel comando finale di eliminazione'],
  ['${esc(name)}', '${name}', 'nome interpretato come HTML nella conferma']
]) {
  const original = named(app, 'confirmDelete');
  const changed = original.replace(from, to);
  let caught = false;
  if (covered.size === 8 && changed !== original) {
    try { dossierRoutes(dossier, app.replace(original, changed)); } catch { caught = true; }
  }
  ok(caught, 'mutazione: ' + label + ' fa cadere il percorso completo');
}

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
