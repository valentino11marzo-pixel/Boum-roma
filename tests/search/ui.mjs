// Production home/header/search/reader/registry, synthetic Firestore and leaf
// navigation IO. No search, hydration, relationship or permission handler mocks.
import assert from 'node:assert/strict';
import { sessionHelpers } from '../portal-session/source.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { html } from '../oggi/home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const chromium = await loadChromium();
assert(chromium, 'Browser required');
const portalSource = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const refreshStart = portalSource.indexOf('    async function forceRefreshData()');
const refreshEnd = portalSource.indexOf('    function authErr(', refreshStart);
assert(refreshStart >= 0 && refreshEnd > refreshStart, 'Production refresh boundary exists');
const refreshSource = portalSource.slice(refreshStart, refreshEnd);
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser, checks = 0;
const check = async (name, fn) => { await fn(); console.log('PASS ' + name); checks++; };
const search = async (page, query, kind = 'all') => {
  await page.locator('#ogWorkKind').selectOption(kind);
  await page.locator('#ogWorkQuery').fill(query);
};
const ids = page => page.evaluate(() => oggiWorkspace.records.map(r => r.kind + ':' + r.id));
const source = page => page.locator('[data-search-source="document"]');
const openSelectedDetails = async page => {
  const details = page.locator('#ogContextDetails');
  await details.waitFor({ state: 'visible' });
  assert.equal(await details.evaluate(node => node.open), false, 'Selected context starts collapsed');
  await details.locator(':scope > summary').click();
  assert.equal(await details.evaluate(node => node.open), true, 'The visible summary opens the selected record actions');
};

async function fresh(page) {
  await page.goto(base); await page.waitForFunction(() => oggiSegretaria.loaded);
  await page.evaluate(() => {
    window.searchIO = { pages: [], docs: [], pending: [], holdPage: false, holdDoc: false, failPage: false, failDoc: false };
    window.firebase = { firestore: { FieldPath: { documentId: () => '__name__' } } };
    const originalCollection = db.collection.bind(db);
    searchIO.rows = Array.from({ length: 201 }, (_, i) => ({
      id: 'archive-' + String(i).padStart(3, '0'),
      name: i === 200 ? 'Oltrecaricati dalla scansione' : 'Archivio scheda ' + i,
      ...(i === 200 ? { propertyId: 'house-before' } : {})
    }));
    // Only the Firestore SDK boundary changes: all readers/controllers above
    // it execute the production code, including limits, cursors and scope.
    db.collection = name => {
      if (name !== 'documents') return originalCollection(name);
      let afterId = null, limit = null, order = null;
      const snapshot = row => ({ id: row.id, exists: true, data: () => structuredClone(row) });
      const wait = type => new Promise(resolve => searchIO.pending.push({ type, resolve }));
      return {
        orderBy(field) { order = field; return this; },
        limit(value) { limit = value; return this; },
        startAfter(value) { afterId = value; return this; },
        async get(options) {
          searchIO.pages.push({ name, afterId, limit, order, options });
          if (searchIO.holdPage) await wait('page');
          if (searchIO.failPage) throw Error('Synthetic archive failure');
          return { docs: searchIO.rows.filter(row => !afterId || row.id > afterId).slice(0, limit).map(snapshot) };
        },
        doc(id) {
          return { async get(options) {
            searchIO.docs.push({ name, id, options });
            if (searchIO.holdDoc) await wait('doc');
            if (searchIO.failDoc) throw Error('Synthetic canonical failure');
            const row = searchIO.rows.find(row => row.id === id);
            return row ? snapshot({ ...row, name: 'Oltrecaricati canonico', canonical: true, ...searchIO.canonical }) : { exists: false, id };
          } };
        }
      };
    };
  });
}
async function openArchive(page, query = 'Oltrecaricati') {
  await search(page, query, 'document');
  await page.locator('details.ow-search-sources > summary').click();
}
async function completeArchive(page) {
  await openArchive(page);
  await source(page).click();
  await page.waitForFunction(() => document.querySelector('[data-search-source="document"]')?.textContent === 'Leggi i prossimi 200');
  await source(page).click();
  await page.waitForFunction(() => oggiWorkspace.records.some(row => row.id === 'archive-200'));
}

