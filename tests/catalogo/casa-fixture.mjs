import {readFileSync} from 'node:fs';
process.env.FIREBASE_API_KEY='catalog-casa-test';
process.env.FIREBASE_ADMIN_EMAIL='admin@example.invalid';
process.env.FIREBASE_ADMIN_PASS='test-only';
const encode = v => v == null ? {nullValue:null} : typeof v === 'boolean' ? {booleanValue:v} : typeof v === 'number' ? {doubleValue:v} : Array.isArray(v) ? {arrayValue:{values:v.map(encode)}} : typeof v === 'object' ? {mapValue:{fields:fields(v)}} : {stringValue:String(v)};
const fields = row => Object.fromEntries(Object.entries(row).map(([k,v])=>[k,encode(v)]));
export const listing={id:'levico',name:'Casa Levico',address:'Via Esempio 14',zone:'Trieste',price:1450,propertyId:'property-1',status:'available',availableFrom:'2027-01-01',availabilityUpdatedAt:'2026-10-17T10:30:00Z'};
export const store=new Map([
  ['users/admin',{role:'admin'}],['users/owner',{role:'owner'}],['users/landlord',{role:'landlord'}],['users/tenant',{role:'tenant'}],
  ['listings/levico',listing],['listings/other',{...listing,id:'other',name:'Altra casa',propertyId:null}],
  ['settings/publisher',{enabled:false,portals:{idealista:{enabled:true},immobiliare:{enabled:true}},secret:'NEVER_RETURN'}]
]);
export const failures=new Set(), reads=[], writes=[];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
globalThis.fetch=async(url,options={})=>{
  const u=String(url), body=options.body ? JSON.parse(options.body) : {};
  if(u.includes('accounts:signInWithPassword')) return json({idToken:'admin-test',expiresIn:'3600'});
  if(u.includes('accounts:lookup')) return store.has('users/'+body.idToken) ? json({users:[{localId:body.idToken}]}) : json({},401);
  const path=u.match(/\/documents\/([^?]+)/)?.[1];
  if(!path)throw new Error('Unexpected network '+u);
  if(options.method && options.method!=='GET'){writes.push(path);throw new Error('Unexpected write');}
  reads.push(path);
  if(failures.has(path))return json({error:{message:'simulated unavailable'}},503);
  return store.has(path) ? json({name:'projects/test/databases/(default)/documents/'+path,fields:fields(store.get(path))}) : json({},404);
};
export const {publishHash}=await import('../../api/publisher/_state.js');
export const {default:handler}=await import('../../api/publisher/status.js');
store.set('portalPubs/immobiliare_levico',{portal:'immobiliare',listingId:'levico',wasLive:true,status:'live',hash:publishHash(listing),remoteUrl:'https://www.immobiliare.it/annunci/123456/',publishedAt:'2026-10-17T09:00:00Z',privateField:'NEVER_RETURN'});
store.set('portalPubs/idealista_levico',{portal:'idealista',listingId:'levico',wasLive:true,status:'live',hash:'older-version',remoteUrl:'https://www.idealista.it/immobile/123456/',publishedAt:'2026-10-16T09:00:00Z'});
export async function call({role='admin',id='levico',method='GET',use=handler}={}) {
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(value){this.body=value;return this}};
  await use({method,headers:role?{authorization:'Bearer '+role}:{},query:{id}},res);return res;
}
export async function mutatedHandler(from,to) {
  const url=new URL('../../api/publisher/status.js',import.meta.url);
  let code=readFileSync(url,'utf8');
  if(!code.includes(from))throw new Error('Mutation target absent');
  code=code.replace(from,to).replace(/from '([^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL(path,url).href));
  return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
}
