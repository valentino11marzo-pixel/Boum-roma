import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {loadChromium,launchOptions} from '../_browser.mjs';
import {handler,listing,store,writes,publishHash} from './casa-fixture.mjs';
const app=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const between=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const code=between('    function openCatalogHome(', '    function listingBedrooms(')+between('    function listingBedrooms(', '    async function writeListingAvailability(');
const initial={profile:{role:'admin'},listings:[listing,store.get('listings/other')],properties:[{id:'property-1',name:'Casa Levico gestita',ownerId:'owner-1'}],users:[{id:'owner-1',role:'landlord',name:'Proprietario esempio'}],landlords:[]};
const html=()=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/catalog-home.css"></head><body><main id="main" style="padding:16px"></main><div id="modals"></div><div id="result" role="status"></div>
<script src="/js/dispo-engine.js"></script><script src="/js/listing-facts.js"></script><script src="/js/catalog-home-engine.js"></script><script src="/js/catalog-home.js"></script><script>
const S=${JSON.stringify(initial)};const auth={currentUser:{getIdToken:async()=> 'admin'}};
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function jsq(s){return String(s||'').replaceAll("'","\\'")}
function result(action,id){document.getElementById('result').textContent=action+':'+id}
function openModal(type,data){result(type,data.id)}function editListing(id){result('edit',id)}function viewProperty(id){result('property',id)}function viewUser(id){result('owner',id)}function duplicateListing(id){result('duplicate',id)}function confirmDelete(kind,id){result('remove',id)}
${code}
document.getElementById('main').innerHTML=adminflatsPage();
</script></body></html>`;
let hold=null, release=null, failHTTP=false, nextResponseDelay=null, releaseSame=null;
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/api/publisher/status') {
      if(hold && url.searchParams.get('id')==='levico')await hold;
      if(failHTTP){res.statusCode=503;res.end('{}');return;}
      req.query=Object.fromEntries(url.searchParams);
      const delay=nextResponseDelay;nextResponseDelay=null;
      res.status=c=>{res.statusCode=c;return res};res.json=o=>{
        const send=()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
        if(delay){delay.captured();delay.wait.then(send);}else send();return res;
      };
      await handler(req,res);return;
    }
    if(/^\/(css|js)\/[\w.-]+\.(js|css)$/.test(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(new URL('../..'+url.pathname,import.meta.url)));return;}
    res.setHeader('content-type','text/html');res.end(html());
  }catch(e){res.statusCode=500;res.end(String(e));}
});
const chromium=await loadChromium();if(!chromium){console.log('SKIP: Chromium absent');process.exit(0)}
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(launchOptions());
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.goto('http://127.0.0.1:'+server.address().port);
  const open=async()=>{await page.getByRole('button',{name:'Apri scheda Casa Levico',exact:true}).click();await page.getByText('Ultimo invio coerente',{exact:true}).waitFor();};
  await open();
  assert.match(await page.getByRole('dialog').innerText(),/Proprietario esempio/);
  assert.match(await page.locator('#ch-availability').innerText(),/1 gennaio 2027/);
  assert.match(await page.getByRole('dialog').innerText(),/Aggiornamento da completare/);
  assert.equal(await page.getByRole('link',{name:'Apri annuncio su Immobiliare.it'}).getAttribute('href'),'https://www.immobiliare.it/annunci/123456/');
  if(process.env.BOOM_CATALOG_EVIDENCE){mkdirSync(process.env.BOOM_CATALOG_EVIDENCE,{recursive:true});await page.screenshot({path:process.env.BOOM_CATALOG_EVIDENCE+'/ADMINFLATS_SCHEDA_MOBILE_SIMULATA.png'});await page.getByRole('heading',{name:'Annunci sui portali',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:process.env.BOOM_CATALOG_EVIDENCE+'/ADMINFLATS_PORTALI_MOBILE_SIMULATA.png'});await page.locator('.ch-content').evaluate(el=>el.scrollTop=0);}
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document width '+width);
    assert(await page.locator('.ch-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog width '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Torna al catalogo',exact:true}).focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Chiudi scheda');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Apri scheda');
  await open();await page.getByRole('button',{name:'Apri fascicolo della casa'}).click();assert.equal(await page.locator('#result').innerText(),'property:property-1');
  await open();await page.getByRole('button',{name:'Apri profilo proprietario'}).click();assert.equal(await page.locator('#result').innerText(),'owner:owner-1');
  await open();await page.getByRole('button',{name:'Aggiorna disponibilità',exact:true}).click();assert.equal(await page.locator('#result').innerText(),'availability:levico');
  await open();failHTTP=true;await page.getByRole('button',{name:'Rileggi stato'}).click();await page.getByText(/Stato dei portali non disponibile/).waitFor();
  assert.equal(await page.getByText('Ultimo invio coerente',{exact:true}).count(),0,'failed reread must not show stale success');
  failHTTP=false;await page.getByRole('button',{name:'Rileggi stato'}).click();await page.getByText('Ultimo invio coerente',{exact:true}).waitFor();
  // Another tab changes this exact listing and the publisher acknowledges
  // that version. Rereading receipts must update the visible house too.
  const originalReceipt=store.get('portalPubs/immobiliare_levico');
  function otherTab(patch){
    const current={...listing,...patch};store.set('listings/levico',current);
    store.set('portalPubs/immobiliare_levico',{...originalReceipt,hash:publishHash(current)});
  }
  async function reread(){
    const response=page.waitForResponse(r=>r.url().includes('publisher/status?id=levico'));
    await page.getByRole('button',{name:'Rileggi stato'}).click();await response;
    await page.locator('#ch-channels[aria-busy="false"]').waitFor();
  }
  otherTab({name:'Casa aggiornata',address:'Via Nuova 22',price:2100});await reread();
  assert.match(await page.locator('.ch-price').innerText(),/2[.\s]?100/,'same-ID reread must show the price used to compare the receipt');
  assert.equal(await page.locator('#ch-title').innerText(),'Casa aggiornata');
  assert.match(await page.locator('.ch-header').innerText(),/Via Nuova 22/);
  assert.equal(await page.getByText('Ultimo invio coerente',{exact:true}).count(),1);
  // The earlier response is already computed, then overtaken by another
  // reread of the SAME ID. Its old summary must not replace the newer one.
  let captured;
  const hasCaptured=new Promise(r=>captured=r);
  nextResponseDelay={wait:new Promise(r=>releaseSame=r),captured};
  await page.getByRole('button',{name:'Rileggi stato'}).click();await hasCaptured;
  otherTab({name:'Casa più recente <b>testo</b>',address:'Via Ultima 33',price:2300});await reread();
  const oldResponse=page.waitForResponse(r=>r.url().includes('publisher/status?id=levico'));
  releaseSame();await oldResponse;await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.match(await page.locator('.ch-price').innerText(),/2[.\s]?300/,'late same-ID response must not restore the old price');
  assert.equal(await page.locator('#ch-title').innerText(),'Casa più recente <b>testo</b>');
  assert.equal(await page.locator('#ch-title b').count(),0,'remote name remains text');
  assert.match(await page.locator('.ch-header').innerText(),/Via Ultima 33/);
  // Failed reread removes the receipt claim, preserves the last displayed
  // version and lets a retry replace all its fields, including absent ones.
  otherTab({name:'',address:'',zone:'Zona aggiornata',price:null});failHTTP=true;await reread();
  assert.match(await page.locator('.ch-price').innerText(),/2[.\s]?300/);
  assert.equal(await page.getByText('Ultimo invio coerente',{exact:true}).count(),0);
  assert.match(await page.locator('#ch-channels').innerText(),/non disponibile/);
  failHTTP=false;await reread();
  assert.equal(await page.locator('.ch-price').innerText(),'Canone da verificare');
  assert.equal(await page.locator('#ch-title').innerText(),'Casa senza nome');
  assert.match(await page.locator('.ch-header').innerText(),/Zona aggiornata/);
  store.set('listings/levico',listing);store.set('portalPubs/immobiliare_levico',originalReceipt);
  await page.getByRole('button',{name:'Chiudi scheda'}).click();
  hold=new Promise(r=>release=r);
  await page.getByRole('button',{name:'Apri scheda Casa Levico',exact:true}).click();
  await page.getByRole('button',{name:'Chiudi scheda'}).click();
  await page.getByRole('button',{name:'Apri scheda Altra casa',exact:true}).click();
  await page.getByText('Gestione da collegare',{exact:true}).waitFor();
  const late=page.waitForResponse(r=>r.url().includes('publisher/status?id=levico'));release();await late;hold=null;
  await page.locator('#ch-channels[aria-busy="false"]').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Altra casa',exact:true}).count(),1);
  assert.equal(await page.getByText('Ultimo invio coerente',{exact:true}).count(),0,'late response must not replace another house');
  assert.equal(await page.getByRole('button',{name:'Apri fascicolo della casa'}).count(),0);
  await page.getByRole('button',{name:'Chiudi scheda'}).click();await open();
  await page.evaluate(()=>S.properties[0].ownerId='different-owner');
  await page.getByRole('button',{name:'Apri profilo proprietario'}).click();
  assert.equal(await page.getByRole('button',{name:'Apri profilo proprietario'}).count(),0,'owner action rechecks current identity');
  assert.deepEqual(errors,[]);assert.equal(writes.length,0);
  console.log('PASS catalogocasaui: actual Catalogo click → actual HTTP handler → receipts; 320/390/1280px, same-ID remote changes refresh house+receipts, late same-ID response discarded, failed reread/retry, exact destinations, focus, changed owner; no writes.');
}finally{release?.();releaseSame?.();await browser.close();await new Promise(r=>server.close(r));}
