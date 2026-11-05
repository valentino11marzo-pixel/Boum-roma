import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import RULES from '../../js/smartlink-engine.js';
import SHARE from '../../js/smartlink-share-engine.js';
import MEDIA from '../../js/smartlink-media-engine.js';
class Element {
  constructor(){this.value='';this.dataset={};this.disabled=false;this.children=[];this.listeners={};this.isConnected=true;this.classList={add(){},remove(){}};}
  set value(v){this._value=String(v);} get value(){return this._value || '';}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  addEventListener(type,fn){this.listeners[type]=fn;} setAttribute(){} removeAttribute(){} focus(){} click(){this.clicked=true;} remove(){this.isConnected=false;}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id)) nodes.set(id,new Element());return nodes.get(id);};
let submitted=0,published,finishPost,enabled=true,finishDirect,directCount=0,holdCapability=false,finishCapability,photoImports=0,directPayload;
let createMode='ok',allowUploads=false,uploadCount=0,downloadLookupFails=false;
let archiveOnlyCount=0,archiveOnlyPayload,archiveOnlyFailure=false,holdArchive=false,finishArchive;
let clipboardText='',clipboardReads=0,holdClipboard=false,finishClipboard,clipboardDenied=false;
let holdPhoto=false,finishPhoto,holdBlob=false,finishBlob,holdPrepare=false,finishPrepare,failPhotoAt=0;
let holdUpload=false,finishUpload,holdToken=false,finishToken,tokenReads=0,downloadLookups=0;
let rejectPrepare=false,failPrepareAt=0;
const preparedBlobs=[];
const requests=[],events=[];
async function until(predicate) {for(let i=0;i<100&&!predicate();i++) await Promise.resolve();assert.ok(predicate(),'Expected request was not reached');}
const source='https://www.immobiliare.it/annunci/124483437/';
const key=crypto.randomUUID(),photo=n=>`https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/${encodeURIComponent('smartlinks/'+key+'/'+n+'1111111-1111-4111-8111-111111111111.webp')}?alt=media`;
const ready={id:'Abcd1234Efgh5678ijkl',sourceUrl:source,draftKey:key,status:'ready',data:{title:'Bilocale',zone:'Cipro',price:1500},images:[photo(1),photo(2)]};
const getIdToken=async()=>{tokenReads++;events.push('token');if(holdToken) return new Promise(resolve=>{finishToken=()=>resolve('admin');});return 'admin';};
const context={window:{crypto,BOOM_SMARTLINK:RULES,BOOM_SMARTLINK_SHARE:SHARE,BOOM_SMARTLINK_MEDIA:MEDIA,BOOM_SMARTLINK_PHOTO:{prepare:async blob=>{
  preparedBlobs.push(blob);if(rejectPrepare || preparedBlobs.length===failPrepareAt) throw new Error('fixture decode failure');
  if(holdPrepare) return new Promise(resolve=>{finishPrepare=()=>resolve(blob);});return blob;
}}},URL,Promise,console,encodeURIComponent,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},
  document:{getElementById:get,createElement:()=>new Element(),querySelector:()=>get('body'),documentElement:{dataset:{}}},
  S:{profile:{id:'admin',role:'admin'}},auth:{currentUser:{uid:'admin',getIdToken}},
  isAdmin:()=>context.S.profile?.role==='admin',toast(){},closeModal(){for(const node of nodes.values()) node.isConnected=false;},esc:String,
  navigator:{clipboard:{readText(){clipboardReads++;events.push('clipboard');if(clipboardDenied) return Promise.reject(new Error('denied'));if(holdClipboard) return new Promise(resolve=>{finishClipboard=()=>resolve(clipboardText);});return Promise.resolve(clipboardText);}}},
  storage:{ref(){if(!allowUploads) throw new Error('An archived photo must not be reuploaded from the phone');return {child(path){return {
    async put(){uploadCount++;if(holdUpload) return new Promise(resolve=>{finishUpload=resolve;});},async getDownloadURL(){downloadLookups++;if(downloadLookupFails){downloadLookupFails=false;throw new Error('lookup interrupted');}return 'https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/'+encodeURIComponent(path)+'?alt=media';}
  };}};}},
  fetch:async(url,opts={})=>{
    requests.push({url,method:opts.method || 'GET',body:opts.body?JSON.parse(opts.body):null});
    if(url==='/api/smartlink/jobs?capabilities=1') {
      if(holdCapability) return new Promise(resolve=>{finishCapability=()=>resolve({ok:true,json:async()=>({ok:true,enabled})});});
      return {ok:true,json:async()=>({ok:true,enabled})};
    }
    if(url==='/api/smartlink/extract') {
      if(JSON.parse(opts.body).archiveOnly===true) {
        archiveOnlyCount++;
        const result=()=>({ok:!archiveOnlyFailure,json:async()=>archiveOnlyPayload || {ok:!archiveOnlyFailure,status:'unavailable',images:[]}});
        if(holdArchive) return new Promise(resolve=>{finishArchive=()=>resolve(result());});
        return result();
      }
      directCount++;return new Promise(resolve=>{finishDirect=()=>resolve({ok:true,json:async()=>directPayload || ({ok:true,data:{title:'Casa diretta',zone:'Cipro'},images:['https://pwm.im-cdn.it/image/123/m-c.jpg']})});});
    }
    if(url==='/api/smartlink/import-photo') {
      photoImports++;
      const result={ok:photoImports!==failPhotoAt,blob:async()=>{
        const blob=new Blob(['test'],{type:'image/webp'});
        if(holdBlob) return new Promise(resolve=>{finishBlob=()=>resolve(blob);});return blob;
      }};
      if(holdPhoto) return new Promise(resolve=>{finishPhoto=()=>resolve(result);});return result;
    }
    if(url==='/api/smartlink/create'){
      published=JSON.parse(opts.body);
      if(createMode==='lost'){createMode='ok';throw new Error('response lost after save');}
      if(createMode==='conflict') return {ok:false,status:409,json:async()=>({ok:false,error:'publication_conflict'})};
      return {ok:true,status:201,json:async()=>({ok:true,url:'https://www.boomrome.com/smartlink?id=test'})};
    }
    if(opts.method==='POST'){submitted++;return new Promise(resolve=>{finishPost=()=>resolve({ok:true,json:async()=>({ok:true,job:{...ready,status:'queued'}})});});}
    return {ok:true,json:async()=>({ok:true,jobs:[],job:ready,online:true,enabled})};
  }};
