// api/agent/documents.create.js — Tool: agent.documents.create  (Tier 1)
//
// Homie pushes a document INTO the BOOM archive — the same `documents`
// collection the portal's "Archivio Documentale" reads, so anything Homie
// creates is immediately findable by the operator (and by the counterparty's
// portal when linked). This is the agent-side twin of the portal's
// client-side archiveGeneratedPDF(). See docs/archive-dms.md.
//
// Two ways to provide the file:
//   - fileUrl:    an https URL Homie already hosts / uploaded.
//   - fileBase64: raw base64 or a full `data:` URI. Materialized to Firebase
//                 Storage when a bucket is available; otherwise stored inline
//                 as a data URI if small enough (Firestore's ~1MB doc cap).
//
// Visibility mirrors the portal's resolveDocAudience: linking a tenant or
// landlord surfaces the doc in their portal via getMyDocuments — no other
// change needed. Idempotent via `externalId` (Homie's own ref): a repeat call
// with the same externalId patches the existing doc instead of duplicating it.
//
// Body: {
//   name:        string                         required
//   fileUrl?:    https-url                       \  one of these
//   fileBase64?: string (base64 | data: URI)     /  is required
//   type?:       contract|receipt|id|utility|other   default: 'other'
//   category?:   string                          (rich label, e.g. 'locazione')
//   templateType?: string                        (e.g. 'rental_transitorio')
//   mimeType?:   string                          default: 'application/pdf'
//   fileName?:   string
//   lang?:       'IT'|'EN'                        default: 'IT'
//   clientId? tenantId? landlordId? propertyId? contractId? leadId?: string
//   userId?:     string                          (override resolved audience)
//   shared?:     boolean                          (override; default per audience)
//   tags?:       string[]
//   pinned?:     boolean
//   order?:      number
//   notes?:      string
//   refCode?:    string                          (else auto-generated)
//   externalId?: string                          (idempotency key)
// }
// Returns: { id, fileUrl, archived | updated }

import { fsCreate, fsPatch, fsList, logActivity, storageUpload, guardPost, okJson, errJson } from './_lib.js';
import { createHash } from 'crypto';

const VALID_TYPE = new Set(['contract', 'receipt', 'id', 'utility', 'other']);

// Who, besides admin, sees this doc — mirrors the portal's resolveDocAudience.
function resolveAudience(b) {
  const tenantId = b.tenantId || null;
  const landlordId = b.landlordId || null;
  const propertyId = b.propertyId || null;
  let userId = b.userId || null;
  let shared = b.shared === true;
  if (!userId) {
    if (tenantId) { userId = tenantId; if (b.shared === undefined) shared = !!(landlordId && propertyId); }
    else if (landlordId) { userId = landlordId; }
  }
  return { userId, shared, tenantId, landlordId, propertyId };
}

// Accept raw base64 or a `data:<mime>;base64,<...>` URI.
function parseBase64(input) {
  let mime = null, data = String(input);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(data);
  if (m) { mime = m[1]; data = m[2]; }
  try { return { buffer: Buffer.from(data, 'base64'), mimeType: mime }; }
  catch { return null; }
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  const errors = [];
  if (!body.name) errors.push('name required');
  if (!body.fileUrl && !body.fileBase64) errors.push('fileUrl or fileBase64 required');
  if (body.type && !VALID_TYPE.has(body.type)) errors.push(`type must be one of ${[...VALID_TYPE].join('|')}`);
  if (errors.length) return errJson(res, 400, 'validation', errors);

  const type = body.type && VALID_TYPE.has(body.type) ? body.type : 'other';
  const aud = resolveAudience(body);
  const ref = body.refCode || (type.toUpperCase() + '-' + Date.now().toString(36).slice(-6).toUpperCase());
  const mimeType = body.mimeType || 'application/pdf';

  let fileUrl = body.fileUrl || null;
  let fileSize = Number(body.fileSize) || 0;
  let fileName = body.fileName || `${ref}.pdf`;

  // Materialize base64 → Storage (preferred) or an inline data URI (fallback).
  if (!fileUrl && body.fileBase64) {
    const parsed = parseBase64(body.fileBase64);
    if (!parsed) return errJson(res, 400, 'bad_base64');
    fileSize = parsed.buffer.length;
    const eff = parsed.mimeType || mimeType;
    const ext = eff.includes('pdf') ? 'pdf' : (eff.split('/')[1] || 'bin');
    fileName = body.fileName || `${ref}.${ext}`;
    const path = `documents/${aud.userId || 'admin'}/archive/${type}_${ref}.${ext}`;
    try {
      const url = await storageUpload(path, parsed.buffer, eff);
      if (url) fileUrl = url;
    } catch (e) { console.warn('[documents.create] storage upload failed:', e.message); }
    if (!fileUrl) {
      if (parsed.buffer.length > 700 * 1024) {
        return errJson(res, 413, 'file_too_large_for_inline', 'Provide fileUrl, or set FIREBASE_STORAGE_BUCKET so large files can be stored.');
      }
      fileUrl = `data:${eff};base64,${parsed.buffer.toString('base64')}`;
    }
  }

  const hash = createHash('sha256')
    .update(`${ref}|${type}|${body.name}|${fileSize}|${body.externalId || ''}`)
    .digest('hex').slice(0, 16);

  const doc = {
    name: String(body.name),
    type,
    category: body.category || 'documento',
    source: 'agent',
    templateType: body.templateType || null,
    refCode: ref,
    lang: body.lang === 'EN' ? 'EN' : 'IT',
    version: 1,
    hash,
    userId: aud.userId,
    clientId: body.clientId || null,
    tenantId: aud.tenantId,
    landlordId: aud.landlordId,
    propertyId: aud.propertyId,
    contractId: body.contractId || null,
    leadId: body.leadId || null,
    shared: aud.shared,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    status: 'active',
    pinned: body.pinned === true,
    order: typeof body.order === 'number' ? body.order : 0,
    notes: body.notes || null,
    externalId: body.externalId || null,
    fileUrl, fileName, fileSize, mimeType,
    uploadedBy: 'agent',
    createdBy: body._actor || 'homie',
    createdAt: new Date(),
  };

  try {
    // Idempotency: a repeat externalId patches the existing doc.
    if (body.externalId) {
      const existing = await fsList('documents', { filter: { field: 'externalId', op: 'EQUAL', value: body.externalId }, limit: 1 });
      if (existing && existing[0]) {
        const patch = { ...doc, updatedAt: new Date() };
        delete patch.createdAt;
        await fsPatch(`documents/${existing[0].id}`, patch);
        await logActivity('Documento aggiornato (agent)', 'document', { id: existing[0].id, name: doc.name, externalId: body.externalId }, body._actor || 'homie');
        return okJson(res, { id: existing[0].id, fileUrl, updated: true });
      }
    }
    const { id } = await fsCreate('documents', doc);
    await logActivity('Documento creato (agent)', 'document', { id, name: doc.name, type, propertyId: aud.propertyId }, body._actor || 'homie');
    return okJson(res, { id, fileUrl, archived: true });
  } catch (e) { return errJson(res, 500, e.message); }
}
