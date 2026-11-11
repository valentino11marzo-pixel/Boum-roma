// The native catalogue, selected tickets, navigation and forms remain owners.
// Functional cases replace only network boundaries with labelled synthetic data.
// Optional public evidence uses the live read-only catalogue and local UI assets.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium(),focus=process.argv[2]||'';
const artifacts=process.env.BOOM_FLIGHT_ARTIFACT_DIR||'',publicEvidence=process.env.BOOM_PASSAGE_PUBLIC_EVIDENCE==='1';
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const manifest=JSON.parse(readFileSync(root+'assets/boom-desks-public.json','utf8'));
const foreignCities=Object.keys(manifest.cities).filter(slug=>manifest.cities[slug].live&&manifest.cities[slug].mode==='search');
const needs={search:'full-search',application:'application-pack',viewing:'attended-viewing'};
const titles={search:'Your criteria. A clearer search.',application:'You found the home. Let’s look closer.',viewing:'Be there, even from abroad.'};
const homes=[{id:'passage-journey-open',status:'available',availableDate:'Immediate'},{id:'passage-journey-closed',status:'rented',availableDate:''}].map(home=>({name:'Synthetic Passage home',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2,zone:'Prati',lat:41.9,lng:12.49,images:['/passage-journey-photo.svg'],description:'Synthetic browser fixture, never a real home or customer.',...home}));
const mapHTML='<!doctype html><html><body>Labelled map rendering boundary<script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},selectPublicPlace(){return true;},refreshPlaces(){},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
if(artifacts)mkdirSync(artifacts,{recursive:true});
console.log('\n▸ flightpassagejourney  Real service knowledge, optional contact and intact native decisions');
if(!chromium){console.log('  SKIP: playwright unavailable — Passage journey checks did not run');process.exit(0);}
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end('Writes forbidden');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
const base='direction=club&edition=club&experience=panorama&vision=dispatch&composition=passage';
let browser,passed=0,failed=0;

