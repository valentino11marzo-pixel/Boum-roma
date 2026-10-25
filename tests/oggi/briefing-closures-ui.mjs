// Real Oggi loader + desk: close/open races and coverage fail closed.
// Only Firestore and HTTP transport are synthetic in the shared harness.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const seed=`
S.contracts=[];S.maintenance=[];S.clients=[];S.viewingRequests=[];
testIO.followUps=[caseRow('a',{practiceRef:null,propertyRef:null,confirmed:false,needsReview:true})];
testIO.closedFollowUps=[];
S.conversations=['a','b'].map(letter=>({id:'conv-'+letter,status:'open',channel:letter==='a'?'email':'whatsapp',contactName:'Contatto demo '+letter,needsReply:true,lastDirection:'in',lastMessageAt:recentAt,lastMessagePreview:'Una richiesta sintetica da esaminare.'}));
window.closedFixture=()=>({...structuredClone(testIO.followUps[0]),status:'done',doneAt:new Date().toISOString(),preparation:{summary:'Private old analysis'},followUp:{...structuredClone(testIO.followUps[0].followUp),open:false}});
`;
const ioBoundary="const id=parsed.searchParams.get('id'),task=testIO.followUps.find(t=>t.id===id);";
assert(html.includes(ioBoundary));
let fixture=html.replace("goTo(location.hash.slice(1)||'oggi',true);",seed+"\ngoTo(location.hash.slice(1)||'oggi',true);")
 .replace(ioBoundary,ioBoundary+"\n if(!id&&testIO.failFollowUps)return response(503,{error:'unavailable'});")
 .replace("rows:testIO.followUps.filter(t=>t.status==='open'),monitoring:","rows:testIO.followUps.filter(t=>t.status==='open'),incomplete:!!testIO.openIncomplete,monitoring:");
const mutations={
 race:['for (const closed of closedRows) rows.delete(closed.id);','/* regression: stale open row survives close */'],
 coverage:['conversations: oggiSegretaria.closedComplete ? S.conversations || [] : []','conversations: S.conversations || []'],
 account:["if (generation !== oggiSegretaria.generation || auth.currentUser !== user || S.page !== 'oggi') return;","if (generation !== oggiSegretaria.generation || S.page !== 'oggi') return;"]
};
if(process.env.BOOM_CLOSURES_MUTATION){const m=mutations[process.env.BOOM_CLOSURES_MUTATION];assert(m&&fixture.includes(m[0]));fixture=fixture.replace(m[0],m[1]);}
const server=createServer((req,res)=>{
 if(req.url.startsWith('/mail-source-api')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,email:{configured:false},whatsapp:{bridgeFresh:false}}));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);
});
const chromium=await loadChromium();assert(chromium,'Browser required');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let browser,checks=0;
const check=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const load=async page=>{await page.goto(base);await page.waitForFunction(()=>oggiSegretaria.loaded&&!oggiSegretaria.loading);};
const ids=page=>page.locator('#ogDeskPanel [data-desk-item]').evaluateAll(nodes=>nodes.map(n=>n.dataset.deskItem));
try{
 browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(5000);
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{requests.push({url:r.request().url(),method:r.request().method()});return r.request().url().startsWith(base)?r.continue():r.abort();});
  await load(page);
  await check(width+' chiusura fra lettura aperti e chiusi prevale sul vecchio ID aperto',async()=>{
   await page.evaluate(async()=>{
    testIO.beforeClosureRead=()=>{testIO.closedFollowUps=[closedFixture()];testIO.followUps[0].status='done';testIO.followUps[0].followUp.open=false;delete testIO.beforeClosureRead;};
    await oggiSegretariaLoad(true);
   });
   assert.deepEqual(await page.evaluate(()=>oggiSegretaria.rows),[]);
   assert.equal(await page.evaluate(()=>oggiSegretaria.closedComplete),true);
   assert.deepEqual(await ids(page),['current:conversation:conv-b']);
   assert.deepEqual(await page.evaluate(()=>Object.keys(oggiSegretaria.closedRows[0]).sort()),['followUp','id','source','status']);
   assert.deepEqual(await page.evaluate(()=>Object.keys(oggiSegretaria.closedRows[0].followUp).sort()),['conversationId','lastInboundAt','lastMessageId','open']);
   const queries=await page.evaluate(()=>testIO.closureQueries.map(q=>({...q,filters:q.filters.map(f=>({...f,value:f.value.toISOString(),isDate:f.value instanceof Date}))})));
   for(const q of queries){assert.equal(q.cap,201);assert.deepEqual(q.options,{source:'server'});assert.equal(q.filters[0].field,'doneAt');assert.equal(q.filters[0].op,'>=');assert(q.filters[0].isDate);assert(Math.abs(q.at-Date.parse(q.filters[0].value)-7*86400000)<3000);}
  });
  await check(width+' un messaggio successivo alla chiusura riappare senza riaprire il task',async()=>{
   await page.evaluate(()=>{S.conversations[0].lastMessageAt=new Date().toISOString();S.conversations[0].lastMessagePreview='È arrivata una nuova richiesta dopo la chiusura.';oggiScheduleUpdate();});
   await page.waitForSelector('[data-desk-item="current:conversation:conv-a"]');
   assert.match(await page.locator('[data-desk-item="current:conversation:conv-a"]').innerText(),/nuova richiesta dopo la chiusura/);
   assert.deepEqual(await page.evaluate(()=>oggiSegretaria.rows),[]);
   assert.equal(await page.evaluate(()=>testIO.followUps[0].status),'done');
  });
  await load(page);
  await check(width+' limite 201 conserva gli aperti ma sospende nuove richieste non coperte',async()=>{
   await page.evaluate(async()=>{
    testIO.closedFollowUps=Array.from({length:201},(_,i)=>({id:'sg_'+(i+1000).toString(16).padStart(32,'0'),source:'segretaria',status:'done',doneAt:new Date().toISOString(),followUp:{open:false,conversationId:'old-'+i,lastMessageId:'old-message',lastInboundAt:recentAt}}));await oggiSegretariaLoad(true);
   });
   assert.equal(await page.evaluate(()=>oggiSegretaria.closedComplete),false);
   assert.equal(await page.evaluate(()=>oggiSegretaria.rows.length),1);
   assert(!(await ids(page)).includes('current:conversation:conv-b'));
   assert.match(await page.locator('#ogDeskPanel').innerText(),/richieste concluse incompleta/);
   await page.evaluate(async()=>{testIO.closedFollowUps.pop();await oggiSegretariaLoad(true);});
   assert.equal(await page.evaluate(()=>oggiSegretaria.closedComplete),true,'Exactly 200 rows is a complete bounded read');
   assert((await ids(page)).includes('current:conversation:conv-b'));
  });
  for(const failure of ['closures','open']){
   await load(page);
   await check(width+' errore '+failure+' preserva la copia aperta e non fa riemergere header',async()=>{
    const before=await page.evaluate(()=>structuredClone(oggiSegretaria.rows));
    await page.evaluate(async failure=>{if(failure==='closures')testIO.failClosures=true;else testIO.failFollowUps=true;await oggiSegretariaLoad(true);},failure);
    assert.deepEqual(await page.evaluate(()=>oggiSegretaria.rows),before);
    assert.equal(await page.evaluate(()=>oggiSegretaria.closedComplete),false);
    assert(!(await ids(page)).includes('current:conversation:conv-b'));
    assert.match(await page.locator('#ogDeskPanel').innerText(),/richieste concluse incompleta/);
   });
  }
  await load(page);
  await check(width+' aperti parziali impediscono di dichiarare copertura delle chiusure',async()=>{
   await page.evaluate(async()=>{testIO.openIncomplete=true;await oggiSegretariaLoad(true);});
   assert.equal(await page.evaluate(()=>oggiSegretaria.closedComplete),false);
   assert.equal(await page.evaluate(()=>oggiSegretaria.incomplete),true);
   assert(!(await ids(page)).includes('current:conversation:conv-b'));
  });
  await load(page);
  await check(width+' risposta chiusure tardiva non sostituisce dati dopo cambio account',async()=>{
   await page.evaluate(()=>{testIO.closedFollowUps=[closedFixture()];testIO.holdClosures=true;window.delayedClosure=oggiSegretariaLoad(true);});
   await page.waitForFunction(()=>testIO.pendingClosures?.length===1);
   const before=await page.evaluate(()=>({rows:structuredClone(oggiSegretaria.rows),closedRows:structuredClone(oggiSegretaria.closedRows)}));
   await page.evaluate(async()=>{auth.currentUser={uid:'another-admin',getIdToken:async()=>'synthetic-token'};S.profile={id:'another-admin',role:'admin'};testIO.holdClosures=false;testIO.pendingClosures.splice(0).forEach(r=>r());await delayedClosure;});
   assert.deepEqual(await page.evaluate(()=>({rows:oggiSegretaria.rows,closedRows:oggiSegretaria.closedRows})),before);
  });
  await load(page);
  await check(width+' risposta superata non sostituisce la generazione successiva',async()=>{
   await page.evaluate(()=>{testIO.closedFollowUps=[closedFixture()];testIO.holdClosures=true;window.delayedClosure=oggiSegretariaLoad(true);});
   await page.waitForFunction(()=>testIO.pendingClosures?.length===1);
   await page.evaluate(async()=>{testIO.holdClosures=false;testIO.closedFollowUps=[];await oggiSegretariaLoad(true);testIO.pendingClosures.splice(0).forEach(r=>r());await delayedClosure;});
   assert.equal(await page.evaluate(()=>oggiSegretaria.rows.length),1);
   assert.deepEqual(await page.evaluate(()=>oggiSegretaria.closedRows),[]);
   assert.equal(await page.evaluate(()=>oggiSegretaria.closedComplete),true);
  });
  await check(width+' letture soltanto e nessun errore JavaScript',async()=>{
   assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);
   assert(requests.every(r=>r.method==='GET'&&r.url.startsWith(base)));assert.deepEqual(errors,[]);
  });
  await page.close();
 }
 console.log(checks+' closure UI checks passed');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
