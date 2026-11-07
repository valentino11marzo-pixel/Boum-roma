// The real catalogue, city, journey and detail controllers. Only the public
// catalogue, image bytes, map renderer and final application page are fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flightclubjourneyui  Current journey, one return path, intact applications and truthful next steps');
if(!chromium){console.log('  SKIP: playwright unavailable — journey browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const homes=[
 {id:'journey-open',name:'Fixture open home',price:1200,status:'available',availableDate:'Immediate',depositMonths:2},
 {id:'journey-unknown',name:'Fixture date to confirm',price:1100,status:'available',availableDate:'To be agreed'},
 {id:'journey-closed',name:'Fixture rented home',price:1300,status:'rented',availableDate:''}
].map(home=>({zone:'Prati',type:'Apartment',sqm:64,bedrooms:1,bathrooms:1,lat:41.91,lng:12.47,
 images:['/journey-fixture.svg'],description:'Synthetic home for a browser test, never a customer record.',...home}));
const mapHTML='<!doctype html><html><body><script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('No writes permitted');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),errors=[],writes=[],missing=[];
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(origin+'/assets/')&&response.status()>=400)missing.push(new URL(response.url()).pathname);});
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push(request.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname==='/journey-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#817b63"/></svg>'});
  if(url.pathname.startsWith('/listing/'))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>Original application boundary — no submission</h1></body></html>'});
  return route.continue();
 });
 try{await fn(page);assert.deepEqual(errors,[],'no uncaught browser errors');assert.deepEqual(writes,[],'no application or payment submitted');assert.deepEqual(missing,[],'real assets loaded');passed++;console.log('  ✓ '+name);}
 catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}
 finally{await page.close();}
}
async function start(page,{edition='club',home=''}={}){
 const params=new URLSearchParams({direction:'club',edition,view:home?'detail':'apartments',layout:'skyline',moveIn:arrival,moveOut:departure,budget:'1500',people:'couple',place:'luiss',type:'__entire'});
 if(home)params.set('home',home);
 await page.goto(origin+'/flight-next?'+params,{waitUntil:'domcontentloaded'});
 await page.locator(home?'#nextDetailTitle':'#nextResults [data-home="journey-open"]').first().waitFor();
}
async function geometry(page,selector){
 await page.evaluate(()=>document.fonts.ready);
 const bounds=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
 assert.ok(bounds.document<=bounds.viewport+1,'no horizontal overflow: '+JSON.stringify(bounds));
 const links=await page.locator(selector+' a').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).map(node=>{const box=node.getBoundingClientRect();return {width:box.width,height:box.height};}));
 assert.ok(links.every(box=>box.width>=44&&box.height>=44),'route links retain usable touch targets');
}
async function current(page,view){
 const host=page.locator(view==='apartments'?'#nextApartments':'#nextDetailContent');
 assert.equal(await host.locator('.club-journey-route').count(),1,'one route in the visible view');
 assert.equal(await host.locator('.club-journey-route [aria-current="step"]').count(),1,'exactly one current stage');
 assert.match(await host.locator('.club-journey-route [aria-current="step"]').innerText(),view==='apartments'?/Explore homes/:/Review a home/);
 assert.equal(await host.locator('.club-journey-route li:last-child [aria-current]').count(),0,'application never claims completion before the original form');
}
function intent(url,expected={moveIn:arrival,moveOut:departure,people:'couple',place:'luiss'}){
 assert.equal(url.searchParams.get('budget'),'1500');assert.equal(url.searchParams.get('type'),'__entire');
 for(const [key,value] of Object.entries(expected))assert.equal(url.searchParams.get(key),value,key+' is preserved by the original journey');
}
async function applyURL(page){return new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);}
async function detail(page){
 await page.locator('#nextResults [data-home="journey-open"]').first().click();
 await page.locator('#nextDetailTitle').waitFor();await current(page,'detail');
 assert.equal(await page.locator('.detail-breadcrumb [data-view="apartments"]').count(),1,'the route supplies one canonical return link');
 assert.equal(await page.locator('.club-application-next').count(),1,'one next-step explanation');
 assert.match(await page.locator('.club-application-next').innerText(),/does not reserve the home/);
 assert.match(await page.locator('.club-application-next').innerText(),/No payment is taken at this step/);
}
try{
 browser=await chromium.launch(await launchOptions());
 for(const width of [320,390,1280])await check(width+': collection, review and the original application keep one route and the exact brief',width,async page=>{
  await start(page);await current(page,'apartments');await geometry(page,'#nextApartments .club-journey-route');
  assert.equal(await page.locator('#nextApartments .club-explore-note').count(),1);assert.match(await page.locator('.club-explore-note').innerText(),/Skyline.*heart/);
  await detail(page);await geometry(page,'#nextDetailContent .club-journey-route');
  let expected={moveIn:arrival,moveOut:departure,people:'couple',place:'luiss'};
  let url=await applyURL(page);assert.equal(url.pathname,'/listing/journey-open');assert.equal(url.hash,'#applica');intent(url,expected);
  if(width===390){
   await page.locator('[data-edit-stay]').click();await page.locator('#nextDialogIn').fill(year+'-02-01');await page.locator('#nextDialogOut').fill(year+'-08-01');await page.locator('#nextDialogPeople').selectOption('family');await page.locator('#nextStayForm button[type="submit"]').click();await page.locator('#nextStayDialog').waitFor({state:'hidden'});
   expected={moveIn:year+'-02-01',moveOut:year+'-08-01',people:'family',place:'luiss'};
   await current(page,'detail');assert.equal(await page.locator('.club-application-next').count(),1);intent(await applyURL(page),expected);
   await page.locator('[data-edit-stay]').click();await page.locator('#nextClearDates').click();await page.locator('#nextStayDialog').waitFor({state:'hidden'});
   expected={moveIn:null,moveOut:null,people:'family',place:'luiss'};
   await current(page,'detail');assert.equal(await page.locator('.club-application-next').count(),1);intent(await applyURL(page),expected);
   await page.locator('.detail-everyday [data-edit-destination]').click();await page.locator('[data-destination="sapienza"]').click();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
   expected.place='sapienza';await current(page,'detail');assert.equal(await page.locator('.club-application-next').count(),1);intent(await applyURL(page),expected);
  }
  await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});await current(page,'apartments');intent(new URL(page.url()),expected);
  assert.equal(await page.locator('#nextApartments .club-explore-note').count(),1,'return does not duplicate instructions');
  await detail(page);intent(await applyURL(page),expected);
  await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/journey-open');intent(new URL(page.url()),expected);
 });
 await check('390: rented and unknown availability retain distinct next steps and original links',390,async page=>{
  await start(page,{home:'journey-closed'});await current(page,'detail');await geometry(page,'#nextDetailContent .club-journey-route');
  assert.match(await page.locator('.decision-status').innerText(),/Rented/);
  assert.match(await page.locator('.club-journey-route li:last-child').last().innerText(),/Check status/);
  assert.match(await page.locator('.club-application-next').innerText(),/not currently offered as available/);
  assert.doesNotMatch(await page.locator('.club-application-next').innerText(),/opens your application/);
  assert.match(await page.locator('[data-next-apply]').innerText(),/View current availability/);assert.equal((await applyURL(page)).hash,'');
  await start(page,{home:'journey-unknown'});await current(page,'detail');
  assert.match(await page.locator('.decision-status').innerText(),/Ask us|confirm|date/i);
  assert.match(await page.locator('.club-application-next').innerText(),/Availability still needs confirmation/);
  assert.match(await page.locator('.club-application-next').innerText(),/does not reserve the home/);assert.equal((await applyURL(page)).hash,'#applica');
 });
 await check('390: Perspective keeps its existing catalogue, breadcrumb and application unchanged',390,async page=>{
  await start(page,{edition:'perspective'});assert.equal(await page.locator('.club-journey-route,.club-explore-note').count(),0);
  await page.locator('#nextResults [data-home="journey-open"]').first().click();await page.locator('#nextDetailTitle').waitFor();
  assert.equal(await page.locator('.club-journey-route,.club-application-next').count(),0);assert.equal(await page.locator('.detail-breadcrumb [data-view="apartments"]').count(),1);
  intent(await applyURL(page));await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});assert.equal(new URL(page.url()).searchParams.get('edition'),'perspective');
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('\n  '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
