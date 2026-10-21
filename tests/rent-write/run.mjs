import assert from 'node:assert/strict';
import {store,seed,put,faults,call} from './network.mjs';
import RENT from '../../js/rent-engine.js';
let count=0;const check=(label,ok)=>{assert.ok(ok,label);console.log('PASS '+label);count++;};
let n=0;const body=(over={})=>({op:'create',contractId:'c1',requestKey:'test-intent-'+String(++n).padStart(8,'0'),data:{amount:'950.50',month:'2026-10',dueDate:'2026-10-05',status:'pending'},...over});
const get=k=>store.get(k),payments=()=>[...store].filter(([k])=>k.startsWith('payments/')),audits=()=>[...store].filter(([k])=>k.startsWith('activityLog/'));
const existing=(over={})=>{put('payments/old',{contractId:'c1',tenantId:'t1',propertyId:'p1',amount:900,month:'2026-10',dueDate:'2026-10-05',status:'pending',...over});return get('payments/old');};
const update=(over={})=>body({op:'update',paymentId:'old',expected:RENT.paymentSnapshot(get('payments/old')), ...over});
check('unauthenticated rejected',(await call(body(),'invalid')).code===401);
check('tenant cannot write',(await call(body(),'tenant')).code===403);
check('GET cannot mutate',(await call(body(),'admin','GET')).code===405);
for(const amount of ['',null,true,'1.234','-1',0,'1e3','950.501']){const r=await call(body({data:{amount,month:'2026-10',dueDate:'2026-10-05',status:'pending'}}));check('reject invalid amount '+amount,r.code===400&&!payments().length);}
let request=body(),r=await call(request);
check('cents, civil date, canonical links and pending persisted',r.code===200&&get('payments/pay_c1_2026-10').amount===950.5&&get('payments/pay_c1_2026-10').dueDate==='2026-10-05'&&get('payments/pay_c1_2026-10').tenantId==='t1'&&get('payments/pay_c1_2026-10').status==='pending');
check('audit is part of same save',audits().length===1&&audits()[0][1].actor==='admin');
r=await call(request);check('same request replays without duplicate',r.code===200&&r.body.replayed&&payments().length===1&&audits().length===1);
r=await call({...request,data:{...request.data,amount:1000}});check('same key different values rejected',r.code===409&&r.body.error==='request_changed');
seed();faults.commit=true;r=await call(body());check('failed commit has no partial payment or audit',r.code===503&&!payments().length&&!audits().length);
seed();faults.lost=true;r=await call(body());check('lost commit response recovered from receipt',r.code===200&&r.body.replayed&&payments().length===1);
seed();const pair=await Promise.all([call(body()),call(body())]);check('concurrent requests create at most one installment',pair.filter(x=>x.code===200).length===1&&payments().length===1&&audits().length===1);
seed();request=body();const same=await Promise.all([call(request),call(request)]);check('concurrent retry shares one result',same.every(x=>x.code===200)&&payments().length===1&&audits().length===1);
seed();put('payments/paid-cover',{contractId:'c1',month:'2026-10',coversTo:'2026-11',amount:1901,status:'paid'});
r=await call(body({op:'bulk',data:{startMonth:'2026-10',numMonths:'3',dueDay:'5',amount:''}}));check('bulk preserves paid and multi-month coverage',r.code===200&&r.body.created===1&&r.body.skipped===2&&get('payments/pay_c1_2026-12').amount===950.5);
for(const tz of ['Europe/Rome','America/Los_Angeles','Pacific/Auckland']) {process.env.TZ=tz;const items=RENT.bulkInstallments({contractId:'c1',startMonth:'2028-01',numMonths:3,dueDay:31},get('contracts/c1'));check('civil dates independent of '+tz,items[1].dueDate==='2028-02-29'&&items[2].dueDate==='2028-03-31');}
seed();existing();request=update({contractId:'c2'});r=await call(request);check('changing contract atomically updates both direct references',r.code===200&&get('payments/old').tenantId==='t2'&&get('payments/old').propertyId==='p2'&&get('payments/old').amount===950.5);
seed();existing();request=update();put('payments/old',{...get('payments/old'),amount:1100});r=await call(request);check('stale form cannot overwrite newer amount',r.code===409&&r.body.error==='state_changed'&&get('payments/old').amount===1100&&!audits().length);
seed();existing();faults.beforeCommit=()=>put('payments/old',{...get('payments/old'),status:'paid'});r=await call(update());check('payment confirmed during save cannot be overwritten',r.code===409&&get('payments/old').status==='paid'&&!audits().length);
for(const patch of [{status:'paid'},{tenantReported:true},{sddPiId:'pi'}, {checkoutSessionId:'cs'}, {receiptUrl:'https://example.test/receipt'}, {coversTo:'2026-11'}, {type:'deposit-balance'}]) {seed();existing(patch);r=await call(update());check('protect existing movement '+JSON.stringify(patch),r.code===409&&r.body.error==='payment_locked'&&!audits().length);}
seed();existing();put('payments/destination',{contractId:'c2',month:'2026-10',status:'pending'});r=await call(update({contractId:'c2'}));check('moving to occupied period rejected',r.code===409&&r.body.error==='installment_exists');
seed();const c=get('contracts/c1');request=body({op:'renew_draft',expected:RENT.contractSnapshot(c),data:{newRent:'1100.50',newEndDate:'2027-12-31',renewalNotes:'Test'}});r=await call(request);
check('draft renewal aligns monthly total duration and history',r.code===200&&get('contracts/c1').rent===1100.5&&get('contracts/c1').canone.monthly===1100.5&&get('contracts/c1').canone.installments===24&&get('contracts/c1').canone.total===26412&&get('contracts/c1').durata.endDate==='2027-12-31'&&get('contracts/c1').renewalHistory.length===1);
for(const patch of [{tenantSignature:'signed'},{coTenants:[{signature:'signed'}]},{tenantMandate:{signed:true}},{paymentsGenerated:true}]) {seed();put('contracts/c1',{...get('contracts/c1'),...patch});r=await call({...request,requestKey:body().requestKey,expected:RENT.contractSnapshot(get('contracts/c1'))});check('draft renewal preserves signed/financial history '+JSON.stringify(patch),r.code===409&&r.body.error==='renewal_requires_new_version');}
seed();existing({status:'paid'});r=await call({...request,expected:RENT.contractSnapshot(get('contracts/c1'))});check('existing installment requires new contract version',r.code===409&&get('contracts/c1').rent===950.5);
seed();put('contracts/c1',{...get('contracts/c1'),tenantId:'missing'});r=await call(body());check('missing direct association fails closed',r.code===409&&!payments().length);
seed();await call(body());const moved=get('payments/pay_c1_2026-10');r=await call(body({op:'update',contractId:'c2',paymentId:'pay_c1_2026-10',expected:RENT.paymentSnapshot(moved)}));check('canonical installment can move safely',r.code===200);
r=await call(body());check('original period can be recreated without replacing moved installment',r.code===200&&payments().length===2&&get('payments/pay_c1_2026-10').contractId==='c2');
seed();put('contracts/c1',{...get('contracts/c1'),rent:1100});r=await call(body({op:'bulk',data:{startMonth:'2026-10',numMonths:3,dueDay:5,amount:''}}));check('ambiguous historical rent cannot silently generate wrong charges',r.code===409&&r.body.error==='contract_rent_conflict'&&!payments().length);
console.log(`${count} rent-write handler checks passed`);
