import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
// Already installed through mailparser; parse real HTML, never mock capture's output.
import {parseDocument} from 'htmlparser2';
import RULES from '../../js/smartlink-engine.js';
import SHARE from '../../js/smartlink-share-engine.js';

const source='https://www.immobiliare.it/annunci/123456789/';
const idealista='https://www.idealista.it/immobile/123456789/';
const photo=i=>'https://pwm.im-cdn.it/image/'+i+'/xxl-c.jpg';
const now=Date.parse('2026-10-31T12:00:00.000Z');
const input=()=>({kind:'boom.smartlink.share',version:1,sourceUrl:source,pageUrl:source,
  canonicalUrl:source,capturedAt:'2026-10-31T11:00:00.000Z',
  data:{title:'Bilocale test',price:'1500.00',zone:'Cipro',sqm:55,rooms:2},
  images:[photo(1),photo(2)],gallery:{expected:2,found:2}});
const normalize=value=>JSON.parse(JSON.stringify(value));

// Small browser-DOM adapter over htmlparser2's actual tree. The selectors used
// by capture are evaluated against the HTML fixture, not answered by fixtures.
function dom(html) {
  const tree=parseDocument(html), wrappers=new WeakMap();
  const text=node=>node.type==='text'?node.data:(node.children || []).map(text).join('');
  const matches=(node,selector)=>{
    if(!node.name) return false;
    if(selector[0]==='.') return (node.attribs.class || '').split(/\s+/).includes(selector.slice(1));
    if(selector[0]==='#') return node.attribs.id===selector.slice(1);
    const match=selector.match(/^([a-z0-9-]+)?(?:\[([a-z0-9-]+)="([^"]*)"\])?$/i);
    assert.ok(match,'Add DOM support for a real new selector: '+selector);
    return (!match[1] || node.name===match[1]) && (!match[2] || node.attribs[match[2]]===match[3]);
  };
  const find=(node,selector)=>{
    const result=[];
    for(const child of node.children || []) {
      if(matches(child,selector)) result.push(wrap(child));
      result.push(...find(child,selector));
    }
    return result;
  };
  const wrap=node=>{
    if(wrappers.has(node)) return wrappers.get(node);
    const value={getAttribute:name=>node.attribs?.[name] ?? null,
      get textContent(){return text(node);},get currentSrc(){return node.attribs?.src || '';},
      querySelectorAll:selector=>find(node,selector),querySelector:selector=>find(node,selector)[0] || null};
    wrappers.set(node,value);return value;
  };
  const document=wrap(tree);
  for(const key of ['cookie','images','documentElement','body','localStorage','sessionStorage']) {
    Object.defineProperty(document,key,{get(){throw new Error('Forbidden document access: '+key);}});
  }
  return document;
}
const script=value=>'<script type="application/ld+json">'+JSON.stringify(value)+'</script>';
const apartment=(extra={})=>({'@type':'Apartment',url:source,name:'Casa strutturata',offers:{price:'1500.00'},
  floorSize:{value:55},numberOfRooms:2,image:[photo(1),photo(2)],...extra});
const html=(extra='')=>'<link rel="canonical" href="'+source+'"><h1>Casa test</h1>'+script(apartment())+extra;

function checkIdentity(api) {
  const p=input();p.pageUrl=source.replace('123456789','999999999');
  assert.equal(api.validate(p,now).error,'source_mismatch');
  p.pageUrl=source;p.canonicalUrl=idealista;
  assert.equal(api.validate(p,now).error,'source_mismatch');
  assert.equal(api.capture(dom(script({'@type':'WebPage',url:source,mainEntity:apartment({url:'/annunci/999999999/'})})),source).error,'source_mismatch');
}
function checkNoSecrets(api) {
  const captured=api.capture(dom(html('<input name="password" value="fixture-secret"><script>throw new Error("Never execute me")</script>')),source);
  assert.equal(captured.ok,true);
  assert.equal(JSON.stringify(captured).includes('fixture-secret'),false);
  const p=input();p.cookies='fixture-secret';
  assert.equal(api.validate(p,now).error,'invalid_payload');
  delete p.cookies;p.data.token='fixture-secret';
  assert.equal(api.validate(p,now).error,'invalid_data');
}
function checkIncomplete(api) {
  const captured=api.capture(dom(html('<div class="in-gallery__counter">1 / 3</div>')),source);
  assert.equal(captured.ok,true,'Incomplete data remains readable for an explicit UI block/notice');
  const validated=api.validate(captured.payload);
  assert.equal(validated.gallery.expected,3);
  assert.equal(validated.gallery.found,2);
  assert.ok(validated.gallery.expected>validated.gallery.found,'Never rewrite the expected total to make it complete');
}
function checkSixty(rules) {
  const key='11111111-1111-4111-8111-111111111111';
  const images=Array.from({length:60},(_,i)=>'https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/'+encodeURIComponent('smartlinks/'+key+'/'+String(i).padStart(8,'0')+'-2222-4222-8222-222222222222.webp')+'?alt=media');
  assert.equal(rules.MAX_PHOTOS,60);
  assert.equal(rules.cleanImages(images,key).length,60);
  assert.equal(rules.reusableImages({active:true,sourceUrl:source,images},source,images).length,60);
  assert.equal(rules.publicRecord({images}).images.length,60);
  assert.equal(rules.cleanImages([...images,images[0]],key),null);
}

const validated=SHARE.validate(input(),now);
assert.equal(validated.ok,true);assert.equal(validated.data.price,1500);
assert.equal(validated.capturedAt,input().capturedAt,'Old capture time must survive, never replaced by now');
for(const alias of ['https://immobiliare.it/annunci/123456789','https://www.immobiliare.it/annunci/123456789/?utm_source=fixture#foto2']) {
  const p=input();p.pageUrl=alias;assert.equal(SHARE.validate(JSON.stringify(p),now).ok,true);
}
for(const invalid of ['http://www.immobiliare.it/annunci/123456789/','https://www.immobiliare.it:443/annunci/123456789/',
  'https://@www.immobiliare.it/annunci/123456789/','https://m.immobiliare.it/annunci/123456789/',
  'https://www.immobiliare.it/ricerca/123456789/','https://www.immobiliare.it.evil.test/annunci/123456789/',
  'https://www.idealista.com/inmueble/123456789/','https://www.immobiliare.it/annunci/123456789/?x='+('x'.repeat(2048))]) {
  const p=input();p.pageUrl=invalid;assert.equal(SHARE.validate(p,now).ok,false,invalid);
}
checkIdentity(SHARE);checkNoSecrets(SHARE);checkIncomplete(SHARE);checkSixty(RULES);
for(const at of ['not-a-date','2026-02-30T11:00:00.000Z','2026-10-31T12:05:00.001Z','2099-01-01T00:00:00.000Z']) {
  const p=input();p.capturedAt=at;assert.equal(SHARE.validate(p,now).error,'invalid_capture_date');
}
const grace=input();grace.capturedAt='2026-10-31T12:05:00Z';assert.equal(SHARE.validate(grace,now).ok,true);
for(const price of [null,1500.5,'1500.00']) {const p=input();p.data.price=price;assert.equal(SHARE.validate(p,now).ok,true);}
for(const price of [true,false,-3,'1.500,00',{},'1500 euro']) {const p=input();p.data.price=price;assert.equal(SHARE.validate(p,now).error,'invalid_data');}
for(const wrong of [null,{},[],{...input(),version:2},{...input(),kind:'other'}]) assert.equal(SHARE.validate(wrong,now).ok,false);
assert.equal(SHARE.validate('{broken',now).error,'invalid_payload');
assert.deepEqual(SHARE.validate({kind:'boom.smartlink.share',version:1,error:'photos_not_found'},now),{ok:false,error:'photos_not_found'});
for(const extra of [{error:'arbitrary secret'}, {cookies:'secret'}, {data:{title:'hidden'}}]) {
  assert.equal(SHARE.validate({kind:'boom.smartlink.share',version:1,error:'photos_not_found',...extra},now).error,'invalid_payload');
}
assert.equal(SHARE.validate(' '.repeat(131073),now).error,'payload_too_large','Bound before JSON parsing');
assert.equal(SHARE.validate({...input(),data:{title:'é'.repeat(65536)}},now).error,'payload_too_large','Limit is UTF-8 bytes, not JS character count');
for(const url of ['https://img.idealista.it/photo.jpg','https://pwm.im-cdn.it.evil.test/photo.jpg','https://127.0.0.1/photo.jpg',photo(1)+'#token',photo(1)+'?x='+('a'.repeat(2048))]) {
  const p=input();p.images=[url];p.gallery={expected:1,found:1};assert.equal(SHARE.validate(p,now).error,'invalid_photo_url');
}
const duplicate=input();duplicate.images=[photo(1),photo(1)];assert.equal(SHARE.validate(duplicate,now).error,'invalid_photo_url');
for(const gallery of [{expected:1,found:2},{expected:2,found:1},{expected:null,found:2,cookie:'secret'},{found:2},{expected:2.5,found:2}]) {
  assert.equal(SHARE.validate({...input(),gallery},now).error,'invalid_gallery');
}
const sixty=input();sixty.images=Array.from({length:60},(_,i)=>photo(i));sixty.gallery={expected:60,found:60};
assert.equal(SHARE.validate(sixty,now).images.length,60);
sixty.images.push(photo(60));sixty.gallery={expected:61,found:61};assert.equal(SHARE.validate(sixty,now).error,'too_many_photos');

const captured=SHARE.capture(dom(html('<div class="recommendations"><img src="'+photo(999)+'"></div><div class="in-carousel"><img src="'+photo(998)+'"></div>'+script({'@type':'ItemList',itemListElement:[apartment({url:source.replace('123456789','999'),image:[photo(997)]})]}))),source);
assert.equal(captured.ok,true);assert.deepEqual(captured.payload.images,[photo(1),photo(2)]);
assert.equal(captured.payload.gallery.expected,null,'JSON-LD array length does not prove gallery total');
assert.equal(captured.payload.data.price,1500);assert.equal(captured.payload.data.rooms,2);
assert.equal(SHARE.capture(dom(html()),source.replace('123456789','999')).error,'source_mismatch');
assert.equal(SHARE.capture(dom(script(apartment({url:source,'@id':source.replace('123456789','999')}))),source).error,'source_mismatch');
assert.equal(SHARE.capture(dom(script(apartment({numberOfRooms:undefined,numberOfBedrooms:2}))),source).payload.data.rooms,null);
assert.equal(SHARE.capture(dom('<h1>Solo suggerimenti</h1><img src="'+photo(999)+'">'),source).error,'photos_not_found');
assert.equal(SHARE.capture(dom(script(apartment({'@type':'Organization'}))),source).error,'photos_not_found','A matching URL does not turn an unrelated schema type into the listing');
assert.equal(SHARE.capture(dom(script(apartment({image:Array.from({length:61},(_,i)=>photo(i))}))),source).error,'too_many_photos');
const galleryOnly=SHARE.capture(dom('<h1>Casa Safari</h1><div class="in-detail__price">1.500,00 € / mese</div><div class="in-gallery" data-count="2"><img src="'+photo(1)+'"><img data-original="'+photo(2)+'" src="'+photo(2).replace('xxl','small')+'"></div>'),source);
assert.equal(galleryOnly.ok,true);assert.equal(galleryOnly.payload.data.price,1500);assert.equal(galleryOnly.payload.images.length,2);
const high='https://img.idealista.it/WEB_DETAIL/fixture-original.jpg',low='https://img.idealista.it/WEB_THUMB/fixture-thumb.jpg';
const idealistaCapture=SHARE.capture(dom('<link rel="canonical" href="'+idealista+'"><h1>Casa Safari</h1><div class="info-data-price">1.500 €/mese</div><div id="main-multimedia" data-total="1"><img data-original="'+high+'" src="'+low+'"></div>'),idealista);
assert.equal(idealistaCapture.ok,true);assert.deepEqual(idealistaCapture.payload.images,[high],'One DOM image contributes one variant');
assert.equal(idealistaCapture.payload.data.price,1500);

const implementation=await readFile(new URL('../../js/smartlink-share-engine.js',import.meta.url),'utf8');
function load(code, rules=RULES) {
  let network=0;
  const context={window:{BOOM_SMARTLINK:rules},URL,Date,TextEncoder,Set,JSON,
    fetch(){network++;throw new Error('Network forbidden');},XMLHttpRequest:function(){network++;throw new Error('Network forbidden');},
    navigator:{sendBeacon(){network++;throw new Error('Network forbidden');}}};
  for(const key of ['localStorage','sessionStorage']) Object.defineProperty(context,key,{get(){throw new Error('Secret access forbidden');}});
  vm.runInNewContext(code,context);
  return {api:context.window.BOOM_SMARTLINK_SHARE,network:()=>network};
}
const browser=load(implementation);
checkNoSecrets(browser.api);checkIdentity(browser.api);checkIncomplete(browser.api);
assert.equal(browser.network(),0);
assert.deepEqual(normalize(browser.api.validate(input(),now)),validated,'Browser and CommonJS share the same rules');
const mutations=[
  ['identity','a.id===b.id','true',checkIdentity],
  ['secret access','const source=listing(pageUrl);','const source=listing(pageUrl); document.cookie;',checkNoSecrets],
  ['network access','const source=listing(pageUrl);','const source=listing(pageUrl); fetch(pageUrl);',checkNoSecrets],
  ['incomplete count','gallery:{expected:gallery.expected,found:images.length}','gallery:{expected:images.length,found:images.length}',checkIncomplete],
];
for(const [name,from,to,check] of mutations) {
  assert.ok(implementation.includes(from),'Mutation target exists: '+name);
  const mutant=load(implementation.replace(from,to));
  assert.throws(()=>check(mutant.api),{code:'ERR_ASSERTION'},'Mutation must be detected: '+name);
}
const rulesImplementation=await readFile(new URL('../../js/smartlink-engine.js',import.meta.url),'utf8');
const context={window:{},URL,Math,Number,Set};
vm.runInNewContext(rulesImplementation.replace('const MAX_PHOTOS = 60;','const MAX_PHOTOS = 12;'),context);
assert.throws(()=>checkSixty(context.window.BOOM_SMARTLINK),{code:'ERR_ASSERTION'},'Restoring 12 loses real shared images');
console.log('SmartLink Safari share: real HTML fixtures, identity, private-data/network guards, source photos, incomplete totals, 60-photo roundtrip and 5 mutations ✓');
