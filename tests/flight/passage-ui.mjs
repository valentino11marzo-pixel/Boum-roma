// Passage exposes the original service promise, scope and native price/action stub.
// Labelled synthetic fixtures stop
// network boundaries only; all city, brief, fee and navigation owners are real.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium(),focus=process.argv[2]||'';
const artifacts=process.env.BOOM_FLIGHT_ARTIFACT_DIR||'',year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const manifestText=readFileSync(root+'assets/boom-desks-public.json','utf8'),manifest=JSON.parse(manifestText);
const cities=['rome','madrid','barcelona','amsterdam','london','milan'];
const home={id:'passage-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9,lng:12.49,images:['/passage-photo.svg'],description:'Synthetic public test boundary, never a real home or customer.'};
const mapHTML='<!doctype html><html><body>Skyline rendering boundary<script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},refreshPlaces(){},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
if(artifacts)mkdirSync(artifacts,{recursive:true});
console.log('\n▸ flightpassageui  One destination scene, one native decision, intact public journeys');
if(!chromium){console.log('  SKIP: playwright unavailable — Passage browser checks did not run');process.exit(0);}
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/passage-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn,motion='reduce'){
 if(focus&&!name.includes(focus))return;
 const page=await browser.newPage({viewport:{width,height:width===390?844:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion}),errors=[],writes=[],missing=[],privateReads=[],requests={catalogue:0},data={manifest:'normal',geography:'normal',pending:[]};
 await page.addInitScript(()=>{
  const ids=['nextDestinationBoard','nextSolariField','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'];window.__passageBirthNodes=new Map();
  const observe=new MutationObserver(()=>{for(const id of ids){const node=document.getElementById(id);if(node&&!__passageBirthNodes.has(id))__passageBirthNodes.set(id,node);}const canvas=document.querySelector('.boom-flight-globe-canvas');if(canvas&&!window.__passageBirthCanvas)window.__passageBirthCanvas=canvas;if(document.body?.dataset.airspaceReady==='true')observe.disconnect();});
  observe.observe(document,{childList:true,subtree:true});
 });
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&r.status()>=400&&!/boom-(desks-public|globe-geography)\.json/.test(r.url()))missing.push(new URL(r.url()).pathname);});
 await page.context().route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings'){requests.catalogue++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:[home]})});}
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname==='/assets/boom-desks-public.json'){
   if(data.manifest==='hold'){data.pending.push(route);return;}
   if(data.manifest==='error')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic service boundary unavailable"}'});
  }
  if(url.pathname==='/assets/boom-globe-geography.json'&&data.geography==='error')return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  if(url.pathname.startsWith('/listing/')||/^\/(barcelona|madrid|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Original service boundary</h1><p>No application or payment sent.</p>'});
  return route.continue();
 });
 try{await fn({page,data,requests});assert.deepEqual(errors,[],'no unhandled browser errors');assert.deepEqual(writes,[],'no application or payment write');assert.deepEqual(missing,[],'actual assets loaded');assert.deepEqual(privateReads,[],'private configuration stays private');passed++;console.log('  ✓ '+name);}
 catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);console.log(error.stack);if(artifacts)await page.screenshot({path:artifacts+'/passage-failure-'+failed+'.png'}).catch(()=>{});}
 finally{for(const route of data.pending)await route.abort().catch(()=>{});await page.close();}
}
async function start(page,query='city=rome',geography=true){
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch&composition=passage&'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.airspaceReady==='true'&&!!window.BoomFlightEurope);
 await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});
 if(geography)await page.waitForFunction(()=>BoomFlightGlobe.state().ready);
 await page.evaluate(async()=>{await document.fonts.ready;window.__passageOriginals=['nextDestinationBoard','nextSolariField','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'].map(id=>__passageBirthNodes.get(id));window.__passageCanvas=__passageBirthCanvas;window.__passageControllers=[window.BoomFlightEurope,window.BoomFlightGlobe,window.BoomDispatchTour];});
}
async function city(page,slug,touch=false){const button=page.locator('.europe-city-switch [data-europe-city="'+slug+'"]');if(touch)await button.tap();else await button.click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);}
async function offer(page,slug,planId='full-search'){
 const plan=manifest.cities[slug].pricing.plans.find(p=>p.id===planId);assert.ok(plan,'real public plan exists');
 await page.waitForFunction(value=>document.querySelector('#europeServicePass .europe-service-copy h3')?.textContent===value,plan.label);
 const expected=new Intl.NumberFormat('en-GB',{style:'currency',currency:manifest.cities[slug].currency,maximumFractionDigits:0}).format(plan.price);
 assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),expected,'exact manifest price');
 assert.equal(await page.locator('#europeServicePass .europe-service-price small').innerText(),plan.condition,'condition stays with the price');
 const scope=await page.locator('#europeServicePass .dispatch-service-inclusions').textContent();
 for(const line of plan.includes)assert.ok(scope.includes(line),'complete real scope remains available in the native disclosure');
 assert.equal(await page.locator('#europeDeskContinue').isVisible(),true,'native next action is visible');
 const description=page.locator('#europeServicePass .europe-service-copy>p:not(.eyebrow)');
 assert.equal(await description.innerText(),plan.offerDescription,'actual promise is on the ticket body');assert.equal(await description.isVisible(),true,'actual promise is visible before opening any details');
 assert.equal(await page.locator('#europeServicePass .europe-service-price p').innerText(),manifest.cities[slug].hero.faresHead.b,'exact public VAT / fee note');
 const refund=page.locator('#europeServicePass .europe-service-bottom>p');
 if(planId==='full-search'){assert.equal(await refund.innerText(),manifest.refund.rule,'exact shared refund promise');assert.equal(await refund.isVisible(),true,'refund visible before continuing');}
 else assert.equal(await refund.count(),0,'Full Search refund does not leak to another service');
}
async function originals(page){
 assert.equal(await page.evaluate(()=>__passageOriginals.every((n,i)=>n===document.getElementById(['nextDestinationBoard','nextSolariField','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'][i]))&&__passageCanvas===document.querySelector('.boom-flight-globe-canvas')&&__passageControllers.every((v,i)=>v===[window.BoomFlightEurope,window.BoomFlightGlobe,window.BoomDispatchTour][i])),true,'same native forms, Solari, signature and globe');
 assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1,'one native globe renderer');
 for(const id of ['nextSearchForm','europeDeskForm','europeCitySignature','nextSolariField'])assert.equal(await page.locator('#'+id).count(),1,'one '+id);
}
async function fit(page,width){
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 const geometry=await page.evaluate(()=>{
  const box=node=>node?.getBoundingClientRect().toJSON()||null;
  const hit=node=>{const r=node.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return target===node||node.contains(target);};
  const buttons=[...document.querySelectorAll('.europe-city-switch button[data-europe-city]')],needs=[...document.querySelectorAll('[data-europe-need]')];
  return{width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,world:box(document.querySelector('.boom-globe-stage')),stage:box(document.getElementById('directionClubTicket')),decision:box(document.getElementById('airspaceDecision')),cities:buttons.map(box),cityHit:buttons.map(hit),foreign:!document.getElementById('europeDeskStory').hidden,rail:box(document.getElementById('europeDeskPlanner')),ticket:box(document.querySelector('.dispatch-service-ticket')),body:box(document.querySelector('.europe-service-copy')),description:box(document.querySelector('.europe-service-copy>p:not(.eyebrow)')),scope:box(document.querySelector('.dispatch-service-inclusions')),price:box(document.querySelector('.europe-service-price')),form:box(document.getElementById('europeDeskForm')),action:box(document.getElementById('europeDeskContinue')),brief:box(document.querySelector('#europeOptionalBrief>summary')),signature:box(document.getElementById('europeCitySignature')),romeAction:box(document.querySelector('#airspaceDecision>.edition-plan-link')),needs:needs.map(box),rome:!document.getElementById('nextSearch').closest('[hidden]'),selectedNeeds:needs.filter(n=>n.getAttribute('aria-pressed')==='true').length};
 });
 assert.ok(geometry.scroll<=width+1,'no horizontal overflow '+JSON.stringify(geometry));
 assert.equal(geometry.cities.length,6,'all native destinations remain selectable');
 for(const b of geometry.cities)assert.ok(b.width>=44&&b.height>=44&&b.left>=-1&&b.right<=width+1,'each destination is a usable in-frame target '+JSON.stringify(b));
 assert.ok(geometry.cityHit.every(Boolean),'original destination controls are unobscured');
 assert.ok(geometry.stage.bottom<=geometry.decision.top+1,'geography precedes the decision');
 assert.notEqual(geometry.rome,geometry.foreign,'only the relevant original planner is displayed');
 if(geometry.rome&&geometry.romeAction?.width&&geometry.signature?.width){const a=geometry.signature,b=geometry.romeAction;assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,'Rome city signature must not cover its native Browse homes action '+JSON.stringify({signature:a,action:b}));}
 if(geometry.foreign){
  assert.equal(geometry.selectedNeeds,1,'only the chosen native need is pressed');
  assert.ok(geometry.rail.bottom<=geometry.ticket.top+1,'need rail precedes the single selected ticket '+JSON.stringify(geometry));
  for(const [index,a] of geometry.needs.entries()){
   assert.ok(a.width>=44&&a.height>=44&&a.left>=-1&&a.right<=width+1,'each service choice remains a touch target');
   for(const b of geometry.needs.slice(index+1))assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,'service choices do not overlap');
  }
  for(const key of ['body','description','scope','price','form','action']){const b=geometry[key];assert.ok(b&&b.width>0&&b.height>0&&b.left>=-1&&b.right<=width+1,'native '+key+' fits without clipping '+JSON.stringify(geometry));}
  assert.ok(geometry.price.bottom<=geometry.action.top,'fee precedes the next action');
  if(width>760)assert.ok(geometry.price.bottom<=geometry.brief.top,'complete fee and condition clear the native brief disclosure '+JSON.stringify({price:geometry.price,brief:geometry.brief}));
  if(width>=1024){assert.ok(geometry.body.right<=geometry.price.left+1,'service body sits beside its price stub');assert.ok(geometry.price.left<geometry.action.right&&geometry.price.right>geometry.action.left,'fee and native action share the same stub');}
  console.log('    measured '+JSON.stringify({width,height:geometry.height,city:await page.evaluate(()=>document.body.dataset.europeCity),firstServiceChoiceTop:Math.round(geometry.rail.top),feeTop:Math.round(geometry.price.top),actionTop:Math.round(geometry.action.top),actionBottom:Math.round(geometry.action.bottom),feeToAction:Math.round(geometry.action.top-geometry.price.bottom)}));
 }
 return geometry;
}
async function editBrief(page){const details=page.locator('#europeOptionalBrief');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();}
async function fillRome(page){await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');}
async function capture(page,slug,width,suffix=''){
 if(!artifacts)return;
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 const prefix=artifacts+'/passage-'+slug+'-'+width+suffix;
 await page.screenshot({path:prefix+'.png'});await page.screenshot({path:prefix+'-full.png',fullPage:true});
 const proof=await page.evaluate(()=>{
  const selectors=['.next-nav','#directionClubTicket','#airspaceDecision','#nextHeroTitle','[data-panorama-expand]','.hero-promise','.edition-plan-link','#europeDeskContinue','.search-submit','.edition-runway-head','#nextSearchForm>label>span','#nextStayHint'];
  return Object.fromEntries(selectors.map(selector=>{const el=document.querySelector(selector),style=el&&getComputedStyle(el);return [selector,el?{box:el.getBoundingClientRect().toJSON(),color:style.color,background:style.backgroundColor,display:style.display,text:el.innerText.slice(0,160)}:null];}));
 });writeFileSync(prefix+'.json',JSON.stringify(proof,null,2));
}
try{
 browser=await chromium.launch(launchOptions());
 for(const width of [1440,390,320,1024])await check('Geometry '+width+': complete city selection and native decision remain legible',width,async({page})=>{
  await start(page);
  for(const slug of cities){if(slug!=='rome')await city(page,slug,width<500);if(slug!=='rome'){for(const [need,id] of [['search','full-search'],['application','application-pack'],['viewing','attended-viewing']]){await page.locator('[data-europe-need="'+need+'"]').click();await offer(page,slug,id);await fit(page,width);await originals(page);}await page.locator('[data-europe-need="search"]').click();await offer(page,slug);}else{await fit(page,width);await originals(page);}
   if(artifacts&&['rome','milan'].includes(slug)){await capture(page,slug,width);if(slug==='milan')await page.locator('#airspaceDecision').screenshot({path:artifacts+'/passage-decision-'+width+'.png'});}
  }
  await start(page,'city=milan');await offer(page,'milan');await fit(page,width);
  const firstDecision=await page.locator('#europeDeskPlanner').boundingBox();console.log('    first decision top '+Math.round(firstDecision.y));
  await capture(page,'milan',width,'-entry');
 });
 await check('Geometry 1280×720: native continuation fits after a currency change',1280,async({page})=>{
  await page.setViewportSize({width:1280,height:720});await start(page,'city=milan');await offer(page,'milan');
  async function visibleDecision(){
   await fit(page,1280);await originals(page);
   const bounds=await page.evaluate(()=>{
    const box=n=>n.getBoundingClientRect().toJSON();return{height:innerHeight,stage:box(document.getElementById('directionClubTicket')),fee:box(document.querySelector('#europeServicePass .europe-service-price strong')),action:box(document.getElementById('europeDeskContinue')),cities:[...document.querySelectorAll('.europe-city-switch button[data-europe-city]')].map(box)};
   });
   for(const key of ['fee','action'])assert.ok(bounds[key].height>0&&bounds[key].width>0,'native '+key+' remains available on short desktop');
   for(const [index,a] of bounds.cities.entries()){
    assert.ok(a.top>=bounds.stage.top&&a.bottom<=bounds.stage.bottom,'each native city remains within the short stage '+JSON.stringify(bounds));
    for(const b of bounds.cities.slice(index+1))assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,'short-stage destinations do not overlap');
   }
  }
  await visibleDecision();await capture(page,'milan',1280,'-720-entry');
  await city(page,'london');await offer(page,'london');await city(page,'milan');await offer(page,'milan');
  await page.locator('#europeCurrencyNote').waitFor({state:'visible'});assert.match(await page.locator('#europeCurrencyNote').innerText(),/EUR.*haven.t converted/);
  await visibleDecision();await capture(page,'milan',1280,'-720-currency');
  for(const slug of cities){await city(page,slug);if(slug==='rome'){await fit(page,1280);await originals(page);continue;}
   for(const [need,id] of [['search','full-search'],['application','application-pack'],['viewing','attended-viewing']]){await page.locator('[data-europe-need="'+need+'"]').click();await offer(page,slug,id);await fit(page,1280);await originals(page);}
  }
 });
 for(const viewport of [{width:1280,height:720},{width:390,height:844}])await check('Idle hint '+viewport.width+': real normal-motion invitation clears native controls',viewport.width,async({page})=>{
  await page.setViewportSize(viewport);await start(page,'city=milan');
  await page.waitForFunction(()=>{const n=document.querySelector('.panorama-globe-hint');return n?.dataset.visible==='true'&&Number(getComputedStyle(n).opacity)>.95;});
  const layout=await page.evaluate(()=>{
   const box=n=>n.getBoundingClientRect().toJSON();return{hint:box(document.querySelector('.panorama-globe-hint')),controls:[...document.querySelectorAll('#visionScene .dispatch-lenses button,#visionScene .panorama-globe-toolbar button,#nextMotionToggle')].map(box).filter(b=>b.width&&b.height),width:innerWidth,height:innerHeight};
  });
  const h=layout.hint;assert.ok(h.width>0&&h.height>0&&h.left>=0&&h.right<=layout.width&&h.top>=0&&h.bottom<=layout.height,'native idle hint stays in frame '+JSON.stringify(layout));
  assert.ok(layout.controls.length>=4,'original lens, pause and full-view controls remain visible');
  for(const c of layout.controls)assert.ok(h.right<=c.left||h.left>=c.right||h.bottom<=c.top||h.top>=c.bottom,'real idle hint does not overlap a native control '+JSON.stringify(layout));
  if(artifacts)await page.screenshot({path:artifacts+'/passage-idle-hint-'+viewport.width+'.png'});
 },'no-preference');
 for(const width of [1024,1440])await check('Pointer hover '+width+': selected and unselected service fees remain readable',width,async({page})=>{
  await start(page,'city=milan');await offer(page,'milan');
  for(const selected of [true,false]){
   const button=page.locator('[data-europe-need="'+(selected?'search':'application')+'"]');await button.hover();
   const colors=await button.evaluate(async n=>{
    await Promise.all(n.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));
    const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
    const bg=getComputedStyle(n).backgroundColor,ratio=fg=>{const a=luminance(fg),b=luminance(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
    return{hover:n.matches(':hover'),pressed:n.getAttribute('aria-pressed'),background:bg,label:ratio(getComputedStyle(n.querySelector('strong')).color),price:ratio(getComputedStyle(n.querySelector('.europe-need-price')).color)};
   });
   assert.equal(colors.hover,true,'actual pointer hover exercised');assert.equal(colors.pressed,String(selected),'selection is unchanged by hover');
   assert.ok(colors.label>=4.5&&colors.price>=4.5,'service label and small fee retain readable contrast during '+(selected?'selected':'unselected')+' hover '+JSON.stringify(colors));
   if(artifacts)await page.screenshot({path:artifacts+'/passage-hover-'+width+'-'+(selected?'selected':'unselected')+'.png'});
  }
  await originals(page);
 });
 await check('Native globe: full view, keyboard destination and restoration preserve one scene',1440,async({page,requests})=>{
  await start(page,'');assert.equal(await page.evaluate(()=>BoomDispatchTour.state().playing||BoomDispatchTour.state().timerPending),false,'Passage never starts an unrequested city tour');
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),1);
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});await originals(page);
  assert.equal(await page.locator('#directionClubTicket .boom-flight-globe-canvas').count(),1,'existing full-view anchor restores the actual globe');
  await page.locator('.europe-city-switch [data-europe-city="amsterdam"]').focus();await page.keyboard.press('Enter');await offer(page,'amsterdam');await fit(page,1440);await originals(page);assert.equal(requests.catalogue,1,'one catalogue owner');
  await page.locator('#boomGlobeMount button[data-globe-city="amsterdam"]').click();await page.waitForFunction(()=>document.activeElement===document.getElementById('europeStoryCity'));
  assert.equal(await page.locator('#airspaceDecision #europeDeskStory').isVisible(),true,'native globe arrival lands on the actual decision');await originals(page);
 });
 await check('Native handoff: dates, invalid input, GBP and selected offer survive the new composition',390,async({page})=>{
  await start(page,'city=rome&privatePlace=synthetic-office&lat=41.9123&lng=12.5123');await fillRome(page);await city(page,'madrid',true);await offer(page,'madrid');assert.equal(await page.locator('#europeBudget').inputValue(),'1500');
  await city(page,'london',true);await offer(page,'london');assert.equal(await page.locator('#europeBudget').inputValue(),'','EUR is not silently converted');assert.equal(await page.locator('#europeMoveIn').inputValue(),arrival);
  await page.locator('[data-europe-need="application"]').click();await offer(page,'london','application-pack');
  const scope=page.locator('#europeServicePass .dispatch-service-inclusions');assert.equal(await scope.evaluate(n=>n.open),false,'native scope disclosure begins collapsed');await scope.locator('summary').click();assert.equal(await scope.locator('ul').isVisible(),true,'pointer reveals the complete native scope');await scope.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await scope.locator('ul').isVisible(),false,'keyboard closes native scope');await page.keyboard.press('Enter');assert.equal(await scope.locator('ul').isVisible(),true,'keyboard expands native scope');
  await editBrief(page);await page.locator('#europeMoveOut').fill(year+'-01-01');
  await page.locator('#europeDeskContinue').click();await originals(page);await page.locator('#europeDeskError').waitFor({state:'visible'});assert.equal(new URL(page.url()).pathname,'/flight-next','invalid dates never hand off');
  await page.locator('#europeMoveOut').fill(departure);await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
  const url=new URL(page.url());assert.equal(url.searchParams.get('need'),'application');assert.equal(url.searchParams.get('moveIn'),arrival);assert.equal(url.searchParams.get('moveOut'),departure);assert.equal(url.searchParams.get('people'),'couple');assert.equal(url.hash,'#fare-application-pack');
  for(const key of ['composition','vision','experience','privatePlace','lat','lng','budget'])assert.equal(url.searchParams.has(key),false,'handoff omits '+key);
 });
 await check('Rome: four distinct native service tickets retain their real pages and fees',390,async({page})=>{
  await start(page,'city=rome');
  for(const [slug,fee] of [['property-finding','€350'],['virtual-viewing','€89'],['deal-assistance','€249'],['contract-check-express','€49']]){
   const ticket=page.locator('[data-rome-service="'+slug+'"]');assert.equal(await ticket.count(),1);assert.equal(await ticket.locator('.ticket-stub>strong').innerText(),fee);assert.equal(new URL(await ticket.getAttribute('href'),origin).pathname,'/'+slug);await ticket.scrollIntoViewIfNeeded();assert.equal(await ticket.isVisible(),true);
   const box=await ticket.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'entire Rome ticket fits the phone');
  }
  await originals(page);assert.equal(await page.locator('#nextHomeRail .next-card').count(),1,'fixture catalogue still owned by native catalogue');
 });
 await check('Stale public response: the last destination owns the fee and action',1440,async({page,data})=>{
  data.manifest='hold';await start(page,'city=london');await city(page,'milan');await page.waitForFunction(()=>document.body.dataset.europeCity==='milan');
  data.manifest='normal';for(const route of data.pending.splice(0))await route.fulfill({contentType:'application/json',body:manifestText}).catch(()=>{});
  await offer(page,'milan');assert.doesNotMatch(await page.locator('#airspaceDecision').innerText(),/£/,'old currency never paints onto the new destination');assert.equal(new URL(await page.locator('[data-europe-desk-link]').first().getAttribute('href'),origin).pathname,'/milan');
 });
 await check('Unavailable service and geography: truthful fallback still reaches the original desk',390,async({page,data})=>{
  data.manifest='error';data.geography='error';await start(page,'city=milan',false);await page.waitForFunction(()=>BoomFlightGlobe.state().error);
  await page.locator('#europeServicePass').getByText('Speak with the Milan desk.',{exact:true}).waitFor();assert.equal(await page.locator('#europeServicePass .europe-service-price').count(),0,'no invented price in failure');
  assert.match(await page.locator('#europeDeskContinue').innerText(),/Open Milan desk/);await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/milan');assert.equal(new URL(page.url()).hash,'','unknown offer does not receive a fare fragment');
 });
 for(const preference of ['reduce','pause'])await check('Motion '+preference+': geography and all decisions remain available without decorative activity',1440,async({page})=>{
  await start(page);if(preference==='pause')await page.locator('#nextMotionToggle').click();await city(page,'london');await offer(page,'london');
  const state=await page.evaluate(()=>BoomFlightGlobe.state());assert.equal(preference==='reduce'?state.reducedMotion:state.paused,true,'native globe honors motion preference');assert.equal(state.routeTrace,false);assert.equal(state.framingTransition,false);assert.equal(await page.evaluate(()=>BoomDispatchTour.state().playing),false);
  await page.locator('[data-dispatch-lens="globe"]').click();await originals(page);await fit(page,1440);
 },preference==='reduce'?'reduce':'no-preference');
 await check('Route feedback: native pointer selection draws once and Pause cancels it',1440,async({page})=>{
  await start(page);await city(page,'london');await page.waitForFunction(()=>BoomFlightGlobe.state().routeTrace);
  await page.waitForFunction(()=>BoomFlightGlobe.state().routeProgress>0);const moving=await page.evaluate(()=>BoomFlightGlobe.state());assert.equal(moving.routeCity,'london');assert.equal(moving.city,'london');
  await page.waitForFunction(()=>!BoomFlightGlobe.state().routeTrace);await offer(page,'london');
  await city(page,'amsterdam');await page.waitForFunction(()=>BoomFlightGlobe.state().routeTrace);await page.locator('#nextMotionToggle').click();
  await page.waitForFunction(()=>!BoomFlightGlobe.state().routeTrace);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().paused),true);await offer(page,'amsterdam');
 },'no-preference');
 await check('Studio: Passage preserves a valid public draft and protects invalid values',1440,async({page})=>{
  await page.goto(origin+'/flight-studio?experience=dispatch&composition=open&city=rome&privatePlace=synthetic-office&lat=41.9123&lng=12.5123',{waitUntil:'domcontentloaded'});
  const frame=await (await page.locator('#studioFrame').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.BoomFlightEurope);await fillRome(frame);
  await page.locator('button[data-studio-composition="passage"]').click();await frame.waitForFunction(()=>document.body.dataset.airspaceReady==='true');
  const incoming=new URL(frame.url());for(const [key,value] of Object.entries({composition:'passage',moveIn:arrival,moveOut:departure,budget:'1500',people:'couple'}))assert.equal(incoming.searchParams.get(key),value);
  for(const key of ['privatePlace','lat','lng'])assert.equal(incoming.searchParams.has(key)||new URL(page.url()).searchParams.has(key),false,'private place never crosses the comparison URL');
  await frame.evaluate(()=>{window.__passageStudioForm=document.getElementById('nextSearchForm');});await frame.locator('#nextMoveOut').fill(year+'-01-01');await page.locator('button[data-studio-composition="open"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>__passageStudioForm===document.getElementById('nextSearchForm')),true,'invalid draft stays in the same form');assert.equal(await page.locator('button[data-studio-composition="passage"]').getAttribute('aria-pressed'),'true');
  await frame.locator('#nextMoveOut').fill(departure);await page.locator('button[data-studio-device="mobile"]').click();await frame.waitForFunction(()=>innerWidth===390);assert.equal(await frame.evaluate(()=>__passageStudioForm===document.getElementById('nextSearchForm')),true,'format switch resizes the same form');
  assert.equal(await page.locator('#studioFrame').count(),1,'one comparison iframe');
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(!passed&&!failed){console.log('  No scenario matched '+focus);failed++;}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
