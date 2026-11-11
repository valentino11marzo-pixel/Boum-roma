// City Editions preserves the original city, forms, signature, Pause and globe.
// Synthetic homes and map HTML stop network boundaries; they are not visual proof.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium(),focus=process.argv[2]||'';
const artifacts=process.env.BOOM_FLIGHT_ARTIFACT_DIR||'',year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const manifest=JSON.parse(readFileSync(root+'assets/boom-desks-public.json','utf8'));
const canonicalPaths=Object.fromEntries([...readFileSync(root+'assets/boom-city-emblems.svg','utf8').matchAll(/<path\b([^>]+)>/g)].map(match=>Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute=>[attribute[1],attribute[2]]))).filter(path=>path.id).map(path=>[path.id,path]));
const cities=['rome','madrid','barcelona','amsterdam','london','milan'];
const home={id:'edition-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9,lng:12.49,images:['/edition-photo.svg'],description:'Synthetic public test boundary, never a real home or customer.'};
const mapHTML='<!doctype html><html><body>Skyline rendering boundary<script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},refreshPlaces(){},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
if(artifacts)mkdirSync(artifacts,{recursive:true});
console.log('\n▸ flightcityeditionsui  Six city artworks, one native journey, finite optional motion');
if(!chromium){console.log('  SKIP: playwright unavailable — City Editions browser checks did not run');process.exit(0);}
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/edition-photo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn,motion='reduce',scale=1,expectedFailures=[]){
 if(focus&&!focus.split(',').some(part=>name.includes(part)))return;
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:scale,isMobile:width<500,hasTouch:width<500,reducedMotion:motion}),errors=[],writes=[],missing=[],privateReads=[],requests={catalogue:0};
 await page.addInitScript(()=>{
  const ids=['nextDestinationBoard','nextSolariField','nextMotionToggle','nextSearchForm','europeDeskForm','europeCitySignature','boomGlobeMount'];window.__editionBirthNodes=new Map();
  const observe=new MutationObserver(()=>{for(const id of ids){const node=document.getElementById(id);if(node&&!__editionBirthNodes.has(id))__editionBirthNodes.set(id,node);}const canvas=document.querySelector('.boom-flight-globe-canvas');if(canvas&&!window.__editionBirthCanvas)window.__editionBirthCanvas=canvas;if(document.getElementById('cityEditionArtwork')&&document.getElementById('cityEditionControls'))observe.disconnect();});
  observe.observe(document,{childList:true,subtree:true});
  window.__editionAnimations=[];window.__editionBandAnimations=[];window.__editionRemovals=[];window.__editionClicks=[];const remove=Element.prototype.remove;Element.prototype.remove=function(){if(this.id==='cityEditionAssembly')__editionRemovals.push({city:this.dataset.city,stack:new Error('remove').stack,refs:[...this.querySelectorAll('use')].map(node=>({href:node.getAttribute('href'),width:node.getBBox().width,height:node.getBBox().height})),resources:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('boom-city-emblems')).map(entry=>({name:entry.name,responseEnd:entry.responseEnd,now:performance.now()}))});return remove.call(this);};document.addEventListener('click',event=>{const button=event.target.closest('button[data-europe-city]');if(button)__editionClicks.push({city:button.dataset.europeCity,detail:event.detail,pointer:event.pointerType});},true);const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){const animation=animate.call(this,frames,options);const record={animation,target:this,city:document.body.dataset.europeCity,frames,started:performance.now()};const cancel=animation.cancel.bind(animation);animation.cancel=function(){record.cancelStack=new Error('cancel').stack;return cancel();};if(this.closest('#cityEditionAssembly')||this.matches('[data-city-line]'))window.__editionAnimations.push(record);if(this.classList.contains('city-edition-band'))window.__editionBandAnimations.push(record);return animation;};
 });
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&r.status()>=400)missing.push(new URL(r.url()).pathname+':'+r.status());});
 await page.context().route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings'){requests.catalogue++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:[home]})});}
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname.startsWith('/listing/')||/^\/(barcelona|madrid|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Original service boundary</h1><p>No application or payment sent.</p>'});
  return route.continue();
 });
 try{await fn({page,requests});assert.deepEqual(errors,[],'no unhandled browser errors');assert.deepEqual(writes,[],'no application or payment write');assert.deepEqual(missing.filter(failure=>!expectedFailures.includes(failure)),[],'actual assets loaded');for(const failure of expectedFailures)assert.ok(missing.includes(failure),'the intended network failure was exercised');assert.deepEqual(privateReads,[],'private configuration stays private');passed++;console.log('  ✓ '+name);}
 catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);console.log(error.stack);if(artifacts)await page.screenshot({path:artifacts+'/city-editions-failure-'+failed+'.png'}).catch(()=>{});}
 finally{await page.close();}
}
async function start(page,query='city=rome'){
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch&composition=cityeditions&'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.cityEditionsReady==='true'&&!!window.BoomFlightEurope);
 await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('body').getAttribute('data-city-edition-view'),'art','entry presents the city artwork');
}
async function city(page,slug){const button=page.locator('.europe-city-switch [data-europe-city="'+slug+'"]');if(page.viewportSize().width<500)await button.tap();else await button.click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);}
async function mode(page,value){const button=page.locator('button[data-city-edition-view="'+value+'"]');if(page.viewportSize().width<500)await button.tap();else await button.click();await page.waitForFunction(value=>document.body.dataset.cityEditionView===value,value);if(value==='globe')await page.waitForFunction(()=>BoomFlightGlobe.state().ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function originals(page){
 assert.equal(await page.evaluate(()=>[...__editionBirthNodes].every(([id,node])=>document.getElementById(id)===node)&&__editionBirthCanvas===document.querySelector('.boom-flight-globe-canvas')),true,'original signature, Pause, forms, Solari and canvas survive relocation');
 for(const id of ['europeCitySignature','nextMotionToggle','nextSearchForm','europeDeskForm','boomGlobeMount'])assert.equal(await page.locator('#'+id).count(),1,'one native '+id);
 assert.equal(await page.locator('#cityEditionControls>#nextMotionToggle').count(),1,'both modes share the original Pause');
 assert.equal(await page.locator('#cityEditionArtwork>#europeCitySignature').count(),1,'art uses the original city signature');
}
async function offer(page,slug,planId='full-search'){
 const plan=manifest.cities[slug].pricing.plans.find(plan=>plan.id===planId);assert.ok(plan);
 await page.waitForFunction(label=>document.querySelector('#europeServicePass h3')?.textContent===label,plan.label);
 const price=new Intl.NumberFormat('en-GB',{style:'currency',currency:slug==='london'?'GBP':'EUR',maximumFractionDigits:0}).format(plan.price);
 assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),price);assert.equal(await page.locator('#europeServicePass .europe-service-price small').innerText(),plan.condition);
 const scope=await page.locator('#europeServicePass .dispatch-service-inclusions').textContent();for(const line of [plan.offerDescription,...plan.includes])assert.ok(scope.includes(line),'complete real offer remains available');
 assert.equal(await page.locator('#europeDeskContinue').isVisible(),true,'native next action available');
}
async function shape(page,width){
 const sample=await page.evaluate(()=>{
  const box=n=>n.getBoundingClientRect().toJSON(),board=document.getElementById('nextDestinationBoard'),flaps=[...board.querySelectorAll('.fc2')],art=document.getElementById('cityEditionArtwork'),svg=document.querySelector('#europeCitySignature svg'),pin=document.querySelector('#boomGlobeMount [data-globe-city][aria-pressed="true"]'),credit=document.querySelector('#boomGlobeMount .boom-globe-caption>a');
  const creditLines=[...credit.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()).flatMap(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].filter(rect=>rect.width>1&&rect.height>1).map(rect=>rect.toJSON());});
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,mode:document.body.dataset.cityEditionView,art:box(art),glyph:box(svg),ink:[...svg.querySelectorAll('use')].map(box),controls:box(document.getElementById('cityEditionControls')),modeButtons:[...document.querySelectorAll('#cityEditionControls button')].map(box),cities:[...document.querySelectorAll('.europe-city-switch [data-europe-city]')].map(box),first:box(flaps[0]),last:box(flaps.at(-1)),bay:box(board.parentElement),globe:box(document.querySelector('.boom-globe-stage')),expand:box(document.querySelector('[data-panorama-expand]')),lenses:box(document.querySelector('.dispatch-lenses')),credit:box(credit),creditLines,creditVisibility:getComputedStyle(credit).visibility,ticket:box(document.getElementById('directionClubTicket')),pin:pin&&box(pin),decision:box(document.getElementById('airspaceDecision')),bands:[...art.querySelectorAll('.city-edition-band')].map(n=>({box:box(n),color:getComputedStyle(n).borderTopColor})),rome:!document.getElementById('nextSearch').closest('[hidden]'),foreign:!document.getElementById('europeDeskStory').hidden};
 });
 const apart=(a,b)=>a.right<=b.left+1||a.left>=b.right-1||a.bottom<=b.top+1||a.top>=b.bottom-1;
 assert.ok(sample.scroll<=width+1,'no horizontal page overflow '+JSON.stringify(sample));assert.equal(sample.cities.length,6);
 for(const button of [...sample.cities,...sample.modeButtons])assert.ok(button.width>=44&&button.height>=44&&button.left>=-1&&button.right<=width+1,'complete readable city/mode/Pause target '+JSON.stringify(button));
 for(const flap of [sample.first,sample.last])assert.ok(flap.left>=sample.bay.left-1&&flap.right<=sample.bay.right+1,'native Solari fits its actual bay');
 assert.ok(apart(sample.controls,{...sample.first,right:sample.last.right,bottom:Math.max(sample.first.bottom,sample.last.bottom)}),'mode controls do not obscure the Solari '+JSON.stringify(sample));
 if(sample.mode==='art'){
  assert.equal(sample.bands.length,6);assert.ok(new Set(sample.bands.map(band=>band.color)).size>=3,'distinct colour belongs to the real artwork');
  assert.ok(sample.glyph.width>=120&&sample.glyph.height>=90,'architecture is substantial and readable');
  for(const ink of sample.ink){assert.ok(apart(sample.controls,ink),'mode controls do not obscure architecture '+JSON.stringify(sample));assert.ok(apart(ink,{...sample.first,right:sample.last.right,bottom:Math.max(sample.first.bottom,sample.last.bottom)}),'architectural ink and native Solari do not collide '+JSON.stringify(sample));}
  assert.ok(sample.glyph.left>=-1&&sample.glyph.right<=Math.min(width,sample.decision.left||width)+1,'art stays inside its scene');
 }else{
  assert.ok(sample.globe.width>=240&&sample.globe.height>=150,'original globe retains a useful area');if(sample.pin)assert.ok(apart(sample.expand,sample.pin),'Full view cannot obscure the actual city target '+JSON.stringify(sample));
  assert.equal(sample.creditVisibility,'visible');assert.equal(sample.creditLines.length,1,'Natural Earth attribution remains one painted text line '+JSON.stringify(sample));
  assert.ok(sample.credit.width>0&&sample.credit.height>0&&sample.credit.left>=sample.ticket.left&&sample.credit.right<=sample.ticket.right&&sample.credit.bottom<=sample.ticket.bottom,'attribution stays visibly inside the scene '+JSON.stringify(sample));
  const clearance=(a,b)=>Math.max(b.left-a.right,a.left-b.right,b.top-a.bottom,a.top-b.bottom);
  for(const control of [sample.expand,sample.lenses,...sample.cities])assert.ok(clearance(sample.credit,control)>=7.99,'attribution keeps8px clearance from Full view, lenses and city selection '+JSON.stringify({credit:sample.credit,control,gap:clearance(sample.credit,control)}));
 }
 if(width<700){assert.equal(new Set(sample.cities.map(button=>Math.round(button.top))).size,2,'six cities are visible in two phone rows');assert.ok(sample.cities.every(button=>button.bottom<=sample.decision.top+1),'city selection precedes the native decision');}
 assert.notEqual(sample.rome,sample.foreign,'only the appropriate original planner is shown');
}
async function paintedInk(page,slug){
 const signature=page.locator('#europeCitySignature');assert.deepEqual(await signature.locator('use').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),['/assets/boom-city-emblems.svg#city-'+slug+'-structure','/assets/boom-city-emblems.svg#city-'+slug+'-accent']);
 const rgb=await signature.locator('[data-city-art-layer="structure"]').evaluate(node=>getComputedStyle(node).color.match(/[\d.]+/g).slice(0,3).map(Number)),png=await signature.locator('svg').screenshot();
 const count=await page.evaluate(async({base64,rgb})=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(rgb.every((value,j)=>Math.abs(value-pixels[i+j])<20))count++;return count;},{base64:png.toString('base64'),rgb});
 assert.ok(count>80,'real architectural ink is painted for '+slug+': '+count);
}
async function shot(page,slug,width,view='art'){
 if(!artifacts)return;await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:artifacts+'/city-editions-'+slug+'-'+view+'-'+width+'.png'});
}
async function quiet(page){await page.waitForFunction(()=>document.getElementById('cityEditionArtwork').getAnimations({subtree:true}).every(animation=>!['running','pending'].includes(animation.playState)));}
async function count(page){return page.evaluate(()=>__editionAnimations.length);}
async function sources(page){await page.waitForFunction(()=>document.getElementById('cityEditionArtwork').dataset.citySources==='ready');}
async function settled(page){
 await quiet(page);await page.waitForFunction(()=>!document.getElementById('cityEditionAssembly'));
 assert.equal(await page.locator('#cityEditionArtwork').getAttribute('data-city-assembling'),null,'no stale assembly marker');
 assert.equal(await page.locator('#europeCitySignature>.europe-city-icon').evaluate(node=>getComputedStyle(node).visibility),'visible','original canonical glyph is restored');
 assert.equal(await page.evaluate(()=>__editionBandAnimations.length),0,'reference colour bands remain stationary');
}
async function assembly(page,slug,before){
 await page.waitForFunction(slug=>document.getElementById('cityEditionArtwork').dataset.cityAssembling===slug,slug,{timeout:1500,polling:'raf'}).catch(async error=>{error.message+=' '+JSON.stringify(await page.evaluate(before=>({city:document.body.dataset.europeCity,mode:document.body.dataset.cityEditionView,view:document.body.dataset.view,paused:document.getElementById('nextMotionToggle').getAttribute('aria-pressed'),clicks:__editionClicks,removals:__editionRemovals,records:__editionAnimations.slice(before).map(record=>({state:record.animation.playState,part:record.target.dataset.cityPart,cancel:record.cancelStack})),assembly:!!document.getElementById('cityEditionAssembly'),glyph:document.querySelector('#europeCitySignature>.europe-city-icon').getBoundingClientRect().toJSON()}),before));throw error;});
 const state=await page.evaluate(before=>{
  const root=document.getElementById('cityEditionAssembly'),records=__editionAnimations.slice(before);if(!root)return {missing:true,city:document.body.dataset.europeCity,active:document.getElementById('cityEditionArtwork').dataset.cityAssembling,cancel:records[0]?.cancelStack,records:records.map(record=>({part:record.target.dataset.cityPart,line:record.target.dataset.cityLine,state:record.animation.playState,elapsed:performance.now()-record.started}))};
  return {city:document.body.dataset.europeCity,active:document.getElementById('cityEditionArtwork').dataset.cityAssembling,assembly:root?.dataset.city,hidden:root?.getAttribute('aria-hidden'),originalVisibility:getComputedStyle(document.querySelector('#europeCitySignature>.europe-city-icon')).visibility,parts:[...root.querySelectorAll('.city-edition-plane')].map(node=>({name:node.dataset.cityPart,href:node.querySelector('use').getAttribute('href'),source:node.querySelector('use').dataset.citySource,definition:(()=>{const definition=document.querySelector(node.querySelector('use').getAttribute('href'));return definition&&Object.fromEntries([...definition.attributes].map(attribute=>[attribute.name,attribute.value]));})(),inkWidth:node.querySelector('use').getBBox().width,inkHeight:node.querySelector('use').getBBox().height,transform:getComputedStyle(node).transform})),lines:[...root.querySelectorAll('[data-city-line]')].map(node=>({href:node.getAttribute('href'),source:node.dataset.citySource,definition:(()=>{const definition=document.querySelector(node.getAttribute('href'));return definition&&Object.fromEntries([...definition.attributes].map(attribute=>[attribute.name,attribute.value]));})()})),effects:records.map(record=>({part:record.target.dataset.cityPart,line:record.target.dataset.cityLine,frames:record.animation.effect.getKeyframes(),timing:record.animation.effect.getTiming()}))};
 },before);
 assert.equal(state.missing,undefined,'architectural response must still be active after city click '+JSON.stringify(state));assert.equal(state.city,slug,'native city changes before decorative construction ends');assert.equal(state.active,slug);assert.equal(state.assembly,slug);assert.equal(state.hidden,'true','assembly is visual-only');assert.equal(state.originalVisibility,'hidden','original owner stays mounted behind its temporary presentation');
 assert.ok(state.parts.length>=3&&new Set(state.parts.map(p=>p.name)).size===state.parts.length,'actual architecture is assembled from distinct named parts');
 function canonical(reference,kind){
  assert.ok(reference.href.startsWith('#'),'assembly uses deterministic local canonical definitions');const url=new URL(reference.source,'https://www.boomrome.com');assert.equal(url.pathname,'/assets/boom-city-emblems.svg');assert.ok(url.hash.startsWith('#city-'+slug+'-'+kind+'-'),'source provenance matches selected architecture');
  const original=canonicalPaths[url.hash.slice(1)];assert.ok(original&&reference.definition,'canonical source and local reference exist');
  for(const [name,value] of Object.entries(original))if(name!=='id')assert.equal(reference.definition[name],value,'canonical '+name+' is preserved exactly');
 }
 for(const part of state.parts){assert.ok(part.inkWidth>0&&part.inkHeight>0,'canonical part is loaded before the original is hidden');canonical(part,'part');}
 assert.ok(state.lines.length>=2);for(const line of state.lines)canonical(line,'line');
 const transforms=state.effects.filter(effect=>effect.part),lines=state.effects.filter(effect=>effect.line),reveals=state.effects.filter(effect=>effect.frames.some(frame=>frame.clipPath));
 assert.equal(transforms.length,state.parts.length);assert.equal(reveals.length,state.parts.length);assert.equal(lines.length,state.lines.length);
 for(const effect of transforms)assert.notEqual(effect.frames[0].transform,effect.frames.at(-1).transform,'architectural parts actually move');
 for(const effect of lines){assert.equal(Number(effect.frames[0].strokeDashoffset),1);assert.equal(Number(effect.frames.at(-1).strokeDashoffset),0);}
 const ends=state.effects.map(effect=>{assert.equal(effect.timing.iterations,1);assert.ok(['both','backwards'].includes(effect.timing.fill),'delayed parts cannot flash their final state');return effect.timing.duration+effect.timing.delay;});
 assert.ok(Math.max(...ends)>=630&&Math.max(...ends)<=700,'explanatory architecture finishes within630–700ms');
 assert.ok(state.parts.some(part=>part.transform!=='none'&&!/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(part.transform)),'browser resolves real architectural transforms');
 return state;
}
async function fillRome(page){await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');}
async function editBrief(page){const details=page.locator('#europeOptionalBrief');if(!await details.evaluate(node=>node.open))await details.locator('summary').click();}
try{
 browser=await chromium.launch(launchOptions());
 for(const width of [1440,390,451,320,1024])await check('Geometry '+width+': six city artworks, modes and native Full view stay coherent',width,async({page,requests})=>{
  await start(page);assert.equal(await page.evaluate(()=>__editionAnimations.length),0,'reduced motion omits entry construction');
  for(const slug of cities){if(slug!=='rome')await city(page,slug);if(slug!=='rome')await offer(page,slug);await shot(page,slug,width);await shape(page,width);await originals(page);if(width===1440)await paintedInk(page,slug);}
  assert.equal(await page.evaluate(()=>__editionAnimations.length),0,'reduced motion never schedules architectural assembly');
  await mode(page,'globe');await shot(page,'milan',width,'globe');await shape(page,width);await originals(page);
  await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),1);await page.keyboard.press('Escape');await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});await originals(page);
  await mode(page,'art');await shape(page,width);await originals(page);assert.equal(requests.catalogue,1,'mode switches never duplicate the catalogue');
 });
 await check('Finite motion: six architectures transform and draw once, keyboard and API stay immediate',1440,async({page})=>{
  await start(page);await sources(page);await settled(page);
  for(const slug of ['madrid','barcelona','amsterdam','london','milan','rome']){
   const before=await count(page);await city(page,slug);await assembly(page,slug,before);if(slug!=='rome')await offer(page,slug);
   await page.waitForFunction(()=>[...document.querySelectorAll('#cityEditionAssembly [data-city-line]')].some(node=>{const offset=parseFloat(getComputedStyle(node).strokeDashoffset);return offset>0&&offset<1;}),null,{polling:'raf'});
   await settled(page);await originals(page);
  }
  const complete=await count(page);await page.waitForTimeout(760);assert.equal(await count(page),complete,'no architecture loop or replay');
  await page.locator('.europe-city-switch [data-europe-city="london"]').focus();await page.keyboard.press('Enter');await offer(page,'london');await settled(page);assert.equal(await count(page),complete,'keyboard city selection is immediate');
  await page.evaluate(()=>BoomFlightEurope.selectCity('amsterdam'));await offer(page,'amsterdam');await settled(page);assert.equal(await count(page),complete,'programmatic selection has no decorative delay');
  await mode(page,'globe');await mode(page,'art');assert.equal(await count(page),complete,'mode toggles never replay a construction');await originals(page);
 },'no-preference');
 await check('Source readiness: delayed canonical geometry never delays the native offer or replays late motion',390,async({page})=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});await page.route('**/assets/boom-city-emblems.svg?v=*',async route=>{await gate;await route.continue();});
  await start(page);await city(page,'madrid');await offer(page,'madrid');await settled(page);assert.equal(await count(page),0,'pending canonical geometry keeps the original static city');
  release();await sources(page);await page.waitForTimeout(760);assert.equal(await count(page),0,'late source readiness cannot replay an old selection');await paintedInk(page,'madrid');
  const before=await count(page);await city(page,'london');await assembly(page,'london',before);await settled(page);await offer(page,'london');
 },'no-preference');
 await check('Source failure: unavailable assembly geometry preserves the original city and native service',390,async({page})=>{
  await page.route('**/assets/boom-city-emblems.svg?v=*',route=>route.fulfill({status:503,contentType:'text/plain',body:'Controlled assembly-source outage'}));
  await start(page);await page.waitForFunction(()=>document.getElementById('cityEditionArtwork').dataset.citySources==='unavailable');
  await city(page,'madrid');await offer(page,'madrid');await settled(page);await paintedInk(page,'madrid');assert.equal(await count(page),0);await originals(page);
 },'no-preference',1,['/assets/boom-city-emblems.svg:503']);
 await check('Motion retarget: rapid city changes settle the newest native city without a stale overlay',390,async({page})=>{
  await start(page);await sources(page);await settled(page);const before=await count(page);await city(page,'madrid');await assembly(page,'madrid',before);
  const active=await count(page);await city(page,'london');await settled(page);await offer(page,'london');assert.equal(await count(page),active,'rapid retarget settles instead of stacking/restarting architecture');
  assert.equal(await page.evaluate(()=>__editionAnimations.slice(-1)[0].animation.playState),'idle','old construction is cancelled');
  await page.waitForTimeout(760);assert.equal(await page.locator('body').getAttribute('data-europe-city'),'london');await paintedInk(page,'london');
  const later=await count(page);await city(page,'amsterdam');await assembly(page,'amsterdam',later);const same=await count(page);await city(page,'amsterdam');await settled(page);assert.equal(await count(page),same,'same-city reselection cancels the replaced native glyph without replay');await offer(page,'amsterdam');await originals(page);
 },'no-preference');
 await check('Lifecycle: Pause, reduced motion, hidden, offscreen, modes, resize and exit cancel architecture',1440,async({page})=>{
  await start(page);await sources(page);await settled(page);
  const stops=[['pause','madrid'],['reduce','amsterdam'],['hidden','barcelona'],['offscreen','london'],['mode','milan'],['resize','rome'],['saveData','madrid'],['pagehide','amsterdam'],['view','milan']];
  for(const [reason,slug] of stops){
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));const before=await count(page);await city(page,slug);await assembly(page,slug,before);
   await page.evaluate(before=>{window.__editionBatch=__editionAnimations.slice(before).map(record=>record.animation);},before);
   if(reason==='pause')await page.locator('#nextMotionToggle').evaluate(node=>node.click());
   if(reason==='reduce')await page.emulateMedia({reducedMotion:'reduce'});
   if(reason==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   if(reason==='offscreen')await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   if(reason==='mode')await mode(page,'globe');
   if(reason==='resize'){await page.evaluate(()=>dispatchEvent(new Event('resize')));assert.equal(await page.locator('#cityEditionArtwork').getAttribute('data-city-assembling'),slug,'synthetic board-fit notification does not cancel unchanged geometry');await page.setViewportSize({width:1430,height:900});}
   if(reason==='saveData')await page.evaluate(()=>{window.__savedConnection=Object.getOwnPropertyDescriptor(navigator.connection,'saveData');Object.defineProperty(navigator.connection,'saveData',{configurable:true,value:true});navigator.connection.dispatchEvent(new Event('change'));});
   if(reason==='pagehide')await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   if(reason==='view')await page.locator('.next-nav a[data-view="apartments"]').click();
   await page.waitForFunction(()=>__editionBatch.every(animation=>animation.playState==='idle'));await settled(page);const stopped=await count(page);
   if(reason==='pause'){await city(page,'london');await offer(page,'london');assert.equal(await count(page),stopped,'paused city selection stays immediate');await mode(page,'globe');assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().paused),true,'original Pause also controls the globe');await mode(page,'art');await page.locator('#nextMotionToggle').evaluate(node=>node.click());}
   if(reason==='reduce')await page.emulateMedia({reducedMotion:'no-preference'});
   if(reason==='hidden')await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   if(reason==='offscreen')await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   if(reason==='mode')await mode(page,'art');
   if(reason==='resize')await page.setViewportSize({width:1440,height:900});
   if(reason==='saveData')await page.evaluate(()=>{if(__savedConnection)Object.defineProperty(navigator.connection,'saveData',__savedConnection);else delete navigator.connection.saveData;navigator.connection.dispatchEvent(new Event('change'));});
   if(reason==='pagehide')await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   if(reason==='view')await page.locator('.next-brand[data-view="home"]').first().click();
   await page.waitForTimeout(760);assert.equal(await count(page),stopped,'restoring '+reason+' cannot replay cancelled architecture');await settled(page);
  }
  await originals(page);
 },'no-preference');
 for(const [width,dpr] of [[1440,1],[390,3]])await check('Pixel parity '+width+' DPR'+dpr+': assembled city union matches each native canonical glyph',width,async({page})=>{
  await start(page);await sources(page);await settled(page);
  for(const slug of ['madrid','barcelona','amsterdam','london','milan','rome']){
   const before=await count(page);await city(page,slug);await assembly(page,slug,before);
   await page.evaluate(before=>{for(const record of __editionAnimations.slice(before)){const timing=record.animation.effect.getTiming();record.animation.pause();record.animation.currentTime=timing.delay+timing.duration;}},before);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.locator('#cityEditionAssembly').count(),1,'endpoint is sampled on the actual assembly');const geometry=await page.evaluate(()=>({dpr:devicePixelRatio,svg:document.querySelector('#europeCitySignature>.europe-city-icon').getBoundingClientRect().toJSON(),assembly:document.getElementById('cityEditionAssembly').getBoundingClientRect().toJSON(),planes:[...document.querySelectorAll('.city-edition-plane')].map(node=>({part:node.dataset.cityPart,box:node.getBoundingClientRect().toJSON(),transform:getComputedStyle(node).transform}))}));const clip=await page.locator('#europeCitySignature>.europe-city-icon').boundingBox(),assembled=await page.screenshot({clip});
   await page.locator('#nextMotionToggle').evaluate(node=>node.click());await settled(page);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const native=await page.screenshot({clip});
   const parity=await page.evaluate(async({assembled,native})=>{
    async function pixels(base64){const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;}
    const [a,b]=await Promise.all([pixels(assembled),pixels(native)]),results={};
    for(const [ink,rgb] of Object.entries({structure:[255,255,255],accent:[255,215,0]})){
     let union=0,difference=0,first=0,second=0;for(let i=0;i<a.length;i+=4){const hasA=rgb.every((value,k)=>Math.abs(a[i+k]-value)<28),hasB=rgb.every((value,k)=>Math.abs(b[i+k]-value)<28);if(hasA)first++;if(hasB)second++;if(hasA||hasB)union++;if(hasA!==hasB)difference++;}results[ink]={assembled:first,native:second,difference,union,ratio:difference/Math.max(1,union)};
    }return results;
   },{assembled:assembled.toString('base64'),native:native.toString('base64')});
   if(Object.values(parity).some(result=>result.ratio>=.035)){writeFileSync('/private/tmp/city-assembly-qa-parity-'+width+'-'+slug+'-geometry.json',JSON.stringify({geometry,parity},null,2));writeFileSync('/private/tmp/city-assembly-qa-parity-'+width+'-'+slug+'-assembly.png',assembled);writeFileSync('/private/tmp/city-assembly-qa-parity-'+width+'-'+slug+'-native.png',native);}
   for(const [ink,result] of Object.entries(parity)){assert.ok(result.assembled>80&&result.native>80,'both actual renders contain '+slug+' '+ink);assert.ok(result.ratio<.035,'settled assembly/native '+slug+' '+ink+' pixel union agrees '+JSON.stringify(parity));}
   await page.locator('#nextMotionToggle').evaluate(node=>node.click());await originals(page);
  }
 },'no-preference',dpr);
 await check('Handoff: original dates, invalid input, currency and selected public service remain canonical',390,async({page})=>{
  await start(page,'city=rome&privatePlace=synthetic-office&lat=41.9123&lng=12.5123');await fillRome(page);await city(page,'madrid');await offer(page,'madrid');assert.equal(await page.locator('#europeBudget').inputValue(),'1500');
  await city(page,'london');await offer(page,'london');assert.equal(await page.locator('#europeBudget').inputValue(),'','EUR is never silently converted into GBP');assert.equal(await page.locator('#europeMoveIn').inputValue(),arrival);
  await page.locator('[data-europe-need="application"]').click();await offer(page,'london','application-pack');await editBrief(page);await page.locator('#europeMoveOut').fill(year+'-01-01');await page.locator('#europeDeskContinue').click();await page.locator('#europeDeskError').waitFor({state:'visible'});assert.equal(new URL(page.url()).pathname,'/flight-next');
  await page.locator('#europeMoveOut').fill(departure);await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');const url=new URL(page.url());
  for(const [key,value] of Object.entries({need:'application',moveIn:arrival,moveOut:departure,people:'couple'}))assert.equal(url.searchParams.get(key),value);assert.equal(url.hash,'#fare-application-pack');
  for(const key of ['composition','vision','experience','privatePlace','lat','lng','budget'])assert.equal(url.searchParams.has(key),false,'native handoff excludes '+key);
 });
 await check('Studio: City Editions retains public GBP brief and rejects private or invalid draft transfer',1440,async({page})=>{
  const query='experience=dispatch&composition=airspace&city=london&need=application&moveIn='+arrival+'&moveOut='+departure+'&budget=3000&currency=GBP&people=family&privatePlace=synthetic-office&lat=41.9123&lng=12.5123';
  await page.goto(origin+'/flight-studio?'+query,{waitUntil:'domcontentloaded'});const frame=await (await page.locator('#studioFrame').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.BoomFlightEurope);await offer(frame,'london','application-pack');
  await page.locator('button[data-studio-composition="cityeditions"]').click();await frame.waitForFunction(()=>document.body.dataset.cityEditionsReady==='true');
  const incoming=new URL(frame.url());for(const [key,value] of Object.entries({composition:'cityeditions',city:'london',need:'application',moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'family'}))assert.equal(incoming.searchParams.get(key),value);
  for(const key of ['privatePlace','lat','lng'])assert.equal(incoming.searchParams.has(key)||new URL(page.url()).searchParams.has(key),false,'comparison keeps only the public brief');await offer(frame,'london','application-pack');
  await editBrief(frame);await frame.locator('#europeMoveOut').fill(year+'-01-01');await frame.evaluate(()=>{window.__studioOriginalForm=document.getElementById('europeDeskForm');});await page.locator('button[data-studio-composition="airspace"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>__studioOriginalForm===document.getElementById('europeDeskForm')),true,'invalid values stay in the original form');assert.equal(await page.locator('button[data-studio-composition="cityeditions"]').getAttribute('aria-pressed'),'true');
  await frame.locator('#europeMoveOut').fill(departure);await page.locator('button[data-studio-device="mobile"]').click();await frame.waitForFunction(()=>innerWidth===390);assert.equal(await frame.evaluate(()=>__studioOriginalForm===document.getElementById('europeDeskForm')),true);assert.equal(await page.locator('#studioFrame').count(),1);
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(!passed&&!failed){console.log('  No scenario matched '+focus);failed++;}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
