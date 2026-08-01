// api/profile/lookup.js
// Public resolver for La Scheda (/scheda?t=…): the derived link is the
// credential, no login. Returns the signer's OWN identity (prefilled from
// contract + users, both schemas) so the page can render one-tap confirm
// when everything is already known — never anything about the other party
// beyond what the page needs to say whose contract this is.
//
// Method:   POST
// Body:     { t }
// Response: 200 { ok, role, locked, property, lease, signer, docsCount }
//           404 { ok:false, error:'invalid_link'|'not_found' }

import { fsGet, readJson } from '../homie/_lib.js';
import { setCors, rateOk } from '../magic-sign/_shared.js';
import { parseSchedaRef, schedaLocked, mergedIdentity, identityComplete } from './_scheda.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 30)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const ref = parseSchedaRef(body && body.t);
  if (!ref) return res.status(404).json({ ok: false, error: 'invalid_link' });
  const { contractId, role } = ref;

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) {
    console.error('[profile/lookup] contract fetch:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });

  let property = {};
  if (contract.propertyId) {
    try { property = (await fsGet('properties/' + contract.propertyId)) || {}; } catch (_) {}
  }

  // The signer's stored profile: tenant → users/<tenantId>; landlord →
  // users/<ownerId> merged over landlords/<ownerId> (wizard schema).
  let user = null;
  try {
    if (role === 'tenant' && contract.tenantId) {
      user = await fsGet('users/' + contract.tenantId);
    } else if (role === 'landlord' && property.ownerId) {
      const [u, ll] = await Promise.all([
        fsGet('users/' + property.ownerId).catch(() => null),
        fsGet('landlords/' + property.ownerId).catch(() => null),
      ]);
      user = { ...(ll || {}), ...(u || {}) };
    }
  } catch (_) {}

  const signer = mergedIdentity(contract, user, role);
  if (role === 'landlord' && !signer.name) signer.name = contract.landlordName || property.ownerName || '';

  const docs = Array.isArray(contract.identityDocs) ? contract.identityDocs : [];
  const docsCount = docs.filter(d => (d.role || 'tenant') === role || d.tenantIndex != null).length;

  return res.status(200).json({
    ok: true,
    role,
    locked: schedaLocked(contract, role),
    complete: identityComplete(signer),
    property: { name: property.name || '', address: property.address || '', zone: property.zone || '' },
    lease: { startDate: contract.startDate || null, endDate: contract.endDate || null, type: contract.type || null },
    signer,
    docsCount,
  });
}
