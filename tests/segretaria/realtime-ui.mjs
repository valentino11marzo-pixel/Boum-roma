// Listener Firestore e regioni Oggi/Inbox reali, con soli confini di rete simulati.
// node tests/segretaria/realtime-ui.mjs (BOOM_PLAYWRIGHT / BOOM_CHROME se necessari)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const portal = read('js/portal-app.js');
const named = (source, name) => {
  const start = source.indexOf('    function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n    function ', start + 1);
  return source.slice(start, end);
};
const body = source => source.slice(source.indexOf('    function oggiDismissKey()'), source.indexOf('    function adminDashboard()'));
const listeners = source => ['startActionQueueListener', 'startContractsListener', 'startMaintenanceListener',
  'startOpenConvListener', 'stopOpenConvListener', 'inboxThreadPanel'].map(n => named(source, n)).join('\n');
const chromium = await loadChromium();
assert.ok(chromium, 'Playwright necessario per verificare i listener nel browser');
const browser = await chromium.launch(launchOptions());
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log('PASS ' + name); };

async function fixture(source = portal, mobile = false) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<main id="main"></main><div id="modals"></div>');
  await page.addScriptTag({ content: `
    const S={page:'oggi',profile:{id:'admin',role:'admin'},_paLoaded:true,actionQueue:[],contracts:[],maintenance:[],conversations:[],messages:[]};
    const auth={currentUser:{uid:'admin',getIdToken:async()=> 'test'}};
    const isAdmin=()=>S.profile?.role==='admin', isLandlord=()=>false;
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const checkAlerts=()=>{},buildNav=()=>{},toast=()=>{},sendBrowserNotification=()=>{};
    const renderPage=()=>{throw Error('Un listener ha ricreato la pagina intera')};
    const _inboxState={convId:null};
    const BOOM_INBOX={groupByDay:msgs=>msgs.length?[{dateLabel:'oggi',items:msgs}]:[],whatsappUrl:()=>''};
    const kindLabel=()=>'',inboxHomieBanner=()=>'',inboxMessageBubble=m=>'<p data-message="'+m.id+'">'+m.id+'</p>';
    const inboxComposer=()=>'<textarea id="inboxBody"></textarea>';
    function inboxPage(){return inboxThreadPanel({id:_inboxState.convId})}
    function inboxRefresh(){if(S.page==='inbox')document.getElementById('main').innerHTML=inboxThreadPanel({id:_inboxState.convId})}
    window.apiCalls=0;window.holdRequests=false;window.held=[];window.apiRows=[];window.apiMonitoring=null;
    window.apiWrites=0;window.fetch=async(url,options={})=>{window.apiCalls++;if(options.method==='POST')window.apiWrites++;if(window.holdRequests)await new Promise(r=>window.held.push(r));return {ok:true,json:async()=>({ok:true,rows:window.apiRows,monitoring:window.apiMonitoring,task:window.apiRows.find(t=>String(url).includes(t.id)),dossier:{practices:[]}})}};
    window.subscriptions={};window.unsubscribed=0;window.messageRows=[];
    const db={collection(name){
      const query={name,filter:null,sort:null,max:Infinity,
        where(field,op,value){this.filter=[field,value];return this},orderBy(field,dir){this.sort=[field,dir];return this},limit(n){this.max=n;return this},
        onSnapshot(next,error){
          const key=name==='messages'?name+':'+this.filter[1]:name;
          const sub={query:this,next,error};window.subscriptions[key]=sub;
          if(name==='messages'){
            let rows=window.messageRows.filter(m=>m.conversationId===this.filter[1]);
            rows.sort((a,b)=>this.sort ? (Date.parse(b.at)-Date.parse(a.at)) : a.id.localeCompare(b.id));
            next({docs:rows.slice(0,this.max).map(m=>({id:m.id,data:()=>m}))});
          }else if(name==='operatorTasks')next({docs:[]});
          return()=>{window.unsubscribed++;sub.stopped=true};
        }};
      return query;
    }};
    window.emit=(name,rows=[])=>window.subscriptions[name].next({docs:rows.map(r=>({id:r.id,data:()=>r}))});
  ` });
  for (const name of ['js/oggi-engine.js', 'js/segretaria-casi-engine.js', 'js/segretaria-proposta-engine.js']) await page.addScriptTag({ content: read(name) });
  await page.addScriptTag({ content: body(source) + '\n' + listeners(source) + `
    document.getElementById('main').innerHTML=oggiPage();
    startActionQueueListener();startContractsListener();startMaintenanceListener();
  ` });
  await page.waitForFunction(() => oggiSegretaria.loaded);
  return { page, errors };
}

