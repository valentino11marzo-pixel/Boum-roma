import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const oldFetch=globalThis.fetch;
const envKeys=['FIREBASE_API_KEY','FIREBASE_ADMIN_EMAIL','FIREBASE_ADMIN_PASS'];
const oldEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
process.env.FIREBASE_API_KEY='archive-test-key';
process.env.FIREBASE_ADMIN_EMAIL='archive-test@example.com';
process.env.FIREBASE_ADMIN_PASS='archive-test-pass';
const RULES=(await import('../../js/smartlink-engine.js')).default;
const {toFsFields}=await import('../../api/homie/_lib.js');
const {findArchivedListing}=await import('../../api/smartlink/_reuse.js');

const url='https://www.immobiliare.it/annunci/123456789/';
const source=RULES.normalizeUrl(url);
const observedAt='2020-10-20T09:00:00.000Z';
const createdAt='2020-10-25T09:00:00.000Z';
const photo='https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/'+
  'smartlinks%2F11111111-1111-4111-8111-111111111111%2F22222222-2222-4222-8222-222222222222.webp?alt=media';
const base={id:'a'.repeat(20),sourceUrl:url,active:true,images:[photo],observedAt,
  title:'Bilocale di prova',zone:'Roma',price:1500,sqm:50,rooms:2};
const newer={...base,id:'b'.repeat(20),price:1300,createdAt};
let records=[],queries=[],failUrl=null,extraRecords=[],duplicateEverywhere=false;
let externalRequests=0,activeReads=0,maxActiveReads=0;
const document=record=>{
  const {id,...fields}=record;
  return {name:'projects/boom-property-dashboards/databases/(default)/documents/smartlinks/'+id,fields:toFsFields(fields)};
};
function reset(nextRecords=[]) {
  records=nextRecords;queries=[];failUrl=null;extraRecords=[];duplicateEverywhere=false;
  activeReads=0;maxActiveReads=0;
}
globalThis.fetch=async(input,opts={})=>{
  const u=new URL(String(input));
  if(u.hostname==='identitytoolkit.googleapis.com' && u.pathname.endsWith('accounts:signInWithPassword')) {
    assert.equal(opts.method,'POST');
    return Response.json({idToken:'archive-test-server-token'});
  }
  if(u.hostname!=='firestore.googleapis.com' || !u.pathname.endsWith('/documents:runQuery')) {
    externalRequests++;assert.fail('Archive lookup must only read its own Firestore collection');
  }
  assert.equal(opts.method,'POST');
  assert.match(u.pathname,/\/projects\/boom-property-dashboards\/databases\/\(default\)\/documents:runQuery$/);
  const q=JSON.parse(opts.body).structuredQuery,filter=q.where.fieldFilter;
  assert.deepEqual(q.from,[{collectionId:'smartlinks'}]);
  assert.equal(filter.field.fieldPath,'sourceUrl');assert.equal(filter.op,'EQUAL');
  assert.equal(q.limit,50,'Each variant has a bounded archive read');
  const requested=filter.value.stringValue;
  assert.ok(RULES.storedListingUrls(source.url).includes(requested));
  queries.push(requested);activeReads++;maxActiveReads=Math.max(maxActiveReads,activeReads);
  await Promise.resolve();activeReads--;
  if(requested===failUrl) return new Response('',{status:503});
  const matching=duplicateEverywhere?records:records.filter(record=>record.sourceUrl===requested);
  return Response.json([...matching,...extraRecords].slice(0,q.limit).map(record=>({document:document(record)})));
};

