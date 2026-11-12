// Actual Oggi renderers/controllers/engines; only persisted data and HTTP IO
// are synthetic. Opening this page must never prepare AI or dispatch anything.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const boot = "goTo(location.hash.slice(1)||'oggi',true);";
const monitoring = "monitoring:{mode:'continuous',status:'paused',preparationEnabled:false}";
assert(html.includes(boot) && html.includes(monitoring), 'Harness IO boundaries exist');
const seed = `
S.maintenance=[];S.clients=[];S.viewingRequests=[];
S.contracts[0].signatureStatus='complete';
testIO.monitoring={mode:'continuous',status:'working',preparationEnabled:true,lastRunAt:new Date().toISOString(),incomplete:true};
testIO.followUps=[caseRow('a',{})];
S.conversations=[{id:'conv-a',status:'open',channel:'email',contactType:'tenant',contactId:'p-demo',contactName:'Persona Demo',needsReply:true,lastDirection:'in',lastMessageAt:recentAt,lastMessagePreview:'Il tecnico può passare domani dalle 10 alle 12.'}];
testIO.followUps[0].preparation={version:4,coverage:{version:2,incomplete:true,reasons:['attachments_not_read']},revision:'prepared-demo-1',contextRevision:0,status:'ready',messageId:'phone:demo-call',selectedPracticeRef:'contracts/contratto-demo',createdAt:new Date().toISOString(),
summary:'Il tecnico propone domani dalle 10 alle 12. Serve organizzare l’accesso. <img src=x onerror="window.briefingInjected=true">',recommendation:'Chiarire chi apre al tecnico',sources:[{id:'source-demo',kind:'message'}],uncertainties:[{text:'Chi avvisa il portiere? <b>Non confermato</b>'}],
nextAction:{text:'Confermare chi apre al tecnico',reason:'L’accesso non è ancora confermato. <svg onload="window.briefingInjected=true">',checkAt:new Date(Date.now()+86400000).toISOString(),waitingOn:'valentino',waitingLabel:'Valentino'}};
window.initialBriefingTask=structuredClone(testIO.followUps[0]);
`;
const css = ['portal-mobile','portal-desktop'].map(n => readFileSync(new URL('../../css/'+n+'.css', import.meta.url),'utf8')).join('\n');
let fixtureHtml = html.replace(monitoring, 'monitoring:testIO.monitoring')
  .replace(boot, seed + '\n' + boot).replace('</head>', '<style>'+css+'</style></head>');
