import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
Object.assign(process.env,{FIREBASE_API_KEY:'test',FIREBASE_ADMIN_EMAIL:'admin@example.test',FIREBASE_ADMIN_PASS:'synthetic',FIREBASE_PROJECT_ID:'test'});
const require=createRequire(import.meta.url),engine=require('../../js/tenant-workspace-engine.js');
const store=new Map(),versions=new Map(),writes=[];let tick=0,queryFailure=false,conflict=false,readAfterWriteFailure=false;
const encode=v=>v==null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{doubleValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:typeof v==='object'?{mapValue:{fields:fields(v)}}:{stringValue:String(v)};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,encode(v)]));
const decode=v=>'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)])):'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'integerValue'in v?Number(v.integerValue):Object.values(v)[0];
const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
const version=key=>versions.get(key)||'2026-10-05T00:00:00.000Z';
const doc=key=>({name:'projects/test/databases/(default)/documents/'+key,fields:fields(store.get(key)),updateTime:version(key)});
globalThis.fetch=async (input,opts={})=>{
  const u=new URL(input),b=opts.body?JSON.parse(opts.body):{};
  if(u.hostname==='identitytoolkit.googleapis.com'){
    if(u.pathname.includes('signInWithPassword'))return json({idToken:'synthetic-server'});
    return ['tenant','other','admin','landlord'].includes(b.idToken)?json({users:[{localId:b.idToken,email:b.idToken+'@example.test'}]}):json({},401);
  }
  assert.equal(u.hostname,'firestore.googleapis.com','No external network permitted');
  if(u.pathname.endsWith(':runQuery')){
    if(queryFailure)return json({},503);
    const q=b.structuredQuery,f=q.where.fieldFilter;
    return json([...store.keys()].filter(k=>k.startsWith(q.from[0].collectionId+'/')&&store.get(k)[f.field.fieldPath]===decode(f.value)).slice(0,q.limit).map(k=>({document:doc(k)})));
  }
  if(u.pathname.endsWith(':commit')){
    if(conflict||b.writes.some(w=>{const k=w.update.name.split('/documents/')[1];return w.currentDocument.exists===false?store.has(k):w.currentDocument.updateTime!==version(k)}))return json({error:{status:'FAILED_PRECONDITION'}},409);
    for(const w of b.writes){
      const k=w.update.name.split('/documents/')[1];assert.deepEqual(w.updateMask.fieldPaths,Object.keys(w.update.fields));
      const patch=Object.fromEntries(Object.entries(w.update.fields).map(([k,v])=>[k,decode(v)]));
      if(Object.keys(patch).length){writes.push(k);store.set(k,{...store.get(k),...patch});versions.set(k,new Date(Date.parse('2026-10-05')+(++tick)).toISOString())}
    }
    return json({writeResults:[]});
  }
  const key=decodeURIComponent(u.pathname.split('/documents/')[1]||'');
  if(readAfterWriteFailure&&key.startsWith('maintenance/')&&store.has(key)){readAfterWriteFailure=false;return json({},503)}
  return store.has(key)?json(doc(key)):json({},404);
};
for(const role of ['tenant','other','admin','landlord'])store.set('users/'+role,{role:role==='other'?'tenant':role});
const c={tenantId:'tenant',propertyId:'home',status:'draft',startDate:'2027-01-01'};
store.set('contracts/current',c);store.set('contracts/other',{...c,tenantId:'other'});
const {default:documents}=await import('../../api/tenant/documents.js');
const {default:maintenance}=await import('../../api/tenant/maintenance.js');
const {default:notifications}=await import('../../api/tenant/notifications.js');
const call=async(handler,body={},who='tenant',method='POST')=>{const r={code:0,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}};await handler({method,headers:{authorization:'Bearer '+who},...(method==='GET'?{query:body}:{body})},r);return r};
const base={contractId:'current',requestId:'request-1',category:'idraulica',priority:'normal',description:'Water is dripping under the kitchen sink.',availability:'Tomorrow after 17:00'};
let passed=0;async function test(name,fn){await fn();console.log('PASS '+name);passed++}
await test('personal notifications reject other accounts and unsupported methods',async()=>{
  for(const who of ['anonymous','landlord','other'])assert.ok((await call(notifications,{contractId:'current'},who,'GET')).code>=400);
  assert.equal((await call(notifications,{contractId:'current'})).code,405);
  assert.equal((await call(notifications,{contractId:'../users'},'tenant','GET')).code,400);
});
await test('personal inbox returns only own text, never arbitrary actions or URLs',async()=>{
  store.set('notifications/mine',{userId:'tenant',title:'Update',message:'Available',createdAt:'2026-10-13',read:false,data:{url:'https://other.example'},secret:'private-field'});
  store.set('notifications/theirs',{userId:'other',title:'Other private update'});
  const r=await call(notifications,{contractId:'current'},'tenant','GET');assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');
  assert.deepEqual(r.body.notifications,[{id:'mine',title:'Update',message:'Available',createdAt:'2026-10-13',read:false}]);
  assert.equal((await call(notifications,{contractId:'current'},'admin','GET')).body.notifications.length,1);
});
await test('unavailable notifications never become a successful empty inbox',async()=>{
  queryFailure=true;assert.equal((await call(notifications,{contractId:'current'},'tenant','GET')).code,503);queryFailure=false;
});
await test('only authenticated tenants and admins can read the archive',async()=>{
  for(const who of ['anonymous','landlord','other'])assert.ok((await call(documents,{contractId:'current'},who,'GET')).code>=400);
});
await test('invalid contract paths and unsupported methods fail closed',async()=>{
  assert.equal((await call(documents,{contractId:'../users'},'tenant','GET')).code,400);
  assert.equal((await call(documents,{contractId:'current'})).code,405);
  assert.equal((await call(maintenance,{...base,action:'create'},'tenant','GET')).code,405);
});
await test('archive admits own and explicitly shared contract files; excludes other tenants and unsafe URLs',async()=>{
  const docs=[
    {id:'own',userId:'tenant',contractId:'current',fileUrl:'https://files.example.test/own',name:'My lease'},
    {id:'personal',userId:'tenant',url:'https://files.example.test/personal'},
    {id:'shared',contractId:'current',shared:true,url:'https://files.example.test/manual'},
    {id:'wrong-tenant',contractId:'current',userId:'other',shared:true,url:'https://files.example.test/private'},
    {id:'wrong-contract',userId:'tenant',contractId:'other',url:'https://files.example.test/other'},
    {id:'wrong-home',userId:'tenant',propertyId:'elsewhere',url:'https://files.example.test/elsewhere'},
    {id:'unsafe',userId:'tenant',url:'javascript:alert(1)'},
    {id:'duplicate',userId:'tenant',url:'https://files.example.test/own'},
    {id:'property-only',shared:true,propertyId:'home',url:'https://files.example.test/former'},
  ];docs.forEach(d=>store.set('documents/'+d.id,d));
  const r=await call(documents,{contractId:'current'},'tenant','GET');assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'no-store');
  assert.deepEqual(new Set(r.body.documents.map(d=>d.url)),new Set(['https://files.example.test/own','https://files.example.test/personal','https://files.example.test/manual']));
  assert.equal(JSON.stringify(r.body).includes('private'),false);
});
await test('archive query failure is an error, never an empty successful archive',async()=>{queryFailure=true;assert.equal((await call(documents,{contractId:'current'},'tenant','GET')).code,503);queryFailure=false});
await test('archive truncation is declared',async()=>{
  for(let i=0;i<201;i++)store.set('documents/limit'+i,{userId:'tenant',url:'https://files.example.test/'+i});
  assert.equal((await call(documents,{contractId:'current'},'tenant','GET')).body.limited,true);
});
await test('tenant cannot create a request on someone else’s contract',async()=>{const before=writes.length;assert.equal((await call(maintenance,{...base,contractId:'other'})).code,403);assert.equal(writes.length,before)});
await test('draft contract can create a request without signature or registration',async()=>{
  const r=await call(maintenance,{...base,status:'resolved',cost:900,propertyId:'other',userId:'other',delivery:{state:'sent'}});assert.equal(r.code,200);
  const m=store.get('maintenance/'+r.body.ticket.id);assert.equal(m.status,'open');assert.equal(m.userId,'tenant');assert.equal(m.propertyId,'home');assert.equal(m.cost,undefined);assert.equal(m.delivery,undefined);assert.equal(r.body.ticket.delivery,'not_configured');
});
let ticketId=(await call(maintenance,base)).body.ticket.id;
await test('retry after a lost response returns the same ticket without another write',async()=>{const before=writes.length;const r=await call(maintenance,base);assert.equal(r.body.ticket.id,ticketId);assert.equal(writes.length,before)});
await test('reusing the same request key with different content conflicts',async()=>{assert.equal((await call(maintenance,{...base,description:'A completely different problem'})).code,409)});
await test('urgent client priority is normalized for the existing admin queue',async()=>{const r=await call(maintenance,{...base,requestId:'urgent',priority:'emergency'});assert.equal(r.body.ticket.priority,'urgent')});
await test('malformed and excessive content is rejected',async()=>{
  for(const patch of [{description:'x'},{description:'x'.repeat(3001)},{availability:'x'.repeat(501)},{category:'unknown'},{priority:'free'},{requestId:'bad/id'}])assert.equal((await call(maintenance,{...base,...patch})).code,400);
});
await test('concurrent duplicate creation makes one primary write',async()=>{
  const before=writes.length;const rs=await Promise.all([call(maintenance,{...base,requestId:'race'}),call(maintenance,{...base,requestId:'race'})]);
  assert.equal(writes.length,before+1);assert.ok(rs.some(r=>r.code===200));assert.ok(rs.every(r=>[200,409].includes(r.code)));
});
await test('own edits increment revision and cannot authorize costs or resolve requests',async()=>{
  const r=await call(maintenance,{...base,action:'update',ticketId,revision:1,description:'Updated: dripping continues even with tap closed.',status:'resolved',cost:500});
  assert.equal(r.code,200);assert.equal(r.body.ticket.revision,2);assert.equal(r.body.ticket.status,'open');assert.equal(store.get('maintenance/'+ticketId).cost,undefined);
});
await test('stale edits preserve the newer request',async()=>{
  const before=store.get('maintenance/'+ticketId).description;assert.equal((await call(maintenance,{...base,action:'update',ticketId,revision:1})).code,409);assert.equal(store.get('maintenance/'+ticketId).description,before);
});
await test('other tenant and substituted contract cannot edit a request',async()=>{
  assert.equal((await call(maintenance,{...base,action:'update',ticketId,revision:2},'other')).code,403);
  assert.equal((await call(maintenance,{...base,contractId:'other',action:'update',ticketId,revision:2},'admin')).code,403);
});
await test('resolved and legacy requests are not silently reopened',async()=>{
  const m=store.get('maintenance/'+ticketId);store.set('maintenance/'+ticketId,{...m,status:'resolved'});
  assert.equal((await call(maintenance,{...base,action:'update',ticketId,revision:2})).code,409);store.set('maintenance/'+ticketId,m);
  store.set('maintenance/legacy',{userId:'tenant',propertyId:'home',contractId:'current',status:'pending'});
  assert.equal((await call(maintenance,{...base,action:'update',ticketId:'legacy',revision:0})).code,403);
});
await test('version conflict writes neither request nor contract',async()=>{
  conflict=true;const before=writes.length;assert.equal((await call(maintenance,{...base,requestId:'conflict'})).code,409);assert.equal(writes.length,before);conflict=false;
});
await test('lost post-save read can safely recover with the original request key',async()=>{
  readAfterWriteFailure=true;const r=await call(maintenance,{...base,requestId:'lost'});assert.equal(r.code,503);
  const before=writes.length;assert.equal((await call(maintenance,{...base,requestId:'lost'})).code,200);assert.equal(writes.length,before);
});
await test('list scopes requests to contract and owner, including legacy own requests',async()=>{
  store.set('maintenance/wrong',{userId:'tenant',propertyId:'home',contractId:'other'});
  store.set('maintenance/legacy-own',{userId:'tenant',propertyId:'home',status:'pending'});
  store.set('maintenance/wrong-home',{userId:'tenant',propertyId:'another-home',contractId:'current'});
  store.set('maintenance/private',{userId:'other',propertyId:'home',contractId:'current'});
  const r=await call(maintenance,{contractId:'current'},'tenant','GET');assert.equal(r.code,200);
  assert.ok(r.body.tickets.some(m=>m.id==='legacy-own'&&m.status==='open'));assert.ok(r.body.tickets.every(m=>!['wrong','private','wrong-home'].includes(m.id)));
});
await test('list failure is visible and admins can inspect the selected tenant',async()=>{
  queryFailure=true;assert.equal((await call(maintenance,{contractId:'current'},'tenant','GET')).code,503);queryFailure=false;
  assert.equal((await call(maintenance,{contractId:'current'},'admin','GET')).code,200);
});
await test('closed contracts and contracts without a home cannot open requests',async()=>{
  store.set('contracts/closed',{...c,status:'terminated'});store.set('contracts/nohome',{...c,propertyId:''});
  assert.equal((await call(maintenance,{...base,contractId:'closed'})).code,409);assert.equal((await call(maintenance,{...base,contractId:'nohome'})).code,409);
});
await test('direct client creates cannot forge server workflow metadata',()=>{
  const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
  const rule=rules.slice(rules.indexOf('match /maintenance/'),rules.indexOf('// ─── documents'));
  assert.match(rule,/!request\.resource\.data\.keys\(\)\.hasAny\(\['source', 'revision', 'requestHash', 'delivery', 'previousDelivery'\]\)/);
});
await test('tenant archive links reject credentials and executable protocols',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,test','http://files.example.test/x','https://name:password@files.example.test/x'])assert.equal(engine.url(value),'');
});
console.log(`${passed} tenant workspace scenarios passed`);
