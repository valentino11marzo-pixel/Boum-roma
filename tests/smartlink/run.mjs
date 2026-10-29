import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

process.env.FIREBASE_API_KEY = 'test-key';
process.env.FIREBASE_ADMIN_EMAIL = 'test@example.com';
process.env.FIREBASE_ADMIN_PASS = 'test-pass';
const RULES = (await import('../../js/smartlink-engine.js')).default;
const PHOTO = (await import('../../js/smartlink-photo.js')).default;
const { toFsFields } = await import('../../api/homie/_lib.js');
const { default: extract } = await import('../../api/smartlink/extract.js');
const { parseSmartLinkPage, extractListing } = await import('../../api/smartlink/_extract.js');
const { parseListing } = await import('../../api/pfs/_fetch.js');
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
let remoteFetches = 0, writes = 0, remoteResult = 'blocked', archiveUnavailable = false, radarUnavailable = false, radarReads = 0, archiveQueries = 0;
const sourcePhoto='https://pwm.im-cdn.it/image/1823571757/m-c.jpg';
const photoBytes=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
const subitoUrl='https://www.subito.it/appartamenti/bilocale-test-roma-123456.htm';
const subitoPhoto='https://images.sbito.it/api/v1/sbt-ads-images-pro/images/10/10dc7a49-9f52-4698-9c1a-47410fe96885';
const subitoPhoto2=subitoPhoto.replace('10dc7a49','20dc7a49');
const unrelatedPhoto=subitoPhoto.replace('10dc7a49','30dc7a49');
// Struttura visibile del template pubblico Subito osservato il 21/10/2026.
const subitoHtml=`<html><h1>Bilocale Test</h1>
<p class="index-module_price__ArUqZ index-module_large__uFBUs">1.500 €</p>
<section><h6>Dati principali</h6><div><p>55 mq</p><p>2 Locali</p></div></section>
<figure class="index-module__gHgOiG__carousel-cell flickity-viewport"><picture>
<source srcset="${subitoPhoto}?rule=gallery-desktop-1x-auto 1x, ${subitoPhoto}?rule=gallery-desktop-2x-auto 2x">
<img src="${subitoPhoto}?rule=gallery-mobile-1x-auto"></picture></figure>
<figure class="index-module__gHgOiG__carousel-cell"><img src="${subitoPhoto2}?rule=gallery-mobile-1x-auto"></figure>
<aside><h3>Altri annunci</h3><img src="${unrelatedPhoto}?rule=gallery-mobile-1x-auto"><p>3 Locali · 150 mq</p></aside></html>`;
const avifBytes=await sharp({create:{width:32,height:24,channels:3,background:'#fafafa'}}).avif().toBuffer();
let subitoPhotoResult=avifBytes;
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
    if(u.pathname.endsWith(':runQuery')) {
      archiveQueries++;
      if(archiveUnavailable) return new Response('',{status:503});
      const q=JSON.parse(opts.body).structuredQuery, filter=q.where.fieldFilter;
      assert.equal(q.from[0].collectionId,'smartlinks');assert.equal(filter.field.fieldPath,'sourceUrl');
      const matches=[...docs.entries()].filter(([path,doc])=>path.startsWith('smartlinks/') && doc.fields.sourceUrl?.stringValue===filter.value.stringValue);
      return Response.json(matches.slice(0,q.limit).map(([,document])=>({document})));
    }
    const path = u.pathname.split('/documents/')[1] || '';
    if(path.startsWith('pfsProperties/')) {radarReads++;if(radarUnavailable) return new Response('',{status:503});}
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
  if (u.hostname === 'images.sbito.it') return new Response(subitoPhotoResult, {headers:{'content-type':'image/avif'}});
  remoteFetches++;
  if (u.hostname === 'www.subito.it') return new Response(subitoHtml,{headers:{'content-type':'text/html'}});
  assert.equal(u.hostname, 'www.immobiliare.it');
  if (remoteResult === 'blocked') return new Response('', { status:403 });
  return new Response('<html><script type="application/ld+json">{"@type":"Apartment","name":"Bilocale Test","offers":{"price":"1200"},"floorSize":{"value":62},"numberOfRooms":2,"image":'+(remoteResult==='no-images'?'[]':'["'+sourcePhoto+'","https://evil.example/photo.jpg"]')+'}</script></html>', { headers:{ 'content-type':'text/html' } });
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
  assert.equal(RULES.photoUrl(sourcePhoto,'Casafari'),sourcePhoto);
  assert.equal(RULES.photoUrl('https://pwm.im-cdn.it.evil.test/photo.jpg','Casafari'),null);
  assert.equal(RULES.photoUrl('https://127.0.0.1/photo.jpg','Immobiliare.it'),null);
  assert.equal(RULES.photoUrl('https://pwm.im-cdn.it.evil.test/photo.jpg','Immobiliare.it'),null);
  assert.deepEqual(RULES.photoCandidates('<img src="'+sourcePhoto+'"><img src="https://evil.example/photo.jpg">','Immobiliare.it'),[sourcePhoto]);
  assert.equal(RULES.photoUrl(subitoPhoto+'?rule=gallery-mobile-1x-auto','Subito'),subitoPhoto+'?rule=fullscreen-1x-auto');
  for(const url of [subitoPhoto.replace('images.sbito.it','images.sbito.it.evil.test'),subitoPhoto.replace('/images/10/','/avatars/10/'),subitoPhoto.replace('https://','https://user:pass@'),subitoPhoto+'#bad']) {
    assert.equal(RULES.photoUrl(url,'Subito'),null);
  }
  assert.equal(RULES.photoUrl(subitoPhoto,'Immobiliare.it'),null);
  const subitoParsed=parseSmartLinkPage(subitoHtml,subitoUrl);
  assert.deepEqual(subitoParsed.data,{title:'Bilocale Test',price:1500,sqm:55,rooms:2});
  assert.deepEqual(subitoParsed.images,[subitoPhoto,subitoPhoto2].map(url=>url+'?rule=fullscreen-1x-auto'),'Gallery variants deduplicate; recommendation photos excluded');
  const noGallery=parseSmartLinkPage(subitoHtml.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<section\b[\s\S]*?<\/section>/g,''),subitoUrl);
  assert.deepEqual(noGallery.images,[]);assert.equal(noGallery.data.sqm,null);assert.equal(noGallery.data.rooms,null);

  const schemaUrl='https://www.idealista.it/immobile/123456789/';
  const schemaPhoto='https://img.idealista.it/photo.jpg';
  const schema=price=>JSON.stringify({'@type':'Apartment',name:'Bilocale strutturato',offers:{price},floorSize:{value:55},numberOfRooms:2,image:[schemaPhoto]});
  const schemaHtml=(price,attrs='type="application/ld+json"')=>`<script ${attrs}>${schema(price)}</script>`;
  function verifyStructuredParser(parse) {
    assert.deepEqual(parse(schemaHtml('1500.00'),schemaUrl).data,{title:'Bilocale strutturato',price:1500,sqm:55,rooms:2});
    for(const attrs of ['id="listing" type="application/ld+json"','type = \'application/ld+json\' nonce="fixture"',
      'TYPE="APPLICATION/LD+JSON"','type=application/ld+json','data-note="a > b" type="application/ld+json"']) {
      const result=parse(schemaHtml('1500.00',attrs),schemaUrl);
      assert.equal(result.data.price,1500,'Other attributes must not hide the listing JSON-LD');
      assert.deepEqual(result.images,[schemaPhoto]);
    }
    for(const attrs of ['data-type="application/ld+json"','type="application/json"',
      'data-note="type=\'application/ld+json\'"','type="application/json" type="application/ld+json"']) {
      assert.equal(parse(schemaHtml('1500.00',attrs),schemaUrl).data.price,null,'Only the real first type attribute authorizes JSON-LD parsing');
    }
  }
  verifyStructuredParser(parseSmartLinkPage);
  for(const [input,expected] of [[1500,1500],[1500.5,1500.5],['1500.00',1500],[' 1500.50 ',1500.5],['1.200',1.2]]) {
    // PFS retains decimal precision; SmartLink retains its existing integer display contract.
    assert.equal(parseListing(schemaHtml(input),schemaUrl).price,expected);
    assert.equal(parseSmartLinkPage(schemaHtml(input),schemaUrl).data.price,Math.round(expected));
  }
  for(const input of [null,true,false,0,-1200,'-1200','1.200,50','1500 euro',['1500'],{value:1500}]) {
    assert.equal(parseListing(schemaHtml(input),schemaUrl).price,null,'Ambiguous structured prices are not converted by deleting punctuation');
    assert.equal(parseSmartLinkPage(schemaHtml(input),schemaUrl).data.price,null);
    assert.equal(parseListing(schemaHtml(input)+'<p>€ 900</p>',schemaUrl).price,900,'The existing visible-price fallback remains available');
  }
  const fallback='<h1>Casa visibile</h1><p>€ 1.500 · 55 m² · 2 locali</p>';
  assert.deepEqual(parseSmartLinkPage('<script type="application/ld+json">not JSON</script>'+fallback,schemaUrl).data,
    {title:'Casa visibile',price:1500,sqm:55,rooms:2});
  const pfsFallback=parseListing(fallback,schemaUrl);
  assert.equal(pfsFallback.bedrooms,2);assert.equal(pfsFallback.sourceUrl,schemaUrl);

  async function verifyRedirects(read) {
    const priorFetch=globalThis.fetch;
    const attempt=async(start,location,allowed,status=302)=>{
      const calls=[];
      globalThis.fetch=async(input,opts)=>{
        assert.equal(opts.redirect,'manual');calls.push(String(input));
        return calls.length===1?new Response('',{status,headers:location?{location}:{}}):
          new Response(schemaHtml('1900.00'),{headers:{'content-type':'text/html'}});
      };
      const result=await read(start);
      assert.equal(result.source.url,start);
      if(allowed) {
        assert.equal(result.status,'partial');assert.equal(result.data.price,1900);
        assert.deepEqual(calls,[start,RULES.normalizeUrl(new URL(location,start).href).url]);
      } else {
        assert.equal(result.status,'unavailable');assert.equal(result.data,undefined);assert.equal(result.images,undefined);
        assert.deepEqual(calls,[start],'A changed listing must be rejected before fetching its page');
      }
    };
    try {
      await attempt(schemaUrl,'/immobile/987654321/',false);
      await attempt(schemaUrl,'https://www.immobiliare.it/annunci/123456789/',false);
      await attempt(schemaUrl,'https://www.idealista.it/affitto-case/roma/',false);
      await attempt(schemaUrl,'https://m.idealista.it/immobile/123456789/',false);
      await attempt(schemaUrl,'https://user:pass@www.idealista.it/immobile/123456789/',false);
      await attempt(schemaUrl,'https://www.idealista.it:8443/immobile/123456789/',false);
      await attempt(schemaUrl,'https://idealista.it.evil.example/immobile/123456789/',false);
      await attempt(schemaUrl,null,false);
      await attempt(schemaUrl,null,false,403);
      for(const [start,next] of [
        [schemaUrl,'https://idealista.it/immobile/123456789'],
        ['https://immobiliare.it/annunci/123456789','https://www.immobiliare.it/annunci/123456789/'],
        ['https://www.casa.it/immobili/123456789/','https://casa.it/immobili/123456789'],
        [subitoUrl,subitoUrl.replace('www.subito.it','subito.it')],
        ['https://it.casafari.com/estate/sharepage/test/23310686611','?utm_source=share'],
      ]) await attempt(start,next,true);
    } finally {globalThis.fetch=priorFetch;}
  }
  await verifyRedirects(extractListing);

  // Mutations execute the real parser/extractor with the same assertions; no
  // source requests and no product files rewritten during the test.
  const extractorURL=new URL('../../api/smartlink/_extract.js',import.meta.url);
  const parserURL=new URL('../../api/pfs/_fetch.js',import.meta.url);
  const extractorCode=readFileSync(extractorURL,'utf8');
  const parserCode=readFileSync(parserURL,'utf8');
  const dataModule=code=>'data:text/javascript,'+encodeURIComponent(code);
  const loadExtractor=async(code,pfsURL=parserURL.href)=>import(dataModule(code
    .replace("'../../js/smartlink-engine.js'",JSON.stringify(new URL('../../js/smartlink-engine.js',import.meta.url).href))
    .replace("'../pfs/_fetch.js'",JSON.stringify(pfsURL))));
  const mutate=(code,before,after)=>{assert.ok(code.includes(before),'Mutation target must exist');return code.replace(before,after);};
  const badPrice=mutate(parserCode,'if (Number.isFinite(price) && price > 0) out.price = price;',
    "if (rawPrice) out.price = parseInt(String(rawPrice).replace(/\\D/g, ''), 10);");
  const badTag=mutate(parserCode,
    "if (!type || (type[2] ?? type[3] ?? type[4] ?? '').trim().toLowerCase() !== 'application/ld+json') continue;",
    "if (attrs !== ' type=\"application/ld+json\"') continue;");
  for(const code of [badPrice,badTag]) {
    const mutant=await loadExtractor(extractorCode,dataModule(code));
    assert.throws(()=>verifyStructuredParser(mutant.parseSmartLinkPage),{code:'ERR_ASSERTION'});
  }
  const badRedirect=mutate(extractorCode,'if (!next || !sameRedirectListing(startUrl,next.url)) return null;','if (!next) return null;');
  const redirectMutant=await loadExtractor(badRedirect);
  await assert.rejects(()=>verifyRedirects(redirectMutant.extractListing),{code:'ERR_ASSERTION'});
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
  // Regressione da pagina reale CasaFari: h1 prezzo, h2 casa, foto sul CDN
  // Immobiliare. Logo, Street View e immagini esterne alla galleria esclusi.
  const galleryPhotos=Array.from({length:6},(_,i)=>({
    src:`https://pwm.im-cdn.it/image/${1595786367+i}/xxl.jpg`,currentSrc:'',getAttribute:()=>null
  }));
  globalThis.document={
    images:[...galleryPhotos,{src:'https://pwm.im-cdn.it/image/999/xxl.jpg'}],
    querySelectorAll:selector=>selector==='img[alt^="Property photo "]'?[...galleryPhotos,galleryPhotos[0]]:[],
    querySelector:selector=>({textContent:selector==='h1'?'2000 €/m':'Appartamento in affitto in via Piave, Sallustiano - Quartiere'}),
    body:{innerText:'2 camere • 1 bagni • 60 m² DETTAGLI DELLA PROPRIETÀ Locali 2'},
    documentElement:{outerHTML:'https://pwm.im-cdn.it/image/999/xxl.jpg'}
  };
  try {
    const snapshot=EXT.listingSnapshot('https://it.casafari.com/estate/sharepage/test/23310686611');
    assert.deepEqual(snapshot.images,galleryPhotos.map(p=>p.src));
    assert.deepEqual(snapshot.data,{title:'Appartamento in affitto in via Piave, Sallustiano - Quartiere',zone:'Sallustiano - Quartiere',price:2000,sqm:60,rooms:2});
  } finally {globalThis.document=oldDom;}
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
  // Il preflight centrale consulta soltanto l'archivio BOOM, anche su miss/errore.
  const preflightRemote=remoteFetches,preflightRadar=radarReads;
  r=response();await extract(request('POST',{url:canonical.url,archiveOnly:true}),r);
  assert.equal(r.code,200);assert.equal(r.body.status,'unavailable');assert.deepEqual(r.body.images,[]);
  assert.equal(remoteFetches,preflightRemote);assert.equal(radarReads,preflightRadar);
  archiveUnavailable=true;
  r=response();await extract(request('POST',{url:canonical.url,archiveOnly:true}),r);
  assert.equal(r.code,503);assert.equal(r.body.error,'archive_unavailable');
  assert.equal(remoteFetches,preflightRemote);assert.equal(radarReads,preflightRadar);archiveUnavailable=false;
  const queriesBeforeInvalid=archiveQueries;
  for(const archiveOnly of ['true',1,null,{}]) {
    r=response();await extract(request('POST',{url:canonical.url,archiveOnly}),r);
    assert.equal(r.code,400);assert.equal(r.body.error,'invalid_request');
  }
  r=response();await extract(request('POST',{url:canonical.url,archiveOnly:true},'tenant'),r);
  assert.equal(r.code,403);assert.equal(archiveQueries,queriesBeforeInvalid);
  assert.equal(remoteFetches,preflightRemote);assert.equal(radarReads,preflightRadar);
  r=response();await extract(request('POST',{url:subitoUrl}),r);
  assert.equal(r.code,200);assert.equal(r.body.data.price,1500);assert.equal(r.body.images.length,2);
  r=response();await importPhoto(request('POST',{sourceUrl:subitoUrl,imageUrl:subitoPhoto}),r);
  assert.equal(r.code,200);assert.equal(r.headers['Content-Type'],'image/webp');
  const converted=await sharp(r.binary).metadata();assert.equal(converted.width,32);assert.equal(converted.height,24);assert.equal(converted.format,'webp');
  subitoPhotoResult=Buffer.from('not an image');
  r=response();await importPhoto(request('POST',{sourceUrl:subitoUrl,imageUrl:subitoPhoto}),r);
  assert.equal(r.code,422);subitoPhotoResult=avifBytes;
  r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }), r);
  assert.equal(r.body.status, 'unavailable');
  const cacheId='h_'+(await import('node:crypto')).createHash('sha1').update('https://www.immobiliare.it/annunci/123/').digest('hex').slice(0,16);
  const setRadar=(id,value)=>docs.set('pfsProperties/'+id,{name:'projects/test/databases/(default)/documents/pfsProperties/'+id,fields:toFsFields(value)});
  const radarDate='2026-10-01T12:00:00.000Z';
  const radarSample={sourceUrl:canonical.url,images:[sourcePhoto],title:'Bilocale dal Radar',zone:'Cipro',price:1800,sqm:75,rooms:3,bedrooms:1,
    scrapedAt:radarDate,lastSeenAt:new Date().toISOString()};
  setRadar(cacheId,radarSample);
  r=response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }),r);
  assert.equal(r.body.photoOrigin,'radar');
  assert.deepEqual(r.body.images,[sourcePhoto]);
  assert.deepEqual(r.body.radar,{id:cacheId,archivedAt:radarDate});
  assert.deepEqual(r.body.data,{title:'Bilocale dal Radar',zone:'Cipro',price:1800,sqm:75,rooms:3});
  assert.equal(r.body.createdBy,undefined);assert.equal(r.body.data.bedrooms,undefined);
  setRadar(cacheId,{...radarSample,sourceUrl:canonical.url.replace('123','999')});
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.status,'unavailable');assert.equal(r.body.radar,undefined);assert.equal(r.body.images?.length || 0,0);
  setRadar(cacheId,{...radarSample,rooms:null,bedrooms:4,sqm:null,size:68,scrapedAt:'2099-01-01T00:00:00Z'});
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.data.rooms,undefined,'Bedrooms are not evidence of total rooms');
  assert.equal(r.body.data.sqm,68);assert.equal(r.body.radar.archivedAt,null,'A future scrape time or lastSeenAt cannot certify the archive date');
  const legacyRadarUrl='https://immobiliare.it/annunci/123';
  const legacyCacheId='h_'+(await import('node:crypto')).createHash('sha1').update(legacyRadarUrl).digest('hex').slice(0,16);
  docs.delete('pfsProperties/'+cacheId);setRadar(legacyCacheId,{...radarSample,sourceUrl:legacyRadarUrl});
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.radar.id,legacyCacheId);assert.equal(r.body.data.price,1800,'Stored equivalent listing URLs reuse the same Radar facts');
  docs.delete('pfsProperties/'+legacyCacheId);setRadar(cacheId,radarSample);
  radarUnavailable=true;
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.status,'unavailable');assert.equal(r.body.radar,undefined);radarUnavailable=false;
  remoteResult='no-images';
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.photoOrigin,'radar');assert.equal(r.body.radar.id,cacheId);
  assert.equal(r.body.data.title,'Bilocale Test');assert.equal(r.body.data.price,1200);
  assert.equal(r.body.data.sqm,62);assert.equal(r.body.data.rooms,2,'Older cached values never replace fresh source facts');
  assert.equal(r.body.data.zone,'Cipro');
  remoteResult = 'ok';
  r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }), r);
  assert.equal(r.body.data.price, 1200);
  assert.equal(r.body.data.sqm, 62);
  assert.deepEqual(r.body.images,[sourcePhoto]);
  assert.equal(r.body.photoOrigin,undefined,'Fresh source photos keep their origin even when one field is filled from Radar');
  assert.equal(r.body.radar.id,cacheId);
  // Un campione senza fatti utili né foto valide non attiva una provenienza finta.
  setRadar(cacheId,{sourceUrl:canonical.url,images:['https://evil.example/photo.jpg'],title:42,price:true,sqm:[],rooms:false});
  remoteResult='blocked';r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.status,'unavailable');assert.equal(r.body.radar,undefined);
  setRadar(cacheId,radarSample);remoteResult='ok';

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
  const invalidHistoricalWrites=writes;
  for(const historicalData of [null,'true',1,{},[]]) {
    r=response();await create(request('POST',{...createBody,historicalData}),r);
    assert.equal(r.code,400);assert.equal(r.body.error,'invalid_request');
  }
  assert.equal(writes,invalidHistoricalWrites);
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
  assert.ok(Number.isFinite(Date.parse(docs.get('smartlinks/'+id).fields.createdAt.stringValue)),'Every new publication records its creation date');
  assert.ok(writes >= 1);
  r = response();
  await create(request('POST',createBody), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.id, id);
  assert.equal(r.body.duplicate, true);
  assert.equal(docs.get('smartlinks/'+id).fields.historicalData.booleanValue,false);
  delete docs.get('smartlinks/'+id).fields.historicalData;
  r=response();await create(request('POST',{...createBody,historicalData:false}),r);
  assert.equal(r.code,200,'Legacy missing historicalData normalizes to false');
  r=response();await create(request('POST',{...createBody,sourceUrl:'https://immobiliare.it/annunci/123'}),r);
  assert.equal(r.code,200);assert.equal(r.body.id,id,'Equivalent URL spelling remains the same idempotent publication');

  const radarBody={...createBody,idempotencyKey:'77777777-7777-4777-8777-777777777777',draftKey:createBody.idempotencyKey,radarId:cacheId,price:1800};
  const radarWrites=writes;
  for(const extra of [{radarId:'../../users/admin'},{radarId:'h_0000000000000000'},{radarId:[]},{radarId:null},{archiveId:id},{sourceUrl:canonical.url.replace('123','999')}]) {
    r=response();await create(request('POST',{...radarBody,...extra}),r);
    assert.equal(r.code,400);assert.equal(r.body.error,'invalid_radar');
  }
  r=response();await create(request('POST',radarBody,'tenant'),r);assert.equal(r.code,403);
  radarUnavailable=true;
  r=response();await create(request('POST',radarBody),r);assert.equal(r.code,503);assert.equal(r.body.error,'radar_unavailable');
  radarUnavailable=false;assert.equal(writes,radarWrites,'Failed reference checks never publish');
  r=response();await create(request('POST',{...radarBody,images:[]}),r);
  assert.equal(r.code,400);assert.equal(r.body.error,'photos_required');
  r=response();await create(request('POST',{...radarBody,images:[sourcePhoto]}),r);
  assert.equal(r.code,400,'Radar does not authorize raw source URLs as published photos');
  r=response();await create(request('POST',radarBody),r);assert.equal(r.code,201);
  const radarSmartLinkId=r.body.id,radarStored=docs.get('smartlinks/'+radarSmartLinkId).fields;
  assert.deepEqual(radarStored.observedAt,{nullValue:null});assert.equal(radarStored.reusedFrom.stringValue,'radar:'+cacheId);
  assert.ok(Number.isFinite(Date.parse(radarStored.createdAt.stringValue)));
  r=response();await read(request('GET',{id:radarSmartLinkId}),r);
  assert.equal(r.body.listing.price,1800);assert.equal(r.body.listing.observedAt,null,'An archived Radar price is never dated today');
  assert.equal(r.body.listing.reusedFrom,undefined);assert.equal(r.body.listing.radarId,undefined);
  r=response();await create(request('POST',{...radarBody,sourceUrl:legacyRadarUrl}),r);assert.equal(r.code,200);
  r=response();await create(request('POST',{...radarBody,radarId:undefined}),r);
  assert.equal(r.code,409);assert.equal(r.body.error,'publication_conflict','A retry cannot erase the Radar provenance');
  r=response();await create(request('POST',{...radarBody,price:1900}),r);assert.equal(r.code,409);
  docs.get('smartlinks/'+radarSmartLinkId).fields.active={booleanValue:false};

  const historicalBody={...createBody,idempotencyKey:'88888888-8888-4888-8888-888888888888',draftKey:createBody.idempotencyKey,historicalData:true,price:1800};
  r=response();await create(request('POST',{...historicalBody,images:[sourcePhoto]}),r);
  assert.equal(r.code,400,'Historical fields cannot authorize an unarchived source photo');
  r=response();await create(request('POST',{...historicalBody,images:[]}),r);assert.equal(r.code,400);
  r=response();await create(request('POST',historicalBody),r);assert.equal(r.code,201);
  const historicalId=r.body.id;
  assert.equal(docs.get('smartlinks/'+historicalId).fields.historicalData.booleanValue,true);
  assert.equal(docs.get('smartlinks/'+historicalId).fields.reusedFrom,undefined,'Historical flag does not invent archive provenance');
  r=response();await read(request('GET',{id:historicalId}),r);
  assert.equal(r.body.listing.observedAt,null,'Retained historical values cannot acquire a fresh observation date');
  assert.equal(r.body.listing.historicalData,undefined);
  r=response();await create(request('POST',historicalBody),r);assert.equal(r.code,200);
  for(const historicalData of [false,undefined]) {
    r=response();await create(request('POST',{...historicalBody,historicalData}),r);
    assert.equal(r.code,409);assert.equal(r.body.error,'publication_conflict','A retry cannot remove the historical-data qualification');
  }
  r=response();await create(request('POST',{...createBody,historicalData:true}),r);assert.equal(r.code,409);
  docs.get('smartlinks/'+historicalId).fields.active={booleanValue:false};

  // Una chiave conferma il contenuto già pubblicato, non perde modifiche successive.
  for(const changed of [{price:1600},{title:'Titolo aggiornato'},{note:'Nota aggiornata'},
    {map:{lat:41.91,lng:12.45,label:'Nuova area'}},{images:[photo.replace('22222222','99999999')]}]) {
    r=response();await create(request('POST',{...createBody,...changed}),r);
    assert.equal(r.code,409,'A changed publication must not receive a successful retry');
    assert.equal(r.body.error,'publication_conflict');
  }
  r=response();await create(request('POST',{...createBody,price:'1200',title:' Bilocale   Test '}),r);
  assert.equal(r.code,200,'Equivalent normalized input remains an idempotent retry');
  const nextKey='55555555-5555-4555-8555-555555555555';
  const nextImages=[photo,photo.replace('22222222','99999999')];
  const nextBody={...createBody,idempotencyKey:nextKey,draftKey:createBody.idempotencyKey,price:1600,images:nextImages};
  r=response();await create(request('POST',nextBody),r);
  assert.equal(r.code,201,'A new publication can reuse photos from its explicit draft');
  assert.notEqual(r.body.id,id);
  const nextId=r.body.id;
  r=response();await read(request('GET',{id:nextId}),r);assert.equal(r.body.listing.price,1600);
  assert.deepEqual(r.body.listing.images,nextImages);
  r=response();await create(request('POST',{...nextBody,images:nextImages.slice().reverse()}),r);
  assert.equal(r.code,409,'Changing cover/order is a changed publication');
  r=response();await create(request('POST',{...createBody,idempotencyKey:'66666666-6666-4666-8666-666666666666',draftKey:nextKey}),r);
  assert.equal(r.code,400,'An explicit draft never authorizes photos from another draft');
  docs.get('smartlinks/'+nextId).fields.active={booleanValue:false};

  r = response();
  await read(request('GET',{ id }), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.listing.title, 'Bilocale Test');
  assert.equal(r.body.listing.availability, 'Da verificare');
  assert.ok(!('createdBy' in r.body.listing));
  assert.ok(!('sourceUrl' in r.body.listing));
  assert.ok(!('source' in r.body.listing));
  assert.deepEqual(r.body.listing.images, [photo]);
  assert.equal(r.body.listing.price,1200,'Publishing a new version never changes the old public card');
  assert.equal(r.body.listing.map.precision, 'area');
  assert.equal(r.body.listing.map.label, 'Cipro');
  assert.equal(JSON.stringify(r.body).includes('immobiliare.it'), false);
  assert.deepEqual(RULES.publicRecord({ ...RULES.makeRecord(createBody, '2026-10-15T12:00:00Z'), images:[photo,'https://www.immobiliare.it/photo.jpg'] }).images, [photo]);

  // Lo stesso link da un altro dispositivo riusa l'archivio, senza fonte o upload.
  const originalDate='2026-10-17T12:00:00.000Z';
  docs.get('smartlinks/'+id).fields.observedAt={stringValue:originalDate};
  const remoteBefore=remoteFetches;
  r=response();await extract(request('POST',{url:canonical.url+'?utm_source=mobile'}),r);
  assert.equal(r.body.photoOrigin,'boom_archive');assert.equal(r.body.archive.id,id);
  assert.equal(r.body.archive.observedAt,originalDate);assert.deepEqual(r.body.images,[photo]);
  assert.equal(remoteFetches,remoteBefore,'An archived listing does not contact the protected source');
  assert.equal(r.body.data.price,1200);assert.equal(r.body.data.note,undefined);assert.equal(r.body.createdBy,undefined);
  const archiveOnlyRadarBefore=radarReads;
  r=response();await extract(request('POST',{url:canonical.url,archiveOnly:true}),r);
  assert.equal(r.body.photoOrigin,'boom_archive');assert.equal(r.body.archive.id,id);
  assert.equal(remoteFetches,remoteBefore);assert.equal(radarReads,archiveOnlyRadarBefore);
  const reuseKey='33333333-3333-4333-8333-333333333333';
  const reuse={...createBody,idempotencyKey:reuseKey,archiveId:id};
  const expectReuseRejected=async(body)=>{const out=response();await create(request('POST',body),out);assert.equal(out.code,400);};
  await expectReuseRejected({...reuse,archiveId:'../../users/admin'});
  await expectReuseRejected({...reuse,archiveId:'missing0000000000000'});
  await expectReuseRejected({...reuse,sourceUrl:canonical.url.replace('123','999')});
  await expectReuseRejected({...reuse,images:[photo.replace('22222222','99999999')]});
  await expectReuseRejected({...reuse,images:[photo,photo]});
  await expectReuseRejected({...reuse,images:[]});
  r=response();await create(request('POST',reuse),r);assert.equal(r.code,201);
  const reusedId=r.body.id;assert.notEqual(reusedId,id,'A new revision has a distinct idempotency key');
  r=response();await create(request('POST',reuse),r);assert.equal(r.code,200);assert.equal(r.body.id,reusedId);
  r=response();await read(request('GET',{id:reusedId}),r);
  assert.deepEqual(r.body.listing.images,[photo]);assert.equal(r.body.listing.observedAt,originalDate,'Reusing photos must not certify fresh source data');
  assert.equal(r.body.listing.reusedFrom,undefined);assert.equal(r.body.listing.sourceUrl,undefined);
  docs.get('smartlinks/'+reusedId).fields.active={booleanValue:false};
  const mixedArchive={...reuse,idempotencyKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',historicalData:true};
  r=response();await create(request('POST',{...mixedArchive,images:[photo.replace('22222222','99999999')]}),r);
  assert.equal(r.code,400,'Historical flag does not relax archive ownership checks');
  r=response();await create(request('POST',mixedArchive),r);assert.equal(r.code,201);
  const mixedId=r.body.id;
  assert.equal(docs.get('smartlinks/'+mixedId).fields.reusedFrom.stringValue,id);
  r=response();await read(request('GET',{id:mixedId}),r);
  assert.equal(r.body.listing.observedAt,null,'Older retained fields invalidate even the current archive observation date');
  r=response();await create(request('POST',mixedArchive),r);assert.equal(r.code,200);
  r=response();await create(request('POST',{...mixedArchive,historicalData:false}),r);assert.equal(r.code,409);
  docs.get('smartlinks/'+mixedId).fields.active={booleanValue:false};
  archiveUnavailable=true;
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.data.price,1200,'A failed archive query still permits direct source reading');
  assert.equal(r.body.photoOrigin,undefined);archiveUnavailable=false;
  r = response();
  await pois(request('GET',{ id }), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.points.length, 2);
  assert.equal(r.body.points[0].category, 'metro');
  docs.get('smartlinks/' + id).fields.active = { booleanValue:false };
  await expectReuseRejected({...reuse,idempotencyKey:'44444444-4444-4444-8444-444444444444'});
  r = response();
  await read(request('GET',{ id }), r);
  assert.equal(r.code, 404);
  r=response();await extract(request('POST',{url:canonical.url}),r);
  assert.equal(r.body.photoOrigin,undefined,'Inactive cards cannot feed the archive');

  const page = readFileSync(new URL('../../smartlink.html', import.meta.url), 'utf8');
  assert.match(page, /map-section/);
  assert.match(page, /gallery/);
  assert.doesNotMatch(page, /annuncio originale|sourceUrl|immobiliare\.it/i);
  const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  assert.match(portal, /smartLinkPhotosChanged/);
  assert.match(portal, /BOOM_SMARTLINK_MAP.mount/);
  await import('./map.mjs');
  const storage = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
  assert.match(storage, /match \/smartlinks\/\{draftKey\}\/\{photoFile\}/);
  console.log('SmartLink: fonte privata, auth, foto approvate, mappa indicativa, POI e scheda pubblica ✓');
} finally { globalThis.fetch = originalFetch; }

await import('./remote.mjs');
await import('./studio.mjs');
await import('./index.mjs');
