import {readFile,mkdir,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {readListing,processOne,openReview} from './reader.mjs';
import {canonical} from '../smartlink-extension/background.mjs';

const root=join(homedir(),'.boom'), config=JSON.parse(await readFile(join(root,'smartlink-reader.json'),'utf8'));
const base=new URL(config.baseUrl || 'https://www.boomrome.com');
if(base.protocol!=='https:' || base.username || base.password || base.port || (base.hostname!=='www.boomrome.com' && !/^boum-roma-[a-z0-9-]+\.vercel\.app$/.test(base.hostname))) throw new Error('invalid_boom_origin');
const env=await readFile(join(root,'env'),'utf8');
const line=env.match(/^(?:export\s+)?HOMIE_SECRET\s*=\s*(.+)$/m);
let secret=line?.[1]?.trim() || '';
if((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret=secret.slice(1,-1);
if(!secret) throw new Error('missing_homie_configuration');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=join(root,'smartlink-reader-profile'); await mkdir(profile,{recursive:true,mode:0o700});
let context,stopped=false;
async function call(body) {
  const response=await fetch(new URL('/api/smartlink/worker',base),{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(body.op==='complete'?175000:15000),
    headers:{'Content-Type':'application/json','X-Homie-Secret':secret,...(config.previewBypass ? {'x-vercel-protection-bypass':config.previewBypass} : {})},body:JSON.stringify(body)
  });
  if(!response.ok) {const error=new Error('boom_request_failed');error.status=response.status;throw error;}
  return response.json();
}
async function read(url,onDiagnostic) {
  if(!context) context=await chromium.launchPersistentContext(profile,{headless:false,chromiumSandbox:true,acceptDownloads:false});
  return readListing(context,url,onDiagnostic);
}
async function stop(){stopped=true;await context?.close().catch(()=>{});}
process.once('SIGTERM',()=>{stop().finally(()=>process.exit(0));});
process.once('SIGINT',()=>{stop().finally(()=>process.exit(0));});
if(process.argv.includes('--assist')) {
  const url=process.argv[process.argv.indexOf('--assist')+1];
  if(!url || canonical(url)!==url) throw new Error('invalid_review_url');
  try {
    context=await chromium.launchPersistentContext(profile,{headless:false,chromiumSandbox:true,acceptDownloads:false});
    const page=await openReview(context,url);
    console.log(JSON.stringify({event:'review_open',source:new URL(url).hostname}));
    // Il responsabile completa la verifica nella finestra e la chiude.
    // Non tentiamo di risolverla, né riproviamo la lettura automaticamente.
    await page.waitForEvent('close',{timeout:0}).catch(()=>{});
  } finally {await stop();}
} else if(process.argv.includes('--probe')) {
  // Collaudo della stessa lettura del servizio, senza coda o pubblicazione.
  // Nei log soltanto esito e forma dei dati, mai URL, titolo o contenuti.
  const started=Date.now();
  try {
    let diagnostic;
    const result=await read(process.argv[process.argv.indexOf('--probe')+1],value=>{diagnostic=value;});
    console.log(JSON.stringify({
      status:result.status,error:result.error || null,
      photoCount:result.images?.length || 0,
      fields:Object.entries(result.data || {}).filter(([,value])=>value!=null).map(([key])=>key),
      elapsedMs:Date.now()-started,
      ...(diagnostic?{diagnostic}:{})
    }));
    if(result.status!=='ready') process.exitCode=1;
  } finally {await stop();}
} else if(process.argv.includes('--check')) {
  await access(chromium.executablePath());
  const response=await call({op:'heartbeat'});
  console.log(JSON.stringify({ok:!!response.ok,browserInstalled:true}));
} else {
  while(!stopped) {
    let idle=15000;
    try {
      const response=await call({op:'pull'});
      if(response.enabled===false) idle=60000;
      if(response.job) {
        idle=1000;
        const pulse=setInterval(()=>call({op:'heartbeat'}).catch(()=>{}),15000);
        try {await processOne(response.job,read,call,sleep);console.log(JSON.stringify({event:'import_finished',id:response.job.id}));}
        finally {clearInterval(pulse);}
      }
    } catch {
      // Recupero del processo/browser; la lease server rimette in coda il lavoro interrotto.
      await context?.close().catch(()=>{});context=null;
      console.log(JSON.stringify({event:'reader_waiting'}));await sleep(15000);
    }
    await sleep(idle);
  }
}
