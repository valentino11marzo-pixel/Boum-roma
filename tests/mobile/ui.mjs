// tests/mobile/ui.mjs — M2 PORTAL APP, MONTATO IN UN BROWSER VERO a 390px.
//
// Qui non si testa una copia: la pagina-harness carica la VERA
// css/portal.css, la VERA css/portal-mobile.css, il VERO js/portal-mobile.js
// e — per il wizard contratti — il VERO contractWizardNav estratto dal
// sorgente di portal-app.js (stessa disciplina di tests/squadra/desk.mjs:
// le graffe si contano, non si riscrive la funzione nel test). Gli stub sono
// SOLO i confini: goTo/openModal registrano le chiamate, i template modale
// replicano la struttura reale (id, name, required) — e la suite `run.mjs`
// pinna quei name= sul sorgente vero, così la replica non può divergere.
//
// Copre le promesse del layer:
//   · tab bar: 4 sezioni del ruolo + Menu, badge specchiati, navigazione
//   · menu sheet: la sidebar clonata funziona e si chiude
//   · liste → card: azioni riga come sheet, l'originale riceve il click
//   · wizard NATIVO addContract: chrome nuovo, validazione LORO, submit vero
//   · auto-wizard editContract: capitoli, campo ignoto mai perso ("Altro"),
//     riepilogo coi valori veri, Salva = requestSubmit del form vero
//   · footer da 6 bottoni → primaria + ⋯ → sheet etichettato
//   · rotazione oltre 920px: il layer si spegne e il modale torna desktop
//   · kill switch ?classic=1
//
// Si auto-skippa senza playwright, come le altre suite del repo.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

// Estrae una funzione top-level dal sorgente contando le graffe.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`funzione ${name} non trovata in portal-app.js`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
  }
  throw new Error(`graffe sbilanciate in ${name}`);
}
const appSrc = readFileSync(join(ROOT, 'js', 'portal-app.js'), 'utf8');
const realWizardNav = extractFn(appSrc, 'contractWizardNav');

