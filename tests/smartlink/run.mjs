import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'test-key';
process.env.FIREBASE_ADMIN_EMAIL = 'test@example.com';
process.env.FIREBASE_ADMIN_PASS = 'test-pass';
const RULES = (await import('../../js/smartlink-engine.js')).default;
const PHOTO = (await import('../../js/smartlink-photo.js')).default;
const { toFsFields } = await import('../../api/homie/_lib.js');
const { default: extract } = await import('../../api/smartlink/extract.js');
const { default: importPhoto } = await import('../../api/smartlink/import-photo.js');
const { default: create } = await import('../../api/smartlink/create.js');
const { default: read } = await import('../../api/smartlink/read.js');
const { default: pois } = await import('../../api/smartlink/pois.js');
const EXT = await import('../../tools/smartlink-extension/background.mjs');

function response() {
  return { code: 200, headers: {}, setHeader(k,v){ this.headers[k]=v; return this; }, status(n){ this.code=n; return this; }, json(v){ this.body=v; return this; }, end(v){ this.binary=v; return this; } };
}
function request(method, body, token='admin') { return { method, body, headers:{ authorization:'Bearer '+token }, query:body }; }
const docs = new Map();
let remoteFetches = 0, writes = 0, remoteResult = 'blocked';
const sourcePhoto='https://pwm.im-cdn.it/image/1823571757/m-c.jpg';
const photoBytes=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, opts={}) => {
  const u = new URL(String(input));
  if (u.hostname === 'identitytoolkit.googleapis.com') {
    if (u.pathname.endsWith('signInWithPassword')) return Response.json({ idToken:'server-token' });
    const body = JSON.parse(opts.body || '{}');
    return Response.json({ users:[{ localId:body.idToken === 'tenant' ? 'tenant' : 'admin' }] });
  }
  if (u.hostname === 'overpass-api.de') {
    assert.match(String(opts.body), /1600%2C41.9075%2C12.4475/);
    return Response.json({ elements:[
      { type:'node', id:1, lat:41.9078, lon:12.4480, tags:{name:'Cipro',station:'subway'} },
      { type:'node', id:2, lat:41.9080, lon:12.4482, tags:{name:'Cipro',railway:'subway_entrance'} },
      { type:'node', id:3, lat:41.9086, lon:12.4485, tags:{name:'Supermercato Test',shop:'supermarket'} },
    ] });
  }
  if (u.hostname === 'firestore.googleapis.com') {
    const path = u.pathname.split('/documents/')[1] || '';
    if (opts.method === 'POST') {
      writes++;
      const id = u.searchParams.get('documentId') || 'log';
      const name = 'projects/test/databases/(default)/documents/' + path + '/' + id;
      if (docs.has(path + '/' + id)) return Response.json({ error:'already_exists' }, { status:409 });
      docs.set(path + '/' + id, { name, fields:JSON.parse(opts.body).fields });
      return Response.json({ name });
    }
    const doc = docs.get(path);
    return doc ? Response.json(doc) : Response.json({ error:'missing' }, { status:404 });
  }
  if (u.hostname === 'pwm.im-cdn.it') return new Response(photoBytes, { headers:{ 'content-type':'image/jpeg' } });
  remoteFetches++;
  assert.equal(u.hostname, 'www.immobiliare.it');
  if (remoteResult === 'blocked') return new Response('', { status:403 });
  return new Response('<html><script type="application/ld+json">{"@type":"Apartment","name":"Bilocale Test","offers":{"price":"1200"},"floorSize":{"value":62},"numberOfRooms":2,"image":["'+sourcePhoto+'","https://evil.example/photo.jpg"]}</script></html>', { headers:{ 'content-type':'text/html' } });
};
try {
  const oldBitmap=globalThis.createImageBitmap, oldDocument=globalThis.document;
  let canvas, closed=0, webpSupported=true;
  globalThis.createImageBitmap=async () => ({width:4000,height:2000,close(){closed++;}});
  globalThis.document={createElement: () => canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(cb,type){cb(new Blob(['pixels'],{type:webpSupported ? type : type === 'image/webp' ? 'image/png' : type}));}}};
  try {
    const source=new Blob(['camera-metadata'],{type:'image/jpeg'});
    const optimized=await PHOTO.prepare(source);
    assert.equal(optimized.type,'image/webp'); assert.equal(canvas.width,2400); assert.equal(canvas.height,1200);
    assert.notEqual(await optimized.text(),await source.text());
    webpSupported=false;
    assert.equal((await PHOTO.prepare(source)).type,'image/jpeg');
    await assert.rejects(PHOTO.prepare(new Blob(['x'],{type:'text/plain'})));
    assert.equal(closed,2);
  } finally { globalThis.createImageBitmap=oldBitmap; globalThis.document=oldDocument; }

  docs.set('users/admin', { name:'projects/test/databases/(default)/documents/users/admin', fields:toFsFields({ role:'admin' }) });
  docs.set('users/tenant', { name:'projects/test/databases/(default)/documents/users/tenant', fields:toFsFields({ role:'tenant' }) });

  assert.equal(RULES.normalizeUrl('https://immobiliare.it.evil.test/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('http://127.0.0.1/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('https://user:pass@www.immobiliare.it/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('https://www.immobiliare.it:8443/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('https://www.immobiliare.it/'), null);
  assert.equal(RULES.photoUrl(sourcePhoto,'Immobiliare.it'),sourcePhoto);
  assert.equal(RULES.photoUrl('https://127.0.0.1/photo.jpg','Immobiliare.it'),null);
  assert.equal(RULES.photoUrl('https://pwm.im-cdn.it.evil.test/photo.jpg','Immobiliare.it'),null);
  assert.deepEqual(RULES.photoCandidates('<img src="'+sourcePhoto+'"><img src="https://evil.example/photo.jpg">','Immobiliare.it'),[sourcePhoto]);
  assert.equal(EXT.canonical('https://www.immobiliare.it/annunci/124483437/?utm=x#foto20'),'https://www.immobiliare.it/annunci/124483437/');
  const oldDom=globalThis.document;
  globalThis.document={ images:[
    {currentSrc:sourcePhoto,src:sourcePhoto,getAttribute:()=>null},
    {currentSrc:sourcePhoto.replace('/m-c.jpg','/xxs-c.jpg'),src:'',getAttribute:()=>null},
    {currentSrc:'https://pwm.im-cdn.it/image/1823571735/m-c.jpg',src:'',getAttribute:()=>null},
  ], documentElement:{outerHTML:''}, body:{innerText:'€ 1.500/mese 2 locali 50 m²'}, querySelector:()=>({textContent:'Bilocale a Cipro'}) };
  try {
    const snapshot=EXT.listingSnapshot('https://www.immobiliare.it/annunci/124483437/');
    assert.equal(snapshot.images.length,2);
    assert.deepEqual(snapshot.data,{title:'Bilocale a Cipro',zone:null,price:1500,sqm:50,rooms:2});
  } finally { globalThis.document=oldDom; }
  const canonical = RULES.normalizeUrl('https://www.immobiliare.it/annunci/123/?token=private&utm_source=x');
  assert.equal(canonical.url, 'https://www.immobiliare.it/annunci/123/');
  const bare = RULES.makeRecord({ sourceUrl:canonical.url }, '2026-10-15T12:00:00Z');
  assert.equal(bare.price, null);
  assert.equal(bare.availability, 'Da verificare');
  assert.equal(bare.title, 'Una casa a Roma');
  assert.equal(RULES.publicText('Dettagli: https://www.immobiliare.it/annunci/123/?utm=x confermati',400), 'Dettagli: confermati');
  const scrubbed = RULES.publicRecord({ ...bare, note:'Vedi https://www.immobiliare.it/annunci/123/', map:{lat:41.9075,lng:12.4475,label:'https://www.immobiliare.it/annunci/123/ Cipro'} });
  assert.equal(scrubbed.note, 'Vedi');
  assert.equal(scrubbed.map.label, 'Cipro');
  assert.deepEqual(bare.images, []);
  assert.equal(bare.map, null);
  const photo = 'https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/smartlinks%2F11111111-1111-4111-8111-111111111111%2F22222222-2222-4222-8222-222222222222.jpg?alt=media&token=public-photo';
  assert.ok(RULES.validImageUrl(photo, '11111111-1111-4111-8111-111111111111'));
  assert.ok(RULES.validPublicImageUrl(photo));
  assert.equal(RULES.validImageUrl('https://www.immobiliare.it/photo.jpg', '11111111-1111-4111-8111-111111111111'), false);
  assert.equal(RULES.validPublicImageUrl('https://www.immobiliare.it/photo.jpg'), false);
  assert.equal(RULES.makeRecord({ sourceUrl:canonical.url, images:['https://www.immobiliare.it/photo.jpg'], idempotencyKey:'11111111-1111-4111-8111-111111111111' }, '2026-10-15T12:00:00Z'), null);
  assert.equal(RULES.cleanMap({lat:0,lng:0,label:'Roma'}), null);
  assert.ok(RULES.distanceKm({lat:41.9075,lng:12.4475},{lat:41.9078,lng:12.4480}) < .1);

  let r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' },'tenant'), r);
  assert.equal(r.code, 403);
  assert.equal(remoteFetches, 0);
  r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }), r);
  assert.equal(r.body.status, 'unavailable');
  const cacheId='h_'+(await import('node:crypto')).createHash('sha1').update('https://www.immobiliare.it/annunci/123/').digest('hex').slice(0,16);
  docs.set('pfsProperties/'+cacheId,{ name:'projects/test/databases/(default)/documents/pfsProperties/'+cacheId, fields:toFsFields({sourceUrl:'https://www.immobiliare.it/annunci/123/',images:[sourcePhoto]}) });
  r=response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }),r);
  assert.equal(r.body.photoOrigin,'radar');
  assert.deepEqual(r.body.images,[sourcePhoto]);
  remoteResult = 'ok';
  r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }), r);
  assert.equal(r.body.data.price, 1200);
  assert.equal(r.body.data.sqm, 62);
  assert.deepEqual(r.body.images,[sourcePhoto]);

  r=response();
  await importPhoto(request('POST',{sourceUrl:canonical.url,imageUrl:sourcePhoto},'tenant'),r);
  assert.equal(r.code,403);
  r=response();
  await importPhoto(request('POST',{sourceUrl:canonical.url,imageUrl:'https://evil.example/photo.jpg'}),r);
  assert.equal(r.code,400);
  r=response();
  await importPhoto(request('POST',{sourceUrl:canonical.url,imageUrl:sourcePhoto}),r);
  assert.equal(r.code,200);
  assert.equal(r.headers['Content-Type'],'image/jpeg');
  assert.deepEqual(r.binary,photoBytes);

  r = response();
  const createBody = { idempotencyKey:'11111111-1111-4111-8111-111111111111', sourceUrl:canonical.url, price:1200, title:'Bilocale Test', note:'Da vedere', images:[photo], map:{lat:41.9075,lng:12.4475,label:'Cipro',precision:'exact'} };
  await create(request('POST',{...createBody,images:[]}),r);
  assert.equal(r.code,400);
  assert.equal(r.body.error,'photos_required');
  r=response();
  await create(request('POST',createBody,'tenant'), r);
  assert.equal(r.code, 403);
  r = response();
  await create(request('POST',createBody), r);
  assert.equal(r.code, 201);
  assert.match(r.body.url, /\/smartlink\.html\?id=/);
  const id = r.body.id;
  assert.equal(id.length, 20);
  assert.ok(docs.has('smartlinks/' + id));
  assert.ok(writes >= 1);
  r = response();
  await create(request('POST',createBody), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.id, id);
  assert.equal(r.body.duplicate, true);

  r = response();
  await read(request('GET',{ id }), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.listing.title, 'Bilocale Test');
  assert.equal(r.body.listing.availability, 'Da verificare');
  assert.ok(!('createdBy' in r.body.listing));
  assert.ok(!('sourceUrl' in r.body.listing));
  assert.ok(!('source' in r.body.listing));
  assert.deepEqual(r.body.listing.images, [photo]);
  assert.equal(r.body.listing.map.precision, 'area');
  assert.equal(r.body.listing.map.label, 'Cipro');
  assert.equal(JSON.stringify(r.body).includes('immobiliare.it'), false);
  assert.deepEqual(RULES.publicRecord({ ...RULES.makeRecord(createBody, '2026-10-15T12:00:00Z'), images:[photo,'https://www.immobiliare.it/photo.jpg'] }).images, [photo]);
  r = response();
  await pois(request('GET',{ id }), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.points.length, 2);
  assert.equal(r.body.points[0].category, 'metro');
  docs.get('smartlinks/' + id).fields.active = { booleanValue:false };
  r = response();
  await read(request('GET',{ id }), r);
  assert.equal(r.code, 404);

  const page = readFileSync(new URL('../../smartlink.html', import.meta.url), 'utf8');
  assert.match(page, /map-section/);
  assert.match(page, /gallery/);
  assert.doesNotMatch(page, /annuncio originale|sourceUrl|immobiliare\.it/i);
  const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  assert.match(portal, /smartLinkPhotosChanged/);
  assert.match(portal, /smartLinkSearchArea/);
  const storage = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
  assert.match(storage, /match \/smartlinks\/\{draftKey\}\/\{photoFile\}/);
  console.log('SmartLink: fonte privata, auth, foto approvate, mappa indicativa, POI e scheda pubblica ✓');
} finally { globalThis.fetch = originalFetch; }
