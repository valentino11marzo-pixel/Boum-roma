// The real Skyline page inside a real clipped iframe. Only remote services are
// unavailable: preview controls, visibility, restore and navigation remain real.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const chromium = await loadChromium();
console.log('\n▸ mappapreview  Skyline visible-on-demand, compact controls and safe recovery');
if (!chromium) { console.log('  SKIP: playwright unavailable — preview browser checks did not run'); process.exit(0); }
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/host') {
    res.setHeader('content-type', 'text/html');
    return res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skyline visibility boundary</title><style>body{margin:0}iframe{display:block;margin:1800px auto 600px;width:calc(100% - 32px);height:360px;border:0}</style><h1>Before the map</h1><iframe title="Skyline preview" src="/skyline?embed=1&preview=1"></iframe></html>');
  }
  if (url.pathname === '/api/listings') {
    res.setHeader('content-type', 'application/json'); return res.end('{"listings":[]}');
  }
  const pathname = url.pathname === '/skyline' ? '/skyline.html' : url.pathname;
  if (pathname.includes('..')) { res.statusCode=400; return res.end(); }
  try {
    const data = await readFile(root + pathname.slice(1));
    res.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch { res.statusCode=404; res.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = 'http://127.0.0.1:' + server.address().port;
let browser, passed=0, failed=0;
try {
  browser = await chromium.launch(await launchOptions());
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[], requests=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/*', route => {
    const request=route.request(), url=request.url(); requests.push(url);
    if(request.method()!=='GET') return route.abort();
    return url.startsWith(origin+'/') ? route.continue() : route.abort();
  });
  const counts=()=>({catalogue:requests.filter(url=>new URL(url).pathname==='/api/listings').length,engine:requests.filter(url=>/maplibre-gl.*\.js$/.test(url)).length});
  async function check(name, fn) {
    try { await fn(); assert.deepEqual(errors,[], 'no uncaught browser errors'); passed++;console.log('  ✓ '+name); }
    catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}
  }

  await check('offscreen iframe does not start the catalogue or map engine',async()=>{
    await page.goto(origin+'/host?stay=6&moveIn=2027-01-31&moveOut=2027-07-31',{waitUntil:'load'});
    await page.waitForTimeout(1100);
    assert.deepEqual(counts(),{catalogue:0,engine:0});
  });
  let frame;
  await check('entering the viewport starts each request once and exposes a useful map error',async()=>{
    await page.locator('iframe').scrollIntoViewIfNeeded();
    frame=page.frames().find(candidate=>candidate.url().includes('/skyline?'));
    await frame.waitForFunction(()=>window.BoomSkylineState?.mapStatus==='error');
    assert.deepEqual(counts(),{catalogue:1,engine:1});
    assert.equal(await frame.locator('#skyLoadRetry').isVisible(),true);
    assert.equal(await frame.locator('.sky-load-list').isVisible(),true);
    assert.equal(await frame.locator('#quad').isVisible(),false);
  });
  await check('390px preview exposes only 2D, 3D and Expand, with no sideways overflow',async()=>{
    const state=await frame.evaluate(()=>({
      preview:document.documentElement.classList.contains('sky-preview'),
      tools:[...document.querySelectorAll('.sky-flight-tools button,.sky-flight-tools a')].filter(node=>node.getClientRects().length).map(node=>node.textContent.trim()),
      overflow:document.documentElement.scrollWidth>innerWidth,
      sizes:[...document.querySelectorAll('#sky2d,#sky3d,.sky-preview-expand')].map(node=>node.getBoundingClientRect().height)
    }));
    assert.equal(state.preview,true); assert.deepEqual(state.tools,['2D','3D','Expand ↗']);
    assert.equal(state.overflow,false); assert.ok(state.sizes.every(height=>height>=44));
    await frame.locator('.sky-preview-expand').focus();
    assert.equal(await frame.evaluate(()=>document.activeElement.className),'sky-preview-expand');
  });
  await check('Expand retains requested dates from the host and opens the full local Skyline',async()=>{
    const link=frame.locator('.sky-preview-expand');
    await link.dispatchEvent('pointerdown');
    const href=new URL(await link.getAttribute('href'),origin);
    assert.equal(href.origin,origin);assert.equal(href.pathname,'/skyline');
    assert.equal(href.searchParams.get('stay'),'6');assert.equal(href.searchParams.get('moveIn'),'2027-01-31');assert.equal(href.searchParams.get('moveOut'),'2027-07-31');
    assert.equal(href.searchParams.has('embed'),false);assert.equal(await link.getAttribute('target'),'_top');
  });
  await check('scroll away/back and a persisted lifecycle reuse the same frame without duplicate requests',async()=>{
    await frame.evaluate(()=>window.__previewIdentity='same-frame');
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
    await frame.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.locator('iframe').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
    assert.equal(await frame.evaluate(()=>window.__previewIdentity),'same-frame');
    assert.deepEqual(counts(),{catalogue:1,engine:1});
  });
  await check('guide deep links bypass minimal preview and keep the actual guidance dialog',async()=>{
    await page.goto(origin+'/skyline?embed=1&preview=1&guide=1',{waitUntil:'load'});
    await page.locator('#skyGuideOpen').click();
    await page.locator('#skyGuide').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('sky-preview')),false);
    assert.equal(await page.locator('#skyGuideOpen').isVisible(),true);
  });
  await check('the Apartments embed retains its full toolset and accessible fallback directory',async()=>{
    await page.goto(origin+'/skyline?embed=1',{waitUntil:'load'});
    await page.waitForFunction(()=>window.BoomSkylineState?.mapStatus==='error');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('sky-preview')),false);
    assert.equal(await page.locator('#skyCompare').isVisible(),true);
    assert.equal(await page.locator('#quad').isVisible(),true);
    assert.equal(await page.locator('.sky-preview-expand').isVisible(),false);
  });
  await page.close();
} finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
console.log(`Skyline preview: ${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
