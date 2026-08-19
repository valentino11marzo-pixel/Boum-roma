// tests/desktop/ui.mjs — D1 BOOM OS, MONTATO IN UN BROWSER VERO a 1440px.
//
// La harness carica ENTRAMBI i layer (portal-mobile.js + portal-desktop.js)
// come in produzione, con la CSS vera: così si prova anche la convivenza —
// a 1440 comanda pd, a 390 comanda pm, e il confine dei 920px non ha zone
// doppie né terra di nessuno. Gli stub sono solo i confini (goTo/openModal
// registrano; handleSearch replica il CONTRATTO del motore — dropdown
// #searchResults con righe onclick — che tests/desktop/run.mjs pinna sul
// sorgente vero di portal-app.js).
//
// Si auto-skippa senza playwright, come le altre suite del repo.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

const HARNESS = `<!DOCTYPE html><html lang="it"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<link rel="stylesheet" href="/css/portal.css">
<link rel="stylesheet" href="/css/portal-mobile.css">
<link rel="stylesheet" href="/css/portal-desktop.css">
</head><body>
<div class="app active" id="app">
  <header class="header">
    <div class="header-left"><button class="menu-btn" onclick="__calls.push(['burger'])">☰</button><a class="logo"><span class="logo-text">BOOM</span></a></div>
    <div class="header-center" id="searchContainer"><div class="search-box"><input id="globalSearch" placeholder="Cerca..."></div></div>
    <div class="header-right">
      <div class="user-menu"><div class="user-avatar" id="headerAvatar">VE</div>
      <div class="user-info"><div class="user-name" id="headerName">Valentino</div><div class="user-role" id="headerRole">Admin</div></div></div>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="nav-section"><div class="nav-label">Operativo</div>
        <div class="nav-item active" onclick="goTo('dashboard')"><span class="nav-icon">📊</span> Dashboard</div>
        <div class="nav-item" onclick="goTo('leads')"><span class="nav-icon">📬</span> Lead Pipeline <span class="nav-badge green">3</span></div>
        <div class="nav-item" onclick="goTo('viewings')"><span class="nav-icon">📅</span> Viewings</div>
      </div>
      <div class="nav-section"><div class="nav-label">Gestione</div>
        <div class="nav-item" onclick="goTo('contracts')"><span class="nav-icon">📋</span> Contratti <span class="nav-badge">4</span></div>
        <div class="nav-item" onclick="goTo('payments')"><span class="nav-icon">💳</span> Pagamenti</div>
      </div>
      <div class="nav-section"><div class="nav-label">Console</div>
        <div class="nav-item" onclick="__calls.push(['open','/banca']);window.open" ><span class="nav-icon">🏦</span> Banca &amp; Fisco</div>
      </div>
      <div class="sidebar-footer">
        <div class="nav-item" onclick="goTo('settings')"><span class="nav-icon">⚙️</span> Impostazioni</div>
      </div>
    </aside>
    <main class="main" id="main"><h1>Dashboard</h1></main>
  </div>
</div>
<div class="toast-container" id="toasts"></div>
<div id="modals"></div>
<script>
window.__calls = [];
function goTo(p) { __calls.push(['goTo', p]); location.hash = p; }
function toast(t, ti, m) { __calls.push(['toast', t]); }
function closeModal() { document.getElementById('modals').innerHTML = ''; }
// replica del CONTRATTO di handleSearch (dropdown #searchResults, righe onclick):
// il contratto vero è pinnato sul sorgente da tests/desktop/run.mjs
function openTemplateModal(t) { __calls.push(['tpl', t]); }
function openMagicSignEditor() { __calls.push(['magicsign']); }
function viewContract(id) { __calls.push(['viewContract', id]); }
function viewUserProfile(id) { __calls.push(['viewUserProfile', id]); }
function openFascicolo(id) { __calls.push(['openFascicolo', id]); }
function handleSearch(q) {
  if (!q || q.length < 2) { document.getElementById('searchResults')?.remove(); return; }
  let dd = document.getElementById('searchResults');
  if (!dd) {
    dd = document.createElement('div'); dd.id = 'searchResults';
    document.getElementById('globalSearch').parentElement.appendChild(dd);
  }
  dd.innerHTML = '<div style="padding:10px 14px;cursor:pointer" onclick="__calls.push([\\'entity\\',\\'' + q + '\\'])">' +
    '<span style="font-size:16px">📋</span><div><div>Contratto Via Cavour</div><div>Ugo Rossi</div></div></div>' +
    // le righe TIPIZZATE, nella forma vera del motore: è da queste che il
    // selettore del record riconosce il tipo (viewContract / viewUserProfile)
    '<div style="padding:10px 14px" onclick="viewContract(\\'ct1\\')">' +
    '<span>📋</span><div><div>Contratto Via Cavour</div><div>Ugo Rossi · €900/mese</div></div></div>' +
    '<div style="padding:10px 14px" onclick="viewUserProfile(\\'u9\\')">' +
    '<span>👤</span><div><div>Ugo Rossi</div><div>tenant · u@r.it</div></div></div>';
}
var TPL = {
  peekview:
    '<div class="modal-overlay active"><div class="modal lg">' +
    '<div class="modal-header"><h3 class="modal-title">📋 Contratto — Via Cavour 12</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><p>Scheda di sola lettura…</p></div>' +
    '<div class="modal-footer">' +
    '<button class="btn" onclick="__calls.push([\\'foot\\',\\'edit\\'])">✏️ Modifica</button>' +
    '<button class="btn btn-secondary" onclick="closeModal()">Chiudi</button>' +
    '</div></div></div>',
  formmodal:
    '<div class="modal-overlay active"><div class="modal lg">' +
    '<div class="modal-header"><h3 class="modal-title">✏️ Un form</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><form id="mForm">' +
    '<div class="form-group"><label class="form-label">Nome</label><input class="form-input" name="name"></div>' +
    '</form></div>' +
    '<div class="modal-footer"><button class="btn">Salva</button></div>' +
    '</div></div>'
};
function openModal(type) {
  __calls.push(['openModal', type]);
  document.getElementById('modals').innerHTML = TPL[type] || '';
}
</script>
<script src="/js/portal-actions.js"></script>
<script src="/js/portal-mobile.js"></script>
<script src="/js/portal-desktop.js"></script>
</body></html>`;

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/pd-harness.html' || p === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HARNESS);
    return;
  }
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

