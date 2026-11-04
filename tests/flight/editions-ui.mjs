// Two visual editions exercise the real shared controllers and engines. Only
// catalogue, WebGL rendering and the final external-form boundary are fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flighteditionsui  Two complete editions, the same real move and a safe comparison');
const focus=process.argv[2]||'';
if(focus)console.log('  Focus: '+focus+' (default invocation runs every scenario)');
if(!chromium){console.log('  SKIP: playwright unavailable — edition browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const editions=['club','perspective'];
const homes=[
 {id:'edition-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2},
 {id:'edition-room',name:'Fixture Room',price:700,sqm:18,bedrooms:1,type:'Room'},
 {id:'edition-terrace',name:'Fixture Terrace',price:1800,sqm:95,bedrooms:2,type:'Apartment'}
].map((home,i)=>({...home,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9+i*.01,lng:12.49,
 images:['/edition-photo.svg','/edition-photo-2.svg'],features:['Balcony'],description:'A synthetic test home, never a real customer or property.'}));
const mapHTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#101319;color:white"><p>Skyline rendering boundary</p><small>© OpenStreetMap contributors</small><script>window.stopCalls=0;window.destinations=[];window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(place){destinations.push(place);return true;},map:{resize(){},stop(){stopCalls++;}}};addEventListener("message",e=>{if(e.source===parent&&e.origin===location.origin&&e.data.t==="boomSelect")parent.postMessage({t:"boomSelected",id:e.data.id},location.origin);});parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){res.writeHead(405);return res.end('No writes permitted');}
 if(/^\/edition-photo(?:-2)?\.svg$/.test(pathname)){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#57594c"/><rect x="80" y="100" width="470" height="500" fill="#c7bea4"/></svg>');}
 if(pathname.startsWith('/cities/')){res.writeHead(404);return res.end();}
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function open(width=1280,motion='reduce'){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion});
 const errors=[],writes=[],missing=[],privateReads=[],expectedAssetFailures=new Set();
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&r.status()>=400&&!expectedAssetFailures.has(new URL(r.url()).pathname))missing.push(new URL(r.url()).pathname);});
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value;}}});});
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname.startsWith('/cities/'))privateReads.push(url.pathname);
  if(url.pathname.startsWith('/listing/')||/^\/(madrid|london|amsterdam|barcelona|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Original form navigation boundary</title><body><h1>Public brief received</h1><p>No application or payment is sent by this fixture.</p></body></html>'});
  return route.continue();
 });
 return {page,errors,writes,missing,privateReads,expectedAssetFailures};
}
async function check(name,width,fn,motion='reduce'){
 if(focus&&!name.includes(focus))return;
 const t=await open(width,motion);
 try{await fn(t);assert.deepEqual(t.errors,[],'no unhandled browser errors');assert.deepEqual(t.writes,[],'no application or payment requests');assert.deepEqual(t.missing,[],'all real assets loaded');assert.deepEqual(t.privateReads,[],'no private city sources fetched');passed++;console.log('  ✓ '+name);}
 catch(e){failed++;console.log('  ✗ '+name+' — '+e.message);}
 finally{await t.page.close();}
}
async function start(page,edition,query=''){
 await page.goto(origin+'/flight-next?direction=club&edition='+edition+query,{waitUntil:'domcontentloaded'});
 await page.locator('#nextHomeRail .next-card').first().waitFor();
 await page.waitForFunction(()=>!!window.BoomFlightEurope&&!!window.BoomFlightClub);
 assert.equal(new URL(page.url()).searchParams.get('edition'),edition);
}
function intent(url,edition,type=false){
 for(const [key,value] of Object.entries({moveIn:arrival,moveOut:departure,stay:'6',budget:'1500',people:'couple',place:'luiss',...(type?{type:'__entire'}:{})}))assert.equal(url.searchParams.get(key),value,key+' stays in the real journey');
 if(edition)assert.equal(url.searchParams.get('edition'),edition,'internal navigation keeps the selected edition');
}
async function campus(page){await page.locator('#nextDestinationSummary').click();await page.locator('[data-destination="luiss"]').click();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});}
async function search(page){
 await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);
 await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
 await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
}
async function geometry(page,selectors=[]){
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,'no page overflow: '+JSON.stringify(size));
 for(const selector of selectors){const sizes=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}));assert.ok(sizes.length,selector+' visible');assert.ok(sizes.every(r=>r.width>=44&&r.height>=44),selector+' has usable targets: '+JSON.stringify(sizes));}
}
async function oneMap(page){assert.equal(await page.locator('iframe.boom-next-map-frame').count(),1,'one real map adapter iframe per preview');}
async function white(page,inputs=false){
 const appearance=await page.evaluate(withInputs=>{
  function rgb(value){return (value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);}
  function luminance(c){return c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  const body=getComputedStyle(document.body),background=rgb(body.backgroundColor);
  const fields=withInputs?Array.from(document.querySelectorAll('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople')).map(input=>{
   let node=input,bg=body.backgroundColor;
   while(node){const value=getComputedStyle(node).backgroundColor;if(value!=='transparent'&&!/^rgba\([^)]*,\s*0\)$/.test(value)){bg=value;break;}node=node.parentElement;}
   const style=getComputedStyle(input);return {id:input.id,contrast:contrast(rgb(style.color),rgb(bg)),size:parseFloat(style.fontSize),scheme:style.colorScheme};
  }):[];
  return {background,contrast:contrast(rgb(body.color),background),fields,theme:window.BoomFlightNextMotion.state().theme};
 },inputs);
 assert.ok(appearance.background.length===3&&appearance.background.every(v=>v>=240)&&Math.max(...appearance.background)-Math.min(...appearance.background)<=10,'Club has a neutral white page, not a dark shell');
 assert.ok(appearance.contrast>=4.5,'main text remains legible on white');assert.equal(appearance.theme,'light');
 for(const field of appearance.fields){assert.ok(field.contrast>=4.5,field.id+' text contrast '+field.contrast);assert.ok(field.size>=16,field.id+' stays readable without mobile zoom');assert.ok(field.scheme.includes('light')&&!field.scheme.includes('dark'),field.id+' native control uses the light theme');}
}
async function readable(page,selectors){
 // Check the rendered foreground against the composed ancestor backgrounds,
 // including translucent controls and placeholder text, not just the body theme.
 for(const entry of selectors){
  const selector=typeof entry==='string'?entry:entry.selector,pseudo=typeof entry==='string'?null:entry.pseudo;
  const samples=await page.locator(selector).evaluateAll((nodes,pseudo)=>{
   const rgba=value=>{const parts=(value.match(/[\d.]+/g)||[]).map(Number);return parts.length>=3?[...parts.slice(0,3),parts[3]??1]:[0,0,0,0];};
   const over=(front,back)=>{const alpha=front[3]+back[3]*(1-front[3]);return [...front.slice(0,3).map((v,i)=>alpha?(v*front[3]+back[i]*back[3]*(1-front[3]))/alpha:0),alpha];};
   const light=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   return nodes.filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{
    const chain=[];for(let p=n;p;p=p.parentElement)chain.push(p);
    const paint=ink=>{for(const p of chain){const s=getComputedStyle(p);ink=over(ink,rgba(s.backgroundColor));ink[3]*=Number(s.opacity);}return over(ink,[255,255,255,1]).slice(0,3);};
    const style=getComputedStyle(n,pseudo),fg=rgba(style.color);if(pseudo)fg[3]*=Number(style.opacity);
    const a=light(paint(fg)),b=light(paint([0,0,0,0])),size=parseFloat(style.fontSize),large=size>=24||(size>=18.66&&Number(style.fontWeight)>=700);
    return {text:(n.textContent||n.getAttribute('placeholder')||n.getAttribute('aria-label')||'').trim().slice(0,65),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),minimum:large?3:4.5};
   });
  },pseudo);
  assert.ok(samples.length,selector+' has rendered text to check');
  for(const sample of samples)assert.ok(sample.ratio>=sample.minimum,selector+' contrast '+sample.ratio.toFixed(2)+' < '+sample.minimum+' for '+sample.text);
 }
}
async function readyMap(page){await page.locator('#nextApartmentsMap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>BoomNextMap.state().status==='ready');await oneMap(page);}
async function city(page,value){await page.locator('.europe-city-switch [data-europe-city="'+value+'"]').click();await page.waitForFunction(value=>document.body.dataset.europeCity===value,value);}
async function fields(page){if(!await page.locator('#europeOptionalBrief').evaluate(n=>n.open))await page.locator('#europeOptionalBrief summary').click();}
async function duoFrame(page,edition){const handle=await page.locator('#'+(edition==='club'?'duoClub':'duoPerspective')).elementHandle();return handle.contentFrame();}
async function openDuo(page){
 await page.goto(origin+'/flight-duo',{waitUntil:'domcontentloaded'});
 for(const edition of editions){const frame=await duoFrame(page,edition);await frame.locator('#nextHomeRail .next-card').first().waitFor();assert.equal(new URL(frame.url()).searchParams.get('edition'),edition);assert.equal(new URL(frame.url()).searchParams.get('duo'),'1');}
}
try{
 browser=await chromium.launch(await launchOptions());
 for(const edition of editions){
  for(const width of [320,390,1280])await check(edition+' '+width+': valid dates, filters, saves, history and the original Apply remain one journey',width,async({page})=>{
   await start(page,edition);await geometry(page,['#nextSearchForm button[type="submit"]']);
   if(edition==='club')await white(page,true);
   if(edition==='club'&&width===390){
    await readable(page,['.next-ticket .ticket-top span','.next-ticket .ticket-stub>span','.next-ticket .ticket-stub small','.next-ticket .ticket-stub>strong','.next-ticket .ticket-terms','.service-foot a']);
    const tickets=await page.locator('.next-ticket').evaluateAll(cards=>cards.map(card=>{const outer=card.getBoundingClientRect();return Array.from(card.querySelectorAll('.ticket-stub>span,.ticket-stub>strong')).map(node=>{const box=node.getBoundingClientRect();return {left:box.left-outer.left,right:outer.right-box.right};});}).flat());
    assert.equal(tickets.length,4);assert.ok(tickets.every(box=>box.left>=16&&box.right>=16),'service price and action stay comfortably inside their ticket: '+JSON.stringify(tickets));
    await page.evaluate(()=>scrollTo(0,0));const before=await page.evaluate(()=>scrollY);
    await geometry(page,['.edition-plan-link']);await page.locator('.edition-plan-link').click();
    await page.waitForFunction(()=>{const form=document.getElementById('nextSearch').getBoundingClientRect(),nav=document.querySelector('.next-nav').getBoundingClientRect();return form.top>=nav.bottom-1&&form.top<innerHeight/2;});
    assert.ok(await page.evaluate(()=>scrollY)>before,'Plan your move brings the form into view');
    assert.equal(new URL(page.url()).hash,'#nextSearch');assert.equal(new URL(page.url()).searchParams.get('edition'),'club');await geometry(page);
   }
   if(edition==='perspective'){
    await city(page,'amsterdam');await geometry(page);
    const lettering=await page.locator('.perspective-arrival').evaluate(host=>{const h=host.getBoundingClientRect();return Array.from(host.querySelectorAll('.fc2')).map(cell=>{const r=cell.getBoundingClientRect();return {left:r.left-h.left,right:r.right-h.right};});});
    assert.ok(lettering.length>=9,'Amsterdam is present in the real Solari board');assert.ok(lettering.every(r=>r.left>=-1&&r.right<=1),'the complete city name stays readable inside its arrival panel');await city(page,'rome');
   }
   await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(year+'-02-28');
   await page.locator('#nextSearchForm button[type="submit"]').click();
   assert.equal(await page.locator('body').getAttribute('data-view'),'home','invalid short stay cannot navigate');
   assert.ok(await page.evaluate(()=>document.getElementById('nextMoveOut').validationMessage||(!document.getElementById('nextSearchError').hidden&&document.getElementById('nextSearchError').textContent)),'the invalid stay is explained at the form or its date field');
   if(edition==='club'&&width===390){
    await page.locator('.next-nav [data-europe-open]').click();
    await readable(page,['#europeCityDialog .next-dialog-top span','#europeCityDialog h2','#europeCityDialog>p','#europeCityDialog .europe-cities button span']);
    await geometry(page,['#europeCityDialog .europe-cities button']);await page.locator('#europeCityDialog [data-europe-close]').click();
    await page.locator('#nextDestinationSummary').click();
    await readable(page,['#nextDestinationDialog .next-dialog-top span','#nextDestinationTitle','.destination-dialog-head>p','.destination-mode button','#nextDestinationQuery',{selector:'#nextDestinationQuery',pseudo:'::placeholder'},'.destination-option strong','.destination-option span','#nextDestinationPrivacy']);
    await page.locator('#nextDestinationQuery').fill('no-such-campus-fixture');await readable(page,['#nextDestinationOptions .destination-empty']);
    await page.locator('#nextDestinationQuery').fill('LUISS');await readable(page,['.destination-option strong','.destination-option span']);
    await page.locator('[data-destination="luiss"]').click();await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
    await page.locator('#nextHomeMap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>BoomNextMap.state().status==='ready');await page.evaluate(()=>BoomNextMap.select('edition-courtyard'));
    await page.locator('.city-caption .city-selected').waitFor();await readable(page,['.city-caption .city-selected>span','.city-caption .city-selected small']);
   }else await campus(page);
   await search(page);intent(new URL(page.url()),edition);
   await page.locator('#nextFilterType').selectOption('__entire');await readyMap(page);
   assert.deepEqual(await page.locator('#nextResults .next-card').evaluateAll(ns=>ns.map(n=>n.dataset.homeId)),['edition-courtyard'],'canonical type and budget actually filter homes');
   intent(new URL(page.url()),edition,true);await geometry(page,['#nextEditStay']);
   if(edition==='club')await white(page);
   if(edition==='club'&&width===390)await readable(page,['#nextBalance .balance-route']);
   if(edition==='perspective'){
    const row=await page.locator('#nextResults .next-card').first().evaluate(card=>{const image=card.querySelector('.next-card-image').getBoundingClientRect(),info=card.querySelector('.next-card-info').getBoundingClientRect(),photo=card.querySelector('img').getBoundingClientRect();return {image:{right:image.right,bottom:image.bottom,width:image.width},info:{left:info.left,top:info.top,width:info.width},photo:{right:photo.right,width:photo.width}};});
    assert.ok(row.image.width>0&&row.info.width>0,'photo and home information both occupy space');
    assert.ok(width>=1024?row.image.right<=row.info.left+1:row.image.bottom<=row.info.top+1,'the property photograph never overlaps its information: '+JSON.stringify(row));
    assert.ok(row.photo.right<=row.image.right+1,'the intrinsic photo width stays inside its panel');
   }
   const link=page.locator('#nextResults [data-home="edition-courtyard"]').first();intent(new URL(await link.getAttribute('href'),origin),edition,true);
   await link.click();await page.locator('#nextDetailTitle').waitFor();await oneMap(page);await geometry(page,['[data-next-apply]']);
   if(edition==='club')await white(page);
   if(edition==='club'&&width===390){
    await page.locator('.detail-everyday .everyday-note summary').click();
    await readable(page,['.detail-everyday .everyday-heading button','.detail-everyday .everyday-route>span','.detail-everyday .everyday-route strong','.detail-everyday .everyday-metrics>span','.detail-everyday .everyday-metrics a','.detail-everyday .everyday-note summary','.detail-everyday .everyday-note[open] p']);
   }
   await page.locator('.detail-actions [data-save-home]').click();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('boomSalvate'))),['/listing/edition-courtyard']);
   const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);assert.equal(apply.pathname,'/listing/edition-courtyard');assert.equal(apply.hash,'#applica');intent(apply,null,true);
   await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/edition-courtyard');intent(new URL(page.url()),null,true);
   await page.goBack();await page.locator('#nextDetailTitle').waitFor();intent(new URL(page.url()),edition,true);
   assert.equal(await page.locator('.detail-actions [data-save-home]').getAttribute('aria-pressed'),'true','canonical saves survive leaving the proposal');
   await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await readyMap(page);intent(new URL(page.url()),edition,true);
   await page.locator('#nextFilterBudget').selectOption('1000');assert.equal(await page.locator('#nextResults .empty-state').count(),1,'empty state is a real filter result');
   await page.locator('#nextResults [data-reset]').click();assert.equal(await page.locator('#nextResults .next-card').count(),3,'reset restores actual homes');
   assert.equal(new URL(page.url()).searchParams.get('edition'),edition);assert.equal(new URL(page.url()).searchParams.get('place'),'luiss');assert.equal(new URL(page.url()).searchParams.get('moveOut'),departure);await geometry(page);
  });
  await check(edition+': public city brief survives edition navigation; GBP requires a new budget',390,async({page})=>{
   await start(page,edition,'&place=luiss&homes=edition-courtyard&privatePlace=office&address=Private%20Street');await city(page,'madrid');await fields(page);
   await page.locator('#europeMoveIn').fill(arrival);await page.locator('#europeMoveOut').fill(departure);await page.locator('#europeBudget').selectOption('2000');await page.locator('#europePeople').selectOption('couple');
   await page.locator('[data-europe-need="application"]').click();await page.waitForFunction(()=>document.getElementById('europeServicePass').textContent.includes('€199'));
   assert.equal(new URL(page.url()).searchParams.get('edition'),edition);await city(page,'london');assert.equal(await page.locator('#europeBudget').inputValue(),'','EUR is never silently treated as GBP');
   assert.equal(await page.locator('#europeMoveOut').inputValue(),departure);await page.locator('#europeBudget').selectOption('3000');await geometry(page,['#europeDeskContinue']);
   await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
   const url=new URL(page.url());for(const [key,value] of Object.entries({from:'flight',city:'london',currency:'GBP',budget:'3000',people:'couple',need:'application',moveIn:arrival,moveOut:departure}))assert.equal(url.searchParams.get(key),value,key+' preserved for the real city desk');
   for(const key of ['place','privatePlace','address','homes','type'])assert.equal(url.searchParams.has(key),false,key+' excluded from foreign brief');
  });
  await check(edition+': reduced motion and explicit pause keep useful controls and stop the offscreen map',1280,async({page})=>{
   await start(page,edition);await page.locator('#nextHero').scrollIntoViewIfNeeded();
   await page.evaluate(()=>dispatchEvent(new MessageEvent('message',{origin:location.origin,source:parent,data:{type:'boom-duo-navigate',view:'apartments',home:'edition-courtyard'}})));
   assert.equal(await page.locator('body').getAttribute('data-view'),'home','standalone previews do not accept comparison commands');
   await page.waitForFunction(()=>document.getElementById('nextHero').dataset.nextMotion==='reduced');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#nextMotionToggle').click();
   assert.equal(await page.locator('#nextMotionToggle').getAttribute('aria-pressed'),'true');await page.waitForFunction(()=>document.getElementById('nextHero').dataset.nextMotion==='paused');
   await campus(page);await search(page);await readyMap(page);
   const handle=await page.locator('iframe.boom-next-map-frame').elementHandle(),frame=await handle.contentFrame();await frame.evaluate(()=>{window.stopCalls=0;});
   await page.locator('#nextResults [data-home="edition-courtyard"]').first().click();await page.locator('#nextDetailTitle').waitFor();assert.ok(await frame.evaluate(()=>window.stopCalls)>0,'leaving the map stops its camera');await oneMap(page);
  });
  await check(edition+': costs show the canonical fee and keep an undeclared deposit unknown',1280,async({page})=>{
   await start(page,edition);
   if(edition==='perspective'){
    await page.locator('#nextHomeRail [data-perspective-locate="edition-courtyard"]').click();
    await page.waitForFunction(()=>document.querySelector('.city-caption [data-home]')?.dataset.home==='edition-courtyard');await oneMap(page);
   }
   await page.locator('#nextHomeRail [data-home="edition-courtyard"]').first().click();
   const declared=await page.locator('.edition-costs').innerText();assert.match(declared,/1[,.\s]?757/,'€1200 rent has the existing IVA-inclusive fee');assert.match(declared,/2[,.\s]?400|2\s+months?/i,'two declared deposit months are visible');
   assert.doesNotMatch(declared,/due (now|today)|pay (now|today)/i,'an estimate is not an immediate payment demand');
   await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('#nextResults [data-home="edition-room"]').first().click();
   const unknown=await page.locator('.edition-costs').innerText();assert.match(unknown,/1[,.\s]?025/,'€700 rent uses the same fee engine');assert.match(unknown,/confirm|not (yet )?declared|unknown/i,'missing deposit remains explicitly unknown');
   assert.doesNotMatch(unknown,/2[,.\s]?425/,'no total silently assumes a one-month deposit');
   if(edition==='perspective'){
    await page.route('**/edition-photo.svg',route=>route.fulfill({status:404,body:''}));await start(page,edition);
    await page.waitForFunction(()=>/unavailable/i.test(document.querySelector('.perspective-photo-wait').textContent));
    assert.equal(await page.locator('.perspective-photo-wait').isVisible(),true,'a failed hero photo is stated, not silently replaced');
    const name=page.locator('.perspective-feature-name');assert.equal(await name.getAttribute('data-home'),'edition-courtyard');assert.equal(new URL(await name.getAttribute('href'),origin).searchParams.get('home'),'edition-courtyard');
    await name.click();await page.locator('#nextDetailTitle').waitFor();assert.equal(new URL(page.url()).searchParams.get('home'),'edition-courtyard','the same real home remains reachable without its photograph');
   }
  });
 }
 for(const width of [390,1280])await check('club white '+width+': globe buttons change the same city and preserve dates across EUR and GBP',width,async({page})=>{
  await start(page,'club');await white(page,true);await page.waitForFunction(()=>window.BoomFlightGlobe?.state().ready);
  assert.equal(await page.locator('.boom-flight-globe-canvas').count(),1);assert.equal(await page.locator('#boomGlobeMount button[data-globe-city]').count(),6);
  await campus(page);await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
  for(const slug of ['madrid','amsterdam','london']){
   const button=page.locator('#boomGlobeMount button[data-globe-city="'+slug+'"]');await button.focus();await button.press('Enter');
   await page.waitForFunction(slug=>document.body.dataset.europeCity===slug&&BoomFlightGlobe.state().city===slug&&BoomFlightNextMotion.state().cityPattern===slug,slug);
   assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.europe-city-switch [data-europe-city="'+slug+'"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#nextDestinationBoard').getAttribute('aria-label'),slug.toUpperCase());
   assert.equal(await page.locator('#europeMoveIn').inputValue(),arrival);assert.equal(await page.locator('#europeMoveOut').inputValue(),departure);assert.equal(await page.locator('#europePeople').inputValue(),'couple');
   assert.equal(await page.locator('#europeBudget').inputValue(),slug==='london'?'':'1500');
   for(const key of ['place','privatePlace','homes'])assert.equal(new URL(page.url()).searchParams.has(key),false,'foreign globe selection does not carry '+key);
   await geometry(page,['#boomGlobeMount button[data-globe-city]']);await white(page);await oneMap(page);
  }
  await fields(page);await page.locator('#europeBudget').selectOption('3000');
  const desk=new URL(await page.locator('[data-europe-desk-link]').first().getAttribute('href'),origin);assert.equal(desk.pathname,'/london');assert.equal(desk.searchParams.get('currency'),'GBP');assert.equal(desk.searchParams.get('budget'),'3000');assert.equal(desk.searchParams.get('moveOut'),departure);
  await page.goBack();await page.waitForFunction(()=>document.body.dataset.europeCity==='amsterdam'&&BoomFlightGlobe.state().city==='amsterdam');assert.equal(await page.locator('#europeBudget').inputValue(),'1500');
 });
 await check('club white: globe motion settles, pauses outside view and respects reduced motion',1280,async({page})=>{
  await start(page,'club');await page.locator('#boomGlobeMount').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.BoomFlightGlobe?.state().ready&&BoomFlightGlobe.state().visible);
  await page.locator('#boomGlobeMount [data-globe-city="madrid"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().city==='madrid'&&!BoomFlightGlobe.state().rafPending);
  let frames=await page.evaluate(()=>BoomFlightGlobe.state().frames);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),frames,'the globe does not spin forever');
  await page.locator('#nextMotionToggle').click();await page.waitForFunction(()=>BoomFlightGlobe.state().paused&&!BoomFlightGlobe.state().rafPending);
  frames=await page.evaluate(()=>BoomFlightGlobe.state().frames);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),frames,'manual pause stops drawing');
  await page.locator('#nextMotionToggle').click();await page.locator('.next-footer').scrollIntoViewIfNeeded();await page.waitForFunction(()=>!BoomFlightGlobe.state().visible&&!BoomFlightGlobe.state().rafPending);
  frames=await page.evaluate(()=>BoomFlightGlobe.state().frames);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().frames),frames,'offscreen globe does not draw');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#boomGlobeMount').scrollIntoViewIfNeeded();await page.waitForFunction(()=>BoomFlightGlobe.state().reducedMotion&&!BoomFlightGlobe.state().rafPending);
  await page.locator('#boomGlobeMount [data-globe-city="amsterdam"]').click();await page.waitForFunction(()=>BoomFlightGlobe.state().city==='amsterdam'&&document.body.dataset.europeCity==='amsterdam');
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().rafPending),false,'reduced motion still changes destination without an animated flight');await oneMap(page);
 },'no-preference');
 await check('club white: failed globe geography keeps every semantic city control usable',390,async({page,expectedAssetFailures})=>{
  const path='/assets/boom-globe-geography.json';expectedAssetFailures.add(path);await page.route('**'+path,r=>r.fulfill({status:503,body:'Unavailable'}));
  await start(page,'club');await page.waitForFunction(()=>window.BoomFlightGlobe?.state().error);
  assert.match(await page.locator('.boom-globe-status').innerText(),/unavailable/i);assert.equal(await page.locator('.boom-globe-status').isVisible(),true);
  await page.locator('#boomGlobeMount [data-globe-city="madrid"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid');assert.equal(await page.locator('#boomGlobeMount [data-globe-city="madrid"]').getAttribute('aria-pressed'),'true');
  await geometry(page,['#boomGlobeMount button[data-globe-city]']);await white(page);
 });
 await check('Duo links only the current page, keeps briefs independent, and rejects forged navigation',1280,async({page})=>{
  await openDuo(page);assert.equal(await page.locator('#duoSync').isChecked(),true);
  const club=await duoFrame(page,'club'),perspective=await duoFrame(page,'perspective');
  await campus(club);await search(club);await perspective.locator('#nextApartments').waitFor({state:'visible'});
  await club.locator('#nextFilterType').selectOption('__entire');intent(new URL(club.url()),'club',true);
  for(const key of ['moveIn','moveOut','budget','people','place','type'])assert.equal(new URL(perspective.url()).searchParams.has(key),false,'linked pages do not copy '+key+' into the other brief');
  const full=await page.locator('#duoOpenClub').evaluate(a=>{a.addEventListener('click',e=>e.preventDefault(),{once:true});a.click();return a.href;});
  intent(new URL(full),'club',true);assert.equal(new URL(full).searchParams.has('duo'),false,'full preview keeps the current brief without the embedding flag');
  await club.locator('#nextResults [data-save-home="edition-courtyard"]').click();
  await perspective.waitForFunction(()=>document.querySelector('#nextResults [data-save-home="edition-courtyard"]').getAttribute('aria-pressed')==='true');
  assert.deepEqual(await perspective.evaluate(()=>JSON.parse(localStorage.getItem('boomSalvate'))),['/listing/edition-courtyard'],'editions share the original saved-home store, not the personal draft');
  await page.locator('#duoSync').uncheck();await club.locator('#nextResults [data-home="edition-courtyard"]').first().click();await club.locator('#nextDetailTitle').waitFor();
  assert.equal(await perspective.locator('body').getAttribute('data-view'),'apartments','sync-off leaves the other preview alone');
  await perspective.locator('#nextResults [data-home="edition-room"]').first().click();await perspective.locator('#nextDetailTitle').waitFor();
  assert.equal(new URL(club.url()).searchParams.get('home'),'edition-courtyard');assert.equal(new URL(perspective.url()).searchParams.get('home'),'edition-room','each preview keeps its chosen home');
  const before=[club.url(),perspective.url()];
  await page.evaluate(()=>{
   dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'boom-design-state',edition:'club',view:'home',home:'edition-terrace'}}));
   dispatchEvent(new MessageEvent('message',{origin:'https://unrelated.example',source:document.getElementById('duoClub').contentWindow,data:{type:'boom-design-state',edition:'club',view:'home',home:'edition-terrace'}}));
  });
  for(const frame of [club,perspective])await frame.evaluate(()=>{
   dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'boom-duo-navigate',view:'home'}}));
   dispatchEvent(new MessageEvent('message',{origin:'https://unrelated.example',source:parent,data:{type:'boom-duo-navigate',view:'home'}}));
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual([club.url(),perspective.url()],before,'origin and source checks reject forged board/child messages');
  await page.locator('[data-duo-view="home"]').click();await club.locator('#nextHomeRail').waitFor({state:'visible'});await perspective.locator('#nextHomeRail').waitFor({state:'visible'});
  await page.locator('[data-duo-view="detail"]').click();await club.locator('#nextDetailTitle').waitFor();await perspective.locator('#nextDetailTitle').waitFor();
  assert.equal(new URL(club.url()).searchParams.get('home'),'edition-room');assert.equal(new URL(perspective.url()).searchParams.get('home'),'edition-room','explicit board controls compare the last chosen home, not the default featured home');intent(new URL(club.url()),'club',true);
  await oneMap(club);await oneMap(perspective);
 });
 for(const width of [320,390,1280])await check('Duo '+width+': desktop/mobile and focus controls preserve two navigable previews without overflow',width,async({page})=>{
  await openDuo(page);await geometry(page,['[data-duo-view="home"]','[data-duo-device="mobile"]']);
  assert.equal(await page.locator('iframe').count(),2,'the comparison owns exactly its two preview frames');
  await page.locator('[data-duo-device="mobile"]').click();await page.locator('[data-duo-focus="club"]').click();await geometry(page);
  await page.locator('[data-duo-focus="both"]').click();await page.locator('[data-duo-view="apartments"]').click();
  for(const edition of editions){const frame=await duoFrame(page,edition);await frame.locator('#nextApartments').waitFor({state:'visible'});await oneMap(frame);await geometry(frame,['#nextEditStay']);assert.equal(new URL(frame.url()).searchParams.get('edition'),edition);}
  await geometry(page);
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(focus&&!passed&&!failed){failed++;console.log('  ✗ No scenario matched the requested focus');}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
