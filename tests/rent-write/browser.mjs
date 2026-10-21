// Local synthetic end-to-end harness. Never reads production credentials/data.
import http from 'node:http';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {store,seed,handler} from './network.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=readFileSync(root+'js/portal-app.js','utf8');
const controller=source.slice(source.indexOf('    function initRentWriteForm('),source.indexOf('    async function markPaymentPaid('))+source.slice(source.indexOf('    async function updatePayment('),source.indexOf('    async function updateMaintenance('));
const open=source.slice(source.indexOf('    function openModal(type, data)'),source.indexOf('\n    // La search globale',source.indexOf('    function openModal(type, data)')));
const fill=source.slice(source.indexOf('    function fillPayAmount('),source.indexOf('\n',source.indexOf('    function fillPayAmount(')));
const state=()=>Object.fromEntries(['contracts','users','properties','payments'].map(c=>[c,[...store].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({...v,id:k.split('/')[1]}))]));
seed();let lostResponse=false;
const html=`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BOOM · Collaudo rate · dati sintetici</title><link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"><body><main style="padding:24px"><p style="color:var(--gold);letter-spacing:2px">BOOM / COLLAUDO · DATI SINTETICI</p><h1 style="margin:16px 0">Canoni affidabili</h1><p>Form e API reali. Archivio di prova isolato in memoria.</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0"><button class="btn" onclick="openModal('addPayment')">Nuova rata</button><button class="btn btn-secondary" onclick="openModal('bulkPayments')">Genera rate</button><button class="btn btn-secondary" onclick="fetch('/fixture/lost',{method:'POST'})">Simula risposta persa</button></div><p id="feedback" role="status"></p><div id="rows"></div><div id="modals"></div></main><script src="/js/rent-engine.js"></script><script>
const S=${JSON.stringify(state())};S.page='payments';let selectedFile,listingImageUrl;
const auth={currentUser:{uid:'admin',getIdToken:async()=> 'admin'}},isAdmin=()=>true,rentLoadState={status:'ready'};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rentActionArg=s=>esc(JSON.stringify(s));
const toast=(kind,title,text)=>document.getElementById('feedback').textContent=title+(text?' · '+text:'');
function renderRows(){document.getElementById('rows').innerHTML=S.payments.map(p=>'<article class="card" style="padding:20px;margin-top:16px"><strong>'+esc(p.month)+' · € '+Number(p.amount).toLocaleString('it-IT',{minimumFractionDigits:2})+'</strong><p>Scadenza '+esc(p.dueDate)+' · '+esc(p.contractId)+' · '+esc(p.tenantId)+' · '+esc(p.propertyId)+'</p><button class="btn btn-secondary" data-id="'+esc(p.id)+'" onclick="editExample(this.dataset.id)">Modifica</button></article>').join('');}
function editExample(id){openModal('editPayment',S.payments.find(p=>p.id===id));}
async function reloadRentPayments(){Object.assign(S,await(await fetch('/fixture/state')).json());renderRows();}
function getModal(type,data){return rentPaymentModal(type,data);}
${fill}\n${open}\n${controller}\nrenderRows();
</script></body></html>`;
new vm.Script(html.split('<script>')[1].split('</script>')[0],{filename:'rent-fixture.js'});
http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/fixture/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(state()));}
 if(path==='/fixture/lost'){lostResponse=true;return res.end('ok');}
 if(path==='/api/payments/admin'){
   let body='';for await(const chunk of req)body+=chunk;
   req.body=body;res.status=n=>{res.statusCode=n;return res;};res.json=v=>{res.setHeader('Content-Type','application/json');if(lostResponse&&v.ok){lostResponse=false;res.statusCode=503;return res.end(JSON.stringify({ok:false,error:'save_unavailable'}));}return res.end(JSON.stringify(v));};
   await handler(req,res);return;
 }
 if(['/css/portal.css','/css/portal-mobile.css','/css/portal-desktop.css','/js/rent-engine.js'].includes(path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');return res.end(readFileSync(root+path));}
 if(path==='/'||path==='/preview'){res.setHeader('Content-Type','text/html');return res.end(html);}
 res.statusCode=404;res.end();
}catch(e){res.statusCode=500;res.end('test error');console.error(e.message);}}).listen(4192,'127.0.0.1',()=>console.log('Synthetic rent-write harness http://127.0.0.1:4192/preview'));
