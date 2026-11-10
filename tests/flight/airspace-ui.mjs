// Airspace moves the original destination and decision surfaces. Fixtures stop
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
const home={id:'airspace-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9,lng:12.49,images:['/airspace-photo.svg'],description:'Synthetic public test boundary, never a real home or customer.'};
const mapHTML='<!doctype html><html><body>Skyline rendering boundary<script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},refreshPlaces(){},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
if(artifacts)mkdirSync(artifacts,{recursive:true});
console.log('\n▸ flightairspaceui  One destination scene, one native decision, intact public journeys');
if(!chromium){console.log('  SKIP: playwright unavailable — Airspace browser checks did not run');process.exit(0);}
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/airspace-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn,motion='reduce'){
 if(focus&&!name.includes(focus))return;
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion}),errors=[],writes=[],missing=[],privateReads=[],requests={catalogue:0},data={manifest:'normal',geography:'normal',pending:[]};
 await page.addInitScript(()=>{
  const ids=['nextDestinationBoard','nextSolariField','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'];window.__airspaceBirthNodes=new Map();
  const observe=new MutationObserver(()=>{for(const id of ids){const node=document.getElementById(id);if(node&&!__airspaceBirthNodes.has(id))__airspaceBirthNodes.set(id,node);}const canvas=document.querySelector('.boom-flight-globe-canvas');if(canvas&&!window.__airspaceBirthCanvas)window.__airspaceBirthCanvas=canvas;if(document.body?.dataset.airspaceReady==='true')observe.disconnect();});
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
 catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);console.log(error.stack);if(artifacts)await page.screenshot({path:artifacts+'/airspace-failure-'+failed+'.png'}).catch(()=>{});}
 finally{for(const route of data.pending)await route.abort().catch(()=>{});await page.close();}
}
async function start(page,query='city=rome',geography=true){
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch&composition=airspace&'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.airspaceReady==='true'&&!!window.BoomFlightEurope);
 await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});
 if(geography)await page.waitForFunction(()=>BoomFlightGlobe.state().ready);
 await page.evaluate(async()=>{await document.fonts.ready;window.__airspaceOriginals=['nextDestinationBoard','nextSolariField','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'].map(id=>__airspaceBirthNodes.get(id));window.__airspaceCanvas=__airspaceBirthCanvas;});
}
async function city(page,slug,touch=false){const button=page.locator('.europe-city-switch [data-europe-city="'+slug+'"]');if(touch)await button.tap();else await button.click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);}
async function offer(page,slug,planId='full-search'){
 const plan=manifest.cities[slug].pricing.plans.find(p=>p.id===planId);assert.ok(plan,'real public plan exists');
 await page.waitForFunction(value=>document.querySelector('#europeServicePass .europe-service-copy h3')?.textContent===value,plan.label);
 const expected=new Intl.NumberFormat('en-GB',{style:'currency',currency:slug==='london'?'GBP':'EUR',maximumFractionDigits:0}).format(plan.price);
 assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),expected,'exact manifest price');
 assert.equal(await page.locator('#europeServicePass .europe-service-price small').innerText(),plan.condition,'condition stays with the price');
 const scope=await page.locator('#europeServicePass .dispatch-service-inclusions').textContent();
 for(const line of [plan.offerDescription,...plan.includes])assert.ok(scope.includes(line),'complete real scope remains available in the native disclosure');
 assert.equal(await page.locator('#europeDeskContinue').isVisible(),true,'native next action is visible');
}
async function originals(page){
 assert.equal(await page.evaluate(()=>__airspaceOriginals.every((n,i)=>n===document.getElementById(['nextDestinationBoard','nextSolariField','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'][i]))&&__airspaceCanvas===document.querySelector('.boom-flight-globe-canvas')),true,'same native forms, Solari, signature and globe');
 for(const id of ['nextSearchForm','europeDeskForm','europeCitySignature','nextSolariField'])assert.equal(await page.locator('#'+id).count(),1,'one '+id);
}
async function fit(page,width){
 const sample=await page.evaluate(()=>{
  const box=node=>node.getBoundingClientRect().toJSON(),buttons=[...document.querySelectorAll('.europe-city-switch button[data-europe-city]')],board=document.getElementById('nextDestinationBoard'),cells=[...board.querySelectorAll('.fc2')],decision=document.getElementById('airspaceDecision'),pin=document.querySelector('#boomGlobeMount button[data-globe-city][aria-pressed="true"]');
  const contrastOnWhite=node=>{const rgb=getComputedStyle(node).color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return 1.05/(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722+.05);};
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,world:box(document.querySelector('.boom-globe-stage')),decision:box(decision),buttons:buttons.map(box),board:box(board.parentElement),first:box(cells[0]),last:box(cells.at(-1)),expand:box(document.querySelector('[data-panorama-expand]')),pin:pin&&box(pin),promise:box(document.querySelector('.hero-promise')),plan:box(document.querySelector('.edition-plan-link')),backgrounds:[getComputedStyle(document.getElementById('directionClubTicket')).backgroundColor,getComputedStyle(decision).backgroundColor],rome:!document.getElementById('nextSearch').closest('[hidden]'),foreign:!document.getElementById('europeDeskStory').hidden,contrast:[...document.querySelectorAll('#nextSearchForm>label>span,#nextStayHint')].map(contrastOnWhite)};
 });
 assert.ok(sample.scroll<=width+1,'no page overflow '+JSON.stringify(sample));
 assert.equal(sample.buttons.length,6,'six original city choices');
 for(const b of sample.buttons)assert.ok(b.width>=44&&b.height>=44&&b.left>=-1&&b.right<=width+1,'city targets readable and inside frame '+JSON.stringify(b));
 assert.ok(sample.first.left>=sample.board.left-1&&sample.last.right<=sample.board.right+1,'actual flaps fit their mechanical bay '+JSON.stringify(sample));
 assert.deepEqual(sample.backgrounds,['rgb(0, 0, 0)','rgb(255, 255, 255)'],'the actual original scene is black and the actual decision is white');
 assert.ok(sample.expand.top>=sample.last.bottom||sample.expand.left>=sample.last.right||sample.expand.right<=sample.first.left,'Full view is not obscured by the actual Solari flaps '+JSON.stringify(sample));
 if(sample.pin)assert.ok(sample.expand.bottom<=sample.pin.top||sample.expand.top>=sample.pin.bottom||sample.expand.right<=sample.pin.left||sample.expand.left>=sample.pin.right,'Full view and the actual globe city target remain distinct '+JSON.stringify(sample));
 if(sample.rome)for(const contrast of sample.contrast)assert.ok(contrast>=4.5,'native form labels and stay guidance remain readable on the new white decision: '+contrast);
 if(width>=700&&sample.foreign&&sample.plan.height)assert.ok(sample.promise.bottom+8<=sample.plan.top,'scene promise and native plan link do not overlap '+JSON.stringify(sample));
 assert.ok(sample.world.width>=240&&sample.world.height>=220,'real globe retains a meaningful stage');
 if(width<700){assert.ok(sample.world.bottom<=sample.decision.top+1,'geographic scene precedes the decision on phone');const rows=new Set(sample.buttons.map(b=>Math.round(b.top)));assert.equal(rows.size,2,'all six cities are visible in two phone rows');}
 else assert.ok(sample.world.right<=sample.decision.left+1,'world and service decision have distinct reading areas');
 assert.notEqual(sample.rome,sample.foreign,'only the appropriate original planner is shown');
}
async function editBrief(page){const details=page.locator('#europeOptionalBrief');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();}
async function fillRome(page){await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');}
async function capture(page,slug,width,suffix=''){
 if(!artifacts)return;
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 const prefix=artifacts+'/airspace-'+slug+'-'+width+suffix;
 await page.screenshot({path:prefix+'.png'});await page.screenshot({path:prefix+'-full.png',fullPage:true});
 const proof=await page.evaluate(()=>{
  const selectors=['.next-nav','#directionClubTicket','#airspaceDecision','#nextHeroTitle','[data-panorama-expand]','.hero-promise','.edition-plan-link','#europeDeskContinue','.search-submit','.edition-runway-head','#nextSearchForm>label>span','#nextStayHint'];
  return Object.fromEntries(selectors.map(selector=>{const el=document.querySelector(selector),style=el&&getComputedStyle(el);return [selector,el?{box:el.getBoundingClientRect().toJSON(),color:style.color,background:style.backgroundColor,display:style.display,text:el.innerText.slice(0,160)}:null];}));
 });writeFileSync(prefix+'.json',JSON.stringify(proof,null,2));
}
try{
 browser=await chromium.launch(launchOptions());
 for(const width of [1440,390,451,320,1024])await check('Geometry '+width+': complete city selection and native decision remain legible',width,async({page})=>{
  await start(page);
  for(const slug of cities){if(slug!=='rome')await city(page,slug,width<500);if(slug!=='rome')await offer(page,slug);await fit(page,width);await originals(page);
   if(artifacts&&['rome','milan'].includes(slug)){await capture(page,slug,width);if(slug==='milan')await page.locator('#airspaceDecision').screenshot({path:artifacts+'/airspace-decision-'+width+'.png'});}
  }
  await start(page,'city=milan');await offer(page,'milan');await fit(page,width);
  if(width===1440){const action=await page.locator('#europeDeskContinue').boundingBox();assert.ok(action.y+action.height<=900,'native first-entry service action is fully visible in the desktop viewport');}
  await capture(page,'milan',width,'-entry');
 });
 await check('Native globe: full view, keyboard destination and restoration preserve one scene',1440,async({page,requests})=>{
  await start(page,'');assert.equal(await page.evaluate(()=>BoomDispatchTour.state().playing||BoomDispatchTour.state().timerPending),false,'Airspace never starts an unrequested city tour');
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),1);
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});await originals(page);
  assert.equal(await page.locator('#directionClubTicket .boom-flight-globe-canvas').count(),1,'existing full-view anchor restores the actual globe');
  await page.locator('.europe-city-switch [data-europe-city="amsterdam"]').focus();await page.keyboard.press('Enter');await offer(page,'amsterdam');await fit(page,1440);await originals(page);assert.equal(requests.catalogue,1,'one catalogue owner');
  await page.locator('#boomGlobeMount button[data-globe-city="amsterdam"]').click();await page.waitForFunction(()=>document.activeElement===document.getElementById('europeStoryCity'));
  assert.equal(await page.locator('#airspaceDecision #europeDeskStory').isVisible(),true,'native globe arrival lands on the actual decision');await originals(page);
 });
 await check('Native handoff: dates, invalid input, GBP and selected offer survive the new composition',390,async({page})=>{
  await start(page);await fillRome(page);await city(page,'madrid',true);await offer(page,'madrid');assert.equal(await page.locator('#europeBudget').inputValue(),'1500');
  await city(page,'london',true);await offer(page,'london');assert.equal(await page.locator('#europeBudget').inputValue(),'','EUR is not silently converted');assert.equal(await page.locator('#europeMoveIn').inputValue(),arrival);
  await page.locator('[data-europe-need="application"]').click();await offer(page,'london','application-pack');
  const scope=page.locator('#europeServicePass .dispatch-service-inclusions');await scope.locator('summary').click();assert.equal(await scope.locator('p').isVisible(),true,'the complete scope is accessible before continuing');await scope.locator('summary').click();
  await editBrief(page);await page.locator('#europeMoveOut').fill(year+'-01-01');
  await page.locator('#europeDeskContinue').click();await page.locator('#europeDeskError').waitFor({state:'visible'});assert.equal(new URL(page.url()).pathname,'/flight-next','invalid dates never hand off');
  await page.locator('#europeMoveOut').fill(departure);await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
  const url=new URL(page.url());assert.equal(url.searchParams.get('need'),'application');assert.equal(url.searchParams.get('moveIn'),arrival);assert.equal(url.searchParams.get('moveOut'),departure);assert.equal(url.searchParams.get('people'),'couple');assert.equal(url.hash,'#fare-application-pack');
  for(const key of ['composition','vision','experience','privatePlace','lat','lng','budget'])assert.equal(url.searchParams.has(key),false,'handoff omits '+key);
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
 await check('Studio: Airspace preserves a valid public draft and protects invalid values',1440,async({page})=>{
  await page.goto(origin+'/flight-studio?experience=dispatch&composition=open&city=rome&privatePlace=synthetic-office&lat=41.9123&lng=12.5123',{waitUntil:'domcontentloaded'});
  const frame=await (await page.locator('#studioFrame').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.BoomFlightEurope);await fillRome(frame);
  await page.locator('button[data-studio-composition="airspace"]').click();await frame.waitForFunction(()=>document.body.dataset.airspaceReady==='true');
  const incoming=new URL(frame.url());for(const [key,value] of Object.entries({composition:'airspace',moveIn:arrival,moveOut:departure,budget:'1500',people:'couple'}))assert.equal(incoming.searchParams.get(key),value);
  for(const key of ['privatePlace','lat','lng'])assert.equal(incoming.searchParams.has(key)||new URL(page.url()).searchParams.has(key),false,'private place never crosses the comparison URL');
  await frame.evaluate(()=>{window.__airspaceStudioForm=document.getElementById('nextSearchForm');});await frame.locator('#nextMoveOut').fill(year+'-01-01');await page.locator('button[data-studio-composition="open"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>__airspaceStudioForm===document.getElementById('nextSearchForm')),true,'invalid draft stays in the same form');assert.equal(await page.locator('button[data-studio-composition="airspace"]').getAttribute('aria-pressed'),'true');
  await frame.locator('#nextMoveOut').fill(departure);await page.locator('button[data-studio-device="mobile"]').click();await frame.waitForFunction(()=>innerWidth===390);assert.equal(await frame.evaluate(()=>__airspaceStudioForm===document.getElementById('nextSearchForm')),true,'format switch resizes the same form');
  assert.equal(await page.locator('#studioFrame').count(),1,'one comparison iframe');
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(!passed&&!failed){console.log('  No scenario matched '+focus);failed++;}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