// ── La pagina-harness ───────────────────────────────────────────────────
const HARNESS = `<!DOCTYPE html><html lang="it"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<link rel="stylesheet" href="/css/portal.css">
<link rel="stylesheet" href="/css/portal-mobile.css">
</head><body>
<div class="app active" id="app">
  <header class="header">
    <div class="header-left"><button class="menu-btn" onclick="toggleSidebar()">☰</button><a class="logo"><span class="logo-text">BOOM</span></a></div>
    <div class="header-center" id="searchContainer"><div class="search-box"><input id="globalSearch" placeholder="Cerca..."></div></div>
    <div class="header-right">
      <div class="user-menu"><div class="user-avatar" id="headerAvatar">VE</div>
      <div class="user-info"><div class="user-name" id="headerName">Valentino</div><div class="user-role" id="headerRole">Admin</div></div></div>
    </div>
  </header>
  <div class="layout">
    <div class="sidebar-overlay" id="sidebarOverlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="nav-section"><div class="nav-label">Operativo</div>
        <div class="nav-item active" onclick="goTo('dashboard')"><span class="nav-icon">📊</span> Dashboard</div>
        <div class="nav-item" onclick="goTo('leads')"><span class="nav-icon">📬</span> Lead Pipeline <span class="nav-badge green">3</span></div>
        <div class="nav-item" onclick="goTo('clienti')"><span class="nav-icon">👥</span> Clienti <span class="nav-badge gold">2</span></div>
        <div class="nav-item" onclick="goTo('viewings')"><span class="nav-icon">📅</span> Viewings</div>
      </div>
      <div class="nav-section"><div class="nav-label">Gestione</div>
        <div class="nav-item" onclick="goTo('contracts')"><span class="nav-icon">📋</span> Contratti <span class="nav-badge">4</span></div>
        <div class="nav-item" onclick="goTo('payments')"><span class="nav-icon">💳</span> Pagamenti <span class="nav-badge orange">2</span></div>
      </div>
      <div class="sidebar-footer">
        <div class="nav-item" onclick="goTo('settings')"><span class="nav-icon">⚙️</span> Impostazioni</div>
        <div class="nav-item" onclick="__calls.push(['logout'])"><span class="nav-icon">🚪</span> Esci</div>
      </div>
    </aside>
    <main class="main" id="main"><h1>Dashboard</h1></main>
  </div>
</div>
<div class="toast-container" id="toasts"></div>
<div id="modals"></div>
<script>
window.__calls = [];
let contractWizardStep = 0;
function toggleSidebar() { __calls.push(['toggleSidebar']); }
function toast(t, ti, m) { __calls.push(['toast', t, ti]); }
function buildContractReview() { var n = document.getElementById('cReviewContent'); if (n) n.innerHTML = '<b>review-ok</b>'; }
function saveContract(e) { e.preventDefault(); __calls.push(['saveContract']); }
function updateContract(e, id) { e.preventDefault(); __calls.push(['updateContract', id]); }
function closeModal() { document.body.classList.remove('modal-open'); document.getElementById('modals').innerHTML = ''; }
${realWizardNav}
function openTemplateModal(t) { __calls.push(['tpl', t]); }
function viewContract(id) { __calls.push(['viewContract', id]); }
function viewUserProfile(id) { __calls.push(['viewUserProfile', id]); }
function openFascicolo(id) { __calls.push(['openFascicolo', id]); }
// replica del CONTRATTO di handleSearch (dropdown #searchResults, righe
// tipizzate dalla funzione che lanciano): è da qui che il selettore del
// record riconosce cos'è ogni riga. Il contratto vero è pinnato sul
// sorgente da tests/actions/run.mjs.
function handleSearch(q) {
  if (!q || q.length < 2) { document.getElementById('searchResults')?.remove(); return; }
  let dd = document.getElementById('searchResults');
  if (!dd) {
    dd = document.createElement('div'); dd.id = 'searchResults';
    document.getElementById('globalSearch').parentElement.appendChild(dd);
  }
  dd.innerHTML =
    '<div onclick="viewContract(\\'ct1\\')"><span>📋</span><div><div>Contratto Via Cavour</div><div>Ugo Rossi · €900/mese</div></div></div>' +
    '<div onclick="viewUserProfile(\\'u9\\')"><span>👤</span><div><div>Ugo Rossi</div><div>tenant · u@r.it</div></div></div>';
}
function renderMain(p) {
  var m = document.getElementById('main');
  if (p !== 'contracts') { m.innerHTML = '<h1>' + p + '</h1>'; return; }
  var row = function (n) {
    return '<div class="list-item clickable contract-item" onclick="__calls.push([\\'row\\',' + n + '])" style="padding:14px 16px">' +
      '<div class="list-icon">✓</div>' +
      '<div class="list-content"><div class="list-title">Via Cavour ' + n + '</div><div class="list-subtitle">👤 Ugo Rossi · 📅 01/09</div></div>' +
      '<div style="text-align:right"><div class="text-gold" style="font-size:18px">€1.200</div></div>' +
      '<div class="list-actions">' +
      '<button class="btn btn-xs" title="Modifica" onclick="event.stopPropagation();__calls.push([\\'act\\',\\'edit\\'])">✏️</button>' +
      '<button class="btn btn-xs btn-secondary" title="PDF" onclick="event.stopPropagation();__calls.push([\\'act\\',\\'pdf\\'])">📄</button>' +
      '<button class="btn btn-xs btn-secondary" title="Fascicolo" onclick="event.stopPropagation();__calls.push([\\'act\\',\\'fascicolo\\'])">📑</button>' +
      '<button class="btn btn-xs btn-danger" title="Elimina" onclick="event.stopPropagation();__calls.push([\\'act\\',\\'del\\'])">🗑</button>' +
      '</div></div>';
  };
  m.innerHTML = '<div class="page-header"><h1 class="page-title">📋 Contratti</h1></div>' +
    '<div class="card"><div class="card-body flush" id="contractsContainer">' + row(1) + row(2) + '</div></div>';
}
function goTo(p) { __calls.push(['goTo', p]); location.hash = p; renderMain(p); }
var TPL = {
  addContract:
    '<div class="modal-overlay"><div class="modal lg">' +
    '<div class="modal-header"><h3 class="modal-title">📋 Nuovo Contratto — BOOM Protocol</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body" style="max-height:72vh;overflow-y:auto"><form id="mForm" onsubmit="saveContract(event)">' +
    '<div style="display:flex;gap:4px;margin-bottom:20px"><div id="cStep0">1 Tipo</div><div id="cStep1">2 Termini</div><div id="cStep2">3 Dettagli</div><div id="cStep3">4 Riepilogo</div></div>' +
    '<div id="cPage0">' +
    '<div style="display:flex;gap:8px"><button type="button" class="btn" id="cTypeTransitorio">🏠 Transitorio</button><button type="button" class="btn btn-secondary" id="cTypeStudenti">🎓 Studenti</button></div>' +
    '<input type="hidden" name="type" id="cType" value="transitorio">' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Immobile *</label><select class="form-select" name="propertyId" required><option value="">Seleziona…</option><option value="p1">Via Cavour 12</option></select></div>' +
    '<div class="form-group"><label class="form-label">Inquilino *</label><select class="form-select" name="tenantId" required><option value="">Seleziona…</option><option value="t1">Ugo Rossi</option></select></div>' +
    '</div>' +
    '<div style="text-align:right;margin-top:16px"><button type="button" class="btn" onclick="contractWizardNav(1)">Avanti →</button></div>' +
    '</div>' +
    '<div id="cPage1" style="display:none">' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Data Inizio *</label><input type="date" class="form-input" name="startDate" required></div>' +
    '<div class="form-group"><label class="form-label">Affitto €/mese *</label><input type="number" class="form-input" name="rent" id="cRent" required></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:16px"><button type="button" class="btn btn-secondary" onclick="contractWizardNav(0)">← Indietro</button><button type="button" class="btn" onclick="contractWizardNav(2)">Avanti →</button></div>' +
    '</div>' +
    '<div id="cPage2" style="display:none">' +
    '<div class="form-group"><label class="form-label">Note Interne</label><textarea class="form-textarea" name="notes" rows="2"></textarea></div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:16px"><button type="button" class="btn btn-secondary" onclick="contractWizardNav(1)">← Indietro</button><button type="button" class="btn" onclick="contractWizardNav(3)">Riepilogo →</button></div>' +
    '</div>' +
    '<div id="cPage3" style="display:none">' +
    '<div id="cReviewContent"></div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:16px"><button type="button" class="btn btn-secondary" onclick="contractWizardNav(2)">← Indietro</button><button type="submit" class="btn">📋 Crea Contratto &amp; Genera PDF</button></div>' +
    '</div>' +
    '</form></div></div></div>',
  editContract:
    '<div class="modal-overlay"><div class="modal">' +
    '<div class="modal-header"><h3 class="modal-title">✏️ Modifica Contratto</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><form id="mForm" onsubmit="updateContract(event,\\'c1\\')">' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Immobile</label><select class="form-select" name="propertyId"><option value="p1" selected>Via Cavour 12</option></select></div>' +
    '<div class="form-group"><label class="form-label">Inquilino</label><select class="form-select" name="tenantId"><option value="t1" selected>Ugo Rossi</option></select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Inizio</label><input type="date" class="form-input" name="startDate" value="2026-09-01"></div>' +
    '<div class="form-group"><label class="form-label">Fine</label><input type="date" class="form-input" name="endDate" value="2027-08-31"></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Affitto €</label><input type="number" class="form-input" name="rent" value="1200"></div>' +
    '<div class="form-group"><label class="form-label">Deposito €</label><input type="number" class="form-input" name="deposit" value="3600"></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Canone Totale €</label><input type="number" class="form-input" name="canoneTotal" readonly></div>' +
    '<div class="form-group"><label class="form-label">N° Rate</label><input type="number" class="form-input" name="canoneInstallments" readonly></div>' +
    '</div>' +
    '<div class="form-row"><div class="form-group"><label class="form-label">Stato</label><select class="form-select" name="status"><option value="active" selected>Attivo</option></select></div></div>' +
    '<div class="form-group"><label class="form-label">Sorpresa</label><input type="text" class="form-input" name="surprise" value="campo nuovo"></div>' +
    '<div class="form-group"><label class="form-label">Note</label><textarea class="form-textarea" name="notes" rows="2">nota interna</textarea></div>' +
    '</form></div>' +
    '<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Annulla</button><button class="btn" onclick="document.getElementById(\\'mForm\\').requestSubmit()">💾 Salva</button></div>' +
    '</div></div>',
  bigfooter:
    '<div class="modal-overlay"><div class="modal lg">' +
    '<div class="modal-header"><h3 class="modal-title">📋 Contratto — Via Cavour 12</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><p>Dettagli del contratto…</p></div>' +
    '<div class="modal-footer" style="flex-wrap:wrap">' +
    '<button class="btn" onclick="__calls.push([\\'foot\\',\\'edit\\'])">✏️ Modifica</button>' +
    '<button class="btn btn-secondary" onclick="__calls.push([\\'foot\\',\\'pdf\\'])">📄 PDF</button>' +
    '<button class="btn btn-secondary" onclick="__calls.push([\\'foot\\',\\'fascicolo\\'])">📑 Fascicolo</button>' +
    '<button class="btn btn-secondary" onclick="__calls.push([\\'foot\\',\\'pack\\'])">📦 Pack</button>' +
    '<button class="btn btn-danger" onclick="__calls.push([\\'foot\\',\\'termina\\'])">⛔ Termina</button>' +
    '<button class="btn btn-secondary" onclick="closeModal()">Chiudi</button>' +
    '</div></div></div>'
};
function openModal(type, data) {
  __calls.push(['openModal', type]);
  document.body.classList.add('modal-open');
  document.getElementById('modals').innerHTML = TPL[type] || '';
  setTimeout(function () { var o = document.querySelector('.modal-overlay'); if (o) o.classList.add('active'); }, 10);
}
</script>
<script src="/js/portal-actions.js"></script>
<script src="/js/portal-mobile.js"></script>
</body></html>`;

