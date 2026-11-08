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
async function start(page,query='',{generic=false}={}){
 // Native journey scenarios start with an intentional destination. The generic
 // entrance and its presentation-only tour have their own untouched tests.
 const params=new URLSearchParams(query);if(!generic&&!params.has('city'))params.set('city','rome');
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch&'+params,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.homeVision==='dispatch'&&window.BoomFlightGlobe?.state().ready);
 await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});
 await ticket(page).waitFor({state:'attached'});
}
async function city(page,slug){await page.locator('.europe-city-switch [data-europe-city="'+slug+'"]').click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);}
async function settled(page){await page.waitForFunction(()=>!['clubMedia','boomGlobeMount'].some(id=>document.getElementById(id).getAnimations().some(a=>a.playState==='running')));}
async function boardFits(page,width){
 const rects=await page.locator('#nextHeroTitle').evaluate(node=>{const cells=[...node.querySelectorAll('#nextDestinationBoard .fc2')],promise=document.querySelector('#directionClubTicket .hero-promise');return {heading:node.getBoundingClientRect().toJSON(),bay:node.querySelector('.vision-departure-record').getBoundingClientRect().toJSON(),first:cells[0].getBoundingClientRect().toJSON(),last:cells.at(-1).getBoundingClientRect().toJSON(),promise:promise.getBoundingClientRect().toJSON()};});
 assert.ok(rects.first.left>=rects.heading.left-.5&&rects.last.right<=rects.heading.right+.5,'every actual flap fits inside its heading: '+JSON.stringify(rects));
 assert.ok(rects.first.left>=rects.bay.left-.5&&rects.last.right<=rects.bay.right+.5,'every actual flap fits its own mechanical bay: '+JSON.stringify(rects));
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
// The carrier is a decorative outline around native city controls. Observe its
// real compositor frames; neither the browser animation nor its owner is mocked.
const carrier=page=>page.locator('.dispatch-city-carrier');
async function observeCarrier(page){return carrier(page).evaluateHandle(node=>{
 const trace={node,seen:new Map(),positions:[],maxConcurrent:0,raf:0};
 trace.sample=()=>{
  const active=node.getAnimations().filter(animation=>animation.playState!=='finished'&&animation.playState!=='idle');
  trace.maxConcurrent=Math.max(trace.maxConcurrent,active.length);
  for(const animation of active)if(!trace.seen.has(animation))trace.seen.set(animation,animation.effect.getComputedTiming().endTime);
  if(active.length){const box=node.getBoundingClientRect();trace.positions.push({x:box.x,y:box.y,width:box.width,height:box.height,transform:getComputedStyle(node).transform});}
 };
 function sample(){trace.sample();trace.raf=requestAnimationFrame(sample);}sample();return trace;
});}
async function carrierQuiet(page){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>document.querySelector('.dispatch-city-carrier').getAnimations().every(animation=>animation.playState!=='running'&&animation.playState!=='pending'));
}
async function carrierResult(page,trace){
 await carrierQuiet(page);
 const result=await trace.evaluate(value=>{value.sample();cancelAnimationFrame(value.raf);return {motions:[...value.seen].map(([animation,end])=>({state:animation.playState,end,frames:animation.effect.getKeyframes()})),positions:value.positions,maxConcurrent:value.maxConcurrent,active:value.node.getAnimations().filter(animation=>animation.playState==='running').length};});
 await trace.dispose();
 assert.equal(result.active,0,'city feedback finishes without a perpetual animation');
 assert.ok(result.maxConcurrent<=1,'rapid city choices keep one carrier animation');
 assert.ok(result.motions.every(motion=>motion.end===220&&motion.frames.every(frame=>frame.transform&&!['opacity','left','top','width','height'].some(key=>key in frame))),'the carrier animates only a finite220ms transform, leaving native colors and layout intact');
 return result;
}
async function carrierAligned(page){
 const geometry=await carrier(page).evaluate(node=>({carrier:node.getBoundingClientRect().toJSON(),selected:document.querySelector('.europe-city-switch [aria-pressed="true"]').getBoundingClientRect().toJSON(),background:getComputedStyle(node).backgroundColor,hidden:node.getAttribute('aria-hidden'),interactive:node.matches('button,a,input,[tabindex]')}));
 for(const edge of ['left','top','width','height'])assert.ok(Math.abs(geometry.carrier[edge]-geometry.selected[edge])<=1,'the settled carrier matches the actual selected city '+edge+': '+JSON.stringify(geometry));
 assert.equal(geometry.background,'rgba(0, 0, 0, 0)','the decorative outline never replaces the readable native selected color');
 assert.equal(geometry.hidden,'true','the visual carrier adds no duplicate spoken destination');assert.equal(geometry.interactive,false,'the decorative carrier adds no tab stop or second control');
}
async function nativeTourSnapshot(page){return page.evaluate(()=>({
 url:location.href,history:history.length,city:document.body.dataset.europeCity,need:document.body.dataset.europeNeed||'',
 selection:[...document.querySelectorAll('[data-europe-city]')].map(node=>[node.dataset.europeCity,node.getAttribute('aria-pressed')]),
 fields:[...document.querySelectorAll('#nextSearchForm input,#nextSearchForm select,#europeDeskForm input,#europeDeskForm select')].map(node=>[node.id,node.value]),
 offer:document.getElementById('europeServicePass').textContent,globeCity:BoomFlightGlobe.state().city,
 summary:document.getElementById('dispatchJourneyTicket').textContent
}));}
async function tourStopped(page){
 await page.waitForFunction(()=>window.BoomDispatchTour&&!BoomDispatchTour.state().playing&&!BoomDispatchTour.state().timerPending&&!BoomFlightGlobe.state().previewCity);
 const restored=await page.evaluate(()=>({word:document.getElementById('nextDestinationBoard').getAttribute('aria-label'),name:document.querySelector('.europe-city-switch [aria-pressed="true"] span:last-child').textContent.trim(),playing:document.body.dataset.dispatchTour,choose:document.getElementById('dispatchChooseCity').hidden,heading:document.getElementById('nextHeroTitle').getAttribute('aria-label')}));
 assert.equal(restored.word,restored.name.toUpperCase(),'stopping restores the actual selected city on the original board');assert.equal(restored.playing,undefined);assert.equal(restored.choose,true);assert.notEqual(restored.heading,'Real homes in Rome. Rental support across Europe.');
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
  const rail=await page.locator('.europe-city-switch').evaluate(node=>({box:node.getBoundingClientRect().toJSON(),buttons:[...node.querySelectorAll('[data-europe-city]')].map(n=>{const text=document.createRange();text.selectNodeContents(n.querySelector('span:last-child'));return {...n.getBoundingClientRect().toJSON(),name:text.getBoundingClientRect().toJSON()};}),heading:document.getElementById('nextHeroTitle').getBoundingClientRect().toJSON(),inHeadingColumn:node.parentElement.matches('.hero-centre'),beforeScene:!!(node.compareDocumentPosition(document.getElementById('visionScene'))&Node.DOCUMENT_POSITION_FOLLOWING)}));
  assert.ok(rail.inHeadingColumn&&rail.beforeScene&&rail.box.top>=rail.heading.bottom-1,'the original city choice follows the Solari and precedes the globe in reading and focus order');
  assert.ok(rail.buttons.every(box=>box.left>=rail.box.left-1&&box.right<=rail.box.right+1),'every destination stays inside its rail');
  assert.ok(rail.buttons.every(box=>box.name.left>=box.left-1&&box.name.right<=box.right+1),'every complete city name fits its actual destination target, including Amsterdam');
  assert.ok(rail.buttons.every((box,index)=>Math.abs(box.top-rail.buttons[index<3?0:3].top)<1)&&rail.buttons[3].top>=rail.buttons[0].bottom-1,'the six real cities form two compact rows of three');
  assert.equal(await page.locator('.next-journey').isVisible(),true,'Rome retains its native application-to-home explanation');
  const companyPaths=await page.locator('#clubCompany .club-company-links a').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname));
  for(const path of ['/desks','/contract-check-express','/buy-property-europe'])assert.equal(companyPaths.filter(value=>value===path).length,1,'the company keeps one real '+path+' door');
  if(width===390){const choices=page.locator('.europe-city-switch [data-europe-city]');await choices.first().focus();for(let index=1;index<6;index++){await page.keyboard.press('Tab');assert.equal(await choices.nth(index).evaluate(node=>node===document.activeElement),true,'keyboard follows the visible city sequence');}}
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
  assert.equal(await page.locator('.next-journey').isVisible(),false,'a foreign support ticket does not inherit Rome’s application-to-keys story');
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
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().fieldEnabled),true,'Dispatch restores the original Solari background field');
  assert.equal(await page.locator('#nextHeroTitle #nextSolariField').count(),1,'the one original field belongs to the heading aperture');
 });
 for(const composition of ['open','atlas','concourse'])for(const width of [320,390,768,1440])await check('Dispatch composition '+composition+' '+width+': frameless entrance preserves native destination, pulse and geography',width,async({page,requests})=>{
  await start(page,'composition='+composition);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('body').getAttribute('data-dispatch-composition'),composition);
  const shell=await page.locator('#directionClubTicket').evaluate(node=>({radius:getComputedStyle(node).borderRadius,shadow:getComputedStyle(node).boxShadow,border:getComputedStyle(node).borderTopWidth}));
  assert.equal(shell.radius,'0px','the rejected rounded outer shell is absent');assert.equal(shell.shadow,'none','the outer instrument shadow is absent');
  for(const selector of ['#nextDestinationBoard','#nextSolariField','.boom-flight-globe-canvas','#nextSearchForm','#europeDeskForm'])assert.equal(await page.locator(selector).count(),1,'one original '+selector);
  assert.equal(await page.locator('#nextHeroTitle > #nextSolariField').count(),1,'the original pulse keeps its bounded heading aperture');
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().fieldEnabled),true,'the original pulse remains enabled');
  await page.evaluate(()=>{window.__compositionOriginals=[document.getElementById('nextSolariField'),document.getElementById('nextDestinationBoard'),document.querySelector('.boom-flight-globe-canvas'),document.getElementById('nextSearchForm'),document.getElementById('europeDeskForm')];});
  async function fits(){
   await boardFits(page,width);await noOverflow(page);
   await controls(page,'.europe-city-switch button,.edition-plan-link,.dispatch-lenses button,.panorama-globe-tools button');
   const geometry=await page.evaluate(()=>{
    const box=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
    const cities=[...document.querySelectorAll('.europe-city-switch [data-europe-city]')].map(node=>{const name=document.createRange();name.selectNodeContents(node.querySelector('span:last-child'));return {box:node.getBoundingClientRect().toJSON(),name:name.getBoundingClientRect().toJSON()};});
    return {heading:box('#nextHeroTitle'),cities,citiesGroup:box('.europe-city-switch'),promise:box('.hero-promise'),action:box('.edition-plan-link'),scene:box('#visionScene'),stage:box('#visionScene .boom-globe-stage'),canvas:box('#visionScene .boom-flight-globe-canvas'),field:box('#nextSolariField')};
   });
   function noOverlap(a,b,label){assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,label+': '+JSON.stringify({a,b}));}
   noOverlap(geometry.heading,geometry.citiesGroup,'destination and city targets have separate reading space');
   noOverlap(geometry.promise,geometry.action,'supporting copy and action never overlap');
   noOverlap(geometry.field,geometry.citiesGroup,'the original pulse ends before native city choices');
   for(const {box,name} of geometry.cities){assert.ok(name.left>=box.left-1&&name.right<=box.right+1,'complete city name fits its actual target');assert.ok(box.left>=0&&box.right<=width+1,'native city target is not clipped horizontally');}
   assert.ok(geometry.canvas.width>=240&&geometry.canvas.height>=200,'the original geography has a useful visible canvas');
   assert.ok(geometry.stage.left>=geometry.scene.left-1&&geometry.stage.right<=geometry.scene.right+1,'geography stays within its own composition area');
   const topControls=await page.locator('#visionScene .panorama-globe-toolbar button,#visionScene .dispatch-lenses button,#visionScene .panorama-globe-tools button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().toJSON()));
   assert.ok(topControls.every(box=>box.left>=geometry.scene.left-1&&box.right<=geometry.scene.right+1),'all map controls stay inside the scene');
  }
  await fits();
  if(composition==='atlas'&&width===1440){
   const pin=await page.locator('#visionScene button[data-globe-city="rome"]').boundingBox(),canvas=await page.locator('#visionScene .boom-flight-globe-canvas').boundingBox();
   assert.ok(pin&&pin.x>=canvas.x&&pin.x+pin.width<=canvas.x+canvas.width+1&&pin.y>=canvas.y&&pin.y+pin.height<=canvas.y+canvas.height+1,'the selected city remains inside the enlarged geographic canvas');
   const horizon=await page.locator('.boom-flight-globe-canvas').evaluate(node=>node.toDataURL()),beforeURL=page.url();
   await page.locator('[data-dispatch-lens="globe"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().framingMix===0&&!BoomFlightGlobe.state().rafPending);
   assert.notEqual(await page.locator('.boom-flight-globe-canvas').evaluate(node=>node.toDataURL()),horizon,'the wide Atlas horizon can return to the actual whole globe');
   await page.locator('[data-dispatch-lens="horizon"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().framingMix===1&&!BoomFlightGlobe.state().rafPending);
   assert.equal(page.url(),beforeURL,'the Atlas lens changes no journey state');
  }
  if(process.env.BOOM_COMPOSITION_CAPTURE_PREFIX){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:process.env.BOOM_COMPOSITION_CAPTURE_PREFIX+'-'+composition+'-'+width+'.png',scale:'css'});if(composition==='atlas'&&width===1440)await page.locator('#directionClubTicket').screenshot({path:process.env.BOOM_COMPOSITION_CAPTURE_PREFIX+'-'+composition+'-'+width+'-hero.png',scale:'css'});}
  const reads=requests.catalogue;
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),1,'Full view moves the existing globe');
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  await city(page,'amsterdam');await foreignOffer(page);await fits();
  assert.equal(new URL(page.url()).searchParams.get('composition'),composition,'city navigation carries the chosen composition');
  assert.equal(await page.evaluate(()=>window.__compositionOriginals.every((node,index)=>node===[document.getElementById('nextSolariField'),document.getElementById('nextDestinationBoard'),document.querySelector('.boom-flight-globe-canvas'),document.getElementById('nextSearchForm'),document.getElementById('europeDeskForm')][index])),true,'full view and city selection retain original nodes');
  assert.equal(requests.catalogue,reads,'no second catalogue is created for a composition');
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/amsterdam');
  assert.doesNotMatch(page.url(),/composition=|vision=|privatePlace|lat=|lng=/,'the native service door excludes preview presentation and private data');
 });
 await check('Dispatch composition Studio: four layouts preserve a valid public draft and protect an invalid draft',1440,async({page})=>{
  await page.goto(origin+'/flight-studio?experience=dispatch&composition=open&city=rome&privatePlace=synthetic-office&lat=41.9123&lng=12.5123',{waitUntil:'domcontentloaded'});
  const frame=await (await page.locator('#studioFrame').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>document.body.dataset.dispatchComposition==='open'&&!!window.BoomFlightEurope);
  await fillRome(frame);
  for(const composition of ['atlas','concourse','instrument','open']){
   await page.locator('button[data-studio-composition="'+composition+'"]').click();
   await frame.waitForFunction(value=>document.body.dataset.dispatchComposition===value&&!!window.BoomFlightEurope,composition);
   await page.waitForFunction(()=>document.getElementById('studioOpen').getAttribute('aria-disabled')==='false');
   assert.equal(await page.locator('button[data-studio-composition="'+composition+'"]').getAttribute('aria-pressed'),'true');
   const current=new URL(frame.url()),full=new URL(await page.locator('#studioOpen').getAttribute('href'),origin);
   for(const [key,value] of Object.entries({composition,moveIn:arrival,moveOut:departure,budget:'1500',people:'couple'}))assert.equal(current.searchParams.get(key),value,'composition switch retains '+key);
   for(const key of ['privatePlace','lat','lng']){assert.equal(current.searchParams.has(key),false);assert.equal(new URL(page.url()).searchParams.has(key),false);}
   current.searchParams.sort();full.searchParams.sort();assert.equal(current.href,full.href,'full view carries the exact selected composition and public draft');
  }
  await frame.evaluate(()=>{window.__compositionDraftNode=document.getElementById('nextSearchForm');});
  await frame.locator('#nextMoveOut').fill(year+'-01-01');await page.locator('button[data-studio-composition="atlas"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>document.getElementById('nextSearchForm')===window.__compositionDraftNode),true,'invalid dates keep the current form and entered draft');
  assert.equal(await page.locator('button[data-studio-composition="open"]').getAttribute('aria-pressed'),'true');
  await frame.locator('#nextMoveOut').fill(departure);
  for(const device of ['mobile','desktop']){await page.locator('button[data-studio-device="'+device+'"]').click();await frame.waitForFunction(width=>innerWidth===width,device==='mobile'?390:1280);assert.equal(await frame.evaluate(()=>document.getElementById('nextSearchForm')===window.__compositionDraftNode),true,'device changes resize the same form');}
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await noOverflow(page);await controls(page,'button[data-studio-composition]');}
  assert.equal(await page.locator('#studioFrame').count(),1,'all compositions share one preview');
 });
 await check('Dispatch brief: live edits, invalid dates and private places stay truthful through native navigation',390,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('boom:pois',JSON.stringify([{name:'Synthetic private office',lat:41.9123,lng:12.5123}])));
  await start(page,'composition=atlas');await fieldState(page,'open');await serviceState(page,'unselected');
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
  for(const [key,value] of Object.entries({vision:'dispatch',composition:'atlas',moveIn:arrival,moveOut:departure,budget:'1500',people:'couple'}))assert.equal(new URL(page.url()).searchParams.get(key),value,'native catalogue keeps '+key);
  await page.locator('#nextResults [data-home="dispatch-home"]').first().click();await page.locator('#nextDetail').waitFor({state:'visible'});
  const decision=page.locator('#nextDetail .detail-decision');
  assert.equal(await decision.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 255, 255)','the native decision is a readable paper ticket');
  assert.equal(await decision.locator('.club-application-next').count(),1,'the application expectation has one owner');
  assert.match(await decision.locator('.club-application-next').innerText(),/does not reserve the home\. No payment is taken/);
  assert.equal(await decision.locator('.decision-cta > small').isVisible(),false,'the free-application reassurance is not repeated');
  assert.ok(await decision.locator('.club-application-next p').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=15),'the next step remains readable at phone size');
  assert.match(await decision.locator('.edition-costs').innerText(),/Agency fee|Deposit/i);await controls(page,'#nextDetail [data-next-apply]');
  await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/dispatch-home');
  assert.doesNotMatch(page.url(),/privatePlace|lat=|lng=|Synthetic|vision=|composition=/,'the native application handoff excludes preview and private information');
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
  assert.equal(await page.locator('#clubCompany [data-club-rome-service="/contract-check-express"]').getAttribute('href'),'/contract-check-express','a foreign brief never leaks its budget or currency into the new Rome footer door');
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
  assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().rafPending),false,'the restored field stays static under reduced motion');await noOverflow(page);
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
 for(const width of [390,1440])await check('Dispatch carrier '+width+': painted selection and rapid reversal preserve the native journey',width,async({page,requests})=>{
  await start(page);await carrier(page).waitFor({state:'visible'});await page.locator('.europe-city-switch').scrollIntoViewIfNeeded();await carrierAligned(page);
  await page.evaluate(()=>{window.__carrierNodes={canvas:document.querySelector('.boom-flight-globe-canvas'),search:document.getElementById('nextSearchForm'),desk:document.getElementById('europeDeskForm'),offer:document.getElementById('europeServicePass')};});
  const reads=requests.catalogue,initial=await carrier(page).boundingBox(),trace=await observeCarrier(page);
  await city(page,'amsterdam');await begun(page,trace);
  await page.waitForFunction(value=>value.positions.some(box=>Math.abs(box.x-value.positions[0].x)>1||Math.abs(box.y-value.positions[0].y)>1),trace);
  await city(page,'madrid');const result=await carrierResult(page,trace);
  assert.equal(result.motions.length,2,'both genuine pointer choices receive one finite carrier movement');
  assert.equal(result.motions[0].state,'idle','a rapid reversal cancels the superseded movement');
  assert.ok(result.positions.some(box=>Math.abs(box.x-initial.x)>1||Math.abs(box.y-initial.y)>1),'the browser actually paints travel away from the starting cell');
  assert.ok(result.positions.some(box=>box.transform!=='none'),'the moving outline has a real intermediate compositor transform');
  await carrierAligned(page);await foreignOffer(page);
  assert.equal(new URL(page.url()).searchParams.get('city'),'madrid','the URL follows the native choice immediately');
  assert.equal(await page.locator('.europe-city-switch [aria-pressed="true"]').getAttribute('data-europe-city'),'madrid');
  const same=await observeCarrier(page),history=await page.evaluate(()=>history.length),sameURL=page.url();await city(page,'madrid');const repeated=await carrierResult(page,same);
  assert.equal(repeated.motions.length,0,'reselecting the same destination does not invent movement');assert.equal(page.url(),sameURL,'the decoration does not change the native destination URL');assert.equal(await page.evaluate(()=>history.length),history+1,'the existing city controller owns its single history entry; the carrier adds none');
  assert.equal(await page.evaluate(()=>Object.entries(__carrierNodes).every(([key,node])=>node===({canvas:document.querySelector('.boom-flight-globe-canvas'),search:document.getElementById('nextSearchForm'),desk:document.getElementById('europeDeskForm'),offer:document.getElementById('europeServicePass')})[key])),true,'the decoration replaces no original canvas, form or offer');
  assert.equal(await page.locator('.dispatch-city-carrier').count(),1);assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);assert.equal(requests.catalogue,reads,'carrier motion fetches no second catalogue');await noOverflow(page);
 },'no-preference');
 await check('Dispatch carrier lifecycle: keyboard, pause, reduced motion, geometry and page state settle immediately',390,async({page})=>{
  await start(page);await carrier(page).waitFor({state:'visible'});await page.locator('.europe-city-switch').scrollIntoViewIfNeeded();
  let trace=await observeCarrier(page);await page.locator('.europe-city-switch [data-europe-city="amsterdam"]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.body.dataset.europeCity==='amsterdam');
  assert.equal((await carrierResult(page,trace)).motions.length,0,'keyboard selection has no pointer travel');await carrierAligned(page);
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());trace=await observeCarrier(page);await city(page,'madrid');assert.equal((await carrierResult(page,trace)).motions.length,0,'Pause preserves an immediate city choice');await carrierAligned(page);
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await page.emulateMedia({reducedMotion:'reduce'});trace=await observeCarrier(page);await city(page,'london');assert.equal((await carrierResult(page,trace)).motions.length,0,'reduced motion preserves the native selected destination without travel');await carrierAligned(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  async function interrupted(slug,action,reason){const active=await observeCarrier(page);await city(page,slug);await begun(page,active);await action();const result=await carrierResult(page,active);assert.ok(result.motions.length&&result.motions.every(motion=>motion.state==='idle'),reason+' cancels the active carrier');}
  await interrupted('milan',()=>page.keyboard.press('Escape'),'Keyboard input');await carrierAligned(page);
  await interrupted('barcelona',()=>page.setViewportSize({width:320,height:1000}),'A responsive resize');await carrierAligned(page);await noOverflow(page);
  await interrupted('london',()=>page.locator('#clubCompany').evaluate(node=>node.scrollIntoView({behavior:'instant'})),'Leaving the destination rail');
  await page.locator('.europe-city-switch').scrollIntoViewIfNeeded();await carrierQuiet(page);await carrierAligned(page);
  await interrupted('madrid',()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}),'A hidden document');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await carrierQuiet(page);await carrierAligned(page);
  await interrupted('rome',()=>page.locator('#nextSearchForm button[type="submit"]').evaluate(node=>node.click()),'The original catalogue transition');await page.locator('#nextApartments').waitFor({state:'visible'});
  await page.locator('.next-nav .next-brand[data-view="home"]').click();await page.locator('.europe-city-switch').scrollIntoViewIfNeeded();await carrierQuiet(page);await carrierAligned(page);
  await interrupted('milan',()=>page.goBack(),'Native Back');await carrierAligned(page);
  await interrupted('amsterdam',()=>page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide'))),'Pagehide');
  assert.equal(await page.locator('.dispatch-city-carrier').count(),1);assert.equal(await page.locator('#nextSearchForm').count(),1);assert.equal(await page.locator('#europeDeskForm').count(),1);
 },'no-preference');
 await check('Dispatch route trace: native pointer choices paint real geography on the original finite clock',1440,async({page})=>{
  await start(page);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeTrace),false,'initial arrival has no invented route trace');
  await page.evaluate(()=>{window.__routeNodes={canvas:document.querySelector('.boom-flight-globe-canvas'),search:document.getElementById('nextSearchForm'),desk:document.getElementById('europeDeskForm')};});
  const camera=await page.evaluate(()=>BoomFlightGlobe.state());
  await city(page,'madrid');await page.waitForFunction(()=>BoomFlightGlobe.state().routeTrace&&BoomFlightGlobe.state().routeCity==='madrid');
  await page.locator('#boomGlobeMount').hover({position:{x:8,y:8}});
  async function painted(){return page.locator('.boom-flight-globe-canvas').evaluate(node=>{const pixels=node.getContext('2d').getImageData(0,0,node.width,node.height).data;let hash=2166136261,ink=0;for(let i=0;i<pixels.length;i+=16){hash=Math.imul(hash^pixels[i],16777619)>>>0;if(pixels[i+3])ink++;}return {hash,ink,camera:BoomFlightGlobe.state()};});}
  await page.waitForFunction(()=>{const state=BoomFlightGlobe.state();return state.routeTrace&&state.routeProgress>.17&&state.routeProgress<.7;});const travel=await painted();
  assert.equal(travel.camera.routeFrom,'rome');assert.equal(travel.camera.routeCity,'madrid');assert.ok(travel.ink>0,'the existing geographic canvas contains actual painted pixels');
  await page.waitForFunction(()=>{const state=BoomFlightGlobe.state();return state.routeTrace&&state.routeProgress>.73;});const arrival=await painted();
  assert.ok(arrival.camera.frames>travel.camera.frames&&arrival.camera.routeProgress>travel.camera.routeProgress,'route and arrival phases progress on the original renderer frames');assert.notEqual(arrival.hash,travel.hash,'the finite geographic transition changes the actual canvas pixels');
  await page.waitForFunction(()=>!BoomFlightGlobe.state().routeTrace&&!BoomFlightGlobe.state().rafPending);const settled=await painted();
  assert.equal(settled.camera.routeFrom,null);assert.equal(settled.camera.routeCity,null);assert.equal(settled.camera.routeProgress,1,'the temporary route is released on arrival');
  await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),settled.camera.frames,'hovered arrival schedules no extra drawing loop');
  assert.equal(settled.camera.zoom,camera.zoom);assert.equal(settled.camera.framing,camera.framing);assert.equal(new URL(page.url()).searchParams.get('city'),'madrid');await foreignOffer(page);
  await city(page,'rome');await page.waitForFunction(()=>{const s=BoomFlightGlobe.state();return s.routeTrace&&s.routeFrom==='madrid'&&s.routeCity==='rome'&&s.routeProgress>.12;});
  await city(page,'amsterdam');await page.waitForFunction(()=>{const s=BoomFlightGlobe.state();return s.routeTrace&&s.routeFrom==='rome'&&s.routeCity==='amsterdam';});
  assert.equal(await page.locator('.boom-globe-flight').count(),0,'a real geographic connection does not invent a flight overlay');
  await page.locator('#boomGlobeMount').hover({position:{x:8,y:8}});await page.waitForFunction(()=>!BoomFlightGlobe.state().routeTrace&&!BoomFlightGlobe.state().rafPending);
  assert.equal(await page.evaluate(()=>Object.entries(__routeNodes).every(([key,node])=>node===({canvas:document.querySelector('.boom-flight-globe-canvas'),search:document.getElementById('nextSearchForm'),desk:document.getElementById('europeDeskForm')})[key])),true,'trace and reversal retain the original canvas and native forms');assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);
 },'no-preference');
 await check('Dispatch route lifecycle: non-pointer choices and interruptions remove only the temporary trace',1440,async({page})=>{
  await start(page);await page.locator('.europe-city-switch').scrollIntoViewIfNeeded();
  await page.locator('.europe-city-switch [data-europe-city="madrid"]').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeTrace),false,'keyboard choice never starts a geographic trace');
  await page.evaluate(()=>BoomFlightGlobe.selectCity('milan'));assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeTrace),false,'the existing camera API is not mistaken for pointer intent');await page.evaluate(()=>BoomFlightGlobe.selectCity('madrid'));
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await city(page,'london');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeTrace),false,'Pause preserves the new city without a route animation');
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await page.emulateMedia({reducedMotion:'reduce'});await city(page,'milan');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeTrace),false,'reduced motion keeps the native city choice without the new graphic');await page.emulateMedia({reducedMotion:'no-preference'});
  async function interrupted(slug,action,reason){await city(page,slug);await page.waitForFunction(()=>BoomFlightGlobe.state().routeTrace);await action();await page.waitForFunction(()=>!BoomFlightGlobe.state().routeTrace);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeCity),null,reason+' releases the temporary route');}
  await interrupted('madrid',()=>page.keyboard.press('Escape'),'Keyboard input');
  await interrupted('milan',()=>page.locator('[data-panorama-zoom="in"]').click(),'Original zoom');
  await interrupted('madrid',()=>page.locator('[data-dispatch-lens="globe"]').click(),'Original lens selection');
  await interrupted('milan',()=>page.locator('.boom-globe-reset').click(),'Original reset');
  await interrupted('madrid',()=>page.locator('[data-panorama-expand]').click(),'Full view');await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  await interrupted('milan',async()=>{const point=await page.locator('.boom-flight-globe-canvas').evaluate(node=>{const box=node.getBoundingClientRect();return {x:box.left+15,y:box.top+20,exposed:document.elementFromPoint(box.left+15,box.top+20)===node};});assert.equal(point.exposed,true,'direct manipulation begins on exposed geography');await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.up();},'Direct manipulation');
  await interrupted('madrid',()=>page.locator('#clubCompany').evaluate(node=>node.scrollIntoView({behavior:'instant'})),'Offscreen geography');await page.waitForFunction(()=>!BoomFlightGlobe.state().visible&&!BoomFlightGlobe.state().rafPending);await page.locator('.europe-city-switch').scrollIntoViewIfNeeded();
  await interrupted('milan',()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}),'A hidden document');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().rafPending),false);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await interrupted('madrid',()=>page.goBack(),'Native history');
  await interrupted('rome',()=>page.locator('#nextSearchForm button[type="submit"]').evaluate(node=>node.click()),'The original catalogue transition');await page.locator('#nextApartments').waitFor({state:'visible'});await page.locator('.next-nav .next-brand[data-view="home"]').click();
  await interrupted('milan',()=>page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide'))),'Pagehide');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().rafPending),false);
  await page.addInitScript(()=>{const connection=new EventTarget();Object.defineProperty(connection,'saveData',{get:()=>true});Object.defineProperty(navigator,'connection',{configurable:true,get:()=>connection});});await start(page);await city(page,'madrid');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().routeTrace),false,'data saving does not add the decorative route');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().city),'madrid');assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);
 },'no-preference');
 await check('Dispatch Solari field: the original pulse is visible and its aperture owns lifecycle without choosing a city',1440,async({page,requests})=>{
  await page.addInitScript(()=>{
   window.__fieldPaints=0;window.__fieldConnection=new EventTarget();__fieldConnection.saveData=false;
   Object.defineProperty(navigator,'connection',{configurable:true,get:()=>__fieldConnection});
   const clear=CanvasRenderingContext2D.prototype.clearRect;
   CanvasRenderingContext2D.prototype.clearRect=function(){if(this.canvas.id==='nextSolariField')__fieldPaints++;return clear.apply(this,arguments);};
  });
  await start(page);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.waitForFunction(()=>BoomFlightNextMotion.state().fieldVisible&&BoomFlightNextMotion.state().running&&BoomFlightNextMotion.state().rafPending);
  const native=await nativeTourSnapshot(page),reads={...requests};
  const aperture=await page.locator('#nextSolariField').evaluate(node=>{
   window.__originalField=node;window.__originalBoard=document.getElementById('nextDestinationBoard');
   const field=node.getBoundingClientRect(),title=node.closest('h1').getBoundingClientRect(),choices=document.querySelector('.europe-city-switch').getBoundingClientRect();
   return {count:document.querySelectorAll('#nextSolariField').length,hidden:node.getAttribute('aria-hidden'),pointer:getComputedStyle(node).pointerEvents,field:field.toJSON(),title:title.toJSON(),choices:choices.toJSON()};
  });
  assert.equal(aperture.count,1,'there is one original field canvas');assert.equal(aperture.hidden,'true','the field is decorative');assert.equal(aperture.pointer,'none','the field never intercepts the original controls');
  assert.ok(aperture.field.width>aperture.title.width&&aperture.field.height>=aperture.title.height,'the real field frames its heading instead of becoming a second page background');
  assert.ok(aperture.field.bottom<=aperture.choices.top+1,'the pulse ends before the city targets');
  async function snapshot(){return page.locator('#nextSolariField').evaluate(node=>{
   const pixels=node.getContext('2d').getImageData(0,0,node.width,node.height).data;let hash=2166136261,lit=0;
   for(let index=3;index<pixels.length;index+=28){hash=Math.imul(hash^pixels[index],16777619);if(pixels[index]>0)lit++;}
   return {hash:hash>>>0,lit,paints:__fieldPaints,motion:BoomFlightNextMotion.state()};
  });}
  const before=await snapshot();assert.ok(before.lit>20,'the original field paints actual visible pixels');
  await page.waitForFunction(()=>BoomFlightNextMotion.state().nextPulseAt>700);
  const beat=await page.evaluate(()=>BoomFlightNextMotion.state().nextPulseAt);
  await page.waitForFunction(next=>BoomFlightNextMotion.state().elapsedMs>=next+650,beat,{timeout:12000});
  const pulse=await snapshot();assert.ok(pulse.paints>before.paints,'the same canvas paints the recurring pulse');assert.notEqual(pulse.hash,before.hash,'the recurring pulse changes real canvas pixels');
  assert.ok(pulse.motion.nextPulseAt>beat,'the original recurring beat remains active');
  assert.deepEqual(await nativeTourSnapshot(page),native,'ambient field never selects a city, service or plan');assert.deepEqual(requests,reads,'the pulse fetches no catalogue or private data');
  async function stopped(reason){
   await page.waitForFunction(()=>!BoomFlightNextMotion.state().rafPending&&!BoomFlightNextMotion.state().running);
   await page.waitForTimeout(170);const first=await snapshot();await page.waitForTimeout(200);const after=await snapshot();
   assert.equal(after.paints,first.paints,reason+' stops drawing');assert.equal(after.motion.elapsedMs,first.motion.elapsedMs,reason+' freezes the original field clock');
  }
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await stopped('Original Pause');
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());await page.waitForFunction(()=>BoomFlightNextMotion.state().running);
  await page.emulateMedia({reducedMotion:'reduce'});await stopped('Reduced motion');assert.equal(await page.locator('#nextSolariField').isVisible(),true,'reduced motion retains the quiet original field');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>BoomFlightNextMotion.state().running);
  await page.evaluate(()=>{const field=document.getElementById('nextSolariField').getBoundingClientRect();scrollBy({top:field.bottom+20,behavior:'instant'});});
  await page.waitForFunction(()=>!BoomFlightNextMotion.state().fieldVisible);await stopped('Offscreen aperture');
  const hero=await page.locator('#nextHero').evaluate(node=>{const box=node.getBoundingClientRect();return {bottom:box.bottom,top:box.top,viewport:innerHeight};});
  assert.ok(hero.top<hero.viewport&&hero.bottom>0,'the field stops while the larger original hero is still visible');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForFunction(()=>BoomFlightNextMotion.state().fieldVisible&&BoomFlightNextMotion.state().running);
  await page.evaluate(()=>{__fieldConnection.saveData=true;__fieldConnection.dispatchEvent(new Event('change'));});await stopped('Save data');
  await page.evaluate(()=>{__fieldConnection.saveData=false;__fieldConnection.dispatchEvent(new Event('change'));});await page.waitForFunction(()=>BoomFlightNextMotion.state().running);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await stopped('Hidden page');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>BoomFlightNextMotion.state().running);
  assert.equal(await page.evaluate(()=>__originalField===document.getElementById('nextSolariField')&&__originalBoard===document.getElementById('nextDestinationBoard')),true,'every interruption retains the original field and board nodes');
  assert.deepEqual(await nativeTourSnapshot(page),native,'motion controls preserve the native journey throughout');await noOverflow(page);
 },'no-preference');
 await check('Dispatch tour: untouched entry presents all six cities without choosing for the visitor',1440,async({page,requests})=>{
  await start(page,'',{generic:true});await page.waitForFunction(()=>window.BoomDispatchTour?.state().playing);
  const initial=await nativeTourSnapshot(page),reads={...requests},seen=[];
  await page.evaluate(()=>{window.__tourNodes=[document.getElementById('nextDestinationBoard'),document.querySelector('.boom-flight-globe-canvas'),document.getElementById('nextSearchForm'),document.getElementById('europeDeskForm')];});
  assert.equal(new URL(page.url()).searchParams.has('city'),false,'the generic entrance stays generic');
  assert.equal(await page.locator('#nextHeroTitle').getAttribute('aria-label'),'Real homes in Rome. Rental support across Europe.','the spoken proposition does not advertise homes in every preview city');
  assert.equal(await page.locator('#dispatchChooseCity').isVisible(),true);assert.equal(await page.locator('.edition-plan-link').isVisible(),false,'tour presentation does not pair a foreign city with Rome’s original CTA');
  assert.equal(await page.locator('#europeCitySignature').isVisible(),false,'native Rome art is not labelled as a touring city');
  for(let index=0;index<6;index++){
   if(index)await page.waitForFunction(previous=>BoomDispatchTour.state().city!==previous,seen.at(-1));
   const state=await page.evaluate(()=>({tour:BoomDispatchTour.state(),camera:BoomFlightGlobe.state(),word:document.getElementById('nextDestinationBoard').getAttribute('aria-label')}));
   seen.push(state.tour.city);assert.equal(state.tour.timerPending,true);assert.equal(state.camera.previewCity,state.tour.city);assert.equal(state.camera.city,'rome','the presentation camera retains the native Rome selection');
   assert.equal(state.word,state.tour.city.toUpperCase());assert.deepEqual(await nativeTourSnapshot(page),initial,'each preview leaves URL,history,choices,brief and real offer untouched');
   if(state.tour.city==='amsterdam')await boardFits(page,1440);
  }
  assert.equal(new Set(seen).size,6,'all six actual destinations are shown');
  assert.deepEqual([...seen].sort(),await page.locator('.europe-city-switch [data-europe-city]').evaluateAll(nodes=>nodes.map(node=>node.dataset.europeCity).sort()));
  assert.deepEqual(requests,reads,'the tour does not refetch inventory or maps');
  assert.equal(await page.evaluate(()=>__tourNodes.every((node,index)=>node===[document.getElementById('nextDestinationBoard'),document.querySelector('.boom-flight-globe-canvas'),document.getElementById('nextSearchForm'),document.getElementById('europeDeskForm')][index])),true,'one Solari,one canvas and the original forms survive the entire tour');
  await page.locator('#dispatchCityTourToggle').click();await tourStopped(page);assert.deepEqual(await nativeTourSnapshot(page),initial);await noOverflow(page);
 },'no-preference');
 await check('Dispatch tour phone: neutral choice and genuine destination intent restore the native journey',390,async({page})=>{
  await start(page,'',{generic:true});await page.waitForFunction(()=>window.BoomDispatchTour?.state().playing);
  const before=await nativeTourSnapshot(page);await page.waitForFunction(()=>BoomDispatchTour.state().city==='amsterdam');await boardFits(page,390);
  await page.locator('#dispatchChooseCity').click();await tourStopped(page);
  assert.equal(await page.locator('.europe-city-switch [data-europe-city="rome"]').evaluate(node=>node===document.activeElement),true,'Choose city focuses the original selection without choosing another destination');assert.deepEqual(await nativeTourSnapshot(page),before);
  await page.locator('#dispatchCityTourToggle').click();await page.waitForFunction(()=>BoomDispatchTour.state().playing);await city(page,'london');await tourStopped(page);await foreignOffer(page);
  assert.equal(await page.locator('#nextDestinationBoard').getAttribute('aria-label'),'LONDON');assert.equal(await page.locator('.edition-plan-link').isVisible(),true);assert.equal(await page.locator('.next-journey').isVisible(),false);
  const chosen=await nativeTourSnapshot(page);await page.waitForTimeout(5200);assert.deepEqual(await nativeTourSnapshot(page),chosen,'the first real choice permanently releases the idle tour');assert.equal(await page.evaluate(()=>BoomDispatchTour.state().playing),false);
 },'no-preference');
 await check('Dispatch tour deep link: explicit Play preserves the actual foreign brief and fee',900,async({page,requests})=>{
  await start(page,'&city=london&need=application&moveIn='+arrival+'&moveOut='+departure+'&budget=3000&currency=GBP&people=family');await foreignOffer(page);await tourStopped(page);
  assert.equal(await page.evaluate(()=>BoomDispatchTour.state().explicitEntry),true);const before=await nativeTourSnapshot(page),reads={...requests};
  await page.locator('#dispatchCityTourToggle').click();await page.waitForFunction(()=>BoomDispatchTour.state().playing);await page.waitForFunction(()=>BoomDispatchTour.state().city!=='london');assert.deepEqual(await nativeTourSnapshot(page),before);
  await page.keyboard.press('Escape');await tourStopped(page);assert.deepEqual(await nativeTourSnapshot(page),before);assert.deepEqual(requests,reads);await foreignOffer(page);
 },'no-preference');
 await check('Dispatch tour lifecycle: motion preferences and page boundaries release the presentation',1440,async({page})=>{
  await start(page);await tourStopped(page);
  async function interrupt(action,reason){
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.locator('#dispatchCityTourToggle').click();await page.waitForFunction(()=>BoomDispatchTour.state().playing);
   await action();await tourStopped(page);assert.equal(await page.evaluate(()=>BoomDispatchTour.state().timerPending),false,reason+' leaves no scheduled tour');
  }
  await interrupt(()=>page.locator('.europe-city-switch [data-europe-city="rome"]').focus(),'Native keyboard focus');
  await interrupt(()=>page.locator('#nextDestinationBoard').hover(),'Reading the board');
  await interrupt(()=>page.locator('[data-panorama-expand]').click(),'Full view');await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  await interrupt(()=>page.evaluate(()=>BoomFlightGlobe.setZoom(1.15)),'Native camera API');
  await interrupt(()=>page.emulateMedia({reducedMotion:'reduce'}),'Reduced motion');assert.equal(await page.locator('#dispatchCityTourToggle').isDisabled(),true);await page.emulateMedia({reducedMotion:'no-preference'});
  await interrupt(()=>page.locator('#nextMotionToggle').evaluate(node=>node.click()),'Original Pause');assert.equal(await page.locator('#dispatchCityTourToggle').isDisabled(),true);await page.locator('#nextMotionToggle').evaluate(node=>node.click());
  await interrupt(()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}),'Hidden document');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await interrupt(()=>page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide'))),'Pagehide');await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await interrupt(()=>page.locator('#clubCompany').evaluate(node=>node.scrollIntoView({behavior:'instant'})),'Leaving the hero');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await city(page,'london');await foreignOffer(page);
  await interrupt(()=>page.goBack(),'Native history');assert.equal(await page.locator('body').getAttribute('data-europe-city'),'rome');
  await interrupt(()=>page.locator('#nextSearchForm button[type="submit"]').evaluate(node=>node.click()),'Original catalogue navigation');await page.locator('#nextApartments').waitFor({state:'visible'});await page.locator('.next-nav .next-brand[data-view="home"]').click();await tourStopped(page);
  await page.waitForTimeout(5200);assert.equal(await page.evaluate(()=>BoomDispatchTour.state().playing),false,'returning to visibility does not restart a stopped tour');
 },'no-preference');
 await check('Dispatch tour restrictions: reduced motion, explicit intent and save-data never auto-play',390,async({page})=>{
  await start(page,'',{generic:true});await tourStopped(page);assert.equal(await page.locator('#dispatchCityTourToggle').isDisabled(),true);await page.waitForTimeout(5200);await tourStopped(page);
  await page.emulateMedia({reducedMotion:'no-preference'});await start(page,'&need=search',{generic:true});await tourStopped(page);assert.equal(await page.evaluate(()=>BoomDispatchTour.state().explicitEntry),true);
  await page.addInitScript(()=>{const connection=new EventTarget();Object.defineProperty(connection,'saveData',{get:()=>true});Object.defineProperty(navigator,'connection',{configurable:true,get:()=>connection});});await start(page,'',{generic:true});await tourStopped(page);assert.equal(await page.locator('#dispatchCityTourToggle').isDisabled(),true);assert.equal(await page.locator('#nextDestinationBoard').count(),1);assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);
 });
 await check('Dispatch tour keyboard: Enter and Space activate Pause and Choose city exactly once',390,async({page})=>{
  await start(page);await tourStopped(page);const before=await nativeTourSnapshot(page);
  for(const key of ['Enter','Space']){
   await page.locator('#dispatchCityTourToggle').click();await page.waitForFunction(()=>BoomDispatchTour.state().playing);
   await page.keyboard.press(key);await tourStopped(page);
   assert.equal(await page.locator('#dispatchCityTourToggle').evaluate(node=>node===document.activeElement),true,'pausing keeps keyboard focus on its control');
   await page.keyboard.press(key);await page.waitForFunction(()=>BoomDispatchTour.state().playing);
   await page.locator('#dispatchChooseCity').focus();await page.keyboard.press(key);await tourStopped(page);
   assert.equal(await page.locator('.europe-city-switch [aria-pressed="true"]').evaluate(node=>node===document.activeElement),true,'Choose city sends keyboard focus to the original selected destination');
   assert.deepEqual(await nativeTourSnapshot(page),before,'keyboard tour controls neither select a city nor change the native brief');
  }
 },'no-preference');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('\n  '+passed+' passed · '+failed+' failed');if(failed)process.exitCode=1;
