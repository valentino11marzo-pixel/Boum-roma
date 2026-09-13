// api/fiscal/foglio.js — ri-manda IL FOGLIO DI REGISTRAZIONE (l'email pulita).
// POST { contractId } · Authorization: Bearer <firebase-id-token> (admin).
// A firma completa il foglio parte da solo (api/sign/_finalize.js); da qui
// l'operatore lo RIMANDA — dopo che è arrivato un CF, un documento, il
// catasto — e in Gmail il più recente è quello buono. Rimandare è voluto:
// nessuna guardia anti-doppione, il destinatario è sempre l'operatore.
// Response: { ok, to, attachments, subject }.

import { fsGet, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { sendRegistrationSheet } from '../sign/_foglio.js';

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
    const landlordU = property && property.ownerId ? await fsGet('users/' + property.ownerId).catch(() => null) : null;
    const landlordR = property && property.ownerId ? await fsGet('landlords/' + property.ownerId).catch(() => null) : null;
    const out = await sendRegistrationSheet(contract, property, { tenant, landlord: { ...(landlordR || {}), ...(landlordU || {}) } });
    if (!out.ok) return res.status(500).json(out);
    return res.status(200).json(out);
  } catch (e) {
    console.error('[fiscal/foglio] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'foglio_failed' });
  }
}
