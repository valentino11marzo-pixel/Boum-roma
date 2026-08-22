// tests/mobile/run.mjs — M2 Portal App: le giunzioni asserite sulla SORGENTE.
//
// Il layer mobile vive di promesse verso portal-app.js: nomi campo, sezioni,
// id del wizard nativo, ordine di caricamento, discipline CSS. Qui ognuna è
// pinnata dove nasce, così un rename in portal-app.js (o un ritocco alla CSS)
// non può rompere il telefono in silenzio.
//
// La config NON viene ricopiata nel test: js/portal-mobile.js gira in una
// sandbox VM (document finto, boot mai eseguito) e si legge la sua
// window.BOOM_MOBILE — la stessa disciplina di tests/squadra (mai due copie).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const appSrc = read('js/portal-app.js');
const pmSrc = read('js/portal-mobile.js');
const cssSrc = read('css/portal-mobile.css');
const portalCss = read('css/portal.css');
const htmlSrc = read('portal.html');
const swSrc = read('sw.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('✗ FAIL ' + name); }
}

// ── La config VERA, dal file vero ───────────────────────────────────────
const sandbox = { console };
sandbox.window = sandbox;
sandbox.document = { readyState: 'loading', addEventListener() {} };
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
vm.createContext(sandbox);
vm.runInContext(pmSrc, sandbox);
const PM = sandbox.BOOM_MOBILE;
ok(PM && !PM.off && PM.WIZ && PM.PREF_TABS, 'il layer espone la sua config (BOOM_MOBILE) anche in sandbox');