let pass = 0, fail = 0;
// AWAIT obbligatorio (lezione desk.mjs): una Promise è "vera" anche a vuoto.
async function check(name, fn) {
  try {
    const v = await fn();
    if (v) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
  } catch (e) {
    fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}

// --no-sandbox: sui runner CI (container, utente senza user-namespace)
// Chromium non parte senza. In locale è innocuo.
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).split('\n')[0]));
await page.goto(`http://127.0.0.1:${PORT}/pd-harness.html`);
await page.waitForFunction(() => window.BOOM_DESKTOP && document.body.classList.contains('pd-on'));

console.log('— il confine dei due layer —');
await check('a 1440px comanda il desktop: pd-on acceso, pm-on spento, niente tab bar', () => page.evaluate(() =>
  document.body.classList.contains('pd-on') && !document.body.classList.contains('pm-on') &&
  !document.querySelector('.pm-tabbar')
));

console.log('— command palette (⌘K) —');
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(250);
await check('Ctrl/⌘+K apre la palette con l\'input a fuoco', () => page.evaluate(() =>
  document.querySelector('.pd-cmd') !== null &&
  document.activeElement === document.querySelector('.pd-cmd-input')
));
await check('le sezioni ci sono: Crea, Vai a, Console — lette dalla sidebar VERA', () => page.evaluate(() => {
  const secs = [...document.querySelectorAll('.pd-cmd-sec')].map(s => s.textContent);
  const rows = [...document.querySelectorAll('.pd-cmd-row')].map(r => r.textContent);
  return secs.includes('Crea') && secs.includes('Vai a') && secs.includes('Console') &&
    rows.some(r => r.includes('Nuovo contratto')) &&
    rows.some(r => r.includes('Dashboard')) &&
    rows.some(r => r.includes('Banca'));
}));
await check('il badge Contratti viaggia anche nella palette', () => page.evaluate(() =>
  [...document.querySelectorAll('.pd-cmd-row')].some(r => r.textContent.includes('Contratti') && r.querySelector('.pd-cmd-badge')?.textContent === '4')
));
await page.type('.pd-cmd-input', 'contra');
await page.waitForTimeout(300);
await check('il filtro stringe e la ricerca entità viene SOLLEVATA dal motore', () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pd-cmd-row')].map(r => r.textContent);
  return rows.some(r => r.includes('Contratti')) && !rows.some(r => r.includes('Dashboard')) &&
    rows.some(r => r.includes('Contratto Via Cavour')) &&
    document.getElementById('searchResults') === null; // il dropdown nativo è stato adottato e rimosso
}));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
await check('↓ + ↵ esegue la voce e chiude la palette', () => page.evaluate(() =>
  !document.querySelector('.pd-cmd') && window.__calls.some(c => ['goTo','openModal','entity','tpl'].includes(c[0]))
));
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.evaluate(() => { [...document.querySelectorAll('.pd-cmd-row')].find(r => r.textContent.includes('Nuovo contratto')).click(); });
await page.waitForTimeout(200);
await check('la voce Crea apre il modale VERO (openModal addContract)', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'openModal' && c[1] === 'addContract')
));
await page.evaluate(() => closeModal());
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await check('Esc chiude la palette', () => page.evaluate(() => !document.querySelector('.pd-cmd')));