// ── Server statico + harness ────────────────────────────────────────────
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/pm-harness.html' || p === '/') {
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
// AWAIT obbligatorio su ogni verifica: una Promise è "vera" anche quando la
// verifica non è mai avvenuta (la lezione di tests/squadra/desk.mjs).
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).split('\n')[0]));
await page.goto(`http://127.0.0.1:${PORT}/pm-harness.html`);
await page.waitForFunction(() => window.BOOM_MOBILE && document.body.classList.contains('pm-on'));

console.log('— tab bar —');
await check('a 390px il layer è acceso (body.pm-on)', () => page.evaluate(() => document.body.classList.contains('pm-on')));
await check('la tab bar esiste, visibile, con 4 sezioni + Menu', () => page.evaluate(() => {
  const t = document.querySelector('.pm-tabbar');
  return t && !t.hidden && t.querySelectorAll('.pm-tab').length === 5 && getComputedStyle(t).position === 'fixed';
}));
await check('le 4 pinnate sono le preferite del ruolo, in ordine', () => page.evaluate(() =>
  JSON.stringify([...document.querySelectorAll('.pm-tab[data-target]')].map(b => b.dataset.target)) ===
  JSON.stringify(['dashboard', 'contracts', 'payments', 'viewings'])
));
await check('il badge Contratti è specchiato dalla sidebar (4)', () => page.evaluate(() => {
  const b = document.querySelector('.pm-tab[data-target="contracts"] .pm-tab-badge');
  return b && !b.hidden && b.textContent === '4';
}));
await check('il Menu somma i badge delle sezioni non pinnate (3+2=5)', () => page.evaluate(() => {
  const b = document.querySelector('.pm-tab-menu .pm-tab-badge');
  return b && !b.hidden && b.textContent === '5';
}));
await check("l'hamburger è nascosto: un ingresso solo", () => page.evaluate(() =>
  getComputedStyle(document.querySelector('.menu-btn')).display === 'none'
));
await page.tap('.pm-tab[data-target="contracts"]');
await page.waitForTimeout(200);
await check('tap sulla tab → goTo("contracts") + tab attiva', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'goTo' && c[1] === 'contracts') &&
  document.querySelector('.pm-tab[data-target="contracts"]').classList.contains('active')
));

