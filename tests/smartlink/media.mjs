import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import SHARE from '../../js/smartlink-share-engine.js';
import MEDIA from '../../js/smartlink-media-engine.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4f5YBAASbAc1Jyt1EAAAAAElFTkSuQmCC';
const source='https://www.idealista.it/immobile/37221750/';
const photo=index=>'https://img4.idealista.it/blur/WEB_DETAIL-L-L/0/id.pro.it.image.master/18/17/e4/'+(849829510+index)+'.webp';
const payload=(count=2)=>({kind:SHARE.KIND,version:1,sourceUrl:source,pageUrl:source,canonicalUrl:source,capturedAt:'2026-10-01T12:00:00.000Z',
  data:{title:'Casa fixture',price:2450,zone:'Roma',sqm:110,rooms:4},images:Array.from({length:count},(_,i)=>photo(i+1)),gallery:{expected:count,found:count}});
const packet=(count=2)=>{const shared=payload(count);return {kind:MEDIA.KIND,version:1,payload:shared,images:shared.images.map((url,i)=>({index:i+1,url,mime:'image/png',base64:png}))};};
function binding(api) {
  const valid=api.validate(packet());assert.equal(valid.ok,true);assert.equal(valid.media.length,2);
  for(const mutate of [p=>p.images.pop(),p=>p.images[0].index=2,p=>p.images[0].url=photo(99),p=>p.images.reverse()]) {
    const p=packet();mutate(p);assert.equal(api.validate(p).ok,false,'All supplied bytes must match the exact normalized source image list');
  }
}
function signatures(api) {
  const p=packet();p.images[0].mime='image/jpeg';assert.equal(api.validate(p).error,'invalid_media','Declared MIME must match binary signature');
  for(const content of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>','<!doctype html><h1>Denied</h1>','GIF89a','%PDF-1.7','xxxxftypavif']) {
    const p=packet();p.images[0].base64=Buffer.from(content).toString('base64');assert.equal(api.validate(p).ok,false);
  }
}
function fileBound(api) {
  const p=packet(1),bytes=Buffer.alloc(4_000_001);Buffer.from(png,'base64').copy(bytes);
  p.images[0].base64=bytes.toString('base64');assert.equal(api.validate(p).error,'media_too_large');
}
function canonicalBase64(api) {
  const p=packet();p.images[0].base64+='    ';
  assert.equal(api.validate(p).error,'invalid_media','Even otherwise-decodable whitespace is not canonical base64');
}
function totalBound(api) {assert.equal(api.validate(' '.repeat(16_000_001)).error,'payload_too_large','Bound raw transport before parsing');}
binding(MEDIA);signatures(MEDIA);canonicalBase64(MEDIA);fileBound(MEDIA);totalBound(MEDIA);
assert.equal(MEDIA.validate('€'.repeat(5_333_334)).error,'payload_too_large','UTF8 byte cap, not only UTF16 character count');
assert.deepEqual(MEDIA.validate(payload()),SHARE.validate(payload()),'Ordinary share still uses its original validator');
const oversized=payload();oversized.data.title='a'.repeat(131073);
assert.equal(MEDIA.validate(oversized).error,'payload_too_large','Legacy payload keeps the 128KiB cap');
const oversizedInner=packet();oversizedInner.payload=oversized;assert.equal(MEDIA.validate(oversizedInner).error,'payload_too_large');
for(const mutate of [p=>p.version=2,p=>p.secret='not allowed',p=>p.images[0].secret='not allowed',p=>p.images[0].mime='image/svg+xml',p=>p.images[0].base64='data:image/png;base64,'+png,p=>p.images[0].base64=png+'\n',p=>p.images[0].base64='AA=A',p=>p.images[0].base64='AB==']) {
  const p=packet();mutate(p);assert.equal(MEDIA.validate(p).ok,false,'Reject unknown fields and noncanonical base64');
}
const wrong=packet();wrong.payload.pageUrl=source.replace('37221750','999999');assert.equal(MEDIA.validate(wrong).error,'source_mismatch');
const incomplete=packet();incomplete.payload.gallery.expected=3;
assert.deepEqual(MEDIA.validate(incomplete).gallery,{expected:3,found:2},'Bytes do not turn an incomplete listing capture complete');
assert.equal(MEDIA.validate(packet(60)).media.length,60);assert.equal(MEDIA.validate(packet(61)).error,'too_many_photos');
const blob=MEDIA.toBlob(MEDIA.validate(packet(1)).media[0]);
assert.equal(blob.type,'image/png');assert.equal(blob.size,Buffer.from(png,'base64').length);
assert.deepEqual(Buffer.from(await blob.arrayBuffer()),Buffer.from(png,'base64'),'The local Blob contains the supplied bytes exactly');
const decoded=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});
assert.equal(decoded.info.width,1);assert.equal(decoded.info.height,1,'The test uses an actual decodable raster, not a magic-byte stub');
for(const [format,mime] of [['jpeg','image/jpeg'],['webp','image/webp']]) {
  const bytes=await sharp(Buffer.from(png,'base64')).toFormat(format).toBuffer(),p=packet(1);
  p.images[0].mime=mime;p.images[0].base64=bytes.toString('base64');
  const validated=MEDIA.validate(p);assert.equal(validated.ok,true,mime+' bytes must be supported');
  const local=MEDIA.toBlob(validated.media[0]);assert.equal(local.type,mime);
  assert.deepEqual(Buffer.from(await local.arrayBuffer()),bytes);
}
const implementation=readFileSync(new URL('../../js/smartlink-media-engine.js',import.meta.url),'utf8');
function load(code) {
  const context={window:{BOOM_SMARTLINK_SHARE:SHARE},TextEncoder,atob,Blob,Uint8Array,Date,JSON};
  for(const name of ['fetch','document','localStorage','sessionStorage','navigator']) Object.defineProperty(context,name,{get(){throw new Error('Forbidden access: '+name);}});
  vm.runInNewContext(code,context);return context.window.BOOM_SMARTLINK_MEDIA;
}
binding(load(implementation));
for(const [name,before,after,check] of [
  ['image binding','item.url!==shared.images[i]','false',binding],
  ['image count','packet.images.length!==shared.images.length','false',binding],
  ['MIME signature','if(mime!==item.mime)','if(false)',signatures],
  ['base64 syntax'," || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)",'',canonicalBase64],
  ['single-file cap','MAX_IMAGE_BYTES=4_000_000','MAX_IMAGE_BYTES=8_000_000',fileBound],
  ['raw byte cap','MAX_BYTES=16_000_000','MAX_BYTES=20_000_000',totalBound],
]) {
  assert.ok(implementation.includes(before));assert.throws(()=>check(load(implementation.replace(before,after))),{code:'ERR_ASSERTION'},'Mutation detected: '+name);
}
const portal=readFileSync(new URL('../../portal.html',import.meta.url),'utf8');
assert(portal.indexOf('/js/smartlink-share-engine.js')<portal.indexOf('/js/smartlink-media-engine.js'));
const sw=readFileSync(new URL('../../sw.js',import.meta.url),'utf8');assert(sw.includes("url.pathname === '/js/smartlink-media-engine.js'"));
console.log('SmartLink local media: PASS (real SHARE validation, exact image binding, 16MB/4MB/60, strict raster/base64, local Blob, 6 mutations; native transfer/browser decoding not certified)');
