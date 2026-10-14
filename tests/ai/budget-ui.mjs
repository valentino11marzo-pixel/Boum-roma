// Production Squadra entry/modal + actual status handler; only network IO synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadChromium,launchOptions} from '../_browser.mjs';
Object.assign(process.env,{FIREBASE_API_KEY:'synthetic',FIREBASE_ADMIN_EMAIL:'synthetic@example.invalid',FIREBASE_ADMIN_PASS:'synthetic',CRON_SECRET:'synthetic-cron'});
const {budgetIO}=await import('./budget-io.mjs');
const {forgetAiSettings}=await import('../../api/_ai.js');
const {default:handler}=await import('../../api/ai/status.js');
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8'),source=read('js/portal-app.js');
const between=(a,b)=>{const x=source.indexOf(a),y=source.indexOf(b,x+1);assert(x>=0&&y>x,a);return source.slice(x,y)};
function fn(name){const m=new RegExp('^    (?:async )?function '+name+'\\(','m').exec(source);assert(m,name);const next=source.slice(m.index+5).search(/^    (?:async )?function /m);return source.slice(m.index,m.index+5+next)}
const code=between('    // Costs are observed estimates','    function squadraPage(')+fn('squadraPage')+between('    function portalSessionProof(','    function portalSessionReset(');
const html=`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${read('css/portal.css')+read('css/portal-finish.css')+read('css/portal-mobile.css')}</style><body><main id="main" class="main"></main><div id="modals"></div><script>${read('js/squadra-registry.js')}</script><script>
const S={profile:{id:'admin',role:'admin'},page:'squadra'};const auth={currentUser:{uid:'admin',getIdToken:async()=> 'admin-token'}};var portalSessionGeneration=0;
const isAdmin=()=>S.profile?.role==='admin';const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
${code}
document.getElementById('main').innerHTML=squadraPage();window.testReady=true;
</script><script>${read('js/portal-mobile.js')}</script></body></html>`;
let io,requests=[];const DAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date());
function reset(){io=budgetIO();io.db.set('users/admin',{role:'admin'});io.db.set('aiUsage/'+DAY,{day:DAY,p:{leads_brain:{cloud:{calls:2,ok:2,usd:0.125}}}});requests=[];forgetAiSettings();globalThis.fetch=async(url,options={})=>{const u=new URL(String(url)),body=options.body?JSON.parse(options.body):{};if(io.usageFail&&(u.pathname.includes('/aiUsage/')||body.structuredQuery?.from?.[0]?.collectionId==='aiUsage'))return new Response(JSON.stringify({error:{status:'UNAVAILABLE'}}),{status:503});return io.fetch(url,options);};}
reset();
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(u.pathname==='/api/ai/status'){
  let raw='';for await(const part of req)raw+=part;let body;try{body=raw?JSON.parse(raw):{};}catch{res.statusCode=400;res.end();return;}
  requests.push({method:req.method,body,query:Object.fromEntries(u.searchParams)});
  const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;},end(){return this;}};
  await handler({method:req.method,body,headers:req.headers,query:Object.fromEntries(u.searchParams)},response);
  res.statusCode=response.code||200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(response.data));return;
 }
 res.statusCode=404;res.end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let browser,checks=0;const artifacts=await mkdtemp(join(tmpdir(),'boom-ai-budget-ui-'));
