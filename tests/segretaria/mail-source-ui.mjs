// Production Home/Inbox renderers and real scan-replies handler, synthetic IO.
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadChromium,launchOptions} from '../_browser.mjs';
import {createHarnessServer} from '../portal-workspace/harness.mjs';
import * as F from './mail-source-fixture.mjs';
const server=createHarnessServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const artifacts=await mkdtemp(join(tmpdir(),'boom-mail-source-ui-'));let browser,checks=0;
try{
 const chromium=await loadChromium();assert(chromium);browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [390,1280]){
  F.resetTransport();const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(8000);
  const errors=[],external=[],calls=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/mail-source-api'))calls.push({method:r.method(),body:r.postData()});});
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():(external.push(route.request().url()),route.abort()));
  const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+width+' '+name)};
  const openThread=async()=>{await page.evaluate(()=>goTo('inbox'));await page.locator('[onclick="inboxSelect(\'conv-a\')"]').click();if(!await page.locator('.inbox-thread-info').evaluate(e=>e.open))await page.locator('.inbox-thread-info>summary').click();};
  await page.goto(base+'/workspace#oggi');await page.waitForFunction(()=>window.testReady);await page.waitForTimeout(100);
  await check('opening Home sources performs no mail scan',async()=>{
   await page.waitForFunction(()=>S.mailSources&&!S.mailSources.checking);
   await page.locator('.ow-search-sources>summary').click();assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');assert.equal(__mail.connections,0);
   await page.getByRole('button',{name:'Verifica collegamenti',exact:true}).click();await page.waitForFunction(()=>S.mailSources&&!S.mailSources.checking);
   assert.equal(calls.length,2);assert(calls.every(c=>c.method==='GET'));assert.equal(__mail.connections,0);assert.equal(F.writes.length,0);
   const text=await page.locator('#portalMailSourceStatus').innerText();assert.match(text,/configurata, lettura non ancora verificata/);assert.match(text,/Ricezione WhatsApp non verificata/);assert.match(text,/non tutta la casella/);
   await page.screenshot({path:join(artifacts,'sources-'+width+'.png')});
  });
  await openThread();
  await check('first email-only chat selects a usable email composer',async()=>{assert(await page.locator('#inboxSubject').isVisible());assert(await page.getByRole('button',{name:'✉ Invia email',exact:true}).isVisible());assert.equal(await page.evaluate(()=>_inboxState.composing),'email')});
  F.mail(1,'tenant@example.invalid');
  await page.locator('#inboxBody').fill('Bozza da mantenere');await page.locator('#inboxSubject').fill('Oggetto da mantenere');
  await check('explicit import uses exact chat; repeat tap is single flight and preserves drafts',async()=>{
   await page.evaluate(()=>{window.nativeToken=auth.currentUser.getIdToken;auth.currentUser.getIdToken=()=>new Promise(r=>window.releaseMailToken=r);void inboxImportEmail('conv-a');void inboxImportEmail('conv-a');});
   assert.equal(await page.locator('[aria-label="Importazione email"] button').isDisabled(),true);
   assert.equal(calls.filter(c=>c.method==='POST').length,0);await page.evaluate(()=>{auth.currentUser.getIdToken=window.nativeToken;releaseMailToken('fixture');});
   await page.waitForFunction(()=>!S.mailSources.syncBusy);assert.equal(calls.filter(c=>c.method==='POST').length,1);
   assert.deepEqual(JSON.parse(calls.find(c=>c.method==='POST').body),{mode:'sync_only',conversationId:'conv-a'});
   assert.match(await page.locator('[aria-label="Importazione email"] [role="status"]').innerText(),/1 importate.*Nessuna risposta inviata/);
   assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza da mantenere');assert.equal(await page.locator('#inboxSubject').inputValue(),'Oggetto da mantenere');
   assert.equal(F.external.length,0);assert.equal(__mails.length,0);assert.equal([...F.DB.values()].filter(x=>x.emailMessageId).length,1);
   await page.screenshot({path:join(artifacts,'imported-'+width+'.png')});
  });
  await check('conversation changed during token wait prevents the request',async()=>{
   const before=calls.length;await page.evaluate(()=>{auth.currentUser.getIdToken=()=>new Promise(r=>window.releaseMailToken=r);void inboxImportEmail('conv-a');inboxSelect('conv-b');});
   await page.evaluate(()=>{auth.currentUser.getIdToken=window.nativeToken;releaseMailToken('fixture');});await page.waitForFunction(()=>!S.mailSources.syncBusy);
   assert.equal(calls.length,before);assert.equal(await page.evaluate(()=>_inboxState.convId),'conv-b');assert.equal(await page.locator('#inboxBody').inputValue(),'');assert.equal(await page.evaluate(()=>_inboxState.composing),'note');assert(await page.getByRole('button',{name:'✓ Salva nota',exact:true}).isVisible());
  });
  await check('same-uid session replacement during token wait prevents the request',async()=>{
   await page.evaluate(()=>inboxSelect('conv-a'));const before=calls.length;
   await page.evaluate(()=>{auth.currentUser.getIdToken=()=>new Promise(r=>window.releaseMailToken=r);void inboxImportEmail('conv-a');portalSessionGeneration++;});
   await page.evaluate(()=>{auth.currentUser.getIdToken=window.nativeToken;releaseMailToken('fixture');});await page.waitForFunction(()=>!S.mailSources.syncBusy);assert.equal(calls.length,before);
  });
  await check('late response cannot render into another conversation',async()=>{
   let release,arrived;const received=new Promise(r=>arrived=r),hold=new Promise(r=>release=r);
   await page.route('**/mail-source-api',async route=>{const response=await route.fetch();arrived();await hold;await route.fulfill({response});});
   await page.evaluate(()=>{void inboxImportEmail('conv-a')});await received;await page.evaluate(()=>inboxSelect('conv-b'));release();await page.waitForFunction(()=>!S.mailSources.syncBusy);
   assert.equal(await page.evaluate(()=>_inboxState.convId),'conv-b');assert.equal(await page.locator('#inboxBody').inputValue(),'');assert.equal(await page.locator('[aria-label="Importazione email"]').count(),0);
   await page.unroute('**/mail-source-api');
  });
  await check('missing server configuration is explicit and draft remains',async()=>{
   delete process.env.PFS_IMAP_PASS;await page.evaluate(()=>inboxSelect('conv-a'));if(!await page.locator('.inbox-thread-info').evaluate(e=>e.open))await page.locator('.inbox-thread-info>summary').click();
   await page.getByRole('button',{name:'Importa email recenti',exact:true}).click();await page.waitForFunction(()=>!S.mailSources.syncBusy);
   assert.match(await page.locator('[aria-label="Importazione email"] [role="status"]').innerText(),/non configurata sul server/);assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza da mantenere');
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
 }
 console.log(`Mail source UI: ${checks} passed. Screenshots: ${artifacts}`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
