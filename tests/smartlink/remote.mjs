import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import JOBS from '../../js/smartlink-import-engine.js';
import {toFsFields,fsDocToJs} from '../../api/homie/_lib.js';
import jobs from '../../api/smartlink/jobs.js';
import worker from '../../api/smartlink/worker.js';
import {processOne,readListing,openReview} from '../../tools/smartlink-worker/reader.mjs';

const originalFetch=globalThis.fetch, originalFlag=process.env.SMARTLINK_REMOTE_ENABLED,originalSecret=process.env.HOMIE_SECRET;
process.env.SMARTLINK_REMOTE_ENABLED='1';process.env.HOMIE_SECRET='worker-test-secret';
const docs=new Map(), writes=[], uploads=[];
let revision=0,brokenPhotos=false,queueAvailable=true;
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
  if(!queueAvailable && /smartlink/.test(u.href+JSON.stringify(body))) throw new Error('Queue rules and index not deployed');
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
  queueAvailable=false;
  assert.equal((await operator('GET',{capabilities:'1'},'tenant')).code,403,'Capability still requires an admin');
  assert.deepEqual((await operator('GET',{capabilities:'1'})).body,{ok:true,enabled:false},'UI mode must work before queue rules and index exist');
  process.env.SMARTLINK_REMOTE_ENABLED='1';
  assert.deepEqual((await operator('GET',{capabilities:'1'})).body,{ok:true,enabled:true});
  process.env.SMARTLINK_REMOTE_ENABLED='0';queueAvailable=true;
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
  process.env.SMARTLINK_REMOTE_ENABLED='0';
  assert.equal((await operator('GET')).body.enabled,false);
  assert.equal((await operator('GET')).body.jobs.length,1,'Kill switch must preserve saved imports');
  process.env.SMARTLINK_REMOTE_ENABLED='1';

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
  // La sonda separa rifiuto HTTP, verifica visibile e parser senza cambiare
  // gli esiti pubblici né spedire diagnostica nella ricevuta della coda.
  const privateMarker='private-cookie-and-page-content-must-not-appear';
  function diagnosticPage(options={}) {
    const calls={navigation:0,evaluation:0,closed:0};
    const probePage={
      goto:async()=>{
        calls.navigation++;
        if(options.navigationError) throw options.navigationError;
        const code=options.status ?? 200;
        return {status:()=>code,ok:()=>code>=200 && code<300};
      },
      url:()=>source,locator:()=>({waitFor:async()=>{}}),waitForLoadState:async()=>{},
      evaluate:async(fn)=>{
        calls.evaluation++;
        if(fn.name==='listingSnapshot') {
          if(options.parserError) throw options.parserError;
          return {images:options.images ?? [photo],data:{title:options.title ?? 'Bilocale '+privateMarker}};
        }
        return vm.runInNewContext('('+fn.toString()+')()', {document:{title:options.challenge?'Verify you are human':'Annuncio',
          body:{innerText:privateMarker},querySelector:()=>null}});
      },
      close:async()=>{calls.closed++;}
    };
    return {calls,context:{newPage:async()=>probePage,close:async()=>{} }};
  }
  const scenarios=[
    ...[401,403,429].map(status=>({options:{status},result:{status:'needs_attention',error:'source_blocked'},diagnostic:{phase:'navigation',reason:'http_rejected',httpStatus:status}})),
    {options:{challenge:true},result:{status:'needs_attention',error:'source_blocked'},diagnostic:{phase:'verification',reason:'verification_page',httpStatus:200}},
    {options:{images:[]},result:{status:'unavailable',error:'photos_not_found'},diagnostic:{phase:'parser',reason:'missing_photos',httpStatus:200}},
    {options:{title:''},result:{status:'unavailable',error:'photos_not_found'},diagnostic:{phase:'parser',reason:'missing_title',httpStatus:200}},
    {options:{navigationError:Object.assign(new Error(privateMarker),{name:'TimeoutError'})},result:{status:'unavailable',error:'reader_error'},diagnostic:{phase:'navigation',reason:'navigation_timeout'}},
    {options:{parserError:new Error(privateMarker)},result:{status:'unavailable',error:'reader_error'},diagnostic:{phase:'parser',reason:'parser_error',httpStatus:200}}
  ];
  for(const scenario of scenarios) {
    const fixture=diagnosticPage(scenario.options),diagnostics=[];
    assert.deepEqual(await readListing(fixture.context,source,value=>diagnostics.push(value)),scenario.result);
    assert.deepEqual(diagnostics,[scenario.diagnostic]);
    assert.equal(fixture.calls.navigation,1,'Diagnosis must not navigate again');
    assert.equal(fixture.calls.closed,1);
    if(scenario.options.status) assert.equal(fixture.calls.evaluation,0,'Rejected HTTP must stop before DOM inspection');
    assert.ok(!JSON.stringify(diagnostics).includes(privateMarker));
    assert.ok(!JSON.stringify(diagnostics).includes(source));
  }
  const withoutObserver=diagnosticPage({status:403}),withBrokenObserver=diagnosticPage({status:403});
  assert.deepEqual(await readListing(withBrokenObserver.context,source,()=>{throw new Error(privateMarker);}),
    await readListing(withoutObserver.context,source),'Diagnostic callback cannot change the import outcome');
  let deliveredPacket;
  const queuedFixture=diagnosticPage({challenge:true}),localDiagnostics=[];
  await processOne(claim,url=>readListing(queuedFixture.context,url,value=>localDiagnostics.push(value)),
    async packet=>{deliveredPacket=packet;return {ok:true};},async()=>{});
  assert.deepEqual(deliveredPacket,{op:'complete',id:claim.id,leaseToken:claim.leaseToken,status:'needs_attention',error:'source_blocked'});
  assert.equal(localDiagnostics.length,1,'Probe metadata exists only through its observer, never in the completion packet');

  // Esegue l'entrypoint reale con confini file/browser isolati: il segreto
  // necessario al bootstrap non deve uscire e la sonda non chiama BOOM.
  const probeScript=(await readFile(new URL('../../tools/smartlink-worker/worker.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  const cliFixture=diagnosticPage({status:403}),cliLogs=[];
  const cliProcess={argv:['node','worker.mjs','--probe',source],once(){},exitCode:0};
  await vm.runInNewContext('(async()=>{'+probeScript+'})()', {
    readFile:async path=>path.endsWith('smartlink-reader.json')?'{}':'HOMIE_SECRET='+privateMarker,
    mkdir:async()=>{},homedir:()=>'/fixture',join,URL,
    chromium:{launchPersistentContext:async(profile,options)=>{
      assert.equal(profile,'/fixture/.boom/smartlink-reader-profile');
      assert.equal(JSON.stringify(options),JSON.stringify({headless:false,chromiumSandbox:true,acceptDownloads:false}));
      return cliFixture.context;
    }},readListing,processOne,openReview,process:cliProcess,
    console:{log:value=>cliLogs.push(value)},
    fetch:async()=>{throw new Error('Probe must never contact BOOM');}
  });
  assert.equal(cliProcess.exitCode,1);assert.equal(cliLogs.length,1);
  const cliResult=JSON.parse(cliLogs[0]);
  assert.deepEqual(cliResult.diagnostic,{phase:'navigation',reason:'http_rejected',httpStatus:403});
  assert.equal(cliResult.status,'needs_attention');assert.equal(cliResult.photoCount,0);
  assert.ok(!cliLogs[0].includes(privateMarker));assert.ok(!cliLogs[0].includes(source));
  assert.equal(cliFixture.calls.navigation,1);
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
  let reviewOpened=0,reviewNavigation=0;
  const reviewPage={goto:async(url)=>{assert.equal(url,source);reviewNavigation++;}};
  const reviewContext={newPage:async()=>{reviewOpened++;return reviewPage;}};
  for(const url of [undefined,'https://evil.example/annunci/1/','https://www.immobiliare.it/annunci/124483437/?token=x']) {
    await assert.rejects(openReview(reviewContext,url),/invalid_review_url/);
  }
  assert.equal(reviewOpened,0,'Review must reject unsupported URLs before opening a page');
  assert.equal(await openReview(reviewContext,source),reviewPage);
  assert.equal(reviewNavigation,1,'Review navigates once and never retries or solves a challenge');
  console.log('SmartLink remoto: coda privata, doppio invio, claim concorrente, recovery, ACK, archivio WebP e blocchi fonte ✓');
} finally {
  globalThis.fetch=originalFetch;
  if(originalFlag===undefined) delete process.env.SMARTLINK_REMOTE_ENABLED;else process.env.SMARTLINK_REMOTE_ENABLED=originalFlag;
  if(originalSecret===undefined) delete process.env.HOMIE_SECRET;else process.env.HOMIE_SECRET=originalSecret;
}
