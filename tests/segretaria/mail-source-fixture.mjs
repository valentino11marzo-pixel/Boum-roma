// Real scanner/auth/tracking + MIME parsing. Only Firestore/IMAP transports fake.
import { register } from 'node:module';
const transport = `export class ImapFlow {
 constructor(){ globalThis.__mail.connections++; }
 async connect(){if(globalThis.__mail.failConnect)throw Error('private transport detail');}
 async getMailboxLock(){return {release(){}};}
 async search({from,since}){const s=globalThis.__mail;s.searches.push({from,since});s.advance(s.searchCost);if(s.failSearch)throw Error('private search detail');if(s.afterSearch){const fn=s.afterSearch;s.afterSearch=null;await fn();}return s.messages.filter(m=>m.from===from).map(m=>m.uid);}
 async fetchOne(uid){const s=globalThis.__mail;s.fetches++;s.advance(s.fetchCost);if(s.failFetch)throw Error('private MIME detail');const m=s.messages.find(m=>m.uid===Number(uid));return m?{source:Buffer.from(m.raw)}:null;}
 async logout(){}
}`;
const transportURL='data:text/javascript,'+encodeURIComponent(transport);
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='imapflow')return {url:${JSON.stringify(transportURL)},shortCircuit:true};return next(s,c);}`),import.meta.url);
if(process.env.BOOM_MAIL_MUTATION){
 const changes={
  sync_ai_gate:["if (syncOnly) { newIds.push(mid); continue; }","if (false) { newIds.push(mid); continue; }"],
  admin_scope:["requireRole(req, res, ['admin'])","requireRole(req, res, null)"],
  budget_complete:["stats.deferred += uids.length - index; stats.incomplete = true; unvisited = 0; break;","stats.deferred += uids.length - index; unvisited = 0; break;"],
  scoped_identity:["if (emailBinding(snapshot.data) !== emailBinding(conv))", "if (false)"],
  scoped_atomic:["await fsCommit([...guards, { docPath: 'messages/' + storedId", "await fsCommit([{ docPath: 'messages/' + storedId"],
  normalized_identity:["identityRows.filter(c => emailKey(c.contactEmail) === email)", "identityRows.filter(c => c.contactEmail === target.contactEmail)"]
 };
 const change=changes[process.env.BOOM_MAIL_MUTATION];if(!change)throw Error('Unknown mutation');
 register('data:text/javascript,'+encodeURIComponent(`export async function load(url,c,next){const out=await next(url,c);if(url.endsWith('/api/segretaria/scan-replies.js')){const source=String(out.source);const [before,after]=${JSON.stringify(change)};if(!source.includes(before))throw Error('Mutation boundary missing');return {...out,source:source.replace(before,after)};}return out;}`),import.meta.url);
}
export const F=await import('../inbox/take-charge-fixture.mjs');
export const {DB,versions,writes,requests,put}=F;
Object.assign(process.env,{PFS_IMAP_USER:'operator@example.invalid',PFS_IMAP_PASS:'fixture',CRON_SECRET:'cron-fixture',HOMIE_SECRET:'bridge-fixture'});
const networkFetch=globalThis.fetch; export const external=[];
const enc=v=>v==null?{nullValue:null}:v instanceof Date?{timestampValue:v.toISOString()}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(enc)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]))}};
const dec=v=>'nullValue'in v?null:'timestampValue'in v?v.timestampValue:'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?Number(v.integerValue):'arrayValue'in v?(v.arrayValue.values||[]).map(dec):Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,x])=>[k,dec(x)]));
const doc=p=>({name:'projects/fixture/databases/(default)/documents/'+p,fields:Object.fromEntries(Object.entries(DB.get(p)).map(([k,v])=>[k,enc(v)])),updateTime:versions.get(p)});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(raw,opts={})=>{
 const u=new URL(String(raw)),b=opts.body?JSON.parse(opts.body):{};
 if(!['identitytoolkit.googleapis.com','firestore.googleapis.com'].includes(u.hostname))external.push(u.hostname);
 if(u.hostname==='firestore.googleapis.com'){
  if(u.pathname.endsWith(':batchGet'))return json((b.documents||[]).map(name=>{const p=name.split('/documents/')[1];return DB.has(p)?{found:doc(p)}:{missing:name};}));
  const p=decodeURIComponent(u.pathname.split('/documents/')[1]||'');
  if(opts.method==='PATCH'||(opts.method==='POST'&&!u.pathname.includes(':'))){
   const path=opts.method==='POST'?p+'/'+u.searchParams.get('documentId'):p;
   if((opts.method==='POST'||u.searchParams.get('currentDocument.exists')==='false')&&DB.has(path))return json({error:{status:'ALREADY_EXISTS'}},409);
   const fields=Object.fromEntries(Object.entries(b.fields||{}).map(([k,v])=>[k,dec(v)]));
   put(path,{...(opts.method==='PATCH'?DB.get(path):{}),...fields});writes.push({path,fields});return json(doc(path));
  }
 }
 return networkFetch(raw,opts);
};
const {default:handler}=await import('../../api/segretaria/scan-replies.js');
export const {captureFollowUp}=await import('../../api/segretaria/_follow-up.js');

export const CID=F.CID;
export function resetTransport(){external.length=0;globalThis.__mails=[];globalThis.__mail={connections:0,searches:[],messages:[],fetches:0,searchCost:0,fetchCost:0,advance:()=>{}};process.env.PFS_IMAP_PASS='fixture';delete process.env.GMAIL_APP_PASS;}
export function reset(){F.reset();resetTransport();}
export function mail(uid,from='client@example.invalid'){
 const at=new Date(Date.now()-30000+uid*1000).toUTCString();
 __mail.messages.push({uid,from,raw:`From: Client <${from}>\r\nTo: Operator <operator@example.invalid>\r\nDate: ${at}\r\nMessage-ID: <mail-${uid}@fixture.invalid>\r\nSubject: Fixture\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nRicevuta fixture ${uid}.`});
}
export async function call({method='POST',body={mode:'sync_only',conversationId:CID},query={},token='admin',headers={}}={}){
 let code=200,data;await handler({method,body,query,headers:{authorization:'Bearer '+token,...headers}},{setHeader(){},status(n){code=n;return this;},json(d){data=d;return this;}});return {code,...data};
}
