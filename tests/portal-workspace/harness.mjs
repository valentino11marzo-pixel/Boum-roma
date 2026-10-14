// Actual portal renderers and mobile/desktop layers; only service IO is synthetic.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { html as propertyHtml } from '../property-dossier/harness.mjs';
import { quickToolsHtml } from '../oggi/home-harness.mjs';
import { journeyHtml, journeyData, journeyCases } from './journey-harness.mjs';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'../..');
const source=readFileSync(join(ROOT,'js/portal-app.js'),'utf8');
export function extract(name){
 const start=source.indexOf('function '+name+'(');if(start<0)throw Error('Missing real renderer: '+name);
 let index=source.indexOf('{',start),depth=0;
 for(;index<source.length;index++){if(source[index]==='{')depth++;else if(source[index]==='}'&&!--depth)return source.slice(start,index+1)}
 throw Error('Unclosed real renderer: '+name);
}
const functions=['usersPage','filterUsers','contractsPage','filterContracts','maintenancePage','filterMaintenance','daysSince','isOverdue','landlordCompleteness','renderSignRequestsSection','inboxPage','inboxRefresh','inboxLiveRefresh','inboxConversationCard','inboxFreshness','portalFreshnessWarning','portalSearchAuthorized','inboxRelativeTime','inboxThreadPanel','inboxHomieBanner','inboxMessageBubble','inboxComposer','kindLabel'];
// Additional pure list helpers may be shared by the contract/maintenance work.
for(const name of ['contractListStatus','maintenanceListRank','filterPortalList'])if(source.includes('function '+name+'('))functions.push(name);
const contexts=source.slice(source.indexOf('    function inboxContextRows('),source.indexOf('    function oggiWorkspacePanel('));
const selection=source.slice(source.indexOf('    window.inboxSelect = function('),source.indexOf('    function inboxThreadPanel('));
const seed=`
window.testIO={writes:[],reads:[],actions:[],listeners:[]};
S.signRequests=[];S.messages=[];S.pfsClients=[];S.inboxFeed={state:'live'};
S.users[0].phone='+390000000001';S.users[0].name='Alessandra Francesca De Santis';S.users[1].phone='+390000000002';S.users[1].name='Maria Teresa Della Rovere';S.users[1].email='mariateresa.dellarovere@example.invalid';
S.maintenance=[{...S.maintenance[0],id:'ordinary',status:'open',priority:'normal',title:'Sistemare la maniglia della finestra'},{...S.maintenance[0],id:'urgent',status:'open',priority:'urgent',title:'Perdita acqua in cucina - intervento urgente'}];
S.contracts.push({...S.contracts[0],id:'unsigned-draft',status:'draft',signatureStatus:'none',startDate:'2026-11-01',endDate:'2027-11-01'});
S.conversations=Array.from({length:12},(_,i)=>({id:'conversation-'+i,contactType:'lead',contactId:'lead-'+i,contactName:'Persona Demo '+i,contactEmail:'demo'+i+'@example.invalid',contactPhone:'+3900000000'+i,lastMessagePreview:'Possiamo accordarci per domani?',lastMessageAt:'2026-10-14T10:00:00Z',channel:'mixed',status:'open',unread:0}));
S.leads=S.conversations.map(c=>({id:c.contactId,name:c.contactName,email:c.contactEmail,phone:c.contactPhone}));
S.messages=Array.from({length:18},(_,i)=>({id:'message-'+i,conversationId:'conversation-0',direction:i%2?'out':'in',channel:'email',body:'Messaggio sintetico di prova '+i,at:'2026-10-14T10:00:00Z'}));
var oggiSegretaria={rows:[],loaded:true,incomplete:false};
var auth={currentUser:{uid:'demo-admin'}},_inboxState={convId:null,filter:'all',channel:'all',search:'',composing:'email'};
const demoOperatorTasks=[{id:'followup-demo',followUp:{confirmed:true,practiceRef:'contracts/contratto-demo',propertyRef:'properties/casa-demo',conversationId:'conversation-0'}}];
function portalFreshnessMount(){};function toast(...args){testIO.actions.push(['toast',...args])}
function startOpenConvListener(id){testIO.listeners.push(['start',id])};function stopOpenConvListener(){testIO.listeners.push(['stop'])}
const db={collection:name=>{
 const rows=()=>name==='operatorTasks'?demoOperatorTasks:name==='conversations'?S.conversations:[];
 return {where:(field,op,value)=>({limit:limit=>({get:async options=>{testIO.reads.push({name,field,op,value,limit,source:options?.source});return {docs:rows().filter(row=>field.split('.').reduce((item,key)=>item?.[key],row)===value).slice(0,limit).map(row=>({id:row.id,data:()=>row}))}}})}),doc:id=>({get:async options=>{testIO.reads.push({name,id,source:options?.source});const row=rows().find(c=>c.id===id);return {exists:!!row,id,data:()=>row}},update:async value=>testIO.writes.push({name,id,value})})};
}};
function inboxRetryUpdates(){inboxLiveRefresh()};function inboxOpenNewModal(){demoNotice()};function openPerson(){demoNotice()};function bulkRequestLandlordData(){demoNotice()};function sendLandlordDataRequest(){demoNotice()};function copyOnboardingLink(){testIO.actions.push(['copy'])}
for(const name of ['inboxSendEmail','inboxSendWhatsapp','inboxSaveNote','inboxProposeReply','inboxToggleStatus','inboxLogInboundModal'])window[name]=function(){testIO.actions.push([name]);demoNotice()};
${functions.map(extract).join('\n')}
${contexts}
${selection}
const productionGoTo=goTo;
goTo=function(section,...args){if(section==='oggi'){location.href='/home';return;}if(!['users','properties','contracts','maintenance','inbox'].includes(section)&&!window.BOOM_PROPERTY_DOSSIER?.parseRoute(section))return demoNotice();return productionGoTo(section,...args)};
`;
export const html=propertyHtml
 .replace('<script src="/js/rent-engine.js">','<script src="/js/conversations.js"></script><script src="/js/inbox-context-engine.js"></script><script src="/js/portal-search-engine.js"></script><script src="/js/rent-engine.js">')
 .replace("goTo(location.hash.slice(1)||'properties');",seed+"\ngoTo(location.hash.slice(1)||'users');window.testReady=true;");
