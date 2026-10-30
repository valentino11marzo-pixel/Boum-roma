// Real adapter and browser iframe lifecycle. Only Skyline's public API/message
// boundary is replaced: no catalogue, tiles, WebGL or external network required.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const original = readFileSync(new URL('../../assets/boom-flight-next-map.js', import.meta.url), 'utf8');
let source = original, generation = 0;
const parentHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#080a0e}[hidden]{display:none!important}.slot{height:300px;width:100%}</style></head><body>
<main><section id="home"><div id="a" class="slot"></div></section><section id="apartments" hidden><div id="b" class="slot"></div></section></main>
<script src="/adapter.js"></script><script>window.selected=[];window.states=[];addEventListener('boom-next:map-select',e=>selected.push(e.detail.id));addEventListener('boom-next:map-state',e=>states.push(e.detail));</script></body></html>`;
function skylineHTML(number) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>#skyHome{position:absolute;bottom:23px;right:12px;min-height:139px;padding:10px;width:350px;display:flex;background:#222;color:#fff}#skyHome[hidden]{display:none}.maplibregl-ctrl-attrib{position:absolute;bottom:5px;right:6px;color:#ddd}</style></head><body style="margin:0;height:100vh;background:#080a0e"><div id="map" style="height:100%"><button class="sky-pin" aria-label="Test home, approximate area">≈ €1,200</button></div><aside id="skyHome" hidden><button class="sky-home-close">Close home</button><div class="sky-home-media"><img src="/photo.svg" alt="Test home"></div><div class="sky-home-copy"><h2>Test home</h2><p id="skyHomePrecision">Approximate area · exact address to confirm</p><div class="sky-home-bottom"><span>€1,200</span><a href="/listing/home-1">Explore home</a></div></div></aside><div class="maplibregl-ctrl-attrib">© OpenStreetMap contributors</div><script>
  window.generation=${number};window.trace=[];window.intersections=[];window.actual={catalogueStatus:'loading',mapStatus:'loading',usable:false};window.scope=null;
  new IntersectionObserver(entries=>intersections.push(entries[0].isIntersecting)).observe(document.getElementById('map'));
  addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==parent)return;
    trace.push(e.data);
    if(e.data.t==='boomTieni')scope=e.data.ids;
    if(e.data.t==='boomSelect'&&(!scope||scope.includes(e.data.id))){document.getElementById('skyHome').hidden=false;parent.postMessage({t:'boomSelected',id:e.data.id},location.origin);}
  });
  window.release=()=>{
    actual={catalogueStatus:'ready',mapStatus:'style',usable:false};
    window.BoomSkyline={state:()=>({...actual}),setBudget:n=>trace.push({budget:n}),map:{resize:()=>trace.push({resize:true}),stop:()=>trace.push({stop:true})}};
    dispatchEvent(new CustomEvent('boom:skyline-ready',{detail:{api:BoomSkyline}}));
    dispatchEvent(new CustomEvent('boom:skyline-state',{detail:actual}));
  };
  window.paint=()=>{actual={catalogueStatus:'ready',mapStatus:'ready',usable:true};dispatchEvent(new CustomEvent('boom:skyline-state',{detail:actual}));parent.postMessage({t:'boomSkylineReady'},location.origin);};
  window.report=(patch)=>{Object.assign(actual,patch);dispatchEvent(new CustomEvent('boom:skyline-state',{detail:actual}));};
  </script></body></html>`;
}

console.log('\n▸ flightnextmap  Singleton Skyline bridge, security and browser lifecycle');
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright unavailable — iframe lifecycle checks did not run');
  process.exit(0);
}
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Type', pathname === '/adapter.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  if (pathname === '/adapter.js') res.end(source);
  else if (pathname === '/skyline') res.end(skylineHTML(++generation));
  else res.end(parentHTML);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = 'http://127.0.0.1:' + server.address().port;
