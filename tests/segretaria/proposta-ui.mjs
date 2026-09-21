// Production Oggi segment in Chromium; mocked auth/Firestore/API only.
// The same fixture produces a standalone offline preview with simulated data.
import assert from 'node:assert/strict';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const portal = read('js/portal-app.js');
const begin = portal.indexOf('    // ═══ SEGRETERIA · SEGUITI IN OGGI');
const end = portal.indexOf('    // ═══ FINE SEGRETERIA · SEGUITI IN OGGI');
assert.ok(begin > 0 && end > begin);
const ui = portal.slice(begin, end);
const listener = name => {
  const start = portal.indexOf('    function ' + name + '(');
  assert(start >= 0, 'Listener reale presente: ' + name);
  const next = portal.slice(start + 5).search(/\n    (?:async )?function /);
  assert(next >= 0, 'Fine listener reale: ' + name);
  return portal.slice(start, start + 5 + next);
};
const listeners = ['startInboxListener', 'stopInboxListener', 'stopOpenConvListener'].map(listener).join('\n');
assert.ok(read('portal.html').indexOf('<script src="/js/segretaria-proposta-engine.js"') < read('portal.html').indexOf('<script src="/js/portal-app.js"'));
assert.ok(read('sw.js').includes("url.pathname === '/js/segretaria-proposta-engine.js'"));
assert.ok(read('portal.html').indexOf('<script src="/js/segretaria-esecuzione-engine.js"') < read('portal.html').indexOf('<script src="/js/portal-app.js"'));
assert.ok(read('sw.js').includes("url.pathname === '/js/segretaria-esecuzione-engine.js'"));

