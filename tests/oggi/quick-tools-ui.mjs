// Production launchers and forms; synthetic persistence, native popups.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { quickToolsHtml } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ids = ['properties', 'people', 'whatsapp', 'email', 'appointments', 'calls', 'document', 'magic-sign', 'inventory', 'handover', 'maintenance', 'payment', 'invoices', 'listings', 'templates', 'automations'];
let fixtureHtml = quickToolsHtml;
if (process.env.BOOM_QUICK_TOOLS_MUTATION === 'drop-property-contract-context') {
  const guard = "if (kind === 'person' || kind === 'client' || kind === 'property' || kind === 'contract') {";
  assert(fixtureHtml.includes(guard), 'The production Home context guard must be present');
  fixtureHtml = fixtureHtml.replace(guard, "if (kind === 'person' || kind === 'client') {");
}
const requests = [];
const server = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (new URL(req.url, 'http://localhost').pathname === '/') res.end(fixtureHtml);
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
      assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(), 16);
      assert.equal(await page.locator('#ogQuickTools [data-og-tool="home:new-client"]').count(), 0);
      assert.equal(await tool('new-client').count(), 1);
      assert.equal(await page.locator('#ogDeskFold').evaluate(el => el.open), true);
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
    const openNewPayment = async () => {
      // Incassi navigation remains the declared router boundary. Creation
      // uses the real catalog renderer and its explicit button, then getModal.
      await page.evaluate(() => goTo('boom-tools'));
      await page.getByRole('button', { name: '＋ Nuova rata', exact: true }).click();
      assert.equal(await page.locator('#modals .modal-title').innerText(), 'Nuova rata');
      assert.equal(await page.locator('#mForm [name="contractId"] option[value="contratto-chiuso"]').count(), 0, 'A terminated contract is never selectable for a new payment');
    };
    const select = async (kind, query, text) => {
      await page.locator('#ogWorkKind').selectOption(kind);
      await page.locator('#ogWorkQuery').fill(query);
      const result = page.locator('#ogWorkResults .ow-result').filter({ hasText: text || query });
      assert.equal(await result.count(), 1, 'Select one exact rendered result, not a name-based fallback');
      const selectedLabel = await result.locator('strong').innerText();
      await result.click();
      assert.equal(await page.locator('#ogQuickContext strong').innerText(), selectedLabel);
      assert.equal(await page.locator('#ogContextDetails').evaluate(el => el.open), false);
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

    await check('sixteen visible launchers follow the open desk; explicit creation opens blank native forms', async () => {
      assert.deepEqual(await page.locator('#ogQuickTools [data-og-tool]').evaluateAll(nodes => nodes.map(node => node.dataset.ogTool)), ids.map(id => 'home:' + id));
      for (const id of ids) assert.equal(await tool(id).isVisible(), true);
      assert.equal(await page.locator('#ogDeskFold').evaluate(el => !!(el.compareDocumentPosition(document.getElementById('ogQuickTools')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
      assert.equal(await page.locator('#ogQuickTools [data-og-tool] svg').count(), 16);
      assert(await page.locator('#ogQuickTools [data-og-tool] svg').evaluateAll(nodes => nodes.every(node => node.children.length > 0)), 'Every launcher has a drawn icon');
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
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['goTo', 'payments']);
      assert.equal(await page.locator('#modals .modal').count(), 0, 'Incassi opens consultation without creating a payment');
      await page.locator('#toasts button').click();
      await openNewPayment();
      assert.equal(await page.locator('#mForm select[name="contractId"]').inputValue(), '');
      assert.equal(await page.locator('#pAmount').inputValue(), '');
      assert.equal(await page.locator('#mForm select[name="contractId"]').evaluate(el => el.required), true);
      await close();
      await page.getByRole('button', { name: '← Home', exact: true }).click();
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
      await popup('calls', '/chiamate');
    });

    await check('navigation tools reach their exact existing section without executing automations', async () => {
      for (const [id, destination] of [['properties', 'properties'], ['people', 'users'], ['appointments', 'viewings'], ['invoices', 'invoices'], ['listings', 'listings'], ['templates', 'templates'], ['automations', 'rules']]) {
        await tool(id).click();
        assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['goTo', destination]);
        await page.locator('#toasts button').click();
      }
      assert.equal(await page.locator('#modals .modal').count(), 0);
    });

    await check('Magic Sign opens the real chooser and validates an empty PDF before advancing', async () => {
      await tool('magic-sign').click();
      assert(await page.locator('#msStudio').isVisible());
      assert.equal(await page.locator('#msSaveBtn').count(), 0);
      await page.getByRole('button', {name:/UN ALTRO DOCUMENTO PDF personalizzato/}).click();
      assert.equal(await page.locator('#msTitle').inputValue(), '');
      assert.equal(await page.locator('#msProperty').inputValue(), '');
      await page.locator('#msNext').click();
      assert.equal(await page.locator('#msTitle').count(), 1);
      assert.equal(await page.locator('#msSaveBtn').count(), 0);
      assert.match(await page.locator('#msStatus').innerText(), /PDF/i);
      await page.getByRole('button', {name:'Chiudi Magic Sign', exact:true}).click();
      await page.waitForFunction(() => !document.querySelector('#modals .modal'));
      assert.equal(await page.locator('#modals .modal').count(), 0);
    });

    for (const channel of ['whatsapp', 'email']) {
      await check(channel + ' opens the real inbox filtered by channel without reading a conversation', async () => {
        await page.evaluate(() => {
          testState.conversations = ['whatsapp', 'email'].map(channel => ({ id: 'demo-' + channel, channel, contactId: 'p-seconda', contactType: 'tenant', contactName: 'Persona ' + channel, lastMessagePreview: 'Messaggio ' + channel, unread: 3 }));
        });
        await tool(channel).click();
        assert.equal(await page.getByRole('combobox', { name: 'Canale messaggi' }).inputValue(), channel);
        assert.match(await page.locator('.inbox-list-pane').innerText(), new RegExp('Messaggio ' + channel));
        assert.doesNotMatch(await page.locator('.inbox-list-pane').innerText(), new RegExp('Messaggio ' + (channel === 'email' ? 'whatsapp' : 'email')));
        assert.equal(await page.evaluate(() => _inboxState.convId), null);
        assert.deepEqual(await page.evaluate(() => testState.conversations.map(c => c.unread)), [3, 3]);
      });

      await check(channel + ' uses exact contact identity and rejects homonyms and duplicate conversation IDs', async () => {
        await select('person', 'Persona Seconda');
        await page.evaluate(channel => {
          testState.conversations = [
            { id: 'own', contactId: 'p-seconda', contactType: 'tenant', lastMessagePreview: 'Fonte corretta' },
            { id: 'homonym', contactId: 'p-demo', contactType: 'tenant', lastMessagePreview: 'Omonimo escluso' },
            { id: 'wrong-kind', contactId: 'p-seconda', contactType: 'client', lastMessagePreview: 'Tipo escluso' },
            { id: 'duplicate', contactId: 'p-seconda', contactType: 'tenant', lastMessagePreview: 'Duplicato escluso' },
            { id: 'duplicate', contactId: 'p-demo', contactType: 'tenant', lastMessagePreview: 'Altro duplicato' }
          ].map(c => ({ ...c, channel, contactName: 'Persona Seconda', unread: 4 }));
        }, channel);
        await tool(channel).click();
        assert.equal(await page.getByRole('combobox', { name: 'Canale messaggi' }).inputValue(), channel);
        const list = await page.locator('.inbox-list-pane').innerText();
        assert.match(list, /Fonte corretta/);assert.doesNotMatch(list, /Omonimo escluso|Tipo escluso|Duplicato escluso|Altro duplicato/);
        assert.deepEqual(await page.evaluate(() => oggiInboxScope().ids), ['own']);
        assert.equal(await page.evaluate(() => _inboxState.convId), null);
        assert.deepEqual(await page.evaluate(() => testState.conversations.map(c => c.unread)), [4, 4, 4, 4, 4]);
      });

      for (const kind of ['property', 'contract']) {
        await check(channel + ' preserves ' + kind + ' context through Inbox and return; ambiguous cases stay excluded', async () => {
          const id = kind === 'property' ? 'casa-seconda' : 'contratto-secondo';
          const query = kind === 'property' ? 'Casa Aurora' : 'BOOM-SECONDO';
          await select(kind, query, kind === 'property' ? 'Via Seconda 20' : 'Persona Seconda');
          const label = await page.locator('#ogQuickContext strong').innerText();
          await page.evaluate(channel => {
            // The same person appears in every conversation: only confirmed
            // practice references may attach messages to the selected house/deal.
            testState.conversations = ['own-whatsapp', 'own-email', 'ambiguous', 'unconfirmed', 'conflicting', 'unrelated'].map(id => ({
              id, channel: id.startsWith('own-') ? id.slice(4) : channel,
              contactId: 'p-seconda', contactType: 'tenant', contactName: 'Persona Seconda',
              lastMessagePreview: 'Messaggio ' + id, unread: 4, needsReply: true, status: 'open'
            }));
            testIO.followUps = testState.conversations.map((conversation, index) => caseRow(String.fromCharCode(99 + index), {
              conversationId: conversation.id, practiceRef: 'contracts/contratto-secondo', propertyRef: 'properties/casa-seconda',
              ...(conversation.id === 'ambiguous' ? { ambiguous: true } : {}),
              ...(conversation.id === 'unconfirmed' ? { confirmed: false } : {}),
              ...(conversation.id === 'conflicting' ? { propertyRef: 'properties/casa-demo' } : {}),
              ...(conversation.id === 'unrelated' ? { practiceRef: 'contracts/contratto-demo', propertyRef: 'properties/casa-demo' } : {})
            }));
            oggiSegretaria.rows = testIO.followUps;
          }, channel);
          await tool(channel).click();
          assert.deepEqual(await page.evaluate(() => testState.inboxContext?.record), { kind, id });
          await page.waitForFunction(() => testState.inboxContext && !testState.inboxContext.loading);
          assert.equal(await page.getByRole('combobox', { name: 'Canale messaggi' }).inputValue(), channel);
          assert.match(await page.locator('.inbox-list-pane').innerText(), new RegExp('Messaggio own-' + channel));
          assert.doesNotMatch(await page.locator('.inbox-list-pane').innerText(), /Messaggio ambiguous|Messaggio unconfirmed|Messaggio conflicting|Messaggio unrelated/);
          assert.doesNotMatch(await page.locator('.inbox-list-pane').innerText(), new RegExp('Messaggio own-' + (channel === 'email' ? 'whatsapp' : 'email')));
          assert.deepEqual(await page.evaluate(() => oggiInboxScope().ids.sort()), ['own-email', 'own-whatsapp']);
          assert.equal(await page.evaluate(() => _inboxState.convId), null);
          assert.equal(await page.locator('#inboxBody').count(), 0);
          assert.deepEqual(await page.evaluate(() => testState.conversations.map(c => [c.unread, c.needsReply])), Array.from({ length: 6 }, () => [4, true]));
          assert.equal(await page.evaluate(() => testIO.reads.includes('messages')), false);

          await page.getByRole('button', { name: '← Torna al contesto', exact: true }).click();
          assert.deepEqual(await page.evaluate(() => [testState.page, oggiWorkspace.selected.kind, oggiWorkspace.selected.id]), ['oggi', kind, id]);
          assert.equal(await page.locator('#ogQuickContext strong').innerText(), label);
          assert.equal(await page.locator('#ogWorkQuery').inputValue(), query);

          // When all saved links need review, preserve the empty context;
          // never silently expose the general Inbox as a fallback.
          await page.evaluate(() => testIO.followUps.forEach(task => { task.followUp.needsReview = true; }));
          await tool(channel).click();
          await page.waitForFunction(() => testState.inboxContext && !testState.inboxContext.loading);
          assert.deepEqual(await page.evaluate(() => testState.inboxContext.record), { kind, id });
          assert.deepEqual(await page.evaluate(() => oggiInboxScope().ids), []);
          assert.doesNotMatch(await page.locator('.inbox-list-pane').innerText(), /Messaggio /);
          assert.equal(await page.evaluate(() => _inboxState.convId), null);
        });
      }
    }

    await check('compact context keeps icons stable, exposes details and can clear the exact selection', async () => {
      const icons = await page.locator('#ogQuickTools [data-og-tool] svg').evaluateAll(nodes => nodes.map(node => node.innerHTML));
      await select('property', 'Casa Segnaposto');
      assert.deepEqual(await page.locator('#ogQuickTools [data-og-tool] svg').evaluateAll(nodes => nodes.map(node => node.innerHTML)), icons);
      await page.locator('#ogQuickContext').getByRole('button', { name: 'Cambia', exact: true }).click();
      assert(await page.locator('#ogWorkQuery').evaluate(el => el === document.activeElement));
      await page.locator('#ogContextDetails > summary').click();
      assert(await page.locator('.ow-context-actions').isVisible());
      await page.locator('#ogQuickContext').getByRole('button', { name: 'Tutti', exact: true }).click();
      assert.equal(await page.evaluate(() => oggiWorkspace.selected), null);
      assert.equal(await page.locator('#ogWorkQuery').inputValue(), '');
      assert.equal(await page.locator('#ogContextDetails').count(), 0);
      assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(), 16);
      await tool('maintenance').click();
      assert.equal(await page.locator('#mForm select[name="propertyId"]').inputValue(), '');
      await close();
    });

    await check('an unsupported selected card explicitly keeps the tools general', async () => {
      await select('maintenance', 'Verificare perdita in cucina');
      assert.equal(await page.evaluate(() => oggiWorkspace.selected.kind), 'maintenance');
      assert.equal(await page.locator('#ogQuickContext small').innerText(), 'SCHEDA SELEZIONATA · STRUMENTI GENERALI');
      assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(), 16);
      await tool('maintenance').click();
      assert.equal(await page.locator('#mForm [name="propertyId"]').inputValue(), '', 'A selected maintenance card does not silently assign its property');
      await close();
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

    await check('contract launches preserve exact references; explicit payment selection fills the real amount', async () => {
      await select('contract', 'BOOM-SECONDO', 'Persona Seconda');
      await tool('payment').click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['goTo', 'payments']);
      assert.equal(await page.locator('#modals .modal').count(), 0);
      await page.locator('#toasts button').click();
      await openNewPayment();
      assert.equal(await page.locator('#mForm [name="contractId"]').inputValue(), '', 'Consultation does not silently preassign a new payment');
      await page.locator('#mForm [name="contractId"]').selectOption('contratto-secondo');
      assert.equal(await page.locator('#mForm [name="contractId"]').inputValue(), 'contratto-secondo');
      assert.equal(await page.locator('#pAmount').inputValue(), '930', 'Production fillPayAmount ran from the explicit select change');
      await page.locator('#pAmount').fill('925');
      assert.equal(await page.locator('#mForm [name="status"]').inputValue(), 'pending');
      await close();
      await page.getByRole('button', { name: '← Home', exact: true }).click();
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

    await check('inactive contract still permits reading Incassi without opening a creation form', async () => {
      await select('contract', 'BOOM-CHIUSO', 'Persona Seconda');
      assert.equal(await tool('payment').isEnabled(), true);
      await tool('payment').click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['goTo', 'payments']);
      assert.equal(await page.locator('#modals .modal').count(), 0);
      assert.equal(context.pages().length, 1);
    });

    for (const change of ['removed', 'duplicate', 'inactive']) {
      await check('changed ' + change + ' context never creates a payment; missing identities cannot navigate', async () => {
        await select('contract', 'BOOM-SECONDO', 'Persona Seconda');
        await page.evaluate(change => {
          const item = testState.contracts.find(c => c.id === 'contratto-secondo');
          if (change === 'removed') testState.contracts = testState.contracts.filter(c => c !== item);
          if (change === 'duplicate') testState.contracts.push({ ...item });
          if (change === 'inactive') item.status = 'terminated';
        }, change);
        await tool('payment').click();
        const navigations = await page.evaluate(() => testIO.actions.filter(a => a[0] === 'goTo'));
        assert.deepEqual(navigations, change === 'inactive' ? [['goTo', 'payments']] : []);
        assert.equal(await page.locator('#modals .modal').count(), 0);
        assert.equal(context.pages().length, 1);
      });
    }

    for (const change of ['role', 'account']) {
      await check('stale ' + change + ' blocks every launcher even through its handler', async () => {
        const inboxBefore = await page.evaluate(() => structuredClone(_inboxState));
        await page.evaluate(change => {
          if (change === 'role') testState.profile.role = 'tenant';
          else testAuth.currentUser = { uid: 'another-admin' };
        }, change);
        await page.evaluate(ids => ids.forEach(id => oggiQuickTool('home:' + id)), [...ids, 'new-client']);
        await page.evaluate(() => { oggiOpenInbox('whatsapp'); oggiOpenInbox('email'); });
        assert.deepEqual(await page.evaluate(() => _inboxState), inboxBefore, 'Direct channel handlers reject revoked authorization without changing Inbox');
        assert.equal(await page.evaluate(() => testState.page), 'oggi');
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
