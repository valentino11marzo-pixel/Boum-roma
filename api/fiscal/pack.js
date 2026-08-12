// api/fiscal/pack.js — rigenera il PACK REGISTRAZIONE on-demand.
// POST { contractId } · Authorization: Bearer <firebase-id-token> (admin).
// Quando arrivano APE/planimetria/attestazione DOPO la firma, un tap dal
// portal (📦 Pack) ricostruisce lo ZIP con tutto il materiale aggiornato.
// Response: { ok, url, missing[], files[], bytes }.

import { fsGet, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { buildRegistrationPack } from '../sign/_pack.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const contractId = String((b && b.contractId) || '').trim().slice(0, 80);
  if (!contractId) return res.status(400).json({ ok: false, error: 'contract_required' });

  try {
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    contract.id = contractId;

    const property = contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;
    const tenant = contract.tenantId ? await fsGet('users/' + contract.tenantId).catch(() => null) : null;
    const landlord = property && property.ownerId ? await fsGet('users/' + property.ownerId).catch(() => null) : null;

    const out = await buildRegistrationPack({
      ...contract,
      tenantName: contract.tenantName || (tenant && tenant.name) || '',
      landlordName: contract.landlordName || (landlord && landlord.name) || '',
    }, property);
    if (!out.ok) return res.status(500).json(out);
    return res.status(200).json(out);
  } catch (e) {
    console.error('[fiscal/pack] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pack_failed' });
  }
}
