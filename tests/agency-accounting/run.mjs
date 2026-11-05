// Agency-only accounting: execute BOTH real handlers with in-memory Firestore.
// Rent/deposit receipts remain available to owner accounting but cannot become
// company revenue. All formulae live in the unchanged fiscal engine.
import assert from 'node:assert/strict';
import { register, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
// v1.8: the fees of the desks abroad (invoices/cityfee_*, vatCountry FR|DE,
// netAmount null) are company invoices, but NOT Italian IVA base: listed on
// their own line, «IVA estera — da definire» (spec §6.8, D16).
function cityFees(){
  store.set('invoices/cityfee_book_par1',{status:'paid',amount:500,netAmount:null,vatPct:null,vatAmount:null,vatCountry:'FR',currency:'eur',lang:'en',paidDate:'2026-03-12',number:'PAR-2026-0001-FS',service:'BOOM Paris — Full Search',source:'city-signing',cityLeadId:'book_par1'});
  store.set('invoices/cityfee_book_ber1',{status:'paid',amount:476,netAmount:null,vatPct:null,vatAmount:null,vatCountry:'de',currency:'eur',lang:'en',paidDate:'2026-02-03',number:'BER-2026-0001-FS',service:'BOOM Berlin — Full Search',source:'city-signing',cityLeadId:'book_ber1'});
  store.set('invoices/cityfee_book_par2',{status:'pending',amount:199,vatCountry:'FR',date:'2026-03-20',number:'PAR-2026-0002-AP',source:'city-signing'});
  store.set('invoices/italian-explicit',{status:'paid',amount:100,vatCountry:'IT',paidDate:'2026-03-25',service:'Consulenza'});
}
for(const [name,handler,isContabile] of [['scadenzario',scadenzario,false],['contabile',contabile,true]]){
  await test(name+': fees with a foreign VAT country stay out of the Italian IVA estimate and are listed apart',async()=>{
    seed();cityFees();const res=await drive(handler);
    // 1000 + 250 + 100 (vatCountry IT is Italian) = 1350 → IVA 22% = 297; the €500 + €476 abroad never in
    assert.equal(iva(res,isContabile),297);
    const fv=isContabile?res.body.report.foreignVat:res.body.foreignVat;
    assert.equal(fv.count,2);assert.equal(fv.total,976);assert.deepEqual(fv.byCountry,{FR:500,DE:476});
    if(isContabile)assert.match(res.body.summary,/IVA estera — da definire: €976 \(2 fatture · FR €500 · DE €476\)/);
    else assert.equal(fv.label,'IVA estera — da definire');
    readOnly();
  });
  await test(name+': removing the foreign-VAT exclusion makes the handler assertion fail (mutation)',async()=>{
    seed();cityFees();
    const file=new URL(isContabile?'../../api/employees/contabile.js':'../../api/accounting/scadenzario.js',import.meta.url);
    const source=readFileSync(file,'utf8');assert.ok(source.includes('if (RENT.isForeignVat(inv)) {'));
    const mutant=source.replace('if (RENT.isForeignVat(inv)) {','if (false) {').replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,s)=>'from '+JSON.stringify(new URL(s,file).href));
    const mutantHandler=(await import('data:text/javascript;base64,'+Buffer.from(mutant).toString('base64'))).default;
    const res=await drive(mutantHandler);assert.throws(()=>assert.equal(iva(res,isContabile),297));readOnly();
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
// v1.8 review F3: the portal's Egidi fiscal page and its «Salva nelle scadenze» are the THIRD reader of the
// Italian IVA estimate (js/portal-app.js commercialistaEgidiView, pushObligationsToDeadlines). Driven here as
// tests/rent-admin drives them — the real portal source in a vm, the real fiscal engine — on the invoices exactly
// as api/payments/_citysign.js writes them: the fees abroad stay out of the quarters and the deadlines, are listed
// apart («IVA estera — da definire»), and still count as BOOM revenue.
{
  const require=createRequire(import.meta.url);
  const {build}=require('../rent-admin/fixture.cjs');
  const RENT=require('../../js/rent-engine.js'),FX=require('../../js/fiscal-engine.js');
  const portal=build().source;
  async function egidi(source){
    const {fragment,links,fixture}=build();
    const inputs=[],added=[];
    const ctx=vm.createContext({S:{},window:{BOOM_RENT:RENT,BOOM_FISCAL:{...FX,companyObligations(y,q){inputs.push({...q});return FX.companyObligations(y,q)}},confirm:()=>true},
      document:{getElementById:()=>({innerHTML:'',textContent:'',value:''})},Intl,Date,JSON,Number,String,Set,Promise,URL,setTimeout,clearTimeout,console,Math,Object,
      esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtDate:v=>v||'',toast:()=>{},isAdmin:()=>true,refresh:async()=>{},logActivity:()=>{},
      _cmState:{year:2026},fiscalScadenzarioCard:()=>'<div class="card"></div>',firebase:{firestore:{FieldValue:{serverTimestamp:()=>'ts'}}},
      db:{collection(name){return {add:async(doc)=>{added.push([name,doc]);return {id:'x'}}}}}});
    vm.runInContext(fragment+'\n'+links,ctx);
    const at=source.indexOf('    function egidiPaymentBreakdown(');
    vm.runInContext(source.slice(at,source.indexOf('    function commercialistaLandlordLite(',at)),ctx);
    const fee={number:'PAR-2026-0001-FS',service:'BOOM Paris — Full Search',amount:500,netAmount:null,vatPct:null,vatAmount:null,vatCountry:'FR',currency:'eur',lang:'en',status:'paid',date:'2026-12-10',dueDate:'2026-12-17',paidDate:'2026-12-11',source:'city-signing'};
    ctx.S={...structuredClone(fixture),pfsClients:[],deadlines:[],contracts:[],payments:[],invoices:[
      {...fee,id:'cityfee_book_par1'},
      {...fee,id:'cityfee_book_ber1',number:'BER-2026-0001-FS',service:'BOOM Berlin — Full Search',vatCountry:'DE',amount:476,status:'pending',date:'2026-11-20'},
      {id:'italian',service:'Consulenza',amount:100,status:'paid',date:'2026-12-01'}]};
    const html=vm.runInContext('commercialistaEgidiView()',ctx);
    await vm.runInContext("pushObligationsToDeadlines(2026,'company')",ctx);
    const vat=added.filter(a=>a[1].category==='vat'&&a[1].estimatedAmount).map(a=>[a[1].title,a[1].estimatedAmount]);
    return {html,inputs,vat};
  }
  await test('portal: the Egidi page and «Salva nelle scadenze» keep the fees abroad out of the Italian IVA, list them apart and count them as revenue',async()=>{
    const {html,inputs,vat}=await egidi(portal);
    // only the €100 Italian invoice in Q4 → IVA €22; the €500 (FR) and €476 (DE) never in a quarter nor in a deadline
    // three readers of the same base: the page's obligations, the advice's count, the saved deadlines
    assert.equal(inputs.length,3);for(const q of inputs)assert.deepEqual(q,{1:0,2:0,3:0,4:100});
    assert.match(html,/IVA stimata 2026<\/div><div class="stat-value">€22</);
    assert.deepEqual(vat,[['IVA trimestrale Q4 2026',22]]);
    assert.match(html,/id="egidiForeignVat"[^>]*>🌍 IVA estera — da definire: €976 \(2 fatture · FR €500 · DE €476\) — nei compensi, fuori dai trimestri e dalla stima IVA italiana/);
    assert.match(html,/Compensi BOOM 2026<\/div><div class="stat-value gold">€1076</);
  });
  await test('portal: removing the foreign-VAT exclusion makes the portal assertion fail (mutation)',async()=>{
    assert.ok(portal.includes('if (window.BOOM_RENT.isForeignVat(inv)) {'));
    const {inputs,vat}=await egidi(portal.replace('if (window.BOOM_RENT.isForeignVat(inv)) {','if (false) {'));
    assert.throws(()=>assert.deepEqual(inputs[0],{1:0,2:0,3:0,4:100}));assert.throws(()=>assert.deepEqual(vat,[['IVA trimestrale Q4 2026',22]]));
  });
}
globalThis.Date=NativeDate;
console.log(`\n${checks} agency accounting checks passed; no live reads, writes, email or notifications.`);
