import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {loadChromium,launchOptions} from '../_browser.mjs';
const chromium=await loadChromium();
if(!chromium){console.log('SKIP: playwright unavailable; browser interactions are not verified by this run');process.exit(0);}
const root=path.resolve(new URL('../..',import.meta.url).pathname);
let passed=0;function check(label,value){assert.ok(value,label);passed++;console.log('  ✓ '+label);}
const server=http.createServer((req,res)=>{
  let file=new URL(req.url,'http://localhost').pathname;if(!path.extname(file))file+='.html';
  const dest=path.resolve(root,'.'+file);if(!dest.startsWith(root+'/')){res.writeHead(403).end();return;}
  fs.readFile(dest,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(launchOptions());
try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('boom:consent','min:'+Date.now()));
  const page=await context.newPage(),errors=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin+'/moving-budget');
  check('no destination invented',await page.locator('#city').inputValue()==='');
  check('empty summary has no false zero',await page.locator('#cashTotal').textContent()==='—');
  await page.locator('#city').selectOption('amsterdam');
  check('real city code and currency',await page.locator('#destinationCode').textContent()==='AMS'&&(await page.locator('#summaryCurrency').textContent()).startsWith('EUR'));
  check('rendered secondary text meets 4.5:1 in dark and white surfaces',await page.evaluate(()=>{
    const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    return ['.lead','#currencyNote','.instruction','.section-note','#summaryCurrency','#certainty','#budgetState'].every(selector=>{
      const e=document.querySelector(selector);let parent=e,bg;
      while(parent){const c=rgb(getComputedStyle(parent).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}parent=parent.parentElement;}
      const a=lum(rgb(getComputedStyle(e).color)),b=lum(bg||[255,255,255]);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
    });
  }));
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    check('no horizontal overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    check('all three navigation steps visible at '+width,await page.locator('.worksheet-nav a').count()===3&&await page.locator('.worksheet-nav a').last().isVisible());
    check('dock only on mobile '+width,await page.locator('#budgetDock').isVisible()===(width<=740));
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#nextCost').click();
  check('continue focuses the unresolved certainty control',await page.locator('#firstRent-status').evaluate(e=>e===document.activeElement));
  await page.locator('#firstRent-status').selectOption('confirmed');
  check('empty amount is pending without a premature error',await page.locator('#firstRent-error').isHidden());
  await page.locator('#firstRent').fill('1400');
  check('dock and summary agree',await page.locator('#dockTotal').textContent()==='€1,400.00'&&await page.locator('#cashTotal').textContent()==='€1,400.00');
  check('progress is entered lines, not an affordability score',await page.locator('#arrivalCount').textContent()==='1 of 6 entered');
  await page.locator('#deposit-status').selectOption('estimated');await page.locator('#deposit').fill('1,000.25');
  check('invalid amount excluded and named',await page.locator('#deposit').getAttribute('aria-invalid')==='true'&&(await page.locator('#budgetState').textContent()).includes('invalid'));
  await page.locator('#nextCost').click();
  check('recovery focuses the actual invalid input',await page.locator('#deposit').evaluate(e=>e===document.activeElement));
  await page.locator('#deposit').fill('2800');
  check('deposit changes cash but not expenses',await page.locator('#cashTotal').textContent()==='€4,200.00'&&await page.locator('#expenseTotal').textContent()==='€1,400.00');
  await page.locator('#city').selectOption('london');
  check('currency change cannot relabel euro amounts as pounds',await page.locator('#firstRent').inputValue()===''&&await page.locator('#cashTotal').textContent()==='—');
  await page.locator('#city').selectOption('amsterdam');
  check('return restores the same city worksheet',await page.locator('#deposit').inputValue()==='2800'&&await page.locator('#cashTotal').textContent()==='€4,200.00');
  await page.locator('#budgetDock a').click();
  check('review transfers keyboard focus to the summary',await page.locator('#budgetSummary').evaluate(e=>e===document.activeElement));
  check('reduced motion has no control transition',await page.locator('#nextCost').evaluate(e=>getComputedStyle(e).transitionDuration)==='0s');
  await page.emulateMedia({media:'print'});
  check('printing suppresses dock and navigation',await page.locator('#budgetDock').isHidden()&&await page.locator('.worksheet-nav').isHidden());
  check('printing retains values',await page.locator('#cashTotal').isVisible()&&await page.locator('#firstRent').inputValue()==='1400');
  check('no amount submissions or script errors',posts.length===0&&errors.length===0);
  if(process.env.BOOM_MOVING_SCREENSHOTS){
    fs.mkdirSync(process.env.BOOM_MOVING_SCREENSHOTS,{recursive:true});
    await page.emulateMedia({media:'screen'});
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:1000});
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      await page.screenshot({path:path.join(process.env.BOOM_MOVING_SCREENSHOTS,`budget-${width}.png`),fullPage:false});
    }
  }
  await context.close();
  const nojs=await browser.newContext({javaScriptEnabled:false});const plain=await nojs.newPage();
  await plain.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  await plain.goto(origin+'/moving-budget');
  check('no-JS fallback exposes method and desk links',await plain.locator('#method').isVisible()&&await plain.locator('a[href="/amsterdam"]').isVisible());
  check('no-JS state never promises a working calculator',await plain.locator('#city').isDisabled()&&await plain.locator('noscript').isVisible());
  await nojs.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log(`\n${passed} passed, 0 failed`);
