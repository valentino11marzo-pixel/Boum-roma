// api/wizard/upload.js
// Photo-upload bridge for the Telegram listing wizard bot.
//
// Lets the bot store listing photos WITHOUT holding Firebase admin
// credentials: it POSTs the image bytes (base64) here with the shared secret,
// and this endpoint uploads to Firebase Storage under admin credentials —
// mirroring the bot's own storage_upload(), the same way /api/wizard/publish
// mirrors its fs_create(). Together they make the publish flow resilient to
// Firestore/Storage rule or role changes.
//
// Method: POST
// Headers: X-Wizard-Secret (or X-Homie-Secret)
// Body:   { base64, path?, contentType? }   // base64 may be a data: URI
// Response 200: { ok:true, url, path } | 4xx/5xx: { ok:false, error }

import { getAdminToken, secretEqual, readJson } from '../homie/_lib.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MAX_BYTES = 12 * 1024 * 1024; // Storage rule caps at 25MB; stay well under Vercel's body limit

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wizard-Secret, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkSecret(req, res)) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const raw = body.base64 || body.data;
  if (!raw) return res.status(400).json({ ok: false, error: 'no_data' });

  let buf;
  try { buf = Buffer.from(String(raw).replace(/^data:[^;]+;base64,/, ''), 'base64'); }
  catch { return res.status(400).json({ ok: false, error: 'bad_base64' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'empty' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'too_large' });

  const contentType = (typeof body.contentType === 'string' && body.contentType) || 'image/jpeg';

  // Force everything under listings/ — the only prefix this endpoint may write.
  const wanted = String(body.path || `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`).replace(/^\/+/, '');
  const path = wanted.startsWith('listings/') ? wanted : `listings/${wanted.split('/').pop()}`;

  try {
    const token = await getAdminToken();
    const up = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: buf }
    );
    if (!up.ok) {
      const t = await up.text();
      console.error('[wizard/upload] storage', up.status, t.slice(0, 200));
      return res.status(502).json({ ok: false, error: 'storage_failed' });
    }
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
    return res.status(200).json({ ok: true, url, path });
  } catch (err) {
    console.error('[wizard/upload]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
