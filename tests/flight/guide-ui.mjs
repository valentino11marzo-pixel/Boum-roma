// Real guide DOM/controllers, with only Skyline's map/catalogue boundary faked.
// Regressions: budget 0 became 1500; empty scope became all homes; a failed
// catalogue looked like no matches; async journey data discarded keyboard focus.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = ['js/mappa-engine.js','js/flight-engine.js', 'js/skyline-guide-engine.js',
  'js/stay-engine.js', 'js/listing-facts.js', 'js/dispo-engine.js',
  'assets/boom-skyline-guide.js'];
const files = new Map([...assets,'assets/boom-your-rome.js','assets/boom-your-rome.css','assets/boom-flight.js','assets/boom-flight.css','js/boom-consent.js'].map(p => ['/' + p, readFileSync(root + p, 'utf8')]));
files.set('/your-rome',readFileSync(root+'your-rome.html','utf8'));
const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
<body><div class="sky-flight-tools"></div><script>
  window.BOOM_MAPPA={METE:[{slug:'colosseo',nome:'Colosseum',lat:41.89,lng:12.49}]};
  window.__guideTest={budget:0,scope:null,status:'ready',homes:[
    {id:'room',name:'Test room',type:'Room',price:1200,sqm:25,bedrooms:1,status:'available'},
    {id:'unclear',name:'Test apartment',price:1300,sqm:70,bedrooms:2,status:'available'},
    {id:'unmapped',name:'Unmapped home',price:800,sqm:100,status:'available'}
  ]};
  var state=window.__guideTest;
  var pins=state.homes.slice(0,2).map(function(l){var e=document.createElement('div');e.__id=l.id;e.__co=[12.5,41.9];return {getElement:function(){return e;}};});
  window.BoomSkyline={
    catalogue:function(){return state.homes;},
    filter:function(){return {budget:state.budget,homesActive:state.scope!==null,homes:state.scope||[]};},
    state:function(){return {catalogueStatus:state.status};},markers:pins,
    journeyFor:function(id,slug){if(slug==='rufa-ostiense')return null;return {min:25,fonte:'stima',precision:'zone',origin:{lat:41.9,lng:12.5},destination:{lat:41.89,lng:12.49}};},
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
  if(pathname==='/skyline'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Skyline navigation boundary</title><style>@view-transition{navigation:auto}</style><script src="/assets/boom-flight.js"></script><h1>Skyline</h1>');}
  else if(pathname==='/property-finding'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Service navigation boundary</title><h1>Property finding</h1>');}
  else if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture);
  } else if (files.has(pathname)) {
    res.setHeader('Content-Type', pathname==='/your-rome'?'text/html; charset=utf-8':pathname.endsWith('.css')?'text/css':'text/javascript'); res.end(files.get(pathname));
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
  await check('address-only campus keeps options and labels missing journey estimates', async () => {
    await page.locator('#skyGuidePlace').selectOption('rufa-ostiense');
    await page.locator('#skyGuidePriority').selectOption('commute');
    assert.equal(await page.locator('.sky-guide-card').count(), 2);
    assert.match(await page.locator('#skyGuideSummary').innerText(), /Journey estimates unavailable.*ordered by rent/);
    assert.match(await page.locator('#skyGuideDestination').innerText(), /Via Giuseppe Libetta 7/);
    assert.doesNotMatch(await page.locator('.sky-guide-trip').first().innerText(), /≈\d+ min/);
    const link=new URL(await page.locator('a[href^="https://www.google.com/maps/dir/"]').first().getAttribute('href'));
    assert.equal(link.searchParams.get('destination'),'Via Giuseppe Libetta 7, Rome');
  });
  await check('sharing keeps public preferences; shortlist and stay require explicit inclusion', async () => {
    await page.locator('#skyGuidePlace').selectOption('rufa-ostiense');
    await page.locator('#skyGuidePriority').selectOption('space');
    await page.locator('#skyGuideShare summary').click();
    let url=new URL(await page.locator('#skyGuideShareURL').inputValue());
    assert.equal(url.origin,'https://www.boomrome.com');assert.equal(url.searchParams.get('place'),'rufa-ostiense');
    assert.equal(url.searchParams.get('priority'),'space');assert.equal(url.searchParams.get('budget'),'0');
    assert.equal(url.searchParams.has('homes'),false);assert.equal(url.searchParams.has('stay'),false);
    await page.locator('#skyGuideShareHomes').check();await page.locator('#skyGuideShareStay').check();
    url=new URL(await page.locator('#skyGuideShareURL').inputValue());
    assert.equal(url.searchParams.get('homes'),'unclear,room');assert.equal(url.searchParams.get('stay'),'6');
    assert.doesNotMatch(url.href,/Private|51\.509|-0\.12/);
  });
  await check('Escape closes the native modal and restores focus to its opener', async () => {
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#skyGuide').evaluate(dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'skyGuideOpen');
  });
  async function checkLanding(name, fn) {
    try {
      errors.length=0;await page.goto(origin+'/your-rome',{waitUntil:'load'});await fn();
      assert.deepEqual(errors,[],'no uncaught landing browser errors');pass++;console.log('  ✓ '+name);
    } catch(error){fail++;console.log('  ✗ '+name+' — '+error.message.replaceAll('\n',' '));}
  }
  await checkLanding('Your Rome stays within a mobile viewport and uses the real campus catalogue',async()=>{
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#yrPlace').selectOption('luiss-parenzo');
    assert.match(await page.locator('#yrAddress').innerText(),/Via Parenzo 11/);
    assert.equal(await page.locator('#yourRomeForm input[name=email]').count(),0);
    assert.equal(await page.locator('iframe').count(),0);
  });
  await checkLanding('Date fields stay inside the planner on desktop and mobile',async()=>{
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      const bounds=await page.evaluate(()=>{const form=document.getElementById('yourRomeForm').getBoundingClientRect();return [...document.querySelectorAll('#yourRomeForm input[type=date]')].map(n=>{const box=n.getBoundingClientRect();return {inside:box.left>=form.left&&box.right<=form.right,width:box.width};});});
      assert.ok(bounds.every(b=>b.inside&&b.width>90),JSON.stringify(bounds));
    }
  });
  await checkLanding('Your Rome carries an irregular requested stay and public preferences to Skyline',async()=>{
    await page.locator('#yrPlace').selectOption('rufa-ostiense');await page.locator('[name=priority]').selectOption('space');
    await page.locator('#yrMoveIn').fill('2027-01-31');await page.locator('#yrMoveOut').fill('2027-05-14');
    await page.locator('.yr-launch').click();
    await page.waitForURL('**/skyline?**',{timeout:5000});
    const url=new URL(page.url());assert.equal(url.searchParams.get('moveIn'),'2027-01-31');assert.equal(url.searchParams.get('moveOut'),'2027-05-14');
    assert.equal(url.searchParams.has('stay'),false);assert.equal(url.searchParams.get('place'),'rufa-ostiense');assert.equal(url.searchParams.get('priority'),'space');
  });
  await checkLanding('An incomplete requested stay explains the missing date instead of navigating',async()=>{
    await page.locator('#yrMoveIn').fill('2027-01-31');await page.locator('.yr-launch').click();
    assert.equal(new URL(page.url()).pathname,'/your-rome');assert.match(await page.locator('#yrPlanStatus').innerText(),/departure date/i);
  });
  await checkLanding('Leaving Flight for a service without transition opt-in keeps native navigation error-free',async()=>{
    await page.evaluate(()=>{var a=document.createElement('a');a.href='/property-finding';a.id='serviceBoundary';a.textContent='Service';document.body.appendChild(a);});
    await page.locator('#serviceBoundary').click();await page.waitForURL('**/property-finding');
    assert.equal(await page.locator('h1').innerText(),'Property finding');
    await page.waitForTimeout(150);assert.deepEqual(errors,[]);
    await page.goto(origin+'/your-rome',{waitUntil:'load'});await page.waitForTimeout(150);
    assert.equal(await page.locator('#yourRomeForm').count(),1);
  });
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
