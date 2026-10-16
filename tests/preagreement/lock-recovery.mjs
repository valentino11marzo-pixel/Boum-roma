import assert from 'node:assert/strict';
import {register} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {conditionalFirestore} from './conditional-firestore.mjs';
register('./lock-recovery-loader.mjs',import.meta.url,{data:{mutation:process.env.PA_LOCK_MUTATION}});
Object.assign(process.env,{STRIPE_SECRET_KEY:'synthetic',FIREBASE_API_KEY:'synthetic',FIREBASE_ADMIN_EMAIL:'synthetic@example.invalid',FIREBASE_ADMIN_PASS:'synthetic'});
const DB=new Map(),io=globalThis.paCheckoutIO={};
let readFailure='',queryFailure=false,commitHook=null,deleteHook=null;
const enc=v=>v==null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{doubleValue:v}:typeof v==='string'?{stringValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(enc)}}:{mapValue:{fields:fields(v)}};
const dec=v=>'nullValue'in v?null:'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'doubleValue'in v?v.doubleValue:'integerValue'in v?Number(v.integerValue):'arrayValue'in v?(v.arrayValue.values||[]).map(dec):unfields(v.mapValue?.fields||{});
const fields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)])),unfields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,dec(x)]));
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const transport=async(raw,options={})=>{
 const url=new URL(String(raw)),method=options.method||'GET',path=decodeURIComponent(url.pathname.split('/documents/')[1]||'');
 if(url.hostname==='identitytoolkit.googleapis.com')return json({idToken:'synthetic'});
 assert.equal(url.hostname,'firestore.googleapis.com','No mail/model/other network');
 if(url.pathname.endsWith(':runQuery')){
  const q=JSON.parse(options.body).structuredQuery,c=q.from[0].collectionId,f=q.where?.fieldFilter;
  if(queryFailure&&c==='propertyLocks')return json({error:{status:'UNAVAILABLE'}},503);
  return json([...DB].filter(([p,v])=>p.startsWith(c+'/')&&(!f||v[f.field.fieldPath]===dec(f.value))).slice(0,q.limit).map(([p,v])=>({document:{name:'projects/test/databases/(default)/documents/'+p,fields:fields(v)}})));
 }
 if(method==='GET'){if(path===readFailure)return json({error:{status:'UNAVAILABLE'}},503);return DB.has(path)?json({name:'projects/test/databases/(default)/documents/'+path,fields:fields(DB.get(path))}):json({error:{status:'NOT_FOUND'}},404);}
 if(method==='DELETE'){DB.delete(path);return json({});}
 throw Error('Unexpected IO '+method+' '+path);
};
const conditional=conditionalFirestore(transport,{DB,fields,unfields,onWrite:(path,data)=>io.writes.push({path,data}),beforeCommit:async writes=>{if(commitHook){const hook=commitHook;commitHook=null;await hook(writes);}}});
globalThis.fetch=async(raw,options={})=>{if(options.method==='DELETE'&&deleteHook){const hook=deleteHook;deleteHook=null;await hook(String(raw));}return conditional(raw,options);};
const L=await import('../../api/preagreement/_lock.js'),{default:pay}=await import('../../api/preagreement/pay.js');
const token='a'.repeat(32),old=new Date(Date.now()-49*3600000).toISOString();
const proposal={token,status:'accepted',propertyId:'house',property:{address:'Synthetic address'},lease:{startDate:'2027-01-01',endDate:'2027-02-28'},tenant:{fullName:'Synthetic tenant',email:'synthetic@example.invalid'},money:{dueAtSigning:900.49}};
const path=m=>'propertyLocks/p_house__2027-'+m;
function reset(){DB.clear();Object.assign(io,{checkouts:[],keys:[],writes:[],sessions:{},failStripe:false,loseResponse:false,idempotent:new Map()});readFailure='';queryFailure=false;commitHook=null;deleteHook=null;DB.set('preAgreements/paA',structuredClone(proposal));}
async function drive(){const res={code:0,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await pay({method:'POST',headers:{},body:{token}},res);return res;}
const hold=(id,extra={})=>({paId:id,key:'p_house',baseKey:'p_house',unit:null,heldAt:new Date().toISOString(),firm:false,...extra});
const tests={
 async resume(){reset();DB.set(path('01'),hold('paidB',{firm:true}));DB.set('preAgreements/paidB',{status:'paid',paidSessionId:'verified'});const before=structuredClone(DB.get('preAgreements/paA'));const r=await drive();assert.equal(r.code,409);assert.equal(r.body.error,'property_taken');assert.equal(io.checkouts.length,0);assert.deepEqual(DB.get('preAgreements/paA'),before);assert.equal(DB.get(path('01')).paId,'paidB');},
 async expiredPaid(){reset();DB.set(path('01'),hold('paidB',{heldAt:old}));DB.set('preAgreements/paidB',{status:'accepted',paidSessionId:'verified'});assert.equal((await drive()).body.error,'property_taken');assert.equal(io.checkouts.length,0);},
 async cas(){reset();for(const m of ['01','02'])DB.set(path(m),hold('old',{heldAt:old}));commitHook=()=>{DB.set(path('02'),hold('paidB',{firm:true}));};const r=await drive();assert.notEqual(r.code,200);assert.equal(io.checkouts.length,0);assert.equal(DB.get(path('01')).paId,'old','No partial acquisition');assert.equal(DB.get(path('02')).paId,'paidB');},
 async read(){reset();queryFailure=true;const r=await drive();assert.equal(r.code,503);assert.equal(r.body.error,'property_lock_unavailable');assert.equal(io.checkouts.length,0);assert(!DB.has(path('01')),'Rollback newly acquired locks');},
 async ownerRead(){reset();DB.set(path('01'),hold('old',{heldAt:old}));readFailure='preAgreements/old';assert.equal((await drive()).code,503);assert.equal(DB.get(path('01')).paId,'old');assert.equal(io.checkouts.length,0);},
 async release(){reset();await L.acquireLock({pa:proposal,paId:'paA'});deleteHook=()=>DB.set(path('01'),hold('paidB',{firm:true}));await L.releaseLock({pa:proposal,paId:'paA'});assert.equal(DB.get(path('01'))?.paId,'paidB');},
 async concurrent(){reset();DB.set('preAgreements/paB',{...proposal,token:'b'.repeat(32)});const results=await Promise.all([L.acquireLock({pa:proposal,paId:'paA'}),L.acquireLock({pa:proposal,paId:'paB'})]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(new Set([...DB].filter(([p])=>p.startsWith('propertyLocks/')).map(([,v])=>v.paId)).size,1);},
 async retry(){reset();io.failStripe=true;assert.equal((await drive()).code,503);const first=structuredClone(DB.get('preAgreements/paA').checkoutAttempt);io.failStripe=false;assert.equal((await drive()).code,200);assert.equal(new Set(io.keys).size,1);assert.deepEqual(io.checkouts[0],io.checkouts[1]);assert.equal(DB.get('preAgreements/paA').checkoutAttempt.key,first.key);assert(io.checkouts[0].expires_at<Date.now()/1000+48*3600);},
 async lostResponse(){reset();io.loseResponse=true;assert.equal((await drive()).code,503);const original=structuredClone(io.checkouts[0]);DB.get('preAgreements/paA').tenant.fullName='Updated display name';assert.equal((await drive()).code,200);assert.deepEqual(io.checkouts[1],original);assert.equal(io.idempotent.size,1);assert.equal(DB.get('preAgreements/paA').checkoutSessionId,'cs_test_1');},
 async simultaneousRetry(){reset();const responses=await Promise.all([drive(),drive()]);assert(responses.some(r=>r.code===200));assert.equal(io.idempotent.size,1);assert.equal(new Set(io.keys).size,1);},
 async legacy(){reset();DB.get('preAgreements/paA').checkoutSessionId='legacy';io.sessions.legacy={id:'legacy',status:'open',payment_status:'unpaid',amount_total:90049,currency:'eur',metadata:{token},expires_at:Math.floor(Date.now()/1000)+3600,url:'https://stripe.test/legacy'};const r=await drive();assert.equal(r.code,200);assert.equal(r.body.checkoutUrl,'https://stripe.test/legacy');assert.equal(io.checkouts.length,0);await drive();assert.equal(io.checkouts.length,0);},
 async legacyPaid(){reset();DB.get('preAgreements/paA').checkoutSessionId='legacy';io.sessions.legacy={id:'legacy',status:'complete',payment_status:'paid',amount_total:90049,currency:'eur',metadata:{token}};const before=structuredClone(DB.get('preAgreements/paA'));assert.equal((await drive()).body.error,'payment_verification_pending');assert.equal(io.checkouts.length,0);assert.deepEqual(DB.get('preAgreements/paA'),before);},
 async legacyUnknown(){reset();DB.get('preAgreements/paA').checkoutSessionId='missing';assert.equal((await drive()).code,503);assert.equal(io.checkouts.length,0);},
 async legacyExpired(){reset();DB.get('preAgreements/paA').checkoutSessionId='legacy';io.sessions.legacy={id:'legacy',status:'expired',payment_status:'unpaid',amount_total:90049,currency:'eur',metadata:{token},expires_at:Math.floor(Date.now()/1000)-60};assert.equal((await drive()).code,200);assert.equal(io.idempotent.size,1);assert.equal(DB.get('preAgreements/paA').checkoutAttempt.legacy,undefined);},
 async expiredAttemptPaid(){reset();await drive();const pa=DB.get('preAgreements/paA'),sid=pa.checkoutSessionId;pa.checkoutAttempt.expiresAt=1;Object.assign(io.sessions[sid],{status:'complete',payment_status:'paid',url:null});assert.equal((await drive()).body.error,'payment_verification_pending');assert.equal(io.idempotent.size,1);},
 async expiredUnknownAttempt(){reset();io.loseResponse=true;await drive();DB.get('preAgreements/paA').checkoutAttempt.expiresAt=1;assert.equal((await drive()).body.error,'payment_verification_pending');assert.equal(io.checkouts.length,1);},
 async paidIdempotentResponse(){reset();io.loseResponse=true;await drive();Object.assign([...io.idempotent.values()][0].session,{status:'complete',payment_status:'paid',url:null});assert.equal((await drive()).body.error,'payment_verification_pending');assert.equal(io.idempotent.size,1);assert(!DB.get('preAgreements/paA').checkoutSessionId);},
 async paid(){reset();DB.get('preAgreements/paA').paidSessionId='verified';const before=structuredClone([...DB]);assert.equal((await drive()).body.error,'already_paid');assert.deepEqual([...DB],before);assert.equal(io.checkouts.length,0);},
 async sweep(){reset();DB.set(path('01'),hold('paA',{heldAt:old}));commitHook=()=>{DB.get('preAgreements/paA').paidSessionId='verified';};await L.sweepLocks();assert.equal(DB.get(path('01'))?.paId,'paA','Concurrent payment prevents sweep deletion');},
 async confirmRace(){reset();await L.acquireLock({pa:proposal,paId:'paA'});commitHook=()=>DB.set(path('01'),hold('paidB',{firm:true}));await L.confirmLock({pa:proposal,paId:'paA'});assert.equal(DB.get(path('01')).paId,'paidB');assert.equal(DB.get(path('02')).firm,true);},
};
if(process.env.PA_LOCK_MUTATION){await tests[process.env.PA_LOCK_MUTATION]();process.exit(0);}
for(const [label,test]of Object.entries(tests)){await test();console.log('PASS '+label);}
for(const mutation of ['resume','cas','read','release']){const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,PA_LOCK_MUTATION:mutation},encoding:'utf8',timeout:20000});assert.equal(child.status,1,mutation+' must fail: '+child.stderr);assert.match(child.stderr,/AssertionError/);console.log('PASS mutation '+mutation);}
console.log(Object.keys(tests).length+' lock/payment recovery scenarios +4 mutations passed');
