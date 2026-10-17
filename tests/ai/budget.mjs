import assert from 'node:assert/strict';
import {register} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
register('./budget-loader.mjs',import.meta.url,{data:{mutation:process.env.AI_BUDGET_MUTATION}});
Object.assign(process.env,{ANTHROPIC_API_KEY:'synthetic',FIREBASE_API_KEY:'synthetic',FIREBASE_ADMIN_EMAIL:'synthetic@example.invalid',FIREBASE_ADMIN_PASS:'synthetic',CRON_SECRET:'synthetic-cron'});
const {budgetIO}=await import('./budget-io.mjs');
const {ai,anthropicFetch,forgetAiSettings}=await import('../../api/_ai.js');
const {reserveBudget,settleBudget,budgetSnapshot}=await import('../../api/_ai-budget.js');
const {default:handler}=await import('../../api/ai/status.js');
const {default:REG}=await import('../../js/ai-registry.js');
let io;
function setup(budget={enabled:true,dailyUsd:0.1},extra={}){io=budgetIO();globalThis.fetch=io.fetch;io.db.set('users/admin',{role:'admin'});if(budget!==null)io.db.set('settings/ai',{budget,...extra});forgetAiSettings();}
const call=opts=>ai({purpose:'leads.brain',user:'Synthetic private text',maxTokens:100,...opts});
const led=()=>[...io.db].find(([p])=>p.startsWith('aiUsage/'))?.[1].budgetV1;
const reject=async(p,code)=>assert.rejects(p,e=>e.code===code);
const drive=async(body,auth='admin-token',method='POST')=>{const res={status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await handler({method,query:{probe:'0'},headers:{authorization:'Bearer '+auth},body},res);return res;};
const tests={
 async disabled(){setup(null);await call();assert.equal(io.count.length,0);assert.equal(io.paid.length,1);assert.equal(led(),undefined);setup({enabled:false,dailyUsd:null});await call();assert.equal(io.count.length,0);},
 async settings(){setup();io.settingsFail=true;await reject(call(),'ai_budget_settings_unavailable');assert.equal(io.paid.length,0);const snap=await budgetSnapshot();assert.equal(snap.state,'unavailable');assert.equal(snap.remainingUsd,undefined);},
 async invalid(){for(const budget of [{enabled:true},{enabled:'yes',dailyUsd:1},{enabled:true,dailyUsd:-1},{enabled:true,dailyUsd:'1'}]){setup(budget);await reject(call(),'ai_budget_settings_invalid');assert.equal(io.paid.length,0);}setup();await reject(call({model:'unknown'}),'ai_budget_price_unknown');assert.equal(io.count.length,0);},
 async cachedSettings(){setup({enabled:false,dailyUsd:null});await call();io.db.get('settings/ai').budget={enabled:true,dailyUsd:0.00001};await reject(call(),'ai_budget_exceeded');assert.equal(io.paid.length,1);io.settingsFail=true;await reject(call(),'ai_budget_settings_unavailable');assert.equal(io.paid.length,1);},
 async ledger(){setup();const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date());io.db.set('aiUsage/'+day,{budgetV1:{baselineMicros:0,unreservedAtStart:0,settledMicros:0,heldMicros:0,attempts:Object.fromEntries(Array.from({length:2048},(_,i)=>[String(i),{state:'settled',micros:0}]))}});await reject(call(),'ai_budget_ledger_capacity');assert.equal(io.paid.length,0);io.db.get('aiUsage/'+day).budgetV1.heldMicros=1;await reject(call(),'ai_budget_ledger_invalid');assert.equal(io.paid.length,0);},
 async count(){setup();io.countFail=true;await reject(call(),'ai_budget_count_unavailable');assert.equal(io.paid.length,0);assert.equal(led(),undefined);},
 async reserve(){setup();io.reserveFail=true;await reject(call(),'ai_budget_reservation_unavailable');assert.equal(io.paid.length,0);},
 async concurrent(){setup({enabled:true,dailyUsd:0.0015});io.db.set('aiUsage/'+new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date()),{p:{}});let release;io.hold=new Promise(r=>release=r);const pending=Array.from({length:4},()=>call().then(()=>null,e=>e.code));await new Promise(r=>setTimeout(r,40));assert.equal(io.paid.length,1);release();const result=await Promise.all(pending);assert.equal(result.filter(r=>r==='ai_budget_exceeded').length,3);assert.equal(led().heldMicros,0);assert.equal(led().settledMicros,200);},
 async settlement(){setup();await call();assert.equal(led().heldMicros,0);assert.equal(led().settledMicros,200);assert.equal(JSON.stringify(led()).includes('Synthetic private text'),false);const r=await reserveBudget({model:REG.purposeOf('leads.brain').cloudModel,inputTokens:100,maxTokens:100});await settleBudget(r,{model:r.model,usage:{input_tokens:100,output_tokens:20}});await settleBudget(r,{model:r.model,usage:{input_tokens:100,output_tokens:20}});assert.equal(led().settledMicros,400);},
 async timeout(){setup({enabled:true,dailyUsd:0.0015});io.cloudFail=true;await reject(call(),'cloud_timeout');const held=led().heldMicros;assert(held>0);await reject(call(),'ai_budget_exceeded');assert.equal(io.paid.length,1);assert.equal((await budgetSnapshot()).heldUsd,held/1e6);},
 async unknownUsage(){for(const flag of ['unknownUsage','unknownModel','settleFail']){setup();io[flag]=true;await call();assert(led().heldMicros>0);assert.equal(led().settledMicros,0);}},
 async repricing(){setup();io.hook=ws=>{if(ws.length===2)io.db.get('settings/ai').budget.dailyUsd=0.00001;};await reject(call(),'ai_budget_exceeded');assert.equal(io.paid.length,0);},
 async fallbackShadow(){for(const mode of ['local','shadow']){setup({enabled:true,dailyUsd:0.00001},{local:{enabled:true,url:'https://local.test',model:'synthetic',fallback:true},purposes:{'leads.brain':{mode}}});io.localFail=mode==='local';await reject(call(),'ai_budget_exceeded');assert.equal(io.paid.length,0);assert.equal(io.count.length,1);assert.equal(io.local.length,1);}},
 async local(){setup({enabled:true,dailyUsd:0.1},{local:{enabled:true,url:'https://local.test',model:'synthetic'},purposes:{'leads.brain':{mode:'local'}}});assert.equal((await call()).backend,'local');io.settingsFail=true;assert.equal((await call()).backend,'local');assert.equal(io.paid.length,0);},
 async options(){setup();for(const extra of [{fallbacks:'default'},{stream:true},{speed:'fast'},{tools:[{type:'web_search_20250305',name:'web_search'}]}]){await reject(anthropicFetch({model:REG.purposeOf('leads.brain').cloudModel,max_tokens:100,messages:[{role:'user',content:'test'}],...extra}),'ai_budget_request_unpriceable');}assert.equal(io.paid.length,0);},
 async day(){setup();const r=await reserveBudget({model:REG.purposeOf('leads.brain').cloudModel,inputTokens:100,maxTokens:100,now:Date.parse('2026-10-14T22:30:00Z')});assert.equal(r.day,'2026-10-15');await settleBudget(r,{model:r.model,usage:{input_tokens:100,output_tokens:20}});assert.equal(io.db.get('aiUsage/2026-10-15').budgetV1.settledMicros,200);},
 async existingSpend(){setup({enabled:true,dailyUsd:0.0015});const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date());io.db.set('aiUsage/'+day,{p:{leads_brain:{cloud:{ok:1,usd:0.001}}}});await reject(call(),'ai_budget_exceeded');assert.equal(io.paid.length,0);},
 async admin(){setup(null);assert.equal((await drive({budget:{enabled:true}})).code,400);assert.equal((await drive({budget:{enabled:true,dailyUsd:1}},'synthetic-cron')).code,403);assert(!io.db.has('settings/ai'));assert.equal((await drive({budget:{enabled:true,dailyUsd:1}})).code,200);assert.equal(io.db.get('settings/ai').budget.enabled,true);assert.equal((await drive({local:{enabled:false}})).code,200);assert.equal(io.db.get('settings/ai').budget.dailyUsd,1);const r=await drive(null,'admin-token','GET');assert.equal(r.body.budget.enabled,true);assert.equal(r.body.budget.estimated,true);io.settingsFail=true;assert.equal((await drive({budget:{enabled:false}})).code,500);assert.equal(io.db.get('settings/ai').budget.enabled,true);},
 async adminRace(){setup();io.hook=()=>{io.db.get('settings/ai').budget.dailyUsd=0.2;};assert.equal((await drive({local:{enabled:false}})).code,500);assert.equal(io.db.get('settings/ai').budget.dailyUsd,0.2);assert.equal(io.db.get('settings/ai').budget.enabled,true);},
 async roles(){for(const role of ['owner','landlord']){setup(null);io.db.get('users/admin').role=role;assert.equal((await drive({budget:{enabled:true,dailyUsd:1}})).code,403);assert.equal((await drive(null,'admin-token','GET')).code,403);assert(!io.db.has('settings/ai'));}},
 async freshness(){setup();io.usageFail=true;const r=await drive(null,'admin-token','GET');assert.equal(r.body.usage.todayAvailable,false);assert.equal(r.body.usage.monthAvailable,false);assert.equal(r.body.budget.state,'unavailable');},
 async deadline(){setup();io.countWait=()=>new Promise(r=>setTimeout(r,25));await reject(call({timeoutMs:10}),'ai_budget_time_exhausted');assert.equal(io.paid.length,0);assert.equal(led(),undefined);setup();const base=globalThis.fetch;globalThis.fetch=async(url,opts={})=>{const response=await base(url,opts);if(String(url).endsWith(':commit')&&JSON.parse(opts.body).writes.length===2)await new Promise(r=>setTimeout(r,25));return response;};await reject(call({timeoutMs:10}),'ai_budget_time_exhausted');assert.equal(io.paid.length,0);assert(led().heldMicros>0);},
 async suspendedIO(){
  const body={model:REG.purposeOf('leads.brain').cloudModel,max_tokens:100,messages:[{role:'user',content:'Synthetic'}]};
  for(const mode of ['settings','reserveSettings','reserveRead','reserveCommit','settleRead','settleCommit']) {
   setup();const base=globalThis.fetch;let settings=0,reads=0,settleWrites=0;
   globalThis.fetch=async(url,opts={})=>{
    const u=String(url),get=!opts.method||opts.method==='GET';
    if(get&&u.endsWith('/settings/ai')) {settings++;if(mode==='settings'||mode==='reserveSettings'&&settings===2)return new Promise(()=>{});}
    if(get&&u.includes('/aiUsage/')) {reads++;if(mode==='reserveRead'||mode==='settleRead'&&reads===2)return new Promise(()=>{});}
    if(u.endsWith(':commit')) {const ws=JSON.parse(opts.body).writes;
     if(mode==='reserveCommit'&&ws.length===2){await base(url,opts);return new Promise(()=>{});}
     if(ws.length===1&&ws[0].update?.fields?.budgetV1){settleWrites++;if(mode==='settleCommit')return new Promise(()=>{});}
    }
    return base(url,opts);
   };
   let timer;const result=await Promise.race([anthropicFetch(body,{timeoutMs:25}).then(response=>({response}),error=>({error})),new Promise(r=>{timer=setTimeout(()=>r({pending:true}),150);})]);clearTimeout(timer);
   assert(!result.pending,mode+' must stop within its deadline');
   if(mode.startsWith('settle')) {assert.equal(result.response.status,200);assert.equal(io.paid.length,1);assert(led().heldMicros>0);assert.equal(led().settledMicros,0);if(mode==='settleRead')assert.equal(settleWrites,0);}
   else {assert.equal(result.error?.code,'ai_budget_time_exhausted',mode);assert.equal(io.paid.length,0);if(mode==='reserveCommit')assert(led().heldMicros>0);}
  }
 },
 async reenable(){setup({enabled:true,dailyUsd:0.0031});await call();io.db.get('settings/ai').budget.enabled=false;for(let i=0;i<10;i++)await call();assert.equal(io.db.get([...io.db.keys()].find(p=>p.startsWith('aiUsage/'))).budgetUnreservedMicros,2000);io.db.get('settings/ai').budget.enabled=true;const base=globalThis.fetch;globalThis.fetch=(url,opts={})=>String(url).endsWith(':commit')&&JSON.parse(opts.body).writes.some(w=>w.updateTransforms)?Promise.resolve(new Response('{}',{status:503})):base(url,opts);let blocked=0;for(let i=0;i<6;i++)try{await call();}catch(e){assert.equal(e.code,'ai_budget_exceeded');blocked++;}assert.equal(blocked,5);assert.equal(io.paid.length,12);assert.equal((await budgetSnapshot()).accountedUsd,0.0024);},
 async lateTelemetry(){for(const covered of [false,true]){setup({enabled:covered,dailyUsd:0.01});const base=globalThis.fetch;let release,started;const begun=new Promise(r=>started=r);let first=true;globalThis.fetch=async(url,opts={})=>{if(first&&String(url).endsWith(':commit')&&JSON.parse(opts.body).writes.some(w=>w.updateTransforms)){first=false;started();await new Promise(r=>release=r);}return base(url,opts);};const pending=call();await begun;io.db.get('settings/ai').budget.enabled=true;await call();assert.equal((await budgetSnapshot()).accountedUsd,covered?0.0004:0.0002);release();await pending;assert.equal((await budgetSnapshot()).accountedUsd,0.0004);assert.equal(io.db.get([...io.db.keys()].find(p=>p.startsWith('aiUsage/'))).budgetUnreservedMicros||0,covered?0:200);}},
 async bypass(){setup({enabled:true,dailyUsd:0.00001});const {default:parse}=await import('../../api/parse-docs.js');const res={setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await parse({method:'POST',headers:{authorization:'Bearer admin-token'},body:{messages:[{role:'user',content:'Synthetic document'}]}},res);assert.equal(res.body.error,'ai_budget_exceeded');assert.equal(io.paid.length,0);setup();const {ingestRead}=await import('../../api/portal/ingest.js');const r=await ingestRead({text:'Synthetic document'});assert.equal(r.error,'ai_budget_request_unpriceable');assert.equal(io.paid.length,0);},
};
if(process.env.AI_BUDGET_MUTATION){await tests[process.env.AI_BUDGET_MUTATION]();process.exit(0);}
for(const [name,test]of Object.entries(tests)){await test();console.log('PASS '+name);}
for(const mutation of ['concurrent','timeout','settings','repricing','reenable']){const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,AI_BUDGET_MUTATION:mutation},encoding:'utf8',timeout:15000});assert.equal(child.status,1,mutation+' must fail: '+child.stderr);assert.match(child.stderr,/AssertionError/);console.log('PASS mutation '+mutation);}
console.log(Object.keys(tests).length+' budget scenarios +5 mutations; no real provider calls');
