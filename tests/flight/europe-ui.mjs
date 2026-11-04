// The actual Europe/Club HTML, controllers, public desk manifest and shared engines.
// Only catalogue, rendering-heavy Skyline and selected config responses are fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flighteuropeui  Real city choices, currency boundaries and the original desk handoff');
if(!chromium){console.log('  SKIP: playwright unavailable — Europe browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-04-01',departure=year+'-10-01';
const manifestPath='/assets/boom-desks-public.json';
const homes=[['flat','bilocale',1400],['room','Room',900],['marketing','Premium Terrace',1800]].map(([id,type,price])=>({id:'fixture-'+id,name:'Fixture '+id,type,price,sqm:60,bedrooms:1,status:'available',availableDate:'Immediate',zone:'Prati',images:['/fixture-photo.svg']}));
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);return res.end('No application or payment writes');}
 // Deployment intentionally excludes city source data and its internal notes.
 if(pathname.startsWith('/cities/')){res.writeHead(404);return res.end();}
 if(pathname==='/fixture-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#49493e"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function open(width){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),errors=[],writes=[],missing=[],privateReads=[],network={config:route=>route.continue()};
 page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&new URL(r.url()).pathname!==manifestPath&&r.status()>=400)missing.push(r.url());});
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#101319;color:white">Skyline rendering boundary<script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},selectPublicPlace(){},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>'});
  if(url.pathname.startsWith('/cities/'))privateReads.push(url.pathname);
  if(url.pathname===manifestPath)return network.config(route,url);
  // Only test the navigation boundary here. Original desk forms have their own
  // handoff suite; no service submission is exercised by this UI check.
  if(/^\/(madrid|barcelona|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Original desk navigation boundary</title><body>Desk handoff received</body></html>'});
  return route.continue();
 });
 return {page,errors,writes,missing,privateReads,network};
}
async function check(name,width,fn){const t=await open(width);try{await fn(t);assert.deepEqual(t.errors,[],'no unhandled browser errors');assert.deepEqual(t.writes,[],'no unintended POST/payment/application');assert.deepEqual(t.missing,[],'real assets are present');assert.deepEqual(t.privateReads,[],'the browser never requests private city source files');passed++;console.log('  ✓ '+name);}catch(e){failed++;console.log('  ✗ '+name+' — '+e.message);}finally{await t.page.close();}}
async function start(page,extra=''){await page.goto(origin+'/flight-next?direction=club'+extra,{waitUntil:'domcontentloaded'});await page.locator('.europe-city-switch').waitFor();await page.waitForFunction(()=>!!window.BoomFlightEurope&&document.body.dataset.view==='home');}
async function city(page,name){await page.locator('.europe-city-switch [data-europe-city="'+name+'"]').click();await page.waitForFunction(name=>document.body.dataset.europeCity===name,name);}
async function fields(page){if(!await page.locator('#europeOptionalBrief').evaluate(n=>n.open))await page.locator('#europeOptionalBrief summary').click();}
async function setBrief(page,budget='2000'){await fields(page);await page.locator('#europeMoveIn').fill(arrival);await page.locator('#europeMoveOut').fill(departure);await page.locator('#europeBudget').selectOption(budget);await page.locator('#europePeople').selectOption('couple');}
async function service(page,label){await page.waitForFunction(label=>document.getElementById('europeServicePass').textContent.includes(label),label);}
function privateAbsent(url){for(const key of ['place','home','homes','type','privatePlace','private_place','lat','lng','lon','latitude','longitude','coordinates','address','name','email','phone','token'])assert.equal(url.searchParams.has(key),false,key+' must not enter a desk brief');}
async function bounds(page,selectors){const width=await page.evaluate(()=>({client:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(width.scroll<=width.client+1,'no sideways page overflow '+JSON.stringify(width));for(const selector of selectors){const sizes=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}));assert.ok(sizes.length,selector+' is visible');assert.ok(sizes.every(s=>s.width>=44&&s.height>=44),selector+' touch target '+JSON.stringify(sizes));}}
try{
 browser=await chromium.launch(await launchOptions());
 await check('Madrid → London → Amsterdam preserves dates and clears rather than converts each changed currency',1280,async({page})=>{
  const rules=readFileSync(root+'.vercelignore','utf8').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
  assert.ok(rules.includes('cities/'),'private city sources remain excluded from deployment');assert.ok(existsSync(root+manifestPath.slice(1)),'the generated public manifest is present');
  for(const rule of rules.filter(s=>!s.startsWith('!'))){const plain=rule.replace(/^\//,''),directory=plain.endsWith('/'),anchored=plain.includes('/'),escaped=plain.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'\u0000').replace(/\*/g,'[^/]*').replace(/\u0000/g,'.*');assert.equal(new RegExp((anchored?'^':'(?:^|/)')+escaped+(directory?'': '$')).test(manifestPath.slice(1)),false,'public manifest must not match deployment exclusion '+rule);}
  await start(page);await city(page,'madrid');await setBrief(page);await service(page,'€500');
  assert.equal(new URL(page.url()).searchParams.get('currency'),'EUR');assert.equal(await page.locator('.hero-bottom>a').getAttribute('href'),'#europeDeskStory');
  await city(page,'london');assert.equal(await page.locator('#europeBudget').inputValue(),'');assert.match(await page.locator('#europeCurrencyNote').innerText(),/GBP/);assert.match(await page.locator('#europeBudgetLabel').innerText(),/£/);await service(page,'£500');
  assert.equal(await page.locator('#europeMoveIn').inputValue(),arrival);assert.equal(await page.locator('#europeMoveOut').inputValue(),departure);
  await page.locator('#europeBudget').selectOption('3000');await city(page,'amsterdam');assert.equal(await page.locator('#europeBudget').inputValue(),'');assert.match(await page.locator('#europeCurrencyNote').innerText(),/EUR/);assert.match(await page.locator('#europeBudgetLabel').innerText(),/€/);assert.equal(new URL(page.url()).searchParams.has('budget'),false);
 });
 await check('Foreign city URLs and handoffs scrub stale Rome/private fields while retaining only the public desk brief',1280,async({page})=>{
  await start(page,'&place=luiss&homes=fixture-flat&type=__entire&privatePlace=office&lat=41.9123&lng=12.5123&address=Private%20Street&email=private%40example.test');
  await city(page,'madrid');privateAbsent(new URL(page.url()));await setBrief(page);await page.locator('[data-europe-need="application"]').click();await service(page,'€199');
  const urls=await page.locator('[data-europe-desk-link],.next-signoff .button').evaluateAll(nodes=>nodes.map(a=>a.href));assert.ok(urls.length>=2);
  for(const href of urls){const u=new URL(href);assert.equal(u.pathname,'/madrid');assert.equal(u.searchParams.get('need'),'application');assert.equal(u.searchParams.get('budget'),'2000');privateAbsent(u);assert.deepEqual([...u.searchParams.keys()].sort(),['budget','city','currency','from','moveIn','moveOut','need','people']);}
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/madrid');privateAbsent(new URL(page.url()));assert.equal(new URL(page.url()).searchParams.get('need'),'application');
 });
 await check('Back/Forward restore city and support, while the Rome navigation hook keeps canonical home types and exact old links',1280,async({page})=>{
  await start(page);await city(page,'madrid');await setBrief(page);await page.locator('[data-europe-need="viewing"]').click();await city(page,'london');
  await page.goBack();await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid');assert.equal(await page.locator('[data-europe-need="viewing"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#europeBudget').inputValue(),'2000');
  await page.goForward();await page.waitForFunction(()=>document.body.dataset.europeCity==='london');assert.equal(await page.locator('#europeBudget').inputValue(),'');
  await city(page,'madrid');
  await page.locator('.next-nav [data-view="apartments"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});assert.equal(await page.locator('body').getAttribute('data-europe-city'),'rome');assert.equal(new URL(page.url()).searchParams.has('need'),false);
  assert.deepEqual(await page.locator('#nextFilterType option').evaluateAll(ns=>ns.map(n=>[n.value,n.textContent])),[['','All home types'],['__entire','Entire home'],['__rooms','Rooms']]);
  const homeLinks=await page.locator('.next-brand').evaluateAll(ns=>ns.map(n=>n.href));assert.ok(homeLinks.length>=2,'header and footer expose home navigation');
  for(const href of homeLinks){const u=new URL(href);assert.equal(u.searchParams.get('city')||'rome','rome','actual home href agrees with the Rome SPA context');assert.equal(u.searchParams.has('need'),false);}
  await page.locator('.next-nav .next-brand').click();await page.waitForFunction(()=>document.body.dataset.view==='home'&&document.body.dataset.europeCity==='rome');
  assert.equal(new URL(page.url()).searchParams.get('city')||'rome','rome');assert.equal(await page.locator('#nextSearch').isVisible(),true);assert.equal(await page.locator('#europeDeskPlanner').isVisible(),false);
  await page.goto(origin+'/flight-next?direction=club&view=apartments&type=Premium%20Terrace',{waitUntil:'domcontentloaded'});await page.locator('#nextResults .next-card').waitFor();assert.equal(await page.locator('#nextFilterType').inputValue(),'Premium Terrace');assert.equal(await page.locator('#nextFilterType option:checked').innerText(),'Type from shared link');assert.equal(await page.locator('#nextResults .next-card').count(),1);
  await page.locator('#nextFilterType').selectOption('__rooms');assert.equal(await page.locator('#nextFilterType option').count(),3);assert.equal(await page.locator('#nextResults .next-card').count(),1);assert.match(await page.locator('#nextResults').innerText(),/Fixture room/);
 });
 await check('The selected support uses the matching original plan and passes a valid short desk stay without Rome’s minimum',1280,async({page})=>{
  await start(page,'&city=london&need=viewing');await service(page,'£149');await fields(page);await page.locator('#europeMoveIn').fill(arrival);await page.locator('#europeMoveOut').fill(year+'-04-08');await page.locator('#europeBudget').selectOption('2000');
  await page.locator('[data-europe-need="search"]').click();await service(page,'£500');await page.locator('[data-europe-need="application"]').click();await service(page,'£199');await page.locator('[data-europe-need="viewing"]').click();await service(page,'£149');
  const route=new URL(await page.locator('#europeServicePass [data-europe-desk-link]').getAttribute('href'),origin);assert.equal(route.pathname,'/london');assert.equal(route.searchParams.get('need'),'viewing');assert.equal(route.searchParams.get('currency'),'GBP');assert.equal(route.searchParams.get('moveOut'),year+'-04-08');
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');assert.equal(new URL(page.url()).searchParams.get('need'),'viewing');assert.equal(new URL(page.url()).searchParams.get('budget'),'2000');
 });
 await check('A late manifest requested from Madrid cannot repaint Amsterdam or restore the old desk',1280,async({page,network})=>{
  let held,reached,timer,calls=0;const requested=new Promise(resolve=>reached=resolve);network.config=route=>{if(++calls===1){held=route;reached();return;}return route.continue();};
  await start(page);await city(page,'madrid');try{await Promise.race([requested,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Madrid config never reached the network boundary')),9000);})]);}finally{clearTimeout(timer);}
  // The old request remains held while the user makes a new, explicit choice.
  assert.ok(held,'the public manifest was requested from Madrid');await city(page,'amsterdam');await service(page,'€500');assert.ok(calls>=2,'Amsterdam starts a current request after the old one was interrupted');
  await held.fulfill({contentType:'application/json',body:readFileSync(root+manifestPath.slice(1),'utf8')}).catch(()=>{});
  assert.equal(await page.locator('body').getAttribute('data-europe-city'),'amsterdam');assert.doesNotMatch(await page.locator('#europeServicePass').innerText(),/Madrid|£/);assert.match(await page.locator('#europeServicePass').innerText(),/€500/);
  assert.equal(new URL(await page.locator('#europeServicePass [data-europe-desk-link]').getAttribute('href'),origin).pathname,'/amsterdam');
 });
 await check('Failed and malformed city configs keep the truthful fallback through a later support change',1280,async({page,network})=>{
  network.config=route=>route.fulfill({status:503,body:'Unavailable'});
  await start(page,'&city=amsterdam&need=application');await page.waitForFunction(()=>document.getElementById('europeServicePass').textContent.includes('Speak with the Amsterdam desk'));
  assert.doesNotMatch(await page.locator('#europeServicePass').innerText(),/€500|£|Madrid/);assert.equal(new URL(await page.locator('#europeServicePass [data-europe-desk-link]').getAttribute('href'),origin).pathname,'/amsterdam');
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/amsterdam');assert.equal(new URL(page.url()).searchParams.get('need'),'application');
  // A successful HTTP response is not proof of a usable config. In particular,
  // an invalid payload must not be cached and throw on the next support choice.
  network.config=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({refund:{rule:'Fixture public policy'},cities:{amsterdam:{slug:'amsterdam',live:true,mode:'search'}}})});
  const partial=page.waitForResponse(r=>new URL(r.url()).pathname===manifestPath);
  await start(page,'&city=amsterdam&need=application');await (await partial).finished();
  await page.locator('[data-europe-need="viewing"]').click();
  await service(page,'Speak with the Amsterdam desk');assert.equal(await page.locator('[data-europe-need="viewing"]').getAttribute('aria-pressed'),'true');
  const fallback=new URL(await page.locator('#europeServicePass [data-europe-desk-link]').getAttribute('href'),origin);
  assert.equal(fallback.pathname,'/amsterdam');assert.equal(fallback.searchParams.get('need'),'viewing');assert.doesNotMatch(await page.locator('#europeServicePass').innerText(),/€\d|£\d/);
 });
 for(const width of [320,390])await check(width+'px: city choice, landmark, service and Rome photos fit with usable controls',width,async({page})=>{
  await start(page);await bounds(page,['.europe-city-switch [data-europe-city]','#nextSearchForm button[type="submit"]']);
  await city(page,'amsterdam');await service(page,'€500');await bounds(page,['[data-europe-need]','#europeDeskContinue','#europeServicePass [data-europe-desk-link]']);
  const signature=await page.locator('#europeCitySignature').boundingBox();assert.ok(signature.x>=0&&signature.x+signature.width<=width+1,'landmark stays inside screen');
  await fields(page);const font=await page.locator('#europeDeskForm input,#europeDeskForm select').evaluateAll(ns=>ns.map(n=>parseFloat(getComputedStyle(n).fontSize)));assert.ok(font.every(n=>n>=16),'touch inputs avoid zoom');
  await page.locator('[data-europe-open]').click();await bounds(page,['#europeCityDialog [data-europe-close]','#europeCityDialog [data-europe-city]']);await page.locator('[data-europe-close]').click();
  await city(page,'rome');await page.locator('#nextHomeRail .next-card').first().waitFor();await bounds(page,['#nextDestinationSummary']);assert.equal(await page.locator('.hero-bottom>a').getAttribute('href'),'#nextSearch');
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('Europe UI: '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
