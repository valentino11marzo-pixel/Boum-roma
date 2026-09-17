import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {build}=require('./fixture.cjs'), R=require('../../js/rent-engine.js');
const {source,fragment,links,fixture}=build();
const elements=new Map(), calls=[];
const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:''});return elements.get(id)};
const ctx=vm.createContext({S:structuredClone(fixture),window:{BOOM_RENT:R},document:{getElementById:el},Intl,Date,JSON,Number,String,Set,Promise,URL,setTimeout,clearTimeout,console,
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

// A reported transfer must expose the uploaded proof before confirmation.
ctx.S=structuredClone(fixture);ctx.S.clients=[];ctx.S.documents=[];ctx.S.profile={id:'admin'};
run("paymentFilters.month='2026-09';paymentFilters.kind='all'");
ctx.S.payments.find(p=>p.id==='p4').proofUrl='https://files.example.invalid/proof.pdf?token=a&mode=view';
check('reported transfer exposes the existing proof without asserting paid',()=>{
  const h=run("rentPaymentRow(rentOverview().payments.find(r=>r.id==='p4'))");
  assert(h.includes('Prova pagamento'));assert(h.includes('https://files.example.invalid/proof.pdf?token=a&amp;mode=view'));
  assert(h.includes('target="_blank" rel="noopener"'));assert(h.includes('Da verificare'));assert(!h.includes('Link pagamento'));
});
check('proof links reject executable, relative and unsupported URL schemes',()=>{
  for(const proofUrl of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','//files.example.invalid/proof','ftp://files.example.invalid/proof','not a url']){
    ctx.S.payments.find(p=>p.id==='p4').proofUrl=proofUrl;
    assert(!run("rentPaymentRow(rentOverview().payments.find(r=>r.id==='p4'))").includes('Prova pagamento'));
  }
  assert.equal(run("rentSafeHttpUrl('http://files.example.invalid/proof.pdf')"),'http://files.example.invalid/proof.pdf');
});

// Use the real download/archive paths, capture only their local outputs.
vm.runInContext(source.slice(source.indexOf('    function downloadPaymentReceipt('),source.indexOf('    function generateServiceContractPDF(')),ctx);
const savedPDFs=[],archiveWrites=[],uploads=[];
ctx.window.jspdf={jsPDF:function(){return new Proxy({},{get:(_,key)=>key==='text'?(text)=>pdfText.push(text):key==='save'?(name)=>savedPDFs.push(name):key==='output'?()=>({size:12}):()=>{}})}};
const direct={id:'direct-paid',status:'paid',amount:900.50,month:'2026-09',paidDate:'2026-09-17',contractId:'c1',propertyId:'u2',tenantId:'t2'};
ctx.S.payments.push(direct);pdfText.length=0;
run("downloadPaymentReceipt('direct-paid')");
check('downloaded receipt honors direct tenant/property IDs over an older contract',()=>{
  assert(pdfText.includes('Inquilino B'));assert(pdfText.includes('Unità B · Trastevere'));
  assert(!pdfText.includes('Inquilino A'));assert(!pdfText.includes('Unità A · Prati'));assert(savedPDFs.at(-1).includes('Trastevere'));
});
ctx.S.payments.push({...direct,id:'direct-no-contract',contractId:''});pdfText.length=0;
run("downloadPaymentReceipt('direct-no-contract')");
check('receipt retains known direct identities even when no contract is linked',()=>{
  assert(pdfText.includes('Inquilino B'));assert(pdfText.includes('Unità B · Trastevere'));
});
ctx.S.payments.push({...direct,id:'direct-missing',propertyId:'missing-home',tenantId:'missing-tenant'});pdfText.length=0;
run("downloadPaymentReceipt('direct-missing')");
check('missing direct records never borrow the incompatible contract identities',()=>{
  assert(!pdfText.includes('Inquilino A'));assert(!pdfText.includes('Unità A · Prati'));
});
ctx.storage={ref(path){return {async put(){uploads.push(path);return {ref:{getDownloadURL:async()=> 'https://files.example.invalid/archived.pdf'}}}}}};
ctx.generateDocHash=async()=> 'synthetic-hash';ctx.logActivity=()=>{};
ctx.firebase.firestore.FieldValue={serverTimestamp:()=> 'synthetic-time'};
ctx.db={collection(name){return {async add(data){archiveWrites.push({name,data});return {id:'stored-'+name}},doc(id){return {update:async data=>archiveWrites.push({name,id,data})}}}}};
await run("archivePaymentReceipt(S.payments.find(p=>p.id==='direct-paid'))");
check('receipt archive uses the same direct identities and tenant folder as the PDF',()=>{
  const saved=archiveWrites.find(w=>w.name==='documents').data;
  assert.equal(saved.tenantId,'t2');assert.equal(saved.userId,'t2');assert.equal(saved.propertyId,'u2');assert.equal(saved.contractId,'c1');
  assert(uploads[0].startsWith('documents/t2/archive/'));
});
const autoStart=source.indexOf('    async function autoInvoiceForPayment(');
vm.runInContext(source.slice(autoStart,source.indexOf('    async function payWithStripe(',autoStart)),ctx);
ctx.nextInvoiceNumber=()=> 'BOOM-SYNTHETIC';
await run("autoInvoiceForPayment(S.payments.find(p=>p.id==='direct-paid'))");
check('generated receipt record uses direct tenant/property IDs consistently',()=>{
  const saved=archiveWrites.find(w=>w.name==='invoices').data;
  assert.equal(saved.recipientId,'t2');assert.equal(saved.propertyId,'u2');assert.equal(saved.paymentId,'direct-paid');
});
ctx.S.payments.push({...direct,id:'deposit-receipt',type:'deposit-balance'});
await run("autoInvoiceForPayment(S.payments.find(p=>p.id==='deposit-receipt'))");
await run("archivePaymentReceipt(S.payments.find(p=>p.id==='deposit-receipt'))");
check('deposit metadata and archive title describe the charge without calling it rent',()=>{
  const invoice=archiveWrites.find(w=>w.name==='invoices'&&w.data.paymentId==='deposit-receipt').data;
  const archived=archiveWrites.find(w=>w.name==='documents'&&w.data.paymentId==='deposit-receipt').data;
  assert(invoice.service.includes('Saldo deposito cauzionale'));assert(invoice.description.includes('saldo deposito cauzionale'));assert(archived.name.includes('saldo deposito cauzionale'));
  assert(!/canone/i.test(invoice.service+' '+invoice.description+' '+archived.name));
  assert.equal(run("rentChargeLabel({type:'utilities'})"),'Altro addebito contrattuale');
});

// Legacy receipts remain accessible as original records, never new income or
// fabricated proof of payment. Missing originals are explicitly disclosed.
ctx.S=structuredClone(fixture);ctx.S.clients=[];
ctx.S.invoices.push({id:'legacy-receipt',number:'LEGACY-1',service:'Canone locazione 2026-09',description:'Ricevuta canone di locazione · Roma · 2026-09',recipientName:'<img src=x onerror=alert(1)>',status:'paid',amount:321,fileUrl:'https://files.example.invalid/original.pdf'},
  {id:'orphan-receipt',number:'LEGACY-2',documentType:'rent-receipt',paymentId:'missing-payment',status:'paid',amount:654,description:'Dati originali senza file'});
const storedBefore=JSON.stringify(ctx.S),totalsBefore=JSON.stringify(run('rentOverview().totals'));
check('unlinked legacy receipts have a separate visible archive outside all revenue totals',()=>{
  const h=run('paymentsPage()');assert(h.includes('Ricevute da collegare · 2'));assert(h.includes('LEGACY-1'));assert(h.includes('LEGACY-2'));assert(h.includes('Originale / PDF'));
  assert(!h.includes('<img src=x'));assert.equal(run('boomBusinessInvoices().length'),1);assert.equal(JSON.stringify(run('rentOverview().totals')),totalsBefore);
});
run("viewRentReceiptDocument('legacy-receipt')");
check('legacy receipt preview shows original stored fields safely without recording an incasso',()=>{
  const h=el('modals').innerHTML;assert(h.includes('Documento storico · LEGACY-1'));assert(h.includes('&lt;img'));assert(h.includes('original.pdf'));
  assert(!h.includes('markInvoicePaid'));assert(!h.includes('Registra incasso'));assert(!h.includes('downloadPaymentReceipt'));
});
ctx.boomOpen=url=>calls.push(['original',url]);run("downloadInvoicePDF('legacy-receipt')");
check('legacy receipt PDF action opens its original file without regenerating an invoice',()=>{
  assert(calls.some(c=>c[0]==='original'&&c[1]==='https://files.example.invalid/original.pdf'));
});
run("downloadInvoicePDF('orphan-receipt')");
check('missing original PDF opens a truthful read-only preview instead of hiding the receipt',()=>{
  const h=el('modals').innerHTML;assert(h.includes('Documento storico · LEGACY-2'));assert(h.includes('Nessun file originale allegato'));assert(h.includes('Dati originali senza file'));
  assert(!h.includes('Originale / PDF'));assert.equal(JSON.stringify(ctx.S),storedBefore);
});
ctx.S.invoices.find(i=>i.id==='orphan-receipt').pdfUrl='javascript:alert(1)';run("viewRentReceiptDocument('orphan-receipt')");
check('archived document URLs receive the same http(s) safety check as tenant proofs',()=>{
  assert(!el('modals').innerHTML.includes('javascript:'));assert(!el('modals').innerHTML.includes('Originale / PDF'));
});
run('applyPaymentFilters()');
check('unlinked archive has an always-present container refreshed with the live payment view',()=>{
  assert(run('paymentsPage()').includes('id="rentUnlinkedReceipts"'));assert(el('rentUnlinkedReceipts').innerHTML.includes('LEGACY-2'));
  ctx.S.payments.push({id:'missing-payment',amount:654,status:'paid',month:'2026-09'});run('applyPaymentFilters()');
  assert(!el('rentUnlinkedReceipts').innerHTML.includes('LEGACY-2'));assert(el('rentUnlinkedReceipts').innerHTML.includes('LEGACY-1'));
  assert.equal(ctx.S.invoices.find(i=>i.id==='orphan-receipt').paymentId,'missing-payment');
});

// BOOM is an agency, not a subletter: company fiscal/reporting inputs cannot
// turn a landlord's principal or a refundable deposit into BOOM revenue.
const agencyStart=source.indexOf('    function egidiPaymentBreakdown(');
vm.runInContext(source.slice(agencyStart,source.indexOf('    function commercialistaLandlordLite(',agencyStart)),ctx);
const fiscalInputs=[];
ctx._cmState={year:2026};ctx.fiscalScadenzarioCard=()=>'<div class="card"></div>';
ctx.window.BOOM_FISCAL={fmtEuro:n=>'EUR'+n,companyObligations(year,quarters){fiscalInputs.push({year,quarters:{...quarters}});return []},rollup:()=>({totalDue:0,counts:{}})};
ctx.S={...structuredClone(fixture),pfsClients:[],deadlines:[],contracts:[],invoices:[
  {id:'service-paid',service:'Gestione immobiliare',date:'2026-09-01',amount:100,status:'paid'},
  {id:'service-pending',service:'Consulenza',date:'2026-09-02',amount:25,status:'pending'},
  {id:'owner-rent',paymentId:'rent',service:'Canone locazione',date:'2026-09-01',amount:50000,status:'paid'},
  {id:'refundable-deposit',documentType:'deposit-receipt',service:'Deposito',date:'2026-09-01',amount:15000,status:'paid'},
  {id:'receipt-pending',paymentId:'some-payment',service:'PFS',date:'2026-09-02',amount:350,status:'pending'}
],payments:[
  {id:'paid-rent',status:'paid',amount:1000,paidDate:'2026-09-01',paidVia:'stripe',serviceFeeEur:25,stripeCostEur:20},
  {id:'paid-deposit',type:'deposit-balance',status:'paid',amount:2000,paidDate:'2026-09-02',paidVia:'stripe',serviceFeeEur:50,stripeCostEur:64},
  {id:'paid-sepa',status:'paid',amount:900,paidDate:'2026-09-03',paidVia:'sepa',serviceFeeEur:4,stripeCostEur:null},
  {id:'other-charge',type:'utilities',status:'paid',amount:40,paidDate:'2026-09-04'},
  {id:'unknown-fee',status:'paid',amount:100,paidDate:'2026-09-05',paidVia:'stripe',serviceFeeEur:'not-recorded'},
  {id:'pending-rent',status:'pending',amount:2000,paidDate:'2026-09-01',paidVia:'sepa',sddFeeEur:100,serviceFeeEur:100,stripeCostEur:0},
  {id:'prior-year',status:'paid',amount:2000,paidDate:'2025-09-01',paidVia:'stripe',serviceFeeEur:99,stripeCostEur:0}
]};
const agencyBefore=JSON.stringify(ctx.S),agencyHTML=run('commercialistaEgidiView()');
check('company fiscal totals contain service invoices, never owner-rent or deposit receipts',()=>{
  assert(fiscalInputs.length>0);for(const input of fiscalInputs)assert.deepEqual(input.quarters,{1:0,2:0,3:125,4:0});
  assert(agencyHTML.includes('Compensi BOOM 2026'));assert(agencyHTML.includes('Saldo gestionale prima dei costi'));
});
check('owner rent and refundable deposits stay separate from actual payment service fees',()=>{
  const b=run('egidiPaymentBreakdown(2026)');
  assert.equal(b.ownerRent,2000);assert.equal(b.deposits,2000);assert.equal(b.otherCharges,40);
  assert.equal(b.fees,79);assert.equal(b.cardFees,75);assert.equal(b.sepaFees,4);
  assert.equal(b.knownCosts,84);assert.equal(b.knownMargin,-9);
});
check('missing fee/cost and pending SDD attempts never invent earned fees or a full margin',()=>{
  const b=run('egidiPaymentBreakdown(2026)');assert.equal(b.unknownFeeCount,1);assert.equal(b.unknownCostCount,1);
  assert(agencyHTML.includes('Il costo manca su 1 incassi'));assert(agencyHTML.includes('1 pagamenti elettronici non hanno una commissione registrata'));
  assert(agencyHTML.includes('non vengono sommate una seconda volta'));assert.equal(JSON.stringify(ctx.S),agencyBefore);
});
check('company collection advice and PFS reconciliation exclude receipt records',()=>{
  assert(run('egidiAdviceBlock(2026,125,{1:0,2:0,3:125,4:0})').includes('1 fatture da incassare · EUR25'));
  assert(!run('egidiReconcileBlock(2026)').includes('Fatture PFS non corrisposte'));
});
ctx.refresh=async()=>{};ctx.logActivity=()=>{};ctx.window.confirm=()=>true;
await run("pushObligationsToDeadlines(2026,'company')");
check('saved company deadline calculations use the same service-only invoice base',()=>{
  assert.deepEqual(fiscalInputs.at(-1).quarters,{1:0,2:0,3:125,4:0});assert.equal(JSON.stringify(ctx.S),agencyBefore);
});
console.log(`${count} admin rent checks passed in total.`);
