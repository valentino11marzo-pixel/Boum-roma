// Real SMTP handler, pure relations and real Inbox UI; synthetic network only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import nodemailer from 'nodemailer';
import { loadChromium, launchOptions } from '../_browser.mjs';
const require=createRequire(import.meta.url), E=require('../../js/inbox-context-engine.js');
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
let source=read('js/portal-app.js');
if(process.env.BOOM_INBOX_MUTATION==='read-reply'){assert(source.includes('update({ unread: 0 })'));source=source.replace('update({ unread: 0 })','update({ unread: 0, needsReply: false })');}
if(process.env.BOOM_INBOX_MUTATION==='overwrite-realtime'){assert(source.includes('newer&&existing.has(row.id)'));source=source.replace('newer&&existing.has(row.id)','false');}
const state={users:[{id:'same',role:'tenant',name:'Identico'}],clients:[{id:'same',name:'Identico'}],properties:[{id:'house',name:'Casa demo'}],contracts:[{id:'contract',propertyId:'house'}]};
const task=(extra={})=>({id:'case',followUp:{confirmed:true,practiceRef:'contracts/contract',propertyRef:'properties/house',conversationId:'older',...extra}});
assert.deepEqual(E.resolve({kind:'person',id:'same'},state,[]).contacts,[{contactType:'tenant',contactId:'same'}]);
assert.equal(E.matches({contactType:'client',contactId:'same'},{contactType:'tenant',contactId:'same'}),false);
assert.deepEqual(E.resolve({kind:'property',id:'house'},state,[task()]).conversationIds,['older']);
for(const patch of [{confirmed:false},{needsReview:true},{ambiguous:true},{propertyRef:'properties/other'},{practiceRef:'contracts/missing'}])assert.deepEqual(E.resolve({kind:'property',id:'house'},state,[task(patch)]).conversationIds,[]);
assert.equal(E.resolve({kind:'property',id:'house'},{...state,properties:[...state.properties,...state.properties]},[]).available,false);
assert.deepEqual(E.resolve({kind:'contract',id:'contract'},{...state,contracts:[...state.contracts,...state.contracts]},[task()]).conversationIds,[]);
assert.deepEqual(E.resolve({kind:'property',id:'house'},state,[{...task(),followUp:{...task().followUp,practiceRef:null}}]).conversationIds,[]);
console.log('PASS typed identities, unique records, confirmed practice references and conflicts');
process.env.FIREBASE_API_KEY='synthetic';process.env.FIREBASE_ADMIN_EMAIL='admin@example.invalid';process.env.FIREBASE_ADMIN_PASS='synthetic';
let mails=[],smtpFailure=false,role='admin';
nodemailer.createTransport=()=>({sendMail:async m=>{if(smtpFailure)throw Error('synthetic SMTP failure');mails.push(m);return{messageId:'smtp-'+mails.length};}});
const {toFsFields,FS_BASE}=await import('../../api/homie/_lib.js');
globalThis.fetch=async(input,init={})=>{
 const url=String(input);const json=(status,v)=>new Response(JSON.stringify(v),{status});
 if(url.includes('accounts:lookup'))return json(200,{users:[{localId:'admin'}]});
 if(url.includes('accounts:signInWithPassword'))return json(200,{idToken:'synthetic-admin'});
 if(url===FS_BASE+'/users/admin')return json(200,{name:'projects/test/databases/(default)/documents/users/admin',fields:toFsFields({role})});
 throw Error('Unmocked external IO: '+url);
};
const {default:notify}=await import('../../api/notify/send.js');
async function send(body,token='synthetic'){
 const res={code:200,status(n){this.code=n;return this;},setHeader(){},json(v){this.body=v;return this;},end(){return this;}};
 await notify({method:'POST',headers:{authorization:'Bearer '+token},body},res);return res;
}
const long='  Testo <esatto> & completo\n'+'è'.repeat(2400)+'\n  Fine con spazi  ';
const exact={to:'demo@example.invalid',message:{subject:' Oggetto esatto & completo ',text:long}};
assert.equal((await send(exact)).code,200);assert.equal(mails[0].subject,exact.message.subject);assert.equal(mails[0].text,long);assert(mails[0].html.includes('è'.repeat(2400)));assert(mails[0].html.includes('&lt;esatto&gt;'));
for(const m of [{subject:'x'.repeat(201),text:'test'},{subject:'Subject\nBcc:',text:'test'},{subject:'test',text:'x'.repeat(20001)}])assert.equal((await send({...exact,message:m})).code,400);
assert.equal(mails.length,1);role='tenant';assert.equal((await send(exact)).code,403);role='admin';smtpFailure=true;assert.equal((await send(exact)).code,502);smtpFailure=false;
console.log('PASS real notify handler → real SMTP helper: exact subject/text/HTML, limits, role, failure');
const chromium=await loadChromium();assert(chromium,'Playwright required');const browser=await chromium.launch(launchOptions({headless:true}));
function named(name){let start=source.indexOf('    function '+name+'(');if(start<0)start=source.indexOf('    async function '+name+'(');assert(start>=0,name);const next=source.slice(start+5).search(/\n    (?:async )?function /);return source.slice(start,start+5+next);}
async function fixture(){
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.setDefaultTimeout(3000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://inbox.example.invalid/**',async route=>{
  if(route.request().url().endsWith('/api/notify/send')){const response=await send(JSON.parse(route.request().postData()));return route.fulfill({status:response.code,contentType:'application/json',body:JSON.stringify(response.body)});}
  return route.fulfill({contentType:'text/html',body:'<main id="main"></main><div id="modals"></div><div id="toasts"></div>'});
 });await page.goto('https://inbox.example.invalid/');
 await page.addScriptTag({content:`
 const S={page:'inbox',profile:{id:'admin',role:'admin'},users:[{id:'same',name:'Persona demo',role:'tenant'}],clients:[{id:'same',name:'Cliente omonimo'}],leads:[],pfsClients:[],properties:[{id:'house',name:'Casa demo'}],contracts:[{id:'contract',propertyId:'house'}],conversations:[],messages:[]};
 const auth={currentUser:{uid:'admin',getIdToken:async()=> 'synthetic'}};const firebase={firestore:{FieldValue:{serverTimestamp:()=>new Date()}}};
 const buildNav=()=>{},logActivity=()=>{},cacheData=()=>{};window.toasts=[];function toast(...args){toasts.push(args);document.getElementById('toasts').textContent=args.join(' ');}
 function goTo(page,arg){S.page=page;S.pageArg=arg;if(page==='inbox')document.getElementById('main').innerHTML=inboxPage();else if(page.startsWith('property/'))document.getElementById('main').innerHTML=BOOM_PROPERTY_DOSSIER.render(S,BOOM_PROPERTY_DOSSIER.parseRoute(page));else document.getElementById('main').innerHTML='<button onclick="inboxOpenContext({kind:&#39;property&#39;,id:&#39;house&#39;})">Comunicazioni collegate</button>';}
 window.io={writes:[],reads:[],requests:[]};window.failHistory=false;window.failRead=false;window.holdSend=false;window.holdRead=false;
 const nativeFetch=window.fetch.bind(window);window.fetch=async(...args)=>{io.requests.push(args);if(holdSend)await new Promise(resolve=>window.releaseSend=resolve);return nativeFetch(...args);};
 window.rows=Array.from({length:200},(_,i)=>({id:'feed-'+i,contactType:'lead',contactId:'lead-'+i,contactName:'Altra chat '+i,channel:'email',status:'open'}));
 rows.push({id:'older',contactType:'tenant',contactId:'same',contactName:'Conversazione fuori 200',contactEmail:'demo@example.invalid',channel:'email',status:'open',needsReply:true,unread:3});
 rows.push({id:'collision',contactType:'client',contactId:'same',contactName:'Omonimo non collegato',channel:'email',status:'open'});
 S.conversations=rows.slice(0,200);const saved=new Map();
 const snapshot=rs=>({docs:rs.map(row=>({id:row.id,data:()=>structuredClone(row)}))});
 const db={collection(name){return{filter:null,maximum:null,where(field,op,value){this.filter=[field,op,value];return this;},orderBy(){return this;},limit(n){this.maximum=n;return this;},
 async get(opts){io.reads.push({name,filter:this.filter,limit:this.maximum,opts});if(failRead)throw Error('denied');if(name==='operatorTasks')return snapshot(oggiSegretaria.rows);const selected=structuredClone(rows.filter(r=>r[this.filter[0]]===this.filter[2]).slice(0,this.maximum));if(holdRead)await new Promise(resolve=>window.releaseRead=resolve);return snapshot(selected);},
 doc(id){return{id,async get(opts){io.reads.push({name,id,opts});if(failRead)throw Error('denied');const row=rows.find(r=>r.id===id);return{id,exists:!!row,data:()=>structuredClone(row)};},async set(data){if(failHistory)throw Error('history failure');io.writes.push({name,id,data});saved.set(id,structuredClone(data));},async update(data){io.writes.push({name,id,data});Object.assign(rows.find(r=>r.id===id)||{},data);}};},
 onSnapshot(next){Promise.resolve().then(()=>next(snapshot([])));return()=>{};}};}};
 `});
 for(const file of ['conversations','inbox-context-engine','rent-engine','property-dossier-engine','property-dossier'])await page.addScriptTag({content:read('js/'+file+'.js')});
 const oggi=source.slice(source.indexOf('    function oggiDismissKey()'),source.indexOf('    function adminDashboard()'));
 const inbox=source.slice(source.indexOf('    var _inboxState ='),source.indexOf('    var _psState ='));
 await page.addScriptTag({content:oggi+'\n'+inbox+'\n'+['isAdmin','isLandlord','isTenant','portalSearchAuthorized','esc','jsq','closeModal','startOpenConvListener','stopOpenConvListener'].map(named).join('\n')});
 const configStart=source.indexOf('    window.BOOM_PROPERTY_DOSSIER?.configure({');await page.addScriptTag({content:source.slice(configStart,source.indexOf('    // ══',configStart))});
 await page.evaluate(()=>{oggiSegretaria.loaded=false;oggiSegretaria.userId='admin';oggiSegretaria.rows=[{id:'case',followUp:{confirmed:true,practiceRef:'contracts/contract',propertyRef:'properties/house',conversationId:'older'}}];_inboxState.filter='all';_inboxState.composing='email';goTo('property/house/overview','house');});
 return{page,errors};
}
let passed=0;
async function test(label,fn){const f=await fixture();try{await fn(f.page);assert.deepEqual(f.errors,[]);passed++;console.log('PASS '+label);}catch(e){console.log('DEBUG',f.errors,await f.page.evaluate(()=>({context:S.inboxContext,reads:io.reads,html:document.getElementById('main').innerText.slice(0,700)})));throw e;}finally{await f.page.close();}}
async function open(page){await page.getByRole('button',{name:'Comunicazioni collegate',exact:true}).click();await page.waitForFunction(()=>S.inboxContext&&!S.inboxContext.loading);await page.getByText('Conversazione fuori 200',{exact:false}).first().click();await page.waitForSelector('#inboxBody');}
async function fill(page,text=long){await page.locator('#inboxSubject').fill(exact.message.subject);await page.locator('#inboxBody').fill(text);}
try{
 await test('property context beyond200 → real thread → read is not reply → exact SMTP/history → return',async page=>{
  const before=mails.length;await open(page);assert.equal(await page.evaluate(()=>rows.find(r=>r.id==='older').needsReply),true);assert.equal(await page.getByText('Omonimo non collegato',{exact:true}).count(),0);
  await fill(page);await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>toasts.some(t=>t.includes('Email accettata e registrata')));
  assert.equal(mails.length,before+1);assert.equal(mails.at(-1).text,long);assert.equal(mails.at(-1).subject,exact.message.subject);
  const messages=await page.evaluate(()=>io.writes.filter(w=>w.name==='messages'));assert.equal(messages.length,1);assert.equal(messages[0].data.body,long);assert.equal(messages[0].data.subject,exact.message.subject);assert.equal(await page.locator('#inboxBody').inputValue(),'');
  await page.getByRole('button',{name:'← Torna al contesto',exact:true}).click();assert.deepEqual(await page.evaluate(()=>[S.page,S.pageArg]),['property/house/overview','house']);
 });
 await test('SMTP success + history failure preserves draft; retry history only, no second SMTP',async page=>{
  const before=mails.length;await open(page);await fill(page,'Testo retry');await page.evaluate(()=>failHistory=true);await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>toasts.some(t=>t.includes('Storico non aggiornato')));assert.equal(await page.locator('#inboxBody').inputValue(),'Testo retry');assert.equal(mails.length,before+1);
  await page.evaluate(()=>failHistory=false);await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>toasts.some(t=>t.includes('Email accettata e registrata')));assert.equal(mails.length,before+1);assert.equal(await page.evaluate(()=>io.writes.filter(w=>w.name==='messages').length),1);
 });
 await test('double click sends once; switching composer during IO never clears another draft',async page=>{
  const before=mails.length;await open(page);await fill(page,'Prima bozza');await page.evaluate(()=>holdSend=true);await page.getByRole('button',{name:'✉ Invia email',exact:true}).dblclick();await page.waitForFunction(()=>typeof releaseSend==='function');assert.equal(await page.evaluate(()=>io.requests.length),1);
  await page.evaluate(()=>{S.conversations.push({id:'other',contactName:'Seconda chat',contactEmail:'other@example.invalid',channel:'email',status:'open'});inboxSelect('other');});await page.locator('#inboxBody').fill('Non cancellarmi');await page.evaluate(()=>releaseSend());await page.waitForFunction(()=>toasts.some(t=>t.includes('Email accettata e registrata')));assert.equal(await page.locator('#inboxBody').inputValue(),'Non cancellarmi');assert.equal(mails.length,before+1);await page.evaluate(()=>inboxSelect('older'));assert.equal(await page.locator('#inboxBody').inputValue(),'');assert.equal(await page.locator('#inboxSubject').inputValue(),'');
 });
 await test('edited original draft survives completion after another thread was opened',async page=>{
  await open(page);await fill(page,'Testo in invio');await page.evaluate(()=>holdSend=true);await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>typeof releaseSend==='function');
  await page.locator('#inboxBody').fill('Nuova bozza della stessa persona');await page.evaluate(()=>{S.conversations.push({id:'other',contactName:'Altro',contactEmail:'other@example.invalid',channel:'email',status:'open'});inboxSelect('other');releaseSend();});await page.waitForFunction(()=>toasts.some(t=>t.includes('Email accettata e registrata')));await page.evaluate(()=>inboxSelect('older'));assert.equal(await page.locator('#inboxBody').inputValue(),'Nuova bozza della stessa persona');
 });
 await test('SMTP failure stays uncertain, preserves draft and blocks blind repeated send',async page=>{
  await open(page);await fill(page,'Resta qui');smtpFailure=true;await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>toasts.some(t=>t.includes('Email non confermata')));smtpFailure=false;assert.equal(await page.locator('#inboxBody').inputValue(),'Resta qui');await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();assert.equal(await page.evaluate(()=>io.requests.length),1);assert.equal(await page.evaluate(()=>io.writes.filter(w=>w.name==='messages').length),0);
 });
 await test('completed history permits a second intentional identical email',async page=>{
  const before=mails.length;await open(page);await fill(page,'Invio ripetuto intenzionale');await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>toasts.length>0);await fill(page,'Invio ripetuto intenzionale');await page.getByRole('button',{name:'✉ Invia email',exact:true}).click();await page.waitForFunction(()=>toasts.filter(t=>t.includes('Email accettata e registrata')).length===2);assert.equal(mails.length,before+2);const ids=await page.evaluate(()=>io.writes.filter(w=>w.name==='messages').map(w=>w.id));assert.equal(new Set(ids).size,2);
 });
 await test('late read cannot replace realtime recipient; reassigned identity leaves the previous scope',async page=>{
  await page.evaluate(()=>{holdRead=true;inboxOpenContext({kind:'person',id:'same'});});await page.waitForFunction(()=>typeof releaseRead==='function');
  await page.evaluate(()=>{S.conversations.push({...rows.find(r=>r.id==='older'),contactEmail:'new@example.invalid'});S.inboxDataRevision=1;releaseRead();});await page.waitForFunction(()=>!S.inboxContext.loading);assert.equal(await page.evaluate(()=>S.conversations.find(r=>r.id==='older').contactEmail),'new@example.invalid');
  await page.evaluate(()=>{Object.assign(S.conversations.find(r=>r.id==='older'),{contactId:'someone-else',contactName:'Nuovo contatto riservato'});S.inboxDataRevision++;inboxRefresh();});assert.equal(await page.getByText('Nuovo contatto riservato',{exact:false}).count(),0);assert.equal(await page.getByText('Conversazione fuori 200',{exact:false}).count(),0);assert.match(await page.locator('[aria-label="Comunicazioni del contesto"]').innerText(),/riferimenti da verificare/);
 });
 await test('orphan modal guard and duplicate context identity never guess or navigate',async page=>{
  await page.evaluate(()=>{document.body.classList.add('modal-open');inboxOpenContext({kind:'person',id:'same'});});assert.equal(await page.evaluate(()=>S.page),'property/house/overview');assert.equal(await page.evaluate(()=>io.reads.length),0);
  await page.evaluate(()=>{document.body.classList.remove('modal-open');inboxOpenContext({kind:'person',id:'same'});});await page.waitForFunction(()=>!S.inboxContext.loading);await page.evaluate(()=>{S.conversations.push({...S.conversations.find(r=>r.id==='older'),contactId:'other'});inboxRefresh();});assert.equal(await page.getByText('Conversazione fuori 200',{exact:false}).count(),0);
 });
 await test('typed person query excludes same-ID client; failed refresh is explicit; session switch drops late state',async page=>{
  await page.evaluate(()=>inboxOpenContext({kind:'person',id:'same'},'email'));await page.waitForFunction(()=>!S.inboxContext.loading);assert.deepEqual(await page.evaluate(()=>S.inboxContext.rows.map(r=>r.id)),['older']);assert.deepEqual(await page.evaluate(()=>io.reads[0].filter),['contactId','==','same']);
  await page.evaluate(async()=>{failRead=true;await inboxContextLoad();});assert.match(await page.locator('[aria-label="Comunicazioni del contesto"]').innerText(),/Lettura non riuscita/);assert.equal(await page.evaluate(()=>S.inboxContext.rows.length),1);
  await page.evaluate(()=>{auth.currentUser={uid:'other'};S.profile={id:'other',role:'admin'};document.getElementById('main').innerHTML=inboxPage();});assert.equal(await page.getByText('Conversazione fuori 200',{exact:false}).first().count(),0);
 });
}finally{smtpFailure=false;await browser.close();}
console.log(passed+' connected Inbox browser scenarios passed');
