// Panorama uses the real city, journey, globe and motion controllers. Fixtures
// replace only the public catalogue, photo bytes, Skyline rendering and final
// form boundary. Every write and every remote browser request is blocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flightpanoramaui  One globe, a complete move and an honest immersive preview');
const focus=process.argv[2]||'';
if(focus)console.log('  Focus: '+focus+' (default invocation runs every scenario)');
if(!chromium){console.log('  SKIP: playwright unavailable — panorama browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const homes=[
 {id:'panorama-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2},
 {id:'panorama-room',name:'Fixture Room',price:700,sqm:18,bedrooms:1,type:'Room'}
].map((home,i)=>({...home,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9+i*.01,lng:12.49,
 images:['/panorama-photo.svg','/panorama-photo-2.svg'],description:'Synthetic public catalogue boundary, never a real home or customer.'}));
const mapHTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Skyline rendering boundary</p><script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},map:{resize(){},stop(){}}};addEventListener("message",e=>{if(e.source===parent&&e.origin===location.origin&&e.data.t==="boomSelect")parent.postMessage({t:"boomSelected",id:e.data.id},location.origin);});parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(/^\/panorama-photo(?:-2)?\.svg$/.test(pathname)){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>');}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.woff2')?'font/woff2':file.endsWith('.woff')?'font/woff':file.endsWith('.ttf')?'font/ttf':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn,motion='reduce'){
 if(focus&&!name.includes(focus))return;
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion});
 const errors=[],writes=[],missing=[],privateReads=[];let catalogueReads=0;
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(origin+'/assets/')&&response.status()>=400)missing.push(new URL(response.url()).pathname);});
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push(request.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings'){catalogueReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});}
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname.startsWith('/listing/')||/^\/(barcelona|madrid|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Original public form boundary</h1><p>No application or payment is sent.</p>'});
  return route.continue();
 });
 try{
  await fn({page,catalogueReads:()=>catalogueReads});
  assert.deepEqual(errors,[],'no unhandled browser errors');assert.deepEqual(writes,[],'no application, lead or payment write');
  assert.deepEqual(missing,[],'all actual assets loaded');assert.deepEqual(privateReads,[],'no private city configuration read');
  passed++;console.log('  ✓ '+name);
 }catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}
 finally{await page.close();}
}
async function start(page,query=''){
 await page.goto(origin+'/flight-next?direction=club&edition=club&experience=panorama'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.experience==='panorama'&&!!window.BoomFlightEurope&&window.BoomFlightGlobe?.state().ready);
 await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});
 await oneGlobe(page);
 assert.equal((await page.locator('#nextDestinationBoard').getAttribute('aria-label')).toLowerCase(),new URL(page.url()).searchParams.get('city')||'rome','Solari announces the canonical city');
}
async function oneGlobe(page){
 assert.equal(await page.locator('.boom-flight-globe').count(),1,'one geographic globe');
 assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1,'one globe canvas');
}
async function paintedGlobe(page){
 await page.waitForFunction(()=>{
  const canvas=document.querySelector('.boom-flight-globe-canvas');
  if(!canvas?.width||!canvas.height||!canvas.getClientRects().length)return false;
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
  // A retained node or freshly resized, cleared buffer is insufficient: the
  // actual renderer must have painted visible, varied geographic content.
  for(let i=0;i<pixels.length;i+=1024)if(pixels[i+3]){
   colors.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);if(colors.size>16)return true;
  }
  return false;
 });
}
async function geometry(page,selectors=[]){
 await page.evaluate(()=>document.fonts.ready);
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(size.scroll<=size.width+1,'no horizontal page overflow: '+JSON.stringify(size));
 for(const selector of selectors){
  const controls=await page.locator(selector).evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};}));
  assert.ok(controls.length,selector+' is visible');assert.ok(controls.every(r=>r.width>=44&&r.height>=44),selector+' is usable by touch: '+JSON.stringify(controls));
 }
}
async function typeQuality(page,view){
 await page.evaluate(()=>document.fonts.ready);
 const font=await page.evaluate(()=>({
  family:getComputedStyle(document.body).fontFamily,
  loaded:[...document.fonts].some(face=>face.family.replace(/["']/g,'')==='BOOM Sans'&&face.status==='loaded')
 }));
 // Computed family alone can lie: a missing file silently falls back. Check the
 // real browser FontFaceSet as well as the family applied to reading/control UI.
 assert.equal(font.loaded,true,'the local BOOM Sans face has actually loaded');
 assert.equal(font.family.split(',')[0].replace(/["']/g,'').trim(),'BOOM Sans','body uses BOOM Sans');
 const samples={
  home:[['body',16],['.hero-promise',16],['#nextSearchForm>label>span',13],['#nextSearchForm input,#nextSearchForm select',16],['.search-caption',12]],
  apartments:[['.club-explore-note',14]],
  detail:[['.detail-copy',16],['.decision-cta>small',12],['.club-application-next p',14],['.edition-costs dt,.edition-costs small',12]]
 };
 for(const [selector,floor] of samples[view]){
  const measured=await page.locator(selector).evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>({font:parseFloat(getComputedStyle(node).fontSize),text:node.textContent.trim().slice(0,75)})));
  assert.ok(measured.length,selector+' has visible reading content');
  assert.ok(measured.every(item=>item.font>=floor),selector+' stays readable (minimum '+floor+'px): '+JSON.stringify(measured));
 }
 const controls={home:'#nextSearchForm input,#nextSearchForm select,#nextSearchForm button[type="submit"]',apartments:'#nextEditStay',detail:'[data-next-apply]'};
 const families=await page.locator(controls[view]).evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fontFamily.split(',')[0].replace(/["']/g,'').trim()));
 assert.ok(families.length&&families.every(family=>family==='BOOM Sans'),'reading and control type stay in the same family: '+JSON.stringify(families));
}
async function primaryContrast(page,selector){
 const colors=await page.locator(selector).evaluate(node=>{
  const probe=document.createElement('canvas');probe.width=probe.height=1;const context=probe.getContext('2d');
  function rgba(value){context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].map(channel=>channel/255);}
  function blend(front,back){return front.slice(0,3).map((channel,i)=>channel*front[3]+back[i]*(1-front[3]));}
  // Resolve transparent nested labels through their real painted ancestors.
  const chain=[];for(let current=node;current;current=current.parentElement){chain.unshift(current);if(rgba(getComputedStyle(current).backgroundColor)[3]===1)break;}
  let background=[1,1,1],opacity=1;const images=[];
  for(const current of chain){const style=getComputedStyle(current);background=blend(rgba(style.backgroundColor),background);if(style.backgroundImage!=='none')images.push(style.backgroundImage);}
  for(let current=node;current;current=current.parentElement)opacity*=Number(getComputedStyle(current).opacity);
  const ink=rgba(getComputedStyle(node).color);ink[3]*=opacity;
  return {foreground:blend(ink,background),background,images};
 });
 assert.deepEqual(colors.images,[],selector+' has an unambiguous painted background for the text contrast check');
 function luminance(rgb){const linear=rgb.map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];}
 const a=luminance(colors.foreground),b=luminance(colors.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 assert.ok(ratio>=4.5,selector+' text has at least 4.5:1 contrast; actual '+ratio.toFixed(2)+':1 '+JSON.stringify(colors));
}
function previewIntent(url,{view,budget='1500',city='rome',place='luiss'}={}){
 for(const [key,value] of Object.entries({direction:'club',edition:'club',experience:'panorama',moveIn:arrival,moveOut:departure,budget,people:'couple'}))assert.equal(url.searchParams.get(key),value,key+' survives preview navigation');
 if(view)assert.equal(url.searchParams.get('view'),view);
 if(city!=='rome')assert.equal(url.searchParams.get('city'),city);
 if(place)assert.equal(url.searchParams.get('place'),place,'public daily destination survives');
}
async function fillRome(page){
 await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination="luiss"]').click();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
 await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);
 await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
}
async function openGlobe(page){
 await page.locator('[data-panorama-expand]').click();await page.locator('#panoramaGlobeDialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#panoramaGlobeDialog').evaluate(node=>node.open),true);
 await oneGlobe(page);
 assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),1,'the original globe is in the modal');
 assert.equal(await page.evaluate(()=>document.getElementById('panoramaGlobeDialog').contains(document.activeElement)),true,'keyboard focus enters the modal');
 await paintedGlobe(page);
}
async function closeGlobe(page,escape=false){
 if(escape)await page.keyboard.press('Escape');else await page.locator('[data-panorama-close]').click();
 await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-panorama-expand]'));
 assert.equal(await page.locator('#panoramaGlobeDialog .boom-flight-globe-canvas').count(),0,'closing returns the globe to the page');
 await oneGlobe(page);await paintedGlobe(page);
}
async function stableFrames(page){
 await page.waitForFunction(()=>!BoomFlightGlobe.state().rafPending&&!BoomFlightGlobe.state().flying);
 const frames=await page.evaluate(()=>BoomFlightGlobe.state().frames);
 await page.waitForTimeout(180);
 assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),frames,'a paused or settled globe does not keep drawing');
}
try{
 browser=await chromium.launch(await launchOptions());
 for(const width of [320,390,1440])await check(width+': Home → Apartments → Detail keeps the move and reaches the original Apply',width,async({page})=>{
  await start(page);await geometry(page,['[data-panorama-expand]','.edition-plan-link','#nextSearchForm button[type="submit"]']);
  await typeQuality(page,'home');await primaryContrast(page,'.edition-pass-action');await primaryContrast(page,'#nextSearchForm button[type="submit"]');
  assert.equal(await page.locator('#nextSearchForm').count(),1,'one original planner');
  await fillRome(page);await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  previewIntent(new URL(page.url()),{view:'apartments'});await geometry(page,['#nextEditStay']);await typeQuality(page,'apartments');
  await page.locator('#nextApartmentsMap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>BoomNextMap.state().status==='ready');
  assert.equal(await page.locator('iframe.boom-next-map-frame').count(),1,'one Skyline during exploration');
  await page.locator('#nextResults [data-home="panorama-courtyard"]').first().click();await page.locator('#nextDetailTitle').waitFor();
  assert.equal(await page.locator('#nextDetailTitle').innerText(),'Fixture Courtyard');previewIntent(new URL(page.url()),{view:'detail'});
  await geometry(page,['[data-next-apply]']);await typeQuality(page,'detail');await primaryContrast(page,'[data-next-apply]');assert.equal(await page.locator('iframe.boom-next-map-frame').count(),1);
  const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);
  assert.equal(apply.pathname,'/listing/panorama-courtyard');assert.equal(apply.hash,'#applica');assert.equal(apply.searchParams.has('experience'),false,'a presentation option does not enter the original application');
  for(const [key,value] of Object.entries({moveIn:arrival,moveOut:departure,budget:'1500',people:'couple',place:'luiss'}))assert.equal(apply.searchParams.get(key),value,'Apply preserves '+key);
  await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/panorama-courtyard');assert.equal(page.url(),apply.href,'Apply reaches the actual canonical URL without submitting');
  await page.goBack();await page.locator('#nextDetailTitle').waitFor();previewIntent(new URL(page.url()),{view:'detail'});
  await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('#nextApartments').waitFor();previewIntent(new URL(page.url()),{view:'apartments'});
 });
 await check('900: tablet planner controls do not overlap; reduced motion preserves the keyboard-only skip link',900,async({page})=>{
  await start(page);await typeQuality(page,'home');await geometry(page,['#nextDestinationSummary','#nextSearchForm button[type="submit"]']);
  const layout=await page.locator('#nextSearchForm').evaluate(form=>({
   bounds:form.getBoundingClientRect().toJSON(),
   controls:[...form.children].filter(node=>node.matches('label,button')&&node.getClientRects().length).map(node=>({
    name:node.id||node.querySelector('input,select')?.id||'submit',submit:node.matches('[type="submit"]'),box:node.getBoundingClientRect().toJSON()
   }))
  }));
  for(const item of layout.controls){
   assert.ok(item.box.left>=layout.bounds.left-1&&item.box.right<=layout.bounds.right+1,item.name+' stays inside the tablet planner');
   for(const other of layout.controls){
    if(item===other)continue;
    const overlapX=Math.min(item.box.right,other.box.right)-Math.max(item.box.left,other.box.left);
    const overlapY=Math.min(item.box.bottom,other.box.bottom)-Math.max(item.box.top,other.box.top);
    assert.ok(overlapX<=1||overlapY<=1,item.name+' must not overlap '+other.name+' at tablet width');
   }
  }
  const submit=layout.controls.find(item=>item.submit),fields=layout.controls.filter(item=>!item.submit);
  assert.ok(submit&&fields.length,'the tablet planner contains its fields and submit');
  assert.ok(submit.box.top>=Math.max(...fields.map(item=>item.box.bottom))-1,'the tablet action follows the destination and fields instead of occupying their row');
  const skip=page.getByRole('link',{name:'Skip to content',exact:true});
  const outside=()=>skip.evaluate(node=>{const r=node.getBoundingClientRect();return r.bottom<=0||r.right<=0||r.top>=innerHeight||r.left>=innerWidth;});
  assert.equal(await outside(),true,'reduced motion does not expose the unfocused skip link');
  await page.keyboard.press('Tab');
  assert.equal(await skip.evaluate(node=>document.activeElement===node),true,'the skip link is the first keyboard destination');
  assert.equal(await outside(),false,'the focused skip link is visible in the viewport');
  await page.keyboard.press('Tab');
  assert.equal(await outside(),true,'the skip link leaves the viewport again after focus moves on');
 });
 await check('London: globe and Solari share the canonical city, and GBP requires a new budget',390,async({page})=>{
  await start(page);await fillRome(page);
  await openGlobe(page);
  await page.locator('.boom-flight-globe [data-globe-city="london"]').click();
  await page.waitForFunction(()=>document.body.dataset.europeCity==='london'&&BoomFlightGlobe.state().city==='london');
  await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  assert.equal(new URL(page.url()).searchParams.get('experience'),'panorama');assert.equal((await page.locator('#nextDestinationBoard').getAttribute('aria-label')).toLowerCase(),'london');
  for(const [id,value] of Object.entries({europeMoveIn:arrival,europeMoveOut:departure,europeBudget:'',europePeople:'couple'}))assert.equal(await page.locator('#'+id).inputValue(),value,'currency change preserves only the applicable '+id);
  assert.equal(await page.locator('#europeCurrencyNote').isVisible(),true);
  if(!await page.locator('#europeOptionalBrief').evaluate(node=>node.open))await page.locator('#europeOptionalBrief summary').click();
  await page.locator('#europeBudget').selectOption('3000');await page.locator('[data-europe-need="application"]').click();
  await page.locator('#europeServicePass .europe-service-price').waitFor();await geometry(page,['#europeDeskContinue']);
  const current=new URL(page.url());previewIntent(current,{city:'london',budget:'3000',place:null});assert.equal(current.searchParams.get('currency'),'GBP');
  for(const key of ['place','privatePlace','homes','lat','lng'])assert.equal(current.searchParams.has(key),false,'foreign destination excludes '+key);
  await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
  const desk=new URL(page.url());for(const [key,value] of Object.entries({from:'flight',city:'london',currency:'GBP',budget:'3000',people:'couple',need:'application',moveIn:arrival,moveOut:departure}))assert.equal(desk.searchParams.get(key),value,'the original desk receives '+key);
  assert.equal(desk.searchParams.has('experience'),false);
 });
 for(const width of [390,1440])await check(width+': fullscreen reuses the canvas, closes by button or Escape and returns keyboard focus',width,async({page,catalogueReads})=>{
  await start(page);await fillRome(page);
  await page.evaluate(()=>{window.__panoramaOriginalGlobe=document.querySelector('.boom-flight-globe');window.__panoramaOriginalCanvas=document.querySelector('.boom-flight-globe-canvas');window.__panoramaOriginalForm=document.getElementById('nextSearchForm');});
  const reads=catalogueReads(),url=page.url();
  for(const escape of [false,true]){
   await openGlobe(page);await geometry(page,['[data-panorama-close]','[data-panorama-motion]']);
   assert.equal(await page.evaluate(()=>document.querySelector('.boom-flight-globe')===window.__panoramaOriginalGlobe&&document.querySelector('.boom-flight-globe-canvas')===window.__panoramaOriginalCanvas),true,'opening moves the existing renderer instead of mounting another');
   if(width===1440&&!escape)for(const resized of [390,1440]){
    await page.setViewportSize({width:resized,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#panoramaGlobeDialog').evaluate(node=>node.open),true,'a responsive breakpoint does not dismiss exploration');
    assert.equal(await page.evaluate(()=>document.getElementById('panoramaGlobeDialog').contains(window.__panoramaOriginalCanvas)&&document.querySelector('.boom-flight-globe-canvas')===window.__panoramaOriginalCanvas),true,'resizing keeps the same live canvas inside the modal');
    await oneGlobe(page);await paintedGlobe(page);await geometry(page,['[data-panorama-close]','[data-panorama-motion]']);
   }
   await closeGlobe(page,escape);assert.equal(page.url(),url,'fullscreen is not a city or history change');
  }
  assert.equal(catalogueReads(),reads,'fullscreen does not reload the catalogue');assert.equal(await page.evaluate(()=>document.getElementById('nextSearchForm')===window.__panoramaOriginalForm),true);
  assert.deepEqual(await page.locator('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople').evaluateAll(nodes=>nodes.map(node=>node.value)),[arrival,departure,'1500','couple'],'fullscreen preserves the unsubmitted planner');
 });
 await check('Motion: fullscreen pause shares the original control; reduced motion keeps city choices usable',1440,async({page})=>{
  await start(page);await openGlobe(page);
  await page.locator('[data-panorama-motion]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().paused);
  assert.equal(await page.locator('#nextMotionToggle').getAttribute('aria-pressed'),'true','the dialog uses the existing pause control');await stableFrames(page);
  await closeGlobe(page,true);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().paused),true,'pause persists when returning to the page');
  await openGlobe(page);await page.locator('[data-panorama-motion]').click();await page.waitForFunction(()=>!BoomFlightGlobe.state().paused);
  assert.equal(await page.locator('#nextMotionToggle').getAttribute('aria-pressed'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>BoomFlightGlobe.state().reducedMotion);await stableFrames(page);
  await page.locator('.boom-flight-globe [data-globe-city="madrid"]').click();
  await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid'&&BoomFlightGlobe.state().city==='madrid');
  await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().flying),false,'reduced motion chooses the destination without a simulated flight');await oneGlobe(page);
 },'no-preference');
 await check('Studio: one preview retains the public London draft; invalid dates block switching and device changes never reload',1440,async({page})=>{
  const query=new URLSearchParams({city:'london',moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'couple',need:'application',privatePlace:'synthetic-office',lat:'41.9123',lng:'12.5123'});
  await page.goto(origin+'/flight-studio?'+query,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('iframe').count(),1,'the comparison owns exactly one iframe');
  const handle=await page.locator('#studioFrame').elementHandle(),frame=await handle.contentFrame();
  await frame.waitForFunction(()=>document.body.dataset.experience==='panorama'&&document.body.dataset.europeCity==='london'&&!!window.BoomFlightEurope);
  assert.equal(await page.locator('button[data-studio-experience="panorama"]').getAttribute('aria-pressed'),'true','Panorama is the default preview');
  for(const [key,value] of Object.entries({moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'couple',need:'application',city:'london'}))assert.equal(new URL(frame.url()).searchParams.get(key),value,'initial studio route preserves '+key);
  if(!await frame.locator('#europeOptionalBrief').evaluate(node=>node.open))await frame.locator('#europeOptionalBrief summary').click();
  await frame.locator('#europeBudget').selectOption('5000');await frame.locator('#europePeople').selectOption('family');
  await page.locator('button[data-studio-experience="club"]').click();
  await frame.waitForFunction(()=>document.body.dataset.experience!=='panorama'&&document.body.dataset.europeCity==='london'&&!!window.BoomFlightEurope);
  assert.equal(await page.locator('iframe').count(),1);assert.equal(await page.locator('button[data-studio-experience="club"]').getAttribute('aria-pressed'),'true');
  const club=new URL(frame.url());assert.equal(club.searchParams.has('experience'),false,'original Club has no immersive presentation flag');
  for(const [key,value] of Object.entries({moveIn:arrival,moveOut:departure,budget:'5000',currency:'GBP',people:'family',need:'application',city:'london'}))assert.equal(club.searchParams.get(key),value,'switching editions reads the current public '+key);
  for(const key of ['privatePlace','lat','lng'])assert.equal(club.searchParams.has(key),false,'the preview URL excludes private '+key);
  const full=new URL(await page.locator('#studioOpen').getAttribute('href'),origin);
  for(const key of ['city','moveIn','moveOut','budget','currency','people','need'])assert.equal(full.searchParams.get(key),club.searchParams.get(key),'open separately has the current '+key);
  for(const key of ['privatePlace','lat','lng','experience'])assert.equal(full.searchParams.has(key),false,'the Club full preview excludes '+key);
  await frame.evaluate(()=>{window.__panoramaStudioIdentity='existing document';});
  for(const device of ['mobile','desktop']){
   await page.locator('button[data-studio-device="'+device+'"]').click();
   await frame.waitForFunction(width=>innerWidth===width,device==='mobile'?390:1280);
   assert.equal(await page.locator('button[data-studio-device="'+device+'"]').getAttribute('aria-pressed'),'true','the actual preview viewport follows the selected device');
   assert.equal(await frame.evaluate(()=>window.__panoramaStudioIdentity),'existing document','changing device size does not reload the preview');
   assert.equal(frame.url(),club.href);assert.equal(await page.locator('iframe').count(),1);
  }
  if(!await frame.locator('#europeOptionalBrief').evaluate(node=>node.open))await frame.locator('#europeOptionalBrief summary').click();
  await frame.locator('#europeMoveOut').fill(year+'-01-01');
  await page.locator('button[data-studio-experience="panorama"]').click();await page.locator('#studioError[role="alert"]').waitFor({state:'visible'});
  assert.ok((await page.locator('#studioError').innerText()).trim(),'invalid dates explain why switching stopped');
  assert.equal(await frame.evaluate(()=>window.__panoramaStudioIdentity),'existing document','an invalid draft is not discarded by reloading');
  assert.equal(await page.locator('button[data-studio-experience="club"]').getAttribute('aria-pressed'),'true');assert.equal(await frame.locator('#europeMoveOut').inputValue(),year+'-01-01');
  await frame.locator('#europeMoveOut').fill(departure);await page.locator('button[data-studio-experience="panorama"]').click();
  await frame.waitForFunction(()=>document.body.dataset.experience==='panorama'&&document.body.dataset.europeCity==='london'&&!!window.BoomFlightEurope);
  const panorama=new URL(frame.url());assert.equal(panorama.searchParams.get('experience'),'panorama');
  for(const key of ['city','moveIn','moveOut','budget','currency','people','need'])assert.equal(panorama.searchParams.get(key),club.searchParams.get(key),'returning to Panorama preserves '+key);
  assert.equal(await page.locator('iframe').count(),1);await page.locator('#studioError').waitFor({state:'hidden'});
  await page.setViewportSize({width:390,height:900});await geometry(page,['button[data-studio-experience="club"]','button[data-studio-experience="panorama"]']);
  await frame.locator('#europeServicePass .europe-service-price').waitFor();await frame.locator('#europeDeskContinue').click();
  await frame.waitForURL(url=>url.pathname==='/london');
  const originalDesk=new URL(frame.url());assert.equal(originalDesk.searchParams.get('budget'),'5000');assert.equal(originalDesk.searchParams.get('currency'),'GBP');
  const returnLink=new URL(await page.locator('#studioOpen').getAttribute('href'),origin);
  assert.equal(returnLink.pathname,'/flight-next','the full-view door still opens a preview after the original desk handoff');
  for(const key of ['city','moveIn','moveOut','budget','currency','people','need'])assert.equal(returnLink.searchParams.get(key),club.searchParams.get(key),'the post-handoff preview link retains '+key);
  await page.locator('button[data-studio-experience="club"]').click();
  await frame.waitForFunction(()=>location.pathname==='/flight-next'&&document.body.dataset.europeCity==='london'&&!!window.BoomFlightEurope);
  const returned=new URL(frame.url());assert.equal(returned.searchParams.has('experience'),false);
  for(const key of ['city','moveIn','moveOut','budget','currency','people','need'])assert.equal(returned.searchParams.get(key),club.searchParams.get(key),'switching after the original desk handoff restores '+key);
  assert.equal(await page.locator('iframe').count(),1);await page.locator('#studioError').waitFor({state:'hidden'});
  await frame.locator('.europe-city-switch [data-europe-city="rome"]').click();await frame.waitForFunction(()=>document.body.dataset.europeCity==='rome');
  await fillRome(frame);
  const freshArrival=year+'-02-01',freshDeparture=year+'-08-01';
  await frame.locator('#nextMoveIn').fill(freshArrival);await frame.locator('#nextMoveOut').fill(freshDeparture);
  const freshOpen=new URL(await page.locator('#studioOpen').evaluate(link=>{link.addEventListener('click',event=>event.preventDefault(),{once:true});link.click();return link.href;}),origin);
  for(const [key,value] of Object.entries({moveIn:freshArrival,moveOut:freshDeparture,budget:'1500',people:'couple',place:'luiss'}))assert.equal(freshOpen.searchParams.get(key),value,'Open captures the unsubmitted Rome '+key);
  await page.locator('button[data-studio-experience="panorama"]').click();await frame.waitForFunction(()=>document.body.dataset.experience==='panorama'&&document.body.dataset.europeCity==='rome');
  const freshPreview=new URL(frame.url());
  for(const [key,value] of Object.entries({moveIn:freshArrival,moveOut:freshDeparture,budget:'1500',people:'couple',place:'luiss'}))assert.equal(freshPreview.searchParams.get(key),value,'changing experience captures the unsubmitted Rome '+key);
  assert.equal(await page.locator('iframe').count(),1);
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(focus&&!passed&&!failed){failed++;console.log('  ✗ No scenario matched the requested focus');}
console.log('\n  '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