try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(4000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await fresh(page);
    await check(width + ' ricerca le 15 categorie e rende esplicito il tipo', async () => {
      await page.evaluate(() => {
        const rows = {
          clients: { name: 'Àncora CRM', phone: '+39 333 123 4567' }, properties: { name: 'Àncora casa' },
          users: { name: 'Àncora persona', role: 'tenant' }, contracts: { ref: 'Àncora contratto' },
          documents: { name: 'Àncora documento' }, maintenance: { title: 'Àncora manutenzione' },
          leads: { name: 'Àncora lead' }, tasks: { title: 'Àncora attività' }, deadlines: { title: 'Àncora scadenza' },
          payments: { month: 'Àncora pagamento' }, listings: { title: 'Àncora annuncio' },
          pfsClients: { name: 'Àncora PFS' }, pfsProperties: { name: 'Àncora casa PFS' },
          landlords: { name: 'Àncora proprietario' }, preAgreements: { ref: 'Àncora proposta' }
        };
        for (const [collection, row] of Object.entries(rows)) S[collection] = [{ id: 'record-' + collection, ...row }];
      });
      const expected = ['client', 'property', 'person', 'contract', 'document', 'maintenance', 'lead', 'task', 'deadline', 'payment', 'listing', 'pfsClient', 'pfsProperty', 'landlord', 'proposal'];
      assert.deepEqual((await page.locator('#ogWorkKind option').evaluateAll(nodes => nodes.map(node => node.value))).sort(), ['all', ...expected].sort());
      for (const kind of expected) {
        await search(page, 'ancora', kind);
        assert.equal(await page.locator('.ow-result').count(), 1, kind);
        assert.deepEqual(await page.evaluate(() => oggiWorkspace.records.map(row => row.kind)), [kind]);
        assert(await page.locator('.ow-result-kind').innerText(), kind + ' has a visible type');
      }
      assert.deepEqual(await page.evaluate(() => searchIO.pages), [], 'Typing never scans the archive');
      await search(page, '3331234567', 'client');
      assert.deepEqual(await ids(page), ['client:record-clients']);
      await search(page, 'ÀNCORA', 'client');
      assert.deepEqual(await ids(page), ['client:record-clients']);
    });
    await check(width + ' pagine da 12 raggiungono il 25esimo risultato e refresh conserva pagina/query', async () => {
      await page.evaluate(() => { S.clients = Array.from({ length: 25 }, (_, i) => ({ id: 'page-' + String(i).padStart(2, '0'), name: 'Paginazione ' + String(i).padStart(2, '0') })); });
      await search(page, 'Paginazione', 'client');
      const first = await ids(page);
      assert.equal(first.length, 12); assert.match(await page.locator('#ogWorkResults').innerText(), /1–12 di 25/);
      await page.getByRole('button', { name: 'Mostra altri risultati', exact: true }).click();
      const second = await ids(page);
      assert.equal(second.length, 12); assert(second.every(id => !first.includes(id)));
      await page.locator('#ogWorkQuery').focus();
      await page.evaluate(() => { S.clients.push({ id: 'page-25', name: 'Paginazione 25' }); oggiScheduleUpdate(); });
      await page.waitForFunction(() => document.getElementById('ogWorkResults').textContent.includes('13–24 di 26'));
      assert.deepEqual(await ids(page), second);
      assert.equal(await page.locator('#ogWorkQuery').inputValue(), 'Paginazione');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'ogWorkQuery');
      await page.getByRole('button', { name: 'Mostra altri risultati', exact: true }).click();
      assert.deepEqual(await ids(page), ['client:page-24', 'client:page-25']);
      await page.locator('.ow-result').first().click();
      assert.equal(await page.evaluate(() => oggiWorkspace.selected.id), 'page-24');
      await search(page, 'Paginazione 00', 'client');
      assert.deepEqual(await ids(page), ['client:page-00']);
      assert.equal(await page.getByRole('button', { name: 'Precedenti', exact: true }).count(), 0);
    });
    await check(width + ' header e selettore azioni condividono dati senza toccare la tendina', async () => {
      await page.evaluate(() => {
        const input = document.getElementById('globalSearch'); input.parentElement.hidden = false;
        input.value = 'Paginazione'; handleSearch(input.value, 'client');
        window.searchDropdown = document.getElementById('searchResults');
      });
      assert.equal(await page.locator('[data-search-index]').count(), 12);
      assert.deepEqual(await page.evaluate(() => BOOM_ACTIONS.findRecords('Paginazione', 'client', window).map(row => row.id)), Array.from({ length: 12 }, (_, i) => 'page-' + String(i).padStart(2, '0')));
      assert.equal(await page.evaluate(() => document.getElementById('searchResults') === searchDropdown), true);
      await page.locator('[data-search-more]').click();
      assert.match(await page.locator('#searchResults').innerText(), /13–24 di 26/);
      await page.locator('[data-search-prev]').click();
      assert.match(await page.locator('#searchResults').innerText(), /1–12 di 26/);
      await page.locator('[data-search-home]').click();
      assert.equal(await page.locator('#ogWorkQuery').inputValue(), 'Paginazione');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'ogWorkQuery');
    });
    await check(width + ' omonimi restano separati; lead e cliente PFS aprono il loro percorso', async () => {
      await page.evaluate(() => {
        S.clients = [{ id: 'same-crm', name: 'Omonimo Unico' }];
        S.users = [{ id: 'same-person', name: 'Omonimo Unico', role: 'tenant' }];
        S.leads = [{ id: 'same-lead', name: 'Omonimo Unico' }];
        S.pfsClients = [{ id: 'same-pfs', name: 'Omonimo Unico' }];
        S.conversations = [{ id: 'wrong-name', contactType: 'client', contactId: 'other-id', contactName: 'Omonimo Unico' }, { id: 'right-lead', contactType: 'lead', contactId: 'same-lead', contactName: 'Omonimo Unico' }];
      });
      await search(page, 'Omonimo Unico');
      assert.deepEqual((await ids(page)).sort(), ['client:same-crm', 'person:same-person', 'lead:same-lead', 'pfsClient:same-pfs'].sort());
      await search(page, 'Omonimo Unico', 'person'); await page.locator('.ow-result').click();
      assert.deepEqual(await page.evaluate(() => oggiWorkspace.related), []);
      assert.equal(await page.locator('[aria-label="Conversazioni collegate"]').count(), 0);
      await search(page, 'Omonimo Unico', 'lead'); await page.locator('.ow-result').click();
      await openSelectedDetails(page);
      await page.getByRole('button', { name: 'Apri scheda ↗', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['viewLead', 'same-lead']);
      const before = await page.evaluate(() => testIO.actions.length);
      await page.evaluate(() => document.body.classList.add('modal-open'));
      await page.locator('[aria-label="Conversazioni collegate"] button').evaluate(button => button.click());
      assert.equal(await page.evaluate(() => testIO.actions.length), before, 'No navigation under an open modal');
      await page.evaluate(() => document.body.classList.remove('modal-open'));
      await page.locator('[aria-label="Conversazioni collegate"] button').click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.slice(-2)), [['goTo', 'inbox'], ['inboxSelect', 'right-lead']]);
      await search(page, 'Omonimo Unico', 'pfsClient'); await page.locator('.ow-result').click();
      await openSelectedDetails(page);
      await page.getByRole('button', { name: 'Apri scheda ↗', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['openPFSClientDetail', 'same-pfs']);
      await page.evaluate(() => { document.getElementById('toasts').replaceChildren(); handleSearch('Omonimo Unico', 'lead'); });
      await page.locator('[data-search-index]').click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['viewLead', 'same-lead']);
      await page.evaluate(() => { document.getElementById('toasts').replaceChildren(); handleSearch('Omonimo Unico', 'person'); });
      await page.locator('[data-search-index]').click();
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['viewUser', 'same-person']);
      assert.match(portalSource, /function viewUser\(id\)/, 'Person route exists in production');
      await page.evaluate(async () => {
        S.preAgreements = [{id:'exact-proposal',ref:'BOOM-PROVA/15',tenant:{fullName:'Cliente prova'}}];
        await portalSearchOpen(portalSearchRecords('BOOM-PROVA/15','proposal').records[0]);
      });
      assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['open','/pre-agreement-admin#q=BOOM-PROVA%2F15','_blank','noopener']);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => [testIO.writes, testIO.demoWrites, testIO.responses]), [[], [], []]);
    });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  page.setDefaultTimeout(4000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await fresh(page);
  await check('archivio solo su richiesta, pagine server da 200 e doppio click senza letture duplicate', async () => {
    await openArchive(page);
    assert.equal(await page.evaluate(() => searchIO.pages.length), 0);
    assert.match(await page.locator('#ogSearchSources').innerText(), /Completezza non verificata/);
    await page.evaluate(() => { searchIO.holdPage = true; });
    await source(page).dblclick();
    await page.waitForFunction(() => searchIO.pending.length === 1);
    assert.equal(await page.evaluate(() => searchIO.pages.length), 1);
    await page.waitForFunction(() => document.querySelector('[data-search-source="document"]')?.disabled);
    assert(await source(page).isDisabled());
    await page.evaluate(() => { searchIO.holdPage = false; searchIO.pending.shift().resolve(); });
    await page.waitForFunction(() => document.querySelector('[data-search-source="document"]').textContent === 'Leggi i prossimi 200');
    assert.equal(await page.locator('.ow-result').count(), 0);
    assert.match(await page.locator('#ogSearchSources').innerText(), /200 record letti dal database · archivio ancora parziale/);
    await source(page).click();
    await page.waitForFunction(() => oggiWorkspace.records.length === 1);
    assert.deepEqual(await ids(page), ['document:archive-200']);
    assert.deepEqual(await page.evaluate(() => searchIO.pages), [
      { name: 'documents', afterId: null, limit: 200, order: '__name__', options: { source: 'server' } },
      { name: 'documents', afterId: 'archive-199', limit: 200, order: '__name__', options: { source: 'server' } }
    ]);
    assert.match(await page.locator('#ogSearchSources').innerText(), /Scansione terminata/);
    assert(await source(page).isDisabled());
    assert.equal(await page.evaluate(() => S.documents.length), 0, 'Scanning does not hydrate stale rows into S');
    await page.evaluate(() => {
      // Same archived ID, changed saved relationship: the canonical row must
      // replace the projection in search and context, not merely its title.
      S.properties = [{ id: 'house-before', name: 'Casa Prima' }, { id: 'house-now', name: 'Casa Corrente' }];
      searchIO.canonical = { propertyId: 'house-now' };
      searchIO.holdDoc = true;
    });
    await page.locator('.ow-result').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => searchIO.pending.length === 1);
    assert.equal(await page.evaluate(() => searchIO.docs.length), 1);
    assert.equal(await page.locator('.ow-selection').count(), 0);
    await page.evaluate(() => { searchIO.holdDoc = false; searchIO.pending.shift().resolve(); });
    await page.waitForSelector('.ow-selection');
    assert.equal(await page.locator('#ogContextDetails > summary strong').innerText(), 'Oltrecaricati canonico');
    assert.equal(await page.evaluate(() => S.documents.find(row => row.id === 'archive-200').canonical), true);
    assert.deepEqual(await page.evaluate(() => oggiWorkspace.related.map(row => row.kind + ':' + row.id)), ['property:house-now']);
    assert.equal(await page.evaluate(() => portalSearchRecords('Casa Corrente', 'document').records[0]?.id), 'archive-200');
    assert.equal(await page.evaluate(() => portalSearchRecords('Casa Prima', 'document').total), 0);
    await openSelectedDetails(page);
    await page.getByRole('button', { name: 'Apri scheda ↗', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => testIO.actions.at(-1)), ['viewArchiveDoc', 'archive-200']);
    assert((await page.evaluate(() => searchIO.docs)).every(read => read.id === 'archive-200' && read.options.source === 'server'));
  });
  await fresh(page);
  await check('record aggiornato prevale sulla pagina archivio e sulla copia canonica precedente', async () => {
    await completeArchive(page);
    await page.locator('.ow-result').click();
    await page.waitForSelector('.ow-selection');
    await page.evaluate(() => {
      S.properties = [{id:'new-house', name:'Casa aggiornata'}];
      S.documents = [{id:'archive-200', name:'Documento aggiornato', propertyId:'new-house'}];
    });
    assert.equal(await page.evaluate(() => portalSearchRecords('Documento aggiornato', 'document').records[0]?.id), 'archive-200');
    assert.equal(await page.evaluate(() => portalSearchRecords('Casa aggiornata', 'document').records[0]?.id), 'archive-200');
    assert.equal(await page.evaluate(() => portalSearchRecords('Oltrecaricati', 'document').total), 0);
  });
  await fresh(page);
  await check('lettura canonica in ritardo non annulla il record appena aggiornato', async () => {
    await completeArchive(page);
    await page.evaluate(() => { searchIO.holdDoc = true; });
    await page.locator('.ow-result').click();
    await page.waitForFunction(() => searchIO.pending.length === 1);
    await page.evaluate(async () => {
      const pending = [...portalSearchCache.hydration.values()];
      S.documents = [{id:'archive-200', name:'Documento ricevuto ora'}];
      searchIO.holdDoc = false; searchIO.pending.shift().resolve(); await Promise.all(pending);
    });
    assert.equal(await page.evaluate(() => S.documents[0].name), 'Documento ricevuto ora');
    assert.equal(await page.evaluate(() => portalSearchRecords('ricevuto ora', 'document').records[0]?.id), 'archive-200');
    assert.equal(await page.evaluate(() => portalSearchRecords('Oltrecaricati', 'document').total), 0);
  });
  await fresh(page);
  await check('eliminazione canonica toglie anche la vecchia copia caricata', async () => {
    await completeArchive(page);
    await page.locator('.ow-result').click();
    await page.waitForSelector('.ow-selection');
    await page.evaluate(async () => {
      searchIO.rows = [];
      const record = portalSearchRecords('Oltrecaricati', 'document').records[0];
      await portalSearchEnsure(record);
    });
    assert.equal(await page.evaluate(() => S.documents.some(row => row.id === 'archive-200')), false);
    assert.equal(await page.evaluate(() => portalSearchRecords('Oltrecaricati', 'document').total), 0);
    await page.evaluate(() => { S.documents = [{id:'archive-200',name:'Documento ripristinato'}]; });
    assert.equal(await page.evaluate(() => portalSearchRecords('ripristinato','document').records[0]?.id), 'archive-200');
  });
  await fresh(page);
  await check('errore archivio conserva i risultati e il cursore; Riprova non dichiara completezza', async () => {
    await openArchive(page, 'Archivio'); await source(page).click();
    await page.waitForFunction(() => oggiWorkspace.records.length === 12);
    const before = await ids(page);
    await page.evaluate(() => { searchIO.failPage = true; }); await source(page).click();
    await page.waitForFunction(() => document.querySelector('[data-search-source="document"]').textContent === 'Riprova');
    assert.deepEqual(await ids(page), before);
    assert.match(await page.locator('#ogSearchSources').innerText(), /Lettura non riuscita · dati precedenti conservati/);
    assert.doesNotMatch(await page.locator('#ogSearchSources').innerText(), /Scansione terminata/);
    assert.doesNotMatch(await page.locator('#ogWorkResults').innerText(), /Nessun risultato/);
    await page.evaluate(() => { searchIO.failPage = false; }); await source(page).click();
    await page.waitForFunction(() => document.querySelector('[data-search-source="document"]').disabled);
    await page.waitForFunction(() => searchIO.pages.length === 3 && !portalSearchReader().state('document').error);
    assert.deepEqual(await page.evaluate(() => searchIO.pages.map(read => read.afterId)), [null, 'archive-199', 'archive-199']);
  });
  await fresh(page);
  await check('errore canonico e record eliminato non aprono una scheda ricavata dalla scansione', async () => {
    await completeArchive(page);
    await page.evaluate(() => { searchIO.failDoc = true; }); await page.locator('.ow-result').click();
    await page.waitForFunction(() => testIO.actions.some(action => action[0] === 'toast'));
    assert.match(await page.evaluate(() => testIO.actions.at(-1).join(' ')), /Impossibile verificare/);
    assert.equal(await page.locator('.ow-selection').count(), 0);
    assert.equal(await page.evaluate(() => S.documents.length), 0);
    await page.evaluate(() => { searchIO.failDoc = false; searchIO.rows = []; }); await page.locator('.ow-result').click();
    await page.waitForFunction(() => testIO.actions.some(action => String(action[2]).includes('non è più disponibile')));
    assert.equal(await page.locator('.ow-selection').count(), 0);
    assert.equal(await page.evaluate(() => testIO.actions.filter(action => action[0] === 'viewArchiveDoc').length), 0);
    assert.equal(await page.locator('.ow-result').count(), 0, 'Deleted records disappear from the scanned projection');
  });
  await fresh(page);
  await check('ricominciare la scansione invalida anche la lettura canonica ancora sospesa', async () => {
    await completeArchive(page);
    await page.evaluate(() => { searchIO.holdDoc = true; }); await page.locator('.ow-result').click();
    await page.waitForFunction(() => searchIO.pending.length === 1);
    await page.evaluate(() => { window.pendingCanonical = [...portalSearchCache.hydration.values()]; });
    await page.locator('[data-search-reset]').click();
    await page.evaluate(async () => { searchIO.holdDoc = false; searchIO.pending.shift().resolve(); await Promise.all(pendingCanonical); });
    assert.equal(await page.evaluate(() => S.documents.length), 0);
    assert.equal(await page.locator('.ow-selection').count(), 0);
    assert.equal(await page.evaluate(() => portalSearchRecords('Oltrecaricati', 'document').total), 0);
  });
  for (const change of ['account', 'role']) {
    await fresh(page);
    await check(change + ': risposta archivio in ritardo non ripopola la ricerca', async () => {
      await openArchive(page, 'Archivio'); await page.evaluate(() => { searchIO.holdPage = true; }); await source(page).click();
      await page.waitForFunction(() => searchIO.pending.length === 1);
      await page.evaluate(change => {
        if (change === 'account') auth.currentUser = { uid: 'second-admin' }; else S.profile.role = 'tenant';
        searchIO.holdPage = false; searchIO.pending.shift().resolve();
      }, change);
      await page.waitForFunction(() => !portalSearchReader()?.state('document').rows.length);
      assert.equal(await page.evaluate(() => portalSearchRecords('Archivio', 'document').total), 0);
      assert.equal(await page.evaluate(() => S.documents.length), 0);
    });
    await fresh(page);
    await check(change + ': idratazione in ritardo non modifica S né apre il vecchio risultato', async () => {
      await completeArchive(page); await page.evaluate(() => { searchIO.holdDoc = true; }); await page.locator('.ow-result').click();
      await page.waitForFunction(() => searchIO.pending.length === 1);
      await page.evaluate(async change => {
        if (change === 'account') auth.currentUser = { uid: 'second-admin' }; else S.profile.role = 'tenant';
        const pending = [...portalSearchCache.hydration.values()];
        searchIO.holdDoc = false; searchIO.pending.shift().resolve(); await Promise.all(pending);
      }, change);
      assert.equal(await page.locator('.ow-selection').count(), 0);
      assert.equal(await page.evaluate(() => S.documents.length), 0);
      assert.equal(await page.evaluate(() => portalSearchRecords('Aurora').total), 0, 'Old loaded S is also inaccessible');
      assert.equal(await page.evaluate(() => testIO.actions.filter(action => action[0] !== 'toast').length), 0);
    });
  }
  await fresh(page);
  await check('Aggiorna i dati scarta scansione e copie canoniche prima di caricare i nuovi record', async () => {
    await completeArchive(page); await page.locator('.ow-result').click();
    await page.waitForSelector('.ow-selection');
    assert.equal(await page.locator('#ogContextDetails > summary strong').innerText(), 'Oltrecaricati canonico');
    assert.equal(await page.evaluate(() => portalSearchRecords('Archivio', 'document').total), 200);
    await page.addScriptTag({ content: sessionHelpers(portalSource) });
    await page.evaluate(async source => {
      window.refreshReads = [];
      localStorage.setItem('boom_data_cache', 'synthetic stale cache');
      // Execute the actual refresh handler, binding its network load boundary
      // and the harness's real home renderer. The reset helper is unchanged.
      const refresh = new Function('loadDataFresh', 'renderPage', 'toast', 'return (' + source + ')')(
        async silent => {
          refreshReads.push({ silent, archived: portalSearchReader().state('document').rows.length, canonical: portalSearchCache.canonical.size });
          S.documents = [{ id: 'archive-200', name: 'Documento aggiornato dal server' }];
          return { ok: true };
        }, renderPreview, toast
      );
      await refresh();
    }, refreshSource);
    assert.deepEqual(await page.evaluate(() => refreshReads), [{ silent: false, archived: 0, canonical: 0 }]);
    assert.equal(await page.evaluate(() => localStorage.getItem('boom_data_cache')), 'synthetic stale cache', 'The refresh handler retains the prior cache until its loader commits a verified replacement');
    await page.waitForFunction(() => document.querySelector('#ogContextDetails > summary strong')?.textContent === 'Documento aggiornato dal server');
    assert.equal(await page.evaluate(() => portalSearchRecords('Archivio', 'document').total), 0);
    assert.equal(await page.evaluate(() => portalSearchRecords('Oltrecaricati', 'document').total), 0);
    assert.deepEqual(await page.evaluate(() => portalSearchRecords('aggiornato dal server', 'document').records.map(row => row.id)), ['archive-200']);
    assert.equal(await page.evaluate(() => searchIO.pages.length), 2, 'Refresh does not restart an archive scan implicitly');
  });
  await fresh(page);
  await check('header tenant conserva i propri record e ignora dati admin rimasti in memoria', async () => {
    await page.evaluate(() => {
      S.profile.role = 'tenant';
      S.users.push({ id: auth.currentUser.uid, role: 'tenant', name: 'Persona Riservata' });
      S.properties.push({ id: 'own-house', name: 'Casa Riservata' });
      S.contracts.push({ id: 'own-contract', propertyId: 'own-house', tenantId: auth.currentUser.uid });
      S.documents.push({ id: 'own-doc', userId: auth.currentUser.uid, name: 'Documento Riservato' }, { id: 'foreign-doc', userId: 'p-demo', name: 'Documento Estraneo' });
      const input = document.getElementById('globalSearch'); input.parentElement.hidden = false;
      handleSearch('Riservat');
    });
    assert.deepEqual(await page.evaluate(() => portalSearchRecords('Riservat').records.map(row => row.kind + ':' + row.id).sort()), ['contract:own-contract', 'document:own-doc', 'person:demo-admin', 'property:own-house']);
    assert.equal(await page.locator('[data-search-index]').count(), 4);
    assert.equal(await page.evaluate(() => portalSearchRecords('Aurora').total), 0);
    assert.equal(await page.evaluate(() => portalSearchRecords('Estraneo').total), 0);
    await page.evaluate(async () => { await portalSearchExtend('document'); });
    assert.equal(await page.evaluate(() => searchIO.pages.length), 0, 'Tenant header cannot trigger admin archive scans');
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => [testIO.writes, testIO.demoWrites, testIO.responses]), [[], [], []]);
  console.log(checks + ' passed — ricerca e archivio, nessuna scrittura o invio.');
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
