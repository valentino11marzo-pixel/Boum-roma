// Real mailbox reader → real Inbox → real follow-up modal and HTTP handlers.
// IMAP, auth and Firestore are one shared synthetic transport fixture; no network.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reset, call } from './fixture.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';
const { default: followUpHandler } = await import('../../api/segretaria/follow-up.js');
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const source = read('js/portal-app.js');
function named(name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start < 0) start = source.indexOf('    async function ' + name + '(');
  assert(start >= 0, name);
  const next = source.slice(start + 5).search(/\n    (?:async )?function /);
  return source.slice(start, start + 5 + next);
}
const oggi = source.slice(source.indexOf('    function oggiDismissKey()'), source.indexOf('    function adminDashboard()'));
const inbox = source.slice(source.indexOf('    var _inboxState ='), source.indexOf('    var _psState ='));
const mailboxAdapter = source.slice(source.indexOf('    let portalMailboxInitialized ='), source.indexOf('    // Close search on click outside'));
const css = ['portal', 'portal-finish', 'segretaria', 'oggi-workspace', 'portal-mailbox', 'portal-mobile', 'portal-desktop']
  .map(file => read('css/' + file + '.css')).join('\n');
const html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css
  + '</style></head><body><main id="main" style="margin:0;padding:16px"></main><div id="modals"></div><div id="toasts"></div></body></html>';