console.log('— liste → card —');
await check('le righe contratto diventano card (pm-li) con corsia azioni', () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('#main .list-item')];
  return rows.length === 2 && rows.every(r => r.classList.contains('pm-li') && r.querySelector('.pm-card-actions'));
}));
await check('i bottoni originali da 25px sono nascosti, la primaria è etichettata', () => page.evaluate(() => {
  const row = document.querySelector('#main .list-item');
  const hidden = [...row.querySelectorAll('.pm-src-btn')].every(b => b.offsetParent === null);
  const primary = row.querySelector('.pm-act-primary');
  return hidden && primary && primary.textContent.includes('Modifica') && primary.getBoundingClientRect().height >= 44;
}));
await page.tap('#main .list-item .pm-act-more');
await page.waitForTimeout(400);
await check('⋯ apre lo sheet con le 4 azioni, etichette vere, Elimina in rosso', () => page.evaluate(() => {
  const items = [...document.querySelectorAll('.pm-sheet-item')];
  const labels = items.map(i => i.textContent.trim());
  return items.length === 4 && labels.some(l => l.includes('PDF')) && labels.some(l => l.includes('Fascicolo')) &&
    items.some(i => i.classList.contains('danger') && i.textContent.includes('Elimina'));
}));
await page.evaluate(() => { [...document.querySelectorAll('.pm-sheet-item')].find(i => i.textContent.includes('PDF')).click(); });
await page.waitForTimeout(300);
await check("il tap sullo sheet esegue l'azione ORIGINALE (e la riga non si apre)", () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'act' && c[1] === 'pdf') && !window.__calls.some(c => c[0] === 'row')
));

