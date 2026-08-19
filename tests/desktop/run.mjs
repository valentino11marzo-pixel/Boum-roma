// tests/desktop/run.mjs — D1 BOOM OS: le giunzioni asserite sulla SORGENTE.
//
// La faccia desktop vive delle stesse promesse di M2, specchiate: comandi
// che puntano a modali e sezioni VERE di portal-app.js, un solo breakpoint
// condiviso coi layer mobile (la stessa query, negata), stato solo in
// classi gated, il motore di ricerca MAI duplicato ma sollevato.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const appSrc = read('js/portal-app.js');
const pdSrc = read('js/portal-desktop.js');
const pmSrc = read('js/portal-mobile.js');
const cssSrc = read('css/portal-desktop.css');
const htmlSrc = read('portal.html');
const swSrc = read('sw.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('✗ FAIL ' + name); }
}

// ── La config VERA, dal file vero (sandbox VM, boot mai eseguito) ───────
const sandbox = { console };
sandbox.window = sandbox;
sandbox.document = { readyState: 'loading', addEventListener() {} };
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
vm.createContext(sandbox);
vm.runInContext(pdSrc, sandbox);
const PD = sandbox.BOOM_DESKTOP;
ok(PD && !PD.off && PD.CREATES && PD.GO_CHORDS, 'il layer espone la sua config (BOOM_DESKTOP) anche in sandbox');

// ── 1. Ogni comando "Crea" apre un modale che ESISTE davvero ────────────
for (const c of PD.CREATES) {
  ok(new RegExp(`type === '${c.t}'`).test(appSrc) || appSrc.includes(`openModal('${c.t}'`),
    `Crea · "${c.label}" → tipo modale reale: ${c.t}`);
}
// ── 2. Ogni chord g+lettera porta a una sezione vera ────────────────────
for (const [k, target] of Object.entries(PD.GO_CHORDS)) {
  ok(appSrc.includes(`goTo('${target}')`), `chord g+${k} → sezione reale "${target}"`);
}
for (const [k, t] of Object.entries(PD.CREATE_CHORDS)) {
  ok(PD.CREATES.some((c) => c.t === t), `chord n+${k} → comando Crea dichiarato (${t})`);
}

// ── 3. Un solo confine: la STESSA query di M2, negata ───────────────────
ok(pdSrc.includes("matchMedia('(max-width:920px)')"), 'il desktop usa la STESSA query 920px di M2');
ok(pmSrc.includes("'(max-width:' + BP + 'px)'"), 'M2 continua a possedere il breakpoint');
ok(/if \(mqMobile\.matches\) deactivate\(\); else activate\(\);/.test(pdSrc),
  'pd è il complemento esatto di pm: mai zona doppia, mai terra di nessuno');

