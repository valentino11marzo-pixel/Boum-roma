import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadChromium,launchOptions } from '../_browser.mjs';
import { createHarnessServer } from './harness.mjs';
const server=createHarnessServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const artifacts=await mkdtemp(join(tmpdir(),'boom-portal-journey-'));let browser,checks=0;
try{
 const chromium=await loadChromium();assert(chromium);browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [390,320,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(6000);const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(external.push(r.request().url()),r.abort()));
  await page.goto(base+'/workspace#oggi');await page.waitForTimeout(150);assert.deepEqual(errors,[]);await page.waitForFunction(()=>window.testReady);
  const session=await page.evaluate(()=>testIO.previewSession);
  for(const route of ['oggi','properties','contracts','payments','maintenance','users','boom-tools','inbox']){
   await page.evaluate(section=>goTo(section),route);await page.waitForTimeout(100);assert.deepEqual(errors,[],route);
   assert.equal(await page.evaluate(()=>testIO.previewSession),session);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' fits');
   await page.screenshot({path:join(artifacts,route+'-'+width+'.png')});checks++;console.log('PASS '+width+' '+route+' actual renderer in one session');
  }
  await page.evaluate(()=>goTo('properties'));await page.locator('[data-property-id="casa-demo"]').click();await page.waitForSelector('#pdos-title');
  await page.getByRole('button',{name:'Comunicazioni collegate',exact:true}).click();await page.waitForFunction(()=>S.inboxContext&&!S.inboxContext.loading);
  await page.locator('[onclick="inboxSelect(\'conv-a\')"]').click();await page.waitForTimeout(100);assert.deepEqual(errors,[]);await page.waitForSelector('#inboxBody');
  await page.locator('#inboxBody').fill('Bozza demo da conservare');await page.evaluate(()=>inboxLiveRefresh());assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza demo da conservare');
  if(width<920){assert.equal(await page.locator('.inbox-thread-info').evaluate(e=>e.open),false);assert((await page.locator('#inboxTimeline').boundingBox()).height>=160);await page.locator('.inbox-thread-info>summary').click();}
  await page.getByRole('button',{name:'Prendi in carico',exact:true}).click();await page.waitForSelector('#sgPractice');
  await page.locator('#sgPractice').selectOption('contracts/contratto-demo');await page.locator('#sgAction').fill('Concordare accesso e avvisare il portiere');
  await page.locator('#sgWaitingOn').selectOption('valentino');await page.locator('#sgWaitingLabel').fill('Valentino');
  await page.locator('#sgCheckAt').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
  await page.locator('[data-sg-submit]').click();await page.waitForSelector('#sgFollowModal',{state:'detached'});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Seguito operativo"]')?.textContent.includes('Confermato'));
  assert.match(await page.locator('[aria-label="Seguito operativo"]').innerText(),/Concordare accesso e avvisare il portiere/);
  assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza demo da conservare');
  if(width<920){assert((await page.locator('#inboxTimeline').boundingBox()).height>=160);await page.evaluate(()=>inboxLiveRefresh());assert.equal(await page.locator('.inbox-thread-info').evaluate(e=>e.open),true);await page.screenshot({path:join(artifacts,'follow-up-expanded-'+width+'.png')});await page.locator('.inbox-thread-info>summary').click();await page.evaluate(()=>inboxLiveRefresh());assert.equal(await page.locator('.inbox-thread-info').evaluate(e=>e.open),false);assert.match(await page.locator('.inbox-thread-info>summary').innerText(),/Confermato/);assert((await page.locator('#inboxTimeline').boundingBox()).height>=160);assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza demo da conservare');}
  await page.screenshot({path:join(artifacts,'follow-up-confirmed-'+width+'.png')});checks++;

  if(width<920)await page.locator('.inbox-back').click();
  await page.getByRole('button',{name:'← Torna al contesto',exact:true}).click();assert.equal(await page.locator('#pdos-title').innerText(),'Casa Aurora');assert.equal(await page.evaluate(()=>testIO.previewSession),session);checks++;
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>testIO.writes),[]);await page.close();
 }
 console.log('Journey: '+checks+' checks passed. Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(r=>server.close(r))}
