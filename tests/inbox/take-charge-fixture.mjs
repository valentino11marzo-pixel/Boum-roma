// Synthetic Firestore transport, real authentication and follow-up handlers.
// Exported for the local trial server; never connects to an account or service.
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
Object.assign(process.env,{FIREBASE_API_KEY:'fixture',FIREBASE_ADMIN_EMAIL:'admin@example.invalid',FIREBASE_ADMIN_PASS:'fixture'});
export const DB=new Map(), versions=new Map(), writes=[], requests=[];
let sequence=0, beforeCommit=null, afterRead=null;
export const setAfterRead=fn=>{afterRead=fn;};
export const setBeforeCommit=fn=>{beforeCommit=fn;};
export function put(path,value){DB.set(path,structuredClone(value));versions.set(path,new Date(Date.now()+ ++sequence).toISOString());}
const enc=v=>v==null?{nullValue:null}:v instanceof Date?{timestampValue:v.toISOString()}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(enc)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]))}};
const dec=v=>'nullValue'in v?null:'timestampValue'in v?v.timestampValue:'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?Number(v.integerValue):'arrayValue'in v?(v.arrayValue.values||[]).map(dec):Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,x])=>[k,dec(x)]));
const field=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
const doc=path=>({name:'projects/fixture/databases/(default)/documents/'+path,fields:Object.fromEntries(Object.entries(DB.get(path)).map(([k,v])=>[k,enc(v)])),updateTime:versions.get(path)});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(raw,opts={})=>{
 const url=new URL(String(raw)),body=opts.body?JSON.parse(opts.body):{};
 requests.push(url.hostname+url.pathname);
 if(url.hostname==='identitytoolkit.googleapis.com'){
  if(url.pathname.includes('signInWithPassword'))return json({idToken:'fixture-admin'});
  return ['admin','tenant'].includes(body.idToken)?json({users:[{localId:body.idToken}]}):json({error:'bad token'},401);
 }
 if(url.hostname!=='firestore.googleapis.com')throw Error('Forbidden external IO: '+url.hostname);
 if(url.pathname.endsWith(':commit')){
  const operations=body.writes||[];
  if(beforeCommit){const fn=beforeCommit;beforeCommit=null;await fn(operations);}
  for(const op of operations){const p=op.update.name.split('/documents/')[1],c=op.currentDocument;
   if(c.exists===false&&DB.has(p)||c.exists===true&&!DB.has(p)||c.updateTime&&versions.get(p)!==c.updateTime)return json({error:{status:'FAILED_PRECONDITION'}},400);
  }
  for(const op of operations){const p=op.update.name.split('/documents/')[1],fields=Object.fromEntries(Object.entries(op.update.fields||{}).map(([k,v])=>[k,dec(v)]));put(p,{...(op.updateMask?DB.get(p):{}),...fields});writes.push({path:p,fields});}
  return json({writeResults:operations.map(op=>({updateTime:versions.get(op.update.name.split('/documents/')[1])}))});
 }
 if(url.pathname.endsWith(':runQuery')){
  const q=body.structuredQuery,coll=q.from[0].collectionId;
  function matches(row,f){if(!f)return true;if(f.compositeFilter)return f.compositeFilter.filters.every(x=>matches(row,x));const x=f.fieldFilter,a=field(row,x.field.fieldPath),b=dec(x.value);if(x.op==='EQUAL')return a===b;if(x.op==='IN')return b.includes(a);if(x.op==='GREATER_THAN')return a>b;throw Error('Unknown filter '+x.op);}
  let rows=[...DB].filter(([p,r])=>p.startsWith(coll+'/')&&p.split('/').length===2&&matches(r,q.where));
  for(const o of [...q.orderBy||[]].reverse())rows.sort((a,b)=>String(o.field.fieldPath==='__name__'?a[0]:field(a[1],o.field.fieldPath)).localeCompare(String(o.field.fieldPath==='__name__'?b[0]:field(b[1],o.field.fieldPath)))*(o.direction==='DESCENDING'?-1:1));
  if(q.startAt)rows=rows.filter(([p])=>p>q.startAt.values[0].referenceValue.split('/documents/')[1]);
  return json(rows.slice(0,q.limit||1000).map(([p])=>({document:doc(p)})));
 }
 const path=decodeURIComponent(url.pathname.split('/documents/')[1]||'');
 if(opts.method&&opts.method!=='GET')throw Error('Unexpected write '+opts.method+' '+path);
 const response=DB.has(path)?json(doc(path)):json({error:{status:'NOT_FOUND'}},404);
 if(afterRead) await afterRead(path);
 return response;
};
const {default:handler}=await import('../../api/segretaria/follow-up.js');
export const CID='conv_lead_leadA';
export function reset(){
 DB.clear();versions.clear();writes.length=0;requests.length=0;beforeCommit=null;afterRead=null;
 put('users/admin',{role:'admin'});put('users/tenant',{role:'tenant'});
 put('settings/segretaria',{enabled:true,prepareCases:false,automaticReplies:false});
 put('conversations/'+CID,{contactType:'lead',contactId:'leadA',leadId:'leadA',contactName:'Cliente dimostrativo',contactEmail:'client@example.invalid',channel:'email',status:'open',needsReply:true,unread:0});
 put('leads/leadA',{name:'Cliente dimostrativo',email:'client@example.invalid',propertyId:'pA'});
 put('properties/pA',{name:'Casa dimostrativa'});put('contracts/cA',{linkedLeadId:'leadA',propertyId:'pA',status:'active'});
 put('messages/m1',{conversationId:CID,direction:'in',channel:'email',body:'Potete verificare il documento per la casa?',at:new Date(Date.now()-60000).toISOString()});
}
export async function call({method='POST',body={},query={},token='admin'}={}){
 let code=200,data;
 await handler({method,body,query,headers:{authorization:'Bearer '+token}},{setHeader(){},status(n){code=n;return this;},json(value){data=value;return this;}});
 return {code,...data};
}
export const tasks=()=>[...DB].filter(([p])=>p.startsWith('operatorTasks/')).map(([p,v])=>({id:p.split('/')[1],...structuredClone(v)}));
export const confirm=(task,extra={})=>({op:'confirm',id:task.id,lastMessageId:task.followUp.lastMessageId,practiceRef:'contracts/cA',nextAction:'Verificare il documento',waitingOn:'valentino',waitingLabel:'Valentino',checkAt:new Date(Date.now()+86400000).toISOString(),...extra});
export function addInbound(id='m2',at=Date.now()-1000){put('messages/'+id,{conversationId:CID,direction:'in',channel:'email',body:'Nuova richiesta: il documento è cambiato.',at:new Date(at).toISOString()});put('conversations/'+CID,{...DB.get('conversations/'+CID),lastMessageText:'Nuova richiesta',lastMessageAt:new Date(at).toISOString()});}
reset();
