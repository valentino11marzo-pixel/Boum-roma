import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.FIREBASE_PROJECT_ID='adoption-test';
process.env.FIREBASE_API_KEY='test';
process.env.FIREBASE_ADMIN_EMAIL='admin@example.invalid';
process.env.FIREBASE_ADMIN_PASS='test-only';
process.env.HOMIE_SECRET='test-only';
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;

const encode=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:fields(v)}};
const fields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));
const decode=v=>'nullValue'in v?null:'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?Number(v.integerValue):'arrayValue'in v?(v.arrayValue.values||[]).map(decode):Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
const store=new Map(),versions=new Map(),writes=[];
let clock=0,commitHook=null,malformed=false,readFail=null,missingVersion=null;
const at='2026-10-26T10:00:00.000Z';
function put(path,data){store.set(path,structuredClone(data));versions.set(path,'v'+(++clock));}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const doc=path=>({name:'projects/adoption-test/databases/(default)/documents/'+path,fields:fields(store.get(path)),...(missingVersion===path?{}:{updateTime:versions.get(path)})});
const root='/databases/(default)/documents';
globalThis.fetch=async(url,opts={})=>{
  url=String(url);const body=opts.body?JSON.parse(opts.body):null;
  if(url.includes('accounts:signInWithPassword'))return response({idToken:'test-token'});
  if(url.endsWith(root+':runQuery')){
    if(malformed)return response({documents:[]});
    const q=body.structuredQuery,coll=q.from[0].collectionId;
    const rows=[...store.keys()].filter(p=>p.startsWith(coll+'/')).slice(0,q.limit).map(p=>({document:doc(p)}));
    return response(rows);
  }
  if(url.endsWith(root+':commit')){
    if(commitHook)await commitHook(body.writes);
    for(const w of body.writes){
      const path=(w.update?.name||w.delete).split('/documents/')[1],pre=w.currentDocument;
      assert(pre,'every write must have a precondition');
      if(pre.updateTime && versions.get(path)!==pre.updateTime || 'exists'in pre && store.has(path)!==pre.exists)
        return response({error:{status:'FAILED_PRECONDITION'}},409);
    }
    writes.push(structuredClone(body.writes));
    for(const w of body.writes){
      if(w.delete)continue; // conditional absence check, never a real deletion
      const path=w.update.name.split('/documents/')[1];
      assert(w.updateMask && Array.isArray(w.updateMask.fieldPaths),'explicit masks protect untouched fields');
      const value={...(store.get(path)||{})};
      for(const key of w.updateMask.fieldPaths)value[key]=decode(w.update.fields[key]);
      // Empty masks are only guards; no fictitious version bump helps the tests.
      if(w.updateMask.fieldPaths.length)put(path,value);
    }
    return response({commitTime:at});
  }
  const path=url.split(root+'/')[1]?.split('?')[0];
  if(path && (!opts.method||opts.method==='GET')){
    if(path===readFail)return response({},503);
    return store.has(path)?response(doc(path)):response({},404);
  }
  throw new Error('Unexpected network or mutation');
};
const {prepareAdoption,applyAdoption,portalReference}=await import('../../scripts/catalogo-adopt-portals.mjs');
const {IDENTITY_REVISION_PATH}=await import('../../api/publisher/_adoption.js');
const {worklist}=await import('../../api/publisher/_state.js');
const {fsGetVersioned,fsList,fsCommit}=await import('../../api/homie/_lib.js');
const io={get:fsGetVersioned,list:fsList,commit:fsCommit};
const manifest=(listingId='one',remoteId='123456')=>({version:1,confirmedBy:'reviewer@example.invalid',mappings:[{
  listingId,portal:'idealista',remoteId,remoteUrl:'https://www.idealista.it/immobile/'+remoteId+'/',
  observedAt:'2026-10-26T09:00:00.000Z',evidence:'Own agency account, checked address and current reference.'}]});
function reset(){store.clear();versions.clear();writes.length=0;commitHook=null;malformed=false;readFail=null;missingVersion=null;
  put('settings/publisher',{enabled:false,portals:{idealista:{enabled:true}}});
  for(const id of ['one','two'])put('listings/'+id,{name:'Casa '+id,address:'Via Esempio '+id,price:1000,bedrooms:1,status:'available',availableKind:'now',privateField:'preserve'});
}
reset();
const original=structuredClone([...store]);
let prepared=await prepareAdoption(manifest(),{now:at});
assert.equal(writes.length,0,'preview never writes');
assert.equal(prepared.plan.changes,1);
assert.equal(prepared.plan.mappings[0].address,'Via Esempio one');
assert(!JSON.stringify(prepared.plan).includes('privateField'),'preview contains only reviewed identity fields');
await assert.rejects(()=>applyAdoption(prepared.plan,'bad',{now:at}),/confirmed_plan_required/);
await applyAdoption(prepared.plan,prepared.plan.fingerprint,{now:at});
const adopted=store.get('portalPubs/idealista_one');
assert.equal(adopted.managementMode,'reference_only');
for(const key of ['hash','wasLive','status','publishedAt','lastRunAt'])assert(!(key in adopted),key+' is not invented');
assert.deepEqual([...store].filter(([p])=>original.some(([x])=>x===p)),original,'all listing/config fields unchanged');
assert.equal(store.get(IDENTITY_REVISION_PATH).revision,1);
assert.equal(writes.length,1,'one atomic batch');
assert.deepEqual(await applyAdoption(prepared.plan,prepared.plan.fingerprint,{now:at}),{ok:true,alreadyApplied:true,adopted:0});
assert.equal(writes.length,1,'retry after lost response writes nothing');
assert.equal(worklist([{id:'one',...store.get('listings/one')}],[adopted],{portal:'idealista'}).actions.length,0);

