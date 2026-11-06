// tests/pa-external/fixture.mjs — Firestore, Storage e Identity Toolkit in
// memoria per la suite della console (run.mjs) e per il browser (ui.mjs).
// Va importata DOPO register('./loader.mjs') (stripe e SMTP finti).
import { PDFDocument } from 'pdf-lib';
process.env.FIREBASE_API_KEY = 'synthetic';
process.env.FIREBASE_ADMIN_EMAIL = 'service@example.test';
process.env.FIREBASE_ADMIN_PASS = 'synthetic';
process.env.FIREBASE_PROJECT_ID = 'paext-test';
process.env.HOMIE_SECRET = 'synthetic-paext';
process.env.GMAIL_USER = 'service@example.test';
process.env.GMAIL_APP_PASS = 'synthetic';
process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CAF_EMAIL;
delete process.env.ADMIN_NOTIFY_EMAIL;
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...a) => { const t = nativeTimeout(...a); t.unref?.(); return t; };

// ── Firestore + Storage + Identity Toolkit in memoria ────────────────────
export const DB = new Map(), storage = new Map(), unexpected = [];
const versions = new Map(); let seq = 0, authSeq = 0;
const version = (path) => { if (!DB.has(path)) return null; const fp = JSON.stringify(DB.get(path)); if (versions.get(path)?.fp !== fp) versions.set(path, { fp, v: new Date(1700000000000 + ++seq).toISOString() }); return versions.get(path).v; };
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });
const val = (v) => v == null ? { nullValue: null } : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { doubleValue: v } : { stringValue: String(v) };
const fields = (d) => Object.fromEntries(Object.entries(d || {}).map(([k, v]) => [k, val(v)]));
const unval = (v) => 'nullValue' in v ? null : v.mapValue ? unfields(v.mapValue.fields) : v.arrayValue ? (v.arrayValue.values || []).map(unval)
  : v.stringValue ?? v.timestampValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : v.doubleValue);
const unfields = (x) => Object.fromEntries(Object.entries(x || {}).map(([k, v]) => [k, unval(v)]));
const at = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const matches = (doc, f) => { if (!f) return true; if (f.compositeFilter) return f.compositeFilter.filters.every(x => matches(doc, x)); const ff = f.fieldFilter; if (!ff) return true;
  const x = at(doc, ff.field.fieldPath), y = unval(ff.value); return ff.op === 'EQUAL' ? x === y : ff.op === 'GREATER_THAN' ? x > y : ff.op === 'LESS_THAN' ? x < y : ff.op === 'GREATER_THAN_OR_EQUAL' ? x >= y : true; };
