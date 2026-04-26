// api/issue-magic-token.js
// Issues a magic-link tokenId that grants one-click portal sign-in for the tenant
// of a recently-signed contract. Backed by Firebase Admin SDK custom tokens with
// single-use Firestore tracking.
//
// Auth model:
//   - No bearer token. The endpoint is open but heavily constrained:
//     * Contract must exist
//     * contract.fullySignedAt must be within the last 10 minutes (signature recency)
//     * Only the tenant of that contract can be the recipient (UID/email derived from contract)
//   - Combined with rate limiting per IP, this prevents abuse: an attacker would need
//     to time a request within 10 minutes of a legitimate signature AND know the contractId.
//
// Required env var:
//   FIREBASE_SERVICE_ACCOUNT_JSON  → full JSON of a service account key
//
// Required Firestore rules for /magicLinks/{tokenId}:
//   allow read: if request.auth != null;          // any authenticated user can read by exact ID
//   allow update: if request.auth != null
//                 && request.auth.uid == resource.data.uid
//                 && !resource.data.used;         // owner marks used once
//   allow create, delete: if false;               // Admin SDK only

import admin from 'firebase-admin';
import crypto from 'node:crypto';

if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
    });
  } catch (initErr) {
    console.error('[magic-token] Admin SDK init failed:', initErr.message);
  }
}

const ALLOWED_ORIGINS = new Set([
  'https://www.boomrome.com',
  'https://boomrome.com',
]);

const SIGNATURE_RECENCY_WINDOW_MS = 10 * 60 * 1000; // 10 min after fullySignedAt
const TOKEN_TTL_MS = 60 * 60 * 1000;                 // 1h to use the magic link

// In-memory rate limit (best effort across warm Fluid Compute instances)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function logEvent(obj) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); } catch {}
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    if (rateLimitMap.size > 1000) {
      const cutoff = now - 2 * RATE_LIMIT_WINDOW_MS;
      for (const [k, v] of rateLimitMap) if (v.windowStart < cutoff) rateLimitMap.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);

  if (!checkRateLimit(ip)) {
    logEvent({ event: 'magic-token-reject', reason: 'rate-limit', ip });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!admin.apps.length) {
    logEvent({ event: 'magic-token-reject', reason: 'admin-sdk-not-initialized', ip });
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const body = req.body || {};
  const contractId = typeof body.contractId === 'string' ? body.contractId.trim() : '';
  if (!contractId) {
    return res.status(400).json({ error: 'Missing contractId' });
  }

  try {
    const db = admin.firestore();

    // 1) Read contract
    const cDoc = await db.collection('contracts').doc(contractId).get();
    if (!cDoc.exists) {
      logEvent({ event: 'magic-token-reject', reason: 'contract-not-found', ip, contractId });
      return res.status(404).json({ error: 'Contract not found' });
    }
    const contract = cDoc.data();

    // 2) Signature recency check (must be within window)
    const fullySignedAt = contract.fullySignedAt;
    if (!fullySignedAt) {
      logEvent({ event: 'magic-token-reject', reason: 'contract-not-signed', ip, contractId });
      return res.status(403).json({ error: 'Contract not yet fully signed' });
    }
    const signedMs = (fullySignedAt && typeof fullySignedAt.toMillis === 'function')
      ? fullySignedAt.toMillis()
      : (typeof fullySignedAt === 'string' ? new Date(fullySignedAt).getTime() : Number(fullySignedAt) || 0);
    if (Date.now() - signedMs > SIGNATURE_RECENCY_WINDOW_MS) {
      logEvent({ event: 'magic-token-reject', reason: 'signature-too-old', ip, contractId, ageMs: Date.now() - signedMs });
      return res.status(403).json({ error: 'Signature recency window expired' });
    }

    // 3) Resolve tenant
    const tenantId = contract.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Contract has no tenantId' });
    }
    const uDoc = await db.collection('users').doc(tenantId).get();
    const tenantEmail = uDoc.exists ? (uDoc.data().email || '') : '';
    if (!tenantEmail) {
      logEvent({ event: 'magic-token-reject', reason: 'tenant-no-email', ip, contractId, tenantId });
      return res.status(400).json({ error: 'Tenant has no email on file' });
    }

    // 4) Get or create Firebase Auth user; reconcile UID = tenantId
    let userRecord;
    try {
      userRecord = await admin.auth().getUser(tenantId);
    } catch (notFound) {
      try {
        userRecord = await admin.auth().createUser({
          uid: tenantId,
          email: tenantEmail,
          emailVerified: true,
          displayName: uDoc.exists ? (uDoc.data().name || undefined) : undefined,
        });
      } catch (createErr) {
        if (createErr.code === 'auth/email-already-exists') {
          // A different UID already owns this email — fall back to that UID
          userRecord = await admin.auth().getUserByEmail(tenantEmail);
        } else {
          throw createErr;
        }
      }
    }
    const uid = userRecord.uid;

    // 5) Mint custom token (built-in 1h expiry)
    const customToken = await admin.auth().createCustomToken(uid, { contractId });

    // 6) Persist single-use record (URL carries only tokenId, not the JWT)
    const tokenId = crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '').slice(0, 32);
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + TOKEN_TTL_MS);

    await db.collection('magicLinks').doc(tokenId).set({
      customToken,
      uid,
      email: tenantEmail,
      contractId,
      tenantId,
      expiresAt,
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const magicUrl = `https://www.boomrome.com/portal.html?postSign=1&cid=${encodeURIComponent(contractId)}&magicToken=${tokenId}`;

    logEvent({ event: 'magic-token-issued', ip, contractId, tenantId, uid, tokenId });
    return res.status(200).json({ magicUrl, expiresAt: expiresAt.toMillis() });
  } catch (err) {
    logEvent({ event: 'magic-token-error', ip, contractId, message: err?.message || 'unknown' });
    return res.status(500).json({ error: 'Token issuance failed' });
  }
}