console.log('— menu sheet —');
await page.tap('.pm-tab-menu');
await page.waitForTimeout(400);
await check('il Menu è la sidebar vera: gruppi, voci, badge', () => page.evaluate(() => {
  const m = document.querySelector('.pm-menu');
  return m && m.querySelectorAll('.nav-section').length >= 2 &&
    m.querySelector('.pm-menu-user-name').textContent === 'Valentino' &&
    [...m.querySelectorAll('.nav-item')].some(i => i.textContent.includes('Pagamenti'));
}));
await page.evaluate(() => { [...document.querySelectorAll('.pm-menu .nav-item')].find(i => i.textContent.includes('Pagamenti')).click(); });
await page.waitForTimeout(500);
await check('tap su una voce del Menu → goTo e lo sheet si chiude', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'goTo' && c[1] === 'payments') && !document.querySelector('.pm-sheet')
));

console.log('— il Prontuario nel Menu (le funzioni sepolte, su telefono) —');
await page.tap('.pm-tab-menu');
await page.waitForTimeout(400);
await check('il Menu ha la riga di ricerca del Prontuario', () => page.evaluate(() =>
  document.querySelector('.pm-menu-input') !== null
));
await page.fill('.pm-menu-input', 'ricevuta');
await page.waitForTimeout(350);
await check('cercando "ricevuta" compaiono i documenti e le sezioni si nascondono', () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].map(r => r.textContent);
  const clone = document.querySelector('.pm-menu > div[class=""], .pm-menu > div:not([class])');
  return rows.some(r => r.includes('Ricevuta pigione')) && rows.length >= 2;
}));
await page.evaluate(() => {
  [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].find(r => r.textContent.includes('Ricevuta pigione')).click();
});
await page.waitForTimeout(350);
await check('due tap dal telefono: la ricevuta si apre e lo sheet si chiude', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'tpl' && c[1] === 'ricevuta_pigione') && !document.querySelector('.pm-sheet')
));

