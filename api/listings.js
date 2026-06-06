// api/listings.js
// Resilient read endpoint for the public `listings` catalog.
//
// Why this exists: every public page (apartments, /listing/:id, neighborhood
// hubs) reads `listings` from Firestore DIRECTLY in the browser with no auth.
// That works only while the security rules allow public reads. If those rules
// are tightened (as happened when the portal security refactor made listings
// admin-only), every listing page dies with PERMISSION_DENIED.
//
// This endpoint is the safety net. It reads server-side and tries the most
// permissive path that works:
//   1. unauthenticated REST read (fast — succeeds when rules are public)
//   2. admin-authenticated read (same creds the cron uses — succeeds when
//      rules are locked to admins)
// Edge-cached so a broken-rules state never hammers Firestore.
//
// GET /api/listings        → { ok, count, listings:[{id, ...fields}] }
// GET /api/listings?id=xyz → { ok, listing:{id, ...fields} | null }

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Firestore REST value → plain JS value.
function fv(v) {
  if (v == null) return undefined;
  const k = Object.keys(v)[0];
  const x = v[k];
  switch (k) {
    case 'integerValue':
    case 'doubleValue': return Number(x);
    case 'booleanValue': return x;
    case 'nullValue': return null;
    case 'arrayValue': return ((x && x.values) || []).map(fv);
    case 'mapValue': {
      const o = {}; const f = (x && x.fields) || {};
      for (const kk in f) o[kk] = fv(f[kk]);
      return o;
    }
    default: return x; // stringValue, timestampValue, referenceValue, …
  }
}

function parseDoc(doc) {
  if (!doc || !doc.name) return null;
  const out = { id: doc.name.split('/').pop() };
  const f = doc.fields || {};
  for (const k in f) out[k] = fv(f[k]);
  return out;
}

// Sign in as the admin user (email/password) to obtain an ID token.
async function adminToken() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASS;
  if (!email || !password) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const d = await r.json().catch(() => ({}));
  return d.idToken || null;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Page through the whole collection (handles >300 docs).
async function readAll(token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${FS}/listings?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}&key=${API_KEY}`;
    const r = await fetch(url, { headers: authHeaders(token) });
    if (!r.ok) { const e = new Error('read_failed'); e.status = r.status; throw e; }
    const j = await r.json();
    (j.documents || []).forEach((d) => { const p = parseDoc(d); if (p) docs.push(p); });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function readOne(id, token) {
  const url = `${FS}/listings/${encodeURIComponent(id)}?key=${API_KEY}`;
  const r = await fetch(url, { headers: authHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error('read_failed'); e.status = r.status; throw e; }
  return parseDoc(await r.json());
}

// Run `fn` with the most permissive auth that works: public first, admin fallback.
async function resilient(fn) {
  try {
    return await fn(null);
  } catch (e1) {
    if (e1 && e1.status && e1.status !== 403) throw e1; // not a permissions issue → real error
    const token = await adminToken();
    if (!token) throw e1;
    return await fn(token);
  }
}

export default async function handler(req, res) {
  const id = ((req.query && req.query.id) || '').toString().trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=600');
  try {
    if (id) {
      const listing = await resilient((t) => readOne(id, t));
      return res.status(200).json({ ok: true, listing });
    }
    const listings = await resilient((t) => readAll(t));
    return res.status(200).json({ ok: true, count: listings.length, listings });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok: false, error: 'listings_unavailable' });
  }
}
