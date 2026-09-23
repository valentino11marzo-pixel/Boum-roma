// api/documents/share.js
// Create a share link for the commercialista. The admin posts the set of
// document ids (or a property+year scope) and gets back a tokenized URL that
// opens /share.html — no login required for the accountant, expiring,
// audit-logged, watermarked.
//
// SOLO ADMIN (22/09/2026). Il ramo landlord controllava soltanto
// `ownerId === uid`, mai i `docIds`: un proprietario poteva condividere
// QUALSIASI documento di cui conoscesse l'id (l'anagrafica di un inquilino,
// il contratto di un altro immobile) e share/lookup glielo serviva. Nessuna
// pagina del proprietario chiama più questo endpoint (il vecchio portal non
// è più suo: va su /proprietario, che condivide un file alla volta dal
// proprio archivio), quindi la via semplice è chiuderlo allo staff invece di
// replicare qui la tabella di visibilità. tests/owner/security.mjs.
//
// Method:   POST
// URL:      /api/documents/share
// Headers:  Authorization: Bearer <firebase-id-token>
// Body:     {
//   ownerId:        string                       // landlord uid whose bundle is shared
//   propertyId?:    string
//   fiscalYear?:    number
//   docIds:         string[]                      // documents to expose
//   recipientName?: string                        // e.g. "Studio Rossi"
//   expiresInDays?: number                        // default 60, max 365
//   note?:          string
// }
// Response: { ok, token, url, expiresAt }

import crypto from 'node:crypto';
import { fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const ownerId = String(body.ownerId || '').trim();
  const docIds = Array.isArray(body.docIds) ? body.docIds.filter(Boolean).slice(0, 200) : [];
  if (!ownerId) return res.status(400).json({ ok: false, error: 'ownerId_required' });
  if (!docIds.length) return res.status(400).json({ ok: false, error: 'no_documents' });

  const days = Math.min(365, Math.max(1, parseInt(body.expiresInDays, 10) || 60));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const token = crypto.randomBytes(24).toString('hex');

  const share = {
    token,
    ownerId,
    propertyId: body.propertyId || null,
    fiscalYear: body.fiscalYear != null ? Number(body.fiscalYear) : null,
    docIds,
    recipientName: (body.recipientName || '').slice(0, 120),
    note: (body.note || '').slice(0, 500),
    watermark: 'BOOM · ' + (body.recipientName || 'Commercialista') + ' · ' + new Date().toISOString().slice(0, 10),
    createdBy: auth.uid,
    createdByName: auth.profile.name || auth.email || '',
    createdAt: new Date(),
    expiresAt,
    revoked: false,
    views: [],
  };

  try {
    const { id } = await fsCreate('documentShares', share);
    await logActivity('document_share_created', 'document', {
      shareId: id, ownerId, docCount: docIds.length, recipient: share.recipientName, expiresAt,
    }, auth.uid);
    // Build the share URL on the same host the request came from, so preview
    // deployments and production each serve their own /share. This was the
    // 404 bug: the endpoint used to always return https://www.boomrome.com
    // even when called from a preview domain.
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || 'www.boomrome.com').split(',')[0].trim();
    const url = `${proto}://${host}/share.html?t=${token}`;
    return res.status(200).json({
      ok: true,
      token,
      shareId: id,
      url,
      expiresAt,
    });
  } catch (e) {
    console.error('[documents/share]', e);
    return res.status(500).json({ ok: false, error: e.message || 'internal' });
  }
}
