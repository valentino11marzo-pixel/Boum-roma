// Original city controls, Europe controller, public facts and Solari renderer.
// Only network boundaries and browser preferences are fixtures; no submissions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium(),focus=process.argv[2]||'';
const artifacts=process.env.BOOM_FLIGHT_ARTIFACT_DIR||'';
if(artifacts)mkdirSync(artifacts,{recursive:true});
console.log('\n▸ flightclubemblemsui  Six native Club city signatures, finite motion and truthful journeys');
if(!chromium){console.log('  SKIP: playwright unavailable — Club emblem browser checks did not run');process.exit(0);}
const cities={rome:'The Colosseum',madrid:'Puerta de Alcalá',barcelona:'Sagrada Família',amsterdam:'The canal houses',london:'Tower Bridge',milan:'The Duomo'};
const homes=[{id:'emblem-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9,lng:12.49,images:['/emblem-photo.svg'],description:'Synthetic test home, never a real property or customer.'}];
const mapHTML='<!doctype html><html><body><p>Skyline rendering boundary</p><script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);return res.end('No writes permitted');}
 if(pathname==='/emblem-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#57594c"/></svg>');}
 if(pathname.startsWith('/cities/')){res.writeHead(404);return res.end();}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function open(width,motion='no-preference',saveData=false){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion}),errors=[],writes=[],missing=[],privateReads=[],catalogue=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&r.status()>=400)missing.push(new URL(r.url()).pathname);});
 await page.addInitScript(({saveData})=>{
  const connection=new EventTarget();connection.saveData=saveData;
  Object.defineProperty(navigator,'connection',{configurable:true,value:connection});
  window.__emblemAnimations=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   const animation=animate.call(this,frames,options);
   if(this.closest('#europeCitySignature')){
    const record={animation,target:this,options,city:document.body.dataset.europeCity,cancelled:false,finished:false};
    animation.addEventListener('cancel',()=>{record.cancelled=true;});animation.addEventListener('finish',()=>{record.finished=true;});
    window.__emblemAnimations.push(record);
    if(window.__freezeEmblem){animation.pause();animation.currentTime=0;}
   }
   return animation;
  };
 },{saveData});
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings'){catalogue.push(url.href);return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});}
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname.startsWith('/cities/'))privateReads.push(url.pathname);
  if(url.pathname.startsWith('/listing/')||/^\/(madrid|london|amsterdam|barcelona|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Original service boundary; no form submitted.</body></html>'});
  return route.continue();
 });
 return {page,errors,writes,missing,privateReads,catalogue};
}
async function check(name,width,fn,motion='no-preference',saveData=false){
 if(focus&&!name.includes(focus))return;
 const t=await open(width,motion,saveData);
 try{await fn(t);assert.deepEqual(t.errors,[],'no unhandled browser errors');assert.deepEqual(t.writes,[],'no application or payment writes');assert.deepEqual(t.missing,[],'real public assets load');assert.deepEqual(t.privateReads,[],'no private city sources fetched');assert.equal(t.catalogue.length,1,'one existing catalogue request');passed++;console.log('  ✓ '+name);}
 catch(e){failed++;console.log('  ✗ '+name+' — '+e.message);if(artifacts)await t.page.screenshot({path:artifacts+'/club-emblems-failure-'+failed+'.png',fullPage:false}).catch(()=>{});}
 finally{await t.page.close();}
}
async function start(page,query=''){
 await page.goto(origin+'/flight-next?direction=club&edition=club'+query,{waitUntil:'domcontentloaded'});
 await page.locator('#nextHomeRail .next-card').first().waitFor();
 await page.waitForFunction(()=>!!window.BoomFlightEurope&&!!window.BoomFlightClub);
 await page.evaluate(async()=>{await document.fonts.ready;window.__originalSignature=document.getElementById('europeCitySignature');window.__originalForm=document.getElementById('nextSearchForm');});
}
async function choose(page,slug,touch=false){
 const button=page.locator('.europe-city-switch [data-europe-city="'+slug+'"]');
 if(touch)await button.tap();else await button.click();
 await page.waitForFunction(slug=>document.body.dataset.europeCity===slug,slug);
}
async function chooseVisible(page,slug,touch=false){
 await page.locator('#europeCitySignature').scrollIntoViewIfNeeded();
 await page.locator('.next-nav [data-europe-open]').click();
 const button=page.locator('#europeCityDialog [data-europe-city="'+slug+'"]');
 if(touch)await button.tap();else await button.click();
 await page.waitForFunction(slug=>document.body.dataset.europeCity===slug,slug);
}
async function quiet(page){
 await page.waitForFunction(()=>!__emblemAnimations.some(r=>['running','pending'].includes(r.animation.playState)));
 assert.equal(await page.locator('#europeCitySignature').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'no continuing signature animation');
}
async function art(page,slug){
 const signature=page.locator('#europeCitySignature');assert.equal(await signature.isVisible(),true,'native signature visible');
 assert.equal(await signature.locator('svg').count(),1,'one city emblem SVG');
 assert.deepEqual(await signature.locator('use').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['/assets/boom-city-emblems.svg#city-'+slug+'-structure','/assets/boom-city-emblems.svg#city-'+slug+'-accent'],'two original BOOM symbol layers');
 assert.ok((await signature.innerText()).includes(cities[slug]),'real landmark name');
 assert.equal(await page.evaluate(()=>document.getElementById('europeCitySignature')===__originalSignature&&document.getElementById('nextSearchForm')===__originalForm),true,'same signature and real form nodes');
}
async function shape(page){
 const sample=await page.evaluate(()=>{
  const s=document.getElementById('europeCitySignature'),box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,signature:box(s),art:box(s.querySelector('svg')),texts:[...s.querySelectorAll('span,small')].map(n=>({size:parseFloat(getComputedStyle(n).fontSize),box:box(n)})),controls:[...document.querySelectorAll('.hero-bottom>a,.hero-bottom>button')].map(box)};
 });
 assert.ok(sample.scroll<=sample.width+1,'no horizontal document overflow '+JSON.stringify(sample));
 assert.ok(sample.art.width>=88&&sample.art.height>=60,'landmark has readable proportions '+JSON.stringify(sample.art));
 for(const text of sample.texts)assert.ok(text.size>=12,'caption readable at '+text.size+'px');
 const s=sample.signature;assert.ok(s.x>=-1&&s.right<=sample.width+1,'signature inside viewport');
 for(const c of sample.controls){assert.ok(c.height>=44,'native footer actions keep touch target');assert.ok(s.right<=c.x+1||c.right<=s.x+1||s.bottom<=c.y+1||c.bottom<=s.y+1,'signature does not overlap hero action '+JSON.stringify({s,c}));}
}
async function count(page){return page.evaluate(()=>__emblemAnimations.length);}
async function running(page){return page.evaluate(()=>__emblemAnimations.filter(r=>r.animation.playState==='running').length);}
async function goldPixels(page,time){
 await page.evaluate(time=>{for(const r of __emblemAnimations)r.animation.currentTime=time;},time);
 const png=await page.locator('#europeCitySignature svg').screenshot(artifacts?{path:artifacts+'/club-emblem-motion-'+time+'.png'}:{});
 return page.evaluate(async base64=>{
  const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  let gold=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i+1]>110&&pixels[i+2]<100)gold++;
  return gold;
 },png.toString('base64'));
}
try{
 browser=await chromium.launch(launchOptions());
 for(const width of [320,390,1440])await check('Geometry '+width+': six native landmarks, readable captions and clear hero actions',width,async({page})=>{
  await start(page);assert.equal(await count(page),0,'initial load is immediate');
  for(const slug of Object.keys(cities)){
   if(slug!=='rome')await choose(page,slug,width<500);
   await quiet(page);await art(page,slug);await shape(page);
   if(artifacts){await page.locator('#europeCitySignature').screenshot({path:artifacts+'/club-emblem-'+slug+'-'+width+'.png'});if(slug==='rome'){await page.screenshot({path:artifacts+'/club-signature-context-'+width+'.png'});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:artifacts+'/club-home-'+width+'.png'});}}
  }
 },'reduce');
 await check('Pointer and touch: only SVG ink moves, settles once, and keeps native controls fixed',1440,async({page})=>{
  await start(page);await choose(page,'madrid');
  const before=await page.locator('.hero-bottom>a').boundingBox();
  const records=await page.evaluate(()=>__emblemAnimations.map(r=>({city:r.city,part:r.target.dataset.cityArtLayer,duration:r.animation.effect.getTiming().duration,delay:r.animation.effect.getTiming().delay,iterations:r.animation.effect.getTiming().iterations,props:Object.keys(r.animation.effect.getKeyframes()[0])})));
  assert.equal(records.length,2,'one finite animation per visual layer');
  for(const r of records){assert.equal(r.city,'madrid');assert.ok(['structure','accent'].includes(r.part));assert.ok(r.duration+r.delay>=220&&r.duration+r.delay<=280,'finite reveal matches the brief');assert.ok(r.delay<=60,'tight overlap');assert.equal(r.iterations,1);assert.ok(r.props.every(p=>['offset','computedOffset','easing','composite','opacity','strokeDashoffset','strokeDasharray'].includes(p)),'only architectural ink changes, never layout or translation');}
  await quiet(page);await art(page,'madrid');
  const after=await page.locator('.hero-bottom>a').boundingBox();assert.ok(Math.abs(before.x-after.x)<=1&&Math.abs(before.y-after.y)<=1,'hero CTA stays anchored during city reveal');
  await page.waitForTimeout(350);assert.equal(await count(page),2,'no repeat after settling');
 });
 await check('Touch: deliberate city tap uses the same finite reveal',390,async({page})=>{await start(page);await choose(page,'milan',true);assert.equal(await count(page),2);await quiet(page);await art(page,'milan');});
 await check('Paint: architectural accent visibly constructs across real SVG use boundaries',1440,async({page})=>{
  await start(page);await page.evaluate(()=>{window.__freezeEmblem=true;});await choose(page,'madrid');assert.equal(await count(page),2);
  const first=await goldPixels(page,0),middle=await goldPixels(page,140),end=await goldPixels(page,280);
  assert.ok(end>20,'solid gold accent actually renders: '+JSON.stringify({first,middle,end}));
  assert.ok(first<end*.15&&middle>first&&middle<end,'real painted accent develops over time: '+JSON.stringify({first,middle,end}));
  assert.equal(await page.locator('#europeCitySignature [data-city-art-layer="structure"]').evaluate(n=>getComputedStyle(n).transform),'none','architecture never translates');
  await page.evaluate(()=>{for(const r of __emblemAnimations)r.animation.cancel();});await quiet(page);
 });
 await check('Rapid retarget: previous layers cancel and only the latest city remains',1440,async({page})=>{
  await start(page);await choose(page,'madrid');
  await page.evaluate(()=>{window.__oldArtAnimations=__emblemAnimations.map(r=>r.animation);});
  await choose(page,'london');await quiet(page);await art(page,'london');
  assert.equal(await page.evaluate(()=>__oldArtAnimations.every(a=>a.playState==='idle')),true,'retarget cancels previous layer handles');
  assert.equal(await count(page),4,'one reveal per genuine selection');
 });
 await check('Keyboard, history and programmatic selection change the city immediately',1440,async({page})=>{
  await start(page);await page.locator('.europe-city-switch [data-europe-city="madrid"]').focus();await page.keyboard.press('Enter');await art(page,'madrid');assert.equal(await count(page),0,'keyboard has no delayed reveal');
  await page.locator('.europe-city-switch [data-europe-city="london"]').focus();await page.keyboard.press('Space');await art(page,'london');assert.equal(await count(page),0,'space selection immediate');
  await page.goBack();await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid');await art(page,'madrid');assert.equal(await count(page),0,'Back does not animate');
  await page.evaluate(()=>BoomFlightEurope.selectCity('milan'));await art(page,'milan');assert.equal(await count(page),0,'API selection immediate');
 });
 for(const preference of ['reduce','saveData','pause'])await check('Preference '+preference+': selection is immediate without an animation task',1440,async({page})=>{
  await start(page);if(preference==='pause'){await page.locator('#nextMotionToggle').click();assert.equal(await page.locator('#nextMotionToggle').getAttribute('aria-pressed'),'true');}
  await chooseVisible(page,'barcelona');await art(page,'barcelona');assert.equal(await count(page),0,'preference disables decorative work');await quiet(page);
 },preference==='reduce'?'reduce':'no-preference',preference==='saveData');
 for(const interruption of ['pause','apiPause','reduce','saveData','hidden','offscreen','view','pagehide'])await check('Interrupt '+interruption+': active ink cancels and never restarts by itself',1440,async({page})=>{
  await start(page);await choose(page,'madrid');assert.ok(await running(page)>0,'pointer reveal is active before interruption');
  if(interruption==='pause')await page.locator('#nextMotionToggle').evaluate(n=>n.click());
  if(interruption==='apiPause')await page.evaluate(()=>BoomFlightNextMotion.setPaused(true));
  if(interruption==='reduce')await page.emulateMedia({reducedMotion:'reduce'});
  if(interruption==='saveData')await page.evaluate(()=>{navigator.connection.saveData=true;navigator.connection.dispatchEvent(new Event('change'));});
  if(interruption==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  if(interruption==='offscreen')await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  if(interruption==='view')await page.locator('.next-nav a[data-view="apartments"]').click();
  if(interruption==='pagehide')await page.evaluate(()=>dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(()=>__emblemAnimations.every(r=>r.animation.playState==='idle'));
  const total=await count(page);await page.waitForTimeout(350);assert.equal(await count(page),total,'no restart after interruption');
 });
 await check('Offscreen city selection updates native content without starting unseen motion',1440,async({page})=>{
  await start(page);await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await page.locator('.next-nav [data-europe-open]').click();await page.locator('#europeCityDialog [data-europe-city="amsterdam"]').click();
  assert.equal(await count(page),0,'unseen signature schedules no animation');await art(page,'amsterdam');
  await page.locator('#europeCitySignature').scrollIntoViewIfNeeded();await page.waitForTimeout(350);assert.equal(await count(page),0,'returning onscreen never replays city ink');
 });
 await check('Public brief: currency boundary and manifest service fees stay canonical',390,async({page})=>{
  await start(page);const year=new Date().getFullYear()+1;
  await page.locator('#nextMoveIn').fill(year+'-01-31');await page.locator('#nextMoveOut').fill(year+'-07-31');await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
  await choose(page,'madrid',true);await page.waitForFunction(()=>document.getElementById('europeServicePass').textContent.includes('€'));
  assert.equal(await page.locator('#europeBudget').inputValue(),'1500');
  await choose(page,'london',true);assert.equal(await page.locator('#europeBudget').inputValue(),'','EUR is never silently converted to GBP');assert.equal(await page.locator('#europeMoveIn').inputValue(),year+'-01-31');assert.equal(await page.locator('#europePeople').inputValue(),'couple');
  await page.locator('[data-europe-need="application"]').click();await page.waitForFunction(()=>document.getElementById('europeServicePass').textContent.includes('£'));
  const manifest=JSON.parse(readFileSync(root+'assets/boom-desks-public.json','utf8'));const plan=manifest.cities.london.pricing.plans.find(p=>p.id==='application-pack');
  assert.ok((await page.locator('#europeServicePass').innerText()).includes(String(plan.price)),'price comes from the original public manifest');
  const url=new URL(await page.locator('[data-europe-desk-link]').first().getAttribute('href'),origin);assert.equal(url.pathname,'/london');assert.equal(url.searchParams.get('need'),'application');assert.equal(url.searchParams.get('budget'),null);assert.equal(url.searchParams.get('moveIn'),year+'-01-31');
 },'reduce');
 for(const query of ['&experience=panorama','&experience=panorama&vision=dispatch'])await check('Scope '+query+': alternate compositions retain their original city art',1440,async({page})=>{
  await start(page,query);const hrefs=await page.locator('#europeCitySignature use').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));assert.deepEqual(hrefs,['/assets/boom-city-icons.svg#city-rome']);assert.equal(await page.locator('#europeCitySignature [data-city-art-layer]').count(),0);assert.equal(await count(page),0);
 },'reduce');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(!passed&&!failed){console.log('  No test matched '+focus);failed++;}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
