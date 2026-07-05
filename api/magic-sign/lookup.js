// api/magic-sign/lookup.js
// Public endpoint for the Magic-Sign UI to fetch contract+property+parties
// by single-use signing token. Replaces the previous flow which had the
// browser run db.collection('contracts').where('tenantSignToken', '==', t)
// anonymously — closed by firestore.rules. Returns a sanitized subset
// (no PII for the other party beyond what the signing view shows).
//
// Method:    POST
// URL:       /api/magic-sign/lookup
// Body:      { token: string }
// Response:  200 { ok, role, contract, property, signer, otherParty }
//            404 { ok:false, error:'invalid_or_used' }
//            410 { ok:false, error:'already_signed', role }
//            400 { ok:false, error:'missing_token' }

import { fsGet, readJson } from '../homie/_lib.js';
import { findContractByToken, setCors, rateOk } from './_shared.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 30)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });

  let hit;
  try { hit = await findContractByToken(token); }
  catch (e) {
    console.error('[magic-sign/lookup] lookup failed:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!hit) return res.status(404).json({ ok: false, error: 'invalid_or_used' });

  const { contract, role } = hit;

  // Sequential signing (BOOM protocol): the tenant commits first; the
  // landlord's countersignature is the acceptance. The landlord's link stays
  // parked until the tenant has signed — the partial-signature nudge emails it
  // again automatically at that moment. Escape hatch: signingOrder:'any'.
  if (role === 'landlord' && !contract.tenantSignature && contract.signingOrder !== 'any') {
    return res.status(409).json({ ok: false, error: 'awaiting_tenant' });
  }

  const alreadySigned = role === 'tenant'
    ? !!contract.tenantSignature
    : !!contract.landlordSignature;
  if (alreadySigned) {
    return res.status(410).json({
      ok: false, error: 'already_signed', role,
      signatureStatus: contract.signatureStatus || 'partial',
    });
  }

  // Fetch related docs server-side.
  let property = {};
  if (contract.propertyId) {
    try { property = (await fsGet('properties/' + contract.propertyId)) || {}; }
    catch (e) { console.warn('[magic-sign/lookup] property fetch:', e.message); }
  }
  const signerId = role === 'tenant' ? contract.tenantId : (property.ownerId || '');
  const otherId = role === 'tenant' ? (property.ownerId || '') : contract.tenantId;

  let signer = {}, otherParty = {};
  try { if (signerId) signer = (await fsGet('users/' + signerId)) || {}; } catch (_) {}
  try { if (otherId)  otherParty = (await fsGet('users/' + otherId))  || {}; } catch (_) {}

  // Sanitize: the signing UI needs the signer's name (to greet them), the
  // other party's name (to display), property summary, and contract
  // financial terms. Never expose tokens, signatures, IBANs, or the other
  // party's CF / address / docs.
  const sanitizedContract = {
    id: contract.id,
    type: contract.type || null,
    rent: contract.rent || 0,
    deposit: contract.deposit || 0,
    startDate: contract.startDate || null,
    endDate: contract.endDate || null,
    paymentDay: contract.paymentDay || null,
    propertyId: contract.propertyId || null,
    tenantId: contract.tenantId || null,
    generatedPDF: contract.generatedPDF || null,
    signatureStatus: contract.signatureStatus || null,
    // expose only the OTHER party's signed flag (so UI can show "waiting on landlord/tenant")
    tenantSigned: !!contract.tenantSignature,
    landlordSigned: !!contract.landlordSignature,
  };
  const sanitizedProperty = {
    id: property.id || null,
    name: property.name || '',
    address: property.address || '',
    zone: property.zone || '',
    ownerId: property.ownerId || null,
  };
  const safeUser = (u) => ({ id: u.id || null, name: u.name || '', email: u.email || '' });
  // The SIGNER's own identity is returned in full: the single-use token is the
  // credential, and /submit already lets its holder WRITE these same fields.
  // This powers the one-tap "Confirm your details" step. Normalized across the
  // two user schemas in use (wizard: codiceFiscale/birthDate/…; sign: cf/dob/…).
  // The other party stays minimal (name/email only).
  const signerIdentity = (u) => ({
    ...safeUser(u),
    cf: u.cf || u.codiceFiscale || '',
    dob: u.dob || u.birthDate || '',
    pob: u.pob || u.birthPlace || '',
    address: u.address || '',
    docType: u.docType || u.idDocType || '',
    docNum: u.docNum || u.idDocNumber || '',
    nationality: u.nationality || '',
    phone: u.phone || '',
  });

  return res.status(200).json({
    ok: true,
    role,
    contract: sanitizedContract,
    property: sanitizedProperty,
    signer: signerIdentity(signer),
    otherParty: safeUser(otherParty),
  });
}
