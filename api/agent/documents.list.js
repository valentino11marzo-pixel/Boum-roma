// api/agent/documents.list.js — Tool: agent.documents.list  (Tier 1, read-only)
//
// Lets Homie find / browse the archive so it can manage and order documents.
// Firestore REST allows one server-side equality filter per query, so we apply
// the first provided filter on the server and refine the rest in memory.
//
// Body: {
//   clientId? tenantId? landlordId? propertyId? contractId? leadId?: string
//   type?:   contract|receipt|id|utility|other
//   source?: 'agent'|'generated'|'upload'|'contract'
//   externalId? userId?: string
//   status?: 'active'|'archived'   (default: any)
//   limit?:  number (1–200, default 50)
// }
// Returns: { count, items: [{ id, name, type, source, refCode, links…, fileUrl, createdAt }] }

import { fsList, guardPost, okJson, errJson } from './_lib.js';

const FILTERABLE = ['clientId', 'tenantId', 'landlordId', 'propertyId', 'contractId', 'leadId', 'type', 'source', 'externalId', 'userId', 'status'];

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 200);
  const applied = FILTERABLE.filter(k => body[k] != null && body[k] !== '');

  let docs;
  try {
    if (applied.length) {
      const primary = applied[0];
      docs = await fsList('documents', { filter: { field: primary, op: 'EQUAL', value: body[primary] }, limit: 200 });
      for (const k of applied.slice(1)) docs = docs.filter(d => d[k] === body[k]);
    } else {
      docs = await fsList('documents', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit });
    }
  } catch (e) { return errJson(res, 500, e.message); }

  docs = docs
    .sort((a, b) => (b.pinned === true) - (a.pinned === true) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);

  const items = docs.map(d => ({
    id: d.id, name: d.name, type: d.type, category: d.category, source: d.source,
    refCode: d.refCode, lang: d.lang, status: d.status, pinned: d.pinned, order: d.order, tags: d.tags,
    propertyId: d.propertyId, clientId: d.clientId, tenantId: d.tenantId, landlordId: d.landlordId,
    contractId: d.contractId, leadId: d.leadId, shared: d.shared,
    fileUrl: d.fileUrl, fileName: d.fileName, createdAt: d.createdAt,
  }));

  return okJson(res, { count: items.length, items });
}