try{
 browser=await(await loadChromium()).launch(launchOptions({headless:true}));
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(7000);const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(external.push(r.request().url()),r.abort()));
  const fresh=async()=>{reset();await page.goto(base);await page.waitForFunction(()=>window.testReady)};
  const open=async()=>{await page.getByRole('button',{name:'Costi AI',exact:true}).click();await page.waitForFunction(()=>S.aiCosts&&!S.aiCosts.loading)};
  const check=async(name,run)=>{await fresh();await run();checks++;console.log('PASS '+width+' '+name)};
  await check('actual Squadra entry reads estimates without writes or default cap',async()=>{
   assert.equal(requests.length,0);await open();assert.equal(requests.length,1);assert.equal(requests[0].query.probe,'0');assert.equal(io.writes.length,0);assert.equal(io.paid.length,0);assert.equal(io.local.length,0);
   assert.equal(await page.locator('#aiDailyUsd').inputValue(),'');assert.equal(await page.locator('#aiBudgetEnabled').isChecked(),false);assert.match(await page.locator('#aiCostsContent').innerText(),/0,125/);assert.match(await page.locator('#aiCostsContent').innerText(),/Codex\/chat.*ElevenLabs.*Telnyx.*TIM/);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.evaluate(()=>BOOM_MOBILE.active()),width<920);await page.screenshot({path:join(artifacts,'disabled-'+width+'.png')});
  });
  await check('explicit save uses chosen limit once and disabled remains an explicit choice',async()=>{
   await open();await page.locator('#aiBudgetEnabled').check();await page.locator('#aiDailyUsd').fill('0.75');
   await page.evaluate(()=>{window.originalToken=auth.currentUser.getIdToken;auth.currentUser.getIdToken=()=>new Promise(r=>window.releaseToken=r);void saveAICosts();void saveAICosts();});assert.equal(requests.filter(r=>r.method==='POST').length,0);
   await page.evaluate(()=>{auth.currentUser.getIdToken=originalToken;releaseToken('admin-token');});await page.waitForFunction(()=>!S.aiCosts.saving);
   assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(io.db.get('settings/ai').budget,{enabled:true,dailyUsd:0.75});assert.match(await page.locator('#aiCostsFeedback').innerText(),/Limite salvato/);assert.match(await page.locator('#aiCostsContent').innerText(),/Riservato, non fatturato/);
   await page.getByRole('button',{name:'Salva limite',exact:true}).scrollIntoViewIfNeeded();assert(await page.getByRole('button',{name:'Salva limite',exact:true}).isVisible());await page.screenshot({path:join(artifacts,'enabled-'+width+'.png')});await page.locator('#aiBudgetEnabled').uncheck();await page.getByRole('button',{name:'Salva limite',exact:true}).click();await page.waitForFunction(()=>!S.aiCosts.saving);assert.equal(io.db.get('settings/ai').budget.enabled,false);assert.deepEqual(requests.filter(r=>r.method==='POST').at(-1).body,{budget:{enabled:false}});assert.equal(io.paid.length,0);
  });
  await check('invalid local cap never posts and real API independently rejects invalid cap',async()=>{
   await open();await page.locator('#aiBudgetEnabled').check();await page.getByRole('button',{name:'Salva limite',exact:true}).click();assert.match(await page.locator('#aiCostsFeedback').innerText(),/importo giornaliero positivo/);
   await page.locator('#aiDailyUsd').fill('-2');await page.getByRole('button',{name:'Salva limite',exact:true}).click();assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.equal(io.writes.length,0);
   const status=await page.evaluate(async()=>{const r=await fetch('/api/ai/status?probe=0',{method:'POST',headers:{Authorization:'Bearer admin-token','Content-Type':'application/json'},body:JSON.stringify({budget:{enabled:true,dailyUsd:-2}})});return r.status});assert.equal(status,400);assert.equal(io.writes.length,0);
  });
  await check('failed and unpriced usage never become zero while settings stay explicit',async()=>{
   io.usageFail=true;await open();assert.equal(await page.locator('#aiCostsContent dd').filter({hasText:'Non disponibile'}).count(),2);assert.doesNotMatch(await page.locator('#aiCostsContent').innerText(),/0,00/);
   io.usageFail=false;io.db.set('aiUsage/'+DAY,{day:DAY,p:{leads_brain:{cloud:{calls:1,ok:1,unpriced:1}}}});await page.getByRole('button',{name:'Rileggi',exact:true}).click();await page.waitForFunction(()=>!S.aiCosts.loading);assert.equal(await page.locator('#aiCostsContent dd').filter({hasText:'Non disponibile'}).count(),2);assert.equal(io.writes.length,0);
  });
  await check('settings unavailable disables save and failed save preserves chosen cap',async()=>{
   io.settingsFail=true;await open();assert.equal(await page.getByRole('button',{name:'Salva limite',exact:true}).isDisabled(),true);assert.match(await page.locator('#aiCostsContent').innerText(),/Stato del limite non verificabile/);
   io.settingsFail=false;await page.getByRole('button',{name:'Rileggi',exact:true}).click();await page.waitForFunction(()=>!S.aiCosts.loading);await page.locator('#aiBudgetEnabled').check();await page.locator('#aiDailyUsd').fill('1.25');io.settingsFail=true;await page.getByRole('button',{name:'Salva limite',exact:true}).click();await page.waitForFunction(()=>!S.aiCosts.saving);assert.match(await page.locator('#aiCostsFeedback').innerText(),/Salvataggio non confermato/);assert.equal(await page.locator('#aiDailyUsd').inputValue(),'1.25');assert.equal(io.writes.length,0);
  });
  await check('session change before token resolves cancels settings POST',async()=>{
   await open();await page.locator('#aiBudgetEnabled').check();await page.locator('#aiDailyUsd').fill('1');const count=requests.length;
   await page.evaluate(()=>{auth.currentUser.getIdToken=()=>new Promise(r=>window.releaseToken=r);void saveAICosts();portalSessionGeneration++;});await page.evaluate(()=>releaseToken('admin-token'));await page.waitForFunction(()=>!S.aiCosts.saving);assert.equal(requests.length,count);assert.equal(io.writes.length,0);
  });
  await check('closing while response is pending never restores the modal or another identity data',async()=>{
   let arrived,release;const pending=new Promise(r=>arrived=r),held=new Promise(r=>release=r);
   await page.route('**/api/ai/status?probe=0',async route=>{const response=await route.fetch();arrived();await held;await route.fulfill({response})});await page.getByRole('button',{name:'Costi AI',exact:true}).click();await pending;
   await page.getByRole('button',{name:'Chiudi costi AI',exact:true}).click();await page.evaluate(()=>{portalSessionGeneration++;S.profile={id:'other',role:'admin'};auth.currentUser={uid:'other',getIdToken:async()=> 'other'}});release();await page.waitForTimeout(100);assert.equal(await page.locator('#aiCostsModal').count(),0);assert.equal(io.writes.length,0);await page.unroute('**/api/ai/status?probe=0');
  });
  await check('tenant cannot open control and owner cannot write through actual handler',async()=>{
   await page.evaluate(()=>{S.profile.role='tenant';openAICosts()});assert.equal(await page.locator('#aiCostsModal').count(),0);assert.equal(requests.length,0);
   io.db.set('users/admin',{role:'owner'});const status=await page.evaluate(async()=>{const r=await fetch('/api/ai/status?probe=0',{method:'POST',headers:{Authorization:'Bearer admin-token','Content-Type':'application/json'},body:JSON.stringify({budget:{enabled:true,dailyUsd:1}})});return r.status});assert.equal(status,403);assert.equal(io.writes.length,0);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
 }
 console.log(`AI budget UI: ${checks} passed. Screenshots: ${artifacts}`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
