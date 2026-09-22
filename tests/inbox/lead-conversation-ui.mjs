// Canonical lead conversation: real portal handlers/renderers, synthetic IO only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadChromium, launchOptions } from '../_browser.mjs';
const read = name => readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const portal=process.env.TEST_BASELINE ? execFileSync('git',['show',process.env.TEST_BASELINE+':js/portal-app.js'],{cwd:new URL('../..',import.meta.url),encoding:'utf8',maxBuffer:8*1024*1024}) : read('js/portal-app.js');
const named=(name,source=portal)=>{
  let start=source.indexOf('    function '+name+'(');
  if(start<0)start=source.indexOf('    async function '+name+'(');
  assert(start>=0,'Funzione reale presente: '+name);
  const next=source.slice(start+5).search(/\n    (?:async )?function /);
  return source.slice(start,start+5+next);
};
const CID='conv_whatsapp_393331234567', LEAD='lead-demo';
const chromium=await loadChromium();assert(chromium,'Playwright necessario (BOOM_PLAYWRIGHT)');
const browser=await chromium.launch(launchOptions({headless:true}));
let passed=0,failed=0;
const check=async(label,fn)=>{
  if(process.env.TEST_FILTER && !label.includes(process.env.TEST_FILTER))return;
  try{await fn();passed++;console.log('PASS '+label);}catch(error){failed++;console.log('FAIL '+label+'\n  '+error.message);}
};

