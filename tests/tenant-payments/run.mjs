// /casa: run the real inline controller and shared rent engine with synthetic
// Firestore snapshots, fake timers and network. No credentials or live effects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../../tenant.html', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../../js/rent-engine.js', import.meta.url), 'utf8');
const inline = html.match(/<script>\s*(\(function\(\)\{\s*'use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'real tenant inline script found');
new vm.Script(inline); // also parse the unchanged boot path
const marker = '/* ── boot: everything REAL, from the tenant\'s own documents ── */';
assert.ok(inline.includes(marker));
const controller = inline.slice(0, inline.indexOf(marker));
const bridge = `
window.testTenant = { render:render, refresh:refreshPayments, confirm:confirmPaymentReturn,
  retry:retryPayments, row:payRow, rows:historyRows, next:nextPending, choose:selectPaymentMethod,
  returnState:paymentReturnState, notice:paymentNotice, report:reportTransfer, receipt:loadPaymentReceipt,
  set:function(o){
    if('payments' in o)PAYMENTS=o.payments;if('contract' in o)CONTRACT=o.contract;
    if('load' in o)PAY_LOAD=o.load;if('returnId' in o)PAY_RETURN=o.returnId;
    if('checking' in o)RETURN_CHECKING=o.checking;if('appReady' in o)APP_READY=o.appReady;
    if('lang' in o)LANG=o.lang;if('payout' in o)PAYOUT=o.payout;
    if('viewAs' in o)VIEW_AS=o.viewAs;if('sddReturn' in o)SDD_RETURN=o.sddReturn;
  },
  state:function(){return {payments:PAYMENTS,load:PAY_LOAD,checking:RETURN_CHECKING,busy:PAY_BUSY,returnId:PAY_RETURN,limited:PAY_LIMIT,today:todayISO}}
};
USER={uid:'tenant-test',getIdToken:function(){return Promise.resolve('synthetic-token')}};
PROFILE={name:'Test Tenant',role:'tenant'};
CONTRACT={id:'contract-test',propertyId:'home-test',rent:900};
PROPERTY={address:'Synthetic Home, Rome'};
todayISO='2026-09-17';
})();`;
const basePayment = { id:'rent-sep',contractId:'contract-test',tenantId:'tenant-test',month:'2026-09',dueDate:'2026-09-05',amount:900,status:'pending',type:'rent' };
function payment(o={}){return {...basePayment,...o}}
function element(id){return {id,attrs:{},listeners:{},innerHTML:'',textContent:'',style:{},disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return []},addEventListener(name,fn){this.listeners[name]=fn},focus(){this.focused=true},getBoundingClientRect(){return {top:0}},scrollIntoView(){},getAttribute(name){return this.attrs[name]??null},setAttribute(name,value){this.attrs[name]=String(value)}}}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));for(let i=0;i<10;i++)await Promise.resolve()}
function fixture({query='',mutate,now}={}){
  let clock=0,sequence=0;
  const timers=new Map(),elements=new Map(),reads=[],requests=[],queues={payments:[],contracts:[],documents:[]};
  const scanChildren=value=>{for(const tag of value.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){
    const id=tag[1];if(!elements.has(id)){const el=element(id);let body='';Object.defineProperty(el,'innerHTML',{get(){return body},set(v){body=v;scanChildren(v)}});elements.set(id,el)}
    elements.get(id).hidden=/\bhidden(?:\s|>)/.test(tag[0]);
    elements.get(id).attrs=Object.fromEntries([...tag[0].matchAll(/([a-z-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  }};
  const fixed=new Set(['app','langBtn','footTm','payov','payAmt','paySub']);
  for(const id of fixed)elements.set(id,element(id));
  let refreshButtons=[];
  const app=elements.get('app');let markup='';
  Object.defineProperty(app,'innerHTML',{get(){return markup},set(value){
    markup=value;
    for(const key of [...elements.keys()])if(!fixed.has(key))elements.delete(key);
    scanChildren(markup);
    refreshButtons=[...markup.matchAll(/<button[^>]*data-refresh-payments[^>]*>/g)].map(m=>({...element(''),disabled:m[0].includes(' disabled')}));
  }});
  const timeout=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:clock+ms,ms});return id};
  const clear=id=>timers.delete(id);
  const snapshot=rows=>({forEach(fn){rows.forEach(p=>fn({id:p.id,data(){return structuredClone(p)}}))}});
  const db={collection(name){
    const request={collection:name,filters:[],id:null};
    const chain={where(...args){request.filters.push(args);return chain},limit(n){request.limit=n;return chain},doc(id){request.id=id;return chain},get(options){
      reads.push({...request,options});
      const value=queues[name]?.shift()??(name==='payments'?[]:{id:'contract-test',sdd:{status:'inactive'}});
      if(value instanceof Error)return Promise.reject(value);
      if(typeof value==='function')return value();
      return Promise.resolve(request.id?{exists:true,id:request.id,data(){return structuredClone(value)}}:snapshot(value));
    }};
    return chain;
  }};
  const ClockDate=now?class extends Date {constructor(value){super(value===undefined?now:value)}}:Date;
  const ctx={console,URL,URLSearchParams,Date:ClockDate,Intl,TextEncoder,Uint8Array,crypto:webcrypto,Promise,
    location:{search:query,href:'/casa'},navigator:{language:'en'},localStorage:{getItem(){return 'en'},setItem(){}},
    document:{createElement(tag){return element(tag)},getElementById(id){return elements.get(id)||null},querySelectorAll(selector){return selector==='[data-refresh-payments]'?refreshButtons:[]}},
    setTimeout:timeout,clearTimeout:clear,innerHeight:800,matchMedia(){return {matches:true}},
    firebase:{firestore(){return db}},
    BoomPortal:{withTimeout(p,ms){return new Promise((resolve,reject)=>{const id=timeout(()=>reject(new Error('timeout')),ms);Promise.resolve(p).then(v=>{clear(id);resolve(v)},e=>{clear(id);reject(e)})})}},
    fetch(url,options){requests.push({url,options});return Promise.resolve({json:()=>Promise.resolve(ctx.response||{ok:true,checkoutUrl:'https://checkout.stripe.com/synthetic'})})},
  };
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(engine,ctx);
  vm.runInContext((mutate?mutate(controller):controller)+(now?bridge.replace("todayISO='2026-09-17';",''):bridge),ctx);
  const api=ctx.testTenant;
  return {api,ctx,reads,requests,queues,elements,get markup(){return markup},
    async tick(){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next)return false;timers.delete(next[0]);clock=next[1].at;next[1].fn();await flush();return true},
    async finish(){for(let i=0;i<100&&timers.size;i++)await this.tick();assert.equal(timers.size,0,'all finite timers drained')},
    render(rows,extra={}){api.set({payments:rows,load:'ready',checking:false,...extra});api.render();return markup}
  };
}
let passed=0;
async function test(name,run){await run();passed++;console.log('✓ '+name)}
function noPay(h){assert.doesNotMatch(h,/id="(?:payBtn|payDock|bfx)"/)}
function noPaid(h){assert.doesNotMatch(h,/class="paidband"/)}

await test('URL ?paid requests confirmation and never writes status, date or method',()=>{
  const f=fixture({query:'?paid=rent-sep'}),p=payment();const before=JSON.stringify(p);
  const h=f.render([p],{checking:true});
  assert.equal(JSON.stringify(p),before);assert.equal(f.api.returnState(),'checking');noPaid(h);noPay(h);
  assert.match(h,/Checking the payment/);assert.doesNotMatch(h,/all clear/);
});
await test('unknown payment IDs and a different home never display paid',()=>{
  const f=fixture({query:'?paid=another-home'});
  let h=f.render([payment({id:'another-home',contractId:'contract-other',status:'paid'})]);
  noPaid(h);noPay(h);assert.equal(f.api.returnState(),'missing');assert.match(h,/could not be found/);
  h=f.render([]);assert.match(h,/No instalments are recorded/);assert.doesNotMatch(h,/all clear|you are all set/);
});
await test('server paid snapshot confirms and displays receipt, leaving the next real instalment payable',async()=>{
  const f=fixture({query:'?paid=rent-sep'});
  f.api.set({appReady:true});f.queues.payments.push([payment({status:'paid',paidVia:'stripe',paidDate:'2026-09-17',receiptUrl:'https://pay.stripe.com/synthetic-receipt'}),payment({id:'rent-oct',month:'2026-10',dueDate:'2026-10-05'})]);
  await f.api.confirm(0);
  assert.equal(f.api.returnState(),'confirmed');assert.match(f.markup,/Payment confirmed in your account/);
  assert.match(f.markup,/synthetic-receipt/);assert.match(f.markup,/id="payBtn"/);assert.match(f.markup,/October 2026/);
  assert.equal(f.reads[0].options.source,'server');
  assert.equal(f.api.state().checking,false);
});
await test('webhook arriving on a later bounded server refresh becomes confirmed',async()=>{
  const f=fixture({query:'?paid=rent-sep'});f.api.set({appReady:true});
  f.queues.payments.push([payment()],[payment()],[payment({status:'paid'})]);
  await f.api.confirm(0);assert.equal(f.api.returnState(),'checking');await f.finish();
  assert.equal(f.reads.length,3);assert.equal(f.api.returnState(),'confirmed');
});
await test('delayed webhook stops after five reads and offers retry without a second payment',async()=>{
  const f=fixture({query:'?paid=rent-sep'});f.api.set({appReady:true});
  for(let i=0;i<5;i++)f.queues.payments.push([payment()]);
  await f.api.confirm(0);await f.finish();
  assert.equal(f.reads.length,5);assert.equal(f.api.returnState(),'waiting');assert.equal(f.api.state().payments[0].status,'pending');
  assert.match(f.markup,/still pending/);assert.match(f.markup,/Awaiting confirmation/);assert.match(f.markup,/data-refresh-payments/);noPay(f.markup);noPaid(f.markup);
  f.queues.payments.push([payment({status:'paid'})]);await f.api.retry();assert.equal(f.api.returnState(),'confirmed');
});
await test('read failure is an explicit retry state, never zero debt or old paid confirmation',async()=>{
  const f=fixture({query:'?paid=rent-sep'});f.render([payment({status:'paid'})],{appReady:true});
  f.queues.payments.push(new Error('network unavailable'));await f.api.confirm(0);
  assert.equal(f.api.state().load,'error');assert.equal(f.api.state().checking,false);
  assert.match(f.markup,/could not verify/);assert.doesNotMatch(f.markup,/all clear|you are all set/);noPaid(f.markup);noPay(f.markup);
});
await test('hung read leaves visible loading then a bounded error; a retry restores the real balance',async()=>{
  const f=fixture();f.api.set({appReady:true});f.queues.payments.push(()=>new Promise(()=>{}));
  const pending=f.api.refresh();assert.match(f.markup,/Loading your payments/);noPay(f.markup);
  await f.finish();await pending;assert.equal(f.api.state().load,'error');
  f.queues.payments.push([payment()]);await f.api.retry();assert.equal(f.api.state().load,'ready');assert.match(f.markup,/id="payBtn"/);
});
await test('persisted SDD/card processing and a reported transfer hide card, bank and dock',()=>{
  for(const fields of [{sddPiId:'pi_synthetic',sddStatus:'processing'},{sddPiId:'pi_synthetic'},{status:'processing'},{cardStatus:'processing'},{tenantReported:true}]){
    const f=fixture(),h=f.render([payment(fields)]);noPay(h);assert.match(h,/processing|being collected|awaiting verification/);
  }
});
await test('failed SDD restores card, Apple Pay, bank and dock; deposit balance remains payable',()=>{
  const f=fixture();let h=f.render([payment({sddPiId:'pi_synthetic',sddStatus:'failed'})],{payout:{iban:'SYNTHETIC',beneficiary:'Test'}});
  assert.match(h,/id="payBtn"/);assert.equal(f.elements.get('payBankPanel').hidden,true);assert.match(h,/id="payDock"/);assert.match(h,/Apple Pay where available/);assert.match(h,/did not go through/);
  f.elements.get('payMethodBank').onclick();assert.equal(f.elements.get('payBankPanel').hidden,false);assert.equal(f.elements.get('payCardPanel').hidden,true);f.elements.get('payMethodCard').onclick();assert.equal(f.elements.get('payCardPanel').hidden,false);
  h=f.render([payment({type:'deposit-balance',amount:450.5})]);assert.match(h,/Security deposit balance/);assert.match(h,/€450.50/);assert.match(h,/id="payBtn"/);
});
await test('cancelled/unknown amounts never produce a pay button or invented all-clear',()=>{
  const f=fixture();noPay(f.render([payment({status:'cancelled'})]));
  const h=f.render([payment({amount:'not-money',status:'unknown'})]);noPay(h);assert.doesNotMatch(h,/all clear|you are all set/);assert.match(h,/To verify/);
});
await test('list is scoped to the home and keeps due, paid receipts and cancelled records distinct',()=>{
  const f=fixture(),h=f.render([payment(),payment({id:'rent-paid',status:'paid',month:'2026-08',paidVia:'sepa'}),payment({id:'void',status:'cancelled',month:'2026-07'}),payment({id:'other',contractId:'another',month:'2099-12'})]);
  assert.match(h,/Payments for this home/);assert.match(h,/To pay & in progress/);assert.match(h,/Paid & receipts/);assert.match(h,/by direct debit/);assert.match(h,/Cancelled/);assert.doesNotMatch(h,/2099-12/);
});
await test('EN/IT switching preserves pending truth and disables all duplicate paths',()=>{
  const f=fixture({query:'?paid=rent-sep'}),h=f.render([payment()],{lang:'it'});noPay(h);noPaid(h);assert.match(h,/in attesa di conferma/);assert.match(h,/Aggiorna pagamenti/);assert.match(h,/Pagamenti di questa casa/);
});
await test('checkout double clicks send one request and rerender/language changes keep actions blocked',async()=>{
  const f=fixture();f.render([payment()]);const click=f.elements.get('payBtn').onclick;
  click();click();f.api.set({lang:'it'});f.api.render();noPay(f.markup);
  await flush();assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/payments/pay');
  assert.equal(JSON.parse(f.requests[0].options.body).paymentId,'rent-sep');assert.equal(f.ctx.location.href,'https://checkout.stripe.com/synthetic');
});
await test('already_paid response waits for Firestore and never fabricates a paid record',async()=>{
  const f=fixture();f.ctx.response={ok:false,error:'already_paid'};f.render([payment()],{appReady:true});
  f.queues.payments.push([payment()]);f.elements.get('payBtn').onclick();await flush();
  assert.equal(f.api.state().payments[0].status,'pending');assert.equal(f.api.returnState(),'checking');noPaid(f.markup);noPay(f.markup);
});
await test('SEPA ?sdd=ok is verified from the contract before activation is announced',async()=>{
  const f=fixture({query:'?sdd=ok'});let h=f.render([payment()],{checking:true,appReady:true});noPaid(h);assert.match(h,/Checking the activation/);assert.doesNotMatch(h,/id="sddBtn"/);
  f.queues.payments.push([payment()]);f.queues.contracts.push({id:'contract-test',sdd:{status:'active',ibanLast4:'1234'}});
  await f.api.confirm(0);assert.match(f.markup,/Auto-pay activated/);assert.equal(f.api.state().checking,false);
  assert.ok(f.reads.every(r=>r.options.source==='server'));
});
await test('large history is explicitly incomplete and admin reads remain contract scoped',async()=>{
  const f=fixture();f.api.set({viewAs:'contract-test',appReady:true});
  f.queues.payments.push(Array.from({length:120},(_,i)=>payment({id:'synthetic-'+i})));await f.api.refresh();
  assert.match(f.markup,/first 120 records/);assert.deepEqual(f.reads[0].filters,[['contractId','==','contract-test']]);
});
await test('an explicit other charge never acquires a rent label or a monthly-rent estimate',()=>{
  const f=fixture();const h=f.render([payment({type:'utilities',amount:85})],{contract:{id:'contract-test'}});
  assert.match(h,/Other charge September 2026/);assert.doesNotMatch(h,/Rent September 2026/);assert.match(h,/Monthly rent<\/div><div class="v"><span>—<\/span>/);
});
await test('ambiguous numeric formats cannot become a misleading next amount or a payment action',()=>{
  const f=fixture();const h=f.render([payment({amount:'1.200'})]);noPay(h);assert.equal(f.api.next(),null);assert.doesNotMatch(h,/€1.2|NaN|all clear/);
});
await test('Rome civil date controls overdue even while UTC is still on the prior day',()=>{
  const f=fixture({now:'2026-09-17T22:30:00.000Z'});assert.equal(f.api.state().today,'2026-09-18');
  const h=f.render([payment({dueDate:'2026-09-17'})]);assert.match(h,/class="st late"/);
});
await test('a capped paid-only snapshot does not claim that every instalment is settled',async()=>{
  const f=fixture();f.api.set({appReady:true});
  f.queues.payments.push(Array.from({length:120},(_,i)=>payment({id:'paid-'+i,status:'paid'})));await f.api.refresh();
  assert.match(f.markup,/first 120 records/);assert.doesNotMatch(f.markup,/all clear|you are all set/);
});
await test('payment_not_payable refreshes authoritative state instead of leaving a stale pay action',async()=>{
  const f=fixture();f.ctx.response={ok:false,error:'payment_not_payable'};f.render([payment()],{appReady:true});
  f.queues.payments.push([payment({status:'unknown'})]);f.elements.get('payBtn').onclick();await flush();
  assert.equal(f.api.state().load,'ready');assert.equal(f.api.state().payments[0].status,'unknown');noPay(f.markup);assert.match(f.markup,/To verify/);
});
await test('method choice reveals one payment path and never initiates a payment itself',()=>{
  const f=fixture();f.render([payment()],{payout:{iban:'SYNTHETIC-IBAN',beneficiary:'Configured owner account'}});
  assert.equal(f.elements.get('payMethodCard').getAttribute('aria-pressed'),'true');assert.equal(f.elements.get('payBankPanel').hidden,true);
  f.elements.get('payMethodBank').onclick();assert.equal(f.elements.get('payMethodBank').getAttribute('aria-pressed'),'true');
  assert.equal(f.elements.get('payBankPanel').hidden,false);assert.equal(f.elements.get('payCardPanel').hidden,true);f.elements.get('payBtn').onclick();assert.equal(f.requests.length,0);
  assert.equal(f.elements.get('payMethodBank').focused,true);
  f.elements.get('payMethodCard').onclick();assert.equal(f.elements.get('payCardPanel').hidden,false);assert.equal(f.elements.get('payBankPanel').hidden,true);
});
await test('method switching preserves other home drafts and the existing payment section',()=>{
  const f=fixture();f.render([payment()],{payout:{iban:'SYNTHETIC',beneficiary:'Configured'}});
  const draft=f.elements.get('mDesc'),card=f.elements.get('s-pay');draft.value='Unsaved maintenance details';
  f.elements.get('payMethodBank').onclick();f.elements.get('payMethodCard').onclick();
  assert.equal(f.elements.get('mDesc'),draft);assert.equal(draft.value,'Unsaved maintenance details');assert.equal(f.elements.get('s-pay'),card);
});
await test('principal, estimated fee and estimated total are explicit before the short action',()=>{
  const f=fixture(),h=f.render([payment()]);
  assert.match(h,/Instalment<\/dt><dd>€900/);assert.match(h,/Estimated card fee<\/dt><dd>€30/);
  assert.match(h,/Estimated total<\/dt><dd>€930/);assert.match(h,/exact fee and total are shown in Stripe before you confirm/);
  assert.match(h,/id="payBtn"[^>]*>Continue to payment/);assert.doesNotMatch(h,/max service fee|settle it now/);
  assert.match(h,/<details class="pay-auto"><summary>Automatic payments for future rent/);
  assert.match(h,/id="payDockBtn">View payment/);
});
await test('method choice survives language changes with correct Italian money formatting',()=>{
  const f=fixture();f.render([payment({amount:1200.5})],{payout:{iban:'SYNTHETIC',beneficiary:'Configured'}});
  f.elements.get('payMethodBank').onclick();f.api.set({lang:'it'});f.api.render();
  assert.match(f.markup,/id="payMethodBank"[^>]*aria-pressed="true"/);assert.equal(f.elements.get('payCardPanel').hidden,true);
  assert.match(f.markup,/€1.200,50/);assert.match(f.markup,/per conto del proprietario/);
});
await test('new instalment resets method and stale chooser cannot reopen processing paths',()=>{
  const f=fixture();f.render([payment()]);const choose=f.elements.get('payMethodBank').onclick;choose();
  f.render([payment({id:'other-rent'})]);assert.match(f.markup,/id="payMethodCard"[^>]*aria-pressed="true"/);
  f.render([payment({status:'processing'})]);choose();noPay(f.markup);assert.doesNotMatch(f.markup,/id="payMethodBank"/);
});
await test('bank details require both configured beneficiary and IBAN without inventing either',()=>{
  for(const payout of [null,{iban:'SYNTHETIC'},{beneficiary:'Configured'}]){
    const f=fixture();f.render([payment()],{payout});f.elements.get('payMethodBank').onclick();
    assert.match(f.markup,/Transfer details are not available/);assert.doesNotMatch(f.markup,/id="bfx"/);assert.equal(f.elements.get('payCardPanel').hidden,true);
    assert.match(f.markup,/Need help with this payment/);
  }
});
await test('bank reference keeps the matching token and the actual deposit type',async()=>{
  const f=fixture();f.render([payment({type:'deposit-balance'})],{payout:{iban:'SYNTHETIC',beneficiary:'Actual configured beneficiary'}});
  f.elements.get('payMethodBank').onclick();for(let i=0;i<10&&!f.elements.get('bfx').innerHTML;i++)await flush();
  const bank=f.elements.get('bfx').innerHTML;assert.match(bank,/Actual configured beneficiary/);
  assert.match(bank,/BOOM-[A-Z0-9]{6} saldo deposito cauzionale 2026-09/);assert.doesNotMatch(bank,/canone 2026-09/);
});
await test('clipboard denial is honest and successful retry clears the prior error',async()=>{
  const f=fixture();f.ctx.navigator.clipboard={writeText(){return Promise.reject(new Error('denied'))}};
  f.render([payment()],{payout:{iban:'SYNTHETIC',beneficiary:'Configured'}});f.elements.get('payMethodBank').onclick();
  for(let i=0;i<10&&!f.elements.get('bfx').onclick;i++)await flush();
  const button=element('copy-test');button.textContent='Copy';button.attrs['data-copy']='SYNTHETIC';
  f.elements.get('bfx').onclick({target:{closest(){return button}}});await flush();
  assert.equal(button.textContent,'Copy');assert.match(f.elements.get('bfFeedback').textContent,/Could not copy/);
  f.ctx.navigator.clipboard.writeText=()=>Promise.resolve();f.elements.get('bfx').onclick({target:{closest(){return button}}});await flush();
  assert.equal(f.elements.get('bfFeedback').textContent,'');assert.match(button.textContent,/Copied/);
});
await test('reference failure remains visible and does not leave a blank bank method',async()=>{
  const f=fixture();f.ctx.crypto={subtle:{digest(){return Promise.reject(new Error('unavailable'))}}};
  f.render([payment()],{payout:{iban:'SYNTHETIC',beneficiary:'Configured'}});f.elements.get('payMethodBank').onclick();await flush();
  assert.match(f.elements.get('bfx').innerHTML,/could not prepare the transfer reference/);
});
await test('failed checkout keeps a clear error and a functional retry',async()=>{
  const f=fixture();f.ctx.response={ok:false,error:'temporarily_unavailable'};f.render([payment()]);
  f.elements.get('payBtn').onclick();await flush();assert.match(f.markup,/could not open the payment page/);
  assert.match(f.markup,/id="payBtn"[^>]*>Try again/);
  f.ctx.response={ok:true,checkoutUrl:'https://checkout.stripe.com/synthetic'};f.elements.get('payBtn').onclick();await flush();
  assert.equal(f.requests.length,2);assert.equal(f.ctx.location.href,'https://checkout.stripe.com/synthetic');
});
await test('payment confirmation notice appears once in the payment card',()=>{
  const f=fixture({query:'?paid=rent-sep'}),h=f.render([payment()],{checking:true});
  const card=h.slice(h.indexOf('id="s-pay"'),h.indexOf('id="s-hist"'));
  assert.equal((card.match(/role="status"/g)||[]).length,1);noPay(h);
});
await test('mutation: restoring optimistic ?paid status is caught by the rendering contract',()=>{
  const f=fixture({query:'?paid=rent-sep',mutate:s=>s.replace('function render(){',"function render(){ if(PAY_RETURN)PAYMENTS.forEach(function(p){if(p.id===PAY_RETURN)p.status='paid'});")});
  const p=payment();f.render([p]);assert.throws(()=>assert.equal(p.status,'pending'));
});
await test('mutation: re-enabling payment paths while processing is caught',()=>{
  const f=fixture({mutate:s=>s.replace('paymentBlocked=!payable(next);','paymentBlocked=false;')});
  assert.throws(()=>noPay(f.render([payment({status:'processing'})])));
});

await test('transfer report waits for server state, never writes paid or opens checkout',async()=>{
  const f=fixture(),p=payment();f.render([p],{appReady:true});f.api.choose('bank');
  const before=JSON.stringify(p);f.ctx.response={ok:true,state:'reported'};
  f.queues.payments.push([payment({tenantReported:true})]);
  const sending=f.elements.get('reportTransferBtn').onclick();
  assert.equal(JSON.stringify(p),before);await sending;
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/payments/report');
  assert.deepEqual(JSON.parse(f.requests[0].options.body),{paymentId:'rent-sep',action:'report'});
  assert.equal(f.api.state().payments[0].status,'pending');assert.equal(f.api.state().payments[0].tenantReported,true);
  noPay(f.markup);assert.match(f.markup,/id="withdrawReportBtn"/);
});
await test('a mistaken report can be withdrawn only after authoritative refresh',async()=>{
  const f=fixture();f.render([payment({tenantReported:true})],{appReady:true});
  f.ctx.response={ok:true,state:'overdue'};f.queues.payments.push([payment()]);
  await f.elements.get('withdrawReportBtn').onclick();
  assert.equal(JSON.parse(f.requests[0].options.body).action,'withdraw');assert.match(f.markup,/id="payBtn"/);
});
await test('admin preview and stale paid/processing actions cannot report',async()=>{
  const f=fixture();let p=payment();f.render([p],{viewAs:'contract-test'});
  assert.doesNotMatch(f.markup,/id="reportTransferBtn"/);await f.api.report(p,'report');assert.equal(f.requests.length,0);
  for(const fields of [{status:'paid'},{status:'processing'},{tenantReported:true}]){p=payment(fields);f.render([p],{viewAs:null});await f.api.report(p,'report')}
  assert.equal(f.requests.length,0);
});
await test('concurrent payment confirmation during reporting stays paid after the fresh read',async()=>{
  const f=fixture();f.render([payment()],{appReady:true});f.api.choose('bank');
  f.ctx.response={ok:false,error:'state_changed'};f.queues.payments.push([payment({status:'paid'})]);
  await f.elements.get('reportTransferBtn').onclick();
  assert.equal(f.api.state().payments[0].status,'paid');noPay(f.markup);assert.doesNotMatch(f.markup,/id="withdrawReportBtn"/);
});
await test('report failure never invents a saved notice and a second click while busy is ignored',async()=>{
  const f=fixture(),p=payment();f.render([p],{appReady:true});f.api.choose('bank');
  f.ctx.response={ok:false,error:'report_unavailable'};f.queues.payments.push([payment()]);
  const pending=f.api.report(p,'report');await f.api.report(p,'report');await pending;
  assert.equal(f.requests.length,1);assert.equal(f.api.state().payments[0].tenantReported,undefined);assert.match(f.markup,/role="alert"/);
});
await test('archive receipt is looked up by its existing ID and must match the installment',async()=>{
  const f=fixture(),p=payment({status:'paid',receiptDocId:'doc-test'});f.render([p]);
  assert.match(f.markup,/data-receipt-payment="rent-sep"/);
  const button={disabled:false,replaceWith(link){this.link=link}};
  f.queues.documents.push({paymentId:'rent-sep',type:'receipt',fileUrl:'https://files.example.invalid/receipt.pdf'});
  await f.api.receipt('rent-sep',button);assert.equal(button.link.href,'https://files.example.invalid/receipt.pdf');assert.equal(f.reads[0].options.source,'server');
  const wrong={disabled:false,replaceWith(){throw Error('must not expose')}};
  f.queues.documents.push({paymentId:'someone-else',fileUrl:'https://files.example.invalid/private.pdf'});
  await f.api.receipt('rent-sep',wrong);assert.equal(wrong.disabled,false);assert.match(f.elements.get('receiptFeedback').textContent,/not available/);
});
await test('receipt links reject executable and non-HTTPS URLs',()=>{
  const f=fixture();for(const receiptUrl of ['javascript:alert(1)','data:text/html,secret','http://example.invalid/receipt'])assert.doesNotMatch(f.api.row(payment({status:'paid',receiptUrl})),/href=/);
});
await test('a lost report response is reconciled from the server without claiming failure or resending',async()=>{
  const f=fixture();f.render([payment()],{appReady:true});f.api.choose('bank');
  f.ctx.response={ok:false,error:'report_unavailable'};f.queues.payments.push([payment({tenantReported:true})]);
  await f.elements.get('reportTransferBtn').onclick();assert.equal(f.requests.length,1);noPay(f.markup);assert.doesNotMatch(f.markup,/We could not confirm your report/);
});
await test('bank-confirmed payment without receipt explicitly explains availability in both languages',()=>{
 const f=fixture();const p=payment({status:'paid',paidVia:'bank',bankTxId:'bank-test'});
 assert.match(f.api.row(p),/Receipt not available yet/);assert.doesNotMatch(f.api.row(p),/data-receipt-payment|href=/);
 f.api.set({lang:'it'});assert.match(f.api.row(p),/Ricevuta non ancora disponibile/);
});
await test('a same-payment proof or invoice cannot appear as the tenant receipt',async()=>{
 const f=fixture();f.render([payment({status:'paid',receiptDocId:'not-receipt'})]);
 for(const type of ['bank-proof','invoice',undefined]){
   const button={disabled:false,replaceWith(){throw Error('must not expose a non-receipt')}};
   f.queues.documents.push({paymentId:'rent-sep',type,fileUrl:'https://files.example.invalid/proof.pdf'});
   await f.api.receipt('rent-sep',button);assert.equal(button.disabled,false);assert.match(f.elements.get('receiptFeedback').textContent,/not available/);
 }
});
console.log(`\n${passed} tenant payment checks passed. No live network or writes.`);
