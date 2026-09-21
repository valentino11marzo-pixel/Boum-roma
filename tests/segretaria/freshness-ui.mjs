// Freshness claims and foreground recovery: actual Oggi/Inbox code, fake IO only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const portal = read('js/portal-app.js');
const named = (name, source = portal) => {
  const syncStart = source.indexOf('    function ' + name + '(');
  const start = syncStart >= 0 ? syncStart : source.indexOf('    async function ' + name + '(');
  assert(start >= 0, name);
  const next = source.slice(start + 5).search(/\n    (?:async )?function /);
  return source.slice(start, start + 5 + next);
};
const oggiBody = source => source.slice(source.indexOf('    function oggiDismissKey()'), source.indexOf('    function adminDashboard()'));
const inboxFunctions = ['inboxPage', 'inboxConversationCard', 'inboxRelativeTime', 'inboxThreadPanel', 'inboxHomieBanner', 'inboxMessageBubble', 'inboxComposer', 'kindLabel', 'inboxRefresh'];
const ID = 'sg_' + 'a'.repeat(32);
const chromium = await loadChromium();
assert(chromium, 'Playwright necessario (BOOM_PLAYWRIGHT)');
const browser = await chromium.launch(launchOptions({ headless: true }));
let passed = 0, failed = 0;
const check = async (label, fn) => {
  if(process.env.TEST_FILTER && !label.includes(process.env.TEST_FILTER))return;
  try { await fn(); passed++; console.log('PASS ' + label); }
  catch (error) { failed++; console.log('FAIL ' + label + '\n  ' + error.message); }
};

