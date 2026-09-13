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
// Il dizionario: cosa manca a chi, e il messaggio già scritto che lo nomina.
import FIELDS from '../../js/contract-fields.js';

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

  // La completezza per parte (dizionario) + il messaggio che NOMINA i
  // mancanti nella lingua della parte, col link dentro: il portal non
  // ricalcola nulla, copia e manda.
  let property = {}, tenant = null, landlord = null;
  if (contract.propertyId) { try { property = (await fsGet('properties/' + contract.propertyId)) || {}; } catch (_) {} }
  if (contract.tenantId) { try { tenant = await fsGet('users/' + contract.tenantId); } catch (_) {} }
  if (property.ownerId) {
    try {
      const [u, ll] = await Promise.all([fsGet('users/' + property.ownerId).catch(() => null), fsGet('landlords/' + property.ownerId).catch(() => null)]);
      landlord = { ...(ll || {}), ...(u || {}) };
    } catch (_) {}
  }
  const ctx = { contract, property, tenant: tenant || {}, landlord: landlord || {} };
  const propLabel = property.name || property.address || '';
  const tenantUrl = schedaUrl(contractId, 'tenant');
  const landlordUrl = schedaUrl(contractId, 'landlord');
  const missT = FIELDS.missingFor('tenant', ctx, { lang: 'en' });
  const missL = FIELDS.missingFor('landlord', ctx, { lang: 'it' });
  const tName = contract.tenantName || (tenant && tenant.name) || '';
  const lName = contract.landlordName || (landlord && landlord.name) || '';

  const cosign = (Array.isArray(contract.coTenants) ? contract.coTenants : [])
    .map((co, i) => (co && co.name ? {
      index: i,
      name: String(co.name).slice(0, 60),
      url: `${BASE}/sign?sign=${encodeURIComponent(cosignRef(contractId, i))}`,
      signed: !!co.signature,
      // La Scheda del co-conduttore: la SUA riga RLI (CF, nascita, documento).
      schedaUrl: schedaUrl(contractId, 'cotenant', i),
      schedaLocked: schedaLocked(contract, 'cotenant', i),
      missing: FIELDS.cotenantMissing(co).map(m => ({ key: m.key, label: m.label.en })),
      message: FIELDS.missingMessage('tenant', FIELDS.cotenantMissing(co).map(m => ({ key: m.key, label: m.label, group: 'identity' })), { name: co.name, url: schedaUrl(contractId, 'cotenant', i), propLabel }),
    } : null))
    .filter(Boolean);

  return res.status(200).json({
    ok: true,
    tenantUrl,
    landlordUrl,
    tenantLocked: schedaLocked(contract, 'tenant'),
    landlordLocked: schedaLocked(contract, 'landlord'),
    template: FIELDS.templateOf(contract),
    missing: { tenant: missT, landlord: missL, operator: FIELDS.missingFor('operator', ctx, { lang: 'it' }) },
    messages: {
      tenant: FIELDS.missingMessage('tenant', missT, { name: tName, url: tenantUrl, propLabel }),
      landlord: FIELDS.missingMessage('landlord', missL, { name: lName, url: landlordUrl, propLabel }),
    },
    ...(cosign.length ? { cosign } : {}),
  });
}
