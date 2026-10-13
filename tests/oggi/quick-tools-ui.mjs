// Six production launchers and forms; synthetic persistence, native popups.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { quickToolsHtml } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ids = ['new-client', 'inventory', 'document', 'maintenance', 'payment', 'handover'];
const requests = [];
const server = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (new URL(req.url, 'http://localhost').pathname === '/') res.end(quickToolsHtml);
  else res.end('<!doctype html><title>Synthetic navigation boundary</title><p>Destination reached. Console execution is outside this launcher test.</p>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const chromium = await loadChromium();
assert(chromium, 'Playwright required for actual quick-tool forms');
let browser, checks = 0;
try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  for (const width of (process.env.TEST_WIDTHS || '1440,390,320').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage(), errors = [], external = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      if (route.request().url().startsWith(base) && route.request().method() === 'GET') return route.continue();
      external.push({ url: route.request().url(), method: route.request().method() });
      return route.abort();
    });
    const tool = id => page.locator('[data-og-tool="home:' + id + '"]');
    const fresh = async () => {
      await page.goto(base);
      await page.waitForFunction(() => oggiSegretaria.loaded && !oggiSegretaria.loading);
      assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(), 6);
    };
    const noWrites = async () => {
      assert.deepEqual(await page.evaluate(() => ({ writes: testIO.writes, demoWrites: testIO.demoWrites, responses: testIO.responses })), { writes: [], demoWrites: [], responses: [] });
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    };
    const close = async () => {
      await page.locator('#modals .modal-close').first().click();
      await page.waitForFunction(() => !document.querySelector('#modals .modal'));
    };
    const select = async (kind, query, text) => {
      await page.locator('#ogWorkKind').selectOption(kind);
      await page.locator('#ogWorkQuery').fill(query);
      const result = page.locator('#ogWorkResults .ow-result').filter({ hasText: text || query });
      assert.equal(await result.count(), 1, 'Select one exact rendered result, not a name-based fallback');
      await result.click();
      assert.match(await page.locator('#ogQuickContext').innerText(), /Selezionato:/);
    };
    const popup = async (id, pathname, params = {}) => {
      const opened = page.waitForEvent('popup');
      await tool(id).click();
      const child = await opened;
      await child.waitForLoadState('domcontentloaded');
      const url = new URL(child.url());
      assert.equal(url.origin, base);
      assert.equal(url.pathname, pathname);
      assert.deepEqual(Object.fromEntries(url.searchParams), params);
      assert.equal(await child.title(), 'Synthetic navigation boundary');
      await child.close();
    };
    const check = async (name, run) => {
      if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return;
      await fresh(); await run(); await noWrites(); checks++;
      console.log('PASS ' + width + ' ' + name);
    };

    await check('six visible launchers fit the viewport and open blank native forms', async () => {
      assert.deepEqual(await page.locator('#ogQuickTools [data-og-tool]').evaluateAll(nodes => nodes.map(node => node.dataset.ogTool)), ids.map(id => 'home:' + id));
      for (const id of ids) assert.equal(await tool(id).isVisible(), true);
      const boxes = await page.locator('#ogQuickTools [data-og-tool]').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      for (const r of boxes) assert(r.left >= -1 && r.right <= width + 1, 'Launcher fits the viewport');
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        assert(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, 'Launcher cards do not overlap');
      }
      await tool('maintenance').click();
      assert.match(await page.locator('#modals .modal-title').innerText(), /Nuova Manutenzione/);
      assert.equal(await page.locator('#mForm select[name="propertyId"]').inputValue(), '');
      assert.equal(await page.locator('#mForm select[name="propertyId"]').evaluate(el => el.required), true);
      assert.equal(await page.locator('#mForm [name="title"]').inputValue(), '');
      await close();
      await tool('payment').click();
      assert.match(await page.locator('#modals .modal-title').innerText(), /Registra Pagamento/);
      assert.equal(await page.locator('#mForm select[name="contractId"]').inputValue(), '');
      assert.equal(await page.locator('#pAmount').inputValue(), '');
      assert.equal(await page.locator('#mForm select[name="contractId"]').evaluate(el => el.required), true);
      await close();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });

    await check('new client opens the real wizard and advances without creating or sending', async () => {
      await tool('new-client').click();
      assert.match(await page.locator('#modals .modal-title').innerText(), /Nuovo cliente/);
      assert.equal(await page.locator('#wzName').inputValue(), '');
      await page.locator('#wzName').fill('Cliente di prova');
      await page.locator('#wzEmail').fill('prova@example.invalid');
      await page.getByRole('button', { name: 'Avanti →', exact: true }).click();
      assert.equal(await page.locator('#wzCF').isVisible(), true);
      await close();
    });

    await check('document opens the real upload form with no automatic assignment or AI', async () => {
      await tool('document').click();
      assert.match(await page.locator('#modals .modal-title').innerText(), /Carica Documento/);
      assert.equal(await page.locator('#docUploadForm [name="propertyId"]').inputValue(), '');
      assert.equal(await page.locator('#docUploadForm [name="userId"]').inputValue(), '');
      assert.equal(await page.locator('#docUploadForm #fileInput').count(), 1);
      assert.equal(await page.locator('#ocrBtn').isVisible(), false);
      await close();
    });

    await check('inventory and handover open real browser destinations without guessed records', async () => {
      await popup('inventory', '/inventario');
      await popup('handover', '/verbale');
    });

    await check('typing a name does not select it; explicit property selection targets the exact ID', async () => {
      await page.locator('#ogWorkKind').selectOption('property');
      await page.locator('#ogWorkQuery').fill('Casa Aurora');
      assert.equal(await page.locator('#ogWorkResults .ow-result').count(), 2, 'Homonyms stay distinct');
      await tool('maintenance').click();
      assert.equal(await page.locator('#mForm [name="propertyId"]').inputValue(), '');
      await close();
      await page.locator('#ogWorkResults .ow-result').filter({ hasText: 'Via Seconda 20' }).click();
      await tool('maintenance').click();
      assert.equal(await page.locator('#mForm [name="propertyId"]').inputValue(), 'casa-seconda');
      await close();
      await tool('document').click();
      await page.waitForFunction(() => document.querySelector('#docUploadForm [name="propertyId"]')?.value === 'casa-seconda');
      assert.equal(await page.locator('#docUploadForm [name="fiscalYear"]').inputValue(), String(new Date().getFullYear()));
      assert.equal(await page.locator('#docUploadForm [name="userId"]').inputValue(), '');
      await close();
      await popup('inventory', '/inventario', { p: 'casa-seconda' });
    });

    await check('contract launches preserve exact contract and property; payment change fills the real amount', async () => {
      await select('contract', 'BOOM-SECONDO', 'Persona Seconda');
      await tool('payment').click();
      assert.equal(await page.locator('#mForm [name="contractId"]').inputValue(), 'contratto-secondo');
      assert.equal(await page.locator('#pAmount').inputValue(), '930', 'Production fillPayAmount ran from the dispatched change');
      await page.locator('#pAmount').fill('925');
      assert.equal(await page.locator('#mForm [name="status"]').inputValue(), 'pending');
      await close();
      await tool('maintenance').click();
      assert.equal(await page.locator('#mForm [name="propertyId"]').inputValue(), 'casa-seconda');
      await close();
      await popup('inventory', '/inventario', { c: 'contratto-secondo' });
      await popup('handover', '/verbale', { c: 'contratto-secondo' });
    });

    await check('selected person and CRM client use the actual scoped upload and wizard', async () => {
      await select('person', 'Persona Seconda');
      await tool('document').click();
      assert.match(await page.locator('#modals .modal-title').innerText(), /Carica Documento per Persona Seconda/);
      assert.match(await page.locator('#userDocForm').getAttribute('onsubmit'), /saveUserDoc\(event,'p-seconda'\)/);
      await close();
      await select('client', 'Aurora Cliente 0');
      await tool('new-client').click();
      assert.equal(await page.locator('#wzName').inputValue(), 'Aurora Cliente 0');
      assert.equal(await page.locator('#wzEmail').inputValue(), 'cliente0@example.invalid');
      assert.equal(await page.locator('#wzPhone').inputValue(), '+39000000000');
      await page.getByRole('button', { name: 'Avanti →', exact: true }).click();
      await page.getByRole('button', { name: 'Avanti →', exact: true }).click();
      assert.equal(await page.locator('#wzProp').inputValue(), '', 'A client does not guess a property');
      await close();
    });

    await check('literal placeholder text in a record ID is not interpolated twice', async () => {
      await select('property', 'Casa Segnaposto');
      await tool('document').click();
      await page.waitForFunction(() => document.querySelector('#docUploadForm [name="propertyId"]')?.value === 'casa-$id-demo');
      await close();
      await popup('inventory', '/inventario', { p: 'casa-$id-demo' });
    });

    await check('inactive contract disables payment and the handler enforces it too', async () => {
      await select('contract', 'BOOM-CHIUSO', 'Persona Seconda');
      assert.equal(await tool('payment').isDisabled(), true);
      assert.match(await tool('payment').innerText(), /non è attivo/);
      await page.evaluate(() => oggiQuickTool('home:payment'));
      assert.equal(await page.locator('#modals .modal').count(), 0);
      assert.equal(context.pages().length, 1);
    });

    for (const change of ['removed', 'duplicate', 'inactive']) {
      await check('stale ' + change + ' context cannot open the rendered action', async () => {
        await select('contract', 'BOOM-SECONDO', 'Persona Seconda');
        await page.evaluate(change => {
          const item = testState.contracts.find(c => c.id === 'contratto-secondo');
          if (change === 'removed') testState.contracts = testState.contracts.filter(c => c !== item);
          if (change === 'duplicate') testState.contracts.push({ ...item });
          if (change === 'inactive') item.status = 'terminated';
        }, change);
        await tool('payment').click();
        assert.equal(await page.locator('#modals .modal').count(), 0);
        assert.equal(context.pages().length, 1);
      });
    }

    for (const change of ['role', 'account']) {
      await check('stale ' + change + ' blocks every launcher even through its handler', async () => {
        await page.evaluate(change => {
          if (change === 'role') testState.profile.role = 'tenant';
          else testAuth.currentUser = { uid: 'another-admin' };
        }, change);
        await page.evaluate(ids => ids.forEach(id => oggiQuickTool('home:' + id)), ids);
        assert.equal(await page.locator('#modals .modal').count(), 0);
        assert.equal(context.pages().length, 1);
      });
    }

    await check('opening another tool cannot replace a draft in the real client wizard', async () => {
      await tool('new-client').click();
      await page.locator('#wzName').fill('Bozza da preservare');
      await page.evaluate(() => oggiQuickTool('home:payment'));
      assert.equal(await page.locator('#wzName').inputValue(), 'Bozza da preservare');
      assert.equal(await page.locator('#mForm').count(), 0);
      await close();
    });
    await context.close();
  }
  assert.equal(requests.filter(r => r.method !== 'GET').length, 0);
  console.log(checks + ' quick-tool browser checks passed; production forms, native popup URLs, zero writes.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