async function fixture(source = portal, width = 390, globalOnline = false) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(3000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<main id="main"></main><div id="modals"></div>');
  await page.addStyleTag({ content: read('css/portal.css') + '\n' + read('css/segretaria.css') });
  await page.addScriptTag({ content: `
    const S={page:'oggi',profile:{id:'admin',role:'admin'},isOnline:true,_paLoaded:true,actionQueue:[],contracts:[],maintenance:[],conversations:[],messages:[],properties:[]};
    const auth={currentUser:{uid:'admin',getIdToken:async()=> 'synthetic-token'}};
    const isAdmin=()=>S.profile?.role==='admin',isLandlord=()=>false;
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const buildNav=()=>{},toast=()=>{},sendBrowserNotification=()=>{};
    window.fullRenders=0;
    const renderPage=()=>{fullRenders++;throw Error('L’aggiornamento ha ricreato la pagina intera')};
    window.apiCalls=[];window.apiWrites=0;window.holdAPI=false;window.heldAPI=[];
    window.apiRows=[{id:'${ID}',status:'open',source:'segretaria',followUp:{open:true,conversationId:'conv-demo',contactName:'Persona demo',lastMessageId:'m-demo',nextAction:'Verificare il documento',waitingOn:'boom',confirmed:false,needsReview:true,checkAt:'2030-01-01T10:00:00Z'}}];
    window.fetch=async(url,options={})=>{
      apiCalls.push({url:String(url),method:options.method||'GET'});
      if(options.method && options.method!=='GET'){apiWrites++;throw Error('Scrittura inattesa');}
      const parsed=new URL(url,'https://local.test');
      if(parsed.pathname!=='/api/segretaria/follow-up')throw Error('Chiamata AI/API inattesa: '+url);
      if(holdAPI && !parsed.searchParams.has('id'))await new Promise(resolve=>heldAPI.push(resolve));
      const id=parsed.searchParams.get('id');
      return {ok:true,json:async()=>id?{ok:true,task:structuredClone(apiRows.find(t=>t.id===id)),dossier:{practices:[]}}:{ok:true,rows:structuredClone(apiRows),monitoring:{mode:'continuous',status:'idle'}}};
    };
    window.subscriptions={};window.subscriptionCounts={};
    const db={collection(name){
      if(!['conversations','operatorTasks'].includes(name))throw Error('Lettura inattesa: '+name);
      return {name,filter:null,sort:null,max:Infinity,
        where(field,op,value){this.filter=[field,op,value];return this;},orderBy(field,dir){this.sort=[field,dir];return this;},limit(n){this.max=n;return this;},
        onSnapshot(...args){
          const callbacks=args.filter(arg=>typeof arg==='function'),options=args.find(arg=>arg && typeof arg==='object');
          const sub={query:this,next:callbacks[0],error:callbacks[1],options};
          subscriptions[name]=sub;subscriptionCounts[name]=(subscriptionCounts[name]||0)+1;
          if(name==='operatorTasks')sub.next({docs:[],metadata:{fromCache:false,hasPendingWrites:false}});
          return()=>{sub.stopped=true;};
        }};
    }};
    window.emitConversations=(rows,fromCache=false)=>subscriptions.conversations.next({docs:rows.map(row=>({id:row.id,data:()=>row})),metadata:{fromCache,hasPendingWrites:false}});
    window.changeVisibility=hidden=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:hidden});
      Object.defineProperty(document,'visibilityState',{configurable:true,value:hidden?'hidden':'visible'});
      document.dispatchEvent(new Event('visibilitychange'));
    };
  ` });
  for (const name of ['oggi-engine', 'segretaria-casi-engine', 'segretaria-proposta-engine', 'segretaria-esecuzione-engine'])
    await page.addScriptTag({ content: read('js/' + name + '.js') });
  await page.addScriptTag({ content: read('js/conversations.js') });
  if(globalOnline){
    const start=source.indexOf("    window.addEventListener('online', () => {");
    const end=source.indexOf("    window.addEventListener('offline', () => {",start);
    assert(start>=0 && end>start,'Registrazione online globale reale presente');
    await page.addScriptTag({content:'async function loadData(){}\nasync function loadRegistrations(){}\n'
      +named('refresh',source)+'\n'+source.slice(start,end)});
  }
  const oggi=oggiBody(source);
  const inboxHelpers=['inboxFreshnessUpdate','inboxLiveRefresh'].filter(name=>source.includes('    function '+name+'(') && !oggi.includes('    function '+name+'('));
  await page.addScriptTag({ content: source.match(/    var _inboxState = [^\n]+/)[0] + '\n' + oggi + '\n'
    + [...inboxFunctions, ...inboxHelpers, 'startInboxListener', 'stopInboxListener', 'stopOpenConvListener'].map(name=>named(name,source)).join('\n') + `
    document.getElementById('main').innerHTML=oggiPage();startInboxListener();
  ` });
  await page.waitForFunction(() => oggiSegretaria.loaded && !oggiSegretaria.loading);
  await page.evaluate(() => {
    window.seedConversations=[{id:'conv-demo',contactName:'Persona demo',contactEmail:'demo@example.invalid',status:'open',channel:'whatsapp',lastDirection:'in',lastMessageAt:'2026-09-21T09:00:00Z',unread:0}];
    emitConversations(seedConversations);
  });
  await page.waitForTimeout(250);
  await page.locator('article[data-sg-id="' + ID + '"] summary').click();
  await page.locator('[data-sg-action="edit"][data-sg-id="' + ID + '"]').click();
  await page.locator('#sgAction').fill('Bozza da completare: non inviare');
  await page.locator('#sgAction').focus();
  await page.evaluate(() => {
    window.savedModal=document.getElementById('sgFollowModal');
    window.savedDraft=document.getElementById('sgAction');
    window.previousRows=JSON.stringify(oggiSegretaria.rows);
    window.previousConversations=JSON.stringify(S.conversations);
  });
  return { page, errors };
}

