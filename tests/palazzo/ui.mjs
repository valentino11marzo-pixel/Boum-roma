// IL PALAZZO nel browser vero. Le funzioni del portal sono quelle VERE
// (estratte da js/portal-app.js: goTo, buildNav, renderPage, rotta,
// adattatore, il collegamento al profilo), i layer mobile/desktop sono
// quelli veri; Firestore è finto e registra le scritture. Dati sintetici.
//   SCREENSHOT_DIR=…  salva le schermate (1440, 390)
//   PREVIEW_PORT=8123 PREVIEW_ONLY=1  anteprima locale da aprire a mano
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { buildFixture } from './fixture.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start < 0) start = src.indexOf('    async function ' + name + '(');
  if (start < 0) throw Error('Missing ' + name);
  const next = src.slice(start + 5).search(/\n    (?:async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 5 + next);
}
const names = ['goTo', 'buildNav', 'renderPage', 'closeSidebar', 'toggleSidebar', 'accessDenied', 'isAdmin', 'isLandlord', 'isTenant', 'esc', 'daysUntil', 'isOverdue', 'isPaymentLate', 'isPaymentOpen',
  'getMyProperties', 'getMyContracts', 'getMyPayments', 'getMyMaintenance', 'boomBusinessInvoices', 'closeModal', 'palazzoLinkOwner'];
const functions = names.map(extract).join('\n');
const cfgStart = src.indexOf('    window.BOOM_PALAZZO_UI?.configure({');
const config = src.slice(cfgStart, src.indexOf('    // L\'unica scrittura della vista', cfgStart));

function page(state, hash) {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Il Palazzo · anteprima BOOM</title>
<link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/palazzo.css"><link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"></head><body>
<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span style="color:var(--text-secondary);font-size:11px">ANTEPRIMA LOCALE · DATI DEMO</span><span id="headerName">Demo</span></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main class="main" id="main"></main></div><div id="modals"></div><div id="toasts"></div></div>
<script src="/js/rent-engine.js"></script><script src="/js/palazzo-engine.js"></script><script src="/js/palazzo.js"></script><script>
const S=${JSON.stringify(state)}; Object.assign(S,{page:'',invoices:[],maintenance:[],conversations:[],viewingRequests:[],actionQueue:[],deadlines:[],leads:[],notifications:[],documents:[]}); window.testState=S;
window.demoActions=[]; window.writes=[];
function toast(...a){demoActions.push(['toast',...a]);}
function openRentUnit(id,month){demoActions.push(['rent',id,month]);}
function viewContract(id){demoActions.push(['contract',id]);}
function openModal(type,data){demoActions.push([type,data&&data.id]);}
function logActivity(){}
function innestoSeedFromHash(){return false;}
window.confirm=()=>true;
const firebase={firestore:{FieldValue:{serverTimestamp:()=>'SERVER_TS'}}};
const db={batch(){const ops=[];return{update(ref,data){ops.push([ref.path,data]);},async commit(){writes.push(...ops);}};},collection(c){return{doc(id){return{path:c+'/'+id};}};}};
${functions}
${config}
goTo(${JSON.stringify(hash)});
</script><script src="/js/portal-mobile.js"></script><script src="/js/portal-desktop.js"></script></body></html>`;
}

const F = buildFixture(new Date());
const admin = F.state;
const landlord = { ...F.state, profile: { id: 'owner-demo', role: 'landlord', name: 'Proprietaria Demo' },
  // dal suo accesso il loader porta solo i suoi immobili (rules + query ownerId)
  properties: F.state.properties.filter(p => p.ownerId === 'owner-demo'), users: [F.state.users[0]] };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    if (path === '/admin' || path === '/owner') {
      res.setHeader('Content-Type', 'text/html');
      res.end(page(path === '/admin' ? admin : landlord, url.searchParams.get('page') || 'palazzo'));
      return;
    }
    const file = resolve(ROOT, '.' + path);
    if (!file.startsWith(ROOT)) throw Error('bad path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'text/plain');
    res.end(await readFile(file));
  } catch (_) { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(Number(process.env.PREVIEW_PORT || 0), '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
if (process.env.PREVIEW_ONLY) { console.log('Anteprima ' + base + '/admin  ·  ' + base + '/owner'); await new Promise(() => {}); }

const chromium = await loadChromium();
if (!chromium) { server.close(); console.log('SKIP: playwright non disponibile'); process.exit(0); }
let count = 0; const errors = [];
const browser = await chromium.launch(launchOptions({ headless: true }));
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    const pg = await context.newPage();
    pg.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
    await pg.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const check = async (label, fn) => { await fn(); count++; console.log('✓ ' + width + ' ' + label); };

    await pg.goto(base + '/admin');
    await pg.waitForSelector('.plz-unit');
    await check('admin: il palazzo più grande, un cubo per ogni interno con piano', async () => {
      assert.equal(await pg.locator('#plz-h1').innerText(), 'Viale Esempio 12');
      assert.equal(await pg.locator('.plz-unit').count(), 12); // il 12 è nel cortile
      assert.equal(await pg.locator('.plz-tray .plz-chip').count(), 1);
      assert.equal(await pg.locator('.plz-level').count(), 5);
    });
    await check('lo stato del mese sul colore di ogni cubo', async () => {
      const st = await pg.$$eval('.plz-unit', els => Object.fromEntries(els.map(e => [e.dataset.id, e.dataset.state])));
      assert.deepEqual([st.u1, st.u3, st.u5, st.u6, st.u8, st.u9, st.u13], ['paid', 'late', 'due', 'review', 'norate', 'incoming', 'vacant']);
      const late = await pg.locator('.plz-unit[data-id="u3"] .plz-f-front').evaluate(e => getComputedStyle(e).backgroundImage);
      assert.ok(late.includes('rgb(255, 90, 95)'), late);
    });
    await check('i numeri del mese: pieni, pagati, non pagati, arretrati', async () => {
      const k = await pg.locator('#plz-kpis').innerText();
      assert.ok(/Pieni\s*10\s*\/13\s*2 liberi · 1 in arrivo/i.test(k), k);
      assert.ok(/Hanno pagato[^\n]*\n\s*5\s*\/9\s*€5\.000 di €8\.950/i.test(k), k);
      assert.ok(/Non hanno pagato\s*2\s*€1\.800 in ritardo/i.test(k), k);
      assert.ok(k.includes('€4.200'), k);
    });
    await check('il mese in parole: chi non ha pagato, per primo il ritardo più lungo', async () => {
      const blocks = await pg.locator('.plz-block h3').allInnerTexts();
      assert.ok(/^non hanno pagato/i.test(blocks[0]), blocks[0]);
      const first = await pg.locator('.plz-block').first().locator('.plz-line').allInnerTexts();
      assert.equal(first.length, 2);
      assert.ok(first[0].includes('Int. 12') && first[1].includes('Int. 3'), first.join(' | '));
    });
    await check('da sistemare (solo admin): cortile, accesso, contratti, rate', async () => {
      const txt = await pg.locator('.plz-issues').innerText();
      for (const s of ['senza piano', 'non collegato', 'attivo ma è scaduto', 'senza rata']) assert.ok(txt.includes(s), s + ' · ' + txt);
    });
    await check('tocco un interno: il pannello dice tutto e il cubo si alza', async () => {
      await pg.locator('.plz-unit[data-id="u3"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u3"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
      assert.equal(await pg.locator('#plz-unit-h').innerText(), 'Int. 3');
      const p = await pg.locator('#plz-panel').innerText();
      assert.ok(p.includes('Inquilino 3 Demo') && p.includes('€3.000') && /3 rate/.test(p), p);
      assert.equal(await pg.locator('.plz-unit.is-sel').count(), 1);
    });
    await check('azioni admin → i flussi esistenti del portal', async () => {
      await pg.locator('[data-plz="rent"][data-id="u3"]').click();
      await pg.locator('#plz-panel [data-plz="contract"]').click();
      await pg.locator('#plz-panel [data-plz="edit"]').click();
      const acts = await pg.evaluate(() => demoActions.filter(a => a[0] !== 'toast'));
      assert.deepEqual(acts.slice(-3), [['rent', 'property:u3', acts.at(-3)[2]], ['contract', 'c3'], ['editProperty', 'u3']]);
    });
    await check('il filtro "In ritardo" spegne gli altri cubi senza toglierli', async () => {
      await pg.locator('[data-plz="filter"][data-f="late"]').click();
      assert.equal(await pg.locator('.plz-unit:not(.is-dim)').count(), 1);
      assert.equal(await pg.locator('.plz-unit').count(), 12);
      await pg.locator('[data-plz="filter"][data-f="all"]').click();
    });
    await check('il mese scorso: stessi cubi, nuovi colori (int. 6 pagato)', async () => {
      await pg.locator('[data-plz="prev"]').click();
      assert.equal(await pg.locator('.plz-unit[data-id="u6"]').getAttribute('data-state'), 'paid');
      assert.equal(await pg.locator('.plz-unit[data-id="u3"]').getAttribute('data-state'), 'late');
      assert.equal(await pg.locator('.plz-unit').count(), 12);
      await pg.locator('[data-plz="today"]').click();
      assert.equal(await pg.locator('.plz-unit[data-id="u6"]').getAttribute('data-state'), 'review');
    });
    await check('trascinare ruota il palazzo, i tasti pure', async () => {
      const before = await pg.locator('#plz-world').evaluate(e => e.style.getPropertyValue('--ry'));
      await pg.locator('#plz-stage').scrollIntoViewIfNeeded();
      const box = await pg.locator('#plz-stage').boundingBox();
      await pg.mouse.move(box.x + 40, box.y + 40); await pg.mouse.down(); await pg.mouse.move(box.x + 200, box.y + 50, { steps: 6 }); await pg.mouse.up();
      const after = await pg.locator('#plz-world').evaluate(e => e.style.getPropertyValue('--ry'));
      assert.notEqual(before, after);
      await pg.locator('[data-plz="reset"]').click();
      assert.equal(await pg.locator('#plz-world').evaluate(e => e.style.getPropertyValue('--ry')), '34deg');
    });
    await check('elenco: una riga per interno, i piani dall\'alto, 12 mesi a riga', async () => {
      await pg.locator('[data-plz="view"][data-v="list"]').click();
      await pg.waitForSelector('.plz-roll');
      assert.equal(await pg.locator('.plz-rrow:not(.plz-rhead)').count(), 13);
      assert.ok(/^attico$/i.test(await pg.locator('.plz-rfloor-l').first().innerText()));
      assert.equal(await pg.locator('.plz-rrow:not(.plz-rhead)').first().locator('.plz-dot').count(), 12);
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('.plz-unit');
    });
    await check('collega l\'interno non collegato: una scrittura, sola, sul suo immobile', async () => {
      await pg.locator('.plz-issues [data-plz="link"]').click();
      await pg.waitForFunction(() => writes.length > 0);
      const w = await pg.evaluate(() => writes);
      assert.deepEqual(w.map(x => x[0]), ['properties/u13']);
      assert.equal(w[0][1].ownerId, 'owner-demo');
      assert.ok(!(await pg.locator('.plz-issues').innerText()).includes('non collegato'));
    });
    await check('nessuno scorrimento orizzontale', async () => {
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    if (process.env.SCREENSHOT_DIR) {
      await pg.locator('[data-plz="deselect"]').click().catch(() => {});
      await pg.waitForTimeout(1800);
      await pg.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'palazzo-admin-' + width + '.png'), fullPage: true });
    }

    // ── La proprietaria ───────────────────────────────────────────────
    await pg.goto(base + '/owner?page=');
    await pg.waitForSelector('.plz-unit');
    await check('proprietaria: atterra sul SUO palazzo, solo i suoi interni', async () => {
      assert.ok(pg.url().endsWith('#palazzo'));
      assert.equal(await pg.locator('#plz-h1').innerText(), 'Viale Esempio 12');
      assert.equal(await pg.locator('.plz-unit').count() + await pg.locator('.plz-tray .plz-chip').count(), 12);
      assert.ok((await pg.locator('.plz-sub').innerText()).includes('gestiti da BOOM'));
    });
    await check('proprietaria: niente "da sistemare", niente azioni dell\'operatore', async () => {
      assert.equal(await pg.locator('.plz-issues').count(), 0);
      await pg.locator('.plz-unit[data-id="u3"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u3"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
      assert.equal(await pg.locator('#plz-panel [data-plz="rent"], #plz-panel [data-plz="edit"], #plz-panel [data-plz="dossier"]').count(), 0);
      assert.equal(await pg.locator('#plz-panel [data-plz="inbox"]').count(), 1);
    });
    await check('proprietaria: la voce nel menu e il badge dei ritardi', async () => {
      const nav = await pg.locator('#sidebar').innerText();
      assert.ok(nav.includes('Il Palazzo'));
      assert.ok(/Pagamenti\s*\d/.test(nav), nav); // il badge contava 0: le rate rinominate "overdue" sparivano
    });
    if (process.env.SCREENSHOT_DIR) {
      await pg.locator('[data-plz="deselect"]').click().catch(() => {});
      await pg.waitForTimeout(1800);
      await pg.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'palazzo-owner-' + width + '.png'), fullPage: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`\n${count} check nel browser — funzioni vere del portal, dati sintetici, nessuna scrittura reale.`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
