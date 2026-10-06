import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),E=require('../../js/invoice-reconciliation-engine.js'),UI=require('../../js/invoice-workspace.js');
const clone=v=>structuredClone(v);
const data={schemaVersion:1,company:'Example company',asOf:'2026-10-06',periodStart:'2026-01-01',periodEnd:'2026-09-30',note:'Synthetic evidence, no live data.',sources:[{id:'s',label:'Synthetic source',method:'Source observation',checkedOn:'2026-10-06'}],invoices:[{id:'i1',number:'1/2026',date:'2026-09-01',party:'Example client',amountCents:219600,status:'rejected',errors:['00313'],paymentStatus:'matched',paymentEvidence:'Two independently identified payments.',sourceId:'s'},{id:'i2',number:'2/2026',date:'2026-09-01',party:'Other client',amountCents:50000,status:'undelivered',errors:[],paymentStatus:'unknown',paymentEvidence:'No matched payment.',sourceId:'s'}],payments:[{id:'ch_example',date:'2026-09-10',party:'Example client',amountCents:100000,refundCents:20000,feeCents:3000,captured:true,status:'Paid',classification:'To classify',note:'May include funds for owner.',invoiceCandidate:null,sourceId:'s'},{id:'csv:2',date:'2026-09-11',party:'Unknown',amountCents:900000,refundCents:null,feeCents:null,captured:false,status:'canceled',classification:'No collection',note:'No charge identifier in source.',invoiceCandidate:null,sourceId:'s'},{id:'ch_oct',date:'2026-10-01',party:'October client',amountCents:50000,refundCents:0,feeCents:1000,captured:true,status:'Paid',classification:'To classify',note:'Outside reporting period.',invoiceCandidate:null,sourceId:'s'}],settlements:[{id:'po_example',date:'2026-09-15',netCents:77000,bankNetCents:77000,bankRef:'bank:2',note:'Amount/date match only.',sourceId:'s'}],costs:[{id:'cost-example',period:'2026-09',amountCents:3010,cardFeeCents:3000,otherFeeCents:10,vatCents:0,sourceId:'s'}],cases:[{id:'case1',invoiceId:'i1',party:'Example client',issue:'Identity fields inconsistent.',nextAction:'Check original document.',evidence:'Source observed.',sourceId:'s'}]};
let count=0;const check=(name,fn)=>{fn();count++;console.log('OK',name);};
check('valid bounded schema and unknown values preserved',()=>{const r=E.normalize(data);assert(r.ok);assert.equal(r.data.payments[1].refundCents,null);assert.equal(r.data.payments[1].feeCents,null);});
check('rejected can be paid; undelivered is not rejected; transfer not counted twice',()=>{const s=E.summary(data);assert.equal(s.rejectedCount,1);assert.equal(s.rejectedCents,219600);assert.equal(s.undeliveredCount,1);assert.equal(s.grossCents,100000);assert.equal(s.refundCents,20000);assert.equal(s.feeCents,3000);assert.equal(s.capturedCount,1);assert.equal(s.attemptCount,2);assert.equal(s.costCents,3010);assert.equal(s.costDifferenceCents,0);assert.equal(s.matchedCount,1);});
for(const [name,mutate] of [
 ['duplicate payment ID',d=>d.payments.push(clone(d.payments[0]))],['duplicate bank reference',d=>d.settlements.push({...d.settlements[0],id:'other'})],['missing source',d=>d.invoices[0].sourceId='absent'],['unverified invoice reference',d=>d.payments[0].invoiceCandidate='absent'],['string amount',d=>d.payments[0].amountCents='1000'],['fractional cent',d=>d.costs[0].amountCents=0.2],['negative invoice',d=>d.invoices[0].amountCents=-1],['impossible date',d=>d.invoices[0].date='2026-02-31'],['refund exceeds charge',d=>d.payments[0].refundCents=100001],['missing bank proof',d=>d.settlements[0].bankRef=''],['unbounded string',d=>d.note='x'.repeat(3001)],['invented status',d=>d.invoices[0].status='issued'],['wrong period',d=>d.periodEnd='2027-01-01']])check('rejects '+name,()=>{const d=clone(data);mutate(d);assert(!E.normalize(d).ok)});
