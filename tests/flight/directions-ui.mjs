// Real direction documents, CSS and controllers; only the public catalogue and
// heavy Skyline rendering are network fixtures. No application or payment writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const chromium=await loadChromium();
console.log('\n▸ directionsui  Three real compositions, one home journey and a bounded comparison frame');
if(!chromium){console.log('  SKIP: playwright unavailable — direction browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31';
const listings=[
  {id:'fixture-courtyard',name:'Fixture Courtyard',zone:'Prati',status:'available',availableDate:'Immediate',price:1200,sqm:65,bedrooms:2,bathrooms:1,type:'Apartment',images:['/fixture-photo.svg','/fixture-photo-two.svg'],description:'A fixture home with two bedrooms.',features:['Balcony'],furnished:'yes'},
  {id:'fixture-room',name:'Fixture Room',zone:'San Lorenzo',status:'available',availableDate:'Ask BOOM',price:700,sqm:18,bedrooms:1,type:'Room',images:['/fixture-photo.svg']},
  {id:'fixture-studio',name:'Fixture Studio',zone:'Trastevere',status:'waitlist',availableFrom:year+'-09-01',availableDate:year+'-09-01',price:1800,sqm:35,bedrooms:0,type:'Studio',images:['/fixture-photo.svg']}
];
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'){res.writeHead(405);return res.end('No writes in this fixture');}
  if(pathname==='/fixture-photo.svg'||pathname==='/fixture-photo-two.svg'){
    res.setHeader('content-type','image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#49493e"/><rect x="100" y="100" width="400" height="500" fill="#b9b39d"/></svg>');
  }
  let file=root+(pathname==='/'?'flight-lab.html':pathname.slice(1));
  if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
  if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');
  res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('  ✓ '+name);}catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}}
