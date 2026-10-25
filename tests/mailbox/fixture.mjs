// Real auth, handler, signing and MIME parser; fake only service transports.
import { register } from 'node:module';
const transport = `export class ImapFlow {
 constructor(options){this.io=globalThis.__mailboxIO;this.io.clients.push(this);this.io.options.push(options);}
 on(){return this;}
 async connect(){return this.io.step('connect');}
 async list(){await this.io.step('list');return this.io.folders;}
 async getMailboxLock(folder,options){this.io.locks.push({folder,options});await this.io.step('lock');this.mailbox={uidValidity:this.io.validity,readOnly:options?.readOnly===true};return{release:()=>{this.io.released++;}};}
 async search(query,options){this.io.searches.push({query,options});await this.io.step('search');return this.io.rows.filter(r=>r.subject.toLowerCase().includes(query.text.toLowerCase())&&(!query.uid||r.uid<=Number(query.uid.split(':')[1]))).map(r=>r.uid);}
 row(row){return{uid:row.uid,size:row.size,envelope:{subject:row.subject,messageId:'<mail-'+row.uid+'@fixture.invalid>',from:[{name:'Synthetic Sender',address:'sender@example.invalid'}],to:[{name:'Operator',address:'operator@example.invalid'}],date:new Date('2026-10-15T10:00:00Z'),...row.envelope},bodyStructure:row.structure};}
 async fetchAll(range,query,options){this.io.fetches.push({range,query,options});await this.io.step('metadata');return this.io.rows.filter(r=>range.split(',').map(Number).includes(r.uid)&&r.uid!==this.io.deleted).map(r=>this.row(r));}
 async fetchOne(range,query,options){this.io.fetches.push({range,query,options});const row=this.io.rows.find(r=>r.uid===Number(range)&&r.uid!==this.io.deleted);if(!row)return false;if(!query.bodyParts){await this.io.step('metadata');return this.row(row);}await this.io.step('body');const requested=query.bodyParts[0];const text=row.parts[requested.key];if(text===undefined)return{uid:row.uid,bodyParts:new Map()};return{uid:row.uid,bodyParts:new Map([[requested.key.toLowerCase(),Buffer.from(text).subarray(requested.start||0,(requested.start||0)+(requested.maxLength||Infinity))]])};}
 close(){this.io.closed++;}
}`;
const transportURL='data:text/javascript,'+encodeURIComponent(transport);
const changes={
 admin:["profile?.role !== 'admin'","false"],
 signature:["actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)","false"],
 actor:["data.actor !== actor","false"],
 validity:["proof && proof.validity !== validity","false"],
 readonly:["{ readOnly: true }","{ readOnly: false }"],
 attachments:["!node || attached(node) || node.type === 'message/rfc822'","!node || node.type === 'message/rfc822'"],
 body_bound:["maxLength: BODY_BYTES","maxLength: BODY_BYTES * 2"],
 part_case:["body?.bodyParts?.get(key.toLowerCase())","body?.bodyParts?.get(key)"],
 import_contact:["emailKey(conv.contactEmail) !== mail.candidate","false"],
 import_complete:["text.truncated || text.bodyUnavailable || !text.text?.trim()","false"],
 import_reply:["replyTo[0] || from[0]","from[0]"],
 import_manual:["manualOnly && snapshot.data.segretaria === true","false","/api/segretaria/_mail-import.js"],
 import_atomic:["await fsCommit([...guards, { docPath: 'messages/' + storedId","await fsCommit([{ docPath: 'messages/' + storedId","/api/segretaria/_mail-import.js"],
 manual_context:["SEG.messageText(row).trim()","typeof row.body === 'string' ? row.body.trim() : ''","/api/segretaria/_context.js"],
 manual_intake:["text:SEG.messageText(message.data)","text:message.data.body","/api/segretaria/_follow-up.js"],
 admission_confirm:["emailKey(admission.confirmedEmail) !== mail.candidate","false"],
 admission_atomic:["precondition: { exists: false }","precondition: {}","/api/mailbox/_admission.js"],
 admission_scan:["const matches = await matchingEmailConversations(email, run);","const matches = [];","/api/mailbox/_admission.js"],
 admission_dossier:["new Set(personalHits.filter(h => h.e === sharedEmail).map(h => h.p).filter(Boolean)).size > 1","false","/api/segretaria/_persona.js"],
 admission_takecharge:["dossier.identityAmbiguous || dossier.identityIncomplete","false","/api/segretaria/_follow-up.js"],
};
const change=process.env.BOOM_MAILBOX_MUTATION?changes[process.env.BOOM_MAILBOX_MUTATION]:null;
if(process.env.BOOM_MAILBOX_MUTATION&&!change)throw Error('Unknown mutation');
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='imapflow')return{url:${JSON.stringify(transportURL)},shortCircuit:true};return next(s,c);}export async function load(url,c,next){const out=await next(url,c);const change=${JSON.stringify(change)};if(change&&url.endsWith(change[2]||'/api/mailbox/query.js')){const source=String(out.source);if(!source.includes(change[0]))throw Error('Mutation boundary missing');return{...out,source:source.replace(change[0],change[1])};}return out;}`),import.meta.url);
Object.assign(process.env,{FIREBASE_API_KEY:'fixture-key',FIREBASE_ADMIN_EMAIL:'admin@example.invalid',FIREBASE_ADMIN_PASS:'fixture-password',GMAIL_USER:'operator@example.invalid',GMAIL_APP_PASS:'synthetic-app-password'});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const enc=v=>v==null?{nullValue:null}:v instanceof Date?{timestampValue:v.toISOString()}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(enc)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]))}};
const dec=v=>'nullValue'in v?null:'timestampValue'in v?v.timestampValue:'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?Number(v.integerValue):'arrayValue'in v?(v.arrayValue.values||[]).map(dec):Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,x])=>[k,dec(x)]));
const doc=(io,path)=>({name:'projects/fixture/databases/(default)/documents/'+path,fields:Object.fromEntries(Object.entries(io.db.get(path)).map(([k,v])=>[k,enc(v)])),updateTime:io.versions.get(path)});
globalThis.fetch=async(url,options={})=>{
 const io=globalThis.__mailboxIO,u=new URL(String(url));io.http.push({host:u.hostname,path:u.pathname,method:options.method||'GET'});
 if(u.hostname==='identitytoolkit.googleapis.com'){
  const body=JSON.parse(options.body||'{}');
  if(u.pathname.includes('signInWithPassword'))return json({idToken:'fixture-admin'});
  await io.step('auth');return body.idToken==='valid'?json({users:[{localId:io.uid}]}):json({},401);
 }
 if(u.hostname==='firestore.googleapis.com'&&(!options.method||options.method==='GET')&&u.pathname.endsWith('/users/'+io.uid)){
  await io.step('profile');if(io.profileError)return json({error:'private source detail'},503);
  return json({name:u.pathname,fields:{role:{stringValue:io.role}}});
 }
 if(u.hostname==='firestore.googleapis.com'){
  const path=decodeURIComponent(u.pathname.split('/documents/')[1]||''),body=JSON.parse(options.body||'{}');
  if(u.pathname.endsWith(':runQuery')){
   await io.step('query');
   const q=body.structuredQuery,filter=q.where?.fieldFilter;
   const field=(r,path)=>path.split('.').reduce((v,k)=>v?.[k],r);
   const after=q.startAt?.values?.[0]?.referenceValue?.split('/documents/')[1];
   const rows=[...io.db].filter(([p,r])=>p.startsWith(q.from[0].collectionId+'/')&&p.split('/').length===2&&(!after||p>after)
    &&(!filter||filter.op==='EQUAL'&&field(r,filter.field.fieldPath)===dec(filter.value)||filter.op==='IN'&&dec(filter.value).includes(field(r,filter.field.fieldPath))));
   if(q.orderBy)rows.sort((a,b)=>{for(const order of q.orderBy){const value=entry=>{const v=order.field.fieldPath==='__name__'?entry[0]:field(entry[1],order.field.fieldPath);return v instanceof Date?v.toISOString():String(v||'');};const n=value(a).localeCompare(value(b));if(n)return order.direction==='DESCENDING'?-n:n;}return a[0].localeCompare(b[0]);});
   return json(rows.slice(0,q.limit).map(([p])=>({document:doc(io,p)})));
  }
  if(u.pathname.endsWith(':commit')){
   await io.step('commit');
   const ops=body.writes||[];
   if(io.beforeCommit){const hook=io.beforeCommit;io.beforeCommit=null;await hook(ops);}
   for(const op of ops){
    const p=(op.update?.name||op.delete).split('/documents/')[1],c=op.currentDocument;
    if(c?.exists===false&&io.db.has(p)||c?.exists===true&&!io.db.has(p)||c?.updateTime&&io.versions.get(p)!==c.updateTime)
     return json({error:{status:'FAILED_PRECONDITION'}},409);
   }
   for(const op of ops){
    const p=(op.update?.name||op.delete).split('/documents/')[1];if(!op.update)continue;
    const fields=Object.fromEntries(Object.entries(op.update.fields||{}).map(([k,v])=>[k,dec(v)]));
    io.put(p,{...(op.updateMask?io.db.get(p):{}),...fields});io.writes.push({path:p,fields});
   }
   if(io.loseAck){io.loseAck=false;throw Error('lost acknowledgement');}
   return json({writeResults:ops.map(op=>({updateTime:io.versions.get((op.update?.name||op.delete).split('/documents/')[1])}))});
  }
  if(!options.method||options.method==='GET'){
   await io.step('document');
   const result=io.db.has(path)?json(doc(io,path)):json({},404);
   if(io.afterRead)await io.afterRead(path);return result;
  }
 }
 io.forbidden.push({host:u.hostname,method:options.method||'GET'});throw Error('Forbidden service boundary');
};
const {default:handler}=await import('../../api/mailbox/query.js');
export function reset(){
 Object.assign(process.env,{GMAIL_USER:'operator@example.invalid',GMAIL_APP_PASS:'synthetic-app-password',PFS_IMAP_USER:'radar@example.invalid',PFS_IMAP_PASS:'synthetic-radar',PFS_IMAP_HOST:'imap.radar.invalid'});
 const io=globalThis.__mailboxIO={uid:'admin',role:'admin',clients:[],options:[],locks:[],searches:[],fetches:[],http:[],forbidden:[],released:0,closed:0,validity:123n,folders:[{path:'INBOX',specialUse:'\\Inbox'},{path:'[Gmail]/All Mail',specialUse:'\\All'}],rows:[],db:new Map(),versions:new Map(),writes:[]};
 let revision=0;io.put=(path,row)=>{io.db.set(path,structuredClone(row));io.versions.set(path,new Date(1700000000000+ ++revision).toISOString());};
 io.step=async name=>{if(io.hang===name)return new Promise(()=>{});if(io.error===name)throw Error('private mailbox data');if(io.hook)await io.hook(name);};
 for(let i=1;i<=24;i++)io.rows.push({uid:i,subject:'needle fixture '+i,size:200,structure:{type:'text/plain',encoding:'quoted-printable',parameters:{charset:'utf-8'},size:17},parts:{TEXT:'Caff=C3=A8 di prova'}});
 return io;
}
export async function call(body={action:'search',query:'needle'},{token='valid',method='POST'}={}){
 let code=200,data,headers={};await handler({method,body,headers:{authorization:'Bearer '+token}},{setHeader(k,v){headers[k]=v;},status(n){code=n;return this;},json(d){data=d;return this;}});return{code,...data,headers};
}
