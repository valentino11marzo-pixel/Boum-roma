// api/preagreement/upload.js
// Public, token-scoped ID-document upload for the pre-agreement page's
// "Verify" step. The client photographs/attaches their ID or passport; the
// bytes are stored in Firebase Storage under ADMIN credentials at
// preagreements/<paId>/… (admin-only per storage.rules — the returned URL
// carries the unguessable download token, which is kept on the PA doc and
// never exposed back to the public page).
//
// The upload is what makes the automatic PA → contract conversion complete:
// api/preagreement/convert.js copies these references onto the contract and
// the tenant's user profile, so Magic Sign + the RLI registration already
// hold the identity documents with zero admin re-collection.
//
// Method: POST
// Body: { token, base64, name?, contentType?, tenantIndex? }
// Response 200: { ok:true, count } | 4xx/5xx { ok:false, error }
// (Deliberately does NOT return the storage URL — the token in the URL is
// the read credential and belongs to the admin side only.)

import { getAdminToken, fsList, fsPatch, readJson, logActivity } from '../homie/_lib.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MAX_BYTES = 10 * 1024 * 1024;   // phone photos are 2–5 MB; PDFs small
const MAX_UPLOADS = 12;               // per pre-agreement — plenty for 6 tenants × 2 sides

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });

  const raw = body.base64 || '';
  if (!raw) return res.status(400).json({ ok: false, error: 'no_data' });
  let buf;
  try { buf = Buffer.from(String(raw).replace(/^data:[^;]+;base64,/, ''), 'base64'); }
  catch { return res.status(400).json({ ok: false, error: 'bad_base64' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'empty' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'too_large' });

  const contentType = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(body.contentType || ''))
    ? body.contentType : 'image/jpeg';

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, ...pa } = hit;
    if (pa.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });

    const uploads = Array.isArray(pa.uploads) ? pa.uploads : [];
    if (uploads.length >= MAX_UPLOADS) return res.status(409).json({ ok: false, error: 'upload_limit' });

    const safeName = String(body.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const path = `preagreements/${id}/${Date.now()}_${safeName}`;

    const admin = await getAdminToken();
    const up = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': contentType }, body: buf }
    );
    if (!up.ok) {
      const t = await up.text();
      console.error('[pa/upload] storage', up.status, t.slice(0, 200));
      return res.status(502).json({ ok: false, error: 'storage_failed' });
    }
    const meta = await up.json().catch(() => ({}));
    const dlToken = String(meta.downloadTokens || '').split(',')[0];
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media${dlToken ? '&token=' + dlToken : ''}`;

    uploads.push({
      url, path, name: safeName, contentType,
      bytes: buf.length,
      tenantIndex: Math.max(0, Math.min(5, Number(body.tenantIndex) || 0)),
      at: new Date().toISOString(),
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
    });
    await fsPatch(`preAgreements/${id}`, { uploads });
    logActivity('preagreement_doc_uploaded', 'preagreement', { id, name: safeName, bytes: buf.length }, 'web').catch(() => {});

    return res.status(200).json({ ok: true, count: uploads.length });
  } catch (e) {
    console.error('[pa/upload] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'upload_failed' });
  }
}