// The manual preview uses the same seeded case with readable demonstration copy.
if(process.argv.includes('--serve')) fixtureHtml=fixtureHtml.replace(boot, `
testIO.followUps[0].preparation.summary='Il tecnico propone domani dalle 10 alle 12 per la perdita in cucina. Manca la conferma di chi gli aprirà.';
testIO.followUps[0].preparation.nextAction.reason='Confermare l’accesso evita un intervento a vuoto.';
testIO.followUps[0].preparation.uncertainties=[{text:'Il portiere sarà presente nella fascia proposta?'}];
`+boot);
// Deliberate regression injection, separate from the IO fixture. The assertions
// above and below execute the same production functions in the normal run.
const mutations = {
  compact: ["const compactText = p ? p.nextAction.text : item.nextAction === 'Esamina la richiesta' && item.preview ? item.preview : item.nextAction;", 'const compactText = item.nextAction;'],
  stale: ["if (item.hasNewInbound || item.action?.fn !== 'oggiSegretariaOpen')", "if (item.action?.fn !== 'oggiSegretariaOpen')"],
  escaping: ['${esc(p.summary)}</p>', '${p.summary}</p>'],
  status: ["if (typeof window.portalMailCheckSources === 'function') window.portalMailCheckSources({ automatic: true });", '/* regression: source status no longer checked automatically */']
};
if(process.env.BOOM_BRIEFING_MUTATION){
  const mutation=mutations[process.env.BOOM_BRIEFING_MUTATION];
  assert(mutation&&fixtureHtml.includes(mutation[0]),'Requested production mutation must apply');
  fixtureHtml=fixtureHtml.replace(mutation[0],mutation[1]);
}
let sourceStatus = 200;
const statusRequests = [];
const sourceResponse = () => ({ok:true,email:{configured:true,healthy:false,lastScan:{incomplete:true,checkedAt:new Date().toISOString()}},whatsapp:{bridgeFresh:true}});
const server = createServer((req,res) => {
  if (req.url.startsWith('/mail-source-api')) {
    statusRequests.push({method:req.method,url:req.url});res.statusCode=sourceStatus;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(sourceStatus===200?sourceResponse():{ok:false,error:'unavailable'}));return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixtureHtml);
});
const chromium=await loadChromium();assert(chromium,'Browser required');
await new Promise(resolve=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')) { console.log('Oggi · sintesi AI con dati dimostrativi: '+base); await new Promise(()=>{}); }
let browser, checks=0;
const check=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const fresh=async page=>{
  sourceStatus=200;await page.goto(base);
  await page.waitForFunction(()=>oggiSegretaria.loaded&&!oggiSegretaria.loading&&S.mailSources&&!S.mailSources.checking);
  await page.waitForSelector('#ogDeskPanel .od-ai-summary');
};
const restore=async page=>page.evaluate(()=>{
  testIO.followUps=[structuredClone(initialBriefingTask)];oggiSegretaria.rows=testIO.followUps;
  S.conversations=S.conversations.filter(c=>c.id==='conv-a');
  Object.assign(S.conversations[0],{lastDirection:'in',lastMessageAt:recentAt,lastMessagePreview:'Il tecnico può passare domani dalle 10 alle 12.'});
  oggiWorkspace.deskArea='all';oggiWorkspace.deskPage=0;oggiSegretariaRender();
});
try {
  browser=await chromium.launch(launchOptions({headless:true}));
  for(const width of [1280,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1100}});page.setDefaultTimeout(5000);
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{requests.push({url:route.request().url(),method:route.request().method()});return route.request().url().startsWith(base)?route.continue():route.abort();});
    const before=statusRequests.length;await fresh(page);
    await check(width+' sintesi attuale nella prima vista, fonte distinta e contenuti escaped',async()=>{
      assert.equal(await page.locator('#ogDeskFold').evaluate(n=>n.open),true);
      assert.equal(await page.locator('#ogQueueArchive').evaluate(n=>n.open),false);
      const card=page.locator('#ogDeskPanel [data-desk-item]').first();
      assert(await card.locator('.od-ai-summary').isVisible());
      assert.equal(await card.locator('[data-desk-evidence]').evaluate(n=>n.open),false);
      assert(await card.locator('[data-desk-evidence] > summary').isVisible());
      await card.locator('[data-desk-evidence] > summary').click();
      await page.evaluate(()=>oggiDeskRender());
      assert.equal(await card.locator('[data-desk-evidence]').evaluate(n=>n.open),true,'Refresh preserves opened evidence');
      assert.match(await card.innerText(),/Sintesi AI · da verificare/);
      assert.match(await card.locator('.od-ai-summary').innerText(),/<img src=x/);
      assert.match(await card.locator('.sg-questions').innerText(),/<b>Non confermato<\/b>/);
      assert.match(await card.innerText(),/L’accesso non è ancora confermato\. <svg/);
      assert.match(await card.innerText(),/Fonte ricevuta:/);
      assert.match(await card.innerText(),/Proposta preparata/);
      assert.match(await card.innerText(),/Ricontrollo proposto/);
      assert.match(await card.innerText(),/Il ricontrollo del seguito è già dovuto/);
      assert.equal(await card.locator('.od-case-meta dd').last().innerText(),await page.evaluate(()=>oggiDeskTiming({timing:{value:oggiSegretaria.rows[0].preparation.nextAction.checkAt}})));
      assert.match(await card.innerText(),/allegati non sono stati letti/i);
      assert.equal(await card.locator('img,svg,b').count(),0);
      assert.equal(await page.evaluate(()=>window.briefingInjected),undefined);
      assert.equal(await card.locator('.od-source-preview').count(),0);
      assert(await card.getByRole('button',{name:'Rivedi proposta ↗'}).isVisible());
      assert(statusRequests.length>before,'Automatic status read occurs on initial mount');
      assert(statusRequests.every(r=>r.method==='GET'&&r.url==='/mail-source-api?status=1'));
    });
    await check(width+' seconda proposta compatta mostra il passo AI corrente e apre il suo caso esatto',async()=>{
      await page.evaluate(()=>{
        const second=structuredClone(oggiSegretaria.rows[0]);
        second.id='sg_'+'b'.repeat(32);
        Object.assign(second.followUp,{conversationId:'conv-b',practiceRef:'contracts/contratto-secondo',lastMessageId:'message-second',lastInboundAt:new Date(Date.now()-3*3600000).toISOString(),nextAction:'VECCHIO PASSO DA NON MOSTRARE'});
        Object.assign(second.preparation,{messageId:'message-second',selectedPracticeRef:'contracts/contratto-secondo',summary:'È arrivato il documento della seconda richiesta.'});
        second.preparation.nextAction.text='Controllare il documento appena ricevuto';
        S.contracts.push({...S.contracts[0],id:'contratto-secondo',ref:'DEMO-SECONDO'});
        oggiSegretaria.rows.push(second);testIO.followUps.push(structuredClone(second));oggiSegretariaRender();
      });
      const compact=page.locator('.od-compact').filter({hasText:'Controllare il documento appena ricevuto'});
      assert.equal(await compact.count(),1);
      assert.match(await compact.innerText(),/Proposta da rivedere/);
      assert.doesNotMatch(await compact.innerText(),/VECCHIO PASSO/);
      await compact.locator('[data-desk-act]').click();await page.waitForSelector('#sgFollowModal');
      assert.equal(await page.evaluate(()=>oggiSegretaria.modal.id),'sg_'+'b'.repeat(32));
      assert.match(await page.locator('#sgFollowModal').innerText(),/Controllare il documento appena ricevuto/);
      await page.locator('[data-sg-modal="cancel"]').first().click();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.deskAct),'current:contract:contratto-secondo');
      assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);
    });
    for(const variant of ['message','context','approval','expired','coverage','practice','review']) {
      await restore(page);
      await check(width+' '+variant+' non ricicla una sintesi non attuale',async()=>{
        await page.evaluate(variant=>{
          const task=oggiSegretaria.rows[0];
          if(variant==='message')task.followUp.lastMessageId='new-message';
          if(variant==='context')task.contextRevision=1;
          if(variant==='approval')task.preparation.approval={revision:task.preparation.revision,actionId:null};
          if(variant==='expired')task.preparation.nextAction.checkAt=new Date(Date.now()-60000).toISOString();
          if(variant==='coverage')task.preparation.coverage.version=1;
          if(variant==='practice')task.preparation.selectedPracticeRef='contracts/another';
          if(variant==='review')task.preparationReview={reason:'invalid_preparation'};
          oggiSegretariaRender();
        },variant);
        assert.equal(await page.locator('#ogDeskPanel .od-ai-summary').count(),0);
        assert.doesNotMatch(await page.locator('#ogDeskPanel').innerText(),/Il tecnico propone domani/);
      });
    }
    await restore(page);
    await check(width+' filtro esplicito non recupera una sintesi superata da una risposta in conversazione',async()=>{
      await page.evaluate(()=>{
        Object.assign(S.conversations[0],{lastDirection:'out',lastMessageAt:new Date().toISOString()});oggiSegretariaRender();
      });
      if(!await page.locator('#ogQueueArchive').evaluate(el=>el.open))await page.locator('#ogQueueArchive > summary').click();
      await page.locator('[data-desk-area="contracts"]').click();
      assert.equal(await page.locator('#ogDeskPanel .od-ai-summary').count(),0);
      assert.doesNotMatch(await page.locator('#ogDeskPanel').innerText(),/Il tecnico propone domani/);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'ogDeskSelection');
    });
    await restore(page);
    await check(width+' nuovo header invalida subito la sintesi precedente',async()=>{
      await page.evaluate(()=>{
        Object.assign(S.conversations[0],{lastMessageAt:new Date().toISOString(),lastMessagePreview:'Cambio programma: il tecnico può venire soltanto venerdì.'});oggiScheduleUpdate();
      });
      await page.waitForFunction(()=>document.querySelector('#ogDeskPanel .od-source-preview')?.textContent.includes('soltanto venerdì'));
      assert.equal(await page.locator('#ogDeskPanel .od-ai-summary').count(),0);
      assert.match(await page.locator('#ogDeskPanel').innerText(),/Nuovo messaggio/);
      assert.match(await page.locator('#ogDeskPanel .od-source-preview').innerText(),/Messaggio ricevuto:.*soltanto venerdì/);
    });
    await check(width+' email e WhatsApp senza task arrivano da aggiornamento e aprono la conversazione esatta',async()=>{
      await page.evaluate(()=>{
        testIO.followUps=[];oggiSegretaria.rows=[];S.conversations=[];
        for(const channel of ['email','whatsapp'])S.conversations.push({id:'fresh-'+channel,status:'open',channel,contactName:channel==='email'?'Richiesta email demo':'Richiesta WhatsApp demo',contactType:channel==='email'?'email':'phone',contactId:channel==='email'?'test@example.invalid':'390000000000',needsReply:true,lastDirection:'in',lastMessageAt:new Date().toISOString(),lastMessagePreview:'Vorrei sapere quando posso visitare. <img src=x onerror="window.briefingInjected=true">'});
        oggiScheduleUpdate();
      });
      await page.waitForFunction(()=>document.querySelectorAll('#ogDeskPanel [data-desk-item]').length===2);
      assert.equal(await page.locator('#ogDeskPanel .od-ai-summary').count(),0);
      for(const channel of ['email','whatsapp']){
        const card=page.locator('#ogDeskPanel [data-desk-item="current:conversation:fresh-'+channel+'"]');
        assert(await card.isVisible());if(await card.locator('.od-source-preview').count())assert.match(await card.innerText(),/Messaggio ricevuto:/);else { assert.match(await card.innerText(),/Richiesta (email|WhatsApp) demo/); assert.match(await card.locator('.od-compact-next').innerText(),/Vorrei sapere quando posso visitare/); }
        assert.equal(await card.locator('img').count(),0);
        await card.locator('[data-desk-act]').click();
        assert.deepEqual(await page.evaluate(()=>testIO.actions.slice(-2)),[['goTo','inbox'],['inboxSelect','fresh-'+channel]]);
        await page.locator('#toasts button').click();
      }
      assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);
    });
    await check(width+' copertura, pausa ed errore restano visibili senza proclamare completamento',async()=>{
      await page.locator('[data-desk-coverage] > summary').click();
      const coverage=page.locator('#ogDeskPanel .od-coverage');
      assert.match(await coverage.innerText(),/ultimo giro parziale/);
      assert.match(await coverage.innerText(),/solo conversazioni affidate.*ultimi 3 giorni/);
      assert.match(await coverage.innerText(),/ricezione WhatsApp non verificata/i);
      assert.match(await coverage.innerText(),/portali esterni non è verificato/);
      await page.evaluate(()=>{S.conversations=[];oggiSegretaria.monitoring.status='paused';oggiSegretariaRender();});
      assert.match(await coverage.innerText(),/Preparazione AI sospesa/);
      assert.match(await page.locator('#ogDeskPanel .ow-empty').innerText(),/non permettono di concludere che sia tutto gestito/);
      sourceStatus=503;await page.evaluate(()=>portalMailCheckSources());
      assert.match(await coverage.innerText(),/Verifica non completata/);
      await page.evaluate(()=>{oggiSegretaria.error='Aggiornamento sintetico non riuscito';oggiSegretariaRender();});
      assert.match(await coverage.innerText(),/aggiornamento non riuscito/);
      assert.match(await page.locator('#ogDeskSummary').innerText(),/Fonti parziali/);
      assert.equal(await page.locator('[data-desk-coverage]').evaluate(n=>n.open),true);
    });
    await check(width+' layout contenuto e nessuna scrittura, chiamata modello o errore JS',async()=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);
      assert(requests.every(r=>r.method==='GET'&&r.url.startsWith(base)));
      assert.deepEqual(errors,[]);
    });
    if(process.env.BOOM_BRIEFING_SCREENSHOTS&&width!==320){
      await fresh(page);
      await page.evaluate(()=>{
        const p=oggiSegretaria.rows[0].preparation;
        p.summary='Il tecnico propone domani dalle 10 alle 12 per la perdita in cucina. Manca la conferma di chi gli aprirà.';
        p.nextAction.reason='Confermare l’accesso evita un intervento a vuoto.';
        p.uncertainties=[{text:'Il portiere sarà presente nella fascia proposta?'}];
        oggiSegretariaRender();
      });
      await page.locator('#ogDeskFold').screenshot({path:'/private/tmp/boom-oggi-briefing-'+width+'.png'});
      await page.locator('.ow-home').screenshot({path:'/private/tmp/boom-oggi-home-'+width+'.png'});
    }
    await page.close();
  }
  console.log(checks+' briefing UI checks passed');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
