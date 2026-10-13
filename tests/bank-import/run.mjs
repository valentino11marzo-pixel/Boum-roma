import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
Object.assign(process.env,{FIREBASE_API_KEY:'synthetic',FIREBASE_ADMIN_EMAIL:'admin@example.invalid',FIREBASE_ADMIN_PASS:'synthetic',FIREBASE_PROJECT_ID:'synthetic'});
const {toFsFields,fsDocToJs}=await import('../../api/homie/_lib.js');
const {parseBankCsv,ingestBankTransactions}=await import('../../api/banking/_lib.js');
const handler=(await import('../../api/banking/import.js')).default;
let count=0;function check(name,fn){fn();count++;console.log('OK',name);}
const store=new Map();let writes=0,paymentWrites=0,failCreate=false;
function reset(){store.clear();for(const role of ['admin','owner','landlord','tenant'])store.set('users/'+role,{role});store.set('payments/p1',{amount:850,status:'pending',dueDate:'2026-09-07',tenantId:'tenant',month:'2026-09'});writes=paymentWrites=0;failCreate=false;}
reset();
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
const doc=path=>({name:'projects/synthetic/databases/(default)/documents/'+path,fields:toFsFields(store.get(path))});
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(url);
 if(u.hostname==='identitytoolkit.googleapis.com'){
  if(u.pathname.endsWith('signInWithPassword'))return response({idToken:'service',expiresIn:'3600'});
  const token=JSON.parse(opts.body).idToken;return response(store.has('users/'+token)?{users:[{localId:token}]}:{});
 }
 assert.equal(u.hostname,'firestore.googleapis.com','No banking provider, mail or fiscal side effects');
 const path=u.pathname.split('/documents')[1].replace(/^\//,'');
 if(path===':batchGet')return response(JSON.parse(opts.body).documents.map(n=>{const k=n.split('/documents/')[1];return store.has(k)?{found:doc(k)}:{missing:n};}));
 if(path===':runQuery'){
  const coll=JSON.parse(opts.body).structuredQuery.from[0].collectionId;
  assert(['users','payments'].includes(coll));
  return response([...store.keys()].filter(k=>k.startsWith(coll+'/')).map(k=>({document:doc(k)})));
 }
 if(opts.method==='POST'){
  assert(['bankTransactions','activityLog'].includes(path));
  if(failCreate)return response({},503);
  const key=path+'/'+(u.searchParams.get('documentId')||'log-'+writes);
  if(store.has(key))return response({},409);
  store.set(key,fsDocToJs({name:'projects/synthetic/databases/(default)/documents/'+key,...JSON.parse(opts.body)}));writes++;return response(doc(key));
 }
 if(opts.method==='PATCH'){
  if(path.startsWith('payments/'))paymentWrites++;
  const val=fsDocToJs({name:'projects/synthetic/databases/(default)/documents/'+path,...JSON.parse(opts.body)});
  store.set(path,{...store.get(path),...val});writes++;return response(doc(path));
 }
 assert(!opts.method||opts.method==='GET');return store.has(path)?response(doc(path)):response({},404);
};
const csv='Data;Importo;Descrizione\n07/09/2026;850,00;Canone settembre\n08/09/2026;-40,00;Abbonamento';
const payload={csv,accountLabel:'Conto dimostrativo'};
async function call(body,token='admin',h=handler,method='POST'){
 const r={code:0,body:null,headers:{},status(n){this.code=n;return this},json(v){this.body=v;return this},setHeader(k,v){this.headers[k]=v}};
 await h({method,headers:{authorization:'Bearer '+token},body},r);return r;
}
for(const role of ['owner','landlord','tenant','expired']){
 const r=await call({action:'preview',...payload},role);
 check('private import denies '+role,()=>{assert.equal(r.code,role==='expired'?401:403);assert.equal(writes,0)});
}
let r=await call(payload);check('legacy one-click calls cannot write',()=>{assert.equal(r.code,400);assert.equal(writes,0)});
r=await call(null,'admin',handler,'GET');check('only POST supported',()=>assert.equal(r.code,405));
r=await call({action:'preview',...payload});let preview=r.body;
check('real handler preview reads and makes no writes',()=>{assert.equal(r.code,200);assert.equal(writes,0);assert.equal(preview.toImport,2);assert.equal(preview.matched,0);assert.equal(preview.suggested,1);assert.equal(preview.rows[1].amount,-40);assert.equal(r.headers['Cache-Control'],'private, no-store')});
r=await call({action:'import',...payload,digest:preview.digest});check('confirmation required',()=>{assert.equal(r.code,409);assert.equal(writes,0)});
for(const change of [{csv:csv+'\n09/09/2026;1,00;Altro'},{accountLabel:'Altro conto'}]){
 r=await call({action:'import',...payload,...change,digest:preview.digest,confirmed:true});check('changed file or account invalidates preview',()=>{assert.equal(r.code,409);assert.equal(writes,0)});
}
for(const bad of ['Data;Importo;Descrizione\n31/02/2026;10;Errore','Data;Importo;Descrizione\n07/09/2026;zero;Errore','Data;Entrate;Uscite;Descrizione\n07/09/2026;10;errato;Errore','Data;Importo;Descrizione;Currency\n07/09/2026;10;Errore;USD','Data;Importo;Descrizione\n07/09/2026;10.123;Errore','Data;Importo;Descrizione\n07/09/2026;10;','Data;Importo\n07/09/2026;10','Data;Importo;Descrizione\n07/09/2026;10;Uguale\n07/09/2026;10;Uguale']){
 r=await call({action:'preview',...payload,csv:bad});check('ambiguous or invalid source fails closed',()=>{assert.equal(r.code,400);assert.equal(writes,0)});
}
check('Data valuta is a date column, not currency',()=>assert.equal(parseBankCsv('Data operazione;Data valuta;Importo;Descrizione\n07/09/2026;07/09/2026;10;Servizio',{strict:true}).error,null));
const body={action:'import',...payload,digest:preview.digest,confirmed:true};
const results=await Promise.all([call(body),call(body)]);
check('concurrent acquisition is create-only and never pays a rent',()=>{assert(results.every(r=>r.code===200));assert.equal(writes,2);assert.equal(paymentWrites,0);assert.equal(store.get('payments/p1').status,'pending');const tx=[...store.entries()].find(([k,v])=>k.startsWith('bankTransactions/')&&v.amount===850)[1];assert.equal(tx.reviewRequired,true);assert.deepEqual(tx.matchSuggestions,['p1']);assert.equal(tx.matchedPaymentId,undefined)});
r=await call(body);check('retry skips existing movements without overwriting review',()=>{assert.equal(r.body.imported,0);assert.equal(r.body.skipped,2);assert.equal(writes,2)});
r=await call({action:'preview',...payload});check('new preview reports existing movements',()=>{assert.equal(r.body.toImport,0);assert(r.body.rows.every(x=>x.alreadyPresent));assert.equal(writes,2)});
reset();failCreate=true;r=await call(body);check('write failure is visible and never a payment',()=>{assert.equal(r.code,503);assert.equal(paymentWrites,0)});failCreate=false;
// Mutations execute the real handler against the same mocked network.
const url=new URL('../../api/banking/import.js',import.meta.url),src=readFileSync(url,'utf8');
async function mutant(from,to){const s=src.replace(from,to).replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,p)=>'from '+JSON.stringify(new URL(p,url).href));return (await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'))).default;}
reset();r=await call(body,'admin',await mutant('reviewOnly: true','reviewOnly: false'));
check('mutation detects accidental automatic rent payment',()=>{assert.equal(r.code,200);assert.throws(()=>assert.equal(paymentWrites,0));});
reset();r=await call({action:'preview',...payload},'admin',await mutant("dryRun: body.action === 'preview'",'dryRun: false'));
check('mutation detects writes during preview',()=>{assert.equal(r.code,200);assert.throws(()=>assert.equal(writes,0));});
// Unchanged email ingestion retains its explicit original mode.
reset();await ingestBankTransactions(parseBankCsv(csv).txs,{accountId:'email:example',source:'email'});
check('existing non-manual pipeline retains its prior policy',()=>assert.equal(store.get('payments/p1').status,'paid'));
// Drive the actual inline UI with a synthetic DOM and mocked API.
const page=readFileSync(new URL('../../banca.html',import.meta.url),'utf8');
const fragment=page.slice(page.indexOf('  // ── Import manuale: prima'),page.lastIndexOf('\n})();'));
const elements={};for(const id of ['csvFile','csvLabel','btnImport','bankImportPreview'])elements[id]={id,events:{},value:'Conto dimostrativo',innerHTML:'',textContent:'',disabled:false,addEventListener(e,f){this.events[e]=f}};
elements.csvFile.files=[{size:csv.length,text:async()=>csv}];let uiWrites=0,uiFailure=false;
const context=vm.createContext({document:{getElementById:id=>elements[id]},toast(){},esc:s=>String(s).replaceAll('<','&lt;'),euro:n=>String(n),api:async(_u,b)=>{if(b.action==='preview')return {...preview,rows:[{bookingDate:'2026-09-07',description:'<script>bad</script>',amount:850,alreadyPresent:false}]};if(uiFailure)throw Error('test');uiWrites++;return {imported:2,skipped:0}}});
vm.runInContext(fragment,context);
await elements.btnImport.events.click();
check('UI previews escaped rows without import',()=>{assert(elements.bankImportPreview.innerHTML.includes('CONFERMA CARICAMENTO'));assert(!elements.bankImportPreview.innerHTML.includes('<script>'));assert.equal(uiWrites,0)});
elements.csvLabel.events.input();await elements.bankImportPreview.events.click({target:{id:'btnConfirmImport'}});
check('changing account invalidates UI confirmation',()=>assert.equal(uiWrites,0));
await elements.btnImport.events.click();await elements.bankImportPreview.events.click({target:{id:'btnConfirmImport'}});
check('UI confirmation writes once and closes preview',()=>{assert.equal(uiWrites,1);assert.equal(elements.bankImportPreview.innerHTML,'');assert(elements.bankImportPreview.textContent.includes('Nessun canone segnato pagato'))});
await elements.btnImport.events.click();uiFailure=true;await elements.bankImportPreview.events.click({target:{id:'btnConfirmImport'}});
check('UI failure requires new preview and unlocks inputs',()=>{assert(elements.bankImportPreview.textContent.includes('Ripeti l’anteprima'));assert.equal(elements.csvFile.disabled,false);assert.equal(elements.bankImportPreview.innerHTML,'')});
console.log('Bank import checks passed:',count);
