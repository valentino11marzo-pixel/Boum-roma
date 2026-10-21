// Real auth/Firestore helpers and handler; only network endpoints are simulated.
Object.assign(process.env,{FIREBASE_API_KEY:'rent-test',FIREBASE_ADMIN_EMAIL:'admin@example.test',FIREBASE_ADMIN_PASS:'test-only',FIREBASE_PROJECT_ID:'rent-test'});
export const store=new Map(),versions=new Map();
export const faults={commit:false,lost:false,beforeCommit:null};
let revision=0;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const {toFsFields,fsDocToJs}=await import('../../api/homie/_lib.js');
export const documentFor=key=>({name:'projects/rent-test/databases/(default)/documents/'+key,fields:toFsFields(store.get(key)),updateTime:versions.get(key)});
export function put(key,value){store.set(key,structuredClone(value));versions.set(key,new Date(Date.UTC(2026,9,21)+(++revision)).toISOString());}
export function seed(){store.clear();versions.clear();Object.assign(faults,{commit:false,lost:false,beforeCommit:null});
  put('users/admin',{role:'admin'});put('users/tenant',{role:'tenant'});
  for(let i=1;i<=2;i++) {put('users/t'+i,{role:'tenant',name:'Persona di prova '+i});put('properties/p'+i,{name:'Casa di prova '+i});
    put('contracts/c'+i,{status:'active',tenantId:'t'+i,propertyId:'p'+i,rent:950.5,startDate:'2026-01-01',endDate:'2026-12-31',canone:{monthly:950.5,total:11406,installments:12}});}
}
export const network=async(input,opts={})=>{
  const u=new URL(String(input));
  if(u.hostname==='identitytoolkit.googleapis.com') {
    if(u.pathname.includes('signInWithPassword'))return json({idToken:'server-test'});
    const token=JSON.parse(opts.body).idToken;return json(['admin','tenant'].includes(token)?{users:[{localId:token}]}:{},['admin','tenant'].includes(token)?200:401);
  }
  if(u.hostname!=='firestore.googleapis.com')throw new Error('Unexpected external network: '+u.hostname);
  const key=decodeURIComponent(u.pathname.split('/documents/')[1]||'');
  if(u.pathname.endsWith(':runQuery')){
    const q=JSON.parse(opts.body).structuredQuery,collection=q.from[0].collectionId,f=q.where?.fieldFilter;
    const value=f?fsDocToJs({name:'x/x',fields:{v:f.value}}).v:null;
    return json([...store.keys()].filter(k=>k.startsWith(collection+'/')&&(!f||store.get(k)[f.field.fieldPath]===value)).slice(0,q.limit).map(k=>({document:documentFor(k)})));
  }
  if(u.pathname.endsWith(':commit')) {
    const writes=JSON.parse(opts.body).writes;
    const before=faults.beforeCommit;faults.beforeCommit=null;if(before)await before();
    if(faults.commit)return json({error:{status:'UNAVAILABLE'}},503);
    for(const w of writes){const k=(w.update?.name||w.delete).split('/documents/')[1],p=w.currentDocument;
      if(!p || p.exists===false&&store.has(k) || p.updateTime&&p.updateTime!==versions.get(k))return json({error:{status:'FAILED_PRECONDITION'}},409);
    }
    for(const w of writes){if(w.delete)continue;const k=w.update.name.split('/documents/')[1];
      if(!w.updateMask)throw new Error('No update mask');
      if(w.updateMask.fieldPaths.length)put(k,{...store.get(k),...fsDocToJs(w.update)});
    }
    if(faults.lost){faults.lost=false;throw new Error('Response lost after commit');}
    return json({writeResults:[]});
  }
  if(opts.method && opts.method!=='GET')throw new Error('Unexpected non-atomic mutation');
  return store.has(key)?json(documentFor(key)):json({},404);
};
globalThis.fetch=network;
export const {default:handler}=await import('../../api/payments/admin.js');
export async function call(body,actor='admin',method='POST'){
  const res={code:0,body:null,headers:{},status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(k,v){this.headers[k]=v;}};
  await handler({method,headers:{authorization:'Bearer '+actor},body},res);return res;
}
seed();
