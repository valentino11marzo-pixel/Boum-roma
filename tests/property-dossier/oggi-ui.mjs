// Real Oggi cards, router and property dossier; synthetic data and IO boundaries only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { html as propertyHtml, extract } from './harness.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const oggi = source.slice(source.indexOf('    function oggiDismissKey()'), source.indexOf('    function adminDashboard()'));
const inboxListeners = ['startInboxListener', 'stopInboxListener', 'stopOpenConvListener'].map(extract).join('\n');
const toast = source.slice(source.indexOf('    function toast('), source.indexOf("    console.log('🚀 BOOM Portal"));
assert(oggi.includes('oggiSegretariaRestorePropertyContext'), 'Exercise the actual integrated Oggi code');
const caseId = n => 'sg_' + n.toString(16).padStart(32, '0');
const TARGET = caseId(7), OTHER = caseId(2);
const rows = Array.from({ length: 10 }, (_, i) => ({
  id: caseId(i + 1), status: 'open', followUp: {
    open: true, confirmed: true, needsReview: false, ambiguous: false,
    practiceRef: 'contracts/contratto-demo', propertyRef: 'properties/casa-demo',
    contactName: 'Persona demo ' + (i + 1), conversationId: 'conversazione-demo-' + i,
    lastMessageId: 'mail_demo_' + i, preview: 'Richiesta dimostrativa relativa alla casa già collegata.',
    nextAction: 'Concordare l’accesso con la persona di riferimento',
    waitingOn: 'valentino', waitingLabel: 'Valentino', checkAt: '2026-01-01T09:00:00Z'
  }
}));
const boundary = `
Object.assign(S, {_paLoaded:true, preAgreements:[], messages:[], pfsClients:[], viewingRequests:[]});
const auth={currentUser:{uid:S.profile.id,getIdToken:async()=>{testIO.tokens++;return 'synthetic-token';}}};
window.testIO={requests:[],subscriptions:0,unsubscriptions:0,dbReads:0,writes:0,coreRefreshes:0,tokens:0};
window.apiRows=${JSON.stringify(rows)}; window.holdAPI=false; window.heldAPI=[];
window.fetch=async(url,options={})=>{
  testIO.requests.push({url:String(url),method:options.method||'GET'});
  if(options.method && options.method!=='GET'){testIO.writes++;throw Error('Unexpected write: '+url);}
  if(String(url)!=='/api/segretaria/follow-up')throw Error('Unexpected API/AI read: '+url);
  if(holdAPI)await new Promise(resolve=>heldAPI.push(resolve));
  else await new Promise(resolve=>setTimeout(resolve,80));
  return {ok:true,json:async()=>({ok:true,rows:structuredClone(apiRows),monitoring:{mode:'continuous',status:'idle'}})};
};
window.releaseAPI=()=>{holdAPI=false;heldAPI.splice(0).forEach(resolve=>resolve());};
const db={collection(name){
  if(name==='conversations')return {orderBy(){return this;},limit(){return this;},onSnapshot(options,next){next({docs:[],metadata:{fromCache:false}});return()=>{};}};
  if(name!=='operatorTasks')throw Error('Unexpected collection: '+name);
  return {where(field,op,value){
    if(field!=='followUp.open'||op!=='=='||value!==true)throw Error('Unexpected task query');
    return this;
  },onSnapshot(next){testIO.subscriptions++;next({docs:[]});return()=>testIO.unsubscriptions++;},
  get(){testIO.dbReads++;throw Error('Unexpected bulk read');},
  doc(){testIO.writes++;throw Error('Unexpected Firestore access');}};
}};
`;
const engines = ['oggi-engine', 'segretaria-casi-engine', 'segretaria-proposta-engine', 'segretaria-esecuzione-engine']
  .map(name => '<script src="/js/' + name + '.js"></script>').join('');
const boot = "goTo(location.hash.slice(1)||'properties');";
assert(propertyHtml.includes(boot));
const html = propertyHtml
  .replace('</head>', '<link rel="stylesheet" href="/css/segretaria.css"></head>')
  .replace('<script src="/js/rent-engine.js">', engines + '<script src="/js/rent-engine.js">')
  .replace("async function loadDataFresh(){BOOM_PROPERTY_DOSSIER", "async function loadDataFresh(){testIO.coreRefreshes++;BOOM_PROPERTY_DOSSIER")
  .replace(boot, boundary + oggi + inboxListeners + toast + '\nwindow.testCases=oggiSegretaria;\n' + "startInboxListener();goTo(location.hash.slice(1)||'oggi');");

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/' || pathname === '/portal') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (pathname === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
    const path = resolve(ROOT, '.' + pathname);
    if (!path.startsWith(ROOT)) throw Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'text/plain');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const chromium = await loadChromium();
