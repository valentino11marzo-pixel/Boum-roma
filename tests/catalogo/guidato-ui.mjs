// Real Portal intake, photo processor, mobile layer and save function. Only service boundaries simulated.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {loadChromium,launchOptions} from '../_browser.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const app=read('js/portal-app.js');
const part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const code=part('    function adminflatsPage()', '    function editListing(')+part('    function openModal(type, data)', '    // La search globale')+part('    function getModal(type, data)', '    function updateInvAmount(');
const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${['portal','portal-finish','portal-mobile','listing-guide'].map(x=>`<link rel="stylesheet" href="/css/${x}.css">`).join('')}</head><body><div id="app" class="app active"><div class="layout"><main id="main" class="main"></main></div></div><div id="modals"></div><p id="result" role="status"></p>
${['dispo-engine','listing-facts','smartlink-photo','listing-guide'].map(x=>`<script src="/js/${x}.js"></script>`).join('')}
<script>
var S={listings:[],profile:{role:'admin'},user:{email:'test@example.invalid'}};
var auth={currentUser:{uid:'admin',getIdToken:async()=> 'test'}},selectedFile=null,listingImageUrl='',uploadingImage=false;
var writes=[],uploads=[],records={},idCalls=0,failUpload=false,loseAck=false,txCalls=0,refreshFail=false,smartOpened=0,changeOnGet=false,changeOnCommit=false;
var firebase={firestore:{FieldValue:{serverTimestamp:()=> 'test-time'}}};
function isAdmin(){return S.profile.role==='admin'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function jsq(s){return String(s||'')}
function toast(...args){document.getElementById('result').textContent=args.join(' · ')}
function logActivity(){}
function initImageUpload(){}
function goTo(){}
function openExternalSmartLink(){smartOpened++}
async function refresh(){if(refreshFail){refreshFail=false;throw Error('Refresh failed')}S.listings=Object.entries(records).map(([id,l])=>({id,...l}));document.getElementById('main').innerHTML=adminflatsPage()}
var db={collection:()=>({doc:()=>({id:'house-'+(++idCalls)})}),runTransaction:async fn=>{txCalls++;await new Promise(r=>setTimeout(r,60));await fn({get:async ref=>{if(changeOnGet){auth.currentUser.uid='new-admin';document.getElementById('modals').innerHTML='<div id=next-session>Nuova sessione</div>';}return {exists:!!records[ref.id]}},set:(ref,data)=>{records[ref.id]=structuredClone(data);writes.push({id:ref.id,data:structuredClone(data)})}});if(changeOnCommit){auth.currentUser.uid='new-admin';document.getElementById('modals').innerHTML='<div id=next-session>Nuova sessione</div>';}if(loseAck){loseAck=false;throw Error('Lost acknowledgement')}}};
var storage={ref:path=>({put:async blob=>{uploads.push(path);if(failUpload&&uploads.length===2)throw Error('Upload interrotto');await new Promise(r=>setTimeout(r,15));},getDownloadURL:async()=> location.origin+'/images/'+encodeURIComponent(path)})};
${code}
refresh();
</script><script src="/js/portal-mobile.js"></script></body></html>`;
const server=createServer((req,res)=>{
 if(/^\/(css|js)\/[\w.-]+\.(js|css)$/.test(req.url)){res.setHeader('content-type',req.url.endsWith('.js')?'text/javascript':'text/css');return res.end(read(req.url.slice(1)));}
 res.setHeader('content-type','text/html');res.end(html);
});
const chromium=await loadChromium();if(!chromium)throw Error('Browser required for guided listing test');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(launchOptions());
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const start=async()=>{await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'+ Nuova casa guidata',exact:true}).click();await page.locator('.lg-progress').waitFor();};
 const next=()=>page.locator('[data-lg-next]').click();
 const fillBase=async()=>{await page.locator('[name=name]').fill('Casa "Roma" <b>test</b>');await page.locator('[name=zone]').fill('Trieste');await page.locator('[name=bedrooms]').fill('0');await next();await page.locator('[name=price]').fill('1400');};
 const photoFiles=async()=>page.evaluate(async()=>{const result=[];for(const color of ['red','blue']){const c=document.createElement('canvas');c.width=2800;c.height=1600;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,2800,1600);result.push(c.toDataURL().split(',')[1]);}return result;});
 const addPhotos=async()=>{const data=await photoFiles();await page.getByLabel('Aggiungi foto',{exact:true}).setInputFiles(data.map((b,i)=>({name:'room-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(b,'base64')})));await page.locator('.lg-status').filter({hasText:'2 foto pronte'}).waitFor();};
 const toReview=async()=>{await fillBase();await next();await addPhotos();await next();};
 await start();await next();assert.equal(await page.locator('.lg-count').textContent(),'1 / 4','blank required field blocked');
 await fillBase();
 await page.locator('[name=availableMode]').selectOption('date');await next();assert.equal(await page.locator('.lg-count').textContent(),'2 / 4','date must be supplied');
 await page.locator('[name=availableMode]').selectOption('unknown');await next();await next();assert.equal(await page.locator('.lg-count').textContent(),'3 / 4','missing photos blocked');
 await addPhotos();
 assert.deepEqual(await page.evaluate(()=>({writes:writes.length,uploads:uploads.length})),{writes:0,uploads:0},'before confirmation no upload/write');
 const first=await page.locator('.lg-photo img').first().getAttribute('src');
 await page.getByLabel('Usa foto 2 come copertina').click();assert.notEqual(await page.locator('.lg-photo img').first().getAttribute('src'),first);
 await page.getByLabel('Sposta foto 1 dopo').click();assert.equal(await page.locator('.lg-photo img').first().getAttribute('src'),first);
 await page.getByLabel('Usa foto 2 come copertina').click();await next();
 assert.match(await page.locator('.lg-review').innerText(),/Monolocale/);assert.equal(await page.locator('.lg-review h3 b').count(),0,'name stays text');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);assert(await page.locator('[data-lg-next]').isVisible());const box=await page.locator('[data-lg-next]').boundingBox();assert(box.y>=0&&box.y+box.height<=844,'publish visible in viewport '+width+' '+JSON.stringify(box));}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:process.env.BOOM_GUIDE_SCREENSHOT || '/tmp/boom-catalogo-guidato-review.png',animations:'disabled'});
 await page.evaluate(()=>{loseAck=true});
 await next();await page.locator('.lg-status').filter({hasText:'Esito non confermato'}).waitFor();
 assert.equal(await page.evaluate(()=>writes.length),1);const original=await page.evaluate(()=>structuredClone(writes[0]));
 assert.equal(original.data.bedrooms,0);assert.equal(original.data.furnished,'');assert.equal(original.data.availableKind,'unknown');assert.equal(original.data.image,original.data.images[0]);assert.equal(original.data.images.length,2);assert.deepEqual(original.data.imagesOriginal,original.data.images);assert.equal(original.data.file,'apartment-detail.html?id='+original.id);
 // A real update after the lost acknowledgement must not be overwritten by retry.
 await page.evaluate(()=>records['house-1'].price=1550);await next();await page.waitForFunction(()=>!document.querySelector('#mForm'));
 assert.deepEqual(await page.evaluate(()=>({writes:writes.length,uploads:uploads.length,ids:idCalls,price:records['house-1'].price})),{writes:1,uploads:2,ids:1,price:1550});
 // A failed second upload reuses the completed first, then writes once.
 await start();await toReview();await page.evaluate(()=>{failUpload=true});await next();await page.locator('.lg-status').filter({hasText:'Upload interrotto'}).waitFor();assert.equal(await page.evaluate(()=>writes.length),0);await next();await page.waitForFunction(()=>!document.querySelector('#mForm'));assert.equal(await page.evaluate(()=>uploads.length),3);assert.equal(await page.evaluate(()=>writes.length),1);
 // Changing session before confirmation cannot upload, publish or borrow another admin session.
 await start();await toReview();await page.evaluate(()=>auth.currentUser.uid='other-admin');await next();await page.locator('.lg-status').filter({hasText:'Accesso amministratore'}).waitFor();assert.equal(await page.evaluate(()=>uploads.length+writes.length),0);
 // Logout during transaction read prevents writing; a late commit cannot affect the new screen.
 for(const flag of ['changeOnGet','changeOnCommit']) {
   await start();await toReview();await page.evaluate(f=>window[f]=true,flag);await next();await page.locator('#next-session').waitFor();
   await page.waitForFunction(()=>!document.querySelector('.lg-status'));
   assert.equal(await page.evaluate(()=>writes.length),flag==='changeOnGet'?0:1,'transaction session '+flag);
   assert.equal(await page.locator('#next-session').textContent(),'Nuova sessione');
   assert.equal(await page.locator('#result').textContent(),'','no stale success/error');
 }
 // Empty and invalid files have a visible error; no token call or network write.
 await start();await fillBase();await next();await page.getByLabel('Aggiungi foto',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});await page.locator('.lg-status').filter({hasText:'foto non aggiunte'}).waitFor();assert.equal(await page.locator('.lg-photo').count(),0);
 await page.getByRole('button',{name:'Indietro',exact:true}).click();await page.getByRole('button',{name:'Indietro',exact:true}).click();await page.getByRole('button',{name:'Chiudi',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#mForm'));await page.getByRole('button',{name:'↗ SmartLink esterno'}).click();assert.equal(await page.evaluate(()=>smartOpened),1);
 assert.deepEqual(errors,[]);console.log('PASS catalogoguidato: real four-step form + M2, 320/390/1280, validation, image processing/order, confirmation, lost acknowledgement/concurrent edit, partial upload retry, changed session and SmartLink. Zero real writes/models.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