console.log('— il Prontuario nella palette (le funzioni sepolte) —');
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.type('.pd-cmd-input', 'ricevuta');
await page.waitForTimeout(350);
await check('⌘K trova i documenti sepolti: "ricevuta" mostra la sezione Documenti', () => page.evaluate(() => {
  const secs = [...document.querySelectorAll('.pd-cmd-sec')].map(s => s.textContent);
  const rows = [...document.querySelectorAll('.pd-cmd-row')].map(r => r.textContent);
  return secs.includes('Documenti') && rows.some(r => r.includes('Ricevuta pigione'));
}));
await page.evaluate(() => { [...document.querySelectorAll('.pd-cmd-row')].find(r => r.textContent.includes('Ricevuta pigione')).click(); });
await page.waitForTimeout(250);
await check('due tap: la ricevuta di pigione si apre davvero (era 4 passi)', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'tpl' && c[1] === 'ricevuta_pigione') && !document.querySelector('.pd-cmd')
));
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.type('.pd-cmd-input', 'disponibilita');
await page.waitForTimeout(350);
await check('gli strumenti sono cercabili senza accenti ("disponibilita")', () => page.evaluate(() => {
  const secs = [...document.querySelectorAll('.pd-cmd-sec')].map(s => s.textContent);
  const rows = [...document.querySelectorAll('.pd-cmd-row')].map(r => r.textContent);
  return secs.includes('Strumenti') && rows.some(r => r.includes('Disponibilità visite'));
}));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('— il selettore del record (le azioni contestuali) —');
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.type('.pd-cmd-input', 'fascicolo');
await page.waitForTimeout(350);
await check('⌘K trova il Fascicolo ARPE e DICE che serve un contratto', () => page.evaluate(() => {
  const secs = [...document.querySelectorAll('.pd-cmd-sec')].map(s => s.textContent);
  const row = [...document.querySelectorAll('.pd-cmd-row')].find(r => r.textContent.includes('Fascicolo ARPE'));
  return secs.includes('Su un record') && !!row && row.textContent.includes('contratto');
}));
await page.evaluate(() => { [...document.querySelectorAll('.pd-cmd-row')].find(r => r.textContent.includes('Fascicolo ARPE')).click(); });
await page.waitForTimeout(200);
await check('la palette NON si chiude: cambia domanda ("Per quale contratto?")', () => page.evaluate(() =>
  !!document.querySelector('.pd-cmd') && !!document.querySelector('.pd-cmd-crumb') &&
  document.querySelector('.pd-cmd-crumb').textContent.includes('Fascicolo') &&
  /quale contratto/i.test(document.querySelector('.pd-cmd-input').placeholder)
));
await check('senza aver scritto niente non promette record che non ha', () => page.evaluate(() =>
  !!document.querySelector('.pd-cmd-empty')
));
await page.type('.pd-cmd-input', 'rossi');
await page.waitForTimeout(350);
await check('cercando si vedono SOLO i contratti (non le persone dello stesso risultato)', () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pd-cmd-row')].map(r => r.textContent);
  return rows.some(r => r.includes('Contratto Via Cavour')) && !rows.some(r => r.includes('tenant · u@r.it'));
}));
await check('la tendina della ricerca non resta appesa in pagina', () => page.evaluate(() =>
  !document.getElementById('searchResults')
));
await page.evaluate(() => { [...document.querySelectorAll('.pd-cmd-row')].find(r => r.textContent.includes('Contratto Via Cavour')).click(); });
await page.waitForTimeout(250);
await check('TRE tap: il fascicolo di QUEL contratto si apre con l\'id vero', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'openFascicolo' && c[1] === 'ct1') && !document.querySelector('.pd-cmd')
));
// Esc torna indietro di UN passo, non chiude tutto
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.type('.pd-cmd-input', 'fascicolo');
await page.waitForTimeout(350);
await page.evaluate(() => { [...document.querySelectorAll('.pd-cmd-row')].find(r => r.textContent.includes('Fascicolo ARPE')).click(); });
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(220);
await check('Esc torna alle azioni (la palette resta aperta, il filo si toglie)', () => page.evaluate(() =>
  !!document.querySelector('.pd-cmd') && !document.querySelector('.pd-cmd-crumb')
));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await check('un secondo Esc chiude davvero', () => page.evaluate(() => !document.querySelector('.pd-cmd')));