async function preserved(page, errors) {
  assert.equal(await page.evaluate(() => document.getElementById('sgFollowModal') === savedModal), true, 'Il modale resta lo stesso nodo');
  assert.equal(await page.evaluate(() => document.getElementById('sgAction') === savedDraft), true, 'La bozza resta lo stesso nodo');
  assert.equal(await page.locator('#sgAction').inputValue(), 'Bozza da completare: non inviare');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sgAction');
  assert.equal(await page.evaluate(() => apiWrites), 0);
  assert.deepEqual(errors, []);
}

function visibleError(before, after) {
  assert.notEqual(after, before, 'Il callback errore lascia #sgFreshness identico: ' + after);
  assert.match(after, /conversazion|WhatsApp|Inbox/i);
  assert.match(after, /non.*aggiorna|indisponibil|non.*riuscit|errore|non.*disponibil/i);
}
function foregroundRead(before, after) {
  assert.equal(after, before + 1, 'Entro 500ms dal ritorno: GET prima=' + before + ', dopo=' + after);
}
function currentConversations(rows) {
  assert.deepEqual(rows,['Nuovo dato verificato'],'Una callback ritirata non deve sostituire i dati attuali');
}
function noWholeRender(count,surface) {
  assert.equal(count,0,'Il listener online globale ha tentato renderPage() su '+surface);
}

