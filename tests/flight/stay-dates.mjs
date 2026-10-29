// Real stay engine/runtime and committed form markup; only the surrounding
// availability filter and quote callback are boundaries. No API writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {loadChromium,launchOptions} from '../_browser.mjs';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const form=p=>read(p).match(/<form\b[^>]*id="atterro"[\s\S]*?<\/form>/)[0];
const detail=read('apartment-detail.html');
const input=id=>detail.match(new RegExp('<input\\b[^>]*id="'+id+'"[^>]*>'))[0];
const select=detail.match(/<select id="apMesi"[\s\S]*?<\/select>/)[0];
const household=detail.match(/<select id="apChi"[\s\S]*?<\/select>/)[0];
const scripts='<script defer src="/js/stay-engine.js"></script><script defer src="/assets/boom-flight-stay.js"></script>';
const links='<a id="listing" href="/listing/fixture">Explore home</a><a id="skyline" href="/skyline?guide=1">Skyline</a><a id="rome" href="/your-rome">Your Rome</a>';
function html(path){
 let content=path==='/'?form('index.html'):path==='/apartments'?form('apartments.html')+'<input id="quandoData" type="date"><button id="pulisci">Reset</button>':path.startsWith('/listing/')?
 '<form id="modApplica">'+input('apQuando')+input('apUscita')+select+household+'<p id="apStayError" role="alert" hidden></p><output data-stay-summary></output><button type="submit">Send</button></form><div class="durata-tasti"><button data-m="6">6 months</button><button data-m="12">12 months</button></div><div class="durata-conto">Existing quote</div>':'';
 return '<!doctype html><html><head><meta charset="utf-8">'+scripts+'</head><body>'+content+links+`<script>
 window.__quoteCalls=[]; window.__submitted=0; window.__arrivalChanges=[];
 window.BoomStayQuote={setMonths:function(n){__quoteCalls.push(n);document.dispatchEvent(new CustomEvent('boom:durata',{detail:n}));}};
 document.querySelectorAll('.durata-tasti button').forEach(function(b){b.addEventListener('click',function(){BoomStayQuote.setMonths(+b.dataset.m);});});
 var advance=document.getElementById('quandoData');if(advance)advance.addEventListener('change',function(){__arrivalChanges.push(advance.value);});
 var apply=document.getElementById('modApplica');if(apply)apply.addEventListener('submit',function(e){e.preventDefault();__submitted++;});
 </script></body></html>`;
}
const chromium=await loadChromium();
if(!chromium){console.log('SKIP: playwright unavailable — stay date browser checks did not run');process.exit(0);}
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(['/js/stay-engine.js','/assets/boom-flight-stay.js'].includes(path)){res.setHeader('Content-Type','text/javascript');res.end(read(path.slice(1)));}
 else{res.setHeader('Content-Type','text/html');res.end(html(path));}
});
await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,pass=0,fail=0;
try{
 browser=await chromium.launch(await launchOptions());
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const goto=async path=>{await page.goto(origin+path);await page.waitForTimeout(30);};
 async function check(name,fn){try{errors.length=0;await fn();assert.deepEqual(errors,[]);console.log('  ✓ '+name);pass++;}catch(e){console.log('  ✗ '+name+' — '+e.message);fail++;}}
 const params=()=>new URL(page.url()).searchParams;
 await check('Home → catalogue → Skyline → Apply carries exact dates and the original arrival filter',async()=>{
  await goto('/');await page.locator('.flight-stay-options>summary').click();await page.locator('#durataSoggiorno').selectOption('6');
  await page.locator('#stayMoveIn').fill('2027-01-31');
  assert.equal(await page.locator('#stayMoveOut').inputValue(),'2027-07-31');
  await Promise.all([page.waitForURL('**/apartments?**'),page.locator('#atterro button[type="submit"]').click()]);
  await page.waitForTimeout(30);assert.equal(await page.locator('#quandoData').inputValue(),'2027-01-31');
  await Promise.all([page.waitForURL('**/skyline?**'),page.locator('#skyline').click()]);
  await Promise.all([page.waitForURL('**/listing/fixture?**'),page.locator('#listing').click()]);
  await page.waitForTimeout(30);
  assert.equal(params().get('stay'),'6');assert.equal(params().get('moveOut'),'2027-07-31');
  assert.equal(await page.locator('#apQuando').inputValue(),'2027-01-31');assert.equal(await page.locator('#apUscita').inputValue(),'2027-07-31');
  assert.equal(await page.locator('#apMesi').inputValue(),'6');
 });
 await check('An edited departure stays exact: extra days hide only the full-period quote',async()=>{
  await goto('/listing/fixture?stay=6&moveIn=2027-01-31&moveOut=2027-07-31');
  await page.locator('#apUscita').fill('2027-08-01');
  assert.equal(params().get('stay'),null);assert.equal(params().get('moveOut'),'2027-08-01');
  assert.equal(await page.locator('#apMesi').inputValue(),'dates');assert.equal(await page.locator('.durata-conto').isHidden(),true);
  assert.match(await page.locator('[data-stay-quote-note]').innerText(),/no daily rate/);
  await page.locator('#apUscita').fill('2027-05-31');
  assert.equal(await page.locator('#apMesi').inputValue(),'4');assert.equal(params().get('stay'),'4');
  assert.equal(await page.locator('.durata-conto').isHidden(),false);
  assert.equal(await page.evaluate(()=>__quoteCalls.at(-1)),4);
 });
 await check('A late original quote listener cannot overwrite the requested dates or shortcut',async()=>{
  await goto('/listing/fixture?stay=6&moveIn=2027-01-31&moveOut=2027-07-31');
  await page.evaluate(()=>{
   document.addEventListener('boom:durata',e=>{document.getElementById('apMesi').value=String(e.detail);});
   BoomStayQuote.setMonths(12);
  });
  await page.waitForTimeout(30);assert.equal(await page.locator('#apMesi').inputValue(),'6');assert.equal(params().get('stay'),'6');
  await page.locator('.durata-tasti button[data-m="12"]').click();
  assert.equal(await page.locator('#apUscita').inputValue(),'2028-01-31');assert.equal(params().get('stay'),'12');
 });
 await check('Invalid or incomplete dates block navigation/submission and expose a focusable error',async()=>{
  await goto('/listing/fixture?moveIn=2027-01-31&moveOut=2027-04-30');
  await page.locator('#apUscita').fill('2027-04-29');
  assert.match(await page.locator('#apStayError').innerText(),/3 months/);
  await page.locator('#listing').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'apUscita');
  await page.locator('#apUscita').fill('');
  await page.evaluate(()=>document.getElementById('modApplica').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>__submitted),0);assert.equal(params().get('moveOut'),null);
  assert.match(await page.locator('#apStayError').innerText(),/departure date/);
 });
 await check('Clear removes both dates and the arrival filter; browser history restores a whole request',async()=>{
  await goto('/apartments?stay=6&moveIn=2027-01-31&moveOut=2027-07-31');
  await page.locator('.flight-stay-options>summary').click();
  await page.locator('[data-stay-clear]').click();
  assert.equal(params().has('stay'),false);assert.equal(await page.locator('#stayMoveIn').inputValue(),'');
  assert.equal(await page.locator('#quandoData').inputValue(),'');
  await page.evaluate(()=>{history.pushState({},'','?stay=3&moveIn=2027-01-31&moveOut=2027-04-30');dispatchEvent(new PopStateEvent('popstate'));});
  assert.equal(await page.locator('#stayMoveOut').inputValue(),'2027-04-30');
  assert.equal(await page.locator('#quandoData').inputValue(),'2027-01-31');
  await page.goBack();await page.waitForTimeout(30);assert.equal(await page.locator('#stayMoveOut').inputValue(),'');
 });
 await check('New-tab and Your Rome links inherit dates without altering canonical saved-home keys',async()=>{
  await goto('/apartments?stay=6&moveIn=2027-01-31&moveOut=2027-07-31');
  await page.locator('#rome').focus();assert.match(await page.locator('#rome').getAttribute('href'),/moveOut=2027-07-31/);
  await page.locator('#listing').dispatchEvent('contextmenu');assert.match(await page.locator('#listing').getAttribute('href'),/stay=6&moveIn=2027-01-31&moveOut=2027-07-31/);
 });
 await check('Explicit household links prefill the real Apply select and its submitted form value',async()=>{
  for(const people of ['solo','couple','family','flatmates']){
   await goto('/listing/fixture?people='+people+'&stay=6&moveIn=2027-01-31&moveOut=2027-07-31');
   assert.equal(await page.locator('#apChi').inputValue(),people);
   assert.equal(await page.evaluate(()=>new FormData(document.getElementById('modApplica')).get('chi')),people);
   assert.equal(await page.locator('#apMesi').inputValue(),'6');
  }
 });
 await check('Unknown households and a hash-only value do not invent an Apply selection',async()=>{
  for(const query of ['?people=all','?people=Couple','?people=%3Cscript%3E','?people=','?stay=6#people=couple']){
   await goto('/listing/fixture'+query);
   assert.equal(await page.locator('#apChi').inputValue(),'');
  }
 });
 await check('A user-edited household survives history, date/quote restoration and a persisted lifecycle',async()=>{
  await goto('/listing/fixture?people=couple&stay=6&moveIn=2027-01-31&moveOut=2027-07-31');
  await page.locator('#apChi').selectOption('family');
  await page.evaluate(()=>{
   history.pushState({},'','?people=solo&stay=3&moveIn=2027-01-31&moveOut=2027-04-30');
   dispatchEvent(new PopStateEvent('popstate'));BoomStayQuote.setMonths(12);
   dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#apChi').inputValue(),'family');
  assert.equal(await page.evaluate(()=>new FormData(document.getElementById('modApplica')).get('chi')),'family');
  await page.goBack();await page.waitForTimeout(30);
  assert.equal(await page.locator('#apChi').inputValue(),'family');
  assert.equal(await page.locator('#apUscita').inputValue(),'2027-07-31');
 });
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
console.log(`Stay dates browser: ${pass} passed, ${fail} failed`);if(fail)process.exitCode=1;
