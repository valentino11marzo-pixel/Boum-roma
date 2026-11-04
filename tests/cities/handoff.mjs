// Public Flight brief into the ORIGINAL city form and checkout controller.
// All writes and external requests terminate at this fixture boundary.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,statSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {loadChromium,launchOptions} from '../_browser.mjs';
const require=createRequire(import.meta.url),J=require('../../js/journey-engine.js'),S=require('../../js/stay-engine.js');
const root=fileURLToPath(new URL('../../',import.meta.url));
const year=new Date().getFullYear()+1,arrival=year+'-02-01',departure=year+'-03-01';
const brief={need:'application',moveIn:arrival,moveOut:departure,budget:1500,currency:'EUR',people:'couple',place:'sapienza',homes:['private-reference'],privatePlace:'poi:0',address:'Private office',lat:41.9,lng:12.4};
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('  ✓ '+name);}catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}}
console.log('\n▸ city handoff  Public plans, actual city, original request and checkout');
await check('desk route vocabulary matches city data; unknown routes and untrusted context are refused',()=>{
  const cities=readdirSync(root+'cities').filter(f=>f.endsWith('.json')&&!f.startsWith('_')).map(f=>f.slice(0,-5));
  for(const city of cities){const path=J.deskURL(city,brief),url=new URL(path,'https://www.boomrome.com');assert.equal(url.pathname,'/'+city);assert.equal(J.deskBrief(url.search,city).city,city);}
  for(const city of ['rome','new-york','../madrid','constructor',{},null])assert.equal(J.deskURL(city,brief),null);
  assert.equal(J.deskBrief('?city=madrid','madrid'),null);assert.equal(J.deskBrief('?from=flight&city=london','madrid'),null);
  assert.equal(J.deskBrief('?from=other&city=madrid','madrid'),null);
});
await check('only public date, need, budget and household survive; no Rome place, private address, ID or duration policy',()=>{
  const url=new URL(J.deskURL('madrid',brief),'https://www.boomrome.com');
  assert.deepEqual([...url.searchParams.keys()].sort(),['budget','city','currency','from','moveIn','moveOut','need','people']);
  assert.doesNotMatch(url.href,/sapienza|private|address|lat=|lng=|homes=|stay=/i);
  const read=J.deskBrief(url.search,'madrid');assert.equal(read.moveOut,departure);assert.equal(read.need,'application');
  assert.equal(J.deskError(read),null);assert.ok(S.validate(read),'Rome minimum is not copied into desk planning');
  assert.equal(J.deskNormalize({...brief,need:'javascript:bad',people:'admin'}).need,null);
  assert.equal(J.deskError({moveIn:departure,moveOut:arrival}).field,'moveOut');
  assert.equal(J.deskError({moveIn:arrival}).field,'moveOut');assert.equal(J.deskError({moveOut:departure}).field,'moveIn');
  assert.equal(J.deskError({moveIn:year+'-02-30',moveOut:departure}).field,'moveIn');assert.equal(J.deskError({}),null);
});
await check('currency changes never reinterpret the same budget; GBP requires explicit confirmation',()=>{
  assert.equal(J.deskNormalize({...brief,city:'london'}).budget,null);
  assert.equal(J.deskNormalize({...brief,city:'london'}).budgetNeedsConfirmation,true);
  assert.equal(new URL(J.deskURL('london',brief),'https://www.boomrome.com').searchParams.has('budget'),false);
  assert.equal(J.deskBrief('?from=flight&city=london&budget=1500','london').budget,null);
  assert.equal(J.deskBrief('?from=flight&city=london&budget=1500&currency=GBP','london').budget,1500);
  assert.equal(J.deskNormalize({...brief,city:'madrid',currency:'GBP'}).budget,null);
  assert.equal(J.deskNormalize({...brief,city:'london',currency:'GBP',budget:0}).budget,0);
});
await check('browser and Node agree; removing the city binding or currency veto is caught by mutation',()=>{
  const src=readFileSync(root+'js/journey-engine.js','utf8');
  function engine(code){const window={BOOM_STAY:S};vm.runInNewContext(code,{window,URL,URLSearchParams,Set});return window.BOOM_JOURNEY;}
  const contract=E=>{assert.equal(E.deskBrief('?from=flight&city=london','madrid'),null);assert.equal(E.deskNormalize({...brief,city:'london'}).budget,null);};
  contract(engine(src));
  for(const [from,to] of [["q.get('city')!==actualCity||",''],['budget:confirmed?amount:null','budget:amount']]){assert.ok(src.includes(from));assert.throws(()=>contract(engine(src.replace(from,to))));}
});
const chromium=await loadChromium();
if(!chromium)console.log('SKIP: playwright unavailable — real city handoff checks did not run');
else{
  const server=createServer((req,res)=>{
    if(req.method!=='GET'){res.writeHead(405);return res.end('No real writes');}
    const pathname=new URL(req.url,'http://localhost').pathname;let file=root+pathname.slice(1);
    if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
    if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
    res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(readFileSync(file));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  async function run(path,fn,{width=390,hold=false,failAsset=false}={}){
    const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),posts=[],errors=[],assets=[];
    let held;
    page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('boom:consent','min:'+Date.now()));
    await page.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(req.method()!=='GET'){
        if(url.origin===origin&&['/api/city-lead','/api/service-checkout'].includes(url.pathname)){
          posts.push({path:url.pathname,body:req.postDataJSON()});
          return route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname==='/api/city-lead'?{ok:true,id:'city_fixture0001',file:'BM TEST1'}:{ok:false,error:'fixture_no_payment'})});
        }
        throw Error('Unexpected write '+url.pathname);
      }
      if(url.origin!==origin)return route.abort();
      if(/stay-engine|journey-engine|boom-journey-handoff/.test(url.pathname))assets.push(url.pathname);
      if(url.pathname==='/assets/boom-journey-handoff.js'){
        if(failAsset)return route.abort();
        if(hold){held=route;return;}
      }
      return route.continue();
    });
    try{
      await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.BOOM_TICKET);
      await fn({page,posts,assets,release:async()=>{await page.waitForFunction(()=>document.querySelector('script[src*="boom-journey-handoff"]'));assert.ok(held);await held.continue();}});
      assert.deepEqual(errors,[],'no unhandled browser error');
    }finally{await page.close();}
  }
  async function loaded(page){await page.locator('#boomJourneyBrief').waitFor({state:'visible'});}
  async function identity(page){await page.locator('#door').click();await page.fill('#fName','Fixture Person');await page.fill('#fContact','fixture@example.invalid');}
  try{
    browser=await chromium.launch(await launchOptions());
    await check('Madrid accepts the reviewed one-month request in the original free-call contract; no automatic submit',()=>run(J.deskURL('madrid',brief),async({page,posts})=>{
      await loaded(page);assert.equal(posts.length,0);assert.equal(await page.locator('#fare-application-pack').evaluate(n=>n.open),true);
      assert.equal(await page.locator('#boomJourneyBrief summary').innerText(),'1 Feb → 1 Mar '+year+' · review your plans');
      await page.locator('#boomJourneyBrief summary').click();await page.fill('#cityJourney-budget','1700');await page.selectOption('#cityJourney-people','family');
      await page.fill('#cityJourney-moveOut',(year+1)+'-04-05');assert.equal(await page.locator('#boomJourneyBrief summary').innerText(),'1 Feb '+year+' → 5 Apr '+(year+1)+' · review your plans');
      const until=year+'-04-05';await page.fill('#cityJourney-moveOut',until);assert.equal(await page.locator('#boomJourneyBrief summary').innerText(),'1 Feb → 5 Apr '+year+' · review your plans');await identity(page);await page.locator('#door').click();
      await page.waitForFunction(()=>BOOM_TICKET.state()==='open');assert.equal(posts.length,1);
      const b=posts[0].body;assert.equal(b.city,'madrid');assert.equal(b.service,'application-pack');assert.equal(b.moveIn,arrival);assert.equal(b.budget,'EUR 1700');assert.equal(b.situation,'A family');
      assert.ok(b.message.includes(until));assert.doesNotMatch(JSON.stringify(b),/sapienza|Private office|private-reference|poi:|41\.9|12\.4/);assert.match(b.requestId,/^[a-z0-9]{8,40}$/);
    }));
    await check('London reconfirms GBP and the original till sends reviewed notes while preserving user changes',()=>run('/london?from=flight&city=london&need=viewing&moveIn='+arrival+'&moveOut='+departure+'&budget=1500&currency=EUR&people=couple',async({page,posts})=>{
      await loaded(page);assert.equal(await page.inputValue('#cityJourney-budget'),'');await page.locator('#boomJourneyBrief summary').click();
      assert.match(await page.locator('#boomJourneyBrief').innerText(),/Confirm your rent budget in GBP/);
      await page.fill('#cityJourney-budget','1800');await page.locator('#fare-attended-viewing [data-pay]').click();
      assert.equal(posts.length,0);const note=await page.inputValue('#tNote');assert.ok(note.includes('£1800')&&note.includes(arrival)&&note.includes(departure));assert.ok(note.length<=400);
      const edited=note+' Morning viewing preferred.';await page.fill('#tNote',edited);await page.keyboard.press('Escape');await page.locator('#fare-attended-viewing [data-pay]').click();assert.equal(await page.inputValue('#tNote'),edited);
      await page.fill('#tNote','');await page.keyboard.press('Escape');await page.locator('#fare-attended-viewing [data-pay]').click();assert.equal(await page.inputValue('#tNote'),'','deliberately removing the note is preserved');await page.fill('#tNote',edited);
      await page.fill('#tName','Fixture Person');await page.fill('#tEmail','fixture@example.invalid');await page.locator('#tGo').click();await page.waitForFunction(()=>!!document.getElementById('tErr').textContent);
      assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/service-checkout');assert.equal(posts[0].body.city,'london');assert.equal(posts[0].body.kind,'attended-viewing');assert.equal(posts[0].body.notes,edited);assert.equal(posts[0].body.startNow,false);
    }));
    await check('unrelated visits and mismatched city URLs load no extra editor or change to the request',async()=>{
      for(const path of ['/madrid?moveIn='+arrival+'&budget=1500','/madrid?from=flight&city=london&budget=1500'])await run(path,async({page,posts,assets})=>{
        assert.equal(await page.locator('#boomJourneyBrief').count(),0);assert.deepEqual(assets,[]);await identity(page);await page.locator('#door').click();await page.waitForFunction(()=>BOOM_TICKET.state()==='open');assert.equal(posts.length,1);assert.equal('budget'in posts[0].body,false);
      });
    });
    await check('reversed or partial dates stop the original submit; clearing both is an explicit recovery',()=>run('/madrid?from=flight&city=madrid&moveIn='+departure+'&moveOut='+arrival,async({page,posts})=>{
      await loaded(page);await identity(page);await page.locator('#door').click();assert.equal(posts.length,0);assert.match(await page.locator('#cityJourneyError').innerText(),/Departure must be after/);assert.equal(await page.locator('#cityJourney-moveOut').evaluate(n=>document.activeElement===n),true);
      await page.fill('#cityJourney-moveOut','');await page.locator('#door').click();assert.equal(posts.length,0);assert.match(await page.locator('#cityJourneyError').innerText(),/departure date/);
      assert.equal(await page.locator('#boomJourneyBrief summary').innerText(),'From 1 Mar '+year+' · review your plans');
      await page.fill('#cityJourney-moveIn','');await page.fill('#cityJourney-budget','0');await page.locator('#door').click();await page.waitForFunction(()=>BOOM_TICKET.state()==='open');assert.equal(posts.length,1);assert.equal(posts[0].body.moveIn,'');assert.equal(posts[0].body.budget,'');assert.equal(posts[0].body.message,'Rent budget: still exploring.');
      assert.equal(await page.locator('#boomJourneyBrief summary').textContent(),'Your plans · review or edit');
    }));
    await check('slow handoff blocks premature sends and preserves a fare and notes already chosen by the client',()=>run(J.deskURL('madrid',{...brief,need:'search'}),async({page,posts,release})=>{
      await page.locator('#fare-attended-viewing summary').click();await page.locator('#fare-attended-viewing [data-pay]').click();await page.fill('#tName','Fixture Person');await page.fill('#tEmail','fixture@example.invalid');await page.fill('#tNote','My earlier note');
      await page.locator('#tGo').click();assert.equal(posts.length,0);assert.match(await page.locator('#tErr').innerText(),/Loading your plans/);
      await release();await loaded(page);assert.equal(await page.inputValue('#tNote'),'My earlier note');assert.equal(await page.locator('#fare-attended-viewing').evaluate(n=>n.open),true);assert.equal(await page.locator('#fare-full-search').evaluate(n=>n.open),false);
      await page.locator('#tGo').click();await page.waitForFunction(()=>document.getElementById('tErr').textContent&&!document.getElementById('tErr').textContent.includes('Loading'));assert.equal(posts.length,1);assert.equal(posts[0].body.notes,'My earlier note');
    },{hold:true}));
    await check('failed enhancement explicitly falls back to the unchanged original free-call form',()=>run(J.deskURL('madrid',brief),async({page,posts})=>{
      await page.waitForFunction(()=>document.getElementById('fileForm').textContent.includes('plans could not load'));assert.equal(await page.locator('#boomJourneyBrief').count(),0);
      await identity(page);await page.locator('#door').click();await page.waitForFunction(()=>BOOM_TICKET.state()==='open');assert.equal(posts.length,1);assert.equal('budget'in posts[0].body,false);
    },{failAsset:true}));
    await check('a not-open desk never acquires a till through the handoff query',()=>run(J.deskURL('paris',brief),async({page,posts})=>{
      await loaded(page);assert.equal(await page.locator('[data-pay],#till').count(),0);await identity(page);await page.locator('#door').click();await page.waitForFunction(()=>BOOM_TICKET.state()==='open');assert.equal(posts.length,1);assert.equal(posts[0].body.city,'paris');
    }));
    for(const width of [320,390,1280])await check(width+'px editor fits, readable inputs and original door remain usable',()=>run(J.deskURL('barcelona',brief),async({page,posts})=>{
      await loaded(page);await page.locator('#boomJourneyBrief summary').click();
      const bounds=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,fields:[...document.querySelectorAll('#boomJourneyBrief input,#boomJourneyBrief select')].map(n=>{const r=n.getBoundingClientRect();return {h:r.height,right:r.right,font:parseFloat(getComputedStyle(n).fontSize)};})}));
      assert.ok(bounds.scroll<=bounds.w+1,JSON.stringify(bounds));assert.equal(bounds.fields.length,4);assert.ok(bounds.fields.every(r=>r.h>=44&&r.right<=bounds.w+1&&r.font>=16));assert.equal(posts.length,0);
    },{width}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
console.log('City handoff: '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