// ── 4. Il motore di ricerca resta UNO: sollevato, mai ricopiato ─────────
ok(pdSrc.includes('window.handleSearch(qstr)'), 'la palette invoca il motore handleSearch esistente');
ok(pdSrc.includes("!$('#globalSearch')"), 'guardia: senza #globalSearch (non-admin) la ricerca tace, mai un throw');
ok(/try \{\s*window\.handleSearch/.test(pdSrc), 'handleSearch è in try/catch: la palette non muore mai per la ricerca');
ok(appSrc.includes("dd.id = 'searchResults'"), 'ancora del contratto: il dropdown #searchResults nasce in portal-app.js');
ok(appSrc.includes('onclick="${r.action};'), 'ancora del contratto: le righe portano la loro onclick auto-sufficiente');
ok(!/S\.contracts|S\.properties|S\.users/.test(pdSrc), 'il layer desktop non legge MAI lo stato S: niente secondo motore');

// ── 5. Il peek è solo per la LETTURA, mai per un form ───────────────────
ok(pdSrc.includes('if (fields > 0) return;'), 'un modale con campi resta finestra: il peek non tocca i form');
ok(/body\.pd-on \.modal-overlay\.pd-peek\{/.test(cssSrc), 'pd-peek gated su body.pd-on (ridimensionare ripristina)');
ok(!pdSrc.includes(".style.display = "), 'il layer non nasconde mai via style inline (stessa disciplina di M2)');

// ── 6. Tastiera educata ─────────────────────────────────────────────────
ok(pdSrc.includes('inEditor(e.target)'), 'i chord non rubano MAI i tasti a chi sta scrivendo');
ok(pdSrc.includes("$('#modals .modal-overlay')") && /if \(\$\('#modals \.modal-overlay'\)\) return;/.test(pdSrc),
  'dentro un modale i chord tacciono (⌘K e Esc esclusi)');
ok(pdSrc.includes("item.click()"), 'ogni voce è un .click() sull\'elemento originale: zero fork di logica');

// ── 7. Wiring ───────────────────────────────────────────────────────────
const iMobCss = htmlSrc.indexOf('/css/portal-mobile.css');
const iDeskCss = htmlSrc.indexOf('/css/portal-desktop.css');
const iMobJs = htmlSrc.indexOf('<script src="/js/portal-mobile.js">');
const iDeskJs = htmlSrc.indexOf('<script src="/js/portal-desktop.js">');
ok(iMobCss > -1 && iDeskCss > iMobCss, 'portal-desktop.css caricata dopo portal-mobile.css');
ok(iMobJs > -1 && iDeskJs > iMobJs, 'portal-desktop.js caricato dopo portal-mobile.js');
const swBranch = swSrc.slice(swSrc.indexOf('const portalAsset'), swSrc.indexOf('? url.pathname : null'));
ok(swBranch.includes('/js/portal-desktop.js') && swBranch.includes('/css/portal-desktop.css'),
  'sw.js: i file desktop sono network-first col tetto 6s');

// ── 8. Discipline CSS ───────────────────────────────────────────────────
let webkitOk = true;
for (const m of cssSrc.matchAll(/[^{}]+\{[^}]*\}/g)) {
  const block = m[0];
  if (/(^|[^-])backdrop-filter\s*:/.test(block) && !block.includes('-webkit-backdrop-filter')) webkitOk = false;
}
ok(webkitOk, 'ogni backdrop-filter ha il gemello -webkit- nello stesso blocco');
const guard = cssSrc.slice(cssSrc.indexOf('body:not(.pd-on)'), cssSrc.indexOf('display:none!important}', cssSrc.indexOf('body:not(.pd-on)')));
ok(guard.includes('.pd-cmd-backdrop') && guard.includes('.pd-help'), 'fuori dal layer palette e foglio tasti non si vedono');
ok(cssSrc.includes('z-index:1100'), 'la palette sta sopra i modali (300) e sotto askModal/chooseModal (1200)');

// ── 9. Kill switch dedicato (indipendente da quello mobile) ─────────────
ok(pdSrc.includes("localStorage.getItem('boom_classic_desktop')"), 'kill switch: boom_classic_desktop spegne il layer');
ok(pdSrc.includes("q.get('deskclassic')") && pdSrc.includes("q.get('deskapp')"), 'kill switch: ?deskclassic=1 persiste, ?deskapp=1 riattiva');
ok(!pdSrc.includes('boom_classic_mobile'), 'il kill switch desktop non tocca quello mobile');

// ── D2: i form grandi prendono i capitoli (2026-08-19) ─────────────────
// La mappa è LA STESSA di M2 (window.BOOM_MOBILE.WIZ — una copia sola);
// gli header si INSERISCONO, mai si spostano campi (FormData intatta);
// sotto i 920px il CSS li spegne (M2 riorganizza i campi a modo suo).
ok(/BOOM_MOBILE && window\.BOOM_MOBILE\.WIZ/.test(pdSrc), 'D2 legge la mappa capitoli di M2 — mai una seconda copia');
ok(/insertBefore\(h, block\)/.test(pdSrc) && !/appendChild\(block|\.append\(block/.test(pdSrc),
  'D2 INSERISCE header, non sposta mai un campo (FormData salva per costruzione)');
ok(/groups\.length < 8/.test(pdSrc), 'un form corto non prende capitoli');
ok(/window\.openModal\.__pdWrap/.test(pdSrc), 'il wrap di openModal ha la guardia anti-doppio');
const deskCss2 = read('css/portal-desktop.css');
ok(/body\.pd-on \.pd-form-sec/.test(deskCss2) && /body:not\(\.pd-on\) \.pd-form-sec\{display:none\}/.test(deskCss2),
  'gli header vivono SOLO sulla faccia desktop (gated nei due sensi)');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Il cockpit tiene — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
