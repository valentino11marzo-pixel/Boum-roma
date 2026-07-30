// api/profile/upload.js
// Public, scheda-token-scoped ID-document upload — the /scheda page's
// "photograph your document" step. Bytes land in Firebase Storage under
// ADMIN credentials at contracts/<contractId>/identity/… (admin-only per
// storage.rules; the tokenized URL stays on the contract doc and is never
// returned to the public page — mirror of api/preagreement/upload.js).
//
// With { extract:true } the same bytes are read by Claude haiku and the
// response carries the identity fields found on the document (never
// invented — unreadable fields come back empty), so the scheda form fills
// itself and the client only confirms. The Anthropic key stays server-side;
// a missing key or a failed extraction never fails the upload.
//
// Uploads stay possible even AFTER signature (identity fields lock, the ID
// copy for the RLI dossier is additive) — capped per contract.
//
// Method:   POST
// Body:     { t, base64, name?, contentType?, extract? }
// Response: 200 { ok, count, extracted|null } | 4xx/5xx { ok:false, error }

import { getAdminToken, fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { setCors, rateOk } from '../magic-sign/_shared.js';
import { parseSchedaRef } from './_scheda.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_UPLOADS = 12;
const MODEL = 'claude-haiku-4-5-20251001';

const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

async function extractIdentity(base64, mediaType) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const isPdf = /pdf/.test(mediaType);
  const sourceBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  const prompt = [
    'This is an identity document (passport, carta d\'identità, permesso di soggiorno or driving licence) uploaded for an Italian rental contract.',
    'Return ONLY a JSON object — no prose. Use empty string for anything not clearly readable. NEVER guess or invent.',
    '{',
    '  "name": "<full name as printed>",',
    '  "cf": "<codice fiscale if printed, else empty>",',
    '  "dob": "YYYY-MM-DD",',
    '  "pob": "<place of birth, City, Country>",',
    '  "docType": "passport" | "id" | "permit" | "patente",',
    '  "docNum": "<document number>",',
    '  "docIssuer": "<issuing authority as printed>",',
    '  "docIssueDate": "YYYY-MM-DD",',
    '  "nationality": "<nationality as printed>"',
    '}',
  ].join('\n');
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 500,
        messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: prompt }] }],
      }),
    });
    if (!resp.ok) { console.warn('[profile/upload] anthropic', resp.status); return null; }
    const data = await resp.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || '';
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return {
      name: clip(j.name), cf: clip(j.cf, 20).toUpperCase(), dob: clip(j.dob, 20),
      pob: clip(j.pob), docType: ['passport', 'id', 'permit', 'patente'].includes(j.docType) ? j.docType : '',
      docNum: clip(j.docNum, 60), docIssuer: clip(j.docIssuer), docIssueDate: clip(j.docIssueDate, 20),
      nationality: clip(j.nationality, 80),
    };
  } catch (e) {
    console.warn('[profile/upload] extract failed:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 10)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const ref = parseSchedaRef(body && body.t);
  if (!ref) return res.status(404).json({ ok: false, error: 'invalid_link' });
  const { contractId, role } = ref;

  const raw = body.base64 || '';
  if (!raw) return res.status(400).json({ ok: false, error: 'no_data' });
  let buf;
  try { buf = Buffer.from(String(raw).replace(/^data:[^;]+;base64,/, ''), 'base64'); }
  catch { return res.status(400).json({ ok: false, error: 'bad_base64' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'empty' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'too_large' });

  const contentType = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(body.contentType || ''))
    ? body.contentType : 'image/jpeg';

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });

  const docs = Array.isArray(contract.identityDocs) ? contract.identityDocs : [];
  if (docs.length >= MAX_UPLOADS) return res.status(409).json({ ok: false, error: 'upload_limit' });

  try {
    const safeName = String(body.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const path = `contracts/${contractId}/identity/${Date.now()}_${safeName}`;
    const admin = await getAdminToken();
    const up = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': contentType }, body: buf }
    );
    if (!up.ok) {
      const t = await up.text();
      console.error('[profile/upload] storage', up.status, t.slice(0, 200));
      return res.status(502).json({ ok: false, error: 'storage_failed' });
    }
    const meta = await up.json().catch(() => ({}));
    const dlToken = String(meta.downloadTokens || '').split(',')[0];
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media${dlToken ? '&token=' + dlToken : ''}`;

    docs.push({
      url, path, name: safeName, contentType, bytes: buf.length, role,
      at: new Date().toISOString(),
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
    });
    await fsPatch('contracts/' + contractId, { identityDocs: docs });

    // Mirror onto the party's profile so the RLI dossier and the taxpack
    // checklists see the document without opening the contract (best-effort).
    try {
      let uid = role === 'tenant' ? contract.tenantId : null;
      if (role === 'landlord' && contract.propertyId) {
        const p = await fsGet('properties/' + contract.propertyId).catch(() => null);
        uid = p && p.ownerId;
      }
      if (uid) {
        const u = (await fsGet('users/' + uid).catch(() => null)) || {};
        const list = Array.isArray(u.identityDocs) ? u.identityDocs : [];
        list.push({ url, name: safeName, at: new Date().toISOString() });
        await fsPatch('users/' + uid, { identityDocs: list });
      }
    } catch (_) {}

    logActivity('scheda_doc_uploaded', 'contract', { contractId, role, name: safeName, bytes: buf.length }, 'scheda').catch(() => {});

    // OCR autofill — after the upload is safe, never instead of it.
    const extracted = body.extract ? await extractIdentity(buf.toString('base64'), contentType) : null;

    return res.status(200).json({ ok: true, count: docs.length, extracted });
  } catch (e) {
    console.error('[profile/upload] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'upload_failed' });
  }
}
