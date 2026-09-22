// Agency-only accounting: execute BOTH real handlers with in-memory Firestore.
// Rent/deposit receipts remain available to owner accounting but cannot become
// company revenue. All formulae live in the unchanged fiscal engine.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../notify/loader.mjs', import.meta.url);
Object.assign(process.env,{FIREBASE_API_KEY:'test-key',FIREBASE_ADMIN_EMAIL:'server@example.test',FIREBASE_ADMIN_PASS:'synthetic',FIREBASE_PROJECT_ID:'agency-test',CRON_SECRET:'test-cron'});
delete process.env.TELEGRAM_BOT_TOKEN;
const NativeDate=globalThis.Date;
globalThis.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:['2026-05-17T12:00:00.000Z']))}
  static now(){return NativeDate.parse('2026-05-17T12:00:00.000Z')}
};
const store=new Map();let writes=0,externalCalls=0;
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const {toFsFields}=await import('../../api/homie/_lib.js');
globalThis.fetch=async(url,options={})=>{
  url=String(url);
  if(url.includes('identitytoolkit.googleapis.com')&&url.includes('signInWithPassword'))return json({idToken:'server-test-token'});
  if(!url.includes('firestore.googleapis.com')){externalCalls++;throw new Error('No external effects permitted in this test')}
  const path=(url.split('/documents')[1]||'').replace(/^\//,'').split('?')[0];
  const row=key=>({name:'projects/agency-test/databases/(default)/documents/'+key,fields:toFsFields(store.get(key))});
  if(path===':runQuery'){
    const q=JSON.parse(options.body).structuredQuery,col=q.from[0].collectionId;
    const rows=[...store.keys()].filter(k=>k.startsWith(col+'/')&&k.split('/').length===2).slice(0,q.limit||1000);
    return json(rows.map(k=>({document:row(k)})));
  }
  if(options.method&&options.method!=='GET'){writes++;throw new Error('Read-only handler wrote a document')}
  return store.has(path)?json(row(path)):new Response('{}',{status:404});
};
const scadenzario=(await import('../../api/accounting/scadenzario.js')).default;
const contabile=(await import('../../api/employees/contabile.js')).default;
function seed(){
  store.clear();writes=0;externalCalls=0;globalThis.__mails=[];
  store.set('users/owner',{role:'landlord',name:'Synthetic Landlord'});
  store.set('properties/home',{ownerId:'owner',name:'Synthetic Home',renditaCatastale:800,municipality:'Roma',imuExempt:false});
  store.set('contracts/lease',{propertyId:'home',rent:900,status:'active',startDate:'2026-01-01',endDate:'2026-12-31',taxRegime:'cedolare',cedolareRate:21});
  store.set('payments/rent',{propertyId:'home',contractId:'lease',type:'rent',amount:900,status:'paid',month:'2026-03',dueDate:'2026-03-05',paidDate:'2026-03-05',serviceFeeEur:28});
  store.set('payments/deposit',{propertyId:'home',contractId:'lease',type:'deposit-balance',amount:600,status:'paid',month:'2026-03',dueDate:'2026-03-05',paidDate:'2026-03-05'});
  // An agency service stays company revenue even with the same home, lease,
  // tenant, month and the word 'canone': a broad string exclusion would be wrong.
  store.set('invoices/agency',{status:'paid',amount:1000,paidDate:'2026-03-10',service:'Gestione canone e assistenza locativa',propertyId:'home',contractId:'lease',month:'2026-03'});
  store.set('invoices/advice',{status:'paid',amount:250,paidDate:'2026-03-20',service:'Consulenza per canone locazione'});
  store.set('invoices/unpaid-service',{status:'pending',amount:5000,date:'2026-03-20',service:'Property finding'});
  store.set('invoices/prior-year',{status:'paid',amount:7000,paidDate:'2025-03-20',service:'Property finding'});
}
function receipts(){
  const base={status:'paid',paidDate:'2026-03-05',propertyId:'home',contractId:'lease',serviceFeeEur:28};
  store.set('invoices/linked-rent',{...base,paymentId:'rent',amount:900});
  store.set('invoices/legacy-rent',{...base,service:'Canone locazione 2026-03',description:'Ricevuta canone di locazione · Synthetic Home',amount:3000});
  store.set('invoices/typed-rent',{...base,documentType:'rent-receipt',amount:2200});
  store.set('invoices/typed-deposit',{...base,kind:'deposit-receipt',amount:600});
}
function response(){return {code:0,body:null,headers:{},status(code){this.code=code;return this},json(body){this.body=body;return this},setHeader(k,v){this.headers[k]=v},send(body){this.body=body;return this}}}
async function drive(handler,{format='json',auth='Bearer test-cron'}={}){
  const res=response();await handler({method:'POST',headers:{authorization:auth},query:{dry:'1',year:'2026'},body:{format,fiscalYear:2026,horizonDays:800}},res);
  return res;
}
function iva(res,isContabile){
  assert.equal(res.code,200);
  const rows=isContabile?res.body.report.obligations.overdue.concat(res.body.report.obligations.dueSoon):res.body.company;
  const obligation=rows.find(o=>o.key==='iva_q1_2026');assert.ok(obligation,'Q1 company obligation present');return obligation.amount;
}
function readOnly(){assert.equal(writes,0);assert.equal(externalCalls,0);assert.equal(globalThis.__mails.length,0)}
let checks=0;async function test(name,fn){await fn();checks++;console.log('✓ '+name)}
for(const [name,handler,isContabile] of [['scadenzario',scadenzario,false],['contabile',contabile,true]]){
  await test(name+': agency services remain revenue, excluding unpaid and prior-year invoices',async()=>{
    seed();const res=await drive(handler);assert.equal(iva(res,isContabile),275);readOnly();
  });
  await test(name+': linked, typed and legacy rent/deposit receipts cannot inflate company IVA',async()=>{
    seed();receipts();const before=JSON.stringify([...store]);const res=await drive(handler);
    assert.equal(iva(res,isContabile),275);assert.equal(JSON.stringify([...store]),before);readOnly();
  });
  await test(name+': receipt-only collections produce no company VAT estimate or inferred service fee',async()=>{
    seed();store.delete('invoices/agency');store.delete('invoices/advice');receipts();
    const res=await drive(handler);assert.equal(iva(res,isContabile),null);readOnly();
  });
  await test(name+': removing the shared receipt exclusion makes the handler assertion fail (mutation)',async()=>{
    seed();receipts();
    const file=new URL(isContabile?'../../api/employees/contabile.js':'../../api/accounting/scadenzario.js',import.meta.url);
    const source=readFileSync(file,'utf8');assert.ok(source.includes('RENT.businessInvoices(invoices)'));
    const mutant=source.replace('RENT.businessInvoices(invoices)','invoices').replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,s)=>'from '+JSON.stringify(new URL(s,file).href));
    const mutantHandler=(await import('data:text/javascript;base64,'+Buffer.from(mutant).toString('base64'))).default;
    const res=await drive(mutantHandler);assert.throws(()=>assert.equal(iva(res,isContabile),275));readOnly();
  });
}
await test('landlord obligations and taxpack totals are identical with/without company rent receipts',async()=>{
  seed();const beforeS=await drive(scadenzario),beforeC=await drive(contabile);receipts();const afterS=await drive(scadenzario),afterC=await drive(contabile);
  assert.deepEqual(afterS.body.byClient,beforeS.body.byClient);assert.deepEqual(afterC.body.report.packs,beforeC.body.report.packs);
  const ownerOnly=r=>r.body.report.obligations.overdue.concat(r.body.report.obligations.dueSoon).filter(o=>o.party!=='company');
  assert.deepEqual(ownerOnly(afterC),ownerOnly(beforeC));assert.equal(afterC.body.counts.incassatoYtd,1500);
  assert.match(afterC.body.summary,/Canoni\/depositi per conto dei proprietari YTD/);readOnly();
});
await test('ICS uses the same clean company amounts as JSON while preserving landlord entries',async()=>{
  seed();receipts();const res=await drive(scadenzario,{format:'ics'});
  assert.equal(res.code,200);assert.match(res.headers['Content-Type'],/text\/calendar/);
  assert.match(res.body,/IVA trimestrale Q1 2026 · ~€275/);assert.match(res.body,/Synthetic Landlord/);assert.doesNotMatch(res.body,/~€1749/);readOnly();
});
await test('missing owner is explicitly unverified and never relabelled BOOM direct ownership',async()=>{
  seed();store.set('properties/home',{name:'Synthetic Home',renditaCatastale:800,imuExempt:false});
  const res=await drive(scadenzario);assert.equal(res.code,200);assert.ok(res.body.byClient['Proprietario da verificare']);
  assert.equal(res.body.byClient['BOOM (gestione diretta)'],undefined);readOnly();
});
await test('both handlers remain protected and perform no reads/writes without auth',async()=>{
  seed();for(const handler of [scadenzario,contabile])assert.equal((await drive(handler,{auth:''})).code,401);readOnly();
});
globalThis.Date=NativeDate;
console.log(`\n${checks} agency accounting checks passed; no live reads, writes, email or notifications.`);
