// Real portal controllers in Chromium; HTTP routes run real server handlers.
// Only auth, Firestore/Storage and SMTP cross an in-memory boundary.
import {readFileSync} from 'node:fs';
import {loadChromium,launchOptions} from '../_browser.mjs';
import {reset,call,current,PDF,storage,assert,DB} from './fixture.mjs';
const chromium=await loadChromium();if(!chromium)throw Error('Chromium required: set BOOM_PLAYWRIGHT');
const source=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('    const ASPI_ALLEGABILI'),source.indexOf('    // 🔗 Share Hub —'));
const css=['portal.css','portal-mobile.css','portal-desktop.css'].map(p=>readFileSync(new URL('../../css/'+p,import.meta.url),'utf8')).join('\n');
const html=`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body><div id="modals"></div><script>
window.S={contracts:[],deadlines:[]};window.auth={currentUser:{uid:'admin',getIdToken:async()=>'synthetic'}};
window.esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.toast=(type,message)=>{window.messages.push({type,message})};window.messages=[];
window.closeModal=()=>{document.getElementById('modals').innerHTML=''};window.renderPage=()=>{};
window.storage={ref:path=>({put:async file=>window.fixturePut(path,Array.from(new Uint8Array(await file.arrayBuffer()))),getDownloadURL:async()=> 'https://firebasestorage.googleapis.com/v0/b/delivery-test.firebasestorage.app/o/'+encodeURIComponent(path)+'?alt=media&token=synthetic'})};
${code}
</script></body></html>`;
const browser=await chromium.launch(launchOptions());let n=0;
try{
for(const width of [390,1280]){
 reset();const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('fixturePut',(path,bytes)=>{storage.set(path,Buffer.from(bytes));});
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='boom.test'&&u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(u.hostname==='boom.test'&&u.pathname==='/api/fiscal/registra'){
     const b=route.request().postDataJSON();requests.push(b);
     const r=await call(b);return route.fulfill({status:r.code,contentType:'application/json',body:JSON.stringify(r.body)});
   }
   if(u.pathname==='/api/fiscal/fascicolo')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
   throw Error('Unexpected browser network '+u.href);
 });
 await page.goto('https://boom.test/');await page.evaluate(()=>openAspi('c1'));
 await page.getByText('Hai firmato fuori da Magic Sign? Carica il definitivo',{exact:true}).click();
 await page.locator('#extSignedFile').setInputFiles({name:'signed.pdf',mimeType:'application/pdf',buffer:width===390?Buffer.concat([PDF,Buffer.alloc(3*1024*1024)]):PDF});
 await page.locator('#extSignedDate').fill('2026-10-14');
 await page.getByRole('button',{name:'Acquisisci firmato e continua'}).click();
 assert.equal(requests.filter(x=>x.op==='external-adopt').length,0);
 await page.locator('#extComplete').check();await page.locator('#extTerms').check();
 await page.getByRole('button',{name:'Acquisisci firmato e continua'}).click();
 await page.getByText('Contratto firmato esternamente · stessa pratica',{exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log('UI DEBUG',await page.locator('#externalStatus').textContent(),errors,requests.map(x=>x.op));await page.screenshot({path:'/private/tmp/boom-external-debug.png',fullPage:true});throw e;});
 assert.equal(current().signatureStatus,'complete');assert.equal(requests.filter(x=>x.op==='external-adopt').length,1);
 assert.equal(await page.getByRole('link',{name:'Dati per RLI',exact:true}).count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'No horizontal scroll');
 await page.locator('#extStage').selectOption('awaiting_spid');await page.locator('#extReference').fill('DRAFT-2026');await page.locator('#extProgressNote').fill('Accesso SPID e verifica riepilogo');
 await page.getByRole('button',{name:'Salva avanzamento',exact:true}).click();
 await page.waitForFunction(()=>window._aspiStatus.external.progress?.stage==='awaiting_spid');
 assert.notEqual(current().registrationStatus,'registered');
 await page.getByRole('button',{name:'✓ Registrato: carica ricevuta',exact:true}).click();
 await page.locator('#regDate').fill('2026-10-15');await page.locator('#regCode').fill('TXX26T012345000AB');
 await page.locator('#regFile').setInputFiles({name:'receipt.pdf',mimeType:'application/pdf',buffer:PDF});await page.locator('#regNotify').uncheck();
 await page.getByRole('button',{name:'Salva',exact:true}).click();
 await page.waitForFunction(()=>window.messages.some(m=>m.type==='error'&&m.message.includes('esito positivo')));
 assert.notEqual(current().registrationStatus,'registered');
 await page.locator('#regEvidence').check();await page.getByRole('button',{name:'Salva',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#regSaveBtn')===null);
 assert.equal(current().registrationStatus,'registered');
 assert.equal([...DB.keys()].filter(k=>k.startsWith('documents/registration-receipt_')).length,3);
 await page.evaluate(()=>openAspi('c1'));await page.locator('section[aria-label="Percorso registrazione"]').waitFor();await page.screenshot({animations:'disabled',path:'/private/tmp/boom-external-'+width+'.png',fullPage:true});
 assert.deepEqual(errors,[]);n++;console.log('PASS actual portal → server → archives at '+width+'px');await page.close();
}
}finally{await browser.close();}
console.log(`External UI: ${n} browser journeys passed`);
