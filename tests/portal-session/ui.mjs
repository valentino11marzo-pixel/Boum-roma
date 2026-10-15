// Real auth callback, loaders, subscription handlers and freshness DOM. Synthetic
// Firebase/storage/timers only; unrelated navigation and business UI are boundaries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';
const source = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
import { sessionHelpers } from './source.mjs';
function part(text, from, until) { const a=text.indexOf(from),b=text.indexOf(until,a+from.length);assert(a>=0&&b>a,from);return text.slice(a,b); }
function fn(text,name) { const marker=new RegExp('    (?:async )?function '+name+'\\(');const a=text.search(marker);assert(a>=0,name);const tail=text.slice(a+5).search(/\n    (?:async )?function /);return text.slice(a,a+5+tail); }
const browser = await (await loadChromium()).launch(launchOptions({headless:true}));
let checks=0;
async function fixture(text=source, now=null) {
 const page=await browser.newPage({viewport:{width:390,height:900}});page.setDefaultTimeout(2500);
 if(now)await page.clock.setFixedTime(new Date(now));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="loading"></div><div id="authScreen" class="hidden"><a id="authLoginLink"></a><div id="authError"></div><div id="authInfo"></div></div><div id="app"><div id="headerName"></div><div id="headerAvatar"></div><div id="headerRole"></div><div id="headerBadge"></div><nav id="nav"></nav><main id="main"></main></div><div id="modals"></div>');
 await page.addScriptTag({content:`
 window.testIO={reads:[],writes:[],subscriptions:[],held:[],hold:null,fail:null,timers:[],toasts:[],renders:0,setups:0,rows:{},storage:new Map(),confirmations:[]};
 window.confirm=message=>{testIO.confirmations.push(message);return false;};
 let sessionCheckInterval=null;
 const nativeSetTimeout=window.setTimeout.bind(window);
 window.setTimeout=(fn,ms)=>{const task={fn,ms,active:true};testIO.timers.push(task);return task;};
 window.clearTimeout=task=>{if(task)task.active=false;};
 window.setInterval=window.setTimeout;window.clearInterval=window.clearTimeout;
 window.requestIdleCallback=fn=>setTimeout(fn,300);
 testIO.fire=async ms=>{for(const task of testIO.timers.filter(t=>t.ms===ms&&t.active)){task.active=false;await task.fn();}};
 testIO.snap=rows=>({docs:rows.map(r=>({id:r.id,data:()=>({...r})})),metadata:{fromCache:false}});
 const auth={currentUser:null,onAuthStateChanged(cb){this.callback=cb;},signOut:async()=>{auth.currentUser=null;await auth.callback(null);}};
 testIO.user=id=>({uid:id,email:id+'@example.invalid',getIdToken:async()=>'synthetic'});
 testIO.login=async id=>{auth.currentUser=id?testIO.user(id):null;await auth.callback(auth.currentUser);};
 const db={collection(name){let id=null;const q={where(){return q;},orderBy(){return q;},limit(){return q;},doc(value){id=value;return q;},
 async get(options){const uid=auth.currentUser?.uid;const row={name,id,uid,options};testIO.reads.push(row);
 if(testIO.hold?.(row))await new Promise(resolve=>testIO.held.push({row,resolve}));
 if(testIO.fail===name)throw Error('synthetic read failure');
 if(name==='users'&&id)return{exists:true,data:()=>({role:id.startsWith('tenant')?'tenant':'admin',name:id})};
 return testIO.snap(testIO.rows[name]||[{id:uid+'-'+name,tenantId:uid,userId:uid,propertyId:uid+'-property'}]);},
 update:async data=>testIO.writes.push({name,id,data}),onSnapshot(...args){const callbacks=args.filter(x=>typeof x==='function');const sub={name,id,uid:auth.currentUser?.uid,next:callbacks[0],error:callbacks[1],stopped:false};testIO.subscriptions.push(sub);return()=>{sub.stopped=true;};}};return q;}};
 const COMPANY={name:'default'};window.BOOM_DATAOPS={mergeCompany:(_base,remote)=>({company:remote,warnings:[]})};
 const firebase={firestore:{FieldValue:{serverTimestamp:()=> 'now'},FieldPath:{documentId:()=> '__name__'}}};
 const localStorage={getItem:key=>testIO.storage.get(key)||null,setItem:(key,value)=>testIO.storage.set(key,value),removeItem:key=>testIO.storage.delete(key)};
 const isMagicSign=false,isIntakeForm=false,isPostSign=false,isSafari=false,isSafariDesktop=false;
 const isAdmin=()=>S.profile?.role==='admin',isLandlord=()=>S.profile?.role==='landlord';
 const toast=(...args)=>testIO.toasts.push(args),checkAlerts=()=>{},invalidateRentSnapshot=()=>{},buildNav=()=>{},updateNotifBadge=()=>{},updateReminderBadge=()=>{},showNotifications=()=>{},sendBrowserNotification=()=>{};
 const renderPage=()=>{testIO.renders++;document.getElementById('main').innerHTML='<p>'+S.profile?.name+'</p>';};
 const oggiScheduleUpdate=()=>{},inboxLiveRefresh=()=>{},inboxFreshnessUpdate=()=>{},portalFreshnessStop=()=>{};
 const oggiSegretaria={generation:0},oggiSegretariaStopLive=()=>{};
 const cancelLoginRedirect=()=>{testIO.redirect=false;},scheduleLoginRedirect=()=>{testIO.redirect=true;};
 const loginUrlWithNext=()=>'/login',readBoomBridge=()=>{},setupApp=()=>{testIO.setups++;renderPage();};
 var _inboxState={convId:null};
 `});
 const fragments=[part(text,'    const CONFIG = {','    // Initialize Firebase with appropriate config'),
 part(text,'    const S = {','    // A derived property view'),
 part(text,'    function updateActivity()', '    // RBAC & DATA FILTERS'),sessionHelpers(text),
 part(text,'    // Track if auth already processed','    // Dismissed system alerts'),
 part(text,'    function startNotificationListener()','    function isRecent('),fn(text,'isRecent'),
 ...['hideLoading','showAuth','showApp','showAuthError','logout','forceRefreshData','oggiLoadViewings','loadRegistrations','loadCompanySettings'].map(n=>fn(text,n))];
 await page.addScriptTag({content:fragments.join('\n')});
 return {page,errors,async close(){assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>testIO.writes.every(w=>w.name==='users'&&Object.keys(w.data).join(',')==='lastLogin')),true,'only existing lastLogin telemetry is permitted');await page.close();}};
}
async function check(label,test){await test();checks++;console.log('PASS '+label);}
async function identityScenario(text=source) {
 const h=await fixture(text),p=h.page;
 try{
  await p.evaluate(()=>testIO.login('A'));assert.equal(await p.evaluate(()=>S.profile.id),'A');
  await p.evaluate(()=>{S.page='contracts';startContractsListener();document.getElementById('main').innerHTML='<p>Private A</p>';document.getElementById('modals').innerHTML='<textarea>A draft</textarea>';});
  await p.evaluate(()=>testIO.login(null));
  assert.equal(await p.evaluate(()=>S.profile),null,'logout removes the old identity immediately');
  assert.equal(await p.locator('#main').innerText(),'','logout clears private UI');assert.equal(await p.locator('#modals').innerText(),'');
  await p.evaluate(()=>testIO.subscriptions[0].next(testIO.snap([{id:'late-A'}])));
  assert.equal(await p.evaluate(()=>S.contracts.length),0,'late callback after logout stays discarded');
  await p.evaluate(()=>testIO.login('tenantB'));
  assert.equal(await p.evaluate(()=>S.profile.id),'tenantB','B is processed after logout');
  assert.equal(await p.evaluate(()=>S.profile.role),'tenant');
  assert.equal(await p.evaluate(()=>S.contracts.some(r=>r.id.includes('A'))),false);
  assert.equal(await p.evaluate(()=>testIO.setups),2,'new identity receives a new setup');
  const reads=await p.evaluate(()=>testIO.reads.length);await p.evaluate(()=>auth.callback(auth.currentUser));assert.equal(await p.evaluate(()=>testIO.reads.length),reads,'same uid notification is idempotent');
 }finally{await h.close();}
}
async function failedRefresh(text) {
const h=await fixture(text),p=h.page;try{
   await p.evaluate(async()=>{await testIO.login('A');testIO.storage.set('boom_data_cache','last-good-cache');testIO.fail='documents';testIO.toasts=[];await forceRefreshData();});
   assert.equal(await p.evaluate(()=>S.contracts[0].id),'A-contracts');assert.equal(await p.evaluate(()=>testIO.storage.get('boom_data_cache')),'last-good-cache');
   assert.equal(await p.evaluate(()=>testIO.toasts.some(t=>t[0]==='success')),false);assert.match(await p.locator('#portalSourceNotice').innerText(),/Dati principali.*non riuscito/);
  }finally{await h.close();}
}
async function renewedSession(text=source, uid='B') {
 const openedAt=Date.parse('2026-10-15T08:00:00Z'), renewedAt=openedAt+31*60*1000;
 const h=await fixture(text,openedAt),p=h.page;
 try{
  await p.evaluate(()=>testIO.login('A'));
  await p.clock.setFixedTime(new Date(renewedAt));
  await p.evaluate(async uid=>{await testIO.login(null);await testIO.login(uid);},uid);
  assert.equal(await p.evaluate(()=>S.lastActivity),renewedAt,'new session starts its own inactivity clock');
  assert.equal(await p.evaluate(()=>testIO.timers.filter(t=>t.active&&t.ms===60000).length),1,'only the current session keeps an inactivity timer');
  for(const elapsed of [60000,30*60*1000]){
   await p.clock.setFixedTime(new Date(renewedAt+elapsed));
   await p.evaluate(()=>checkSession());
   assert.equal(await p.evaluate(()=>testIO.confirmations.length),0,'a fresh session does not inherit the old timeout');
   assert.equal(await p.evaluate(()=>S.user.uid),uid);
  }
  await p.clock.setFixedTime(new Date(renewedAt+30*60*1000+1));
  await p.evaluate(()=>checkSession());
  assert.equal(await p.evaluate(()=>testIO.toasts.filter(t=>t[1]==='Sessione scaduta').length),1,'the original 30 minute policy still expires');
  assert.deepEqual(await p.evaluate(()=>testIO.confirmations),['Vuoi uscire?'],'expiry still reaches the real logout confirmation');
 }finally{await h.close();}
}
try {
 for(const uid of ['A','B'])await check('fresh '+uid+' session in a 31 minute old tab gets a new inactivity clock',()=>renewedSession(source,uid));
 await check('mutation killed: new session restores the original tab activity timestamp',async()=>{
  const mutant=source.replace('page: \'dashboard\', lang, isOnline, lastActivity: Date.now()', 'page: \'dashboard\', lang, isOnline');assert.notEqual(mutant,source);
  await assert.rejects(()=>renewedSession(mutant),/new session starts its own inactivity clock/);
 });
 await check('A → null → tenant B clears data/UI and retired callbacks before B loads',()=>identityScenario());
 await check('late profile A cannot assign, show, or write telemetry after direct switch to B',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(()=>{testIO.hold=r=>r.id==='A';window.oldLogin=testIO.login('A');});
   await p.waitForFunction(()=>testIO.held.length===1);await p.evaluate(()=>testIO.login('B'));
   await p.evaluate(async()=>{testIO.held[0].resolve();await oldLogin;});
   assert.equal(await p.evaluate(()=>S.profile.id),'B');assert.equal(await p.evaluate(()=>testIO.writes.some(w=>w.id==='A')),false);assert.equal(await p.evaluate(()=>testIO.setups),1);
  }finally{await h.close();}
 });
 await check('late core A cannot replace B or persist A under B cache key',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(()=>{testIO.hold=r=>r.uid==='A'&&!r.id&&r.name==='contracts';window.oldLogin=testIO.login('A');});
   await p.waitForFunction(()=>testIO.held.length===1);await p.evaluate(()=>testIO.login('B'));
   await p.evaluate(async()=>{testIO.held[0].resolve();await oldLogin;await testIO.fire(500);await testIO.fire(300);});
   assert.equal(await p.evaluate(()=>S.profile.id),'B');assert.equal(await p.evaluate(()=>S.contracts[0].id),'B-contracts');
   assert.equal(await p.evaluate(()=>!!testIO.storage.get('boom_data_cache')?.includes('A-contracts')),false);
  }finally{await h.close();}
 });
 await check('same UID logout/login invalidates old listener and old idle cache write',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async()=>{await testIO.login('A');startContractsListener();cacheData();window.sameUser=auth.currentUser;await testIO.login(null);auth.currentUser=sameUser;await auth.callback(sameUser);});
   await p.evaluate(()=>testIO.subscriptions[0].next(testIO.snap([{id:'retired-A'}])));
   assert.equal(await p.evaluate(()=>S.contracts[0].id),'A-contracts');
   await p.evaluate(()=>testIO.fire(300));assert.equal(await p.evaluate(()=>testIO.storage.has('boom_data_cache')),false);
  }finally{await h.close();}
 });
 for(const name of ['contracts','maintenance','signRequests'])await check(name+' cache/error/retry stays visible and preserves the live draft',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async name=>{await testIO.login('A');S.page='contracts';window['start'+name[0].toUpperCase()+name.slice(1)+'Listener']();document.getElementById('modals').innerHTML='<div class="modal-overlay active"><textarea id="draft">Keep me</textarea></div>';document.getElementById('draft').focus();window.originalDraft=document.getElementById('draft');},name);
   await p.evaluate(name=>{const sub=testIO.subscriptions.find(s=>s.name===name);window.oldSub=sub;const snap=testIO.snap([{id:'cached'}]);snap.metadata.fromCache=true;sub.next(snap);},name);
   assert.match(await p.locator('#portalSourceNotice').innerText(),/copia locale/);
   await p.evaluate(()=>oldSub.error({code:'unavailable'}));assert.match(await p.locator('#portalSourceNotice').innerText(),/aggiornamento non riuscito/);
   assert.deepEqual(await p.evaluate(name=>S[name].map(r=>r.id),name),['cached']);
   await p.evaluate(()=>testIO.fire(1000));assert.equal(await p.evaluate(name=>testIO.subscriptions.filter(s=>s.name===name&&!s.stopped).length,name),1);
   await p.evaluate(()=>oldSub.next(testIO.snap([{id:'obsolete'}])));
   assert.deepEqual(await p.evaluate(name=>S[name].map(r=>r.id),name),['cached']);
   await p.evaluate(name=>testIO.subscriptions.filter(s=>s.name===name).at(-1).next(testIO.snap([{id:'fresh'}])),name);
   assert.equal(await p.evaluate(name=>S.sourceFreshness[name].state,name),'live');
   assert.equal(await p.evaluate(()=>document.getElementById('draft')===originalDraft),true);assert.equal(await p.locator('#draft').inputValue(),'Keep me');assert.equal(await p.evaluate(()=>document.activeElement.id),'draft');
   await p.evaluate(()=>{portalSourcesRecover();portalSourcesRecover();});assert.equal(await p.evaluate(name=>testIO.subscriptions.filter(s=>s.name===name).length,name),2);
  }finally{await h.close();}
 });
 await check('manual refresh preserves failed core and cache, never emits success',()=>failedRefresh(source));
 for(const name of ['listings','leads','activityLog','deadlines','pfsClients','conversations','viewingRequests'])await check('partial '+name+' keeps prior data/cache and subsequent retry recovers',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async name=>{await testIO.login('A');S[name]=[{id:'previous'}];testIO.storage.set('boom_data_cache','last-good-cache');testIO.fail=name;testIO.toasts=[];await forceRefreshData();},name);
   assert.equal(await p.evaluate(()=>testIO.toasts.some(t=>t[0]==='success')),false);assert.equal(await p.evaluate(()=>testIO.storage.get('boom_data_cache')),'last-good-cache');
   assert.deepEqual(await p.evaluate(name=>S[name].map(r=>r.id),name),['previous']);
   await p.evaluate(async()=>{testIO.fail=null;testIO.toasts=[];await forceRefreshData();await testIO.fire(300);});
   assert.equal(await p.evaluate(()=>testIO.toasts.some(t=>t[0]==='success')),true);assert.notEqual(await p.evaluate(()=>testIO.storage.get('boom_data_cache')),'last-good-cache');
  }finally{await h.close();}
 });
 await check('newer realtime contracts win against a delayed same-session refresh',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async()=>{await testIO.login('A');startContractsListener();testIO.hold=r=>r.name==='contracts';window.pending=loadDataFresh(false);});
   await p.waitForFunction(()=>testIO.held.length===1);
   await p.evaluate(async()=>{testIO.subscriptions.at(-1).next(testIO.snap([{id:'realtime-new'}]));testIO.held[0].resolve();await pending;});
   assert.equal(await p.evaluate(()=>S.contracts[0].id),'realtime-new');
  }finally{await h.close();}
 });
 await check('late lazy read after timeout cannot replace preserved data or claim success',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async()=>{await testIO.login('A');S.pfsClients=[{id:'previous'}];testIO.hold=r=>r.name==='pfsClients';testIO.toasts=[];window.pendingRefresh=forceRefreshData();});
   await p.waitForFunction(()=>testIO.held.length===1);
   await p.evaluate(async()=>{await testIO.fire(15000);await pendingRefresh;testIO.held[0].resolve();});
   assert.deepEqual(await p.evaluate(()=>S.pfsClients.map(r=>r.id)),['previous']);
   assert.equal(await p.evaluate(()=>testIO.toasts.some(t=>t[0]==='success')),false);
  }finally{await h.close();}
 });
 await check('mutation killed: retired callbacks bypass session generation',async()=>{
  const mutant=source.replace('const current = () => active && portalSessionCurrent(proof);','const current = () => true;');assert.notEqual(mutant,source);
  await assert.rejects(()=>identityScenario(mutant),/late callback after logout/);
 });
 for(const [fnName,collection] of [['loadRegistrations','contractRegistrations'],['loadCompanySettings','settings']])await check(fnName+' ignores A response after B takes over',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async({fnName,collection})=>{await testIO.login('A');testIO.hold=r=>r.name===collection;window.oldRead=window[fnName]();}, {fnName,collection});
   await p.waitForFunction(()=>testIO.held.length===1);await p.evaluate(()=>testIO.login('B'));
   await p.evaluate(async()=>{testIO.held[0].resolve();await oldRead;});
   assert.equal(await p.evaluate(()=>S.registrations.length),0);assert.equal(await p.evaluate(()=>S.companyWarnings),undefined);
  }finally{await h.close();}
 });
 await check('explicit subscription stop cancels a pending retry; foreground recovery stays single',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async()=>{await testIO.login('A');startContractsListener();testIO.subscriptions.at(-1).error({code:'unavailable'});stopContractsListener();await testIO.fire(1000);});
   assert.equal(await p.evaluate(()=>testIO.subscriptions.filter(s=>s.name==='contracts').length),1);
   await p.evaluate(()=>{portalSourcesRecover();testIO.subscriptions.at(-1).next(testIO.snap([{id:'recovered'}]));portalSourcesRecover();});
   assert.equal(await p.evaluate(()=>testIO.subscriptions.filter(s=>s.name==='contracts'&&!s.stopped).length),1);
  }finally{await h.close();}
 });
 await check('an idle cache save from a prior read cannot restamp a later failed refresh',async()=>{
  const h=await fixture(),p=h.page;try{
   await p.evaluate(async()=>{await testIO.login('A');testIO.storage.set('boom_data_cache','previous-verified');cacheData();testIO.fail='documents';await forceRefreshData();await testIO.fire(300);});
   assert.equal(await p.evaluate(()=>testIO.storage.get('boom_data_cache')),'previous-verified');
  }finally{await h.close();}
 });
 await check('mutation killed: restore authProcessed guard that skips B',async()=>{
  const mutant=source.replace('if (authProcessed && u?.uid === S.user?.uid) return;','if (authProcessed && u) return;').replace('authProcessed = false; authRetryCount = 0;','authRetryCount = 0;');assert.notEqual(mutant,source);
  await assert.rejects(()=>identityScenario(mutant));
 });
 await check('mutation killed: unconditional refresh success',async()=>{
  const marker="if (result?.ok && !Object.values(S.sourceFreshness || {}).some(entry => entry.state !== 'live'))";
  const mutant=source.replace(marker,'if (true)');assert.notEqual(mutant,source);
  await assert.rejects(()=>failedRefresh(mutant),assert.AssertionError);
 });
 console.log(checks+' session/source browser checks passed. Synthetic records only.');
}finally{await browser.close();}