async function actionAppears(page) {
  await page.evaluate(() => emit('action_queue', [{id:'new-action',status:'pending',summary:'Richiesta appena arrivata'}]));
  await page.waitForTimeout(260);
  assert.match(await page.locator('#ogDecisionPanel').innerText(), /Richiesta appena arrivata/);
}

try {
  const { page, errors } = await fixture();
  await check('una proposta in arrivo aggiorna Oggi senza navigare o ricaricare', () => actionAppears(page));
  await check('raffiche coalescenti conservano il modulo, la bozza e il focus', async () => {
    await page.evaluate(() => {
      document.getElementById('modals').innerHTML='<div class="modal-overlay active" id="sgFollowModal"><textarea id="editing">Bozza da finire</textarea></div>';
      document.getElementById('editing').focus();window.savedModal=document.getElementById('sgFollowModal');
      window.decisionRenders=0;new MutationObserver(()=>window.decisionRenders++).observe(document.getElementById('ogDecisionPanel'),{childList:true});
      emit('action_queue',[{id:'burst',status:'pending',summary:'Ultimo aggiornamento'}]);
      emit('contracts',[{id:'c1',signatureStatus:'partial'}]);
      emit('action_queue',[{id:'burst',status:'pending',summary:'Ultimo aggiornamento'}]);
    });
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => window.decisionRenders), 1);
    assert.equal(await page.evaluate(() => document.getElementById('sgFollowModal')===window.savedModal), true);
    assert.equal(await page.locator('#editing').inputValue(), 'Bozza da finire');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'editing');
    assert.match(await page.locator('#ogDecisionPanel').innerText(), /Firma a metà/);
    await page.evaluate(() => emit('contracts', []));
    await page.waitForTimeout(220);
    assert.doesNotMatch(await page.locator('#ogDecisionPanel').innerText(), /Firma a metà/);
  });
  await check('cambio seguito rilegge l’API; un cambio durante la lettura non viene perso', async () => {
    const before = await page.evaluate(() => {window.holdRequests=true;emit('operatorTasks');return window.apiCalls});
    await page.waitForFunction(() => window.held.length===1);
    await page.evaluate(() => emit('operatorTasks'));
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => window.apiCalls), before + 1);
    await page.evaluate(() => {window.holdRequests=false;window.held.shift()()});
    await page.waitForFunction(expected => window.apiCalls===expected, before + 2);
    assert.equal(await page.locator('#editing').inputValue(), 'Bozza da finire');
  });
  await check('limite e mancata disponibilità della preparazione sono visibili e separati dall’ingresso WhatsApp', async () => {
    await page.evaluate(async () => {
      window.apiMonitoring={status:'daily_cap',remainingToday:0,usedToday:5,dailyCap:5,checkedAt:'2026-09-17T08:00:00Z',lastRunAt:'2026-09-17T07:58:00Z'};
      S.conversations=[{channel:'whatsapp',lastDirection:'in',lastMessageAt:'2026-09-17T07:00:00Z'}];
      await oggiSegretariaLoad(true);
    });
    await page.getByText('Copertura degli aggiornamenti',{exact:true}).click();
    const text = await page.locator('#sgFollowPanel').innerText();
    assert.match(text,/Limite giornaliero raggiunto/);assert.match(text,/Tentativi disponibili oggi: 0/);
    assert.match(text,/Tentativi utilizzati oggi: 5 di 5/);assert.match(text,/anche i tentativi non riusciti/);
    assert.match(text,/Ultimo WhatsApp visibile:/);assert.match(text,/Ultima proposta: non disponibile/);
    assert.match(text,/copertura di WhatsApp non è verificata/);
    await page.evaluate(async () => {window.apiMonitoring=null;await oggiSegretariaLoad(true)});
    assert.match(await page.locator('#sgFollowPanel').innerText(),/Stato della preparazione automatica non disponibile/);
  });
  await check('un errore nel listener dichiara il ripiego al controllo periodico', async () => {
    await page.evaluate(() => window.subscriptions.operatorTasks.error({code:'permission-denied'}));
    assert.match(await page.locator('#sgFreshness').innerText(),/Aggiornamento immediato indisponibile/);
  });
  await check('uscire da Oggi sgancia il listener del seguito', async () => {
    await page.evaluate(() => {S.page='inbox';document.getElementById('main').innerHTML='';document.getElementById('modals').innerHTML=''});
    await page.waitForFunction(() => window.subscriptions.operatorTasks.stopped===true);
  });
  await check('una chat oltre 300 messaggi include l’ultimo e dichiara il limite', async () => {
    await page.evaluate(() => {
      window.messageRows=Array.from({length:305},(_,i)=>({id:'m'+String(i).padStart(3,'0'),conversationId:'long',at:new Date(1700000000000+i*1000).toISOString()}));
      _inboxState.convId='long';startOpenConvListener('long');
    });
    assert.equal(await page.locator('[data-message="m304"]').count(),1);
    assert.equal(await page.locator('[data-message="m000"]').count(),0);
    assert.match(await page.locator('#main').innerText(),/300 messaggi più recenti/);
  });
  await check('errore cronologia visibile senza perdere la bozza; callback vecchio ignorato', async () => {
    await page.locator('#inboxBody').fill('Risposta ancora da completare');
    await page.evaluate(() => window.subscriptions['messages:long'].error({code:'failed-precondition'}));
    assert.equal(await page.locator('#inboxBody').inputValue(),'Risposta ancora da completare');
    assert.match(await page.locator('[role="alert"]').innerText(),/Non riesco ad aggiornare i messaggi/);
    await page.evaluate(() => {
      _inboxState.convId='other';startOpenConvListener('other');
      window.subscriptions['messages:long'].next({docs:[{id:'late',data:()=>({conversationId:'long'})}]});
    });
    assert.equal(await page.evaluate(() => S.messages.some(m=>m.id==='late')),false);
  });
  assert.deepEqual(errors, []);
  await page.close();
  await check('111 richieste restano da preparare; il limite lascia aprire le fonti senza consumare tentativi', async () => {
    const { page: backlog, errors: backlogErrors } = await fixture();
    try {
      await backlog.evaluate(async () => {
        const pending = i => ({id:'sg_'+i.toString(16).padStart(32,'0'),status:'open',source:'segretaria',followUp:{open:true,conversationId:'c'+i,contactName:'Contatto '+i,lastMessageId:'m'+i,nextAction:'Leggere le fonti',waitingOn:'boom',confirmed:false,needsReview:true,checkAt:new Date(Date.now()+7200000).toISOString()}});
        window.apiRows=Array.from({length:111},(_,i)=>pending(i+1));
        const ready=pending(112);ready.preparation={version:window.BOOM_PROPOSTA.VERSION,revision:'r1',messageId:ready.followUp.lastMessageId,summary:'Fonti controllate',recommendation:'Ricontrollare il documento',nextAction:{text:'Ricontrollare il documento'},sources:[],coverage:{version:2},status:'ready'};
        window.apiRows.push(ready);window.apiMonitoring={status:'daily_cap',remainingToday:0,usedToday:5,dailyCap:5};await oggiSegretariaLoad(true);
      });
      assert.equal(await backlog.locator('[data-sg-group="decisions"] .sg-count').innerText(),'1');
      assert.equal(await backlog.locator('[data-sg-group="preparing"] .sg-count').innerText(),'111');
      assert.equal(await backlog.locator('[data-sg-group="preparing"] article').count(),12);
      await backlog.locator('[data-sg-action="more-preparing"]').click();
      assert.equal(await backlog.locator('[data-sg-group="preparing"] article').count(),24);
      await backlog.locator('[data-sg-group="preparing"] [data-sg-action="inspect"]').first().click();
      await backlog.waitForFunction(()=>document.querySelector('[data-sg-modal="generate"]')?.disabled===true);
      assert.equal(await backlog.locator('[data-sg-modal="edit"]').isEnabled(),true);
      assert.equal(await backlog.locator('[data-sg-modal="source"]').isEnabled(),true);
      assert.equal(await backlog.evaluate(()=>window.apiWrites),0);
      await backlog.locator('[data-sg-modal="cancel"]').last().click();
      await backlog.evaluate(()=>{window.BOOM_PROPOSTA={current:()=>true};oggiSegretariaRender()});
      assert.equal(await backlog.locator('[data-sg-group="decisions"] .sg-count').innerText(),'0','engine vecchio: proposta non dichiarata pronta');
      assert.equal(await backlog.locator('[data-sg-group="preparing"] .sg-count').innerText(),'112');
      await backlog.evaluate(()=>{
        const t=window.apiRows[0];t.followUp.intakeTiming={status:'ambiguous',quote:'entro le 12:00 <img src=x onerror="window.injected=true">',sourceMessageId:'old-message'};oggiSegretariaRender();
      });
      assert.equal(await backlog.locator('[data-sg-group="decisions"] .sg-count').innerText(),'1');
      assert.match(await backlog.locator('.sg-intake-timing').innerText(),/fonte precedente/);
      assert.equal(await backlog.locator('.sg-intake-timing img').count(),0);
      assert.equal(await backlog.evaluate(()=>window.injected===true),false);
      await backlog.locator('[data-sg-group="decisions"] [data-sg-action="inspect"]').click();
      await backlog.waitForFunction(()=>document.querySelector('[data-sg-modal="edit"]'));
      await backlog.locator('[data-sg-modal="edit"]').click();
      assert.match(await backlog.locator('#sgFollowModal .sg-intake-timing').innerText(),/entro le 12:00/);
      assert.equal(await backlog.locator('#sgCheckAt').count(),1);
      assert.equal(await backlog.evaluate(()=>window.apiWrites),0);
      assert.deepEqual(backlogErrors,[]);
    } finally { await backlog.close(); }
  });
  await check('MUTAZIONE: togliere l’aggancio Oggi lascia la proposta invisibile e il test cade', async () => {
    const old = named(portal, 'startActionQueueListener');
    assert.ok(old.includes('oggiScheduleUpdate(true);'));
    const mutated = portal.replace(old, old.replace('oggiScheduleUpdate(true);', '/* aggancio rimosso */'));
    const { page: mutant } = await fixture(mutated);
    try { await assert.rejects(() => actionAppears(mutant), /Richiesta appena arrivata/); }
    finally { await mutant.close(); }
  });
  await check('mobile: nuovi seguiti arrivano anche mentre una proposta è aperta', async () => {
    const { page: mobile, errors: mobileErrors } = await fixture(portal,true);
    try {
      await mobile.evaluate(() => {
        document.getElementById('modals').innerHTML='<div id="sgFollowModal"><textarea id="editing">Bozza mobile</textarea></div>';
        window.apiRows=[{id:'sg_'+'a'.repeat(32),status:'open',source:'segretaria',followUp:{conversationId:'new',contactName:'Nuovo contatto',nextAction:'Verificare la richiesta',lastMessageId:'m1'}}];
        emit('operatorTasks');
      });
      await mobile.waitForFunction(() => document.getElementById('sgFollowPanel').textContent.includes('Nuovo contatto'));
      assert.equal(await mobile.locator('#editing').inputValue(),'Bozza mobile');
      assert.deepEqual(mobileErrors,[]);
    } finally { await mobile.close(); }
  });
  console.log(`\n${checks} verifiche realtime Oggi/Inbox superate.`);
} finally { await browser.close(); }
