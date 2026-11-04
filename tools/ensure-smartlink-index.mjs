// Bootstrap additivo: solo l'indice privato delle importazioni, mai una sync distruttiva.
// REST: https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.indexes/list
// https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.collectionGroups.indexes/create
// https://firebase.google.com/docs/firestore/reference/rest/Shared.Types/State
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PARENT='projects/boom-property-dashboards/databases/(default)/collectionGroups/smartlinkImports';
const ENDPOINT='https://firestore.googleapis.com/v1/'+PARENT+'/indexes';
const WILDCARD_ENDPOINT=ENDPOINT.replace('/collectionGroups/smartlinkImports/','/collectionGroups/-/');
const LIST_VARIANTS=[
  {name:'scoped_page_size',endpoint:ENDPOINT,pageSize:true},
  {name:'wildcard_page_size',endpoint:WILDCARD_ENDPOINT,pageSize:true},
  {name:'wildcard_cli',endpoint:WILDCARD_ENDPOINT,pageSize:false}
];
const MAX_WAIT_MS=300000;
const defaultFile=new URL('../firestore.indexes.json',import.meta.url);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function failure(code,message,diagnostic) {const error=new Error(message);error.code=code;error.indexFailure=true;if(diagnostic) error.diagnostic=diagnostic;return error;}
function safeFailure(error) {
  return error?.indexFailure===true ? {code:error.code,message:error.message,...(error.diagnostic?{diagnostic:error.diagnostic}:{})} :
    {code:'index_check_failed',message:'Controllo indice non completato; dettagli remoti omessi.'};
}
// Gli errori Google possono includere valori della richiesta: mai stampare message,
// description, metadata o corpi arbitrari. Sono utili soltanto codici/campi noti.
async function httpDiagnostic(response,method) {
  const diagnostic={phase:method==='POST'?'CREATE':'LIST',method,httpStatus:Number(response.status)};
  const statuses=new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','ALREADY_EXISTS',
    'FAILED_PRECONDITION','RESOURCE_EXHAUSTED','ABORTED','OUT_OF_RANGE','UNIMPLEMENTED','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED','UNKNOWN']);
  const fields=new Set(['parent','pageSize','page_size','pageToken','page_token','filter','index','index.query_scope',
    'index.queryScope','index.fields','index.density','queryScope','query_scope','fields','density']);
  let data;try {data=await response.json();} catch {return diagnostic;}
  if(statuses.has(data?.error?.status)) diagnostic.rpcStatus=data.error.status;
  const violations=Array.isArray(data?.error?.details)?data.error.details.flatMap(detail=>
    detail?.['@type']==='type.googleapis.com/google.rpc.BadRequest' && Array.isArray(detail.fieldViolations)?detail.fieldViolations:[]):[];
  const knownFields=[...new Set(violations.map(item=>item?.field).filter(field=>fields.has(field)))];
  if(knownFields.length) diagnostic.fields=knownFields;
  return diagnostic;
}
function targetFields(fields,implicitName=false) {
  if(!Array.isArray(fields) || (fields.length!==2 && !(implicitName && fields.length===3))) return false;
  const expected=[['createdBy','ASCENDING'],['createdAt','DESCENDING'],['__name__','DESCENDING']];
  return fields.every((field,i)=>field?.fieldPath===expected[i][0] && field.order===expected[i][1] &&
    Object.keys(field).every(key=>key==='fieldPath' || key==='order'));
}

export function selectSmartLinkIndex(spec) {
  const matches=Array.isArray(spec?.indexes) ? spec.indexes.filter(index=>index?.collectionGroup==='smartlinkImports' &&
    index.queryScope==='COLLECTION' && targetFields(index.fields)) : [];
  if(matches.length!==1) throw failure('invalid_index_spec','firestore.indexes.json deve contenere esattamente un indice smartlinkImports createdBy ASC / createdAt DESC, scope COLLECTION.');
  // I campi vengono dalla specifica: gli altri indici non entrano mai nella richiesta.
  return {queryScope:matches[0].queryScope,fields:matches[0].fields.map(({fieldPath,order})=>({fieldPath,order}))};
}

