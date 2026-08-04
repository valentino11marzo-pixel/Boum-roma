// api/profile/link.js
// Admin-side resolver: the scheda token is DERIVED from HOMIE_SECRET, so the
// browser can never compute it — the portal's Share Hub asks this endpoint
// for the two /scheda URLs of a contract. Admin gets any contract; an
// owner/landlord only contracts on their own property.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>
// Body:     { contractId }
// Response: { ok, tenantUrl, landlordUrl, tenantLocked, landlordLocked,
//             cosign: [{ index, name, url, signed }] }
// cosign: anche i link FIRMA dei co-conduttori sono derivati (cosignRef da
// HOMIE_SECRET) — il browser non può calcolarli, e senza questo campo lo
// Share Hub non aveva nulla da incollare su WhatsApp per un co-conduttore.

import { fsGet, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { schedaUrl, schedaLocked } from './_scheda.js';
import { cosignRef } from '../magic-sign/_shared.js';

const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const contractId = String((b && b.contractId) || '').trim().slice(0, 80);
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });

  if (auth.profile.role !== 'admin') {
    let ownerId = null;
    if (contract.propertyId) {
      try { ownerId = ((await fsGet('properties/' + contract.propertyId)) || {}).ownerId || null; } catch (_) {}
    }
    if (ownerId !== auth.uid) return res.status(403).json({ ok: false, error: 'not_your_contract' });
  }

  const cosign = (Array.isArray(contract.coTenants) ? contract.coTenants : [])
    .map((co, i) => (co && co.name ? {
      index: i,
      name: String(co.name).slice(0, 60),
      url: `${BASE}/sign?sign=${encodeURIComponent(cosignRef(contractId, i))}`,
      signed: !!co.signature,
    } : null))
    .filter(Boolean);

  return res.status(200).json({
    ok: true,
    tenantUrl: schedaUrl(contractId, 'tenant'),
    landlordUrl: schedaUrl(contractId, 'landlord'),
    tenantLocked: schedaLocked(contract, 'tenant'),
    landlordLocked: schedaLocked(contract, 'landlord'),
    ...(cosign.length ? { cosign } : {}),
  });
}
