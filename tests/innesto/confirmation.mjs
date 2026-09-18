import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(import.meta.url);
globalThis.crypto ||= webcrypto;
globalThis.fetch=async()=>{throw new Error('NETWORK_DISABLED_AUDIT')};
const appSrc=readFileSync(process.env.BOOM_UI_SOURCE || ROOT+'/js/portal-app.js','utf8');
function extract(name) {
 const at=appSrc.indexOf('function '+name+'(');
 if(at<0)throw new Error('missing '+name);
 const start=appSrc.lastIndexOf('\n',at)+1;
 let i=appSrc.indexOf('{',at),depth=0;
 for(;i<appSrc.length;i++){if(appSrc[i]==='{')depth++;else if(appSrc[i]==='}'){depth--;if(!depth)break}}
 return appSrc.slice(start,i+1);
}
const APPLY_SRC=['generateMonthlyPayments','monthsBetween','generateContractDeadlines','innestoEmpty','innestoReset','innestoPools','innestoLinkFor','innestoPatchFor','innestoUserDoc','innestoArchiveDoc','innestoApply'].map(extract).join('\n')+'\nreturn innestoApply;';
const makeApply=new Function('window','firebase','db','S','toast','renderPage','buildNav','loadDataFresh','logActivity','localStorage','console','_innesto','storage','auth','goTo','clearInterval','_innestoTick','generateContractPDF',APPLY_SRC);
const proposal={
 landlord:{name:'Owner Synthetic',email:'owner@example.invalid'},
 tenant:{name:'Tenant Synthetic',email:'tenant@example.invalid'},
 property:{name:'Casa Sintetica',address:'Via Sintetica 1',rent:1000},
 contract:{type:'transitorio',startDate:'2026-10-01',endDate:'2027-09-30',rent:1000,deposit:2000,paymentDay:5,installmentMonths:1,cedolareSecca:'si',transitionalReason:'motivi di lavoro',esigenzaDi:'conduttore'}
};
const archived={id:'tg_synthetic',url:'https://firebasestorage.googleapis.com/v0/b/synthetic/o/synthetic.pdf?alt=media',name:'synthetic.pdf',mimeType:'application/pdf'};
const readDocs=[{archived,meta:{kind:'contratto',party:null,title:'Contratto sintetico',docType:'contract',category:'contratto locazione',folder:'01_Contratto'}}];
function scenario() {
 const DB=new Map(),writes=[],toasts=[];let seq=0,failDocumentUpdate=false,failReceipt=false,interruptAfterContract=false;let transactionQueue=Promise.resolve();
 const S={users:[{id:'u_owner',role:'landlord',...proposal.landlord},{id:'u_tenant',role:'tenant',...proposal.tenant}],properties:[{id:'p_house',ownerId:'u_owner',...proposal.property}],contracts:[],landlords:[],deadlines:[],profile:{id:'admin',role:'admin'}};
 for(const [col,rows]of[['users',S.users],['properties',S.properties]])for(const row of rows)DB.set(col+'/'+row.id,structuredClone(row));
 DB.set('documents/tg_synthetic',{id:archived.id,fileUrl:archived.url,needsFiling:true,propertyId:null,contractId:null});
 DB.set('scrivanoProposals/tg_synthetic',{status:'done',docId:'tg_synthetic',document:{id:archived.id,fileUrl:archived.url},proposal:structuredClone(proposal)});
 const save=(c,id,data,op)=>{const key=c+'/'+id;DB.set(key,{...(DB.get(key)||{}),...structuredClone(data)});writes.push({c,id,op,data:structuredClone(data)})};
 const db={collection(c){return{
  add:async data=>{const id=c.slice(0,3)+'_'+(++seq);save(c,id,data,'add');return{id}},
  doc(id){const did=id||(c.slice(0,3)+'_'+(++seq));return{id:did,path:c+'/'+did,_path:c+'/'+did,
   get:async()=>({exists:DB.has(c+'/'+did),data:()=>structuredClone(DB.get(c+'/'+did))}),
   update:async data=>{if(c==='documents'&&failDocumentUpdate)throw new Error('SYNTHETIC_DOCUMENT_UPDATE_UNAVAILABLE');if(!DB.has(c+'/'+did))throw new Error('not_found');save(c,did,data,'update')}}},
  where(field,op,value){return{limit(){return{get:async()=>({docs:[...DB].filter(([k,v])=>k.startsWith(c+'/')&&v[field]===value).map(([k,v])=>({id:k.split('/')[1],data:()=>structuredClone(v)}))})}}}}
 }},runTransaction(callback){
  const execute=async()=>{
   const staged=[];
   const tx={get:async ref=>({exists:DB.has(ref.path),data:()=>structuredClone(DB.get(ref.path))}),
    set(ref,data){staged.push([ref,data,'set'])},update(ref,data){staged.push([ref,data,'update'])}};
   const result=await callback(tx);
   // No write takes effect unless every operation can commit.
   for(const [ref,data,op]of staged){if(failDocumentUpdate&&ref.path.startsWith('documents/'))throw Error('SYNTHETIC_DOCUMENT_UPDATE_UNAVAILABLE');if(op==='update'&&!DB.has(ref.path))throw Error('not_found');if(failReceipt&&data.application?.status==='applied')throw Error('RECEIPT_UNAVAILABLE')}
   for(const [ref,data,op]of staged){const[c,id]=ref.path.split('/');save(c,id,data,'transaction.'+op)}
   return result;
  };
  const result=transactionQueue.then(execute);transactionQueue=result.catch(()=>{});return result;
 },batch(){const staged=[];return{set(ref,data){staged.push([ref._path,data])},async commit(){for(const[path,data]of staged){const[c,id]=path.split('/');save(c,id,data,'batch.set')}}}}};
 const run=async()=>{
  if(interruptAfterContract)S.contracts.push=()=>{throw Error('SIMULATED_INTERRUPTION_AFTER_CONTRACT_COMMIT')};
  const rec=DB.get('scrivanoProposals/tg_synthetic');
  const state={proposal:structuredClone(rec.proposal),seedId:'tg_synthetic',seedDoc:structuredClone(rec.document),links:{landlord:'u_owner',tenant:'u_tenant',property:'p_house'},coLinks:{},diffs:{},notes:[],confidence:90,busy:false,files:[],readDocs:structuredClone(readDocs),archive:true};
  const fn=makeApply({BOOM_DATAOPS:require(ROOT+'/js/dataops-engine.js')},{firestore:{FieldValue:{serverTimestamp:()=> '2026-09-18T00:00:00.000Z',arrayUnion:v=>({__union:v})}}},db,S,(...t)=>toasts.push(t),()=>{},()=>{},async()=>{},async()=>{}, {removeItem(){},getItem(){return null},setItem(){}},{log(){},warn(){},error(){}},state,{ref(){throw new Error('UNEXPECTED_STORAGE_WRITE')}},{currentUser:{uid:'admin'}},()=>{},()=>{},null,undefined);
  await fn();
 };
 return{DB,S,db,writes,toasts,run,setFailDocumentUpdate(v){failDocumentUpdate=v},setFailReceipt(v){failReceipt=v},setInterruptAfterContract(v){interruptAfterContract=v},count(c){return[...DB.keys()].filter(k=>k.startsWith(c+'/')).length}};
}

