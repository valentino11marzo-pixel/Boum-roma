// A single local session across the real Home, record lists, dossiers and Inbox.
// The service boundary is synthetic; no customer messages or production records.
import { readFileSync } from 'node:fs';
import { quickToolsHtml } from '../oggi/home-harness.mjs';
import { fixture } from '../property-dossier/fixture.mjs';
const source=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
function fn(name){
 const match=new RegExp('^    (?:async )?function '+name+'\\(','m').exec(source);
 if(!match)throw Error('Missing actual function '+name);
 let i=source.indexOf('{',match.index),depth=0;
 for(;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&!--depth)return source.slice(match.index,i+1)}
 throw Error('Unclosed function '+name);
}
const names=['buildNav','goTo','renderPage','closeSidebar','toggleSidebar','accessDenied','isLandlord','isTenant',
 'usersPage','filterUsers','landlordCompleteness','initials','roleLabel','viewUser',
 'propertiesPage','filterProperties','searchProperties','contractsPage','filterContracts','renderSignRequestsSection','viewContract','contractBadge',
 'maintenancePage','filterMaintenance','viewMaintenance','daysSince','daysUntil','isOverdue','statusLabel','statusColor','priorityLabel','priorityColor','catLabel','docIcon',
 'boomBusinessInvoices','rentOverview','rentMoney','rentStateLabel','rentMonthLabel','rentSafeHttpUrl','rentPaymentRow','rentActionArg','rentUnlinkedReceiptsHTML','rentSummaryHTML','rentUnitsHTML','rentLoadNotice','paymentsPage','filterPayments','searchPayments','applyPaymentFilters','openRentUnit','closeRentDetail','rentDetailKeys',
 'inboxThreadPanel','inboxHomieBanner','inboxMessageBubble','inboxComposer'];
const inboxSelection=source.slice(source.indexOf('    window.inboxSelect = function('),source.indexOf('    function inboxThreadPanel('));
export const journeyData={...structuredClone(fixture),profile:{...fixture.profile,name:'Valentino'},conversations:[
 {id:'conv-a',contactType:'tenant',contactId:'tenant-demo',contactName:'Conduttore Demo',contactEmail:'tenant@example.invalid',channel:'email',lastMessagePreview:'Il tecnico può passare domani. Chi avvisa il portiere?',lastMessageAt:new Date(Date.now()-60000).toISOString(),status:'open',needsReply:true,unread:0},
 {id:'conv-b',contactType:'phone',contactId:'unknown',contactName:'Giuliano · da identificare',channel:'whatsapp',lastMessagePreview:'Per le chiavi ci vediamo lì domani?',lastMessageAt:new Date(Date.now()-30000).toISOString(),status:'open',needsReply:true,unread:0}],
 messages:[{id:'demo-message',conversationId:'conv-a',direction:'in',channel:'email',body:'Buongiorno, il tecnico può passare domani dalle 10 alle 12. Chi avvisa il portiere?',at:new Date(Date.now()-60000).toISOString()},
 {id:'ambiguous-message',conversationId:'conv-b',direction:'in',channel:'whatsapp',body:'Per le chiavi ci vediamo lì domani? Non ricordo la casa.',at:new Date(Date.now()-30000).toISOString()}]};