const artifactDir = mkdtempSync(join(tmpdir(), 'boom-proposta-ui-'));
const previewPath = process.env.BOOM_SEGRETARIA_PREVIEW || join(artifactDir, 'preview.html');
const fixture = `
const S={page:'oggi',profile:{id:'fixture-admin',role:'admin'},conversations:[],properties:[{id:'p1',name:'Casa Fiore · esempio'},{id:'p2',name:'Casa Luna · esempio'}]};
const auth={currentUser:{uid:'fixture-admin',getIdToken:async()=> 'fixture-token'}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin=()=>!!auth.currentUser;
const toast=(type,text)=>{window.__toast={type,text}};
const buildNav=()=>{},sendBrowserNotification=()=>{};
const db={collection(name){
 if(!['conversations','operatorTasks'].includes(name))throw Error('Unexpected collection');
 return{
  where(){return this},orderBy(){return this},limit(){return this},
  onSnapshot(...args){
   const next=args.find(arg=>typeof arg==='function');let stopped=false;
   queueMicrotask(()=>{if(!stopped)next({docs:[],metadata:{fromCache:false}})});
   return()=>{stopped=true};
  },
  doc(id){return{async get(){window.__sourceReads.push(id);return{exists:true,data:()=>({contactName:'Fonte dimostrativa',unread:0})}}}}
 };
}};
function goTo(page){S.page=page;if(page==='oggi'){document.getElementById('main').innerHTML=oggiSegretariaPanel()}else{document.getElementById('main').innerHTML='<section class="card"><div class="card-body"><h2>Conversazione simulata</h2><p>Nessun dato reale e nessun invio.</p><button id="demoBack" class="btn">Torna a Oggi</button></div></section>';document.getElementById('demoBack').onclick=()=>goTo('oggi')}}
function inboxSelect(id){if(!S.conversations.some(c=>c.id===id))throw Error('Source not loaded');window.__selectedConversation=id}
const demoFuture=()=>new Date(Date.now()+86400000).toISOString();
window.__requests=[];window.__sourceReads=[];window.__mode='';window.__generation=0;
window.__ids=['sg_'+'a'.repeat(32),'sg_'+'b'.repeat(32),'sg_'+'c'.repeat(32)];
window.__dossier={identityIncomplete:false,identityAmbiguous:false,ambiguous:false,incomplete:false,
 practices:[{ref:'viewingRequests/v1',type:'viewing',status:'confirmed',propertyRefs:['properties/p1']},{ref:'contracts/c2',type:'contract',status:'active',propertyRefs:['properties/p2']}],
 properties:[{ref:'properties/p1',label:'Casa Fiore · esempio'},{ref:'properties/p2',label:'Casa Luna · esempio'}]};
function demoTask(id,name,cid,practice){return{id,status:'open',source:'segretaria',followUp:{open:true,conversationId:cid,contactName:name,
 preview:'Dettagli da verificare.',lastMessageId:'msg-'+cid,practiceRef:practice,propertyRef:practice==='viewingRequests/v1'?'properties/p1':practice?'properties/p2':null,
 nextAction:'Verificare la richiesta e confermare il seguito',waitingOn:'valentino',waitingLabel:'Valentino',checkAt:demoFuture(),checkBasis:'Controllo interno proposto',confirmed:false,needsReview:true,ambiguous:!practice}}}
function demoPreparation(t,withDraft=true){const ambiguous=!t.followUp.practiceRef,phone=t.followUp.conversationId==='c1';return{
 version:${PROPOSTA.VERSION},revision:'revision-'+(++window.__generation),messageId:t.followUp.lastMessageId,selectedPracticeRef:t.followUp.practiceRef,
 status:'ready',identityBlocked:false,summary:ambiguous?'La squadra ha completato le pulizie, ma il messaggio non indica quale casa. Serve un solo chiarimento prima di chiudere il lavoro.':phone?'Giulia chiede conferma della visita. La richiesta visite riporta un appuntamento già confermato per il 24 settembre 2026 alle 15:00, ora di Roma, a Casa Fiore.':'Oliver deve ancora confermare la disponibilità. La prossima azione resta a lui; BOOM ricontrolla domani.',
 recommendation:ambiguous?'Chiarire se il lavoro riguarda Casa Fiore o Casa Luna. Conservare il seguito aperto.':phone?'Rispondere con l’orario già confermato nelle fonti e chiedere conferma di partecipazione. Nessuna nuova prenotazione.':'Conservare l’attesa senza inviare un altro messaggio adesso.',
 facts:[{text:ambiguous?'La squadra comunica che le pulizie sono terminate.':phone?'Visita a Casa Fiore: confermata il 24 settembre 2026 alle 15:00, ora di Roma.':'Il messaggio è collegato alla conversazione corretta.',sourceIds:[phone?'viewingRequests/v1':'messages/'+t.followUp.conversationId]}],
 commitments:[{text:phone?'La visita è già fissata per il 24 settembre alle 15:00.':'Attendere l’aggiornamento già richiesto.',kind:'explicit',status:'pending',sourceIds:['messages/'+t.followUp.conversationId]}],
 uncertainties:ambiguous?[{text:'La casa non è indicata nel messaggio.',sourceIds:['messages/'+t.followUp.conversationId]}]:[],
 nextAction:{text:ambiguous?'Identificare la casa dell’intervento':phone?'Attendere la conferma di partecipazione alla visita del 24 settembre':'Attendere la disponibilità di Oliver',waitingOn:ambiguous?'collaborator':'client',waitingLabel:ambiguous?'Squadra pulizie · esempio':phone?'Giulia · esempio':'Oliver · esempio',checkAt:phone?'2026-09-23T10:00:00Z':demoFuture(),practiceRef:t.followUp.practiceRef,sourceIds:['messages/'+t.followUp.conversationId],reason:'Ricontrollo interno proporzionato al prossimo passo, senza una scadenza promessa al cliente.'},
 draft:withDraft&&!ambiguous?{channel:phone?'whatsapp':'email',text:'Ciao Giulia, la visita a Casa Fiore è già confermata per giovedì 24 settembre alle 15:00, ora di Roma. Mi confermi che sarai presente? — Assistente BOOM',subject:'BOOM · Visita del 24 settembre alle 15:00',sourceIds:['messages/'+t.followUp.conversationId]}:null,
 recipientPreview:{name:t.followUp.contactName,address:phone?'+390000000001':'oliver@example.test',channel:phone?'whatsapp':'email'},
 handoff:{needed:false,reason:'Nessuna decisione commerciale richiesta.'},replyOwnership:!phone&&!ambiguous?{blocked:true,owner:'segretaria:conversation',actionId:null,incomplete:false}:{blocked:false,owner:null,actionId:null,incomplete:false},coverage:{version:2,incomplete:ambiguous,reasons:ambiguous?['practice_selection_required']:[]},
 style:{basis:'editorial_only',limitations:['Nessuna attribuzione dei messaggi importati a Valentino.']},sources:[{id:'messages/'+t.followUp.conversationId,ref:'messages/'+t.followUp.conversationId,at:new Date().toISOString(),hash:'fixture'},...(phone?[{id:'viewingRequests/v1',ref:'viewingRequests/v1',at:'2026-09-15T08:00:00Z',hash:'fixture-confirmed-2026-09-24T13:00:00Z'}]:[])]}}
window.__rows=[demoTask(window.__ids[0],'Giulia · esempio','c1','viewingRequests/v1'),demoTask(window.__ids[1],'Oliver · esempio','c2','contracts/c2'),demoTask(window.__ids[2],'Squadra pulizie · esempio','c3',null)];
window.__rows[0].followUp.preview='Mi confermi giorno e ora della visita?';window.__rows[1].followUp.preview='Ti aggiorno appena ho la disponibilità.';window.__rows[2].followUp.preview='Abbiamo terminato le pulizie.';window.__rows[0].preparation=demoPreparation(window.__rows[0]);window.__rows[1].preparation=demoPreparation(window.__rows[1],false);
window.__rows[0].followUp.lastInboundAt='2026-09-21T09:15:00.000Z';
window.__rows[0].preparation.createdAt='2026-09-21T09:17:00.000Z';
const reply=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
const actualTimeout=window.setTimeout;
window.setTimeout=(fn,ms,...args)=>actualTimeout(fn,window.__fastTimeout&&ms===60000?10:ms,...args);
window.fetch=async(url,options={})=>{
 const u=new URL(url,'https://demo.invalid'),body=options.body?JSON.parse(options.body):null;
 window.__requests.push({path:u.pathname,query:u.search,method:options.method||'GET',body,authorization:options.headers?.Authorization});
 if(options.headers?.Authorization!=='Bearer fixture-token')return reply({ok:false,error:'unauthorized'},401);
 if(u.pathname==='/api/segretaria/follow-up'){
  if(options.method==='GET'&&u.searchParams.has('id'))return reply({ok:true,task:window.__rows.find(t=>t.id===u.searchParams.get('id')),dossier:window.__dossier});
  if(options.method==='GET')return reply({ok:true,rows:window.__rows,incomplete:false});
  const t=window.__rows.find(t=>t.id===body.id);
  if(body.op==='close'){window.__rows=window.__rows.filter(t=>t.id!==body.id);return reply({ok:true,id:body.id,closed:true})}
  if(body.op==='confirm'){t.followUp={...t.followUp,...body,confirmed:!!body.practiceRef,needsReview:!body.practiceRef,ambiguous:!body.practiceRef};return reply({ok:true,id:t.id,followUp:t.followUp})}
 }
 if(u.pathname==='/api/segretaria/prepare'&&options.method==='POST'){
  const t=window.__rows.find(t=>t.id===body.id),mode=window.__mode;window.__mode='';
  if(mode==='hold'||mode==='timeout')await new Promise((resolve,reject)=>{window.__release=resolve;options.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})});
  if(body.op==='generate'){
   if(mode==='generate_error')return reply({ok:false,error:'preparation_unavailable'},503);
   t.preparation=demoPreparation(t,t.followUp.conversationId==='c1');return reply({ok:true,id:t.id,preparation:t.preparation});
  }
  if(body.op==='approve'){
   if(mode==='new_message'){t.followUp.lastMessageId='new-event';t.followUp.preview='Nuovo messaggio: serve un documento diverso.';return reply({ok:false,error:'new_message_reload'},409)}
   if(mode==='revision_changed'){t.preparation=demoPreparation(t);t.preparation.draft.text='Nuova proposta da leggere prima di inviare.';return reply({ok:false,error:'preparation_changed'},409)}
   if(mode==='contact_changed'){return reply({ok:false,error:'contact_changed'},409)}
   if(mode==='unknown_error')return reply({ok:false,error:'approval_unavailable'},503);
   if(body.revision!==t.preparation.revision||body.lastMessageId!==t.followUp.lastMessageId)return reply({ok:false,error:'preparation_changed'},409);
   t.preparation.approval={revision:body.revision,messageId:body.lastMessageId,actionId:t.preparation.draft?'fixture-action':null};
   t.followUp={...t.followUp,nextAction:t.preparation.nextAction.text,waitingLabel:t.preparation.nextAction.waitingLabel,waitingOn:t.preparation.nextAction.waitingOn,checkAt:t.preparation.nextAction.checkAt,confirmed:!!t.preparation.nextAction.practiceRef,needsReview:!t.preparation.nextAction.practiceRef,ambiguous:!t.preparation.nextAction.practiceRef};
   const delivery=mode==='confirmed_error'?'needs_review':t.preparation.draft?'queued':'follow_up_only';
   return reply({ok:mode!=='confirmed_error',id:t.id,confirmed:true,actionId:t.preparation.approval.actionId,delivery,...(mode==='confirmed_error'?{error:'execution_state_unavailable'}:{})},mode==='confirmed_error'?503:200);
  }
 }
 throw Error('Network is disabled: unsupported simulated operation');
};
`;
const script = content => '<script>' + content.replace(/<\/script/gi, '<\\/script') + '</script>';
const html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'
  + '<title>BOOM · Segreteria operativa · Dati simulati</title><style>' + read('css/portal.css') + read('css/portal-finish.css') + read('css/segretaria.css')
  + 'body{display:block;background:#111314}#main{max-width:1180px;margin:auto;padding:24px}#demoHeader{padding:16px 24px;background:#191b1c;color:#ffd700;font:12px Helvetica Neue,Arial,sans-serif}#demoHeader p{margin-top:8px;color:#eee;line-height:1.5}</style></head><body>'
  + '<aside id="demoHeader"><strong>BOOM · Anteprima locale della Segreteria operativa</strong><p>Dati simulati. Puoi preparare, correggere e confermare: anche «Approva ed esegui» è una simulazione. Nessun messaggio parte, nessuna modifica a BOOM, rete bloccata. Ricarica per ripristinare gli esempi.</p></aside><main id="main"></main><div id="modals"></div>'
  + script(fixture) + script(read('js/segretaria-casi-engine.js')) + script(read('js/segretaria-proposta-engine.js')) + script(read('js/segretaria-esecuzione-engine.js')) + script(ui + '\n' + listeners) + script("startInboxListener();goTo('oggi')") + '</body></html>';