const sourceCode=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const start=sourceCode.indexOf('    function openExternalSmartLink() {'),end=sourceCode.indexOf('    // ═════════',sourceCode.indexOf('    async function smartLinkCreate()'));
const proofStart=sourceCode.indexOf('    function portalSessionProof() {'),proofEnd=sourceCode.indexOf('    function portalSessionReset() {',proofStart);
assert.ok(proofStart>=0 && proofEnd>proofStart);
vm.runInNewContext('var portalSessionGeneration=1;\n'+sourceCode.slice(proofStart,proofEnd),context);
vm.runInNewContext(sourceCode.slice(start,end)+"\nsmartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
get('sl_source').value=source;context.smartLinkSourceChanged();
const first=context.smartLinkExtract();await until(()=>finishPost);
await context.smartLinkExtract();assert.equal(submitted,1,'Enter while POST pending must not start another import');
get('sl_source').value=source.replace('124483437','999');context.smartLinkSourceChanged();
finishPost();await first;
assert.equal(get('sl_photo_preview').children.length,0,'A late response must not inject photos into another listing');
context.smartLinkResume(ready);
assert.equal(get('sl_photo_preview').children.length,2);
assert.equal(get('sl_title').value,'Bilocale');
context.smartLinkMovePhoto(1,0);
await context.smartLinkCreate();
assert.deepEqual(published.images,[photo(2),photo(1)],'Publication keeps chosen order and reuses the archive');
assert.equal(published.idempotencyKey,key);assert.equal(get('sl_create').dataset.created,'1');
const prior=published;published=null;
context.smartLinkResume({...ready,status:'reading'});
await context.smartLinkCreate();assert.equal(published,null,'Publication must wait for the archive');
assert.equal(prior.sourceUrl,source);
context.smartLinkClose();
// Flag off: same source/photo endpoints as the existing production Studio.
nodes.clear();
enabled=false;get('sl_source').value=source;context.smartLinkSourceChanged();
const direct=context.smartLinkExtract();await until(()=>finishDirect);
await context.smartLinkExtract();assert.equal(directCount,1,'Direct mode also guards a double submit');
published=null;await context.smartLinkCreate();assert.equal(published,null,'Do not publish while direct import is pending');
finishDirect();await direct;
assert.equal(submitted,1,'Flag off never queues a central job');
assert.equal(get('sl_photo_preview').children.length,1);
assert.equal(get('sl_title').value,'Casa diretta');
assert.equal(get('sl_import').disabled,false);
assert.equal(get('sl_connection').hidden,true,'No installation panel in the normal flow');
// A late direct result and a late capability result cannot populate a changed URL.
finishDirect=null;
const staleDirect=context.smartLinkExtract();await until(()=>finishDirect);
get('sl_source').value=source.replace('124483437','888');context.smartLinkSourceChanged();
finishDirect();await staleDirect;assert.equal(get('sl_photo_preview').children.length,0);
holdCapability=true;finishCapability=null;
const staleMode=context.smartLinkExtract();await until(()=>finishCapability);
await context.smartLinkExtract();assert.equal(get('sl_import').disabled,true);
get('sl_source').value=source;context.smartLinkSourceChanged();
finishCapability();await staleMode;holdCapability=false;
assert.equal(directCount,2,'A stale capability response must not start extraction');
enabled=undefined;
await context.smartLinkExtract();assert.equal(submitted,1);assert.equal(directCount,2,'Unknown mode must not guess a fallback');
assert.equal(get('sl_import').disabled,false);
context.smartLinkClose();
// Archive: instant reuse, no upload from phone, truthful age and chosen ordering.
vm.runInNewContext("smartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
nodes.clear();enabled=false;get('sl_source').value=source;context.smartLinkSourceChanged();
directPayload={ok:true,photoOrigin:'boom_archive',archive:{id:'Abcd1234Efgh5678ijkl',observedAt:'2026-10-17T12:00:00.000Z'},data:{title:'Casa archiviata'},images:[photo(1),photo(2)]};
const importsBefore=photoImports;finishDirect=null;
const archived=context.smartLinkExtract();await until(()=>finishDirect);finishDirect();await archived;
assert.equal(photoImports,importsBefore,'Archived images are never fetched through the source-photo endpoint');
assert.equal(get('sl_photo_preview').children.length,2);assert.match(get('sl_status').textContent,/17 ottobre 2026/);
assert.match(get('sl_status').textContent,/fonte non è stata riletta/);
context.smartLinkMovePhoto(1,0);published=null;await context.smartLinkCreate();
assert.deepEqual(published.images,[photo(2),photo(1)]);assert.equal(published.archiveId,directPayload.archive.id);
assert.notEqual(published.idempotencyKey,key,'Reusing images must not reuse the old publication idempotency key');
const publishedArchiveKey=published.idempotencyKey;
finishDirect=null;const reimport=context.smartLinkExtract();await until(()=>finishDirect);finishDirect();await reimport;
get('sl_price').value='1600';await context.smartLinkCreate();
assert.notEqual(published.idempotencyKey,publishedArchiveKey,'Reimport after publication starts a new version even without a central job');
assert.equal(published.price,'1600');assert.deepEqual(published.images,[photo(1),photo(2)]);
assert.equal(photoImports,importsBefore,'A new archive version still needs no photo upload');
get('sl_source').value=source.replace('124483437','777');context.smartLinkSourceChanged();
directPayload={ok:true,status:'unavailable',images:[]};finishDirect=null;
context.document.documentElement.dataset.boomSmartlinkExtension='1';
context.window.addEventListener=()=>{throw new Error('Normal import must not invoke the browser extension');};
const empty=context.smartLinkExtract();await until(()=>finishDirect);finishDirect();await empty;
assert.equal(get('sl_photo_preview').children.length,0);assert.match(get('sl_status').textContent,/BOOM non ha foto archiviate/);
assert.notEqual(get('sl_connection').open,true,'A source failure must not force an installation guide open');
context.smartLinkClose();
// A resumed import may already have a published card: changes need an explicit new version.
vm.runInNewContext("smartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
nodes.clear();context.smartLinkResume(ready);get('sl_price').value='1800';createMode='conflict';
await context.smartLinkCreate();
assert.equal(get('sl_create').dataset.created,'0');assert.match(get('sl_result').textContent,/già una scheda pubblicata con dati diversi/);
assert.equal(get('sl_create').textContent,'Crea nuova versione ↗');
assert.notEqual(get('sl_key').value,key);assert.equal(get('sl_draft_key').value,key);
createMode='ok';await context.smartLinkCreate();
assert.notEqual(published.idempotencyKey,key);assert.equal(published.draftKey,key);
assert.deepEqual(published.images,[photo(1),photo(2)]);assert.equal(published.price,'1800');
context.smartLinkClose();
// Retry after a lost create response reuses the exact payload and uploaded objects.
vm.runInNewContext("smartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
nodes.clear();enabled=false;get('sl_source').value=source;context.smartLinkSourceChanged();
directPayload={ok:true,data:{title:'Casa nuova'},images:['https://pwm.im-cdn.it/image/123/m-c.jpg','https://pwm.im-cdn.it/image/456/m-c.jpg']};
finishDirect=null;const fresh=context.smartLinkExtract();await until(()=>finishDirect);finishDirect();await fresh;
allowUploads=true;downloadLookupFails=true;
await context.smartLinkCreate();assert.equal(uploadCount,1);
createMode='lost';await context.smartLinkCreate();
assert.equal(uploadCount,2,'An interrupted download-URL lookup must not upload the photo again');
const interruptedPayload=published;
assert.equal(get('sl_create').dataset.created,'0');
await context.smartLinkCreate();
assert.deepEqual(published,interruptedPayload,'A lost response retries the identical proposal, including photo URLs');
assert.equal(uploadCount,2,'Retry must not create duplicate Storage objects');
assert.equal(get('sl_create').dataset.created,'1');context.smartLinkClose();
// An enabled/offline reader must not hide BOOM's own already archived photos.
vm.runInNewContext("smartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
nodes.clear();enabled=true;get('sl_source').value=source;context.smartLinkSourceChanged();
archiveOnlyPayload={ok:true,photoOrigin:'boom_archive',archive:{id:'Abcd1234Efgh5678ijkl',observedAt:'2026-10-17T12:00:00.000Z'},data:{title:'Versione BOOM aggiornata',price:1300},images:[photo(1),photo(2)]};
const beforeArchive={submitted,directCount,photoImports,uploadCount};
await context.smartLinkExtract();
assert.equal(get('sl_photo_preview').children.length,2);assert.equal(get('sl_price').value,'1300');
assert.equal(submitted,beforeArchive.submitted,'Archive reuse does not queue a source job');
assert.equal(directCount,beforeArchive.directCount,'Archive-only result must not trigger direct extraction');
assert.equal(photoImports,beforeArchive.photoImports);assert.match(get('sl_status').textContent,/fonte non è stata riletta/);
await context.smartLinkCreate();assert.equal(published.archiveId,archiveOnlyPayload.archive.id);
assert.equal(uploadCount,beforeArchive.uploadCount,'Central mode also reuses Storage photos without phone uploads');
context.smartLinkClose();
// An unavailable or stale archive result must not silently start a source job.
nodes.clear();get('sl_source').value=source;context.smartLinkSourceChanged();archiveOnlyFailure=true;
await context.smartLinkExtract();assert.equal(submitted,beforeArchive.submitted);
assert.match(get('sl_status').textContent,/archivio BOOM non è raggiungibile/);assert.equal(get('sl_import').disabled,false);
archiveOnlyFailure=false;holdArchive=true;finishArchive=null;
const lateArchive=context.smartLinkExtract();await until(()=>finishArchive);
get('sl_source').value=source.replace('124483437','445566');context.smartLinkSourceChanged();
finishArchive();await lateArchive;holdArchive=false;
assert.equal(submitted,beforeArchive.submitted);assert.equal(get('sl_photo_preview').children.length,0);
context.smartLinkClose();
// Radar provenance survives publication and clears when another source is chosen.
vm.runInNewContext("smartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
nodes.clear();enabled=false;get('sl_source').value=source;context.smartLinkSourceChanged();
directPayload={ok:true,photoOrigin:'radar',radar:{id:'h_0123456789abcdef',archivedAt:'2026-10-01T12:00:00Z'},data:{title:'Casa già acquisita',price:1250},images:['https://pwm.im-cdn.it/image/123/m-c.jpg']};
finishDirect=null;const radar=context.smartLinkExtract();await until(()=>finishDirect);finishDirect();await radar;
assert.equal(get('sl_price').value,'1250');assert.match(get('sl_status').textContent,/non li indicherà come verificati oggi/);
await context.smartLinkCreate();assert.equal(published.radarId,'h_0123456789abcdef');assert.equal(published.archiveId,undefined);
context.smartLinkResume(ready);await context.smartLinkCreate();
assert.equal(published.radarId,undefined,'Resuming another job must not retain Radar provenance');
assert.equal(published.price,'1500','A resumed job replaces the unchanged Radar price');
assert.equal(published.historicalData,undefined,'Replaced historical fields do not taint new values');
context.smartLinkClose();
// Refresh replaces all unchanged imported fields, including a newly absent price.
async function directImport(payload) {
  directPayload=payload;finishDirect=null;
  const pending=context.smartLinkExtract();await until(()=>finishDirect);finishDirect();await pending;
}
function startStudio() {
  nodes.clear();enabled=false;
  vm.runInNewContext("smartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
  get('sl_source').value=source;context.smartLinkSourceChanged();
}
const directPhotos=['https://pwm.im-cdn.it/image/123/m-c.jpg'];
const radarPayload={ok:true,photoOrigin:'radar',radar:{id:'h_0123456789abcdef'},
  data:{title:'Casa storica',price:1250,zone:'Cipro',sqm:50,rooms:2},images:directPhotos};
startStudio();
await directImport(radarPayload);
get('sl_note').value='Nota BOOM da conservare';
await directImport({ok:true,data:{title:'Casa riletta',zone:'Prati',sqm:55,rooms:3},images:directPhotos});
assert.equal(get('sl_title').value,'Casa riletta');assert.equal(get('sl_zone').value,'Prati');
assert.equal(get('sl_sqm').value,'55');assert.equal(get('sl_rooms').value,'3');
assert.equal(get('sl_price').value,'','A missing fresh price clears the unchanged old auto price');
await context.smartLinkCreate();
assert.equal(published.price,'');assert.equal(published.note,'Nota BOOM da conservare');
assert.equal(published.radarId,undefined);assert.equal(published.historicalData,undefined);
context.smartLinkClose();
// Manual changes keep their historical origin across successive fresh imports.
startStudio();await directImport(radarPayload);get('sl_price').value='1280';
await directImport({ok:true,data:{title:'Casa nuova',price:1500},images:directPhotos});
assert.equal(get('sl_price').value,'1280');assert.equal(get('sl_title').value,'Casa nuova');
assert.equal(get('sl_sqm').value,'');assert.equal(get('sl_rooms').value,'');
assert.match(get('sl_status').textContent,/modifiche a dati di una precedente importazione/);
await context.smartLinkCreate();assert.equal(published.historicalData,true);assert.equal(published.radarId,undefined);
await directImport({ok:true,data:{price:1600},images:directPhotos});
await context.smartLinkCreate();assert.equal(published.price,'1280');assert.equal(published.historicalData,true);
// A deliberate manual deletion also stays blank, instead of being refilled.
get('sl_price').value='';
await directImport({ok:true,data:{price:1700},images:directPhotos});
await context.smartLinkCreate();assert.equal(published.price,'');assert.equal(published.historicalData,undefined);
context.smartLinkClose();
// Retained data provenance is separate from the ownership of newly archived photos.
startStudio();
await directImport({ok:true,photoOrigin:'boom_archive',archive:{id:'Abcd1234Efgh5678ijkl',observedAt:'2026-10-01T12:00:00Z'},data:{price:1250},images:[photo(1)]});
get('sl_price').value='1290';
context.smartLinkResume(ready);await context.smartLinkCreate();
assert.equal(published.price,'1290');assert.equal(published.historicalData,true);
assert.equal(published.archiveId,undefined);assert.equal(published.radarId,undefined);
await directImport({ok:true,photoOrigin:'boom_archive',archive:{id:'NewA1234Efgh5678ijkl',observedAt:'2026-10-25T12:00:00Z'},data:{price:1800},images:[photo(2)]});
await context.smartLinkCreate();assert.equal(published.price,'1290');assert.equal(published.historicalData,true);
assert.equal(published.archiveId,'NewA1234Efgh5678ijkl','Current photos use the current archive, not the old data reference');
// A different listing and a closed Studio cannot inherit historical/manual state.
get('sl_source').value=source.replace('124483437','445566');context.smartLinkSourceChanged();
await directImport({ok:true,data:{price:2000},images:directPhotos});
await context.smartLinkCreate();assert.equal(published.price,'2000');assert.equal(published.historicalData,undefined);
context.smartLinkClose();startStudio();
await directImport({ok:true,data:{price:2100},images:directPhotos});
await context.smartLinkCreate();assert.equal(published.price,'2100');assert.equal(published.historicalData,undefined);
context.smartLinkClose();
assert.ok(archiveOnlyCount>=4);

// The Safari action drives the real controller, validator, image preparation and
// create proposal. Only clipboard, auth, network and Storage are simulated.
const sharePacket=(count=2,expected=count)=>({kind:SHARE.KIND,version:SHARE.VERSION,
  sourceUrl:source,pageUrl:source,capturedAt:'2026-10-01T12:00:00.000Z',
  data:{title:'Casa da Safari',price:1400,zone:'Cipro',sqm:65,rooms:3},
  images:Array.from({length:count},(_,i)=>`https://pwm.im-cdn.it/image/${1000+i}/m-c.jpg`),
  gallery:{expected,found:count}});
function session(uid='admin',role='admin',reset=true) {
  vm.runInNewContext('portalSessionGeneration++;',context);
  context.auth.currentUser=uid?{uid,getIdToken}:null;
  context.S.profile=uid?{id:uid,role}:null;
  if(reset) context.smartLinkResetSession();
}
function shareStudio() {
  session();startStudio();published=null;createMode='ok';allowUploads=true;
  clipboardDenied=false;holdClipboard=false;holdPhoto=false;holdBlob=false;holdPrepare=false;holdUpload=false;holdToken=false;
  finishClipboard=finishPhoto=finishBlob=finishPrepare=finishUpload=finishToken=null;
  failPhotoAt=0;
  rejectPrepare=false;
}
const currentPhotoCount=()=>vm.runInNewContext('smartLinkPhotoItems.length',context);
const shareState=()=>vm.runInNewContext('smartLinkShare',context);
shareStudio();await directImport(radarPayload);get('sl_price').value='9999';
clipboardText=JSON.stringify(sharePacket(13));events.length=0;
const safariRequests=requests.length,safariUploads=uploadCount;
const safariImport=context.smartLinkPasteShare();
assert.deepEqual(events,['clipboard'],'Clipboard read happens synchronously in the tap, before token/network awaits');
await safariImport;
assert.equal(currentPhotoCount(),13,'The Safari path retains photos beyond the old twelve-photo cap');
assert.equal(get('sl_price').value,'1400');assert.equal(get('sl_source').value,source);
assert.equal(published,null,'Importing a share never publishes');
assert.equal(requests.slice(safariRequests).length,13);
assert.ok(requests.slice(safariRequests).every(r=>r.url==='/api/smartlink/import-photo' && r.method==='POST'),
  'Safari must not fetch listing HTML, queue a job, invoke an extension or call any other network path');
await context.smartLinkCreate();
assert.equal(published,null,'Review checkbox is required even when the advertised gallery count matches');
assert.equal(uploadCount,safariUploads,'An unreviewed share does not start Storage uploads');
context.smartLinkShareReview(true);await context.smartLinkCreate();
assert.equal(published.images.length,13);assert.equal(uploadCount-safariUploads,13);
assert.equal(published.historicalData,true,'An older clipboard capture cannot become verified today');
assert.equal(published.archiveId,undefined);assert.equal(published.radarId,undefined);
const firstShareKey=published.idempotencyKey;
await context.smartLinkPasteShare(JSON.stringify(sharePacket(1)));
assert.notEqual(get('sl_key').value,firstShareKey,'A new share of the same URL starts a new publication key');
assert.equal(shareState().checked,false,'A new import cannot inherit the prior gallery approval');
published=null;await context.smartLinkCreate();assert.equal(published,null);

// Invalid clipboard content is lossless for the current draft; manual paste is
// a real fallback when Safari does not expose clipboard.readText to this tap.
const preserved={source:get('sl_source').value,title:get('sl_title').value,key:get('sl_key').value,photos:currentPhotoCount()};
const invalidRequests=requests.length;
clipboardText='not a BOOM share';await context.smartLinkPasteShare();
assert.deepEqual({source:get('sl_source').value,title:get('sl_title').value,key:get('sl_key').value,photos:currentPhotoCount()},preserved);
assert.equal(requests.length,invalidRequests,'Invalid clipboard data cannot trigger a photo or listing request');
clipboardDenied=true;await context.smartLinkPasteShare();
assert.equal(get('sl_share_manual').open,true);assert.equal(currentPhotoCount(),preserved.photos);
const readsBeforeManual=clipboardReads;
await context.smartLinkPasteShare(JSON.stringify(sharePacket(2,null)));
assert.equal(clipboardReads,readsBeforeManual,'Manual paste never requests clipboard permission again');
assert.equal(currentPhotoCount(),2);assert.match(get('sl_share_status').textContent,/non indica il totale/);
published=null;await context.smartLinkCreate();assert.equal(published,null,'Unknown gallery totals still require explicit human review');
context.smartLinkClose();

// A known missing photo and an actual CDN download failure are distinct, but
// both prevent publishing; checking a hidden review control cannot waive them.
shareStudio();
await context.smartLinkPasteShare(JSON.stringify(sharePacket(2,3)));
assert.equal(currentPhotoCount(),2);assert.match(get('sl_share_status').textContent,/incompleta/);
context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null);
assert.equal(get('sl_share_review').hidden,true);
shareStudio();failPhotoAt=photoImports+1;
const failedRequests=requests.length;
await context.smartLinkPasteShare(JSON.stringify(sharePacket(2)));
assert.equal(currentPhotoCount(),1);assert.equal(shareState().failed,1);
assert.equal(requests.length-failedRequests,2,'A blocked photo is not retried through an alternative endpoint');
context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null);
assert.equal(get('sl_share_review').hidden,true);

// Native Repeat/Wait delivers a closed carrier, not a precombined share payload.
// Exercise that exact input through the real validator and Portal controller.
const gallerySource='https://www.idealista.it/immobile/37221750/';
const galleryPhoto=index=>`https://img4.idealista.it/blur/WEB_DETAIL-L-L/0/id.pro.it.image.master/18/17/e4/${849829510+index}.webp`;
function framesPacket() {
  const positions=[2,1,2,3],capturedAt='2026-10-01T12:00:00.000Z';
  const plan={kind:SHARE.PLAN_KIND,version:SHARE.VERSION,sourceUrl:gallerySource,canonicalUrl:gallerySource,
    total:3,start:2,positions,count:4,capturedAt};
  const frames=positions.map((index,step)=>({kind:SHARE.FRAME_KIND,version:SHARE.VERSION,
    step:step+1,index,total:3,sourceUrl:gallerySource,pageUrl:gallerySource+`foto/${index}/`,canonicalUrl:gallerySource,
    capturedAt:new Date(Date.parse(capturedAt)+(step+1)*1000).toISOString(),
    data:{title:'Casa da galleria Safari',price:2450,zone:'Piazza del Popolo, Roma',sqm:110,rooms:4},image:galleryPhoto(index)}));
  return {kind:SHARE.FRAMES_KIND,version:SHARE.VERSION,plan,frames};
}
shareStudio();
const carrierRequests=requests.length,carrierUploads=uploadCount;
await context.smartLinkPasteShare(JSON.stringify(framesPacket()));
assert.equal(currentPhotoCount(),3,'A complete carrier imports unique photos, not one image per repeated frame');
assert.equal(get('sl_source').value,gallerySource);assert.equal(get('sl_price').value,'2450');
assert.equal(get('sl_sqm').value,'110');assert.equal(get('sl_rooms').value,'4');
assert.equal(shareState().capturedAt,'2026-10-01T12:00:00.000Z','The Portal retains the plan observation date');
assert.deepEqual(requests.slice(carrierRequests).map(request=>request.body.imageUrl),[1,2,3].map(galleryPhoto),'Photo imports follow listing order, not frame discovery order');
assert.ok(requests.slice(carrierRequests).every(request=>request.url==='/api/smartlink/import-photo' && request.method==='POST' && request.body.sourceUrl===gallerySource));
assert.equal(get('sl_share_review').hidden,false);assert.equal(published,null);
await context.smartLinkCreate();assert.equal(published,null,'A complete carrier still requires explicit review');
assert.equal(uploadCount,carrierUploads);
context.smartLinkShareReview(true);await context.smartLinkCreate();
assert.equal(published.images.length,3);assert.equal(published.sourceUrl,gallerySource);assert.equal(published.historicalData,true);

shareStudio();
const unknownCarrier=framesPacket();unknownCarrier.frames[1].data.price=null;
get('sl_price').value='9999';
await context.smartLinkPasteShare(JSON.stringify(unknownCarrier));
assert.equal(get('sl_price').value,'','An unknown/conflicting frame price must stay blank in the actual Studio');

shareStudio();
const partialCarrier=framesPacket();partialCarrier.frames=partialCarrier.frames.slice(0,2);
await context.smartLinkPasteShare(JSON.stringify(partialCarrier));
assert.equal(currentPhotoCount(),2);assert.equal(shareState().expected,3);assert.equal(shareState().found,2);
assert.match(get('sl_share_status').textContent,/incompleta/);assert.equal(get('sl_share_review').hidden,true);
context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null,'A carrier prefix cannot publish even through a forced review checkbox');
for(const change of ['page','canonical','diagnostic']) {
  const invalid=framesPacket();
  if(change==='page') invalid.frames[1].pageUrl=gallerySource.replace('37221750','37221751')+'foto/1/';
  if(change==='canonical') invalid.frames[1].canonicalUrl=gallerySource.replace('37221750','37221751');
  if(change==='diagnostic') invalid.frames[1]={kind:SHARE.KIND,version:SHARE.VERSION,error:'source_mismatch'};
  const before={requests:requests.length,tokens:tokenReads,photos:currentPhotoCount(),key:get('sl_key').value,source:get('sl_source').value};
  await context.smartLinkPasteShare(JSON.stringify(invalid));
  assert.match(get('sl_share_status').textContent,/annunci diversi/,change+' shows the actual identity diagnostic');
  assert.deepEqual({requests:requests.length,tokens:tokenReads,photos:currentPhotoCount(),key:get('sl_key').value,source:get('sl_source').value},before,
    'An invalid carrier must not start downloads/read a token or replace the current draft: '+change);
  assert.equal(published,null);
}
context.smartLinkClose();

// Auth is checked before clipboard access, not merely when the server receives
// a photo request. Keep the DOM alive to prove session identity independently.
shareStudio();session('tenant','tenant',false);
const tenantReads=clipboardReads,tenantRequests=requests.length;
await context.smartLinkPasteShare(JSON.stringify(sharePacket()));await context.smartLinkPasteShare();
assert.equal(clipboardReads,tenantReads);assert.equal(requests.length,tenantRequests);

for(const change of ['source','close','account','same-account-new-session']) {
  shareStudio();clipboardText=JSON.stringify(sharePacket());holdClipboard=true;
  const before={photos:photoImports,tokens:tokenReads};
  const pending=context.smartLinkPasteShare();await until(()=>finishClipboard);
  if(change==='source') {get('sl_source').value=source.replace('124483437','87654321');context.smartLinkSourceChanged();}
  if(change==='close') context.smartLinkClose();
  if(change==='account') session('assistant','admin',false);
  if(change==='same-account-new-session') session('admin','admin',false);
  finishClipboard();await pending;holdClipboard=false;
  assert.equal(photoImports,before.photos,`A late clipboard result after ${change} must not download photos`);
  assert.equal(tokenReads,before.tokens,`A late clipboard result after ${change} must not read a new user's token`);
  assert.equal(currentPhotoCount(),0);
}

// Delayed network bytes and image decoding must also be discarded after logout;
// no next image is fetched and no object URL is inserted into the next session.
for(const stage of ['response','blob','prepare']) {
  shareStudio();
  if(stage==='response') holdPhoto=true;
  if(stage==='blob') holdBlob=true;
  if(stage==='prepare') holdPrepare=true;
  const before=photoImports;
  const pending=context.smartLinkPasteShare(JSON.stringify(sharePacket(2)));
  await until(()=>stage==='response'?finishPhoto:stage==='blob'?finishBlob:finishPrepare);
  session(null);
  const finish=stage==='response'?finishPhoto:stage==='blob'?finishBlob:finishPrepare;
  finish();await pending;
  assert.equal(photoImports,before+1,`Logout during ${stage} stops the remaining photo requests`);
  assert.equal(currentPhotoCount(),0);assert.equal(shareState(),null);
  assert.equal(published,null);
}

// Storage upload and token acquisition are the publication boundaries. Losing
// the session in either await must never create a SmartLink with the next user.
shareStudio();await context.smartLinkPasteShare(JSON.stringify(sharePacket(2)));
context.smartLinkShareReview(true);holdUpload=true;
const beforeUpload={uploads:uploadCount,lookups:downloadLookups};
const uploadPending=context.smartLinkCreate();await until(()=>finishUpload);
session(null);finishUpload();await uploadPending;
assert.equal(uploadCount,beforeUpload.uploads+1);assert.equal(downloadLookups,beforeUpload.lookups);
assert.equal(published,null,'Logout during the first upload must not publish or upload the next photo');
assert.equal(currentPhotoCount(),0);

shareStudio();await context.smartLinkPasteShare(JSON.stringify(sharePacket(1)));
context.smartLinkShareReview(true);holdToken=true;
const tokenPending=context.smartLinkCreate();await until(()=>finishToken);
session('assistant','admin',false);finishToken();await tokenPending;
assert.equal(published,null,'An old create token result cannot publish after an account change');
assert.equal(get('sl_create').dataset.created,undefined,'A stale response must not present success in the current Studio');
session();context.smartLinkClose();
// Device-downloaded bytes use the same source validator and actual local Blob
// conversion. Only image decoding/optimization, auth and Storage are simulated.
const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4f5YBAASbAc1Jyt1EAAAAAElFTkSuQmCC';
function mediaPacket(payload=framesPacket()) {
  const shared=SHARE.validate(payload);assert.equal(shared.ok,true);
  return {kind:MEDIA.KIND,version:MEDIA.VERSION,payload,images:shared.images.map((url,i)=>({index:i+1,url,mime:'image/png',base64:tinyPng}))};
}
shareStudio();
const mediaBefore={requests:requests.length,tokens:tokenReads,uploads:uploadCount,prepared:preparedBlobs.length};
await context.smartLinkPasteShare(JSON.stringify(mediaPacket()));
assert.equal(currentPhotoCount(),3);assert.equal(get('sl_price').value,'2450');
assert.equal(requests.length,mediaBefore.requests,'Local image transport makes zero source/import-photo requests');
assert.equal(tokenReads,mediaBefore.tokens,'Preparing local bytes does not acquire a backend token');
assert.equal(uploadCount,mediaBefore.uploads,'Local import does not publish or upload silently');
assert.equal(preparedBlobs.length-mediaBefore.prepared,3);
for(const blob of preparedBlobs.slice(mediaBefore.prepared)) {
  assert.equal(blob.type,'image/png');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()),Buffer.from(tinyPng,'base64'),'Real Blob bytes reach the existing image preparation boundary');
}
await context.smartLinkCreate();assert.equal(published,null,'Local bytes still require review');
context.smartLinkShareReview(true);await context.smartLinkCreate();
assert.equal(published.images.length,3);assert.equal(published.historicalData,true);assert.equal(uploadCount-mediaBefore.uploads,3);
assert.ok(requests.slice(mediaBefore.requests).every(request=>request.url==='/api/smartlink/create'),'Publication still uses the existing API; no fallback to source download');

const invalidMedia=mediaPacket();invalidMedia.images[0].url=galleryPhoto(99);
const mediaDraft={source:get('sl_source').value,key:get('sl_key').value,photos:currentPhotoCount(),requests:requests.length,tokens:tokenReads};
await context.smartLinkPasteShare(JSON.stringify(invalidMedia));
assert.match(get('sl_share_status').textContent,/non corrispondono/);
assert.deepEqual({source:get('sl_source').value,key:get('sl_key').value,photos:currentPhotoCount(),requests:requests.length,tokens:tokenReads},mediaDraft,
  'Reject malformed image bindings before replacing a draft, preparing photos or accessing network');

shareStudio();
const partialMedia=framesPacket();partialMedia.frames=partialMedia.frames.slice(0,2);
await context.smartLinkPasteShare(JSON.stringify(mediaPacket(partialMedia)));
assert.equal(currentPhotoCount(),2);assert.equal(shareState().found,2);assert.equal(shareState().expected,3);
assert.equal(get('sl_share_review').hidden,true);
context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null,'Valid local bytes cannot waive missing source photos');

shareStudio();rejectPrepare=true;
const decodeRequests=requests.length;
await context.smartLinkPasteShare(JSON.stringify(mediaPacket()));
assert.equal(currentPhotoCount(),0);assert.equal(shareState().failed,3);
assert.equal(requests.length,decodeRequests,'Decode failures never retry through a source/proxy endpoint');
context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null);

