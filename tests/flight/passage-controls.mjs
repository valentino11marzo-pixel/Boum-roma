// Passage groups native controls; keyboard, motion and full-view ownership stay native.
// Only the catalogue network boundary is synthetic. No controller or clock is mocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium(),artifacts=process.env.BOOM_FLIGHT_ARTIFACT_DIR||'';
if(!chromium){console.log('SKIP: playwright unavailable — Passage controls were not checked');process.exit(0);}
if(artifacts)mkdirSync(artifacts,{recursive:true});
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const pathname=new URL(req.url,'http://localhost').pathname;let file=root+pathname.slice(1);
 if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
const selectors=['#nextMotionToggle','[data-dispatch-lens="globe"]','[data-dispatch-lens="horizon"]','[data-panorama-expand]','.boom-flight-globe-canvas','#nextSolariField'];
async function check(name,width,run,motion='no-preference',geography=true){
 if(process.argv[2]&&!name.includes(process.argv[2]))return;
 const page=await browser.newPage({viewport:{width,height:width<500?844:720},isMobile:width<500,hasTouch:width<500,reducedMotion:motion}),errors=[],writes=[],privateReads=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(selectors=>{window.__controlOriginals=new Map();new MutationObserver(()=>{selectors.forEach(s=>{const n=document.querySelector(s);if(n&&!__controlOriginals.has(s))__controlOriginals.set(s,n);});}).observe(document,{childList:true,subtree:true});},selectors);
 await page.context().route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings')return route.fulfill({contentType:'application/json',body:'{"ok":true,"listings":[]}'});
  if(!geography&&url.pathname==='/assets/boom-globe-geography.json')return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  return route.continue();
 });
 try{await run(page);assert.deepEqual(errors,[],'no browser exceptions');assert.deepEqual(writes,[],'no application/payment write');assert.deepEqual(privateReads,[],'private city configuration untouched');passed++;console.log('✓ '+name);}
 catch(e){failed++;console.error('✗ '+name+' — '+e.message);if(artifacts)await page.screenshot({path:artifacts+'/controls-failure-'+failed+'.png'}).catch(()=>{});}
 finally{await page.close();}
}
async function start(page,composition='passage',geography=true){
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch&composition='+composition+'&city=milan&need=viewing',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.airspaceReady==='true'&&!!window.BoomFlightEurope);
 if(composition==='passage')await page.waitForFunction(()=>document.body.dataset.passageControls==='ready');
 await page.waitForFunction(expected=>expected?BoomFlightGlobe.state().ready:BoomFlightGlobe.state().error,geography);
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
}
async function originals(page){assert.equal(await page.evaluate(selectors=>selectors.every(s=>__controlOriginals.get(s)===document.querySelector(s)),selectors),true,'same original controls, canvas and Solari');assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1,'one renderer');assert.equal(await page.locator('#nextMotionToggle').count(),1,'one motion owner');}
const apart=(a,b)=>a.right<=b.left+.1||a.left>=b.right-.1||a.bottom<=b.top+.1||a.top>=b.bottom-.1;
async function fit(page,dialog=false){
 const state=await page.evaluate(dialog=>{
  const box=n=>n.getBoundingClientRect().toJSON(),hit=n=>{const r=box(n),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h===n||n.contains(h);};
  const scope=document.querySelector(dialog?'#panoramaGlobeDialog':'.passage-view-controls');
  const controls=[...scope.querySelectorAll(dialog?'.passage-view-controls button,.panorama-full-actions button':'button')].filter(n=>{const r=box(n);return r.width&&r.height;});
  return{width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('body *')].filter(n=>{const r=box(n);return r.width&&r.left>=0&&r.right>innerWidth+1&&getComputedStyle(n).position!=='fixed';}).slice(0,8).map(n=>({html:n.outerHTML.slice(0,500),parent:n.parentElement?.outerHTML.slice(0,160),box:box(n)})),controls:controls.map(n=>({name:n.getAttribute('aria-label')||n.textContent,box:box(n),hit:hit(n)}))};
 },dialog);
 assert.ok(state.scroll<=state.width+1,'no horizontal overflow '+JSON.stringify({width:state.width,scroll:state.scroll,outside:state.outside}));
 for(const a of state.controls){assert.ok(a.box.width>=44&&a.box.height>=44,'44px target: '+JSON.stringify(a));assert.ok(a.box.left>=-1&&a.box.right<=state.width+1&&a.box.top>=0&&a.box.bottom<=state.height+1,'in-frame target: '+JSON.stringify(a));assert.ok(a.hit,'unobscured target: '+JSON.stringify(a));}
 for(let i=0;i<state.controls.length;i++)for(const b of state.controls.slice(i+1))assert.ok(apart(state.controls[i].box,b.box),'controls do not overlap '+JSON.stringify([state.controls[i],b]));
 if(dialog){const notes=await page.locator('#panoramaGlobeDialog .panorama-route,#panoramaGlobeDialog .boom-globe-caption>a').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));for(const note of notes)for(const c of state.controls)assert.ok(apart(note,c.box),'view controls clear destination and geography attribution');}
 if(!dialog){assert.equal(state.controls.length,4,'exactly four scene actions');assert.ok(Math.max(...state.controls.map(c=>c.box.top))-Math.min(...state.controls.map(c=>c.box.top))<1,'one aligned rail');}
 await originals(page);
}
async function shot(page,name){if(artifacts)await page.screenshot({path:artifacts+'/'+name+'.png'});}
try{
 browser=await chromium.launch(launchOptions());
 for(const width of [320,390,768,1024,1280,1440])await check('Aligned native controls '+width,width,async page=>{await start(page);await fit(page);assert.equal(await page.getByRole('button',{name:'Show a closer globe view',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Expand the globe',exact:true}).count(),1);await shot(page,'controls-'+width);},'reduce');
 for(const width of [390,1280])await check('Real idle hint clears controls '+width,width,async page=>{
  await start(page);await page.waitForFunction(()=>{const n=document.querySelector('.panorama-globe-hint');return n?.dataset.visible==='true'&&+getComputedStyle(n).opacity>.95;});
  const geometry=await page.evaluate(()=>{const box=n=>n.getBoundingClientRect().toJSON();return{hint:box(document.querySelector('.panorama-globe-hint')),targets:[...document.querySelectorAll('.passage-view-controls button,.boom-globe-caption>a')].map(box).filter(r=>r.width&&r.height)};});
  for(const target of geometry.targets)assert.ok(apart(geometry.hint,target),'real normal-motion hint clears controls and credit');await fit(page);await shot(page,'controls-idle-'+width);
 });
 await check('Keyboard lens and native pause/play',1280,async page=>{
  await start(page);const close=page.getByRole('button',{name:'Show a closer globe view',exact:true});await close.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>BoomFlightGlobe.state().framing==='horizon');assert.equal(await close.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().framingTransition),false,'keyboard framing changes immediately');
  const pause=page.locator('#nextMotionToggle');await pause.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>BoomFlightGlobe.state().paused&&BoomFlightNextMotion.state().paused);
  assert.equal(await pause.getAttribute('aria-label'),'Play animations');const before=await page.evaluate(()=>BoomFlightNextMotion.state().elapsedMs);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().elapsedMs),before,'native Solari clock stops');
  await page.keyboard.press('Space');await page.waitForFunction(()=>!BoomFlightGlobe.state().paused&&!BoomFlightNextMotion.state().paused);assert.equal(await pause.getAttribute('aria-label'),'Pause animations');await originals(page);
 });
 for(const width of [320,390,1280])await check('Native full view restores controls '+width,width,async page=>{
  await start(page);const opener=page.getByRole('button',{name:'Expand the globe',exact:true});await opener.focus();await page.keyboard.press('Enter');await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});await fit(page,true);await shot(page,'controls-full-'+width);
  assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),1);const motion=page.locator('[data-panorama-motion]');await motion.click();await page.waitForFunction(()=>BoomFlightGlobe.state().paused);assert.equal(await motion.getAttribute('aria-label'),'Play animations');await motion.click();await page.waitForFunction(()=>!BoomFlightGlobe.state().paused);
  await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});assert.equal(await opener.evaluate(n=>n===document.activeElement),true,'focus returns to native opener');await fit(page);
 });
 await check('Reduced motion reflects system and preserves manual pause',390,async page=>{
  await start(page);const pause=page.locator('#nextMotionToggle');assert.equal(await pause.isDisabled(),true);assert.equal(await pause.getAttribute('aria-label'),'Animations disabled by your device preference');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().reducedMotion),true);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.getElementById('nextMotionToggle').disabled);await pause.click();await page.waitForFunction(()=>BoomFlightGlobe.state().paused);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.getElementById('nextMotionToggle').disabled);await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.getElementById('nextMotionToggle').disabled);assert.equal(await pause.getAttribute('aria-pressed'),'true','manual pause survives media changes');assert.equal(await pause.getAttribute('aria-label'),'Play animations');await fit(page);
 },'reduce');
 await check('Geography failure retains truthful native actions',390,async page=>{await start(page,'passage',false);for(const lens of ['globe','horizon'])assert.equal(await page.locator('[data-dispatch-lens="'+lens+'"]').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Expand the globe',exact:true}).isEnabled(),true);assert.equal(await page.locator('#europeDeskContinue').isVisible(),true);await originals(page);},'reduce',false);
 await check('Other compositions retain original controls',1280,async page=>{await start(page,'meridian');assert.equal(await page.locator('.passage-view-controls').count(),0);assert.equal(await page.locator('[data-dispatch-lens="horizon"]').innerText(),'Horizon');await originals(page);},'reduce');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
