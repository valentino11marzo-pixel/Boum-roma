// Real Inbox, real follow-up modal and authenticated server handler. IO is synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DB,reset,call,CID,tasks,addInbound,put,writes,requests} from './take-charge-fixture.mjs';
import {loadChromium,launchOptions} from '../_browser.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8'),source=read('js/portal-app.js');
function named(name){let start=source.indexOf('    function '+name+'(');if(start<0)start=source.indexOf('    async function '+name+'(');assert(start>=0,name);const next=source.slice(start+5).search(/\n    (?:async )?function /);return source.slice(start,start+5+next);}
const chromium=await loadChromium();assert(chromium,'Playwright required');const browser=await chromium.launch(launchOptions({headless:true}));
async function fixture(){
 reset();const page=await browser.newPage({viewport:{width:1100,height:900},timezoneId:'Europe/Rome'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
 await page.route('https://take-charge.example.invalid/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/api/segretaria/follow-up'){
   const result=await call({method:req.method(),query:Object.fromEntries(url.searchParams),body:req.postData()?JSON.parse(req.postData()):{}});
   return route.fulfill({status:result.code,contentType:'application/json',body:JSON.stringify(result)});
  }
  assert.equal(url.pathname,'/','No AI/send/unexpected API');
  return route.fulfill({contentType:'text/html',body:'<main id="main"></main><div id="modals"></div><div id="toasts"></div><style>.modal-overlay{position:fixed;inset:0;overflow:auto;background:white;z-index:100}.modal{margin:15px;padding:15px}input,textarea,select{display:block}button{padding:8px}p{margin:5px}#inboxTimeline{min-height:30px}</style>'});
 });await page.goto('https://take-charge.example.invalid/');
 const conversation={id:CID,...DB.get('conversations/'+CID)},message={id:'m1',...DB.get('messages/m1')};
 await page.addScriptTag({content:`
 const S={page:'inbox',profile:{id:'admin',role:'admin'},users:[],clients:[],leads:[{id:'leadA',name:'Cliente dimostrativo',propertyId:'pA'}],pfsClients:[],properties:[{id:'pA',name:'Casa dimostrativa'}],contracts:[{id:'cA',propertyId:'pA',linkedLeadId:'leadA',status:'active'}],conversations:[${JSON.stringify(conversation)}],messages:[${JSON.stringify(message)}]};
 const auth={currentUser:{uid:'admin',getIdToken:async()=> 'admin'}};
 const buildNav=()=>{},logActivity=()=>{},cacheData=()=>{};
 window.toasts=[];function toast(...args){toasts.push(args);document.getElementById('toasts').textContent=args.join(' ');}
 function goTo(page){S.page=page;document.getElementById('main').innerHTML=inboxPage();}
 const db={collection(){return{where(){return this;},orderBy(){return this;},limit(){return this;},onSnapshot(next){Promise.resolve().then(()=>next({docs:S.messages.map(m=>({id:m.id,data:()=>m}))}));return()=>{};},doc(){return{update(){throw Error('Unexpected browser write');}};}};}};
 `});
 for(const f of ['conversations','inbox-context-engine','oggi-workspace-engine','segretaria-casi-engine','segretaria-proposta-engine','segretaria-esecuzione-engine'])await page.addScriptTag({content:read('js/'+f+'.js')});
 const oggi=source.slice(source.indexOf('    function oggiDismissKey()'),source.indexOf('    function adminDashboard()'));
 const inbox=source.slice(source.indexOf('    var _inboxState ='),source.indexOf('    var _psState ='));
 await page.addScriptTag({content:oggi+'\n'+inbox+'\n'+['isAdmin','isLandlord','isTenant','portalSearchAuthorized','esc','jsq','closeModal','startOpenConvListener','stopOpenConvListener'].map(named).join('\n')});
 await page.evaluate(cid=>{_inboxState.filter='all';_inboxState.composing='email';inboxSelect(cid);},CID);
 if(!await page.locator('.inbox-thread-info').evaluate(e=>e.open))await page.locator('.inbox-thread-info>summary').click();
 return {page,errors};
}
async function fill(page){
 await page.locator('#sgPractice').selectOption('contracts/cA');await page.locator('#sgAction').fill('Verificare il documento della casa');
 await page.locator('#sgWaitingOn').selectOption('valentino');await page.locator('#sgWaitingLabel').fill('Valentino');
 await page.locator('#sgCheckAt').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
}
let checks=0;
async function test(label,run){const f=await fixture();try{await run(f.page);assert.deepEqual(f.errors,[]);console.log('PASS '+label);checks++;}catch(e){console.error(f.errors,await f.page.locator('body').innerText());throw e;}finally{await f.page.close();}}
try{
 await test('new manual case → real modal → confirmation → operational card, preserving composer',async page=>{
  await page.locator('#inboxBody').fill('Bozza non inviata');await page.getByRole('button',{name:'Prendi in carico',exact:true}).click();
  await page.waitForSelector('#sgPractice');await fill(page);await page.locator('[data-sg-submit]').click();
  await page.waitForSelector('#sgFollowModal',{state:'detached'});await page.waitForFunction(()=>document.querySelector('[aria-label="Seguito operativo"]').textContent.includes('Confermato'));
  assert.equal(tasks().length,1);assert.equal(tasks()[0].followUp.confirmed,true);assert.equal(tasks()[0].followUp.waitingLabel,'Valentino');
  const card=await page.locator('[aria-label="Seguito operativo"]').innerText();assert.match(card,/Verificare il documento della casa/);assert.match(card,/Valentino/);assert.match(card,/Ricontrollo:/);assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza non inviata');
  await page.getByRole('button',{name:'Apri seguito',exact:true}).click();await page.waitForSelector('#sgPractice');assert.equal(tasks().length,1);assert.equal(await page.locator('#sgAction').inputValue(),'Verificare il documento della casa');
 });
 await test('existing case reused; new persisted source rejects old modal confirmation',async page=>{
  const created=await call({body:{op:'start',conversationId:CID,messageId:'m1'}});assert.equal(created.code,200);
  await page.getByRole('button',{name:'Prendi in carico',exact:true}).click();await page.waitForSelector('#sgPractice');await fill(page);addInbound();
  await page.locator('[data-sg-submit]').click();await page.waitForFunction(()=>document.querySelector('#sgFollowModal')?.textContent.includes('nuovo messaggio'));
  assert.equal(tasks().length,1);assert.equal(tasks()[0].followUp.lastMessageId,'m2');assert.equal(tasks()[0].followUp.confirmed,false);
  await fill(page);await page.locator('[data-sg-submit]').click();await page.waitForSelector('#sgFollowModal',{state:'detached'});assert.equal(tasks()[0].followUp.confirmed,true);
 });
 await test('multiple cases are explicit; closed cases are never reopened',async page=>{
  const {task}=await call({body:{op:'start',conversationId:CID,messageId:'m1'}});const extra=structuredClone(task);delete extra.id;put('operatorTasks/sg_'+'c'.repeat(32),extra);
  const before=writes.length;await page.getByRole('button',{name:'Prendi in carico',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-inbox-follow-up]').length===2);
  assert.equal(await page.locator('#sgFollowModal').count(),0);assert.equal(writes.length,before);assert.equal(await page.getByRole('button',{name:'Apri seguito',exact:true}).count(),2);
  await page.getByRole('button',{name:'Apri seguito',exact:true}).first().click();await page.waitForSelector('#sgPractice');await page.getByRole('button',{name:'Annulla',exact:true}).click();
  DB.delete('operatorTasks/sg_'+'c'.repeat(32));put('operatorTasks/'+task.id,{...DB.get('operatorTasks/'+task.id),status:'done',doneAt:new Date().toISOString(),followUp:{...task.followUp,open:false,outcome:'Verificato'}});
  await page.getByRole('button',{name:'Aggiorna seguiti',exact:true}).click();await page.getByRole('button',{name:'Leggi esito',exact:true}).click();await page.getByText('Questo seguito è già chiuso.',{exact:true}).waitFor();assert.equal(await page.locator('[data-sg-submit]').count(),0);assert.equal(tasks()[0].status,'done');
  await page.getByRole('button',{name:'Annulla',exact:true}).click();
  await page.waitForFunction(()=>!_inboxState.followUps.rows[_inboxState.convId].busy);
  addInbound('m2',Date.now());await page.getByRole('button',{name:'Prendi in carico',exact:true}).click();await page.waitForSelector('#sgPractice');
  assert.equal(tasks().length,2);assert.equal(tasks().filter(t=>t.status==='done').length,1);assert.equal(tasks().find(t=>t.status==='open').followUp.lastMessageId,'m2');
  await page.getByRole('button',{name:'Annulla',exact:true}).click();await page.getByRole('button',{name:'Aggiorna seguiti',exact:true}).click();assert.equal(tasks().length,2);
 });
 assert(requests.every(x=>/^(firestore|identitytoolkit)\.googleapis\.com/.test(x)));assert.deepEqual(DB.get('settings/segretaria'),{enabled:true,prepareCases:false,automaticReplies:false});
}finally{await browser.close();}
console.log(checks+' real Inbox intake browser scenarios passed');