console.log('— il selettore del record nel Menu (le azioni contestuali) —');
await page.tap('.pm-tab-menu');
await page.waitForTimeout(400);
await page.fill('.pm-menu-input', 'fascicolo');
await page.waitForTimeout(350);
await check('il Menu trova il Fascicolo ARPE e DICE che serve un contratto', () => page.evaluate(() => {
  const row = [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].find(r => r.textContent.includes('Fascicolo ARPE'));
  return !!row && /scegli il contratto/i.test(row.textContent);
}));
await page.evaluate(() => {
  [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].find(r => r.textContent.includes('Fascicolo ARPE')).click();
});
await page.waitForTimeout(250);
await check('il foglio NON si chiude: chiede il contratto e offre il ritorno', () => page.evaluate(() =>
  !!document.querySelector('.pm-sheet') && !!document.querySelector('.pm-menu-back') &&
  /quale contratto/i.test(document.querySelector('.pm-menu-input').placeholder)
));
await page.fill('.pm-menu-input', 'rossi');
await page.waitForTimeout(350);
await check('si vedono SOLO i contratti (la persona dello stesso risultato resta fuori)', () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].map(r => r.textContent);
  return rows.some(r => r.includes('Contratto Via Cavour')) && !rows.some(r => r.includes('tenant · u@r.it'));
}));
await page.evaluate(() => {
  [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].find(r => r.textContent.includes('Contratto Via Cavour')).click();
});
await page.waitForTimeout(350);
await check('tre tap dal telefono: il fascicolo di QUEL contratto, con l\'id vero', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'openFascicolo' && c[1] === 'ct1') && !document.querySelector('.pm-sheet')
));
// il ritorno all'azione: non chiude il Menu
await page.tap('.pm-tab-menu');
await page.waitForTimeout(400);
await page.fill('.pm-menu-input', 'fascicolo');
await page.waitForTimeout(350);
await page.evaluate(() => {
  [...document.querySelectorAll('.pm-menu-res .pm-sheet-item')].find(r => r.textContent.includes('Fascicolo ARPE')).click();
});
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('.pm-menu-back').click());
await page.waitForTimeout(250);
await check('“← Indietro” torna alle azioni senza chiudere il Menu', () => page.evaluate(() =>
  !!document.querySelector('.pm-sheet') && !document.querySelector('.pm-menu-back') &&
  document.querySelector('.pm-menu-input').value === ''
));
await page.evaluate(() => document.querySelector('.pm-sheet-backdrop, .pm-sheet-back, .pm-sheet')?.remove());
await page.evaluate(() => { document.body.classList.remove('modal-open'); document.querySelectorAll('.pm-sheet-wrap, .pm-sheet').forEach(n => n.remove()); });
await page.waitForTimeout(150);

