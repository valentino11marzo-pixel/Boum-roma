// Real create/get/submit/agent handlers, real PDFs. Only Firebase/Storage/SMTP IO is synthetic.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { PDFDocument, degrees, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
process.env.FIREBASE_API_KEY = 'test';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@example.test';
process.env.FIREBASE_ADMIN_PASS = 'test';
process.env.HOMIE_SECRET = 'test-homie';
const { toFsFields, fsDocToJs, FS_BASE } = await import('../../api/homie/_lib.js');
const { BUCKET, CONSENT, hash, MAX_PDF_BYTES } = await import('../../api/sign/custom/_protocol.js');
const { default: create } = await import('../../api/sign/custom/create.js');
const { default: get } = await import('../../api/sign/custom/get.js');
const { default: submit } = await import('../../api/sign/custom/submit.js');
const { default: agentCreate } = await import('../../api/agent/magicsign.create.js');
const { buildSignedPdf } = await import('../../api/sign/custom/_finalize.js');
let docs, versions, storage, storageTokens, creationBarrierRelease, emails, reads, writes, failSignedUpload, failPublicRead, omitToken, conflicts, hook, serial = 0;
const clone = v => structuredClone(v);
const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const docResponse = path => json(200, { name: `${FS_BASE.replace('https://firestore.googleapis.com/v1/', '')}/${path}`, fields: toFsFields(docs.get(path)), updateTime: String(versions.get(path)) });
const put = (path, doc) => { docs.set(path, clone(doc)); versions.set(path, (versions.get(path) || 0) + 1); };
function reset() { docs = new Map(); versions = new Map(); storage = new Map(); storageTokens = new Map(); creationBarrierRelease = null; emails = []; reads = []; writes = []; failSignedUpload = false; failPublicRead = false; omitToken = false; conflicts = 0; hook = null; put('users/admin', { role: 'admin' }); }
nodemailer.createTransport = () => ({ sendMail: async message => { emails.push(message); return { messageId: 'smtp-synthetic-' + emails.length }; } });
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(input), method = init.method || 'GET';
  if (u.href.includes('accounts:signInWithPassword')) return json(200, { idToken: 'admin-token' });
  if (u.href.includes('accounts:lookup')) { const b = JSON.parse(init.body); return b.idToken === 'browser-admin' ? json(200, { users: [{ localId: 'admin' }] }) : json(400, {}); }
  if (u.href === FS_BASE + ':commit') {
    const changes = JSON.parse(init.body).writes;
    if (hook) await hook(changes);
    for (const w of changes) {
      const path = w.update.name.split('/documents/')[1], pre = w.currentDocument;
      if (!pre || (pre.exists === false && docs.has(path)) || (pre.updateTime && pre.updateTime !== String(versions.get(path)))) { conflicts++; return json(409, { error: { status: 'FAILED_PRECONDITION' } }); }
    }
    for (const w of changes) { const path = w.update.name.split('/documents/')[1]; const data = fsDocToJs(w.update); delete data.id; put(path, { ...(docs.get(path) || {}), ...data }); writes.push({ path, fields: clone(data), pre: w.currentDocument }); }
    return json(200, {});
  }
  if (u.href.startsWith(FS_BASE + '/')) {
    const path = decodeURIComponent(u.pathname.split('/documents/')[1]);
    if (method === 'GET') { reads.push(path); return docs.has(path) ? docResponse(path) : json(404, {}); }
    if (method === 'POST' && path === 'agentNotifications') {
      const id = u.searchParams.get('documentId'); assert(id, 'Notification must have a deterministic ID');
      const key = path + '/' + id; if (docs.has(key)) return json(409, {});
      const value = fsDocToJs({ name: FS_BASE + '/' + key, fields: JSON.parse(init.body).fields }); delete value.id; put(key, value); return json(200, { name: FS_BASE + '/' + key });
    }
    throw new Error('Unconditional/unsupported Firestore mutation: ' + method + ' ' + path);
  }
  if (u.hostname === 'firebasestorage.googleapis.com') {
    const prefix = `/v0/b/${BUCKET}/o`;
    assert(u.pathname.startsWith(prefix));
    const path = decodeURIComponent(u.pathname.slice(prefix.length + 1));
    if (method === 'POST') {
      const key = u.searchParams.get('name');
      if (failSignedUpload && key.includes('/signed/')) return json(503, {});
      storage.set(key, Buffer.from(init.body)); writes.push({ upload: key });
      const token = 'synthetic-token-' + writes.length; storageTokens.set(key, token);
      return json(200, omitToken ? {} : { downloadTokens: token });
    }
    if (!u.searchParams.has('alt')) return json(200, omitToken ? {} : { downloadTokens: storageTokens.get(path) });
    if (storageTokens.has(path) && u.searchParams.get('token') !== storageTokens.get(path)) { creationBarrierRelease?.(); return json(403, {}); }
    if (failPublicRead && path.includes('/sealed/')) return json(403, {});
    if (!storage.has(path)) return json(404, {});
    reads.push(path); return new Response(storage.get(path), { status: 200 });
  }
  throw new Error('Unexpected network blocked: ' + u.origin);
};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
const consent = { text: CONSENT, hash: hash(CONSENT), at: '1999-01-01T00:00:00Z' };
function response() { return { code: 200, headers: {}, status(n) { this.code = n; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
async function call(handler, body, headers = {}) { const res = response(); await handler({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.' + (++serial), authorization: 'Bearer browser-admin', ...headers }, body }, res); return res; }
async function fixture(id = 'test-request', roles = ['tenant']) {
  const pdf = await PDFDocument.create(); pdf.addPage([600, 800]); const bytes = Buffer.from(await pdf.save());
  storage.set(`signRequests/${id}/original.pdf`, bytes);
  return { reqId: id, title: 'Synthetic agreement', originalPdfUrl: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('signRequests/' + id + '/original.pdf')}?alt=media&token=upload-token`, originalPdfPath: `signRequests/${id}/original.pdf`, pageCount: 1,
    requiredRoles: roles, fields: roles.flatMap((role, i) => [{ page: 1, role, kind: 'signature', xr: .1, yr: .1 + i * .3, wr: .2, hr: .1 }, { page: 1, role, kind: 'date', xr: .4, yr: .1 + i * .3, wr: .2, hr: .1 }]),
    signers: Object.fromEntries(roles.map(role => [role, { name: role + ' Example', email: role + '@example.test', userId: 'person-' + role }])) };
}
function signBody(id = 'test-request', role = 'tenant') { const doc = docs.get('signRequests/' + id); return { req: id, role, token: doc.signers[role].token, documentVersion: doc.documentVersion, documentHash: doc.documentHash, signature: png, consent }; }
async function prepared(id = 'test-request', roles) { const payload = await fixture(id, roles); const r = await call(create, payload); assert.equal(r.code, 200, JSON.stringify(r.body)); return payload; }
let passed = 0;
async function test(name, fn) { reset(); try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } }
export { reset, prepared, call, get, submit, signBody };
export const currentDoc = id => clone(docs.get('signRequests/' + id));
export const emailCount = () => emails.length;
export function uploadFailure(value) { failSignedUpload = value; }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
await test('admin-only creation; signer token gate and invalid IDs', async () => {
  const p = await fixture(); const denied = await call(create, p, { authorization: 'Bearer bad' }); assert.equal(denied.code, 401); assert.equal(writes.length, 0);
  put('users/admin', { role: 'tenant' }); assert.equal((await call(create, p)).code, 403); put('users/admin', { role: 'admin' }); await call(create, p);
  assert.equal((await call(get, { ...signBody(), token: 'wrong' })).code, 401);
  assert.equal((await call(submit, { ...signBody(), token: 'wrong' })).code, 401);
  assert.equal((await call(get, { ...signBody(), req: '../secret' })).code, 400);
});
await test('create freezes PDF and retry preserves tokens without extra writes', async () => {
  const p = await prepared(); const original = clone(docs.get('signRequests/test-request')); const count = writes.length;
  const retry = await call(create, p); assert.equal(retry.code, 200); assert.equal(retry.body.signers.tenant.token, original.signers.tenant.token); assert.equal(writes.length, count);
  assert.equal(original.status, 'ready'); assert.match(original.originalPdfPath, /\/sealed\/[a-f0-9]{64}(?:-[a-f0-9-]{36})?\.pdf$/);
  assert.equal(original.pdfHash, hash(storage.get(original.originalPdfPath))); assert.equal(emails.length, 0);
  assert.equal((await call(create, { ...p, title: 'Different terms' })).code, 409);
  const view = await call(get, signBody()); assert.equal(view.body.documentHash, original.documentHash); assert.equal(view.body.pdfHash, original.pdfHash); assert(!view.body.signers[0].token);
});
await test('simultaneous creation returns one request and the same signer tokens', async () => {
  const p = await fixture(); let release, arrivals = 0; const barrier = new Promise(resolve => { release = resolve; }); creationBarrierRelease = release;
  hook = async changes => { if (changes[0].currentDocument.exists === false && arrivals++ < 2) { if (arrivals === 2) release(); await barrier; } };
  const [a, b] = await Promise.all([call(create, p), call(create, p)]); hook = null;
  assert.equal(a.code, 200); assert.equal(b.code, 200); assert.equal(a.body.signers.tenant.token, b.body.signers.tenant.token); assert(conflicts > 0);
  const doc = docs.get('signRequests/test-request'); assert.equal((await fetch(doc.originalPdfUrl)).status, 200, 'Concurrent loser must not revoke the saved download token');
});
await test('oversized PDF is rejected before a request is created', async () => {
  const p = await fixture(); storage.set(p.originalPdfPath, Buffer.alloc(MAX_PDF_BYTES + 1));
  assert.equal((await call(create, p)).body.error, 'pdf_too_large'); assert(!docs.has('signRequests/test-request'));
});
await test('create rejects unsafe source, invalid signer, fields, geometry and page count', async () => {
  const p = await fixture();
  for (const change of [{ originalPdfUrl: 'https://127.0.0.1/private' }, { fields: [{ ...p.fields[0], xr: .99 }] }, { pageCount: 2 }, { signers: { tenant: { name: 'Tenant', userId: 'id' } } }, { signers: { tenant: { name: '', email: 'a@example.test' } } }]) assert.equal((await call(create, { ...p, ...change })).code, 400);
  const rotated = await PDFDocument.create(); rotated.addPage().setRotation(degrees(90)); storage.set(p.originalPdfPath, Buffer.from(await rotated.save()));
  assert.equal((await call(create, p)).body.error, 'unsupported_pdf_geometry');
  const cropped = await PDFDocument.create(); cropped.addPage().setCropBox(10, 10, 400, 500); storage.set(p.originalPdfPath, Buffer.from(await cropped.save())); assert.equal((await call(create, p)).body.error, 'unsupported_pdf_geometry');
  assert.equal(docs.has('signRequests/test-request'), false);
});
await test('create cannot advertise a private/unreadable download URL', async () => {
  const p = await fixture(); omitToken = true; assert.equal((await call(create, p)).body.error, 'pdf_download_unavailable'); assert(!docs.has('signRequests/test-request'));
  omitToken = false; failPublicRead = true; assert.equal((await call(create, p)).body.error, 'pdf_download_unavailable'); assert(!docs.has('signRequests/test-request'));
});
await test('consent and valid image required; evidence time belongs to server', async () => {
  await prepared(); const base = signBody();
  assert.equal((await call(submit, { ...base, consent: null })).body.error, 'missing_consent');
  assert.equal((await call(submit, { ...base, consent: { text: 'other', hash: 'x' } })).body.error, 'invalid_consent_text');
  assert.equal((await call(submit, { ...base, consent: { text: CONSENT, hash: 'x' } })).body.error, 'invalid_consent_hash');
  assert.equal((await call(submit, { ...base, signature: 'data:image/png;base64,' + 'A'.repeat(70) })).body.error, 'bad_signature');
  assert.equal(docs.get('signRequests/test-request').signers.tenant.signedAt, null);
  const r = await call(submit, base); assert.equal(r.code, 200); assert.equal(r.body.complete, true);
  const s = docs.get('signRequests/test-request').signers.tenant; assert.equal(s.consentHash, consent.hash); assert.notEqual(s.consentAt, consent.at); assert.equal(s.consentAt, s.signedAt); assert.equal(s.documentHash, base.documentHash);
});
await test('original bytes and fields cannot change between get and submit', async () => {
  await prepared(); const base = signBody(), doc = docs.get('signRequests/test-request'); const original = storage.get(doc.originalPdfPath);
  const altered = await PDFDocument.create(); altered.addPage(); altered.addPage(); storage.set(doc.originalPdfPath, Buffer.from(await altered.save()));
  assert.equal((await call(submit, base)).body.error, 'document_changed'); assert.equal(doc.signers.tenant.signedAt, null);
  storage.set(doc.originalPdfPath, original); const changed = clone(doc); changed.fields[0].xr = .3; put('signRequests/test-request', changed);
  assert.equal((await call(submit, base)).body.error, 'document_changed'); assert.equal((await call(get, base)).body.error, 'document_changed');
  put('signRequests/test-request', doc); assert.equal((await call(submit, { ...base, documentHash: null })).body.error, 'document_changed');
});
await test('PDF failure preserves signatures; retry finalizes once without new consent or emails', async () => {
  await prepared(); const base = signBody(); failSignedUpload = true;
  const failed = await call(submit, base); assert.equal(failed.code, 200); assert.equal(failed.body.complete, false); assert.equal(failed.body.finalizationPending, true);
  const snapshot = clone(docs.get('signRequests/test-request').signers); assert.equal(docs.get('signRequests/test-request').status, 'finalization_failed'); assert.equal(emails.length, 0);
  assert.equal([...docs.values()].filter(x => x.type === 'document.finalization_failed').length, 1);
  const read = await call(get, base); assert(read.body.alreadySigned); assert(read.body.finalizationPending);
  failSignedUpload = false; const retryBody = { ...base, signature: undefined, consent: undefined, op: 'retryFinalization' };
  const retry = await call(submit, retryBody); assert.equal(retry.body.complete, true); assert.deepEqual(docs.get('signRequests/test-request').signers, snapshot); assert.equal(emails.length, 1);
  const uploadCount = writes.filter(x => x.upload?.includes('/signed/')).length;
  await call(submit, retryBody); assert.equal(writes.filter(x => x.upload?.includes('/signed/')).length, uploadCount); assert.equal(emails.length, 1);
  assert.equal([...docs.values()].filter(x => x.type === 'document.signed').length, 1);
});
await test('simultaneous signers conflict then re-read; neither signature nor complete status is lost', async () => {
  await prepared('both', ['tenant', 'landlord']); const a = signBody('both', 'tenant'), b = signBody('both', 'landlord');
  let waiting, arrivals = 0; const barrier = new Promise(resolve => { waiting = resolve; });
  hook = async changes => { if (changes[0].update.fields.signers && arrivals++ < 2) { if (arrivals === 2) waiting(); await barrier; } };
  const results = await Promise.all([call(submit, a), call(submit, b)]); hook = null;
  assert(results.every(r => r.code === 200)); assert(conflicts >= 1, 'Test actually exercised an updateTime conflict');
  const doc = docs.get('signRequests/both'); assert(doc.signers.tenant.signedAt && doc.signers.landlord.signedAt); assert.equal(doc.status, 'complete'); assert(doc.signedPdfUrl);
  assert(writes.filter(x => x.fields?.signers && x.fields.updatedAt).every(x => x.pre.updateTime)); assert.equal(writes.filter(x => x.upload?.includes('/signed/')).length, 1);
});
await test('in-flight PDF retries respect lease; expired lease can recover after a crash', async () => {
  await prepared(); failSignedUpload = true; const body = signBody(); await call(submit, body); failSignedUpload = false;
  const doc = clone(docs.get('signRequests/test-request')); doc.status = 'finalizing'; doc.finalizationLease = { id: 'crashed-worker', expiresAt: new Date(Date.now() + 60000).toISOString() }; put('signRequests/test-request', doc);
  const busy = await call(submit, body); assert.equal(busy.body.complete, false); assert.equal(writes.filter(x => x.upload?.includes('/signed/')).length, 0);
  doc.finalizationLease.expiresAt = '2000-01-01T00:00:00.000Z'; put('signRequests/test-request', doc);
  assert.equal((await call(submit, body)).body.complete, true);
});
await test('finalization re-read tolerates Firestore map order but preserves exact evidence', async () => {
  await prepared(); let changed = false;
  hook = async changes => {
    if (!changed && changes[0].update.fields.status?.stringValue === 'complete') {
      changed = true; const doc = clone(docs.get('signRequests/test-request'));
      doc.signers.tenant = Object.fromEntries(Object.entries(doc.signers.tenant).reverse()); doc.operatorNote = 'synthetic concurrent note';
      put('signRequests/test-request', doc);
    }
  };
  assert.equal((await call(submit, signBody())).body.complete, true); assert(conflicts > 0);
  assert.equal(docs.get('signRequests/test-request').operatorNote, 'synthetic concurrent note');
});
await test('terms changed during conditional write are rejected on re-read', async () => {
  await prepared(); const base = signBody(); let changed = false;
  hook = async changes => { if (!changed && changes[0].update.fields.signers) { changed = true; const doc = clone(docs.get('signRequests/test-request')); doc.title = 'Changed concurrently'; put('signRequests/test-request', doc); } };
  assert.equal((await call(submit, base)).body.error, 'document_changed'); assert.equal(docs.get('signRequests/test-request').signers.tenant.signedAt, null); assert(conflicts > 0);
});
await test('legacy unsigned migration is explicit; past signatures never acquire invented hashes', async () => {
  const p = await fixture(); const old = { ...p, status: 'sent', signers: { tenant: { ...p.signers.tenant, token: 'old-token', signedAt: null } } }; delete old.reqId;
  put('signRequests/test-request', old); const legacyToken = { req: 'test-request', role: 'tenant', token: 'old-token' };
  assert.equal((await call(get, legacyToken)).body.error, 'legacy_migration_required'); assert.equal((await call(create, p)).body.error, 'legacy_migration_required');
  const migration = await call(create, { ...p, migrateLegacy: true }); assert.equal(migration.code, 200); assert.equal(migration.body.signers.tenant.token, 'old-token');
  old.signers.tenant.signedAt = '2026-10-10T10:00:00Z'; put('signRequests/test-request', old);
  assert.equal((await call(create, { ...p, migrateLegacy: true })).body.error, 'legacy_signed_review_required'); assert.equal((await call(get, legacyToken)).body.error, 'legacy_signed_review_required');
  assert.equal((await call(submit, { ...legacyToken, signature: png, consent })).body.error, 'legacy_signed_review_required'); assert(!docs.get('signRequests/test-request').documentHash);
  old.status = 'complete'; old.signedPdfUrl = 'https://example.test/old-signed.pdf'; put('signRequests/test-request', old); const done = await call(get, legacyToken); assert.equal(done.code, 200); assert.equal(done.body.signedPdfUrl, old.signedPdfUrl); assert.equal(done.body.documentHash, null);
});
await test('past signature version mismatch prevents finalization; not silently repaired', async () => {
  await prepared('version', ['tenant', 'landlord']); await call(submit, signBody('version', 'tenant'));
  const current = clone(docs.get('signRequests/version')); current.signers.tenant.documentHash = 'different-document'; put('signRequests/version', current);
  const failed = await call(submit, signBody('version', 'landlord')); assert.equal(failed.body.error, 'signature_version_mismatch');
  assert(!docs.get('signRequests/version').signers.landlord.signedAt); assert(!docs.get('signRequests/version').signedPdfUrl);
});
await test('agent creation uses the same protocol and canonical /sign links', async () => {
  const p = await fixture('agent-request'); const r = await call(agentCreate, { ...p, pdfUrl: p.originalPdfUrl }, { 'x-homie-secret': 'test-homie' }); assert.equal(r.code, 200, JSON.stringify(r.body)); assert.match(r.body.signLinks.tenant, /^https:\/\/www.boomrome.com\/sign\?csign=agent-request/); assert(docs.get('signRequests/agent-request').documentHash);
});
await test('PDF dates come from each role evidence in Europe/Rome, not retry clock', async () => {
  const p = await fixture('dates', ['tenant', 'landlord']); const bytes = storage.get(p.originalPdfPath);
  const output = await buildSignedPdf(bytes, p.fields, { tenant: { signatureImg: png, signedAt: '2026-10-24T23:30:00Z' }, landlord: { signatureImg: png, signedAt: '2026-10-26T11:00:00Z' } });
  const pdf = await PDFDocument.load(output); const streams = pdf.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream).map(([, obj]) => { try { return Buffer.from(decodePDFRawStream(obj).decode()).toString(); } catch { return ''; } }).join('\n');
  assert(streams.includes(Buffer.from('25/10/2026').toString('hex').toUpperCase())); assert(streams.includes(Buffer.from('26/10/2026').toString('hex').toUpperCase()));
});
console.log(`Magic Sign Custom: ${passed} real-handler scenarios passed; network was entirely synthetic.`);

}
