// api/pfs/_guard.js
// Shared auth for the PFS radar endpoints. Each endpoint can be invoked by:
//   1. Vercel cron        → Authorization: Bearer <CRON_SECRET>
//   2. Homie (Mac bridge) → X-Homie-Secret: <HOMIE_SECRET>
//   3. The command center → Authorization: Bearer <firebase-id-token> of an
//                           admin/owner/landlord user ("Scansiona ora" button)
//
// Returns an actor string ('cron' | 'homie' | 'admin:<uid>') on success.
// On failure it writes the 401/403 response and returns null.

import { secretEqual, fsGet } from '../homie/_lib.js';

const ADMIN_ROLES = new Set(['admin', 'owner', 'landlord']);

async function verifyFirebaseToken(token) {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey || !token) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );
  const data = await r.json();
  if (!r.ok || !data.users || !data.users[0]) return null;
  return data.users[0];
}

export async function requireCronOrAdmin(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearer && process.env.CRON_SECRET && secretEqual(bearer, process.env.CRON_SECRET)) {
    return 'cron';
  }

  const homieSecret = req.headers['x-homie-secret'];
  if (homieSecret && process.env.HOMIE_SECRET && secretEqual(homieSecret, process.env.HOMIE_SECRET)) {
    return 'homie';
  }

  if (bearer) {
    try {
      const user = await verifyFirebaseToken(bearer);
      if (user) {
        const profile = await fsGet('users/' + user.localId);
        if (profile && ADMIN_ROLES.has(profile.role)) return 'admin:' + user.localId;
        res.status(403).json({ ok: false, error: 'admin_required' });
        return null;
      }
    } catch (e) {
      console.error('[pfs/_guard] token verify failed:', e.message);
    }
  }

  res.status(401).json({ ok: false, error: 'unauthorized' });
  return null;
}