try {
  await check('A · errore conversations visibile in Oggi senza perdere dati, modale o bozza', async () => {
    const { page, errors } = await fixture();
    try {
      const before = await page.locator('#sgFreshness').innerText();
      await page.evaluate(() => subscriptions.conversations.error({code:'permission-denied'}));
      await page.waitForTimeout(250);
      await preserved(page, errors);
      assert.equal(await page.evaluate(() => JSON.stringify(S.conversations) === previousConversations && JSON.stringify(oggiSegretaria.rows) === previousRows), true);
      const after = await page.locator('#sgFreshness').innerText();
      visibleError(before,after);
    } finally { await page.close(); }
  });
  await check('B · ritorno in primo piano ricontrolla subito con una sola GET, senza AI o perdita della bozza', async () => {
    const { page, errors } = await fixture();
    try {
      const before = await page.evaluate(() => {holdAPI=true;changeVisibility(true);return apiCalls.filter(r=>!r.url.includes('?id=')).length;});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => apiCalls.filter(r=>!r.url.includes('?id=')).length), before, 'Nascondere la pagina non richiede una lettura');
      await page.evaluate(() => {changeVisibility(false);document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));});
      await page.waitForTimeout(500);
      await preserved(page, errors);
      const after = await page.evaluate(() => apiCalls.filter(r=>!r.url.includes('?id=')).length);
      foregroundRead(before,after);
      await page.evaluate(() => {holdAPI=false;heldAPI.splice(0).forEach(resolve=>resolve());});
      await page.waitForFunction(() => !oggiSegretaria.loading);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => apiCalls.filter(r=>!r.url.includes('?id=')).length), before + 1, 'La raffica foreground non accoda una seconda GET');
      await preserved(page, errors);
    } finally { await page.close(); }
  });
  await check('C · snapshot fromCache dichiarato come dati salvati, non lettura remota appena riuscita', async () => {
    const { page, errors } = await fixture();
    try {
      assert.equal(await page.evaluate(()=>subscriptions.conversations.options?.includeMetadataChanges),true,'Gli eventi di soli metadati devono essere richiesti a Firestore');
      await page.evaluate(() => emitConversations(seedConversations, true));
      await page.waitForTimeout(250);
      await preserved(page, errors);
      assert.match(await page.locator('#sgFreshness').innerText(), /dati salvati|copia salvata|cache|memoria locale/i);
      await page.evaluate(() => emitConversations(seedConversations, false));
      await page.waitForTimeout(250);
      assert.doesNotMatch(await page.locator('#sgFreshness').innerText(), /dati salvati|copia salvata|cache|memoria locale/i);
      await preserved(page, errors);
    } finally { await page.close(); }
  });
  for (const trigger of ['visibility', 'online']) {
    await check('listener terminali recuperati una volta su ' + trigger + ', senza duplicare letture', async () => {
      const { page, errors } = await fixture();
      try {
        const before = await page.evaluate(() => {
          subscriptions.conversations.error({code:'unavailable'});
          subscriptions.operatorTasks.error({code:'unavailable'});
          holdAPI=true;
          return {conversations:subscriptionCounts.conversations,cases:subscriptionCounts.operatorTasks,gets:apiCalls.length};
        });
        await page.evaluate(trigger => {
          if(trigger==='visibility'){changeVisibility(true);changeVisibility(false);document.dispatchEvent(new Event('visibilitychange'));}
          else {window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));}
        }, trigger);
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => ({conversations:subscriptionCounts.conversations,cases:subscriptionCounts.operatorTasks,gets:apiCalls.length}));
        assert.deepEqual(after,{conversations:before.conversations+1,cases:before.cases+1,gets:before.gets+1});
        await preserved(page,errors);
        await page.evaluate(() => {holdAPI=false;heldAPI.splice(0).forEach(resolve=>resolve());});
        await page.waitForFunction(() => !oggiSegretaria.loading);
      } finally { await page.close(); }
    });
  }
  await check('Aggiorna Oggi recupera i listener terminali e avvia una sola GET',async()=>{
    const {page,errors}=await fixture();
    try {
      await page.locator('[data-sg-modal="cancel"]').first().click();
      const before=await page.evaluate(()=>{
        subscriptions.conversations.error({code:'unavailable'});subscriptions.operatorTasks.error({code:'unavailable'});
        holdAPI=true;
        return {conversations:subscriptionCounts.conversations,cases:subscriptionCounts.operatorTasks,gets:apiCalls.length};
      });
      await page.locator('[data-sg-action="refresh"]').click();
      await page.waitForTimeout(350);
      assert.deepEqual(await page.evaluate(()=>({conversations:subscriptionCounts.conversations,cases:subscriptionCounts.operatorTasks,gets:apiCalls.length})),
        {conversations:before.conversations+1,cases:before.cases+1,gets:before.gets+1});
      await page.evaluate(()=>{holdAPI=false;heldAPI.splice(0).forEach(resolve=>resolve());});
      await page.waitForFunction(()=>!oggiSegretaria.loading);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>apiCalls.length),before.gets+1,'Aggiorna non accoda un secondo refresh');
      assert.equal(await page.evaluate(()=>apiWrites),0);assert.deepEqual(errors,[]);
    } finally {await page.close();}
  });
  await check('callback conversations ritirata non sostituisce dati né salute della nuova lettura', async () => {
    const {page,errors}=await fixture();
    try {
      await page.evaluate(() => {
        window.retiredConversation=subscriptions.conversations;
        stopInboxListener();startInboxListener();
        emitConversations([{...seedConversations[0],lastMessagePreview:'Nuovo dato verificato',lastMessageAt:'2026-09-21T10:00:00Z'}]);
      });
      await page.waitForTimeout(250);
      const before=await page.locator('#sgFreshness').innerText();
      const requests=await page.evaluate(() => apiCalls.length);
      await page.evaluate(() => {
        retiredConversation.next({docs:[{id:'obsolete',data:()=>({contactName:'Callback vecchia'})}],metadata:{fromCache:true}});
        retiredConversation.error({code:'permission-denied'});
      });
      await page.waitForTimeout(250);
      currentConversations(await page.evaluate(() => S.conversations.map(c=>c.lastMessagePreview)));
      assert.equal(await page.locator('#sgFreshness').innerText(),before);
      assert.equal(await page.evaluate(() => apiCalls.length),requests);
      await preserved(page,errors);
    } finally {await page.close();}
  });
  await check('callback operatorTasks ritirata non degrada il nuovo listener né avvia GET', async () => {
    const {page,errors}=await fixture();
    try {
      await page.evaluate(() => {window.retiredCase=subscriptions.operatorTasks;oggiSegretariaStopLive();oggiSegretariaStartLive();});
      await page.waitForTimeout(250);
      const before=await page.locator('#sgFreshness').innerText(),requests=await page.evaluate(()=>apiCalls.length);
      await page.evaluate(()=>{retiredCase.error({code:'permission-denied'});retiredCase.next({docs:[],metadata:{fromCache:true}});});
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#sgFreshness').innerText(),before);
      assert.equal(await page.evaluate(()=>apiCalls.length),requests);
      await preserved(page,errors);
    } finally {await page.close();}
  });
  await check('uscita da Oggi spegne il lavoro pendente; rientro riattiva un solo controllo', async()=>{
    const {page,errors}=await fixture();
    try {
      const before=await page.evaluate(()=>{
        subscriptions.operatorTasks.next({docs:[],metadata:{fromCache:false}});
        oggiSegretariaClose();S.page='properties';document.getElementById('main').innerHTML='<h1>Immobili</h1>';
        return apiCalls.length;
      });
      await page.waitForTimeout(250);
      await page.evaluate(()=>{changeVisibility(true);changeVisibility(false);window.dispatchEvent(new Event('online'));});
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>apiCalls.length),before);
      await page.evaluate(()=>{S.page='oggi';document.getElementById('main').innerHTML=oggiPage();});
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>apiCalls.length),before+1,'Il rientro deve coalescere primo snapshot e lettura iniziale');
      const beforeForeground=await page.evaluate(()=>{holdAPI=true;return apiCalls.length;});
      await page.evaluate(()=>{changeVisibility(true);changeVisibility(false);document.dispatchEvent(new Event('visibilitychange'));});
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>apiCalls.length),beforeForeground+1,'Il foreground dopo rientro deve avviare una sola lettura');
      assert.equal(await page.evaluate(()=>apiWrites),0);assert.deepEqual(errors,[]);
    } finally {await page.close();}
  });
  await check('cambio utente invalida la risposta in volo e le vecchie callback',async()=>{
    const {page,errors}=await fixture();
    try {
      await page.evaluate(()=>{holdAPI=true;oggiSegretariaLoad();});
      await page.waitForFunction(()=>heldAPI.length===1);
      const requests=await page.evaluate(()=>{
        window.oldConversation=subscriptions.conversations;window.oldCase=subscriptions.operatorTasks;
        portalFreshnessStop();stopInboxListener();oggiSegretariaStopLive();oggiSegretariaClose();
        auth.currentUser={uid:'another-user',getIdToken:async()=> 'new-synthetic-token'};
        S.profile={id:'another-user',role:'tenant'};S.page='my-maintenance';S.conversations=[];
        document.getElementById('main').innerHTML='<h1>Le mie richieste</h1>';
        return apiCalls.length;
      });
      await page.evaluate(()=>{
        oldConversation.next({docs:[{id:'private-old',data:()=>({contactName:'Vecchio utente'})}],metadata:{fromCache:false}});
        oldConversation.error({code:'permission-denied'});oldCase.error({code:'permission-denied'});
        holdAPI=false;heldAPI.splice(0).forEach(resolve=>resolve());
        changeVisibility(true);changeVisibility(false);window.dispatchEvent(new Event('online'));
      });
      await page.waitForTimeout(350);
      assert.deepEqual(await page.evaluate(()=>S.conversations),[]);
      assert.equal(await page.evaluate(()=>apiCalls.length),requests);
      assert.equal(await page.locator('#main').innerText(),'Le mie richieste');
      assert.equal(await page.locator('#sgFollowPanel').count(),0);
      assert.equal(await page.evaluate(()=>apiWrites),0);assert.deepEqual(errors,[]);
    } finally {await page.close();}
  });
  await check('snapshot Inbox conserva testo, oggetto email, focus e selezione nel compositore reale',async()=>{
    const {page,errors}=await fixture();
    try {
      await page.evaluate(()=>{
        oggiSegretariaClose();S.page='inbox';_inboxState.convId='conv-demo';_inboxState.composing='email';
        document.getElementById('main').innerHTML=inboxPage();
      });
      await page.locator('#inboxSubject').fill('Oggetto ancora da completare');
      await page.locator('#inboxBody').fill('Bozza email da conservare');
      await page.locator('#inboxBody').focus();
      await page.evaluate(()=>{
        document.getElementById('inboxBody').setSelectionRange(3,12,'backward');
        emitConversations([{...seedConversations[0],lastMessagePreview:'Nuovo messaggio ricevuto'}]);
      });
      await page.waitForTimeout(250);
      assert.deepEqual(await page.evaluate(()=>{
        const el=document.getElementById('inboxBody');
        return {body:el.value,subject:document.getElementById('inboxSubject').value,focus:document.activeElement.id,selection:[el.selectionStart,el.selectionEnd,el.selectionDirection]};
      }),{body:'Bozza email da conservare',subject:'Oggetto ancora da completare',focus:'inboxBody',selection:[3,12,'backward']});
      assert.match(await page.locator('#main').innerText(),/Nuovo messaggio ricevuto/);
      assert.equal(await page.evaluate(()=>apiWrites),0);assert.deepEqual(errors,[]);
    } finally {await page.close();}
  });
  for(const surface of ['oggi','inbox'])await check('online globale reale · '+surface+' non tenta render completo con bozza aperta',async()=>{
    const {page,errors}=await fixture(portal,390,true);
    try {
      if(surface==='inbox'){
        await page.evaluate(()=>{oggiSegretariaClose();S.page='inbox';_inboxState.convId='conv-demo';_inboxState.composing='email';document.getElementById('main').innerHTML=inboxPage();});
        await page.locator('#inboxSubject').fill('Oggetto da preservare');
        await page.locator('#inboxBody').fill('Bozza online da preservare');
        await page.locator('#inboxBody').focus();
      }
      await page.evaluate(()=>window.dispatchEvent(new Event('online')));
      await page.waitForTimeout(350);
      noWholeRender(await page.evaluate(()=>fullRenders),surface);
      if(surface==='oggi')await preserved(page,errors);
      else {
        assert.equal(await page.locator('#inboxSubject').inputValue(),'Oggetto da preservare');
        assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza online da preservare');
        assert.equal(await page.evaluate(()=>document.activeElement.id),'inboxBody');
        assert.equal(await page.evaluate(()=>apiWrites),0);assert.deepEqual(errors,[]);
      }
    } finally {await page.close();}
  });
  await check('online globale reale · le altre sezioni mantengono il refresh completo',async()=>{
    const {page,errors}=await fixture(portal,390,true);
    try {
      await page.evaluate(()=>{oggiSegretariaClose();S.page='properties';document.getElementById('main').innerHTML='<h1>Immobili</h1>';});
      await page.waitForTimeout(100);
      await page.evaluate(()=>window.dispatchEvent(new Event('online')));
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>fullRenders),1,'Le altre sezioni devono mantenere il refresh globale');
      assert.equal(await page.evaluate(()=>apiWrites),0);assert.deepEqual(errors,[]);
    } finally {await page.close();}
  });
  const mutations = [
    {label:'errore conversations invisibile',name:'startInboxListener',from:"S.inboxFeed = { state: 'error' };",to:"S.inboxFeed = { state: 'live' };",expected:/callback errore/,
      probe:async page=>{const before=await page.locator('#sgFreshness').innerText();await page.evaluate(()=>subscriptions.conversations.error({code:'unavailable'}));await page.waitForTimeout(250);visibleError(before,await page.locator('#sgFreshness').innerText());}},
    {label:'ripresa foreground disattivata',name:'portalFreshnessResume',from:'function portalFreshnessResume(event) {',to:'function portalFreshnessResume(event) { return;',expected:/Entro 500ms/,
      probe:async page=>{const before=await page.evaluate(()=>{holdAPI=true;changeVisibility(true);return apiCalls.length;});await page.evaluate(()=>changeVisibility(false));await page.waitForTimeout(500);foregroundRead(before,await page.evaluate(()=>apiCalls.length));}},
    {label:'callback conversations ritirata accettata',name:'startInboxListener',from:'if (!active || !current()) return;',to:'/* guardia ritirata rimossa */',expected:/callback ritirata/,
      probe:async page=>{await page.evaluate(()=>{window.retired=subscriptions.conversations;stopInboxListener();startInboxListener();emitConversations([{...seedConversations[0],lastMessagePreview:'Nuovo dato verificato'}]);retired.next({docs:[{id:'old',data:()=>({lastMessagePreview:'Dato superato'})}],metadata:{fromCache:false}});});currentConversations(await page.evaluate(()=>S.conversations.map(c=>c.lastMessagePreview)));}}
  ];
  for(const mutation of mutations)await check('MUTAZIONE · '+mutation.label+' fa cadere la prova',async()=>{
    const original=named(mutation.name),changed=original.replace(mutation.from,mutation.to);
    assert.notEqual(changed,original,'La mutazione deve colpire il sorgente vero');
    const {page,errors}=await fixture(portal.replace(original,changed));
    try {await assert.rejects(()=>mutation.probe(page),mutation.expected);assert.deepEqual(errors,[]);}
    finally {await page.close();}
  });
  await check('MUTAZIONE · refresh globale reintrodotto su Inbox fa cadere la prova',async()=>{
    const guard="if (['oggi', 'inbox'].includes(S.page) && auth.currentUser && (isAdmin() || isLandlord())) {";
    assert(portal.includes(guard),'La guardia online reale deve essere presente');
    const {page,errors}=await fixture(portal.replace(guard,'if (false) {'),390,true);
    try {
      await page.evaluate(()=>{oggiSegretariaClose();S.page='inbox';_inboxState.convId='conv-demo';_inboxState.composing='email';document.getElementById('main').innerHTML=inboxPage();});
      await page.locator('#inboxBody').fill('Bozza online da preservare');
      await page.locator('#inboxBody').focus();
      await page.evaluate(()=>window.dispatchEvent(new Event('online')));
      await page.waitForTimeout(350);
      assert.throws(()=>noWholeRender(1,'inbox'),/listener online globale/,'Il controllo stesso deve essere attivo');
      const count=await page.evaluate(()=>fullRenders);
      assert.throws(()=>noWholeRender(count,'inbox'),/listener online globale/);
      assert.deepEqual(errors,[]);
    } finally {await page.close();}
  });
  if(process.env.SCREENSHOT_DIR)for(const width of [390,1440])await check('anteprima '+width+' · avviso e bozza senza overflow',async()=>{
    const {page,errors}=await fixture(portal,width);
    try {
      await page.evaluate(()=>subscriptions.conversations.error({code:'unavailable'}));
      await preserved(page,errors);
      const box=await page.locator('#sgFollowModal .modal').boundingBox();
      assert(box.x>=-1 && box.x+box.width<=width+1);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:join(process.env.SCREENSHOT_DIR,'freshness-draft-'+width+'.png')});
      await page.locator('[data-sg-modal="cancel"]').first().click();
      await page.locator('#sgFreshness').scrollIntoViewIfNeeded();
      await page.screenshot({path:join(process.env.SCREENSHOT_DIR,'freshness-warning-'+width+'.png')});
    } finally {await page.close();}
  });
  console.log('\nFreshness Oggi: ' + passed + ' pass, ' + failed + ' fail');
  process.exitCode = failed ? 1 : 0;
} finally { await browser.close(); }
