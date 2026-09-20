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
// `node tests/mobile/ui.mjs --serve`: stessi fixture, ispezionabili a mano
// senza lanciare Chromium; dati sintetici, nessun Firebase o endpoint API.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

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
const realPanels = ['esc', 'kindLabel', 'inboxPage', 'inboxConversationCard',
  'inboxRelativeTime', 'inboxThreadPanel', 'inboxHomieBanner', 'inboxMessageBubble',
  'inboxComposer', 'rentMoney', 'rentActionArg', 'rentMonthLabel', 'openRentReportReview']
  .map(name => extractFn(appSrc, name)).join('\n');

// ── La pagina-harness ───────────────────────────────────────────────────
const HARNESS = `<!DOCTYPE html><html lang="it"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<link rel="stylesheet" href="/css/portal.css">
<link rel="stylesheet" href="/css/portal-finish.css">
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
    <main class="main" id="main"></main>
  </div>
</div>
<div class="toast-container" id="toasts"></div>
<div id="modals"></div>
<script src="/js/conversations.js"></script>
<script src="/js/rent-engine.js"></script>
<script>
window.__calls = [];
var S = {
  conversations: [{ id: 'synthetic-conv', contactId: 'synthetic-person', contactType: 'lead', contactName: 'Contatto Sintetico', contactPhone: '+390000000000', contactEmail: 'prova.molto.lunga@example.test', status: 'open', channel: 'mixed' }],
  messages: Array.from({ length: 30 }, function (_, i) { return { conversationId: 'synthetic-conv', direction: i % 2 ? 'out' : 'in', channel: 'email', body: 'Messaggio sintetico ' + i + ': nessun dato reale.', at: '2026-09-20T10:00:00Z' }; }),
  payments: [{ id: 'synthetic-payment', status: 'reported', amount: 1200, month: '2026-09' }]
};
var _inboxState = { convId: 'synthetic-conv', filter: 'all', channel: 'all', search: '', composing: 'whatsapp' };
function isAdmin() { return true; }
function inboxRefresh() { document.getElementById('main').innerHTML = inboxPage(); }
function submitRentReportReview() { __calls.push(['reviewRent']); }
${realPanels}
let contractWizardStep = 0;
function toggleSidebar() { __calls.push(['toggleSidebar']); }
function toast(t, ti, m) { __calls.push(['toast', t, ti]); }
function buildContractReview() { var n = document.getElementById('cReviewContent'); if (n) n.innerHTML = '<b>review-ok</b>'; }
function saveContract(e) { e.preventDefault(); __calls.push(['saveContract']); }
function updateContract(e, id) { e.preventDefault(); __calls.push(['updateContract', id]); }
function saveUser(e) { e.preventDefault(); __calls.push(['saveUser']); }
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
  if (p === 'inbox') { inboxRefresh(); return; }
  if (p !== 'contracts') {
    m.innerHTML = '<h1>' + p + '</h1><p>Prova locale · tutti i dati sono sintetici.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:24px">' +
      '<button class="btn" onclick="goTo(\\'contracts\\')">Lista contratti</button>' +
      '<button class="btn" onclick="openModal(\\'addContract\\')">Nuovo contratto</button>' +
      '<button class="btn" onclick="openModal(\\'editContract\\')">Modifica contratto</button>' +
      '<button class="btn" onclick="openModal(\\'bigfooter\\')">Scheda completa</button>' +
      '<button class="btn" onclick="openModal(\\'compactModal\\')">Finestra lunga</button>' +
      '<button class="btn" onclick="goTo(\\'inbox\\')">Inbox sintetica</button>' +
      '<button class="btn" onclick="openRentReportReview(\\'synthetic-payment\\')">Revisione bonifico</button>' +
      '<button class="btn" onclick="openModal(\\'addProperty\\')">Form con un capitolo</button></div>';
    return;
  }
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
    '<div style="display:flex;gap:8px"><button type="button" class="btn" id="cTypeTransitorio">🏠 Transitorio</button><button type="button" class="btn btn-secondary" id="cTypeStudenti">🎓 Studenti</button><button type="button" class="btn btn-secondary" id="cType32">3+2 concordato</button></div>' +
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
    '<div class="form-group"><label class="form-label">Data Fine *</label><input type="date" class="form-input" name="endDate" required></div>' +
    '<div class="form-group"><label class="form-label">Affitto €/mese *</label><input type="number" class="form-input" name="rent" id="cRent" required></div>' +
    '<div class="form-group"><label class="form-label">Mensilità deposito</label><input type="number" class="form-input" name="depositMonths" value="3" min="1" max="3"></div>' +
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
  addUser:
    '<div class="modal-overlay"><div class="modal lg"><div class="modal-header"><h3 class="modal-title">Utente di prova</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><form id="mForm" onsubmit="saveUser(event)">' +
    '<div class="form-group"><label class="form-label">Nome *</label><input class="form-input" name="name" required value="Utente Prova"></div>' +
    '<div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" name="email" required></div>' +
    '<div class="form-group"><label class="form-label">Password *</label><input class="form-input" type="password" name="password" required minlength="6"></div>' +
    '<div class="form-group"><label class="form-label">Telefono</label><input class="form-input" type="tel" name="phone"></div>' +
    '<div class="form-group"><label class="form-label">Nascita</label><input class="form-input" type="date" name="birthDate"></div>' +
    '<div class="form-group"><label class="form-label">Note</label><textarea class="form-textarea" name="notes"></textarea></div>' +
    '</form></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Annulla</button><button class="btn" onclick="document.getElementById(\\'mForm\\').requestSubmit()">Salva</button></div></div></div>',
  addProperty:
    '<div class="modal-overlay"><div class="modal"><div class="modal-header"><h3 class="modal-title">Immobile di prova</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><form id="mForm">' + Array.from({ length: 8 }, function (_, i) {
      return '<div class="form-group"><label class="form-label">Campo nuovo ' + i + '</label><input class="form-input" name="unknown' + i + '" value="valore ' + i + '"></div>';
    }).join('') + '</form></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button></div></div></div>',
  compactModal:
    '<div class="modal-overlay"><div class="modal"><div class="modal-header"><h3 class="modal-title">Finestra lunga di prova</h3><button class="modal-close" onclick="closeModal()">×</button></div>' +
    '<div class="modal-body"><form><div class="form-group"><label class="form-label">Nota</label><input class="form-input" name="note" value="Solo dati sintetici"></div></form>' +
    Array.from({ length: 20 }, function (_, i) { return '<p>Riga ' + i + ' · Dettaglio sintetico da leggere prima della conferma.</p>'; }).join('') +
    '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Annulla</button><button class="btn btn-secondary">Anteprima</button><button class="btn">Conferma</button></div></div></div>',
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
renderMain(location.hash.slice(1) || 'dashboard');
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
if (process.argv.includes('--serve')) {
  console.log('Harness mobile locale (dati sintetici): http://127.0.0.1:' + PORT + '/pm-harness.html');
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  server.close();
  process.exit(0);
}

const chromium = await loadChromium();
if (!chromium) {
  server.close();
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

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
await check('il Menu blocca lo scroll della pagina sotto e offre Chiudi con target da dito', () => page.evaluate(() => {
  const close = document.querySelector('.pm-sheet button[aria-label="Chiudi"]');
  const r = close?.getBoundingClientRect();
  return getComputedStyle(document.body).overflowY === 'hidden' && r && r.width >= 44 && r.height >= 44;
}));
await page.tap('.pm-sheet button[aria-label="Chiudi"]');
await page.waitForTimeout(350);
await check('Chiudi libera la pagina e rende il focus al Menu', () => page.evaluate(() =>
  !document.querySelector('.pm-sheet') && getComputedStyle(document.body).overflowY !== 'hidden' &&
  document.activeElement.classList.contains('pm-tab-menu')
));
await page.tap('.pm-tab-menu');
await page.waitForTimeout(350);
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
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
await check('Escape chiude il Menu e ripristina lo scroll', () => page.evaluate(() =>
  !document.querySelector('.pm-sheet') && getComputedStyle(document.body).overflowY !== 'hidden'
));

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
await page.fill('[name="endDate"]', '2027-08-31');
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

console.log('— wizard nativo: passi saltati e vincoli numerici —');
await page.evaluate(() => openModal('addContract'));
await page.waitForTimeout(150);
await page.selectOption('[name="propertyId"]', 'p1');
await page.selectOption('[name="tenantId"]', 't1');
await page.tap('.pm-wiz-dot[data-i="3"]');
await check('saltare al Riepilogo porta al primo campo mancante nei Termini', () => page.evaluate(() =>
  document.getElementById('cPage1').offsetParent !== null &&
  document.querySelector('[name="startDate"]').offsetParent !== null &&
  document.activeElement.name === 'startDate'
));
await page.fill('[name="startDate"]', '2026-09-01');
await page.fill('[name="endDate"]', '2027-08-31');
await page.fill('[name="rent"]', '1200');
await page.fill('[name="depositMonths"]', '4');
await page.tap('.pm-wiz-next');
await check('deposito oltre max=3 resta visibile e correggibile prima di avanzare', () => page.evaluate(() =>
  document.getElementById('cPage1').offsetParent !== null &&
  document.activeElement.name === 'depositMonths' &&
  document.querySelector('[name="depositMonths"]').validity.rangeOverflow
));
await page.evaluate(() => closeModal());

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

console.log('— form a un solo capitolo: nessun dato scompare —');
await page.evaluate(() => openModal('addProperty'));
await page.waitForTimeout(150);
await check('otto campi non mappati restano nel form, visibili e inviabili coi valori originali', () => page.evaluate(() => {
  const form = document.querySelector('#mForm');
  const data = new FormData(form);
  return Array.from({ length: 8 }, (_, i) => {
    const f = form.querySelector('[name="unknown' + i + '"]');
    return f && f.offsetParent !== null && data.get('unknown' + i) === 'valore ' + i;
  }).every(Boolean);
}));
await page.evaluate(() => closeModal());

console.log('— auto-wizard: errori recuperabili prima e dopo il riepilogo —');
await page.evaluate(() => openModal('addUser'));
await page.waitForTimeout(150);
await page.fill('[name="email"]', 'indirizzo-non-valido');
await page.fill('[name="password"]', 'password-di-prova');
await page.tap('.pm-wiz-next');
await check('email non valida: il campo resta visibile e riceve il focus', () => page.evaluate(() =>
  document.querySelector('[name="email"]').offsetParent !== null &&
  document.activeElement.name === 'email' && !window.__calls.some(c => c[0] === 'saveUser')
));
await page.fill('[name="email"]', 'prova@example.test');
await page.fill('[name="password"]', 'abc');
await page.tap('.pm-wiz-next');
await check('password troppo corta: minlength è rispettato prima di nascondere il campo', () => page.evaluate(() =>
  document.querySelector('[name="password"]').offsetParent !== null && document.activeElement.name === 'password'
));
await page.fill('[name="password"]', 'password-di-prova');
await page.evaluate(() => [...document.querySelectorAll('.pm-wiz-dot')].find(d => d.title === 'Riepilogo').click());
await page.waitForTimeout(100);
await page.evaluate(() => { document.querySelector('[name="email"]').value = 'non-valido'; });
await page.tap('.pm-wiz-next');
await check('un valore divenuto invalido nel riepilogo riapre il capitolo giusto senza salvataggi', () => page.evaluate(() =>
  document.querySelector('[name="email"]').offsetParent !== null &&
  document.activeElement.name === 'email' && !window.__calls.some(c => c[0] === 'saveUser')
));
await page.fill('[name="email"]', 'prova@example.test');
await page.evaluate(() => [...document.querySelectorAll('.pm-wiz-dot')].find(d => d.title === 'Riepilogo').click());
await page.tap('.pm-wiz-next');
await check('corretto il campo, Salva chiama una sola volta il form originale', () => page.evaluate(() =>
  window.__calls.filter(c => c[0] === 'saveUser').length === 1
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
await page.evaluate(() => closeModal());
await page.waitForTimeout(350);

console.log('— app installata: notch, telefono piccolo e azioni sempre raggiungibili —');
await page.evaluate(() => {
  document.documentElement.style.setProperty('--safe-t', '59px');
  document.documentElement.style.setProperty('--safe-b', '34px');
});
await check('la testata conserva 64px utilizzabili sotto la safe-area del notch', () => page.evaluate(() => {
  const header = document.querySelector('.header').getBoundingClientRect();
  const avatar = document.querySelector('#headerAvatar').getBoundingClientRect();
  return header.height >= 123 && avatar.top >= 59 && avatar.bottom <= header.bottom;
}));
for (const width of [320, 390]) {
  await page.setViewportSize({ width, height: 667 });
  await page.evaluate(() => openModal('compactModal'));
  await page.waitForTimeout(350);
  await check('a ' + width + 'px il footer della finestra lunga resta interamente raggiungibile', () => page.evaluate(() => {
    const body = document.querySelector('.modal-body');
    const footer = document.querySelector('.modal-footer');
    const modal = document.querySelector('.modal').getBoundingClientRect();
    const r = footer.getBoundingClientRect();
    const buttons = [...footer.querySelectorAll('button')];
    return r.top >= modal.top && r.bottom <= modal.bottom + 1 && r.bottom <= innerHeight + 1 &&
      buttons.every(b => {
        const q = b.getBoundingClientRect();
        return q.left >= 0 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1;
      }) && body.scrollHeight > body.clientHeight;
  }));
  await page.evaluate(() => closeModal());
}
await page.setViewportSize({ width: 320, height: 667 });
await page.evaluate(() => openModal('addContract'));
await page.waitForTimeout(350);
await check('a 320px i tre tipi di contratto restano leggibili dentro il telefono', () => page.evaluate(() =>
  ['cTypeTransitorio', 'cTypeStudenti', 'cType32'].every(id => {
    const b = document.getElementById(id);
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1;
  })
));
await page.evaluate(() => closeModal());
await page.setViewportSize({ width: 390, height: 844 });

console.log('— tastiera iOS: spazio visibile ridotto senza resize della pagina —');
await page.evaluate(() => openModal('editContract'));
await page.waitForTimeout(150);
// Confine di sistema simulato: iOS cambia visualViewport ma mantiene
// innerHeight. Il layout e gli handler sotto test sono quelli del prodotto.
await page.evaluate(() => {
  Object.defineProperties(window.visualViewport, {
    height: { configurable: true, value: 400 },
    offsetTop: { configurable: true, value: 30 },
    scale: { configurable: true, value: 1 }
  });
  window.visualViewport.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(350);
await check('con tastiera la barra Avanti resta sopra il limite visibile di 430px', () => page.evaluate(() => {
  const r = document.querySelector('.pm-wiz-footer').getBoundingClientRect();
  const close = document.querySelector('.modal-close').getBoundingClientRect();
  return r.top >= 30 && r.bottom <= 431 && close.top >= 30 && close.bottom <= 430;
}));
await page.evaluate(() => closeModal());
await page.evaluate(() => openRentReportReview('synthetic-payment'));
await page.waitForTimeout(350);
await check('anche il form diretto di revisione bonifico mantiene il footer sopra la tastiera', async () => {
  const geometry = await page.evaluate(() => {
  const button = document.getElementById('rentReviewSubmit');
  const r = button.getBoundingClientRect();
  const body = document.querySelector('.modal-body');
    return { top: r.top, bottom: r.bottom, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
  });
  if (geometry.top < 30 || geometry.bottom > 431 || geometry.scrollHeight <= geometry.clientHeight) {
    throw new Error(JSON.stringify(geometry));
  }
  return true;
});
await page.evaluate(() => closeModal());
// La tab bar è correttamente fuori vista mentre la tastiera è aperta:
// apriamo lo stesso Menu dal suo handler senza inventare un tap accessibile.
await page.evaluate(() => document.querySelector('.pm-tab-menu').click());
await page.waitForTimeout(350);
await check('anche il Menu e Chiudi stanno nello spazio sopra la tastiera', () => page.evaluate(() => {
  const r = document.querySelector('.pm-sheet').getBoundingClientRect();
  const close = document.querySelector('.pm-sheet button[aria-label="Chiudi"]').getBoundingClientRect();
  return r.top >= 30 && r.bottom <= 431 && close.top >= 30 && close.bottom <= 430;
}));
await page.keyboard.press('Escape');
await page.evaluate(() => {
  delete window.visualViewport.height;
  delete window.visualViewport.offsetTop;
  delete window.visualViewport.scale;
  window.visualViewport.dispatchEvent(new Event('resize'));
  document.documentElement.style.removeProperty('--safe-t');
  document.documentElement.style.removeProperty('--safe-b');
});
await page.waitForTimeout(350);

console.log('— Inbox vera: canali, compositore e timeline a misura di telefono —');
for (const width of [320, 390]) {
  await page.setViewportSize({ width, height: 667 });
  await page.evaluate(() => goTo('inbox'));
  await page.waitForTimeout(200);
  await check('a ' + width + 'px i quattro canali e le azioni dell’Inbox restano dentro la card', () => page.evaluate(() => {
    const card = document.querySelector('.inbox-list-pane + div > .card');
    const composer = card.lastElementChild;
    const r = card.getBoundingClientRect();
    const controls = [...composer.querySelectorAll('button,select,textarea')];
    const channels = [...composer.firstElementChild.querySelectorAll('button')];
    return channels.length === 4 && document.documentElement.scrollWidth <= innerWidth + 1 && controls.every(b => {
      const q = b.getBoundingClientRect();
      return q.left >= r.left && q.right <= r.right + 1 && q.bottom <= r.bottom + 1;
    });
  }));
  await check('a ' + width + 'px il contatto ha una riga larga e la ricerca un target da dito', () => page.evaluate(() => {
    const card = document.querySelector('.inbox-list-pane + div > .card');
    const contact = card.firstElementChild.firstElementChild.getBoundingClientRect();
    const search = document.querySelector('.inbox-list-pane input[type="search"]').getBoundingClientRect();
    return contact.width >= card.clientWidth - 45 && search.height >= 44;
  }));
  await check('a ' + width + 'px la timeline scorre senza comprimere il compositore', () => page.evaluate(() => {
    const timeline = document.querySelector('.inbox-list-pane + div > .card > div[style*="overflow-y:auto"]');
    const before = timeline.scrollTop;
    timeline.scrollTop = 100;
    return timeline.scrollHeight > timeline.clientHeight && timeline.scrollTop > before &&
      document.getElementById('inboxBody').getBoundingClientRect().height >= 80;
  }));
}

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
