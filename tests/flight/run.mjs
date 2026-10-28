import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import './guide.mjs';
import './stay.mjs';
const require=createRequire(import.meta.url);
const F=require('../../js/flight-engine.js');
const S=require('../../assets/boom-flight-search.js');
let checks=0;
function check(name,fn){fn();checks++;console.log('  ✓ '+name);}
check('Saved preferences reject external paths, malformed JSON and duplicate homes',()=>{
 assert.deepEqual(F.saved('broken'),[]);assert.deepEqual(F.saved('{}'),[]);
 assert.deepEqual(F.saved(['/listing/abc','/listing/abc','https://evil.test/a','//evil.test','/listing/../foo','/listing/a?email=x']),['/listing/abc']);
});
check('A shared Skyline carries only IDs, never personal places or saved prices',()=>{
 const url=F.skyline(['/listing/one','/listing/two']);assert.equal(url,'/skyline?homes=one,two');
 assert.equal(F.skyline([]),'/skyline');assert.equal(F.listing('x?private=y'),null);
 assert.equal(F.skyline(Array.from({length:40},(_,i)=>'/listing/a'+i)).split(',').length,20);
});
function form(){const button={disabled:false,textContent:'Save search'},status={textContent:''};return {dataset:{},button,status,querySelector:s=>s==='[type="submit"]'?button:status};}
const body={email:'synthetic@example.test',criteria:{budgetMax:1500,zones:['Prati']},company:''};
let f=form(),requests=0,finish;
const pending=S.submit(f,body,async(url,options)=>{requests++;assert.equal(url,'/api/search/save');assert.deepEqual(JSON.parse(options.body),body);return new Promise(r=>{finish=r;});});
await S.submit(f,body,()=>{throw Error('duplicate');});
check('Repeated clicks while pending send one request and no false confirmation',()=>{assert.equal(requests,1);assert.equal(f.button.disabled,true);assert.equal(f.status.textContent,'');});
finish({ok:false,status:500,json:async()=>({ok:false,error:'store_failed'})});
assert.equal(await pending,false);
check('A rejected save retains the form and gives a retry path',()=>{assert.equal(f.button.disabled,false);assert.match(f.status.textContent,/could not be saved/);assert.equal(f.dataset.sending,'false');});
assert.equal(await S.submit(f,body,async()=>({ok:true,status:200,json:async()=>({ok:true,id:'synthetic-id'})})),true);
check('Confirmation follows a successful stored ID from the server',()=>assert.match(f.status.textContent,/Search saved/));
f=form();await S.submit(f,body,async()=>({ok:true,status:200,json:async()=>({ok:false})}));
check('HTTP 200 alone cannot produce success',()=>assert.doesNotMatch(f.status.textContent,/Search saved/));
f=form();await S.submit(f,body,async()=>{throw Error('offline');});
check('Network failure is explicit and re-enables submission',()=>{assert.equal(f.button.disabled,false);assert.match(f.status.textContent,/could not confirm/);});
f=form();await S.submit(f,body,async()=>({ok:false,status:429,json:async()=>({ok:false})}));
check('Rate limiting asks the visitor to wait rather than claiming a saved search',()=>assert.match(f.status.textContent,/few minutes/));
for(const file of ['index.html','apartments.html','apartment-detail.html','skyline.html']){
 const src=readFileSync(new URL('../../'+file,import.meta.url),'utf8');
 check(file+' uses the shared shell once',()=>{assert.equal(src.split('src="/assets/boom-flight.js?').length-1,1);assert.match(src,/src="\/js\/flight-engine.js\?/);});
}
const apartments=readFileSync(new URL('../../apartments.html',import.meta.url),'utf8');
check('Catalogue uses the real transport and retains dynamic registration',()=>{assert.match(apartments,/BoomSaveSearch.submit\(forma, corpo\)/);assert.doesNotMatch(apartments,/Saved — PREVIEW|POST \/api\/search\/save', corpo/);assert.match(apartments,/__muroInnesta/);assert.match(apartments,/flight-split/);});
console.log(`\nFlight: ${checks} passed, 0 failed`);
