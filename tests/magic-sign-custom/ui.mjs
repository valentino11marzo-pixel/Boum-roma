// Real browser + real PDF, production editor/CSS. No live service is contacted.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { createHarnessServer, pdfBytes, rotatedPdfBytes } from './harness.mjs';
const server=createHarnessServer();
await new Promise(r=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log('Magic Sign synthetic preview: '+base);await new Promise(()=>{});}
const artifacts=await mkdtemp(join(tmpdir(),'boom-magic-sign-ui-'));
const chromium=await loadChromium();assert(chromium,'A real browser is required for Magic Sign UI tests');
let browser,checks=0;
const check=async(name,fn)=>{await fn();console.log('PASS '+name);checks++;};
const waitForPdfPaint=page=>page.waitForFunction(()=>{const c=document.querySelector('#msCanvasWrap canvas');if(!c)return false;const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let dark=0;for(let i=0;i<p.length;i+=4)if(p[i]<200&&p[i+3]>0)dark++;return dark>100;});
try{
 browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base);await page.waitForFunction(()=>window.testReady);
  await page.locator('#openStudio').click();
  await check(width+' existing contract reuses Firma ora without duplicate writes',async()=>{
   await page.getByRole('button',{name:/Contratto BOOM/}).click();await page.locator('#msBoomContract').selectOption('contract-demo');await page.getByRole('button',{name:'Apri Firma ora',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>testIO.contracts),['contract-demo']);assert.equal(await page.evaluate(()=>testIO.creations.length+testIO.uploads.length),0);assert.equal(await page.locator('#msStudio').count(),0);
  });
  await page.locator('#openStudio').click();await page.screenshot({path:join(artifacts,'choice-'+width+'.png')});
  await page.getByRole('button',{name:/PDF personalizzato/}).click();
  await page.locator('#msFile').setInputFiles({name:'Accordo-demo.pdf',mimeType:'application/pdf',buffer:pdfBytes});await page.waitForFunction(()=>_msEdit?.pageCount===2&&!_msEdit.loading);await page.waitForSelector('#msCanvasWrap canvas');
  await check(width+' PDF is really rendered and fits the viewport',async()=>{
   await waitForPdfPaint(page);
   assert.equal(await page.locator('#msTitle').inputValue(),'Accordo-demo');
   assert.equal(await page.evaluate(()=>pdfjsLib.version),'3.11.174');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  });
  await page.getByRole('button',{name:'Continua',exact:false}).click();
  await check(width+' recipient selection stays coherent and rejects malformed email',async()=>{
   await page.locator('#msTenant').selectOption('tenant-demo');assert.equal(await page.locator('#msTenantEmail').inputValue(),'marta@example.test');assert(await page.locator('#msTenantEmail').evaluate(e=>e.readOnly));
   await page.locator('#msTenant').selectOption('');assert.equal(await page.locator('#msTenantEmail').inputValue(),'');assert.equal(await page.locator('#msTenantName').inputValue(),'');
   await page.locator('#msTenantName').fill('Marta Rossi');await page.locator('#msTenantEmail').fill('marta@');await page.locator('#msLandlord').selectOption('landlord-demo');await page.locator('#msNext').click();assert.match(await page.locator('#msStatus').innerText(),/email/);
   assert.equal(await page.evaluate(()=>_msEdit.step),'signers');assert.equal(await page.evaluate(()=>testIO.creations.length),0);
   await page.locator('#msTenant').selectOption('tenant-demo');await page.locator('#msNext').click();
  });
  await page.waitForSelector('#msCanvasWrap .ms-page');
  await check(width+' dates alone cannot replace a required signature',async()=>{
   await page.locator('[data-ms-type="date_tenant"]').click();await page.locator('#msCanvasWrap .ms-page').focus();await page.keyboard.press('Enter');await page.locator('#msNext').click();assert.match(await page.locator('#msStatus').innerText(),/almeno una firma/);assert.equal(await page.evaluate(()=>_msEdit.step),'fields');
  });
  await check(width+' touch places, click selects, arrows move, removal can be undone',async()=>{
   await page.locator('[data-ms-type="sig_tenant"]').click();const sheet=page.locator('#msCanvasWrap .ms-page');await sheet.scrollIntoViewIfNeeded();await sheet.click({position:{x:70,y:100}});
   const before=await page.evaluate(()=>({n:_msEdit.fields.length,id:_msEdit.fields.at(-1).id,x:_msEdit.fields.at(-1).xr}));
   const marker=page.locator('[data-field-id="'+before.id+'"]');await marker.click();assert.equal(await page.evaluate(()=>_msEdit.fields.length),before.n);
   await page.keyboard.press('ArrowRight');assert((await page.evaluate(()=>_msEdit.fields.at(-1).xr))>before.x);
   await page.getByRole('button',{name:'Rimuovi',exact:true}).click();assert.equal(await page.evaluate(()=>_msEdit.fields.length),before.n-1);await page.getByRole('button',{name:'Annulla ultima modifica',exact:true}).click();assert.equal(await page.evaluate(()=>_msEdit.fields.length),before.n);
  });
  await check(width+' second page is reachable; every required role gets a signature',async()=>{
   await page.getByRole('button',{name:'Pagina successiva',exact:true}).click();await page.waitForSelector('#msCanvasWrap .ms-page[data-page="2"]');
   await page.locator('[data-ms-type="sig_landlord"]').click();await page.locator('#msCanvasWrap .ms-page').focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>_msEdit.fields.at(-1).page),2);await waitForPdfPaint(page);await page.screenshot({path:join(artifacts,'fields-'+width+'.png')});
   await page.locator('#msNext').click();assert.equal(await page.evaluate(()=>_msEdit.step),'review');assert.match(await page.locator('.ms-review-summary').innerText(),/Marta Rossi/);assert.match(await page.locator('.ms-review-summary').innerText(),/Luca Bianchi/);assert.match(await page.locator('.ms-review-summary').innerText(),/pag\. 2/);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await waitForPdfPaint(page);await page.screenshot({path:join(artifacts,'review-'+width+'.png')});
  });
  await check(width+' Escape protects the draft; backdrop does not discard it',async()=>{
   await page.keyboard.press('Escape');assert(await page.locator('#msDiscard').isVisible());await page.getByRole('button',{name:'Continua a lavorare',exact:true}).click();assert.equal(await page.evaluate(()=>_msEdit.fields.length),3);
   await page.locator('.ms-studio-overlay').dispatchEvent('click');assert(await page.locator('#msStudio').isVisible());
  });
  await check(width+' lost response and double-click retry the same immutable request',async()=>{
   await page.evaluate(()=>{testIO.failAfterCreate=true;testIO.delayCreate=50});await page.locator('#msSaveBtn').evaluate(button=>{button.click();button.click()});await page.waitForFunction(()=>!_msEdit.busy&&testIO.creations.length===1);assert.match(await page.locator('#msStatus').innerText(),/stessa richiesta/);
   const first=await page.evaluate(()=>testIO.creations[0]);assert.equal(await page.locator('.ms-steps button:not(:disabled)').count(),0);
   await page.locator('#msSaveBtn').click();await page.waitForSelector('.ms-studio-success');const records=await page.evaluate(()=>testIO.creations);assert.equal(records.length,2);assert.deepEqual(records[1],first);assert.equal(await page.evaluate(()=>testIO.uploads.length),1);
   assert.match(await page.locator('.ms-success-notice').innerText(),/Nessun messaggio inviato/);assert.equal(await page.locator('.ms-link-card').count(),2);assert.match(await page.locator('#mslink-tenant').inputValue(),/www\.boomrome\.com\/sign/);assert.equal(await page.evaluate(()=>S.signRequests.length),1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,'links-'+width+'.png')});
  });
  await check(width+' legacy entry without token never writes a signature',async()=>{
   await page.evaluate(async()=>{S.signRequests.push({id:'legacy',signers:{tenant:{name:'Legacy'}}});await openMagicSignRequest('legacy','tenant')});assert.match(await page.evaluate(()=>testIO.notifications.at(-1).join(' ')),/Link di firma non disponibile/);
  });
  await check(width+' unsigned legacy prepares the same request; signed legacy remains untouched',async()=>{
   await page.getByRole('button',{name:'Fatto',exact:true}).click();
   await page.evaluate(()=>{
    const seed=structuredClone(testIO.creations[0]);
    for(const signer of Object.values(seed.signers))signer.token='legacy-existing-token';
    S.signRequests.push({...seed,id:'legacy-unsigned',reqId:'legacy-unsigned',contractId:'linked-contract',leadId:'linked-lead',status:'sent'});
    document.getElementById('main').innerHTML=renderSignRequestsSection();
   });
   const uploads=await page.evaluate(()=>testIO.uploads.length);
   await page.locator('[data-ms-prepare="legacy-unsigned"]').click();await page.waitForSelector('.ms-studio-success');
   assert.equal(await page.evaluate(()=>testIO.creations.at(-1).reqId),'legacy-unsigned');assert.equal(await page.evaluate(()=>testIO.creations.at(-1).migrateLegacy),true);assert.equal(await page.evaluate(()=>testIO.creations.at(-1).contractId),'linked-contract');assert.equal(await page.evaluate(()=>testIO.creations.at(-1).leadId),'linked-lead');assert.equal(await page.evaluate(()=>testIO.uploads.length),uploads);
   assert.match(await page.locator('#mslink-tenant').inputValue(),/legacy-existing-token/);
   const requests=await page.evaluate(()=>testIO.creations.length);
   await page.evaluate(async()=>{S.signRequests.push({id:'legacy-signed',signers:{tenant:{signedAt:'2026-01-01'}}});await _msPrepareLegacy('legacy-signed')});assert.equal(await page.evaluate(()=>testIO.creations.length),requests);
   await page.getByRole('button',{name:'Fatto',exact:true}).click();
  });
  await check(width+' signed finalization states offer PDF recovery without another signature',async()=>{
   for(const status of ['finalization_pending','finalizing','finalization_failed']){
    await page.evaluate(status=>{S.signRequests=[{id:'recover-demo',title:'PDF da recuperare',status,documentVersion:1,documentHash:'hash',fields:[],requiredRoles:['tenant'],signers:{tenant:{name:'Marta',token:'recovery-token',signedAt:'2026-01-01'}}}];document.getElementById('main').innerHTML=renderSignRequestsSection()},status);
    assert.match(await page.locator('#main').innerText(),/Firme raccolte/i);assert.doesNotMatch(await page.locator('#main').innerText(),/Da firmare/i);
    await page.locator('[data-ms-recover="recover-demo"]').click();assert.match(await page.evaluate(()=>testIO.opened.at(-1)),/csign=recover-demo&role=tenant&t=recovery-token/);
   }
  });
  await check(width+' rotated PDF is rejected before upload with a usable remedy',async()=>{
   await page.evaluate(()=>openMagicSignEditor());await page.getByRole('button',{name:/PDF personalizzato/}).click();
   const uploads=await page.evaluate(()=>testIO.uploads.length);
   await page.locator('#msFile').setInputFiles({name:'Rotated.pdf',mimeType:'application/pdf',buffer:rotatedPdfBytes});await page.waitForFunction(()=>!_msEdit.loading);assert.match(await page.locator('#msStatus').innerText(),/pagine ruotate/);assert.equal(await page.evaluate(()=>_msEdit.pdfBytes),null);assert.equal(await page.evaluate(()=>testIO.uploads.length),uploads);
  });
  await check(width+' server geometry rejection keeps the whole draft editable',async()=>{
   await page.locator('#msFile').setInputFiles({name:'Accordo-demo.pdf',mimeType:'application/pdf',buffer:pdfBytes});await page.waitForFunction(()=>_msEdit.pdfDoc&&!_msEdit.loading);
   await page.evaluate(()=>{const previous=testIO.creations[0];_msEdit.fields=structuredClone(previous.fields);for(const role of ['tenant','landlord'])Object.assign(_msEdit.signers[role],previous.signers[role]);_msEdit.step='review';testIO.createError='unsupported_pdf_geometry';_msStudioRender()});
   await page.locator('#msSaveBtn').click();await page.waitForFunction(()=>!_msEdit.busy&&_msEdit.step==='document');assert.match(await page.locator('#msStatus').innerText(),/pagine ruotate o ritagliate/);assert.equal(await page.evaluate(()=>_msEdit.fields.length),3);assert.equal(await page.evaluate(()=>_msEdit.signers.tenant.name),'Marta Rossi');assert.equal(await page.evaluate(()=>_msEdit.submission),null);assert(await page.locator('#msFile').isEnabled());
  });
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Magic Sign UI: '+checks+' checks passed. Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
