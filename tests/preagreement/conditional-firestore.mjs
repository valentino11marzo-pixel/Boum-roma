// Transport fixture only: Firestore versions, all-or-nothing commit and CAS delete.
// Existing suites keep their data, assertions and real production handlers.
export function conditionalFirestore(base,{DB,fields,unfields,onWrite=()=>{},fail=()=>false,beforeCommit=()=>{}}){
 let sequence=0;const seen=new Map();
 const version=path=>{if(!DB.has(path)){seen.delete(path);return null;}const fingerprint=JSON.stringify(DB.get(path)),old=seen.get(path);if(old?.fingerprint===fingerprint)return old.version;const v=new Date(1700000000000+ ++sequence).toISOString();seen.set(path,{fingerprint,version:v});return v;};
 const touch=path=>{seen.delete(path);return version(path);};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 return async(url,opts={})=>{
  const u=new URL(String(url)),method=opts.method||'GET',path=decodeURIComponent(u.pathname.split('/documents/')[1]||'');
  if(!u.hostname.includes('firestore.googleapis.com'))return base(url,opts);
  if(u.pathname.endsWith(':commit')){
   const writes=JSON.parse(opts.body).writes;await beforeCommit(writes);
   if(fail(writes))return json({error:{status:'UNAVAILABLE'}},503);
   for(const w of writes){const p=(w.update?.name||w.delete).split('/documents/')[1],c=w.currentDocument;
    if(!c)throw Error('Missing precondition');
    if(c.exists===false&&DB.has(p)||c.exists===true&&!DB.has(p)||c.updateTime&&c.updateTime!==version(p))return json({error:{status:'FAILED_PRECONDITION'}},400);
   }
   const results=[];
   for(const w of writes){const p=(w.update?.name||w.delete).split('/documents/')[1];if(w.delete){DB.delete(p);results.push({updateTime:new Date(1700000000000+ ++sequence).toISOString()});continue;}
    if(!w.updateMask)throw Error('Replacement not expected');
    const data=unfields(w.update.fields||{});DB.set(p,{...DB.get(p),...data});onWrite(p,data,w);results.push({updateTime:touch(p)});
   }
   return json({writeResults:results});
  }
  if(method==='DELETE'&&u.searchParams.has('currentDocument.updateTime')){
   if(u.searchParams.get('currentDocument.updateTime')!==version(path))return json({error:{status:'FAILED_PRECONDITION'}},400);
  }
  const response=await base(url,opts);
  if(method==='GET'&&response.ok&&path){const data=await response.clone().json();if(data.fields)return json({...data,updateTime:version(path)});}
  if(method!=='GET'&&response.ok&&path)touch(path);
  return response;
 };
}