console.log('— wizard NATIVO addContract —');
await page.evaluate(() => openModal('addContract'));
await page.waitForTimeout(150);
await check('il modal contratto è full-screen con chrome wizard (pm-natwiz)', () => page.evaluate(() => {
  const ov = document.querySelector('#modals .modal-overlay');
  return ov && ov.classList.contains('pm-full') && ov.classList.contains('pm-natwiz') &&
    document.querySelector('.pm-wiz-count').textContent === 'Passo 1 di 4' &&
    document.querySelector('.pm-wiz-step-title').textContent === 'Tipo e parti';
}));
await check('lo stepper che sforava è nascosto, i dati no', () => page.evaluate(() => {
  const pill = document.getElementById('cStep0');
  const sel = document.querySelector('[name="propertyId"]');
  return pill.offsetParent === null && sel.offsetParent !== null;
}));
await check('le righe-nav originali sono nascoste ma vive (data-pm-nav)', () => page.evaluate(() =>
  [...document.querySelectorAll('[data-pm-nav="1"]')].length >= 4 &&
  [...document.querySelectorAll('[data-pm-nav="1"]')].every(r => r.offsetParent === null)
));
await page.tap('.pm-wiz-next');
await page.waitForTimeout(150);
await check('Avanti con i required vuoti NON avanza: la validazione resta la LORO', () => page.evaluate(() =>
  document.getElementById('cPage0').style.display !== 'none' &&
  window.__calls.some(c => c[0] === 'toast' && c[1] === 'warning')
));
await page.selectOption('[name="propertyId"]', 'p1');
await page.selectOption('[name="tenantId"]', 't1');
await page.tap('.pm-wiz-next');
await page.waitForTimeout(150);
await check('coi campi pieni si avanza: Passo 2, pagina 1 visibile', () => page.evaluate(() =>
  document.getElementById('cPage1').style.display !== 'none' &&
  document.querySelector('.pm-wiz-count').textContent === 'Passo 2 di 4'
));
await page.fill('[name="startDate"]', '2026-09-01');
await page.fill('[name="rent"]', '1200');
await page.tap('.pm-wiz-next');
await page.waitForTimeout(120);
await page.tap('.pm-wiz-next');
await page.waitForTimeout(150);
await check('al Riepilogo il loro buildContractReview è stato chiamato', () => page.evaluate(() =>
  document.querySelector('.pm-wiz-count').textContent === 'Passo 4 di 4' &&
  document.getElementById('cReviewContent').textContent.includes('review-ok')
));
await check('la barra dice "Crea contratto" e Indietro funziona sui passi', () => page.evaluate(() =>
  document.querySelector('.pm-wiz-next').textContent.includes('Crea contratto')
));
await page.tap('.pm-wiz-next');
await page.waitForTimeout(150);
await check('il tap finale è il SUBMIT vero del form (saveContract)', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'saveContract')
));

console.log('— rotazione: il layer si spegne, il modale torna desktop —');
await page.evaluate(() => openModal('addContract'));
await page.waitForTimeout(150);
await page.setViewportSize({ width: 1200, height: 800 });
await page.waitForTimeout(250);
await check('oltre i 920px: pm-on via, tab bar via', () => page.evaluate(() =>
  !document.body.classList.contains('pm-on') && document.querySelector('.pm-tabbar').hidden
));
await check('il wizard aperto torna desktop: stepper e righe-nav di nuovo visibili, chrome mobile spento', () => page.evaluate(() => {
  const pill = document.getElementById('cStep0');
  const nav = document.querySelector('[data-pm-nav="1"]');
  const chrome = document.querySelector('.pm-wiz-footer');
  return pill.offsetParent !== null && nav.offsetParent !== null && (!chrome || chrome.offsetParent === null);
}));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
await check('tornati sotto i 920px il layer si riaccende', () => page.evaluate(() =>
  document.body.classList.contains('pm-on')
));
await page.evaluate(() => closeModal());

