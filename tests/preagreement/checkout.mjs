import { conditionalFirestore } from './conditional-firestore.mjs';
// Real submit/pay, locks, conversion and catalog. Synthetic external IO only.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
register('./checkout-loader.mjs', import.meta.url, { data: { mutation: process.env.PA_CHECKOUT_MUTATION } });
Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_synthetic', FIREBASE_API_KEY: 'synthetic', FIREBASE_ADMIN_EMAIL: 'synthetic@example.invalid', FIREBASE_ADMIN_PASS: 'synthetic', FIREBASE_PROJECT_ID: 'synthetic', GMAIL_USER: 'synthetic@example.invalid', GMAIL_APP_PASS: 'synthetic' });
const DB = new Map();
const io = globalThis.paCheckoutIO = { checkouts: [], writes: [], failStripe: false, failLock: false };
const toF = v => v == null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { doubleValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(toF) } } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = o => Object.fromEntries(Object.entries(o).map(([k,v]) => [k,toF(v)]));
const fromF = v => 'nullValue' in v ? null : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'doubleValue' in v ? v.doubleValue : 'integerValue' in v ? Number(v.integerValue) : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromF) : unfields(v.mapValue?.fields || {});
const unfields = o => Object.fromEntries(Object.entries(o).map(([k,v]) => [k,fromF(v)]));
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch = async (url,opts={}) => {
  const u=String(url),method=opts.method || 'GET';
  if(u.includes('identitytoolkit'))return json({idToken:'synthetic',localId:'tenant1'});
  if(u.includes('api.telegram.org'))return json({ok:true});
  if(!u.includes('firestore.googleapis.com'))throw Error('Unexpected IO: '+u);
  const path=decodeURIComponent(u.split('(default)/documents')[1] || '').replace(/^\//,'').split('?')[0];
  if(path===':runQuery') {
    const q=JSON.parse(opts.body).structuredQuery,collection=q.from[0].collectionId,filter=q.where?.fieldFilter;
    return json([...DB].filter(([key,v])=>key.startsWith(collection+'/')&&(!filter||v[filter.field.fieldPath]===fromF(filter.value))).map(([key,v])=>({document:{name:'projects/synthetic/databases/(default)/documents/'+key,fields:fields(v)}})));
  }
  if(method==='POST') {
    if(path==='propertyLocks'&&io.failLock)return json({error:{status:'UNAVAILABLE'}},503);
    const id=new URL(u).searchParams.get('documentId') || 'auto_'+DB.size,key=path+'/'+id;
    if(DB.has(key))return json({error:{status:'ALREADY_EXISTS'}},409);
    const data=unfields(JSON.parse(opts.body).fields);DB.set(key,data);io.writes.push(key);
    return json({name:'projects/synthetic/databases/(default)/documents/'+key});
  }
  if(method==='PATCH') {DB.set(path,{...DB.get(path),...unfields(JSON.parse(opts.body).fields)});io.writes.push(path);return json({name:path});}
  if(method==='DELETE'){DB.delete(path);return json({});}
  return DB.has(path)?json({name:path,fields:fields(DB.get(path))}):json({error:{status:'NOT_FOUND'}},404);
};
globalThis.fetch=conditionalFirestore(globalThis.fetch,{DB,fields,unfields,onWrite:path=>io.writes.push(path),fail:writes=>io.failLock&&writes.some(w=>w.update?.name.includes('/propertyLocks/'))});

const submit=(await import('../../api/preagreement/submit.js')).default;
const pay=(await import('../../api/preagreement/pay.js')).default;
const lookup=(await import('../../api/preagreement/lookup.js')).default;
const token='a'.repeat(32),tenant={fullName:'Synthetic Tenant',email:'tenant@example.invalid',phone:'+39000000000'};
const seed=(over={})=>{
  DB.clear();Object.assign(io,{checkouts:[],writes:[],sessions:{},idempotent:new Map(),failStripe:false,failLock:false});globalThis.__mails=[];
  process.env.STRIPE_SECRET_KEY='sk_synthetic';
  DB.set('preAgreements/pa1',{token,status:'sent',propertyId:'property1',autoConvert:true,property:{address:'Synthetic street'},lease:{startDate:'2027-01-01',endDate:'2027-12-31',months:12},money:{rent:900,dueAtSigning:900.49},tenant,...over});
  DB.set('properties/property1',{name:'Synthetic property',ownerId:'owner1'});DB.set('users/tenant1',{id:'tenant1',role:'tenant',name:tenant.fullName,email:tenant.email});
};
const get=()=>DB.get('preAgreements/pa1');
const drive=async(handler,extra={})=>{const res={code:0,setHeader(){},status(c){this.code=c;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{},body:{token,tenant,accept:true,...extra}},res);return res;};
const noContract=()=>assert.equal([...DB.keys()].filter(k=>k.startsWith('contracts/')).length,0,'No contract before verified payment');
const tests={
  async failure(){seed();io.failStripe=true;const r=await drive(submit);assert.equal(r.code,200);assert.equal(r.body.checkoutUrl,null);assert.equal(get().status,'accepted');assert.equal(get().paymentTerms.totalCents,90049);noContract();io.failStripe=false;assert.equal((await drive(pay)).code,200);assert.equal(io.checkouts.at(-1).line_items[0].price_data.unit_amount,90049);noContract();},
  async unavailable(){seed();delete process.env.STRIPE_SECRET_KEY;await drive(submit);assert.equal(get().status,'accepted');assert.equal(io.checkouts.length,0);noContract();},
  async lock(){seed();io.failLock=true;const r=await drive(submit);assert.equal(r.code,503);assert.equal(r.body.error,'property_lock_unavailable');assert.equal(get().status,'sent');assert.equal(io.checkouts.length,0);noContract();assert(!io.writes.includes('preAgreements/pa1'));},
  async unlockable(){seed({propertyId:null,property:{}});assert.equal((await drive(submit)).code,503);assert.equal(io.checkouts.length,0);noContract();},
  async held(){seed();await drive(submit);const original=get();DB.set('preAgreements/pa1',{...original,status:'sent'});for(const [key,value]of DB)if(key.startsWith('propertyLocks/'))DB.set(key,{...value,paId:'another',firm:true});io.checkouts=[];const r=await drive(submit);assert.equal(r.code,409);assert.equal(r.body.error,'property_taken');assert.equal(get().status,'reserve');assert.equal(io.checkouts.length,0);noContract();},
  async exact(){seed();const r=await drive(submit,{addons:['cleaning-premium']});assert.equal(r.code,200);assert.deepEqual(io.checkouts[0].line_items.map(l=>l.price_data.unit_amount),[90049,11900]);assert.equal(get().paymentTerms.totalCents,101949);assert.equal((await drive(pay)).code,200);assert.equal(io.checkouts.length,1,'Resume reuses the existing verified Checkout');assert.deepEqual([...io.idempotent.values()][0].params,io.checkouts[0],'Accepted amounts and items remain identical');noContract();},
  async snapshot(){seed();await drive(submit,{addons:['cleaning-premium']});const first=structuredClone(io.checkouts[0]);get().money.dueAtSigning=1200;get().addons[0].eur=199;get().addonsEur=199;assert.equal((await drive(pay)).code,200,'Mutable fields cannot reprice accepted Checkout');assert.equal(io.checkouts.length,1);assert.deepEqual([...io.idempotent.values()][0].params,first,'Original accepted Checkout remains immutable');},
  async displayedAmount(){seed();await drive(submit,{addons:['cleaning-premium']});assert.equal((await drive(lookup)).body.pa.paymentDueEur,1019.49);get().money.dueAtSigning=1200;assert.equal((await drive(lookup)).body.pa.paymentDueEur,1019.49,'Lookup uses the accepted snapshot before mutable money');seed({status:'accepted',addons:[{kind:'cleaning-premium',label:'Accepted cleaning',eur:110.25}],addonsEur:110.25});assert.equal((await drive(lookup)).body.pa.paymentDueEur,1010.74,'Legacy display equals its resumed Checkout');},
  async legacy(){seed({status:'accepted',addons:[{kind:'cleaning-premium',label:'Previously accepted cleaning',eur:110.25}],addonsEur:110.25});assert.equal((await drive(pay)).code,200);assert.deepEqual(io.checkouts[0].line_items.map(l=>l.price_data.unit_amount),[90049,11025]);},
  async addonsOnly(){seed({money:{rent:900,dueAtSigning:0}});await drive(submit,{addons:['cleaning-premium']});assert.deepEqual(io.checkouts[0].line_items.map(l=>l.price_data.unit_amount),[11900]);noContract();assert.equal((await drive(pay)).code,200);assert.equal(io.checkouts.length,1);assert.deepEqual([...io.idempotent.values()][0].params,io.checkouts[0]);},
  async free(){seed({money:{rent:900,dueAtSigning:0}});assert.equal((await drive(submit)).code,200);assert.equal(io.checkouts.length,0);assert(DB.has('contracts/pa_pa1'),'The legitimate zero-due conversion still runs');},
  async bounds(){for(const amount of [49.99,20000.01,-1,'invalid']){seed({money:{dueAtSigning:amount}});assert.equal((await drive(submit)).code,409);assert.equal(get().status,'sent');assert.equal(io.checkouts.length,0);noContract();}},
  async corrupt(){seed();await drive(submit);get().paymentTerms.totalCents++;io.checkouts=[];assert.equal((await drive(pay)).code,409);assert.equal(io.checkouts.length,0);},
  async paid(){for(const evidence of [{status:'paid'},{paidAt:'2026-10-13T00:00:00Z'},{paidSessionId:'paid-session'},{paidEur:900.49}]){seed({status:'accepted',...evidence});const before=structuredClone(get());assert.equal((await drive(submit)).body.paid,true);assert.equal((await drive(pay)).body.error,'already_paid');assert.deepEqual(get(),before);assert.equal(io.checkouts.length,0);assert.equal(io.writes.length,0);}},
};
const probes={convert:'failure',lock:'lock',rounding:'exact',addons:'exact',snapshot:'snapshot'};
if(process.env.PA_CHECKOUT_MUTATION){await tests[probes[process.env.PA_CHECKOUT_MUTATION]]();process.exit(0);}
for(const [name,test]of Object.entries(tests)){await test();console.log('PASS '+name);}
for(const mutation of Object.keys(probes)){
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,PA_CHECKOUT_MUTATION:mutation},encoding:'utf8',timeout:20000});
  assert.equal(child.status,1,'Mutation must fail an assertion: '+mutation+'\n'+child.stderr);assert.match(child.stderr,/AssertionError/);console.log('PASS mutation '+mutation);
}
console.log(Object.keys(tests).length+' real-handler checks and '+Object.keys(probes).length+' mutations passed; synthetic IO only.');
