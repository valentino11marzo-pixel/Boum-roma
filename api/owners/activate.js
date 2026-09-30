// api/owners/activate.js — il proprietario sceglie la SUA password, dal link
// che gli abbiamo mandato noi (vedi api/owners/_provision.js per il perché).
//
// Method: POST (pubblico: il link È la credenziale, monouso, 14 giorni)
// Body:   { ref: '<uid>.<segreto>', op: 'check' }             → { ok, email, name }
//         { ref, op: 'set', password }                         → { ok, email }
// Poi la pagina entra con email + password (Firebase Auth nel browser).
//
// Mai restituito: il cifrato, la password iniziale, un token. Un link usato,
// scaduto o falso risponde 410/404 con l'uscita («accedi» / «password
// dimenticata»), mai un messaggio tecnico.

import { fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { setCors } from '../_auth.js';
import { parseActivationRef, setupMatches, openPassword, readOwnerUser } from './_provision.js';
import { OWNER_ROLES } from './_owner.js';

const RL = new Map(); const RL_WINDOW = 60_000, RL_MAX = 10;
const rateOk = (ip) => { const n = Date.now(); const e = RL.get(ip); if (!e || n - e.t >= RL_WINDOW) { RL.set(ip, { c: 1, t: n }); return true; } e.c++; return e.c <= RL_MAX; };
const ipOf = (req) => String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'ip').trim();

async function idt(path, body) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${process.env.FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d };
}

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(ipOf(req))) return res.status(429).json({ ok: false, error: 'rate_limited' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const ref = parseActivationRef((body || {}).ref);
  if (!ref) return res.status(404).json({ ok: false, error: 'invalid_link' });

  const user = await readOwnerUser(ref.uid);
  if (!user || !OWNER_ROLES.has(String(user.role || ''))) return res.status(404).json({ ok: false, error: 'invalid_link' });
  if (user.ownerActivatedAt && !user.ownerSetup) return res.status(410).json({ ok: false, error: 'already_active', email: user.email || '' });
  if (!setupMatches(user.ownerSetup, ref.secret)) return res.status(410).json({ ok: false, error: 'expired_link' });

  const op = String((body || {}).op || 'check');
  if (op === 'check') return res.status(200).json({ ok: true, email: user.email || '', name: user.name || '' });
  if (op !== 'set') return res.status(400).json({ ok: false, error: 'bad_op' });

  const password = String((body || {}).password || '');
  if (password.length < 8 || password.length > 128) return res.status(400).json({ ok: false, error: 'weak_password' });
  const initial = openPassword(user.ownerSetup.sealed);
  if (!initial) return res.status(410).json({ ok: false, error: 'expired_link' });

  const si = await idt('accounts:signInWithPassword', { email: user.email, password: initial, returnSecureToken: true });
  if (!si.ok || !si.d.idToken) {
    // La password iniziale non vale più: il proprietario l'ha già cambiata
    // (es. «password dimenticata»). Il link non serve: si pulisce e si dice.
    await fsPatch('users/' + ref.uid, { ownerSetup: null, ownerActivatedAt: user.ownerActivatedAt || new Date().toISOString() });
    return res.status(410).json({ ok: false, error: 'already_active', email: user.email || '' });
  }
  const up = await idt('accounts:update', { idToken: si.d.idToken, password, returnSecureToken: false });
  if (!up.ok) {
    const msg = String((up.d && up.d.error && up.d.error.message) || '');
    return res.status(400).json({ ok: false, error: /WEAK_PASSWORD/.test(msg) ? 'weak_password' : 'update_failed' });
  }
  // Scrittura ATTESA prima della risposta (la lezione del 13/09: su Vercel
  // quello che parte dopo res.json può non arrivare mai).
  await fsPatch('users/' + ref.uid, { ownerSetup: null, ownerActivatedAt: new Date().toISOString() });
  await logActivity('owner_area_activated', 'owner', { uid: ref.uid }, 'owner');
  return res.status(200).json({ ok: true, email: user.email || '' });
}