try {
  // Every historical bare/www + slash spelling resolves using only our archive.
  const variants=RULES.storedListingUrls(url);
  assert.equal(variants.length,4);assert.equal(new Set(variants).size,4);
  for(const storedUrl of variants) {
    reset([{...base,sourceUrl:storedUrl}]);
    const result=await findArchivedListing(source);
    assert.equal(result.archive.id,base.id);assert.equal(result.data.price,1500);
    assert.deepEqual(result.images,[photo]);assert.equal(result.photoOrigin,'boom_archive');
    assert.equal(result.archive.observedAt,observedAt);
    assert.deepEqual(new Set(queries),new Set(variants));assert.equal(maxActiveReads,4);
  }

  // A new publication preserves observation age but must keep its corrected rent.
  reset([base,newer]);
  const current=await findArchivedListing(source);
  assert.equal(current.archive.id,newer.id);assert.equal(current.data.price,1300);
  assert.equal(current.archive.observedAt,observedAt,'Publication time must not refresh observation time');
  assert.deepEqual(current.source,source);
  assert.equal(Object.hasOwn(RULES.publicRecord({...newer,...current.data}),'sourceUrl'),false);
  assert.equal(Object.hasOwn(current,'createdBy'),false);
  reset([newer,base]);
  assert.equal((await findArchivedListing(source)).archive.id,newer.id,'Query row order cannot change the selected version');

  // Old records need no migration: observedAt remains the fallback; malformed or
  // future publication timestamps must not outrank a real later publication.
  reset([base,{...newer,createdAt:'invalid'},{...newer,id:'c'.repeat(20),createdAt:'9999-01-01T00:00:00.000Z'},
    {...base,id:'d'.repeat(20),observedAt:'2020-10-24T09:00:00.000Z',price:1400}]);
  assert.equal((await findArchivedListing(source)).data.price,1400);
  reset([{...base,observedAt:'invalid',createdAt}]);
  assert.equal((await findArchivedListing(source)).archive.observedAt,null,'Unknown observation date stays unknown');
  reset([{...base,observedAt:'9999-01-01T00:00:00.000Z',createdAt}]);
  assert.equal((await findArchivedListing(source)).archive.observedAt,null);
  reset([{...base,createdAt},{...newer,observedAt:'2020-10-21T09:00:00.000Z'}]);
  assert.equal((await findArchivedListing(source)).archive.id,newer.id,'Observed time breaks equal publication timestamps');
  reset([{...newer,price:1200}, {...base,createdAt}]);
  assert.equal((await findArchivedListing(source)).archive.id,base.id,'Exact timestamp ties use a deterministic document ID');

  // Firestore filtering is not sufficient authorization: verify the returned
  // record and its image namespace again even if an unexpected row is returned.
  const rejected=[
    {...newer,sourceUrl:'https://www.immobiliare.it/annunci/987654321/'},
    {...newer,active:false},
    {...newer,active:'true'},
    {...newer,id:'bad-id'},
    {...newer,images:[]},
    {...newer,images:['https://pwm.im-cdn.it/image/123/xxl.jpg']},
    {...newer,images:[photo.replace('boom-property-dashboards.firebasestorage.app','foreign-bucket.appspot.com')]},
    {...newer,images:[photo.replace('smartlinks%2F','private%2F')]},
  ];
  for(const invalid of rejected) {
    reset();extraRecords=[invalid];
    assert.equal(await findArchivedListing(source),null,'Unrelated, revoked or unapproved-image records cannot feed an archive result');
  }
  reset([base]);extraRecords=rejected.map((record,i)=>({...record,id:record.id==='bad-id'?record.id:(i+1).toString().repeat(20)}));
  assert.equal((await findArchivedListing(source)).archive.id,base.id);

  // Duplicate query rows must be validated once; photos retain their gallery order.
  const photo2=photo.replace('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  reset([{...base,images:[photo2,photo,photo2]}]);duplicateEverywhere=true;
  const originalReusable=RULES.reusableImages;let validations=0;
  RULES.reusableImages=(...args)=>{validations++;return originalReusable(...args);};
  try {
    assert.deepEqual((await findArchivedListing(source)).images,[photo2,photo]);
    assert.equal(validations,1,'Repeated records are deduplicated by ID before validation');
  } finally {RULES.reusableImages=originalReusable;}

  const sixtyPhotos=Array.from({length:60},(_,i)=>photo.replace('22222222-2222-4222-8222-222222222222',String(i).padStart(8,'0')+'-2222-4222-8222-222222222222'));
  reset([{...base,images:sixtyPhotos}]);
  assert.deepEqual((await findArchivedListing(source)).images,sixtyPhotos,'A shared 60-photo gallery survives archive reopening in its original order');

  reset([base]);failUrl=variants[1];
  await assert.rejects(()=>findArchivedListing(source),/Firestore list failed \(503\)/);
  assert.equal(queries.length,4,'All variant reads settle even when one fails');
  assert.equal(activeReads,0,'A partial lookup cannot report archive success');
  reset(Array.from({length:51},(_,i)=>({...base,id:String(i).padStart(20,'0'),
    ...(i===50?{price:1300,createdAt}:{})})));
  await assert.rejects(()=>findArchivedListing(source),/SmartLink archive result limit reached/,
    'A bounded query that omits the newest publication cannot certify an older rent');
  reset(records.slice(0,50));
  await assert.rejects(()=>findArchivedListing(source),/SmartLink archive result limit reached/,
    'Exactly 50 results are also ambiguous without another read');
  reset(records.slice(0,49));
  assert.equal((await findArchivedListing(source)).data.price,1500,'A complete result below the bound remains reusable');
  reset();assert.equal(await findArchivedListing(source),null);
  reset();assert.equal(await findArchivedListing({url:'https://unrelated.example/annunci/123456789/'}),null);
  assert.equal(queries.length,0,'Invalid sources fail before a Firestore request');

  // Mutation: restoring observation-only ordering reproduces the real lost-rent
  // bug. The same behavioral assertion must fail against the mutated module.
  const implementationURL=new URL('../../api/smartlink/_reuse.js',import.meta.url);
  const implementation=await readFile(implementationURL,'utf8');
  const originalVersion='const version=record=>timestamp(record.createdAt)??timestamp(record.observedAt)??0;';
  assert.ok(implementation.includes(originalVersion),'Mutation target must exist');
  const mutated=implementation.replace(originalVersion,'const version=record=>timestamp(record.observedAt)??0;')
    .replace("'../homie/_lib.js'",JSON.stringify(new URL('../../api/homie/_lib.js',import.meta.url).href))
    .replace("'../../js/smartlink-engine.js'",JSON.stringify(new URL('../../js/smartlink-engine.js',import.meta.url).href));
  const mutant=await import('data:text/javascript,'+encodeURIComponent(mutated));
  reset([base,newer]);
  await assert.rejects(async()=>{
    const result=await mutant.findArchivedListing(source);
    assert.equal(result.data.price,1300,'Latest publication rent survives archive reuse');
  },{code:'ERR_ASSERTION'},'Observed-only sorting mutation must be caught');
  assert.equal(externalRequests,0,'No source, CDN, storage or alternate-route requests are needed');
  console.log('SmartLink archive: URL variants, latest publication, original observation, record/photo validation, fail-closed reads and ordering mutation ✓');
} finally {
  globalThis.fetch=oldFetch;
  for(const key of envKeys) {
    if(oldEnv[key]===undefined) delete process.env[key];else process.env[key]=oldEnv[key];
  }
}