const docOut = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: fields(DB.get(k)), updateTime: version(k) });
export const authUsers = new Map(); let who = 'admin';
export const setWho = (x) => { who = x; };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), method = opts.method || 'GET';
  if (u.hostname === 'identitytoolkit.googleapis.com') {
    if (u.pathname.includes('accounts:lookup')) return json({ users: [{ localId: who, email: who + '@example.test' }] });
    if (u.pathname.includes('accounts:signUp')) {
      const b = JSON.parse(opts.body); if ([...authUsers.values()].includes(b.email)) return json({ error: { message: 'EMAIL_EXISTS' } }, 400);
      const id = 'auth' + (++authSeq); authUsers.set(id, b.email); return json({ localId: id });
    }
    return json({ idToken: 'svc-token', expiresIn: '3600' });
  }
  if (u.hostname === 'freetsa.org') return new Response(Buffer.alloc(256));
  // Anthropic finto: la trascrizione del PDF firmato (il lettore di
  // _pdfcheck). __aiReply = oggetto → testo JSON della risposta.
  if (u.hostname === 'api.anthropic.com') {
    globalThis.__aiCalls = (globalThis.__aiCalls || 0) + 1;
    const out = globalThis.__aiReply;
    return json({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out || {}) }], model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 900, output_tokens: 80 }, stop_reason: 'end_turn' });
  }
  if (u.hostname === 'firebasestorage.googleapis.com') {
    if (method === 'POST') { storage.set(u.searchParams.get('name'), Buffer.from(opts.body)); return json({ downloadTokens: 'tok' }); }
    const path = decodeURIComponent(u.pathname.split('/o/')[1] || '');
    return storage.has(path) ? new Response(storage.get(path)) : new Response('missing', { status: 404 });
  }
  if (u.hostname === 'firestore.googleapis.com') {
    if (u.pathname.endsWith(':commit')) {
      const writes = JSON.parse(opts.body).writes;
      for (const w of writes) {
        const path = (w.update ? w.update.name : w.delete).split('/documents/')[1], pc = w.currentDocument || {};
        if ((pc.updateTime && pc.updateTime !== version(path)) || (pc.exists === false && DB.has(path)) || (pc.exists === true && !DB.has(path))) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
      return json({ writeResults: writes.map(w => {
        if (!w.update) return {};
        const path = w.update.name.split('/documents/')[1];
        const next = { ...(DB.get(path) || {}) }, f = unfields(w.update.fields);
        const mask = w.updateMask ? w.updateMask.fieldPaths : Object.keys(f);
        for (const k of mask) { if (k in f) next[k] = f[k]; else delete next[k]; }
        for (const t of (w.updateTransforms || [])) next[t.fieldPath] = new Date().toISOString();
        DB.set(path, next); return { updateTime: version(path) };
      }) });
    }
    if (u.pathname.endsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery, col = q.from[0].collectionId;
      return json([...DB.keys()].filter(k => k.startsWith(col + '/') && k.split('/').length === 2 && matches(DB.get(k), q.where)).slice(0, q.limit || 1000).map(k => ({ document: docOut(k) })));
    }
    if (u.pathname.endsWith(':batchGet')) {
      const docs = JSON.parse(opts.body).documents.map(n => n.split('/documents/')[1]);
      return json(docs.map(k => DB.has(k) ? { found: docOut(k) } : { missing: k }));
    }
    const path = decodeURIComponent(u.pathname.split('/documents/')[1] || '');
    if (method === 'GET') return DB.has(path) ? json(docOut(path)) : json({}, 404);
    if (method === 'PATCH') {
      if (u.searchParams.get('currentDocument.exists') === 'false' && DB.has(path)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
      const f = unfields(JSON.parse(opts.body).fields); DB.set(path, { ...(DB.get(path) || {}), ...f }); return json(docOut(path));
    }
    if (method === 'POST') {
      const id = u.searchParams.get('documentId') || ('auto' + (++seq)), key = path + '/' + id;
      if (DB.has(key)) return json({}, 409);
      DB.set(key, unfields(JSON.parse(opts.body).fields)); return json(docOut(key));
    }
    if (method === 'DELETE') { DB.delete(path); return json({}); }
  }
  unexpected.push(method + ' ' + u.hostname + u.pathname);
  return json({}, 503);
};

const pdf = await PDFDocument.create(); pdf.addPage([595, 842]); pdf.addPage([595, 842]);
export const SIGNED_PDF = Buffer.from(await pdf.save());
export const res = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(x) { this.code = x; return this; }, json(x) { this.body = x; return this; }, end() { return this; } });
export const { default: signFor } = await import('../../api/preagreement/sign-for.js');
export const { default: webhook } = await import('../../api/stripe-webhook.js');
export const { journeyEligible } = await import('../../api/journey/_run.js');
export const call = async (body) => { const r = res(); await signFor({ method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'test' }, body: { id: 'pa1', ...body } }, r); return r; };

export function seed(extra = {}) {
  DB.clear(); storage.clear(); unexpected.length = 0; authUsers.clear(); who = 'admin';
  globalThis.deliveryMails = []; globalThis.deliveryMailAttempts = []; globalThis.deliverySmtp = null;
  globalThis.__aiReply = null; globalThis.__aiCalls = 0; delete process.env.ANTHROPIC_API_KEY;
  DB.set('users/admin', { role: 'admin', email: 'admin@example.test', name: 'Operatore' });
  DB.set('users/someTenant', { role: 'tenant', email: 'other@example.test', name: 'Altro' });
  DB.set('preAgreements/pa1', {
    status: 'paid', paidAt: '2026-10-20T10:00:00Z', paidEur: 1000, token: 'a'.repeat(32), ref: 'BOOM-TEST1',
    createdAt: '2026-10-10T10:00:00Z', acceptedAt: '2026-10-19T10:00:00Z',
    tenant: { fullName: 'Anna Rossi', email: 'anna@example.test', phone: '+39 333 1112222', cf: 'RSSNNA90A41H501X', nationality: 'Italiana' },
    tenants: [
      { fullName: 'Anna Rossi', email: 'anna@example.test', phone: '+39 333 1112222', cf: 'RSSNNA90A41H501X', nationality: 'Italiana' },
      { fullName: 'Luca Bianchi', email: 'luca@example.test', phone: '+39 333 3334444', cf: 'BNCLCU90A01H501Y', nationality: 'Italiana' },
    ],
    landlord: { name: 'Maria Verdi', email: 'maria@example.test', phone: '+39 347 0001111' },
    property: { address: 'Via Sintetica 1, Roma' },
    lease: { startDate: '2026-12-01', months: 12, endDate: '2027-11-30', type: 'transitorio', reason: 'lavoro' },
    money: { rent: 1000, deposit: 2000, depositMonths: 2, depositAtSigning: 1000, depositAtMoveIn: 1000, dueAtSigning: 1000,
      feeMode: 'pct', feePct: 10, fee: 1200, feeVatPct: 22, feeVat: 264, feeTotal: 1464, feeDue: 'move-in', installmentMonths: 1 },
    uploads: [],
    ...extra,
  });
}
