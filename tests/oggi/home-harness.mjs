// Synthetic preview of the actual home/search renderers. IO boundaries are inert.
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const src = read('js/portal-app.js');
const oggi = src.slice(src.indexOf('    function oggiDismissKey()'), src.indexOf('    function adminDashboard()'));
const search = src.slice(src.indexOf('    function handleSearch('), src.indexOf('    // Close search on click outside'));
const clock = src.slice(src.indexOf('    function viewingWhenLocal('), src.indexOf('    // ─── DISPONIBILITÀ:', src.indexOf('    function viewingWhenLocal(')));
const scripts = ['oggi-engine','oggi-workspace-engine','portal-actions','segretaria-casi-engine','segretaria-proposta-engine','segretaria-esecuzione-engine'].map(name=>read('js/'+name+'.js')).join('\n');
export const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOOM · Home operativa · anteprima locale</title><style>${['portal','portal-finish','segretaria','oggi-workspace'].map(n=>read('css/'+n+'.css')).join('\n')} .demo-bar{padding:10px 24px;background:#d4af37;color:#16130b;font-size:12px;font-weight:600;letter-spacing:.2px}.demo-brand{padding:20px 24px;font-size:20px;letter-spacing:5px;border-bottom:1px solid var(--border)}.main{max-width:1500px;margin:auto}.demo-bar a{color:inherit} </style></head><body><div class="demo-bar">ANTEPRIMA LOCALE · DATI DIMOSTRATIVI · NESSUN INVIO <span style="float:right">BOOM / OGGI</span></div><div class="demo-brand">BOOM</div><div hidden><input id="globalSearch"></div><main id="main" class="main"></main><div id="modals"></div><div id="toasts"></div><script>${scripts}</script><script>
window.testIO={reads:[],writes:[],actions:[],failViewings:false,failProposals:false,holdViewings:false,pendingReads:[]};
const now=new Date(), today=now.toISOString().slice(0,10);
const isoAt=h=>today+'T'+h+':00:00Z';
const auth={currentUser:{uid:'demo-admin',getIdToken:async()=> 'not-a-credential'}};
const S={page:'oggi',profile:{id:'demo-admin',name:'Valentino',role:'admin'},_paLoaded:true,_paUser:auth.currentUser,preAgreements:[],
 users:[{id:'p-demo',role:'tenant',name:'Persona Demo',email:'demo@example.invalid'}],
 properties:[{id:'casa-demo',name:'Casa Aurora',address:'Indirizzo dimostrativo · Roma'}],
 contracts:[{id:'contratto-demo',ref:'BOOM-DEMO',propertyId:'casa-demo',tenantId:'p-demo',status:'active',signatureStatus:'partial',createdAt:isoAt('08'),rent:1400}],
 clients:Array.from({length:15},(_,i)=>({id:'cliente-'+i,name:'Aurora Cliente '+i})),
 actionQueue:[],payments:[],leads:[],documents:[],tasks:[],deadlines:[],conversations:[],messages:[],
 maintenance:[{id:'guasto-demo',propertyId:'casa-demo',title:'Concordare accesso per il tecnico',priority:'urgent',status:'pending',createdAt:isoAt('08')}],
 viewingRequests:[{id:'v-demo',propertyName:'Casa Aurora',clientName:'Persona Demo',status:'confirmed',confirmedDateTime:isoAt('13')},{id:'v-proposta',propertyName:'Casa Giardino',clientName:'Nuovo contatto · demo',status:'rescheduled',confirmedDateTime:isoAt('09'),proposedDateTime:isoAt('15')}],
 _viewingsSource:'ready',_viewingsUser:auth.currentUser,_viewingsReadAt:now.toISOString(),_viewingsPartial:false};
window.testState=S;window.testAuth=auth;
const isAdmin=()=>S.profile?.role==='admin';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>String(v||'');
const toast=(...args)=>testIO.actions.push(['toast',...args]);
const buildNav=()=>{};
const renderPage=()=>{throw Error('A partial update replaced the whole home')};
function demoAction(name,...args){testIO.actions.push([name,...args]);document.getElementById('toasts').textContent='Anteprima: '+name+'. Nel portale si apre il flusso esistente.';}
function goTo(id){demoAction('goTo',id);}
function forceRefreshData(){oggiRetryWorkspace();}
function viewProperty(id){demoAction('viewProperty',id);}
function viewContract(id){demoAction('viewContract',id);}
function openPerson(id){demoAction('openPerson',id);}
function viewClient(id){demoAction('viewClient',id);}
function openFascicolo(id){demoAction('openFascicolo',id);}
function openShareHub(id){demoAction('openShareHub',id);}
function viewContractSignatures(id){demoAction('viewContractSignatures',id);}
function viewMaintenance(id){demoAction('viewMaintenance',id);}
function confirmViewingModal(id){const row=S.viewingRequests.find(v=>v.id===id);demoAction('confirmViewingModal',id,viewingWhenLocal(row));}
function rescheduleViewingModal(id){demoAction('rescheduleViewingModal',id);}
window.open=(...args)=>demoAction('open',...args);
const db={collection(name){testIO.reads.push(name);return {orderBy(){return this;},limit(){return this;},where(){return this;},onSnapshot(next){next({docs:[]});return()=>{};},async get(){if(name==='viewingRequests'&&testIO.holdViewings)await new Promise(r=>testIO.pendingReads.push(r));if((name==='viewingRequests'&&testIO.failViewings)||(name==='preAgreements'&&testIO.failProposals))throw Error('synthetic read failure');const list=name==='viewingRequests'?S.viewingRequests:[];return {docs:list.map(v=>({id:v.id,data:()=>({...v})}))};},doc(){testIO.writes.push(name);throw Error('No writes in preview');}}}};
window.fetch=async(url,options={})=>{if(options.method&&options.method!=='GET'){testIO.writes.push(url);throw Error('No sending or AI calls in preview');}if(!String(url).startsWith('/api/segretaria/follow-up'))throw Error('Unexpected API');return {ok:true,json:async()=>({ok:true,rows:[],monitoring:{mode:'continuous',status:'paused',preparationEnabled:false}})};};
${search}
${clock}
${oggi}
document.getElementById('main').innerHTML=oggiPage();
</script></body></html>`;
