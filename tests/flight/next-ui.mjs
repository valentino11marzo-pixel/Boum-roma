// Real Flight Next document, controllers and CSS. Only catalogue/network and
// the already separately-tested heavy Skyline frame are controlled boundaries.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadChromium,launchOptions} from '../_browser.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const chromium=await loadChromium();
console.log('\n▸ nextui  A real Home → Apartments → Detail journey, without applications or payments');
if(!chromium){console.log('  SKIP: playwright unavailable — Flight Next browser checks did not run');process.exit(0);}
const year=new Date().getFullYear()+1,arrival=year+'-01-31',departure=year+'-07-31',tooShort=year+'-02-28';
const listings=[
  {id:'fixture-courtyard',name:'Fixture Courtyard',zone:'Prati',status:'available',availableDate:'Immediate',price:1200,sqm:65,bedrooms:2,bathrooms:1,type:'Apartment',images:['/fixture-photo.svg','/fixture-photo-two.svg'],description:'A real test record with two bedrooms.',features:['Balcony'],furnished:'yes'},
  {id:'fixture-studio',name:'Fixture Studio',zone:'Trastevere',status:'waitlist',availableFrom:year+'-09-01',availableDate:year+'-09-01',price:1800,sqm:35,bedrooms:0,bathrooms:1,type:'Studio',images:['/fixture-photo.svg']},
  {id:'fixture-room',name:'Fixture Room',zone:'San Lorenzo',status:'available',availableDate:'Ask BOOM',price:700,sqm:18,bedrooms:1,bathrooms:null,type:'Room',images:['/fixture-photo.svg']},
  {id:'fixture-draft',name:'Unpublished test record',zone:'Prati',status:'draft',price:10,bedrooms:8,type:'Apartment',images:['/fixture-photo.svg']}
];
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'){res.writeHead(405);return res.end('No writes in the browser fixture');}
  if(pathname==='/fixture-photo.svg'||pathname==='/fixture-photo-two.svg'){
    res.setHeader('content-type','image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#49493e"/><rect x="100" y="100" width="400" height="500" fill="#b9b39d"/></svg>');
  }
  let file=root+(pathname==='/'?'flight-next.html':pathname.slice(1));
  if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
  if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
  res.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,passed=0,failed=0;