check('mismatched bank amount remains unresolved',()=>{const d=clone(data);d.settlements[0].bankNetCents=76000;assert.equal(E.summary(d).unmatchedCount,1)});
check('Firestore timestamp, invalid date and duplicate legacy numbers',()=>{assert.equal(E.day({seconds:Date.parse('2026-09-01T12:00Z')/1000}),'2026-09-01');assert.equal(E.day('bad'),null);assert.equal(E.legacyIssues([{id:'a',number:'A',date:'2026-09-01'},{id:'b',number:'A',date:'bad'},{id:'c'}]).filter(r=>r.issues.length).length,3)});
const state={snapshot:{data},tab:'invoices',search:'',filter:'all',busy:false,error:'',message:''};
check('UI distinguishes fiscal and collection states, with source date',()=>{const h=UI.render(state);for(const t of ['Scartata','Incasso riscontrato','Mancata consegna','06/10/2026','Questa lettura non aggiorna'])assert(h.includes(t));assert(!h.includes('Conferma importazione'));});
check('all six views render escaped names and source values',()=>{const d=clone(data);d.invoices[0].party='<img src=x onerror=alert(1)>';d.cases[0].issue='<script>bad</script>';for(const tab of ['invoices','cases','payments','settlements','costs','sources']){const h=UI.render({...state,snapshot:{data:d},tab});assert(!h.includes('<img'));assert(!h.includes('<script>bad'));}assert(UI.render({...state,snapshot:{data:d}}).includes('&lt;img'));});
check('search and fiscal filter preserve only matching rows',()=>{const h=UI.content(data,'invoices','Example','rejected');assert(h.includes('Example client'));assert(!h.includes('Other client'));assert(UI.content(data,'invoices','nobody','all').includes('Nessuna voce'));});
check('preview explicit and failed refresh never claims freshness',()=>{assert(UI.render({...state,preview:{data}}).includes('Conferma importazione'));assert(UI.render({...state,error:'Lettura non riuscita'}).includes('role="alert"'));assert(UI.render({...state,snapshot:null}).includes('Nessuna riconciliazione importata'));});
// Exercise the actual event controller. Only the DOM event transport and network are simulated.
const events={},host={isConnected:true,innerHTML:'',addEventListener(type,fn){events[type]=fn;}};
let uiFail=false,uiWrites=0,uiAllowed=true,uiPreviewCalls=0;
globalThis.fetch=async(_url,options)=>{
 assert.equal(options.headers.Authorization,'Bearer synthetic-admin');
 if(uiFail)return new Response(JSON.stringify({ok:false}),{status:503});
 const body=options.body?JSON.parse(options.body):null;
 if(body?.action==='preview'){uiPreviewCalls++;return new Response(JSON.stringify({ok:true,digest:'synthetic-digest',data:body.data}));}
 if(body?.action==='import'){assert.equal(body.confirmed,true);assert.equal(body.digest,'synthetic-digest');uiWrites++;}
 return new Response(JSON.stringify({ok:true,snapshot:{data}}));
};
const uiClick=action=>events.click({target:{closest:selector=>selector==='[data-fi]'?{dataset:{fi:action}}:null}});
await UI.mount(host,{authorized:()=>uiAllowed,token:async()=> 'synthetic-admin'});
check('controller loads evidence without writes',()=>{assert(host.innerHTML.includes('Example client'));assert.equal(uiWrites,0);});
uiFail=true;await uiClick('refresh');
check('controller retains prior evidence after failed refresh',()=>{assert(host.innerHTML.includes('Lettura non riuscita'));assert(host.innerHTML.includes('Example client'));assert(host.innerHTML.includes('06/10/2026'));});
uiFail=false;await uiClick('refresh');
check('controller recovers from failed read',()=>assert(!host.innerHTML.includes('Lettura non riuscita')));
await events.change({target:{matches:s=>s==='[data-fi-file]',files:[{size:5000,text:async()=>JSON.stringify(data)}]}});
check('file selection reaches preview and writes nothing',()=>{assert(host.innerHTML.includes('Conferma importazione'));assert.equal(uiPreviewCalls,1);assert.equal(uiWrites,0);});
uiFail=true;await uiClick('confirm');
check('failed import retains reviewable preview for retry',()=>{assert(host.innerHTML.includes('Importazione non confermata'));assert(host.innerHTML.includes('Conferma importazione'));assert.equal(uiWrites,0);});
uiFail=false;await uiClick('confirm');
check('confirmation archives once and closes preview',()=>{assert.equal(uiWrites,1);assert(!host.innerHTML.includes('Conferma importazione'));assert(host.innerHTML.includes('Prospetto archiviato'));});
uiAllowed=false;await uiClick('refresh');
check('controller stops actions after admin session changes',()=>assert.equal(uiWrites,1));
let releaseToken,lateRequests=0;globalThis.fetch=async()=>{lateRequests++;throw new Error('must not request');};
const delayedHost={isConnected:true,innerHTML:'',addEventListener(){}};
uiAllowed=true;const pendingMount=UI.mount(delayedHost,{authorized:()=>uiAllowed,token:()=>new Promise(resolve=>{releaseToken=resolve;})});
uiAllowed=false;releaseToken('expired');await pendingMount;
check('session change during token retrieval prevents request',()=>assert.equal(lateRequests,0));
// Test the actual portal integration, preserving actions but not old revenue assertions.
const source=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const fragment=source.slice(source.indexOf('    function invoicesPage()'),source.indexOf('    // Active filter state for invoices'));
const context=vm.createContext({window:{BOOM_INVOICE_RECONCILIATION:E},S:{clients:[],users:[]},boomBusinessInvoices:()=>[{id:'a',status:'paid',date:{seconds:1788220800},amount:50},{id:'b',number:'duplicate',recipientName:'<b>bad</b>',status:'pending',date:'bad',amount:10},{id:'c',number:'duplicate',date:'2026-09-01',amount:10}],esc:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtDate:()=> 'Data da verificare'});
vm.runInContext(fragment,context);const legacy=vm.runInContext('invoicesPage()',context);
check('real portal has no NaN, undefined, false growth or duplicate deletion',()=>{assert(!legacy.includes('NaN'));assert(!legacy.includes('undefined'));assert(!legacy.includes('YoY'));assert(legacy.includes('Numero da verificare'));assert(legacy.includes('numero mancante, ripetuto'));assert(legacy.includes("viewInvoice('a')"));assert(legacy.includes("showPaymentLink('inv','b')"));assert(!legacy.includes('<b>bad'));});
// Handler via real auth and Firestore library, mock only the external network.
Object.assign(process.env,{FIREBASE_API_KEY:'synthetic',FIREBASE_ADMIN_EMAIL:'admin@example.invalid',FIREBASE_ADMIN_PASS:'synthetic',FIREBASE_PROJECT_ID:'synthetic'});
const {toFsFields,fsDocToJs}=await import('../../api/homie/_lib.js');
const store=new Map([['users/admin',{role:'admin'}],['users/tenant',{role:'tenant'}]]);let writes=0,failRead=false,failWrite=false;
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
const doc=path=>({name:'projects/synthetic/databases/(default)/documents/'+path,fields:toFsFields(store.get(path))});
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(url);
 if(u.hostname==='identitytoolkit.googleapis.com'){
  if(u.pathname.endsWith('signInWithPassword'))return response({idToken:'service',expiresIn:'3600'});
  const token=JSON.parse(opts.body).idToken;return response(token==='admin'||token==='tenant'?{users:[{localId:token}]}:{});
 }
 assert.equal(u.hostname,'firestore.googleapis.com','No Stripe, email, SdI or other network effect permitted');
 const path=u.pathname.split('/documents')[1].replace(/^\//,'');
 if(path===':runQuery'){
  if(failRead)return response({},503);
  const q=JSON.parse(opts.body).structuredQuery;assert.equal(q.from[0].collectionId,'invoiceReconciliations');assert.equal(q.limit,1);assert.equal(q.orderBy[0].field.fieldPath,'importedAt');
  return response([...store.keys()].filter(k=>k.startsWith('invoiceReconciliations/')).slice(-1).map(k=>({document:doc(k)})));
 }
 if(opts.method==='POST'){
  assert.equal(path,'invoiceReconciliations');if(failWrite)return response({},503);
  const key=path+'/'+u.searchParams.get('documentId');if(store.has(key))return response({},409);
  store.set(key,fsDocToJs({name:'projects/synthetic/databases/(default)/documents/'+key,...JSON.parse(opts.body)}));writes++;return response(doc(key));
 }
 assert(!opts.method||opts.method==='GET');return store.has(path)?response(doc(path)):response({},404);
};
const handler=(await import('../../api/accounting/reconciliation.js')).default;
async function call(method,body,token='admin',h=handler){const r={code:0,body:null,headers:{},status(n){this.code=n;return this},json(v){this.body=v;return this},setHeader(k,v){this.headers[k]=v}};await h({method,headers:{authorization:'Bearer '+token},body},r);return r;}
for(const method of ['GET','POST']){let r=await call(method,{action:'import',data},'tenant');check('non-admin cannot '+method,()=>assert.equal(r.code,403));r=await call(method,null,'expired');check('expired token cannot '+method,()=>assert.equal(r.code,401));}
let r=await call('GET');check('empty private archive honestly empty with no-store',()=>{assert.equal(r.code,200);assert.equal(r.body.snapshot,null);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(writes,0)});
r=await call('POST',{action:'preview',data});const preview=r.body;check('server preview writes nothing and provides digest',()=>{assert.equal(r.code,200);assert.match(preview.digest,/^[a-f0-9]{64}$/);assert.equal(writes,0)});
r=await call('POST',{action:'import',data,digest:preview.digest});check('import requires explicit confirmation',()=>{assert.equal(r.code,409);assert.equal(writes,0)});
const changed=clone(data);changed.invoices[0].amountCents++;
r=await call('POST',{action:'import',data:changed,digest:preview.digest,confirmed:true});check('changed draft invalidates preview digest',()=>{assert.equal(r.code,409);assert.equal(writes,0)});
const body={action:'import',data,digest:preview.digest,confirmed:true};const results=await Promise.all([call('POST',body),call('POST',body)]);
check('concurrent confirmations create exactly one immutable snapshot',()=>{assert.deepEqual(results.map(r=>r.code).sort(),[200,201]);assert.equal(writes,1);assert.equal(results.filter(r=>r.body.duplicate).length,1)});
r=await call('POST',body);check('retry is idempotent',()=>{assert.equal(r.code,200);assert(r.body.duplicate);assert.equal(writes,1)});
r=await call('GET');check('saved data round-trips without changing accounting records',()=>{assert.equal(r.body.snapshot.data.invoices[0].status,'rejected');assert.equal(r.body.snapshot.data.invoices[0].paymentStatus,'matched');assert.equal(store.size,3)});
failRead=true;r=await call('GET');check('read failure not disguised as empty archive',()=>assert.equal(r.code,503));failRead=false;
failWrite=true;r=await call('POST',body);check('write failure not success or duplicate',()=>{assert.equal(r.code,503);assert.equal(writes,1)});failWrite=false;
r=await call('DELETE');check('deletion unsupported',()=>assert.equal(r.code,405));
const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');check('private immutable Firestore rules',()=>{assert.match(rules,/match \/invoiceReconciliations\/\{x\}\s*\{\s*allow read, create: if isAdmin\(\);\s*allow update, delete: if false;/)});
// Mutation: restore unsafe whole-attempt sums; the money assertion must fail.
const engineSource=readFileSync(new URL('../../js/invoice-reconciliation-engine.js',import.meta.url),'utf8');
const mutantScope=vm.createContext({module:{exports:{}},Intl,Date});vm.runInContext(engineSource.replace("captured=p.filter(r=>r.captured)","captured=p"),mutantScope);
check('mutation catches counting canceled attempts as money',()=>assert.throws(()=>assert.equal(mutantScope.module.exports.summary(data).grossCents,100000)));
// Mutation: an admin gate broadened to tenants must fail the actual handler test.
const url=new URL('../../api/accounting/reconciliation.js',import.meta.url),handlerSource=readFileSync(url,'utf8');
const mutant=handlerSource.replace("['admin']","['admin','tenant']").replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,s)=>'from '+JSON.stringify(new URL(s,url).href));
const mutantHandler=(await import('data:text/javascript;base64,'+Buffer.from(mutant).toString('base64'))).default;
r=await call('GET',null,'tenant',mutantHandler);check('mutation catches private data exposed to tenant',()=>assert.throws(()=>assert.equal(r.code,403)));
console.log(`${count} invoice reconciliation checks passed; no live services or writes.`);
