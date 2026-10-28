// Real guide DOM/controllers, with only Skyline's map/catalogue boundary faked.
// Regressions: budget 0 became 1500; empty scope became all homes; a failed
// catalogue looked like no matches; async journey data discarded keyboard focus.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = ['js/flight-engine.js', 'js/skyline-guide-engine.js',
  'js/stay-engine.js', 'js/listing-facts.js', 'js/dispo-engine.js',
  'assets/boom-skyline-guide.js'];
const files = new Map(assets.map(p => ['/' + p, readFileSync(root + p, 'utf8')]));
const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
<body><div class="sky-flight-tools"></div><script>
  window.BOOM_MAPPA={METE:[{slug:'colosseo',nome:'Colosseum',lat:41.89,lng:12.49}]};
  window.__guideTest={budget:0,scope:null,status:'ready',homes:[
    {id:'room',name:'Test room',type:'Room',price:1200,sqm:25,bedrooms:1,status:'available'},
    {id:'unclear',name:'Test apartment',price:1300,sqm:70,bedrooms:2,status:'available'},
    {id:'unmapped',name:'Unmapped home',price:800,sqm:100,status:'available'}
  ]};
  var state=window.__guideTest;
  var pins=state.homes.slice(0,2).map(function(l){var e=document.createElement('div');e.__id=l.id;return {getElement:function(){return e;}};});
  window.BoomSkyline={
    catalogue:function(){return state.homes;},
    filter:function(){return {budget:state.budget,homesActive:state.scope!==null,homes:state.scope||[]};},
    state:function(){return {catalogueStatus:state.status};},markers:pins,
    journeyFor:function(){return {min:25,fonte:'stima',precision:'zone',origin:{lat:41.9,lng:12.5},destination:{lat:41.89,lng:12.49}};},
    setBudget:function(n){state.budget=n;},selectPublicPlace:function(){return true;},select:function(){return true;}
  };
  localStorage.setItem('boom:pois',JSON.stringify([{name:'Private office',lat:51.509,lng:-0.12}]));
</script>${assets.map(p => '<script src="/' + p + '"></script>').join('')}</body></html>`;

console.log('\n▸ flightguideui  Skyline guidance in a real browser, without API or tiles');
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright unavailable — browser guidance checks did not run');
  process.exit(0);
}
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture);
  } else if (files.has(pathname)) {
    res.setHeader('Content-Type', 'text/javascript'); res.end(files.get(pathname));
  } else { res.statusCode = 404; res.end(); }
});
await new Promise((resolve, reject) => {
  server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
});
const origin = 'http://127.0.0.1:' + server.address().port;
let browser, pass = 0, fail = 0;
try {
  browser = await chromium.launch(await launchOptions());
  const page = await browser.newPage({ viewport:{width:390,height:844} });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin + '/')
    ? route.continue() : route.abort());
  async function check(name, fn) {
    try {
      errors.length = 0;
      await page.goto(origin + '/?stay=6', {waitUntil:'load'});
      await page.locator('#skyGuideOpen').click();
      await fn();
      assert.deepEqual(errors, [], 'no uncaught browser errors');
      pass++; console.log('  ✓ ' + name);
    } catch (error) { fail++; console.log('  ✗ ' + name + ' — ' + error.message.split('\n')[0]); }
  }
  const refresh = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('boom:skyline-journeys')));

  await check('budget zero remains every budget, including after closing and reopening', async () => {
    assert.equal(await page.locator('#skyGuideBudget').inputValue(), '0');
    await page.locator('#skyGuideBudget').selectOption('1500');
    await page.locator('#skyGuideBudget').selectOption('0');
    await page.locator('#skyGuideClose').click();
    await page.locator('#skyGuideOpen').click();
    assert.equal(await page.locator('#skyGuideBudget').inputValue(), '0');
  });
  await check('only mapped homes appear; room type is explicit and unknown type stays unknown', async () => {
    assert.equal(await page.locator('.sky-guide-card').count(), 2);
    assert.equal(await page.getByRole('heading', {name:'Unmapped home'}).count(), 0);
    const types = await page.locator('.sky-guide-card').evaluateAll(cards => cards.map(card =>
      [...card.querySelectorAll('dl>div')].find(row => row.querySelector('dt').textContent === 'Type as listed').querySelector('dd').textContent));
    assert.deepEqual(types, ['Room', 'To confirm']);
  });
  await check('an explicit shortlist stays scoped, including a zero-result shortlist', async () => {
    await page.evaluate(() => { window.__guideTest.scope = ['unclear']; }); await refresh();
    assert.equal(await page.locator('.sky-guide-card').count(), 1);
    assert.equal(await page.locator('.sky-guide-card h3').innerText(), 'Test apartment');
    await page.evaluate(() => { window.__guideTest.scope = []; }); await refresh();
    assert.equal(await page.locator('.sky-guide-card').count(), 0);
    assert.match(await page.locator('#skyGuideSummary').innerText(), /^0 mapped homes/);
  });
  await check('async journey updates preserve the focused home action', async () => {
    await page.locator('[data-guide-home="room"]').focus(); await refresh();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.guideHome), 'room');
    await page.evaluate(() => { window.__guideTest.scope = ['unclear']; }); await refresh();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'skyGuideSummary');
  });
  await check('catalogue failure is an error, never a zero-budget-match claim', async () => {
    await page.evaluate(() => {
      window.__guideTest.status = 'error'; window.__guideTest.homes = [];
      window.dispatchEvent(new CustomEvent('boom:skyline-state'));
    });
    assert.match(await page.locator('#skyGuideResults').innerText(), /catalogue could not be loaded/i);
    assert.doesNotMatch(await page.locator('#skyGuideResults').innerText(), /no currently offered homes/i);
    assert.equal(await page.getByRole('link', {name:'Open apartment list ↗'}).getAttribute('href'), '/apartments?stay=6');
  });
  await check('detail links keep requested stay; route links contain only the public journey', async () => {
    assert.equal(await page.locator('.sky-guide-actions a').first().getAttribute('href'), '/listing/room?stay=6');
    const href = await page.locator('a[href^="https://www.google.com/maps/dir/"]').first().getAttribute('href');
    const url = new URL(href);
    assert.equal(url.searchParams.get('origin'), '41.9,12.5');
    assert.equal(url.searchParams.get('destination'), '41.89,12.49');
    assert.doesNotMatch(href, /Private|51\.509|-0\.12/);
  });
  await check('Escape closes the native modal and restores focus to its opener', async () => {
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#skyGuide').evaluate(dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'skyGuideOpen');
  });
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
