// Real handlers, synthetic service boundaries; no network or customer data.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {F,DB,versions,writes,requests,put,external,captureFollowUp,CID,mail,call,reset as resetFixture} from './mail-source-fixture.mjs';
const REAL_NOW=Date.now,NOW=Date.parse('2026-10-14T10:00:00Z');let clock=NOW;
Date.now=()=>clock;
let checks=0,failed=0;
function check(name,pass,detail){checks++;console.log(`${pass?'PASS':'FAIL'} ${name}${!pass?' '+JSON.stringify(detail):''}`);if(!pass)failed++;}
function reset(){clock=NOW;resetFixture();__mail.advance=n=>clock+=n;}
const scanStatus=()=>call({method:'GET',query:{status:'1'}});
try{
 reset();let r=await scanStatus();
 check('diagnosi admin legge metadati senza IMAP o scritture',r.code===200&&writes.length===0&&__mail.connections===0,r);
 check('configurato non significa connesso: copertura esplicita limitata',r.email.configured&&!r.email.connectionVerified&&!r.email.healthy&&r.email.fullMailbox===false&&r.email.windowDays===3&&r.email.maxPerRun===8,r);
 put('heartbeat/mac',{lastSeenAt:new Date(NOW).toISOString(),status:'live',activeTool:'private activity'});
 put('teamHealth/segretaria',{ok:true,lastRunAt:new Date(NOW).toISOString(),stats:{skipped:'imap_unconfigured',ambiguousConversationIds:['private-id']},lastError:'private details'});
 r=await scanStatus();
 check('battito Mac fresco non certifica ingestione WhatsApp',r.whatsapp.bridgeFresh&&r.whatsapp.ingestionVerified===false,r);
 check('diagnosi non espone contenuti, indirizzi, attività o errori grezzi',!JSON.stringify(r).includes('private')&&!JSON.stringify(r).includes('example.invalid')&&!JSON.stringify(r).includes('fixture'),r);
 check('vecchio heartbeat verde con config mancante non diventa connessione verificata',!r.email.connectionVerified&&!r.email.healthy,r);
 for(const role of ['tenant','owner','landlord']){
  reset();put('users/admin',{role});
  for(const args of [{method:'GET',query:{status:'1'}},{},{body:{}}]){
   r=await call(args);check(role+' escluso da diagnosi, sync e scanner globale',r.code===403&&writes.length===0&&__mail.connections===0,r);
  }
 }
 reset();r=await call({token:'expired'});check('token scaduto respinto prima di IMAP',r.code===401&&__mail.connections===0,r);
 r=await call({token:'cron-fixture'});check('sync manuale richiede admin, non basta il segreto cron',r.code===401&&__mail.connections===0,r);
 r=await call({body:{mode:'sync_only',conversationId:'missing'}});check('conversazione inesistente non creata',r.code===404&&writes.length===0&&__mail.connections===0,r);
 r=await call({body:{mode:'sync_only',conversationId:'../users/admin'}});check('riferimento fuori scope rifiutato',r.code===400&&writes.length===0,r);
 reset();put('conversations/other',{contactEmail:'client@example.invalid',contactType:'email'});r=await call();
 check('email ambigua non viene assegnata alla prima chat',r.code===409&&writes.length===0&&__mail.connections===0,r);
 for(const email of ['CLIENT@EXAMPLE.INVALID',' client@example.invalid ']){
  reset();put('conversations/legacy',{contactEmail:email,contactType:'email'});r=await call();
  check('variante email legacy case/spazi è ambigua prima di IMAP',r.code===409&&r.error==='email_identity_ambiguous'&&writes.length===0&&__mail.connections===0,r);
 }
 reset();for(let i=0;i<499;i++)put('conversations/identity-'+i,{contactEmail:'other-'+i+'@example.invalid'});r=await call();
 check('tetto metadati non diventa falsa unicità normalizzata',r.code===409&&r.error==='email_identity_scan_incomplete'&&writes.length===0&&__mail.connections===0,r);
 for(const changed of [{contactEmail:'new@example.invalid'},{contactId:'other-person'},{contactUid:'other-user'}]){
  reset();mail(1);put('conversations/'+CID,{...DB.get('conversations/'+CID),leadId:null,contactType:'email',contactId:'email-client'});
  __mail.afterSearch=()=>put('conversations/'+CID,{...DB.get('conversations/'+CID),...changed});r=await call();
  check('cambio identità dopo ricerca IMAP blocca ogni scrittura '+Object.keys(changed)[0],r.imported===0&&r.errors===1&&r.incomplete&&r.error==='conversation_identity_changed'&&writes.length===0&&!DB.has('heartbeat/segretaria-mail-memory'),r);
 }
 reset();mail(1);F.setBeforeCommit(async operations=>{
  if(operations.some(op=>op.update.name.includes('/messages/segretaria_mail_')))
   put('conversations/'+CID,{...DB.get('conversations/'+CID),contactEmail:'new@example.invalid',lastMessagePreview:'New identity'});
 });r=await call();
 check('cambio identità tra lettura e commit non lascia messaggio orfano o header',r.imported===0&&r.errors===1&&r.error==='conversation_identity_changed'&&writes.length===0&&DB.get('conversations/'+CID).lastMessagePreview==='New identity',r);
 reset();mail(1);__mail.afterSearch=()=>put('leads/leadA',{...DB.get('leads/leadA'),conversationId:'other-conversation'});r=await call();
 check('binding lead modificato durante IMAP blocca importazione',r.imported===0&&r.errors===1&&r.error==='conversation_identity_changed'&&writes.length===0,r);
 reset();delete process.env.PFS_IMAP_PASS;r=await call();
 check('sync senza configurazione è incompleto con contatori zero e data',r.code===200&&r.skipped==='imap_unconfigured'&&r.incomplete&&!r.healthy&&r.scanned===0&&r.imported===0&&!!r.checkedAt&&__mail.connections===0,r);
 r=await call({body:{},token:'cron-fixture'});
 check('cron compatibile ma config mancante non è salute verde',r.code===200&&DB.get('teamHealth/segretaria')?.ok===false,r);
 reset();mail(1);mail(2,'other@example.invalid');put('conversations/other',{contactEmail:'other@example.invalid',segretaria:true});
 put('settings/segretaria',{enabled:true,prepareCases:true,prepareSince:new Date(NOW-86400000).toISOString(),automaticReplies:true});
 put('conversations/'+CID,{...DB.get('conversations/'+CID),segretaria:true});
 r=await call();
 check('sync importa solo il mittente della conversazione scelta',r.imported===1&&r.scanned===1&&__mail.searches.length===1&&__mail.searches[0].from==='client@example.invalid',r);
 check('sync ignora automazioni accese: zero AI, invii, nuovi casi e salute globale',external.length===0&&__mails.length===0&&r.turns===0&&F.tasks().length===0&&!DB.has('teamHealth/segretaria'),{r,external,writes});
 check('scritture solo messaggio, chat, ricevuta e guardia lead senza campi',writes.every(w=>w.path.startsWith('messages/')||w.path==='conversations/'+CID||w.path==='heartbeat/segretaria-mail-memory'||(w.path==='leads/leadA'&&Object.keys(w.fields).length===0)),writes);
 const beforeCount=[...DB.keys()].filter(p=>p.startsWith('messages/')).length;writes.length=0;r=await call();
 check('retry non duplica messaggi né riapre chat',r.imported===0&&r.duplicates===1&&[...DB.keys()].filter(p=>p.startsWith('messages/')).length===beforeCount&&writes.length===0,r);
 reset();mail(1);const concurrent=await Promise.all([call(),call()]);
 check('due sync contemporanei creano una sola email',concurrent.every(x=>x.code===200)&&concurrent.reduce((n,x)=>n+x.imported,0)===1
  &&[...DB.values()].filter(x=>x.emailMessageId==='<mail-1@fixture.invalid>').length===1,concurrent);
 check('sync concorrenti non inviano o creano preparazioni',external.length===0&&__mails.length===0&&F.tasks().length===0,concurrent);
 reset();mail(1);
 F.setBeforeCommit(async operations=>{
  if(operations.some(op=>op.update.name.endsWith('/conversations/'+CID)))
   put('conversations/'+CID,{...DB.get('conversations/'+CID),lastMessageAt:new Date(NOW).toISOString(),lastDirection:'out',needsReply:false});
 });
 r=await call();check('risposta arrivata durante import vince il confronto atomico header',r.imported===1&&DB.get('conversations/'+CID).lastDirection==='out'&&!DB.get('conversations/'+CID).needsReply,r);
 reset();mail(1);put('conversations/'+CID,{...DB.get('conversations/'+CID),lastMessageAt:new Date(NOW).toISOString()});
 F.setBeforeCommit(async function changeMemory(operations){
  if(operations.some(op=>op.update.name.endsWith('/'+ 'heartbeat/segretaria-mail-memory')))
   put('heartbeat/segretaria-mail-memory',{ids:['<concurrent@fixture.invalid>']});
  else F.setBeforeCommit(changeMemory);
 });
 r=await call();const receiptIds=DB.get('heartbeat/segretaria-mail-memory')?.ids||[];
 check('conflitto memoria riletto: conserva ricevute concorrenti e propria',r.imported===1&&!r.errors&&receiptIds.includes('<concurrent@fixture.invalid>')&&receiptIds.includes('<mail-1@fixture.invalid>'),{r,receiptIds});
 reset();mail(1);put('conversations/'+CID,{...DB.get('conversations/'+CID),lastMessageAt:new Date(NOW).toISOString(),lastDirection:'out',lastMessagePreview:'Risposta più recente',needsReply:false});r=await call();
 check('mail storica non sovrascrive risposta recente o needsReply',r.imported===1&&DB.get('conversations/'+CID).lastDirection==='out'&&DB.get('conversations/'+CID).needsReply===false,r);
 // The scheduled path used to bypass the import guard and reopen replied cases.
 const cron=()=>call({body:{},token:'cron-fixture'});
 const newerHeader={lastMessageAt:new Date(NOW).toISOString(),lastDirection:'out',lastMessagePreview:'Risposta WhatsApp più recente',needsReply:false};
 const keepsReply=()=>Object.entries(newerHeader).every(([k,v])=>DB.get('conversations/'+CID)[k]===v);
 const watch=async()=>captureFollowUp({cid:CID,conv:DB.get('conversations/'+CID),messageId:'tracked-wa',text:'Richiesta già seguita',now:NOW-1000});
 reset();put('conversations/'+CID,{...DB.get('conversations/'+CID),...newerHeader,segretaria:false});const watched=await watch();mail(1);r=await cron();
 check('cron archivia mail vecchia senza riaprire risposta WhatsApp recente',r.imported===1&&!r.incomplete&&keepsReply(),r);
 check('cron conserva il seguito più recente e non abilita invii o AI',DB.get('operatorTasks/'+watched.id).followUp.lastMessageId==='tracked-wa'&&F.tasks().length===1&&external.length===0&&__mails.length===0&&!DB.get('conversations/'+CID).segretaria,{r,external});
 // Lost memory acknowledgement must still be harmless when the message exists.
 DB.delete('heartbeat/segretaria-mail-memory');versions.delete('heartbeat/segretaria-mail-memory');r=await cron();
 check('retry cron dopo ricevuta persa non duplica e non riapre la chat',r.imported===0&&r.duplicates===1&&keepsReply()&&[...DB.values()].filter(x=>x.emailMessageId==='<mail-1@fixture.invalid>').length===1,r);
 reset();await watch();mail(1);F.setBeforeCommit(async operations=>{
  if(operations.some(op=>op.update.name.includes('/messages/segretaria_mail_')))
   put('conversations/'+CID,{...DB.get('conversations/'+CID),...newerHeader});
 });r=await cron();
 check('cron ritenta il conflitto atomico e preserva la risposta concorrente',r.imported===1&&!r.errors&&keepsReply(),r);
 reset();await watch();mail(1);__mail.afterSearch=()=>put('conversations/'+CID,{...DB.get('conversations/'+CID),contactEmail:'changed@example.invalid'});r=await cron();
 check('cron non attribuisce mail a identità cambiata durante IMAP',r.imported===0&&r.errors===1&&r.incomplete&&r.error==='conversation_identity_changed'&&![...DB.values()].some(x=>x.emailMessageId==='<mail-1@fixture.invalid>')&&!DB.has('heartbeat/segretaria-mail-memory'),r);
 reset();await watch();mail(31);r=await cron();
 check('cron aggiorna header e seguito per una mail realmente nuova',r.imported===1&&DB.get('conversations/'+CID).lastDirection==='in'&&DB.get('conversations/'+CID).needsReply&&DB.get('conversations/'+CID).lastMessagePreview==='Ricevuta fixture 31.'&&F.tasks()[0].followUp.preview==='Ricevuta fixture 31.',r);
 reset();const task=await captureFollowUp({cid:CID,conv:DB.get('conversations/'+CID),messageId:'start',text:'Documento da verificare',now:NOW-60000});
 put('operatorTasks/'+task.id,{...DB.get('operatorTasks/'+task.id),followUp:{...task.followUp,nextAction:'Verificare ricevuta',confirmed:true,needsReview:false}});writes.length=0;mail(1);r=await call();
 check('seguito già aperto si aggiorna deterministicamente senza perdere decisione',r.refreshed===1&&F.tasks().length===1&&DB.get('operatorTasks/'+task.id).followUp.nextAction==='Verificare ricevuta'&&DB.get('operatorTasks/'+task.id).followUp.needsReview,r);
 check('tracking non scrive impostazioni o action_queue',writes.every(w=>!w.path.startsWith('action_queue/')&&!w.path.startsWith('settings/'))&&external.length===0&&__mails.length===0,writes);
 reset();const closed=await captureFollowUp({cid:CID,conv:DB.get('conversations/'+CID),messageId:'closed',text:'Già concluso',now:NOW-60000});put('operatorTasks/'+closed.id,{...DB.get('operatorTasks/'+closed.id),status:'done',followUp:{...closed.followUp,open:false}});writes.length=0;mail(1);r=await call();
 check('sync con cursore storico non crea un nuovo incarico né riapre il chiuso',r.refreshed===0&&F.tasks().length===1&&DB.get('operatorTasks/'+closed.id).status==='done',r);
 reset();for(let i=1;i<=10;i++)mail(i);r=await call();
 check('tetto otto importazioni dichiara due messaggi rinviati',r.imported===8&&r.scanned===8&&r.deferred===2&&r.incomplete&&!r.healthy,r);
 reset();mail(1);__mail.searchCost=30000;r=await call();
 check('budget residuo insufficiente non avvia fetch e dichiara incompleto',r.connected&&r.scanned===0&&r.deferred===1&&r.incomplete&&!r.healthy&&__mail.fetches===0,r);
 reset();put('conversations/'+CID,{...DB.get('conversations/'+CID),segretaria:true});put('conversations/other',{contactEmail:'other@example.invalid',segretaria:true});__mail.searchCost=30000;r=await call({body:{},token:'cron-fixture'});
 check('budget finito nelle ricerche dichiara mittenti non controllati',r.deferredSenders===1&&r.incomplete&&DB.get('teamHealth/segretaria').ok===false,r);
 reset();mail(1);__mail.failFetch=true;r=await call();
 check('errore di lettura resta conteggiato senza dettagli sensibili',r.errors===1&&r.incomplete&&!r.healthy&&!JSON.stringify(r).includes('private'),r);
 reset();__mail.failConnect=true;r=await call();
 check('connessione fallita restituisce errore e stato non verificato',r.errors===1&&!r.connected&&r.incomplete&&!r.healthy,r);
 reset();mail(1);put('conversations/'+CID,{...DB.get('conversations/'+CID),segretaria:true});r=await call({body:{},token:'cron-fixture'});
 check('cron globale mantiene contratto esistente e salva prova connessione',r.code===200&&r.imported===1&&DB.get('teamHealth/segretaria')?.stats.connected===true,r);
 r=await scanStatus();check('stato verde richiede prova recente, completa e configurazione presente',r.email.connectionVerified&&r.email.healthy,r);
 clock+=31*60000;r=await scanStatus();check('prova vecchia non resta sana indefinitamente',r.email.connectionVerified&&!r.email.healthy&&!r.email.lastScan.fresh,r);
}finally{Date.now=REAL_NOW;}
if(!process.env.BOOM_MAIL_MUTATION)for(const mutation of ['sync_ai_gate','admin_scope','budget_complete','scoped_identity','scoped_atomic','normalized_identity','scheduled_header_order']){
 const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,BOOM_MAIL_MUTATION:mutation},encoding:'utf8',timeout:20000});
 check('mutazione intercettata: '+mutation,child.status!==0&&child.stdout.includes('FAIL')&&!child.stderr.includes('Mutation boundary missing'));
}
console.log(`\n${checks-failed}/${checks} PASS`);process.exitCode=failed?1:0;
