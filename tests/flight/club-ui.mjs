// Real Club documents/controllers and geographic engines. Only catalogue,
// geocoder, clipboard and heavy map rendering cross a fixture boundary.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flightclubui  A real destination brief, factual alternatives and private work places');
if(!chromium){console.log('  SKIP: playwright unavailable — Club browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const listings=[
 {id:'fixture-rent',name:'Fixture Courtyard',zone:'Testaccio',price:1100,sqm:45,lat:41.851,lng:12.451},
 {id:'fixture-space',name:'Fixture Terrace',zone:'Ostiense',price:1400,sqm:90,lat:41.861,lng:12.451},
 {id:'fixture-journey',name:'Fixture Garden',zone:'Garbatella',price:1500,sqm:55,lat:41.871,lng:12.451},
 {id:'fixture-over',name:'Fixture Outside Budget',zone:'Ostiense',price:1800,sqm:140,lat:41.881,lng:12.451},
 {id:'fixture-florence',name:'Fixture Wrong City',city:'Firenze',zone:'Firenze',price:650,sqm:160,lat:43.77,lng:11.25},
 {id:'fixture-later',name:'Fixture Later Arrival',zone:'Ostiense',price:1300,sqm:30,lat:41.861,lng:12.451,availableFrom:year+'-06-01'}
].map((r,i)=>({...r,status:'available',availableDate:'Immediate',type:'Apartment',bedrooms:2,bathrooms:1,images:['/fixture-photo.svg'],geo:{src:'fixture',q:'Via Fixture '+(i+1)+', Roma'},description:'Synthetic catalogue fixture; not a public listing.'}));
function extract(source,name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name+' is still a real Skyline function');
 let i=source.indexOf('{',start),depth=0,quote='',escape=false;
 for(;i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return source.slice(start,i+1);}
 throw Error('Unclosed '+name);
}
const realJourney=extract(readFileSync(root+'skyline.html','utf8'),'journeyFor');
function skyline(){return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/js/mappa-engine.js"></script><script src="/js/tempi-engine.js"></script><script src="/js/boom-geo.js"></script></head><body style="margin:0;background:#101319;color:white"><p>Skyline rendering boundary</p><small>© OpenStreetMap contributors</small><script>
var catalogue=${JSON.stringify(listings)},MARKERS=catalogue.map(function(l){var el={__id:l.id,__co:[l.lng,l.lat],__precision:BOOM_GEO.pinPrecision(l).level};return {getElement:function(){return el;}};});
var TEMPI_DATI={meta:{lat0:41.85,lng0:12.45,dLat:.01,dLng:.01,righe:4,colonne:1},griglie:{luiss:[42,38,25,12].map(BOOM_TEMPI.codifica).join('')}};
${realJourney}
window.destinations=[];window.scopes=[];window.BoomSkyline={journeyFor:journeyFor,state:function(){return {catalogueStatus:'ready',mapStatus:'ready',usable:true};},setBudget:function(){},selectPublicPlace:function(slug){destinations.push(slug);return !!BOOM_MAPPA.destination(slug);},map:{resize:function(){},stop:function(){}}};
addEventListener('message',function(e){if(e.origin!==location.origin||e.source!==parent)return;if(e.data.t==='boomTieni')scopes.push(e.data.ids);if(e.data.t==='boomSelect')parent.postMessage({t:'boomSelected',id:e.data.id},location.origin);});
parent.postMessage({t:'boomSkylineReady'},location.origin);
</script></body></html>`;}
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);return res.end('No application writes in this fixture');}
 if(pathname==='/fixture-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#49493e"/><rect x="100" y="100" width="400" height="500" fill="#b9b39d"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
function feature(name,lng=12.49,lat=41.9){return {type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{name,street:'Via Fixture',housenumber:'12',city:'Rome'}};}
async function open(width=1280){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),errors=[],writes=[],photon=[];
 const network={handler:route=>route.fulfill({contentType:'application/json',body:JSON.stringify({features:[feature('Fixture Office')]})}),catalogue:route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,count:listings.length,listings})})};
 page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push(request.method()+' '+url.pathname);return route.abort();}
  if(url.hostname==='photon.komoot.io'){photon.push(url);return network.handler(route,url);}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings')return network.catalogue(route);
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:skyline()});
  return route.continue();
 });
 return {page,errors,writes,photon,network};
}
async function check(name,width,fn){const t=await open(width);try{await fn(t);assert.deepEqual(t.errors,[],'no unhandled browser errors');assert.deepEqual(t.writes,[],'no unintended writes');passed++;console.log('  ✓ '+name);}catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}finally{await t.page.close();}}
async function home(page,query=''){
 await page.goto(origin+'/flight-next?direction=club'+query,{waitUntil:'domcontentloaded'});
 await page.locator('#nextHomeRail .next-card').first().waitFor();
 assert.equal(await page.evaluate(()=>!!window.BoomFlightClub),true,'the real Club controller is active');
}
async function campus(page,slug='luiss'){
 const trigger=page.locator('#nextDestinationSummary:visible, [data-edit-destination]:visible').first();
 await trigger.click();await page.locator('#nextDestinationDialog').waitFor({state:'visible'});
 await page.locator('[data-destination="'+slug+'"]').click();
 await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
}
async function balancePicker(page){
 await page.locator('[data-page]:visible button[data-guide]:not([data-place]):visible').first().click();
 await page.locator('#nextDestinationDialog').waitFor({state:'visible'});
}
async function searchHomes(page){
 await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);
 await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
 await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
}
async function mapReady(page){
 await page.locator('button[data-layout="skyline"]').click();await page.locator('#nextApartmentsMap').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>BoomNextMap.state().status==='ready');
 await page.waitForFunction(()=>document.querySelector('#nextBalance')?.textContent.includes('25 min'));
}
function publicBrief(url,place='luiss'){for(const [key,value] of Object.entries({place,budget:'1500',people:'couple',moveIn:arrival,moveOut:departure,stay:'6'}))assert.equal(url.searchParams.get(key),value,key+' survives the journey');}
async function bounds(page,selectors=[]){
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,'page fits viewport '+JSON.stringify(size));
 for(const selector of selectors){const measures=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}));assert.ok(measures.length,selector+' is visible');assert.ok(measures.every(r=>r.width>=44&&r.height>=44),selector+' targets '+JSON.stringify(measures));}
}
try{
 browser=await chromium.launch(await launchOptions());
 await check('A delayed catalogue preserves the typed brief; LUISS then produces three factual and unique alternatives',1280,async({page,network})=>{
  let delayed;network.catalogue=route=>{delayed=route;};
  await page.goto(origin+'/flight-next?direction=club',{waitUntil:'domcontentloaded'});
  await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
  assert.ok(delayed,'catalogue GET is pending while the visitor types');
  await delayed.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,count:listings.length,listings})});await page.locator('#nextHomeRail .next-card').first().waitFor();
  for(const [id,value] of Object.entries({nextMoveIn:arrival,nextMoveOut:departure,nextBudget:'1500',nextPeople:'couple'}))assert.equal(await page.locator('#'+id).inputValue(),value,'catalogue readiness must not reset '+id);
  await page.locator('#nextDestinationSummary').click();await page.locator('#nextDestinationQuery').fill('LUISS');
  assert.match(await page.locator('[data-destination="luiss"]').innerText(),/Viale Romania 32/);
  assert.match(await page.locator('[data-destination="luiss-parenzo"]').innerText(),/Via Parenzo 11/);
  await page.locator('[data-destination="luiss"]').click();await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});await mapReady(page);publicBrief(new URL(page.url()));
  const choices=await page.locator('.balance-card').evaluateAll(cards=>cards.map(c=>({id:c.querySelector('[data-home]').dataset.home,text:c.innerText})));
  assert.deepEqual(choices.map(c=>c.id),['fixture-rent','fixture-space','fixture-journey']);assert.equal(new Set(choices.map(c=>c.id)).size,3);
  assert.match(choices[0].text,/€1,100/);assert.match(choices[1].text,/45 m² more/);assert.match(choices[1].text,/€300 more per month/);
  assert.match(choices[2].text,/17 min less in the same transit model/);assert.doesNotMatch(choices.map(c=>c.text).join(' '),/Outside Budget|fit score|% match/i);
 });
 await check('Detail everyday evidence, original Apply, saved homes and public share preserve the selected brief',1280,async({page})=>{
  await home(page);await campus(page);await searchHomes(page);await mapReady(page);
  await page.locator('.balance-card [data-home="fixture-journey"]').first().click();await page.locator('#nextDetailTitle').waitFor();
  assert.match(await page.locator('.detail-everyday').innerText(),/25 min · transit model/);assert.match(await page.locator('.everyday-note').innerText(),/not live/);
  const route=new URL(await page.locator('.everyday-metrics a').getAttribute('href'));assert.equal(route.hostname,'www.google.com');assert.equal(route.searchParams.get('travelmode'),'transit');
  const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);assert.equal(apply.pathname,'/listing/fixture-journey');assert.equal(apply.hash,'#applica');publicBrief(apply);
  await page.locator('.detail-actions [data-save-home]').click();assert.equal(await page.locator('.detail-actions [data-save-home]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('boomSalvate'))),['/listing/fixture-journey']);
  await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('[data-share-plan]').click();await page.waitForFunction(()=>!!window.__copied);
  const shared=new URL(await page.evaluate(()=>__copied));publicBrief(shared);assert.equal(shared.searchParams.get('homes'),'fixture-journey');assert.equal(shared.searchParams.get('direction'),'club');
  assert.deepEqual([...shared.searchParams.keys()].sort(),['budget','direction','homes','moveIn','moveOut','people','place','stay','view']);
 });
 await check('Balance selection continues once, cancel/Back leave editing local, and history/date edits preserve the actual brief',1280,async({page})=>{
  await home(page);await balancePicker(page);await page.keyboard.press('Escape');await campus(page,'sapienza');assert.equal(await page.locator('body').getAttribute('data-view'),'home','cancelled Find my balance must not turn a later brief edit into navigation');
  await page.locator('#nextDestinationSummary').click();await page.locator('#nextDestinationClear').click();
  await balancePicker(page);await page.locator('[data-destination="luiss"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).searchParams.get('place'),'luiss');assert.match(await page.locator('.balance-heading').innerText(),/LUISS/i,'choosing a campus from Find my balance opens the comparison');
  await page.goBack();await page.locator('#nextSearch').waitFor({state:'visible'});await page.locator('#nextDestinationSummary').click();await page.locator('#nextDestinationClear').click();
  await page.locator('.next-nav [data-view="apartments"]').click();await balancePicker(page);await page.goBack();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
  await campus(page,'sapienza');assert.equal(await page.locator('body').getAttribute('data-view'),'home','Back cancels a pending continuation without changing a later editor selection');
  await campus(page);await searchHomes(page);await mapReady(page);await page.locator('#nextResults [data-home="fixture-rent"]').first().click();await campus(page,'sapienza');
  await page.goBack();await page.locator('#nextApartments').waitFor({state:'visible'});publicBrief(new URL(page.url()));assert.match(await page.locator('.balance-heading').innerText(),/LUISS/i);
  assert.equal(await page.locator('#nextApartmentsMap iframe').evaluate(frame=>frame.contentWindow.destinations.at(-1)),'luiss','browser Back must restore the map destination as well as the brief');
  await page.goForward();await page.locator('#nextDetailTitle').waitFor();publicBrief(new URL(page.url()),'sapienza');assert.match(await page.locator('.detail-everyday').innerText(),/Sapienza/i);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#nextDetailTitle').waitFor();publicBrief(new URL(page.url()),'sapienza');
  await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('[data-share-plan]').click();await page.waitForFunction(()=>!!window.__copied);
  await page.goto(await page.evaluate(()=>__copied),{waitUntil:'domcontentloaded'});await page.locator('#nextResults .next-card').first().waitFor();publicBrief(new URL(page.url()),'sapienza');assert.match(await page.locator('.balance-heading').innerText(),/Sapienza/i);
  assert.equal(await page.locator('#nextResults .next-card').count(),3);assert.match(await page.locator('#nextResultCount').innerText(),/^3 homes/);
  await page.locator('#nextEditStay').click();await page.locator('#nextDialogIn').fill(year+'-06-01');await page.locator('#nextDialogOut').fill(year+'-12-01');await page.locator('#nextStayForm button[type="submit"]').click();
  await page.locator('#nextResults [data-home-id="fixture-later"]').waitFor();assert.equal(await page.locator('#nextResults .next-card').count(),4);assert.match(await page.locator('#nextResultCount').innerText(),/^4 homes/);
  await page.locator('#nextEditStay').click();await page.locator('#nextDialogIn').fill(arrival);await page.locator('#nextDialogOut').fill(departure);await page.locator('#nextStayForm button[type="submit"]').click();
  assert.equal(await page.locator('#nextResults [data-home-id="fixture-later"]').count(),0);assert.equal(await page.locator('#nextResults .next-card').count(),3);assert.match(await page.locator('#nextResultCount').innerText(),/^3 homes/);
  await page.locator('#nextEditStay').click();await page.locator('#nextClearDates').click();await page.locator('#nextResults [data-home-id="fixture-later"]').waitFor();assert.equal(await page.locator('#nextResults .next-card').count(),4);assert.match(await page.locator('#nextResultCount').innerText(),/^4 homes/);assert.equal(new URL(page.url()).searchParams.has('moveIn'),false);
 });
 await check('Work search sends only explicit GET, rejects out-of-area hits and never includes a private place in shared or Apply URLs',1280,async({page,photon,network})=>{
  network.handler=route=>route.fulfill({contentType:'application/json',body:JSON.stringify({features:[feature('Fixture Office'),feature('Outside Rome',2.3,48.8),feature('Invalid point',12.4,null)]})});
  await home(page,'&budget=1500&people=couple&moveIn='+arrival+'&moveOut='+departure);await balancePicker(page);await page.locator('[data-destination-mode="work"]').click();
  await page.locator('#nextDestinationQuery').fill('Fixture Office 12');assert.equal(photon.length,0,'typing must not transmit a workplace');
  await page.locator('#nextDestinationSearch').click();await page.locator('[data-found-place]').waitFor();assert.equal(photon.length,1);assert.equal(photon[0].searchParams.get('q'),'Fixture Office 12');assert.equal(await page.locator('[data-found-place]').count(),1);
  await page.locator('[data-found-place]').click();await page.locator('#nextApartments').waitFor({state:'visible'});assert.match(await page.locator('.balance-heading').innerText(),/Fixture Office/,'a private destination also continues Find my balance');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('boom:pois')));assert.equal(saved.length,1);assert.equal(saved[0].name,'Fixture Office 12');
  await page.locator('[data-share-plan]').click();await page.waitForFunction(()=>!!window.__copied);const shared=await page.evaluate(()=>__copied);
  assert.doesNotMatch(shared,/Office|12\.49|41\.9|private|address|coordinates|place=/i);
  await page.locator('.balance-card [data-home]').first().click();assert.match(await page.locator('.detail-everyday').innerText(),/Fixture Office/);
  const apply=await page.locator('[data-next-apply]').getAttribute('href');assert.doesNotMatch(apply,/Office|12\.49|41\.9|private|address|coordinates|place=/i);
  assert.equal(new URL(apply,origin).searchParams.get('moveIn'),arrival);
  await page.goBack();await page.locator('#nextApartments').waitFor({state:'visible'});assert.match(await page.locator('.balance-heading').innerText(),/Fixture Office/,'a private place survives Back in this tab');
  assert.equal(await page.evaluate(()=>localStorage.getItem('boomSalvate')),null,'no local saved homes were needed');
  const incoming=new URL(shared);incoming.searchParams.set('homes','fixture-rent,fixture-space');
  await page.goto(incoming.href,{waitUntil:'domcontentloaded'});await page.locator('#nextResults .next-card').first().waitFor();assert.equal(await page.locator('#nextResults .next-card').count(),2);
  await page.locator('[data-edit-destination]').first().click();await page.locator('[data-destination-mode="work"]').click();await page.locator('[data-private-place="0"]').click();
  await page.locator('[data-share-plan]').click();await page.waitForFunction(()=>!!window.__copied);
  const reshared=new URL(await page.evaluate(()=>__copied));assert.equal(reshared.searchParams.get('homes'),'fixture-rent,fixture-space','an incoming shortlist remains shareable even without local hearts');assert.doesNotMatch(reshared.href,/Office|12\.49|41\.9|private|address|coordinates|place=/i);
 });
 await check('Rejected and stale location searches remain recoverable and cannot overwrite a newer choice',1280,async({page,network})=>{
  await home(page);await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination-mode="work"]').click();
  network.handler=route=>route.fulfill({status:503,body:'Unavailable'});await page.locator('#nextDestinationQuery').fill('Failed place');await page.locator('#nextDestinationSearch').click();
  await page.waitForFunction(()=>document.querySelector('#nextDestinationOptions').textContent.includes('unavailable'));
  let pending,reached;const oldRequested=new Promise(resolve=>reached=resolve);network.handler=(route,url)=>{if(url.searchParams.get('q')==='Old place'){pending=route;reached();return;}return route.fulfill({contentType:'application/json',body:JSON.stringify({features:[feature('New Office')]})});};
  await page.locator('#nextDestinationQuery').fill('Old place');await page.locator('#nextDestinationSearch').click();
  await page.waitForFunction(()=>document.querySelector('#nextDestinationOptions').textContent.includes('Finding your place'));
  let requestTimeout;try{await Promise.race([oldRequested,new Promise((_,reject)=>{requestTimeout=setTimeout(()=>reject(Error('old location request never reached the network boundary')),9000);})]);}finally{clearTimeout(requestTimeout);}assert.ok(pending,'old network request reached the fixture');
  await page.locator('#nextDestinationQuery').fill('New place');await page.locator('#nextDestinationSearch').click();await page.locator('[data-found-place]').waitFor();
  await pending.fulfill({contentType:'application/json',body:JSON.stringify({features:[feature('Old Office')]})}).catch(()=>{});
  assert.match(await page.locator('#nextDestinationOptions').innerText(),/New Office/);assert.doesNotMatch(await page.locator('#nextDestinationOptions').innerText(),/Old Office/);
  await page.locator('[data-found-place]').click();assert.match(await page.locator('#nextDestinationSummary strong').innerText(),/New Office/);
  await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination-mode="work"]').click();assert.match(await page.locator('#nextDestinationPrivate').innerText(),/New Office/);
 });
 await check('An address-only campus offers rent/space and the official Maps destination without a fabricated journey',1280,async({page})=>{
  await home(page);await campus(page,'rome-business-school');await searchHomes(page);
  assert.match(await page.locator('.balance-heading').innerText(),/Rome Business School/);
  assert.doesNotMatch(await page.locator('#nextBalance').innerText(),/\d+\s*min|Less time on the way/);assert.match(await page.locator('#nextBalance').innerText(),/reliable transit comparison is not available/);
  await page.locator('.balance-card [data-home]').first().click();assert.match(await page.locator('.everyday-metrics').innerText(),/Route to check/);assert.doesNotMatch(await page.locator('.detail-everyday').innerText(),/\d+\s*min/);
  const route=new URL(await page.locator('.everyday-metrics a').getAttribute('href'));assert.equal(route.searchParams.get('destination'),'Via Giuseppe Montanelli 5, Rome');
 });
 for(const width of [320,390])await check(width+'px: destination, comparison and Apply fit with readable fields and 44px primary targets',width,async({page})=>{
  await home(page);await bounds(page,['#nextDestinationSummary','#nextSearchForm button[type="submit"]']);
  await page.locator('#nextDestinationSummary').click();await bounds(page,['[data-destination-mode]','#nextDestinationDialog [data-close-dialog]','[data-destination="luiss"]']);
  assert.ok(await page.locator('#nextDestinationQuery').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16));
  await page.locator('[data-destination="luiss"]').click();await searchHomes(page);await mapReady(page);
  await bounds(page,['[data-edit-destination]','[data-share-plan]','.balance-action','.balance-save','button[data-layout="skyline"]']);
  await page.locator('.balance-card [data-home]').first().click();await page.locator('#nextDetailTitle').waitFor();await bounds(page,['[data-next-apply]','.everyday-heading [data-edit-destination]','.everyday-metrics a']);
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('Club UI: '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
