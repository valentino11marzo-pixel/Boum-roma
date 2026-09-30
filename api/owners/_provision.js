// api/owners/_provision.js — l'account del proprietario nasce da solo,
// e la prima password la sceglie LUI, da un'email NOSTRA.
//
// Il nodo: senza service account (la policy dell'organizzazione Google ne
// vieta le chiavi — vedi CLAUDE.md, 22/09) il server non può né generare un
// link di reset né impostare la password di un altro utente. L'unica strada
// "di serie" era l'email di reset di Firebase: mittente noreply@…firebaseapp,
// oggetto «Reset your password for boom-property-dashboards», inglese — a un
// proprietario che non ha chiesto niente sembra phishing, e ha ragione.
//
// La soluzione, senza nuove credenziali: all'atto della creazione il SERVER
// sceglie la password iniziale (casuale, 24 byte) e la conserva CIFRATA
// (AES-256-GCM, chiave derivata da HOMIE_SECRET — la stessa radice di tutti
// i link derivati) sul profilo, accanto all'hash di un segreto monouso. Il
// link di attivazione porta il segreto; /api/owners/activate lo verifica,
// entra con la password iniziale, la sostituisce con quella scelta dal
// proprietario (Identity Toolkit accounts:update col SUO idToken) e cancella
// tutto. Una email, marchio BOOM, italiano, un tasto.
//
// Il cifrato non esce mai dal server (activate risponde solo con l'email) e
// senza il segreto del link non serve a nulla; il link scade in 14 giorni e
// vale una volta. Ruotare HOMIE_SECRET revoca tutti i link non usati.
//
// Le guardie di identità (testate): un'email che appartiene a un ADMIN o a
// un INQUILINO non diventa mai un proprietario — si salta e si dice perché.

import crypto from 'node:crypto';
import { fsGet, fsList, fsCreate, fsPatch } from '../homie/_lib.js';
import { normEmail, OWNER_ROLES } from './_owner.js';

const SITE = 'https://www.boomrome.com';
const SETUP_TTL_MS = 14 * 24 * 3600 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

function setupKey() {
  const s = process.env.HOMIE_SECRET;
  return s ? crypto.createHash('sha256').update('boom-owner-setup:' + s).digest() : null;
}
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');

export function sealPassword(pwd) {
  const key = setupKey(); if (!key) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(pwd), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
export function openPassword(sealed) {
  const key = setupKey(); if (!key || !sealed || !sealed.ct) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
    d.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(sealed.ct, 'base64')), d.final()]).toString('utf8');
  } catch { return null; }
}

// Il riferimento del link: <uid>.<segreto>. Sul profilo solo l'hash.
export function parseActivationRef(ref) {
  const m = /^([A-Za-z0-9_-]{1,128})\.([A-Za-z0-9_-]{32,64})$/.exec(String(ref || '').trim());
  return m ? { uid: m[1], secret: m[2] } : null;
}
export function setupMatches(setup, secret, now = Date.now()) {
  if (!setup || !setup.secretHash || !secret) return false;
  if (Number(setup.exp || 0) < now) return false;
  const a = Buffer.from(String(setup.secretHash)), b = Buffer.from(sha(secret));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Ruota il segreto del link (re-invito): il cifrato resta, l'hash cambia,
// il vecchio link muore. Ritorna l'URL o null se non c'è niente da attivare.
async function rotateSetup(uid, user) {
  const setup = user && user.ownerSetup;
  if (!setup || !setup.sealed || user.ownerActivatedAt) return null;
  const secret = crypto.randomBytes(24).toString('base64url');
  await fsPatch('users/' + uid, { ownerSetup: { ...setup, secretHash: sha(secret), exp: Date.now() + SETUP_TTL_MS } });
  return `${SITE}/owner?attiva=${uid}.${secret}`;
}

async function usersByEmail(email) {
  const variants = [...new Set([email, email.toLowerCase()])];
  const seen = new Map();
  for (const v of variants) {
    const rows = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: v }, limit: 5 }).catch(() => []);
    for (const r of rows || []) if (r && r.id) seen.set(r.id, r);
  }
  return [...seen.values()];
}