export const journeyCases=[{id:'sg_'+'a'.repeat(32),title:'Accesso al tecnico',source:'segretaria',status:'open',followUp:{open:true,conversationId:'conv-a',contactName:'Conduttore Demo',lastMessageId:'demo-message',lastInboundAt:journeyData.messages[0].at,preview:journeyData.messages[0].body,practiceRef:'contracts/contratto-demo',propertyRef:'properties/casa-demo',nextAction:'Confermare l’accesso al tecnico',waitingOn:'valentino',waitingLabel:'Valentino',checkAt:new Date(Date.now()+86400000).toISOString(),confirmed:true,needsReview:false,ambiguous:false}}];
const injected=`
${names.map(fn).join('\n')}
${inboxSelection}
Object.assign(S,${JSON.stringify(journeyData)});
testIO.followUps=${JSON.stringify(journeyCases)};
S.page='oggi';S.signRequests=[];S.pfsClients=[];
S.inboxFeed={state:'live'};S.inboxListener=()=>{};S._viewingsSource='ready';S._viewingsUser=auth.currentUser;
S._paLoaded=true;S._paUser=auth.currentUser;testIO.previewSession=crypto.randomUUID();
let rentDetailOpener=null,paymentFilters={kind:'all',search:'',month:'all'};
const rentLoadState={status:'ready',checkedAt:new Date()};
function demoNotice(){demoAction('local boundary')}
function innestoSeedFromHash(){return false}
function startOpenConvListener(id){testIO.actions.push(['watch',id])}
function inboxRetryUpdates(){inboxRefresh()}
function inboxFreshness(){return ''}
function bulkRequestLandlordData(){demoNotice()}
function sendLandlordDataRequest(){demoNotice()}
function copyOnboardingLink(){demoNotice()}
// Writes and expensive generation are explicit, blocked service boundaries.
for(const name of ['inboxSendEmail','inboxSendWhatsapp','inboxSaveNote','inboxProposeReply','inboxToggleStatus','inboxLogInboundModal','updateMaintenanceStatus','reloadRentPayments','confirmRentPayment','sendPaymentReminder','refinalizeContract','boomAuditAllContracts'])window[name]=()=>demoAction(name);
const actualGoTo=goTo;
goTo=function(section,...args){
 if(!['oggi','users','properties','contracts','maintenance','payments','inbox','boom-tools'].includes(section)&&!BOOM_PROPERTY_DOSSIER.parseRoute(section))return demoAction('goTo',section);
 return actualGoTo(section,...args);
};
window.fetch=async(url,options={})=>{
 const parsed=new URL(String(url),location.origin);
 if(parsed.origin!==location.origin||parsed.pathname!=='/api/segretaria/follow-up')throw Error('No external IO or generation in preview');
 const result=await realNetworkFetch('/workspace-api'+parsed.search,{method:options.method||'GET',headers:{'Content-Type':'application/json'},body:options.body,signal:options.signal});
 const data=await result.clone().json();
 if(data.rows)testIO.followUps=data.rows;
 if(data.task)testIO.followUps=[...testIO.followUps.filter(t=>t.id!==data.task.id),data.task];
 return result;
};
document.addEventListener('submit',event=>{if(event.target.closest('#sgFollowModal'))return;event.preventDefault();event.stopImmediatePropagation();demoAction('Salvataggio non disponibile nella preview');},true);
window.open=(...args)=>demoAction('open',...args);
window.testReady=true;
`;
const shell=`<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span style="color:var(--text-secondary);font-size:11px">ANTEPRIMA · DATI DEMO</span><span id="headerName">Valentino</span><span hidden id="headerBadge">Admin</span><div hidden><input id="globalSearch"></div></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main class="main" id="main"></main></div><div id="modals"></div><div id="toasts"></div></div>`;
const boot="goTo(location.hash.slice(1)||'oggi',true);";
let html=quickToolsHtml
 .replace('window.fetch=async(url,options={})=>{','const realNetworkFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{')
 .replace('const buildNav=()=>{};','')
 .replace("const renderPage=()=>{if(!BOOM_PROPERTY_DOSSIER.parseRoute(S.page))throw Error('A partial update replaced the whole home');renderPreview();};",'')
 .replace('const fmtDate=v=>String(v||\'\');',fn('fmtDate'))
 .replace(/<body>[\s\S]*?<script>/,'<body>'+shell+'<script>')
 .replace('</head>','<script src="/js/conversations.js"></script><link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"></head>')
 .replace(boot,injected+'\n'+boot)
 .replace('</body>','<script src="/js/portal-mobile.js"></script><script src="/js/portal-desktop.js"></script></body>');
export const journeyHtml=html;
