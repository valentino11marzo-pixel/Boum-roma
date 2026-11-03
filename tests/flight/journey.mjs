import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {loadChromium,launchOptions} from '../_browser.mjs';
const require=createRequire(import.meta.url),J=require('../../js/journey-engine.js'),S=require('../../js/stay-engine.js'),M=require('../../js/mappa-engine.js');
const root=fileURLToPath(new URL('../../',import.meta.url));
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('  ✓ '+name);}catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}}
const source=readFileSync(root+'js/journey-engine.js','utf8');
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const brief={place:'sapienza',moveIn:arrival,moveOut:departure,budget:1500,people:'couple',type:'__entire',homes:['fixture-home']};
console.log('\n▸ journey  A public brief, private places excluded, original service and Apply doors');
await check('normalization delegates exact dates and never changes a precise departure into a rounded stay',()=>{
  const result=J.normalize({...brief,stay:12});
  assert.equal(result.durationMonths,6);assert.equal(result.moveOut,departure);
  const extra=J.normalize({...brief,moveOut:year+'-08-01',durationMonths:12});
  assert.equal(extra.durationMonths,null);assert.equal(extra.moveOut,year+'-08-01');
  assert.deepEqual(J.read('?moveIn='+arrival+'&stay=6'),J.normalize({moveIn:arrival,durationMonths:6}));
  assert.equal(S.validate(J.read('?moveIn='+arrival+'&moveOut='+year+'-02-28')).field,'moveOut');
});
await check('public places, households and home groups use actual allowlists; budget zero remains explicit',()=>{
  for(const p of M.DESTINATIONS)assert.equal(J.normalize({place:p.slug}).place,p.slug);
  for(const place of ['my office','<script>','poi:0','__proto__',{},null])assert.equal(J.normalize({place}).place,null);
  for(const people of ['solo','couple','family','flatmates'])assert.equal(J.normalize({people}).people,people);
  for(const people of ['student','admin',{},true])assert.equal(J.normalize({people}).people,null);
  for(const type of ['__entire','__rooms']){
    assert.equal(J.normalize({type}).type,type);
    assert.equal(J.read('?type='+type).type,type);
    assert.equal(J.read(new URL(J.share({...brief,type}),'https://www.boomrome.com').search).type,type);
    for(const path of ['/property-finding','/deal-assistance','/listing/A#applica']){
      const result=new URL(J.withIntent(path,{...brief,type}),'https://www.boomrome.com');
      assert.equal(result.searchParams.get('type'),type);assert.equal(result.pathname,path.split('#')[0]);
    }
  }
  for(const type of ['Apartment','Room','__ENTIRE','__rooms ',{},true,null]){
    assert.equal(J.normalize({type}).type,null);
    assert.equal(new URL(J.share({...brief,type}),'https://www.boomrome.com').searchParams.has('type'),false);
  }
  assert.equal(J.normalize({budget:0}).budget,0);assert.equal(J.normalize({budget:'2500'}).budget,2500);
  for(const budget of [-1,100001,NaN,Infinity,true,[],{},'1e3','1500 euros',''])assert.equal(J.normalize({budget}).budget,null);
});
await check('home references are bounded and can be restricted to the current public catalogue',()=>{
  assert.deepEqual(J.normalize({homes:['A','A','../secret','B','C','D','x'.repeat(101)]}).homes,['A','B','C']);
  assert.deepEqual(J.normalize({homes:['A','B']},{allowedHomes:['B']}).homes,['B']);
  assert.deepEqual(J.normalize({homes:['A']},{allowedHomes:[]}).homes,[]);
});
await check('private POIs remain transient, never read from a URL or added to a share',()=>{
  assert.equal(J.normalize({privatePlace:'poi:2'}).privatePlace,'poi:2');
  assert.equal(J.normalize({privatePlace:{name:'My workplace',lat:41.9,lng:12.4}}).privatePlace,null);
  assert.equal(J.read('?privatePlace=poi:2&lat=41.9&lng=12.4').privatePlace,null);
  const url=J.share({...brief,privatePlace:'poi:2',name:'Ada',email:'ada@example.invalid',address:'My workplace'});
  assert.match(url,/direction=club&view=apartments/);assert.doesNotMatch(url,/private|poi|Ada|email|workplace|lat=|lng=/);
  assert.equal(new URL(url,'https://www.boomrome.com').searchParams.get('moveOut'),departure);
});
await check('local navigation keeps route/hash while replacing the brief and stripping known private query keys',()=>{
  const url=J.withIntent('/listing/A?layout=skyline&place=old&privatePlace=poi:1&lat=41.9&email=x#applica',brief);
  const q=new URL(url,'https://www.boomrome.com');assert.equal(q.pathname,'/listing/A');assert.equal(q.hash,'#applica');
  assert.equal(q.searchParams.get('layout'),'skyline');assert.equal(q.searchParams.get('place'),'sapienza');
  for(const key of ['privatePlace','lat','email'])assert.equal(q.searchParams.has(key),false);
  assert.equal(J.withIntent('/apartments?place=sapienza&people=couple&type=__entire&homes=A&budget=1500&stay=6',{}),'/apartments');
  assert.equal(J.withIntent('/apartments?type=arbitrary',{type:'arbitrary'}),'/apartments');
  assert.equal(J.withIntent('/apartments#privatePlace=poi%3A0&lat=1&tab=map',{}),'/apartments#tab=map');
  assert.equal(new URL(J.withIntent('/apartments',{budget:0}),'https://www.boomrome.com').searchParams.get('budget'),'0');
});
await check('external and executable destinations never receive the brief; malformed input is harmless',()=>{
  for(const path of ['https://other.invalid/','//other.invalid/','javascript:alert(1)','/\\other.invalid/'])assert.equal(J.withIntent(path,brief),path);
  assert.deepEqual(J.normalize(null),J.normalize());assert.deepEqual(J.normalize('noise'),J.normalize());
  assert.equal(J.read('?place=%3Cimg%3E&budget=Infinity&stay=12%2B&moveIn=2027-02-30').moveIn,null);
});
await check('browser and Node share one engine; mutations that leak private keys or bypass the place allowlist fail',()=>{
  function browser(code){const window={BOOM_STAY:S,BOOM_MAPPA:M};vm.runInNewContext(code,{window,URL,URLSearchParams,Set});return window.BOOM_JOURNEY;}
  const contract=E=>{
    assert.equal(E.normalize({place:'private-office'}).place,null);
    assert.equal(E.normalize({type:'arbitrary'}).type,null);
    assert.equal(new URL(E.share({type:'__rooms'}),'https://www.boomrome.com').searchParams.get('type'),'__rooms');
    assert.doesNotMatch(E.withIntent('/apartments?privatePlace=poi:0&lat=42',brief),/privatePlace|lat=/);
  };
  contract(browser(source));
  for(const [before,after] of [
    ['if (sensitive.test(key)) query.delete(key);','if (false) query.delete(key);'],
    ['place:destination(value.place) ? value.place : null','place:value.place || null'],
    ['type:types.indexOf(value.type) >= 0 ? value.type : null','type:value.type || null']
  ]){assert.ok(source.includes(before));assert.throws(()=>contract(browser(source.replace(before,after))));}
});
await check('service and Apply seams use the original supported fields and retain generator parity',()=>{
  const pfs=readFileSync(root+'property-finding.html','utf8'),das=readFileSync(root+'deal-assistance.html','utf8');
  for(const html of [pfs,das])assert.equal((html.match(/src="\/assets\/boom-journey-handoff\.js/g)||[]).length,1);
  assert.match(das,/notes:document.getElementById\('sJourneyNotes'\).value/);
  for(const path of ['apartment-detail.html','design/pages-deco/ld-regia.html']){
    const html=readFileSync(root+path,'utf8');
    assert.equal((html.match(/src="\/assets\/boom-journey-handoff\.js/g)||[]).length,1);
    assert.match(html,/commute: window.BoomJourneyHandoff \? BoomJourneyHandoff.commute\(\) : null/);
  }
  const runtime=readFileSync(root+'assets/boom-journey-handoff.js','utf8');
  assert.doesNotMatch(runtime,/fetch\(|localStorage|sessionStorage|requestSubmit\(|\.submit\(/);
});

const chromium=await loadChromium();
if(!chromium){console.log('  SKIP: playwright unavailable — original service/Apply browser checks did not run');}
else {
  const server=createServer((req,res)=>{
    if(req.method!=='GET'){res.writeHead(405);return res.end('No real writes');}
    const pathname=new URL(req.url,'http://localhost').pathname;
    let file=root+(pathname.startsWith('/listing/')?'apartment-detail.html':pathname.slice(1));
    if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
    if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
    let body=readFileSync(file);
    if(pathname.startsWith('/listing/')){
      const record={id:'fixture-home',name:'Fixture Home',zone:'Prati',price:1200,sqm:65,bedrooms:2,type:'Apartment',status:'available',availableDate:'Immediate',images:[],features:[],lat:41.91,lng:12.47};
      body=body.toString().replace('<body>','<body><script>window.__LISTING_ID="fixture-home";window.__LISTING='+JSON.stringify(record)+';</script>');
    }
    res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  async function pageFor(path,setup){
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),posts=[],errors=[];
    page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    if(setup)await page.addInitScript(setup);
    await page.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(req.method()!=='GET'){
        if(url.origin===origin&&['/api/create-checkout','/api/service-checkout','/api/apply-lead'].includes(url.pathname)){
          posts.push({path:url.pathname,body:req.postDataJSON()});
          return route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname==='/api/apply-lead'?{ok:true,id:'fixture-only'}:{ok:false,error:'fixture_no_payment'})});
        }
        return route.abort();
      }
      if(url.origin!==origin)return route.abort();
      return route.continue();
    });
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.BoomJourneyHandoff);
    return {page,posts,errors};
  }
  try{
    browser=await chromium.launch(await launchOptions());
    await check('PFS original checkout receives exact dates and public destination in editable notes, with no automatic submit',async()=>{
      const {page,posts,errors}=await pageFor(J.withIntent('/property-finding',brief));
      assert.equal(posts.length,0);assert.equal(await page.inputValue('#ckBudget'),'1500');assert.equal(await page.inputValue('#ckQuando'),year+'-01');
      const note=await page.inputValue('#ckNote');assert.ok(note.includes(arrival)&&note.includes(departure)&&note.includes('Sapienza'));
      assert.equal(await page.locator('#ckNote').isVisible(),true);assert.ok(note.length<=500);
      await page.fill('#ckNome','Fixture Person');await page.fill('#ckMail','fixture@example.invalid');await page.fill('#ckTel','+390000000000');
      await page.locator('#ckVai').click();await page.waitForFunction(()=>document.getElementById('ckErr').textContent.includes("Something didn't"));
      assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/create-checkout');assert.equal(posts[0].body.additional_info,note);assert.equal(posts[0].body.budget,'1500');
      assert.deepEqual(errors,[]);await page.close();
    });
    await check('PFS preserves an existing draft and later user edits; replacing it requires the visible action',async()=>{
      const {page,posts}=await pageFor(J.withIntent('/property-finding',brief),()=>sessionStorage.setItem('boom_pfs_brief',JSON.stringify({budget:'1800',additional_info:'My earlier notes'})));
      assert.equal(await page.inputValue('#ckBudget'),'1800');assert.equal(await page.inputValue('#ckNote'),'My earlier notes');
      await page.locator('#boomJourneyBrief button').click();assert.equal(await page.inputValue('#ckBudget'),'1500');
      await page.fill('#ckNote','My revised request');await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
      assert.equal(await page.inputValue('#ckNote'),'My revised request');assert.equal(posts.length,0);await page.close();
    });
    await check('DAS original checkout sends the reviewed brief through its existing notes contract',async()=>{
      const {page,posts,errors}=await pageFor(J.withIntent('/deal-assistance',brief));assert.equal(posts.length,0);
      await page.evaluate(()=>openSheet('fixture'));
      const note=await page.inputValue('#sJourneyNotes');assert.ok(note.includes(arrival)&&note.includes(departure)&&note.includes('Sapienza'));assert.ok(note.length<=400);
      await page.fill('#sName','Fixture Person');await page.fill('#sEmail','fixture@example.invalid');await page.fill('#sPhone','+390000000000');
      await page.fill('#sListing','https://example.invalid/the-home');await page.locator('#sGo').click();
      await page.waitForFunction(()=>document.getElementById('sErr').textContent.includes('Checkout hiccuped'));
      assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/service-checkout');assert.equal(posts[0].body.notes,note);assert.equal(posts[0].body.kind,'deal-assistance');
      assert.deepEqual(errors,[]);await page.close();
    });
    await check('Apply retains its date/household controller and sends only the chosen public destination after review',async()=>{
      const {page,posts,errors}=await pageFor(J.withIntent('/listing/fixture-home',brief));
      await page.locator('[data-bfd-apply]').click();await page.locator('#apNome').waitFor({state:'visible'});
      assert.equal(posts.length,0);assert.equal(await page.inputValue('#apQuando'),arrival);assert.equal(await page.inputValue('#apUscita'),departure);assert.equal(await page.inputValue('#apChi'),'couple');
      assert.equal(await page.inputValue('#apJourneyPlace'),'sapienza');await page.selectOption('#apJourneyPlace','');
      assert.equal(await page.evaluate(()=>BoomJourneyHandoff.commute()),null);
      await page.selectOption('#apJourneyPlace','luiss');
      await page.fill('#apNome','Fixture Person');await page.fill('#apMail','fixture@example.invalid');
      await page.locator('[data-bfd-next]').click();
      const changedDeparture=year+'-08-01';
      await page.fill('#apUscita',changedDeparture);await page.locator('#apUscita').dispatchEvent('change');
      assert.ok((await page.textContent('#boomJourneyBrief')).includes(changedDeparture));
      assert.equal((await page.textContent('#boomJourneyBrief')).includes(departure),false);
      await page.fill('#apUscita',departure);await page.locator('#apUscita').dispatchEvent('change');
      await page.selectOption('#apChi','solo');assert.ok((await page.textContent('#boomJourneyBrief')).includes('Just me'));
      await page.selectOption('#apChi','couple');await page.locator('[data-bfd-next]').click();
      await page.locator('[data-bfd-next]').click();
      await page.locator('#modApplica button[type="submit"]').click();await page.waitForFunction(()=>document.getElementById('applicaFatto').classList.contains('si'));
      assert.equal(posts.length,1);const body=posts[0].body;assert.equal(posts[0].path,'/api/apply-lead');
      assert.equal(body.moveIn,arrival);assert.equal(body.moveOut,departure);assert.equal(body.durationMonths,6);assert.equal(body.household,'couple');
      assert.deepEqual(body.commute,{place:'luiss',label:J.destination('luiss').nome.slice(0,60)});assert.equal('km' in body.commute,false);
      assert.deepEqual(errors,[]);await page.close();
    });
    await check('absent or private-only URL context creates no destination field, notes or automatic requests',async()=>{
      const {page,posts,errors}=await pageFor('/deal-assistance?privatePlace=poi:0&address=Private%20workplace&lat=41.9&lng=12.4');
      assert.equal(await page.locator('#boomJourneyBrief').count(),0);assert.equal(await page.locator('#sJourneyNotesField').isHidden(),true);
      assert.equal(await page.inputValue('#sJourneyNotes'),'');assert.equal(await page.evaluate(()=>BoomJourneyHandoff.commute()),null);
      assert.equal(posts.length,0);assert.deepEqual(errors,[]);await page.close();
    });
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
console.log('Journey: '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
