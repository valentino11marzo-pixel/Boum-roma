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

import { fsGet, fsPatch, fsCreate, readJson } from '../homie/_lib.js';
import { findContractByToken, tenantSideComplete, setCors, rateOk } from './_shared.js';
import { ensureContractPdf } from '../sign/_contractpdf.js';

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

  const { contract, role, coIndex } = hit;
  const coT = role === 'cotenant' ? (contract.coTenants || [])[coIndex] || {} : null;

  // Sequential signing (BOOM protocol): il LATO CONDUTTORI firma per primo
  // (principale + tutti i co-conduttori, in qualunque ordine tra loro); la
  // controfirma del locatore è l'accettazione e resta parcheggiata finché
  // il lato conduttori non è completo. Escape hatch: signingOrder:'any'.
  if (role === 'landlord' && !tenantSideComplete(contract) && contract.signingOrder !== 'any') {
    return res.status(409).json({ ok: false, error: 'awaiting_tenant' });
  }

  const alreadySigned = role === 'tenant' ? !!contract.tenantSignature
    : role === 'cotenant' ? !!(coT && coT.signature)
    : !!contract.landlordSignature;
  if (alreadySigned) {
    return res.status(410).json({
      ok: false, error: 'already_signed', role,
      signatureStatus: contract.signatureStatus || 'partial',
      signedAt: (role === 'tenant' ? contract.tenantSignedAt
        : role === 'cotenant' ? (coT && coT.signedAt)
        : contract.landlordSignedAt) || null,
    });
  }

  // ── Prima apertura: stampata sul contratto + ping all'operatore ──
  // "Ha aperto il contratto" è il segnale che prima non esisteva: nessuno
  // sapeva se il cliente avesse mai visto il link. Best-effort, una volta
  // sola per ruolo, mai bloccante.
  const viewedField = role === 'tenant' ? 'signViewedTenantAt'
    : role === 'cotenant' ? ('signViewedCo' + coIndex + 'At')
    : 'signViewedLandlordAt';
  if (!contract[viewedField]) {
    const nowISO = new Date().toISOString();
    fsPatch('contracts/' + contract.id, { [viewedField]: nowISO }).catch(() => {});
    fsCreate('agentNotifications', {
      type: 'contract.sign_opened',
      summary: `👀 ${role === 'tenant' ? "L'inquilino" : role === 'cotenant' ? ('Il co-conduttore ' + ((coT && coT.name) || '')) : 'Il locatore'} ha APERTO il contratto · ${contract.id}`,
      priority: 'low',
      ref: { collection: 'contracts', id: contract.id },
      payload: { contractId: contract.id, role },
      dedupKey: `sign-opened-${contract.id}-${role}${role === 'cotenant' ? coIndex : ''}`,
      status: 'pending', actor: 'magic-sign',
      createdAt: nowISO, attempts: 0,
    }).catch(() => {});
  }

  // ── L'ultima rete del PDF pre-firma ──────────────────────────────────
  // "View full contract PDF" sulla pagina di firma esiste solo se il
  // contratto porta generatedPDF. I contratti del portal lo hanno dalla
  // creazione; quelli del rail PA dal convert (server-side); ma un
  // contratto pre-fix, o un link condiviso via WhatsApp senza passare da
  // 🖊 Magic Sign, poteva ancora arrivare qui senza. La PRIMA apertura
  // genera (una volta sola: ensureContractPdf è idempotente e non tocca
  // MAI un contratto con una firma viva); un errore non blocca il lookup.
  if (!contract.generatedPDF) {
    try {
      const url = await ensureContractPdf(contract.id, contract);
      if (url) contract.generatedPDF = url;
    } catch (e) { console.warn('[magic-sign/lookup] contract pdf:', e.message); }
  }

  // Fetch related docs server-side.
  let property = {};
  if (contract.propertyId) {
    try { property = (await fsGet('properties/' + contract.propertyId)) || {}; }
    catch (e) { console.warn('[magic-sign/lookup] property fetch:', e.message); }
  }
  const tenantSide = role === 'tenant' || role === 'cotenant';
  const signerId = role === 'tenant' ? contract.tenantId : role === 'cotenant' ? '' : (property.ownerId || '');
  const otherId = tenantSide ? (property.ownerId || '') : contract.tenantId;

  let signer = {}, otherParty = {};
  try { if (signerId) signer = (await fsGet('users/' + signerId)) || {}; } catch (_) {}
  try { if (otherId)  otherParty = (await fsGet('users/' + otherId))  || {}; } catch (_) {}
  // Co-conduttore: il prefill viene dalla SUA identità sul contratto
  // (raccolta dal pre-agreement / Deal Link), mappata sullo schema sign.
  if (role === 'cotenant' && coT) {
    signer = {
      name: coT.name || '', email: coT.email || '', phone: coT.phone || '',
      cf: coT.cf || '', dob: coT.dob || '', pob: coT.birthPlace || '',
      address: coT.address || '', docNum: coT.idDoc || '', nationality: coT.nationality || '',
    };
  }

  // Landlord-name fallback: PA-converted contracts carry the landlord's
  // real identity (contract.landlordName) even when the property has no
  // ownerId/users doc — never show the counterpart as "—".
  const llName = contract.landlordName || (contract.landlordDelegate || {}).onBehalfOf || property.ownerName || '';
  if (tenantSide && !otherParty.name && llName) otherParty = { ...otherParty, name: llName };
  if (role === 'landlord' && !signer.name && llName) signer = { ...signer, name: llName, email: signer.email || contract.landlordEmail || '' };

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
    // delegate protocol: the landlord side is countersigned by the agency
    // per delega ("Valentino Egidi on behalf of …", as on the paper docs) —
    // the sign UI shows who signs for whom
    landlordDelegate: contract.landlordDelegate || null,
    preAgreementRef: contract.preAgreementRef || null,
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
    docIssuer: u.docIssuer || '',
    docIssueDate: u.docIssueDate || '',
    nationality: u.nationality || '',
    phone: u.phone || '',
  });

  return res.status(200).json({
    ok: true,
    // Il co-conduttore RENDE come un tenant (saluto, vista lato-conduttore):
    // il ruolo vero lo rideriva il server dal token al submit — la pagina
    // non è mai autorità sul ruolo.
    role: role === 'cotenant' ? 'tenant' : role,
    ...(role === 'cotenant' ? { cosign: { index: coIndex, name: (coT && coT.name) || '' } } : {}),
    contract: sanitizedContract,
    property: sanitizedProperty,
    signer: signerIdentity(signer),
    otherParty: safeUser(otherParty),
  });
}
