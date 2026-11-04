// Real Club controllers; only public catalogue, image bytes and map rendering
// are fixtures. No customer request, remote navigation or payment can escape.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),chromium=await loadChromium();
console.log('\n▸ flightclubmediaui  One public home, intact photographs, truthful captions and city boundaries');
if(!chromium){console.log('  SKIP: playwright unavailable — media browser checks did not run');process.exit(0);}
// The public ID exercises the curated photograph order; all facts and images
// below are deliberately synthetic, with distinctive values to catch literals.
const featuredId='esFhjFMVfZtkIrhkx0PR',year=new Date().getFullYear()+1;
function fixtures(){return [
 {id:featuredId,name:'Fixture portrait home',price:1737,sqm:73,status:'available',availableDate:year+'-09-01',images:Array.from({length:10},(_,i)=>'/media-fixture-'+i+'.svg')},
 {id:'media-alternate',name:'Fixture alternate home',price:919,sqm:29,status:'available',availableDate:'Immediate',images:['/media-alternate.svg']},
 {id:'media-foreign',name:'Not a Rome home',price:990,status:'available',city:'Firenze',images:['/media-foreign.svg']}
].map(home=>({zone:'Prati',type:'Apartment',bedrooms:1,bathrooms:1,lat:41.91,lng:12.47,description:'Synthetic catalogue boundary for the browser test.',...home}));}
const mapHTML='<!doctype html><html><body><script>window.BoomSkyline={state:()=>({catalogueStatus:"ready",mapStatus:"ready",usable:true}),setBudget(){},journeyFor(){return null;},map:{resize(){},stop(){}}};parent.postMessage({t:"boomSkylineReady"},location.origin);</script></body></html>';
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const pathname=new URL(req.url,'http://localhost').pathname;
 let file=root+pathname.slice(1);if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':'text/html');res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,width,fn,{homes=fixtures(),broken='',catalogueFailures=0}={}){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),errors=[],writes=[];
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/listings'){
   if(catalogueFailures-->0)return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,listings:homes})});
  }
  if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:mapHTML});
  if(url.pathname===broken)return route.abort();
  if(url.pathname.startsWith('/media-'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#8b8266"/></svg>'});
  if(url.pathname.startsWith('/listing/'))return route.fulfill({contentType:'text/html',body:'<h1>Original application boundary — no submission</h1>'});
  return route.continue();
 });
 try{
  await page.goto(origin+'/flight-next?direction=club&edition=club&city=rome',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.BoomFlightNext&&!!window.BoomFlightEurope&&!!document.querySelector('#clubMedia'));
  await fn(page,homes);assert.deepEqual(errors,[],'no uncaught browser errors');assert.deepEqual(writes,[],'no application or payment request');passed++;console.log('  ✓ '+name);
 }catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}
 finally{await page.close();}
}
async function ready(page){await page.locator('.club-media-caption:not([hidden])').waitFor();}
async function geometry(page){
 await page.evaluate(()=>document.fonts.ready);
 const bounds=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
 assert.ok(bounds.document<=bounds.viewport+1,'no horizontal overflow: '+JSON.stringify(bounds));
 const controls=await page.locator('[data-media-step]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {w:r.width,h:r.height};}));
 assert.ok(controls.every(r=>r.w>=44&&r.h>=44),'photograph controls remain touch-sized');
}
async function count(page,value){await page.waitForFunction(value=>document.querySelector('.club-media-count').textContent===value,value);}
try{
 browser=await chromium.launch(await launchOptions());
 for(const width of [320,390,1280])await check(width+': catalogue photographs, arrows, keyboard and detail return stay together',width,async(page,homes)=>{
  await ready(page);await geometry(page);
  const source=homes[0],photos=await page.locator('.club-media-rail img').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')));
  assert.deepEqual(photos,[source.images[0],source.images[2],source.images[4],...source.images.filter((_,index)=>![0,2,4].includes(index))],'all media come from the same catalogue home, with the editorial order');
  assert.equal(await page.locator('.club-media-name').innerText(),source.name);
  const facts=await page.locator('.club-media-facts').innerText();assert.ok(facts.includes('1,737')&&facts.includes('73 m²')&&facts.includes(String(year)),'caption uses catalogue price, area and dated availability');assert.ok(!facts.includes('Available now'),'future availability is not marketed as immediate');
  assert.equal(await page.locator('.club-media-name').getAttribute('data-home'),source.id);
  await count(page,'01 / 10');assert.equal(await page.locator('[data-media-step="-1"]').isDisabled(),true);
  await page.locator('[data-media-step="1"]').click();await count(page,'02 / 10');
  await page.locator('.club-media-rail').focus();await page.keyboard.press('ArrowRight');await count(page,'03 / 10');
  await page.keyboard.press('ArrowLeft');await count(page,'02 / 10');
  for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');await count(page,'10 / 10');assert.equal(await page.locator('[data-media-step="1"]').isDisabled(),true);
  await page.locator('.club-media-open').click();await page.locator('#nextDetailTitle').waitFor();assert.equal(await page.locator('#nextDetailTitle').innerText(),source.name);
  assert.deepEqual(await page.locator('#nextPhotoRail img').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src'))),source.images,'detail retains the complete canonical gallery');
  assert.equal(await page.locator('#nextPhotoRail img').first().evaluate(img=>getComputedStyle(img).objectFit),'contain','detail leaves the photograph uncropped');
  await page.goBack();await page.locator('#nextHome').waitFor({state:'visible'});await ready(page);assert.equal(await page.locator('.club-media-name').getAttribute('data-home'),source.id);await geometry(page);
 });
 await check('failed photograph explains the gap and preserves the same home link',390,async page=>{
  await ready(page);await page.locator('.club-media-rail figure').first().locator('figcaption:not([hidden])').waitFor();
  assert.equal(await page.locator('.club-media-rail img').first().isVisible(),false);
  assert.match(await page.locator('.club-media-rail figure').first().innerText(),/Photograph unavailable/);
  assert.equal(await page.locator('.club-media-open').getAttribute('data-home'),featuredId);
  await page.locator('[data-media-step="1"]').click();await count(page,'02 / 10');assert.equal(await page.locator('.club-media-rail img').nth(1).isVisible(),true);
  await page.locator('.club-media-open').click();await page.locator('#nextDetailTitle').waitFor();assert.equal(await page.locator('#nextDetailTitle').innerText(),'Fixture portrait home');
 },{broken:'/media-fixture-0.svg'});
 for(const width of [320,390])await check(width+': Barcelona replaces Rome photographs with the explicitly Rome-based founder',width,async page=>{
  await ready(page);await page.locator('.europe-city-switch [data-europe-city="barcelona"]').click();
  await page.waitForFunction(()=>document.body.dataset.europeCity==='barcelona');
  assert.equal(await page.locator('.club-home-story').isVisible(),false);assert.equal(await page.locator('.club-desk-person').isVisible(),true);
  assert.match(await page.locator('.club-desk-person').innerText(),/Founder of BOOM\s+Based in Rome/);
  assert.match(await page.locator('.club-desk-person>img').getAttribute('alt'),/founder.*Rome/);
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,'desk has no horizontal overflow');
  await page.locator('.europe-city-switch [data-europe-city="rome"]').click();await ready(page);
  assert.equal(await page.locator('.club-home-story').isVisible(),true);assert.equal(await page.locator('.club-desk-person').isVisible(),false);await geometry(page);
 });
 const changed=fixtures();Object.assign(changed[0],{status:'rented',availableDate:null});Object.assign(changed[1],{price:null,sqm:null,availableDate:null});
 await check('closed editorial home yields to an actual alternative; unknown price stays unknown',1280,async page=>{
  await ready(page);assert.equal(await page.locator('.club-media-name').getAttribute('data-home'),'media-alternate');
  assert.equal(await page.locator('.club-media-name').innerText(),'Fixture alternate home');
  const facts=await page.locator('.club-media-facts').innerText();assert.match(facts,/Price on request/);assert.ok(!facts.includes('1,737')&&!facts.includes('73 m²'));
  assert.deepEqual(await page.locator('.club-media-rail img').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src'))),['/media-alternate.svg']);
 },{homes:changed});
 await check('empty catalogue shows an honest message without a stale featured-home link',390,async page=>{
  await page.waitForFunction(()=>document.querySelector('.club-media-empty').textContent.includes('No photographed home'));
  assert.equal(await page.locator('.club-media-caption').isVisible(),false);assert.equal(await page.locator('.club-media-rail img').count(),0);
  assert.equal(await page.locator('[data-media-step="-1"]').isDisabled(),true);assert.equal(await page.locator('[data-media-step="1"]').isDisabled(),true);await geometry(page);
 },{homes:[]});
 await check('unsent dates, budget and people follow the photograph into detail and original Apply',390,async page=>{
  await ready(page);
  await page.locator('#nextMoveIn').fill(year+'-01-31');await page.locator('#nextMoveOut').fill(year+'-07-31');
  await page.locator('#nextBudget').selectOption('2000');await page.locator('#nextPeople').selectOption('couple');
  await page.locator('.club-media-open').click();await page.locator('#nextDetailTitle').waitFor();
  const expected={moveIn:year+'-01-31',moveOut:year+'-07-31',budget:'2000',people:'couple'};
  for(const url of [new URL(page.url()),new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin)])for(const [key,value] of Object.entries(expected))assert.equal(url.searchParams.get(key),value,'the unsubmitted '+key+' survives the media shortcut');
  await page.goBack();await page.locator('#nextHome').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#nextMoveIn,#nextMoveOut,#nextBudget,#nextPeople').evaluateAll(nodes=>nodes.map(node=>node.value)),Object.values(expected),'Back returns to the same arrival plan');
 });
 await check('invalid arrival plan stays on the real form when opening the photographed home',390,async page=>{
  await ready(page);await page.locator('#nextMoveIn').fill(year+'-01-31');await page.locator('#nextMoveOut').fill(year+'-02-28');
  await page.locator('.club-media-open').click();assert.equal(await page.locator('body').getAttribute('data-view'),'home');
  assert.equal(new URL(page.url()).searchParams.has('home'),false,'an invalid stay cannot enter detail');
  assert.ok(await page.evaluate(()=>document.getElementById('nextMoveOut').validationMessage||(!document.getElementById('nextSearchError').hidden&&document.getElementById('nextSearchError').textContent)),'invalid dates are explained by the original validation');
  assert.equal(await page.locator('#nextMoveOut').inputValue(),year+'-02-28','invalid input stays editable');
 });
 await check('catalogue failure has a working retry and never invents a featured home',390,async page=>{
  await page.locator('#clubMedia [data-retry]').waitFor();assert.equal(await page.locator('.club-media-caption').isVisible(),false);
  assert.match(await page.locator('.club-media-empty').innerText(),/could not be loaded/);
  await page.locator('#clubMedia [data-retry]').click();await ready(page);
  assert.equal(await page.locator('.club-media-name').getAttribute('data-home'),featuredId);await count(page,'01 / 10');
 },{catalogueFailures:1});
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('\n  '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
