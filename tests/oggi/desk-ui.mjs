// Production desk, legacy queue and case modal. Only persistence/navigation IO
// comes from the local harness; no desk/controller/engine mocks.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const chromium = await loadChromium(); assert(chromium, 'Browser required');
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser, checks = 0;
const check = async (name, run) => { await run(); checks++; console.log('PASS ' + name); };
const items = page => page.locator('#ogDeskPanel [data-desk-item]');
const itemIds = page => items(page).evaluateAll(nodes => nodes.map(node => node.dataset.deskItem));
const fresh = async page => {
  await page.goto(base); await page.waitForFunction(() => oggiSegretaria.loaded && !oggiSegretaria.loading);
  assert.equal(await page.locator('#ogDeskFold').evaluate(node => node.open), false);
  await page.locator('#ogDeskFold > summary').click();
  await page.waitForSelector('#ogDeskPanel [data-desk-area]');
};
const archiveOpen = page => page.locator('#ogQueueArchive').evaluate(node => node.open);

try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(4000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await fresh(page);
    await check(width + ' cinque aree prima della coda, archivio chiuso e zero effetti all’apertura', async () => {
      assert.deepEqual(await page.locator('[data-desk-area]').evaluateAll(nodes => nodes.map(node => node.dataset.deskArea)), ['contracts', 'payments', 'appointments', 'maintenance', 'clients']);
      assert.equal(await archiveOpen(page), false);
      assert.equal(await page.locator('[data-ow-view="decisions"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => !!(document.getElementById('ogDeskPanel').compareDocumentPosition(document.getElementById('ogQueueArchive')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
      assert.equal(await page.locator('#ogWorkQueue').isVisible(), false);
      assert((await items(page).count()) <= 5);
      assert.deepEqual(await page.evaluate(() => [testIO.writes, testIO.demoWrites, testIO.responses]), [[], [], []]);
    });
    await check(width + ' tutte le urgenze raggiungibili in pagine da cinque e aperture senza scritture', async () => {
      await page.evaluate(() => {
        S.contracts = []; S.payments = []; S.leads = []; S.clients = []; S.viewingRequests = []; S.preAgreements = []; S.actionQueue = [];
        oggiSegretaria.rows = []; testIO.followUps = [];
        S.properties = Array.from({ length: 8 }, (_, i) => ({ id: 'urgent-house-' + i, name: 'Casa intervento ' + i }));
        S.maintenance = S.properties.map((property, i) => ({ id: 'urgent-' + i, propertyId: property.id, title: 'Guasto prioritario ' + i, priority: 'urgent', status: 'pending', createdAt: new Date().toISOString() }));
        oggiWorkspace.deskArea = null; oggiWorkspace.deskPage = 0; oggiSegretariaRender();
      });
      await page.locator('[data-desk-area="maintenance"]').click();
      assert.equal(await items(page).count(), 5);
      assert.match(await page.locator('#ogDeskPanel .od-alert').innerText(), /8 casi/);
      const found = [];
      for (const expectedCount of [5, 3]) {
        assert.equal(await items(page).count(), expectedCount);
        const current = await itemIds(page); assert(current.every(id => !found.includes(id))); found.push(...current);
        for (const id of current) {
          await page.locator('[data-desk-act="' + id + '"]').click();
          assert.equal(await page.evaluate(() => testIO.actions.at(-1)[0]), 'viewMaintenance');
          await page.locator('#toasts button').click();
        }
        if (expectedCount === 5) await page.locator('[data-desk-page="1"]').click();
      }
      assert.equal(found.length, 8);
      assert.deepEqual((await page.evaluate(() => testIO.actions.filter(action => action[0] === 'viewMaintenance').map(action => action[1]))).sort(), Array.from({ length: 8 }, (_, i) => 'urgent-' + i));
      assert(await page.locator('[data-desk-page="1"]').isDisabled());
      await page.locator('[data-desk-archive="urgent"]').click();
      assert.equal(await archiveOpen(page), true);
      assert.deepEqual(await page.evaluate(() => oggiWorkspace.deskFilter.signalIds.slice().sort()), Array.from({ length: 8 }, (_, i) => 'mnt_urgent-' + i));
      await page.getByRole('button', { name: /Mostra altre ·/ }).click();
      await page.waitForFunction(() => document.querySelectorAll('#ogDecisionPanel [data-kind="manutenzione"]').length === 8);
      assert.equal(await page.locator('#ogDecisionPanel [data-kind="manutenzione"]').count(), 8);
      assert.deepEqual(await page.evaluate(() => [testIO.writes, testIO.demoWrites, testIO.responses]), [[], [], []]);
    });
    await fresh(page);
    await check(width + ' i passaggi di una pratica filtrano gli ID esatti e Tutta la coda li ripristina', async () => {
      await page.locator('[data-desk-area="contracts"]').click();
      await page.locator('[data-desk-details="current:contract:contratto-demo"]').click();
      assert.equal(await archiveOpen(page), true);
      assert.deepEqual(await page.evaluate(() => oggiWorkspace.deskFilter), { signalIds: ['sig_contratto-demo'], caseIds: ['sg_' + 'a'.repeat(32)] });
      assert.deepEqual(await page.locator('#sgFollowPanel article[data-sg-id]').evaluateAll(nodes => nodes.map(node => node.dataset.sgId)), ['sg_' + 'a'.repeat(32)]);
      assert.equal(await page.locator('#ogDecisionPanel .og-item').count(), 1);
      assert.match(await page.locator('#ogArchiveScope').innerText(), /pratica selezionata/);
      await page.evaluate(() => oggiWorkRevealCase('sg_' + 'b'.repeat(32)));
      assert.equal(await page.evaluate(() => oggiWorkspace.deskFilter), null);
      assert.equal(await page.locator('#sgFollowPanel article[data-sg-id]').count(), 2);
      assert.match(await page.locator('#ogArchiveScope').innerText(), /Tutti i segnali originali/);
      for (const id of ['sig_contratto-demo', 'mnt_guasto-demo', 'vw_v-proposta'])
        assert.equal(await page.locator('[data-og-action="' + id + '#0"]').count(), 1);
      await page.locator('[data-desk-details="current:contract:contratto-demo"]').click();
      await page.locator('#ogQueueArchive .od-show-all').click();
      assert.equal(await page.evaluate(() => oggiWorkspace.deskFilter), null);
      assert.equal(await page.locator('#sgFollowPanel article[data-sg-id]').count(), 2);
      assert.match(await page.locator('#ogArchiveScope').innerText(), /Tutti i segnali originali/);
    });
    await fresh(page);
    await check(width + ' casi senza data, identità ambigue ed esiti sconosciuti restano evidenti e consultabili', async () => {
      await page.evaluate(() => {
        const base = structuredClone(testIO.followUps[0]);
        const make = (letter, fields) => ({ ...structuredClone(base), id: 'sg_' + letter.repeat(32), followUp: { ...structuredClone(base.followUp), ...fields } });
        const undated = make('c', { checkAt: null, lastInboundAt: null, nextAction: 'Verificare la fonte senza data' });
        const ambiguous = make('b', { checkAt: null, lastInboundAt: new Date().toISOString(), practiceRef: null, propertyRef: null, confirmed: false, needsReview: true, ambiguous: true, nextAction: 'Chiarire l’identità' });
        const unknown = make('d', { checkAt: null, lastInboundAt: new Date().toISOString(), practiceRef: null, propertyRef: null, confirmed: false, needsReview: true });
        unknown.deliveryResult = { error: 'delivery_state_unavailable' };
        const waiting = make('e', { checkAt: new Date(Date.now() + 86400000).toISOString(), nextAction: 'Ricontrollare domani' });
        const recentUndated = make('f', { practiceRef: 'maintenance/guasto-demo', checkAt: null, lastInboundAt: new Date().toISOString(), nextAction: 'Impostare il ricontrollo dell’intervento' });
        S.contracts.push({ id: 'verify-demo', status: 'active', signatureStatus: 'complete', registrationStatus: 'pending', endDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) });
        testIO.followUps = [undated, ambiguous, unknown, waiting, recentUndated];
        oggiSegretaria.rows = structuredClone(testIO.followUps); oggiSegretariaRender();
      });
      assert.equal(await archiveOpen(page), false);
      assert.equal(await page.locator('[data-desk-archive="history"] strong span').innerText(), '4');
      assert.equal(await page.locator('[data-desk-archive="waiting"] strong span').innerText(), '1');
      assert(await page.locator('[data-desk-archive="history"]').isVisible());
      assert.match(await page.locator('#ogDeskPanel .ow-source-note').innerText(), /Non tutti gli esiti degli invii sono verificabili/);
      assert.doesNotMatch(await page.locator('#ogDeskPanel').innerText(), /tutto a posto|tutto completato/i);
      assert.match(await page.locator('#ogDeskPanel .od-alert').filter({ has: page.locator('[data-desk-archive="unlinked"]') }).innerText(), /2 richieste recenti/);
      assert(await page.locator('[data-desk-archive="verification"]').isVisible());
      await page.locator('[data-desk-archive="unlinked"]').click();
      assert.deepEqual((await page.locator('#sgFollowPanel article[data-sg-id]').evaluateAll(nodes => nodes.map(node => node.dataset.sgId))).sort(), ['b', 'd'].map(letter => 'sg_' + letter.repeat(32)));
      await page.locator('[data-desk-archive="verification"]').click();
      assert.equal(await page.locator('#sgFollowPanel article[data-sg-id]').count(), 0);
      assert.equal(await page.locator('#ogDecisionPanel .og-item').count(), 1);
      assert.equal(await page.locator('[data-og-action="rli_verify-demo#0"]').count(), 1);
      await page.locator('[data-desk-archive="history"]').click();
      assert.deepEqual((await page.locator('#sgFollowPanel article[data-sg-id]').evaluateAll(nodes => nodes.map(node => node.dataset.sgId))).sort(), ['b', 'c', 'd'].map(letter => 'sg_' + letter.repeat(32)));
      await page.locator('[data-desk-archive="waiting"]').click();
      assert.deepEqual(await page.locator('#sgFollowPanel article[data-sg-id]').evaluateAll(nodes => nodes.map(node => node.dataset.sgId)), ['sg_' + 'e'.repeat(32)]);
      assert.equal(await page.locator('[data-ow-view="following"]').getAttribute('aria-pressed'), 'true');
      await page.locator('[data-desk-archive="all"]').click();
      assert.equal(await page.locator('#sgFollowPanel article[data-sg-id]').count(), 5);
    });
    await fresh(page);
    await check(width + ' il desk apre review senza AI e gli aggiornamenti conservano modulo e bozza', async () => {
      await page.locator('[data-desk-area="contracts"]').click();
      await page.locator('[data-desk-act="current:contract:contratto-demo"]').click();
      await page.waitForSelector('#sgFollowModal');
      assert.equal(await archiveOpen(page), false);
      await page.locator('[data-sg-modal="edit"]').click();
      await page.locator('#sgAction').fill('Bozza manuale da conservare'); await page.locator('#sgAction').focus();
      await page.evaluate(() => {
        window.deskSavedModal = document.getElementById('sgFollowModal');
        window.deskSavedDraft = document.getElementById('sgAction');
        window.deskActionsBefore = testIO.actions.length;
        oggiDeskAct('current:maintenance:guasto-demo');
        oggiSegretaria.rows[0].followUp.nextAction = 'Nuovo ricontrollo ricevuto dal listener'; oggiScheduleUpdate();
      });
      await page.waitForFunction(() => document.getElementById('ogDeskPanel').textContent.includes('Nuovo ricontrollo ricevuto dal listener'));
      assert.equal(await page.evaluate(() => testIO.actions.length), await page.evaluate(() => deskActionsBefore));
      assert.equal(await page.evaluate(() => document.getElementById('sgFollowModal') === deskSavedModal && document.getElementById('sgAction') === deskSavedDraft), true);
      assert.equal(await page.locator('#sgAction').inputValue(), 'Bozza manuale da conservare');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'sgAction');
      assert.deepEqual(await page.evaluate(() => [testIO.writes, testIO.demoWrites, testIO.responses]), [[], [], []]);
      await page.locator('[data-sg-modal="cancel"]').first().click();
      assert.equal(await archiveOpen(page), false);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.deskAct), 'current:contract:contratto-demo');
      assert(await page.locator('[data-desk-act="current:contract:contratto-demo"]').isVisible());
    });
    await fresh(page);
    await check(width + ' aggiornamento regionale conserva area, focus, ricerca e archivio chiuso', async () => {
      await page.locator('#ogWorkQuery').fill('Aurora');
      await page.locator('[data-desk-area="maintenance"]').click();
      const control = page.locator('[data-desk-act]').first();
      const key = await control.getAttribute('data-desk-key'); await control.focus();
      await page.evaluate(() => { S.maintenance[0].title = 'Titolo aggiornato dal listener'; oggiScheduleUpdate(); });
      await page.waitForFunction(() => document.getElementById('ogDeskPanel').textContent.includes('Titolo aggiornato dal listener'));
      assert.equal(await page.evaluate(() => document.activeElement.dataset.deskKey), key);
      assert.equal(await page.locator('[data-desk-area="maintenance"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#ogWorkQuery').inputValue(), 'Aurora');
      assert.equal(await archiveOpen(page), false);
    });
    await check(width + ' errori e letture parziali visibili anche con archivio chiuso', async () => {
      await page.evaluate(() => { S._paError = true; oggiSegretaria.incomplete = true; oggiSegretaria.error = 'Seguiti non aggiornati: lettura fallita.'; oggiSegretariaRender(); });
      assert.equal(await archiveOpen(page), false);
      const notice = page.locator('#ogDeskPanel .ow-source-note');
      assert(await notice.isVisible());
      assert.match(await notice.innerText(), /Proposte non aggiornate/);
      assert.match(await notice.innerText(), /lettura parziale/);
      assert.match(await notice.innerText(), /lettura fallita/);
      assert(await page.locator('[data-desk-refresh]').isVisible());
      assert.doesNotMatch(await page.locator('#ogDeskPanel').innerText(), /tutto a posto|tutto completato/i);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => [testIO.writes, testIO.demoWrites, testIO.responses]), [[], [], []]);
    });
    await page.close();
  }
  console.log(checks + ' desk UI checks passed; real handlers, no writes or AI.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
