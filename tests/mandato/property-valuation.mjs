// Real dossier button → adapter → valuation modal → HTTP handler.
// Only authentication, network and opening the external PDF are simulated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { html as dossierHTML, extract } from '../property-dossier/harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const app = read('js/portal-app.js'), dossier = read('js/property-dossier.js');
const start = app.indexOf('    async function openValutazione(');
const end = app.indexOf('    window.openValutazione =', start);
assert(start > 0 && end > start, 'Real valuation handler must be found');
const boot = "goTo(location.hash.slice(1)||'properties');";
assert(dossierHTML.includes(boot));
const html = dossierHTML.replace(boot, `
  S.contracts=[];
  S.properties=[{id:'prop1',name:"Ca' d'Oro",rent:1400},{id:'prop2',name:'Altro immobile',rent:900}];
  const auth={currentUser:{getIdToken:async()=> 'tok'}};
  window.openedDocuments=[];
  window.open=(...args)=>{openedDocuments.push(args);return null;};
  ${extract('askModal')}
  ${extract('toast')}
  ${app.slice(start, end)}
  goTo('property/prop1/overview');
`);

export async function verifyPropertyValuation(check, request) {
  const chromium = await loadChromium();
  assert(chromium, 'The property valuation path requires the browser used by propertyui');
  const browser = await chromium.launch(launchOptions({ headless: true }));
  async function flow({ documentHTML = html, dossierSource = dossier, verifyCancel = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 940 } });
    const page = await context.newPage(), calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://portal.test') return route.abort();
      if (url.pathname === '/portal') return route.fulfill({ contentType: 'text/html', body: documentHTML });
      if (url.pathname === '/api/fiscal/valutazione') {
        const body = route.request().postDataJSON();
        calls.push({ method: route.request().method(), body });
        const response = await request(body);
        return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) });
      }
      if (url.pathname === '/js/property-dossier.js') return route.fulfill({ contentType: 'text/javascript', body: dossierSource });
      if (/^\/(?:js|css)\/[\w.-]+$/.test(url.pathname))
        return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body: read(url.pathname.slice(1)) });
      return route.abort();
    });
    try {
      await page.goto('https://portal.test/portal');
      const button = page.getByRole('button', { name: 'Valutazione immobile', exact: true });
      assert.equal(await button.count(), 1, 'The actual property renderer must expose Valutazione');
      await button.click();
      assert.equal(await page.locator('#askModalInput').count(), 1, 'Click must reach the real valuation modal');
      assert.equal(await page.locator('#askModalInput').inputValue(), '1400', 'Seed must belong to the selected property');
      assert.equal(calls.length, 0, 'Opening the modal must not generate a document');
      if (verifyCancel) {
        await page.getByRole('button', { name: 'Annulla', exact: true }).click();
        assert.equal(await page.locator('#askModalInput').count(), 0);
        assert.equal(calls.length, 0, 'Cancellation must not reach the API');
        check('portal Valutazione: apertura e annullamento del modulo reale non generano documenti', true);
        await button.click();
      }
      await page.locator('#askModalInput').fill('1650');
      await page.getByRole('button', { name: 'Genera', exact: true }).click();
      await page.waitForFunction(() => openedDocuments.length === 1);
      assert.deepEqual(calls, [{ method: 'POST', body: { propertyId: 'prop1', canone: 1650 } }], 'Only the selected property, without a contract, must reach the real API');
      const result = await page.evaluate(() => ({ opened: openedDocuments[0], properties: testState.properties }));
      assert.equal(result.opened[0], result.properties[0].valutazioneBoomUrl);
      assert.equal(result.opened[1], '_blank');
      assert.equal(result.opened[2], 'noopener');
      assert.match(result.opened[0], /property-docs(?:%2F|\/)prop1(?:%2F|\/)valutazione-boom\.pdf/);
      assert.equal(result.properties[1].valutazioneBoomUrl, undefined);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  try {
    await flow({ verifyCancel: true });
    check('portal: Valutazione dal fascicolo reale → modulo → API con propertyId esatto, senza contratto → documento generato', true);
    const adapter = 'valuation: id => openValutazione(null, undefined, {propertyId:id})';
    assert(html.includes(adapter), 'Real adapter mutation target exists');
    await assert.rejects(flow({ documentHTML: html.replace(adapter, "valuation: id => openValutazione(null, undefined, {propertyId:'prop2'})") }), assert.AssertionError);
    check('MUTAZIONE Valutazione: un adapter che seleziona un altro immobile viene rilevato dal percorso reale', true);
    const action = 'adapter.actions.valuation(id);';
    assert(dossier.includes(action), 'Real delegated action mutation target exists');
    await assert.rejects(flow({ dossierSource: dossier.replace(action, 'void 0;') }), assert.AssertionError);
    check('MUTAZIONE Valutazione: un pulsante visibile ma scollegato dal handler viene rilevato', true);
  } finally { await browser.close(); }
}