async function fixture(width=1440,{manifestError=false,manifestTransform=null,disableJourney=false}={}){
 const page=await browser.newPage({viewport:{width,height:width<500?844:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'});
 const report={errors:[],writes:[],missing:[],privateReads:[],catalogues:0};
 page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(origin+'/assets/')&&r.status()>=400&&!r.url().includes('boom-desks-public.json'))report.missing.push(new URL(r.url()).pathname);});
 await page.addInitScript(()=>{
  const ids=['nextSearchForm','europeDeskForm','nextSolariField','boomGlobeMount'];window.__journeyBirth=new Map();
  new MutationObserver(()=>ids.forEach(id=>{const node=document.getElementById(id);if(node&&!__journeyBirth.has(id))__journeyBirth.set(id,node);})).observe(document,{childList:true,subtree:true});
 });
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){report.writes.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){report.privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings'){report.catalogues++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});}
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname==='/passage-journey-photo.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#827964"/></svg>'});
  if(url.pathname==='/assets/boom-desks-public.json'&&manifestError)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic manifest outage"}'});
  if(url.pathname==='/assets/boom-desks-public.json'&&manifestTransform)return route.fulfill({contentType:'application/json',body:JSON.stringify(manifestTransform(structuredClone(manifest)))});
  if(url.pathname==='/assets/boom-passage-journey.js'&&disableJourney)return route.fulfill({contentType:'text/javascript',body:'/* Deliberately absent presentation module: native baseline. */'});
  if(url.pathname.startsWith('/listing/')||foreignCities.includes(url.pathname.slice(1)))return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Original service boundary</h1><p>No form submitted and no payment taken.</p>'});
  return route.continue();
 });
 return{page,report};
}
async function check(name,width,fn,options={}){
 if(focus&&!name.includes(focus))return;
 const context=await fixture(width,options);
 try{await fn(context);for(const key of ['errors','writes','missing','privateReads'])assert.deepEqual(context.report[key],[],key+' remain empty');passed++;console.log('  ✓ '+name);}
 catch(e){failed++;console.log('  ✗ '+name+' — '+e.stack);if(artifacts)await context.page.screenshot({path:artifacts+'/fixture-failure-'+failed+'.png',fullPage:true}).catch(()=>{});}
 finally{await context.page.close();}
}
async function start(page,query='city=rome',composition=base){
 await page.goto(origin+'/flight-next?'+composition+'&'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.BoomFlightEurope&&!!document.querySelector('#nextHomeRail .next-card'));
 if(composition.includes('composition=passage'))await page.waitForFunction(()=>document.body.dataset.airspaceReady==='true');
 await page.evaluate(()=>document.fonts.ready);
}
async function selectCity(page,slug){
 await page.locator('.europe-city-switch [data-europe-city="'+slug+'"]').click();
 await page.waitForFunction(value=>document.body.dataset.europeCity===value,slug);
}
async function selectedOffer(page,slug,need){
 const plan=manifest.cities[slug].pricing.plans.find(p=>p.id===needs[need]);
 await page.waitForFunction(value=>document.querySelector('#europeServicePass .europe-service-copy h3')?.textContent===value,plan.label);
 assert.equal(await page.locator('#passageSupportTitle').innerText(),titles[need]);
 assert.equal(await page.locator('#passageSteps li').count(),3,'three clear service-specific steps');
 assert.equal(await page.locator('#passageSteps').getAttribute('data-need'),need,'steps follow the native selected need');
 const expected=new Intl.NumberFormat('en-GB',{style:'currency',currency:manifest.cities[slug].currency,maximumFractionDigits:0}).format(plan.price);
 assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),expected,'native fee unchanged');
 assert.equal(await page.locator('#europeServicePass .europe-service-price small').innerText(),plan.condition,'native charge condition unchanged');
 const scope=await page.locator('#europeServicePass .dispatch-service-inclusions').textContent();
 for(const line of plan.includes)assert.ok(scope.includes(line),'real included scope remains available');
 const wa=await page.locator('#passageWhatsApp').getAttribute('href');
 assert.equal(wa,manifest.cities[slug].contact.whatsapp,'exact canonical generated WhatsApp destination');
 assert.deepEqual([...new URL(wa).searchParams.keys()],['text'],'no tracking, brief or second contact payload');
 assert.equal(await page.locator('#passageWhatsApp').getAttribute('target'),'_blank');
 assert.match(await page.locator('.passage-ticket-contact small').innerText(),/review the message before sending/i);
 assert.equal(await page.locator('#passageDeskCall').getAttribute('href'),'/'+slug+'#desk');
 assert.equal(await page.locator('#passageTermsLink').getAttribute('href'),'/'+slug);
 assert.match(await page.locator('#passagePaymentNote').textContent(),/No payment is taken on this page/);
 assert.equal(await page.locator('#europeDeskContinue').isVisible(),true,'native review remains primary and usable');
}
async function originalOwners(page){
 assert.equal(await page.evaluate(()=>[...__journeyBirth].every(([id,node])=>document.getElementById(id)===node)),true,'original form, Solari and globe nodes preserved');
 for(const id of ['nextSearchForm','europeDeskForm'])assert.equal(await page.locator('#'+id).count(),1,'one '+id);
 assert.equal(await page.locator('#passageSupport form,.passage-browse-bridge form,.passage-more form,.passage-ticket-contact input,.passage-ticket-contact button').count(),0,'no second form, input or submit path');
}
async function layout(page,width){
 const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('#passageSupport,#passageSupport *,.passage-browse-bridge,.passage-browse-bridge *,#passageMoreServices,#passageMoreServices *,#clubCompany .club-destination-board>*')].filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,id:n.id,class:n.className,r:n.getBoundingClientRect().toJSON()})).filter(x=>x.r.left<-.5||x.r.right>innerWidth+.5)}));
 assert.ok(result.scroll<=width+1,'no document overflow '+JSON.stringify(result));
 assert.deepEqual(result.overflow,[],'all new knowledge and contact content fits');
 const links=await page.locator('#passageSupport a,.passage-browse-bridge a,#passageMoreServices a,.passage-ticket-contact a,#clubCompany [data-passage-desk]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({text:n.textContent.trim(),w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
 for(const link of links)assert.ok(link.w>=44&&link.h>=44,'usable contact/knowledge target '+JSON.stringify(link));
}
async function nativeState(page){return page.evaluate(()=>({forms:[...document.forms].map(f=>({id:f.id,action:f.getAttribute('action'),method:f.method,fields:[...f.elements].filter(e=>/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.tagName)).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type}))})),localKeys:Object.keys(localStorage).sort(),sessionKeys:Object.keys(sessionStorage).sort()}));}

