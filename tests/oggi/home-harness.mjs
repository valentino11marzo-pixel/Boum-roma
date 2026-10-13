// Synthetic preview of the actual home/search renderers. IO boundaries are inert.
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const src = read('js/portal-app.js');
const oggi = src.slice(src.indexOf('    function oggiDismissKey()'), src.indexOf('    function adminDashboard()'));
const search = src.slice(src.indexOf('    function handleSearch('), src.indexOf('    // Close search on click outside'));
const clock = src.slice(src.indexOf('    function viewingWhenLocal('), src.indexOf('    // ─── DISPONIBILITÀ:', src.indexOf('    function viewingWhenLocal(')));
const dossierStart = src.indexOf('    window.BOOM_PROPERTY_DOSSIER?.configure({');
const dossierConfig = src.slice(dossierStart, src.indexOf('    // ══', dossierStart));
const propertyOpen = src.slice(src.indexOf('    function viewProperty(id)'), src.indexOf('    function viewPropertyLandlord(id)'));
// Execute the production mutation rules; only their persistence boundary is
// synthetic. This keeps the preview's confirm/close and 409 semantics honest.
const followUpSource = read('api/segretaria/_follow-up.js');
const availabilitySource = read('api/viewings/_avail.js');
const between = (source, start, end) => {
 const from=source.indexOf(start),to=end?source.indexOf(end,from):source.length;
 if(from<0||to<=from)throw Error('Missing production preview boundary: '+start);
 return source.slice(from,to).replace(/^export /gm,'');
};
const copy = between(src, '    async function copyToClipboard(', '    // Un solo pannello');
const followUpMutations = ['clean','inputText','precondition'].map(name=>{
 const line=followUpSource.split('\n').find(line=>line.startsWith('const '+name+' ='));
 if(!line)throw Error('Missing follow-up helper: '+name);return line;
}).join('\n')+'\n'+between(followUpSource,'export function checkTimestamp(','export async function captureFollowUp(')
 +'\nconst TZ="Europe/Rome";\n'+between(availabilitySource,'function romeCalendarParts(','const hhmm =')
 +'\n'+between(followUpSource,'export async function updateFollowUp(');
