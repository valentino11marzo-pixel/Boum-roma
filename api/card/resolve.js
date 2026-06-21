// api/card/resolve.js — PUBLIC, read-only.
//
// The physical BOOM NFC card opens /access?c=<token>. Before the holder is
// logged in we can't (and shouldn't) reveal who they are — the real, secure
// role-routing happens AFTER login from the user's own Firestore profile.
// This endpoint only returns a small, non-sensitive CONTEXT LABEL so the
// access screen can greet the holder with where the card belongs (e.g. the
// property name), and otherwise degrades silently.
//
//   POST /api/card/resolve   { token }
//   → 200 { ok:true, label }            (card found & active)
//   → 200 { ok:false }                  (unknown / inactive / no token)
//
// Card docs live at `cards/<token>` and are provisioned by the admin tool.
// We deliberately return NO email, name, uid, role or destination here.

import { fsGet, readJson } from '../homie/_lib.js';

// Tokens are admin-generated; keep this strict to avoid odd lookups.
const TOKEN_RE = /^[A-Za-z0-9_-]{6,80}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); } catch { body = null; }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';

  if (!TOKEN_RE.test(token)) return res.status(200).json({ ok: false });

  try {
    const card = await fsGet('cards/' + token);
    if (!card || card.active === false) return res.status(200).json({ ok: false });
    // Only the cosmetic label leaves the server.
    const label = typeof card.label === 'string' && card.label.trim() ? card.label.trim().slice(0, 60) : null;
    return res.status(200).json({ ok: true, label });
  } catch (e) {
    // Never surface internals; the access screen treats this as "no context".
    return res.status(200).json({ ok: false });
  }
}
