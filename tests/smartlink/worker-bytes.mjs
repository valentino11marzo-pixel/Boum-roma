import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import worker,{PHOTO_LIMIT} from '../../api/smartlink/worker.js';
import {processOne,readPhoto} from '../../tools/smartlink-worker/reader.mjs';
import {toFsFields,fsDocToJs} from '../../api/homie/_lib.js';
import JOBS from '../../js/smartlink-import-engine.js';

const source='https://www.idealista.it/immobile/37221750/';
const images=Array.from({length:15},(_,i)=>`https://img4.idealista.it/photos/house-${i+1}.jpg`);
const originals=await Promise.all(images.map((_,i)=>sharp({create:{width:16+i,height:12,channels:3,background:{r:i*13,g:80,b:140}}}).jpeg().toBuffer()));
const makeResponse=()=>({code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});

async function matrix(handler) {
  const originalFetch=globalThis.fetch,originalSecret=process.env.HOMIE_SECRET,originalNow=Date.now;
  process.env.HOMIE_SECRET='byte-worker-test-secret';
  let clock=originalNow(),revision=0,hook=null,commitFailure=false,allowCdn=false,brokenCdn=null;
  const docs=new Map(),uploads=[],cdn=[];
  Date.now=()=>clock;
  const put=(id,job)=>docs.set(id,{name:'projects/test/databases/(default)/documents/smartlinkImports/'+id,fields:toFsFields(job),updateTime:'v'+(++revision)});
  const get=id=>fsDocToJs(docs.get(id));
  const patch=(id,fields)=>put(id,{...get(id),...fields});
  const fresh=()=>{
    const id=crypto.randomBytes(15).toString('base64url'),leaseToken=crypto.randomUUID();
    const job={sourceUrl:source,draftKey:crypto.randomUUID(),createdBy:'admin',status:'reading',leaseToken,leaseUntil:new Date(clock+300000).toISOString(),createdAt:new Date(clock).toISOString()};
    put(id,job);return {id,...job};
  };
  const call=async(body,secret='byte-worker-test-secret')=>{const res=makeResponse();await handler({method:'POST',headers:{'x-homie-secret':secret},body},res);return res;};
  const photo=(job,index=1,bytes=originals[index-1])=>({op:'photo',id:job.id,leaseToken:job.leaseToken,sourceUrl:source,index,total:15,imageUrl:images[index-1],mime:'image/jpeg',base64:bytes.toString('base64')});
  const complete=(job,extra={})=>({op:'complete',id:job.id,leaseToken:job.leaseToken,status:'ready',sourceUrl:source,transport:'bytes',images,gallery:{expected:15,found:15},data:{title:'Casa di prova',price:2450,sqm:110,rooms:4,privateAgency:'excluded'},...extra});
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input));
    if(url.hostname==='identitytoolkit.googleapis.com') return Response.json({idToken:'server-token'});
    if(url.hostname==='img4.idealista.it') {
      assert.equal(allowCdn,true,'Byte completion must never refetch a source image');
      cdn.push(url.href);assert.deepEqual(Object.keys(options.headers),['Accept'],'No Homie or session header can reach the source');
      assert.ok(['error','manual'].includes(options.redirect),'No downloader follows redirects');
      return url.href===brokenCdn?new Response('',{status:403}):new Response(originals[images.indexOf(url.href)] || originals[0],{headers:{'content-type':'image/jpeg'}});
    }
    if(url.hostname==='firebasestorage.googleapis.com') {
      assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer server-token');
      assert.equal((await sharp(options.body).metadata()).format,'webp');
      uploads.push({name:url.searchParams.get('name'),bytes:Buffer.from(options.body)});
      if(hook) {const run=hook;hook=null;await run();}
      return Response.json({name:uploads.at(-1).name});
    }
    assert.equal(url.hostname,'firestore.googleapis.com','Unexpected destination');
    if(url.pathname.endsWith(':commit')) {
      const body=JSON.parse(options.body);
      if(commitFailure) {commitFailure=false;return Response.json({error:{status:'UNAVAILABLE'}},{status:503});}
      for(const write of body.writes) {
        const id=write.update.name.split('/').at(-1),current=docs.get(id);
        if(current?.updateTime!==write.currentDocument.updateTime) return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:409});
      }
      for(const write of body.writes) {
        const id=write.update.name.split('/').at(-1),current=docs.get(id);
        docs.set(id,{...current,fields:{...current.fields,...write.update.fields},updateTime:'v'+(++revision)});
      }
      return Response.json({writeResults:[]});
    }
    const id=url.pathname.split('/').at(-1);
    return docs.has(id)?Response.json(docs.get(id)):new Response('',{status:404});
  };
  try {
    const job=fresh(),packet=photo(job);
    assert.equal((await call(packet,'wrong')).code,401);
    for(const change of [{sourceUrl:source.replace('37221750','999')},{index:0},{total:61},{imageUrl:'https://evil.example/a.jpg'},{mime:'image/png'},{base64:packet.base64+'\n'},{extra:'unknown'}]) assert.equal((await call({...packet,...change})).code,400,'Invalid photo input is rejected before upload');
    assert.equal((await call({...packet,base64:'A'.repeat(4*Math.ceil(PHOTO_LIMIT/3)+4)})).code,413);
    assert.equal((await call({...packet,base64:Buffer.from([255,216,255,1]).toString('base64')})).code,422,'A signature alone does not prove a decodable photo');
    assert.equal(uploads.length,0);
    assert.equal((await call(packet)).code,200);
    const uploadCount=uploads.length;
    assert.equal((await call(packet)).body.duplicate,true);
    assert.equal(uploads.length,uploadCount,'A lost photo ACK never uploads the accepted bytes again');
    assert.equal((await call(photo(job,1,originals[1]))).code,409,'Different bytes at an accepted index must conflict');
    assert.equal((await call({...photo(job,2),total:14})).code,409);
    assert.equal((await call({...photo(job,2),imageUrl:images[0]})).code,409);
    for(let i=2;i<=14;i++) assert.equal((await call(photo(job,i))).code,200);
    assert.equal((await call(complete(job))).code,409,'Fourteen of fifteen receipts cannot be ready');
    assert.equal(get(job.id).status,'reading');
    assert.equal((await call(photo(job,15))).code,200);
    assert.equal((await call(complete(job,{gallery:{expected:16,found:15}}))).code,409);
    assert.equal((await call(complete(job,{images:[...images].reverse()}))).code,409,'Receipt order must match the observed gallery');
    assert.equal((await call(complete(job,{transport:undefined}))).code,400,'A byte transfer cannot fall back to CDN fetch');
    assert.equal((await call(complete(job))).code,200,'All fifteen receipts produce one ready result');
    const ready=get(job.id);
    assert.equal(ready.status,'ready');assert.equal(ready.images.length,15,'No legacy twelve-photo truncation');
    assert.deepEqual(ready.images,ready.photoTransfer.photos.map(p=>p.url));
    assert.equal(new Set(ready.images).size,15);assert.equal(ready.missingPhotos,0);assert.equal(ready.data.privateAgency,undefined);
    assert.equal(JOBS.view({...ready,id:job.id}).photoTransfer,undefined,'Private transfer receipts do not reach the Portal projection');
    const finishedUploads=uploads.length;
    assert.equal((await call(complete(job))).body.duplicate,true);assert.equal(uploads.length,finishedUploads);
    assert.equal((await call(packet)).code,409,'A completed job accepts no new photo upload');

    const foreign=fresh();
    assert.equal((await call(complete(foreign,{receipts:ready.photoTransfer.photos}))).code,409,'Caller-provided receipts cannot authorize another job');
    patch(foreign.id,{photoTransfer:{...ready.photoTransfer,leaseToken:foreign.leaseToken}});
    assert.equal((await call(complete(foreign))).code,409,'Stored photo URLs must belong to this draft');

    const expired=fresh();hook=()=>{clock=Date.parse(expired.leaseUntil)+1;};
    assert.equal((await call(photo(expired))).code,409,'Lease expiration during Storage upload must prevent the receipt');
    assert.equal(get(expired.id).photoTransfer,undefined);assert.equal(get(expired.id).status,'reading');
    const reclaimed=fresh(),nextToken=crypto.randomUUID();
    hook=()=>patch(reclaimed.id,{leaseToken:nextToken});
    assert.equal((await call(photo(reclaimed))).code,409,'A reclaimed job cannot receive an old worker receipt');
    const orphanName=uploads.at(-1).name;
    assert.equal((await call(photo({...reclaimed,leaseToken:nextToken}))).code,200);
    assert.notEqual(uploads.at(-1).name,orphanName,'Old and new leases cannot overwrite each other');

    const raced=fresh();let winner;
    hook=async()=>{winner=await call(photo(raced,1,originals[1]));};
    assert.equal((await call(photo(raced))).code,409,'A receipt racing with different bytes must be checked after upload');
    assert.equal(winner.code,200);assert.equal(get(raced.id).photoTransfer.photos[0].sha256,crypto.createHash('sha256').update(originals[1]).digest('hex'));

    const lostCommit=fresh();commitFailure=true;
    assert.equal((await call(photo(lostCommit))).code,503);
    assert.equal(get(lostCommit.id).photoTransfer,undefined);
    const retryName=uploads.at(-1).name;
    assert.equal((await call(photo(lostCommit))).code,200);
    assert.equal(uploads.at(-1).name,retryName,'Failed receipt persistence retries the same object key');

    // Legacy completion still archives on the server, but never calls partial ready.
    allowCdn=true;
    const legacy=fresh();brokenCdn=images[1];
    assert.equal((await call(complete(legacy,{transport:undefined,images:images.slice(0,2)}))).code,503,'A partial legacy archive must not become ready');
    assert.equal(get(legacy.id).status,'reading');brokenCdn=null;
    const legacy15=fresh();
    assert.equal((await call(complete(legacy15,{transport:undefined}))).code,200);
    assert.equal(get(legacy15.id).images.length,15,'Legacy transport also preserves the complete ordered list');
    const legacyExpiry=fresh();hook=()=>{clock=Date.parse(legacyExpiry.leaseUntil)+1;};
    assert.equal((await call(complete(legacyExpiry,{transport:undefined,images:images.slice(0,1)}))).code,409);
    assert.equal(get(legacyExpiry.id).status,'reading');

    // Actual client downloader + actual API: source bytes are read exactly once.
    const pipeline=fresh(),beforeCdn=cdn.length,beforeUploads=uploads.length;
    let reads=0,photoAckLost=false,completeAckLost=false;
    const answer=await processOne({...pipeline,url:source,photoLimit:PHOTO_LIMIT},async()=>{
      reads++;return {status:'ready',sourceUrl:source,images,data:{title:'Casa completa'},gallery:{expected:15,found:15}};
    },async body=>{
      // The local downloader may access the source; the server must not.
      allowCdn=false;let result;try {result=await call(body);} finally {allowCdn=true;}
      if(result.code!==200) throw Object.assign(new Error('worker failed'),{status:result.code});
      if(body.op==='photo' && body.index===2 && !photoAckLost) {photoAckLost=true;throw new Error('lost photo ACK');}
      if(body.op==='complete' && !completeAckLost) {completeAckLost=true;throw new Error('lost completion ACK');}
      return result.body;
    },async()=>{});
    assert.equal(answer.ok,true);assert.equal(reads,1);assert.equal(cdn.length-beforeCdn,15);assert.equal(uploads.length-beforeUploads,15);
    assert.equal(get(pipeline.id).images.length,15);
    const incomplete=fresh(),beforeIncomplete=cdn.length;let failedPacket;
    await processOne({...incomplete,url:source,photoLimit:PHOTO_LIMIT},async()=>({status:'ready',sourceUrl:source,images:images.slice(0,2),gallery:{expected:15,found:2}}),async packet=>{failedPacket=packet;return {ok:true};},async()=>{});
    assert.equal(failedPacket.status,'unavailable');assert.equal(cdn.length,beforeIncomplete,'Incomplete observed galleries are rejected before downloads');
    await processOne({...incomplete,url:source,photoLimit:PHOTO_LIMIT},async()=>({status:'ready',sourceUrl:source,images,gallery:{expected:null,found:15}}),async packet=>{failedPacket=packet;return {ok:true};},async()=>{});
    assert.equal(failedPacket.status,'unavailable','Idealista without an observed total cannot fall back to the legacy path');
    for(const [url,imageUrl] of [
      ['https://www.immobiliare.it/annunci/123/','https://pwm.im-cdn.it/image/123/xxl.jpg'],
      ['https://www.subito.it/annunci-test/123','https://img.subito.it/photos/house.jpg'],
      ['https://www.casa.it/immobili/123/','https://img.casa.it/photos/house.jpg'],
    ]) {
      let legacyPacket;
      await processOne({...incomplete,url},async()=>({status:'ready',sourceUrl:url,images:[imageUrl],gallery:{expected:null,found:1}}),async packet=>{legacyPacket=packet;return {ok:true};},async()=>{});
      assert.equal(legacyPacket.status,'ready','Existing providers with unknown counters retain their URL transport');
      assert.equal(legacyPacket.transport,undefined);assert.equal(legacyPacket.gallery.expected,null,'Unknown total stays unknown');
    }
    const photoOps=[];let sourceReadsBeforeFailure=cdn.length;
    await assert.rejects(processOne({...fresh(),url:source,photoLimit:PHOTO_LIMIT},async()=>({status:'ready',sourceUrl:source,images,gallery:{expected:15,found:15}}),async packet=>{photoOps.push(packet.op);throw Object.assign(new Error('temporary BOOM failure'),{status:503});},async()=>{}),/temporary BOOM failure/);
    assert.deepEqual(photoOps,['photo','photo','photo'],'A byte upload failure never switches to URL completion');
    assert.equal(cdn.length-sourceReadsBeforeFailure,1,'Retrying the same upload does not redownload the source');
    let requests=0;
    await assert.rejects(readPhoto(images[0],source,PHOTO_LIMIT,async()=>{requests++;return new Response('',{status:403});}),error=>error.blocked===true);
    assert.equal(requests,1,'A blocked source is never retried or routed through another downloader');
    await assert.rejects(readPhoto(images[0],source,3,async()=>new Response(originals[0],{headers:{'content-type':'image/jpeg'}})),/photo_too_large/);
    await assert.rejects(readPhoto('https://evil.example/a.jpg',source,PHOTO_LIMIT,async()=>{throw new Error('must not fetch');}),/invalid_photo/);
  } finally {
    globalThis.fetch=originalFetch;Date.now=originalNow;
    if(originalSecret===undefined) delete process.env.HOMIE_SECRET;else process.env.HOMIE_SECRET=originalSecret;
  }
}

