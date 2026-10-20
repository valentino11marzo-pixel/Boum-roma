import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import JOBS from '../../js/smartlink-import-engine.js';
import {toFsFields,fsDocToJs} from '../../api/homie/_lib.js';
import jobs from '../../api/smartlink/jobs.js';
import worker from '../../api/smartlink/worker.js';
import {processOne,readListing} from '../../tools/smartlink-worker/reader.mjs';

const originalFetch=globalThis.fetch, originalFlag=process.env.SMARTLINK_REMOTE_ENABLED,originalSecret=process.env.HOMIE_SECRET;
process.env.SMARTLINK_REMOTE_ENABLED='1';process.env.HOMIE_SECRET='worker-test-secret';
const docs=new Map(), writes=[], uploads=[];
let revision=0,brokenPhotos=false;
const source='https://www.immobiliare.it/annunci/124483437/';
const photo='https://pwm.im-cdn.it/image/1823571757/m-c.jpg';
const bytes=await sharp({create:{width:12,height:8,channels:3,background:'#ececec'}}).jpeg().toBuffer();
const pathOf=name=>name.split('/documents/')[1];
const put=(path,data)=>docs.set(path,{name:'projects/test/databases/(default)/documents/'+path,fields:toFsFields(data),updateTime:'v'+(++revision)});
for(const uid of ['admin','other']) put('users/'+uid,{role:'admin'});
put('users/tenant',{role:'tenant'});
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(body){this.body=body;return this;}};}
async function operator(method,body={},uid='admin') {const r=response();await jobs({method,body,query:body,headers:{authorization:'Bearer '+uid}},r);return r;}
async function reader(body,secret='worker-test-secret') {const r=response();await worker({method:'POST',body,headers:{'x-homie-secret':secret}},r);return r;}
const jobData=id=>fsDocToJs(docs.get('smartlinkImports/'+id));
const editJob=(id,patch)=>put('smartlinkImports/'+id,{...jobData(id),...patch});
globalThis.fetch=async(input,opts={})=>{
  const u=new URL(String(input)),body=opts.body && typeof opts.body==='string'?JSON.parse(opts.body):{};
  if(u.hostname==='identitytoolkit.googleapis.com') return u.pathname.endsWith('signInWithPassword')?Response.json({idToken:'server-token'}):Response.json({users:[{localId:body.idToken}]});
  if(u.hostname==='pwm.im-cdn.it') return brokenPhotos?new Response('',{status:403}):new Response(bytes,{headers:{'content-type':'image/jpeg'}});
  if(u.hostname==='firebasestorage.googleapis.com') {
    uploads.push(u.searchParams.get('name'));
    assert.equal(opts.headers.Authorization,'Bearer server-token');
    assert.equal((await sharp(opts.body).metadata()).format,'webp');
    return Response.json({name:uploads.at(-1)});
  }
  assert.equal(u.hostname,'firestore.googleapis.com','No unexpected network destination');
  if(u.pathname.endsWith(':runQuery')) {
    const q=body.structuredQuery,filter=q.where?.fieldFilter;
    let result=[...docs.values()].filter(doc=>pathOf(doc.name).split('/')[0]===q.from[0].collectionId);
    if(filter) result=result.filter(doc=>JSON.stringify(doc.fields[filter.field.fieldPath])===JSON.stringify(filter.value));
    if(q.orderBy) result.sort((a,b)=>String(b.fields.createdAt?.stringValue).localeCompare(String(a.fields.createdAt?.stringValue)));
    return Response.json(result.slice(0,q.limit).map(document=>({document})));
  }
  if(u.pathname.endsWith(':commit')) {
    for(const write of body.writes) {
      const current=docs.get(pathOf(write.update.name));
      if(current?.updateTime!==write.currentDocument?.updateTime) return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:409});
    }
    for(const write of body.writes) {
      const path=pathOf(write.update.name),current=docs.get(path);
      assert.ok(write.updateMask.fieldPaths.length);
      docs.set(path,{...current,fields:{...current.fields,...write.update.fields},updateTime:'v'+(++revision)});writes.push(path);
    }
    return Response.json({writeResults:[]});
  }
  const path=pathOf(u.pathname);
  if(opts.method==='POST') {
    const target=path+'/'+u.searchParams.get('documentId');
    if(docs.has(target)) return new Response('',{status:409});
    docs.set(target,{name:'projects/test/databases/(default)/documents/'+target,fields:body.fields,updateTime:'v'+(++revision)});writes.push(target);return Response.json({name:target});
  }
  if(opts.method==='PATCH') {
    docs.set(path,{name:'projects/test/databases/(default)/documents/'+path,fields:{...docs.get(path)?.fields,...body.fields},updateTime:'v'+(++revision)});writes.push(path);return Response.json(docs.get(path));
  }
  return docs.has(path)?Response.json(docs.get(path)):new Response('',{status:404});
};
try {
  const draftKey=crypto.randomUUID();
  assert.equal((await operator('POST',{url:source,draftKey},'tenant')).code,403);
  assert.equal((await reader({op:'pull'},'wrong')).code,401);
  process.env.SMARTLINK_REMOTE_ENABLED='0';
  assert.equal((await operator('POST',{url:source,draftKey})).body.error,'reader_not_enabled');
  assert.equal((await reader({op:'pull'})).body.enabled,false);
  process.env.SMARTLINK_REMOTE_ENABLED='1';
  const requests=await Promise.all([operator('POST',{url:source,draftKey}),operator('POST',{url:source,draftKey})]);
  const id=requests[0].body.job.id;
  assert.equal(requests[1].body.job.id,id);
  assert.equal([...docs.keys()].filter(k=>k.startsWith('smartlinkImports/')).length,1,'Double submit must be idempotent');
  assert.equal((await operator('GET',{id},'other')).code,404,'Other operator cannot resume a private source');
  assert.equal((await operator('POST',{url:source.replace('124483437','999'),draftKey})).code,409);
  const claims=await Promise.all([reader({op:'pull'}),reader({op:'pull'})]);
  assert.equal(claims.filter(c=>c.body.job).length,1,'Concurrent readers must not own the same lease');
  const claim=claims.find(c=>c.body.job).body.job;
  assert.equal((await operator('GET',{id})).body.online,true);
  assert.equal((await operator('GET',{id})).body.job.leaseToken,undefined);
  assert.equal((await reader({op:'complete',id,leaseToken:'stale',status:'ready'})).code,409);
  const packet={op:'complete',id,leaseToken:claim.leaseToken,status:'ready',sourceUrl:source,images:[photo],data:{title:'Bilocale test',price:1500,sqm:50,rooms:2,zone:'Cipro',privateAgency:'must not persist'}};
  assert.equal((await reader({...packet,sourceUrl:source.replace('124483437','999')})).code,400);
  assert.equal((await reader({...packet,images:['https://evil.example/p.jpg']})).code,400);
  brokenPhotos=true;
  assert.equal((await reader(packet)).body.error,'photo_archive_failed');
  assert.equal(jobData(id).status,'reading','An empty archive must not claim success');
  brokenPhotos=false;
  assert.equal((await reader(packet)).code,200);
  const ready=(await operator('GET',{id})).body.job;
  assert.equal(ready.status,'ready');assert.equal(ready.images.length,1);
  assert.ok(ready.images[0].includes(encodeURIComponent('smartlinks/'+draftKey+'/')));
  assert.equal(ready.data.privateAgency,undefined);assert.equal(ready.completedToken,undefined);
  const uploadCount=uploads.length;
  assert.equal((await reader(packet)).body.duplicate,true);
  assert.equal(uploads.length,uploadCount,'Retrying an acknowledged completion must not rearchive');
  assert.equal((await operator('GET')).body.jobs.length,1);
  assert.equal((await operator('GET',{},'other')).body.jobs.length,0);

  const recovery=(await operator('POST',{url:source,draftKey:crypto.randomUUID()})).body.job;
  const first=(await reader({op:'pull'})).body.job;
  editJob(recovery.id,{leaseUntil:new Date(Date.now()-1).toISOString()});
  const second=(await reader({op:'pull'})).body.job;
  assert.notEqual(first.leaseToken,second.leaseToken);
  assert.equal((await reader({...packet,id:recovery.id,leaseToken:first.leaseToken})).code,409);
  editJob(recovery.id,{leaseUntil:new Date(Date.now()-1).toISOString()});
  assert.equal((await reader({op:'pull'})).body.job,null);
  assert.equal(jobData(recovery.id).error,'reader_interrupted');
  const old=(await operator('POST',{url:source,draftKey:crypto.randomUUID()})).body.job;
  editJob(old.id,{createdAt:new Date(Date.now()-JOBS.MAX_AGE_MS-1).toISOString()});
  await reader({op:'pull'});assert.equal(jobData(old.id).status,'expired');
  for(let i=0;i<5;i++) assert.equal((await operator('POST',{url:source,draftKey:crypto.randomUUID()})).code,202);
  assert.equal((await operator('POST',{url:source,draftKey:crypto.randomUUID()})).body.error,'too_many_pending');
  const blocked=(await reader({op:'pull'})).body.job;
  assert.equal((await reader({op:'complete',id:blocked.id,leaseToken:blocked.leaseToken,status:'needs_attention',error:'source_blocked'})).code,200);
  assert.equal(jobData(blocked.id).status,'needs_attention');
  assert.ok(writes.every(path=>/^(smartlinkImports|smartlinkWorkers)\//.test(path)),'Import never publishes or modifies PFS');
  assert.equal(JOBS.workerOnline({lastSeenAt:new Date(Date.now()+10000).toISOString()},Date.now()),false);
  const longWait={status:'queued',createdAt:new Date(Date.now()-JOBS.MAX_AGE_MS-1).toISOString()};
  assert.equal(JOBS.view(longWait).status,'expired');
  assert.equal(JOBS.view({...longWait,status:'reading',leaseUntil:new Date(Date.now()+60000).toISOString()}).status,'reading','A valid in-flight lease must not look expired while archiving photos');

  let reads=0,acks=0,sleeps=0;
  await processOne(claim,async()=>{reads++;return {status:'unavailable',error:'reader_error'};},async()=>{if(++acks<3) throw new Error('lost ACK');return {ok:true};},async()=>{sleeps++;});
  assert.equal(reads,1);assert.equal(acks,3);assert.equal(sleeps,2);
  acks=0;
  await assert.rejects(processOne(claim,async()=>({status:'unavailable'}),async()=>{acks++;throw Object.assign(new Error('stale'),{status:409});},async()=>{}));
  assert.equal(acks,1);
  let closed=0,evaluations=0,status=403,actualUrl=source;
  const page={goto:async()=>({status:()=>status,ok:()=>status===200}),url:()=>actualUrl,locator:()=>({waitFor:async()=>{}}),evaluate:async()=>{evaluations++;return evaluations%2===1?false:{images:[photo],data:{title:'Bilocale'}};},close:async()=>{closed++;}};
  const context={newPage:async()=>page};
  assert.equal((await readListing(context,source)).error,'source_blocked');assert.equal(evaluations,0);assert.equal(closed,1);
  status=404;assert.equal((await readListing(context,source)).error,'listing_removed');
  status=200;actualUrl='https://www.immobiliare.it/annunci/999/';assert.equal((await readListing(context,source)).error,'source_changed');
  actualUrl=source;assert.equal((await readListing(context,source)).status,'ready');
  // CasaFari: cinque foto nel riepilogo, sei nella galleria. L'ultima
  // deve arrivare dalla navigazione reale prima di dichiarare "ready".
  const share='https://it.casafari.com/estate/sharepage/test/23310686611';
  let slide=1, checks=0, nextClicks=0, opened=false, incomplete=false;
  const galleryImages=Array.from({length:6},(_,i)=>`https://pwm.im-cdn.it/image/${100+i}/xxl.jpg`);
  const galleryPage={
    goto:async()=>({status:()=>200,ok:()=>true}),url:()=>share,close:async()=>{},
    locator:selector=>({
      first(){return this;},
      waitFor:async()=>{},
      textContent:async()=>`${slide} / 6`,
      click:async()=>{
        if(selector==='.PropertyGallery__image-button') {opened=true;return;}
        assert.equal(selector,'.FullScreenGallery__arrow--next','No sharing or contact controls');
        slide++;nextClicks++;
      }
    }),
    waitForFunction:async(fn,expected)=>{assert.equal(slide,expected);checks++;},
    evaluate:async(fn)=>{
      if(fn.name!=='listingSnapshot') return false;
      assert.equal(opened,true);
      return {images:incomplete?galleryImages.slice(0,5):[...galleryImages.slice(0,5),galleryImages[slide-1]],data:{title:'Appartamento in via Piave'}};
    }
  };
  const full=await readListing({newPage:async()=>galleryPage},share);
  assert.equal(full.status,'ready');assert.deepEqual(full.images,galleryImages);
  assert.equal(nextClicks,5);assert.equal(checks,5);
  incomplete=true;slide=1;
  assert.equal((await readListing({newPage:async()=>galleryPage},share)).status,'unavailable','A gallery missing a declared photo cannot be marked complete');
  console.log('SmartLink remoto: coda privata, doppio invio, claim concorrente, recovery, ACK, archivio WebP e blocchi fonte ✓');
} finally {
  globalThis.fetch=originalFetch;
  if(originalFlag===undefined) delete process.env.SMARTLINK_REMOTE_ENABLED;else process.env.SMARTLINK_REMOTE_ENABLED=originalFlag;
  if(originalSecret===undefined) delete process.env.HOMIE_SECRET;else process.env.HOMIE_SECRET=originalSecret;
}
