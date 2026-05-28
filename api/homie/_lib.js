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
