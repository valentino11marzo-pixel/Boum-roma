// api/homie/_lib.js
// Shared helpers for the Homie webhook endpoints (inbound leads + action
// proposals). Mirrors the auth + Firestore-REST approach used by
// api/reminder-cron.js so no service account JSON is required.
//
// Env vars consumed:
//   HOMIE_SECRET          → shared secret the Mac bridge sends as
//                           X-Homie-Secret on every call. NEVER commit this.
//   FIREBASE_API_KEY      → Firebase Web API key (already used elsewhere)
//   FIREBASE_ADMIN_EMAIL  → admin user that has Firestore write access
//   FIREBASE_ADMIN_PASS   → password for the above user
//   FIREBASE_PROJECT_ID   → boom-property-dashboards

import crypto from 'node:crypto';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY    = process.env.FIREBASE_API_KEY;

export const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// In-memory token cache. Vercel keeps the function warm for a window;
// caching saves a ~400ms signIn round-trip on consecutive invocations.
let _cachedToken = null;
let _cachedAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min (real expiry is 1h)

export async function getAdminToken() {
  const now = Date.now();
  if (_cachedToken && (now - _cachedAt) < TOKEN_TTL_MS) return _cachedToken;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.FIREBASE_ADMIN_EMAIL,
        password: process.env.FIREBASE_ADMIN_PASS,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error('Firebase signIn failed: ' + JSON.stringify(data));
  _cachedToken = data.idToken;
  _cachedAt = now;
  return _cachedToken;
}

// Convert a plain JS value into the Firestore REST "Value" shape.
export function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v))  return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

// Build a Firestore REST `fields` payload from a plain JS object.
export function toFsFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = toFsValue(v);
  }
  return fields;
}

// Create a new doc in a collection — Firestore auto-IDs it. Returns { id }.
export async function fsCreate(collection, data) {
  const token = await getAdminToken();
  const res = await fetch(`${FS_BASE}/${collection}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFsFields(data) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore create failed (${res.status}): ${txt}`);
  }
  const body = await res.json();
  // body.name = "projects/.../databases/(default)/documents/<collection>/<docId>"
  const id = body.name?.split('/').pop();
  return { id, raw: body };
}

// Patch (update fields on) an existing doc by full path "collection/docId"
// or "collection/parent/sub/docId". Creates the doc if it doesn't exist.
export async function fsPatch(docPath, data) {
  const token = await getAdminToken();
  const fields = toFsFields(data);
  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `${FS_BASE}/${docPath}?${updateMask}&currentDocument.exists=false`;
  // Try create-if-missing first
  const tryCreate = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (tryCreate.ok) return await tryCreate.json();
  // Fallback: update existing
  const urlUpdate = `${FS_BASE}/${docPath}?${updateMask}`;
  const res = await fetch(urlUpdate, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore patch failed (${res.status}): ${txt}`);
  }
  return await res.json();
}

// Constant-time string comparison (avoids leaking secrets via timing).
export function secretEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

// Validate the shared secret on inbound calls. Returns true if ok; on
// failure writes a 401 and returns false (caller should just `return`).
export function requireSecret(req, res) {
  const supplied = req.headers['x-homie-secret'] || req.headers['X-Homie-Secret'];
  const expected = process.env.HOMIE_SECRET;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'server_misconfigured: HOMIE_SECRET unset' });
    return false;
  }
  if (!supplied || supplied !== expected) {
    res.status(401).json({ ok: false, error: 'invalid_secret' });
    return false;
  }
  return true;
}

// Parse JSON body whether it's already parsed (Vercel default) or a string.
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  // Stream fallback
  return await new Promise((resolve) => {
    let buf = '';
    req.on('data', chunk => buf += chunk);
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve(null); }
    });
  });
}

// ─── Reading helpers (used by the agent layer + executor) ─────────────────

// Convert a Firestore REST "Value" back to a plain JS value.
export function fsValToJs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v)      return null;
  if ('stringValue' in v)    return v.stringValue;
  if ('booleanValue' in v)   return v.booleanValue;
  if ('integerValue' in v)   return parseInt(v.integerValue, 10);
  if ('doubleValue' in v)    return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v)     return (v.arrayValue.values || []).map(fsValToJs);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = fsValToJs(val);
    return out;
  }
  return null;
}

// Convert a Firestore REST document into a plain JS object (with id).
export function fsDocToJs(doc) {
  if (!doc || !doc.name) return null;
  const id = doc.name.split('/').pop();
  const out = { id };
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fsValToJs(v);
  return out;
}

// Fetch a single doc by path "collection/docId". Returns null if missing.
export async function fsGet(docPath) {
  const token = await getAdminToken();
  const res = await fetch(`${FS_BASE}/${docPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get failed (${res.status}): ${await res.text()}`);
  return fsDocToJs(await res.json());
}

// List up to `limit` docs from a collection, optionally filtered + ordered.
// filter: { field, op: 'EQUAL'|'GREATER_THAN'|..., value }
// orderBy: { field, direction: 'ASCENDING'|'DESCENDING' }
export async function fsList(collection, { filter, orderBy, limit = 50 } = {}) {
  const token = await getAdminToken();
  const structuredQuery = { from: [{ collectionId: collection }], limit };
  if (filter) structuredQuery.where = { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: toFsValue(filter.value) } };
  if (orderBy) structuredQuery.orderBy = [{ field: { fieldPath: orderBy.field }, direction: orderBy.direction || 'DESCENDING' }];
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore list failed (${res.status}): ${await res.text()}`);
  const arr = await res.json();
  return (Array.isArray(arr) ? arr : []).filter(r => r.document).map(r => fsDocToJs(r.document));
}

// Append an entry to the activityLog collection. Every agent tool call MUST
// pass through here so the human operator can audit Homie's behaviour.
export async function logActivity(action, category, details = {}, actor = 'homie') {
  try {
    await fsCreate('activityLog', {
      action, category, details, actor,
      createdAt: new Date(),
      // The portal's activity feed + Command Center query orderBy('timestamp');
      // write it too so agent activity (Homie's doc/lead/etc. actions) surfaces.
      timestamp: new Date(),
    });
  } catch (e) {
    console.warn('[logActivity] failed:', e.message);
  }
}
