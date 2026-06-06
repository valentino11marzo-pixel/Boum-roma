// api/magic-sign/_shared.js
// Helpers specific to the Magic-Sign flow. Reuses the admin-token plumbing
// from /api/homie/_lib.js — Magic-Sign endpoints are open to anonymous
// callers but authorize via the single-use signing token carried in the URL.

import { fsList, FS_BASE, getAdminToken, toFsFields } from '../homie/_lib.js';

// Look up a contract by either tenantSignToken or landlordSignToken.
// Returns { contract, role } or null.
export async function findContractByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 8) return null;
  // tenantSignToken first (most common path)
  let hits = await fsList('contracts', {
    filter: { field: 'tenantSignToken', op: 'EQUAL', value: token },
    limit: 2,
  });
  if (hits.length === 1) return { contract: hits[0], role: 'tenant' };
  if (hits.length > 1) return null; // ambiguous → reject

  hits = await fsList('contracts', {
    filter: { field: 'landlordSignToken', op: 'EQUAL', value: token },
    limit: 2,
  });
  if (hits.length === 1) return { contract: hits[0], role: 'landlord' };
  return null;
}

// Apply server-side timestamp via a Firestore field transform. The plain
// fsPatch helper writes fields literally; some cascading updates want
// serverTimestamp() for createdAt / updatedAt. We do those through :commit.
//
// `writes` is an array of { docPath, fields, serverTimestampFields }.
export async function commitWrites(writes) {
  const token = await getAdminToken();
  const projectPath = FS_BASE.replace(/\/documents$/, '');
  const body = {
    writes: writes.map(w => {
      const update = {
        name: `${projectPath}/documents/${w.docPath}`,
        fields: toFsFields(w.fields || {}),
      };
      const updateMask = Object.keys(w.fields || {});
      const fieldTransforms = (w.serverTimestampFields || []).map(f => ({
        fieldPath: f,
        setToServerValue: 'REQUEST_TIME',
      }));
      const write = { update };
      if (updateMask.length) write.updateMask = { fieldPaths: updateMask };
      if (fieldTransforms.length) write.updateTransforms = fieldTransforms;
      return write;
    }),
  };
  const res = await fetch(`${FS_BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${txt}`);
  }
  return await res.json();
}

export function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://www.boomrome.com', 'https://boomrome.com'];
  if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
