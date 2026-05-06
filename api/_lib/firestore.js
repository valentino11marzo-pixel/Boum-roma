// api/_lib/firestore.js
// Firestore REST helper using Identity Toolkit email/password auth.
// Mirrors the pattern in api/reminder-cron.js but factored so concierge.js,
// concierge-event.js, and recent-signed.js can share it without duplication.
//
// The idToken is cached in module scope; warm Fluid Compute invocations reuse
// it. On 401 the token is refreshed once and the request is retried.

const PROJECT_ID  = process.env.FIREBASE_PROJECT_ID;
const API_KEY     = process.env.FIREBASE_API_KEY;
const ADMIN_EMAIL = process.env.FIREBASE_ADMIN_EMAIL;
const ADMIN_PASS  = process.env.FIREBASE_ADMIN_PASS;

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let _token = null;
let _tokenExp = 0;

export async function getToken({ force = false } = {}) {
  const now = Date.now();
  if (!force && _token && now < _tokenExp - 60_000) return _token;
  if (!API_KEY || !ADMIN_EMAIL || !ADMIN_PASS) {
    throw new Error('Firestore credentials missing (FIREBASE_API_KEY / FIREBASE_ADMIN_EMAIL / FIREBASE_ADMIN_PASS)');
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error('Firebase auth failed: ' + JSON.stringify(data).slice(0, 200));
  _token = data.idToken;
  _tokenExp = now + (parseInt(data.expiresIn || '3600', 10) * 1000);
  return _token;
}

// ─── Value coercion ──────────────────────────────────────────────────────

export function fsVal(v) {
  if (v == null) return null;
  if (v.nullValue      !== undefined) return null;
  if (v.stringValue    !== undefined) return v.stringValue;
  if (v.booleanValue   !== undefined) return v.booleanValue;
  if (v.integerValue   !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue    !== undefined) return v.doubleValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue     !== undefined) return (v.arrayValue.values || []).map(fsVal);
  if (v.mapValue       !== undefined) {
    const out = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) out[k] = fsVal(vv);
    return out;
  }
  return null;
}

export function parseDoc(doc) {
  if (!doc?.fields) return null;
  const out = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) out[k] = fsVal(v);
  if (doc.createTime) out._createTime = doc.createTime;
  if (doc.updateTime) out._updateTime = doc.updateTime;
  return out;
}

export function toFirestoreFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = _toFsValue(v);
  return out;
}

function _toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date)      return { timestampValue: v.toISOString() };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(_toFsValue) } };
  if (typeof v === 'object')  return { mapValue: { fields: toFirestoreFields(v) } };
  return { nullValue: null };
}

// ─── Filter builders ─────────────────────────────────────────────────────

export const filter = {
  eq:  (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL',                 value: _toFsValue(v) } }),
  neq: (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'NOT_EQUAL',             value: _toFsValue(v) } }),
  lt:  (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'LESS_THAN',             value: _toFsValue(v) } }),
  lte: (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'LESS_THAN_OR_EQUAL',    value: _toFsValue(v) } }),
  gt:  (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'GREATER_THAN',          value: _toFsValue(v) } }),
  gte: (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'GREATER_THAN_OR_EQUAL', value: _toFsValue(v) } }),
  and: (...fs) => ({ compositeFilter: { op: 'AND', filters: fs.filter(Boolean) } }),
  or:  (...fs) => ({ compositeFilter: { op: 'OR',  filters: fs.filter(Boolean) } }),
};

// ─── Authenticated fetch with one retry on 401 ───────────────────────────

async function _send(url, init) {
  let token = await getToken();
  let res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 401) {
    token = await getToken({ force: true });
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }
  return res;
}

// ─── Public ops ──────────────────────────────────────────────────────────

export async function runQuery({ collection, where, orderBy, limit, select }) {
  const sq = { from: [{ collectionId: collection }] };
  if (where)   sq.where   = where;
  if (orderBy) sq.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
  if (limit)   sq.limit   = limit;
  if (select)  sq.select  = { fields: select.map(f => ({ fieldPath: f })) };
  const res = await _send(`${FS_BASE}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: sq }),
  });
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Firestore runQuery failed: ' + JSON.stringify(data).slice(0, 300));
  }
  return data.filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
}

export async function readDoc(path) {
  const res = await _send(`${FS_BASE}/${path}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read ${path}: ${res.status}`);
  const data = await res.json();
  return parseDoc(data);
}

export async function addDoc(collection, fields) {
  const res = await _send(`${FS_BASE}/${collection}`, {
    method: 'POST',
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firestore add ${collection}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return parseDoc(data);
}

// PATCH with updateMask covering only the provided fields. Creates the doc if
// it does not exist (Firestore default for PATCH without precondition).
// Use for upsert by known doc id.
export async function setDoc(path, fields) {
  const fsFields = toFirestoreFields(fields);
  const masks = Object.keys(fsFields)
    .map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const res = await _send(`${FS_BASE}/${path}?${masks}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: fsFields }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firestore set ${path}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return parseDoc(data);
}

export const patchDoc = setDoc;