console.log('— scorciatoie —');
await page.keyboard.press('g');
await page.keyboard.press('c');
await page.waitForTimeout(150);
await check('chord g→c naviga a Contratti passando dalla voce sidebar vera', () => page.evaluate(() =>
  window.__calls.filter(c => c[0] === 'goTo' && c[1] === 'contracts').length >= 1
));
await page.keyboard.press('n');
await page.keyboard.press('i');
await page.waitForTimeout(150);
await check('chord n→i apre Nuovo immobile', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'openModal' && c[1] === 'addProperty')
));
await page.evaluate(() => closeModal());
await page.keyboard.press('Slash');
await page.waitForTimeout(120);
await check('/ porta il fuoco sulla ricerca globale', () => page.evaluate(() =>
  document.activeElement === document.getElementById('globalSearch')
));
await page.evaluate(() => document.activeElement.blur());
await check('i chord NON rubano i tasti a chi scrive', () => page.evaluate(() => {
  const gs = document.getElementById('globalSearch');
  gs.focus();
  const before = window.__calls.length;
  gs.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
  gs.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
  gs.blur();
  return window.__calls.length === before;
}));
await page.keyboard.type('?');
await page.waitForTimeout(200);
await check('? apre il foglio dei tasti', () => page.evaluate(() =>
  document.querySelector('.pd-help') !== null &&
  document.querySelector('.pd-help').textContent.includes('Command palette')
));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('— peek drawer —');
await page.evaluate(() => openModal('peekview'));
await page.waitForTimeout(250);
await check('una scheda di sola lettura si apre come pannello destro (pd-peek)', () => page.evaluate(() => {
  const ov = document.querySelector('#modals .modal-overlay');
  const m = ov && ov.querySelector('.modal');
  if (!ov || !ov.classList.contains('pd-peek') || !m) return false;
  const r = m.getBoundingClientRect();
  return r.right > window.innerWidth - 4 && r.left > window.innerWidth * 0.45 && r.height >= window.innerHeight - 4;
}));
await page.evaluate(() => closeModal());
await page.evaluate(() => openModal('formmodal'));
await page.waitForTimeout(250);
await check('un modale CON campi resta finestra: il peek non tocca i form', () => page.evaluate(() => {
  const ov = document.querySelector('#modals .modal-overlay');
  return ov && !ov.classList.contains('pd-peek') && !ov.classList.contains('pm-autowiz');
}));
await page.evaluate(() => closeModal());

console.log('— il confine, attraversato —');
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await check('sotto i 920px: pd si spegne (palette compresa), pm si accende con la tab bar', () => page.evaluate(() =>
  !document.body.classList.contains('pd-on') && !document.querySelector('.pd-cmd') &&
  document.body.classList.contains('pm-on') &&
  document.querySelector('.pm-tabbar') && !document.querySelector('.pm-tabbar').hidden
));
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
await check('tornati larghi: pd riprende, pm lascia', () => page.evaluate(() =>
  document.body.classList.contains('pd-on') && !document.body.classList.contains('pm-on')
));

console.log('— kill switch dedicato —');
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page2 = await ctx2.newPage();
await page2.goto(`http://127.0.0.1:${PORT}/pd-harness.html?deskclassic=1`);
await page2.waitForFunction(() => window.BOOM_DESKTOP);
await check('?deskclassic=1 spegne SOLO il desktop (BOOM_DESKTOP.off, niente pd-on)', () => page2.evaluate(() =>
  window.BOOM_DESKTOP.off === true && !document.body.classList.contains('pd-on') &&
  window.BOOM_MOBILE && window.BOOM_MOBILE.off !== true
));
await ctx2.close();

await browser.close();
server.close();
console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Il cockpit risponde ai comandi — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