// The actual voice handler already uses these references. No new identity index.
const {default:phone}=await import('../../api/phone/agent-tools.js');
const res=()=>({code:0,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
for(const reference of ['123456',adopted.remoteUrl]){
  const r=res();await phone({method:'GET',headers:{'x-homie-secret':'test-only'},query:{op:'catalog',reference}},r);
  assert.equal(r.code,200);assert.equal(r.body.match,'exact');assert.equal(r.body.results[0].id,'one');
  assert.equal(r.body.results[0].priceEurMonth,1000);assert.equal(r.body.results[0].bedrooms,1);
}

for(const alter of [
  x=>{x.mappings.push({...x.mappings[0]});},
  x=>{x.mappings[0].remoteUrl='https://evil.invalid/immobile/123456/';},
  x=>{x.mappings[0].remoteId='999';},
  x=>{x.mappings[0].listingId='../secret';},
  x=>{x.mappings[0].hash='fake';},
  x=>{x.confirmedBy='';},
]){reset();const x=manifest();alter(x);await assert.rejects(()=>prepareAdoption(x,{now:at}));assert.equal(writes.length,0);}
assert.equal(portalReference('immobiliare','https://immobiliare.it/annunci/987654','987654').remoteUrl,'https://www.immobiliare.it/annunci/987654/');
reset();put('portalPubs/idealista_two',{portal:'idealista',listingId:'two',remoteId:'123456'});
await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/remote_reference_already_assigned/);
for(const portal of [undefined,'immobiliare']) {
  reset();put('portalPubs/legacy_two',{...(portal?{portal}:{}),listingId:'two',remoteUrl:'https://www.idealista.it/immobile/123456/'});
  await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/remote_reference_already_assigned/);
}
reset();put('portalPubs/idealista_one',{portal:'idealista',listingId:'one',remoteId:'999'});
await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/target_reference_conflict/);
reset();put('portalPubs/idealista_one',{portal:'idealista',listingId:'two'});
await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/target_identity_conflict/);
reset();put('portalPubs/legacy_alias',{portal:'idealista',listingId:'one',remoteId:'999'});
await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/target_alias_conflict/);
reset();store.delete('listings/one');await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/listing_not_found/);
reset();put('settings/publisher',{enabled:true});await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/publisher_must_be_disabled/);
reset();malformed=true;await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/response invalid/);
reset();readFail='portalPubs/idealista_one';await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/versioned read failed/);
reset();missingVersion='listings/one';await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/version missing/);
reset();for(let i=0;i<401;i++)put('portalPubs/legacy_'+i,{portal:'idealista',listingId:'legacy'+i});
await assert.rejects(()=>prepareAdoption(manifest(),{now:at}),/incomplete_portal_scan/);

reset();prepared=await prepareAdoption(manifest(),{now:at});put('listings/one',{...store.get('listings/one'),price:1200});
await assert.rejects(()=>applyAdoption(prepared.plan,prepared.plan.fingerprint,{now:at}),/plan_changed/);assert.equal(writes.length,0);
reset();prepared=await prepareAdoption(manifest(),{now:at});
commitHook=async()=>{commitHook=null;put('listings/one',{...store.get('listings/one'),price:1200});};
await assert.rejects(()=>applyAdoption(prepared.plan,prepared.plan.fingerprint,{now:at}),e=>e.conflict===true);
assert(!store.has('portalPubs/idealista_one'));assert.equal(writes.length,0,'version race leaves entire batch untouched');

// Two different BOOM IDs race for one code. A real increment, not an empty
// updateMask, makes only one atomic commit possible despite phantom inserts.
reset();const first=await prepareAdoption(manifest('one'),{now:at}),second=await prepareAdoption(manifest('two'),{now:at});
let release;const barrier=new Promise(r=>{release=r});let arrived=0;
commitHook=async()=>{if(++arrived===2)release();await barrier;};
const raced=await Promise.allSettled([applyAdoption(first.plan,first.plan.fingerprint,{now:at}),applyAdoption(second.plan,second.plan.fingerprint,{now:at})]);
assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);
assert.equal(writes.length,1);assert.equal([...store.keys()].filter(x=>x.startsWith('portalPubs/')).length,1);

// Mutation: drop the shared revision write. Distinct targets would both win.
reset();const m1=await prepareAdoption(manifest('one'),{now:at}),m2=await prepareAdoption(manifest('two'),{now:at});
const withoutRevision=ws=>ws.filter(w=>w.docPath!==IDENTITY_REVISION_PATH);
await fsCommit(withoutRevision(m1.writes));await fsCommit(withoutRevision(m2.writes));
assert.throws(()=>assert.equal([...store.keys()].filter(x=>x.startsWith('portalPubs/')).length,1),'shared revision mutant killed');

// CLI stays read-only by default and never loads secrets or publishes.
const source=readFileSync(new URL('../../scripts/catalogo-adopt-portals.mjs',import.meta.url),'utf8');
assert(!source.includes('dotenv')&&!source.includes('publisher/queue')&&!source.includes('tgNotify'));
console.log('PASS portaladoption: preview, canonical IDs, no fake receipts, idempotence, conflicts, strict scans, real conditional commit, voice references, concurrent identities and revision mutation.');