const scripts = ['oggi-engine','oggi-workspace-engine','portal-search-engine','portal-search-archive','portal-actions','segretaria-casi-engine','segretaria-proposta-engine','segretaria-esecuzione-engine','rent-engine','property-dossier-engine','property-dossier'].map(name=>read('js/'+name+'.js')).join('\n');
export const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOOM · Home operativa · anteprima locale</title><style>${['portal','portal-finish','segretaria','oggi-workspace','property-dossier','rent'].map(n=>read('css/'+n+'.css')).join('\n')} .demo-bar{padding:10px 24px;background:#d4af37;color:#16130b;font-size:12px;font-weight:600;letter-spacing:.2px}.demo-brand{padding:20px 24px;font-size:20px;letter-spacing:5px;border-bottom:1px solid var(--border)}.main{max-width:1500px;margin:auto}.demo-bar a{color:inherit} #toasts:not(:empty){position:fixed;bottom:18px;right:18px;max-width:min(360px,calc(100vw - 36px));padding:18px;background:#252728;color:white;border:1px solid #d4af37;border-radius:10px;z-index:10000;font:13px/1.5 sans-serif;box-shadow:0 8px 28px #0008} #toasts button{display:block;margin-top:10px;background:none;border:0;color:#d4af37;cursor:pointer} </style></head><body><div class="demo-bar">ANTEPRIMA LOCALE · DATI DIMOSTRATIVI · NESSUN INVIO <span style="float:right">BOOM / OGGI</span><small style="display:block;margin-top:4px;font-weight:400">Le modifiche durano fino al ricaricamento.</small></div><div class="demo-brand">BOOM <button type="button" onclick="oggiSegretariaOpen('sg_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','','message')" style="float:right;font:12px sans-serif;letter-spacing:0;padding:10px 14px;border:1px solid #d4af37;border-radius:8px;background:none;color:#d4af37;cursor:pointer">Prova un intervento ↗</button></div><div hidden><input id="globalSearch"></div><main id="main" class="main"></main><div id="modals"></div><div id="toasts"></div><script>${scripts}</script><script>
window.testIO={reads:[],writes:[],demoWrites:[],responses:[],actions:[],failViewings:false,failProposals:false,holdViewings:false,pendingReads:[]};
const now=new Date(), today=now.toISOString().slice(0,10);
const isoAt=h=>today+'T'+h+':00:00Z';
const auth={currentUser:{uid:'demo-admin',getIdToken:async()=> 'not-a-credential'}};
const S={page:'oggi',profile:{id:'demo-admin',name:'Valentino',role:'admin'},_paLoaded:true,_paUser:auth.currentUser,preAgreements:[],
 users:[{id:'p-demo',role:'tenant',name:'Persona Demo',email:'demo@example.invalid'}],
 properties:[{id:'casa-demo',name:'Casa Aurora',address:'Indirizzo dimostrativo · Roma'}],
 contracts:[{id:'contratto-demo',ref:'BOOM-DEMO',propertyId:'casa-demo',tenantId:'p-demo',status:'active',signatureStatus:'partial',createdAt:isoAt('08'),rent:1400}],
 clients:Array.from({length:15},(_,i)=>({id:'cliente-'+i,name:'Aurora Cliente '+i})),
 actionQueue:[],payments:[],leads:[],documents:[],tasks:[],deadlines:[],conversations:[],messages:[],inboxFeed:{state:'live'},inboxListener:()=>{},
 maintenance:[{id:'guasto-demo',propertyId:'casa-demo',title:'Verificare perdita in cucina',priority:'urgent',status:'pending',createdAt:isoAt('08')}],
 viewingRequests:[{id:'v-demo',propertyName:'Casa Aurora',clientName:'Persona Demo',status:'confirmed',confirmedDateTime:isoAt('13')},{id:'v-proposta',propertyName:'Casa Giardino',clientName:'Nuovo contatto · demo',status:'rescheduled',confirmedDateTime:isoAt('09'),proposedDateTime:isoAt('15')}],
 _viewingsSource:'ready',_viewingsUser:auth.currentUser,_viewingsReadAt:now.toISOString(),_viewingsPartial:false};
window.testState=S;window.testAuth=auth;
const caseRow=(letter,fields)=>({id:'sg_'+letter.repeat(32),source:'segretaria',status:'open',followUp:{open:true,conversationId:'conv-'+letter,contactName:'Persona Demo',lastMessageId:'phone:demo-call',lastInboundAt:isoAt('08'),preview:'Buongiorno, il tecnico può passare domani dalle 10 alle 12. Chi avvisa il portiere?',practiceRef:'contracts/contratto-demo',propertyRef:'properties/casa-demo',nextAction:'Confermare l’accesso al tecnico',waitingOn:'valentino',waitingLabel:'Valentino',checkAt:new Date(now.getTime()-60000).toISOString(),confirmed:true,needsReview:false,ambiguous:false,...fields}});
testIO.followUps=[caseRow('a',{}),caseRow('b',{contactName:'Giuliano · da identificare',lastMessageId:'wa-demo',preview:'Per le chiavi ci vediamo lì domani? Non so ancora a che ora.',nextAction:'Chiarire immobile e orario per le chiavi',practiceRef:null,propertyRef:null,confirmed:false,needsReview:true,ambiguous:true,intakeTiming:{status:'ambiguous'}})];
S.conversations=[{id:'conv-a',contactType:'tenant',contactId:'p-demo',contactName:'Persona Demo'},{id:'conv-b',contactType:'phone',contactId:'unknown',contactName:'Giuliano · da identificare'}];
const isAdmin=()=>S.profile?.role==='admin';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>String(v||'');
const toast=(...args)=>testIO.actions.push(['toast',...args]);
const buildNav=()=>{};
const renderPage=()=>{if(!BOOM_PROPERTY_DOSSIER.parseRoute(S.page))throw Error('A partial update replaced the whole home');renderPreview();};
function demoAction(name,...args){testIO.actions.push([name,...args]);const labels={viewContract:'Contratto',openPerson:'Persona',viewClient:'Cliente',openFascicolo:'Documenti del contratto',openShareHub:'Condivisione',viewContractSignatures:'Stato firme',viewMaintenance:'Manutenzione',confirmViewingModal:'Conferma visita',rescheduleViewingModal:'Sposta visita',open:'Strumento BOOM',goTo:'Sezione del portale'};document.getElementById('toasts').innerHTML='<strong>'+esc(labels[name]||'Strumento BOOM')+'</strong><br>Questo percorso richiede i dati del portale e non è simulato qui. Puoi provare ricerca, revisione delle richieste, fonte telefonica e fascicolo immobile.<button type="button" onclick="this.parentElement.replaceChildren()">Chiudi</button>';}
function renderPreview(){const route=BOOM_PROPERTY_DOSSIER.parseRoute(S.page);document.getElementById('main').innerHTML=route?BOOM_PROPERTY_DOSSIER.render(S,route,BOOM_PROPERTY_DOSSIER.load):oggiPage();BOOM_PROPERTY_DOSSIER.afterRender();}
function goTo(id,fromHistory=false){
 if(id!=='oggi'&&!BOOM_PROPERTY_DOSSIER.parseRoute(id))return demoAction('goTo',id);
 if(S.page==='oggi'&&id!=='oggi')oggiSegretariaStopLive();
 S.page=id;if(!fromHistory)history.pushState({},'',location.pathname+location.search+'#'+id);renderPreview();
}
window.addEventListener('popstate',()=>goTo(location.hash.slice(1)||'oggi',true));
async function loadDataFresh(){BOOM_PROPERTY_DOSSIER.setSourceState('loading');await Promise.resolve();BOOM_PROPERTY_DOSSIER.setSourceState('ready');}
function forceRefreshData(){oggiRetryWorkspace();}
function inboxSelect(id){demoAction('inboxSelect',id);}
${propertyOpen}
function viewContract(id){demoAction('viewContract',id);}
function viewLead(id){demoAction('viewLead',id);}
function openPFSClientDetail(id){demoAction('openPFSClientDetail',id);}
function viewUserProfile(id){demoAction('viewUserProfile',id);}
function viewArchiveDoc(id){demoAction('viewArchiveDoc',id);}
function openPerson(id){demoAction('openPerson',id);}
function viewClient(id){demoAction('viewClient',id);}
function openFascicolo(id){demoAction('openFascicolo',id);}
function openShareHub(id){demoAction('openShareHub',id);}
function viewContractSignatures(id){demoAction('viewContractSignatures',id);}
function viewMaintenance(id){demoAction('viewMaintenance',id);}
function editTask(id){demoAction('editTask',id);}
function viewUser(id){demoAction('viewUser',id);}
function openRentUnit(...args){demoAction('openRentUnit',...args);}
function openModal(...args){demoAction('openModal',...args);}
function confirmDelete(...args){demoAction('confirmDelete',...args);}
function openValutazione(...args){demoAction('openValutazione',...args);}
function innestoOpenFor(...args){demoAction('innestoOpenFor',...args);}
function confirmViewingModal(id){const row=S.viewingRequests.find(v=>v.id===id);demoAction('confirmViewingModal',id,viewingWhenLocal(row));}
function rescheduleViewingModal(id){demoAction('rescheduleViewingModal',id);}
window.open=(...args)=>demoAction('open',...args);
const db={collection(name){testIO.reads.push(name);return {orderBy(){return this;},limit(){return this;},where(){return this;},onSnapshot(next){next({docs:[]});return()=>{};},async get(){if(name==='viewingRequests'&&testIO.holdViewings)await new Promise(r=>testIO.pendingReads.push(r));if((name==='viewingRequests'&&testIO.failViewings)||(name==='preAgreements'&&testIO.failProposals))throw Error('synthetic read failure');const list=name==='viewingRequests'?S.viewingRequests:[];return {docs:list.map(v=>({id:v.id,data:()=>({...v})}))};},doc(){testIO.writes.push(name);throw Error('No writes in preview');}}}};
function demoDossier(task){return {practices:task?.followUp.practiceRef?[{ref:task.followUp.practiceRef,propertyRefs:['properties/casa-demo']}]:[],identityAmbiguous:!!task?.followUp.ambiguous};}
async function fsGetVersioned(path){
 const task=testIO.followUps.find(t=>'operatorTasks/'+t.id===path);
 return task?{data:structuredClone(task),updateTime:JSON.stringify(task)}:null;
}
async function fsCommit(operations){
 if(operations.length!==1)throw Error('Unexpected demo transaction');
 const op=operations[0],task=testIO.followUps.find(t=>'operatorTasks/'+t.id===op.docPath);
 if(!task||op.precondition?.updateTime!==JSON.stringify(task)){const error=Error('Demo version conflict');error.conflict=true;throw error;}
 Object.assign(task,structuredClone(op.fields));testIO.demoWrites.push({id:task.id,fields:structuredClone(op.fields)});
}
${followUpMutations}
window.fetch=async(url,options={})=>{
 const parsed=new URL(String(url),'https://example.invalid'),method=options.method||'GET';
 if(parsed.origin!=='https://example.invalid'||parsed.pathname!=='/api/segretaria/follow-up'||!['GET','POST'].includes(method)){
  if(method!=='GET')testIO.writes.push(String(url));throw Error('No sending, AI or external requests in preview');
 }
 const response=(code,data)=>({ok:code===200,status:code,json:async()=>structuredClone({ok:code===200,...data})});
 if(!isAdmin()||!auth.currentUser)return response(403,{error:'forbidden'});
 if(method==='POST'){
  let input;try{input=JSON.parse(options.body);}catch{return response(400,{error:'invalid_body'});}
  if(!['confirm','close'].includes(input?.op)){testIO.writes.push(String(url));throw Error('Only demo confirm/close allowed');}
  const task=testIO.followUps.find(t=>t.id===input.id);
  const result=await updateFollowUp({id:input.id,input,actor:auth.currentUser.uid,dossier:demoDossier(task)});
  testIO.responses.push({op:input.op,id:input.id,code:result.code,error:result.error});return response(result.code,result);
 }
 const id=parsed.searchParams.get('id'),task=testIO.followUps.find(t=>t.id===id);
 return id?(task?response(200,{task,dossier:demoDossier(task)}):response(404,{error:'case_not_found'}))
  :response(200,{rows:testIO.followUps.filter(t=>t.status==='open'),monitoring:{mode:'continuous',status:'paused',preparationEnabled:false}});
};
${search}
${clock}
${copy}
${oggi}
${dossierConfig}
BOOM_PROPERTY_DOSSIER.setSourceState('ready');BOOM_PROPERTY_DOSSIER.setTasksSourceState('ready');
goTo(location.hash.slice(1)||'oggi',true);
</script></body></html>`;

// The quick-tools fixture opens production forms, rather than the legacy
// preview's explanatory toasts. Only persistence/network remain synthetic.
const namedPortalFunction = name => {
 const match = new RegExp('^    (?:async )?function ' + name + '\\(', 'm').exec(src);
 if (!match) throw Error('Missing production function: ' + name);
 const after = src.slice(match.index + 5);
 const next = after.search(/^    (?:async )?function /m);
 if (next < 0) throw Error('Missing function boundary: ' + name);
 return src.slice(match.index, match.index + 5 + next);
};
const quickFunctions = [
 'openModal', 'closeModal', 'getModal', 'fillPayAmount',
 'openNewClientWizard', 'renderNewClientWizard', 'closeWizard', 'wizardBack',
 'wizardSyncDates', 'wizardSyncRent', 'wizardStep1Next', 'wizardStep2Next', 'wizardStep3Next',
 'openDocUploadModal', 'openDocUploadForProperty', 'openUserDocUpload'
].map(namedPortalFunction).join('\n');
const quickBoot = `
let selectedFile = null, listingImageUrl = '', _newClientWizard = null;
${quickFunctions}
S.properties.push({id:'casa-seconda',name:'Casa Aurora',address:'Via Seconda 20',rent:930});
S.properties.push({id:'casa-$id-demo',name:'Casa Segnaposto',address:'Via Segnaposto 30',rent:800});
S.users.push({id:'p-seconda',role:'tenant',name:'Persona Seconda',email:'seconda@example.invalid'});
S.contracts.push({id:'contratto-secondo',ref:'BOOM-SECONDO',propertyId:'casa-seconda',tenantId:'p-seconda',status:'active',rent:930},
 {id:'contratto-chiuso',ref:'BOOM-CHIUSO',propertyId:'casa-seconda',tenantId:'p-seconda',status:'terminated',rent:700});
Object.assign(S.clients[0],{email:'cliente0@example.invalid',phone:'+39000000000'});
goTo(location.hash.slice(1)||'oggi',true);
`;
export const quickToolsHtml = html
 .replace("function openModal(...args){demoAction('openModal',...args);}", '')
 .replace('window.open=(...args)=>demoAction(\'open\',...args);', '')
 .replace("goTo(location.hash.slice(1)||'oggi',true);", quickBoot);