for(const change of ['source','close','account','same-account-new-session']) {
  shareStudio();holdPrepare=true;
  const before={requests:requests.length,prepared:preparedBlobs.length};
  const pending=context.smartLinkPasteShare(JSON.stringify(mediaPacket()));await until(()=>finishPrepare);
  if(change==='source') {get('sl_source').value=gallerySource.replace('37221750','37221751');context.smartLinkSourceChanged();}
  if(change==='close') context.smartLinkClose();
  if(change==='account') session('assistant','admin',false);
  if(change==='same-account-new-session') session('admin','admin',false);
  holdPrepare=false;finishPrepare();await pending;
  assert.equal(currentPhotoCount(),0,'Late local bytes cannot enter a changed draft/session: '+change);
  assert.equal(preparedBlobs.length-before.prepared,1,'Do not prepare the next image after cancellation: '+change);
  assert.equal(requests.length,before.requests);assert.equal(published,null);
}
context.smartLinkClose();

// Manual fields and actual files are independent of every source importer.
// Exercise the real drop/paste listeners and controller; decoding, auth and
// Storage stay simulated, so this does not claim a native iPhone picker test.
shareStudio();
const manualBefore={requests:requests.length,uploads:uploadCount,reads:clipboardReads};
get('sl_source').value='';context.smartLinkSourceChanged();
delete get('sl_source').dataset.draftSource;
get('sl_title').value='La casa scelta da BOOM';get('sl_price').value='1580';get('sl_zone').value='Cipro';
const localFiles=[1,2,3].map(i=>Object.assign(new Blob([Buffer.from(tinyPng,'base64')],{type:'image/png'}),{name:`casa-${i}.png`}));
function photoEvent(transfer,kind='dataTransfer',target=get('sl_photo_drop')) {
  return {[kind]:transfer,currentTarget:target,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
}
const fileDrop=photoEvent({files:localFiles.slice(0,2)});
await context.smartLinkPhotoDrop(fileDrop);
assert.equal(fileDrop.prevented,true);assert.equal(currentPhotoCount(),2);
const filePaste=photoEvent({files:[],items:[{kind:'file',getAsFile:()=>localFiles[2]}]},'clipboardData');
await context.smartLinkPhotoPaste(filePaste);
assert.equal(filePaste.prevented,true);assert.equal(currentPhotoCount(),3);
for(let i=0;i<=source.length;i++) {
  get('sl_source').value=source.slice(0,i);context.smartLinkSourceChanged(true);
  assert.equal(currentPhotoCount(),3,'Typing the first reference does not erase local photos');
}
context.smartLinkSourceChanged();
assert.equal(currentPhotoCount(),3,'Adding the first reference keeps locally chosen photos');
assert.equal(get('sl_title').value,'La casa scelta da BOOM','Adding the first reference keeps manually written data');
assert.equal(requests.length,manualBefore.requests,'Manual files never request a source, a reader job or a remote photo');
assert.equal(uploadCount,manualBefore.uploads,'Selecting or pasting files does not publish');
assert.equal(clipboardReads,manualBefore.reads,'Photo paste uses only the explicit event, without reading the clipboard API');
assert.equal(get('sl_price').value,'1580','Photo intake preserves manual price');
const photos=()=>vm.runInNewContext('smartLinkPhotoItems.map(item=>item.url)',context);
const originalOrder=Array.from(photos());
const remoteTransfer={files:[],items:[{kind:'string',type:'text/uri-list'}],getData:()=>''};
const linkDrop=photoEvent(remoteTransfer);
await context.smartLinkPhotoDrop(linkDrop);
assert.match(get('sl_photo_status').textContent,/collegamento, non una foto/);
const lastCard=get('sl_photo_preview').children[2];
lastCard.listeners.drop(photoEvent(remoteTransfer,'dataTransfer',lastCard));
assert.deepEqual(Array.from(photos()),originalOrder,'An external link on a thumbnail cannot move the first photo');
assert.equal(requests.length,manualBefore.requests,'A URL-only drop does not start a download');
const textPaste=photoEvent({files:[],items:[{kind:'string',type:'text/plain'}]},'clipboardData');
await context.smartLinkPhotoPaste(textPaste);
assert.equal(textPaste.prevented,false,'Text paste is not captured as an image');
assert.equal(currentPhotoCount(),3);assert.match(get('sl_photo_status').textContent,/non contengono una foto/);
const dragData=new Map();
get('sl_photo_preview').children[2].listeners.dragstart({dataTransfer:{setData:(key,value)=>dragData.set(key,value)}});
const firstCard=get('sl_photo_preview').children[0];
firstCard.listeners.drop(photoEvent({files:[],getData:key=>dragData.get(key) || ''},'dataTransfer',firstCard));
assert.deepEqual(Array.from(photos()),[originalOrder[2],originalOrder[0],originalOrder[1]],'Only an internal image drag changes the cover');
await context.smartLinkCreate();
assert.equal(published.title,'La casa scelta da BOOM');assert.equal(published.price,'1580');assert.equal(published.images.length,3);
assert.equal(uploadCount-manualBefore.uploads,3);
assert.deepEqual(requests.slice(manualBefore.requests).map(r=>r.url),['/api/smartlink/create'],'Manual creation requires no source access');
get('sl_source').value=source.replace('124483437','87654321');context.smartLinkSourceChanged();
assert.equal(currentPhotoCount(),0,'A different listing still starts a separate photo selection');
assert.equal(get('sl_title').value,'');
context.smartLinkClose();

// An incomplete source capture stays blocked until the operator explicitly
// discards that selection. Replacement files do not certify old source data.
shareStudio();await context.smartLinkPasteShare(JSON.stringify(sharePacket(1,3)));
const incompleteKey=get('sl_key').value;
context.smartLinkShareReview(true);await context.smartLinkCreate();assert.equal(published,null);
context.smartLinkUseLocalPhotos();
assert.equal(shareState(),null);assert.equal(currentPhotoCount(),0);
assert.notEqual(get('sl_key').value,incompleteKey);assert.equal(get('sl_title').value,'Casa da Safari');
assert.equal(get('sl_photos').clicked,true);assert.equal(get('sl_share_local').hidden,true);
await context.smartLinkCreate();assert.equal(published,null,'Discarding an incomplete capture cannot publish a card without replacement photos');
await context.smartLinkPhotosChanged(localFiles);
await context.smartLinkCreate();
assert.equal(published.images.length,3);assert.equal(published.historicalData,true,'Manual replacement retains the unverified age of imported data');
context.smartLinkClose();

// A bad file rolls back just its batch, preserving previously accepted photos.
shareStudio();await context.smartLinkPhotosChanged([localFiles[0]]);
const accepted=Array.from(photos());
failPrepareAt=preparedBlobs.length+2;
await context.smartLinkPhotoDrop(photoEvent({files:localFiles.slice(1)}));failPrepareAt=0;
assert.deepEqual(Array.from(photos()),accepted,'A failed batch preserves the earlier selection without half-imported files');
const preparedBeforeLimit=preparedBlobs.length;
await context.smartLinkPhotosChanged(Array(RULES.MAX_PHOTOS).fill(localFiles[0]));
assert.equal(preparedBlobs.length,preparedBeforeLimit);assert.equal(currentPhotoCount(),1);
context.smartLinkClose();

for(const change of ['source','close','account','same-account-new-session']) {
  shareStudio();holdPrepare=true;
  const preparedBefore=preparedBlobs.length;
  const pending=context.smartLinkPhotoPaste(photoEvent({files:localFiles},'clipboardData'));await until(()=>finishPrepare);
  if(change==='source') {get('sl_source').value=source.replace('124483437','87654321');context.smartLinkSourceChanged();}
  if(change==='close') context.smartLinkClose();
  if(change==='account') session('assistant','admin',false);
  if(change==='same-account-new-session') session('admin','admin',false);
  holdPrepare=false;finishPrepare();await pending;
  assert.equal(currentPhotoCount(),0,'Late manual files cannot enter a changed draft/session: '+change);
  assert.equal(preparedBlobs.length,preparedBefore+1,'A cancelled manual batch stops before its next file: '+change);
  context.smartLinkClose();
}
session();context.smartLinkClose();

// Explicit URL paste starts the real importer; ordinary input remains local.
const sourceInputMarkup=sourceCode.match(/<input id="sl_source"[^>]+>/)?.[0];
assert.ok(sourceInputMarkup);
assert.equal(sourceInputMarkup.match(/onpaste="([^"]+)"/)?.[1],'smartLinkPasteSource(event)');
const inputHandler=sourceInputMarkup.match(/oninput="([^"]+)"/)?.[1];
assert.equal((sourceCode.slice(start,end).match(/class="sl-step"/g) || []).length,2,'Studio has two numbered stages');
assert.match(sourceCode.slice(start,end),/1 <span>Annuncio<\/span>/);
assert.match(sourceCode.slice(start,end),/2 <span>Rivedi e crea<\/span>/);
function pasteStudio() {
  shareStudio();holdCapability=false;holdArchive=false;archiveOnlyFailure=false;archiveOnlyPayload=null;
  finishDirect=finishCapability=finishArchive=finishPost=null;
  directPayload={ok:true,data:{title:'Casa dal link',price:1590},images:directPhotos};
  get('sl_source').value='';context.smartLinkSourceChanged();
}
function sourcePaste(text,target=get('sl_source')) {
  return {currentTarget:target,clipboardData:{getData(type){assert.equal(type,'text/plain');return text;}},prevented:false,preventDefault(){this.prevented=true;}};
}
pasteStudio();
const typingBefore={requests:requests.length,tokens:tokenReads};
for(let i=0;i<=source.length;i++) {
  get('sl_source').value=source.slice(0,i);vm.runInNewContext(inputHandler,context);
}
await Promise.resolve();
assert.deepEqual({requests:requests.length,tokens:tokenReads},typingBefore,'Typing a URL must not start the importer');
context.smartLinkClose();