await matrix(worker);
const path=new URL('../../api/smartlink/worker.js',import.meta.url),implementation=readFileSync(path,'utf8');
function mutated(before,after) {
  assert.equal(implementation.split(before).length,2,'Mutation anchor must be unique');
  const code=implementation.replace(before,after).replace(/from '(\.\.?\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,path).href}'`);
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
for(const [before,after,message] of [
  ['transfer.photos.length!==images.length','transfer.photos.length<1','Fourteen of fifteen receipts'],
  ['!JOBS.canComplete(current.data,body.leaseToken,Date.now())','false','Lease expiration during Storage'],
  ['receipt.sha256===sha256 && receipt.imageUrl===body.imageUrl','receipt.imageUrl===body.imageUrl','Different bytes at an accepted index'],
  ['if(!mime || mime!==body.mime)','if(!mime)','Invalid photo input'],
  ['fields.images.length!==images.length','!fields.images.length','A partial legacy archive'],
  ['? urls:null','? urls.slice(0,12):null','All fifteen receipts produce one ready result'],
]) {
  const changed=await mutated(before,after);
  await assert.rejects(matrix(changed.default),error=>error.code==='ERR_ASSERTION' && error.message.includes(message),'Mutation must be caught: '+message);
}
assert.equal(readFileSync(path,'utf8'),implementation,'Mutations never modify product files');
console.log('SmartLink worker bytes: 15/15, no server source fetch, auth, MIME, limits, private receipts, lease races, ACK retries, legacy partial guard; 6 mutations PASS');
