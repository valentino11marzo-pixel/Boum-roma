// Every vision, Panorama and Terminal use the real city, journey, globe and motion controllers. Fixtures
// replace only the public catalogue, photo bytes, Skyline rendering and final
// form boundary. Every write and every remote browser request is blocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';
import {CATALOG} from '../../api/_catalog.js';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flightpanoramaui  One globe, a complete move and an honest immersive preview');
const focus=process.argv[2]||'';
if(focus)console.log('  Focus: '+focus+' (default invocation runs every scenario)');
if(!chromium){console.log('  SKIP: playwright unavailable — panorama browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
// PFS has its own checkout; the other Rome services share the server catalogue.
// Read its declared amount without importing Stripe or constructing a checkout.
const pfsAmount=Number(readFileSync(root+'api/create-checkout.js','utf8').match(/unit_amount:\s*(\d+)/)?.[1]);
assert.equal(pfsAmount,35000,'the PFS ticket contract agrees with the server checkout amount');
const romeServices=[
 {path:'/property-finding',name:'Property Finding',code:'PF-0350',price:pfsAmount/100,route:['ABROAD','ROME'],brief:true},
 {path:'/virtual-viewing',name:'Virtual Viewing',code:'VV-0089',price:CATALOG['virtual-viewing'].eur,route:['YOU','THE DOOR']},
 {path:'/deal-assistance',name:'Deal Assistance',code:'DA-0249',price:CATALOG['deal-assistance'].eur,route:['FOUND','PROTECTED'],brief:true},
 {path:'/contract-check-express',name:'Contract Check Express',code:'CC-0049',price:CATALOG['contract-check-express'].eur,route:['DRAFT','VERDICT']}
];
const euro=amount=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(amount);
const romeTicket=(page,path)=>page.locator('#services a[href^="'+path+'"]');
const homes=[
 {id:'panorama-courtyard',name:'Fixture Courtyard',price:1200,sqm:65,bedrooms:2,type:'Apartment',depositMonths:2},
 {id:'panorama-room',name:'Fixture Room',price:700,sqm:18,bedrooms:1,type:'Room'}
].map((home,i)=>({...home,status:'available',availableDate:'Immediate',zone:'Prati',lat:41.9+i*.01,lng:12.49,
 images:['/panorama-photo.svg','/panorama-photo-2.svg'],description:'Synthetic public catalogue boundary, never a real home or customer.'}));
const mapHTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p>Skyline rendering boundary</p><script>window.__mapBoundary={resizes:0,stops:0,budget:null,destination:"",selected:"",scope:[]};window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(value){__mapBoundary.budget=value;},journeyFor(){return null;},selectPublicPlace(value){__mapBoundary.destination=value;return true;},refreshPlaces(){},map:{resize(){__mapBoundary.resizes++;},stop(){__mapBoundary.stops++;}}};addEventListener("message",e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data.t==="boomTieni")__mapBoundary.scope=e.data.ids;if(e.data.t==="boomSelect"){__mapBoundary.selected=e.data.id;parent.postMessage({t:"boomSelected",id:e.data.id},location.origin);}});parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
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
 const errors=[],writes=[],blockedAnalytics=[],missing=[],privateReads=[];let catalogueReads=0,skylineReads=0;
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 page.context().on('page',opened=>opened.on('pageerror',error=>errors.push(error.message)));
 page.on('response',response=>{if(response.url().startsWith(origin+'/assets/')&&response.status()>=400)missing.push(new URL(response.url()).pathname);});
 await page.context().route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  // The original PFS popup can emit Google's denied-consent page-view ping.
  // Abort that exact remote boundary too; it is not a BOOM form submission.
  if(request.method()==='POST'&&url.origin==='https://region1.google-analytics.com'&&url.pathname==='/g/collect'){
   blockedAnalytics.push({consent:url.searchParams.get('gcs'),storage:url.searchParams.get('pscdl')});return route.abort();
  }
  if(request.method()!=='GET'){writes.push(request.method()+' '+url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/cities/')){privateReads.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/listings'){catalogueReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});}
  if(url.pathname==='/skyline'){skylineReads++;return route.fulfill({contentType:'text/html',body:mapHTML});}
  if(url.pathname.startsWith('/listing/')||/^\/(barcelona|madrid|amsterdam|london|milan)$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Original public form boundary</h1><p>No application or payment is sent.</p>'});
  return route.continue();
 });
 try{
  await fn({page,catalogueReads:()=>catalogueReads,skylineReads:()=>skylineReads});
  assert.deepEqual(errors,[],'no unhandled browser errors');assert.deepEqual(writes,[],'no application, lead or payment write');
  for(const ping of blockedAnalytics)assert.deepEqual(ping,{consent:'G100',storage:'denied'},'the blocked legacy analytics ping never claims granted consent');
  assert.deepEqual(missing,[],'all actual assets loaded');assert.deepEqual(privateReads,[],'no private city configuration read');
  passed++;console.log('  ✓ '+name);
 }catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);console.log(error.stack);}
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
async function romeTickets(page){
 const tickets=page.locator('#services .next-tickets.panorama-ticketing a.panorama-ticket');
 assert.equal(await tickets.count(),4,'Panorama has the four real Rome service tickets');
 assert.deepEqual(await tickets.evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname)),romeServices.map(service=>service.path),'the ticket sequence keeps the four canonical service doors');
 await geometry(page,['#services a.panorama-ticket']);
 for(const service of romeServices){
  const ticket=romeTicket(page,service.path);
  assert.equal(await ticket.count(),1,'one ticket for '+service.name);
  assert.equal(await ticket.locator('h3').innerText(),service.name,'the service has its recognizable product name');
  assert.equal(await ticket.locator('.ticket-stub>strong').innerText(),euro(service.price),'the displayed fee agrees with the server offer');
  assert.ok((await ticket.locator('.panorama-ticket-reference').innerText()).includes(service.code),'the printed code identifies the actual product');
  const route=(await ticket.locator('.panorama-ticket-route').innerText()).replace(/\s+/g,' ').trim();
  assert.ok(route.includes(service.route[0])&&route.indexOf(service.route[1])>route.indexOf(service.route[0]),'the ticket preserves its real service route: '+route);
  const terms=await ticket.locator('.ticket-terms').innerText(),credit=await ticket.locator('.ticket-stub>small').innerText();
  assert.ok(terms.trim(),'the ticket keeps its service conditions beside the fee');
  if(service.path==='/property-finding'){assert.match(terms,/3 matching options within 15 days.*€350 refunded.*4\.2/);assert.match(credit,/agency fee.*success/i);}
  if(service.path==='/virtual-viewing'){assert.match(terms,/48 hours.*refunded.*cannot reach/i);assert.match(credit,/credited.*rent.*home.*BOOM/i);}
  if(service.path==='/deal-assistance'){assert.match(terms,/24 hours of payment.*€49.*credited/i);}
  if(service.path==='/contract-check-express'){assert.match(terms,/24 hours of receiving.*contract.*negotiation is not included/i);assert.match(credit,/credited in full.*Deal Assistance/i);}
  assert.ok((await ticket.locator('.ticket-stub>small').innerText()).trim(),'the price retains its credit or scope note');
  assert.equal(await ticket.locator('a,button,input,select').count(),0,'the whole ticket remains one native navigation target');
  const layout=await ticket.evaluate(node=>{
   const card=node.getBoundingClientRect(),bodyNode=node.querySelector('.panorama-ticket-body'),stub=node.querySelector('.ticket-stub').getBoundingClientRect();
   // Gate lays the original body children into the ticket grid with display:contents.
   // Its wrapper has no box: measure every rendered body child, keeping all older
   // presentations on their original physical-wrapper bounds check.
   const bodyParts=document.body.dataset.homeVision==='gate'&&getComputedStyle(bodyNode).display==='contents'
    ? [...bodyNode.children].filter(item=>item.getClientRects().length).map(item=>item.getBoundingClientRect().toJSON())
    : [bodyNode.getBoundingClientRect().toJSON()];
   const body={left:Math.min(...bodyParts.map(box=>box.left)),right:Math.max(...bodyParts.map(box=>box.right)),top:Math.min(...bodyParts.map(box=>box.top)),bottom:Math.max(...bodyParts.map(box=>box.bottom))};
   const samples=[['h3',20],['.panorama-ticket-description',14],['.ticket-terms',12],['.ticket-stub>small',12],['.panorama-ticket-action>span',14]];
   return {card:card.toJSON(),body,bodyParts,stub:stub.toJSON(),samples:samples.map(([selector,min])=>{const item=node.querySelector(selector),style=getComputedStyle(item),box=item.getBoundingClientRect();return {selector,min,font:parseFloat(style.fontSize),visible:box.width>0&&box.height>0,overflow:item.clientWidth>0&&item.scrollWidth>item.clientWidth+1};})};
  });
  assert.ok(layout.bodyParts.length&&layout.bodyParts.every(box=>box.width>0&&box.height>0),service.name+' keeps a measurable information region');
  for(const [name,box] of [['body',layout.body],['stub',layout.stub]])assert.ok(box.left>=layout.card.left-1&&box.right<=layout.card.right+1&&box.top>=layout.card.top-1&&box.bottom<=layout.card.bottom+1,service.name+' '+name+' fits inside its ticket');
  for(const box of layout.bodyParts){
   const overlapX=Math.min(box.right,layout.stub.right)-Math.max(box.left,layout.stub.left),overlapY=Math.min(box.bottom,layout.stub.bottom)-Math.max(box.top,layout.stub.top);
   assert.ok(overlapX<=1||overlapY<=1,service.name+' information and action stub do not overlap');
  }
  assert.ok(layout.samples.every(sample=>sample.visible&&sample.font>=sample.min&&!sample.overflow),service.name+' names, description, conditions and action stay readable: '+JSON.stringify(layout.samples));
 }
 const note=page.locator('#services .panorama-catalogue-note');
 assert.equal(await note.isVisible(),true,'the BOOM catalogue distinction is visible');
 assert.match((await note.innerText()).replace(/\s+/g,' '),/BOOM.*(?:homes?|apartments).*free/i,'viewings of BOOM homes are clearly free');
 assert.equal(await page.locator('#services .service-foot a[href="/services"]').isVisible(),true,'the full real service catalogue remains available');
}
async function typeQuality(page,view){
 await page.evaluate(()=>document.fonts.ready);
 const font=await page.evaluate(()=>({
  family:getComputedStyle(document.body).fontFamily,
  vision:document.body.dataset.homeVision||'',
  loaded:[...document.fonts].some(face=>face.family.replace(/["']/g,'')==='BOOM Sans'&&face.status==='loaded')
 }));
 // Computed family alone can lie: a missing file silently falls back. Check the
 // real browser FontFaceSet as well as the family applied to reading/control UI.
 const expectedFamily=font.vision?'Helvetica Neue':'BOOM Sans';
 if(font.vision){
  // Helvetica Neue is the original system-font stack, not a downloaded face.
  // Keep the archived font-file check and test the new family's exact contract.
  assert.ok(visions.includes(font.vision),'only the approved new visions use the restored brand stack');
  if(view==='home')assert.deepEqual(await page.locator('.hero-pretitle,#visionCityName').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fontWeight)),['300','300'],'the new vision restores BOOM’s light display and city-name weight');
 }else assert.equal(font.loaded,true,'the archived local BOOM Sans face has actually loaded');
 assert.equal(font.family.split(',')[0].replace(/["']/g,'').trim(),expectedFamily,'body uses its explicit approved type family');
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
 assert.ok(families.length&&families.every(family=>family===expectedFamily),'reading and control type stay in the same family: '+JSON.stringify(families));
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
async function cameraSnapshot(page){
 return page.evaluate(()=>{
  const canvas=document.querySelector('.boom-flight-globe-canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let fingerprint=2166136261;for(let i=0;i<pixels.length;i+=128)fingerprint=Math.imul(fingerprint^pixels[i],16777619)>>>0;
  return {camera:BoomFlightGlobe.state(),fingerprint,url:location.href,history:history.length,
   draft:[...document.querySelectorAll('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople')].map(node=>node.value)};
 });
}
async function releaseGlobe(page){
 // Focus moves to a real control outside the canvas; there is no activation,
 // synthetic camera action or forced application state in this helper.
 await page.locator('.europe-city-switch [data-europe-city="rome"]').focus();
 await page.locator('#boomGlobeMount').scrollIntoViewIfNeeded();await page.mouse.move(0,0);
}
async function plannerBounds(page){
 const layout=await page.locator('#nextSearchForm').evaluate(form=>({bounds:form.getBoundingClientRect().toJSON(),controls:[...form.children].filter(node=>node.matches('label,button')&&node.getClientRects().length).map(node=>({name:node.id||node.querySelector('input,select')?.id||'submit',box:node.getBoundingClientRect().toJSON()}))}));
 for(const item of layout.controls){
  assert.ok(item.box.left>=layout.bounds.left-1&&item.box.right<=layout.bounds.right+1,item.name+' stays inside the planner');
  for(const other of layout.controls){
   if(item===other)continue;
   const overlapX=Math.min(item.box.right,other.box.right)-Math.max(item.box.left,other.box.left),overlapY=Math.min(item.box.bottom,other.box.bottom)-Math.max(item.box.top,other.box.top);
   assert.ok(overlapX<=1||overlapY<=1,item.name+' does not overlap '+other.name);
  }
 }
}
async function nativeCatalogue(page,variant='panorama',vision=null){
 const link=page.locator('#services .panorama-catalogue-note a'),href=new URL(await link.getAttribute('href'),origin);
 assert.equal(href.pathname,'/flight-next');assert.equal(href.searchParams.get('experience'),'panorama');assert.equal(href.searchParams.get('view'),'apartments');
 assert.equal(href.searchParams.get('variant'),variant==='terminal'?'terminal':null,'the native catalogue URL retains the selected presentation');
 assert.equal(href.searchParams.get('vision'),vision,'the native catalogue URL preserves only the selected new vision');
 for(const key of ['privatePlace','lat','lng'])assert.equal(href.searchParams.has(key),false,'the native catalogue link excludes '+key);
 const original=page.url(),opened=page.context().waitForEvent('page');await link.click({button:'middle'});const popup=await opened;
 try{
  await popup.waitForLoadState('domcontentloaded');await popup.locator('#nextApartments').waitFor({state:'visible'});await popup.waitForFunction(()=>!!document.body.dataset.homeVariant);
  assert.equal(await popup.locator('body').getAttribute('data-home-variant'),variant,'opening the real native link in another tab retains the selected design');
  assert.equal(await popup.locator('body').getAttribute('data-home-vision'),vision,'the real new tab uses the selected new vision');
  assert.equal(page.url(),original,'native new-tab browsing leaves the source journey intact');
  assert.equal(new URL(popup.url()).searchParams.get('experience'),'panorama');await oneGlobe(popup);
 }finally{await popup.close();}
}
const visions=['airframe','signal','orbit','dispatch','gate','connection'];
const visionDefaults={airframe:'homes',signal:'world',orbit:'world',dispatch:'homes',gate:'world',connection:'city'};
async function startVision(page,vision,query=''){
 await start(page,'&vision='+vision+query);
 await page.waitForFunction(value=>document.body.dataset.homeVision===value,vision);
 assert.equal(new URL(page.url()).searchParams.get('variant'),null,'new visions do not inherit Terminal presentation');
 assert.equal(await page.locator('#visionScene').count(),1,'one scene owns the original media and geography');
}
async function visionScene(page,scene){
 await page.locator('#visionSceneTabs button[data-vision-scene="'+scene+'"]').click();
 await page.waitForFunction(value=>document.body.dataset.visionScene===value,scene);
 assert.equal(await page.locator('#visionSceneTabs button[data-vision-scene="'+scene+'"]').getAttribute('aria-pressed'),'true','the active scene is explicit');
 assert.equal(await page.locator('#visionScene #clubMedia').isVisible(),scene==='homes','the original home scene follows the selected view');
 assert.equal(await page.locator('#visionScene #boomGlobeMount').isVisible(),scene==='world','the original globe follows the selected view');
 if(await page.locator('body').getAttribute('data-home-vision')==='connection'){
  assert.equal(await page.locator('#visionScene .next-city-scene').isVisible(),scene==='city','the original Rome Skyline follows the selected view');
  if(scene==='city'){
   const map=await page.locator('#nextHomeMap').evaluate(node=>({slot:node.getBoundingClientRect().height,shell:node.querySelector('.boom-next-map-shell')?.getBoundingClientRect().height,frame:node.querySelector('iframe.boom-next-map-frame')?.getBoundingClientRect().height}));
   assert.ok(map.slot>=300&&Math.abs(map.shell-map.slot)<=1&&Math.abs(map.frame-map.slot)<=1,'the original iframe fills the visible Skyline stage instead of falling back to150px: '+JSON.stringify(map));
  }
 }
 if(scene==='world')await paintedGlobe(page);
}
try{
 browser=await chromium.launch(await launchOptions());
 for(const vision of visions)for(const width of [390,1440])await check('Vision '+vision+' '+width+': distinct scene presentation keeps original form, photographs, canvas and readable brand type',width,async({page,catalogueReads})=>{
  await startVision(page,vision);
  await page.waitForFunction(()=>BoomFlightNextMotion.state().fieldEnabled===false&&!BoomFlightNextMotion.state().rafPending);
  const field=await page.evaluate(()=>({motion:BoomFlightNextMotion.state(),rect:document.getElementById('nextHero').getBoundingClientRect().toJSON(),height:innerHeight}));
  assert.ok(field.rect.top<field.height&&field.rect.bottom>0,'the hidden-field assertion is made while the opening itself is onscreen');
  assert.equal(field.motion.running,false,'the removed Solari background field does not keep a hidden frame loop');
  assert.equal(await page.locator('body').getAttribute('data-vision-scene'),visionDefaults[vision],'each vision opens its intended subject');
  await geometry(page,['#visionSceneTabs button','#nextSearchForm button[type="submit"]','#visionNeedChooser button']);
  await plannerBounds(page);await typeQuality(page,'home');await primaryContrast(page,'#nextSearchForm button[type="submit"]');await romeTickets(page);
  await page.evaluate(()=>{window.__visionNodes={form:document.getElementById('nextSearchForm'),field:document.getElementById('nextMoveIn'),media:document.getElementById('clubMedia'),atlas:document.getElementById('boomGlobeMount'),canvas:document.querySelector('.boom-flight-globe-canvas')};});
  await fillRome(page);const before=page.url(),reads=catalogueReads();let photoAdvanced=false;
  for(const scene of vision==='connection'?['city','homes','world','city','homes','world']:['homes','world','homes','world']){
   await visionScene(page,scene);
   assert.equal(await page.evaluate(()=>document.getElementById('nextSearchForm')===window.__visionNodes.form&&document.getElementById('nextMoveIn')===window.__visionNodes.field&&document.getElementById('clubMedia')===window.__visionNodes.media&&document.getElementById('boomGlobeMount')===window.__visionNodes.atlas&&document.querySelector('.boom-flight-globe-canvas')===window.__visionNodes.canvas),true,'changing scene moves no customer state and replaces no original node');
   assert.deepEqual(await page.locator('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople').evaluateAll(nodes=>nodes.map(node=>node.value)),[arrival,departure,'1500','couple'],'changing scene preserves the live unsubmitted request');
   assert.equal(page.url(),before,'changing the visual scene does not commit a search or change history');
   await oneGlobe(page);
   if(scene==='homes'){
    const photo=page.locator('#visionScene #clubMedia img').first();await photo.waitFor({state:'visible'});await photo.evaluate(node=>node.decode());
    assert.equal(await photo.getAttribute('src'),'/panorama-photo.svg','the opening photograph comes from the actual public home fixture');
    assert.match(await page.locator('#visionScene .club-media-name').innerText(),/Fixture Courtyard|Fixture Room/,'the image keeps the actual home identity beside it');
    if(!photoAdvanced){await page.locator('#visionScene .club-media-rail').focus();await page.keyboard.press('ArrowRight');photoAdvanced=true;}
    await page.waitForFunction(()=>document.querySelector('#visionScene .club-media-count')?.textContent==='02 / 02');
    assert.equal(await page.locator('#visionScene .club-media-count').innerText(),'02 / 02','the original photograph controls and chosen frame survive scene switches');
   }
  }
  await openGlobe(page);await closeGlobe(page,true);
  assert.equal(await page.evaluate(()=>document.querySelector('#visionScene #boomGlobeMount')===window.__visionNodes.atlas&&document.querySelector('.boom-flight-globe-canvas')===window.__visionNodes.canvas),true,'Full view returns the original canvas to its new scene');
  if(width===1440){
   await releaseGlobe(page);await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
   const beforeGlobe=await cameraSnapshot(page);await page.waitForTimeout(700);const afterGlobe=await cameraSnapshot(page);
   assert.ok(afterGlobe.camera.frames>beforeGlobe.camera.frames,'the visible original globe still paints its deliberate ambient movement');
   assert.notEqual(afterGlobe.fingerprint,beforeGlobe.fingerprint,'ambient movement reaches the real geographic pixels');
   assert.equal(await page.evaluate(()=>BoomFlightNextMotion.state().rafPending),false,'the moving globe does not restart a hidden Solari field');
  }
  if(vision==='orbit'&&width===1440){
   await openGlobe(page);
   assert.equal(await page.locator('#boomGlobeMount').getAttribute('data-globe-labels'),'all','Full view exposes the geographic destinations rather than the cropped horizon label');
   await page.locator('#panoramaGlobeDialog [data-globe-city="london"]').click();
   await page.waitForFunction(()=>BoomFlightGlobe.state().flying&&BoomFlightGlobe.state().flightCity==='london'&&BoomFlightGlobe.state().flightFrames>0);
   assert.equal(await page.locator('.boom-globe-flight').evaluate(node=>node.open&&node.querySelector('canvas').width>0),true,'a real destination choice paints the finite geographic flight');
   await page.waitForFunction(()=>document.body.dataset.europeCity==='london'&&BoomFlightGlobe.state().city==='london'&&!BoomFlightGlobe.state().flying);
   await page.locator('#panoramaGlobeDialog').waitFor({state:'hidden'});await paintedGlobe(page);
   assert.equal(await page.locator('#boomGlobeMount').getAttribute('data-globe-labels'),'selected','arrival restores the horizon framing with the chosen city');
   assert.equal(await page.evaluate(()=>document.querySelector('#visionScene #boomGlobeMount')===window.__visionNodes.atlas&&document.querySelector('.boom-flight-globe-canvas')===window.__visionNodes.canvas),true,'the real city flight returns the same geographic scene and canvas');
   assert.equal(await page.locator('.boom-globe-flight').count(),0,'the finite flight removes its temporary overlay after arrival');
  }
  await page.locator('.europe-city-switch [data-europe-city="london"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='london');
  assert.equal(await page.locator('#visionSceneTabs').isVisible(),false,'foreign desks do not offer photographs of Rome as their homes');
  assert.equal(await page.locator('body').getAttribute('data-vision-scene'),'world','foreign desks open the real geographic scene');
  assert.equal(await page.locator('#clubMedia').isVisible(),false,'Rome photographs do not imply foreign inventory');
  if(vision==='connection'){
   assert.equal(await page.locator('#visionScene .next-city-scene').isVisible(),false,'the foreign desk does not display Rome inventory through Skyline');
   assert.equal(await page.locator('.connection-guide-entry').isVisible(),false,'the Rome everyday-destination guide does not become a foreign search promise');
  }
  assert.equal(new URL(page.url()).searchParams.get('vision'),vision,'the city change retains the selected vision');
  await page.locator('#europeServicePass .europe-service-price strong').waitFor();await geometry(page,['#europeDeskContinue']);
  await page.locator('.europe-city-switch [data-europe-city="rome"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='rome');
  await page.locator('#visionSceneTabs').waitFor({state:'visible'});await plannerBounds(page);await romeTickets(page);
  assert.equal(catalogueReads(),reads,'scene switches, Full view and city presentation do not create another catalogue');
 },width===1440?'no-preference':'reduce');
 await check('Vision journey: each new identity follows native links, real home review and Back while private handoffs stay clean',1440,async({page})=>{
  for(const vision of visions){
   await startVision(page,vision,'&privatePlace=synthetic-office&lat=41.9123&lng=12.5123');await nativeCatalogue(page,'panorama',vision);await fillRome(page);
   for(const service of romeServices){
    const link=new URL(await romeTicket(page,service.path).getAttribute('href'),origin);
    for(const key of ['vision','variant','experience','privatePlace','lat','lng'])assert.equal(link.searchParams.has(key),false,'the original '+service.name+' excludes '+key);
   }
   await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
   previewIntent(new URL(page.url()),{view:'apartments'});assert.equal(new URL(page.url()).searchParams.get('vision'),vision);await typeQuality(page,'apartments');
   await page.locator('#nextResults [data-home="panorama-courtyard"]').first().click();await page.locator('#nextDetailTitle').waitFor();
   previewIntent(new URL(page.url()),{view:'detail'});assert.equal(new URL(page.url()).searchParams.get('vision'),vision);await typeQuality(page,'detail');
   const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);
   for(const key of ['vision','variant','experience','privatePlace','lat','lng'])assert.equal(apply.searchParams.has(key),false,'the original Apply excludes '+key);
   await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/panorama-courtyard');
   await page.goBack();await page.locator('#nextDetailTitle').waitFor();assert.equal(new URL(page.url()).searchParams.get('vision'),vision,'Back restores the selected new vision');
   await startVision(page,vision,'&city=london&need=application&moveIn='+arrival+'&moveOut='+departure+'&budget=3000&currency=GBP&people=couple');
   await page.locator('#europeServicePass .europe-service-price strong').waitFor();await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
   const desk=new URL(page.url());for(const key of ['vision','variant','experience','privatePlace','lat','lng','place'])assert.equal(desk.searchParams.has(key),false,'the original London desk excludes '+key);
   for(const [key,value] of Object.entries({city:'london',need:'application',moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'couple'}))assert.equal(desk.searchParams.get(key),value,'the original desk preserves the real '+key);
  }
 });
 await check('Vision support choices filter the four original services without replacing tickets, prices or native links',900,async({page})=>{
  const groups={search:['property-finding'],found:['virtual-viewing','deal-assistance'],contract:['deal-assistance','contract-check-express'],all:['property-finding','virtual-viewing','deal-assistance','contract-check-express']};
  for(const vision of visions){
   await startVision(page,vision);await fillRome(page);await romeTickets(page);
   await page.evaluate(()=>{window.__visionServiceNodes=[...document.querySelectorAll('#services .panorama-ticket')];window.__visionServiceLinks=window.__visionServiceNodes.map(node=>node.href);});
   const before=page.url();
   for(const [need,services] of Object.entries(groups)){
    const button=page.locator('#visionNeedChooser button[data-vision-need="'+need+'"]');await button.focus();await button.press('Enter');
    await page.waitForFunction(value=>document.querySelector('#visionNeedChooser button[data-vision-need="'+value+'"]')?.getAttribute('aria-pressed')==='true',need);
    const visible=await page.locator('#services .panorama-ticket').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>new URL(node.href).pathname.slice(1)));
    assert.deepEqual(visible,services,'the chosen situation reveals only its actual services');
    assert.equal(await page.locator('#visionNeedChooser button[aria-pressed="true"]').count(),1,'one service situation is selected');
    assert.equal(await button.evaluate(node=>node===document.activeElement),true,'filtering retains keyboard focus on the chosen situation');
    assert.equal(await page.locator('#visionNeedSummary').getAttribute('role'),'status');assert.ok((await page.locator('#visionNeedSummary').innerText()).trim(),'the visible result has an accessible explanation');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#services .panorama-ticket')].every((node,i)=>node===window.__visionServiceNodes[i]&&node.href===window.__visionServiceLinks[i])),true,'filtering reuses the same tickets and native brief links');
    assert.equal(page.url(),before,'service guidance is not a new request or navigation');
   }
   await romeTickets(page);await page.locator('#visionNeedChooser button[data-vision-need="contract"]').click();
   await page.locator('.europe-city-switch [data-europe-city="london"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='london');
   await page.locator('.europe-city-switch [data-europe-city="rome"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='rome');
   assert.equal(await page.locator('#visionNeedChooser button[data-vision-need="all"]').getAttribute('aria-pressed'),'true','returning to Rome clears an obsolete service filter');await romeTickets(page);
  }
 });
 await check('Vision Studio: all six directions retain a valid public draft and reject invalid dates in one preview',1440,async({page})=>{
  await page.goto(origin+'/flight-studio',{waitUntil:'domcontentloaded'});
  const handle=await page.locator('#studioFrame').elementHandle(),frame=await handle.contentFrame();
  await frame.waitForFunction(()=>document.body.dataset.homeVision==='airframe'&&!!window.BoomFlightEurope);
  assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).fontFamily.split(',')[0].replace(/["']/g,'').trim()),'Helvetica Neue','Studio uses the original BOOM family');
  await fillRome(frame);
  for(const vision of ['dispatch','gate','connection','signal','orbit','airframe']){
   await page.locator('button[data-studio-experience="'+vision+'"]').click();await frame.waitForFunction(value=>document.body.dataset.homeVision===value&&!!window.BoomFlightEurope,vision);
   assert.equal(await page.locator('button[data-studio-experience="'+vision+'"]').getAttribute('aria-pressed'),'true');
   const current=new URL(frame.url());assert.equal(current.searchParams.get('vision'),vision);assert.equal(current.searchParams.has('variant'),false);previewIntent(current);
   const open=new URL(await page.locator('#studioOpen').getAttribute('href'),origin);open.searchParams.sort();current.searchParams.sort();assert.equal(open.href,current.href,'the full-view link carries the same design and valid public brief');
   for(const key of ['privatePlace','lat','lng'])assert.equal(current.searchParams.has(key),false,'Studio excludes '+key);
  }
  await frame.evaluate(()=>{window.__visionStudioNode=document.getElementById('nextSearchForm');});
  for(const device of ['mobile','desktop']){
   await page.locator('button[data-studio-device="'+device+'"]').click();await frame.waitForFunction(width=>innerWidth===width,device==='mobile'?390:1280);
   assert.equal(await frame.evaluate(()=>document.getElementById('nextSearchForm')===window.__visionStudioNode),true,'device selection resizes the same new-vision form');
  }
  await frame.locator('#nextMoveOut').fill(year+'-01-01');await page.locator('button[data-studio-experience="signal"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>document.getElementById('nextSearchForm')===window.__visionStudioNode),true,'invalid dates never discard the current draft');
  assert.equal(await page.locator('button[data-studio-experience="airframe"]').getAttribute('aria-pressed'),'true');
  await frame.locator('#nextMoveOut').fill(departure);await frame.locator('#nextBudget').selectOption('2000');await page.locator('button[data-studio-experience="orbit"]').click();await frame.waitForFunction(()=>document.body.dataset.homeVision==='orbit');
  previewIntent(new URL(frame.url()),{budget:'2000'});assert.equal(await page.locator('iframe').count(),1,'all directions share one live preview');
  for(const width of [320,390,900,1440]){await page.setViewportSize({width,height:900});await geometry(page,['#studioOpen',...visions.map(vision=>'button[data-studio-experience="'+vision+'"]'),'button[data-studio-device]']);}
 });
 await check('Vision Studio: resizing during a delayed direction change keeps the incoming selection and public draft',1440,async({page})=>{
  await page.goto(origin+'/flight-studio?experience=dispatch&device=mobile',{waitUntil:'domcontentloaded'});
  const handle=await page.locator('#studioFrame').elementHandle(),frame=await handle.contentFrame();
  await frame.waitForFunction(()=>document.body.dataset.homeVision==='dispatch'&&!!window.BoomFlightEurope&&innerWidth===390);
  await fillRome(frame);await frame.evaluate(()=>{window.__outgoingStudioDocument='Dispatch mobile';});
  let release,arrived,timer;
  const gate=new Promise(resolve=>{release=resolve;}),incoming=new Promise((resolve,reject)=>{arrived=resolve;timer=setTimeout(()=>reject(new Error('Connection navigation never reached the controlled request boundary')),10000);});
  // Hold only the incoming document request. The real Studio and outgoing
  // Dispatch document continue to handle the user's device change normally.
  await page.route('**/flight-next?**',async route=>{
   const url=new URL(route.request().url());
   if(route.request().isNavigationRequest()&&url.searchParams.get('vision')==='connection'){clearTimeout(timer);arrived(url);await gate;}
   return route.fallback();
  });
  async function selectedConnection(){
   assert.equal(await page.locator('body').getAttribute('data-studio-experience'),'connection');
   assert.equal(await page.locator('body').getAttribute('data-studio-device'),'desktop');
   assert.equal(await page.locator('button[data-studio-experience="connection"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('button[data-studio-experience="dispatch"]').getAttribute('aria-pressed'),'false');
   assert.equal(await page.locator('button[data-studio-device="desktop"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#studioVariantTitle').innerText(),'Connection');
   assert.match(await page.locator('#studioFrame').getAttribute('title'),/BOOM Connection/);
   const full=new URL(await page.locator('#studioOpen').getAttribute('href'),origin);assert.equal(full.searchParams.get('vision'),'connection');previewIntent(full);
   const studio=new URL(page.url());assert.equal(studio.searchParams.get('experience'),'connection');assert.equal(studio.searchParams.get('device'),'desktop');
  }
  try{
   await page.locator('button[data-studio-experience="connection"]').click({noWaitAfter:true});
   const pending=await incoming;previewIntent(pending);
   assert.equal(await frame.evaluate(()=>window.__outgoingStudioDocument),'Dispatch mobile','the request boundary retains the outgoing document until explicitly released');
   await page.locator('button[data-studio-device="desktop"]').click({noWaitAfter:true});
   await frame.waitForFunction(()=>innerWidth===1280);
   assert.equal(await frame.locator('body').getAttribute('data-home-vision'),'dispatch','the resize really happens while the previous direction is still exposed');
   await selectedConnection();
   assert.equal(await page.locator('#studioOpen').getAttribute('aria-disabled'),'true','opening stays disabled while the requested direction is pending');
   assert.match(await page.locator('#studioStatus').innerText(),/Apertura di Connection/);
  }finally{clearTimeout(timer);release();}
  await frame.waitForFunction(()=>document.body.dataset.homeVision==='connection'&&!!window.BoomFlightEurope&&innerWidth===1280);
  await page.waitForFunction(()=>document.getElementById('studioOpen').getAttribute('aria-disabled')==='false');
  await selectedConnection();previewIntent(new URL(frame.url()));
  assert.equal(await page.locator('#studioStatus').innerText(),'Connection · 1280 px');
  assert.equal(await page.locator('#studioFrame').count(),1,'the delayed direction change still uses one preview element');
 });
 await check('Vision Connection: Skyline retains one browsing context through scenes, native balance guidance and private-place sharing',1440,async({page,catalogueReads,skylineReads})=>{
  // Saved places and the OS clipboard are fixture boundaries. All destination,
  // privacy, navigation and shared-frame decisions remain the real controllers.
  await page.addInitScript(()=>{
   localStorage.setItem('boom:pois',JSON.stringify([{name:'Synthetic private office',lat:41.9123,lng:12.5123}]));
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedPlan=text;}}});
  });
  await startVision(page,'connection');
  await page.waitForFunction(()=>BoomNextMap.state().status==='ready');
  assert.equal(await page.locator('#visionScene .next-city-scene #nextHomeMap iframe.boom-next-map-frame').count(),1,'Connection opens the original Skyline in its city scene');
  const embed=await page.locator('iframe.boom-next-map-frame').elementHandle(),frame=await embed.contentFrame();
  await frame.evaluate(()=>{window.__connectionFrameToken='same Skyline document';});
  await page.evaluate(()=>{window.__connectionNodes={frame:document.querySelector('iframe.boom-next-map-frame'),scene:document.querySelector('#visionScene .next-city-scene'),homeMap:document.getElementById('nextHomeMap'),guide:document.querySelector('.connection-guide-entry'),balance:document.getElementById('nextBalance')};});
  const reads={catalogue:catalogueReads(),skyline:skylineReads()};
  async function retainedMap(owner,visible){
   assert.equal(await page.locator('iframe.boom-next-map-frame').count(),1,'there is one Skyline frame across every presentation');
   assert.equal(await page.evaluate(id=>document.querySelector('iframe.boom-next-map-frame')===window.__connectionNodes.frame&&document.getElementById(id).contains(window.__connectionNodes.frame),owner),true,'the native map owner receives the same iframe node');
   assert.equal(await frame.evaluate(()=>window.__connectionFrameToken),'same Skyline document','scene and page transitions preserve the live Skyline document');
   assert.equal(await page.locator('iframe.boom-next-map-frame').isVisible(),visible,'only the active map owner is visible');
  }
  for(const scene of ['homes','world','city','homes','city']){
   const stopped=await frame.evaluate(()=>__mapBoundary.stops);
   await visionScene(page,scene);await retainedMap('nextHomeMap',scene==='city');
   if(scene!=='city')await frame.waitForFunction(previous=>__mapBoundary.stops>previous,stopped);
  }
  await visionScene(page,'homes');
  await page.locator('[data-europe-locate]').click();
  await page.waitForFunction(()=>document.body.dataset.visionScene==='city');
  await retainedMap('nextHomeMap',true);
  await frame.waitForFunction(()=>__mapBoundary.selected==='panorama-courtyard'||__mapBoundary.selected==='panorama-room');
  await page.waitForFunction(()=>{const map=document.getElementById('nextHomeMap').getBoundingClientRect(),nav=document.querySelector('.next-nav').getBoundingClientRect();return map.top>=Math.max(0,nav.bottom)-1&&map.bottom<=innerHeight+1;});
  assert.equal(await page.evaluate(()=>innerWidth),1440,'native Locate reveals the actual Skyline viewport on desktop, too');
  assert.equal(await page.locator('.connection-guide-entry').count(),1,'the existing everyday guide has one opening control');
  assert.equal(await page.locator('.connection-guide-entry').innerText(),'Choose your everyday destination');
  await page.locator('.connection-guide-entry').focus();await page.keyboard.press('Enter');
  await page.locator('#nextDestinationDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#nextGuideDialog').isVisible(),false,'Club keeps its native destination chooser instead of opening a second Skyline iframe');
  await page.locator('[data-destination="luiss"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  await retainedMap('nextApartmentsMap',true);
  assert.equal(await page.locator('#nextBalance').evaluate(node=>!!(node.compareDocumentPosition(document.getElementById('nextDiscovery'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'the actual trade-off comparison precedes the full discovery surface');
  assert.equal(new URL(page.url()).searchParams.get('place'),'luiss','the native guide commits the public daily destination');
  await frame.waitForFunction(()=>__mapBoundary.destination==='luiss');
  assert.match(await page.locator('#nextBalance .balance-heading').innerText(),/Luiss/i);
  await page.locator('#nextBalance [data-edit-destination]').click();await page.locator('[data-destination-mode="work"]').click();await page.locator('[data-private-place="0"]').click();
  await page.locator('#nextDestinationDialog').waitFor({state:'hidden'});
  assert.match(await page.locator('#nextBalance .balance-heading').innerText(),/Synthetic private office/,'a private saved destination reaches the original comparison');
  assert.equal(await page.locator('#nextBalanceEntry [data-entry-private]').isVisible(),true,'the brief still explains that the place belongs to this browser');
  await page.locator('#nextResults [data-save-home="panorama-courtyard"]').click();
  await page.locator('#nextBalance [data-share-plan]').click();await page.waitForFunction(()=>!!window.__copiedPlan);
  const shared=new URL(await page.evaluate(()=>window.__copiedPlan));
  assert.equal(shared.searchParams.get('homes'),'panorama-courtyard','the actual saved home enters the public plan');
  for(const key of ['privatePlace','lat','lng','address','name','place'])assert.equal(shared.searchParams.has(key),false,'a shared Connection plan excludes '+key);
  assert.doesNotMatch(shared.href,/Synthetic|41\.9123|12\.5123/,'private-place text and coordinates do not leak through another field');
  assert.doesNotMatch(page.url(),/Synthetic|41\.9123|12\.5123|privatePlace/,'the live route also excludes private location data');
  await frame.waitForFunction(()=>__mapBoundary.destination==='');
  await page.locator('.next-nav .next-brand[data-view="home"]').click();await page.locator('#nextHome').waitFor({state:'visible'});
  await retainedMap('nextHomeMap',true);
  assert.equal(await page.evaluate(()=>document.querySelector('#visionScene .next-city-scene')===window.__connectionNodes.scene&&document.getElementById('nextHomeMap')===window.__connectionNodes.homeMap&&document.querySelector('.connection-guide-entry')===window.__connectionNodes.guide&&document.getElementById('nextBalance')===window.__connectionNodes.balance),true,'returning home retains the original scene, guide and comparison containers');
  await visionScene(page,'homes');await page.locator('.connection-guide-entry').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  await retainedMap('nextApartmentsMap',true);
  assert.equal(await page.locator('#nextDestinationDialog').isVisible(),false,'an existing destination opens its real balance directly');
  await page.locator('.next-nav .next-brand[data-view="home"]').click();await page.locator('#nextHome').waitFor({state:'visible'});
  assert.equal(await page.locator('body').getAttribute('data-vision-scene'),'homes','returning home preserves the visitor’s selected scene');
  await retainedMap('nextHomeMap',false);await visionScene(page,'city');await retainedMap('nextHomeMap',true);
  assert.equal(catalogueReads(),reads.catalogue,'Connection does not create another catalogue request');
  assert.equal(skylineReads(),reads.skyline,'the scene and guide lifecycle does not reload Skyline');
 });
 await check('Vision Gate: original service ticketing leads the scene and survives filtering and city return',390,async({page})=>{
  await startVision(page,'gate');await fillRome(page);
  await page.evaluate(()=>{window.__gateServices=document.getElementById('services');window.__gateTickets=[...document.querySelectorAll('#services .panorama-ticket')];});
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});await romeTickets(page);await geometry(page,['#visionNeedChooser button']);
   const order=await page.locator('#services').evaluate(node=>({parent:node.parentElement.id,chooserInside:node.contains(document.getElementById('visionNeedChooser')),before:!!(node.compareDocumentPosition(document.getElementById('visionScene'))&Node.DOCUMENT_POSITION_FOLLOWING),bottom:node.getBoundingClientRect().bottom,sceneTop:document.getElementById('visionScene').getBoundingClientRect().top}));
   assert.equal(order.parent,'directionClubTicket','Gate uses the original services inside the opening composition');
   assert.ok(order.chooserInside&&order.before,'the support choice stays inside its canonical section and precedes the scene in reading order');
   assert.ok(order.bottom<=order.sceneTop+1,'the visual order also places ticketing before the geographic scene');
  }
  await page.locator('#visionNeedChooser button[data-vision-need="found"]').click();
  assert.deepEqual(await page.locator('#services .panorama-ticket:visible').evaluateAll(nodes=>nodes.map(node=>node.dataset.romeService)),['virtual-viewing','deal-assistance'],'the service-first entry retains the real found-home options');
  await page.locator('.europe-city-switch [data-europe-city="london"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='london');
  assert.equal(await page.locator('#services').isVisible(),false,'foreign Gate pages do not offer Rome ticketing');
  await page.locator('#europeServicePass .europe-service-price strong').waitFor();
  await page.locator('.europe-city-switch [data-europe-city="rome"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='rome');
  assert.equal(await page.evaluate(()=>document.getElementById('services')===window.__gateServices&&[...document.querySelectorAll('#services .panorama-ticket')].every((node,i)=>node===window.__gateTickets[i])),true,'city changes retain the original ticketing section and native tickets');
  assert.equal(await page.locator('#visionNeedChooser button[data-vision-need="all"]').getAttribute('aria-pressed'),'true');await romeTickets(page);
  await page.locator('#services').evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('[data-flight-stop="support"]').getAttribute('aria-current')==='location');
  await page.locator('#clubHomes').evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('[data-flight-stop="homes"]').getAttribute('aria-current')==='location');
  assert.equal(await page.locator('.edition-flightline [aria-current="location"]').count(),1,'Gate tracks the physically current homes chapter after its earlier support section');
 });
 for(const width of [320,390,900,1440])await check('Terminal '+width+': the original planner, globe and four real tickets remain readable and keep their identity',width,async({page,catalogueReads})=>{
  await start(page,'&variant=terminal');
  assert.equal(await page.locator('body').getAttribute('data-home-variant'),'terminal','Terminal is an explicit presentation of the real Panorama journey');
  assert.equal(await page.locator('#nextSearchForm').count(),1,'Terminal does not clone the form');
  await geometry(page,['#nextSearchForm button[type="submit"]','[data-panorama-expand]','[data-panorama-zoom]','#nextMotionToggle']);
  await plannerBounds(page);await typeQuality(page,'home');await primaryContrast(page,'#nextSearchForm button[type="submit"]');await romeTickets(page);
  const order=await page.locator('#directionClubTicket').evaluate(node=>{
   const title=node.querySelector('.hero-centre'),planner=node.querySelector('.europe-planner'),globe=node.querySelector('#boomGlobeMount');
   return {sameParent:!!(title&&planner&&globe&&planner.parentElement===node),titleBeforePlanner:!!(title&&planner&&(title.compareDocumentPosition(planner)&Node.DOCUMENT_POSITION_FOLLOWING)),plannerBeforeGlobe:!!(planner&&globe&&(planner.compareDocumentPosition(globe)&Node.DOCUMENT_POSITION_FOLLOWING)),planner:planner?.getBoundingClientRect().toJSON(),globe:globe?.getBoundingClientRect().toJSON()};
  });
  assert.ok(order.sameParent&&order.titleBeforePlanner&&order.plannerBeforeGlobe,'Terminal reading order is title, the existing planner, then the globe');
  if(width<650)assert.ok(order.planner.bottom<=order.globe.top+1,'the phone visual order agrees with its keyboard and reading order');
  await fillRome(page);
  await page.evaluate(()=>{window.__terminalNodes={form:document.getElementById('nextSearchForm'),field:document.getElementById('nextMoveIn'),globe:document.querySelector('.boom-flight-globe-canvas')};});
  const reads=catalogueReads();
  if(width===1440)for(const nextWidth of [390,900,1440]){
   await page.setViewportSize({width:nextWidth,height:900});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await plannerBounds(page);await geometry(page,['#nextSearchForm button[type="submit"]','[data-panorama-expand]']);
   assert.equal(await page.evaluate(()=>document.getElementById('nextSearchForm')===window.__terminalNodes.form&&document.getElementById('nextMoveIn')===window.__terminalNodes.field&&document.querySelector('.boom-flight-globe-canvas')===window.__terminalNodes.globe),true,'responsive composition moves the same live nodes');
   assert.deepEqual(await page.locator('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople').evaluateAll(nodes=>nodes.map(node=>node.value)),[arrival,departure,'1500','couple'],'responsive composition preserves the unsubmitted draft');
  }
  await openGlobe(page);await closeGlobe(page,true);
  assert.equal(await page.evaluate(()=>document.getElementById('nextSearchForm')===window.__terminalNodes.form&&document.querySelector('.boom-flight-globe-canvas')===window.__terminalNodes.globe),true,'Full view does not replace the form or canvas');
  await page.locator('.europe-city-switch [data-europe-city="london"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='london');
  assert.equal(new URL(page.url()).searchParams.get('variant'),'terminal','city changes preserve the chosen composition');
  await page.locator('#europeServicePass .europe-service-price strong').waitFor();await geometry(page,['#europeDeskContinue']);
  assert.equal(await page.locator('#nextSearchForm').isVisible(),false,'the Roman form does not become an extra London form');
  await page.locator('.europe-city-switch [data-europe-city="rome"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='rome');
  assert.equal(await page.evaluate(()=>document.getElementById('nextSearchForm')===window.__terminalNodes.form&&document.getElementById('nextMoveIn')===window.__terminalNodes.field),true,'Rome receives its original planner again after a foreign city');
  await plannerBounds(page);await romeTickets(page);await oneGlobe(page);
  assert.equal(catalogueReads(),reads,'layout, Full view and city presentation do not create another catalogue');
 });
 await check('Terminal journey: presentation follows Rome navigation and Back but never enters original service or desk handoffs',1440,async({page})=>{
  await start(page,'&variant=terminal&privatePlace=synthetic-office&lat=41.9123&lng=12.5123');await nativeCatalogue(page,'terminal');await fillRome(page);
  for(const service of romeServices){
   const link=new URL(await romeTicket(page,service.path).getAttribute('href'),origin);
   assert.equal(link.pathname,service.path);
   for(const key of ['variant','experience','privatePlace','lat','lng'])assert.equal(link.searchParams.has(key),false,'the original '+service.name+' door excludes '+key);
  }
  await page.locator('#nextSearchForm button[type="submit"]').click();await page.locator('#nextApartments').waitFor({state:'visible'});
  previewIntent(new URL(page.url()),{view:'apartments'});assert.equal(new URL(page.url()).searchParams.get('variant'),'terminal');
  await page.locator('#nextResults [data-home="panorama-courtyard"]').first().click();await page.locator('#nextDetailTitle').waitFor();
  previewIntent(new URL(page.url()),{view:'detail'});assert.equal(new URL(page.url()).searchParams.get('variant'),'terminal');
  const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);
  for(const key of ['variant','experience','privatePlace','lat','lng'])assert.equal(apply.searchParams.has(key),false,'the original Apply excludes '+key);
  assert.equal(apply.pathname,'/listing/panorama-courtyard');assert.equal(apply.hash,'#applica');
  await page.locator('[data-next-apply]').click();await page.waitForURL(url=>url.pathname==='/listing/panorama-courtyard');
  await page.goBack();await page.locator('#nextDetailTitle').waitFor();assert.equal(new URL(page.url()).searchParams.get('variant'),'terminal','Back restores Terminal on the original detail journey');
  await page.locator('.detail-breadcrumb [data-view="apartments"]').click();await page.locator('#nextApartments').waitFor();assert.equal(new URL(page.url()).searchParams.get('variant'),'terminal');
  await start(page,'&variant=terminal&city=london&need=application&moveIn='+arrival+'&moveOut='+departure+'&budget=3000&currency=GBP&people=couple');
  await page.locator('#europeServicePass .europe-service-price strong').waitFor();await page.locator('#europeDeskContinue').click();await page.waitForURL(url=>url.pathname==='/london');
  const desk=new URL(page.url());for(const key of ['variant','experience','privatePlace','lat','lng','place'])assert.equal(desk.searchParams.has(key),false,'the original London desk excludes '+key);
  for(const [key,value] of Object.entries({city:'london',need:'application',moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'couple'}))assert.equal(desk.searchParams.get(key),value,'the original desk retains the real '+key);
 });
 await check('Terminal Studio: both variants carry the live draft, reject invalid dates and resize without a second preview',1440,async({page})=>{
  await page.goto(origin+'/flight-studio?experience=panorama',{waitUntil:'domcontentloaded'});
  const handle=await page.locator('#studioFrame').elementHandle(),frame=await handle.contentFrame();
  await frame.waitForFunction(()=>document.body.dataset.experience==='panorama'&&!!window.BoomFlightEurope);
  await fillRome(frame);
  await page.locator('button[data-studio-experience="terminal"]').click();
  await frame.waitForFunction(()=>document.body.dataset.homeVariant==='terminal'&&!!window.BoomFlightEurope);
  assert.equal(await page.locator('button[data-studio-experience="terminal"]').getAttribute('aria-pressed'),'true');
  const terminal=new URL(frame.url());assert.equal(terminal.searchParams.get('experience'),'panorama');assert.equal(terminal.searchParams.get('variant'),'terminal');previewIntent(terminal);
  const open=new URL(await page.locator('#studioOpen').getAttribute('href'),origin);open.searchParams.sort();terminal.searchParams.sort();assert.equal(open.href,terminal.href,'opening separately uses the exact selected variant and draft');
  await frame.evaluate(()=>{window.__terminalStudioIdentity='same document';});
  for(const device of ['mobile','desktop']){
   await page.locator('button[data-studio-device="'+device+'"]').click();await frame.waitForFunction(width=>innerWidth===width,device==='mobile'?390:1280);
   assert.equal(await frame.evaluate(()=>window.__terminalStudioIdentity),'same document','device changes resize rather than reload Terminal');
  }
  for(const width of [320,390,900,1440]){await page.setViewportSize({width,height:900});await geometry(page,['#studioOpen','button[data-studio-experience="panorama"]','button[data-studio-experience="terminal"]','button[data-studio-device]']);}
  await frame.locator('#nextMoveOut').fill(year+'-01-01');
  await page.locator('button[data-studio-experience="panorama"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>window.__terminalStudioIdentity),'same document','an invalid Terminal draft is not discarded');
  assert.equal(await page.locator('button[data-studio-experience="terminal"]').getAttribute('aria-pressed'),'true');
  await frame.locator('#nextMoveOut').fill(departure);await frame.locator('#nextBudget').selectOption('2000');
  await page.locator('button[data-studio-experience="panorama"]').click();await frame.waitForFunction(()=>document.body.dataset.homeVariant==='panorama'&&!!window.BoomFlightEurope);
  assert.equal(new URL(frame.url()).searchParams.has('variant'),false,'Panorama is the canonical default, with no Terminal flag');previewIntent(new URL(frame.url()),{budget:'2000'});
  await frame.evaluate(()=>{window.__terminalStudioIdentity='Panorama draft';});
  await frame.locator('#nextMoveOut').fill(year+'-01-01');await page.locator('button[data-studio-experience="terminal"]').click();await page.locator('#studioError').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>window.__terminalStudioIdentity),'Panorama draft','an invalid Panorama draft cannot be lost by switching to Terminal');
  await frame.locator('#nextMoveOut').fill(departure);await page.locator('button[data-studio-experience="terminal"]').click();await frame.waitForFunction(()=>document.body.dataset.homeVariant==='terminal'&&!!window.BoomFlightEurope);
  assert.equal(await page.locator('iframe').count(),1,'comparing two designs still has one live preview');previewIntent(new URL(frame.url()),{budget:'2000'});
  assert.equal(await page.locator('#studioLive').getAttribute('href'),'https://www.boomrome.com/');
 });
 for(const width of [320,390,1440])await check(width+': Home → Apartments → Detail keeps the move and reaches the original Apply',width,async({page})=>{
  await start(page);await geometry(page,['[data-panorama-expand]','.edition-plan-link','#nextSearchForm button[type="submit"]']);
  await romeTickets(page);
  if(width===1440)await nativeCatalogue(page);
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
  await romeTickets(page);
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
 await check('City signatures and aviation tickets follow all six destinations and each real desk offer',390,async({page})=>{
  const manifest=JSON.parse(readFileSync(root+'assets/boom-desks-public.json','utf8'));
  const cities={rome:'Rome',london:'London',amsterdam:'Amsterdam',madrid:'Madrid',barcelona:'Barcelona',milan:'Milan'};
  const landmarks={rome:'The Colosseum',london:'Tower Bridge',amsterdam:'The canal houses',madrid:'Puerta de Alcalá',barcelona:'Sagrada Família',milan:'The Duomo'};
  const plans={search:'full-search',application:'application-pack',viewing:'attended-viewing'},art=new Set(),captions=new Set();
  await start(page);await fillRome(page);
  for(const slug of [...Object.keys(cities),'rome']){
   await page.locator('.europe-city-switch [data-europe-city="'+slug+'"]').click();
   await page.waitForFunction(city=>document.body.dataset.europeCity===city,slug);
   const signature=page.locator('#europeCitySignature');
   assert.equal(await signature.count(),1,'changing city does not duplicate its signature');
   assert.equal(await signature.isVisible(),true,'the selected city signature is visible');
   assert.equal(await signature.evaluate(node=>document.getElementById('boomGlobeMount').contains(node)),true,'the city detail belongs to the globe');
   const reference=await signature.locator('svg.europe-city-icon use').getAttribute('href'),caption=(await signature.innerText()).trim();
   assert.equal(reference,'/assets/boom-city-icons.svg#city-'+slug,'the illustration follows the selected city');
   assert.ok(caption.includes(landmarks[slug]),'the landmark caption matches its city illustration: '+caption);art.add(reference);captions.add(caption);
   assert.equal(await page.locator('.panorama-route-city').innerText(),cities[slug],'the adjacent route names the selected city');
   assert.equal((await page.locator('#nextDestinationBoard').getAttribute('aria-label')).toLowerCase(),slug,'the original Solari agrees with the city detail');
   const fit=await signature.evaluate(node=>{const r=node.getBoundingClientRect(),g=document.getElementById('boomGlobeMount').getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=g.left&&r.right<=g.right+1;});
   assert.equal(fit,true,'the city signature stays inside the mobile globe');await geometry(page);
   if(slug==='rome'){
    await romeTickets(page);
    continue;
   }
   const currency=slug==='london'?'GBP':'EUR',symbol=currency==='GBP'?'£':'€';
   for(const [need,planId] of Object.entries(plans)){
    await page.locator('[data-europe-need="'+need+'"]').click();
    await page.mouse.move(0,0);
    await page.locator('#europeServicePass .europe-service-price strong').waitFor();
    const plan=manifest.cities[slug].pricing.plans.find(item=>item.id===planId);
    assert.ok(plan,'the selected city publishes the requested offer');
    const expected=new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:0}).format(plan.price);
    assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),expected,'the selected ticket shows the published '+currency+' fare');
    assert.equal(await page.locator('#europeServicePass .europe-service-price small').innerText(),plan.condition,'fee basis and VAT condition remain visible');
    assert.deepEqual(await page.locator('#europeServicePass .europe-service-includes li').allTextContents(),plan.includes,'aviation styling preserves every included service');
    const choice=page.locator('[data-europe-need="'+need+'"]');
    assert.equal(await choice.getAttribute('aria-pressed'),'true','the chosen need is visibly selected');
    assert.equal(await choice.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 215, 0)','the selected support uses BOOM yellow');
    assert.ok((await choice.locator('.europe-need-price').innerText()).startsWith(expected),'the choice and detailed ticket agree on price');
    await primaryContrast(page,'[data-europe-need="'+need+'"] strong');
    await primaryContrast(page,'[data-europe-need="'+need+'"] .europe-need-price');
    assert.ok((await page.locator('#europeDeskContinue').innerText()).includes(plan.label),'the continuation names the selected paid service');
    const actions=await page.locator('#europeServicePass [data-europe-desk-link]').evaluateAll(nodes=>nodes.map(node=>node.href));
    assert.ok(actions.length,'the ticket retains a route to the original city desk');
    for(const href of actions){
     const action=new URL(href);
     assert.equal(action.pathname,'/'+slug);assert.equal(action.searchParams.get('need'),need);assert.equal(action.searchParams.get('from'),'flight');
     assert.equal(action.searchParams.get('moveIn'),arrival);assert.equal(action.searchParams.get('moveOut'),departure);assert.equal(action.searchParams.get('people'),'couple');
     assert.equal(action.searchParams.has('experience'),false,'visual presentation does not enter the original service handoff');
    }
    const bottom=await page.locator('#europeServicePass .europe-service-bottom').innerText();
    assert.equal(bottom.includes(manifest.refund.rule),need==='search','the Full Search refund rule stays with that offer only');
    const otherSymbol=symbol==='£'?'€':'£';
    assert.equal((await page.locator('#europeServicePass .europe-service-price').innerText()).includes(otherSymbol),false,'the ticket never keeps the previous city currency');
    await geometry(page,['#europeDeskContinue']);
   }
  }
  assert.equal(art.size,6,'each city has a distinct illustration');assert.equal(captions.size,6,'each city has its own caption');
 });
 await check('Rome service tickets reach the original forms, retain the supported public brief and remain distinct from foreign desk offers',390,async({page})=>{
  await start(page,'&privatePlace=synthetic-private-office&lat=41.9123&lng=12.5123');await fillRome(page);
  await romeTickets(page);
  const requested={moveIn:arrival,moveOut:departure,budget:'1500',people:'couple',place:'luiss'};
  const homeURL=page.url();
  assert.equal(new URL(homeURL).searchParams.has('moveIn'),false,'editing the planner does not commit a home search');
  for(const invalid of [false,true]){
   await page.locator('#nextMoveIn').fill(invalid?arrival:'');await page.locator('#nextMoveOut').fill(invalid?year+'-01-01':'');
   for(const service of romeServices){
    const href=new URL(await romeTicket(page,service.path).getAttribute('href'),origin);
    for(const key of ['moveIn','moveOut','stay'])assert.equal(href.searchParams.has(key),false,(invalid?'invalid':'cleared')+' draft dates never leak into '+service.name);
    for(const [key,value] of Object.entries({budget:'1500',people:'couple',place:'luiss'}))assert.equal(href.searchParams.get(key),value,'date editing preserves the public '+key);
   }
   assert.equal(page.url(),homeURL,'reading a service brief does not write history or commit filters');
   assert.equal(await page.locator('#nextHome').isVisible(),true,'editing the service brief stays on Home');
   assert.equal(await page.locator('#nextApartments').isVisible(),false,'service links do not submit the home search');
  }
  await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);
  const nativeHref=new URL(await romeTicket(page,'/property-finding').getAttribute('href'),origin).href;
  const opened=page.context().waitForEvent('page');await romeTicket(page,'/property-finding').click({button:'middle'});
  const separate=await opened;
  try{
   await separate.waitForURL(url=>url.pathname==='/property-finding');await separate.waitForFunction(()=>!!window.BoomJourneyHandoff);
   assert.equal(separate.url(),nativeHref,'opening the native ticket in a new tab carries the current public draft');
   assert.equal(await separate.locator('#ckBudget').inputValue(),'1500');
   assert.equal(page.url(),homeURL,'opening another tab leaves the home and its draft in place');
  }finally{await separate.close();}
  for(const service of romeServices){
   const ticket=romeTicket(page,service.path),href=new URL(await ticket.getAttribute('href'),origin);
   assert.equal(href.origin,origin,'the ticket stays on the current BOOM deployment');
   assert.equal(href.pathname,service.path,'the complete card has its canonical native href');
   assert.equal(await ticket.evaluate(node=>node.tagName),'A');
   const visibleDraft=await page.locator('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.id,node.value])));
   for(const [key,value] of Object.entries(requested))assert.equal(href.searchParams.get(key),value,service.name+' link carries the public '+key+'; current planner '+JSON.stringify(visibleDraft));
   for(const key of ['experience','edition','direction','privatePlace','lat','lng','currency','city'])assert.equal(href.searchParams.has(key),false,'the Rome service URL excludes '+key);
   await ticket.click();await page.waitForURL(url=>url.pathname===service.path);
   assert.equal(page.url(),href.href,'the native ticket opens the existing service page without an intermediate funnel');
   if(service.path==='/property-finding'){
    await page.waitForFunction(()=>!!window.BoomJourneyHandoff);
    assert.equal(await page.locator('#ckForm').count(),1,'the existing PFS check-in is the only form');
    assert.equal(await page.locator('#ckBudget').inputValue(),'1500');assert.equal(await page.locator('#ckQuando').inputValue(),year+'-01');
    const notes=await page.locator('#ckNote').inputValue();
    assert.ok(notes.includes(arrival)&&notes.includes(departure)&&notes.includes('Luiss · Viale Romania'),'the original editable PFS notes preserve exact dates and public destination');
    assert.ok((await page.locator('#ckVai').innerText()).includes(euro(service.price)),'the original PFS submission still displays its server fee');
    assert.equal(await page.locator('#ckNome').inputValue(),'','opening the ticket never creates personal details');
   }else{
    await page.locator('button[onclick="openSheet(\'hero\')"]').click();
    await page.locator('#ov.on').waitFor({state:'visible'});
    assert.equal(await page.locator('#ov').count(),1,'the original service checkout sheet is reused');
    assert.ok((await page.locator('#sGo').innerText()).includes(euro(service.price)),'the original service action keeps the actual fee');
    assert.equal(await page.locator('#sName').inputValue(),'','the sheet requires the customer to provide their own details');
    if(service.brief){
     const notes=await page.locator('#sJourneyNotes').inputValue();
     assert.ok(notes.includes(arrival)&&notes.includes(departure)&&notes.includes('Luiss · Viale Romania'),'the original Deal Assistance notes preserve the supported public brief');
     assert.equal(await page.locator('#sJourneyNotes').isVisible(),true,'the customer can review the carried brief before checkout');
    }
    await page.keyboard.press('Escape');await page.locator('#ov').waitFor({state:'hidden'});
   }
   // No submit action is taken. The route guard also fails this scenario on
   // any automatic lead, payment, analytics or other write attempted here.
   await page.goBack();await page.waitForFunction(()=>document.body.dataset.experience==='panorama'&&document.body.dataset.europeCity==='rome');
   await romeTicket(page,service.path).waitFor();
  }
  await page.locator('#services .service-foot a[href="/services"]').click();await page.waitForURL(url=>url.pathname==='/services');
  assert.equal(await page.locator('#tenants .svc').count(),8,'All services opens the real complete tenant catalogue');
  for(const label of ['Remote Move Pack','Deposit Recovery','Free Contract Check'])assert.equal(await page.getByRole('heading',{name:label,exact:true}).isVisible(),true,'the complete catalogue retains '+label);
  await page.goBack();await page.waitForFunction(()=>document.body.dataset.experience==='panorama');
  await page.locator('.europe-city-switch [data-europe-city="london"]').click();
  await page.waitForFunction(()=>document.body.dataset.europeCity==='london');
  for(const service of romeServices)assert.equal(await romeTicket(page,service.path).isVisible(),false,'London never presents a Rome ticket as a local offer');
  await page.locator('#europeServicePass .europe-service-price strong').waitFor();
  const manifest=JSON.parse(readFileSync(root+'assets/boom-desks-public.json','utf8')),search=manifest.cities.london.pricing.plans.find(plan=>plan.id==='full-search');
  assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(search.price),'London keeps its own GBP service family');
  await page.locator('.europe-city-switch [data-europe-city="rome"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='rome');
  await romeTickets(page);
  assert.equal((await page.locator('#services .panorama-ticketing').innerText()).includes('£'),false,'returning to Rome cannot retain a desk currency');
  assert.equal(await page.locator('#europeDeskStory').isVisible(),false,'foreign service choices leave the Rome home');
  assert.equal(await page.locator('#nextMoveIn').inputValue(),arrival);assert.equal(await page.locator('#nextMoveOut').inputValue(),departure);
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
 await check('Ambient camera: the real globe moves gently, yields to hover and keyboard, and zoom never changes the journey',1440,async({page})=>{
  await start(page);await releaseGlobe(page);
  await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  const before=await cameraSnapshot(page);await page.waitForTimeout(700);const moving=await cameraSnapshot(page);
  assert.equal(moving.camera.ambient,true,'continuous camera motion is an explicit Panorama option');
  assert.notDeepEqual(moving.camera.angle,before.camera.angle,'the actual geographic camera continues moving at rest');
  assert.notEqual(moving.fingerprint,before.fingerprint,'ambient motion is painted into the real geographic canvas');
  assert.ok(moving.camera.frames>before.camera.frames,'visible ambient motion draws frames');
  assert.ok(moving.camera.frames-before.camera.frames<=24,'ambient painting remains capped below display refresh rate');
  for(const key of ['url','history','draft'])assert.deepEqual(moving[key],before[key],'ambient camera leaves '+key+' alone');
  const box=await page.locator('.boom-flight-globe-canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.7);
  await page.waitForFunction(()=>!BoomFlightGlobe.state().ambientActive&&!BoomFlightGlobe.state().rafPending);await stableFrames(page);
  const hoverAngle=await page.evaluate(()=>BoomFlightGlobe.state().angle);await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(()=>BoomFlightGlobe.state().angle),hoverAngle,'the globe stops beneath the pointer');
  await page.mouse.move(0,0);await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  await page.getByRole('button',{name:'Reset globe to selected city'}).focus();await page.keyboard.press('Tab');
  await page.waitForFunction(()=>!BoomFlightGlobe.state().ambientActive&&!BoomFlightGlobe.state().rafPending);await stableFrames(page);
  const zoomIn=page.getByRole('button',{name:'Zoom in',exact:true}),zoomOut=page.getByRole('button',{name:'Zoom out',exact:true});
  assert.equal(await zoomOut.isEnabled(),false,'the minimum camera distance is clearly disabled');
  await zoomIn.press('Enter');
  const zoomed=await page.evaluate(()=>BoomFlightGlobe.state());
  assert.ok(zoomed.zoom>1,'keyboard zoom changes the visible camera immediately');
  assert.equal(zoomed.zoom,zoomed.zoomTarget,'keyboard zoom has no waiting animation');
  assert.equal(await zoomOut.isEnabled(),true,'zooming in enables the return control');
  await zoomIn.click();await page.waitForFunction(()=>BoomFlightGlobe.state().zoom===BoomFlightGlobe.state().zoomTarget);
  assert.equal(await zoomIn.isEnabled(),false,'the maximum camera distance is clearly disabled');
  await zoomOut.click();await page.waitForFunction(()=>BoomFlightGlobe.state().zoom===BoomFlightGlobe.state().zoomTarget);
  await page.getByRole('button',{name:'Reset globe to selected city'}).press('Enter');
  await page.waitForFunction(()=>BoomFlightGlobe.state().zoom===1&&!BoomFlightGlobe.state().rafPending);
  const reset=await cameraSnapshot(page);
  for(const key of ['url','history','draft'])assert.deepEqual(reset[key],before[key],'zoom and reset leave '+key+' alone');
  await oneGlobe(page);await geometry(page,['[data-panorama-zoom]','#nextMotionToggle']);
 },'no-preference');
 await check('Ambient lifecycle: pause, reduced motion, offscreen, hidden and data saving stop work without disabling cities',1440,async({page})=>{
  await start(page);await releaseGlobe(page);await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  assert.equal(await page.locator('#boomGlobeMount #nextMotionToggle').count(),1,'the original pause is beside the globe, not duplicated');
  await page.locator('#nextMotionToggle').click();await page.waitForFunction(()=>BoomFlightGlobe.state().paused);await stableFrames(page);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().ambientPending),false,'pause clears any idle restart');
  await page.locator('#nextMotionToggle').click();await releaseGlobe(page);await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>BoomFlightGlobe.state().reducedMotion);await stableFrames(page);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().ambientPending),false,'reduced motion clears any idle restart');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  await page.locator('#services').scrollIntoViewIfNeeded();await page.waitForFunction(()=>!BoomFlightGlobe.state().visible);await stableFrames(page);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().ambientPending),false,'offscreen camera has no pending restart');
  await releaseGlobe(page);await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  // Headless Chromium has no OS tab visibility. Supply that platform boundary
  // and dispatch its native event; the real controller and frame loop run.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await stableFrames(page);assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().ambientPending),false,'hidden camera has no pending restart');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>BoomFlightGlobe.state().ambientActive);
  // NetworkInformation is another environment preference, not application state.
  await page.addInitScript(()=>{const connection=new EventTarget();Object.defineProperty(connection,'saveData',{get:()=>true});Object.defineProperty(navigator,'connection',{configurable:true,get:()=>connection});});
  await start(page);await releaseGlobe(page);await page.waitForFunction(()=>BoomFlightGlobe.state().saveData&&!BoomFlightGlobe.state().rafPending);await stableFrames(page);
  assert.equal(await page.evaluate(()=>BoomFlightGlobe.state().ambientActive),false,'data saving suppresses ambient painting');
  await page.locator('.europe-city-switch [data-europe-city="madrid"]').press('Enter');
  await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid'&&BoomFlightGlobe.state().city==='madrid'&&!BoomFlightGlobe.state().rafPending);
  await stableFrames(page);assert.equal((await page.locator('#nextDestinationBoard').getAttribute('aria-label')).toLowerCase(),'madrid','the quieter mode preserves the real city and Solari control');
  await oneGlobe(page);
 },'no-preference');
 await check('Idle invitation: one quiet hint appears without taking focus, moving the page or repeating after exploration',1440,async({page})=>{
  await start(page);await page.locator('#boomGlobeMount').scrollIntoViewIfNeeded();await page.mouse.move(0,0);
  const hint=page.locator('.panorama-globe-hint');
  assert.equal(await hint.getAttribute('aria-hidden'),'true','redundant visual guidance is not an unsolicited screen-reader announcement');
  await page.locator('#nextMotionToggle').click();
  await page.waitForTimeout(3400);assert.equal(await hint.getAttribute('data-visible'),'false','idle guidance does not appear while motion is paused');
  await page.locator('#nextMotionToggle').click();
  // Clicking the empty page margin ends interaction without choosing a city.
  await page.mouse.click(8,160);await page.mouse.move(0,0);
  const before=await page.evaluate(()=>({url:location.href,scroll:scrollY,focus:document.activeElement.tagName}));
  await page.waitForFunction(()=>document.querySelector('.panorama-globe-hint').dataset.visible==='true');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.panorama-globe-hint')).opacity)>.99);
  assert.equal(await hint.innerText(),'Drag to rotate. Choose a city to continue.');
  assert.deepEqual(await page.evaluate(()=>({url:location.href,scroll:scrollY,focus:document.activeElement.tagName})),before,'the idle detail never redirects, scrolls or takes keyboard focus');
  await page.keyboard.press('Escape');assert.equal(await hint.getAttribute('data-visible'),'false','keyboard activity immediately dismisses the invitation');
  await page.locator('.europe-city-switch [data-europe-city="madrid"]').click();await page.waitForFunction(()=>document.body.dataset.europeCity==='madrid');
  await page.locator('#boomGlobeMount').scrollIntoViewIfNeeded();await page.mouse.click(8,160);await page.mouse.move(0,0);
  await page.waitForTimeout(3500);assert.equal(await hint.getAttribute('data-visible'),'false','a city change cannot restart an already-seen invitation');
  await oneGlobe(page);await geometry(page,['[data-panorama-zoom]','#nextMotionToggle']);
 },'no-preference');
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
 await check('Service motion: pointer feedback is finite; rapid, keyboard, pause and reduced-motion choices preserve the real offer',1440,async({page})=>{
  const manifest=JSON.parse(readFileSync(root+'assets/boom-desks-public.json','utf8'));
  const plans={search:'full-search',application:'application-pack',viewing:'attended-viewing'};
  await start(page,'&city=london&need=search');
  await page.locator('#europeServicePass .europe-service-price strong').waitFor();
  const choices=page.locator('#europeDeskStory [data-europe-need]');
  await choices.first().scrollIntoViewIfNeeded();
  // Observe real browser animations and painted states, without replacing
  // animate(), adding application globals or reproducing its event handler.
  async function observe(){return page.locator('#europeServicePass').evaluateHandle(node=>{
   const trace={seen:new Map(),maxConcurrent:0,painted:false,frame:0};
   trace.sample=()=>{
    const active=node.getAnimations().filter(animation=>animation.effect?.target===node&&animation.playState!=='finished'&&animation.playState!=='idle');
    trace.maxConcurrent=Math.max(trace.maxConcurrent,active.length);
    for(const animation of active)if(!trace.seen.has(animation))trace.seen.set(animation,animation.effect.getComputedTiming().endTime);
    const style=getComputedStyle(node);
    if(active.length&&Number(style.opacity)<.99&&style.transform!=='none')trace.painted=true;
   };
   function frame(){trace.sample();trace.frame=requestAnimationFrame(frame);}
   frame();return trace;
  });}
  async function pointer(need,trace){
   await page.locator('[data-europe-need="'+need+'"]').click();
   await trace.evaluate(value=>value.sample());
  }
  async function begun(trace){await page.waitForFunction(value=>[...value.seen.keys()].some(animation=>animation.playState==='running'),trace);}
  async function finish(trace){
   const result=await trace.evaluate(async value=>{
    await new Promise(resolve=>setTimeout(resolve,350));
    value.sample();cancelAnimationFrame(value.frame);
    const node=document.getElementById('europeServicePass'),style=getComputedStyle(node);
    return {motions:[...value.seen].map(([animation,end])=>({state:animation.playState,end})),maxConcurrent:value.maxConcurrent,painted:value.painted,
     active:node.getAnimations().filter(animation=>animation.playState!=='finished'&&animation.playState!=='idle').length,opacity:Number(style.opacity),transform:style.transform};
   });
   await trace.dispose();
   assert.equal(result.active,0,'service feedback settles without an animation loop');
   assert.equal(result.opacity,1,'the complete service returns to full readability');
   assert.equal(result.transform,'none','the service returns to its normal layout');
   assert.ok(result.motions.every(motion=>Number.isFinite(motion.end)&&motion.end>0&&motion.end<=400),'each observed state transition is short and finite');
   assert.ok(result.maxConcurrent<=1,'rapid input never stacks service transitions');
   return result;
  }
  async function offer(need){
   const plan=manifest.cities.london.pricing.plans.find(item=>item.id===plans[need]);
   const expected=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(plan.price);
   assert.equal(await choices.count(),3,'the original three service choices remain available');
   assert.deepEqual(await choices.evaluateAll(nodes=>nodes.filter(node=>node.getAttribute('aria-pressed')==='true').map(node=>node.dataset.europeNeed)),[need],'only the final requested service is selected');
   assert.equal(await page.locator('#europeServicePass .europe-service-price strong').innerText(),expected,'animation never changes the published GBP fee');
   assert.equal(await page.locator('#europeServicePass .europe-service-price small').innerText(),plan.condition,'the actual fee condition stays with the offer');
   assert.deepEqual(await page.locator('#europeServicePass .europe-service-includes li').allTextContents(),plan.includes,'the final offer keeps its real scope');
   assert.equal(new URL(page.url()).searchParams.get('need'),need,'the canonical route agrees with the visible choice');
   assert.equal(await page.locator('[data-europe-need="'+need+'"]').evaluate(node=>node===document.activeElement),true,'service rendering preserves focus on the chosen control');
  }
  let trace=await observe();await pointer('application',trace);let result=await finish(trace);
  assert.equal(result.motions.length,1,'a changed pointer choice produces actual browser motion');
  assert.equal(result.painted,true,'the finite animation actually changes the rendered service');await offer('application');
  trace=await observe();await pointer('application',trace);result=await finish(trace);
  assert.equal(result.motions.length,0,'choosing the selected service does not replay feedback');

  const rapidPoints=await Promise.all(['viewing','search'].map(need=>page.locator('[data-europe-need="'+need+'"]').boundingBox()));
  trace=await observe();
  for(const [index,box] of rapidPoints.entries()){
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await trace.evaluate(value=>value.sample());
   if(index===0)await begun(trace);
  }
  result=await finish(trace);
  assert.equal(result.motions.length,2,'two rapid changes each receive their own feedback');
  assert.equal(result.motions[0].state,'idle','the superseded animation is cancelled');
  assert.equal(result.motions[1].state,'finished','the latest choice completes normally');await offer('search');

  trace=await observe();await page.locator('[data-europe-need="application"]').focus();await page.keyboard.press('Enter');result=await finish(trace);
  assert.equal(result.motions.length,0,'keyboard activation commits without animation');await offer('application');
  trace=await observe();await pointer('viewing',trace);await begun(trace);await page.keyboard.press('Escape');result=await finish(trace);
  assert.equal(result.motions.length,1,'pointer feedback started before keyboard input');
  assert.equal(result.motions[0].state,'idle','keyboard input cancels motion already in progress');await offer('viewing');

  trace=await observe();await pointer('search',trace);await begun(trace);
  // Click the original control directly to isolate its pause behavior from
  // keyboard cancellation or the time needed to scroll back to the hero.
  await page.locator('#nextMotionToggle').evaluate(node=>node.click());result=await finish(trace);
  assert.equal(await page.locator('#nextMotionToggle').getAttribute('aria-pressed'),'true');
  assert.equal(result.motions.length,1);assert.equal(result.motions[0].state,'idle','pause cancels in-progress service motion');await offer('search');
  trace=await observe();await pointer('application',trace);result=await finish(trace);
  assert.equal(result.motions.length,0,'paused choices stay immediate');await offer('application');

  await page.locator('#nextMotionToggle').evaluate(node=>node.click());
  trace=await observe();await pointer('viewing',trace);await begun(trace);await page.emulateMedia({reducedMotion:'reduce'});result=await finish(trace);
  assert.equal(result.motions.length,1);assert.equal(result.motions[0].state,'idle','enabling reduced motion cancels an active transition');await offer('viewing');
  trace=await observe();await pointer('search',trace);result=await finish(trace);
  assert.equal(result.motions.length,0,'reduced-motion choices remain fully functional without movement');await offer('search');
 },'no-preference');
 await check('Studio: one preview retains the public London draft; invalid dates block switching and device changes never reload',1440,async({page})=>{
  const config=JSON.parse(readFileSync(root+'vercel.json','utf8')),aliases=config.redirects.filter(rule=>rule.source==='/home-panorama');
  assert.equal(aliases.length,1,'the alternate home has one explicit deployment redirect');
  assert.equal(aliases[0].destination,'/flight-next?direction=club&edition=club&experience=panorama','the alternate home selects the actual Panorama route');
  assert.equal(aliases[0].permanent,false,'the alternate home alias remains reversible');
  assert.equal(config.redirects.some(rule=>rule.source==='/'&&rule.destination.includes('panorama')),false,'the second home does not replace the production homepage');
  const query=new URLSearchParams({experience:'panorama',city:'london',moveIn:arrival,moveOut:departure,budget:'3000',currency:'GBP',people:'couple',need:'application',privatePlace:'synthetic-office',lat:'41.9123',lng:'12.5123'});
  await page.goto(origin+'/flight-studio?'+query,{waitUntil:'domcontentloaded'});
  const live=page.locator('#studioLive');
  async function productionLink(){
   assert.equal(await live.getAttribute('href'),'https://www.boomrome.com/','Home attuale points to the exact live homepage without carrying a preview draft');
   assert.equal(await live.getAttribute('target'),'_blank','the live home opens separately from the comparison');
   assert.ok((await live.getAttribute('rel')).split(/\s+/).includes('noopener'),'the live-home tab cannot control the comparison');
  }
  await productionLink();
  for(const width of [320,390,900,1440]){await page.setViewportSize({width,height:900});await geometry(page,['#studioLive','#studioOpen','button[data-studio-experience]','button[data-studio-device]']);}
  assert.equal(await page.locator('iframe').count(),1,'the comparison owns exactly one iframe');
  const handle=await page.locator('#studioFrame').elementHandle(),frame=await handle.contentFrame();
  await frame.waitForFunction(()=>document.body.dataset.experience==='panorama'&&document.body.dataset.europeCity==='london'&&!!window.BoomFlightEurope);
  assert.equal(await page.locator('button[data-studio-experience="panorama"]').getAttribute('aria-pressed'),'true','the explicitly requested archived Panorama stays available');
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
  assert.equal(await page.locator('iframe').count(),1);await productionLink();
 });
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
if(focus&&!passed&&!failed){failed++;console.log('  ✗ No scenario matched the requested focus');}
console.log('\n  '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
