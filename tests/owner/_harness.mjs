// tests/owner/_harness.mjs — la rete finta per i test di /api/owner/*.
//
// Consumato in SOLA LETTURA dai pacchetti B (archivio, file), C (invito) e
// D (pagina). Nessun framework, nessun emulatore: si guida l'HANDLER VERO e
// si finge SOLO la rete (globalThis.fetch). Qualunque chiamata non prevista
// viene REGISTRATA e poi fa fallire la richiesta con un'eccezione: un test
// che «passa» dopo aver contattato un host sconosciuto è un test cieco.
//
// ── API ────────────────────────────────────────────────────────────────
//   import { createHarness, ADMIN_TOKEN } from './_harness.mjs';
//   const h = createHarness({ seed, files, authEmails, env, mediaBearer, now });
//     seed        { 'collection/docId': data }      documenti Firestore iniziali
//     files       { 'bucket/path' | 'path': { bytes|size, contentType, token } }
//                 (senza bucket si usa DEFAULT_BUCKET) — oggetti Storage
//     authEmails  [email] account Firebase Auth già esistenti (signUp → EMAIL_EXISTS,
//                 createAuthUri → registered:true)
//     env         variabili d'ambiente da impostare (si aggiungono ai default qui sotto)
//     mediaBearer true (default) = ?alt=media col Bearer ADMIN_TOKEN funziona;
//                 false = risponde 403 (per provare il ripiego sull'URL tokenizzato)
//     now         () => ISO: l'orologio di updateTime (default: contatore monotono)
//
//   h.DB           Map 'collection/docId' → oggetto JS (leggibile e scrivibile dal test)
//   h.VERSIONS     Map 'collection/docId' → updateTime corrente
//   h.FILES        Map 'bucket/path' → { bytes: Buffer, size, contentType, token }
//   h.fetchLog     [{ url, method, auth, host, kind }] ogni chiamata, nell'ordine
//   h.authEmails   Set di email (minuscole) con un account Auth
//   h.signUps      [{ email, localId }] ogni accounts:signUp riuscito
//   h.unexpected   [url] le chiamate non previste (la richiesta ha lanciato)
//   h.install()    installa lo stub su globalThis.fetch e i default d'ambiente;
//                  restituisce uninstall(). Chiamarlo PRIMA di importare l'handler.
//   h.putFile(path, { bytes, size, contentType, token, bucket })
//   h.snapshot()   copia profonda di DB (per il confronto «non ha scritto nulla»)
//   h.diff(snap)   [{ path, kind:'created'|'changed'|'deleted' }] rispetto a snapshot()
//   h.req({ method='GET', uid, token, headers, query, body })
//                  → req alla Vercel: Authorization `Bearer <uid|token>`; body oggetto
//   h.res()        → res finto: status/json/send/end/setHeader/getHeader;
//                  poi .statusCode .headers (minuscole) .body (oggetto JSON o Buffer/stringa)
//                  .ended .json() è già parsato in .body; .text() → stringa del corpo
//   h.call(handler, reqOpts) → await handler(req, res) e restituisce res
//
// ── Cosa finge ─────────────────────────────────────────────────────────
//   identitytoolkit accounts:signInWithPassword → { idToken: ADMIN_TOKEN }
//   identitytoolkit accounts:lookup   → il BEARER È L'UID: users/<uid> deve esistere,
//                                        altrimenti 400 INVALID_ID_TOKEN (→ 401 da requireRole)
//   identitytoolkit accounts:signUp   → EMAIL_EXISTS (400) se l'email è in authEmails,
//                                        altrimenti { localId: 'uid_new_<n>' } e l'email entra
//   identitytoolkit accounts:createAuthUri → { registered: bool, allProviders }
//   Firestore  GET doc (404 se manca) · PATCH (updateMask, currentDocument.exists/
//              updateTime: 409 ALREADY_EXISTS / 404 NOT_FOUND / 412 FAILED_PRECONDITION)
//              · POST create (?documentId= → 409 se esiste; senza → id automatico)
//              · DELETE · :runQuery (fieldFilter EQUAL e IN, orderBy __name__ o campo,
//              startAt __name__, limit) · :commit (update+updateMask, delete, transforms
//              serverTimestamp; precondizioni exists/updateTime verificate PRIMA di
//              scrivere: una fallita = nessuna scrittura, 409 o 412 come Firestore)
//   Storage    POST upload (?uploadType=media&name=) col Bearer ADMIN_TOKEN (403 senza)
//              · GET metadati /v0/b/<b>/o/<path> col Bearer ADMIN_TOKEN (403 senza, 404 se manca)
//              · GET ?alt=media: col Bearer ADMIN_TOKEN (se mediaBearer) oppure con
//              ?token=<token del file>; altrimenti 403
//   Qualsiasi altro host o rotta → registrato in fetchLog/unexpected, poi throw.
//
// I percorsi Firestore si leggono su '(default)/documents' (la collection si chiama
// `documents`: uno split ingenuo su '/documents/' la romperebbe).

