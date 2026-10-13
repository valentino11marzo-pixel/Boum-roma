// IL PORTALE DELLA PROPRIETARIA nel browser vero, a 390px (il suo telefono)
// e a 1280px. Le funzioni del portal sono quelle VERE estratte da
// js/portal-app.js, il layer mobile è js/portal-mobile.js vero; Firestore è
// finto e registra le scritture. `Notification` è cancellata prima che il
// portale parta: è iPhone Safari fuori da una PWA installata. Dati sintetici.
//   1. tab bar: Palazzo · Documenti · Fisco · Menu (mai «Studio», mai
//      Pagamenti/Contratti/Messaggi);
//   2. ogni rotta ritirata (anche scritta a mano nell'hash) torna al Palazzo;
//   3. Impostazioni si apre e porta «Cambia password» e «Scrivi a BOOM»;
//   4. «Contratto» = l'interno selezionato nel suo Palazzo, mai il modale;
//   5. Documenti: i condivisi da BOOM, in italiano; mai un annullato;
//   6. «Scrivi a BOOM» apre WhatsApp in una scheda nuova, staccata dal
//      portale, e il ripiego (numero ed email) NON compare a scheda aperta.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(name) {
  let start = src.indexOf('\n    function ' + name + '(');
  if (start < 0) start = src.indexOf('\n    async function ' + name + '(');
  if (start < 0) throw Error('Missing ' + name);
  start += 1;
  const next = src.slice(start + 5).search(/\n    (?:async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 5 + next);
}
const names = ['goTo', 'buildNav', 'renderPage', 'closeSidebar', 'toggleSidebar', 'accessDenied', 'isAdmin', 'isLandlord', 'isTenant', 'esc', 'jsq', 'fmtDate',
  'daysUntil', 'isOverdue', 'isPaymentLate', 'isPaymentLateLive', 'paymentAfterClose', 'isPaymentOpen', 'getMyProperties', 'getMyContracts', 'getMyPayments', 'getMyMaintenance', 'getMyDocuments',
  'boomBusinessInvoices', 'closeModal', 'roleLabel', 'settingsPage', 'companySettingsCard', 'myDocumentsPage', 'docIcon', 'viewContract', 'viewContractLandlord',
  'contractIsPaper', 'contractIsPlaceholder', 'contractNotSignable', 'contractSigned', 'awaitingDigitalSignature', 'contractSignBlock', 'contractTenantName'];
const functions = names.map(extract).join('\n');
const cfgStart = src.indexOf('    window.BOOM_PALAZZO_UI?.configure({');
const config = src.slice(cfgStart, src.indexOf('    // L\'unica scrittura della vista', cfgStart));