console.log('— auto-wizard editContract (modale piatto → capitoli) —');
await page.evaluate(() => openModal('editContract'));
await page.waitForTimeout(150);
await check('il modale piatto diventa wizard a capitoli (pm-autowiz)', () => page.evaluate(() => {
  const ov = document.querySelector('#modals .modal-overlay');
  return ov && ov.classList.contains('pm-autowiz') &&
    document.querySelector('.pm-wiz-step-title').textContent === 'Immobile e inquilino';
}));
await check('i capitoli sono quelli semantici + Altro + Riepilogo (Studenti assente sparisce)', () => page.evaluate(() => {
  const dots = [...document.querySelectorAll('.pm-wiz-dot')].map(d => d.title);
  return JSON.stringify(dots) === JSON.stringify(['Immobile e inquilino', 'Date e stato', 'Canone e deposito', 'Note', 'Altro', 'Riepilogo']);
}));
await check('un campo NON mappato non si perde mai: "surprise" sta in Altro', () => page.evaluate(() => {
  const panes = [...document.querySelectorAll('.pm-wiz-pane')];
  const altro = panes[4];
  return altro && altro.querySelector('[name="surprise"]') !== null &&
    document.querySelector('#mForm [name="surprise"]') !== null; // e resta DENTRO il form
}));
await check('il footer originale è nascosto: comanda la barra wizard', () => page.evaluate(() => {
  const f = document.querySelector('.modal-footer');
  return f && f.offsetParent === null;
}));
await page.evaluate(() => { [...document.querySelectorAll('.pm-wiz-dot')].find(d => d.title === 'Riepilogo').click(); });
await page.waitForTimeout(150);
await check('il Riepilogo mostra i valori VERI (1200, Ugo Rossi) e gli 11 campi', () => page.evaluate(() => {
  const t = document.querySelector('.pm-wiz-recap').textContent;
  return t.includes('1200') && t.includes('Ugo Rossi') && t.includes('campo nuovo') &&
    document.querySelectorAll('.pm-wiz-recap-row').length >= 10;
}));
await page.evaluate(() => { [...document.querySelectorAll('.pm-wiz-recap-edit')].pop().click(); });
await page.waitForTimeout(120);
await check('"Modifica" dal riepilogo salta al capitolo giusto', () => page.evaluate(() =>
  document.querySelector('.pm-wiz-count').textContent !== 'Passo 6 di 6'
));
await page.evaluate(() => { [...document.querySelectorAll('.pm-wiz-dot')].find(d => d.title === 'Riepilogo').click(); });
await page.waitForTimeout(120);
await page.tap('.pm-wiz-next');
await page.waitForTimeout(150);
await check('💾 Salva = il requestSubmit del form vero (updateContract c1)', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'updateContract' && c[1] === 'c1')
));
await page.evaluate(() => closeModal());

console.log('— footer da 6 bottoni → primaria + ⋯ —');
await page.evaluate(() => openModal('bigfooter'));
await page.waitForTimeout(150);
await check('il footer si comprime: primaria + Chiudi + ⋯, il resto sparisce', () => page.evaluate(() => {
  const f = document.querySelector('.modal-footer');
  const visible = [...f.querySelectorAll('.btn')].filter(b => b.offsetParent !== null);
  return f.classList.contains('pm-collapsed') && visible.length === 2 &&
    visible[0].textContent.includes('Modifica') && f.querySelector('.pm-more-btn') !== null;
}));
await page.tap('.pm-more-btn');
await page.waitForTimeout(400);
await check('lo sheet elenca le 5 azioni (Chiudi escluso), Termina in rosso', () => page.evaluate(() => {
  const items = [...document.querySelectorAll('.pm-sheet-item')];
  return items.length === 5 && items.some(i => i.classList.contains('danger') && i.textContent.includes('Termina'));
}));
await page.evaluate(() => { [...document.querySelectorAll('.pm-sheet-item')].find(i => i.textContent.includes('Pack')).click(); });
await page.waitForTimeout(300);
await check('il tap esegue il bottone originale del footer', () => page.evaluate(() =>
  window.__calls.some(c => c[0] === 'foot' && c[1] === 'pack')
));

console.log('— kill switch —');
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page2 = await ctx2.newPage();
await page2.goto(`http://127.0.0.1:${PORT}/pm-harness.html?classic=1`);
await page2.waitForFunction(() => window.BOOM_MOBILE);
await check('?classic=1 spegne tutto: BOOM_MOBILE.off, niente pm-on, niente tab bar', () => page2.evaluate(() =>
  window.BOOM_MOBILE.off === true && !document.body.classList.contains('pm-on') && !document.querySelector('.pm-tabbar')
));
await ctx2.close();

await browser.close();
server.close();
console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Il portale sta in una mano — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