try{
 browser=await chromium.launch(launchOptions());
 await check('Rome browse: actual terms, explicit demo and original free-viewing path',390,async({page,report})=>{
  await start(page);await page.locator('#passageHomeBridge').waitFor({state:'visible'});
  assert.equal(await page.locator('#passageSupport').isVisible(),false);
  const fee=await page.locator('#services [data-rome-service="property-finding"] .ticket-stub strong').innerText(),condition=await page.locator('#services [data-rome-service="property-finding"] .ticket-terms').innerText();
  for(const id of ['passageHomeBridge','passageResultsBridge']){
   assert.equal(await page.locator('#'+id+' [data-passage-pfs-condition]').textContent(),'Property Finding '+fee.trim()+'. '+condition.trim(),'bridge copies canonical fee and complete condition');
   assert.equal(await page.locator('#'+id+' a[href="/client-portal?code=DEMO"]').count(),1);
   assert.match(await page.locator('#'+id+' .passage-bridge-links').textContent(),/Rome search workspace.*sample Rome homes.*no signup/s);
  }
  await page.locator('#nextHomeRail [data-home="passage-journey-open"]').first().click();await page.locator('#nextDetailTitle').waitFor();
  assert.equal(await page.locator('#nextDetailContent .detail-support a[href*="/virtual-viewing"]').count(),0,'BOOM-home visitor is not sent to a paid outside-home viewing service');
  const apply=await page.locator('[data-next-apply]').getAttribute('href'),viewing=await page.locator('#nextDetailContent .detail-support').getByRole('link',{name:'Ask about this BOOM home',exact:true}).getAttribute('href');
  assert.equal(new URL(viewing,origin).href,new URL(apply,origin).href,'viewing returns to the original listing, with its native context');
  assert.match(await page.locator('.passage-viewing-note').innerText(),/Viewings of BOOM homes are free.*confirmed with the agency/);
  await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  assert.equal(await page.locator('#passageResultsBridge').isVisible(),true,'optional help remains after successful browsing');
  assert.equal(await page.locator('#nextResults .next-card[data-home-id="passage-journey-open"]').count(),1,'native catalogue remains browseable without paying');
  await originalOwners(page);assert.equal(report.catalogues,1,'no duplicate catalogue fetch');await layout(page,390);
 });
 await check('Foreign selected needs: exact offer, country coverage and WhatsApp parity',1440,async({page})=>{
  await start(page,'city=barcelona&moveIn='+arrival+'&moveOut='+departure+'&budget=1500&people=couple&privatePlace=synthetic-private-office&lat=41.9123&lng=12.5123');
  for(const slug of ['barcelona','madrid','amsterdam','london','milan']){
   await selectCity(page,slug);
   for(const need of Object.keys(needs)){await page.locator('[data-europe-need="'+need+'"]').click();await selectedOffer(page,slug,need);}
   assert.equal(await page.locator('#passageHomeBridge').isVisible(),false,'Rome PFS is not presented as the foreign service');
   assert.equal(await page.locator('#passageMoreServices').isVisible(),false);
   const team=await page.locator('#passageCountryTeam').textContent();
   if(['barcelona','madrid'].includes(slug)){assert.match(team,/Rebecca & Fausto/);assert.match(team,/Spain and the Netherlands/);assert.doesNotMatch(team,/Daniele/);}
   if(slug==='amsterdam'){assert.match(team,/Rebecca, Fausto & Daniele/);assert.match(team,/Spain and the Netherlands; Daniele supports the Netherlands and England/);}
   if(slug==='london'){assert.match(team,/Daniele/);assert.match(team,/Netherlands and England/);assert.doesNotMatch(team,/Rebecca|Fausto/);}
   if(slug==='milan')assert.equal(await page.locator('#passageCountryTeam').isVisible(),false,'no unconfirmed Milan assignment');
   assert.match(await page.locator('.passage-people').innerText(),/Valentino Egidi.*Coordinating your move from Rome.*partner agencies and property owners/s);
   assert.doesNotMatch(await page.locator('.passage-people').innerText(),/local office|based in (Amsterdam|London|Madrid|Barcelona)|24.?7|guaranteed/i);
   await originalOwners(page);
  }
  const desks=await page.locator('#clubCompany .club-destination-board [data-europe-city],#clubCompany .club-destination-board [data-passage-desk]').evaluateAll(nodes=>nodes.map(n=>({slug:n.dataset.europeCity||n.dataset.passageDesk,href:n.getAttribute('href')})));
  assert.equal(foreignCities.length,8,'current public source has eight foreign rental desks');
  assert.deepEqual(desks.map(d=>d.slug).filter(s=>s!=='rome').sort(),foreignCities.slice().sort(),'all and only eight configured foreign desks, without duplicates');
  for(const desk of desks.filter(d=>d.href))assert.equal(desk.href,'/'+desk.slug,'additional desks retain their native page');
  await layout(page,1440);
  const browse=page.locator('.passage-questions details').first();await browse.locator('summary').click();await browse.getByRole('link',{name:/Explore Rome homes/}).click();
  await page.locator('#nextApartments').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.body.dataset.europeCity),'rome','foreign FAQ opens the actual Rome catalogue through its native controller');
  assert.equal(new URL(page.url()).searchParams.has('city'),false,'native Rome URL removes the previous foreign destination');assert.equal(await page.locator('#passageResultsBridge').isVisible(),true);await originalOwners(page);
 });
 await check('Original state: same forms, field owners and storage as native Passage baseline',390,async({page})=>{
  const baseline=await fixture(390,{disableJourney:true});
  try{
   await start(page,'city=london');await start(baseline.page,'city=london');
   for(const p of [page,baseline.page]){await p.locator('[data-europe-need="application"]').click();await p.locator('#europeOptionalBrief>summary').click();await p.locator('#europeMoveIn').fill(arrival);await p.locator('#europeMoveOut').fill(departure);await p.locator('#europeBudget').selectOption('1500');}
   assert.deepEqual(await nativeState(page),await nativeState(baseline.page),'journey copy adds no fields, forms or customer storage');
   await originalOwners(page);assert.deepEqual(baseline.report.writes,[]);
  }finally{await baseline.page.close();}
 });
 await check('Native review: invalid dates remain blocked and valid handoff stays exact',390,async({page})=>{
  await start(page,'city=london&need=application&moveIn='+arrival+'&moveOut='+departure+'&people=couple&privatePlace=synthetic-private-office&lat=41.9123&lng=12.5123');
  await selectedOffer(page,'london','application');await page.locator('#europeOptionalBrief>summary').click();await page.locator('#europeMoveOut').fill(year+'-01-01');
  await page.locator('#europeDeskContinue').click();await page.locator('#europeDeskError').waitFor({state:'visible'});assert.equal(new URL(page.url()).pathname,'/flight-next');await originalOwners(page);
  await page.locator('#europeMoveOut').fill(departure);await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
  const url=new URL(page.url());assert.equal(url.hash,'#fare-application-pack');for(const [key,value] of Object.entries({need:'application',moveIn:arrival,moveOut:departure,people:'couple'}))assert.equal(url.searchParams.get(key),value);
  for(const key of ['privatePlace','lat','lng','vision','composition','experience'])assert.equal(url.searchParams.has(key),false,'handoff excludes '+key);
 });
 await check('Manifest failure: useful original desk fallback with no invented price or contact',320,async({page})=>{
  await start(page,'city=milan');await page.locator('#europeServicePass').getByText('Speak with the Milan desk.',{exact:true}).waitFor();
  assert.equal(await page.locator('#passageWhatsApp').getAttribute('href'),'/milan#desk');assert.equal(await page.locator('#passageWhatsApp').getAttribute('target'),null);
  assert.match(await page.locator('.passage-ticket-contact small').innerText(),/Open the city page/);
  assert.equal(await page.locator('#europeServicePass .europe-service-price').count(),0);assert.equal(await page.locator('#passageSupport').isVisible(),false,'unavailable offers do not receive a service promise');
  await originalOwners(page);await layout(page,320);await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/milan');assert.equal(new URL(page.url()).hash,'');
 },{manifestError:true});
 for(const [name,contact] of [
  ['bare URL','https://wa.me/393313251961'],
  ['wrong city marker',manifest.cities.london.contact.whatsapp],
  ['extra plan parameter',manifest.cities.milan.contact.whatsapp+'&plan=full-search']
 ])await check('Malformed contact '+name+': native city fallback preserves the valid offer',390,async({page})=>{
  await start(page,'city=milan');await page.locator('#europeServicePass .europe-service-price').waitFor();
  assert.equal(await page.locator('#passageWhatsApp').getAttribute('href'),'/milan#desk','no unqualified or contaminated WhatsApp message');
  assert.equal(await page.locator('#passageWhatsApp').getAttribute('target'),null);assert.match(await page.locator('.passage-ticket-contact small').innerText(),/Open the city page/);
  assert.equal(await page.locator('#passageSupport').isVisible(),true,'known service remains explainable even when contact data is malformed');
  assert.equal(await page.locator('#europeDeskContinue').isVisible(),true,'native service review is not removed by contact failure');await originalOwners(page);await layout(page,390);
 },{manifestTransform:data=>{data.cities.milan.contact.whatsapp=contact;return data;}});
 for(const width of [320,390,1024,1280])await check('Responsive knowledge and keyboard disclosures '+width,width,async({page})=>{
  if(width===1280)await page.setViewportSize({width,height:720});await start(page,'city=amsterdam');await selectedOffer(page,'amsterdam','search');await layout(page,width);
  const detail=page.locator('.passage-questions details').first(),summary=detail.locator('summary');await summary.focus();await page.keyboard.press('Enter');assert.equal(await detail.evaluate(n=>n.open),true);
  await layout(page,width);await page.keyboard.press('Enter');assert.equal(await detail.evaluate(n=>n.open),false);
  await selectCity(page,'rome');await layout(page,width);await originalOwners(page);
 });
 await check('Non-Passage isolation: Club and Dispatch Open retain their original content',390,async({page})=>{
  for(const composition of ['direction=club&edition=club','direction=club&edition=club&experience=panorama&vision=dispatch&composition=open']){
   await start(page,'city=london',composition);
   assert.equal(await page.locator('#passageSupport,#passageHomeBridge,#passageResultsBridge,#passageMoreServices,.passage-ticket-contact,[data-passage-desk]').count(),0,'no Passage additions leak');
   assert.match(await page.locator('#clubCompany .club-principles article').nth(1).innerText(),/A person who answers/);
   assert.equal(await page.locator('#clubCompany .club-destination-board [data-europe-city]').count(),6,'native six-destination footer is untouched');
  }
 });

 if(publicEvidence){
  assert.ok(artifacts,'BOOM_FLIGHT_ARTIFACT_DIR is required for public captures');
  const publicOrigin='https://www.boomrome.com',reports=[];
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844},{width:320,height:844},{width:1024,height:900}]){
   const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce'}),page=await context.newPage();
   const report={viewport,source:'Actual public catalogue GET with local working-tree presentation; native public Skyline, no synthetic catalogue or image substitution.',catalogues:[],errors:[],writes:[],captures:[]};reports.push(report);page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
   page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/listings'&&r.ok()){const data=await r.json().catch(()=>null);if(data)report.catalogues.push({url:r.url(),status:r.status(),count:data.listings?.length??data.length});}});
   await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());if(req.method()!=='GET'){report.writes.push(req.method()+' '+url.pathname);return route.abort();}if(url.pathname.startsWith('/cities/'))return route.abort();
    if(url.origin===publicOrigin){const file=url.pathname==='/flight-next'?root+'flight-next.html':url.pathname==='/skyline'?root+'skyline.html':/^\/(assets|js|img)\//.test(url.pathname)?root+url.pathname.slice(1):null;if(file&&existsSync(file))return route.fulfill({contentType:types[extname(file)]||'application/octet-stream',body:readFileSync(file)});}
    return route.continue();
   });
   async function snap(label,selector='',fullPage=false){if(selector)await page.locator(selector).scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const path=artifacts+'/public-'+label+'-'+viewport.width+'x'+viewport.height+'.png';if(selector)await page.locator(selector).screenshot({path});else await page.screenshot({path,fullPage});report.captures.push(path);console.log('    captured '+path);}
   async function decodeImages(selector){const images=page.locator(selector),count=await images.count();for(let i=0;i<count;i++){const image=images.nth(i);if(!await image.isVisible())continue;await image.scrollIntoViewIfNeeded();await image.evaluate(async n=>{await n.decode();if(!n.naturalWidth)throw Error('Public photograph failed to decode');});}return count;}
   try{
    await page.goto(publicOrigin+'/flight-next?'+base+'&city=amsterdam',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.airspaceReady==='true'&&window.BoomFlightGlobe?.state().ready);await page.locator('#nextHomeRail .next-card').first().waitFor({state:'attached'});await page.evaluate(()=>document.fonts.ready);
    await page.locator('#passageWhatsApp[href^="https://wa.me/"]').waitFor();await layout(page,viewport.width);
    await snap('amsterdam-contact','#europeDeskForm');await snap('amsterdam-support','#passageSupport');await snap('europe-footer','#clubCompany');
    await selectCity(page,'rome');await page.locator('#passageHomeBridge').waitFor({state:'visible'});
    report.decoded={interior:await decodeImages('#clubMedia .club-media-rail img'),homes:await decodeImages('#nextHomeRail img')};
    await page.locator('#nextHomeRail').evaluate(n=>n.scrollTo({left:0,behavior:'instant'}));
    await snap('rome-bridge','#passageHomeBridge');await snap('rome-service-directory','#passageMoreServices');await snap('rome-catalogue','#nextHomeRail');
    await page.locator('#nextHomeMap').scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const s=window.BoomNextMap?.state();return s?.usable&&s?.mapStatus==='ready';},{},{timeout:60000});
    const frame=await (await page.locator('.boom-next-map-frame').elementHandle()).contentFrame();await frame.waitForFunction(()=>window.BoomSkyline?.map.loaded()&&window.BoomSkyline?.map.areTilesLoaded(),{},{timeout:60000});
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await snap('rome-entry');await snap('rome-full','',true);
    await page.locator('#nextHomeRail [data-home]').first().click();await page.locator('#nextDetailTitle').waitFor();await decodeImages('#nextPhotoRail img');await snap('rome-detail-viewing','.detail-support');
    assert.match(await page.locator('.passage-viewing-note').innerText(),/Viewings of BOOM homes are free/);assert.ok(report.catalogues.some(c=>c.count>0),'live public catalogue loaded');assert.deepEqual(report.errors,[]);assert.deepEqual(report.writes,[]);report.completed=true;passed++;
   }catch(e){report.completed=false;report.error=e.stack;failed++;console.log('  ✗ Public evidence '+viewport.width+' — '+e.stack);await page.screenshot({path:artifacts+'/public-error-'+viewport.width+'.png',fullPage:true}).catch(()=>{});}
   finally{writeFileSync(artifacts+'/public-'+viewport.width+'x'+viewport.height+'.json',JSON.stringify(report,null,2));await context.close();}
  }
  writeFileSync(artifacts+'/public-report.json',JSON.stringify(reports,null,2));
 }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(!passed&&!failed){console.log('  No scenario matched '+focus);failed++;}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