const now = new Date(), Y = now.getFullYear();
const iso = (d) => d.toISOString().slice(0, 10);
const ago = (days) => iso(new Date(now.getTime() - days * 86400000));
const ym = (back) => { const d = new Date(Y, now.getMonth() - back, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const state = {
  profile: { id: 'owner-demo', role: 'landlord', name: 'Chiara Demo', email: 'chiara@example.invalid' },
  users: [{ id: 'owner-demo', role: 'landlord', name: 'Chiara Demo', email: 'chiara@example.invalid' }],
  properties: [
    { id: 'p7', name: 'Piazzale Prova 42 int. 7', address: 'Piazzale Prova 42, Roma', interno: '7', floor: '3', ownerId: 'owner-demo', gestioneDal: ym(4) },
    { id: 'p11', name: 'Piazzale Prova 42 int. 11', address: 'Piazzale Prova 42, Roma', interno: '11', floor: '4', ownerId: 'owner-demo' }
  ],
  contracts: [
    { id: 'c7', propertyId: 'p7', status: 'active', signatureStatus: 'paper', source: 'palazzo-import', tenantName: 'Ada Demo', rent: 1500, startDate: ago(200), endDate: iso(new Date(now.getTime() + 300 * 86400000)) },
    { id: 'c11', propertyId: 'p11', status: 'active', contractMissing: true, source: 'palazzo-import', tenantName: 'Gaia Demo' }
  ],
  payments: [
    { id: 'pay-a', contractId: 'c7', propertyId: 'p7', month: ym(1), dueDate: ago(35), amount: 1500, status: 'overdue' },
    { id: 'pay-b', contractId: 'c7', propertyId: 'p7', month: ym(2), dueDate: ago(65), amount: 1500, status: 'paid', paidDate: ago(64) }
  ],
  maintenance: [],
  documents: [
    { id: 'd1', userId: 'admin', uploadedBy: 'admin', propertyId: 'p7', shared: true, name: 'Contratto firmato int. 7', type: 'contract', fileName: 'contratto.pdf' },
    { id: 'd2', userId: 'admin', uploadedBy: 'admin', propertyId: 'p7', shared: true, voided: true, name: 'Ricevuta annullata', type: 'receipt' }
  ]
};

function page(hash) {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Proprietaria · anteprima</title>
<link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/palazzo.css"><link rel="stylesheet" href="/css/portal-mobile.css"></head><body>
<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span id="headerName">Demo</span></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main class="main" id="main"></main></div><div id="modals"></div><div id="toasts"></div></div>
<script>delete window.Notification;</script>
<script src="/js/contract-state.js"></script><script src="/js/rent-engine.js"></script><script src="/js/palazzo-engine.js"></script><script src="/js/palazzo.js"></script><script>
const S=${JSON.stringify(state)}; Object.assign(S,{page:'',_paLoaded:true,invoices:[],conversations:[],viewingRequests:[],deadlines:[],leads:[],notifications:[]}); window.testState=S;
window.demoActions=[]; window.writes=[];
function toast(...a){demoActions.push(['toast',...a]);}
function openModal(type,data){demoActions.push(['modal',type]);}
function logActivity(){}
function innestoSeedFromHash(){return false;}
window.confirm=()=>true;
const firebase={firestore:{FieldValue:{serverTimestamp:()=>'SERVER_TS'}},auth(){return{currentUser:{getIdToken:async()=>'demo-'+S.profile.id}};}};
const auth={currentUser:{getIdToken:async()=>'demo'},languageCode:null};
const db={batch(){const ops=[];return{update(ref,data){ops.push([ref.path,data]);},set(ref,data){ops.push([ref.path,data]);},async commit(){writes.push(...ops);}};},collection(c){return{doc(id){return{path:c+'/'+id};},where(){return{async get(){return{docs:[]};}};}};}};
${functions}
${config}
goTo(${JSON.stringify(hash)});
</script><script src="/js/portal-mobile.js"></script></body></html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/owner') { res.setHeader('Content-Type', 'text/html'); res.end(page(url.searchParams.get('page') || 'palazzo')); return; }
    if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true,"contacts":{},"links":{}}'); return; }
    const file = resolve(ROOT, '.' + url.pathname);
    if (!file.startsWith(ROOT)) throw Error('bad path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'text/plain');
    res.end(await readFile(file));
  } catch (_) { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const chromium = await loadChromium();
if (!chromium) { server.close(); console.log('SKIP: playwright non disponibile'); process.exit(0); }
let count = 0; const errors = [];
const browser = await chromium.launch(launchOptions({ headless: true }));
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const pg = await context.newPage();
    pg.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
    await pg.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    // La scheda di WhatsApp non esce dal sandbox: risponde il test.
    await context.route('https://wa.me/**', route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'wa' }));
    const check = async (label, fn) => { await fn(); count++; console.log('✓ ' + width + ' ' + label); };

    // Si entra da una pagina RITIRATA (un vecchio segnalibro): si atterra sul Palazzo.
    await pg.goto(base + '/owner?page=my-payments');
    await pg.waitForSelector('.plz');
    await check('un vecchio segnalibro (#my-payments) atterra sul Palazzo', async () => {
      assert.equal(await pg.evaluate(() => S.page), 'palazzo');
      assert.equal(await pg.evaluate(() => location.hash), '#palazzo');
      assert.equal(await pg.evaluate(() => localStorage.getItem('boom_lastPage')), 'palazzo');
    });
    await check('il menu: Il Palazzo (col badge dei ritardi) · Documenti · Commercialista · Impostazioni · Esci', async () => {
      const nav = await pg.locator('#sidebar').innerText();
      assert.ok(/Il Palazzo\s*1/.test(nav) && /Documenti/.test(nav) && /Commercialista/.test(nav) && /Impostazioni/.test(nav) && /Esci/.test(nav), nav);
      assert.ok(!/Dashboard|Pagamenti|Contratti|Messaggi|Immobili|Manutenzione/.test(nav), nav);
    });
    if (width <= 600) {
      await check('la tab bar del telefono: Palazzo · Documenti · Fisco · Menu, mai «Studio»', async () => {
        await pg.waitForSelector('.pm-tabbar .pm-tab');
        const tabs = await pg.$$eval('.pm-tabbar .pm-tab', bs => bs.map(b => [b.dataset.target || 'menu', b.querySelector('.pm-tab-lab').textContent]));
        assert.deepEqual(tabs, [['palazzo', 'Palazzo'], ['my-documents', 'Documenti'], ['commercialista', 'Fisco'], ['menu', 'Menu']]);
      });
      await check('Documenti dalla tab: i condivisi da BOOM in italiano, mai un annullato', async () => {
        await pg.locator('.pm-tab[data-target="my-documents"]').click();
        await pg.waitForFunction(() => S.page === 'my-documents');
        const txt = await pg.locator('#main').innerText();
        assert.ok(txt.includes('Contratto firmato int. 7') && txt.includes('DA BOOM') && !txt.includes('FROM BOOM'), txt);
        assert.ok(!txt.includes('Ricevuta annullata'));
      });
    } else {
      await check('Documenti dal menu: i condivisi da BOOM in italiano, mai un annullato', async () => {
        await pg.evaluate(() => goTo('my-documents'));
        const txt = await pg.locator('#main').innerText();
        assert.ok(txt.includes('Contratto firmato int. 7') && txt.includes('DA BOOM') && !txt.includes('Ricevuta annullata'), txt);
      });
    }
    await check('Impostazioni si apre senza Notification: Cambia password, Scrivi a BOOM; niente Firebase né lingua dei PDF', async () => {
      assert.equal(await pg.evaluate(() => typeof window.Notification), 'undefined');
      await pg.evaluate(() => goTo('settings'));
      const txt = await pg.locator('#main').innerText();
      assert.ok(txt.includes('Cambia password') && txt.includes('Scrivi a BOOM') && txt.includes('Attiva notifiche'), txt.slice(0, 400));
      assert.ok(!/Firebase|Lingua Documenti/.test(txt));
      assert.equal(await pg.locator('#main a[href^="https://wa.me/393313251961"]').count(), 1);
    });
    await check('«Scrivi a BOOM»: WhatsApp in una scheda nuova senza opener, nessun ripiego a scheda aperta', async () => {
      await pg.evaluate(() => { demoActions.length = 0; const b = document.createElement('button'); b.id = 'wbTest'; b.textContent = 'wb';
        b.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647';
        b.onclick = () => palazzoWriteBoom('p7'); document.body.appendChild(b); });
      const popup = context.waitForEvent('page');
      await pg.click('#wbTest');
      const tab = await popup;
      await tab.waitForLoadState('domcontentloaded');
      assert.ok(tab.url().startsWith('https://wa.me/393313251961?text='), tab.url());
      assert.equal(await tab.evaluate(() => window.opener), null, 'la scheda non tiene il portale');
      assert.deepEqual(await pg.evaluate(() => demoActions.filter(a => a[0] === 'toast')), [], 'nessun ripiego');
      await tab.close();
      await pg.evaluate(() => document.getElementById('wbTest').remove());
    });
    await check('ogni rotta ritirata scritta a mano torna al Palazzo', async () => {
      for (const p of ['dashboard', 'my-contracts', 'my-properties', 'my-maintenance', 'inbox', 'contracts']) {
        await pg.evaluate((x) => { S.page = x; renderPage(); }, p);
        assert.equal(await pg.evaluate(() => S.page), 'palazzo', p);
      }
      await pg.waitForSelector('.plz');
    });
    await check('«Contratto» della proprietaria: l\'interno selezionato nel Palazzo, nessun modale dell\'operatore', async () => {
      await pg.evaluate(() => viewContract('c7'));
      assert.equal(await pg.locator('#modals .modal').count(), 0);
      assert.equal(await pg.evaluate(() => window.BOOM_PALAZZO_UI.ui.selected), 'p7');
      assert.equal(await pg.evaluate(() => S.page), 'palazzo');
      assert.deepEqual(await pg.evaluate(() => writes), []);
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`\n${count} check nel browser — il portale della proprietaria con le funzioni vere, dati sintetici, nessuna scrittura reale.`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