let checks=0;
const check=(label,condition)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)};
const receipt=s=>s.DB.get('scrivanoProposals/tg_synthetic').application;
const replay=scenario();await replay.run();
const firstId=replay.DB.get('documents/tg_synthetic').contractId;
check('first confirmation creates one contract and 12 installments',replay.count('contracts')===1&&replay.count('payments')===12);
check('receipt stores actual contract and document references',receipt(replay)?.status==='applied'&&receipt(replay).links.contract==='contracts/'+firstId&&receipt(replay).links.document_1==='documents/tg_synthetic');
await replay.run();
check('same proposal on reload never creates or relinks a duplicate',replay.count('contracts')===1&&replay.count('payments')===12&&replay.DB.get('documents/tg_synthetic').contractId===firstId);
check('second confirmation never reports a new successful import',replay.toasts.filter(t=>t[0]==='success'&&t[1]==='Innesto completato').length===1);
const fresh=scenario();fresh.S.users=[];fresh.S.properties=[];
for(const key of [...fresh.DB.keys()])if(key.startsWith('users/')||key.startsWith('properties/'))fresh.DB.delete(key);
await fresh.run();
check('new primary records and their references persist together',fresh.count('users')===2&&fresh.count('properties')===1&&fresh.count('contracts')===1&&['tenant','landlord','property','contract'].every(k=>fresh.DB.has(receipt(fresh).links[k])));
const concurrent=scenario();await Promise.all([concurrent.run(),concurrent.run()]);
check('two browser tabs claim only once',concurrent.count('contracts')===1&&concurrent.count('payments')===12&&receipt(concurrent)?.status==='applied');
const failed=scenario();failed.setFailDocumentUpdate(true);await failed.run();
check('failed document link does not invent an archived document',!failed.DB.get('documents/tg_synthetic').contractId&&!failed.toasts.some(t=>t[0]==='success'||/documento archiviato/.test(t[2]||'')));
check('failed file has a persistent individual outcome and original document reference',receipt(failed).documents.length===1&&receipt(failed).documents[0].status==='needs_review'&&receipt(failed).documents[0].ref==='documents/tg_synthetic');
check('primary contract survives with durable needs-review receipt and reference',failed.count('contracts')===1&&failed.count('payments')===12&&receipt(failed)?.status==='needs_review'&&receipt(failed).warnings.includes('documents')&&failed.DB.has(receipt(failed).links.contract));
failed.setFailDocumentUpdate(false);await failed.run();
check('reopening a partial result cannot duplicate primary records',failed.count('contracts')===1&&failed.count('payments')===12);
const interrupted=scenario();interrupted.setInterruptAfterContract(true);await interrupted.run();
check('interruption immediately after contract commit retains exact contract reference',interrupted.count('contracts')===1&&interrupted.count('payments')===0&&receipt(interrupted)?.status==='needs_review'&&interrupted.DB.has(receipt(interrupted).links.contract));
interrupted.setInterruptAfterContract(false);await interrupted.run();
check('interrupted import is held for explicit record review without rerunning creation',interrupted.count('contracts')===1&&interrupted.count('payments')===0);
const lostReceipt=scenario();lostReceipt.setFailReceipt(true);await lostReceipt.run();await lostReceipt.run();
check('lost completion receipt never releases the reservation or permits duplicate',lostReceipt.count('contracts')===1&&lostReceipt.count('payments')===12&&receipt(lostReceipt)?.status==='needs_review'&&!lostReceipt.toasts.some(t=>t[0]==='success'));
const legacy=scenario();legacy.DB.get('documents/tg_synthetic').innestoAt='2026-09-17T12:00:00.000Z';await legacy.run();
check('old import without receipt is blocked by pre-existing Innesto document marker',legacy.count('contracts')===0&&legacy.count('payments')===0);
const stale=scenario();stale.DB.get('scrivanoProposals/tg_synthetic').status='reading';await stale.run();
check('unready server proposal cannot create anything despite stale ready UI',stale.count('contracts')===0&&stale.count('payments')===0);
const makeSeedUI=new Function('db','_innesto','console','renderPage','innestoIngest','esc',extract('innestoLoadSeed')+'\n'+extract('innestoSeedCard')+'\nreturn {load:innestoLoadSeed,card:innestoSeedCard};');
let seeded=0;const seedState={seedId:'tg_synthetic',seedLoading:true};
const seedUI=makeSeedUI(failed.db,seedState,{error(){}},()=>{},()=>{seeded++},s=>String(s||''));
await seedUI.load('tg_synthetic');
check('reopening a partial receipt does not seed a new editable proposal',seeded===0&&seedState.seedApplication.status==='needs_review'&&!!seedState.seedError);
check('partial receipt opens the exact existing contract and the documents section',seedUI.card().includes("viewContract('"+receipt(failed).links.contract.split('/')[1]+"')")&&seedUI.card().includes("goTo('documents')"));
const missingLinked=scenario();missingLinked.DB.delete('users/u_owner');await missingLinked.run();
check('a deleted existing party cannot become a successful recorded link',missingLinked.count('contracts')===0&&!receipt(missingLinked).links.landlord&&receipt(missingLinked).status==='needs_review');
console.log(checks+' Scrivano confirmation checks passed (real apply, transaction store, network disabled).');