async function checkSmartLinkIndex({fetchImpl=globalThis.fetch,indexesFile=defaultFile,
  timeoutMs=MAX_WAIT_MS,pollMs=5000,now=Date.now,sleep=pause}={}, {inspectOnly=false,listVariant=LIST_VARIANTS[2]}={}) {
  let spec;
  try {spec=JSON.parse(await readFile(indexesFile,'utf8'));}
  catch {throw failure('invalid_index_spec','Impossibile leggere la specifica firestore.indexes.json.');}
  const desired=selectSmartLinkIndex(spec);
  const token=process.env.SMARTLINK_INDEX_TOKEN;
  if(typeof token!=='string' || !token.trim()) throw failure('missing_index_token','SMARTLINK_INDEX_TOKEN non disponibile: nessuna richiesta eseguita.');
  if(!Number.isFinite(timeoutMs) || timeoutMs<=0 || timeoutMs>MAX_WAIT_MS || !Number.isFinite(pollMs) || pollMs<=0 || pollMs>60000) {
    throw failure('invalid_wait_budget','Il controllo indice deve terminare entro cinque minuti.');
  }
  const deadline=now()+timeoutMs;
  const timedOut=()=>failure('index_timeout','Indice SmartLink non confermato READY entro il tempo massimo. La creazione può proseguire su GCP; rieseguire il controllo.');
  const remaining=()=>{const left=deadline-now();if(left<=0) throw timedOut();return left;};
  async function request(url,method='GET',body) {
    let response;
    try {
      response=await fetchImpl(url,{method,redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(20000,remaining())))),
        headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    } catch(error) {
      if(error?.code==='index_timeout' || now()>=deadline) throw timedOut();
      // Errori di rete e corpi remoti possono contenere credenziali: non vengono riportati.
      throw failure('index_request_failed','Richiesta Firestore indice non completata. Nessuna modifica IAM eseguita.');
    }
    remaining();
    if(method==='POST' && response.status===409) return {concurrent:true};
    if(!response.ok) {
      const diagnostic=await httpDiagnostic(response,method);remaining();
      if(response.status===403) throw failure('index_permission_denied','Firestore ha rifiutato l’accesso all’indice (403). Verificare i permessi della identità WIF esistente; nessun retry IAM eseguito.',diagnostic);
      throw failure('index_http_error','Richiesta Firestore indice fallita (HTTP '+Number(response.status)+').',diagnostic);
    }
    let data;try {data=await response.json();} catch {throw failure('invalid_index_response','Risposta Firestore indice non valida.');}
    remaining();
    if(!data || typeof data!=='object' || Array.isArray(data)) throw failure('invalid_index_response','Risposta Firestore indice non valida.');
    if(data?.error) throw failure('index_operation_failed','Firestore ha segnalato un errore durante la creazione dell’indice.');
    return data;
  }
  async function list() {
    const indexes=[],seen=new Set();let pageToken='';
    do {
      // Come firebase-tools listIndexes: wildcard senza pageSize. Nel probe WIF
      // reale del 25/10/2026 pageSize=100 restituisce 400, anche sul wildcard.
      const url=new URL(listVariant.endpoint);if(listVariant.pageSize) url.searchParams.set('pageSize','100');
      if(pageToken) url.searchParams.set('pageToken',pageToken);
      const page=await request(url.toString());
      if(!page || typeof page!=='object' || (page.indexes!=null && !Array.isArray(page.indexes)) ||
        (page.nextPageToken!=null && typeof page.nextPageToken!=='string')) throw failure('invalid_index_response','Elenco indici Firestore non valido.');
      indexes.push(...(page.indexes || []));pageToken=page.nextPageToken || '';
      if(pageToken) {
        if(seen.has(pageToken) || seen.size>=100) throw failure('invalid_index_pagination','Paginazione indici Firestore non valida.');
        seen.add(pageToken);
      }
    } while(pageToken);
    return indexes.filter(index=>typeof index?.name==='string' && index.name.startsWith(PARENT+'/indexes/') &&
      /^[A-Za-z0-9_-]+$/.test(index.name.slice((PARENT+'/indexes/').length)) && index.queryScope==='COLLECTION' &&
      (!index.apiScope || index.apiScope==='ANY_API') && targetFields(index.fields,true));
  }
  let attemptedCreation=false,created=false;
  while(true) {
    remaining();
    const matches=await list();
    if(inspectOnly) {
      const state=matches.length===0?'ABSENT':matches.some(index=>index.state==='READY')?'READY':
        matches.some(index=>index.state==='NEEDS_REPAIR')?'NEEDS_REPAIR':matches.every(index=>index.state==='CREATING')?'CREATING':'UNKNOWN';
      return {state,count:matches.length};
    }
    if(matches.some(index=>index.state==='READY')) return {state:'READY',created};
    if(matches.some(index=>index.state==='NEEDS_REPAIR')) throw failure('index_needs_repair','L’indice SmartLink richiede riparazione (NEEDS_REPAIR). Nessun indice è stato eliminato o sostituito.');
    if(matches.some(index=>index.state!=='CREATING')) throw failure('index_unknown_state','Lo stato dell’indice SmartLink non è riconosciuto: disponibilità non confermata.');
    if(!matches.length && !attemptedCreation) {
      attemptedCreation=true;
      const operation=await request(ENDPOINT,'POST',desired);
      created=operation.concurrent!==true;
      // Anche un POST riuscito o un 409 concorrente richiede una rilettura READY.
      continue;
    }
    await sleep(Math.min(pollMs,remaining()));
  }
}

export async function ensureSmartLinkIndex(options={}) {return checkSmartLinkIndex(options);}

// Diagnostica isolata: tre letture con la stessa identità, nessun POST o attesa
// CREATING. Il percorso wildcard replica listIndexes del CLI ufficiale Firebase.
export async function inspectSmartLinkIndex(options={}) {
  const results=[];
  for(const variant of LIST_VARIANTS) {
    try {
      const result=await checkSmartLinkIndex({...options,timeoutMs:Math.min(options.timeoutMs ?? 30000,30000)},
        {inspectOnly:true,listVariant:variant});
      results.push({variant:variant.name,ok:true,...result});
    } catch(error) {results.push({variant:variant.name,ok:false,...safeFailure(error)});}
  }
  return {readOnly:true,results};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    if(args.length===1 && args[0]==='--inspect') {
      const result=await inspectSmartLinkIndex();
      console.log('[smartlink-index] INSPECT (sola lettura): '+JSON.stringify(result));
      if(result.results.every(item=>!item.ok)) process.exitCode=1;
    } else {
      if(args.length) throw failure('invalid_index_arguments','Argomento non supportato. Usare --inspect per la sola lettura.');
      const result=await ensureSmartLinkIndex();
      console.log('[smartlink-index] READY: boom-property-dashboards / (default) / smartlinkImports'+(result.created?' (creato e verificato).':' (già presente).'));
    }
  } catch(error) {
    console.error('[smartlink-index] '+JSON.stringify(safeFailure(error)));
    process.exitCode=1;
  }
}
