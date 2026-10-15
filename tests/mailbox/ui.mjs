// Actual Home/search/adapters + mailbox module. Only HTTP and leaf navigation IO
// are synthetic; no mailbox controller, session predicate or email matcher stub.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {html as home} from '../oggi/home-harness.mjs';
import {loadChromium,launchOptions} from '../_browser.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const productionHtml=read('portal.html'),app=read('js/portal-app.js');
assert(productionHtml.includes('/js/portal-mailbox.js')&&productionHtml.includes('/css/portal-mailbox.css'),'Production loads both assets');
assert(app.slice(app.indexOf('function portalSessionReset()'),app.indexOf('function portalSourceStatus(')).includes('window.BOOM_MAILBOX?.reset()'),'Session reset clears mailbox');
assert(app.slice(app.indexOf('auth.onAuthStateChanged(async u =>'),app.indexOf('function loadData(')).includes('window.BOOM_MAILBOX?.reset()'),'New auth generation clears mailbox');
const html=home.replace('</head>',()=>'<style>'+read('css/portal-mobile.css')+read('css/portal-desktop.css')+'</style></head>').replace('</body>',()=>String.raw`<aside id="sidebar" hidden></aside><script>${read('js/portal-mobile.js')}</script><script>
window.mailboxIO={calls:[],plans:[],pending:[],jsonPending:[]};
window.mailboxSource={account:'office@example.invalid',folder:'[Gmail]/All Mail',coverage:'all-mail'};
window.mailItem=(id='first',subject='Contratto Casa Aurora')=>({messageRef:id,from:[{name:'Maria Rossi',address:'maria@example.invalid'}],to:[{name:'BOOM',address:'office@example.invalid'}],subject,at:'2026-10-15T09:35:00Z',size:4000,hasAttachments:true});
window.mailResponse=body=>body.action==='read'?{ok:true,source:mailboxSource,checkedAt:'2026-10-15T10:00:00Z',message:{...mailItem(body.messageRef),text:'Buongiorno Valentino,\n\nla documentazione per Casa Aurora è pronta. Possiamo confermare la consegna delle chiavi?\n\nGrazie,\nMaria',truncated:false,bodyUnavailable:false}}:{ok:true,source:mailboxSource,checkedAt:'2026-10-15T10:00:00Z',items:[mailItem()],nextCursor:null,incomplete:false};
const originalFetch=window.fetch;
window.fetch=async function(url,options){
 if(!String(url).startsWith('/api/mailbox/query'))return originalFetch(url,options);
 const body=JSON.parse(options.body),plan=mailboxIO.plans.shift()||{};
 mailboxIO.calls.push({url,method:options.method,body,headers:options.headers,cache:options.cache});
 if(plan.hold)await new Promise(resolve=>mailboxIO.pending.push(resolve));
 const data=plan.data||mailResponse(body),status=plan.status||200;
 return {ok:status>=200&&status<300,status,async json(){if(plan.holdJson)await new Promise(resolve=>mailboxIO.jsonPending.push(resolve));return data}};
};
S.users.push({id:'exact-user',name:'Maria Rossi',email:' MARIA@example.invalid ',role:'tenant'}, {id:'wrong-user',name:'Maria Rossi',email:'other@example.invalid',role:'tenant'}, {id:'substring-user',name:'Altra Maria',email:'notmaria@example.invalid',role:'tenant'});
S.clients.push({id:'exact-client',name:'Maria CRM',email:'maria@example.invalid'});
window.mailboxReady=true;
</script></body>`);
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)}else{res.statusCode=404;res.end()}});
await new Promise(resolve=>server.listen(process.argv.includes('--serve')?Number(process.env.PORT||8935):0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log('Mailbox preview with synthetic IO: '+base);await new Promise(()=>{});}
const artifacts=await mkdtemp(join(tmpdir(),'boom-mailbox-ui-'));let browser,checks=0;
try{
 const chromium=await loadChromium();assert(chromium,'Browser required');browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [375,390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(6000);
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(external.push(r.request().url()),r.abort()));
  const fresh=async()=>{await page.goto(base);await page.waitForFunction(()=>window.mailboxReady&&oggiSegretaria.loaded).catch(error=>{throw Error(error.message+'; page errors: '+errors.join(' | '))})};
  const check=async(name,fn)=>{await fresh();await fn();assert.deepEqual(errors,[]);checks++;console.log('PASS '+width+' '+name)};
  const entry=()=>page.getByRole('button',{name:'Cerca nelle email ↗',exact:true});
  const open=async(query='Aurora')=>{await page.locator('#ogWorkQuery').fill(query);await entry().click();};
  const ready=()=>page.waitForFunction(()=>document.querySelector('.mb-result')&&!document.querySelector('.mb-status')?.textContent);
  await check('Home query explicit search once; generic opening and typing never fetch',async()=>{
   await open('');assert.equal(await page.evaluate(()=>mailboxIO.calls.length),0);
   await page.locator('#mailboxQuery').fill('Aurora');assert.equal(await page.evaluate(()=>mailboxIO.calls.length),0);
   await page.getByRole('button',{name:'Chiudi email'}).click();
   await open('Aurora');await ready();assert.equal(await page.evaluate(()=>mailboxIO.calls.length),1);
   assert.deepEqual(await page.evaluate(()=>mailboxIO.calls[0].body),{action:'search',query:'Aurora'});
   assert.equal(await page.evaluate(()=>mailboxIO.calls[0].cache),'no-store');
   assert.match(await page.locator('.mb-source').innerText(),/office@example.invalid.*Tutta la posta/s);
   assert.match(await page.locator('.mb-source').innerText(),/Spam e cestino esclusi/);
   await page.getByRole('button',{name:'Chiudi email'}).click();await entry().click();await ready();
   assert.equal(await page.evaluate(()=>mailboxIO.calls.length),1,'Reopening searched query does not search again');
   await page.locator('#mailboxQuery').fill('Diversa');assert.equal(await page.evaluate(()=>mailboxIO.calls.length),1);
   await page.getByRole('button',{name:'Cerca',exact:true}).click();await ready();
   assert.equal(await page.evaluate(()=>mailboxIO.calls.length),2);
   assert.match(await page.locator('.mb-list-caption').innerText(),/Diversa/);
  });
  await check('plain text reader, exact typed matches, return and reopen retain selection',async()=>{
   await open();await ready();await page.locator('.mb-result').click();await page.waitForSelector('.mb-message-text');
   assert.match(await page.locator('.mb-message-text').innerText(),/consegna delle chiavi/);
   await page.locator('.mb-records summary').click();
   assert.equal(await page.locator('[data-mb="record"]').count(),2,'Namesake and email substring never match');
   assert.deepEqual(await page.evaluate(()=>portalMailboxRecords(['maria@example.invalid']).map(r=>r.kind+':'+r.id)),['person:exact-user','client:exact-client']);
   const geometry=await page.locator('#portalMailbox').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth,rect:el.getBoundingClientRect().toJSON()}));
   assert(geometry.scroll<=geometry.width+1);assert(geometry.rect.width<=width+1);assert(geometry.rect.height<=844);
   assert(await page.getByRole('button',{name:'Chiudi email'}).isVisible());
   await page.screenshot({path:join(artifacts,'reader-'+width+'.png')});
   await page.getByRole('button',{name:'Chiudi email'}).click();await entry().click();
   assert.match(await page.locator('.mb-message-text').innerText(),/consegna delle chiavi/);
   assert.equal(await page.evaluate(()=>mailboxIO.calls.length),2);
   await page.locator('.mb-records summary').click();
   await page.locator('[data-mb="record"]').first().click();
   assert.equal(await page.locator('#portalMailbox').count(),0);
   assert.deepEqual(await page.evaluate(()=>testIO.actions.at(-1)),['viewUser','exact-user']);
   await entry().click();assert(await page.locator('.mb-message-text').isVisible());
   if(width<680){await page.locator('[data-mb="back"]').click();assert(await page.locator('.mb-result').isVisible());assert.equal(await page.locator('.mb-reader').isVisible(),false)}
   assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);
   assert.deepEqual(external,[]);
  });
  await check('pagination keeps literal query and cumulative incomplete coverage',async()=>{
   await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'search'}),items:Array.from({length:20},(_,i)=>mailItem('p'+i,'Messaggio '+i)),nextCursor:'page-two',incomplete:true}}));
   await open('from:Maria');await ready();assert.equal(await page.locator('.mb-result').count(),20);
   await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'search'}),items:[mailItem('page-last')],incomplete:false}}));
   await page.locator('[data-mb="more"]').click();await page.waitForFunction(()=>document.querySelectorAll('.mb-result').length===21);
   assert.deepEqual(await page.evaluate(()=>mailboxIO.calls.at(-1).body),{action:'search',query:'from:Maria',cursor:'page-two'});
   assert.match(await page.locator('.mb-list').innerText(),/Ricerca parziale/);
   await page.locator('.mb-result').last().click();await page.waitForSelector('.mb-message-text');
   if(width<680){await page.locator('[data-mb="back"]').click();assert(await page.locator('.mb-list').evaluate(el=>el.scrollTop>0),'List scroll retained after reading');}
   await page.screenshot({path:join(artifacts,'results-'+width+'.png')});
  });
  await check('errors preserve prior results and remote HTML remains text',async()=>{
   await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'search'}),items:[mailItem('xss','<img src=x onerror=alert(1)>')],source:{...mailboxSource,coverage:'inbox-only',folder:'INBOX'}}}));
   await open();await ready();assert.match(await page.locator('.mb-source').innerText(),/Solo posta in arrivo/);assert.equal(await page.locator('#portalMailbox img').count(),0);
   await page.evaluate(()=>mailboxIO.plans.push({status:503,data:{ok:false,error:'mailbox_unavailable'}}));
   await page.locator('#mailboxQuery').fill('Non disponibile');await page.getByRole('button',{name:'Cerca',exact:true}).click();
   await page.waitForSelector('.mb-error');assert.equal(await page.locator('.mb-result').count(),1);assert.doesNotMatch(await page.locator('.mb-list').innerText(),/Nessun messaggio/);
   await page.evaluate(()=>mailboxIO.plans.push({data:{ok:true,source:{...mailboxSource,coverage:'inbox-only',folder:'INBOX'},message:{...mailItem('xss'),text:'<script>window.mailboxPwned=true</script>\nhttps://example.invalid',truncated:true,bodyUnavailable:false}}}));
   await page.locator('.mb-result').click();await page.waitForSelector('.mb-message-text');
   assert.match(await page.locator('.mb-message-text').innerText(),/<script>/);assert.equal(await page.locator('.mb-message-text a').count(),0);assert.equal(await page.evaluate(()=>window.mailboxPwned),undefined);assert.match(await page.locator('.mb-reader').innerText(),/Testo parziale/);
  });
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 const fresh=async()=>{await page.goto(base);await page.waitForFunction(()=>window.mailboxReady&&oggiSegretaria.loaded)};
 const check=async(name,fn)=>{await fresh();await fn();assert.deepEqual(errors,[]);checks++;console.log('PASS '+name)};
 const open=async(query='Aurora')=>{await page.locator('#ogWorkQuery').fill(query);await page.getByRole('button',{name:'Cerca nelle email ↗',exact:true}).click()};
 const ready=()=>page.waitForFunction(()=>document.querySelector('.mb-result')&&!document.querySelector('.mb-status')?.textContent);
 for(const phase of ['token','fetch','json'])await check('session switch during '+phase+' cannot display old-account content',async()=>{
  await page.evaluate(phase=>{if(phase==='token')auth.currentUser.getIdToken=()=>new Promise(resolve=>window.releaseMailboxToken=resolve);else mailboxIO.plans.push(phase==='json'?{holdJson:true}:{hold:true})},phase);
  await open();await page.waitForFunction(phase=>phase==='token'?!!window.releaseMailboxToken:phase==='json'?mailboxIO.jsonPending.length===1:mailboxIO.pending.length===1,phase);
  await page.evaluate(phase=>{portalSessionGeneration++;BOOM_MAILBOX.reset();auth.currentUser={uid:'demo-admin',getIdToken:async()=> 'new-token'};if(phase==='token')releaseMailboxToken('old-token');else if(phase==='json')mailboxIO.jsonPending.shift()();else mailboxIO.pending.shift()()},phase);
  assert.equal(await page.locator('#portalMailbox').count(),0);
  assert.equal(await page.evaluate(()=>mailboxIO.calls.length),phase==='token'?0:1);
  await page.evaluate(()=>BOOM_MAILBOX.open(''));
  assert.equal(await page.locator('.mb-result').count(),0);assert.equal(await page.locator('.mb-message-text').count(),0);
 });
 await check('close cancels response; reopening does not revive pending content',async()=>{
  await page.evaluate(()=>mailboxIO.plans.push({hold:true}));await open();await page.waitForFunction(()=>mailboxIO.pending.length===1);
  await page.getByRole('button',{name:'Chiudi email'}).click();await page.evaluate(()=>BOOM_MAILBOX.open());
  await page.evaluate(()=>mailboxIO.pending.shift()());assert.equal(await page.locator('.mb-result').count(),0);
  await page.getByRole('button',{name:'Cerca',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>mailboxIO.calls.length),2);
 });
 await check('deadline releases a pending token and its late completion never fetches',async()=>{
  await page.clock.install();
  await page.evaluate(()=>{auth.currentUser.getIdToken=()=>new Promise(resolve=>window.releaseMailboxToken=resolve)});await open();await page.waitForFunction(()=>!!window.releaseMailboxToken);
  await page.clock.fastForward(65001);await page.waitForSelector('.mb-error');assert.match(await page.locator('.mb-error').innerText(),/non ha risposto in tempo/);assert(await page.getByRole('button',{name:'Cerca',exact:true}).isEnabled());
  await page.evaluate(()=>releaseMailboxToken('late-token'));assert.equal(await page.evaluate(()=>mailboxIO.calls.length),0);
  await page.clock.resume();
 });
 await check('latest query wins delayed search and double command is single-flight',async()=>{
  await page.evaluate(()=>mailboxIO.plans.push({hold:true,data:{...mailResponse({action:'search'}),items:[mailItem('old','Vecchia query')]}}));await open('Vecchia');await page.waitForFunction(()=>mailboxIO.pending.length===1);
  await page.evaluate(()=>portalOpenMailbox('Vecchia'));assert.equal(await page.evaluate(()=>mailboxIO.calls.length),1);
  await page.locator('#mailboxQuery').fill('Corrente');await page.locator('.mb-search').evaluate(form=>form.requestSubmit());await ready();
  await page.evaluate(()=>mailboxIO.pending.shift()());assert.match(await page.locator('.mb-list-caption').innerText(),/Corrente/);assert.doesNotMatch(await page.locator('.mb-list').innerText(),/Vecchia query/);
 });
 await check('late read cannot restore previous selection or old query',async()=>{
  await open();await ready();await page.evaluate(()=>mailboxIO.plans.push({hold:true}));await page.locator('.mb-result').click();await page.waitForFunction(()=>mailboxIO.pending.length===1);
  await page.locator('#mailboxQuery').fill('Nuova query');await page.getByRole('button',{name:'Cerca',exact:true}).click();await ready();await page.evaluate(()=>mailboxIO.pending.shift()());
  assert.equal(await page.locator('.mb-message-text').count(),0);assert.match(await page.locator('.mb-list-caption').innerText(),/Nuova query/);
 });
 await check('invalid length and controls never reach HTTP; non-admin cannot open',async()=>{
  await open('ab');assert.equal(await page.evaluate(()=>mailboxIO.calls.length),0);
  await page.getByRole('button',{name:'Cerca',exact:true}).click();assert.match(await page.locator('.mb-error').innerText(),/3 a 160/);
  await page.evaluate(()=>{BOOM_MAILBOX.open('x'.repeat(161));document.querySelector('.mb-search').requestSubmit()});assert.equal(await page.evaluate(()=>mailboxIO.calls.length),0);
  await page.evaluate(()=>{BOOM_MAILBOX.reset();S.profile.role='landlord';portalOpenMailbox('Aurora')});assert.equal(await page.locator('#portalMailbox').count(),0);assert.equal(await page.evaluate(()=>mailboxIO.calls.length),0);
 });
 for(const code of ['invalid_reference','mailbox_changed','mailbox_unconfigured','mailbox_timeout','admin_required','invalid_or_expired_token','message_not_found'])await check('truthful API error '+code,async()=>{
  await page.evaluate(code=>mailboxIO.plans.push({status:code==='admin_required'?403:code==='invalid_or_expired_token'?401:503,data:{ok:false,error:code}}),code);await open();await page.waitForSelector('.mb-error');
  assert.equal(await page.locator('.mb-result').count(),0);assert.doesNotMatch(await page.locator('#portalMailbox').innerText(),/Nessun messaggio trovato/);
 });
 await check('malformed/oversize pages and body do not render as successful data',async()=>{
  await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'search'}),items:Array.from({length:21},(_,i)=>mailItem('over-'+i))}}));await open();await page.waitForSelector('.mb-error');assert.equal(await page.locator('.mb-result').count(),0);
  await page.getByRole('button',{name:'Cerca',exact:true}).click();await ready();
  await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'read',messageRef:'first'}),message:{...mailResponse({action:'read',messageRef:'first'}).message,text:'x'.repeat(262145)}}}));await page.locator('.mb-result').click();await page.waitForSelector('.mb-error');assert.equal(await page.locator('.mb-message-text').count(),0);
 });
 for(const code of ['admin_required','invalid_or_expired_token'])await check('server revocation clears all content while local admin profile remains unchanged: '+code,async()=>{
  await open();await ready();await page.locator('.mb-result').click();await page.waitForSelector('.mb-message-text');
  await page.evaluate(code=>mailboxIO.plans.push({status:code==='admin_required'?403:401,data:{ok:false,error:code}}),code);
  await page.getByRole('button',{name:'Cerca',exact:true}).click();await page.waitForSelector('.mb-error');
  assert.equal(await page.evaluate(()=>S.profile.role),'admin');
  assert.equal(await page.locator('.mb-result').count(),0);assert.equal(await page.locator('.mb-message-text').count(),0);assert.equal(await page.locator('[data-mb="record"]').count(),0);
  assert.doesNotMatch(await page.locator('#portalMailbox').innerText(),/office@example.invalid|Maria Rossi|Casa Aurora/);assert.equal(await page.locator('#mailboxQuery').inputValue(),'');
  await page.getByRole('button',{name:'Chiudi email'}).click();await page.getByRole('button',{name:'Cerca nelle email ↗',exact:true}).click();
  assert.equal(await page.locator('.mb-result').count(),0);assert.equal(await page.locator('.mb-message-text').count(),0);assert(await page.getByRole('button',{name:'Cerca',exact:true}).isDisabled());assert.equal(await page.evaluate(()=>mailboxIO.calls.length),3);
 });
 await check('body unavailable and source mismatch remain explicit; no implicit import',async()=>{
  await open();await ready();await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'read',messageRef:'first'}),message:{...mailResponse({action:'read',messageRef:'first'}).message,text:'',bodyUnavailable:true}}}));await page.locator('.mb-result').click();await page.waitForFunction(()=>document.querySelector('.mb-reader').textContent.includes('Il testo non è disponibile'));
  await page.locator('[data-mb="back"]').click();await page.evaluate(()=>mailboxIO.plans.push({data:{...mailResponse({action:'read',messageRef:'first'}),source:{...mailboxSource,account:'different@example.invalid'}}}));await page.locator('.mb-result').click();await page.waitForSelector('.mb-error');assert.equal(await page.locator('.mb-result').count(),0);
  assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);assert((await page.evaluate(()=>mailboxIO.calls)).every(call=>['search','read'].includes(call.body.action)));
 });
 await page.close();console.log('Mailbox UI: '+checks+' checks passed. Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
