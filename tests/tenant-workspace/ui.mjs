import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),engine=require('../../js/tenant-workspace-engine.js');
const source=readFileSync(new URL('../../js/tenant-workspace-ui.js',import.meta.url),'utf8');
async function flush(){for(let i=0;i<30;i++)await Promise.resolve();await new Promise(r=>setImmediate(r))}
function fixture(storage=new Map()){
  const nodes=new Map(),calls=[];let postReply=null,readError=false;
  function node(id){if(nodes.has(id))return nodes.get(id);const n={innerHTML:'',querySelectorAll(selector){
    if(selector!=='form')return [];
    this.forms=[...this.innerHTML.matchAll(/<form data-ticket-form="([^"]+)">([\s\S]*?)<\/form>/g)].map(m=>{
      const elements={};for(const x of m[2].matchAll(/<textarea name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g))elements[x[1]]={value:x[2]};
      for(const x of m[2].matchAll(/<input name="([^"]+)"[^>]*value="([^"]*)"/g))elements[x[1]]={value:x[2]};
      for(const x of m[2].matchAll(/<select name="([^"]+)">([\s\S]*?)<\/select>/g))elements[x[1]]={value:x[2].match(/value="([^"]+)" selected/)[1]};
      return {dataset:{ticketForm:m[1]},elements};
    });return this.forms;
  }};nodes.set(id,n);return n}
  const ctx={console,URL,AbortController,crypto:webcrypto,Date,setTimeout,clearTimeout,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{getElementById:node},BOOM_TENANT_WORKSPACE:engine,
    fetch:async(url,opts)=>{calls.push({url,body:opts.body&&JSON.parse(opts.body)});if(opts.method==='POST'){if(postReply)return postReply(url,opts);const b=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,ticket:{...b,id:'ticket-1',status:'open',editable:true,revision:1}})}}
      if(readError)throw Error('offline');return {ok:true,json:async()=>url.includes('notifications')?{ok:true,notifications:[{title:'Update <script>',message:'Text <img>',createdAt:'2026-10-13'}]}:url.includes('documents')?{ok:true,documents:[{id:'d',name:'Lease <script>',type:'contract',url:'https://files.example.test/lease'}]}:{ok:true,tickets:[]}}}
  };ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
  const opts={contract:{id:'current'},user:{uid:'tenant',getIdToken:async()=> 'synthetic'},lang:'en'};
  return {nodes,calls,storage,mount(lang='en'){ctx.BOOM_TENANT_WORKSPACE_UI.mount({...opts,lang})},form(){return node('tenantTickets').forms.find(f=>f.dataset.ticketForm==='new')},async enter(description){const f=this.form();f.elements.description.value=description;f.oninput()},async submit(){this.form().onsubmit({preventDefault(){}});await flush()},setPost(fn){postReply=fn},setReadError(v){readError=v},get html(){return node('tenantTickets').innerHTML}};
}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
await test('personal inbox escapes content and preserves language on repaint',async()=>{
  const f=fixture();f.mount();await flush();let h=f.nodes.get('tenantNotices').innerHTML;
  assert.match(h,/Update &lt;script&gt;/);assert.match(h,/Text &lt;img&gt;/);assert.match(h,/across your homes/);
  f.mount('it');assert.match(f.nodes.get('tenantNotices').innerHTML,/I tuoi avvisi/);
});
await test('unavailable inbox shows retry rather than no notifications',async()=>{
  const f=fixture();f.setReadError(true);f.mount();await flush();const h=f.nodes.get('tenantNotices').innerHTML;
  assert.match(h,/could not be loaded/);assert.doesNotMatch(h,/No personal updates/);assert.match(h,/data-notices-refresh/);
});
await test('archive renders escaped names, searches and keeps query on language change',async()=>{
  const f=fixture();f.mount();await flush();assert.match(f.nodes.get('tenantDocResults').innerHTML,/&lt;script&gt;/);
  f.nodes.get('tenantDocSearch').oninput({target:{value:'missing'}});assert.match(f.nodes.get('tenantDocResults').innerHTML,/No matching/);
  f.mount('it');assert.match(f.nodes.get('tenantArchive').innerHTML,/value="missing"/);assert.match(f.nodes.get('tenantDocResults').innerHTML,/Nessun documento/);
});
await test('new draft survives payment repaint and language change',async()=>{
  const f=fixture();f.mount();await flush();await f.enter('A real description to preserve');f.mount('it');
  assert.equal(f.form().elements.description.value,'A real description to preserve');assert.match(f.html,/Invia la richiesta/);
});
await test('uncertain create retries exact request and restores across page reload',async()=>{
  const f=fixture();f.mount();await flush();await f.enter('Description with unknown save outcome');
  f.setPost(()=>{throw Error('connection lost')});await f.submit();assert.match(f.html,/draft is safe/);assert.match(f.html,/<fieldset disabled/);
  const original=f.calls.find(c=>c.body).body;
  const g=fixture(f.storage);g.mount();await flush();assert.match(g.html,/previous save still needs confirmation/);await g.submit();
  assert.deepEqual(g.calls.find(c=>c.body).body,original);assert.match(g.html,/Description with unknown save outcome/);assert.doesNotMatch(g.html,/previous save still needs confirmation/);
});
await test('successful create clears the draft and accurately says forwarding is inactive',async()=>{
  const f=fixture();f.mount();await flush();await f.enter('The tap is dripping after closing');await f.submit();
  assert.equal(f.form().elements.description.value,'');assert.match(f.html,/forwarding is not active/);assert.match(f.html,/Edit request/);assert.doesNotMatch(f.html,/<details class="tw-compose" open/);
});
await test('read failures remain distinct from empty lists and drafts remain usable',async()=>{
  const f=fixture();f.setReadError(true);f.mount();await flush();assert.match(f.html,/could not be loaded/);assert.match(f.nodes.get('tenantArchive').innerHTML,/could not be loaded/);assert.doesNotMatch(f.html,/No requests for this home/);
  await f.enter('A request despite unavailable history');await f.submit();assert.match(f.html,/could not be loaded/);assert.match(f.html,/Saved in BOOM/);
});
await test('validation error keeps text, enables correction and clears uncertain claim',async()=>{
  const f=fixture();f.mount();await flush();await f.enter('Draft remains editable after refusal');f.setPost(()=>({ok:false,status:400,json:async()=>({ok:false,error:'invalid_ticket'})}));await f.submit();
  assert.equal(f.form().elements.description.value,'Draft remains editable after refusal');assert.doesNotMatch(f.html,/<fieldset disabled/);assert.doesNotMatch(f.html,/previous save still needs confirmation/);
});
console.log(`${passed} workspace UI scenarios passed`);
