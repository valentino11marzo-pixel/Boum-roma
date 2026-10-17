// Network only: versioned Firestore + provider transports, never model/business mocks.
import assert from 'node:assert/strict';
import { toFsFields, fsValToJs } from '../../api/homie/_lib.js';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const fields=v=>Object.fromEntries(Object.entries(v||{}).map(([k,x])=>[k,fsValToJs(x)]));
export function budgetIO() {
 const db=new Map(),versions=new Map(),io={db,count:[],paid:[],local:[],writes:[],settingsFail:false,countFail:false,reserveFail:false,settleFail:false,cloudFail:false,unknownUsage:false,unknownModel:false,hold:null,hook:null};
 let seq=0;
 const version=p=>{if(!db.has(p))return null;const text=JSON.stringify(db.get(p)),old=versions.get(p);if(old?.text===text)return old.version;const v=new Date(1700000000000+ ++seq).toISOString();versions.set(p,{text,version:v});return v;};
 const doc=p=>({name:'projects/p/databases/(default)/documents/'+p,fields:toFsFields(db.get(p)),updateTime:version(p)});
 const setDeep=(o,path,n)=>{const parts=path.split('.');let t=o;for(const p of parts.slice(0,-1))t=t[p]??={};const k=parts.at(-1);t[k]=(t[k]||0)+n;};
 io.fetch=async(raw,opts={})=>{
  const url=new URL(String(raw)),body=opts.body?JSON.parse(opts.body):{},method=opts.method||'GET';
  if(url.hostname==='identitytoolkit.googleapis.com')return url.pathname.includes('accounts:lookup')?json({users:[{localId:'admin'}]}):json({idToken:'synthetic-admin'});
  if(url.hostname==='api.anthropic.com') {
   assert(opts.signal,'Provider timeout required');
   if(url.pathname.endsWith('/count_tokens')){io.count.push(body);if(io.countWait)await io.countWait();if(io.countFail)return json({error:'count unavailable'},503);return json({input_tokens:100});}
   assert.equal(url.pathname,'/v1/messages');io.paid.push(body);
   if(io.hold)await io.hold;
   if(io.cloudFail)throw Object.assign(Error('synthetic timeout'),{name:'TimeoutError'});
   return json({model:io.unknownModel?'unknown-model':body.model,content:[{type:'text',text:'synthetic'}],usage:io.unknownUsage?null:{input_tokens:100,output_tokens:20}});
  }
  if(url.hostname==='local.test'){io.local.push(body);if(io.localFail)throw Error('synthetic local failure');return json({choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:100,completion_tokens:20}});}
  assert.equal(url.hostname,'firestore.googleapis.com','No other network');
  const path=decodeURIComponent(url.pathname.split('/documents/')[1]||'');
  if(url.pathname.endsWith(':commit')) {
   const ws=body.writes;
   if(io.hook){const h=io.hook;io.hook=null;await h(ws);}
   const budget=ws.find(w=>w.update?.fields?.budgetV1);
   if(budget && (io.reserveFail&&ws.length===2 || io.settleFail&&ws.length===1))return json({error:{status:'UNAVAILABLE'}},503);
   for(const w of ws){const p=(w.update?.name||w.delete).split('/documents/')[1],c=w.currentDocument;
    if(c && (c.exists===false&&db.has(p)||c.exists===true&&!db.has(p)||c.updateTime&&c.updateTime!==version(p)))return json({error:{status:'FAILED_PRECONDITION'}},400);
   }
   const results=[];
   for(const w of ws){const p=(w.update?.name||w.delete).split('/documents/')[1];
    if(w.delete){db.delete(p);results.push({});continue;}
    const data=fields(w.update.fields),cur={...db.get(p),...data};
    for(const t of w.updateTransforms||[])setDeep(cur,t.fieldPath,Number(t.increment.integerValue??t.increment.doubleValue));
    db.set(p,cur);versions.delete(p);io.writes.push({path:p,data});results.push({updateTime:version(p)});
   }
   return json({writeResults:results});
  }
  if(url.pathname.endsWith(':runQuery')) {if(io.usageFail)return json({error:{status:'UNAVAILABLE'}},503);const q=body.structuredQuery;return json([...db.keys()].filter(p=>p.startsWith(q.from[0].collectionId+'/')).map(p=>({document:doc(p)})));}
  if(path.startsWith('aiUsage/')&&io.usageFail)return json({error:{status:'UNAVAILABLE'}},503);
  if(path==='settings/ai'&&io.settingsFail)return json({error:{status:'UNAVAILABLE'}},503);
  assert.equal(method,'GET','No unconditional mutation');
  return db.has(path)?json(doc(path)):json({error:{status:'NOT_FOUND'}},404);
 };
 return io;
}
