// Actual document buttons and helpers in Chromium. All records and HTTP are synthetic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { loadChromium, launchOptions } from '../_browser.mjs';
const source=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const named=n=>{const m=new RegExp('^    (?:async )?function '+n+'\\(','m').exec(source);assert(m,n);const end=source.slice(m.index+5).search(/\n    (?:async )?function /);return source.slice(m.index,m.index+5+end);};
const chromium=await loadChromium();assert(chromium,'Playwright required; set BOOM_PLAYWRIGHT');
const browser=await chromium.launch(launchOptions());
let count=0;
try {
 const context=await browser.newContext({acceptDownloads:true});
 const doc=new jsPDF();doc.text('Synthetic signed document',20,20);const bytes=Buffer.from(doc.output('arraybuffer'));
 const requests=[];
 await context.route('**/*',async route=>{requests.push(route.request().url());if(route.request().url()==='https://storage.invalid/signed.pdf')await route.fulfill({status:200,contentType:'application/pdf',headers:{'access-control-allow-origin':'*'},body:bytes});else await route.abort();});
 const page=await context.newPage();
 await page.setContent('<button id="download" onclick="downloadContractPDF(\'c1\')">Scarica PDF</button><button id="preview" onclick="previewContractPDF(\'c1\')">Anteprima</button><div id="status"></div>');
 await page.addScriptTag({content:`
 window.record={propertyId:'p1',tenantId:'t1',generatedPDF:'https://storage.invalid/stale.pdf',signedPdfUrl:'https://storage.invalid/signed.pdf'};
 window.S={contracts:[{id:'c1',generatedPDF:'https://storage.invalid/stale.pdf'}],properties:[{id:'p1',name:'Casa prova'}],users:[{id:'t1',name:'Persona prova'}]};
 window.toasts=[];window.toast=(...a)=>{toasts.push(a);document.getElementById('status').textContent=a.slice(1).join(' ');};window.isAdmin=()=>true;
 window.db={collection:()=>({doc:()=>({get:options=>{if(options.source!=='server')throw Error('server read required');return new Promise((resolve,reject)=>window.completeRead=ok=>ok?resolve({exists:true,data:()=>record}):reject(Error('synthetic read failure')));},update:()=>{throw Error('unexpected contract write');}})})};
 window.firebase={storage:()=>{throw Error('unexpected upload');}};
 `+['boomSave','boomOpen','boomDownloadUrl','readContractPDF','downloadContractPDF','previewContractPDF'].map(named).join('\n')});
 const downloaded=page.waitForEvent('download',{timeout:5000});
 await page.locator('#download').click();
 await page.evaluate(()=>completeRead(true));
 const file=await downloaded;
 assert.equal(file.suggestedFilename(),'Contratto_Casa_prova_Persona_prova_Firmato.pdf');count++;
 assert.equal(await file.failure(),null);count++;
 assert.deepEqual(requests,['https://storage.invalid/signed.pdf']);count++;
 const pending=context.waitForEvent('page');await page.locator('#preview').click();const popup=await pending;
 await popup.waitForLoadState();assert.equal(await popup.locator('body').innerText(),'Caricamento del PDF…');count++;
 assert.equal(await popup.evaluate(()=>window.opener),null);count++;
 const closed=popup.waitForEvent('close',{timeout:5000});await page.evaluate(()=>completeRead(false));await closed;
 assert(popup.isClosed());count++;
 assert.match(await page.locator('#status').innerText(),/connessione.*riprova/);count++;
 const pending2=context.waitForEvent('page');await page.locator('#preview').click();const legacyPopup=await pending2;
 const legacyDownload=page.waitForEvent('download',{timeout:5000});
 await page.evaluate(()=>{record={generatedPDF:'data:application/pdf;base64,JVBERi0='};completeRead(true);});
 const legacy=await legacyDownload;assert.equal(legacy.suggestedFilename(),'Contratto.pdf');count++;
 assert(legacyPopup.isClosed());count++;
 console.log(`${count} passed, 0 failed`);
} finally {await browser.close();}
