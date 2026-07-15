// api/profile/bootstrap.js
// Crea il documento users/{uid} per un utente Firebase autenticato che non
// ha ancora un profilo. Le firestore.rules (giustamente) negano il create
// non-admin da client, quindi il portale chiama questo endpoint invece di
// scrivere direttamente. Il ruolo è SEMPRE 'tenant' lato server — mai
// derivato dal client (least privilege; il primo admin si crea a mano in
// console Firebase). Idempotente: se il profilo esiste, lo ritorna intatto.

import { verifyIdToken, bearerFrom, setCors } from '../_auth.js';
import { fsGet, fsPatch, readJson } from '../homie/_lib.js';

const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let fbUser;
  try { fbUser = await verifyIdToken(bearerFrom(req)); }
  catch (e) {
    console.error('[profile/bootstrap] verify failed:', e.message);
    return res.status(500).json({ ok: false, error: 'auth_check_failed' });
  }
  if (!fbUser) return res.status(401).json({ ok: false, error: 'invalid_or_expired_token' });
  // Gli utenti anonimi (magic sign / intake) non hanno un profilo da creare.
  if (!fbUser.email) return res.status(403).json({ ok: false, error: 'anonymous_user' });

  const uid = fbUser.localId;
  try {
    const existing = await fsGet('users/' + uid);
    if (existing) return res.status(200).json({ ok: true, created: false, profile: existing });

    const body = await readJson(req).catch(() => ({}));
    const profile = {
      name: clip(body && body.name, 80) || clip(fbUser.displayName, 80) || fbUser.email.split('@')[0],
      email: fbUser.email,
      role: 'tenant',
      phone: clip(body && body.phone, 40),
      createdAt: new Date().toISOString(),
      createdVia: 'profile-bootstrap',
    };
    await fsPatch('users/' + uid, profile);
    return res.status(200).json({ ok: true, created: true, profile });
  } catch (e) {
    console.error('[profile/bootstrap] error:', e.message);
    return res.status(500).json({ ok: false, error: 'bootstrap_failed' });
  }
}
