// Dispatch's progressive ticket is a view of native inputs, never another form.
// Fixtures replace public data, image bytes, map rendering and the final handoff
// only. All application controllers run unchanged; writes and remote reads stop.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
const focus=process.argv[2]||'',year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const manifest=readFileSync(root+'assets/boom-desks-public.json','utf8');
console.log('\n▸ flightdispatchui  A useful destination, one scene and the visitor’s actual plan');
if(focus)console.log('  Focus: '+focus+' (default invocation runs every scenario)');
if(!chromium){console.log('  SKIP: playwright unavailable — Dispatch browser checks did not run');process.exit(0);}
const homes=[{id:'dispatch-home',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2}].map(home=>({...home,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9,lng:12.49,images:['/dispatch-photo.svg'],description:'Synthetic public catalogue boundary, never a real home or customer.'}));
const mapHTML='<!doctype html><html><body>Skyline rendering boundary<script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},refreshPlaces(){},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/dispatch-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn,motion='reduce'){
 if(focus&&!name.includes(focus))return;
 const page=await browser.newPage({viewport:{width,height:1000},isMobile:width<500,hasTouch:width<500,reducedMotion:motion});
 const errors=[],writes=[],missing=[],privateReads=[],requests={catalogue:0,map:0},data={mode:'normal',pending:[]};
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(origin+'/assets/')&&response.status()>=400&&!response.url().includes('/boom-desks-public.json'))missing.push(new URL(response.url()).pathname);});
 await page.context().route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push(request.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings'){requests.catalogue++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});}
  if(url.pathname==='/skyline'){requests.map++;return route.fulfill({contentType:'text/html',body:mapHTML});}
  if(url.pathname==='/assets/boom-desks-public.json'){
   if(data.mode==='hold'){data.pending.push(route);return;}
   if(data.mode==='error')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture service boundary unavailable"}'});
  }
  if(url.pathname.startsWith('/listing/')||/^\/(barcelona|madrid|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Original public form boundary</h1><p>No application or payment is sent.</p>'});
  return route.continue();
 });
 try{
  await fn({page,requests,data});
  assert.deepEqual(errors,[],'no unhandled browser errors');assert.deepEqual(writes,[],'no application, lead or payment write');
  assert.deepEqual(missing,[],'all actual assets loaded');assert.deepEqual(privateReads,[],'no private city configuration read');
  passed++;console.log('  ✓ '+name);
 }catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);console.log(error.stack);}
 finally{for(const route of data.pending)await route.abort().catch(()=>{});await page.close();}
}
const ticket=page=>page.locator('#dispatchJourneyTicket');
const row=(page,name)=>ticket(page).locator('[data-journey-field="'+name+'"]');
async function start(page,query=''){
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.homeVision==='dispatch'&&window.BoomFlightGlobe?.state().ready);
 await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});
 await ticket(page).waitFor({state:'attached'});
}
async function city(page,slug){await page.locator('.europe-city-switch [data-europe-city="'+slug+'"]').click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);}
async function settled(page){await page.waitForFunction(()=>!['clubMedia','boomGlobeMount'].some(id=>document.getElementById(id).getAnimations().some(a=>a.playState==='running')));}
async function boardFits(page,width){
 const rects=await page.locator('#nextHeroTitle').evaluate(node=>{const cells=[...node.querySelectorAll('#nextDestinationBoard .fc2')],promise=document.querySelector('#directionClubTicket .hero-promise');return {heading:node.getBoundingClientRect().toJSON(),first:cells[0].getBoundingClientRect().toJSON(),last:cells.at(-1).getBoundingClientRect().toJSON(),promise:promise.getBoundingClientRect().toJSON()};});
 assert.ok(rects.first.left>=rects.heading.left-.5&&rects.last.right<=rects.heading.right+.5,'every actual flap fits inside its heading: '+JSON.stringify(rects));
 const overlapX=Math.min(rects.last.right,rects.promise.right)-Math.max(rects.first.left,rects.promise.left),overlapY=Math.min(rects.heading.bottom,rects.promise.bottom)-Math.max(rects.heading.top,rects.promise.top);
 assert.ok(overlapX<=0||overlapY<=0,'the destination and its supporting promise retain separate reading space: '+JSON.stringify(rects));
}
async function noOverflow(page){const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,'no horizontal overflow: '+JSON.stringify(size));}
async function controls(page,selector){
 const rects=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>({text:n.textContent.trim(),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 assert.ok(rects.length&&rects.every(r=>r.width>=44&&r.height>=44),'controls retain 44px targets: '+JSON.stringify(rects));
}
async function summary(page,id){return (await page.locator('#dispatchJourney'+id).innerText()).replace(/\s+/g,' ').trim();}
async function fillRome(page){await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');}
async function fieldState(page,state){await page.waitForFunction(value=>document.getElementById('dispatchJourneyTicket').dataset.dateState===value,state);}
async function serviceState(page,state){await page.waitForFunction(value=>document.getElementById('dispatchJourneyTicket').dataset.serviceState===value,state);}
async function publicOnly(page){
 const content=await ticket(page).evaluate(node=>({text:node.textContent,links:[...node.querySelectorAll('a')].map(a=>a.href)}));
 assert.doesNotMatch(JSON.stringify(content),/Synthetic private office|41\.9123|12\.5123|synthetic-office|privatePlace|lat=|lng=/,'the progressive ticket never exposes a private everyday place');
}
async function foreignOffer(page){
 await serviceState(page,'available');
 const native=await page.locator('#europeServicePass').evaluate(node=>({fee:node.querySelector('.europe-service-price strong').textContent,condition:node.querySelector('.europe-service-price small').textContent,selected:node.querySelector('.europe-service-copy h3').textContent}));
 assert.equal(await summary(page,'Support'),native.selected,'the ticket uses the actual selected native service');
 const fee=await summary(page,'Fee');assert.ok(fee.includes(native.fee)&&fee.includes(native.condition),'the actual fee and its condition stay together: '+fee);
 assert.equal(await page.locator('#dispatchJourneyFee').evaluate(node=>node.hidden),false,'a confirmed fee remains available when a real brief reveals the ticket');
 assert.equal(await page.locator('#europeServicePass .europe-service-price strong').isVisible(),true,'the original service fee is visible even with no personal plan');
}
// Observe original browser animations without replacing animate or controllers.
async function observe(page){return page.locator('#visionScene').evaluateHandle(node=>{
 const trace={seen:new Map(),maxConcurrent:0,painted:false,frame:0};
 trace.sample=()=>{
  const active=['clubMedia','boomGlobeMount'].flatMap(id=>document.getElementById(id).getAnimations()).filter(a=>a.playState!=='finished'&&a.playState!=='idle');
  trace.maxConcurrent=Math.max(trace.maxConcurrent,active.length);
  for(const a of active){if(!trace.seen.has(a))trace.seen.set(a,a.effect.getComputedTiming().endTime);if(Number(getComputedStyle(a.effect.target).opacity)<.99)trace.painted=true;}
 };
 function frame(){trace.sample();trace.frame=requestAnimationFrame(frame);}frame();return trace;
});}
async function begun(page,trace){await page.waitForFunction(value=>[...value.seen.keys()].some(a=>a.playState==='running'),trace);}
async function finish(trace){
 const result=await trace.evaluate(async value=>{
  await new Promise(resolve=>setTimeout(resolve,280));value.sample();cancelAnimationFrame(value.frame);
  return {motions:[...value.seen].map(([animation,end])=>({state:animation.playState,end,frames:animation.effect.getKeyframes()})),maxConcurrent:value.maxConcurrent,painted:value.painted,
   active:['clubMedia','boomGlobeMount'].flatMap(id=>document.getElementById(id).getAnimations()).filter(a=>a.playState==='running').length};
 });await trace.dispose();
 assert.equal(result.active,0,'scene feedback is finite');assert.ok(result.maxConcurrent<=1,'rapid choices never stack scene entrances');
 assert.ok(result.motions.every(a=>a.end===220&&a.frames.every(frame=>!frame.transform)),'Dispatch feedback is the intended opacity-only 220ms transition');return result;
}

try{
 browser=await chromium.launch(await launchOptions());
 for(const width of [320,390,768,900,1440])await check('Dispatch '+width+': departure geography, six-city rail and original Rome evidence',width,async({page,requests})=>{
  await start(page);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await ticket(page).isVisible(),false,'empty entry shows no duplicate plan ticket');
  assert.equal(await page.locator('.europe-city-switch [data-europe-city]').count(),6,'the destination directory has six real cities');
  assert.equal(await page.locator('#nextDestinationBoard').count(),1,'there is one original Solari board');
  assert.equal(await page.locator('#nextHeroTitle #nextDestinationBoard').count(),1,'the original board now belongs to the destination heading');
  const heading=await page.locator('#visionCityName').evaluate(node=>({text:node.textContent,box:node.getBoundingClientRect().toJSON(),position:getComputedStyle(node).position,weight:getComputedStyle(node).fontWeight,family:getComputedStyle(node).fontFamily}));
  await boardFits(page,width);assert.equal(heading.text,'Rome');assert.equal(heading.weight,'300');assert.ok(heading.family.startsWith('"Helvetica Neue"'),'the established brand family remains');
  assert.ok(heading.box.width<=1&&heading.box.height<=1&&heading.position==='absolute','the duplicate city text remains accessible but is visually hidden');
  assert.equal(await page.locator('#nextHeroTitle .vision-departure-record').getAttribute('aria-hidden'),'true','mechanical letters do not duplicate the spoken heading');
  assert.equal(await page.locator('body').getAttribute('data-vision-scene'),'world','the original geography owns the departure stage in Rome too');
  assert.equal(await page.locator('#visionSceneTabs').count(),0,'Dispatch has no competing photo/geography mode');
  assert.equal(await page.locator('#clubHomes #clubMedia').isVisible(),true,'the original genuine home story is visible in the Rome homes chapter');
  assert.equal(await page.locator('#visionScene #clubMedia').count(),0,'the home story does not overlap the departure stage');
  await page.locator('#clubHomes #clubMedia').scrollIntoViewIfNeeded();await page.locator('#clubMedia img').first().evaluate(node=>node.decode());assert.equal(await page.locator('#clubMedia img').first().getAttribute('src'),'/dispatch-photo.svg');
  assert.equal(await page.locator('#boomGlobeMount').getAttribute('data-globe-framing'),'horizon','the original renderer owns the horizon');
  const order=await ticket(page).evaluate(node=>({tag:node.tagName,after:!!(document.getElementById('directionClubTicket').compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING),before:!!(node.compareDocumentPosition(document.querySelector('.europe-planner'))&Node.DOCUMENT_POSITION_FOLLOWING),forms:node.querySelectorAll('form,input,select,button[type="submit"]').length}));
  assert.deepEqual(order,{tag:'ASIDE',after:true,before:true,forms:0},'the single semantic summary follows context and precedes the original planner');
  await controls(page,'.europe-city-switch button,#dispatchJourneyTicket a');await noOverflow(page);
  await page.evaluate(()=>{window.__dispatchNodes={ticket:document.getElementById('dispatchJourneyTicket'),form:document.getElementById('nextSearchForm'),media:document.getElementById('clubMedia'),atlas:document.getElementById('boomGlobeMount'),canvas:document.querySelector('.boom-flight-globe-canvas')};});
  const before=await page.locator('#visionScene').boundingBox(),reads=requests.catalogue;
  assert.ok(before.width>0&&before.height>=200,'the original geography has a useful departure stage: '+JSON.stringify(before));
  const geography=await page.locator('.boom-globe-stage').boundingBox();
  assert.ok(geography.height>(width>=900?350:200),'the actual canvas area retains the new departure proportions: '+JSON.stringify(geography));
  const rail=await page.locator('.europe-city-switch').evaluate(node=>({box:node.getBoundingClientRect().toJSON(),buttons:[...node.querySelectorAll('[data-europe-city]')].map(n=>{const text=document.createRange();text.selectNodeContents(n.querySelector('span:last-child'));return {...n.getBoundingClientRect().toJSON(),name:text.getBoundingClientRect().toJSON()};}),hero:document.getElementById('directionClubTicket').getBoundingClientRect().toJSON()}));
  assert.ok(rail.box.top>=rail.hero.bottom-1,'the six-city directory follows the departure stage');
  assert.ok(rail.buttons.every(box=>box.left>=rail.box.left-1&&box.right<=rail.box.right+1),'every destination stays inside its rail');
  assert.ok(rail.buttons.every(box=>box.name.left>=box.left-1&&box.name.right<=box.right+1),'every complete city name fits its actual destination target, including Amsterdam');
  if(width===1440)assert.ok(rail.buttons.every(box=>Math.abs(box.top-rail.buttons[0].top)<1),'desktop presents the six cities in one horizontal rail');
  await controls(page,'.dispatch-lenses button,.panorama-globe-tools button');
  const console=await page.locator('#visionScene .panorama-globe-tools button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  assert.ok(console.every(box=>Math.abs(box.top-console[0].top)<1),'zoom, reset and Pause remain one usable console row');
  if(process.env.BOOM_DISPATCH_CAPTURE_PREFIX){
   await page.locator('#nextHero').screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-rome-departure.png'});
   await page.locator('#clubHomes #clubMedia').screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-rome-original-photo.png'});
  }
  await controls(page,'#boomGlobeMount .boom-globe-caption>a');
  const header=await page.locator('#boomGlobeMount').evaluate(node=>({stage:node.querySelector('.boom-globe-stage').getBoundingClientRect().top,toolbar:node.querySelector('.panorama-globe-toolbar').getBoundingClientRect().bottom,landmark:node.querySelector('#europeCitySignature').getBoundingClientRect().bottom}));
  assert.ok(header.stage>=Math.max(header.toolbar,header.landmark)-1,'geography has reserved space below its landmark and Full view controls: '+JSON.stringify(header));
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  await city(page,'amsterdam');await foreignOffer(page);assert.equal(await ticket(page).isVisible(),false,'city selection alone never invents a personal plan');assert.equal(await page.locator('#europeBriefSummary').isVisible(),false,'the native empty brief is compact too');await boardFits(page,width);await noOverflow(page);
  assert.equal(await page.locator('body').getAttribute('data-vision-scene'),'world','long Amsterdam keeps the departure geography');
  if(process.env.BOOM_DISPATCH_CAPTURE_PREFIX){
   await page.locator('#nextHero').screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-amsterdam-departure.png'});
   await page.locator('#europeDeskStory').screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-amsterdam-service.png'});
  }
  assert.equal(await page.locator('#clubMedia').isVisible(),false,'foreign service does not imply Rome home inventory');
  await city(page,'rome');
  assert.equal(await page.locator('#clubHomes #clubMedia').isVisible(),true,'returning to Rome restores the same genuine home evidence');
  assert.equal(await page.evaluate(()=>Object.entries(window.__dispatchNodes).every(([key,node])=>node===({ticket:document.getElementById('dispatchJourneyTicket'),form:document.getElementById('nextSearchForm'),media:document.getElementById('clubMedia'),atlas:document.getElementById('boomGlobeMount'),canvas:document.querySelector('.boom-flight-globe-canvas')})[key])),true,'scene, full view and city return retain every original node');
  assert.equal(requests.catalogue,reads,'the new presentation does not fetch another home catalogue');
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().fieldEnabled),false,'the hidden background field stays disabled');
 });
 await check('Dispatch brief: live edits, invalid dates and private places stay truthful through native navigation',390,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('boom:pois',JSON.stringify([{name:'Synthetic private office',lat:41.9123,lng:12.5123}])));
  await start(page);await fieldState(page,'open');await serviceState(page,'unselected');
  assert.equal(await row(page,'rent').isVisible(),false,'an unset rent does not occupy a duplicate empty summary row');assert.equal(await row(page,'household').isVisible(),false,'an unset household stays compact');
  await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination-mode="work"]').click();await page.locator('[data-private-place="0"]').click();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
  await publicOnly(page);await fillRome(page);await fieldState(page,'valid');await ticket(page).waitFor({state:'visible'});
  assert.equal(await row(page,'rent').isVisible(),true);assert.equal(await row(page,'household').isVisible(),true,'native selections reveal their real values');
  assert.match(await summary(page,'Dates'),new RegExp(year));assert.match(await summary(page,'Rent'),/1,500/);assert.match(await summary(page,'Household'),/couple/i);
  await page.locator('#visionNeedChooser [data-vision-need="search"]').click();await serviceState(page,'unselected');
  assert.equal(await page.locator('#dispatchJourneyFee').isVisible(),false,'a Rome situation filter never claims a selected paid service');
  assert.doesNotMatch(await ticket(page).innerText(),/€350|PF-0350/,'one filtered option is still not a purchase');
  await page.locator('#nextMoveOut').fill(year+'-01-01');await fieldState(page,'invalid');
  assert.equal(await page.locator('#dispatchJourneyDateIssue').isVisible(),true);
  await page.locator('#dispatchJourneyEdit').click();assert.equal(await page.locator('#nextMoveOut').evaluate(node=>node===document.activeElement),true,'Edit focuses the native invalid field');
  const invalidURL=page.url();await page.locator('#nextSearchForm button[type="submit"]').click();assert.equal(page.url(),invalidURL,'the native validator blocks invalid navigation');
  await page.locator('#nextMoveIn').fill('');await fieldState(page,'invalid');
  await page.locator('#nextMoveOut').fill('');await fieldState(page,'open');await page.locator('#nextBudget').selectOption('');await page.locator('#nextPeople').selectOption('');await ticket(page).waitFor({state:'hidden'});assert.equal(await page.locator('#dispatchJourneyDateIssue').isVisible(),false,'clearing dates removes a stale error');
  await page.locator('#nextMoveIn').focus();await page.keyboard.press('ArrowUp');
  assert.deepEqual(await page.locator('#nextMoveIn').evaluate(node=>({value:node.value,badInput:node.validity.badInput})),{value:'',badInput:true},'a genuinely partial native date can have an empty value');
  await fieldState(page,'invalid');await ticket(page).waitFor({state:'visible'});assert.equal(await page.locator('#dispatchJourneyDateIssue').isVisible(),true,'partial native input is not described as an open-date plan');
  await page.locator('#nextBudget').selectOption('');await page.locator('#nextPeople').selectOption('');
  assert.equal(await row(page,'rent').isVisible(),false);assert.equal(await row(page,'household').isVisible(),false,'clearing native values returns the summary to its compact state');
  await fillRome(page);await fieldState(page,'valid');await publicOnly(page);
  await page.locator('#dispatchJourneyReview').click();assert.equal(await page.locator('#visionNeedChooser').isVisible(),true,'Review returns to the existing Rome choices');
  await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  for(const [key,value] of Object.entries({vision:'dispatch',moveIn:arrival,moveOut:departure,budget:'1500',people:'couple'}))assert.equal(new URL(page.url()).searchParams.get(key),value,'native catalogue keeps '+key);
  await page.locator('#nextResults [data-home="dispatch-home"]').first().click();await page.locator('#nextDetail').waitFor({state:'visible'});
  await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/dispatch-home');
  assert.doesNotMatch(page.url(),/privatePlace|lat=|lng=|Synthetic|vision=/,'the native application handoff excludes preview and private information');
  await page.goBack();await page.locator('#nextDetail').waitFor({state:'visible'});await page.locator('.next-nav .next-brand[data-view="home"]').click();await ticket(page).waitFor({state:'visible'});await fieldState(page,'valid');
  assert.equal(await row(page,'rent').isVisible(),true);assert.equal(await row(page,'household').isVisible(),true,'native history restoration reveals the restored preferences');
  assert.match(await summary(page,'Rent'),/1,500/);await publicOnly(page);
 });
 await check('Dispatch foreign brief: actual offer, currency clearing and native desk handoff',900,async({page})=>{
  await start(page);await fillRome(page);await city(page,'london');await foreignOffer(page);
  assert.equal(await page.locator('#europeServicePass .europe-service-bottom p').isVisible(),true,'Full Search refund remains visible outside the collapsed inclusions');assert.equal(await page.locator('#europeServicePass .europe-service-bottom p').innerText(),JSON.parse(manifest).refund.rule);
  assert.equal(await row(page,'rent').isVisible(),false,'EUR to GBP clearing also hides the obsolete rent row');assert.equal(await row(page,'household').isVisible(),true,'a currency boundary retains the applicable household');
  assert.equal(await page.locator('#europeBudget').inputValue(),'');assert.doesNotMatch(await summary(page,'Rent'),/1,500|£|€/,'a currency boundary never reuses an amount');
  await page.locator('#dispatchJourneyEdit').click();assert.equal(await page.locator('#europeOptionalBrief').getAttribute('open'),'','Edit opens the native optional brief');
  await page.locator('#europeBudget').selectOption('3000');await page.locator('#europePeople').selectOption('family');await page.locator('[data-europe-need="application"]').click();await foreignOffer(page);
  assert.equal(await row(page,'rent').isVisible(),true,'a supplied GBP budget restores the rent row');
  assert.equal(await page.locator('.dispatch-service-ticket #europeServicePass').count(),1);assert.equal(await page.locator('.dispatch-service-ticket #europeDeskForm').count(),1,'the coherent service ticket contains the original form');
  const inclusions=page.locator('details.dispatch-service-inclusions');assert.equal(await inclusions.evaluate(node=>node.open),false);assert.equal(await inclusions.locator('ul li').count()>0,true);
  assert.equal(await page.locator('#europeSelectedService').innerText(),'Your next step','the form heading does not duplicate the selected plan title');
  await inclusions.locator('summary').click();assert.equal(await inclusions.locator('ul').isVisible(),true);await inclusions.locator('summary').click();
  assert.equal(await page.locator('#europeBriefSummary').isVisible(),true);
  assert.match(await summary(page,'Rent'),/£3,000/);assert.match(await summary(page,'Household'),/family/i);
  await page.locator('#europeMoveIn').fill('');await page.locator('#europeMoveOut').fill('');await page.locator('#europeMoveIn').focus();await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#europeMoveIn').evaluate(node=>node.validity.badInput),true);await fieldState(page,'invalid');assert.match(await page.locator('#europeBriefSummary').innerText(),/Check your dates/,'native partial dates stay explicit in the compact service summary');await page.locator('#europeMoveIn').fill(arrival);await page.locator('#europeMoveOut').fill(departure);await fieldState(page,'valid');
  await page.locator('#europeMoveOut').fill(year+'-01-01');await fieldState(page,'invalid');await page.locator('#dispatchJourneyEdit').click();assert.equal(await page.locator('#europeMoveOut').evaluate(node=>node===document.activeElement),true);
  await page.locator('#europeDeskContinue').click();assert.equal(new URL(page.url()).pathname,'/flight-next','the original desk validator owns invalid submission');
  await page.locator('#europeMoveOut').fill(departure);await fieldState(page,'valid');await page.locator('#dispatchJourneyReview').click();assert.equal(await page.locator('#europeServicePass').isVisible(),true);
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
  assert.equal(new URL(page.url()).hash,'#fare-application-pack','handoff reviews the exact fare without opening payment');
  for(const [key,value] of Object.entries({city:'london',need:'application',moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'family'}))assert.equal(new URL(page.url()).searchParams.get(key),value,'the real desk receives '+key);
  await page.goBack();await ticket(page).waitFor({state:'visible'});await foreignOffer(page);assert.match(await summary(page,'Rent'),/£3,000/);
  await city(page,'madrid');await foreignOffer(page);assert.equal(await page.locator('#europeBudget').inputValue(),'');assert.doesNotMatch(await summary(page,'Rent'),/3,000|£|€/);
  assert.equal(await row(page,'rent').isVisible(),false,'GBP to EUR clearing removes the prior amount from view');
 });
 await check('Dispatch service data: delayed stale responses and failure never invent a fee',900,async({page,data})=>{
  data.mode='hold';await start(page,'&city=london');await serviceState(page,'unavailable');await page.waitForFunction(()=>document.getElementById('europeServicePass').textContent.includes('Check the current service'));
  assert.equal(await page.locator('#dispatchJourneyFee').isVisible(),false,'unloaded service data has no displayed fee');
  await city(page,'madrid');await serviceState(page,'unavailable');
  assert.equal(await summary(page,'City'),'Madrid');assert.equal(await page.locator('#dispatchJourneyFee').isVisible(),false,'the next city does not inherit an unconfirmed fee');
  data.mode='error';for(const route of data.pending.splice(0))await route.fulfill({status:503,contentType:'application/json',body:'{}'}).catch(()=>{});
  await city(page,'barcelona');await serviceState(page,'unavailable');assert.equal(await page.locator('#dispatchJourneyFee').isVisible(),false);
  assert.doesNotMatch(await ticket(page).innerText(),/[€£]\s*\d/,'failure never leaves a numerical service fee');
  assert.equal(await page.locator('#europeServicePass [data-europe-desk-link]').evaluate(node=>new URL(node.href).hash),'','unavailable data never promises an exact fare');
  data.mode='hold';await city(page,'amsterdam');await city(page,'london');await serviceState(page,'unavailable');
  // Two real fetches share a manifest. Resolve the latest selection first,
  // then the superseded request, while leaving the native abort/token logic intact.
  assert.equal(data.pending.length,2,'both city requests reach the delayed public boundary');
  const outgoing=data.pending.shift(),incoming=data.pending.shift();
  await incoming.fulfill({contentType:'application/json',body:manifest});await foreignOffer(page);
  const londonFee=await summary(page,'Fee');assert.match(londonFee,/£/);
  await outgoing.fulfill({contentType:'application/json',body:manifest}).catch(()=>{});
  assert.equal(await summary(page,'City'),'London');assert.equal(await summary(page,'Fee'),londonFee,'a late aborted response cannot overwrite the selected city offer');
  data.mode='normal';
  await city(page,'rome');await serviceState(page,'unselected');assert.equal(await page.locator('#dispatchJourneyFee').isVisible(),false,'returning to Rome clears the confirmed foreign fee');
 });
 await check('Dispatch motion: rapid reversal, keyboard, pause and history keep one finite scene',1440,async({page})=>{
  await start(page);let trace=await observe(page);await city(page,'london');await begun(page,trace);await city(page,'rome');let result=await finish(trace);
  assert.equal(result.motions.length,2,'rapid city reversal animates each genuine destination change');assert.equal(result.motions[0].state,'idle','the superseded entrance is cancelled');assert.equal(result.painted,true,'the actual scene pixels fade');
  trace=await observe(page);await city(page,'madrid');await begun(page,trace);await city(page,'amsterdam');result=await finish(trace);assert.equal(result.motions.length,2);assert.equal(result.motions[0].state,'idle');
  trace=await observe(page);await city(page,'london');await begun(page,trace);await page.keyboard.press('Escape');result=await finish(trace);assert.equal(result.motions[0].state,'idle','keyboard input cancels active pointer feedback');
  trace=await observe(page);await page.locator('.europe-city-switch [data-europe-city="rome"]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.body.dataset.europeCity==='rome');result=await finish(trace);assert.equal(result.motions.length,0,'keyboard city selection stays immediate');
  trace=await observe(page);await city(page,'london');await begun(page,trace);await page.locator('#nextMotionToggle').evaluate(node=>node.click());result=await finish(trace);assert.equal(result.motions[0].state,'idle','the original Pause cancels active feedback');
  trace=await observe(page);await city(page,'rome');result=await finish(trace);assert.equal(result.motions.length,0,'paused destination controls remain usable without motion');
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await city(page,'london');await settled(page);
  trace=await observe(page);await city(page,'madrid');await begun(page,trace);await page.goBack();result=await finish(trace);assert.ok(result.motions.every(a=>a.state==='idle'),'Back cancels feedback without adding a history animation');
  assert.equal(await summary(page,'City'),'London');assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);
 },'no-preference');
 await check('Dispatch globe: multi-turn dragging returns by the shortest camera route',1440,async({page})=>{
  await start(page);await settled(page);
  const canvas=page.locator('.boom-flight-globe-canvas');await canvas.scrollIntoViewIfNeeded();
  async function turn(direction){
   const before=await page.evaluate(()=>BoomFlightGlobe.state().angle[0]);
   for(let i=0;i<4;i++){
    // The larger horizon places genuine city buttons over some canvas pixels.
    // Start each real drag on exposed geography, never on a destination button.
    const points=await canvas.evaluate(node=>{const box=node.getBoundingClientRect(),left=box.left+30,right=left+Math.min(600,box.width-60);for(const ratio of [.7,.5,.85,.3,.15]){const y=box.top+box.height*ratio;if(document.elementFromPoint(left,y)===node&&document.elementFromPoint(right,y)===node)return {left,right,y};}return null;});
    assert.ok(points,'the visible original canvas exposes a full native drag path');
    const {left,right,y}=points;await page.mouse.move(direction>0?right:left,y);await page.mouse.down();await page.mouse.move(direction>0?left:right,y,{steps:12});
    assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().dragging),true,'the pointer actually drags the original geographic camera');
    await page.waitForTimeout(110);await page.mouse.up();
   }
   const after=await page.evaluate(()=>BoomFlightGlobe.state().angle[0]);assert.ok(Math.abs(after-before)>360,'actual native drag crosses a full turn: '+(after-before));
  }
  async function shortest(action){
   const trace=await page.evaluateHandle(()=>{const value={angles:[BoomFlightGlobe.state().angle[0]],raf:0};function tick(){value.angles.push(BoomFlightGlobe.state().angle[0]);value.raf=requestAnimationFrame(tick);}tick();return value;});
   await action();const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height*.7);await page.waitForTimeout(920);
   const angles=await trace.evaluate(value=>{cancelAnimationFrame(value.raf);return value.angles;});await trace.dispose();
   const steps=angles.slice(1).map((a,i)=>Math.abs(a-angles[i])),total=steps.reduce((a,b)=>a+b,0);
   assert.ok(total>1&&total<=180.5&&Math.max(...steps)<=180.5,'camera follows the equivalent nearby longitude: '+JSON.stringify({total,max:Math.max(...steps)}));assert.ok(angles.slice(-3).every(angle=>Math.abs(angle-angles.at(-1))<.01),'camera settles at the selected orientation');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().rafPending),false,'hovered settled geography has no pending frame loop');
  }
  await turn(1);await shortest(()=>page.locator('.boom-globe-reset').click());assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().city),'rome');
  await turn(-1);await shortest(()=>city(page,'london'));assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().city),'london');
  assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().error),false);
 },'no-preference');
 await check('Dispatch reduced motion: destinations and original home evidence update without extra animation',390,async({page})=>{
  await start(page);const trace=await observe(page);await city(page,'amsterdam');await foreignOffer(page);await city(page,'rome');const result=await finish(trace);
  assert.equal(result.motions.length,0,'reduced motion never starts the new scene entrance');assert.equal(await summary(page,'City'),'Rome');assert.equal(await page.locator('#clubHomes #clubMedia').isVisible(),true);assert.equal(await page.locator('body').getAttribute('data-vision-scene'),'world');
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().rafPending),false,'the absent field starts no frame loop');await noOverflow(page);
 });

 // Optics are a presentation of the same camera, not a new journey or canvas.
 for(const width of [320,390,900,1440])await check('Dispatch optics and wayfinding '+width,width,async({page})=>{
  await start(page,'&city=milan&need=application');await foreignOffer(page);
  await page.locator('.dispatch-lenses').waitFor({state:'visible'});
  await page.locator('.dispatch-lenses').scrollIntoViewIfNeeded();
  await page.evaluate(()=>{window.__opticsNodes={canvas:document.querySelector('.boom-flight-globe-canvas'),form:document.getElementById('europeDeskForm'),pass:document.getElementById('europeServicePass')};});
  await controls(page,'.dispatch-lenses button');
  if(width===390)assert.ok((await page.locator('.boom-globe-stage').boundingBox()).height>=200,'phone desk geography retains its prior 200px readable canvas after the additional lens controls');
  const beforeURL=page.url(),before=await page.evaluate(()=>BoomFlightGlobe.state());
  assert.equal(before.framing,'horizon');
  await page.locator('[data-panorama-zoom="in"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().zoom===BoomFlightGlobe.state().zoomTarget&&!BoomFlightGlobe.state().rafPending);
  const zoom=await page.evaluate(()=>BoomFlightGlobe.state().zoom);
  const horizon=await page.locator('.boom-flight-globe-canvas').evaluate(n=>n.toDataURL());
  await page.locator('[data-dispatch-lens="globe"]').click();
  await page.waitForFunction(()=>BoomFlightGlobe.state().framingMix===0&&!BoomFlightGlobe.state().rafPending);
  assert.equal(await page.locator('[data-dispatch-lens="globe"]').getAttribute('aria-pressed'),'true');
  assert.notEqual(await page.locator('.boom-flight-globe-canvas').evaluate(n=>n.toDataURL()),horizon,'the original renderer actually paints a different optical frame');
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().zoom),zoom,'lens preserves the original zoom');
  assert.equal(page.url(),beforeURL,'lens changes neither URL nor customer preferences');
  await page.locator('[data-dispatch-lens="horizon"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().framingMix===1&&!BoomFlightGlobe.state().rafPending);
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});
  await page.waitForFunction(()=>{
   const state=BoomFlightGlobe.state(),canvas=document.querySelector('.boom-flight-globe-canvas');
   if(state.effectiveFraming!=='globe'||state.framingMix!==0||state.rafPending||!canvas.width||!canvas.height)return false;
   // Resizing clears pixels before the original renderer's next frame. State
   // alone does not prove the visitor can actually see a painted globe.
   return canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3]>0;
  });
  assert.equal(await page.locator('.dispatch-lenses').isVisible(),false,'full view does not mislabel its whole globe as Horizon');
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().framing),'horizon','full view retains the chosen perspective');
  if(process.env.BOOM_DISPATCH_CAPTURE_PREFIX)await page.screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-fullview.png'});
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>BoomFlightGlobe.state().effectiveFraming==='horizon'&&BoomFlightGlobe.state().framingMix===1);
  assert.equal(await page.evaluate(()=>Object.entries(__opticsNodes).every(([name,node])=>node===({canvas:document.querySelector('.boom-flight-globe-canvas'),form:document.getElementById('europeDeskForm'),pass:document.getElementById('europeServicePass')})[name])),true,'lens/full view preserve the original canvas, offer and form');
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().city),'milan');
  assert.equal(await page.locator('#europeDeskPlanner [aria-pressed="true"]').getAttribute('data-europe-need'),'application');
  if(process.env.BOOM_DISPATCH_CAPTURE_PREFIX){
   await page.locator('#directionClubTicket').screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-horizon.png'});
   await page.locator('[data-dispatch-lens="globe"]').click();await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
   await page.locator('#directionClubTicket').screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-globe.png'});
  }
  await page.locator('.edition-flightline [data-flight-stop="homes"]').click();
  await page.waitForFunction(()=>document.querySelector('.edition-flightline [data-flight-stop="homes"]').getAttribute('aria-current')==='location');
  const foreign=await page.locator('#europeStoryCity').evaluate(node=>{const text=document.createRange();text.selectNodeContents(node);return {text:text.getBoundingClientRect().top,nav:document.querySelector('.next-nav').getBoundingClientRect().bottom,line:document.querySelector('.edition-flightline').getBoundingClientRect().toJSON()};});
  assert.ok(foreign.line.top>=foreign.nav-.5&&foreign.text>=foreign.line.bottom+8,'foreign heading clears both measured bars: '+JSON.stringify(foreign));
  if(process.env.BOOM_DISPATCH_CAPTURE_PREFIX)await page.screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-'+width+'-service.png'});
  await page.locator('.edition-flightline [data-flight-stop="departure"]').click();await city(page,'rome');
  await page.locator('.edition-flightline [data-flight-stop="support"]').click();
  await page.waitForFunction(()=>document.querySelector('.edition-flightline [data-flight-stop="support"]').getAttribute('aria-current')==='location');
  const native=await page.locator('#nextServicesTitle').evaluate(node=>{const text=document.createRange();text.selectNodeContents(node);return {text:text.getBoundingClientRect().top,line:document.querySelector('.edition-flightline').getBoundingClientRect().toJSON()};});
  assert.ok(native.text>=native.line.bottom+8,'Rome support text clears the actual sticky line: '+JSON.stringify(native));
  await noOverflow(page);
 });
 await check('Dispatch optics motion: reversal and lifecycle keep the original finite clock',1440,async({page})=>{
  await start(page,'&city=milan');await page.locator('.dispatch-lenses').scrollIntoViewIfNeeded();
  await page.mouse.move(0,0);await page.locator('[data-dispatch-lens="horizon"]').hover();
  await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  const trace=await page.evaluateHandle(()=>{const t={mix:[],raf:0};function sample(){const s=BoomFlightGlobe.state();t.mix.push({mix:s.framingMix,transition:s.framingTransition});t.raf=requestAnimationFrame(sample);}sample();return t;});
  await page.locator('[data-dispatch-lens="globe"]').click();await page.waitForFunction(()=>{const s=BoomFlightGlobe.state();return s.framingTransition&&s.framingMix>0&&s.framingMix<1;});
  const reversalStart=await page.evaluate(()=>BoomFlightGlobe.state());assert.equal(reversalStart.framingTransition,true,'reverse while the first optical movement is still in progress');
  await page.locator('[data-dispatch-lens="horizon"]').click();await page.waitForFunction(()=>!BoomFlightGlobe.state().framingTransition&&BoomFlightGlobe.state().framingMix===1);
  const frames=await trace.evaluate(t=>{cancelAnimationFrame(t.raf);return t.mix;});await trace.dispose();
  assert.ok(frames.some(f=>f.transition&&f.mix>0&&f.mix<1),'pointer choice produces intermediate real camera frames');
  const deltas=frames.slice(1).map((f,i)=>Math.abs(f.mix-frames[i].mix));assert.ok(Math.max(...deltas)<.5,'reversal continues from the current perspective without a full-frame jump');
  await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  const settledFrames=await page.evaluate(()=>BoomFlightGlobe.state().frames);await page.waitForTimeout(160);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),settledFrames,'hovered settled optics has no perpetual clock');
  if(process.env.BOOM_DISPATCH_CAPTURE_PREFIX){
   await page.screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-motion-settled.png'});
   await page.locator('[data-dispatch-lens="globe"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().framingTransition);
   await page.screenshot({path:process.env.BOOM_DISPATCH_CAPTURE_PREFIX+'-motion-arrival.png'});
   await page.locator('[data-dispatch-lens="horizon"]').click();await page.waitForFunction(()=>!BoomFlightGlobe.state().framingTransition);
  }
  const press=page.locator('[data-dispatch-lens="globe"]'),pressBox=await press.boundingBox();
  await page.mouse.move(pressBox.x+pressBox.width/2,pressBox.y+pressBox.height/2);await page.mouse.down();await page.waitForTimeout(160);
  assert.notEqual(await press.evaluate(n=>getComputedStyle(n).transform),'none','enabled pointer control acknowledges a held press');
  await page.mouse.move(0,0);await page.mouse.up();
  await page.locator('[data-dispatch-lens="globe"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().framingTransition);
  await page.locator('#clubCompany').scrollIntoViewIfNeeded();await page.waitForFunction(()=>!BoomFlightGlobe.state().visible);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().framingTransition),false,'offscreen cancels and settles the finite lens');
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().rafPending||BoomFlightGlobe.state().ambientPending),false,'offscreen camera schedules no drawing');
  await page.locator('.dispatch-lenses').scrollIntoViewIfNeeded();await page.locator('[data-dispatch-lens="horizon"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().framingTransition);
  // Headless Chromium has no OS tab visibility; supply only that platform boundary.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.deepEqual(await page.evaluate(()=>{const s=BoomFlightGlobe.state();return [s.framingTransition,s.rafPending,s.ambientPending];}),[false,false,false],'hidden document owns no camera work');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 },'no-preference');
 await check('Dispatch optics and controls: keyboard, pause and reduced motion are immediate',390,async({page})=>{
  await start(page,'&city=london');await page.locator('.dispatch-lenses').scrollIntoViewIfNeeded();
  const globe=page.locator('[data-dispatch-lens="globe"]'),horizon=page.locator('[data-dispatch-lens="horizon"]');
  await globe.focus();await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>{const s=BoomFlightGlobe.state();return [s.framingMix,s.framingTransition];}),[0,false],'keyboard selection is immediate');
  const focusStyle=await globe.evaluate(n=>({outline:getComputedStyle(n).outlineStyle,transform:getComputedStyle(n).transform}));assert.equal(focusStyle.outline,'solid');assert.equal(focusStyle.transform,'none');
  await page.locator('#nextMotionToggle').click();await horizon.click();
  assert.deepEqual(await page.evaluate(()=>{const s=BoomFlightGlobe.state();return [s.framingMix,s.framingTransition];}),[1,false],'pause preserves a useful instant lens change');
  await page.locator('#nextMotionToggle').click();await page.emulateMedia({reducedMotion:'reduce'});await globe.click();
  assert.deepEqual(await page.evaluate(()=>{const s=BoomFlightGlobe.state();return [s.framingMix,s.framingTransition];}),[0,false],'reduced motion preserves the resulting state without travel');
  await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().ambientPending),false);
  const disabled=page.locator('[data-panorama-zoom="out"]');assert.equal(await disabled.isDisabled(),true);
  assert.equal(await disabled.evaluate(n=>getComputedStyle(n).transform),'none','disabled utility never appears pressed');
 },'no-preference');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('\n  '+passed+' passed · '+failed+' failed');if(failed)process.exitCode=1;