// ── 1. Ogni campo dichiarato nei capitoli ESISTE in portal-app.js ───────
// saveContract/updateContract leggono new FormData(#mForm) per NAME: un nome
// sbagliato nella mappa produrrebbe un capitolo vuoto e un campo orfano.
for (const [modalType, chapters] of Object.entries(PM.WIZ)) {
  for (const ch of chapters) {
    for (const f of ch.f) {
      const needle = f.endsWith('*') ? 'name="' + f.slice(0, -1) : 'name="' + f + '"';
      ok(appSrc.includes(needle), `WIZ ${modalType} · campo "${f}" esiste davvero in portal-app.js`);
    }
  }
}
ok(!/name="/.test(pmSrc), 'il layer non conia MAI un campo con name= (FormData resta di portal-app)');
ok(/form\.appendChild\(p\)/.test(pmSrc), 'le pagine del wizard restano DENTRO il form (FormData non perde campi)');

// ── 2. Le tab pinnabili e le sezioni-lista sono sezioni vere ────────────
for (const t of PM.PREF_TABS) {
  ok(appSrc.includes(`goTo('${t}')`), `tab "${t}" è un target goTo reale`);
}
for (const s of PM.LIST_SECTIONS) {
  ok(appSrc.includes(`case '${s}':`), `sezione-lista "${s}" è un case reale del router`);
}

// ── 3. Gli agganci al wizard nativo del contratto esistono ──────────────
for (const anchor of ['id="cPage0"', 'id="cPage3"', 'cStep${i}', 'function contractWizardNav', 'new FormData']) {
  ok(appSrc.includes(anchor), `ancora nativa presente in portal-app.js: ${anchor}`);
}
ok(pmSrc.includes("$('#cPage0', modal)"), 'il layer riconosce il wizard nativo dal marker #cPage0');
ok(pmSrc.includes('contractWizardNav('), 'il layer naviga SOLO attraverso contractWizardNav (validazione loro)');

// ── 4. Ordine di caricamento in portal.html ─────────────────────────────
const cssBase = htmlSrc.indexOf('/css/portal.css');
const cssMobile = htmlSrc.indexOf('/css/portal-mobile.css');
const jsBase = htmlSrc.indexOf('<script src="/js/portal-app.js">');
const jsMobile = htmlSrc.indexOf('<script src="/js/portal-mobile.js">');
ok(cssBase > -1 && cssMobile > cssBase, 'portal-mobile.css caricata DOPO portal.css (vince a pari specificità)');
ok(jsBase > -1 && jsMobile > jsBase, 'portal-mobile.js caricato DOPO portal-app.js (globali già definite)');

// ── 5. Il service worker tratta il layer come logica del portale ────────
const swBranch = swSrc.slice(swSrc.indexOf('const portalAsset'), swSrc.indexOf('? url.pathname : null'));
ok(swBranch.includes('/js/portal-mobile.js'), 'sw.js: portal-mobile.js è network-first col tetto 6s');
ok(swBranch.includes('/css/portal-mobile.css'), 'sw.js: portal-mobile.css è network-first col tetto 6s');

// ── 6. Discipline CSS ───────────────────────────────────────────────────
// 6a. Regola Safari del repo: ogni backdrop-filter ha il gemello -webkit-.
let webkitOk = true;
for (const m of cssSrc.matchAll(/[^{}]+\{[^}]*\}/g)) {
  const block = m[0];
  if (/(^|[^-])backdrop-filter\s*:/.test(block) && !block.includes('-webkit-backdrop-filter')) webkitOk = false;
}
ok(webkitOk, 'ogni backdrop-filter ha il gemello -webkit- nello stesso blocco');
// 6b. Lo STATO dei wizard vive in classi gated: ruotando un tablet oltre i
// 920px il modale torna desktop da solo. Niente display inline dal layer.
ok(!pmSrc.includes(".style.display = 'none'"), 'il layer non nasconde MAI via style inline (rotazione = ripristino)');
ok(/body\.pm-on \.pm-natwiz \.pm-natpill\{display:none!important\}/.test(cssSrc), 'stepper nativo nascosto SOLO sotto body.pm-on');
ok(/body\.pm-on \.pm-natwiz \[data-pm-nav="1"\]\{display:none!important\}/.test(cssSrc), 'righe-nav native nascoste SOLO sotto body.pm-on');
ok(/body\.pm-on \.pm-autowiz \.pm-wiz-pane:not\(\.pm-cur\)\{display:none\}/.test(cssSrc), 'pagina corrente auto-wizard gated su body.pm-on');
ok(/body\.pm-on \.pm-autowiz \.modal-footer\{display:none!important\}/.test(cssSrc), 'footer originale nascosto SOLO sotto body.pm-on');
const guard = cssSrc.slice(cssSrc.indexOf('body:not(.pm-on)'), cssSrc.indexOf('display:none!important}', cssSrc.indexOf('body:not(.pm-on)')));
for (const cls of ['.pm-tabbar', '.pm-card-actions', '.pm-wiz-progress', '.pm-wiz-footer', '.pm-more-btn']) {
  ok(guard.includes(cls), `fuori dal layer non si vede: ${cls}`);
}
// 6c. Safe-area: la tab bar dipende da --safe-b, che è di M1 (portal.css).
ok(cssSrc.includes('var(--safe-b)'), 'la tab bar usa la safe-area');
ok(portalCss.includes('--safe-b:env(safe-area-inset-bottom'), 'portal.css definisce ancora --safe-b (dipendenza M1)');
// 6d. I toast salgono sopra la tab bar.
ok(/body\.pm-on \.toast-container\{[^}]*bottom:calc\(var\(--pm-tab-h\)/.test(cssSrc), 'toast sopra la tab bar');
// 6e. Gli inline style dei template (72vh / 700px) vengono davvero battuti.
ok(/body\.pm-on \.pm-full \.modal-body\{[^}]*max-height:none!important/.test(cssSrc), 'max-height inline dei body modale battuto con !important');
ok(/body\.pm-on \.modal\{[^}]*max-width:100%!important/.test(cssSrc), 'max-width inline dei modali battuto con !important');
// 6f. La sticky Azioni di M1 è neutralizzata dentro le card-tabella.
ok(/body\.pm-on \.pm-cards td\{[^}]*position:static!important/.test(cssSrc), 'sticky ultima colonna M1 neutralizzata nelle card');

// ── 7. I wrap non cambiano i contratti delle funzioni avvolte ───────────
ok(pmSrc.includes('return om.apply(this, arguments)'), 'wrap openModal: il valore di ritorno passa intatto');
ok(/window\.goTo = function \(p, a\) \{\s*var r = g\.apply\(this, arguments\);[\s\S]*?return r;/.test(pmSrc), 'wrap goTo: il valore di ritorno passa intatto');
ok(pmSrc.includes('__pm'), 'i wrap sono idempotenti (guardia __pm: mai doppio avvolgimento)');

// ── 8. Kill switch e attivazione ────────────────────────────────────────
ok(pmSrc.includes("localStorage.getItem('boom_classic_mobile')"), 'kill switch: boom_classic_mobile spegne il layer');
ok(pmSrc.includes("q.get('classic')") && pmSrc.includes("q.get('app')"), 'kill switch: ?classic=1 persiste, ?app=1 riattiva');
ok(PM.BP === 920 && pmSrc.includes("'(max-width:' + BP + 'px)'"), 'il breakpoint del JS è uno solo (' + PM.BP + 'px) e governa matchMedia');
ok(htmlSrc.includes('viewport-fit=cover'), 'viewport-fit=cover presente (le safe-area valgono qualcosa)');

// ── 9. Il proxy non inventa etichette: title > aria-label > testo ───────
ok(/txt\(b\.getAttribute\('title'\)\) \|\| txt\(b\.getAttribute\('aria-label'\)\) \|\| txt\(b\.textContent\)/.test(pmSrc),
  'le etichette degli sheet vengono dal bottone vero (title > aria > testo)');
const pmCode = pmSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); // i commenti non sono codice
ok(/b\.click\(\)/.test(pmCode) && !/\bdb\.collection|\bfirebase\.|\bfirestore\./i.test(pmCode),
  'ogni azione è un .click() sul bottone originale: il layer non tocca mai i dati');

// ── Il kill switch non è più MUTO (lezione 19/08: la classica appiccicosa
//    ha spento la modalità app sul telefono del fondatore, in silenzio) ──
ok(/pmClassicPill/.test(pmSrc) && /tocca per riattivarla/.test(pmSrc),
  'in modalità classica compare la pillola che lo DICE e riattiva al tap');
ok(/location\.href = location\.pathname \+ location\.hash/.test(pmSrc),
  'la riattivazione ricarica su URL PULITO (con ?classic=1 ancora in barra il flag tornerebbe)');
ok(/_bq\.get\('boom'\)==='app'/.test(htmlSrc) && /boom_classic_mobile/.test(htmlSrc) && /boom_classic_desktop/.test(htmlSrc) && /boom_no_finish/.test(htmlSrc),
  'portal.html: ?boom=app è il reset universale di TUTTI i kill switch appiccicosi');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Tutte le giunzioni tengono — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
