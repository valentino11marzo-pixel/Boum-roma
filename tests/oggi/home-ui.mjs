import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';
const chromium=await loadChromium();assert(chromium,'Browser required');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const artifactsDir=await mkdtemp(join(tmpdir(),'boom-home-ui-'));
// CI used to fail after midnight Rome but before midnight UTC. Keep that
// boundary deterministic while ordinary timers and rendering continue to run.
const fixtureNow=new Date('2026-10-14T22:25:00Z');
let browser,checks=0;const check=async(name,fn)=>{await fn();console.log('PASS '+name);checks++;};
try{
 browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000},timezoneId:'UTC'});page.setDefaultTimeout(4000);
  await page.clock.setFixedTime(fixtureNow);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const openDetails=async selector=>{if(!await page.locator(selector).evaluate(e=>e.open))await page.locator(selector+' > summary').click();};
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base);await page.waitForFunction(()=>oggiSegretaria.loaded);
  await check(width+' home utile prima dei pannelli lunghi, senza invii',async()=>{
   assert.equal(await page.locator('#ogOwnerTools').evaluate(e=>e.open),false);
   assert.equal(await page.locator('#ogQueueArchive').evaluate(e=>e.open),false);
   assert.equal(await page.locator('#ogDeskFold').evaluate(e=>e.open),true);
   assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(),16);
   assert.equal(await page.locator('#ogQuickTools').evaluate(e=>!!(e.compareDocumentPosition(document.getElementById('ogDeskFold'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
   assert.equal(await page.locator('#ogWorkBriefing').count(),0);
   assert.equal(await page.locator('[data-ow-view="decisions"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>testIO.writes.length),0);
   assert(await page.locator('#ogAgendaPanel').getByText('Casa Aurora',{exact:true}).isVisible());
  });
  await check(width+' ricerca unica trova clienti, immobili e contratti senza una categoria iniziale',async()=>{
   assert.equal(await page.locator('#ogWorkKind').inputValue(),'all');
   await page.locator('#ogWorkQuery').fill('Aurora');
   const kinds=await page.evaluate(()=>oggiWorkspace.records.map(r=>r.kind));
   assert.equal(await page.locator('.ow-result').count(),12);
   assert.match(await page.locator('#ogWorkResults').innerText(),/1–12 di/);
   await page.getByRole('button',{name:'Mostra altri risultati',exact:true}).click();
   kinds.push(...await page.evaluate(()=>oggiWorkspace.records.map(r=>r.kind)));
   assert(kinds.includes('client'));assert(kinds.includes('property'));assert(kinds.includes('contract'));
   assert.equal(kinds.filter(k=>k==='client').length,15);
   await page.locator('#ogWorkKind').selectOption('client');
   assert.equal(await page.locator('.ow-result').count(),12);
   assert.match(await page.locator('#ogWorkResults').innerText(),/1–12 di 15/);
   await page.locator('#ogWorkQuery').fill('');await page.locator('#ogWorkKind').selectOption('all');
   assert.equal(await page.evaluate(()=>testIO.actions.length),0);
  });
  await check(width+' decisioni, fonte telefonica e review usano il caso esistente senza AI',async()=>{
   await page.locator('#ogQueueArchive > summary').click();
   assert.equal(await page.locator('#sgFollowPanel .sg-case').count(),2);
   assert.equal(await page.locator('#sgFollowPanel a[href="/chiamate?call=demo-call"]').count(),1);
   assert.equal(await page.locator('article[data-sg-id]').count(),2);
   const requests=await page.evaluate(()=>testIO.writes.length);
   await page.locator('#sgFollowPanel [data-sg-primary]').first().click();
   await page.waitForFunction(()=>oggiSegretaria.modal?.task);
   assert.match(await page.locator('#sgFollowModal').innerText(),/tecnico|portiere/);
   assert.equal(await page.locator('#sgFollowModal a[href="/chiamate?call=demo-call"]').count(),1);
   assert.equal(await page.evaluate(()=>testIO.writes.length),requests);
   await page.locator('#sgFollowModal [aria-label="Chiudi"]').click();
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.sgId),'sg_'+'a'.repeat(32));
  });
  await check(width+' una nuova proposta non eredita il badge Confermato del seguito precedente',async()=>{
   await page.evaluate(()=>{const t=oggiSegretaria.rows[0];window.oldCheck=t.followUp.checkAt;window.oldInbound=t.followUp.lastInboundAt;t.followUp.checkAt=new Date(Date.now()+3600000).toISOString();t.followUp.lastInboundAt=new Date(Date.now()-60000).toISOString();t.preparation={version:BOOM_PROPOSTA.VERSION,coverage:{version:BOOM_PROPOSTA.CONTEXT_VERSION},revision:'demo-revision',messageId:t.followUp.lastMessageId,selectedPracticeRef:t.followUp.practiceRef,status:'ready',summary:'Nuova proposta di accesso',recommendation:'Da valutare',sources:[],nextAction:{text:'Proporre un altro orario',waitingLabel:'Valentino',checkAt:t.followUp.checkAt}};oggiSegretariaRender();});
   const text=await page.locator('#sgFollowPanel .sg-case').filter({hasText:'Proporre un altro orario'}).innerText();
   assert.match(text,/Proposta da rivedere/i);assert.doesNotMatch(text,/Confermato/i);
   const proposal=await page.evaluate(()=>{const model=oggiDeskModel(),id=oggiSegretaria.rows[0].id;return{current:model.currentItems.find(item=>item.caseIds.includes(id)),waiting:model.waiting.some(item=>item.caseIds.includes(id))};});
   assert.equal(proposal.waiting,false,'una proposta non approvata non eredita l’attesa del seguito precedente');
   assert(proposal.current,'la proposta recente resta raggiungibile tra i casi correnti');
   assert.equal(proposal.current.reason,'Proposta da rivedere');
   await openDetails('#ogDeskFold');await page.locator('[data-desk-area="contracts"]').click();
   const deskCase=page.locator('[data-desk-item="'+proposal.current.id+'"]');
   assert(await deskCase.isVisible());assert.match(await deskCase.innerText(),/Proposta da rivedere/);
   assert.match(await deskCase.innerText(),/Rivedi la proposta prima di confermare il seguito/);
   await page.evaluate(()=>{const t=oggiSegretaria.rows[0];delete t.preparation;t.followUp.checkAt=oldCheck;t.followUp.lastInboundAt=oldInbound;oggiSegretariaRender();});
  });
  await check(width+' filtri separano preparazione e attesa senza duplicare casi né generare AI',async()=>{
   await page.evaluate(()=>{
    const base=structuredClone(testIO.followUps[0]);
    const prep=structuredClone(base);prep.id='sg_'+'c'.repeat(32);Object.assign(prep.followUp,{confirmed:false,needsReview:true,ambiguous:false,checkAt:null,intakeTiming:null,lastMessageId:'wa-preparing',nextAction:'Richiesta ancora da preparare'});
    const wait=structuredClone(base);wait.id='sg_'+'d'.repeat(32);Object.assign(wait.followUp,{waitingOn:'client',waitingLabel:'Cliente',checkAt:new Date(Date.now()+86400000).toISOString(),nextAction:'Attendere il documento'});
    oggiSegretaria.rows.push(prep,wait);oggiSegretariaRender();
   });
   await page.locator('[data-ow-view="preparing"]').click();
   assert.equal(await page.locator('#ogDecisionPanel').isVisible(),false);
   assert.match(await page.locator('[data-sg-group="preparing"]').innerText(),/Richiesta ancora da preparare/);
   assert.equal(await page.locator('[data-sg-group="decisions"]').isVisible(),false);
   await page.locator('[data-ow-view="following"]').click();
   assert.match(await page.locator('[data-sg-group="waiting"]').innerText(),/Attendere il documento/);
   assert.equal(await page.locator('[data-sg-group="preparing"]').isVisible(),false);
   await page.evaluate(()=>oggiSegretariaRender());
   assert.equal(await page.locator('[data-ow-view="following"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('article[data-sg-id]').count(),4);
   assert.equal(await page.evaluate(()=>testIO.writes.length),0);
   await page.evaluate(()=>{oggiSegretaria.rows=oggiSegretaria.rows.slice(0,2);oggiSegretariaRender();});
   assert.match(await page.locator('#ogQueueEmpty').innerText(),/Nessun seguito in corso/);
   await page.locator('[data-ow-view="decisions"]').click();
  });
  await check(width+' chiusura review ritrova il caso spostato da un nuovo messaggio',async()=>{
   await page.locator('#sgFollowPanel [data-sg-primary]').first().click();await page.waitForFunction(()=>oggiSegretaria.modal?.task);
   await page.evaluate(()=>{window.beforeMove=structuredClone(oggiSegretaria.rows[0]);Object.assign(oggiSegretaria.rows[0].followUp,{confirmed:false,needsReview:true,lastMessageId:'new-message'});oggiSegretariaRender();});
   await page.locator('#sgFollowModal [aria-label="Chiudi"]').click();
   assert.equal(await page.locator('[data-ow-view="preparing"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.sgId),'sg_'+'a'.repeat(32));
   assert(await page.locator('[data-sg-group="preparing"] [data-sg-primary]').isVisible());
   await page.evaluate(()=>{oggiSegretaria.rows[0]=beforeMove;oggiSegretariaRender();oggiWorkView('decisions');});
   assert.equal(await page.evaluate(()=>testIO.writes.length),0);
  });
  await check(width+' refresh conserva il focus quando il ricontrollo passa tra le decisioni',async()=>{
   await page.evaluate(()=>{window.beforeDue=structuredClone(oggiSegretaria.rows[0]);Object.assign(oggiSegretaria.rows[0].followUp,{waitingOn:'client',checkAt:new Date(Date.now()+3600000).toISOString()});oggiSegretariaRender();oggiWorkView('following');});
   await page.locator('[data-sg-group="waiting"] [data-sg-primary]').focus();
   await page.evaluate(()=>{oggiSegretaria.rows[0].followUp.checkAt=new Date(Date.now()-60000).toISOString();oggiSegretariaRender();});
   assert.equal(await page.locator('[data-ow-view="decisions"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.sgId),'sg_'+'a'.repeat(32));
   assert(await page.locator('[data-sg-group="decisions"] [data-sg-primary]').first().isVisible());
   await page.evaluate(()=>{oggiSegretaria.rows[0]=beforeDue;oggiSegretariaRender();});
  });
  await check(width+' errore proposte non svuota le altre viste senza spiegazione',async()=>{
   await page.evaluate(()=>{S._paError=true;oggiWorkView('following');});
   assert.match(await page.locator('#ogQueueEmpty').innerText(),/Nessun seguito in corso/);
   await page.evaluate(()=>{S._paError=false;oggiWorkView('decisions');});
  });
  await check(width+' stesso contesto, caso ambiguo separato e passaggio al contratto',async()=>{
   await page.locator('#ogWorkKind').selectOption('property');await page.locator('#ogWorkQuery').fill('Aurora');await page.locator('.ow-result').click();
   assert.deepEqual(await page.evaluate(()=>oggiWorkspace.related.map(r=>r.kind+':'+r.id).sort()),['contract:contratto-demo','maintenance:guasto-demo']);
   assert.equal(await page.locator('#ogContextDetails').evaluate(e=>e.open),false);
   await openDetails('#ogContextDetails');
   await page.locator('#ogContextConnections details[data-ow-fold="cases"] > summary').click();
   assert.equal(await page.locator('#ogContextConnections .ow-case').count(),1);
   assert.doesNotMatch(await page.locator('#ogContextConnections').innerText(),/Giuliano/);
   await page.evaluate(()=>oggiSegretariaRender());
   assert.equal(await page.locator('#ogContextConnections details[data-ow-fold="cases"]').evaluate(e=>e.open),true);
   await page.locator('.ow-related button').filter({hasText:'Contratto'}).click();
   assert.equal(await page.evaluate(()=>oggiWorkspace.selected.id),'contratto-demo');
   await page.locator('[data-og-tool="home:inventory"]').click();
   assert.deepEqual(await page.evaluate(()=>testIO.actions.at(-1)),['open','/inventario?c=contratto-demo']);
   await page.evaluate(()=>{testIO.actions.length=0;});
   await page.locator('#ogWorkKind').selectOption('property');
  });
  await check(width+' il fascicolo reale si apre e torna alla lista senza scritture',async()=>{
   await page.locator('#ogWorkKind').selectOption('property');await page.locator('#ogWorkQuery').fill('Aurora');await page.locator('.ow-result').click();
   await openDetails('#ogContextDetails');
   await page.locator('.ow-context-actions button').filter({hasText:"Apri l'immobile"}).click();
   await page.waitForSelector('#pdos-title');assert.equal(await page.locator('#pdos-title').innerText(),'Casa Aurora');
   await page.locator('[data-pdos-tab="contracts"]').click();assert.match(page.url(),/contracts$/);
   await page.locator('[data-pdos-action="back"]').click();await page.waitForFunction(()=>oggiSegretaria.loaded);
   assert.equal(await page.locator('#ogWorkQueue').count(),1);assert.equal(await page.locator('#ogWorkQuery').inputValue(),'Aurora');assert.equal(await page.locator('#ogContextDetails > summary strong').innerText(),'Casa Aurora');assert.equal(await page.evaluate(()=>testIO.writes.length),0);
   if(!await page.locator('#ogQueueArchive').evaluate(e=>e.open))await page.locator('#ogQueueArchive > summary').click();
  });
  await check(width+' ricerca per tipo prima del limite e selezione esplicita',async()=>{
   await page.locator('#ogWorkQuery').fill('Aurora');
   assert.equal(await page.locator('.ow-result').count(),1);assert.equal(await page.evaluate(()=>testIO.actions.length),0);
   await page.locator('.ow-result').click();await page.locator('[data-og-tool="home:inventory"]').click();
   assert.deepEqual(await page.evaluate(()=>testIO.actions.at(-1)),['open','/inventario?p=casa-demo']);
   await page.locator('#ogWorkKind').selectOption('person');await page.locator('#ogWorkQuery').fill('Persona');
   await page.locator('.ow-result').click();assert(await page.locator('.ow-context-actions button').count()>0);
   await openDetails('#ogContextDetails');
   await page.locator('.ow-context-actions button').first().click();assert.equal(await page.evaluate(()=>testIO.actions.at(-1)[0]),'openPerson');
   await page.locator('#ogWorkKind').selectOption('contract');await page.locator('#ogWorkQuery').fill('Aurora');assert.equal(await page.locator('.ow-result').count(),1);
  });
  await check(width+' data mostrata e precompilata rispettano lo spostamento',async()=>{
   await page.locator('#ogAgendaPanel').getByRole('button',{name:/Verifica e conferma/}).click();
   const action=await page.evaluate(()=>testIO.actions.at(-1));assert.equal(action[0],'confirmViewingModal');
   const expected=await page.evaluate(()=>{const d=new Date(S.viewingRequests[1].proposedDateTime);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')});
   assert.equal(action[2].time,expected);
  });
  await check(width+' aggiornamento e nascondi conservano bozza, ricerca e pannelli',async()=>{
   await page.getByRole('button',{name:'Prepara una risposta',exact:true}).click();await page.locator('#ogOwnerInstruction').fill('Bozza da conservare');
   await page.locator('#ogWorkQuery').fill('Aurora');await page.locator('#ogOwnerTools > summary').click();
   await page.evaluate(()=>{document.getElementById('ogOwnerTools').open=true;oggiDismiss(window.__oggiLast[0].id);});await page.waitForTimeout(220);
   assert.equal(await page.locator('#ogOwnerInstruction').inputValue(),'Bozza da conservare');assert.equal(await page.locator('#ogWorkQuery').inputValue(),'Aurora');assert.equal(await page.locator('#ogOwnerTools').evaluate(e=>e.open),true);
  });
  await check(width+' errore lettura conserva dati e non dichiara agenda libera',async()=>{
   await page.evaluate(async()=>{testIO.failViewings=true;await oggiLoadViewings();});await page.waitForTimeout(220);
   assert.match(await page.locator('#ogAgendaPanel').innerText(),/Non riesco ad aggiornare/);assert.match(await page.locator('#ogAgendaPanel').innerText(),/Casa Aurora/);
   await page.evaluate(async()=>{testIO.failProposals=true;await oggiLoadProposals(true);});await page.waitForTimeout(220);
   assert.match(await page.locator('#ogDecisionPanel').innerText(),/Proposte non aggiornate/);
   await page.evaluate(async()=>{testIO.failViewings=false;testIO.failProposals=false;await oggiLoadViewings();await oggiLoadProposals(true);});await page.waitForTimeout(220);
  });
  await check(width+' permessi, escaping e nessun overflow',async()=>{
   await page.evaluate(()=>{S.properties.push({id:'test-xss',name:'<img src=x onerror=alert(1)>',address:'test'});});await page.locator('#ogWorkKind').selectOption('property');await page.locator('#ogWorkQuery').fill('<img');
   assert.equal(await page.locator('#ogWorkResults img').count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const n=await page.evaluate(()=>testIO.actions.length);await page.evaluate(()=>{S.profile.role='tenant';oggiWorkspaceSelect(0);oggiAgendaAction(0);});assert.equal(await page.evaluate(()=>testIO.actions.length),n);
   await page.evaluate(()=>{S.profile.role='admin';});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>testIO.writes.length),0);
  });
  await page.evaluate(()=>{document.getElementById('ogOwnerTools').open=false;document.getElementById('toasts').textContent='';document.activeElement.blur();document.getElementById('ogWorkQuery').value='';oggiWorkspaceSearch('');});
  await page.screenshot({path:join(artifactsDir,'home-'+width+'.png'),fullPage:true});
  await page.close();
 }
 const page=await browser.newPage({timezoneId:'UTC'});await page.clock.setFixedTime(fixtureNow);await page.goto(base);await page.waitForFunction(()=>oggiSegretaria.loaded);
 await check('cambio identità scarta una lettura vecchia e non mostra la vecchia agenda',async()=>{
  await page.evaluate(()=>{testIO.holdViewings=true;window.oldRead=oggiLoadViewings();});
  await page.waitForFunction(()=>testIO.pendingReads.length===1);
  await page.evaluate(async()=>{auth.currentUser={uid:'second-admin'};document.getElementById('ogAgendaPanel').innerHTML=oggiAgendaPanel();});
  assert.doesNotMatch(await page.locator('#ogAgendaPanel').innerText(),/Casa Aurora/);
  await page.evaluate(async()=>{testIO.holdViewings=false;testIO.pendingReads.shift()();await oldRead;});
  assert.doesNotMatch(await page.locator('#ogAgendaPanel').innerText(),/Casa Aurora/);
 });
 await page.close();
 for(const timezoneId of ['UTC','Europe/Rome'])for(const [instant,day] of [
  ['2026-10-14T21:59:59Z','2026-10-14'],['2026-10-14T22:00:00Z','2026-10-15'],
  ['2026-12-14T22:59:59Z','2026-12-14'],['2026-12-14T23:00:00Z','2026-12-15']
 ])await check('agenda fixture attraversa mezzanotte Roma · '+timezoneId+' · '+instant,async()=>{
  const p=await browser.newPage({viewport:{width:390,height:1000},timezoneId});
  try{
   await p.clock.setFixedTime(new Date(instant));await p.goto(base);await p.waitForFunction(()=>oggiSegretaria.loaded);
   assert.equal(await p.evaluate(()=>S._viewingsSource),'ready');
   assert.equal(await p.locator('#ogAgendaPanel').getByText('Casa Aurora',{exact:true}).isVisible(),true);
   assert.equal(await p.locator('#ogAgendaPanel').getByText('Casa Giardino',{exact:true}).isVisible(),true);
   assert.deepEqual(await p.evaluate(()=>oggiWorkspace.agenda.map(v=>[v.id,v.dateKey,v.label])),[['v-demo',day,'Oggi'],['v-proposta',day,'Oggi']]);
   assert.equal(await p.evaluate(()=>[...S.contracts.map(r=>r.createdAt),...S.maintenance.map(r=>r.createdAt),
    ...testIO.followUps.map(r=>r.followUp.lastInboundAt)].every(at=>Date.parse(at)===Date.now()-2*3600000)),true,
    'creazione e messaggi ricevuti precedono sempre il clock della fixture di due ore');
   assert.equal(await p.evaluate(()=>testIO.writes.length),0);
  }finally{await p.close();}
 });
 console.log(checks+' verifiche home superate. Screenshot diagnostici: '+artifactsDir);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