async function openPage(width){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'});
  const errors=[],writes=[];page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/api/listings')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,count:listings.length,listings})});
    if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Skyline rendering boundary</title><body style="margin:0;background:#101319;color:white">Skyline fixture</body></html>'});
    return route.continue();
  });
  return {page,errors,writes};
}
async function geometry(context,selector){
  const overflow=await context.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(overflow.scroll<=overflow.width+1,'no sideways page scroll: '+JSON.stringify(overflow));
  if(selector){
    const r=await context.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};});
    assert.ok(r.width>=44&&r.height>=44,selector+' touch target '+JSON.stringify(r));
  }
}
async function readyHome(page,direction){
  await page.goto(origin+'/flight-next?direction='+direction,{waitUntil:'domcontentloaded'});
  await page.locator('#nextHomeRail .next-card').first().waitFor();
  assert.equal(await page.locator('body').getAttribute('data-direction'),direction);
}
async function currentFrame(page){
  const frame=await page.locator('#labFrame').elementHandle();return frame.contentFrame();
}
async function expectLayout(page,value){
  await page.waitForFunction(value=>document.getElementById('nextDiscovery').dataset.layout===value,value);
  assert.equal(await page.locator('button[data-layout="'+value+'"]').getAttribute('aria-pressed'),'true');
  assert.equal(new URL(page.url()).searchParams.get('layout'),value);
}
try{
  browser=await chromium.launch(await launchOptions());
  for(const direction of ['atlas','residence','club'])for(const width of [320,390,1280]){
    const {page,errors,writes}=await openPage(width);
    await check(direction+' '+width+'px: one real form → filtered homes → original Apply with exact dates',async()=>{
      await readyHome(page,direction);
      assert.equal(await page.locator('#nextSearchForm').count(),1);
      assert.equal(await page.locator('#nextMoveIn').count(),1);
      await geometry(page,'#nextSearchForm button[type="submit"]');
      const fields=await page.locator('#nextSearchForm :is(input,select)').evaluateAll(nodes=>nodes.map(n=>({id:n.id,width:n.getBoundingClientRect().width,font:parseFloat(getComputedStyle(n).fontSize)})));
      assert.ok(fields.every(f=>f.width>70&&f.font>=(width<500?16:14)),'readable real inputs: '+JSON.stringify(fields));
      await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(departure);
      await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
      await page.locator('#nextSearchForm button[type="submit"]').click();
      await page.locator('#nextApartments').waitFor({state:'visible'});
      assert.equal(await page.locator('#nextResults .next-card').count(),2);
      await geometry(page,width<500?'button[data-layout="skyline"]':undefined);
      assert.equal(await page.locator('#nextDiscovery').getAttribute('data-layout'),direction==='atlas'?'skyline':'gallery');
      await page.locator('#nextResults .next-card[data-home-id="fixture-courtyard"] h3 [data-home]').click();
      await page.locator('#nextDetailTitle').waitFor();
      await geometry(page,'[data-next-apply]');
      const apply=new URL(await page.locator('[data-next-apply]').getAttribute('href'),origin);
      assert.equal(apply.pathname,'/listing/fixture-courtyard');assert.equal(apply.hash,'#applica');
      assert.equal(apply.searchParams.get('moveIn'),arrival);assert.equal(apply.searchParams.get('moveOut'),departure);
      assert.equal(apply.searchParams.get('stay'),'6');assert.equal(apply.searchParams.get('people'),'couple');
      assert.equal(new URL(page.url()).searchParams.get('direction'),direction);
      assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    });
    await page.close();
  }
  for(const direction of ['residence','club']){
    const {page,errors}=await openPage(390);
    await check(direction+': an explicit Skyline choice survives reload, detail and browser Back',async()=>{
      await page.goto(origin+'/flight-next?direction='+direction+'&view=apartments',{waitUntil:'domcontentloaded'});
      await page.locator('#nextResults .next-card').first().waitFor();
      assert.equal(await page.locator('#nextDiscovery').getAttribute('data-layout'),'gallery');
      await page.locator('button[data-layout="skyline"]').click();await expectLayout(page,'skyline');
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('#nextResults .next-card').first().waitFor();
      await expectLayout(page,'skyline');
      await page.locator('#nextResults .next-card[data-home-id="fixture-room"] h3 [data-home]').click();
      await page.locator('#nextDetailTitle').waitFor();
      await page.goBack();await page.locator('#nextApartments').waitFor({state:'visible'});await expectLayout(page,'skyline');
      assert.deepEqual(errors,[]);
    });
    await page.close();
  }
  const mapChoice=await openPage(390);
  await check('Club mobile: a real Skyline-frame selection reveals the corresponding vertical result row',async()=>{
    const {page}=mapChoice;
    await page.goto(origin+'/flight-next?direction=club&view=apartments&layout=skyline',{waitUntil:'domcontentloaded'});
    const last=page.locator('#nextResults .next-card[data-home-id="fixture-studio"]');await last.waitFor();
    const before=await last.boundingBox();assert.ok(before.y+before.height>900,'fixture row starts below the visible viewport');
    const handle=await page.locator('#nextApartmentsMap iframe').elementHandle(),map=await handle.contentFrame();
    await map.waitForLoadState('domcontentloaded');
    await map.evaluate(()=>parent.postMessage({t:'boomSelected',id:'fixture-studio'},location.origin));
    await page.waitForFunction(()=>{
      const card=document.querySelector('#nextResults [data-home-id="fixture-studio"]');
      const r=card.getBoundingClientRect();return card.dataset.selected==='true'&&r.top>=0&&r.bottom<=innerHeight+1;
    });
    await geometry(page);assert.deepEqual(mapChoice.errors,[]);assert.deepEqual(mapChoice.writes,[]);
  });
  await mapChoice.page.close();
  const lab=await openPage(1280);
  await check('comparison preserves the chosen home, dates, budget and household across directions and mobile mode',async()=>{
    const {page}=lab;
    await page.goto(origin+'/flight-lab',{waitUntil:'domcontentloaded'});
    let frame=await currentFrame(page);await frame.locator('#nextHomeRail .next-card').first().waitFor();
    await frame.locator('#nextMoveIn').fill(arrival);await frame.locator('#nextMoveOut').fill(departure);
    await frame.locator('#nextBudget').selectOption('1500');await frame.locator('#nextPeople').selectOption('couple');
    await frame.locator('#nextSearchForm button[type="submit"]').click();
    await frame.locator('#nextResults .next-card[data-home-id="fixture-room"] h3 [data-home]').click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('home')==='fixture-room'&&new URL(location.href).searchParams.get('view')==='detail');
    for(const direction of ['residence','club','atlas']){
      await page.locator('button[data-direction="'+direction+'"]').click();
      await page.waitForFunction(direction=>document.getElementById('labFrame').contentDocument?.body?.dataset.direction===direction,direction);
      frame=await currentFrame(page);await frame.locator('#nextDetailTitle').waitFor();
      assert.equal(await frame.locator('#nextDetailTitle').innerText(),'Fixture Room');
      assert.equal(new URL(frame.url()).searchParams.get('home'),'fixture-room');
      const open=new URL(await page.locator('#labOpen').getAttribute('href'),origin);
      assert.equal(open.searchParams.get('home'),'fixture-room');
      for(const url of [new URL(frame.url()),open])for(const [key,value] of Object.entries({moveIn:arrival,moveOut:departure,stay:'6',budget:'1500',people:'couple'}))assert.equal(url.searchParams.get(key),value,direction+' preserves '+key);
      const publicQuery=new URL(page.url()).searchParams;
      for(const key of ['moveIn','moveOut','stay','budget','people'])assert.equal(publicQuery.has(key),false,'comparison URL does not persist '+key);
    }
    const before=frame.url();await page.locator('button[data-device="mobile"]').click();
    assert.equal(frame.url(),before,'device toggle resizes instead of replacing the current document');
    const size=await page.locator('#labFrame').boundingBox();assert.ok(size.width>=387&&size.width<=390,'mobile preview width: '+size.width);
    await geometry(frame,'[data-next-apply]');await geometry(page,'button[data-device="mobile"]');
    assert.deepEqual(lab.errors,[]);assert.deepEqual(lab.writes,[]);
  });
  await check('comparison Home and Apartments do not replace the chosen Detail with the featured home',async()=>{
    const {page}=lab;
    for(const view of ['home','apartments']){
      await page.locator('button[data-view="'+view+'"]').click();
      await page.waitForFunction(view=>document.getElementById('labFrame').contentDocument?.body?.dataset.view===view,view);
      const frame=await currentFrame(page);
      await frame.locator(view==='home'?'#nextHomeRail .next-card':'#nextResults .next-card').first().waitFor();
      // Let the child catalogue's postMessage reach the parent before checking
      // that its default featured home did not replace the user's chosen home.
      await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(new URL(page.url()).searchParams.get('home'),'fixture-room');
    }
    await page.locator('button[data-view="detail"]').click();
    await page.waitForFunction(()=>document.getElementById('labFrame').contentDocument?.body?.dataset.view==='detail');
    const frame=await currentFrame(page);await frame.locator('#nextDetailTitle').waitFor();
    assert.equal(await frame.locator('#nextDetailTitle').innerText(),'Fixture Room');
    const apply=new URL(await frame.locator('[data-next-apply]').getAttribute('href'),origin);
    assert.equal(apply.searchParams.get('moveIn'),arrival);assert.equal(apply.searchParams.get('moveOut'),departure);
    assert.deepEqual(lab.errors,[]);
  });
  await check('comparison accepts messages only from its current frame, same origin and current direction',async()=>{
    const {page}=lab;const before=page.url(),src=await page.locator('#labFrame').getAttribute('src');
    await page.evaluate(()=>{
      const frame=document.getElementById('labFrame'),origin=location.origin,direction=new URL(location.href).searchParams.get('direction');
      const data={type:'boom-design-state',direction,view:'home',home:'injected-home'};
      for(const args of [
        {origin:'https://not-boom.invalid',source:frame.contentWindow,data},
        {origin,source:window,data},
        {origin,source:frame.contentWindow,data:{...data,direction:'club'}},
        {origin,source:frame.contentWindow,data:{...data,view:'admin'}},
        {origin,source:frame.contentWindow,data:{...data,type:'unrelated'}}
      ])window.dispatchEvent(new MessageEvent('message',args));
    });
    assert.equal(page.url(),before);assert.equal(await page.locator('#labFrame').getAttribute('src'),src);
    assert.equal(new URL(page.url()).searchParams.get('home'),'fixture-room');
    assert.deepEqual(lab.errors,[]);
  });
  await lab.page.close();
  for(const width of [320,390]){
    const {page,errors}=await openPage(width);
    await check('comparison '+width+'px: controls and nested mobile preview fit without sideways scrolling',async()=>{
      await page.goto(origin+'/flight-lab?direction=club&device=mobile&view=detail&home=fixture-courtyard',{waitUntil:'domcontentloaded'});
      const frame=await currentFrame(page);await frame.locator('#nextDetailTitle').waitFor();
      await geometry(page,'button[data-direction="club"]');await geometry(page,'#labOpen');await geometry(frame,'[data-next-apply]');
      assert.equal(await frame.locator('#nextDetailTitle').innerText(),'Fixture Courtyard');
      assert.deepEqual(errors,[]);
    });
    await page.close();
  }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('Flight directions UI: '+passed+' passed, '+failed+' failed');
process.exitCode=failed?1:0;
