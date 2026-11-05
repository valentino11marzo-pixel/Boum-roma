// Real Club navigation, company content and canonical city/journey controllers.
// Only public catalogue, image bytes and map rendering are fixtures; all writes
// and remote browser requests are blocked. No lead or payment is created.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flightclubcompanyui  One agency, useful public doors and city changes that retain the move');
if(!chromium){console.log('  SKIP: playwright unavailable — company browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const homes=[{id:'company-courtyard',name:'Fixture Courtyard',price:1200,sqm:65},{id:'company-room',name:'Fixture Room',price:700,sqm:18}].map((home,i)=>({...home,status:'available',availableDate:'Immediate',zone:'Prati',type:i?'Room':'Apartment',bedrooms:1,bathrooms:1,lat:41.91+i*.01,lng:12.47,images:['/company-photo.svg','/company-photo-2.svg'],description:'Synthetic public catalogue boundary, never a real property or customer.'}));
const mapHTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Map rendering boundary</p><script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},map:{resize(){},stop(){}}};addEventListener("message",e=>{if(e.source===parent&&e.origin===location.origin&&e.data.t==="boomSelect")parent.postMessage({t:"boomSelected",id:e.data.id},location.origin);});parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port,citySlugs=['amsterdam','barcelona','london','madrid','milan','rome'];
let browser,passed=0,failed=0;
async function check(name,width,fn,{manifest='real'}={}){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),errors=[],writes=[],privateReads=[];
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push(request.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(/^\/company-photo(?:-2)?\.svg$/.test(url.pathname))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>'});
  if(url.pathname==='/assets/boom-desks-public.json'&&manifest!=='real')return route.fulfill({status:manifest==='unavailable'?503:200,contentType:'application/json',body:manifest==='unavailable'?'{}':JSON.stringify({refund:{rule:'Synthetic fixture refund rule.'},cities:{barcelona:{slug:'barcelona',live:true,mode:'search'}}})});
  if(url.pathname.startsWith('/listing/'))return route.fulfill({contentType:'text/html',body:'<h1>Original application boundary — no submit</h1>'});
  if(/^\/(barcelona|madrid|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<h1>Original city desk boundary — no submit</h1>'});
  return route.continue();
 });
 try{
  await page.goto(origin+'/flight-next?direction=club&edition=club&city=rome',{waitUntil:'domcontentloaded'});
  await page.locator('#clubCompany').waitFor();await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});
  await page.waitForFunction(()=>!!window.BoomFlightEurope&&!!window.BoomFlightNext);
  await fn(page);assert.deepEqual(errors,[],'no unhandled browser errors');assert.deepEqual(writes,[],'no application, lead or payment write');assert.deepEqual(privateReads,[],'no private city configuration read');passed++;console.log('  ✓ '+name);
 }catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}
 finally{await page.close();}
}
async function geometry(page){
 await page.evaluate(()=>document.fonts.ready);
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,'no horizontal overflow: '+JSON.stringify(size));
 const controls=await page.locator('#clubDestinations button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {w:r.width,h:r.height};}));
 assert.equal(controls.length,6);assert.ok(controls.every(r=>r.w>=44&&r.h>=44),'city doors remain touch-sized');
}
async function footerCity(page,slug){
 const fromHome=await page.locator('body').getAttribute('data-view')==='home';
 await page.locator('#clubDestinations [data-europe-city="'+slug+'"]').click();
 await page.waitForFunction(slug=>document.body.dataset.europeCity===slug&&document.body.dataset.view==='home',slug);
 assert.equal(await page.locator('#clubDestinations [data-europe-city="'+slug+'"]').getAttribute('aria-pressed'),'true','current destination is announced');
 if(fromHome){
  await page.waitForFunction(()=>document.activeElement===document.getElementById('nextHeroTitle'));
  assert.equal((await page.locator('#nextHeroTitle #nextDestinationBoard').getAttribute('aria-label')).toLowerCase(),slug,'focus reaches the newly selected city heading');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#clubCompany')),false,'keyboard navigation resumes at the city, not at the old footer control');
 }
}
async function search(page){
 await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('2000');await page.locator('#nextPeople').selectOption('couple');
 await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
 await page.locator('#nextApartmentsMap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>BoomNextMap.state().status==='ready');
}
async function intent(page,foreign=false,budget='2000'){
 const prefix=foreign?'europe':'next',values=await page.locator('#'+prefix+'MoveIn,#'+prefix+'MoveOut,#'+prefix+'Budget,#'+prefix+'People').evaluateAll(nodes=>nodes.map(node=>node.value));
 assert.deepEqual(values,[arrival,departure,budget,'couple'],'dates, budget and people follow the canonical city and currency boundary');
}
async function oneMap(page){assert.equal(await page.locator('iframe.boom-next-map-frame').count(),1,'one canonical Skyline iframe survives the city journey');}
async function founder(page){
 assert.equal(await page.locator('figure.club-desk-person').count(),1,'one founder figure, without repeated portraits');
 assert.equal(await page.locator('#europeServicePass figure.club-desk-person').count(),1,'the responsible person belongs to the service being considered');
 assert.equal(await page.locator('#europeServicePass figure.club-desk-person').isVisible(),true);
 assert.match(await page.locator('figure.club-desk-person').innerText(),/Valentino/);assert.match(await page.locator('figure.club-desk-person').innerText(),/Rome/);
 assert.match(await page.locator('figure.club-desk-person img').getAttribute('alt'),/founder.*Rome/i);
}
async function publicLinks(page){
 const links=await page.locator('#clubCompany a[href]').evaluateAll(nodes=>nodes.map(node=>({href:node.getAttribute('href'),label:node.textContent.trim(),aria:node.getAttribute('aria-label')||''})));
 for(const path of ['/about','/how-it-works','/your-money','/terms','/privacy','/withdrawal','/login'])assert.ok(links.some(link=>new URL(link.href,origin).pathname===path),'footer exposes '+path);
 const demos=links.filter(link=>new URL(link.href,origin).pathname==='/client-portal');assert.equal(demos.length,1,'only the actual Property Finding demo is advertised');
 const demo=new URL(demos[0].href,origin);assert.equal(demo.searchParams.get('code'),'DEMO');assert.match(demos[0].label+' '+demos[0].aria,/property finding/i);assert.match(demos[0].label+' '+demos[0].aria,/demo/i);
 for(const link of links){
  const url=new URL(link.href,origin);
  for(const key of ['privatePlace','lat','lng','address','name'])assert.equal(url.searchParams.has(key),false,'public footer link excludes private '+key);
  assert.ok(!url.href.includes('Synthetic%20private')&&!url.href.includes('41.9123')&&!url.href.includes('12.5123'),'footer links never expose the saved personal destination');
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol))continue;
  assert.ok(!url.pathname.endsWith('.html'),'public route is canonical: '+url.pathname);
  const file=root+(url.pathname==='/'?'index.html':url.pathname.slice(1)+'.html');
  assert.ok(existsSync(file),'public link has a local canonical page: '+url.pathname);
  if(url.hash&&url.pathname==='/flight-next')assert.equal(await page.locator('[id="'+decodeURIComponent(url.hash.slice(1))+'"]').count(),1,'local section link resolves');
 }
}
try{
 browser=await chromium.launch(await launchOptions());
 for(const width of [320,390,1280])await check(width+': useful company footer changes city from Apartments and Detail without losing the move',width,async page=>{
  assert.equal(await page.locator('#clubCompany.club-company').count(),1);
  assert.deepEqual((await page.locator('#clubDestinations button[data-europe-city]').evaluateAll(nodes=>nodes.map(node=>node.dataset.europeCity))).sort(),citySlugs);
  const labels=await page.locator('#clubDestinations').innerText();assert.match(labels,/Rome/i);assert.match(labels,/home|catalogue|apartments/i);assert.match(labels,/desk/i);
  const principles=await page.locator('#clubPrinciples').innerText();assert.match(principles,/cost|fee|price/i);assert.match(principles,/person|people|human|Valentino/i);assert.match(principles,/tool|Skyline|portal|document/i);
  assert.ok(await page.locator('#clubPrinciples a[href]').count()>=3,'each evidence has a useful next destination');
  await publicLinks(page);await geometry(page);await search(page);await oneMap(page);
  await footerCity(page,'barcelona');await intent(page,true);await oneMap(page);await geometry(page);
  await page.locator('#europeServicePass .europe-service-price').waitFor();await founder(page);
  for(const need of ['application','viewing','search']){
   await page.locator('[data-europe-need="'+need+'"]').click();await founder(page);
  }
  await footerCity(page,'rome');await intent(page);await search(page);
  await page.locator('#nextResults [data-home="company-courtyard"]').first().click();await page.locator('#nextDetailTitle').waitFor();
  assert.equal(await page.locator('#nextDetailTitle').innerText(),'Fixture Courtyard');await oneMap(page);
  await footerCity(page,'madrid');await intent(page,true);await page.locator('#europeServicePass .europe-service-price').waitFor();await founder(page);await oneMap(page);await publicLinks(page);await geometry(page);
  if(width===390){
   await footerCity(page,'london');await intent(page,true,'');
   assert.equal(await page.locator('#europeCurrencyNote').isVisible(),true);assert.match(await page.locator('#europeCurrencyNote').innerText(),/GBP|converted/);
   await page.locator('#europeOptionalBrief').evaluate(node=>{node.open=true;});await page.locator('#europeBudget').selectOption('2000');
   await page.waitForFunction(()=>new URLSearchParams(location.search).get('currency')==='GBP');
   const brand=new URL(await page.locator('#clubCompany .club-company-brand').getAttribute('href'),origin);
   assert.equal(brand.pathname,'/flight-next','the company brand is a real canonical home link');
   for(const [key,value] of Object.entries({direction:'club',edition:'club',city:'london',moveIn:arrival,moveOut:departure,budget:'2000',currency:'GBP',people:'couple',need:'search'}))assert.equal(brand.searchParams.get(key),value,'copied or newly opened company brand link preserves '+key);
   const romanServices=await page.locator('#clubCompany [data-club-rome-service]').evaluateAll(nodes=>nodes.map(node=>({href:node.href,journey:node.hasAttribute('data-journey-service')})));
   assert.equal(romanServices.length,3,'the footer exposes its three Rome service doors');
   for(const service of romanServices){
    const url=new URL(service.href);
    for(const key of ['budget','currency','place','moveIn'])assert.equal(url.searchParams.has(key),false,'London brief must not travel into a Rome service: '+key);
    assert.equal(service.journey,false,'a foreign city must not activate the Rome journey link handler');
   }
   await publicLinks(page);
  }
  await footerCity(page,'rome');await intent(page,false,width===390?'':'2000');assert.equal(await page.locator('figure.club-desk-person').isVisible(),false,'the foreign service portrait is not a separate Rome chapter');
 });
 await check('a saved personal destination stays out of every public footer door',390,async page=>{
  await page.evaluate(()=>BOOM_MAPPA.salvaPosto({name:'Synthetic private office',lat:41.9123,lng:12.5123}));
  await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination-mode="work"]').click();await page.locator('[data-private-place="0"]').click();
  await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});assert.match(await page.locator('#nextDestinationSummary').innerText(),/Synthetic private office/);
  await publicLinks(page);await search(page);await footerCity(page,'barcelona');await publicLinks(page);
  const url=new URL(page.url());for(const key of ['privatePlace','lat','lng','address','name','place'])assert.equal(url.searchParams.has(key),false,'foreign destination excludes '+key);await intent(page,true);
 });
 for(const manifest of ['incomplete','unavailable'])await check('unknown '+manifest+' service manifest leaves an honest desk door, never a fictional fee',390,async page=>{
  await footerCity(page,'barcelona');await page.locator('#europeServicePass [data-europe-desk-link]').waitFor({state:'attached'});
  assert.equal(await page.locator('#europeServicePass .europe-service-price').count(),0);assert.equal(await page.locator('.europe-need-price').count(),0,'unknown tariffs never appear on the need controls');
  assert.ok(!/[€£]\s*[\d,.]+/.test(await page.locator('#europeServicePass').innerText()),'no amount is invented for a missing service');
  assert.match(await page.locator('#europeServicePass').innerText(),/current service|price|city page|desk/i);
  const link=new URL(await page.locator('#europeServicePass [data-europe-desk-link]').getAttribute('href'),origin);assert.equal(link.pathname,'/barcelona');
  await publicLinks(page);await geometry(page);
  // Club intentionally suppresses duplicate service links. Its one visible
  // form action must still take the user to the original city desk on failure.
  const continueButton=page.locator('#europeDeskContinue');assert.equal(await continueButton.isVisible(),true);assert.match(await continueButton.innerText(),/Open Barcelona desk/i);
  await continueButton.click();await page.waitForURL(url=>url.pathname==='/barcelona');
  const arrived=new URL(page.url());for(const [key,value] of Object.entries({from:'flight',city:'barcelona',currency:'EUR'}))assert.equal(arrived.searchParams.get(key),value,'fallback keeps '+key+' at the canonical desk');
 },{manifest});
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('\n  '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
