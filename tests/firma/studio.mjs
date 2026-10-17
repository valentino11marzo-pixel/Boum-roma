// The real existing-contract panel: progressive disclosure must not hide a
// mandate conflict or change whose signature link gets opened.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';
const src = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const from = src.indexOf('    async function openFirmaOra(contractId) {');
const to = src.indexOf('    window.openFirmaOra = openFirmaOra;', from);
assert(from > 0 && to > from);
const css = ['portal.css', 'portal-mobile.css'].map(n => readFileSync(new URL('../../css/' + n, import.meta.url), 'utf8')).join('\n');
const chromium = await loadChromium(); assert(chromium, 'Browser required');
const browser = await chromium.launch(launchOptions());
let checks = 0;
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.route('**/*', r => r.abort());
    await page.setContent('<style>' + css + '</style><div id="modals"></div>');
    await page.addScriptTag({ content: `
      const S={contracts:[{id:'contract-demo',propertyId:'property-demo',tenantId:'tenant-demo',tenantName:'Cliente demo'}],properties:[{id:'property-demo',name:'Appartamento demo',ownerId:'owner-demo'}],users:[{id:'owner-demo',name:'Proprietario demo'}]};
      const esc = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const calls=[]; function closeModal(){document.getElementById('modals').innerHTML='';}
      function toast(){throw new Error('unexpected toast');}
      function openShareHub(id){calls.push(['share',id]);}
      function boomOpen(url){calls.push(['open',url]);}
      async function fetchSignLinks(id){calls.push(['links',id]);return {tenant:'https://example.test/tenant',landlord:'https://example.test/landlord'};}
      ${src.slice(from,to)}
    ` });
    await page.evaluate(() => openFirmaOra('contract-demo'));
    assert.equal(await page.locator('.ms-deleghe').getAttribute('open'), null);
    assert(await page.getByText('Appartamento demo', { exact: true }).isVisible());
    assert(await page.getByRole('button', { name: 'Condividi i link', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Condividi i link', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['links','contract-demo'], ['share','contract-demo']]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks += 5;
    await page.evaluate(() => {
      S.contracts[0].tenantMandate={given:true,termsVersion:2,terms:{}};
      window.BOOM_MANDATO={diffTerms:()=>['rent'],termsFromContract:()=>({}),describeDiff:()=> 'canone'};
      return openFirmaOra('contract-demo');
    });
    assert.notEqual(await page.locator('.ms-deleghe').getAttribute('open'), null);
    assert(await page.getByText(/Il server rifiuterà la firma per mandato/).isVisible());
    checks += 2;
    await page.close();
  }
} finally { await browser.close(); }
console.log(checks + ' existing-contract browser checks passed');