async function fixture(source=portal){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.setDefaultTimeout(3000);page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="main"></main><div id="modals"></div><div id="toasts"></div>');
  await page.addStyleTag({content:read('css/portal.css')+'\n'+read('css/segretaria.css')});
  await page.addScriptTag({content:`
    const S={page:'inbox',profile:{id:'admin',role:'admin',name:'Operatore demo'},isOnline:true,users:[{id:'tenant-demo',role:'tenant',name:'Inquilino demo'}],leads:[{id:'${LEAD}',name:'Lead demo',phone:'+393331234567',email:'lead@example.invalid'}],clients:[],pfsClients:[],actionQueue:[],contracts:[],maintenance:[],properties:[],conversations:[],messages:[]};
    const auth={currentUser:{uid:'admin',getIdToken:async()=> 'synthetic-token'}};
    const firebase={firestore:{FieldValue:{serverTimestamp:()=> '2026-09-21T12:00:00Z'}}};
    const buildNav=()=>{},logActivity=()=>{},sendBrowserNotification=()=>{};
    const renderPage=()=>{throw Error('Unexpected whole-page render')};
    let selectedFile=null,listingImageUrl='';
    window.io={requests:[],reads:[],writes:[],subscriptions:[]};window.apiMode='bound';window.readFailure=false;window.holdAPI=false;window.holdRead=false;
    window.canonical={id:'${CID}',contactType:'lead',contactId:'${LEAD}',leadId:'${LEAD}',contactName:'Nome canonico del server',contactPhone:'+393331234567',contactEmail:'canonical@example.invalid',contactUid:'existing-contact-acl',assignedLandlordId:'existing-landlord-acl',channel:'whatsapp',status:'open',lastMessageAt:'2026-09-21T10:00:00Z',lastMessagePreview:'Cronologia canonica',unread:0};
    window.feedRows=Array.from({length:200},(_,i)=>({id:i?'conv-other-'+i:'conv-existing',contactName:i?'Altro contatto '+i:'Conversazione iniziale',contactEmail:'demo@example.invalid',status:'open',channel:'email',unread:0,lastMessageAt:'2026-09-21T09:00:00Z'}));
    window.records=new Map([[canonical.id,structuredClone(canonical)],...feedRows.map(row=>[row.id,structuredClone(row)])]);
    window.subscriptions={};window.fastTimeout=false;
    const nativeTimeout=window.setTimeout.bind(window);
    window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,fastTimeout && ms>=5000?60:ms,...args);
    window.fetch=async(url,options={})=>{
      io.requests.push({url:String(url),method:options.method,headers:options.headers,body:options.body});
      if(String(url)!=='/api/homie/conversation')throw Error('Unexpected API/AI request: '+url);
      if(holdAPI)await new Promise(resolve=>window.releaseAPI=resolve);
      if(apiMode==='timeout')return new Promise((resolve,reject)=>{
        if(options.signal?.aborted)return reject(new DOMException('Deadline','AbortError'));
        options.signal?.addEventListener('abort',()=>reject(new DOMException('Deadline','AbortError')),{once:true});
      });
      const status=apiMode==='conflict'?409:apiMode==='unavailable'?503:200;
      const data=status===409?{ok:false,cid:null,status:'conflict',reason:'Il collegamento della conversazione richiede verifica.'}:status===503?{ok:false,cid:null,status:'unavailable',reason:'Non riesco a collegare la conversazione. Riprova.'}:{ok:true,cid:apiMode==='malformed'?'../invalid':canonical.id,status:apiMode==='new'?'new':'bound'};
      return {ok:status===200,status,json:async()=>data};
    };
    const snapshot=rows=>({docs:rows.map(row=>({id:row.id,data:()=>structuredClone(row)})),metadata:{fromCache:false},docChanges:()=>[{type:'modified'}]});
    const db={collection(name){
      if(!['conversations','messages'].includes(name))throw Error('Unexpected collection: '+name);
      return {filter:null,maximum:null,
        where(field,op,value){this.filter=[field,op,value];return this;},orderBy(){return this;},limit(n){this.maximum=n;return this;},
        doc(id){return {
          async get(options){io.reads.push({name,id,options});if(holdRead)await new Promise(resolve=>window.releaseRead=resolve);if(readFailure)throw Error('permission-denied');const row=records.get(id);return {id,exists:!!row,data:()=>structuredClone(row)};},
          async set(payload,options){io.writes.push({name,id,op:'set',payload,options});records.set(id,{...(records.get(id)||{}),...structuredClone(payload),id});},
          async update(payload){io.writes.push({name,id,op:'update',payload});Object.assign(records.get(id)||{},structuredClone(payload));}
        };},
        onSnapshot(...args){
          const callbacks=args.filter(arg=>typeof arg==='function');const key=name==='messages'?'messages:'+this.filter[2]:name;
          const sub={next:callbacks[0],error:callbacks[1],query:this};subscriptions[key]=sub;io.subscriptions.push({name,filter:this.filter,limit:this.maximum});
          Promise.resolve().then(()=>{if(sub.stopped)return;if(name==='conversations')sub.next(snapshot(feedRows));else sub.next(snapshot([{id:'message-'+this.filter[2],conversationId:this.filter[2],body:this.filter[2]==='${CID}'?'Cronologia canonica':'Messaggio iniziale',direction:'in',channel:'whatsapp',at:'2026-09-21T10:00:00Z'}]));});
          return()=>{sub.stopped=true;};
        }};
    }};
    window.emitPage=(rows=feedRows)=>subscriptions.conversations.next(snapshot(rows));
    window.emitMessages=(sub,rows)=>sub.next(snapshot(rows));
  `});
  for(const name of ['conversations','oggi-engine','segretaria-casi-engine','segretaria-proposta-engine','segretaria-esecuzione-engine'])await page.addScriptTag({content:read('js/'+name+'.js')});
  const oggi=source.slice(source.indexOf('    function oggiDismissKey()'),source.indexOf('    function adminDashboard()'));
  const inbox=source.slice(source.indexOf('    var _inboxState ='),source.indexOf('    var _psState ='));
  await page.addScriptTag({content:oggi+'\n'+inbox+'\n'+['isAdmin','isLandlord','isTenant','esc','closeModal','startInboxListener','stopInboxListener','startOpenConvListener','stopOpenConvListener'].map(name=>named(name,source)).join('\n')+'\n'+source.slice(source.indexOf('    function toast('),source.indexOf("    console.log('🚀 BOOM Portal"))+'\nstartInboxListener();'});
  await page.waitForFunction(()=>S.conversations.length===200);
  await page.evaluate(()=>{_inboxState.convId='conv-existing';_inboxState.composing='email';document.getElementById('main').innerHTML=inboxPage();});
  await page.locator('#inboxSubject').fill('Oggetto da conservare');await page.locator('#inboxBody').fill('Bozza precedente da conservare');
  await page.getByRole('button',{name:'Nuova conversazione',exact:false}).click();
  await page.locator('#_ncSearch').fill('Lead demo');await page.locator('#_ncContact').selectOption('lead|'+LEAD);
  return {page,errors};
}
async function clickOpen(page){await page.getByRole('button',{name:'Apri conversazione',exact:true}).click();}
async function canonicalOpened(page){
  assert.equal(await page.evaluate(()=>io.requests.length),1,'Il lead passa dal risolutore server, senza ricostruire un ID locale');
  await page.waitForFunction(cid=>_inboxState.convId===cid && S.openConvId===cid,CID);
  assert.match(await page.locator('#inboxTimeline').innerText(),/Cronologia canonica/);
  const io=await page.evaluate(()=>window.io);
  assert.deepEqual(io.requests.map(r=>({url:r.url,method:r.method,body:JSON.parse(r.body),authorization:r.headers.Authorization})),[{url:'/api/homie/conversation',method:'POST',body:{leadId:LEAD},authorization:'Bearer synthetic-token'}]);
  assert.deepEqual(io.reads,[{name:'conversations',id:CID,options:{source:'server'}}]);
  assert.deepEqual(io.writes,[],'Il browser non riscrive header o ACL');
  assert(io.subscriptions.some(s=>s.name==='messages' && s.filter[2]===CID),'La cronologia usa il CID restituito');
  assert.deepEqual(await page.evaluate(()=>records.get(canonical.id)),await page.evaluate(()=>canonical));
}
async function failedOpenPreserves(page){
  await page.waitForFunction(()=>document.querySelector('#_ncError,#toasts .error,[role="alert"]')?.textContent?.trim());
  assert.equal(await page.locator('#_ncContact').inputValue(),'lead|'+LEAD);
  assert.equal(await page.locator('#_ncSearch').inputValue(),'Lead demo');
  assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza precedente da conservare');
  assert.equal(await page.locator('#inboxSubject').inputValue(),'Oggetto da conservare');
  assert.equal(await page.evaluate(()=>_inboxState.convId),'conv-existing');
  assert.deepEqual(await page.evaluate(()=>io.writes),[],'Un errore non crea conv_lead né header');
  assert.equal(await page.evaluate(()=>io.subscriptions.some(s=>s.name==='messages' && s.filter[2]!== 'conv-existing')),false);
  const text=await page.locator('#_ncError,#toasts .error,[role="alert"]').first().innerText();
  assert.match(text,/colleg|conversazion|riprov|verific|aggiorna/i,'L’errore deve spiegare il problema alla persona');
  assert.doesNotMatch(text,/permission-denied|AbortError|undefined|conv_lead_/);
}
async function blockedRole(page,role){
  await page.evaluate(async role=>{S.profile.role=role;try{await inboxFindOrCreateConversation('lead',S.leads[0]);}catch{}await inboxCreateFromModal();},role);
  assert.deepEqual(await page.evaluate(()=>io.requests),[],'Un ruolo senza autorizzazione non chiama il risolutore lead');
  assert.deepEqual(await page.evaluate(()=>io.writes),[]);assert.equal(await page.evaluate(()=>_inboxState.convId),'conv-existing');
}
function replaceOnce(source,from,to){assert(source.includes(from),'Mutazione agganciata al codice reale');assert.equal(source.split(from).length,2,'Mutazione univoca');return source.replace(from,to);}
try{
  for(const mode of ['bound','new'])await check(mode+' · il CID canonico fuori lista viene letto dal server e apre la cronologia',async()=>{
    const {page,errors}=await fixture();try{await page.evaluate(mode=>{apiMode=mode;},mode);await clickOpen(page);await canonicalOpened(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  await check('la pagina successiva di 200 conversazioni non nasconde quella selezionata',async()=>{
    const {page,errors}=await fixture();try{
      await clickOpen(page);await canonicalOpened(page);await page.locator('#inboxBody').fill('Bozza della chat canonica');
      await page.evaluate(()=>emitPage());await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>_inboxState.convId),CID);assert.match(await page.locator('#inboxTimeline').innerText(),/Cronologia canonica/);
      assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza della chat canonica');assert.deepEqual(await page.evaluate(()=>io.writes),[]);assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  await check('un header aggiornato nel feed resta aggiornato quando esce dalle successive 200 righe',async()=>{
    const {page,errors}=await fixture();try{
      await clickOpen(page);await canonicalOpened(page);
      await page.evaluate(()=>emitPage([{...canonical,contactName:'Nome canonico aggiornato',lastMessagePreview:'Nuova anteprima'},...feedRows.slice(1)]));
      await page.waitForFunction(()=>S.inboxExactConversation.row.contactName==='Nome canonico aggiornato');
      await page.evaluate(()=>emitPage());await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>S.conversations.find(c=>c.id===canonical.id).contactName),'Nome canonico aggiornato');
      assert.match(await page.locator('#main').innerText(),/Nome canonico aggiornato/);assert.deepEqual(await page.evaluate(()=>io.writes),[]);assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  for(const mode of ['conflict','unavailable','timeout','malformed','readfailure'])await check(mode+' · nessun fallback locale, modale e bozza rimangono leggibili',async()=>{
    const {page,errors}=await fixture();try{
      await page.evaluate(mode=>{apiMode=mode==='readfailure'?'bound':mode;readFailure=mode==='readfailure';fastTimeout=mode==='timeout';},mode);
      await clickOpen(page);await failedOpenPreserves(page);assert.deepEqual(errors,[]);
      if(mode==='malformed')assert.deepEqual(await page.evaluate(()=>io.reads),[],'Un CID malformato non deve diventare un percorso Firestore');
    }finally{await page.close();}
  });
  for(const role of ['landlord','tenant'])await check(role+' · il comando lead dopo revoca del ruolo non chiama API né scrive',async()=>{
    const {page,errors}=await fixture();try{
      await blockedRole(page,role);assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  for(const scenario of ['api-closed','api-contact','read-user','read-replaced'])await check(scenario+' · una risposta tardiva non seleziona né conserva la chat fuori dal contesto originario',async()=>{
    const {page,errors}=await fixture();try{
      await page.evaluate(scenario=>{holdAPI=scenario.startsWith('api');holdRead=!holdAPI;window.pendingOpen=inboxCreateFromModal();},scenario);
      await page.waitForFunction(scenario=>scenario.startsWith('api')?typeof releaseAPI==='function':typeof releaseRead==='function',scenario);
      assert.equal(await page.locator('#_ncOpen').isDisabled(),true,'Il comando segnala la richiesta in corso');
      await page.evaluate(scenario=>{
        if(scenario==='api-closed')closeModal();
        if(scenario==='api-contact'){document.getElementById('_ncSearch').value='Inquilino demo';inboxFilterContacts();document.getElementById('_ncContact').value='tenant|tenant-demo';}
        if(scenario==='read-user'){auth.currentUser={uid:'other',getIdToken:async()=> 'other-token'};S.profile={id:'other',role:'admin'};}
        if(scenario==='read-replaced'){closeModal();inboxOpenNewModal();}
        if(scenario.startsWith('api'))releaseAPI();else releaseRead();
      },scenario);
      await page.evaluate(()=>pendingOpen);
      assert.equal(await page.evaluate(()=>_inboxState.convId),'conv-existing');assert.equal(await page.evaluate(()=>!!S.inboxExactConversation),false);
      assert.equal(await page.evaluate(()=>S.conversations.some(c=>c.id===canonical.id)),false);assert.equal(await page.evaluate(()=>io.subscriptions.some(s=>s.name==='messages'&&s.filter[2]===canonical.id)),false);
      assert.deepEqual(await page.evaluate(()=>io.writes),[]);assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza precedente da conservare');assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  await check('callback messaggi della selezione precedente non modificano dati né salute della nuova chat',async()=>{
    const {page,errors}=await fixture();try{
      await clickOpen(page);await canonicalOpened(page);
      await page.evaluate(()=>{window.retired=subscriptions['messages:'+canonical.id];inboxSelect('conv-existing');});
      await page.waitForFunction(()=>S.openConvId==='conv-existing'&&!S.openConvStatus.loading);
      const before=await page.evaluate(()=>({messages:S.messages,status:S.openConvStatus}));
      await page.evaluate(()=>{emitMessages(retired,[{id:'stale-message',conversationId:canonical.id,body:'Dato ritirato'}]);retired.error(Error('retired'));});
      assert.deepEqual(await page.evaluate(()=>({messages:S.messages,status:S.openConvStatus})),before);assert.equal(await page.evaluate(()=>!!S.inboxExactConversation),false);assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  for(const stop of ['stopOpenConvListener','stopInboxListener','leaveInbox'])await check(stop+' · cancella il riferimento esatto e ignora i callback ritirati',async()=>{
    const {page,errors}=await fixture();try{
      await clickOpen(page);await canonicalOpened(page);
      await page.evaluate(stop=>{window.retired=subscriptions['messages:'+canonical.id];if(stop==='leaveInbox'){S.page='properties';portalFreshnessStop();}else window[stop]();},stop);
      const before=await page.evaluate(()=>({messages:S.messages,status:S.openConvStatus}));
      assert.equal(await page.evaluate(()=>retired.stopped),true);assert.equal(await page.evaluate(()=>S.openConvId),null);assert.equal(await page.evaluate(()=>!!S.inboxExactConversation),false);
      await page.evaluate(()=>{emitMessages(retired,[{id:'stale-message',conversationId:canonical.id,body:'Dato ritirato'}]);retired.error(Error('retired'));});
      assert.deepEqual(await page.evaluate(()=>({messages:S.messages,status:S.openConvStatus})),before);assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  await check('i contatti non lead mantengono ID e creazione precedenti senza endpoint lead',async()=>{
    const {page,errors}=await fixture();try{
      const result=await page.evaluate(async()=>{const contact=S.users.find(u=>u.id==='tenant-demo');const row=await inboxFindOrCreateConversation('tenant',contact);return {id:row.id,expected:BOOM_INBOX.convIdFor('tenant',contact.id)};});
      assert.equal(result.id,result.expected);assert.deepEqual(await page.evaluate(()=>io.requests),[]);
      const writes=await page.evaluate(()=>io.writes);assert.equal(writes.length,1);assert.equal(writes[0].op,'set');assert.equal(writes[0].id,result.expected);assert.deepEqual(writes[0].options,{merge:true});assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  if(!process.env.TEST_BASELINE){
    await check('mutazione · il ripristino di conv_lead locale viene rilevato dal percorso reale',async()=>{
      const source=replaceOnce(portal,"        if (kind === 'lead') return inboxResolveLeadConversation(contact);",'        // MUTATION: fallback locale anche per lead.');
      const {page,errors}=await fixture(source);try{await clickOpen(page);await assert.rejects(()=>canonicalOpened(page),/risolutore server/);assert.deepEqual(errors,[]);}finally{await page.close();}
    });
    await check('mutazione · togliere la protezione del risolutore per gli altri ruoli viene rilevato',async()=>{
      let source=replaceOnce(portal,"        if (!isAdmin() || !auth.currentUser) throw new Error('Accedi come amministratore per aprire questa conversazione.');","        if (!auth.currentUser) throw new Error('Accesso richiesto');");
      source=replaceOnce(source,'const current = () => auth.currentUser === user && isAdmin() && !controller.signal.aborted;','const current = () => auth.currentUser === user && !controller.signal.aborted;');
      const {page,errors}=await fixture(source);try{await assert.rejects(()=>blockedRole(page,'landlord'),/ruolo senza autorizzazione/);assert.deepEqual(errors,[]);}finally{await page.close();}
    });
  }
  console.log('\nLead conversation UI: '+passed+' pass, '+failed+' fail');process.exitCode=failed?1:0;
}finally{await browser.close();}
