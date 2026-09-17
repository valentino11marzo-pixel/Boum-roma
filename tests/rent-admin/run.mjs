import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {build}=require('./fixture.cjs'), R=require('../../js/rent-engine.js');
const {source,fragment,links,fixture}=build();
const elements=new Map(), calls=[];
const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:''});return elements.get(id)};
const ctx=vm.createContext({S:structuredClone(fixture),window:{BOOM_RENT:R},document:{getElementById:el},Intl,Date,JSON,Number,String,Set,Promise,setTimeout,clearTimeout,console,
 esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),fmtDate:v=>v||'Da verificare',
 toast:(...v)=>calls.push(['toast',...v]),isAdmin:()=>true,auth:{currentUser:{uid:'admin',getIdToken:async()=> 'synthetic'}},firebase:{firestore:{FieldPath:{documentId:()=> '__name__'}}},
 refreshPaymentsView:()=>{},confirm:()=>true,markPaymentPaid:async id=>calls.push(['mark',id]),fetch:async(url,options)=>{calls.push(['fetch',url,JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true,url:'https://example.invalid/pay'})}}});
vm.runInContext(fragment+'\n'+links,ctx);
const run=code=>vm.runInContext(code,ctx);let count=0;
function check(name,fn){fn();count++;console.log('OK',name)}
run("paymentFilters.month='2026-09'");
check('unit view keeps all 5 units including missing installments',()=>assert.equal(run('rentOverview().units.length'),5));
check('rent excludes deposit, company excludes receipt',()=>{assert.equal(run('rentOverview().totals.due'),2850);assert.equal(run('boomBusinessInvoices().length'),1)});
const html=run('paymentsPage()');
check('period, readable actions and separate deposits',()=>{for(const term of ['Canoni per unità','Depositi e altri addebiti','Link pagamento','Nessuna rata nel periodo'])assert(html.includes(term))});
const reported=run("rentPaymentRow(rentOverview().payments.find(r=>r.id==='p4'))");
check('reported can be confirmed but cannot be charged again',()=>{assert(reported.includes('Registra incasso'));assert(!reported.includes('Link pagamento'))});
const processing=run("rentPaymentRow(rentOverview().payments.find(r=>r.id==='p3'))");
check('processing has no payment or manual receipt action',()=>{assert(!processing.includes('Link pagamento'));assert(!processing.includes('Registra incasso'))});
const paid=run("rentPaymentRow(rentOverview().payments.find(r=>r.id==='p2'))");
check('paid opens receipt and historical linked document',()=>{assert(paid.includes('Ricevuta'));assert(paid.includes('Documento'));assert(!paid.includes('Link pagamento'))});
run("filterPayments('outstanding')");
check('outstanding click preserves all outstanding rent totals',()=>assert.equal(run('rentOverview().totals.due'),2850));
run("filterPayments('all'); searchPayments('Ostiense')");
check('search/filter updates list without changing payment records',()=>{assert(el('paymentsContainer').innerHTML.includes('Ostiense'));assert(!el('paymentsContainer').innerHTML.includes('Trastevere'));assert.equal(ctx.S.payments.length,6)});
run("searchPayments('nothing-matches')");check('empty search explains filtered empty, never all clear',()=>assert(el('paymentsContainer').innerHTML.includes('Nessuna unità corrisponde')));
run("searchPayments('');paymentFilters.month='all'");check('all-period option remains selected on rerender',()=>assert(run('paymentsPage()').includes('value="all" selected')));
await run("confirmRentPayment('p4')");check('reported confirmation reaches existing accounting flow',()=>assert(calls.some(c=>c[0]==='mark'&&c[1]==='p4')));
const marks=calls.filter(c=>c[0]==='mark').length;await run("confirmRentPayment('p3')");check('processing cannot reach accounting flow',()=>assert.equal(calls.filter(c=>c[0]==='mark').length,marks));
await run("showPaymentLink('pay','p1')");check('link resolves legacy tenant via contract',()=>{assert(el('modals').innerHTML.includes('Inquilino A'));assert(calls.some(c=>c[0]==='fetch'&&c[2].id==='p1'))});
const reqs=calls.filter(c=>c[0]==='fetch').length;await run("showPaymentLink('pay','p2')");await run("showPaymentLink('pay','p3')");await run("showPaymentLink('pay','p4')");check('paid,processing,reported never request payment link',()=>assert.equal(calls.filter(c=>c[0]==='fetch').length,reqs));
ctx.S.properties[0].name='<img src=x onerror=alert(1)>';check('property names escaped',()=>assert(!run('paymentsPage()').includes('<img src=x')));
run("rentLoadState.status='error'");check('read error explicitly keeps old unverified snapshot',()=>assert(run('rentLoadNotice()').includes('non riuscito')));
const pages={payments:[Array.from({length:500},(_,i)=>({id:'p'+i,data:()=>({amount:10,status:'pending'})})),[{id:'p500',data:()=>({amount:10,status:'pending'})}]],properties:[[]],contracts:[[]],users:[[]]};
ctx.db={collection(name){let page=0;return {orderBy(){return this},limit(){return this},startAfter(){page=1;return this},async get(opts){assert.equal(opts.source,'server');calls.push(['read',name,page]);return {docs:pages[name][page]}}}}};
await run('reloadRentPayments()');check('refresh paginates and replaces data only after all reads',()=>{assert.equal(ctx.S.payments.length,501);assert.equal(run('rentLoadState.status'),'ready')});
const before=JSON.stringify(ctx.S);ctx.db={collection(){throw Error('offline')}};await run('reloadRentPayments()');check('failed refresh retains complete previous snapshot',()=>{assert.equal(JSON.stringify(ctx.S),before);assert.equal(run('rentLoadState.status'),'error')});
// Execute real exporters and ensure a company invoice cannot include the rent receipt.
ctx.downloadCSV=(csv,name)=>calls.push(['csv',csv,name]);ctx.S=structuredClone(fixture);ctx.S.clients=[];
const exportsPart=source.slice(source.indexOf('    function exportInvoicesCSV()'),source.indexOf('    function downloadCSV('));vm.runInContext(exportsPart,ctx);
run("paymentFilters.month='2026-09';paymentFilters.kind='paid';exportPaymentsCSV();exportInvoicesCSV()");
check('rent export honors filters; business export excludes receipts',()=>{const csv=calls.filter(c=>c[0]==='csv');assert(csv[0][1].includes('Trastevere'));assert(!csv[0][1].includes('Prati'));assert(!csv[1][1].includes('1400'))});
console.log(`${count} admin rent checks passed; no live network or writes.`);
// The real accounting handler re-reads the record before side effects.
const accounting=source.slice(source.indexOf('    async function markPaymentPaid('),source.indexOf('    // ── Next invoice number'));
vm.runInContext(accounting,ctx);
let fresh={status:'paid',amount:950},updates=0;
ctx.db={collection(){return {doc(){return {get:async()=>({exists:true,data:()=>fresh}),update:async()=>{updates++}}}}}};
await run("markPaymentPaid('p1')");check('fresh paid state blocks stale manual confirmation',()=>assert.equal(updates,0));
fresh={status:'pending',amount:950,sddPiId:'pi_live',sddStatus:'processing'};
await run("markPaymentPaid('p1')");check('fresh SEPA processing blocks stale manual confirmation',()=>assert.equal(updates,0));
console.log(`${count} admin rent checks passed in total.`);
const loadStart=source.indexOf('    async function loadData()');
const loadEnd=source.indexOf('\n    async function ',loadStart+10);
vm.runInContext(source.slice(loadStart,loadEnd),ctx);
ctx.S.profile={id:'admin',role:'admin'};ctx.performance={now:()=>0};ctx.checkAlerts=()=>{};ctx.loadDataFresh=async()=>{};
ctx.localStorage={getItem:()=>JSON.stringify({uid:'admin',role:'admin',timestamp:Date.now(),data:{payments:[{id:'stale',status:'pending',amount:100}]}})};
ctx.setTimeout=()=>0;
run("rentLoadState.status='ready';rentLoadState.checkedAt=new Date()");await run('loadData()');
check('cache replacement invalidates previous complete-history verification',()=>{assert.equal(run('rentLoadState.checkedAt'),null);assert.equal(run('rentLoadState.status'),'initial');assert(!run('rentLoadNotice()').includes('Verificato alle'))});
console.log(`${count} admin rent checks passed in total.`);
// Receipt amounts and descriptions must agree with the actual charge.
vm.runInContext(source.slice(source.indexOf('    function _buildReceiptDoc('),source.indexOf('    function downloadPaymentReceipt(')),ctx);
const pdfText=[];ctx.COMPANY={legal:'Company example',website:'example.invalid'};ctx.numberToWords=n=>'words-'+n;
ctx.window.jspdf={jsPDF:function(){return new Proxy({},{get:(_,key)=>key==='text'?(text)=>pdfText.push(text):()=>{}})}};
run("_buildReceiptDoc({id:'receipt-example',amount:950.50,type:'deposit-balance'},null,null,null)");
check('deposit receipt preserves cents numerically and in words without calling it rent',()=>{assert(pdfText.includes('EUR 950,50'));assert(pdfText.includes('(Euro words-950/50)'));assert(pdfText.includes('Pagamento del saldo deposito cauzionale.'));assert(!pdfText.some(t=>String(t).includes('canone di locazione')))});
console.log(`${count} admin rent checks passed in total.`);