pasteStudio();
const pasteBefore={direct:directCount,clipboard:clipboardReads};
const pasted=sourcePaste('  '+source+'?utm_source=share#foto2  ');
const pastedImport=context.smartLinkPasteSource(pasted);
assert.equal(pasted.prevented,true);assert.equal(get('sl_source').value,source);
assert.equal(get('sl_import').disabled,true,'Pasting a supported URL starts import immediately');
await until(()=>finishDirect);
await context.smartLinkPasteSource(sourcePaste(source));
await context.smartLinkExtract();
assert.equal(directCount,pasteBefore.direct+1,'Repeated paste and Enter during import do not duplicate the request');
finishDirect();await pastedImport;
assert.equal(get('sl_title').value,'Casa dal link');assert.equal(currentPhotoCount(),1);
assert.equal(clipboardReads,pasteBefore.clipboard,'URL paste only reads the explicit event, never the clipboard API');
const completedRequests=requests.length;
context.smartLinkPasteSource(sourcePaste(source));
for(let i=0;i<10;i++) await Promise.resolve();
assert.equal(requests.length,completedRequests,'Pasting the same completed URL does not restart an import');
await directImport(directPayload);
assert.equal(directCount,pasteBefore.direct+2,'The explicit import button can still refresh the same URL');
context.smartLinkClose();

