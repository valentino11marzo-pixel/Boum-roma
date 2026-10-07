// tests/palazzo/contatti.mjs — la porta dei contatti del Palazzo.
// Il handler VERO di api/owners/contatti.js su un Firestore in memoria; si
// finge solo la rete (Identity Toolkit + Firestore REST). La regola che
// conta: la proprietaria riceve i recapiti dei SUOI inquilini e di nessun
// altro, e mai più di nome, telefono, email.
// Uso: node tests/palazzo/contatti.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';

let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✓ ' + name); };

// ── Firestore in memoria ────────────────────────────────────────────────
const store = new Map();
const reads = [];
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
const docName = (k) => 'projects/test-proj/databases/(default)/documents/' + k;
const SESSIONS = { 'tok-admin': 'admin1', 'tok-owner': 'owner1', 'tok-other': 'owner2', 'tok-tenant': 't1' };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? okJson({ users: [{ localId: uid, email: uid + '@example.invalid' }] }) : okJson({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return okJson({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('firestore.googleapis.com')) {
    const path = url.slice(url.indexOf('/documents') + 10).replace(/^\//, '').split('?')[0];
    if (path.startsWith(':batchGet')) {
      const docs = JSON.parse(opts.body || '{}').documents || [];
      docs.forEach(n => reads.push(n.split('/documents/')[1]));
      return okJson(docs.map(n => { const k = n.split('/documents/')[1]; return store.has(k) ? { found: { name: n, fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z' } } : { missing: n }; }));
    }
    if (opts.method && opts.method !== 'GET') throw new Error('scrittura inattesa: ' + opts.method + ' ' + path);
    reads.push(path);
    return store.has(path) ? okJson({ name: docName(path), fields: toFsFields(store.get(path)), updateTime: '2026-01-01T00:00:00Z' }) : okJson({}, 404);
  }
  throw new Error('rete inattesa: ' + url);
};

const put = (k, v) => store.set(k, v);
put('users/admin1', { role: 'admin', name: 'Operatore' });
put('users/owner1', { role: 'landlord', name: 'Proprietaria' });
put('users/owner2', { role: 'landlord', name: 'Altro proprietario' });
put('users/t1', { role: 'tenant', name: 'Inquilina Uno', phone: '333 111 2222', email: 'UNO@Example.invalid', cf: 'RSSMRA80A01H501U', address: 'Via Segreta 1' });
put('properties/p1', { ownerId: 'owner1', address: 'Piazza Esempio 42' });
put('properties/p2', { ownerId: 'owner1', address: 'Piazza Esempio 42' });
put('properties/p9', { ownerId: 'owner2', address: 'Via Altra 3' });
// c1: il telefono sta sul PROFILO (contratto nato dal wizard senza recapiti)
put('contracts/c1', { propertyId: 'p1', tenantId: 't1', tenantName: 'Inquilina Uno', tenantCF: 'RSSMRA80A01H501U' });
// c2: nato da una proposta: niente telefono sul contratto né profilo; la
// proposta lo porta, e i co-conduttori hanno i loro recapiti sul contratto
put('contracts/c2', { propertyId: 'p2', tenantName: 'Inquilino Due', preAgreementId: 'pa2',
  coTenants: [{ name: 'Coinquilina', phone: '+39 347 000 1111', email: 'co@example.invalid', cf: 'XXXXXX00X00X000X' }, { name: 'Senza recapiti' }] });
put('preAgreements/pa2', { tenants: [{ fullName: 'Inquilino Due', phone: '+39 06 1234567', email: 'due@example.invalid', cf: 'NOPE' }, { fullName: 'Coinquilina', phone: '+39 347 000 2222' }] });
// c3: telefono sul contratto (vince sul profilo), con una nota che non è un numero
put('contracts/c3', { propertyId: 'p1', tenantName: 'Tre', tenantPhone: 'chiamare dopo le 18', tenantEmail: 'non-una-email' });
// c9: di un ALTRO proprietario
put('contracts/c9', { propertyId: 'p9', tenantName: 'Di un altro', tenantPhone: '+393330009999' });

const { default: handler, contactsOf, cleanPhone } = await import('../../api/owners/contatti.js');
async function call(token, body, method = 'POST') {
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
  await handler({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res);
  return res;
}

await check('senza sessione: 401, nessuna lettura di contratti', async () => {
  reads.length = 0;
  const r = await call(null, { contractIds: ['c1'] });
  assert.equal(r.statusCode, 401);
  assert.ok(!reads.some(k => k.startsWith('contracts/')));
});
await check('un inquilino non apre questa porta (403)', async () => {
  const r = await call('tok-tenant', { contractIds: ['c1'] });
  assert.equal(r.statusCode, 403);
});
await check('corpo sbagliato: 400; troppi id: 400; solo POST', async () => {
  assert.equal((await call('tok-owner', {})).statusCode, 400);
  assert.equal((await call('tok-owner', { contractIds: Array.from({ length: 121 }, (_, i) => 'c' + i) })).statusCode, 400);
  assert.equal((await call('tok-owner', null, 'GET')).statusCode, 405);
});
await check('la proprietaria: i SUOI contratti, quello di un altro omesso (mai un 403 che riveli)', async () => {
  const r = await call('tok-owner', { contractIds: ['c1', 'c2', 'c9', 'nonexistent', '../x'] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(Object.keys(r.body.contacts).sort(), ['c1', 'c2']);
  assert.equal(r.body.denied, 1);
  assert.equal(r.body.missing, 1);
  assert.equal(r.headers['cache-control'], 'private, no-store');
});
await check('dal profilo: telefono e email ripuliti; mai CF né indirizzo', async () => {
  const r = await call('tok-owner', { contractIds: ['c1'] });
  assert.deepEqual(r.body.contacts.c1, [{ role: 'tenant', name: 'Inquilina Uno', phone: '3331112222', email: 'uno@example.invalid' }]);
  const blob = JSON.stringify(r.body);
  assert.ok(!blob.includes('RSSMRA') && !blob.includes('Segreta'), blob);
});
await check('dalla proposta quando contratto e profilo tacciono; i co-conduttori coi loro recapiti', async () => {
  const r = await call('tok-owner', { contractIds: ['c2'] });
  assert.deepEqual(r.body.contacts.c2, [
    { role: 'tenant', name: 'Inquilino Due', phone: '+39061234567', email: 'due@example.invalid' },
    { role: 'cotenant', name: 'Coinquilina', phone: '+393470001111', email: 'co@example.invalid' },
    { role: 'cotenant', name: 'Senza recapiti', phone: '', email: '' }
  ]);
  assert.ok(!JSON.stringify(r.body).includes('XXXXXX'));
});
await check('una nota non diventa un numero, una non-email non diventa un indirizzo', async () => {
  const r = await call('tok-owner', { contractIds: ['c3'] });
  assert.deepEqual(r.body.contacts.c3, [{ role: 'tenant', name: 'Tre', phone: '', email: '' }]);
  assert.equal(cleanPhone('00 39 333 1234567'), '+393331234567');
  assert.equal(cleanPhone('12'), '');
});
await check('la proposta si legge SOLO dove serve', async () => {
  reads.length = 0;
  await call('tok-owner', { contractIds: ['c1'] });
  assert.ok(!reads.some(k => k.startsWith('preAgreements/')), reads.join(','));
});
await check('l\'admin: qualunque contratto, anche di un altro proprietario', async () => {
  const r = await call('tok-admin', { contractIds: ['c9', 'c1'] });
  assert.deepEqual(Object.keys(r.body.contacts).sort(), ['c1', 'c9']);
  assert.equal(r.body.contacts.c9[0].phone, '+393330009999');
  assert.equal(r.body.denied, 0);
});
await check('un altro proprietario non vede i contratti di questa', async () => {
  const r = await call('tok-other', { contractIds: ['c1', 'c2', 'c9'] });
  assert.deepEqual(Object.keys(r.body.contacts), ['c9']);
  assert.equal(r.body.denied, 2);
});
await check('contactsOf: il contratto vince sul profilo, il profilo sulla proposta', async () => {
  const out = contactsOf({ tenantName: 'A', tenantPhone: '+39 333 0000001' }, { phone: '333 0000002', email: 'p@example.invalid' }, { tenants: [{ phone: '333 0000003', email: 'q@example.invalid' }] });
  assert.deepEqual(out, [{ role: 'tenant', name: 'A', phone: '+393330000001', email: 'p@example.invalid' }]);
});
await check('giunzioni: rotta senza regola nuova in vercel.json, portal e vista la usano', async () => {
  const v = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(v.functions || {}).length <= 50);
  const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  assert.ok(portal.includes("fetch('/api/owners/contatti'") && portal.includes('getIdToken'));
  const ui = readFileSync(new URL('../../js/palazzo.js', import.meta.url), 'utf8');
  assert.ok(ui.includes('adapter.contacts(') && ui.includes("data-plz=\"contacts-retry\""));
});

console.log(`\n${count} check — la porta dei contatti, handler vero su Firestore in memoria.`);
