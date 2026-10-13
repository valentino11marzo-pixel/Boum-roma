// api/share/lookup.js
// Public endpoint backing /share.html — the page a commercialista opens
// from the link. Resolves a documentShares token to the sanitized list of
// documents, enforces expiry/revocation, and audit-logs every view. No
// login required; the token is the capability. Runs under admin creds so
// it can read the documents the rules would otherwise gate.
//
// Method:   POST
// URL:      /api/share/lookup
// Body:     { token }
// Response 200: { ok, recipientName, watermark, fiscalYear, property,
//                 documents: [{ id, name, type, category, fiscalYear, fileUrl, fileName }], note }
// Response 404: invalid    410: expired/revoked

import { fsList, fsGet, fsGetMany, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { setCors } from '../_auth.js';
import { ownership, validDocId } from '../documents/_owned.js';

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });

  let shares;
  try {
    shares = await fsList('documentShares', {
      filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1,
    });
  } catch (e) {
    console.error('[share/lookup]', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  const share = shares && shares[0];
  if (!share) return res.status(404).json({ ok: false, error: 'invalid' });
  if (share.revoked) return res.status(410).json({ ok: false, error: 'revoked' });
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ ok: false, error: 'expired' });
  }

  // Resolve documents (admin creds bypass rules; we only return the ids the
  // share explicitly lists, so scope is exactly what the owner shared).
  // E SOLO quelli del proprietario della condivisione (suoi o di un suo
  // immobile): una condivisione scritta a mano (le regole lo permettevano a
  // un proprietario) o una lista con l'id di un documento altrui — gli id si
  // deducono dall'indirizzo — non consegna mai la ricevuta o il contratto di
  // un altro. Unica eccezione: la condivisione emessa da un admin dal server
  // (issuedBy 'admin', e chi l'ha creata è admin davvero).
  const ids = (Array.isArray(share.docIds) ? share.docIds : []).filter(validDocId).slice(0, 200);
  let byPath = new Map();
  try { byPath = await fsGetMany(ids.map(id => 'documents/' + id)); } catch (_) { byPath = new Map(); }
  let adminIssued = false;
  if (share.issuedBy === 'admin' && validDocId(String(share.createdBy || ''))) {
    const creator = await fsGet('users/' + share.createdBy).catch(() => null);
    adminIssued = !!(creator && creator.role === 'admin');
  }
  let own = null;
  if (!adminIssued) {
    try { own = await ownership(share.ownerId, byPath); }
    catch (_) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  }
  const documents = [];
  let omitted = 0;
  for (const id of ids) {
    try {
      const d = byPath.get('documents/' + id);
      if (d && own && !own.owned.has(id)) { omitted++; continue; }
      if (d) documents.push({
        id: d.id,
        name: d.name || 'Documento',
        type: d.type || 'other',
        category: d.category || d.docCategory || null,
        fiscalYear: d.fiscalYear || null,
        fileUrl: d.fileUrl || null,
        fileName: d.fileName || null,
      });
    } catch (_) { /* skip unreadable */ }
  }

  // Property summary (optional) — solo un immobile del proprietario.
  let property = null;
  if (share.propertyId && validDocId(String(share.propertyId))) {
    try {
      const p = await fsGet('properties/' + share.propertyId);
      if (p && (adminIssued || p.ownerId === share.ownerId)) property = { name: p.name || '', address: p.address || '' };
    } catch (_) {}
  }
  if (omitted) console.warn('[share/lookup] documenti non del proprietario omessi:', omitted);

  // Audit the view: append to the share's views[] (capped) + activityLog.
  try {
    const view = { at: new Date().toISOString(), ip: clientIp(req), ua: (req.headers['user-agent'] || '').slice(0, 160) };
    const views = Array.isArray(share.views) ? share.views.slice(-49).concat([view]) : [view];
    await fsPatch('documentShares/' + share.id, { views, lastViewedAt: view.at });
    await logActivity('document_share_viewed', 'document', {
      shareId: share.id, ownerId: share.ownerId, ip: view.ip, docCount: documents.length,
    }, 'share-recipient');
  } catch (_) { /* non-fatal */ }

  return res.status(200).json({
    ok: true,
    recipientName: share.recipientName || '',
    watermark: share.watermark || '',
    fiscalYear: share.fiscalYear || null,
    note: share.note || '',
    property,
    documents,
  });
}
