// Real handler and auth/Firestore helpers; only external I/O is simulated.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Optional paths let a staged patch run before touching the shared checkout.
const root=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../../',import.meta.url);
const handlerURL=new URL('api/smartlink/import-photo.js',root);
const source=readFileSync(process.argv[3] || handlerURL,'utf8');
const require=createRequire(new URL('package.json',root));
const sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default;
process.env.FIREBASE_API_KEY='fixture-key-private';
process.env.FIREBASE_ADMIN_EMAIL='fixture-admin-private@example.invalid';
process.env.FIREBASE_ADMIN_PASS='fixture-password-private';
let generation=0;
async function load(code) {
  for(const name of ['../_auth.js','../homie/_lib.js','../../js/smartlink-engine.js']) {
    const before="from '"+name+"'";
    assert.equal(code.split(before).length,2);
    code=code.replace(before,'from '+JSON.stringify(new URL(name,handlerURL).href));
  }
  code=code.replace("from 'sharp'",'from '+JSON.stringify(pathToFileURL(require.resolve('sharp')).href));
  return import('data:text/javascript,'+encodeURIComponent(code+'\n//# sourceURL=photo-diagnostic-'+(++generation)+'.mjs'));
}
const sourceUrl='https://www.idealista.it/immobile/37221750/?private-source-marker=hidden';
const imageUrl='https://img4.idealista.it/private-image-marker.webp?private-credential-marker=hidden';
const privateMessage='private-error-marker '+imageUrl+' Authorization: Bearer private-token-marker Cookie: private-cookie-marker';
const originalFetch=globalThis.fetch, originalWarn=console.warn;
const jpeg=await sharp({create:{width:2,height:2,channels:3,background:'#fcd000'}}).jpeg().toBuffer();
const png=await sharp(jpeg).png().toBuffer(),webp=await sharp(jpeg).webp().toBuffer(),avif=await sharp(jpeg).avif().toBuffer();
const corruptAvif=Buffer.from([0,0,0,16,102,116,121,112,97,118,105,102,0,0,0,0]);
const expectedKeys=['event','phase','upstreamStatus','contentType','bytesRead','detectedType'].sort();
function response() {return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(bytes){this.bytes=bytes;return this;}};}
function request(token='private-token-marker',method='POST',url=imageUrl) {return {method,headers:token?{authorization:'Bearer '+token}:{},body:{sourceUrl,imageUrl:url}};}
function assertPrivate(records) {
  for(const record of records) assert.deepEqual(Object.keys(record).sort(),expectedKeys,'Diagnostics have only closed metadata keys');
  const printed=JSON.stringify(records);
  for(const value of ['private-source-marker','private-image-marker','private-credential-marker','private-error-marker','private-token-marker','private-cookie-marker','fixture-key-private','fixture-password-private','fixture-admin-private','https://','Cookie','Authorization'])
    assert.ok(!printed.includes(value),'Diagnostic must not disclose source, credentials or error.message: '+value);
}
async function matrix(mod) {
  let upstream=()=>new Response(webp,{headers:{'content-type':'image/webp'}}),requests=0,records=[],throwLogger=false;
  globalThis.fetch=async (input,options={})=>{
    const url=new URL(String(input));
    if(url.hostname==='identitytoolkit.googleapis.com') {
      if(url.pathname.endsWith('signInWithPassword')) return Response.json({idToken:'private-server-token-marker'});
      const token=JSON.parse(options.body).idToken;
      return Response.json({users:[{localId:token==='tenant'?'tenant':'admin'}]});
    }
    if(url.hostname==='firestore.googleapis.com') return Response.json({name:url.pathname,fields:{role:{stringValue:url.pathname.endsWith('/tenant')?'tenant':'admin'}}});
    assert.equal(String(input),imageUrl,'Fetch receives the exact validated image URL');
    requests++;
    assert.equal(options.redirect,'manual','Diagnostics must not follow redirects');
    assert.deepEqual(options.headers,{Accept:'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'},'No cookies, credentials, alternate UA or content negotiation');
    assert.ok(options.signal instanceof AbortSignal);
    return upstream();
  };
  console.warn=(line)=>{if(throwLogger)throw new Error(privateMessage);assert.equal(typeof line,'string');records.push(JSON.parse(line));};
  async function invoke(make,expected,diagnostic=null,req=request()) {
    upstream=make;records=[];requests=0;
    const res=response();await mod.default(req,res);
    assert.equal(res.code,expected,'The original HTTP result must be preserved');
    assert.equal(res.headers['Cache-Control'],'private, no-store');
    assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
    assert.equal(requests,diagnostic || expected===200?1:0,'Exactly one authorized source request, no retry');
    assertPrivate(records);
    if(diagnostic) {
      assert.deepEqual(records,[{event:'smartlink_photo_failure',...diagnostic}],'Each failed download records exactly its phase and safe measurements');
      assert.deepEqual(res.body,{ok:false,error:'photo_unavailable'},'Do not expose diagnostics in the public handler response');
    } else assert.equal(records.length,0,'Successful or rejected-before-fetch requests stay silent');
    return res;
  }
  const never=()=>assert.fail('No source request is authorized');
  await invoke(never,401,null,request(null));
  await invoke(never,403,null,request('tenant'));
  await invoke(never,405,null,request('private-token-marker','GET'));
  await invoke(never,400,null,request('private-token-marker','POST','https://outside.invalid/private-image-marker.webp'));
  for(const [bytes,type] of [[jpeg,'image/jpeg'],[png,'image/png'],[webp,'image/webp']]) {
    const res=await invoke(()=>new Response(bytes,{headers:{'content-type':type}}),200);
    assert.equal(res.headers['Content-Type'],type);assert.deepEqual(res.bytes,bytes);
  }
  const converted=await invoke(()=>new Response(avif,{headers:{'content-type':'image/avif'}}),200);
  assert.equal(converted.headers['Content-Type'],'image/webp');assert.equal((await sharp(converted.bytes).metadata()).format,'webp');
  const d=(phase,upstreamStatus=200,contentType='image/webp',bytesRead=0,detectedType=null)=>({phase,upstreamStatus,contentType,bytesRead,detectedType});
  for(const status of [403,302]) await invoke(()=>new Response(privateMessage,{status,headers:{'content-type':'text/html','location':imageUrl,'set-cookie':'private-cookie-marker'}}),422,d('upstream_status',status,'other'));
  await invoke(()=>new Response(privateMessage,{headers:{'content-type':'application/private-error-marker'}}),422,d('content_type',200,'other'));
  await invoke(()=>new Response(null),422,d('content_type',200,'missing'));
  await invoke(()=>new Response(webp,{headers:{'content-type':'IMAGE/WEBP; private-cookie-marker=hidden','content-length':'8000001'}}),422,d('content_length'));
  await invoke(()=>new Response(null,{headers:{'content-type':'image/webp'}}),422,d('body_missing'));
  let cancelled=0;
  await invoke(()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8_000_001));},cancel(){cancelled++;}}),{headers:{'content-type':'image/webp'}}),422,d('body_limit',200,'image/webp',8_000_001));
  assert.equal(cancelled,1,'The existing oversize stream cancellation remains active');
  const unknown=Buffer.from(privateMessage);
  await invoke(()=>new Response(unknown,{headers:{'content-type':'image/webp'}}),422,d('signature',200,'image/webp',unknown.length));
  await invoke(()=>new Response(corruptAvif,{headers:{'content-type':'image/avif'}}),422,d('avif_conversion',200,'image/avif',corruptAvif.length,'image/avif'));
  await invoke(()=>{throw new Error(privateMessage);},502,d('network',null,'missing'));
  let pulled=0;
  await invoke(()=>new Response(new ReadableStream({pull(controller){if(pulled++===0)controller.enqueue(new Uint8Array([255,216,255]));else controller.error(new Error(privateMessage));}}),{headers:{'content-type':'image/jpeg'}}),502,d('body_read',200,'image/jpeg',3));
  records=[];requests=0;upstream=()=>new Response(null,{status:403});
  assert.equal(await mod.fetchPhoto(imageUrl),null);
  assert.equal(records.length,0,'Existing helper callers do not gain logging');assert.equal(requests,1);
  throwLogger=true;
  const res=response();await mod.default(request(),res);
  assert.equal(res.code,422,'A logging failure cannot change the original HTTP outcome');
  throwLogger=false;
}
try {
  await matrix(await load(source));
  const mutations=[
    ['private data',"{event:'smartlink_photo_failure',...diagnostic}","{event:'smartlink_photo_failure',sourceUrl:req.body.sourceUrl,authorization:req.headers.authorization,...diagnostic}",/Diagnostics have only closed metadata keys/],
    ['missing failure record',"return unavailable('upstream_status')","return null",/Each failed download records exactly its phase/],
    ['logger affects request',"catch { /* La diagnostica non cambia l'esito dell'importazione. */ }","catch (error) { throw error; }",/A logging failure cannot change the original HTTP outcome/],
  ];
  for(const [name,before,after,expected] of mutations) {
    assert.equal(source.split(before).length,2,'One exact mutation anchor: '+name);
    await assert.rejects(()=>load(source.replace(before,after)).then(matrix),error=>{
      assert.equal(error.code,'ERR_ASSERTION','A mutation must fail a behavioral assertion, not imports or syntax');
      assert.match(error.message,expected);return true;
    },'Mutation detected: '+name);
  }
} finally {globalThis.fetch=originalFetch;console.warn=originalWarn;}
console.log('SmartLink photo diagnostics: PASS (real handler/auth/Sharp, exact 422/502 phases, unchanged requests and responses, private metadata, 3 in-memory mutations; no live source)');