writeFileSync(previewPath, html);
console.log('Anteprima offline: ' + previewPath);
const chromium = await loadChromium();
if (!chromium) throw new Error('Browser required for proposal UI verification; set BOOM_PLAYWRIGHT/BOOM_CHROME');
const browser = await chromium.launch(launchOptions());
let checks = 0;
const ok = name => { checks++; console.log('PASS ' + name); };
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, timezoneId: 'Europe/Rome' });
  const page = await context.newPage(), errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  const load = async () => { await page.goto(pathToFileURL(previewPath).href); await page.waitForSelector('article[data-sg-id]'); };
  const ids = ['sg_' + 'a'.repeat(32), 'sg_' + 'b'.repeat(32), 'sg_' + 'c'.repeat(32)];
  const button = (id, action) => page.locator(`article[data-sg-id="${id}"] [data-sg-action="${action}"]`);
  const card = id => page.locator(`article[data-sg-id="${id}"]`);
  const outsideDisclosure = async locator => {
    assert.equal(await locator.isVisible(), true);
    assert.equal(await locator.evaluate(el => !!el.closest('details:not([open])')), false);
  };
  const open = async id => { await button(id, 'review').click(); await page.waitForSelector('#sgPreparationReview'); };
  const posts = () => page.evaluate(() => window.__requests.filter(r => r.path.endsWith('/prepare')));
  const refresh = async () => {
    await page.waitForFunction(() => !oggiSegretaria.loading && !oggiSegretaria.updateTimer && !oggiSegretaria.refreshPending, null, { timeout: 5000 });
    assert.deepEqual(errors, []);
    const before = await page.evaluate(() => window.__requests.filter(r => r.path.endsWith('/follow-up') && r.method === 'GET' && !r.query).length);
    await page.locator('[data-sg-action="refresh"]').click();
    assert.deepEqual(errors, []);
    await page.waitForFunction(before => window.__requests.filter(r => r.path.endsWith('/follow-up') && r.method === 'GET' && !r.query).length > before, before, { timeout: 5000 });
    assert.deepEqual(errors, []);
  };
  await load();
  assert.equal(await page.locator('article[data-sg-id]').count(), 3);
  assert.match(await page.locator('#sgFollowPanel').innerText(), /Giulia chiede conferma della visita/);
  assert.equal((await posts()).length, 0);
  const briefingBox = await page.locator('.sg-briefing').boundingBox();
  assert.ok(briefingBox.height <= 240, 'Briefing desktop troppo alto: ' + briefingBox.height);
  assert.equal(await page.locator('.sg-secondary-grid').count(), 0);
  assert.equal(await page.locator('.sg-quiet-state').count(), 1);
  assert.equal(await page.locator('#sgFollowPanel #sgDraftText').count(), 0);
  assert.ok((await page.locator('article[data-sg-id]').first().boundingBox()).y < 600);
  const firstTask = await page.evaluate(() => window.__rows[0]);
  assert.equal(await card(ids[0]).locator('.sg-source-preview').innerText(), firstTask.followUp.preview);
  assert.equal(await card(ids[0]).locator('.sg-received time').getAttribute('datetime'), firstTask.followUp.lastInboundAt);
  assert.ok((await card(ids[0]).locator('.sg-received time').innerText()).trim());
  assert.equal(await card(ids[0]).locator('.sg-ai-recommendation').innerText(), firstTask.preparation.summary);
  assert.equal(await card(ids[0]).locator('.sg-ai-reading time').getAttribute('datetime'), firstTask.preparation.createdAt);
  assert.notEqual(await card(ids[0]).locator('.sg-received time').getAttribute('datetime'), await card(ids[0]).locator('.sg-ai-reading time').getAttribute('datetime'));
  assert.doesNotMatch(await card(ids[0]).locator('.sg-received').innerText(), /Giulia chiede conferma della visita/);
  assert.equal(await card(ids[0]).locator('h4.sg-case-title').innerText(), firstTask.preparation.nextAction.text);
  assert.equal(await card(ids[0]).locator('.sg-action-reason > p').innerText(), firstTask.preparation.nextAction.reason);
  await outsideDisclosure(card(ids[0]).locator('.sg-action-reason'));
  assert.equal(await card(ids[0]).locator('.sg-reading-details').evaluate(el => el.open), false);
  await card(ids[0]).locator('.sg-reading-details > summary').click();
  assert.equal(await card(ids[0]).locator('.sg-reading-details > p').first().innerText(), firstTask.preparation.summary);
  assert.ok((await card(ids[0]).locator('.sg-reading-details').innerText()).includes(firstTask.preparation.recommendation));
  await card(ids[0]).locator('.sg-reading-details > summary').click();
  for (const id of ids) assert.equal(await card(id).locator('.sg-case-action button').count(), 1);
  assert.equal(await page.locator('article [data-sg-action="plan"]').count(), 0);
  assert.equal(await card(ids[1]).locator('.sg-received time').count(), 0);
  assert.match(await card(ids[1]).locator('.sg-received .sg-source-date').innerText(), /Data del messaggio non disponibile/);
  assert.equal(await card(ids[1]).locator('.sg-ai-reading time').count(), 0);
  assert.match(await card(ids[1]).locator('.sg-ai-reading').innerText(), /Data della preparazione non disponibile/);
  assert.equal(await card(ids[2]).locator('.sg-ai-reading, .sg-action-reason, .sg-questions').count(), 0);
  assert.equal((await posts()).length, 0);
  ok('evento e data della fonte separati dalla lettura AI; prossimo passo e motivo visibili, analisi completa apribile, una CTA');
  await page.screenshot({ path: join(artifactDir, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(artifactDir, 'mobile-normal.png'), fullPage: true });
  await page.setViewportSize({ width: 1365, height: 1000 });
  await button(ids[0], 'review').click();
  await page.waitForSelector('#sgExecutionPlan');
  assert.equal(await page.locator('#sgExecutionPlan').evaluate(el => !!(el.compareDocumentPosition(document.getElementById('sgPreparationReview')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  assert.equal(await page.locator('#sgExecutionPlan [data-sg-step]').count(), 3);
  assert.match(await page.locator('#sgExecutionPlan').innerText(), /WhatsApp/);
  assert.equal(await page.locator('[data-sg-modal="approve"]').innerText(), 'Approva ed esegui');
  assert.equal((await posts()).length, 0);
  await page.screenshot({ path: join(artifactDir, 'execution-plan.png'), fullPage: true });
  await page.keyboard.press('Escape');
  ok('Rivedi proposta apre prima il piano, poi analisi e destinatario da approvare; nessun effetto dalla sola apertura');
  await open(ids[0]);
  assert.equal(await page.locator('#sgFollowForm').count(), 0);
  assert.match(await page.locator('#sgRecipient').innerText(), /Giulia · esempio[\s\S]*\+390000000001/);
  assert.match(await page.locator('#sgDraftText').innerText(), /Ciao Giulia/);
  assert.equal(await page.locator('.sg-origin blockquote').innerText(), firstTask.followUp.preview);
  assert.equal(await page.locator('.sg-origin time').getAttribute('datetime'), firstTask.followUp.lastInboundAt);
  assert.equal(await page.locator('#sgPreparationReview .sg-review-summary').innerText(), firstTask.preparation.summary);
  assert.equal(await page.locator('#sgPreparationReview .sg-action-reason > p').last().innerText(), firstTask.preparation.nextAction.reason);
  await outsideDisclosure(page.locator('#sgPreparationReview .sg-action-reason'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').innerText(), 'Approva ed esegui');
  assert.equal((await posts()).length, 0);
  await page.locator('#sgFollowModal .modal').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: join(artifactDir, 'review.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#sgFollowModal .modal-body').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: join(artifactDir, 'review-mobile-normal.png') });
  await page.setViewportSize({ width: 1365, height: 1000 });
  ok('proposta visibile sul caso; destinatario e bozza prima della conferma; apertura non genera né invia');

  const revision = await page.evaluate(() => window.__rows[0].preparation.revision);
  await page.evaluate(() => { window.__mode = 'hold'; });
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => window.__requests.some(r => r.body?.op === 'approve'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true);
  await page.locator('[data-sg-modal="approve"]').evaluate(el => el.click());
  assert.equal((await posts()).length, 1);
  assert.deepEqual((await posts())[0].body, { op: 'approve', id: ids[0], revision, lastMessageId: 'msg-c1' });
  await page.evaluate(() => window.__release());
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Messaggio in coda'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.match(await page.locator('#sgFollowModal').innerText(), /consegna da verificare/);
  assert.equal(await page.locator('[data-sg-step="reply"]').getAttribute('data-sg-step-state'), 'queued');
  assert.equal(await page.locator('[data-sg-step="follow_up"]').getAttribute('data-sg-step-state'), 'recorded');
  ok('conferma usa la revisione vista; doppio click bloccato; coda non dichiarata consegnata');

  for (const [delivery, expected] of [
    ['needs_review', /L’esito dell’invio richiede verifica/],
    ['sent', /Invio registrato/],
    ['queued', /Messaggio in coda/]
  ]) {
    await load();
    await page.evaluate(state => {
      const task=window.__rows[0];task.preparation.approval={revision:task.preparation.revision,messageId:task.followUp.lastMessageId,actionId:'fixture-action'};
      task.deliveryResult={actionId:'fixture-action',delivery:state,code:state==='needs_review'?503:200,confirmed:true};
      oggiSegretaria.receipts={};
    }, delivery);
    await refresh();
    await page.waitForFunction(state => oggiSegretaria.rows[0]?.deliveryResult?.delivery === state, delivery);
    assert.match(await page.locator(`article[data-sg-id="${ids[0]}"]`).innerText(), expected);
    await open(ids[0]);
    assert.match(await page.locator('#sgPreparationReview').innerText(), expected);
    assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
    assert.equal((await posts()).length, 0);
  }
  ok('ricarica lista e dettaglio conservano coda, invio registrato o errore senza ricevuta locale né POST');

  await load();
  await page.evaluate(() => {
    const task=window.__rows[0];task.preparation.approval={revision:task.preparation.revision,messageId:task.followUp.lastMessageId,actionId:'fixture-action'};
    oggiSegretaria.receipts[task.id]={revision:task.preparation.revision,delivery:'queued'};
    task.deliveryResult={actionId:'fixture-action',delivery:'sent',code:200,confirmed:true};
  });
  await refresh();
  await page.waitForFunction(() => oggiSegretaria.rows[0]?.deliveryResult?.delivery === 'sent');
  assert.match(await page.locator(`article[data-sg-id="${ids[0]}"]`).innerText(), /Invio registrato/);
  assert.ok(!(await page.locator(`article[data-sg-id="${ids[0]}"]`).innerText()).includes('Messaggio in coda'));
  assert.equal((await posts()).length, 0);
  ok('stato fresco della coda prevale sulla ricevuta locale precedente, senza rieseguire approvazione');

  await load();
  await page.evaluate(() => {
    const task=window.__rows[0];
    task.preparation.approval={revision:task.preparation.revision,messageId:task.followUp.lastMessageId,actionId:'current-action'};
    task.deliveryResult={actionId:'older-action',delivery:'sent',confirmed:true};
  });
  await refresh();
  await page.waitForFunction(() => oggiSegretaria.rows[0]?.deliveryResult?.actionId === 'older-action');
  assert.doesNotMatch(await page.locator(`article[data-sg-id="${ids[0]}"]`).innerText(), /Invio registrato/);
  await open(ids[0]);
  assert.equal(await page.locator('[data-sg-step="reply"]').getAttribute('data-sg-step-state'), 'needs_review');
  assert.doesNotMatch(await page.locator('#sgFollowModal').innerText(), /Invio registrato/);
  assert.equal((await posts()).length, 0);
  ok('ricevuta di altra azione: banner e piano richiedono verifica, nessun falso invio né retry');


  await load(); await open(ids[1]);
  assert.equal(await page.locator('#sgDraftText').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="approve"]').innerText(), 'Approva ed esegui');
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Seguito confermato. Nessun messaggio previsto.'));
  assert.equal((await posts()).length, 1);
  assert.equal(await page.locator('[data-sg-step="reply"]').count(), 0);
  ok('attesa senza bozza conferma soltanto il seguito');

  await load();
  await page.evaluate(async () => {
    const task = window.__rows[2];
    task.preparation = demoPreparation(task, false);
    task.preparation.status = 'needs_context';
    task.preparation.coverage.reasons.push('attachments_not_read');
    await oggiSegretariaLoad(true);
  });
  const doubts = card(ids[2]).locator('.sg-questions');
  await outsideDisclosure(doubts);
  assert.match(await doubts.innerText(), /La casa non è indicata nel messaggio/);
  assert.match(await doubts.innerText(), /Ci sono più pratiche possibili/);
  assert.match(await doubts.innerText(), /Gli allegati non sono stati letti/);
  assert.doesNotMatch(await doubts.innerText(), /practice_selection_required|attachments_not_read/);
  await open(ids[2]);
  await outsideDisclosure(page.locator('#sgPreparationReview .sg-questions'));
  assert.equal(await page.locator('#sgPreparationReview .sg-questions').innerText(), await doubts.innerText());
  assert.equal(await page.locator('.sg-evidence').evaluate(el => el.open), false);
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true);
  await page.locator('[data-sg-modal="approve"]').evaluate(el => el.click());
  assert.equal((await posts()).length, 0);
  ok('dubbi e limiti specifici sono leggibili in card e review a dettagli chiusi; informazioni mancanti bloccano la conferma');

  await load();
  await page.evaluate(async () => {
    const task = window.__rows[1];
    delete task.preparation.nextAction.reason;
    delete task.preparation.uncertainties;
    task.followUp.lastInboundAt = 'data non valida';
    task.preparation.createdAt = 'data non valida';
    await oggiSegretariaLoad(true);
  });
  assert.equal(await card(ids[1]).locator('.sg-action-reason, .sg-questions, time').count(), 0);
  assert.match(await card(ids[1]).locator('.sg-received').innerText(), /Data del messaggio non disponibile/);
  assert.match(await card(ids[1]).locator('.sg-ai-reading').innerText(), /Data della preparazione non disponibile/);
  await open(ids[1]);
  assert.equal(await page.locator('#sgPreparationReview .sg-action-reason, #sgPreparationReview .sg-questions').count(), 0);
  assert.equal(await page.locator('#sgDraftText').count(), 0);
  assert.equal(await page.locator('.sg-origin time').count(), 0);
  assert.equal((await posts()).length, 0);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    window.__rows[1].preparation.coverage = { version: 2, incomplete: true, reasons: [] };
    await oggiSegretariaLoad(true);
  });
  await outsideDisclosure(card(ids[1]).locator('.sg-questions'));
  assert.match(await card(ids[1]).locator('.sg-questions').innerText(), /Contesto parziale.*informazioni mancanti non sono specificate/);
  assert.equal((await posts()).length, 0);
  ok('assenze e date invalide non inventano motivi o certezze; copertura parziale senza dettagli resta dichiarata');

  await load();
  await page.evaluate(() => { window.__rows[0].preparation.version = 2; });
  await button(ids[0], 'review').click();
  await page.waitForSelector('#sgFollowModal');
  assert.equal(await page.locator('#sgDraftText').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="generate"]').innerText(), 'Prepara il lavoro');
  assert.equal((await posts()).length, 0);
  ok('proposta precedente ai controlli semantici non espone una vecchia bozza confermabile');

  await load();
  await page.evaluate(async () => {
    const task = window.__rows[0];
    task.preparation.summary = 'LETTURA_SUPERATA';
    task.preparation.nextAction.reason = 'MOTIVO_SUPERATO';
    task.preparation.uncertainties = [{ text: 'DUBBIO_SUPERATO' }];
    task.followUp = { ...task.followUp, confirmed: true, needsReview: true, lastMessageId: 'nuovo-messaggio', preview: 'Ho cambiato la richiesta.' };
    await oggiSegretariaLoad(true);
    oggiSegretaria.monitoring = { mode: 'continuous', status: 'idle' };
    oggiSegretariaRender();
  });
  assert.equal(await card(ids[0]).locator('.sg-ai-reading, .sg-action-reason, .sg-questions').count(), 0);
  assert.doesNotMatch(await card(ids[0]).innerText(), /LETTURA_SUPERATA|MOTIVO_SUPERATO|DUBBIO_SUPERATO/);
  assert.match(await card(ids[0]).locator('.sg-next-action').innerText(), /Seguito da verificare/i);
  assert.doesNotMatch(await card(ids[0]).locator('.sg-next-action').innerText(), /azione confermata/i);
  assert.equal(await card(ids[0]).locator('.sg-source-preview').innerText(), 'Ho cambiato la richiesta.');
  await button(ids[0], 'inspect').click();
  await page.waitForSelector('#sgFollowModal');
  assert.doesNotMatch(await page.locator('#sgFollowModal').innerText(), /LETTURA_SUPERATA|MOTIVO_SUPERATO|DUBBIO_SUPERATO/);
  assert.equal(await page.locator('#sgDraftText').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="generate"]').innerText(), 'Prepara il lavoro');
  assert.equal((await posts()).length, 0);
  ok('nuovo messaggio con seguito prima confermato mostra solo fonte corrente, senza analisi obsoleta né azione confermata');

  await load();
  await page.evaluate(async () => {
    const p = window.__rows[0].preparation;
    p.status = 'needs_context'; p.draft = null;
    p.nextAction.requiresReview = true;
    p.recommendation = 'Verificare nelle fonti chi deve compiere il prossimo passo.';
    p.handoff = { needed: true, reason: 'Attesa da verificare nelle fonti.' };
    p.coverage = { ...p.coverage, incomplete: true, reasons: ['historical_summary_excluded'] };
    await oggiSegretariaLoad(true);
  });
  assert.equal(await page.locator(`article[data-sg-id="${ids[0]}"] .sg-proposal-label`).innerText(), 'DA VERIFICARE');
  await open(ids[0]);
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true);
  assert.match(await page.locator('#sgPreparationReview').innerText(), /Attesa da verificare nelle fonti/);
  await page.locator('.sg-evidence > summary').click();
  assert.match(await page.locator('#sgPreparationReview').innerText(), /I riepiloghi storici non sono usati per stabilire fatti attuali/);
  await page.locator('[data-sg-modal="approve"]').evaluate(el => el.click());
  assert.equal((await posts()).length, 0);
  await page.locator('[data-sg-modal="edit"]').click();
  assert.equal(await page.locator('#sgFollowForm').count(), 1);
  assert.equal(await page.locator('[data-sg-modal="source"]').isDisabled(), false);
  assert.equal((await posts()).length, 0);
  ok('attesa incerta resta da completare: niente conferma, fonti e correzione manuale disponibili');

  await load();
  await page.evaluate(() => { window.BOOM_SEGRETARIA_ESECUZIONE = undefined; });
  await button(ids[0], 'review').click();
  await page.waitForSelector('#sgFollowModal');
  assert.match(await page.locator('#sgFollowModal').innerText(), /piano di esecuzione non è disponibile/);
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true);
  await page.locator('[data-sg-modal="approve"]').evaluate(el => el.click());
  assert.equal((await posts()).length, 0);
  ok('modulo piano assente: nessuna conferma cieca nemmeno con click forzato');


  for (const [ownership, expected] of [
    [{ blocked: true, owner: 'segretaria:conversation', actionId: 'PRIVATE_ACTION_ID', incomplete: false }, /Risposta già seguita dalla Segreteria BOOM; qui confermi soltanto il seguito/],
    [{ blocked: true, owner: 'PRIVATE_OWNER_ID', actionId: 'PRIVATE_ACTION_ID', incomplete: false }, /Risposta già seguita da un altro incaricato BOOM/],
    [{ blocked: true, owner: 'constructor', actionId: null, incomplete: false }, /Risposta già seguita da un altro incaricato BOOM/],
    [{ blocked: true, owner: null, actionId: null, incomplete: true }, /Verifica delle risposte in corso incompleta.*Prima di inviare serve ricontrollare/]
  ]) {
    await load();
    await page.evaluate(value => { window.__rows[1].preparation.replyOwnership = value; }, ownership);
    await open(ids[1]);
    assert.match(await page.locator('#sgReplyOwnership').innerText(), expected);
    assert.ok(!(await page.locator('#sgFollowModal').innerText()).includes('PRIVATE_'));
    assert.equal(await page.locator('[data-sg-modal="approve"]').innerText(), 'Approva ed esegui');
    assert.equal(await page.locator('#sgDraftText').count(), 0);
    assert.equal((await posts()).length, 0);
  }
  ok('risposta già affidata o verifica incompleta: avviso leggibile, solo seguito, nessun identificatore tecnico');

  await load();
  await page.evaluate(() => { window.__mode = 'hold'; });
  await button(ids[2], 'generate').click();
  await page.waitForFunction(() => window.__requests.some(r => r.body?.op === 'generate'));
  assert.equal(await page.locator('[data-sg-modal="generate"]').isDisabled(), true);
  await page.evaluate(() => window.__release());
  await page.waitForSelector('#sgPreparationReview');
  assert.match(await page.locator('#sgPreparationReview .sg-questions').innerText(), /Ci sono più pratiche possibili/);
  await outsideDisclosure(page.locator('#sgPreparationReview .sg-questions'));
  await page.locator('#sgPreparationReview details summary').click();
  assert.match(await page.locator('#sgFollowModal').innerText(), /La casa non è indicata/);
  assert.equal((await posts())[0].body.op, 'generate');
  assert.ok((await posts()).every(r => r.body.op !== 'approve'));
  await page.locator('[data-sg-modal="edit"]').click();
  assert.equal(await page.locator('#sgPractice').inputValue(), '');
  assert.equal(await page.locator('#sgPractice option').count(), 3);
  ok('preparazione esplicita, nessun invio; caso ambiguo resta da collegare con correzione disponibile');

  await load(); await open(ids[0]);
  await page.evaluate(() => { window.__mode = 'new_message'; });
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Nuovo messaggio: serve un documento diverso.'));
  assert.equal((await posts()).length, 1);
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="generate"]').innerText(), 'Prepara il lavoro');
  ok('409 nuovo messaggio ricarica la fonte e richiede nuova preparazione, senza retry');

  await load(); await open(ids[0]);
  const oldRevision = await page.evaluate(() => window.__rows[0].preparation.revision);
  await page.evaluate(() => { window.__mode = 'revision_changed'; });
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgDraftText')?.textContent.includes('Nuova proposta'));
  assert.equal((await posts()).length, 1);
  assert.equal((await posts())[0].body.revision, oldRevision);
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Messaggio in coda'));
  assert.notEqual((await posts())[1].body.revision, oldRevision);
  ok('revisione cambiata richiede lettura e seconda conferma esplicita della nuova bozza');

  await load(); await open(ids[0]);
  await page.evaluate(() => { window.__mode = 'contact_changed'; });
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Il destinatario è cambiato'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true);
  assert.equal((await posts()).length, 1);
  ok('cambio destinatario blocca la vecchia proposta e richiede rielaborazione');

  await load();
  await page.evaluate(() => { window.__rows[0].preparation.recipientPreview.address = ''; });
  await open(ids[0]);
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true);
  assert.match(await page.locator('#sgFollowModal').innerText(), /destinatario manca/);
  assert.equal(await page.locator('[data-sg-modal="approve"]').innerText(), 'Informazioni da completare');
  assert.equal((await posts()).length, 0);
  ok('destinatario assente non offre un invio confermabile');

  await load(); await open(ids[0]);
  await page.evaluate(() => { window.__mode = 'confirmed_error'; });
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('esito dell’invio richiede verifica'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal((await posts()).length, 1);
  ok('errore dopo conferma già registrata mantiene il risultato, senza riabilitare invio');

  await load(); await open(ids[0]);
  await page.evaluate(() => { window.__mode = 'timeout'; window.__fastTimeout = true; });
  await page.locator('[data-sg-modal="approve"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('potrebbe essere già in coda'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal(await page.locator('[data-sg-modal="reload"]').innerText(), 'Ricarica l’esito');
  assert.equal((await posts()).length, 1);
  ok('timeout di conferma non viene trattato come invio fallito certo e richiede rilettura');

  await load(); await open(ids[0]);
  const previousText = await page.locator('#sgDraftText').innerText();
  await page.evaluate(() => { window.__mode = 'generate_error'; });
  await page.locator('[data-sg-modal="generate"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowError')?.textContent.includes('Non riesco a preparare'));
  assert.equal(await page.locator('#sgDraftText').innerText(), previousText);
  assert.equal((await posts()).length, 1);
  ok('preparazione fallita conserva la proposta precedente e l’errore visibile');

  await load();
  await page.evaluate(() => { window.__rows[0].preparation.sources = {}; });
  await button(ids[0], 'review').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Prepariamo il prossimo passo'));
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal((await posts()).length, 0);
  ok('proposta incompleta non rompe Oggi e richiede nuova preparazione');

  await load();
  const injectedText = '<img src=x onerror="window.__xss=1">';
  await page.evaluate(async text => {
    const task = window.__rows[0], p = task.preparation;
    task.followUp.preview = text;
    p.summary = text; p.recommendation = text; p.nextAction.text = text; p.nextAction.reason = text;
    p.uncertainties = [{ text }];
    p.draft.text = '<svg onload="window.__xss=1">'; p.recipientPreview.name = '<script>window.__xss=1</script>';
    await oggiSegretariaLoad(true);
  }, injectedText);
  for (const selector of ['.sg-source-preview', '.sg-ai-recommendation', 'h4.sg-case-title', '.sg-action-reason > p', '.sg-questions li']) {
    assert.equal(await card(ids[0]).locator(selector).innerText(), injectedText);
  }
  await card(ids[0]).locator('.sg-reading-details > summary').click();
  assert.equal(await card(ids[0]).locator('.sg-reading-details > p').first().innerText(), injectedText);
  assert.equal(await card(ids[0]).locator('img, svg, script').count(), 0);
  await open(ids[0]);
  assert.equal(await page.locator('.sg-origin blockquote').innerText(), injectedText);
  assert.equal(await page.locator('#sgPreparationReview .sg-questions li').innerText(), injectedText);
  assert.equal(await page.locator('#sgPreparationReview .sg-action-reason > p').last().innerText(), injectedText);
  assert.equal(await page.locator('#sgFollowModal img, #sgFollowModal svg, #sgFollowModal script').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.locator('[data-sg-modal="source"]').click();
  await page.waitForFunction(() => S.page === 'inbox');
  assert.equal(await page.evaluate(() => window.__selectedConversation), 'c1');
  assert.equal((await posts()).length, 0);
  ok('fonte, analisi, motivo, dubbi e destinatario non eseguono HTML; mobile senza overflow; fonte apribile senza invio');

  await load();
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.evaluate(() => {
    const waiting = window.__rows[1];
    waiting.followUp = { ...waiting.followUp, confirmed: true, needsReview: false, ambiguous: false, waitingOn: 'client', waitingLabel: 'Oliver · esempio', checkAt: null };
    waiting.preparation.nextAction.checkAt = null;
    waiting.preparation.approval = { revision: waiting.preparation.revision, messageId: waiting.followUp.lastMessageId, actionId: null };
    const progress = window.__rows[2];
    progress.followUp = { ...progress.followUp, confirmed: true, needsReview: false, ambiguous: false, practiceRef: 'contracts/c2', propertyRef: 'properties/p2', waitingOn: 'boom', waitingLabel: 'BOOM' };
    oggiSegretaria.rows = structuredClone(window.__rows);
    oggiSegretariaRender();
  });
  for (const group of ['decisions', 'progress', 'waiting']) assert.equal(await page.locator(`[data-sg-group="${group}"] .sg-count`).innerText(), '1');
  assert.equal(await page.locator('article[data-sg-id]').count(), 3);
  assert.match(await page.locator(`article[data-sg-id="${ids[1]}"]`).innerText(), /Ricontrollo da impostare/);
  assert.equal(await page.locator(`[data-sg-group="waiting"] article[data-sg-id="${ids[1]}"]`).count(), 1);
  await page.screenshot({ path: join(artifactDir, 'groups.png'), fullPage: true });
  await open(ids[1]);
  assert.match(await page.locator('#sgPreparationReview').innerText(), /Imposta il ricontrollo in «Correggi seguito»/);
  assert.equal(await page.locator('[data-sg-modal="approve"]').count(), 0);
  assert.equal((await posts()).length, 0);
  ok('tre gruppi e conteggi dai dati; attesa senza data neutra ma ricontrollo da impostare nella review');

  await load();
  await button(ids[0], 'review').focus();
  await open(ids[0]);
  const detail = page.locator('#sgPreparationReview details summary');
  await detail.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#sgPreparationReview details').evaluate(el => el.open), true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  assert.equal(await button(ids[0], 'review').evaluate(el => el === document.activeElement), true);
  const caseDetail = card(ids[0]).locator('.sg-case-details');
  await caseDetail.locator('summary').focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() => oggiSegretariaRender());
  assert.equal(await caseDetail.evaluate(el => el.open), true);
  assert.equal(await caseDetail.locator('summary').evaluate(el => el === document.activeElement), true);
  const reading = card(ids[0]).locator('.sg-reading-details');
  await reading.locator('summary').focus();
  await page.keyboard.press('Enter');
  await page.evaluate(async () => {
    window.__rows[0].preparation.summary = 'Analisi aggiornata dalle fonti disponibili.';
    await oggiSegretariaLoad(true);
  });
  assert.equal(await reading.evaluate(el => el.open), true);
  assert.equal(await reading.locator('summary').evaluate(el => el === document.activeElement), true);
  assert.equal(await caseDetail.evaluate(el => el.open), true);
  assert.equal(await reading.locator('p').first().innerText(), 'Analisi aggiornata dalle fonti disponibili.');
  assert.equal((await posts()).length, 0);
  ok('fonti e analisi da tastiera; chiusura restituisce focus alla CTA; nuova lettura conserva entrambi i dettagli e il focus sull’analisi');

  const loadDecisions = async () => {
    await load();
    return page.evaluate(async () => {
      const firstCheck = Date.now() + 86400000;
      window.__rows = Array.from({ length: 25 }, (_, index) => {
        const task = demoTask('sg_' + (index + 1).toString(16).padStart(32, '0'), 'Caso dimostrativo ' + (index + 1), 'c' + (index + 1), 'viewingRequests/v1');
        task.followUp.checkAt = new Date(firstCheck + index * 60000).toISOString();
        task.preparation = demoPreparation(task);
        return task;
      });
      await oggiSegretariaLoad(true);
      return window.__rows.map(task => task.id);
    });
  };
  const decisionIds = await loadDecisions();
  const visibleDecisions = page.locator('[data-sg-group="decisions"] article[data-sg-id]');
  const moreDecisions = page.locator('[data-sg-action="more-decisions"]');
  assert.equal(await visibleDecisions.count(), 12);
  assert.equal(await page.locator('[data-sg-group="decisions"] .sg-count').innerText(), '25');
  const beforeMore = await page.evaluate(() => window.__requests);
  await moreDecisions.click();
  assert.equal(await visibleDecisions.count(), 24);
  assert.equal(await button(decisionIds[12], 'review').evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await page.evaluate(() => window.__requests), beforeMore);
  await moreDecisions.click();
  assert.equal(await visibleDecisions.count(), 25);
  assert.equal(await button(decisionIds[24], 'review').evaluate(el => el === document.activeElement), true);
  assert.equal(await moreDecisions.count(), 0);
  assert.equal(await page.locator('[data-sg-group="decisions"] .sg-count').innerText(), '25');
  assert.deepEqual(await page.evaluate(() => window.__requests), beforeMore);
  assert.equal((await posts()).length, 0);
  ok('25 decisioni: mostra 12, poi 24, poi tutte; conteggio totale, focus sul primo nuovo caso, nessuna lettura o scrittura aggiuntiva');

  await loadDecisions();
  const retainedReading = card(decisionIds[0]).locator('.sg-reading-details');
  await retainedReading.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await visibleDecisions.count(), 12);
  await page.evaluate(async () => {
    const task = window.__rows[0];
    task.followUp.checkAt = new Date(Date.parse(window.__rows[24].followUp.checkAt) + 60000).toISOString();
    task.preparation.summary = 'Analisi aggiornata del caso ora in fondo all’elenco.';
    await oggiSegretariaLoad(true);
  });
  assert.equal(await visibleDecisions.last().getAttribute('data-sg-id'), decisionIds[0]);
  assert.equal(await retainedReading.evaluate(el => el.open), true);
  assert.equal(await retainedReading.locator('summary').evaluate(el => el === document.activeElement), true);
  assert.equal(await retainedReading.locator('p').first().innerText(), 'Analisi aggiornata del caso ora in fondo all’elenco.');
  assert.equal((await posts()).length, 0);
  ok('nuova lettura sposta il caso aperto oltre la ventiquattresima posizione senza perdere card, analisi aperta o focus');

  await loadDecisions();
  await open(decisionIds[0]);
  await page.evaluate(async () => {
    window.__retainedReview = document.getElementById('sgFollowModal');
    window.__rows[0].followUp.checkAt = new Date(Date.parse(window.__rows[24].followUp.checkAt) + 60000).toISOString();
    await oggiSegretariaLoad(true);
  });
  assert.equal(await card(decisionIds[0]).count(), 1);
  assert.equal(await page.evaluate(() => window.__retainedReview === document.getElementById('sgFollowModal')), true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  assert.equal(await button(decisionIds[0], 'review').evaluate(el => el === document.activeElement), true);
  assert.equal((await posts()).length, 0);
  ok('review aperta durante il riordino oltre il limite resta intatta e alla chiusura restituisce il focus al caso');

  await loadDecisions();
  assert.equal(await card(decisionIds[24]).count(), 0);
  await page.evaluate(async id => {
    oggiSegretaria.propertyReturn = { taskId: id, opened: ['reading-' + id], scroll: 0, afterGeneration: oggiSegretaria.generation + 1 };
    await oggiSegretariaLoad(true);
  }, decisionIds[24]);
  await page.waitForFunction(id => document.activeElement?.closest('article')?.dataset.sgId === id, decisionIds[24]);
  assert.equal(await card(decisionIds[24]).locator('.sg-reading-details').evaluate(el => el.open), true);
  assert.equal((await posts()).length, 0);
  ok('contesto di ritorno dal fascicolo ripristina il caso oltre il limite iniziale, con analisi aperta e focus');

  await loadDecisions();
  await page.evaluate(async retained => {
    oggiSegretaria.propertyReturn = { taskId: retained[0], opened: ['case-' + retained[23], 'reading-' + retained[24]], scroll: 0, afterGeneration: oggiSegretaria.generation + 1 };
    await oggiSegretariaLoad(true);
  }, decisionIds);
  await page.waitForFunction(id => document.activeElement?.closest('article')?.dataset.sgId === id, decisionIds[0]);
  assert.equal(await card(decisionIds[23]).locator('.sg-case-details').evaluate(el => el.open), true);
  assert.equal(await card(decisionIds[24]).locator('.sg-reading-details').evaluate(el => el.open), true);
  assert.equal((await posts()).length, 0);
  ok('ritorno dal fascicolo conserva anche i dettagli di altri casi aperti oltre il limite iniziale');

  await load();
  await page.evaluate(async () => {
    const p = window.__rows[0].preparation;
    p.summary = 'Sintesi della richiesta da confrontare con le fonti. '.repeat(12);
    p.recommendation = 'Verificare i dati disponibili prima di confermare il piano. '.repeat(8);
    p.nextAction.reason = 'Il prossimo passo dipende dalla disponibilità comunicata dalla persona coinvolta. '.repeat(8);
    p.uncertainties = [{ text: 'Da chiarire il riferimento della richiesta: ' + 'riferimento-lungo-'.repeat(24) }];
    p.coverage = { version: 2, incomplete: true, reasons: ['attachments_not_read'] };
    await oggiSegretariaLoad(true);
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    for (const selector of ['.sg-received', '.sg-ai-reading', '.sg-next-action', '.sg-action-reason', '.sg-questions']) {
      const block = card(ids[0]).locator(selector);
      await outsideDisclosure(block);
      const box = await block.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, selector + ' esce dalla card a ' + width + ' px');
    }
    await card(ids[0]).locator('.sg-reading-details > summary').click();
    assert.equal(await card(ids[0]).locator('.sg-reading-details > p').first().innerText(), await page.evaluate(() => window.__rows[0].preparation.summary));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await card(ids[0]).locator('.sg-reading-details > summary').click();
    if (width === 390) await page.screenshot({ path: join(artifactDir, 'mobile.png'), fullPage: true });
    await open(ids[0]);
    assert.equal(await page.locator('#sgRecipient').isVisible(), true);
    assert.equal(await page.locator('#sgDraftText').isVisible(), true);
    assert.equal(await page.locator('#sgDraftText').evaluate(el => !!el.closest('details:not([open])')), false);
    await outsideDisclosure(page.locator('#sgPreparationReview .sg-questions'));
    await outsideDisclosure(page.locator('#sgPreparationReview .sg-action-reason'));
    await page.locator('#sgFollowModal .modal').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))); });
    const buttonBox = await page.locator('[data-sg-modal="approve"]').boundingBox();
    assert.ok(buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= width && buttonBox.y + buttonBox.height <= 844 && buttonBox.height >= 44);
    assert.equal(await page.locator('#sgFollowModal .modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    if (width === 390) {
      await page.locator('#sgDraftText').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(artifactDir, 'review-mobile.png') });
    }
    await page.keyboard.press('Escape');
  }
  assert.equal((await posts()).length, 0);
  ok('320/390 px con testi lunghi: analisi completa leggibile, nessun overflow, conferma raggiungibile, motivo e dubbi fuori da sezioni chiuse');

  await load();
  await page.evaluate(async () => {
    window.__rows[2].preparation = demoPreparation(window.__rows[2], false);
    await oggiSegretariaLoad(true);
  });
  const contrast = await page.evaluate(() => {
    const rgb = text => (text.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = values => values.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return ['.sg-source-preview', '.sg-source-date', '.sg-ai-recommendation', '.sg-action-reason', '.sg-questions li', '.sg-coverage-gaps li', '.sg-person', '.sg-state-label', '.sg-briefing-note', '.sg-footnote'].map(selector => {
      const element = document.querySelector(selector), color = lum(rgb(getComputedStyle(element).color));
      let parent = element, background;
      while (parent) { const value = getComputedStyle(parent).backgroundColor; if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') { background = lum(rgb(value)); break; } parent = parent.parentElement; }
      return { selector, ratio: (Math.max(color, background) + .05) / (Math.min(color, background) + .05) };
    });
  });
  for (const entry of contrast) assert.ok(entry.ratio >= 4.5, `${entry.selector}: ${entry.ratio}`);
  ok('contrasto testo delle superfici principali almeno 4.5:1');

  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  assert.ok((await page.evaluate(() => window.__requests)).every(r => ['/api/segretaria/follow-up', '/api/segretaria/prepare'].includes(r.path)));
  ok('zero errori JavaScript e zero richieste HTTP: anteprima davvero offline');
  console.log('Screenshot: ' + artifactDir);
  await context.close();
} finally { await browser.close(); }
console.log('Proposte UI: ' + checks + ' verifiche passate.');