const artifacts = mkdtempSync(join(tmpdir(), 'boom-mailbox-journey-'));
const chromium = await loadChromium(); assert(chromium, 'Playwright required');
const browser = await chromium.launch(launchOptions({ headless: true }));
const CONTACT = 'client@example.invalid';
let checks = 0;
async function follow(req) {
  let code = 200, data;
  await followUpHandler(req, { setHeader() {}, status(n) { code = n; return this; }, json(d) { data = d; return this; } });
  return { code, ...data };
}
async function mount(page, navigate = true) {
  if (navigate) await page.goto('https://mail-journey.example.invalid/');
  await page.addScriptTag({ content: `
    const S={page:'dashboard',profile:{id:'admin',role:'admin'},users:[],clients:[],leads:[],pfsClients:[],landlords:[],properties:[],contracts:[],conversations:[],messages:[]};
    const auth={currentUser:{uid:'admin',getIdToken:async()=> 'valid'}};
    var portalSessionGeneration=0; const buildNav=()=>{},logActivity=()=>{},cacheData=()=>{};
    window.toasts=[]; function toast(...args){toasts.push(args);document.getElementById('toasts').textContent=args.join(' ')}
    function goTo(page){S.page=page;document.getElementById('main').innerHTML=inboxPage()}
    const db={collection(collection){const q={filters:[],sort:null,max:Infinity};return{
      where(field,op,value){q.filters.push({field,op,value});return this},orderBy(field,direction){q.sort={field,direction};return this},limit(max){q.max=max;return this},
      onSnapshot(next,error){let active=true;__journeyRead({collection,...q}).then(rows=>{if(active)next({docs:rows.map(row=>({id:row.id,data:()=>row}))})},error);return()=>{active=false}},
      doc(id){return{async get(options){const row=await __journeyRead({collection,id,options});return{exists:!!row,id,data:()=>row}},update(){throw Error('Unexpected browser write')},set(){throw Error('Unexpected browser write')}}}
    }}};
  ` });
  for (const file of ['conversations', 'inbox-context-engine', 'oggi-workspace-engine', 'segretaria-casi-engine', 'segretaria-proposta-engine', 'segretaria-esecuzione-engine', 'portal-mailbox'])
    await page.addScriptTag({ content: read('js/' + file + '.js') });
  await page.addScriptTag({ content: oggi + '\n' + inbox + '\n' + mailboxAdapter + '\n'
    + ['isAdmin', 'isLandlord', 'isTenant', 'portalSearchAuthorized', 'portalSessionProof', 'portalSessionCurrent', 'esc', 'jsq', 'closeModal', 'startOpenConvListener', 'stopOpenConvListener'].map(named).join('\n') });
  await page.addScriptTag({ content: read('js/portal-mobile.js') });
}
try {
  for (const width of [390, 1280]) for (const loseAck of [false, true]) {
    const io = reset(), row = io.rows[23];
    row.envelope = { from: [{ address: 'portal@example.invalid' }], replyTo: [{ address: CONTACT }], date: new Date(Date.now() - 60000) };
    const original = 'Contesto sintetico. '.repeat(120) + 'Verificare i documenti entro domani alle 10:00.\nOn Monday someone wrote:\nVecchio testo.';
    row.parts.TEXT = original; row.structure = { type: 'text/plain', encoding: '8bit', parameters: { charset: 'utf-8' }, size: Buffer.byteLength(original) };
    const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'Europe/Rome' });
    page.setDefaultTimeout(7000);
    const errors = [], requests = [], forbidden = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__journeyRead', async q => {
      if (q.id) { assert.deepEqual(q.options, { source: 'server' }); return io.db.has(q.collection + '/' + q.id) ? { id: q.id, ...io.db.get(q.collection + '/' + q.id) } : null; }
      let rows = [...io.db].filter(([path]) => path.startsWith(q.collection + '/')).map(([path, data]) => ({ id: path.split('/')[1], ...data }));
      for (const f of q.filters) { assert.equal(f.op, '=='); rows = rows.filter(r => r[f.field] === f.value); }
      if (q.sort) rows.sort((a, b) => String(a[q.sort.field] || '').localeCompare(String(b[q.sort.field] || '')) * (q.sort.direction === 'desc' ? -1 : 1));
      return rows.slice(0, q.max || undefined);
    });
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== 'https://mail-journey.example.invalid') { forbidden.push(req.url()); return route.abort(); }
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      const body = req.postData() ? JSON.parse(req.postData()) : undefined;
      requests.push({ path: url.pathname, body, method: req.method() });
      let result;
      if (url.pathname === '/api/mailbox/query') result = await call(body, { token: 'valid', method: req.method() });
      else if (url.pathname === '/api/segretaria/follow-up') result = await follow({ method: req.method(), body,
        query: Object.fromEntries(url.searchParams), headers: { authorization: 'Bearer valid' } });
      else { forbidden.push(req.url()); return route.abort(); }
      return route.fulfill({ status: result.code, contentType: 'application/json', body: JSON.stringify(result) });
    });
    try {
      await mount(page);
      await page.evaluate(() => portalOpenMailbox('needle'));
      await page.locator('.mb-result').first().click();
      await page.waitForSelector('#mailboxAdmissionConfirmed');
      assert.equal(await page.locator('[data-mb="admit"]').isEnabled(), false);
      assert.match(await page.locator('.mb-import').innerText(), /client@example.invalid/);
      await page.locator('#mailboxContactName').fill('Contatto verificato');
      await page.locator('#mailboxAdmissionConfirmed').check();
      if (loseAck) io.loseAck = true;
      await page.locator('[data-mb="admit"]').click();
      if (loseAck) {
        await page.waitForSelector('.mb-error');
        assert.match(await page.locator('.mb-error').innerText(), /Esito del collegamento non verificato/);
        assert.equal([...io.db.keys()].filter(p => p.startsWith('messages/')).length, 1);
        assert.equal(await page.locator('#mailboxContactName').inputValue(), 'Contatto verificato');
        assert(await page.locator('#mailboxAdmissionConfirmed').isChecked());
        await page.locator('[data-mb="admit"]').click();
      }
      await page.waitForSelector('[data-mb="inbox"]');
      const messageRows = [...io.db].filter(([p]) => p.startsWith('messages/'));
      const conversations = [...io.db].filter(([p]) => p.startsWith('conversations/'));
      assert.equal(messageRows.length, 1); assert.equal(conversations.length, 1);
      assert.equal(messageRows[0][1].mailboxSource.text, original);
      const cid = conversations[0][0].split('/')[1];
      assert.equal(await page.evaluate(() => S.conversations.length), 0);
      await page.locator('[data-mb="inbox"]').click();
      await page.waitForSelector('.inbox-thread-info');
      if (!await page.locator('.inbox-thread-info').evaluate(el => el.open)) await page.locator('.inbox-thread-info > summary').click();
      await page.getByRole('button', { name: 'Prendi in carico', exact: true }).click();
      await page.waitForSelector('#sgAction');
      assert.equal(await page.locator('#sgPractice').inputValue(), '');
      await page.locator('#sgAction').fill('Verificare i documenti ricevuti');
      await page.locator('#sgWaitingOn').selectOption('valentino');
      await page.locator('#sgWaitingLabel').fill('Valentino');
      await page.locator('#sgCheckAt').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
      await page.locator('[data-sg-submit]').click();
      await page.waitForSelector('#sgFollowModal', { state: 'detached' });
      await page.waitForFunction(() => document.querySelector('[aria-label="Seguito operativo"]')?.textContent.includes('Verificare i documenti ricevuti'));
      const taskRows = [...io.db].filter(([p]) => p.startsWith('operatorTasks/'));
      assert.equal(taskRows.length, 1);
      const task = taskRows[0][1];
      assert.equal(task.followUp.nextAction, 'Verificare i documenti ricevuti');
      assert.equal(task.followUp.waitingLabel, 'Valentino');
      assert.equal(task.followUp.propertyRef, null); assert.equal(task.followUp.practiceRef, null);
      assert.equal(task.followUp.confirmedBy, 'admin');
      await page.screenshot({ path: join(artifacts, 'saved-' + width + (loseAck ? '-retry' : '') + '.png') });
      await page.reload(); await mount(page, false);
      await page.evaluate(cid => portalMailboxOpenConversation(cid), cid);
      await page.waitForSelector('.inbox-thread-info');
      if (!await page.locator('.inbox-thread-info').evaluate(el => el.open)) await page.locator('.inbox-thread-info > summary').click();
      // Inbox loads its follow-ups on the explicit intake control. The same
      // source must reopen the stored case, never create a second one.
      await page.getByRole('button', { name: 'Prendi in carico', exact: true }).click();
      await page.waitForSelector('#sgAction');
      assert.equal(await page.locator('#sgAction').inputValue(), 'Verificare i documenti ricevuti');
      assert.equal(await page.locator('#sgWaitingLabel').inputValue(), 'Valentino');
      assert.equal(await page.locator('#sgPractice').inputValue(), '');
      assert.equal([...io.db.keys()].filter(p => p.startsWith('operatorTasks/')).length, 1);
      assert.equal([...io.db.keys()].filter(p => /^(leads|action_queue|users|pfsClients)\//.test(p)).length, 0);
      assert.deepEqual(forbidden, []); assert.deepEqual(io.forbidden, []); assert.deepEqual(errors, []);
      assert(requests.some(r => r.path === '/api/segretaria/follow-up' && r.body?.op === 'confirm'));
      assert(requests.some(r => r.path === '/api/segretaria/follow-up' && r.method === 'GET'));
      console.log('PASS ' + width + ' real email → admission' + (loseAck ? ' with lost ack retry' : '') + ' → Inbox → next step → reload'); checks++;
    } catch (error) { console.error(errors, await page.locator('body').innerText()); throw error; }
    finally { await page.close(); }
  }
} finally { await browser.close(); }
console.log(checks + ' real mailbox journey scenarios passed; screenshots: ' + artifacts);
