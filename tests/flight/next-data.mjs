import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const Data=require('../../assets/boom-flight-next-data.js');
const Facts=require('../../js/listing-facts.js'),Dispo=require('../../js/dispo-engine.js');
const source=readFileSync(new URL('../../assets/boom-flight-next-data.js',import.meta.url),'utf8');
let passed=0;
async function check(name,fn){await fn();passed++;console.log('  ✓ '+name);}
const home=values=>({id:'home-one',name:'The real home',status:'available',availableDate:'Immediate',...values});
function adapter(fetch,extras={},code=source){
  const box={module:{exports:{}},URL,Promise,AbortController,setTimeout,clearTimeout,fetch,
    require:path=>path.includes('listing-facts')?Facts:Dispo,...extras};
  vm.runInNewContext(code,box);return box.module.exports;
}
await check('Only public listing states and safe canonical IDs enter the experience',()=>{
  for(const status of ['available','waitlist','rented','reserved'])assert.ok(Data.normalize(home({status})));
  for(const status of ['reference_only','draft','hidden','archived','off_market','something-new',''])assert.equal(Data.normalize(home({status})),null);
  for(const id of ['', 123, true, '../home','home?apply=1','home#x','https://example.com'])assert.equal(Data.normalize(home({id})),null);
  assert.equal(Data.normalize(home({name:''})),null);
  assert.equal(Data.normalize(home()).canonicalUrl,'/listing/home-one');
});
await check('Structured bedroom facts preserve a studio and override misleading legacy text',()=>{
  const zero=Data.normalize(home({bedrooms:0,beds:'3 bedrooms',sqm:null,bathrooms:null}));
  assert.equal(zero.bedrooms,0);assert.equal(zero.area,null);assert.equal(zero.bathrooms,null);
  assert.equal(Data.normalize(home({bedrooms:2,beds:'1BR + Loft'})).bedrooms,2);
  assert.equal(Data.normalize(home({beds:'3 bedrooms'})).bedrooms,3);
  assert.equal(Data.normalize(home()).bedrooms,null);
  for(const price of [null,undefined,'','€1500','1,500','1500 euros',true,-10,0,Infinity])
    assert.equal(Data.normalize(home({price})).price,null);
  assert.equal(Data.normalize(home({price:'1500.50',sqm:'65'})).price,1500.5);
  assert.equal(Data.normalize(home({sqm:'65mq'})).area,null);
});
await check('Availability comes from Dispo, including ambiguous dates and occupied homes',()=>{
  const today='2026-10-29';
  assert.equal(Data.normalize(home({availableDate:'Ask the landlord'}),today).status,'Ask us for the date');
  const ahead=Data.normalize(home({status:'rented',availableFrom:'2027-03-01'}),today);
  assert.equal(ahead.lane,'ahead');assert.match(ahead.status,/1 Mar 2027/);
  assert.equal(Data.normalize(home({status:'rented',availableDate:'Immediate'}),today).lane,'closed');
  assert.equal(Data.normalize(home({status:'waitlist',availableDate:''}),today).status,'Reserve ahead');
});
await check('Photos accept only safe local or HTTPS URLs, deduplicate, and never mutate the original document',()=>{
  const images=Object.freeze(['javascript:alert(1)','data:image/svg+xml,x','//evil.test/x','/\\evil.test/x','/x\n.jpg',
    'https://user:secret@example.test/x','https://img.test/home.jpg','https://img.test/home.jpg','/foto-catalogo/home.jpg']);
  const raw=Object.freeze(home({images,features:Object.freeze([' A/C ','Balcony']),description:'One real\nhome.'}));
  const card=Data.normalize(raw);assert.strictEqual(card.raw,raw);
  assert.deepEqual(card.images,['https://img.test/home.jpg','/foto-catalogo/home.jpg']);
  assert.equal(card.image,card.images[0]);assert.equal(card.description,'One real home.');
  assert.equal(Data.normalize(home({images:[],image:'/real.jpg'})).image,'/real.jpg');
});
await check('Budget, declared type and bedroom filters require a known match without changing unfiltered unknowns',()=>{
  const records=[
    Data.normalize(home({id:'studio',type:'Studio',bedrooms:0,price:1000})),
    Data.normalize(home({id:'two',type:'Apartment',bedrooms:2,price:1500})),
    Data.normalize(home({id:'three',type:'apartment',bedrooms:3,price:1800})),
    Data.normalize(home({id:'unknown',price:null,bedrooms:null,type:''}))
  ];
  const ids=criteria=>Data.cards(records,criteria).map(card=>card.id);
  assert.equal(ids({}).length,4);assert.equal(ids({budgetMax:0}).length,4);
  assert.deepEqual(ids({budgetMax:1500}),['studio','two']);
  assert.deepEqual(ids({bedrooms:0}),['studio']);
  assert.deepEqual(ids({bedrooms:'2',type:'APARTMENT'}),['two','three']);
  assert.deepEqual(ids({budgetMax:1500,bedrooms:2,type:'apartment'}),['two']);
  assert.equal(records.length,4);
});
await check('Only a structured inclusion label can imply included bills; furnishing retains partial/unknown',()=>{
  assert.equal(Data.normalize(home({description:'Bills included in the brochure'})).billsIncluded,false);
  assert.equal(Data.normalize(home({tags:['All inclusive']})).billsIncluded,true);
  assert.equal(Data.normalize(home({furnished:'partial'})).furnished,'partial');
  assert.equal(Data.normalize(home({furnished:'maybe'})).furnished,null);
});
await check('Concurrent load calls share one request, later loads reread live data, and duplicates stay unique',async()=>{
  let reads=0,release;
  const A=adapter(async(url,options)=>{reads++;assert.equal(url,'/api/listings');assert.equal(options.cache,'no-store');
    await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true,listings:[home(),home(),home({id:'draft',status:'draft'})]})};});
  const first=A.load(),second=A.load();assert.strictEqual(first,second);
  await Promise.resolve();assert.equal(reads,1);release();
  assert.equal((await first).length,1);
  const third=A.load();await Promise.resolve();assert.equal(reads,2);release();await third;
});
await check('A confirmed empty catalogue differs from HTTP/malformed/network errors and a failed load is retryable',async()=>{
  let response={ok:false};
  const A=adapter(async()=>response);
  await assert.rejects(A.load(),error=>error.code==='catalogue-http');
  response={ok:true,json:async()=>({ok:true,listings:[]})};assert.equal((await A.load()).length,0);
  response={ok:true,json:async()=>({ok:false,listings:[]})};
  await assert.rejects(A.load(),error=>error.code==='catalogue-shape');
  response={ok:true,json:async()=>({ok:true})};
  await assert.rejects(A.load(),error=>error.code==='catalogue-shape');
  const B=adapter(async()=>{throw Error('offline');});
  await assert.rejects(B.load(),error=>error.code==='catalogue-network');
});
await check('A stalled catalogue read aborts at the real timeout boundary and exposes a retryable error',async()=>{
  let timeout,cleared=false;
  const A=adapter((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')))),
    {setTimeout:(fn,ms)=>{assert.equal(ms,15000);timeout=fn;return 1;},clearTimeout:()=>cleared=true});
  const pending=A.load();await Promise.resolve();timeout();
  await assert.rejects(pending,error=>error.code==='catalogue-timeout');assert.equal(cleared,true);
});
await check('Mutations that publish reference-only records or replace structured bedrooms are detected',()=>{
  function contract(A){
    assert.equal(A.normalize(home({status:'reference_only'})),null);
    assert.equal(A.normalize(home({bedrooms:0,beds:'3 bedrooms'})).bedrooms,0);
  }
  contract(Data);
  for(const [before,after] of [
    ["'rented', 'reserved'","'rented', 'reserved', 'reference_only'"],
    ['facts.bedroomsOf(raw)','Number(raw.beds) || 3']
  ]){
    assert.ok(source.includes(before));const mutated=adapter(()=>{}, {}, source.replace(before,after));
    assert.throws(()=>contract(mutated));
  }
});
console.log('Flight Next data: '+passed+' passed, 0 failed');
