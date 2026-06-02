// api/agent/_lib.js
// Agent layer shared helpers. Re-exports the Firestore/auth primitives from
// the Homie lib (same X-Homie-Secret guard, same admin Firestore-REST path)
// and adds two things specific to the agent layer:
//
//   sendEmail()         → Nodemailer transport, used by messages.send and
//                         by the executor when running 'reply' actions
//   waLink()            → WhatsApp deep-link builder for messages.send
//
// Why share HOMIE_SECRET instead of a new one? The Mac bridge already holds
// it for the inbound + action endpoints. Adding a second secret would just
// double the env surface without any real isolation benefit — the same
// agent runtime calls both sets of endpoints.

import nodemailer from 'nodemailer';

export {
  FS_BASE, getAdminToken, fsCreate, fsPatch, fsGet, fsList,
  fsValToJs, fsDocToJs, toFsValue, toFsFields, requireSecret,
  readJson, logActivity,
} from '../homie/_lib.js';

// ─── Email transport (Gmail via Nodemailer, same as reminder-cron.js) ───

let _transporter = null;
export function getMailer() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
  });
  return _transporter;
}

// Send a single email. Returns { messageId }.
export async function sendEmail({ to, subject, html, text, from }) {
  if (!to || !subject || (!html && !text)) throw new Error('to, subject and html|text required');
  const m = getMailer();
  const info = await m.sendMail({
    from: from || `BOOM Rome <${process.env.GMAIL_USER}>`,
    to, subject, html, text,
  });
  return { messageId: info.messageId };
}

// Build a WhatsApp deep-link. Phone is normalized (digits only, no plus).
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const url = new URL(`https://wa.me/${digits}`);
  if (text) url.searchParams.set('text', text);
  return url.toString();
}

// Standard JSON response shape for agent endpoints. Keeps the Mac bridge
// parser trivial: always { ok, ... } with `error` on failure.
export function okJson(res, data = {}) { return res.status(200).json({ ok: true, ...data }); }
export function errJson(res, code, error, details) {
  const body = { ok: false, error };
  if (details) body.details = details;
  return res.status(code).json(body);
}

// Verify a Firebase user ID token (sent by the browser when an admin clicks
// "Approva" in portal/cockpit). Returns { uid, email, admin } on success,
// null on any failure. Uses the same FIREBASE_API_KEY env var as everywhere
// else — no Admin SDK / service account JSON required.
//
// ADMIN_EMAILS is a comma-separated env var ('valentino@boomrome.com,...')
// listing the addresses allowed to approve actions from the browser.
const ADMIN_EMAILS = (process.env.AGENT_ADMIN_EMAILS || process.env.FIREBASE_ADMIN_EMAIL || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export async function verifyBrowserAdmin(req) {
  const tok = req.headers['x-firebase-token'] || req.headers['X-Firebase-Token'];
  if (!tok) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: tok }) }
    );
    const data = await r.json();
    const u = data.users?.[0];
    if (!u || !u.email) return null;
    const email = u.email.toLowerCase();
    const admin = ADMIN_EMAILS.includes(email);
    return { uid: u.localId, email, admin };
  } catch { return null; }
}

// Boilerplate for every agent endpoint: CORS preflight, method guard, AUTH
// guard, JSON parse. Auth = X-Homie-Secret (Mac bridge) OR X-Firebase-Token
// (browser admin). Returns parsed body on success, or null if the guard
// already responded.
export async function guardPost(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret, X-Firebase-Token');
  if (req.method === 'OPTIONS') { res.status(204).end(); return null; }
  if (req.method !== 'POST')    { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return null; }

  const lib = await import('../homie/_lib.js');
  const hasSecret = req.headers['x-homie-secret'] === process.env.HOMIE_SECRET;
  let actor = hasSecret ? 'homie' : null;
  if (!actor) {
    const u = await verifyBrowserAdmin(req);
    if (u?.admin) actor = `admin:${u.email}`;
  }
  if (!actor) { res.status(401).json({ ok: false, error: 'invalid_auth', hint: 'Send X-Homie-Secret (Mac) or X-Firebase-Token (admin browser).' }); return null; }

  const body = await lib.readJson(req).catch(() => null);
  if (!body || typeof body !== 'object') { res.status(400).json({ ok: false, error: 'no_body' }); return null; }
  // Attach actor for logging downstream
  body._actor = actor;
  return body;
}
