import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import RULES from '../../js/smartlink-engine.js';
class Element {
  constructor(){this.value='';this.dataset={};this.disabled=false;this.children=[];this.isConnected=true;this.classList={add(){},remove(){}};}
  set value(v){this._value=String(v);} get value(){return this._value || '';}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  addEventListener(){} setAttribute(){} removeAttribute(){} focus(){} remove(){this.isConnected=false;}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id)) nodes.set(id,new Element());return nodes.get(id);};
let submitted=0,published,finishPost;
const source='https://www.immobiliare.it/annunci/124483437/';
const key=crypto.randomUUID(),photo=n=>`https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/${encodeURIComponent('smartlinks/'+key+'/'+n+'1111111-1111-4111-8111-111111111111.webp')}?alt=media`;
const ready={id:'Abcd1234Efgh5678ijkl',sourceUrl:source,draftKey:key,status:'ready',data:{title:'Bilocale',zone:'Cipro',price:1500},images:[photo(1),photo(2)]};
const context={window:{crypto,BOOM_SMARTLINK:RULES},URL,Promise,console,encodeURIComponent,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},
  document:{getElementById:get,createElement:()=>new Element(),querySelector:()=>get('body')},
  auth:{currentUser:{getIdToken:async()=>'admin'}},toast(){},closeModal(){},esc:String,
  storage:{ref(){throw new Error('An archived photo must not be reuploaded from the phone');}},
  fetch:async(url,opts={})=>{
    if(url==='/api/smartlink/create'){published=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,url:'https://www.boomrome.com/smartlink?id=test'})};}
    if(opts.method==='POST'){submitted++;return new Promise(resolve=>{finishPost=()=>resolve({ok:true,json:async()=>({ok:true,job:{...ready,status:'queued'}})});});}
    return {ok:true,json:async()=>({ok:true,jobs:[],job:ready,online:true})};
  }};
const sourceCode=readFileSync(new URL('../../js/portal-app.js',import.meta.url),'utf8');
const start=sourceCode.indexOf('    function openExternalSmartLink() {'),end=sourceCode.indexOf('    // ═════════',sourceCode.indexOf('    async function smartLinkCreate()'));
vm.runInNewContext(sourceCode.slice(start,end)+"\nsmartLinkArea={reset(){},suggest(){},ready(){return true;},value(){return null;},destroy(){}};",context);
get('sl_source').value=source;context.smartLinkSourceChanged();
const first=context.smartLinkExtract();await Promise.resolve();await Promise.resolve();
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
console.log('SmartLink Studio: double submit, source race, resume, archived photo order and publication guard ✓');
