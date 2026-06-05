// api/_auth.js
// Shared Firebase ID-token verification for endpoints called by the
// logged-in browser (admin / landlord / tenant), as opposed to the
// Homie webhooks (shared secret) or Stripe (signature). Verifies the
// token via the Identity Toolkit REST lookup, then reads the caller's
// role from Firestore using admin creds.

import { fsGet } from './homie/_lib.js';

const API_KEY = process.env.FIREBASE_API_KEY;

// Verify a Firebase ID token. Returns the Identity Toolkit user record
// ({ localId, email, ... }) or null.
export async function verifyIdToken(token) {
  if (!token || typeof token !== 'string') return null;
  if (!API_KEY) throw new Error('FIREBASE_API_KEY env var missing');
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );
  if (!r.ok) return null;
  const data = await r.json();
  if (!data.users || !data.users[0]) return null;
  return data.users[0];
}

// Pull the bearer token out of an Authorization header.
export function bearerFrom(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1].trim() : null;
}

// Full gate: verify token + load profile + check role is in allowedRoles.
// Returns { uid, email, profile } on success, or writes the proper status
// to `res` and returns null (caller should `return`).
export async function requireRole(req, res, allowedRoles) {
  const token = bearerFrom(req);
  let fbUser;
  try { fbUser = await verifyIdToken(token); }
  catch (e) {
    console.error('[_auth] token verify failed:', e.message);
    res.status(500).json({ ok: false, error: 'auth_check_failed' });
    return null;
  }
  if (!fbUser) {
    res.status(401).json({ ok: false, error: 'invalid_or_expired_token' });
    return null;
  }
  let profile = null;
  try { profile = await fsGet('users/' + fbUser.localId); }
  catch (e) {
    res.status(500).json({ ok: false, error: 'profile_lookup_failed' });
    return null;
  }
  if (!profile) {
    res.status(403).json({ ok: false, error: 'no_profile' });
    return null;
  }
  if (allowedRoles && allowedRoles.indexOf(profile.role) === -1) {
    res.status(403).json({ ok: false, error: 'forbidden', yourRole: profile.role || null });
    return null;
  }
  return { uid: fbUser.localId, email: fbUser.email || profile.email || '', profile: profile };
}

export function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://www.boomrome.com', 'https://boomrome.com'];
  if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
