// Actual Portal functions -> HTTP handler -> conditional Firestore -> visible receipt.
// Synthetic records only; no model, Telegram or external publication.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { loadChromium, launchOptions } from '../_browser.mjs';
const require = createRequire(import.meta.url);
const D = require('../../js/dispo-engine.js');
D.todayIso = () => '2026-10-17';
process.env.WIZARD_SECRET = 'catalog-test';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
const store = new Map([
  ['listings/levico', {name:'Levico', zone:'Trieste', price:1300, status:'available', availableFrom:'2027-01-01'}],
  ['listings/cavour', {name:'Cavour', zone:'Monti', price:1500, status:'available', availableDate:'Mar 1'}],
  ['listings/vecchia', {name:'Casa Vecchia', price:1100, status:'rented', availableDate:'Subito'}],
  ['users/admin', {role:'admin'}]
]);
const versions = new Map();
const denied = new Set();
const rows = () => [...store].filter(([k])=>k.startsWith('listings/')).map(([k,v])=>({id:k.split('/')[1],...v}));
const enc = v => v == null ? {nullValue:null} : typeof v === 'number' ? {integerValue:String(v)} : {stringValue:String(v)};
const dec = v => 'nullValue' in v ? null : 'integerValue' in v ? Number(v.integerValue) : v.stringValue;
const doc = (p,d) => ({name:'projects/p/databases/(default)/documents/'+p,updateTime:String(versions.get(p)||1),fields:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,enc(v)]))});
const json = (value,status=200) => ({ok:status<400,status,json:async()=>value,text:async()=>JSON.stringify(value)});
globalThis.fetch = async (url,opts={}) => {
  const u=String(url), b=opts.body ? JSON.parse(opts.body) : {};
  if(u.includes('identitytoolkit')) return json({idToken:'test',users:[{localId:'admin'}]});
  if(u.endsWith(':runQuery')) return json([...store].filter(([p])=>p.startsWith(b.structuredQuery.from[0].collectionId+'/')).map(([p,d])=>({document:doc(p,d)})));
  if(u.endsWith(':commit')) {
    for(const w of b.writes){const p=w.update.name.split('/documents/')[1];
      if(denied.has(p)) return json({error:{status:'UNAVAILABLE'}},503);
      if(w.currentDocument.updateTime!==String(versions.get(p)||1)) return json({error:{status:'FAILED_PRECONDITION'}},409);
    }
    for(const w of b.writes){const p=w.update.name.split('/documents/')[1];store.set(p,{...store.get(p),...Object.fromEntries(Object.entries(w.update.fields).map(([k,v])=>[k,dec(v)]))});versions.set(p,(versions.get(p)||1)+1);}
    return json({writeResults:[]});
  }
  const p=u.match(/documents\/([^?]+)/)?.[1];
  if(opts.method==='POST') return json({name:'activityLogs/test'});
  if(store.has(p))return json(doc(p,store.get(p)));
  return json({error:{status:'NOT_FOUND'}},404);
};
const {default:handler}=await import('../../api/listings-availability.js');
const app=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const between=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const modal=between("        if (type === 'availability')", "        if (type === 'notifications')");
const code=[
  between('    function adminflatsPage()', '    function listingBedrooms('),
  between('    function listingBedrooms(', '    function editListing('),
].join('\n') + '\n' + between('    let AVAIL_PLAN', '    // ═════════') + '\nfunction getModal(type,data){'+modal+'return "";}';
const html=()=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"></head><body><main id="main" style="padding:16px"></main><div id="modals"></div><div id="result" role="status"></div>
<script src="/js/dispo-engine.js"></script><script src="/js/listing-facts.js"></script><script>
const S={listings:${JSON.stringify(rows())},user:{email:'test@example.invalid'}};
const auth={currentUser:{getIdToken:async()=> 'admin-token'}};
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function jsq(s){return String(s||'')}
function toast(...args){document.getElementById('result').textContent=args.join(' · ')}
function openModal(type,data){document.getElementById('modals').innerHTML=getModal(type,data);document.querySelector('.modal-overlay')?.classList.add('active')}
function closeModal(){document.getElementById('modals').innerHTML=''}
async function refresh(){S.listings=await (await fetch('/fixture')).json();document.getElementById('main').innerHTML=adminflatsPage()}
function editListing(){}
${code}
document.getElementById('main').innerHTML=adminflatsPage();
</script></body></html>`;
const server=createServer(async(req,res)=>{
  try {
    if(req.url==='/api/listings-availability') {
      let body='';for await(const chunk of req)body+=chunk;
      req.body=body;
      res.status=c=>{res.statusCode=c;return res};res.json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));return res};
      await handler(req,res);return;
    }
    if(req.url==='/fixture'){res.setHeader('content-type','application/json');res.end(JSON.stringify(rows()));return;}
    if(/^\/(css|js)\/[\w.-]+\.(js|css)$/.test(req.url)){res.setHeader('content-type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(new URL('../..'+req.url,import.meta.url)));return;}
    res.setHeader('content-type','text/html');res.end(html());
  }catch(e){res.statusCode=500;res.end(String(e));}
});
const chromium=await loadChromium();
if(!chromium){console.log('SKIP: Chromium assente');process.exit(0)}
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(launchOptions());
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('browser:',e.message)});
 page.setDefaultTimeout(10000);
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('heading',{name:'🏢 Catalogo case'}).waitFor();
 for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'catalog width '+width);
 }
 await page.setViewportSize({width:390,height:844});
 assert.match(await page.locator('#main').innerText(),/Libera dal 2027-01-01/i);
 assert.match(await page.locator('#main').innerText(),/Da verificare/i);
 await page.getByRole('button',{name:'📅 Disponibilità',exact:true}).click();
 await page.locator('#availMsg').fill('Levico dal 1 dicembre 2027, Cavour subito');
 await page.getByRole('button',{name:'Leggi il messaggio'}).click();
 denied.add('listings/cavour');
 await page.locator('#availApply').click();
 await page.getByRole('status').filter({hasText:'1 aggiornate, 1 da completare'}).waitFor();
 assert.equal(store.get('listings/levico').availableFrom,'2027-12-01');
 assert.equal(store.get('listings/cavour').availableDate,'Mar 1');
 assert.match(await page.locator('#availPlan').innerText(),/Cavour: non salvata/);
 denied.clear();
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.getByRole('button',{name:'📅 Disponibilità',exact:true}).click();
 const row=page.locator('#modals tr').filter({hasText:'Levico'});
 store.get('listings/levico').availableFrom='2028-01-01';
 await row.getByLabel('Disponibile dal').fill('2027-11-01');
 await row.getByLabel('Disponibile dal').dispatchEvent('change');
 await page.getByRole('status').filter({hasText:'cambiata nel frattempo'}).waitFor();
 assert.equal(store.get('listings/levico').availableFrom,'2028-01-01');
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'📅 Disponibilità',exact:true}).click();
 await page.locator('#modals tr').filter({hasText:'Casa Vecchia'}).getByRole('button',{name:'Libera ora',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Catalogo salvato'}).waitFor();
 assert.equal(store.get('listings/vecchia').status,'available');
 assert.equal(store.get('listings/vecchia').availableFrom,'Subito');
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.screenshot({path:process.env.BOOM_CATALOG_SCREENSHOT || '/tmp/boom-catalogo-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Catalogo UI → API reale → dati → esito: 320/390/1280, aggiornamento, parziale, conflitto e riapertura — passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}
