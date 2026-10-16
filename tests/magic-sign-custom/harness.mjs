// Isolated preview of the production custom-sign editor. Synthetic contacts,
// real two-page PDF and real PDF.js. Only auth/storage/API boundaries are fake.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const resolve = (env, module) => process.env[env] || require.resolve(module);
// Exact production PDF.js release, cached outside the repository. The pinned
// digest makes CDN content changes fail loudly; no dependency is added to runtime.
const PDFJS_VERSION = '3.11.174';
const assetHashes = { 'pdf.min.js':'5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946', 'pdf.worker.min.js':'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b' };
const assetCache = process.env.BOOM_PDFJS_CACHE || join(tmpdir(), 'boom-pdfjs-' + PDFJS_VERSION);
const assets = new Map(await Promise.all(Object.entries(assetHashes).map(async([name, hash])=>{
 const path = join(assetCache, name); let bytes;
 try { bytes = readFileSync(path); } catch {
  const response = await fetch('https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/build/' + name, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Cannot load pinned PDF.js fixture: HTTP ' + response.status);
  bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024) throw Error('PDF.js asset exceeds fixture size limit');
 }
 if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('PDF.js fixture hash mismatch: ' + name);
 await mkdir(assetCache, { recursive: true }); await writeFile(path, bytes);
 return [name, bytes];
})));
const { PDFDocument, StandardFonts, rgb, degrees } = await import(resolve('BOOM_PDF_LIB', 'pdf-lib'));
const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 2; i++) {
 const page = pdf.addPage([595.28, 841.89]);
 page.drawText('BOOM / DOCUMENTO DIMOSTRATIVO', { x: 48, y: 782, size: 12, font, color: rgb(.32,.28,.14) });
 page.drawText('Accordo di consegna', { x: 48, y: 717, size: 25, font });
 page.drawText('Casa Aurora - Via Roma 42', { x: 48, y: 681, size: 13, font });
 page.drawText('Pagina ' + i + ' di 2 / solo dati sintetici', { x: 48, y: 648, size: 10, font });
 for (let row = 0; row < 10; row++) page.drawText('Documento di prova per controllare campi e firme dal telefono.', { x: 48, y: 595 - row * 25, size: 11, font });
 page.drawText('Inquilino', { x: 48, y: 199, size: 11, font });
 page.drawText('Locatore', { x: 330, y: 199, size: 11, font });
 page.drawLine({ start: { x: 48, y: 147 }, end: { x: 255, y: 147 }, thickness: 1 });
 page.drawLine({ start: { x: 330, y: 147 }, end: { x: 537, y: 147 }, thickness: 1 });
}
export const pdfBytes = Buffer.from(await pdf.save());
const rotated = await PDFDocument.load(pdfBytes); rotated.getPages()[0].setRotation(degrees(90));
export const rotatedPdfBytes = Buffer.from(await rotated.save());
const source = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
if (!source.includes('pdfjs-dist@' + PDFJS_VERSION + '/build/pdf.min.js')) throw Error('PDF.js fixture must match the production release');
const start = source.indexOf('    const MS_FIELD_TYPES = {');
const end = source.indexOf('    // ============================================================================\n    // CAF Allegato B', start);
if (start < 0 || end < start) throw Error('Production editor boundaries missing');
const script = source.slice(start, end);
export const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>BOOM · Magic Sign · prova locale</title><link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/portal-mobile.css"><style>.fixture-home{max-width:780px;margin:12vh auto;padding:28px}.fixture-home h1{font-size:40px;margin:15px 0}.fixture-home p{line-height:1.7;color:#bbb}.fixture-home a{color:#e6c66b}.fixture-home button{margin:20px 0}#fixtureToast{position:fixed;z-index:10001;bottom:20px;left:20px;max-width:calc(100vw - 40px);padding:14px;background:#333;color:#fff;border-radius:10px;pointer-events:none}</style></head><body><main class="fixture-home" id="main"><small>BOOM · PROVA LOCALE</small><h1>Magic Sign, dal telefono.</h1><p>Editor reale, contatti sintetici, PDF di due pagine. Caricamento e creazione dei link sono simulati; nessun dato raggiunge BOOM.</p><a href="/fixture.pdf" download="Accordo-consegna-demo.pdf">Scarica il PDF di prova</a><br><button class="btn" id="openStudio" onclick="openMagicSignEditor()">Apri Magic Sign</button><p id="fixtureCalls"></p></main><div id="modals"></div><div id="fixtureToast" hidden role="status"></div><script>
const testIO = window.testIO = { uploads:[], creations:[], contracts:[], opened:[], reads:[], failAfterCreate:false, delayCreate:0, createError:null, storageFail:false, notifications:[] };
const S = { profile:{id:'admin-demo',role:'admin',name:'Valentino Demo'}, users:[{id:'tenant-demo',role:'tenant',name:'Marta Rossi',email:'marta@example.test',phone:'+39000000001'},{id:'landlord-demo',role:'landlord',name:'Luca Bianchi',email:'luca@example.test',phone:'+39000000002'}], properties:[{id:'house-demo',name:'Casa Aurora',address:'Via Roma 42',ownerId:'landlord-demo'}], contracts:[{id:'contract-demo',propertyId:'house-demo',tenantId:'tenant-demo',signatureStatus:'partial'}], signRequests:[] };
const auth={currentUser:{uid:'admin-demo',getIdToken:async()=> 'synthetic-token'}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin=()=>S.profile.role==='admin';
const jsq=s=>esc(JSON.stringify(s));
const toast=(...args)=>{testIO.notifications.push(args);const t=document.getElementById('fixtureToast');t.textContent=args.slice(1).join(' · ');t.hidden=false;setTimeout(()=>t.hidden=true,1800)};
const storage={ref:path=>({put:async blob=>{testIO.uploads.push({path,size:blob.size});if(testIO.storageFail)throw Error('Synthetic upload unavailable')},getDownloadURL:async()=>location.origin+'/fixture.pdf'})};
const db={collection:name=>({doc:id=>({get:async()=>{testIO.reads.push([name,id]);return{exists:!!S.signRequests.find(r=>r.id===id),data:()=>S.signRequests.find(r=>r.id===id)}},set:()=>{throw Error('Client Firestore creation forbidden')},update:()=>{throw Error('Client signing forbidden')}})})};
window.open=(url)=>{testIO.opened.push(String(url));return null};
const logActivity=()=>{}; const firebase={firestore:{FieldValue:{serverTimestamp:()=> 'synthetic-time'}}};
const closeModal=()=>{document.getElementById('modals').innerHTML='';document.body.classList.remove('modal-open')};
function openFirmaOra(id){testIO.contracts.push(id);document.getElementById('fixtureCalls').textContent='Firma ora aperta sul contratto esistente: '+id;}
const realFetch=window.fetch.bind(window), savedRequests=new Map();
window.fetch=async(input,options={})=>{
 if(String(input)!=='/api/sign/custom/create')return realFetch(input,options);
 const body=JSON.parse(options.body);testIO.creations.push(body);
 if(testIO.delayCreate)await new Promise(r=>setTimeout(r,testIO.delayCreate));
 if(testIO.createError)return new Response(JSON.stringify({ok:false,error:testIO.createError}),{status:400});
 let saved=savedRequests.get(body.reqId);
 if(saved&&saved.body!==options.body)return new Response(JSON.stringify({ok:false,error:'request_conflict'}),{status:409});
 if(!saved){const signers=Object.fromEntries(Object.entries(body.signers).map(([role,s])=>[role,{...s,token:body.migrateLegacy&&s.token?s.token:'synthetic-'+role+'-token'}]));saved={body:options.body,result:{ok:true,reqId:body.reqId,signers,documentVersion:1,documentHash:'synthetic-document-hash'}};savedRequests.set(body.reqId,saved);const row={...body,...saved.result,id:body.reqId,status:'ready'},index=S.signRequests.findIndex(r=>r.id===body.reqId);if(index<0)S.signRequests.push(row);else S.signRequests[index]=row;}
 if(testIO.failAfterCreate){testIO.failAfterCreate=false;throw Error('Synthetic response lost after persistence')}
 return new Response(JSON.stringify(saved.result),{status:200,headers:{'Content-Type':'application/json'}});
};
${script.replace(/<\/script/gi,'<\\/script')}
</script><script src="/pdfjs/pdf.min.js"></script><script>pdfjsLib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.js';window.testReady=true;document.body.classList.toggle('pm-on',innerWidth<=920);</script></body></html>`;
export function createHarnessServer() {
 return createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/fixture.pdf'){res.setHeader('Content-Type','application/pdf');res.end(pdfBytes);return;}
  if(['/pdfjs/pdf.min.js','/pdfjs/pdf.worker.min.js'].includes(path)){res.setHeader('Content-Type','text/javascript');res.end(assets.get(path.split('/').at(-1)));return;}
  if(['/css/portal.css','/css/portal-finish.css','/css/portal-mobile.css'].includes(path)){res.setHeader('Content-Type','text/css');res.end(readFileSync(join(ROOT,path)));return;}
  if(path!=='/'){res.statusCode=404;res.end('Not found');return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
 });
}