for(const text of ['', 'not a URL', 'https://example.invalid/annunci/123/', 'https://www.immobiliare.it/']) {
  pasteStudio();const before=requests.length,event=sourcePaste(text);
  await context.smartLinkPasteSource(event);
  assert.equal(event.prevented,false,'Unsupported text keeps normal paste behavior');
  assert.equal(requests.length,before);assert.equal(get('sl_source').value,'');
  context.smartLinkClose();
}
for(const busy of ['smartLinkBusy=true','smartLinkPhotoPreparing=true',"smartLinkJob={status:'reading'}","document.getElementById('sl_import').disabled=true"]) {
  pasteStudio();get('sl_source').value=source;context.smartLinkSourceChanged();
  const before=requests.length;vm.runInNewContext(busy,context);
  const event=sourcePaste(source.replace('124483437','87654321'));await context.smartLinkPasteSource(event);
  assert.equal(event.prevented,true);assert.equal(requests.length,before,'Busy paste cannot start another import');
  assert.equal(get('sl_source').value,source,'Busy paste cannot replace the active source');
  assert.match(get('sl_status').textContent,/Importazione in corso\. Attendi/);
  context.smartLinkResetSession();context.smartLinkClose();
}
for(const change of ['source','close','account','same-account-new-session']) {
  pasteStudio();holdCapability=true;
  const beforeDirect=directCount;
  const pending=context.smartLinkPasteSource(sourcePaste(source));await until(()=>finishCapability);
  if(change==='source') {get('sl_source').value=source.replace('124483437','87654321');context.smartLinkSourceChanged();}
  if(change==='close') context.smartLinkClose();
  if(change==='account') session('assistant','admin',false);
  if(change==='same-account-new-session') session('admin','admin',false);
  holdCapability=false;finishCapability();for(let i=0;i<15;i++) await Promise.resolve();
  assert.equal(directCount,beforeDirect,'Late URL-paste capability cannot import after '+change);
  await pending;
  assert.equal(currentPhotoCount(),0);context.smartLinkResetSession();context.smartLinkClose();
}
pasteStudio();holdToken=true;
const beforeTokenRequests=requests.length;
const tokenPaste=context.smartLinkPasteSource(sourcePaste(source));await until(()=>finishToken);
session('assistant','admin',false);holdToken=false;finishToken();for(let i=0;i<15;i++) await Promise.resolve();
assert.equal(requests.length,beforeTokenRequests,'A stale URL-paste auth token cannot start a network request');
await tokenPaste;
assert.equal(currentPhotoCount(),0);context.smartLinkResetSession();context.smartLinkClose();
pasteStudio();
const latePaste=context.smartLinkPasteSource(sourcePaste(source));await until(()=>finishDirect);
get('sl_source').value=source.replace('124483437','87654321');context.smartLinkSourceChanged();
finishDirect();await latePaste;
assert.equal(currentPhotoCount(),0,'A late URL-paste result cannot populate another listing');
assert.equal(get('sl_title').value,'');context.smartLinkClose();
for(const [uid,role] of [[null,null],['client','tenant']]) {
  pasteStudio();session(uid,role,false);const before=requests.length;
  await context.smartLinkPasteSource(sourcePaste(source));
  assert.equal(requests.length,before,'URL paste requires the current admin session');
  context.smartLinkResetSession();context.smartLinkClose();
}
session();context.smartLinkClose();
console.log('SmartLink Studio: explicit URL paste, duplicate/session guards, manual files, local media, galleries and loss-safe publication ✓');
