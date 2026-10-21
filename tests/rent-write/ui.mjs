import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {seed,store,call} from './network.mjs';
import RENT from '../../js/rent-engine.js';
const source=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
export const controller=source.slice(source.indexOf('    function initRentWriteForm('),source.indexOf('    async function markPaymentPaid('))+source.slice(source.indexOf('    async function updatePayment('),source.indexOf('    async function updateMaintenance('));
function fixture(){
  seed();const calls=[],toasts=[],error={textContent:'',style:{}},control={disabled:false};let current,reply=null,closed=0;
  const ctx={console,setTimeout,clearTimeout,crypto:webcrypto,Date,window:{BOOM_RENT:RENT},S:{contracts:[],users:[],properties:[]},
    auth:{currentUser:{uid:'admin',getIdToken:async()=> 'admin'}},isAdmin:()=>true,rentLoadState:{status:'ready'},
    FormData:class{constructor(form){this.entries=Object.entries(form.values)}[Symbol.iterator](){return this.entries[Symbol.iterator]()}},
    document:{getElementById:()=>current},toast:(...a)=>toasts.push(a),closeModal:()=>{closed++;},reloadRentPayments:async options=>{assert.equal(options.force,true);},
    fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));if(reply)return reply(url,opts);const r=await call(JSON.parse(opts.body));return {status:r.code,json:async()=>r.body};},
    esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),rentActionArg:s=>String(s)
  };
  vm.createContext(ctx);vm.runInContext(controller,ctx);
  function form(values,type='addPayment',data){current={values,querySelector:()=>error,closest:()=>({querySelectorAll:()=>[control]}),setAttribute(){},removeAttribute(){}};ctx.initRentWriteForm(type,data);return current;}
  return {ctx,form,calls,toasts,error,control,get closed(){return closed},setReply:r=>reply=r,submit:()=>ctx.savePayment({preventDefault(){},target:current}),replace:()=>{current={};}};
}
let n=0;const test=async(label,fn)=>{await fn();console.log('PASS '+label);n++;};
const data={contractId:'c1',amount:'950.50',month:'2026-10',dueDate:'2026-10-05',status:'pending',notes:'Bozza da conservare'};
await test('real form handler passes cents to real API and acknowledges persisted data',async()=>{const f=fixture();f.form({...data});await f.submit();assert.equal(store.get('payments/pay_c1_2026-10').amount,950.5);assert.equal(f.closed,1);assert.equal(f.toasts[0][0],'success');});
await test('double tap has one request while in flight',async()=>{const f=fixture();f.form({...data});let resolve;f.setReply(()=>new Promise(r=>resolve=r));const one=f.submit();await new Promise(r=>setImmediate(r));assert.equal(f.control.disabled,true);await f.submit();assert.equal(f.calls.length,1);resolve({status:503,json:async()=>({ok:false,error:'save_unavailable'})});await one;assert.equal(f.closed,0);assert.equal(f.control.disabled,false);});
await test('lost response keeps draft and retry uses same key and one committed record',async()=>{const f=fixture(),form=f.form({...data});let once=true;f.setReply(async(u,o)=>{const r=await call(JSON.parse(o.body));if(once){once=false;throw Error('lost response')}return {status:r.code,json:async()=>r.body};});await f.submit();assert.equal(form.values.notes,data.notes);assert.equal(f.closed,0);assert.match(f.error.textContent,/non confermato/);await f.submit();assert.equal(f.calls[0].requestKey,f.calls[1].requestKey);assert.equal([...store.keys()].filter(k=>k.startsWith('payments/')).length,1);assert.equal(f.closed,1);});
await test('validation refusal allows corrected values and a new intent',async()=>{const f=fixture(),form=f.form({...data,amount:'broken'});await f.submit();assert.equal(f.closed,0);assert.match(f.error.textContent,/due decimali/);form.values.amount='950.50';await f.submit();assert.notEqual(f.calls[0].requestKey,f.calls[1].requestKey);assert.equal(f.closed,1);});
await test('unconfirmed intent cannot silently switch amount',async()=>{const f=fixture(),form=f.form({...data});f.setReply(()=>{throw Error('offline')});await f.submit();form.values.amount='1000';await f.submit();assert.equal(f.calls.length,1);assert.equal(f.closed,0);});
await test('stale session suppresses success and modal close',async()=>{const f=fixture();f.form({...data});let resolve;f.setReply(()=>new Promise(r=>resolve=r));const work=f.submit();await new Promise(r=>setImmediate(r));f.ctx.auth.currentUser={uid:'other'};resolve({status:200,json:async()=>({ok:true})});await work;assert.equal(f.closed,0);assert.equal(f.toasts.length,0);});
await test('late response does not close a replacement modal',async()=>{const f=fixture();f.form({...data});let resolve;f.setReply(()=>new Promise(r=>resolve=r));const work=f.submit();await new Promise(r=>setImmediate(r));f.replace();resolve({status:200,json:async()=>({ok:true})});await work;assert.equal(f.closed,0);});
await test('expected snapshot is captured when opened, not at save time',async()=>{const f=fixture(),payment={...data,amount:900,tenantId:'t1',propertyId:'p1'};const form=f.form({...data},'editPayment',payment);payment.amount=1200;f.setReply(async()=>({status:409,json:async()=>({ok:false,error:'state_changed'})}));await f.ctx.updatePayment({preventDefault(){},target:form},'old');assert.equal(f.calls[0].expected.amount,900);assert.equal(f.closed,0);assert.match(f.error.textContent,/cambiati/);});
await test('rendered forms preserve cents, escape notes, distinguish rent from receipt',async()=>{const f=fixture();let h=f.ctx.rentPaymentModal('editPayment',{...data,amount:950.5,notes:'<script>unsafe</script>'});assert.match(h,/step="0.01"/);assert.match(h,/&lt;script&gt;/);assert.doesNotMatch(h,/value="paid"/);h=f.ctx.rentPaymentModal('editPayment',{...data,status:'paid'});assert.match(h,/Rata protetta/);assert.doesNotMatch(h,/onsubmit=/);});
await test('a refresh started before a save cannot overwrite its later confirmed reread',async()=>{
  let reads=0;const pending=[];
  const ctx={isAdmin:()=>true,auth:{currentUser:{uid:'admin'}},rentLoadState:{status:'initial'},S:{},refreshPaymentsView:()=>{},setTimeout,clearTimeout,Promise,Date,
    firebase:{firestore:{FieldPath:{documentId:()=> '__name__'}}},db:{collection(){return {orderBy(){return this},limit(){return this},get(){const snapshot=amount=>({docs:[{id:'row',data:()=>({amount})}]});return reads++<4?new Promise(resolve=>pending.push(()=>resolve(snapshot(900)))):Promise.resolve(snapshot(1100.5));}}}}};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('    async function reloadRentPayments('),source.indexOf('    function openRentReportReview(')),ctx);
  const older=ctx.reloadRentPayments();await ctx.reloadRentPayments({force:true});assert.equal(ctx.S.payments[0].amount,1100.5);
  pending.forEach(resolve=>resolve());await older;assert.equal(ctx.S.payments[0].amount,1100.5);assert.equal(ctx.rentLoadState.status,'ready');
});
console.log(`${n} actual rent-write UI scenarios passed`);