export const ADMIN_TOKEN = 'ADMIN_TOKEN';
export const DEFAULT_BUCKET = 'boom-property-dashboards.firebasestorage.app';
export const DEFAULT_ENV = {
  FIREBASE_API_KEY: 'k',
  FIREBASE_ADMIN_EMAIL: 'admin@boom.test',
  FIREBASE_ADMIN_PASS: 'p',
  FIREBASE_PROJECT_ID: 'boom-property-dashboards',
  FIREBASE_STORAGE_BUCKET: DEFAULT_BUCKET,
  HOMIE_SECRET: 'test-homie-secret',
};

// ── Firestore REST ⇄ JS ─────────────────────────────────────────────────
export function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
export function toFields(o) { const f = {}; for (const [k, v] of Object.entries(o || {})) if (v !== undefined) f[k] = toFs(v); return f; }
export function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) return fromFields((v.mapValue || {}).fields);
  return null;
}
export function fromFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; }

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const fsErr = (status, code, message) => json({ error: { code: status, status: code, message: message || code } }, status);

export function createHarness(opts = {}) {
  const DB = new Map(), VERSIONS = new Map(), FILES = new Map();
  const fetchLog = [], unexpected = [], signUps = [];
  const authEmails = new Set((opts.authEmails || []).map((e) => String(e).toLowerCase()));
  const env = { ...DEFAULT_ENV, ...(opts.env || {}) };
  const mediaBearer = opts.mediaBearer !== false;
  let tick = 0, autoId = 0, uidSeq = 0;
  const clock = typeof opts.now === 'function' ? opts.now
    : () => new Date(Date.UTC(2026, 8, 22, 8, 0, 0) + (tick++) * 1000).toISOString();

  const stamp = (path) => { const t = clock(); VERSIONS.set(path, t); return t; };
  for (const [k, v] of Object.entries(opts.seed || {})) { DB.set(k, clone(v)); stamp(k); }

  function putFile(path, f = {}) {
    const bucket = f.bucket || DEFAULT_BUCKET;
    const bytes = f.bytes == null ? null : Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(f.bytes);
    FILES.set(bucket + '/' + path, { bytes, size: f.size != null ? f.size : bytes ? bytes.length : 0,
      contentType: f.contentType || 'application/pdf', token: f.token || 'dltok' });
  }
  for (const [k, f] of Object.entries(opts.files || {})) {
    const hasBucket = /^[^/]+\.(?:appspot\.com|firebasestorage\.app)\//.test(k);
    const bucket = hasBucket ? k.slice(0, k.indexOf('/')) : (f.bucket || DEFAULT_BUCKET);
    putFile(hasBucket ? k.slice(k.indexOf('/') + 1) : k, { ...f, bucket });
  }

  const docName = (path) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const docJson = (path) => ({ name: docName(path), fields: toFields(DB.get(path)), createTime: VERSIONS.get(path), updateTime: VERSIONS.get(path) });

  function precondition(path, cd) {
    if (!cd) return null;
    const exists = DB.has(path);
    if (cd.exists === false && exists) return fsErr(409, 'ALREADY_EXISTS', 'Document already exists: ' + path);
    if (cd.exists === true && !exists) return fsErr(404, 'NOT_FOUND', 'No document to update: ' + path);
    if (cd.updateTime && (!exists || VERSIONS.get(path) !== cd.updateTime)) return fsErr(412, 'FAILED_PRECONDITION', 'updateTime mismatch: ' + path);
    return null;
  }
  function applyUpdate(path, fields, mask) {
    const data = fromFields(fields);
    if (mask && mask.length) {
      const cur = clone(DB.get(path)) || {};
      for (const k of mask) { if (k in data) cur[k] = data[k]; else delete cur[k]; }
      DB.set(path, cur);
    } else DB.set(path, data);
    stamp(path);
  }

  function matches(doc, ff) {
    if (!ff) return true;
    const field = ff.field.fieldPath, val = fromFs(ff.value);
    const cur = field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    if (ff.op === 'EQUAL') return cur === val;
    if (ff.op === 'IN') return Array.isArray(val) && val.includes(cur);
    if (ff.op === 'ARRAY_CONTAINS') return Array.isArray(cur) && cur.includes(val);
    throw new Error('harness: operatore non previsto ' + ff.op);
  }
  function runQuery(sq) {
    const col = ((sq.from || [])[0] || {}).collectionId || '';
    const where = sq.where || null;
    if (where && !where.fieldFilter) throw new Error('harness: solo fieldFilter è supportato');
    let rows = [...DB.keys()].filter((k) => k.startsWith(col + '/') && k.split('/').length === 2)
      .filter((k) => matches(DB.get(k), where && where.fieldFilter));
    const ob = (sq.orderBy || [])[0];
    if (ob && ob.field.fieldPath !== '__name__') {
      const f = ob.field.fieldPath, dir = ob.direction === 'ASCENDING' ? 1 : -1;
      rows = rows.filter((k) => DB.get(k)[f] !== undefined)
        .sort((a, b) => (String(DB.get(a)[f]) < String(DB.get(b)[f]) ? -dir : String(DB.get(a)[f]) > String(DB.get(b)[f]) ? dir : 0));
    } else rows.sort();
    if (sq.startAt && sq.startAt.values && sq.startAt.values[0] && sq.startAt.values[0].referenceValue) {
      const after = sq.startAt.values[0].referenceValue.split('/documents/').pop();
      rows = rows.filter((k) => (sq.startAt.before ? k >= after : k > after));
    }
    if (sq.limit != null) rows = rows.slice(0, Number(sq.limit));
    if (!rows.length) return [{ readTime: clock() }];
    return rows.map((k) => ({ document: docJson(k), readTime: clock() }));
  }

  function commit(body) {
    const writes = body.writes || [];
    const plan = [];
    for (const w of writes) {
      const full = w.update ? w.update.name : w.delete;
      const path = String(full).split('(default)/documents/').pop();
      const bad = precondition(path, w.currentDocument);
      if (bad) return bad;
      plan.push({ w, path });
    }
    for (const { w, path } of plan) {
      if (w.delete) { DB.delete(path); VERSIONS.delete(path); continue; }
      const mask = w.updateMask ? w.updateMask.fieldPaths : null;
      applyUpdate(path, w.update.fields, mask);
      for (const tr of w.updateTransforms || []) {
        if (tr.setToServerValue === 'REQUEST_TIME') { const cur = DB.get(path); cur[tr.fieldPath] = clock(); DB.set(path, cur); }
        else throw new Error('harness: transform non prevista');
      }
    }
    return json({ writeResults: plan.map(() => ({ updateTime: clock() })), commitTime: clock() });
  }

  function storage(u, method, auth, opts2) {
    const m = /^\/v0\/b\/([^/]+)\/o(?:\/([^/]+))?$/.exec(u.pathname);
    if (!m) return null;
    const bucket = decodeURIComponent(m[1]);
    const admin = auth === 'Bearer ' + ADMIN_TOKEN;
    if (method === 'POST' && !m[2]) {
      if (!admin) return fsErr(403, 'PERMISSION_DENIED');
      const name = u.searchParams.get('name');
      const bytes = opts2.body == null ? Buffer.alloc(0) : Buffer.from(opts2.body);
      const contentType = (opts2.headers || {})['Content-Type'] || (opts2.headers || {})['content-type'] || 'application/octet-stream';
      putFile(name, { bytes, contentType, bucket, token: 'dltok' });
      return json({ name, bucket, size: String(bytes.length), contentType, downloadTokens: 'dltok' });
    }
    if (method === 'GET' && m[2]) {
      const path = decodeURIComponent(m[2]);
      const f = FILES.get(bucket + '/' + path);
      const media = u.searchParams.get('alt') === 'media';
      const tokenOk = f && u.searchParams.get('token') && u.searchParams.get('token') === f.token;
      if (!media) {
        if (!admin) return fsErr(403, 'PERMISSION_DENIED');
        if (!f) return fsErr(404, 'NOT_FOUND');
        return json({ name: path, bucket, size: String(f.size), contentType: f.contentType, downloadTokens: f.token });
      }
      if (!((admin && mediaBearer) || tokenOk)) return fsErr(403, 'PERMISSION_DENIED');
      if (!f) return fsErr(404, 'NOT_FOUND');
      const bytes = f.bytes || Buffer.alloc(f.size);
      return new Response(bytes, { status: 200, headers: { 'Content-Type': f.contentType, 'Content-Length': String(bytes.length) } });
    }
    return null;
  }

  async function stub(url, o = {}) {
    const s = String(url), method = String(o.method || 'GET').toUpperCase();
    const headers = o.headers || {};
    const auth = headers.Authorization || headers.authorization || (typeof headers.get === 'function' ? headers.get('authorization') : '') || '';
    let u; try { u = new URL(s); } catch (_) { u = null; }
    const entry = { url: s, method, auth, host: u ? u.host : '', kind: 'unexpected' };
    fetchLog.push(entry);
    const body = typeof o.body === 'string' ? (() => { try { return JSON.parse(o.body); } catch (_) { return {}; } })() : {};

    if (u && u.host === 'identitytoolkit.googleapis.com') {
      entry.kind = 'auth';
      if (s.includes('accounts:signInWithPassword')) return json({ idToken: ADMIN_TOKEN, localId: 'admin_srv' });
      if (s.includes('accounts:lookup')) {
        const uid = body.idToken;
        if (!uid || !DB.has('users/' + uid)) return fsErr(400, 'INVALID_ID_TOKEN');
        return json({ users: [{ localId: uid, email: (DB.get('users/' + uid) || {}).email || '' }] });
      }
      if (s.includes('accounts:signUp')) {
        const email = String(body.email || '').toLowerCase();
        if (!email) return fsErr(400, 'MISSING_EMAIL');
        if (authEmails.has(email)) return json({ error: { code: 400, message: 'EMAIL_EXISTS' } }, 400);
        authEmails.add(email);
        const localId = 'uid_new_' + (++uidSeq);
        signUps.push({ email, localId });
        return json({ kind: 'identitytoolkit#SignupNewUserResponse', localId, email });
      }
      if (s.includes('accounts:createAuthUri')) {
        const email = String(body.identifier || '').toLowerCase();
        const registered = authEmails.has(email);
        return json({ kind: 'identitytoolkit#CreateAuthUriResponse', registered, allProviders: registered ? ['password'] : [], sessionId: 's' });
      }
    }
    if (u && u.host === 'firestore.googleapis.com') {
      entry.kind = 'firestore';
      const after = (s.split('(default)/documents')[1] || '');
      const qs = u.searchParams;
      if (after.startsWith(':runQuery')) return json(runQuery(body.structuredQuery || {}));
      if (after.startsWith(':commit')) return commit(body);
      const path = decodeURIComponent(after.replace(/^\//, '').split('?')[0]);
      const segs = path.split('/').filter(Boolean);
      if (method === 'GET' && segs.length % 2 === 0) {
        if (!DB.has(path)) return fsErr(404, 'NOT_FOUND');
        return json(docJson(path));
      }
      if (method === 'POST' && segs.length % 2 === 1) {
        const id = qs.get('documentId') || ('auto_' + (++autoId));
        const full = path + '/' + id;
        if (DB.has(full)) return fsErr(409, 'ALREADY_EXISTS', 'Document already exists: ' + full);
        applyUpdate(full, body.fields || {}, null);
        return json(docJson(full));
      }
      if (method === 'PATCH' && segs.length % 2 === 0) {
        const cd = {};
        if (qs.has('currentDocument.exists')) cd.exists = qs.get('currentDocument.exists') === 'true';
        if (qs.has('currentDocument.updateTime')) cd.updateTime = qs.get('currentDocument.updateTime');
        const bad = precondition(path, Object.keys(cd).length ? cd : null);
        if (bad) return bad;
        const mask = qs.getAll('updateMask.fieldPaths');
        applyUpdate(path, body.fields || {}, mask.length ? mask : null);
        return json(docJson(path));
      }
      if (method === 'DELETE' && segs.length % 2 === 0) { DB.delete(path); VERSIONS.delete(path); return json({}); }
    }
    if (u && u.host === 'firebasestorage.googleapis.com') {
      entry.kind = 'storage';
      const r = storage(u, method, auth, o);
      if (r) return r;
    }
    entry.kind = 'unexpected';
    unexpected.push(s);
    throw new Error('harness: fetch non previsto ' + method + ' ' + s);
  }

  let prevFetch = null;
  function install() {
    for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined || (opts.env && k in opts.env)) process.env[k] = v;
    prevFetch = globalThis.fetch;
    globalThis.fetch = stub;
    return () => { globalThis.fetch = prevFetch; };
  }

  function snapshot() { const o = {}; for (const [k, v] of DB) o[k] = clone(v); return o; }
  function diff(snap) {
    const out = [];
    for (const [k, v] of DB) {
      if (!(k in snap)) out.push({ path: k, kind: 'created' });
      else if (JSON.stringify(snap[k]) !== JSON.stringify(v)) out.push({ path: k, kind: 'changed' });
    }
    for (const k of Object.keys(snap)) if (!DB.has(k)) out.push({ path: k, kind: 'deleted' });
    return out;
  }

  function req({ method = 'GET', uid, token, headers = {}, query = {}, body } = {}) {
    const h = {};
    for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
    const bearer = token || uid;
    if (bearer && !h.authorization) h.authorization = 'Bearer ' + bearer;
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    const qs = new URLSearchParams(query).toString();
    return { method, headers: h, query: { ...query }, body, url: '/' + (qs ? '?' + qs : ''), on() {} };
  }
  function res() {
    const r = { statusCode: 200, headers: {}, body: undefined, ended: false };
    r.status = (c) => { r.statusCode = c; return r; };
    r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
    r.getHeader = (k) => r.headers[String(k).toLowerCase()];
    r.json = (b) => { r.body = b; r.ended = true; if (!r.headers['content-type']) r.headers['content-type'] = 'application/json'; return r; };
    r.send = (b) => { r.body = b; r.ended = true; return r; };
    r.end = (b) => { if (b !== undefined) r.body = b; r.ended = true; return r; };
    r.text = () => (Buffer.isBuffer(r.body) ? r.body.toString('utf8') : typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
    return r;
  }
  async function call(handler, reqOpts) { const rq = req(reqOpts), rs = res(); await handler(rq, rs); return rs; }

  return { DB, VERSIONS, FILES, fetchLog, unexpected, authEmails, signUps, env, install, putFile, snapshot, diff, req, res, call };
}
