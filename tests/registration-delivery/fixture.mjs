import { PDFDocument } from 'pdf-lib';
process.env.FIREBASE_API_KEY = 'synthetic';
process.env.FIREBASE_ADMIN_EMAIL = 'service@example.test';
process.env.FIREBASE_ADMIN_PASS = 'synthetic';
process.env.FIREBASE_PROJECT_ID = 'delivery-test';
process.env.HOMIE_SECRET = 'synthetic-delivery';
process.env.CRON_SECRET = 'synthetic-cron';
process.env.GMAIL_USER = 'service@example.test';
process.env.GMAIL_APP_PASS = 'synthetic';
delete process.env.CAF_EMAIL;
delete process.env.ADMIN_NOTIFY_EMAIL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
const NativeDate = Date;
globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-15T13:30:00.000Z'])); } static now() { return new NativeDate('2026-10-15T13:30:00.000Z').getTime(); } };
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { const t = nativeTimeout(...args); t.unref?.(); return t; };
export const DB = new Map(), storage = new Map(), unexpected = [];
const versions = new Map(); let sequence = 0;
function version(path) {
  if (!DB.has(path)) return null;
  const fingerprint = JSON.stringify(DB.get(path));
  if (versions.get(path)?.fingerprint !== fingerprint) versions.set(path, { fingerprint, value: new NativeDate(1700000000000 + ++sequence).toISOString() });
  return versions.get(path).value;
}
const touch = path => { versions.delete(path); return version(path); };
export const hooks = { beforeCommit: async () => {}, fail: () => false };
export const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });
export function fields(data) { return Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, val(v)])); }
function val(v) {
  if (v == null) return { nullValue: null };
  if (v instanceof NativeDate) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { doubleValue: v };
  return { stringValue: String(v) };
}
function unval(v) {
  if ('nullValue' in v) return null;
  if (v.mapValue) return unfields(v.mapValue.fields);
  if (v.arrayValue) return (v.arrayValue.values || []).map(unval);
  return v.stringValue ?? v.timestampValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : v.doubleValue);
}
export const unfields = x => Object.fromEntries(Object.entries(x || {}).map(([k, v]) => [k, unval(v)]));
const at = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function matches(doc, filter) {
  if (!filter) return true;
  if (filter.compositeFilter) return filter.compositeFilter.filters.every(f => matches(doc, f));
  const f = filter.fieldFilter; if (!f) return true;
  const x = at(doc, f.field.fieldPath), y = unval(f.value);
  return f.op === 'EQUAL' ? x === y : f.op === 'LESS_THAN' ? x < y : f.op === 'LESS_THAN_OR_EQUAL' ? x <= y : f.op === 'GREATER_THAN' ? x > y : false;
}
const pdf = await PDFDocument.create(); pdf.addPage([595, 842]);
export const PDF = Buffer.from(await pdf.save());
const base = async (url, opts = {}) => {
  const u = new URL(String(url)), method = opts.method || 'GET';
  if (u.hostname === 'identitytoolkit.googleapis.com') return json({ idToken: 'test-token', users: [{ localId: 'admin', email: 'admin@example.test' }] });
  if (u.hostname === 'freetsa.org') return new Response(Buffer.alloc(256));
  if (u.hostname === 'storage.example') return new Response(PDF);
  if (u.hostname === 'firebasestorage.googleapis.com') {
    if (method === 'POST') { const path = u.searchParams.get('name'); storage.set(path, Buffer.from(opts.body)); return json({ downloadTokens: 'synthetic' }); }
    const path = decodeURIComponent(u.pathname.split('/o/')[1] || '');
    return storage.has(path) ? new Response(storage.get(path)) : new Response('missing', { status: 404 });
  }
  if (u.hostname === 'firestore.googleapis.com') {
    if (u.pathname.endsWith(':commit')) {
      const writes = JSON.parse(opts.body).writes;
      await hooks.beforeCommit(writes);
      if (hooks.fail(writes)) return json({ error: { status: 'UNAVAILABLE' } }, 503);
      for (const w of writes) {
        const path = w.update.name.split('/documents/')[1], pc = w.currentDocument;
        if (!pc || !w.updateMask) throw Error('Conditional masked write required');
        if (pc.updateTime && pc.updateTime !== version(path) || pc.exists === false && DB.has(path) || pc.exists === true && !DB.has(path)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
      const writeResults = writes.map(w => {
        const path = w.update.name.split('/documents/')[1];
        DB.set(path, { ...DB.get(path), ...unfields(w.update.fields) });
        return { updateTime: touch(path) };
      });
      return json({ writeResults });
    }
    if (u.pathname.endsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery, col = q.from[0].collectionId;
      return json([...DB].filter(([k, d]) => k.startsWith(col + '/') && k.split('/').length === 2 && matches(d, q.where))
        .slice(0, q.limit || 1000).map(([k, d]) => ({ document: { name: 'projects/p/databases/(default)/documents/' + k, fields: fields(d) } })));
    }
    const path = decodeURIComponent(u.pathname.split('/documents/')[1] || '');
    // Fields AND version are captured together, as in a real Firestore read.
    if (method === 'GET') return DB.has(path) ? json({ name: 'projects/p/databases/(default)/documents/' + path, fields: fields(DB.get(path)), updateTime: version(path) }) : json({}, 404);
    if (method === 'PATCH') { DB.set(path, { ...DB.get(path), ...unfields(JSON.parse(opts.body).fields) }); return json({}); }
    if (method === 'POST') {
      const id = u.searchParams.get('documentId') || 'auto-' + DB.size, key = path + '/' + id;
      if (DB.has(key)) return json({}, 409);
      DB.set(key, unfields(JSON.parse(opts.body).fields)); return json({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (method === 'DELETE') { DB.delete(path); return json({}); }
  }
  unexpected.push(u.hostname + u.pathname); throw Error('Unexpected IO: ' + u.hostname + u.pathname);
};
globalThis.fetch = base;
export const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export const contract = () => ({ id: 'c1', propertyId: 'p1', tenantId: 't1', type: 'transitorio', rent: 1000, deposit: 2000, depositPaid: true,
  startDate: '2026-11-01', endDate: '2027-10-31', cedolareSecca: 'si', signatureStatus: 'complete', status: 'active',
  tenantName: 'Synthetic Tenant', landlordName: 'Synthetic Owner', tenantEmail: 'tenant@example.test', landlordEmail: 'owner@example.test',
  tenantSignature: SIG, landlordSignature: SIG, tenantSignedAt: '2026-10-15T12:00:00Z', landlordSignedAt: '2026-10-15T12:01:00Z',
  fullySignedAt: '2026-10-15T12:01:00Z', generatedPDF: 'https://storage.example/source.pdf',
  coTenants: [{ userId: 'co1', name: 'Synthetic Co', email: 'co@example.test', signature: SIG, signedAt: '2026-10-15T12:00:00Z' }] });
export function reset(extra = {}) {
  DB.clear(); storage.clear(); unexpected.length = 0;
  hooks.beforeCommit = async () => {}; hooks.fail = () => false;
  globalThis.deliveryMails = []; globalThis.deliveryMailAttempts = []; globalThis.deliverySmtp = null;
  DB.set('users/admin', { role: 'admin' });
  DB.set('users/t1', { role: 'tenant', email: 'tenant@example.test', name: 'Synthetic Tenant' });
  DB.set('users/co1', { role: 'tenant', email: 'co@example.test', name: 'Synthetic Co' });
  DB.set('users/owner', { role: 'landlord', email: 'owner@example.test', name: 'Synthetic Owner' });
  DB.set('properties/p1', { ownerId: 'owner', address: 'Synthetic address', sqm: 70 });
  DB.set('contracts/c1', { ...contract(), ...extra });
  DB.set('settings/registrazione', { auto: false });
}
export const res = () => ({ code: 0, body: null, setHeader() {}, status(x) { this.code = x; return this; }, json(x) { this.body = x; return this; }, end() {} });
export async function drive(body) {
  const handler = (await import('../../api/fiscal/registra.js')).default, r = res();
  await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: { op: 'registered', contractId: 'c1', date: '2026-10-14', ...body } }, r);
  return r;
}
export async function cron() {
  const handler = (await import('../../api/reminder-cron.js')).default, r = res();
  await handler({ method: 'GET', headers: { authorization: 'Bearer synthetic-cron' } }, r); return r;
}
export const upload = () => ({ base64: PDF.toString('base64'), contentType: 'application/pdf', name: 'receipt.pdf' });
export const current = () => structuredClone(DB.get('contracts/c1'));
export const writesData = ws => ws.map(w => unfields(w.update?.fields));
export function twoClaims(predicate) {
  let seen = 0, release;
  const gate = new Promise(r => { release = r; });
  return async ws => { if (seen < 2 && writesData(ws).some(predicate)) { seen++; if (seen === 2) release(); await gate; } };
}
