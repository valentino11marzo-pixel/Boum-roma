// api/agent/documents.update.js — Tool: agent.documents.update  (Tier 1)
//
// Lets Homie organize the archive: rename, re-tag, re-assign, share/unshare,
// pin, reorder, or archive a document it (or anyone) created. Only the fields
// provided are patched; everything else is left intact. Reversible.
//
// Body: {
//   id:        string                            required
//   name? category? notes? refCode? lang?: string
//   type?:     contract|receipt|id|utility|other
//   status?:   'active'|'archived'
//   shared? pinned?: boolean
//   order?:    number
//   tags?:     string[]
//   userId? propertyId? clientId? tenantId? landlordId? contractId?: string|null
// }
// Returns: { id, updated: string[] }

import { fsGet, fsPatch, logActivity, guardPost, okJson, errJson } from './_lib.js';

const UPDATABLE = ['name', 'type', 'category', 'tags', 'shared', 'userId', 'propertyId', 'clientId', 'tenantId', 'landlordId', 'contractId', 'pinned', 'order', 'status', 'notes', 'lang', 'refCode'];
const VALID_TYPE = new Set(['contract', 'receipt', 'id', 'utility', 'other']);
const VALID_STATUS = new Set(['active', 'archived']);

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  if (!body.id) return errJson(res, 400, 'id required');
  if (body.type && !VALID_TYPE.has(body.type)) return errJson(res, 400, 'invalid_type', `type must be one of ${[...VALID_TYPE].join('|')}`);
  if (body.status && !VALID_STATUS.has(body.status)) return errJson(res, 400, 'invalid_status', `status must be one of ${[...VALID_STATUS].join('|')}`);

  const existing = await fsGet(`documents/${body.id}`);
  if (!existing) return errJson(res, 404, 'document_not_found');

  const patch = {};
  const updated = [];
  for (const k of UPDATABLE) {
    if (body[k] !== undefined) {
      patch[k] = (k === 'tags' && Array.isArray(body[k])) ? body[k].map(String) : body[k];
      updated.push(k);
    }
  }
  if (!updated.length) return errJson(res, 400, 'no_updatable_fields', `Provide any of: ${UPDATABLE.join(', ')}`);
  patch.updatedAt = new Date();

  try {
    await fsPatch(`documents/${body.id}`, patch);
    await logActivity('Documento organizzato (agent)', 'document', { id: body.id, updated }, body._actor || 'homie');
    return okJson(res, { id: body.id, updated });
  } catch (e) { return errJson(res, 500, e.message); }
}
