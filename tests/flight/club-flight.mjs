// Real Club/Europe navigation and the real globe flight. Only public catalogue,
// WebGL rendering and final application/service endpoints are offline fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium(),focus=process.argv[2]||'';
const artifacts=process.env.BOOM_FLIGHT_ARTIFACT_DIR||'';
if(artifacts)mkdirSync(artifacts,{recursive:true});
console.log('\n▸ flightclubflight  Globe to a real destination, with one journey and a way to skip');
if(!chromium){console.log('  SKIP: playwright unavailable — flight navigation checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const homes=[{id:'flight-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment'},{id:'flight-room',name:'Fixture Room',price:700,sqm:18,bedrooms:1,type:'Room'}].map((home,i)=>({...home,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9+i*.01,lng:12.49,images:['/flight-photo.svg'],description:'Synthetic fixture, never a customer or a real home.'}));
const mapHTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#101319;color:white"><p>Skyline rendering boundary</p><script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},map:{resize(){},stop(){}}};addEventListener("message",e=>{if(e.source===parent&&e.origin===location.origin&&e.data.t==="boomSelect")parent.postMessage({t:"boomSelected",id:e.data.id},location.origin);});parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);return res.end('No writes permitted');}
 if(pathname==='/flight-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#6b6b5b"/></svg>');}
 if(pathname.startsWith('/cities/')){res.writeHead(404);return res.end();}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function open(width,motion){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion}),errors=[],writes=[],catalogue=[],missing=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&r.status()>=400)missing.push(new URL(r.url()).pathname);});
 await page.addInitScript(()=>{
  window.__flightPushes=[];window.__flightViews=[];window.__flightOverlayOpened=0;
  const push=history.pushState;history.pushState=function(state,title,url){__flightPushes.push(String(url));return push.apply(this,arguments);};
  addEventListener('boom:flight-view',e=>__flightViews.push(e.detail.view));
  new MutationObserver(records=>{for(const r of records)if(r.type==='attributes'&&r.attributeName==='open'&&r.target.matches('.boom-globe-flight')&&r.target.open)__flightOverlayOpened++;}).observe(document,{subtree:true,attributes:true,attributeFilter:['open']});
 });
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings'){catalogue.push(url.href);return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});}
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname.startsWith('/listing/')||/^\/(madrid|london|amsterdam|barcelona|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>Original form boundary</h1><p>No request or payment is sent.</p></body></html>'});
  return route.continue();
 });
 return {page,errors,writes,catalogue,missing};
}
async function check(name,width,fn,motion='no-preference'){
 if(focus&&!name.includes(focus))return;
 const t=await open(width,motion);
 try{await fn(t);assert.deepEqual(t.errors,[],'no unhandled browser error');assert.deepEqual(t.writes,[],'no lead or payment sent');assert.deepEqual(t.missing,[],'real public assets load');assert.equal(t.catalogue.length,1,'flight reuses the existing catalogue request');passed++;console.log('  ✓ '+name);}
 catch(e){failed++;console.log('  ✗ '+name+' — '+e.message);}
 finally{await t.page.close();}
}
async function start(page){
 await page.goto(origin+'/flight-next?direction=club&edition=club&place=luiss&type=__entire',{waitUntil:'domcontentloaded'});
 await page.locator('#nextHomeRail .next-card').first().waitFor();await page.waitForFunction(()=>window.BoomFlightGlobe?.state().ready);
 await page.locator('#nextHomeMap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>BoomNextMap.state().status==='ready');
 await page.evaluate(()=>{window.__originalSkyline=document.querySelector('iframe.boom-next-map-frame');});
 await page.locator('#boomGlobeMount').scrollIntoViewIfNeeded();
}
async function draft(page){
 await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);
 await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
}
function brief(url){for(const [key,value] of Object.entries({moveIn:arrival,moveOut:departure,stay:'6',budget:'1500',people:'couple',place:'luiss',type:'__entire'}))assert.equal(url.searchParams.get(key),value,key+' comes from the real draft');}
async function clean(page){
 await page.waitForFunction(()=>!BoomFlightGlobe.state().flying&&!document.querySelector('.boom-globe-flight[open]'));
 assert.notEqual(await page.locator('body').getAttribute('data-globe-flight'),'active','the overlay cannot strand the page');
 assert.equal(await page.locator('iframe.boom-next-map-frame').count(),1,'one Skyline iframe');
 assert.equal(await page.evaluate(()=>window.__originalSkyline===document.querySelector('iframe.boom-next-map-frame')),true,'the same Skyline instance survives the flight');
 const box=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(box.scroll<=box.width+1,'no horizontal overflow: '+JSON.stringify(box));
}
async function arrivedRome(page){await page.locator('#nextApartments').waitFor({state:'visible'});await clean(page);const url=new URL(page.url());assert.equal(url.searchParams.get('view'),'apartments');assert.equal(url.searchParams.get('layout'),'skyline');brief(url);assert.equal(await page.locator('#nextResults .next-card').count(),1);}
async function singleArrival(page,before){assert.equal(await page.evaluate(()=>history.length),before+1,'one intentional arrival, one history entry');assert.equal(await page.evaluate(()=>__flightPushes.filter(url=>new URL(url,location.origin).searchParams.get('view')==='apartments').length),1,'one Apartments navigation');}
try{
 browser=await chromium.launch(await launchOptions());
 await check('Globe drag rotates the real sphere without navigation, resets and stops rendering at rest',1280,async({page})=>{
  await start(page);await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  const before=await page.evaluate(()=>({angle:BoomFlightGlobe.state().angle,url:location.href,history:history.length}));
  const canvas=await page.locator('.boom-flight-globe-canvas').boundingBox(),x=canvas.x+canvas.width*.5,y=canvas.y+canvas.height*.75;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y-20,{steps:12});await page.mouse.up();
  await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  const after=await page.evaluate(()=>({angle:BoomFlightGlobe.state().angle,url:location.href,history:history.length,dragging:BoomFlightGlobe.state().dragging}));
  assert.ok(Math.abs(after.angle[0]-before.angle[0])>15,'direct manipulation rotates geographically projected land');assert.equal(after.url,before.url);assert.equal(after.history,before.history);assert.equal(after.dragging,false);
  await page.getByRole('button',{name:'Reset globe to selected city'}).click();await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  const reset=await page.evaluate(()=>BoomFlightGlobe.state());assert.ok(Math.abs(reset.angle[0]-before.angle[0])<.1);
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),reset.frames,'no continuous globe loop at rest');
  await page.locator('.edition-plan-link').press('Enter');await page.locator('#nextApartments').waitFor({state:'visible'});await clean(page);
 });
 await check('Reduced motion keeps direct drag and instant reset; Pause cancels an active gesture',1280,async({page})=>{
  await start(page);await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  const canvas=await page.locator('.boom-flight-globe-canvas').boundingBox(),x=canvas.x+canvas.width*.5,y=canvas.y+canvas.height*.8;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y,{steps:8});
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().dragging),true);
  await page.evaluate(()=>BoomFlightGlobe.setPaused(true));assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().dragging),false);await page.mouse.up();
  await page.evaluate(()=>BoomFlightGlobe.setPaused(false));
  await page.getByRole('button',{name:'Reset globe to selected city'}).press('Enter');await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending);
  assert.equal(await page.locator('#boomGlobeMount').getAttribute('data-globe-motion'),'still');
 },'reduce');
 await check('Touch canvas retains vertical page scrolling and a cancelled drag releases capture',390,async({page})=>{
  await start(page);
  assert.equal(await page.locator('.boom-flight-globe-canvas').evaluate(el=>getComputedStyle(el).touchAction),'pan-y');
  const canvas=await page.locator('.boom-flight-globe-canvas').boundingBox(),x=canvas.x+canvas.width*.5,y=canvas.y+canvas.height*.7;
  const cdp=await page.context().newCDPSession(page);const before=await page.evaluate(()=>scrollY);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let n=1;n<=6;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-n*18}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(value=>scrollY>value+30,before);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().dragging),false);await cdp.detach();
 });
 for(const width of [390,1280])await check('Rome '+width+': selected globe opens real Skyline, keeps the draft and returns focus on Back',width,async({page})=>{
  await start(page);
  if(artifacts&&width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:artifacts+'/club-night-home-390.png'});}
  await draft(page);assert.equal(await page.locator('button[data-globe-city="rome"]').getAttribute('aria-pressed'),'true');
  const before=await page.evaluate(()=>history.length),clickedAt=Date.now();await page.locator('button[data-globe-city="rome"]').press('Enter');
  await page.locator('.boom-globe-flight[open]').waitFor();assert.equal(await page.locator('.boom-globe-flight').evaluate(node=>node.contains(document.activeElement)),true,'focus stays inside the flight controls');
  const skip=await page.locator('[data-globe-skip]').boundingBox();assert.ok(skip.width>=44&&skip.height>=44,'Skip is a usable touch target');
  if(artifacts&&width===390){await page.waitForTimeout(Math.max(0,600-(Date.now()-clickedAt)));await page.screenshot({path:artifacts+'/club-night-flight-390.png'});}
  await arrivedRome(page);await singleArrival(page,before);await page.goBack();await page.locator('#nextHome').waitFor({state:'visible'});await clean(page);
  assert.equal(await page.locator('#nextMoveIn').inputValue(),arrival);assert.equal(await page.locator('#nextMoveOut').inputValue(),departure);assert.equal(await page.locator('#nextBudget').inputValue(),'1500');assert.equal(await page.locator('#nextPeople').inputValue(),'couple');
  assert.equal(await page.evaluate(()=>document.getElementById('nextHero').contains(document.activeElement)),true,'Back returns keyboard focus to the Home experience');
 });
 await check('Rapid repeat: one arrival and no stranded overlay or duplicate catalogue',390,async({page})=>{
  await start(page);await draft(page);const before=await page.evaluate(()=>history.length);
  await page.locator('button[data-globe-city="rome"]').evaluate(button=>{button.click();button.click();button.click();});
  await arrivedRome(page);await singleArrival(page,before);
  await page.locator('#nextResults [data-home="flight-courtyard"]').first().click();await page.locator('#nextDetailTitle').waitFor();await clean(page);
  const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);assert.equal(apply.pathname,'/listing/flight-courtyard');assert.equal(apply.hash,'#applica');brief(apply);
 });
 for(const escape of [true,false])await check((escape?'Escape':'Skip')+': bypassing the animation still reaches the chosen destination',390,async({page})=>{
  await start(page);await draft(page);await page.locator('button[data-globe-city="rome"]').click();await page.locator('.boom-globe-flight[open]').waitFor();
  if(escape)await page.keyboard.press('Escape');else await page.locator('[data-globe-skip]').click();
  await arrivedRome(page);assert.equal(await page.evaluate(()=>__flightViews.filter(view=>view==='apartments').length),1);
 });
 for(const mode of ['reduced','paused'])await check(mode+': city action arrives immediately without opening a flight overlay',390,async({page})=>{
  await start(page);await draft(page);if(mode==='paused'){await page.locator('#nextMotionToggle').click();assert.equal(await page.locator('#nextMotionToggle').getAttribute('aria-pressed'),'true');}
  await page.locator('button[data-globe-city="rome"]').click();await arrivedRome(page);assert.equal(await page.evaluate(()=>__flightOverlayOpened),0,'motion preference bypasses the overlay entirely');
 },mode==='reduced'?'reduce':'no-preference');
 await check('Foreign arrival opens the actual Madrid service, preserves the public brief and hides Rome inventory',390,async({page})=>{
  await start(page);await draft(page);await page.locator('button[data-globe-city="madrid"]').click();
  await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid'&&!BoomFlightGlobe.state().flying);await clean(page);
  assert.equal(await page.locator('body').getAttribute('data-view'),'home');assert.equal(await page.locator('#nextHomeRail').isVisible(),false);assert.equal(await page.locator('#nextHomeMap').isVisible(),false);assert.equal(await page.locator('#nextApartments').isVisible(),false);
  await page.waitForFunction(()=>{const box=document.getElementById('europeDeskStory').getBoundingClientRect();return box.top>=0&&box.top<innerHeight*.6;});
  assert.equal(await page.locator('#europeMoveIn').inputValue(),arrival);assert.equal(await page.locator('#europeMoveOut').inputValue(),departure);assert.equal(await page.locator('#europeBudget').inputValue(),'1500');assert.equal(await page.locator('#europePeople').inputValue(),'couple');
  await page.locator('[data-europe-need="application"]').click();
  await page.waitForFunction(()=>document.getElementById('europeServicePass').textContent.includes('€199'));
  const url=new URL(await page.locator('[data-europe-desk-link]').first().getAttribute('href'),origin);
  for(const [key,value] of Object.entries({city:'madrid',from:'flight',need:'application',moveIn:arrival,moveOut:departure,budget:'1500',people:'couple',currency:'EUR'}))assert.equal(url.searchParams.get(key),value,key+' reaches the real desk');
  assert.equal(url.pathname,'/madrid');for(const key of ['place','homes','type','privatePlace'])assert.equal(url.searchParams.has(key),false,key+' is not a foreign inventory promise');
 });
 await check('Invalid dates stay at the real form; a failed flight callback always cleans up',1280,async({page})=>{
  await start(page);await draft(page);await page.locator('#nextMoveOut').fill(year+'-02-28');await page.locator('button[data-globe-city="rome"]').click();
  await clean(page);assert.equal(await page.locator('body').getAttribute('data-view'),'home');assert.ok(await page.evaluate(()=>document.getElementById('nextMoveOut').validationMessage||(!document.getElementById('nextSearchError').hidden&&document.getElementById('nextSearchError').textContent)),'canonical validation explains the stay');
  assert.equal(await page.evaluate(()=>__flightPushes.length),0,'invalid stay cannot create an arrival');
  const result=await page.evaluate(async()=>{let calls=0;const result=await BoomFlightGlobe.flyTo('rome',{onCovered(){calls++;throw new Error('Synthetic callback failure');}});return {result,calls};});
  assert.equal(result.result.status,'failed');assert.equal(result.calls,1);await clean(page);assert.equal(await page.locator('body').getAttribute('data-view'),'home');
 });
 await check('A short foreign stay returns to a coherent Rome form and never bypasses its duration rule',390,async({page})=>{
  await start(page);await page.locator('.europe-city-switch [data-europe-city="madrid"]').click();
  if(!await page.locator('#europeOptionalBrief').evaluate(node=>node.open))await page.locator('#europeOptionalBrief summary').click();
  await page.locator('#europeMoveIn').fill(arrival);await page.locator('#europeMoveOut').fill(year+'-02-28');await page.locator('#europeBudget').selectOption('1500');await page.locator('#europePeople').selectOption('couple');
  await page.locator('button[data-globe-city="rome"]').click();await page.waitForFunction(()=>!document.getElementById('nextSearchError').hidden&&document.getElementById('nextSearchError').textContent);await clean(page);
  assert.equal(await page.locator('body').getAttribute('data-europe-city'),'rome');const url=new URL(page.url());assert.equal(url.searchParams.get('city')||'rome','rome','the URL matches the Rome form now on screen');assert.notEqual(url.searchParams.get('view'),'apartments');
  assert.equal(await page.locator('#nextMoveIn').inputValue(),arrival);assert.equal(await page.locator('#nextMoveOut').inputValue(),year+'-02-28');assert.equal(await page.locator('#nextBudget').inputValue(),'1500');assert.equal(await page.locator('#nextPeople').inputValue(),'couple');
  assert.equal(await page.evaluate(()=>document.getElementById('nextSearch').contains(document.activeElement)),true,'the date error keeps keyboard focus at the real form');assert.equal(await page.evaluate(()=>__flightOverlayOpened),0,'validation happens before a flight');
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(!passed&&!failed){console.log('  No test matched '+focus);failed++;}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