if (!chromium) { server.close(); throw Error('Browser verification needs Playwright (BOOM_PLAYWRIGHT)'); }
let browser, checks = 0;
const errors = [], consoleErrors = [];
try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  for (const width of (process.env.TEST_WIDTHS || '1440,390,320').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 940 } });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const row = id => page.locator('article[data-sg-id="' + id + '"]');
    const propertyButton = id => row(id).locator('[data-sg-action="property"]');
    const idle = () => page.waitForFunction(() => testCases.loaded && !testCases.loading);
    let visit = 0;
    const fresh = async () => {
      await page.goto(base + '/portal?case=' + (++visit) + '#oggi'); await idle();
      await page.waitForSelector('article[data-sg-id="' + TARGET + '"]');
      // Existing mobile transformations are debounced by 70ms.
      await page.waitForTimeout(180);
    };
    const details = async id => {
      const detail = row(id).locator('details');
      if (!(await detail.getAttribute('open'))) {
        if (!(await detail.evaluate(el => el.open))) await detail.locator('summary').click();
      }
    };
    const readyToOpen = async () => {
      await details(OTHER); await details(TARGET);
      const button = propertyButton(TARGET);
      await button.scrollIntoViewIfNeeded(); await button.focus();
      await page.waitForTimeout(100);
      return page.evaluate(() => scrollY);
    };
    const snapshotIO = () => page.evaluate(() => ({ requests: testIO.requests.length, subscriptions: testIO.subscriptions, dbReads: testIO.dbReads, writes: testIO.writes, coreRefreshes: testIO.coreRefreshes }));
    const assertReturned = async previousY => {
      await idle();
      await page.waitForFunction(({ id, y }) => document.activeElement.dataset.sgAction === 'property'
        && document.activeElement.dataset.sgId === id && Math.abs(scrollY - y) < 4,
      { id: TARGET, y: previousY });
      assert.equal(await row(TARGET).locator('details').evaluate(el => el.open), true);
      assert.equal(await row(OTHER).locator('details').evaluate(el => el.open), true);
      assert.equal(await page.evaluate(() => testCases.propertyReturn), null);
      assert(page.url().endsWith('#oggi'));
    };
    const check = async (label, run) => { await run(); checks++; console.log('✓ ' + width + ' ' + label); };

    await fresh();
    await check('secondary action opens exact property without new reads, AI or writes', async () => {
      const previousY = await readyToOpen(); assert(previousY > 300);
      const button = propertyButton(TARGET);
      assert.equal(await button.innerText(), 'Apri immobile');
      assert(await button.evaluate(el => el.closest('.sg-secondary-actions') !== null));
      const before = await snapshotIO();
      await button.click(); await page.waitForSelector('#pdos-title');
      assert.equal(await page.locator('#pdos-title').innerText(), 'Casa Aurora');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'pdos-title');
      assert(page.url().endsWith('#property/casa-demo/overview'));
      for (const tab of ['contracts', 'rent', 'documents', 'activity']) {
        await page.locator('[data-pdos-tab="' + tab + '"]').click();
        assert(page.url().endsWith('/' + tab));
      }
      assert.deepEqual(await snapshotIO(), before);
      await page.evaluate(() => { holdAPI = true; });
      await page.locator('[data-pdos-action="back"]').click();
      await page.waitForFunction(() => heldAPI.length === 1 && testCases.loading);
      assert(await page.evaluate(() => !!testCases.propertyReturn), 'Return must wait for the existing refresh');
      await page.evaluate(() => releaseAPI());
      await assertReturned(previousY);
      assert.equal((await snapshotIO()).requests, before.requests + 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });

    await check('already pending refresh resolves return without a second request', async () => {
      await fresh();
      await page.evaluate(() => { holdAPI = true; });
      await page.locator('[data-sg-action="refresh"]').click();
      await page.waitForFunction(() => heldAPI.length === 1);
      const previousY = await readyToOpen(), before = await snapshotIO();
      await propertyButton(TARGET).click(); await page.waitForSelector('#pdos-title');
      await page.locator('[data-pdos-action="back"]').click();
      await page.waitForFunction(n => !!testCases.propertyReturn && testCases.loading && testIO.subscriptions > n, before.subscriptions);
      await page.evaluate(() => releaseAPI());
      await assertReturned(previousY);
      assert.equal((await snapshotIO()).requests, before.requests, 'Reuse the request already in flight');
    });

    for (const change of ['association', 'missing-property', 'closed', 'missing-task', 'dossier-conflict', 'role']) {
      await check('stale rendered action is blocked after ' + change, async () => {
        await fresh(); await readyToOpen();
        const before = await snapshotIO();
        await page.evaluate(({ id, change }) => {
          const task = testCases.rows.find(t => t.id === id);
          if (change === 'association') task.followUp.propertyRef = 'properties/casa-vuota';
          if (change === 'missing-property') testState.properties = testState.properties.filter(p => p.id !== 'casa-demo');
          if (change === 'closed') task.status = 'closed';
          if (change === 'missing-task') testCases.rows = testCases.rows.filter(t => t.id !== id);
          if (change === 'dossier-conflict') testCases.dossiers[id] = { practices: [{ ref: task.followUp.practiceRef, propertyRefs: ['properties/casa-vuota'] }] };
          if (change === 'role') testState.profile.role = 'tenant';
        }, { id: TARGET, change });
        await propertyButton(TARGET).click();
        assert.equal(await page.locator('#pdos-title').count(), 0);
        assert(page.url().endsWith('#oggi'));
        assert.deepEqual(await snapshotIO(), before);
        if (!['role', 'missing-task'].includes(change)) assert.equal(await page.locator('.toast.warning').count(), 1);
      });
    }

    await check('closed case is not resurrected; return focuses Segreteria heading', async () => {
      await fresh(); await readyToOpen();
      await propertyButton(TARGET).click(); await page.waitForSelector('#pdos-title');
      await page.evaluate(id => { apiRows.find(t => t.id === id).status = 'closed'; holdAPI = true; }, TARGET);
      await page.locator('[data-pdos-action="back"]').click();
      await page.waitForFunction(() => heldAPI.length === 1);
      await page.evaluate(() => releaseAPI()); await idle();
      await page.waitForFunction(() => document.activeElement.matches('#sgFollowPanel h2'));
      assert.equal(await row(TARGET).count(), 0);
      assert.equal(await row(OTHER).locator('details').evaluate(el => el.open), true);
      assert.equal(await page.evaluate(id => testCases.rows.find(t => t.id === id)?.status, TARGET), 'closed');
      assert.equal(await page.evaluate(() => testCases.propertyReturn), null);
      assert((await page.locator('#sgFollowPanel h2').boundingBox()).y >= 0);
    });

    await check('remaining case without eligible property restores its summary focus', async () => {
      await fresh(); await readyToOpen();
      await propertyButton(TARGET).click(); await page.waitForSelector('#pdos-title');
      await page.evaluate(id => { apiRows.find(t => t.id === id).followUp.propertyRef = 'listings/casa-demo'; }, TARGET);
      await page.locator('[data-pdos-action="back"]').click(); await idle();
      await page.waitForFunction(id => document.activeElement.matches('summary') && document.activeElement.closest('article')?.dataset.sgId === id, TARGET);
      assert.equal(await propertyButton(TARGET).count(), 0);
      assert.equal(await row(TARGET).locator('details').evaluate(el => el.open), true);
    });

    await check('actions wrap within the card without horizontal overflow or overlap', async () => {
      await fresh(); await details(OTHER); await row(OTHER).scrollIntoViewIfNeeded();
      const geometry = await row(OTHER).locator('.sg-secondary-actions').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { parent: { left: rect.left, right: rect.right }, children: [...el.children].map(child => {
          const r = child.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.equal(geometry.overflow, false);
      for (const r of geometry.children) assert(r.left >= geometry.parent.left - 1 && r.right <= geometry.parent.right + 1);
      for (let i = 1; i < geometry.children.length; i++) {
        const a = geometry.children[i - 1], b = geometry.children[i];
        assert(a.right <= b.left + 1 || a.bottom <= b.top + 1, 'Secondary buttons must not overlap');
      }
      if (process.env.SCREENSHOT_DIR && [1440, 390].includes(width)) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, width === 1440 ? 'oggi-desktop.png' : 'oggi-mobile.png') });
      }
    });
    assert.equal(await page.evaluate(() => testIO.writes + testIO.dbReads + testIO.coreRefreshes), 0);
    await context.close();
  }
  assert.deepEqual(errors, [], 'No actual browser exceptions');
  assert.deepEqual(consoleErrors, [], 'No failed resources or browser console errors');
  console.log(`${checks} Oggi → property browser checks passed; real handlers/engines/CSS, synthetic fixtures, zero writes/AI.`);
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
