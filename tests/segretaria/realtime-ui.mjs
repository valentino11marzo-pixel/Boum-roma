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
    window.apiCalls=0;window.holdRequests=false;window.held=[];window.apiRows=[];window.apiMonitoring=null;window.apiPages=null;window.apiRequests=[];window.holdCursor=null;
    window.apiWrites=0;window.fetch=async(url,options={})=>{window.apiCalls++;window.apiRequests.push(url);if(options.method==='POST')window.apiWrites++;const after=new URL(url,'https://local.test').searchParams.get('after');const payload=window.apiPages?window.apiPages[after||'first']:{ok:true,rows:window.apiRows,monitoring:window.apiMonitoring,task:window.apiRows.find(t=>String(url).includes(t.id)),dossier:{practices:[]}};if(window.holdRequests||(after&&after===window.holdCursor))await new Promise(r=>window.held.push(r));return {ok:true,json:async()=>payload}};
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
  for (const name of ['js/oggi-engine.js', 'js/segretaria-casi-engine.js', 'js/segretaria-proposta-engine.js', 'js/segretaria-esecuzione-engine.js']) await page.addScriptTag({ content: read(name) });
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
  await check('il listener copre tutti i seguiti aperti senza una soglia di 200',async()=>{
    assert.equal(await page.evaluate(()=>window.subscriptions.operatorTasks.query.max===Infinity),true);
    assert.deepEqual(await page.evaluate(()=>window.subscriptions.operatorTasks.query.filter),['followUp.open',true]);
  });
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
  await check('stato legacy e mancata disponibilità sono visibili e separati dall’ingresso WhatsApp', async () => {
    await page.evaluate(async () => {
      window.apiMonitoring={status:'daily_cap',remainingToday:0,usedToday:5,dailyCap:5,checkedAt:'2026-09-17T08:00:00Z',lastRunAt:'2026-09-17T07:58:00Z'};
      S.conversations=[{channel:'whatsapp',lastDirection:'in',lastMessageAt:'2026-09-17T07:00:00Z'}];
      await oggiSegretariaLoad(true);
    });
    await page.getByText('Copertura degli aggiornamenti',{exact:true}).click();
    await page.locator('.sg-service-details > summary').click();
    const text = await page.locator('#sgFollowPanel').innerText();
    assert.match(text,/servizio precedente segnala un limite giornaliero raggiunto/);
    assert.match(text,/Tentativi oggi: 5/);assert.match(text,/compresi quelli non riusciti/);
    assert.doesNotMatch(text,/Tentativi disponibili oggi|5 di 5|prossimo giorno/);
    assert.match(text,/Ultimo WhatsApp visibile:/);assert.match(text,/Ultima proposta: non disponibile/);
    assert.match(text,/copertura di WhatsApp non è verificata/);
    await page.evaluate(async () => {window.apiMonitoring=null;await oggiSegretariaLoad(true)});
    assert.match(await page.locator('#sgFollowPanel').innerText(),/Stato della preparazione automatica non disponibile/);
  });
  await check('preparazione continua: tentativi osservativi, arretrato e retry non diventano completamento', async () => {
    await page.evaluate(async () => {
      window.apiMonitoring={mode:'continuous',status:'working',dailyCap:null,remainingToday:null,usedToday:1500,
        counts:{pending:81,current:19,awaitingReview:4,retrying:7},retryReasons:{invalid_preparation:3,calendar_invalid:1,unrecognized_private_text:2},nextRetryAt:'2030-09-18T13:00:00Z',queueIncomplete:true,stoppedBy:'time_budget'};
      await oggiSegretariaLoad(true);
    });
    if (!await page.locator('.sg-service-details').evaluate(el => el.open)) await page.locator('.sg-service-details > summary').click();
    const text = await page.locator('#sgPreparationStatus').innerText();
    assert.match(text,/Preparazione continua · nessuna quota giornaliera/);
    assert.match(text,/Tentativi oggi: 1500/);
    assert.match(text,/Richieste da valutare: 81/);assert.match(text,/Proposte attuali: 19/);
    assert.match(text,/In attesa di verifica: 4/);assert.match(text,/Casi da ritentare: 7/);assert.match(text,/non sono proposte pronte/);
    assert.match(text,/Parte della coda, ultimo ciclo/);assert.match(text,/Proposta non valida: 3/);assert.match(text,/Orario da verificare: 1/);
    assert.match(text,/Prossimo tentativo previsto/);assert.doesNotMatch(text,/unrecognized_private_text/);
    assert.match(text,/tempo disponibile/);assert.match(text,/lettura della coda è parziale/);
    assert.doesNotMatch(text,/Tentativi disponibili|1500 di|limite giornaliero raggiunto|tutto elaborato/i);
    assert.equal(await page.locator('#editing').inputValue(),'Bozza da finire');
    assert.equal(await page.evaluate(()=>document.getElementById('sgFollowModal')===window.savedModal),true);
    await page.evaluate(async () => {window.apiMonitoring={mode:'continuous',status:'idle',usedToday:null,counts:{pending:0,current:0,retrying:0},queueIncomplete:true};await oggiSegretariaLoad(true)});
    assert.match(await page.locator('#sgPreparationStatus').innerText(),/Nessuna nuova proposta nell’ultimo ciclo/);
    assert.match(await page.locator('#sgPreparationStatus').innerText(),/potrebbero esserci altre richieste/);
    assert.doesNotMatch(await page.locator('#sgPreparationStatus').innerText(),/Tentativi oggi: 0/);
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
  await check('nessuna quota nella Home continua; la revisione manuale resta non approvabile', async () => {
    const {page: continuous, errors: continuousErrors}=await fixture();
    try {
      await continuous.evaluate(async () => {
        const make = (i,status) => ({id:'sg_'+String(i).repeat(32),status:'open',source:'segretaria',followUp:{open:true,conversationId:'c'+i,contactName:'Contatto '+i,lastMessageId:'m'+i,nextAction:'Verificare la richiesta',waitingOn:'boom',confirmed:false,needsReview:true,checkAt:new Date(Date.now()+7200000).toISOString()},
          ...(status?{preparation:{version:window.BOOM_PROPOSTA.VERSION,revision:'r'+i,messageId:'m'+i,summary:'Fonti da confrontare',recommendation:'Verificare il ricontrollo',nextAction:{text:'Verificare il ricontrollo',checkAt:new Date(Date.now()+7200000).toISOString()},sources:[],coverage:{version:2},status}}:{})});
        window.apiRows=[make(1),make(2,'needs_context'),make(3,'ready')];
        window.apiMonitoring={mode:'continuous',status:'working',dailyCap:null,remainingToday:null,usedToday:1500,counts:{pending:1,current:2,retrying:0}};
        await oggiSegretariaLoad(true);
      });
      assert.match(await continuous.locator('.sg-briefing-note').innerText(),/1 proposta pronta da rivedere.*1 richiesta da verificare/);
      assert.equal(await continuous.locator('.sg-proposal-label').filter({hasText:'Seguito interno'}).count(),1);
      assert.equal(await continuous.locator('.sg-proposal-label').filter({hasText:'Da verificare'}).count(),1);
      await continuous.locator('[data-sg-group="preparing"] [data-sg-action="inspect"]').click();
      await continuous.waitForFunction(()=>document.querySelector('[data-sg-modal="generate"]')?.disabled===false);
      assert.equal(await continuous.evaluate(()=>window.apiWrites),0,'consultare una richiesta non prepara né invia');
      await continuous.locator('[data-sg-modal="cancel"]').last().click();
      await continuous.locator('[data-sg-id="sg_'+ '2'.repeat(32)+'"] [data-sg-action="review"]').click();
      await continuous.waitForFunction(()=>document.querySelector('[data-sg-modal="approve"]')?.disabled===true);
      await continuous.evaluate(()=>oggiSegretariaPrepare('approve'));
      assert.equal(await continuous.evaluate(()=>window.apiWrites),0,'needs_context non approvabile anche chiamando il gestore');
      await continuous.locator('[data-sg-modal="cancel"]').last().click();
      await continuous.evaluate(async()=>{window.apiMonitoring.status='daily_cap';window.apiMonitoring.dailyCap=50;window.apiMonitoring.remainingToday=0;await oggiSegretariaLoad(true)});
      await continuous.locator('[data-sg-group="preparing"] [data-sg-action="inspect"]').click();
      await continuous.waitForFunction(()=>document.querySelector('[data-sg-modal="generate"]')?.disabled===false);
      assert.doesNotMatch(await continuous.locator('#sgPreparationStatus').innerText(),/limite giornaliero raggiunto/);
      assert.match(await continuous.locator('#sgPreparationStatus').innerText(),/Stato della preparazione automatica da verificare/);
      assert.equal(await continuous.evaluate(()=>window.apiWrites),0);
      assert.deepEqual(continuousErrors,[]);
    } finally {await continuous.close();}
  });
  await check('errore di preparazione in revisione: motivo leggibile, apertura senza inferenza e vecchia proposta non pronta',async()=>{
    const {page:review,errors:reviewErrors}=await fixture();
    try {
      await review.evaluate(async()=>{
        const task={id:'sg_'+'6'.repeat(32),status:'open',source:'segretaria',followUp:{open:true,conversationId:'c6',contactName:'Contatto verifica',lastMessageId:'m6',nextAction:'Verificare la fonte',waitingOn:'boom',confirmed:false,needsReview:true,checkAt:new Date(Date.now()+7200000).toISOString()},
          preparationReview:{reason:'calendar_invalid'},preparation:{version:window.BOOM_PROPOSTA.VERSION,revision:'old-ready',messageId:'m6',summary:'Vecchia proposta',recommendation:'Attendere',nextAction:{text:'Attendere'},sources:[],coverage:{version:2},status:'ready'}};
        window.apiRows=[task];window.apiMonitoring={mode:'continuous',status:'idle',counts:{awaitingReview:1,pending:0}};
        await oggiSegretariaLoad(true);
      });
      assert.equal(await review.locator('[data-sg-group="decisions"] .sg-count').innerText(),'1');
      assert.equal(await review.locator('.sg-proposal-label').innerText(),'Da verificare');
      assert.match(await review.locator('.sg-case').innerText(),/orario proposto richiede verifica/);
      assert.doesNotMatch(await review.locator('.sg-case').innerText(),/Proposta pronta|calendar_invalid/);
      await review.locator('[data-sg-action="inspect"]').click();
      await review.waitForFunction(()=>document.querySelector('[data-sg-modal="generate"]'));
      assert.match(await review.locator('#sgFollowModal').innerText(),/Da verificare.*orario proposto/s);
      assert.equal(await review.locator('[data-sg-modal="approve"]').count(),0);
      assert.equal(await review.evaluate(()=>window.apiWrites),0);
      await review.evaluate(()=>{
        const previousFetch=window.fetch;
        window.fetch=async(url,options={})=>{
          if(options.method==='POST'&&url==='/api/segretaria/prepare'){
            window.apiWrites++;
            const response=window.generateResponse;
            return {ok:response.status<400,status:response.status,json:async()=>response.data};
          }
          return previousFetch(url,options);
        };
        window.generateResponse={status:503,data:{ok:false,error:'preparation_unavailable'}};
      });
      await review.locator('[data-sg-modal="generate"]').click();
      await review.waitForFunction(()=>!oggiSegretaria.modal.busy);
      assert.equal(await review.evaluate(()=>oggiSegretaria.modal.task.preparationReview.reason),'calendar_invalid','fallimento mantiene la verifica');
      assert.equal(await review.locator('[data-sg-modal="approve"]').count(),0);
      // A nominal HTTP 200 cannot clear review for another event or malformed content.
      for (const malformed of ['event','shape']) {
        await review.evaluate(kind=>{
          const task=oggiSegretaria.modal.task;
          const preparation={...task.preparation,revision:'new-ready',...(kind==='event'?{messageId:'different-event'}:{summary:null})};
          window.generateResponse={status:200,data:{ok:true,id:task.id,preparation}};
        },malformed);
        await review.locator('[data-sg-modal="generate"]').click();
        await review.waitForFunction(()=>!oggiSegretaria.modal.busy);
        assert.equal(await review.evaluate(()=>oggiSegretaria.modal.task.preparationReview.reason),'calendar_invalid');
        assert.equal(await review.locator('[data-sg-modal="approve"]').count(),0);
      }
      await review.evaluate(()=>{
        const task=oggiSegretaria.modal.task;
        window.generateResponse={status:200,data:{ok:true,id:task.id,preparation:{...task.preparation,revision:'new-ready',nextAction:{...task.preparation.nextAction,checkAt:new Date(Date.now()+7200000).toISOString()}}}};
      });
      await review.locator('[data-sg-modal="generate"]').click();
      await review.waitForFunction(()=>!oggiSegretaria.modal.busy&&document.querySelector('[data-sg-modal="approve"]')?.disabled===false);
      assert.equal(await review.evaluate(()=>oggiSegretaria.modal.task.preparationReview),null,'successo validato libera la nuova proposta');
      assert.equal(await review.evaluate(()=>oggiSegretaria.rows[0].preparationReview),null);
      assert.equal(await review.locator('.sg-proposal-label').innerText(),'Seguito interno');
      assert.equal(await review.locator('[data-sg-modal="approve"]').isEnabled(),true);
      assert.equal(await review.evaluate(()=>window.apiWrites),4,'solo le quattro richieste manuali di preparazione');
      await review.locator('[data-sg-modal="cancel"]').last().click();
      await review.evaluate(async()=>{
        window.apiRows[0].preparationReview=null;window.apiRows[0].preparation=null;
        window.apiRows[0].preparationRetry={state:'review_required',messageId:'old-event',reason:'calendar_invalid'};
        await oggiSegretariaLoad(true);
      });
      assert.equal(await review.locator('[data-sg-group="preparing"] .sg-count').innerText(),'1');
      assert.equal(await review.locator('.sg-proposal-label').count(),0,'retry storico non è prova attuale');
      assert.deepEqual(reviewErrors,[]);
    } finally {await review.close();}
  });
  async function loadPagedRows(target) {
    await target.evaluate(async () => {
      const make=i=>({id:'sg_'+i.toString(16).padStart(32,'0'),status:'open',source:'segretaria',followUp:{open:true,conversationId:'c'+i,contactName:'Contatto '+i,lastMessageId:'m'+i,nextAction:'Leggere le fonti',waitingOn:'boom',confirmed:false,needsReview:true,checkAt:new Date(Date.now()+7200000).toISOString()}});
      window.apiPages={
        first:{ok:true,rows:Array.from({length:200},(_,i)=>make(i+1)),incomplete:true,nextCursor:'cursor-one'},
        'cursor-one':{ok:true,rows:Array.from({length:21},(_,i)=>make(i+201)),incomplete:false,nextCursor:null}
      };
      await oggiSegretariaLoad(true);
    });
    assert.equal(await target.evaluate(()=>oggiSegretaria.rows.length),221,'anche i seguiti oltre la prima pagina restano raggiungibili');
    assert.equal(await target.locator('[data-sg-group="preparing"] .sg-count').innerText(),'221');
    assert.equal(await target.evaluate(()=>oggiSegretaria.incomplete),false);
    assert.equal(await target.evaluate(()=>window.apiRequests.some(url=>url.endsWith('?after=cursor-one'))),true);
  }
  await check('tutte le pagine sono caricate; refresh e errori conservano elenco e bozza', async () => {
    const {page:paged,errors:pagedErrors}=await fixture();
    try {
      await loadPagedRows(paged);
      await paged.evaluate(()=>{
        document.getElementById('modals').innerHTML='<div id="sgFollowModal"><textarea id="pagedDraft">Bozza paginata</textarea></div>';
        document.getElementById('pagedDraft').focus();window.savedPagedModal=document.getElementById('sgFollowModal');
        window.holdCursor='cursor-one';window.refreshRun=oggiSegretariaLoad(true);
      });
      await paged.waitForFunction(()=>window.held.length===1);
      assert.equal(await paged.evaluate(()=>oggiSegretaria.rows.length),221,'il refresh della prima pagina non nasconde le altre');
      assert.equal(await paged.locator('#pagedDraft').inputValue(),'Bozza paginata');
      await paged.evaluate(async()=>{window.holdCursor=null;window.held.shift()();await window.refreshRun});
      assert.equal(await paged.evaluate(()=>document.getElementById('sgFollowModal')===window.savedPagedModal),true);
      assert.equal(await paged.evaluate(()=>document.activeElement.id),'pagedDraft');
      await paged.evaluate(async()=>{
        window.apiPages['cursor-one']={ok:true,rows:[],incomplete:true,nextCursor:'cursor-one',readingDegraded:true,readError:'follow_up_page_unavailable'};
        await oggiSegretariaLoad(true);
      });
      assert.equal(await paged.evaluate(()=>oggiSegretaria.rows.length),221,'errore successivo non cancella l’elenco completo precedente');
      assert.match(await paged.locator('#sgFollowPanel [role="alert"]').innerText(),/Non riesco a leggere tutti i seguiti/);
      await paged.evaluate(async()=>{window.apiPages['cursor-one']={ok:true,rows:[],incomplete:true,nextCursor:'cursor-one'};await oggiSegretariaLoad(true)});
      assert.equal(await paged.evaluate(()=>oggiSegretaria.loading),false,'cursore ripetuto termina senza ciclo infinito');
      assert.equal(await paged.evaluate(()=>oggiSegretaria.rows.length),221);
      // An earlier delayed page must never replace a newer completed refresh.
      await paged.evaluate(()=>{window.apiPages['cursor-one']={ok:true,rows:[],incomplete:false,nextCursor:null};window.holdCursor='cursor-one';window.oldRefresh=oggiSegretariaLoad(true)});
      await paged.waitForFunction(()=>window.held.length===1);
      await paged.evaluate(async()=>{
        window.holdCursor=null;window.apiPages={first:{ok:true,rows:window.apiPages.first.rows.slice(0,1),incomplete:false,nextCursor:null}};
        await oggiSegretariaLoad(true);window.held.shift()();await window.oldRefresh;
      });
      assert.equal(await paged.evaluate(()=>oggiSegretaria.rows.length),1,'risposta obsoleta ignorata');
      assert.equal(await paged.locator('#pagedDraft').inputValue(),'Bozza paginata');
      assert.equal(await paged.evaluate(()=>window.apiWrites),0);
      assert.deepEqual(pagedErrors,[]);
    } finally {await paged.close();}
  });
  await check('una prima lettura parziale conserva i seguiti già letti e dichiara cosa manca', async()=>{
    const {page:partial,errors:partialErrors}=await fixture();
    try {
      await partial.evaluate(async()=>{
        oggiSegretaria.loaded=false;
        window.apiPages={first:{ok:true,rows:[{id:'sg_'+'4'.repeat(32),status:'open',source:'segretaria',followUp:{open:true,lastMessageId:'m4',contactName:'Richiesta letta',nextAction:'Verificare'}}],incomplete:true,readingDegraded:true,nextCursor:'retry',readError:'follow_up_page_unavailable'}};
        await oggiSegretariaLoad(true);
      });
      assert.equal(await partial.evaluate(()=>oggiSegretaria.rows.length),1);
      assert.equal(await partial.evaluate(()=>oggiSegretaria.incomplete),true);
      assert.match(await partial.locator('#sgFollowPanel').innerText(),/Elenco parziale: non è stato possibile leggere tutti i seguiti/);
      assert.deepEqual(partialErrors,[]);
    } finally {await partial.close();}
  });
  await check('MUTAZIONE: fermarsi alla prima pagina perde i seguiti successivi e il test cade',async()=>{
    assert.ok(portal.includes('} while (cursor);'));
    const {page:mutant}=await fixture(portal.replace('} while (cursor);','} while (false);'));
    try {await assert.rejects(()=>loadPagedRows(mutant),/oltre la prima pagina/);}
    finally {await mutant.close();}
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
