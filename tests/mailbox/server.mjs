import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reset, call } from './fixture.mjs';
let checks=0,failed=0;
const check=(name,pass,detail)=>{checks++;console.log(`${pass?'PASS':'FAIL'} ${name}${!pass?' '+JSON.stringify(detail):''}`);if(!pass)failed++;};
const read=ref=>call({action:'read',messageRef:ref});
const REAL_NOW=Date.now,REAL_TIMEOUT=globalThis.setTimeout;
try{
 let io=reset(),r=await call(undefined,{token:'invalid'});check('token non valido prima di IMAP',r.code===401&&io.clients.length===0,r);
 for(const role of ['owner','landlord','tenant']){io=reset();io.role=role;r=await call();check('ruolo '+role+' non accede alla casella globale',r.code===403&&io.clients.length===0,r);}
 io=reset();io.profileError=true;r=await call();check('lettura ruolo fallita non concede accesso',r.code===503&&io.clients.length===0,r);
 io=reset();r=await call(undefined,{method:'GET'});check('solo POST esplicito senza letture',r.code===405&&io.http.length===0,r);
 for(const query of ['ab','x'.repeat(161),'needle\r\nUID SEARCH ALL',{},null]){io=reset();r=await call({action:'search',query});check('query non valida respinta '+typeof query,r.code===400&&io.clients.length===0,r);}
 io=reset();r=await call({action:'search',query:'from:anyone OR ALL'});check('operatori forniti sono testo letterale, mai query IMAP raw',r.code===200&&JSON.stringify(io.searches[0].query)===JSON.stringify({text:'from:anyone OR ALL'}),{r,search:io.searches});
 io=reset();r=await call();check('Gmail principale prevale su PFS, cartella All con account dichiarato',r.code===200&&r.source.account==='operator@example.invalid'&&r.source.coverage==='all-mail'&&r.source.folder==='[Gmail]/All Mail'&&io.options[0].host==='imap.gmail.com',r);
 check('lettura readonly senza source o allegati e cache disabilitata',io.locks.every(x=>x.options.readOnly===true)&&io.fetches.every(x=>!x.query.source&&!x.query.bodyParts)&&r.headers['Cache-Control']==='no-store'&&io.closed===1,{locks:io.locks,fetches:io.fetches});
 check('prima pagina20 ordinata e riferimenti firmati senza segreti',r.items?.length===20&&r.items[0].subject.endsWith('24')&&r.items[19].subject.endsWith('5')&&!!r.nextCursor&&!JSON.stringify(r).includes('synthetic-app-password')&&!r.incomplete,r);
 const first=r,second=await call({action:'search',query:'needle',cursor:r.nextCursor});check('pagina successiva senza duplicati e fine esplicita',second.code===200&&second.items.length===4&&second.nextCursor===null&&!second.items.some(a=>first.items.some(b=>a.subject===b.subject)),second);
 r=await call({action:'search',query:'different',cursor:first.nextCursor});check('cursore vincolato alla query',r.code===400,r);
 r=await read(first.items[0].messageRef);check('testo MIME decodificato dal parser reale e fonte',r.code===200&&r.message.text==='Caffè di prova'&&!r.message.truncated&&!r.message.bodyUnavailable&&!!r.checkedAt&&r.source.account==='operator@example.invalid',r);
 const token=first.items[0].messageRef,[payload,signature]=token.split('.'),data=JSON.parse(Buffer.from(payload,'base64url').toString());data.uid=1;
 r=await read(Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+signature);check('UID alterato non apre altra email',r.code===400,r);
 r=await read(first.nextCursor);check('cursore non è riferimento messaggio',r.code===400,r);
 io.uid='other-admin';r=await read(token);check('riferimento vincolato al singolo admin',r.code===400,r);io.uid='admin';
 io.validity=456n;r=await read(token);check('UIDVALIDITY cambiata richiede nuova ricerca',r.code===409,r);io.validity=123n;
 io.folders=[{path:'INBOX',specialUse:'\\Inbox'}];r=await read(token);check('cartella cambiata non cerca stesso UID altrove',r.code===409,r);
 io=reset();r=await call();const expiring=r.items[0].messageRef;Date.now=()=>REAL_NOW()+16*60000;r=await read(expiring);Date.now=REAL_NOW;check('riferimento scaduto respinto',r.code===400,r);
 for(const field of ['GMAIL_USER','GMAIL_APP_PASS']){io=reset();r=await call();const ref=r.items[0].messageRef;process.env[field]+='-changed';r=await read(ref);check('configurazione mutata invalida il riferimento '+field,r.code===400,r);}
 io=reset();delete process.env.GMAIL_APP_PASS;r=await call();check('Gmail parziale non passa silenziosamente a PFS',r.code===503&&r.error==='mailbox_unconfigured'&&io.clients.length===0,r);
 io=reset();delete process.env.GMAIL_USER;delete process.env.GMAIL_APP_PASS;io.folders=[{path:'INBOX',specialUse:'\\Inbox'}];r=await call();check('fallback PFS e INBOX dichiarano account/copertura reali',r.code===200&&r.source.account==='radar@example.invalid'&&r.source.coverage==='inbox-only'&&io.options[0].host==='imap.radar.invalid',r);
 io=reset();io.deleted=24;r=await call();check('messaggio rimosso durante ricerca dichiara pagina incompleta',r.code===200&&r.items.length===19&&r.incomplete,r);
 io=reset();r=await call();io.deleted=24;r=await read(r.items[0].messageRef);check('messaggio eliminato non mostra una email sostitutiva',r.code===404,r);
 io=reset();const row=io.rows[23];row.structure={type:'multipart/mixed',childNodes:[{part:'1',type:'text/plain',disposition:'attachment',parameters:{name:'private.txt'},size:18},{part:'2',type:'text/plain',size:12}]};row.parts={'1':'PRIVATE ATTACHMENT','2':'Visible body'};r=await call();r=await read(r.items[0].messageRef);check('allegato testuale non letto, selezione vera parte testo',r.code===200&&r.message.text==='Visible body'&&r.message.hasAttachments&&io.fetches.filter(x=>x.query.bodyParts).every(x=>x.query.bodyParts[0].key==='2'),r);
 io=reset();io.rows[23].structure={type:'application/pdf',disposition:'attachment',size:9000000};r=await call();const before=io.fetches.length;r=await read(r.items[0].messageRef);check('email di solo allegato non scarica bytes e dichiara corpo assente',r.code===200&&r.message.bodyUnavailable&&r.message.hasAttachments&&io.fetches.length===before+1,r);
 io=reset();io.rows[23].structure={type:'text/html',encoding:'7bit',size:57};io.rows[23].parts.TEXT='<p>Ciao <b>test</b></p><script>window.private=1</script>';r=await call();r=await read(r.items[0].messageRef);check('HTML convertito a testo senza script o HTML eseguibile',r.code===200&&r.message.text.includes('Ciao test')&&!r.message.text.includes('<script')&&!r.message.text.includes('private'),r);
 io=reset();io.rows[23].structure={type:'text/plain',size:400000};io.rows[23].parts.TEXT='x'.repeat(400000);r=await call();r=await read(r.items[0].messageRef);check('corpo grande scarica al massimo256KiB e dichiara taglio',r.code===200&&r.message.truncated&&r.message.text.length<=262144&&io.fetches.filter(x=>x.query.bodyParts).every(x=>x.query.bodyParts[0].maxLength===262144),{code:r.code,textLength:r.message?.text.length,truncated:r.message?.truncated});
 for(const phase of ['connect','list','search','metadata','body']){
  io=reset();const found=await call();io.error=phase;r=phase==='body'?await read(found.items[0].messageRef):await call();check('errore '+phase+' senza dettagli sensibili né finto vuoto',r.code===503&&!JSON.stringify(r).includes('private')&&io.closed>=1,r);
 }
 for(const phase of ['auth','profile','connect','search','body']){
  io=reset();const found=await call();io.hang=phase;const closed=io.closed;
  globalThis.setTimeout=(fn,ms,...args)=>REAL_TIMEOUT(fn,Math.min(ms,25),...args);
  r=phase==='body'?await read(found.items[0].messageRef):await call();globalThis.setTimeout=REAL_TIMEOUT;
  check('deadline assoluta interrompe '+phase,r.code===504&&r.error==='mailbox_timeout'&&(['auth','profile'].includes(phase)||io.closed>closed),r);
 }
 io=reset();let elapsed=0;Date.now=()=>REAL_NOW()+elapsed;io.hook=async phase=>{if(phase==='metadata')elapsed=21000;};r=await call();Date.now=REAL_NOW;check('IO risolta dopo deadline non ritorna falso successo',r.code===504,r);
 io=reset();io.hook=async phase=>{if(phase==='search')throw Object.assign(Error('private content'),{code:'private user@example.invalid',status:401});};r=await call();check('codici arbitrari del provider non escono nella risposta',r.code===503&&r.error==='mailbox_unavailable'&&!JSON.stringify(r).includes('private'),r);
 io=reset();const concurrent=await Promise.all([call(),call()]);check('letture concorrenti senza stato condiviso né scritture/provider AI',concurrent.every(r=>r.code===200)&&io.forbidden.length===0&&io.http.every(x=>x.host==='identitytoolkit.googleapis.com'||x.host==='firestore.googleapis.com'&&x.method==='GET')&&io.clients.length===2,{codes:concurrent.map(x=>x.code),http:io.http});
}finally{Date.now=REAL_NOW;globalThis.setTimeout=REAL_TIMEOUT;}
if(!process.env.BOOM_MAILBOX_MUTATION)for(const mutation of ['admin','signature','actor','validity','readonly','attachments','body_bound','part_case']){
 const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,BOOM_MAILBOX_MUTATION:mutation},encoding:'utf8',timeout:20000});
 check('mutazione intercettata '+mutation,child.status!==0&&child.stdout.includes('FAIL')&&!child.stderr.includes('Mutation boundary missing'));
}
console.log(`\n${checks-failed}/${checks} PASS`);process.exitCode=failed?1:0;
