// src/atlas-pending.js
// Server-side mirror of portal.html's writePendingMemory(...) helper.
// Used by Vercel functions (Phase 3 ticket_resolved, Phase 4 payment_late /
// payment_disputed). Firebase REST API via signInWithPassword — same pattern
// as api/reminder-cron.js. Deterministic doc ID for idempotency:
// `${type}__${col}_${id}`.
//
// IMPORTABLE from api/* via:
//   import { writePendingMemory } from '../src/atlas-pending.js';
//
// NOT exposed as a public HTTP endpoint (intentional — file is in src/, not
// api/, so Vercel does not deploy it as a function).
//
// Schema (frozen — see src/schemas.md §pendingMemories):
//   { type, content, metadata, source, drained, drainedAt, createdAt }

const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function getFirebaseToken() {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
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
  const d = await r.json();
  if (!d.idToken) throw new Error('Firebase auth failed');
  return d.idToken;
}

// Encode arbitrary JS values into Firestore REST field shape.
function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = fsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

/**
 * Server-side write to pendingMemories collection (Atlas write-hook stub).
 * Idempotent: deterministic doc ID + Firestore PATCH = overwrite. Re-calling
 * for the same source doc never produces a duplicate.
 *
 * @param {string} type
 * @param {string} content
 * @param {object} metadata
 * @param {string} source
 * @param {{ collection: string, id: string }} sourceDocRef
 * @returns {Promise<{ ok: true, docId: string } | { ok: false, reason: string }>}
 */
export async function writePendingMemory(type, content, metadata, source, sourceDocRef) {
  if (!type || !sourceDocRef || !sourceDocRef.collection || !sourceDocRef.id) {
    return { ok: false, reason: 'missing-required-args' };
  }
  const docId = `${type}__${sourceDocRef.collection}_${sourceDocRef.id}`;
  const fields = {
    type: fsValue(type),
    content: fsValue((content || '').toString().slice(0, 4000)),
    metadata: fsValue(metadata || {}),
    source: fsValue(source || 'server'),
    drained: fsValue(false),
    drainedAt: fsValue(null),
    createdAt: { timestampValue: new Date().toISOString() },
  };
  try {
    const token = await getFirebaseToken();
    const url = `${FS_BASE()}/pendingMemories/${encodeURIComponent(docId)}`;
    // PATCH with no updateMask → full overwrite (deterministic, idempotent).
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) return { ok: false, reason: `firestore-${r.status}` };
    return { ok: true, docId };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'unknown' };
  }
}
