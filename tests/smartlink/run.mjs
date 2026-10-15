import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'test-key';
process.env.FIREBASE_ADMIN_EMAIL = 'test@example.com';
process.env.FIREBASE_ADMIN_PASS = 'test-pass';
const RULES = (await import('../../js/smartlink-engine.js')).default;
const { toFsFields } = await import('../../api/homie/_lib.js');
const { default: extract } = await import('../../api/smartlink/extract.js');
const { default: create } = await import('../../api/smartlink/create.js');
const { default: read } = await import('../../api/smartlink/read.js');

function response() {
  return { code: 200, headers: {}, setHeader(k,v){ this.headers[k]=v; return this; }, status(n){ this.code=n; return this; }, json(v){ this.body=v; return this; }, end(){ return this; } };
}
function request(method, body, token='admin') { return { method, body, headers:{ authorization:'Bearer '+token }, query:body }; }
const docs = new Map();
let remoteFetches = 0, writes = 0, remoteResult = 'blocked';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, opts={}) => {
  const u = new URL(String(input));
  if (u.hostname === 'identitytoolkit.googleapis.com') {
    if (u.pathname.endsWith('signInWithPassword')) return Response.json({ idToken:'server-token' });
    const body = JSON.parse(opts.body || '{}');
    return Response.json({ users:[{ localId:body.idToken === 'tenant' ? 'tenant' : 'admin' }] });
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
  remoteFetches++;
  assert.equal(u.hostname, 'www.immobiliare.it');
  if (remoteResult === 'blocked') return new Response('', { status:403 });
  return new Response('<html><script type="application/ld+json">{"@type":"Apartment","name":"Bilocale Test","offers":{"price":"1200"},"floorSize":{"value":62},"numberOfRooms":2}</script></html>', { headers:{ 'content-type':'text/html' } });
};
try {
  docs.set('users/admin', { name:'projects/test/databases/(default)/documents/users/admin', fields:toFsFields({ role:'admin' }) });
  docs.set('users/tenant', { name:'projects/test/databases/(default)/documents/users/tenant', fields:toFsFields({ role:'tenant' }) });

  assert.equal(RULES.normalizeUrl('https://immobiliare.it.evil.test/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('http://127.0.0.1/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('https://user:pass@www.immobiliare.it/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('https://www.immobiliare.it:8443/annunci/123'), null);
  assert.equal(RULES.normalizeUrl('https://www.immobiliare.it/'), null);
  const canonical = RULES.normalizeUrl('https://www.immobiliare.it/annunci/123/?token=private&utm_source=x');
  assert.equal(canonical.url, 'https://www.immobiliare.it/annunci/123/');
  const bare = RULES.makeRecord({ sourceUrl:canonical.url }, '2026-10-15T12:00:00Z');
  assert.equal(bare.price, null);
  assert.equal(bare.availability, 'Da verificare');

  let r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' },'tenant'), r);
  assert.equal(r.code, 403);
  assert.equal(remoteFetches, 0);
  r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }), r);
  assert.equal(r.body.status, 'unavailable');
  remoteResult = 'ok';
  r = response();
  await extract(request('POST',{ url:'https://www.immobiliare.it/annunci/123/' }), r);
  assert.equal(r.body.data.price, 1200);
  assert.equal(r.body.data.sqm, 62);

  r = response();
  const createBody = { idempotencyKey:'11111111-1111-4111-8111-111111111111', sourceUrl:canonical.url, price:1200, title:'Bilocale Test', note:'Da vedere' };
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
  docs.get('smartlinks/' + id).fields.active = { booleanValue:false };
  r = response();
  await read(request('GET',{ id }), r);
  assert.equal(r.code, 404);

  const page = readFileSync(new URL('../../smartlink.html', import.meta.url), 'utf8');
  assert.match(page, /Annuncio esterno/);
  assert.doesNotMatch(page, /✓ Verified/);
  console.log('SmartLink: URL sicuri, auth, fonte bloccata, estrazione, creazione, lettura pubblica e disattivazione ✓');
} finally { globalThis.fetch = originalFetch; }
