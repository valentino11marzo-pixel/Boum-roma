// Real edit/save/close UI and real updateFollowUp rules; only demo IO in memory.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const chromium = await loadChromium();
assert(chromium, 'Browser required');
const guard = 'if (input.lastMessageId !== cur.followUp.lastMessageId)';
assert(html.includes(guard), 'Preview executes the production lastMessageId guard');
const mutant = html.replace(guard, 'if (false)');
const networkWrites = [];
const server = createServer((req, res) => {
  if (req.method !== 'GET') networkWrites.push(req.url);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(req.url.startsWith('/mutant') ? mutant : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const A = 'sg_' + 'a'.repeat(32), B = 'sg_' + 'b'.repeat(32);
let browser, checks = 0;
const errors = [];
const check = async (name, run) => { await run(); checks++; console.log('PASS ' + name); };
try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Rome' });
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const ready = async () => page.waitForFunction(() => oggiSegretaria.loaded && !oggiSegretaria.loading);
  const fresh = async () => { await page.goto(base); await ready(); };
  const card = id => page.locator('article[data-sg-id="' + id + '"]');
  const edit = async id => {
    const details = card(id).locator('.sg-case-details');
    if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
    await card(id).locator('[data-sg-action="edit"]').click();
    await page.waitForSelector('#sgFollowForm');
  };
  const fill = async (action = 'Attendere conferma di accesso dal tecnico') => {
    await page.locator('#sgAction').fill(action);
    await page.locator('#sgWaitingOn').selectOption('collaborator');
    await page.locator('#sgWaitingLabel').fill('Tecnico dimostrativo');
    const future = await page.evaluate(() => BOOM_SEGRETARIA_CASI.localDateTime(new Date(Date.now() + 86400000).toISOString()));
    await page.locator('#sgCheckAt').fill(future);
  };
  const save = async () => {
    await page.locator('[data-sg-submit]').click();
    await page.waitForFunction(() => !document.getElementById('sgFollowModal'));
    await ready();
  };
  await fresh();
  await check('edit/save uses real confirm rules and moves the demo case to In attesa', async () => {
    assert.match(await page.locator('.demo-bar').innerText(), /Le modifiche durano fino al ricaricamento/);
    assert.equal(await page.evaluate(() => testIO.demoWrites.length), 0);
    await edit(A); await fill(); await save();
    assert.equal(await page.locator('[data-ow-view="following"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await card(A).isVisible(), true);
    assert.equal(await card(A).evaluate(el => el.closest('[data-sg-group]').dataset.sgGroup), 'waiting');
    assert.match(await card(A).innerText(), /Tecnico dimostrativo/);
    const saved = await page.evaluate(id => testIO.followUps.find(t => t.id === id).followUp, A);
    assert.equal(saved.confirmed, true); assert.equal(saved.needsReview, false);
    assert.equal(saved.confirmedBy, 'demo-admin'); assert.equal(saved.propertyRef, 'properties/casa-demo');
    assert.equal(await page.evaluate(() => testIO.demoWrites.length), 1);
    assert.equal(await page.evaluate(() => testIO.writes.length), 0);
  });
  await check('close requires outcome and removes only the demo case; reload resets it', async () => {
    await edit(A); await page.locator('[data-sg-modal="close"]').click();
    await page.locator('[data-sg-submit]').click();
    assert.equal(await page.locator('#sgFollowModal').count(), 1);
    assert.equal(await page.evaluate(() => testIO.demoWrites.length), 1);
    await page.locator('#sgOutcome').fill('Accesso concordato nel solo esempio dimostrativo.'); await save();
    assert.equal(await card(A).count(), 0); assert.equal(await card(B).count(), 1);
    const saved = await page.evaluate(id => testIO.followUps.find(t => t.id === id), A);
    assert.equal(saved.status, 'done'); assert.equal(saved.followUp.open, false);
    assert.equal(saved.followUp.outcome, 'Accesso concordato nel solo esempio dimostrativo.');
    await fresh(); assert.equal(await card(A).count(), 1);
    assert.equal(await page.evaluate(() => testIO.demoWrites.length), 0);
  });
  await check('saving an ambiguous case leaves its identity and practice under review', async () => {
    await edit(B); assert.equal(await page.locator('#sgPractice').isDisabled(), true);
    await fill('Chiarire l’immobile prima di organizzare l’accesso'); await save();
    const saved = await page.evaluate(id => testIO.followUps.find(t => t.id === id).followUp, B);
    assert.equal(saved.confirmed, false); assert.equal(saved.ambiguous, true); assert.equal(saved.needsReview, true);
    assert.equal(saved.practiceRef, null); assert.equal(saved.propertyRef, null);
    assert.equal(await card(B).evaluate(el => el.closest('[data-sg-group]').dataset.sgGroup), 'decisions');
    assert.match(await card(B).innerText(), /Da collegare/i);
  });
  await check('new inbound message rejects the old edit with 409 and reloads the real form', async () => {
    await fresh(); await edit(A); await fill('Modifica precedente da non salvare');
    await page.evaluate(id => {
      const canonical = testIO.followUps.find(t => t.id === id);
      canonical.followUp.lastMessageId = 'wa-arrived-later'; canonical.followUp.preview = 'Nuova richiesta da rileggere.';
    }, A);
    await page.locator('[data-sg-submit]').click();
    await page.waitForFunction(() => oggiSegretaria.modal?.task?.followUp.lastMessageId === 'wa-arrived-later');
    assert.match(await page.locator('#sgFollowModal').innerText(), /nuovo messaggio/i);
    assert.notEqual(await page.locator('#sgAction').inputValue(), 'Modifica precedente da non salvare');
    assert.equal(await page.evaluate(() => testIO.responses.at(-1).code), 409);
    assert.equal(await page.evaluate(() => testIO.responses.at(-1).error), 'new_message_reload');
    assert.equal(await page.evaluate(() => testIO.demoWrites.length), 0);
  });
  async function rejectsOldMessage(target, op) {
    const result = await target.evaluate(async ({ id, op }) => {
      const before = JSON.stringify(testIO.followUps);
      const task = testIO.followUps.find(t => t.id === id);
      const input = { op, id, lastMessageId: 'stale-message', outcome: 'Esito vecchio', practiceRef: task.followUp.practiceRef,
        nextAction: 'Non deve essere salvata', waitingOn: 'client', waitingLabel: 'Cliente demo', checkAt: new Date(Date.now() + 86400000).toISOString() };
      const response = await fetch('/api/segretaria/follow-up', { method: 'POST', body: JSON.stringify(input) });
      return { status: response.status, body: await response.json(), unchanged: before === JSON.stringify(testIO.followUps) };
    }, { id: A, op });
    assert.equal(result.status, 409); assert.equal(result.body.error, 'new_message_reload'); assert.equal(result.unchanged, true);
  }
  await check('both confirm and close compare lastMessageId, with a mutation that must fail', async () => {
    await rejectsOldMessage(page, 'confirm'); await rejectsOldMessage(page, 'close');
    await page.goto(base + '/mutant'); await ready();
    await assert.rejects(rejectsOldMessage(page, 'confirm'), assert.AssertionError);
    await fresh();
  });
  await check('concurrent demo edits preserve the newer record through the real CAS error path', async () => {
    const result = await page.evaluate(async id => {
      const task = testIO.followUps.find(t => t.id === id);
      const pending = fetch('/api/segretaria/follow-up', { method: 'POST', body: JSON.stringify({
        op: 'close', id, lastMessageId: task.followUp.lastMessageId, outcome: 'Vecchio esito'
      }) });
      task.followUp.nextAction = 'Modifica concorrente da conservare';
      const response = await pending;
      return { status: response.status, body: await response.json(), task, writes: testIO.demoWrites.length };
    }, A);
    assert.equal(result.status, 409); assert.equal(result.body.error, 'new_message_reload');
    assert.equal(result.task.status, 'open'); assert.equal(result.task.followUp.nextAction, 'Modifica concorrente da conservare');
    assert.equal(result.writes, 0);
  });
  await check('AI, sends and every other POST remain blocked; demo has no external writes', async () => {
    const results = await page.evaluate(async () => {
      const blocked = [];
      for (const [url, op] of [['/api/segretaria/prepare', 'generate'], ['/api/segretaria/owner-command', 'prepare-only'], ['/api/segretaria/follow-up', 'send']]) {
        try { await fetch(url, { method: 'POST', body: JSON.stringify({ op }) }); blocked.push(false); }
        catch { blocked.push(true); }
      }
      return blocked;
    });
    assert.deepEqual(results, [true, true, true]); assert.deepEqual(networkWrites, []); assert.deepEqual(errors, []);
  });
  console.log(`${checks} verifiche prova home superate; sole modifiche dimostrative in memoria.`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