async function check(name,fn){
  try{await fn();passed++;console.log('  ✓ '+name);}
  catch(error){failed++;console.log('  ✗ '+name+' — '+error.message);}
}
async function newPage(width,{failFirst=false}={}){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'});
  const errors=[],writes=[];let reads=0;
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/api/listings'){
      reads++;
      return route.fulfill({status:failFirst&&reads===1?502:200,contentType:'application/json',
        body:JSON.stringify(failFirst&&reads===1?{ok:false,error:'listings_unavailable'}:{ok:true,count:listings.length,listings})});
    }
    if(url.pathname==='/skyline')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><title>Skyline rendering boundary</title><body style="margin:0;background:#101319;color:white">Skyline fixture</body></html>'});
    return route.continue();
  });
  return {page,errors,writes,reads:()=>reads};
}
async function geometry(page,selector){
  if(selector){
    const size=await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};});
    assert.ok(size.width>=44&&size.height>=44,selector+' target '+JSON.stringify(size));
  }
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(overflow.scroll<=overflow.width+1,'page must not scroll sideways: '+JSON.stringify(overflow));
}
const resultCards=page=>page.locator('#nextResults .next-card');
try{
  browser=await chromium.launch(await launchOptions());
  for(const width of [320,390,1280]){
    const {page,errors,writes}=await newPage(width);
    await check(width+'px: invalid dates remain on Home with an accessible error',async()=>{
      await page.goto(origin+'/flight-next',{waitUntil:'domcontentloaded'});
      await page.locator('#nextHomeRail .next-card').first().waitFor();
      await geometry(page,'#nextSearchForm button[type=submit]');
      await page.locator('#nextMoveIn').fill(arrival);await page.locator('#nextMoveOut').fill(tooShort);
      await page.locator('#nextSearchForm button[type=submit]').click();
      assert.equal(await page.locator('#nextHome').isVisible(),true);
      const message=await page.evaluate(()=>document.getElementById('nextMoveOut').validationMessage||document.getElementById('nextSearchError').textContent);
      assert.ok(message,'an invalid calendar range must be explained');
      assert.equal(await page.locator('#nextApartments').isVisible(),false);
    });
    await check(width+'px: valid stay and budget reach Apartments, then real Apply with exact dates',async()=>{
      await page.locator('#nextMoveOut').fill(departure);await page.locator('#nextBudget').selectOption('1500');await page.locator('#nextPeople').selectOption('couple');
      await page.locator('#nextSearchForm button[type=submit]').click();
      await page.locator('#nextApartments').waitFor({state:'visible'});
      assert.equal(await resultCards(page).count(),2);
      assert.equal(await page.locator('#nextFilterBudget').inputValue(),'1500');
      await page.locator('#nextResults .next-card').filter({hasText:'Fixture Courtyard'}).locator('h3 [data-home]').click();
      await page.locator('#nextDetail').waitFor({state:'visible'});
      const apply=page.locator('#nextDetail [data-next-apply]');
      await apply.waitFor();
      const url=new URL(await apply.getAttribute('href'),origin);
      assert.equal(url.pathname,'/listing/fixture-courtyard');assert.equal(url.hash,'#applica');assert.equal(url.searchParams.get('people'),'couple');
      assert.equal(url.searchParams.get('moveIn'),arrival);assert.equal(url.searchParams.get('moveOut'),departure);assert.equal(url.searchParams.get('stay'),'6');
      await geometry(page,'#nextDetail [data-next-apply]');
      assert.equal(await page.locator('#nextDetailTitle').innerText(),'Fixture Courtyard');
      assert.deepEqual(writes,[]);
    });
    await check(width+'px: browser Back restores the filtered collection and dates',async()=>{
      await page.goBack();
      await page.locator('#nextApartments').waitFor({state:'visible'});
      assert.equal(await resultCards(page).count(),2);assert.equal(await page.locator('#nextFilterBudget').inputValue(),'1500');
      const url=new URL(page.url());assert.equal(url.searchParams.get('moveIn'),arrival);assert.equal(url.searchParams.get('moveOut'),departure);
      await geometry(page);
      assert.deepEqual(errors,[]);
    });
    await page.close();
  }
  const {page,errors,writes}=await newPage(390);
  await check('shared saves are canonical, reread another tab, and the shortlist never changes the live catalogue',async()=>{
    await page.goto(origin+'/flight-next?view=apartments',{waitUntil:'domcontentloaded'});
    await resultCards(page).first().waitFor();
    const card=page.locator('#nextResults .next-card').filter({hasText:'Fixture Courtyard'});
    const save=card.locator('[data-save-home]');
    await page.evaluate(()=>localStorage.setItem('boomSalvate',JSON.stringify(['/listing/already-saved'])));
    await save.click();
    const paths=await page.evaluate(()=>JSON.parse(localStorage.getItem('boomSalvate')));
    assert.ok(paths.includes('/listing/already-saved'));assert.ok(paths.includes('/listing/fixture-courtyard'));assert.equal(paths.length,2);
    await page.locator('[data-saved]').click();
    await page.waitForFunction(()=>document.getElementById('nextResults').textContent.includes('Fixture Courtyard'));
    assert.equal(await resultCards(page).count(),1);
    assert.equal(await save.getAttribute('aria-pressed'),'true');
    assert.deepEqual(writes,[]);
  });
  await check('a genuine empty filter offers recovery and clearing returns the collection',async()=>{
    await page.goto(origin+'/flight-next?view=apartments',{waitUntil:'domcontentloaded'});
    await resultCards(page).first().waitFor();
    await page.locator('#nextFilterBudget').selectOption('1000');await page.locator('#nextFilterType').selectOption({label:'Studio'});
    assert.equal(await resultCards(page).count(),0);
    assert.ok((await page.locator('#nextResults').innerText()).trim().length>0);
    await page.locator('#nextClearFilters').click();
    assert.equal(await resultCards(page).count(),3);
    assert.equal(await page.locator('#nextFilterBudget').inputValue(),'');assert.equal(await page.locator('#nextFilterType').inputValue(),'');
    assert.deepEqual(errors,[]);
  });
  await page.close();
  const retry=await newPage(390,{failFirst:true});
  await check('catalogue failure remains an error; Retry rereads and restores real cards',async()=>{
    await retry.page.goto(origin+'/flight-next?view=apartments',{waitUntil:'domcontentloaded'});
    await retry.page.locator('#nextResults [data-retry]').waitFor();
    assert.equal(await resultCards(retry.page).count(),0);assert.equal(retry.reads(),1);
    await retry.page.locator('#nextResults [data-retry]').click();
    await resultCards(retry.page).first().waitFor();
    assert.equal(await resultCards(retry.page).count(),3);assert.equal(retry.reads(),2);
    assert.deepEqual(retry.errors,[]);assert.deepEqual(retry.writes,[]);
  });
  await retry.page.close();
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log('Flight Next UI: '+passed+' passed, '+failed+' failed');
process.exitCode=failed?1:0;