// Crea (o ritrova) l'account del proprietario e lo lega alla sua scheda
// landlords. Non spedisce niente: ritorna lo stato e, se c'è da attivare,
// il link. Esiti: created | existing | activated | skipped(reason).
export async function ensureOwnerAccount({ email, name, phone, landlordId, via = 'owner-area' } = {}) {
  const em = normEmail(email);
  if (!EMAIL_RE.test(em)) return { ok: false, status: 'skipped', reason: 'no_email' };
  const lid = clip(landlordId, 80) || null;

  const hits = await usersByEmail(em);
  const admin = hits.find((u) => u.role === 'admin');
  if (admin) return { ok: false, status: 'skipped', reason: 'admin_account', uid: admin.id };
  const owner = hits.find((u) => OWNER_ROLES.has(String(u.role || '')));
  if (owner) {
    if (lid && !owner.landlordId) await fsPatch('users/' + owner.id, { landlordId: lid });
    if (lid) await fsPatch('landlords/' + lid, { userId: owner.id }).catch(() => {});
    const url = await rotateSetup(owner.id, owner);
    return { ok: true, status: owner.ownerActivatedAt || !url ? 'existing' : 'pending', uid: owner.id, activationUrl: url, activated: !!owner.ownerActivatedAt };
  }
  const other = hits.find((u) => u.role);
  if (other) return { ok: false, status: 'skipped', reason: 'role_conflict', role: other.role, uid: other.id };

  // Un profilo senza ruolo con questa email: si adotta (è lui).
  const bare = hits[0];
  const key = setupKey();
  let uid = bare ? bare.id : null, sealed = null, created = false;

  if (!uid) {
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) return { ok: false, status: 'skipped', reason: 'auth_unconfigured' };
    const initial = crypto.randomBytes(24).toString('base64url');
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: em, password: initial, returnSecureToken: false }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d || !d.localId) {
      const msg = String((d && d.error && d.error.message) || r.status);
      // Account Auth esistente SENZA profilo: senza service account non si
      // può leggere l'uid — l'operatore lo collega dal portal (Utenti).
      if (/EMAIL_EXISTS/.test(msg)) return { ok: false, status: 'skipped', reason: 'auth_exists_without_profile' };
      throw new Error('signup_failed: ' + msg);
    }
    uid = d.localId; created = true;
    sealed = key ? sealPassword(initial) : null;
  }

  const secret = sealed ? crypto.randomBytes(24).toString('base64url') : null;
  const profile = {
    role: 'landlord', email: em,
    ...(clip(name) ? { name: clip(name) } : {}),
    ...(clip(phone, 40) ? { phone: clip(phone, 40) } : {}),
    ...(lid ? { landlordId: lid } : {}),
    ownerAreaSince: new Date().toISOString(), source: via,
    ...(sealed ? { ownerSetup: { sealed, secretHash: sha(secret), exp: Date.now() + SETUP_TTL_MS, at: new Date().toISOString() } } : {}),
  };
  if (bare) await fsPatch('users/' + uid, profile);
  else {
    try { await fsCreate('users', { ...profile, createdAt: new Date() }, uid); }
    catch (e) { if (!(e && e.exists)) throw e; await fsPatch('users/' + uid, profile); }
  }
  if (lid) await fsPatch('landlords/' + lid, { userId: uid }).catch(() => {});
  return {
    ok: true, status: created ? 'created' : 'pending', uid, created,
    activationUrl: secret ? `${SITE}/owner?attiva=${uid}.${secret}` : null,
  };
}

// La porta d'ingresso da mettere in un'email: il link di attivazione se
// l'account non è ancora attivo, altrimenti l'area (che passa dal login).
export function ownerEntryUrl(acct) {
  return (acct && acct.activationUrl) || `${SITE}/owner`;
}

export async function readOwnerUser(uid) {
  return uid ? fsGet('users/' + uid).catch(() => null) : null;
}
