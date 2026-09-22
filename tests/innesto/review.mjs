// Synthetic regression checks for the real Innesto functions, with network
// denied and Storage's current MIME/size policy enforced at the upload seam.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildZip } from '../../api/_zip.js';
import { zipEntryBytes, zipEntries } from '../../api/_unzip.js';
const require = createRequire(import.meta.url);
const app = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const section = app.slice(app.indexOf('    const INNESTO_INLINE_MAX'), app.indexOf('    async function loadCompanySettings'));
const rules = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
const typePattern = new RegExp('^(?:' + /contentType\.matches\('([^']+)'\)/.exec(rules)[1] + ')$');
let pass = 0, fail = 0;
async function check(name, fn) { try { if (!await fn()) throw new Error('assertion failed'); pass++; console.log('PASS ' + name); } catch(e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }
const snap = rows => ({docs:rows.map(r=>({id:r.id,data:()=>r}))});
const sameEmail = 'synthetic@example.test';
const makeQuery = get => ({collection(){return{where(k,op,v){return{limit(n){return{get:()=>get(k,v,n)}}}}}}});
// The existing browser JSZip dependency is mocked only at its byte-encoding
// seam; produce real ZIPs and independently read them back with _unzip.
class ZipAdapter {
  files=[];
  file(name,bytes) { this.files.push({name,data:Buffer.from(bytes)}); return this; }
  async generateAsync() { return new Blob([buildZip(this.files)],{type:'application/zip'}); }
}
function mount(db = makeQuery(async()=>snap([])), getToken = async () => 'synthetic', zipLib = ZipAdapter) {
 const puts=[],toasts=[],writes=[],http=[];let renders=0;
 const storage={ref:path=>({put:async(blob,meta)=>{
  if(!typePattern.test(meta.contentType)||blob.size>=25*1024*1024)throw new Error('storage/unauthorized');
  puts.push({path,blob,meta});return{ref:{getDownloadURL:async()=>'/synthetic-archive'}};
 }})};
 const fn = new Function('window','S','db','storage','auth','toast','renderPage','goTo','esc','adeCompressImage','document','crypto','location','firebase','fetch','clearInterval',section + '\nreturn { lookup: innestoLookupPa, archive: innestoArchiveDoc, apply: innestoApply, convert: innestoConvertPa, card: innestoProposalCard, state: () => _innesto, reset: innestoReset, choose: typeof innestoChoosePa === "function" ? innestoChoosePa : null, edit: innestoEdit, refresh: typeof innestoRefreshPa === "function" ? innestoRefreshPa : null };');
 const runtime=fn({BOOM_DATAOPS:require('../../js/dataops-engine.js'),JSZip:zipLib},{profile:{id:'admin'},users:[],landlords:[],properties:[],leads:[]},db,storage,{currentUser:{getIdToken:getToken}},(...args)=>toasts.push(args),()=>{renders++;},()=>{},s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),async()=>null,{}, {},{origin:'https://synthetic.invalid'},{firestore:{FieldValue:{serverTimestamp:()=>0}}},async(...args)=>{http.push(args);throw new Error('network forbidden');},()=>{});
 return{...runtime,puts,toasts,writes,http,renders:()=>renders};
}
const p = ref=>({preagreement:{ref},tenant:{email:sameEmail}});
const old={id:'old',ref:'BOOM-OLD123',status:'paid',contractId:'old-contract',tenant:{email:sameEmail},property:{address:'Old Street'},createdAt:'2025-01-01'};
await check('a missing explicit BOOM reference never selects another deal by email',async()=>{
 const r=mount(makeQuery(async k=>snap(k==='ref'?[]:[old])));r.state().proposal=p('BOOM-NEW123');await r.lookup(r.state().proposal);return !r.state().pa.found&&!r.state().skipContract;
});
await check('email alone offers candidates and never skips the contract automatically',async()=>{
 const r=mount(makeQuery(async()=>snap([old])));r.state().proposal=p('');await r.lookup(r.state().proposal);return !r.state().pa.found&&!r.state().skipContract&&r.state().pa.candidates?.[0]?.id==='old';
});
await check('an older lookup cannot replace the result after reset and a new reading',async()=>{
 const resolve={};const r=mount(makeQuery((k,v)=>new Promise(done=>resolve[v]=done)));
 r.state().proposal=p('BOOM-AAA123');const a=r.lookup(r.state().proposal);r.reset();r.state().proposal=p('BOOM-BBB123');const b=r.lookup(r.state().proposal);
 resolve['BOOM-BBB123'](snap([{id:'B',ref:'BOOM-BBB123'}]));await b;resolve['BOOM-AAA123'](snap([{id:'A',ref:'BOOM-AAA123'}]));await a;return r.state().pa.found?.id==='B';
});
await check('changing reference while lookup runs prevents the obsolete association',async()=>{
 let resolve;const r=mount(makeQuery(()=>new Promise(done=>resolve=done)));r.state().proposal=p('BOOM-AAA123');const pending=r.lookup(r.state().proposal);r.state().proposal.preagreement.ref='BOOM-BBB123';resolve(snap([{id:'A',ref:'BOOM-AAA123'}]));await pending;return !r.state().pa.found&&!r.state().skipContract;
});
await check('editing a pending lookup exposes a refresh path and the corrected deal',async()=>{
 const resolve={};const r=mount(makeQuery((k,v)=>new Promise(done=>resolve[v]=done)));r.state().proposal=p('BOOM-AAA123');const a=r.lookup(r.state().proposal);
 r.edit('preagreement','ref','BOOM-BBB123');if(!r.refresh)return false;const b=r.refresh();
 resolve['BOOM-AAA123'](snap([{id:'A',ref:'BOOM-AAA123'}]));await a;resolve['BOOM-BBB123'](snap([{id:'B',ref:'BOOM-BBB123'}]));await b;
 return r.state().pa.found?.id==='B'&&!r.state().pa.loading;
});
await check('leaving unchanged identity fields preserves the DOM and following click',async()=>{
 const r=mount(makeQuery(async()=>snap([{id:'A',ref:'BOOM-AAA123'}])));r.state().proposal=p('BOOM-AAA123');await r.lookup(r.state().proposal);
 const before=r.renders();await r.refresh();return r.renders()===before;
});
await check('an ordinary contract email blur never renders or starts a proposal lookup',async()=>{
 let calls=0;const r=mount(makeQuery(async()=>{calls++;return snap([])}));r.state().proposal={tenant:{email:sameEmail}};await r.refresh();return r.renders()===0&&calls===0;
});
await check('an empty proposal identity is rendered once, not on every unchanged blur',async()=>{
 const r=mount();r.state().proposal={preagreement:{ref:''}};await r.refresh();const before=r.renders();await r.refresh();return r.renders()===before;
});
await check('retry immediately replaces the error with loading feedback',async()=>{
 let resolve;const r=mount(makeQuery(()=>new Promise(done=>resolve=done)));r.state().proposal=p('BOOM-AAA123');r.state().pa={key:'BOOM-AAA123',loading:false,found:null,error:'offline'};
 const card=r.card(r.state().proposal);const action=/onclick="([^"]+)"[^>]*>Riprova la ricerca/.exec(card)?.[1];if(!action)return false;
 new Function('_innesto','innestoLookupPa','innestoRefreshPa',action)(r.state(),r.lookup,r.refresh);
 const visible=r.card(r.state().proposal);const immediate=r.renders()>0&&/cerco la proposta/.test(visible)&&!/Riprova la ricerca/.test(visible);resolve(snap([]));await Promise.resolve();return immediate;
});
await check('pending lookup blocks create in the UI and direct apply',async()=>{
 const r=mount();r.state().proposal={preagreement:{ref:'BOOM-AAA123',feePct:10}};r.state().pa={key:'BOOM-AAA123',loading:true,found:null,error:''};
 const card=r.card(r.state().proposal);await r.apply();return /disabled[^>]*onclick="innestoApply\(\)"/.test(card)&&r.toasts.some(t=>/proposta|ricerca/i.test(t.join(' ')));
});
await check('obsolete convert button cannot call the financial API for another reading',async()=>{
 const r=mount();r.state().proposal=p('BOOM-BBB123');r.state().pa={key:'BOOM-AAA123',loading:false,found:{id:'A',ref:'BOOM-AAA123'}};await r.convert('A');return r.http.length===0;
});
await check('reset while authentication waits cancels the old convert before its POST',async()=>{
 let tokenReady;const r=mount(makeQuery(async()=>snap([{id:'A',ref:'BOOM-AAA123'}])),()=>new Promise(done=>tokenReady=done));
 r.state().proposal=p('BOOM-AAA123');await r.lookup(r.state().proposal);const pending=r.convert('A');r.reset();r.state().proposal=p('BOOM-BBB123');tokenReady('synthetic');await pending;
 return r.http.length===0&&r.state().proposal.preagreement.ref==='BOOM-BBB123';
});
await check('a user can confirm an email candidate after seeing the deal',async()=>{
 const r=mount(makeQuery(async()=>snap([old])));r.state().proposal=p('');await r.lookup(r.state().proposal);if(!r.choose)return false;r.choose('old');return r.state().pa.found?.id==='old'&&r.state().skipContract;
});
await check('a user can reject email candidates and keep an independent import',async()=>{
 const r=mount(makeQuery(async()=>snap([old])));r.state().proposal=p('');await r.lookup(r.state().proposal);if(!r.choose)return false;r.choose('');return !r.state().pa.found&&!r.state().skipContract&&!r.state().pa.candidates.length;
});
await check('missing ZIP library preserves the import before any primary record write',async()=>{
 const records=[];const db={collection:name=>({add:async data=>{records.push({name,data});return{id:'new-record'}}})};
 const r=mount(db,async()=>'synthetic',null);const proposal={lead:{name:'Synthetic',email:sameEmail,request:'Synthetic request'}};const file=new Blob(['synthetic email'],{type:'message/rfc822'});file.name='source.eml';
 r.state().proposal=proposal;r.state().readDocs=[{file,blob:file,mediaType:file.type}];await r.apply();
 return records.length===0&&r.state().proposal===proposal&&r.state().readDocs.length===1&&!r.state().busy&&r.toasts.some(t=>/Archivio ZIP/.test(t.join(' ')));
});
for (const [ext,type]of Object.entries({docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',odt:'application/vnd.oasis.opendocument.text',doc:'application/msword',eml:'message/rfc822',txt:'text/plain'})) {
 await check(ext+' original is archived under the unchanged Storage policy',async()=>{
  const r=mount();const office=['docx','xlsx','odt'].includes(ext);const bytes=office?buildZip([{name:'content.xml',data:'synthetic original'}]):Buffer.from('synthetic original €1200');
  const file=new Blob([bytes],{type});file.name=(ext==='eml'?'disponibilità città':'source')+'.'+ext;
  const records=[];await r.archive({file,blob:file,mediaType:type},{createDocument:async row=>records.push(row)});
  const upload=r.puts[0];if(!upload||upload.meta.contentType!=='application/zip'||records.length!==1||records[0].originalFileName!==file.name||records[0].originalMediaType!==type)return false;
  const stored=Buffer.from(await upload.blob.arrayBuffer());
  if(office)return stored.equals(bytes)&&records[0].fileName===file.name;
  return records[0].archiveContainer==='zip'&&/estrailo prima/.test(records[0].notes)&&records[0].fileName===file.name+'.zip'&&zipEntryBytes(stored,zipEntries(stored).find(x=>x.name===file.name)).equals(bytes);
 });
}
console.log(`Result: ${pass} passed, ${fail} failed`);
if(fail)process.exitCode=1;