let browser, passed = 0, failed = 0;
try {
  browser = await chromium.launch(await launchOptions());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  async function start(code = original) {
    source = code; errors.length = 0; requests.length = 0;
    await page.goto(origin + '/flight-next', { waitUntil: 'load' });
  }
  async function mount() {
    await page.evaluate(() => { window.originalFrame = BoomNextMap.mount(document.getElementById('a')); });
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow.release);
  }
  async function ready() {
    await page.evaluate(() => { originalFrame.contentWindow.release(); originalFrame.contentWindow.paint(); });
    await page.waitForFunction(() => BoomNextMap.state().status === 'ready');
  }
  async function check(name, fn) {
    try {
      await start(); await fn(); assert.deepEqual(errors, [], 'no uncaught browser errors');
      passed++; console.log('  ✓ ' + name);
    } catch (error) { failed++; console.log('  ✗ ' + name + ' — ' + error.message.split('\n')[0]); }
  }
  await check('mount requires a connected owned element and creates exactly one accessible Skyline frame', async () => {
    assert.equal(await page.evaluate(() => BoomNextMap.mount(document.createElement('div'))), null);
    await mount();
    assert.equal(await page.locator('iframe').count(), 1);
    assert.equal(await page.locator('iframe').getAttribute('src'), '/skyline?embed=1&preview=1');
    assert.match(await page.locator('iframe').getAttribute('title'), /Skyline.*Rome/);
    assert.equal(await page.evaluate(() => BoomNextMap.mount(document.getElementById('a')) === originalFrame), true);
    assert.equal(requests.filter(url => new URL(url).pathname === '/api/listings').length, 0, 'adapter never fetches a second catalogue');
  });
  await check('document load and API availability do not falsely claim the map has painted', async () => {
    await mount(); assert.equal(await page.evaluate(() => BoomNextMap.state().status), 'loading');
    await page.evaluate(() => originalFrame.contentWindow.release());
    assert.equal(await page.evaluate(() => BoomNextMap.state().status), 'loading');
    await page.evaluate(() => originalFrame.contentWindow.paint());
    await page.waitForFunction(() => BoomNextMap.state().status === 'ready');
    assert.equal(await page.locator('.boom-next-map-fallback').isVisible(), false);
  });
  await check('latest pre-ready preferences replay scope before selection; invalid input cannot become commands', async () => {
    const rejected = await page.evaluate(() => {
      BoomNextMap.scope(['old']); BoomNextMap.scope(['home-1', 'home-1', '../private']);
      BoomNextMap.setBudget(2000); BoomNextMap.setBudget(1500); BoomNextMap.select('home-1');
      return [BoomNextMap.scope(null), BoomNextMap.select('bad/id'), BoomNextMap.setBudget(-1), BoomNextMap.setBudget(Infinity)];
    });
    assert.deepEqual(rejected, [false, false, false, false]);
    await mount(); await ready();
    await page.waitForFunction(() => selected.includes('home-1'));
    const trace = await page.evaluate(() => originalFrame.contentWindow.trace);
    assert.deepEqual(trace.filter(item => item.t).slice(0, 2), [{ t: 'boomTieni', ids: ['home-1'] }, { t: 'boomSelect', id: 'home-1' }]);
    assert.deepEqual(trace.filter(item => 'budget' in item), [{ budget: 1500 }]);
  });
  await check('an empty result scope remains empty and cannot select a filtered-out home', async () => {
    await page.evaluate(() => { BoomNextMap.scope([]); BoomNextMap.select('home-1'); });
    await mount(); await ready();
    await page.waitForFunction(() => originalFrame.contentWindow.trace.some(item => item.t === 'boomSelect'));
    assert.deepEqual(await page.evaluate(() => originalFrame.contentWindow.scope), []);
    assert.deepEqual(await page.evaluate(() => selected), []);
    await page.evaluate(() => { BoomNextMap.scope(['home-1']); BoomNextMap.select('home-1'); });
    await page.waitForFunction(() => selected.includes('home-1'));
  });
  await check('only the owned iframe loses the duplicate home card; original precision, pins and attribution remain', async () => {
    await mount(); await ready();
    await page.evaluate(() => BoomNextMap.select('home-1'));
    await page.waitForFunction(() => selected.includes('home-1'));
    const child = page.frameLocator('iframe');
    assert.equal(await child.locator('#skyHome h2').isVisible(), false);
    assert.equal(await child.locator('.sky-home-media').isVisible(), false);
    assert.equal(await child.locator('.sky-home-bottom a').isVisible(), false);
    assert.equal(await child.locator('.sky-home-close').isVisible(), false);
    assert.equal(await child.locator('#skyHomePrecision').isVisible(), true);
    assert.match(await child.locator('#skyHomePrecision').innerText(), /^Approximate area/);
    assert.match(await child.locator('.sky-pin').innerText(), /^≈/);
    assert.match(await child.locator('.sky-pin').getAttribute('aria-label'), /approximate area/);
    assert.equal(await child.locator('.maplibregl-ctrl-attrib').isVisible(), true);
    const note = await child.locator('#skyHome').boundingBox();
    assert.ok(note.height <= 45, 'precision note must not cover the mobile map like a card');
    await page.evaluate(() => { originalFrame.contentWindow.paint(); originalFrame.contentWindow.paint(); });
    assert.equal(await child.locator('#boom-next-map-presentation').count(), 1, 'one owned style per frame document');
    const separate = await browser.newPage();
    try {
      await separate.goto(origin + '/skyline');
      await separate.evaluate(() => { document.getElementById('skyHome').hidden = false; });
      assert.equal(await separate.locator('#skyHome h2').isVisible(), true, 'standalone Skyline is unchanged');
      assert.equal(await separate.locator('#boom-next-map-presentation').count(), 0);
    } finally { await separate.close(); }
  });
  async function messageBoundary() {
    await mount(); await ready();
    await page.evaluate(() => {
      dispatchEvent(new MessageEvent('message', { origin: 'https://wrong-origin.example', source: originalFrame.contentWindow, data: { t: 'boomSelected', id: 'wrong-origin' } }));
      dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { t: 'boomSelected', id: 'wrong-source' } }));
      dispatchEvent(new MessageEvent('message', { origin: location.origin, source: originalFrame.contentWindow, data: { t: 'boomSelected', id: '../unsafe' } }));
    });
    assert.deepEqual(await page.evaluate(() => selected), [], 'untrusted events must not select a home');
    await page.frames().find(frame => new URL(frame.url()).pathname === '/skyline').evaluate(() => parent.postMessage({ t: 'boomSelected', id: 'home-2' }, location.origin));
    await page.waitForFunction(() => selected.length > 0);
    assert.deepEqual(await page.evaluate(() => selected), ['home-2']);
    assert.equal(new URL(page.url()).pathname, '/flight-next', 'selection does not navigate the parent');
  }
  await check('only this exact same-origin iframe may update the selected home, without navigation', messageBoundary);
  await check('Home → Apartments → Home keeps one browsing context when native state-preserving moves exist', async () => {
    await mount(); await ready();
    const before = generation;
    const supportsMove = await page.evaluate(() => typeof document.getElementById('b').moveBefore === 'function');
    if (!supportsMove) {
      console.log('    Native moveBefore unavailable; legacy lifecycle is checked separately.'); return;
    }
    await page.evaluate(() => {
      document.getElementById('apartments').hidden = false;
      BoomNextMap.mount(document.getElementById('b')); document.getElementById('home').hidden = true;
    });
    assert.equal(await page.evaluate(() => document.querySelector('iframe') === originalFrame), true);
    assert.equal(await page.evaluate(() => originalFrame.contentWindow.generation), before);
    await page.evaluate(() => {
      document.getElementById('home').hidden = false;
      BoomNextMap.mount(document.getElementById('a')); document.getElementById('apartments').hidden = true;
    });
    assert.equal(generation, before, 'moving a loaded map must not request another iframe');
    assert.equal(await page.evaluate(() => originalFrame.contentWindow.generation), before);
  });
  await check('hide → visible mount resumes the existing frame with real intersection and resize callbacks', async () => {
    await mount(); await ready();
    await page.waitForFunction(() => originalFrame.contentWindow.intersections.includes(true));
    await page.evaluate(() => BoomNextMap.hide());
    assert.equal(await page.locator('.boom-next-map-shell').isVisible(), false);
    await page.waitForFunction(() => originalFrame.contentWindow.intersections.at(-1) === false);
    const oldResizes = await page.evaluate(() => originalFrame.contentWindow.trace.filter(item => item.resize).length);
    await page.evaluate(() => { document.getElementById('home').hidden = false; BoomNextMap.mount(document.getElementById('a')); });
    await page.waitForFunction(count => originalFrame.contentWindow.trace.filter(item => item.resize).length > count, oldResizes);
    await page.waitForFunction(() => originalFrame.contentWindow.intersections.at(-1) === true);
    assert.equal(await page.locator('.boom-next-map-shell').isVisible(), true);
    assert.equal(await page.evaluate(() => originalFrame.contentWindow.trace.some(item => item.stop)), true);
  });
  await check('legacy reparenting reloads one frame and restores empty scope, budget and the latest selection', async () => {
    await mount(); await ready();
    await page.evaluate(() => { BoomNextMap.scope(['home-2']); BoomNextMap.setBudget(1700); BoomNextMap.select('home-2'); });
    await page.waitForFunction(() => selected.includes('home-2'));
    await page.evaluate(() => {
      BoomNextMap.scope([]); document.getElementById('apartments').hidden = false;
      document.getElementById('b').moveBefore = undefined; BoomNextMap.mount(document.getElementById('b'));
    });
    await page.waitForFunction(() => originalFrame.contentWindow.release && !originalFrame.contentWindow.BoomSkyline);
    assert.equal(await page.evaluate(() => BoomNextMap.state().status), 'loading');
    await ready();
    await page.waitForFunction(() => originalFrame.contentWindow.trace.some(item => item.t === 'boomSelect'));
    const trace = await page.evaluate(() => originalFrame.contentWindow.trace);
    assert.deepEqual(trace.filter(item => item.t).slice(0, 2), [{ t: 'boomTieni', ids: [] }, { t: 'boomSelect', id: 'home-2' }]);
    assert.deepEqual(trace.filter(item => 'budget' in item), [{ budget: 1700 }]);
    assert.equal(await page.locator('iframe').count(), 1);
  });
  await check('tile failure has usable navigation and recovery clears the fallback without a second frame', async () => {
    await mount(); await ready();
    await page.evaluate(() => originalFrame.contentWindow.report({ mapStatus: 'error', usable: false }));
    assert.equal(await page.evaluate(() => BoomNextMap.state().status), 'error');
    assert.equal(await page.locator('.boom-next-map-fallback').isVisible(), true);
    assert.match(await page.locator('.boom-next-map-fallback').innerText(), /could not load/);
    assert.equal(await page.locator('.boom-next-map-fallback a').first().getAttribute('href'), '/skyline');
    assert.equal(await page.locator('.boom-next-map-fallback a').last().getAttribute('href'), '/apartments');
    await page.evaluate(() => originalFrame.contentWindow.paint());
    assert.equal(await page.evaluate(() => BoomNextMap.state().status), 'ready');
    assert.equal(await page.locator('.boom-next-map-fallback').isVisible(), false);
    assert.equal(await page.locator('iframe').count(), 1);
  });
  await check('removing either message origin or source validation is caught by the same security contract', async () => {
    for (const guard of ['event.origin !== origin || ', 'event.source !== frame.contentWindow || ']) {
      assert.ok(original.includes(guard), 'mutation target must exist');
      await start(original.replace(guard, ''));
      await assert.rejects(messageBoundary, /untrusted events must not select a home/);
    }
    source = original;
  });
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