const home=quickToolsHtml.replace('function goTo(id,fromHistory=false){',"function goTo(id,fromHistory=false){if(['users','properties','contracts','maintenance','inbox'].includes(id)){location.href='/#'+id;return;}");
export function createHarnessServer(){return createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/workspace-api'){
  const fixture=await import('../inbox/take-charge-fixture.mjs');
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){res.statusCode=413;res.end();return;}}
  let body;try{body=raw?JSON.parse(raw):{};}catch{res.statusCode=400;res.end();return;}
  if(!['GET','POST'].includes(req.method)||(req.method==='POST'&&!['start','confirm','close'].includes(body.op))){res.statusCode=405;res.end();return;}
  const answer=await fixture.call({method:req.method,body,query:Object.fromEntries(new URL(req.url,'http://localhost').searchParams)});
  res.statusCode=answer.code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(answer));return;
 }
 if(req.method!=='GET'){res.statusCode=405;res.end('Read-only preview');return;}
 if(path==='/workspace'){
  const fixture=await import('../inbox/take-charge-fixture.mjs');fixture.reset();
  // Each reload resets only the local synthetic database.
  for(const [collection,rows] of Object.entries(journeyData))if(Array.isArray(rows))for(const row of rows)fixture.put(collection+'/'+row.id,row);
  for(const row of journeyCases)fixture.put('operatorTasks/'+row.id,row);
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(journeyHtml);return;
 }
 if(path==='/'||path==='/home'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(path==='/home'?home:html);return;}
 if(/^\/(css|js)\/[a-z0-9-]+\.(css|js)$/.test(path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');try{res.end(readFileSync(join(ROOT,path)));return;}catch{}}
 res.statusCode=404;res.end('Not in this preview');
})}
