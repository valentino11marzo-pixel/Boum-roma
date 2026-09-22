import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { html } from './harness.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'||path==='/portal'){res.setHeader('Content-Type','text/html');res.end(html);return;}const file=resolve(ROOT,'.'+path);if(!file.startsWith(ROOT))throw Error('bad path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch(_){res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(Number(process.env.PREVIEW_PORT || 0),'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
if(process.env.PREVIEW_ONLY){console.log('Preview '+base+'/portal#property/casa-demo/overview');await new Promise(()=>{});}
const chromium=await loadChromium();
if(!chromium){server.close();throw Error('Browser verification needs Playwright (BOOM_PLAYWRIGHT)');}
let count=0;const errors=[];
const browser=await chromium.launch(launchOptions({headless:true}));
try{
for(const width of (process.env.TEST_WIDTHS?process.env.TEST_WIDTHS.split(',').map(Number):[1440,390,320])){
 const context=await browser.newContext({viewport:{width,height:940}});const page=await context.newPage();
 page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const check=async(label,fn)=>{await fn();count++;console.log('✓ '+width+' '+label);};
 await page.goto(base+'/portal');await page.waitForSelector('[data-property-id="casa-demo"]');
 await check('actual list opens dossier',async()=>{await page.locator('#propertySearch').fill('Aurora');await page.locator('[data-property-id="casa-demo"]').click();await page.waitForSelector('#pdos-title');assert.equal(await page.locator('#pdos-title').innerText(),'Casa Aurora');assert((await page.locator('#pdos-title').boundingBox()).y<480,'title must be in initial viewport');assert(page.url().endsWith('#property/casa-demo/overview'));});
 await check('scoped module respects sidebar and keyboard focus',async()=>{assert.equal((await page.locator('#sidebar .nav-item.active').innerText()).replace(/\s+/g,' '),'🏠 Immobili');assert.equal(await page.evaluate(()=>document.activeElement.id),'pdos-title');});
 await check('real person details open from the correct relationship',async()=>{await page.locator('[data-pdos-action="person"]').first().click();await page.waitForSelector('.modal-title');assert((await page.locator('.modal-title').innerText()).includes('Proprietaria Demo'));await page.locator('.modal-close').click();await page.waitForTimeout(260);});
 for(const tab of ['contracts','rent','documents','activity','overview']){
  await check(tab+' renders without overflow',async()=>{await page.locator('[data-pdos-tab="'+tab+'"]').click();await page.waitForSelector('[data-pdos-tab="'+tab+'"][aria-current]');assert(await page.locator('.pdos-content').innerText());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
 }
 await check('direct reload retains property and section',async()=>{await page.locator('[data-pdos-tab="rent"]').click();await page.reload();await page.waitForSelector('.pdos-payment');assert(page.url().endsWith('/rent'));assert.equal(await page.locator('.pdos-payment').count(),2);assert((await page.locator('.pdos-payment').first().innerText()).includes('3 ago 2026'));});
 await check('real payment detail opens the selected unit without side effects',async()=>{await page.locator('.pdos-payment [data-pdos-action="payment"]').first().click();await page.waitForSelector('.rent-detail');assert((await page.locator('.rent-detail').innerText()).includes('Casa Aurora'));await page.locator('.rent-detail .modal-close').click();await page.waitForTimeout(260);});
 await check('actual maintenance modal opens from record',async()=>{await page.locator('[data-pdos-tab="activity"]').click();await page.locator('[data-pdos-action="maintenance"]').first().click();await page.waitForSelector('.modal-title');assert((await page.locator('.modal-title').innerText()).includes('Verifica della caldaia'));await page.locator('.modal-close').click();await page.waitForTimeout(260);});
 await check('browser back and forward preserve selected section',async()=>{await page.locator('[data-pdos-tab="documents"]').click();await page.goBack();await page.waitForSelector('[data-pdos-tab="activity"][aria-current]');await page.goForward();await page.waitForSelector('[data-pdos-tab="documents"][aria-current]');});
 await check('return restores filtered list',async()=>{await page.goto(base+'/portal');await page.locator('#propertySearch').fill('Aurora');await page.locator('[data-property-id="casa-demo"]').click();await page.locator('[data-pdos-action="back"]').click();assert.equal(await page.locator('#propertySearch').inputValue(),'Aurora');assert(!(await page.locator('[data-property-id="casa-vuota"]').isVisible()));});
 await check('keyboard opening and return retain scroll and filters',async()=>{
  await page.evaluate(()=>{for(let i=0;i<30;i++)testState.properties.push({...testState.properties[0],id:'demo-'+i,name:'Casa Aurora '+i});goTo('properties');});
  await page.locator('#propertySearch').fill('senza');await page.locator('[data-filter="rented"]').click();assert.equal(await page.locator('.property-item:visible').count(),0);await page.locator('#propertySearch').fill('');assert(!(await page.locator('[data-property-id="casa-vuota"]').isVisible()));await page.locator('#propertySearch').fill('Aurora');
  const row=page.locator('[data-property-id="demo-25"]');if(width<=920)await page.waitForSelector('[data-property-id="demo-25"][data-pm-done]');await row.scrollIntoViewIfNeeded();await row.focus();const previousY=await page.evaluate(()=>scrollY);assert(previousY>300);
  await row.press('Enter');await page.waitForSelector('#pdos-title');await page.locator('[data-pdos-action="back"]').click();
  try{await page.waitForFunction(y=>Math.abs(scrollY-y)<4,previousY,{timeout:5000});}catch(e){console.error('Scroll evidence',previousY,await page.evaluate(()=>({y:scrollY,focus:document.activeElement.dataset.propertyId,height:document.documentElement.scrollHeight})));throw e;}assert.equal(await page.locator('#propertySearch').inputValue(),'Aurora');assert.equal(await page.evaluate(()=>document.activeElement.dataset.propertyId),'demo-25');
  assert(!(await page.locator('[data-property-id="casa-vuota"]').isVisible()));
 });
 await check('refresh returns keyboard focus and property removal retains confirmation',async()=>{
  await page.goto(base+'/portal?refresh=1#property/casa-demo/overview');await page.locator('[data-pdos-action="refresh"]').click();await page.waitForFunction(()=>document.activeElement.dataset.pdosAction==='refresh' && !document.activeElement.disabled);
  await page.locator('.pdos-manage summary').click();await page.locator('[data-pdos-action="delete"]').click();assert.deepEqual(await page.evaluate(()=>demoActions.at(-1)),['confirmDelete','propert','casa-demo']);
 });
 await check('unknown record and malformed routes are explicit',async()=>{await page.goto(base+'/portal#property/missing/overview');await page.waitForSelector('.pdos-empty');assert((await page.locator('#main').innerText()).includes('Immobile non disponibile'));await page.goto(base+'/portal#property/casa-demo/not-a-tab');await page.waitForSelector('.pdos-empty');assert((await page.locator('#main').innerText()).includes('Collegamento non valido'));});
 await check('role changes hide dossier data and block commands',async()=>{await page.goto(base+'/portal#property/casa-demo/overview');await page.evaluate(()=>{testState.profile.role='tenant';renderPage();});assert(!(await page.locator('#main').innerText()).includes('Casa Aurora'));assert((await page.locator('#main').innerText()).includes('Accesso riservato'));});
 await page.goto(base+'/portal?preview=1#property/casa-demo/overview');await page.waitForSelector('#pdos-title');
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SCREENSHOT_DIR,'fascicolo-'+width+'.png'),fullPage:true});
 await context.close();
}
assert.deepEqual(errors,[]);console.log(`${count} browser checks passed; real dossier, navigation, list and detail renderers; synthetic data; no live writes.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
