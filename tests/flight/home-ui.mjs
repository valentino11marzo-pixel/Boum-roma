// Real Home composition: native photo rail, exact dates and deliberate journey.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const chromium=await loadChromium();
if(!chromium){console.log('SKIP: Home browser checks require Playwright');process.exit(0);}
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost').pathname;
 let p=root+(u==='/'?'index.html':u.slice(1));
 if(!existsSync(p)&&existsSync(p+'.html'))p+='.html';
 if(!existsSync(p)||u.startsWith('/api/')){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':'text/html');res.end(readFileSync(p));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(launchOptions());
let checks=0;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(origin+'/skyline'))return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Skyline boundary</title>'});
  if(url.startsWith(origin))return route.continue();
  return route.abort();
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#flapDays .fc2');
 const dimensions=await page.evaluate(()=>{let rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width};};return {date:rect('#stayMoveIn'),button:rect('#quandoVai'),map:rect('#skyline'),width:innerWidth,overflow:document.documentElement.scrollWidth};});
 assert.ok(dimensions.date.top<600,JSON.stringify(dimensions));assert.ok(dimensions.button.bottom<dimensions.map.top);assert.ok(dimensions.overflow<=dimensions.width+1);checks++;
 await page.locator('#stayMoveIn').fill('2027-02-01');await page.locator('#stayMoveOut').fill('2027-08-01');
 assert.match(await page.locator('[data-stay-summary]').innerText(),/6 months/);assert.equal(await page.locator('#durataSoggiorno').inputValue(),'6');checks++;
 const rail=page.locator('#flightHomeRail');await rail.scrollIntoViewIfNeeded();
 assert.ok(await rail.evaluate(el=>el.scrollWidth>el.clientWidth));
 await page.getByRole('button',{name:'Next home',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-rail-position]').textContent.startsWith('02'));
 assert.ok(await rail.evaluate(el=>el.scrollLeft>100));checks++;
 await page.locator('#appTab1').click();assert.equal(await page.locator('#appTab1').getAttribute('aria-selected'),'true');
 await page.locator('#appScena1').waitFor({state:'visible'});assert.ok(!(await page.locator('#appScena0').isVisible()));
 await page.locator('#appTab1').press('ArrowRight');assert.equal(await page.locator('#appTab2').getAttribute('aria-selected'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'appTab2');checks++;
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-journey-play]').click();
 assert.equal(await page.locator('#apparecchio').getAttribute('data-playing'),'true');
 await page.locator('#appTab3').click();assert.equal(await page.locator('[data-journey-play]').getAttribute('aria-pressed'),'false');checks++;
 // bfcache lifecycle cannot restart an opted-out carousel or discard dates.
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 assert.equal(await page.locator('#stayMoveOut').inputValue(),'2027-08-01');assert.equal(await page.locator('#appTab3').getAttribute('aria-selected'),'true');checks++;
 await page.setViewportSize({width:1280,height:900});
 const desktop=await page.evaluate(()=>{let a=document.querySelector('.flight-home-command').getBoundingClientRect(),b=document.querySelector('#skyline').getBoundingClientRect();return {left:a.right,right:b.left,hero:document.querySelector('.hero').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth};});
 assert.ok(desktop.left<desktop.right);assert.ok(desktop.hero<900);assert.ok(desktop.overflow<=1281);checks++;
 const ticketSizing=await page.locator('.flight-home-services .compra').evaluateAll(nodes=>nodes.map(n=>({width:n.clientWidth,content:n.scrollWidth})));
 assert.ok(ticketSizing.every(x=>x.content<=x.width+1),JSON.stringify(ticketSizing));checks++;
 const badge=await page.locator('.flight-ground-mark').evaluate(n=>({top:n.getBoundingClientRect().top,details:n.parentElement.querySelector('.dettagli').getBoundingClientRect().bottom}));
 assert.ok(badge.top>=badge.details);checks++;
 assert.deepEqual(errors,[]);checks++;
 console.log(`Home journey UI: ${checks} passed, 0 failed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
