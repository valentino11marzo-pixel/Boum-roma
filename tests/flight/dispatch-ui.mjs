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
 await ticket(page).waitFor({state:'visible'});
}
async function city(page,slug){await page.locator('.europe-city-switch [data-europe-city="'+slug+'"]').click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);}
async function scene(page,value){await page.locator('#visionSceneTabs [data-vision-scene="'+value+'"]').click();await page.waitForFunction(scene=>document.body.dataset.visionScene===scene,value);}
async function settled(page){await page.waitForFunction(()=>!['clubMedia','boomGlobeMount'].some(id=>document.getElementById(id).getAnimations().some(a=>a.playState==='running')));}
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
 const native=await page.locator('#europeServicePass').evaluate(node=>({fee:node.querySelector('.europe-service-price strong').textContent,condition:node.querySelector('.europe-service-price small').textContent,selected:document.getElementById('europeSelectedService').textContent}));
 assert.equal(await summary(page,'Support'),native.selected,'the ticket uses the actual selected native service');
 const fee=await summary(page,'Fee');assert.ok(fee.includes(native.fee)&&fee.includes(native.condition),'the actual fee and its condition stay together: '+fee);
 assert.equal(await page.locator('#dispatchJourneyFee').isVisible(),true);
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
 for(const width of [320,390,900,1440])await check('Dispatch '+width+': compact opening and stable original scene',width,async({page,requests})=>{
  await start(page);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.europe-city-switch [data-europe-city]').count(),6,'the destination directory has six real cities');
  assert.equal(await page.locator('#nextDestinationBoard').count(),1,'there is one original Solari board');
  assert.equal(await page.locator('#nextHeroTitle #nextDestinationBoard').count(),1,'the original board now belongs to the destination heading');
  const heading=await page.locator('#visionCityName').evaluate(node=>({text:node.textContent,box:node.getBoundingClientRect().toJSON(),position:getComputedStyle(node).position,weight:getComputedStyle(node).fontWeight,family:getComputedStyle(node).fontFamily}));
  assert.equal(heading.text,'Rome');assert.equal(heading.weight,'300');assert.ok(heading.family.startsWith('"Helvetica Neue"'),'the established brand family remains');
  assert.ok(heading.box.width<=1&&heading.box.height<=1&&heading.position==='absolute','the duplicate city text remains accessible but is visually hidden');
  assert.equal(await page.locator('#nextHeroTitle .vision-departure-record').getAttribute('aria-hidden'),'true','mechanical letters do not duplicate the spoken heading');
  assert.equal(await page.locator('body').getAttribute('data-vision-scene'),'homes','Rome still opens with a genuine home');
  await page.locator('#clubMedia img').first().evaluate(node=>node.decode());assert.equal(await page.locator('#clubMedia img').first().getAttribute('src'),'/dispatch-photo.svg');
  assert.equal(await page.locator('#boomGlobeMount').getAttribute('data-globe-framing'),'horizon','the original renderer owns the horizon');
  const order=await ticket(page).evaluate(node=>({tag:node.tagName,after:!!(document.getElementById('directionClubTicket').compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING),before:!!(node.compareDocumentPosition(document.querySelector('.europe-planner'))&Node.DOCUMENT_POSITION_FOLLOWING),forms:node.querySelectorAll('form,input,select,button[type="submit"]').length}));
  assert.deepEqual(order,{tag:'ASIDE',after:true,before:true,forms:0},'the single semantic summary follows context and precedes the original planner');
  await controls(page,'.europe-city-switch button,#visionSceneTabs button,#dispatchJourneyTicket a');await noOverflow(page);
  await page.evaluate(()=>{window.__dispatchNodes={ticket:document.getElementById('dispatchJourneyTicket'),form:document.getElementById('nextSearchForm'),media:document.getElementById('clubMedia'),atlas:document.getElementById('boomGlobeMount'),canvas:document.querySelector('.boom-flight-globe-canvas')};});
  const before=await page.locator('#visionScene').boundingBox(),reads=requests.catalogue;
  await scene(page,'world');await settled(page);const world=await page.locator('#visionScene').boundingBox();
  assert.ok(Math.abs(world.height-before.height)<=2,'homes and geography share a stable stage: '+JSON.stringify({homes:before.height,world:world.height}));
  await controls(page,'#boomGlobeMount .boom-globe-caption>a');
  const header=await page.locator('#boomGlobeMount').evaluate(node=>({stage:node.querySelector('.boom-globe-stage').getBoundingClientRect().top,toolbar:node.querySelector('.panorama-globe-toolbar').getBoundingClientRect().bottom,landmark:node.querySelector('#europeCitySignature').getBoundingClientRect().bottom}));
  assert.ok(header.stage>=Math.max(header.toolbar,header.landmark)-1,'geography has reserved space below its landmark and Full view controls: '+JSON.stringify(header));
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  await scene(page,'homes');await city(page,'amsterdam');await page.locator('#visionSceneTabs').waitFor({state:'hidden'});await foreignOffer(page);await noOverflow(page);
  assert.equal(await page.locator('#clubMedia').isVisible(),false,'foreign service does not imply Rome home inventory');
  await city(page,'rome');
  assert.equal(await page.evaluate(()=>Object.entries(window.__dispatchNodes).every(([key,node])=>node===({ticket:document.getElementById('dispatchJourneyTicket'),form:document.getElementById('nextSearchForm'),media:document.getElementById('clubMedia'),atlas:document.getElementById('boomGlobeMount'),canvas:document.querySelector('.boom-flight-globe-canvas')})[key])),true,'scene, full view and city return retain every original node');
  assert.equal(requests.catalogue,reads,'the new presentation does not fetch another home catalogue');
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().fieldEnabled),false,'the hidden background field stays disabled');
 });
 await check('Dispatch brief: live edits, invalid dates and private places stay truthful through native navigation',390,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('boom:pois',JSON.stringify([{name:'Synthetic private office',lat:41.9123,lng:12.5123}])));
  await start(page);await fieldState(page,'open');await serviceState(page,'unselected');
  assert.equal(await row(page,'rent').isVisible(),false,'an unset rent does not occupy a duplicate empty summary row');assert.equal(await row(page,'household').isVisible(),false,'an unset household stays compact');
  await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination-mode="work"]').click();await page.locator('[data-private-place="0"]').click();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
  await publicOnly(page);await fillRome(page);await fieldState(page,'valid');
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
  await page.locator('#nextMoveOut').fill('');await fieldState(page,'open');assert.equal(await page.locator('#dispatchJourneyDateIssue').isVisible(),false,'clearing dates removes a stale error');
  await page.locator('#nextMoveIn').focus();await page.keyboard.press('ArrowUp');
  assert.deepEqual(await page.locator('#nextMoveIn').evaluate(node=>({value:node.value,badInput:node.validity.badInput})),{value:'',badInput:true},'a genuinely partial native date can have an empty value');
  await fieldState(page,'invalid');assert.equal(await page.locator('#dispatchJourneyDateIssue').isVisible(),true,'partial native input is not described as an open-date plan');
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
  assert.equal(await row(page,'rent').isVisible(),false,'EUR to GBP clearing also hides the obsolete rent row');assert.equal(await row(page,'household').isVisible(),true,'a currency boundary retains the applicable household');
  assert.equal(await page.locator('#europeBudget').inputValue(),'');assert.doesNotMatch(await summary(page,'Rent'),/1,500|£|€/,'a currency boundary never reuses an amount');
  await page.locator('#dispatchJourneyEdit').click();assert.equal(await page.locator('#europeOptionalBrief').getAttribute('open'),'','Edit opens the native optional brief');
  await page.locator('#europeBudget').selectOption('3000');await page.locator('#europePeople').selectOption('family');await page.locator('[data-europe-need="application"]').click();await foreignOffer(page);
  assert.equal(await row(page,'rent').isVisible(),true,'a supplied GBP budget restores the rent row');
  assert.match(await summary(page,'Rent'),/£3,000/);assert.match(await summary(page,'Household'),/family/i);
  await page.locator('#europeMoveOut').fill(year+'-01-01');await fieldState(page,'invalid');await page.locator('#dispatchJourneyEdit').click();assert.equal(await page.locator('#europeMoveOut').evaluate(node=>node===document.activeElement),true);
  await page.locator('#europeDeskContinue').click();assert.equal(new URL(page.url()).pathname,'/flight-next','the original desk validator owns invalid submission');
  await page.locator('#europeMoveOut').fill(departure);await fieldState(page,'valid');await page.locator('#dispatchJourneyReview').click();assert.equal(await page.locator('#europeServicePass').isVisible(),true);
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
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
  await start(page);let trace=await observe(page);await scene(page,'world');await begun(page,trace);await scene(page,'homes');let result=await finish(trace);
  assert.equal(result.motions.length,2,'rapid reversal animates each genuine scene change');assert.equal(result.motions[0].state,'idle','the superseded entrance is cancelled');assert.equal(result.painted,true,'the actual scene pixels fade');
  trace=await observe(page);await city(page,'london');await begun(page,trace);await city(page,'rome');result=await finish(trace);assert.equal(result.motions.length,2);assert.equal(result.motions[0].state,'idle');
  trace=await observe(page);await scene(page,'world');await begun(page,trace);await page.keyboard.press('Escape');result=await finish(trace);assert.equal(result.motions[0].state,'idle','keyboard input cancels active pointer feedback');
  trace=await observe(page);await page.locator('#visionSceneTabs [data-vision-scene="homes"]').focus();await page.keyboard.press('Enter');result=await finish(trace);assert.equal(result.motions.length,0,'keyboard selection stays immediate');
  trace=await observe(page);await scene(page,'world');await begun(page,trace);await page.locator('#nextMotionToggle').evaluate(node=>node.click());result=await finish(trace);assert.equal(result.motions[0].state,'idle','the original Pause cancels active feedback');
  trace=await observe(page);await scene(page,'homes');result=await finish(trace);assert.equal(result.motions.length,0,'paused scene controls remain usable without motion');
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await city(page,'london');await settled(page);
  trace=await observe(page);await city(page,'madrid');await begun(page,trace);await page.goBack();result=await finish(trace);assert.ok(result.motions.every(a=>a.state==='idle'),'Back cancels feedback without adding a history animation');
  assert.equal(await summary(page,'City'),'London');assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);
 },'no-preference');
 await check('Dispatch reduced motion: cities and scenes update without extra animation',390,async({page})=>{
  await start(page);const trace=await observe(page);await scene(page,'world');await city(page,'amsterdam');await foreignOffer(page);await city(page,'rome');await scene(page,'homes');const result=await finish(trace);
  assert.equal(result.motions.length,0,'reduced motion never starts the new scene entrance');assert.equal(await summary(page,'City'),'Rome');assert.equal(await page.locator('#clubMedia').isVisible(),true);
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().rafPending),false,'the absent field starts no frame loop');await noOverflow(page);
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('\n  '+passed+' passed · '+failed+' failed');if(failed)process.exitCode=1;
