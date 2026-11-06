import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {loadChromium,launchOptions} from '../_browser.mjs';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const chromium=await loadChromium();
if(!chromium){console.log('SKIP: playwright unavailable');process.exit(0);}
let passed=0;
function check(s,v){assert.ok(v,s);passed++;console.log('  ✓ '+s);}
const server=http.createServer((req,res)=>{
  let file=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!path.extname(file))file+='.html';
  const dest=path.resolve(root,'.'+file);
  if(!dest.startsWith(root+'/')){res.writeHead(403).end();return;}
  fs.readFile(dest,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(data);});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(launchOptions());
try{
  for(const [slug,lang] of [['buy-property-europe','en'],['comprare-casa-europa','it']]){
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await ctx.addInitScript(()=>localStorage.setItem('boom:consent','all:'+Date.now()));
    const page=await ctx.newPage();
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/'+slug);
    await page.locator('#buySubmit').waitFor({state:'visible'});
    check(lang+' script enables form',await page.locator('#buySubmit').isEnabled());
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:900});
      check(lang+' no horizontal overflow '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-buy-country="GB"]').click();
    check(lang+' destination selects country without inventing budget',await page.locator('[name=country]').inputValue()==='GB' && await page.locator('[name=purchase_budget]').inputValue()==='');
    await page.locator('[name=name]').fill('Synthetic buyer');await page.locator('[name=email]').fill('buyer@example.test');
    await page.locator('[name=currency]').selectOption('GBP');await page.locator('[name=purchase_budget]').fill('650000');
    await page.locator('[name=privacy]').check();
    const posts=[];let attempt=0;
    await page.route('**/api/leads/web',async route=>{
      posts.push(route.request().postDataJSON());attempt++;
      await new Promise(r=>setTimeout(r,100));
      await route.fulfill({status:attempt===1?503:200,contentType:'application/json',body:JSON.stringify(attempt===1?{ok:false,error:'unavailable'}:{ok:true,id:'web_buy-property-europe_'+posts[0].requestId})});
    });
    await page.locator('#buySubmit').click();
    await page.locator('#formStatus[data-error]').waitFor();
    const conversions=()=>page.evaluate(()=>dataLayer.filter(x=>x[0]==='event'&&x[1]==='generate_lead').length);
    check(lang+' failed request never counts as a conversion',await conversions()===0);
    check(lang+' failed request keeps brief and no false success',await page.locator('[name=purchase_budget]').inputValue()==='650000' && await page.locator('#buySuccess').isHidden());
    await page.locator('#buySubmit').click();
    await page.locator('#buySuccess').waitFor({state:'visible'});
    check(lang+' retry keeps one id and correct semantics',posts.length===2 && posts[0].requestId===posts[1].requestId && posts[1].page_lang===lang && posts[1].currency==='GBP' && posts[1].purpose==='undecided' && posts[1].timeline==='exploring');
    check(lang+' success has actual server reference',await page.locator('#buyReference').textContent()==='web_buy-property-europe_'+posts[0].requestId);
    check(lang+' confirmed request counts exactly once',await conversions()===1);
    await page.evaluate(()=>{localStorage.setItem('boom:consent','min:'+Date.now());document.dispatchEvent(new CustomEvent('boom-consent-denied'));window.boomTrack('generate_lead',{service:'property_buying'});});
    check(lang+' public tracker respects revoked consent',await conversions()===1);
    check(lang+' personal data stays out of URL and browser storage',await page.evaluate(()=>!location.href.includes('buyer') && !JSON.stringify({...localStorage,...sessionStorage}).includes('Synthetic buyer')));
    await page.locator('#buyAgain').click();
    check(lang+' new enquiry resets form',await page.locator('[name=city]').inputValue()==='' && await page.locator('[name=privacy]').isChecked()===false);
    check(lang+' no JavaScript errors',errors.length===0);
    if(process.env.BUYING_SCREENSHOTS){
      fs.mkdirSync(process.env.BUYING_SCREENSHOTS,{recursive:true});
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(process.env.BUYING_SCREENSHOTS,lang+'-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      await page.screenshot({path:path.join(process.env.BUYING_SCREENSHOTS,lang+'-desktop.png'),fullPage:false});
    }
    await ctx.close();
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}), p=await nojs.newPage();
    await p.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await p.goto(origin+'/'+slug);
    check(lang+' no-JS content and fallback remain usable',await p.locator('h1').isVisible() && await p.locator('a[href^="mailto:"]').first().isVisible() && await p.locator('#buySubmit').isDisabled());
    await nojs.close();
  }
  for(const defect of ['attempt_counted','consent_ignored']){
    const ctx=await browser.newContext();
    await ctx.addInitScript(()=>localStorage.setItem('boom:consent','all:'+Date.now()));
    const page=await ctx.newPage();
    await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    if(defect==='attempt_counted') await page.route('**/buy-property-europe',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'buy-property-europe.html'),'utf8').replace(' data-analytics-manual','')}));
    else await page.route('**/js/boom-track.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'js/boom-track.js'),'utf8').replace('if (allowed && hasConsent()) ev','if (true) ev')}));
    await page.goto(origin+'/buy-property-europe');
    await page.waitForFunction(()=>typeof window.boomTrack==='function');
    if(defect==='attempt_counted'){
      await page.locator('[name=country]').selectOption('IT');await page.locator('[name=city]').fill('Rome');
      await page.locator('[name=name]').fill('Synthetic buyer');await page.locator('[name=email]').fill('buyer@example.test');await page.locator('[name=privacy]').check();
      await page.route('**/api/leads/web',r=>r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
      await page.locator('#buySubmit').click();await page.locator('#formStatus[data-error]').waitFor();
    }else await page.evaluate(()=>{localStorage.setItem('boom:consent','min:'+Date.now());document.dispatchEvent(new CustomEvent('boom-consent-denied'));window.boomTrack('generate_lead');});
    check('browser detects restored defect '+defect,await page.evaluate(()=>dataLayer.filter(x=>x[0]==='event'&&x[1]==='generate_lead').length)===1);
    await ctx.close();
  }
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log(`Buying UI: ${passed} passed, 0 failed`);
