// api/magic-sign/submit.js
// Public endpoint that writes the contract signature on behalf of an
// anonymous Magic-Sign user. Replaces the previous flow which had the
// browser issue a long list of writes anonymously (signature, identity
// fields, user profile, landlord profile, deadlines, lead closure,
// property status, listing sync, payment schedule) — every one of those
// is now admin-only at the rules level.
//
// Method:    POST
// URL:       /api/magic-sign/submit
// Body:      {
//   token:       string                                     // required
//   signature:   string  (data:image/png;base64,...)        // required
//   signerIP:    string                                     // optional
//   signerUA:    string                                     // optional
//   identity:    { cf, address, dob, pob, docType, docNum, nationality }
//   phone:       { number, verified, verifiedAt }
//   consent:     { text, hash, at }                         // required
// }
//
// Response 200: { ok, role, contractId, signatureStatus, fullySigned }
// Response 4xx: { ok:false, error }

import { fsGet, fsPatch, fsList, readJson, logActivity } from '../homie/_lib.js';
import { findContractByToken, commitWrites, setCors, rateOk } from './_shared.js';

// Canonical consent — MUST equal sign.html's CONSENT and _finalize.js's
// MS_CONSENT: the certificate attests exactly this text.
const MS_CONSENT_TEXT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';
// finalizeContract is imported lazily at the call site (below) so a load
// failure in the post-signature step (e.g. an unresolved pdf-lib) can NEVER
// crash the signature write itself.

const SIG_MAX_LEN = 800_000; // ~600 KB base64 — generous for canvas signatures

function isValidSignature(s) {
  return typeof s === 'string'
    && s.startsWith('data:image/')
    && s.length > 200
    && s.length < SIG_MAX_LEN;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 12)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });
  if (!isValidSignature(body.signature)) return res.status(400).json({ ok: false, error: 'invalid_signature' });
  if (!body.consent || typeof body.consent.text !== 'string' || typeof body.consent.hash !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_consent' });
  }

  // ── 1. Resolve token ────────────────────────────────────
  let hit;
  try { hit = await findContractByToken(token); }
  catch (e) {
    console.error('[magic-sign/submit] lookup:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!hit) return res.status(404).json({ ok: false, error: 'invalid_or_used' });

  const { contract, role } = hit;
  const contractId = contract.id;

  // Sequential signing guard (mirrors lookup — API can't bypass the order).
  if (role === 'landlord' && !contract.tenantSignature && contract.signingOrder !== 'any') {
    return res.status(409).json({ ok: false, error: 'awaiting_tenant' });
  }

  const already = role === 'tenant' ? !!contract.tenantSignature : !!contract.landlordSignature;
  // signatureStatus lets a retrying signer (e.g. after a timed-out first
  // attempt that DID record the signature) render the right success state.
  if (already) return res.status(410).json({ ok: false, error: 'already_signed', role, signatureStatus: contract.signatureStatus || 'partial' });

  // ── 2. Build the signature update for the contract ──────
  const id = body.identity || {};
  const phone = body.phone || {};
  const consent = body.consent;

  // Evidence quality: derive IP/UA from the request itself; client-sent values
  // are only a fallback (they're spoofable and were being stored verbatim).
  const reqIP = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
  const reqUA = String(req.headers['user-agent'] || '').slice(0, 200);

  // Consent is pinned server-side: the text must be the canonical string the
  // FES certificate attests, and the hash must match it — a tampered client
  // cannot store a diverging consent record.
  const crypto = await import('node:crypto');
  const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
  if (consent.text !== MS_CONSENT_TEXT) {
    return res.status(400).json({ ok: false, error: 'invalid_consent_text' });
  }
  const expectedHash = sha256(MS_CONSENT_TEXT);
  if (consent.hash && consent.hash !== expectedHash) {
    return res.status(400).json({ ok: false, error: 'invalid_consent_hash' });
  }
  consent.hash = expectedHash;

  // Phone is "verified" ONLY when the browser presents a Firebase ID token
  // whose account really carries a phone credential — never from a client
  // boolean. The number recorded is the one inside the token.
  let phoneVerified = false;
  let phoneNumber = '';
  if (typeof phone.idToken === 'string' && phone.idToken.length > 100) {
    try {
      const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: phone.idToken }) }
      );
      const data = await r.json().catch(() => ({}));
      const u = data.users && data.users[0];
      if (u && u.phoneNumber) { phoneVerified = true; phoneNumber = u.phoneNumber; }
    } catch (e) { console.warn('[magic-sign/submit] phone token verify:', e.message); }
  }

  const nowISO = new Date().toISOString();

  const upd = {};
  // Identity fields the form collected during the multi-step flow.
  if (role === 'tenant') {
    upd.tenantCF = id.cf || '';
    upd.tenantAddress = id.address || '';
    upd.tenantDob = id.dob || '';
    upd.tenantPob = id.pob || '';
    upd.tenantDocType = id.docType || '';
    upd.tenantDocNum = id.docNum || '';
    upd.tenantNationality = id.nationality || '';
    upd.tenantSignature = body.signature;
    upd.tenantSignedAt = nowISO;
    upd.tenantSignedIP = reqIP || body.signerIP || '';
    upd.tenantSignedUA = reqUA || (body.signerUA || '').slice(0, 200);
    upd.tenantConsentText = consent.text;
    upd.tenantConsentHash = consent.hash;
    upd.tenantConsentAt = nowISO;
    upd.tenantSignToken = null;
    if (phoneVerified) {
      upd.tenantPhoneVerified = true;
      upd.tenantPhoneVerifiedAt = phone.verifiedAt || nowISO;
      upd.tenantPhone = phoneNumber;
    } else if (phone.number) {
      upd.tenantPhone = String(phone.number).slice(0, 30);
      upd.tenantPhoneVerified = false;
    }
  } else {
    upd.landlordCF = id.cf || '';
    upd.landlordAddress = id.address || '';
    upd.landlordDob = id.dob || '';
    upd.landlordPob = id.pob || '';
    upd.landlordDocType = id.docType || '';
    upd.landlordDocNum = id.docNum || '';
    upd.landlordNationality = id.nationality || '';
    upd.landlordSignature = body.signature;
    upd.landlordSignedAt = nowISO;
    upd.landlordSignedIP = reqIP || body.signerIP || '';
    upd.landlordSignedUA = reqUA || (body.signerUA || '').slice(0, 200);
    upd.landlordConsentText = consent.text;
    upd.landlordConsentHash = consent.hash;
    upd.landlordConsentAt = nowISO;
    upd.landlordSignToken = null;
    if (phoneVerified) {
      upd.landlordPhoneVerified = true;
      upd.landlordPhoneVerifiedAt = phone.verifiedAt || nowISO;
      upd.landlordPhone = phoneNumber;
    } else if (phone.number) {
      upd.landlordPhone = String(phone.number).slice(0, 30);
      upd.landlordPhoneVerified = false;
    }
    // Delegate protocol: when the contract carries landlordDelegate, this
    // countersignature is recorded as signed per delega ("X on behalf of Y")
    // — the audit trail and any certificate can attest who actually signed.
    if (contract.landlordDelegate && contract.landlordDelegate.name) {
      upd.landlordSignedByDelegate = {
        ...contract.landlordDelegate,
        signedAt: nowISO,
      };
    }
  }

  // ── 2b. Deposit-at-signature ─────────────────────────────
  // The tenant's success screen offers Stripe checkout for the security
  // deposit the moment they sign. The payToken is the credential for
  // /api/sign/deposit-checkout (the sign token is nulled by this request).
  let depositPayToken = '';
  if (role === 'tenant' && Number(contract.deposit || 0) > 0 && !contract.depositPaid) {
    depositPayToken = contract.depositPayToken || crypto.randomBytes(24).toString('hex');
    upd.depositPayToken = depositPayToken;
  }

  // ── 3. Re-read contract to determine combined signature status ──
  let fresh;
  try { fresh = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'reread_failed' }); }
  if (!fresh) return res.status(404).json({ ok: false, error: 'contract_vanished' });

  const otherSigned = role === 'tenant' ? !!fresh.landlordSignature : !!fresh.tenantSignature;
  let fullySigned = otherSigned;
  upd.signatureStatus = fullySigned ? 'complete' : 'partial';
  if (fullySigned) {
    upd.status = 'active';
    upd.fullySignedAt = nowISO;
  }

  // ── 4. Write contract update ───────────────────────────
  try { await fsPatch('contracts/' + contractId, upd); }
  catch (e) {
    console.error('[magic-sign/submit] contract write:', e.message);
    return res.status(500).json({ ok: false, error: 'contract_write_failed' });
  }

  // ── 4b. Close the double-signer race ────────────────────
  // Both parties submitting in the same window each read the contract BEFORE
  // the other's write landed → both compute 'partial', nobody runs the
  // completion cascade, and the contract strands. Re-read AFTER our write:
  // if both signatures are now present, upgrade to complete here.
  if (!fullySigned) {
    try {
      const after = await fsGet('contracts/' + contractId);
      if (after && after.tenantSignature && after.landlordSignature && after.signatureStatus !== 'complete') {
        fullySigned = true;
        upd.signatureStatus = 'complete';
        await fsPatch('contracts/' + contractId, { signatureStatus: 'complete', status: 'active', fullySignedAt: nowISO });
      } else if (after && after.signatureStatus === 'complete') {
        // The other request won the upgrade — let it run the cascade.
        fullySigned = false;
      }
    } catch (e) { console.warn('[magic-sign/submit] race re-read:', e.message); }
  }

  // ── 5. Sync signer profile (best-effort; do not fail the sign) ──
  const signerUserId = role === 'tenant' ? contract.tenantId : null;
  let propertyDoc = null;
  if (contract.propertyId) {
    try { propertyDoc = await fsGet('properties/' + contract.propertyId); } catch (_) {}
  }
  const landlordUserId = propertyDoc?.ownerId || null;

  if (signerUserId || (role === 'landlord' && landlordUserId)) {
    const targetUid = role === 'tenant' ? signerUserId : landlordUserId;
    if (targetUid) {
      try {
        const patch = {
          cf: id.cf || '',
          address: id.address || '',
          dob: id.dob || '',
          pob: id.pob || '',
          docType: id.docType || '',
          docNum: id.docNum || '',
          nationality: id.nationality || '',
        };
        // First-time tenant signer: ensure base profile fields are seeded
        // so the post-signature account-activation flow has email/role/name.
        if (role === 'tenant') {
          const existing = await fsGet('users/' + targetUid);
          if (!existing) {
            patch.role = 'tenant';
            patch.name = body.signerName || '';
            patch.email = body.signerEmail || '';
            patch.linkedContractId = contractId;
            patch.createdBy = 'magic_sign';
          }
        }
        await fsPatch('users/' + targetUid, patch);
      } catch (e) { console.warn('[magic-sign/submit] user profile sync:', e.message); }
    }
  }
  if (role === 'landlord' && landlordUserId) {
    try {
      await fsPatch('landlords/' + landlordUserId, {
        codiceFiscale: id.cf || '',
        birthDate: id.dob || '',
        birthPlace: id.pob || '',
        address: id.address || '',
        idDocType: id.docType || '',
        idDocNumber: id.docNum || '',
      });
    } catch (e) { console.warn('[magic-sign/submit] landlord sync:', e.message); }
  }

  // ── 6. Cascading writes when BOTH parties have signed ──
  let finalized = false;
  if (fullySigned) {
    const fullContract = { ...fresh, ...upd, id: contractId };
    const property = propertyDoc || {};

    // (a) RLI deadline (only if not already there)
    try {
      const rliHits = await fsList('deadlines', {
        filter: { field: 'linkedContractId', op: 'EQUAL', value: contractId },
        limit: 20,
      });
      const hasRLI = rliHits.some(d => String(d.title || '').startsWith('Registrare RLI'));
      if (!hasRLI) {
        const due = new Date(); due.setDate(due.getDate() + 25);
        const docId = 'rli_' + contractId;
        await commitWrites([{
          docPath: 'deadlines/' + docId,
          fields: {
            title: 'Registrare RLI - ' + (property.address || property.name || ''),
            type: 'contract_registration',
            date: due.toISOString().split('T')[0],
            priority: 'high',
            linkedContractId: contractId,
            linkedPropertyId: fullContract.propertyId || '',
            status: 'pending',
            autoGenerated: true,
          },
          serverTimestampFields: ['createdAt'],
        }]);
      }
    } catch (e) { console.warn('[magic-sign/submit] RLI deadline:', e.message); }

    // (b) Lead closure
    if (fullContract.linkedLeadId) {
      const leadCol = fullContract.linkedLeadSource === 'pfs' ? 'pfsClients' : 'leads';
      try {
        await commitWrites([{
          docPath: `${leadCol}/${fullContract.linkedLeadId}`,
          fields: { stage: 'closed', linkedContractId: contractId },
          serverTimestampFields: ['closedAt'],
        }]);
      } catch (e) { console.warn('[magic-sign/submit] lead close:', e.message); }
    }

    // (c) Property status
    if (fullContract.propertyId) {
      try {
        await fsPatch('properties/' + fullContract.propertyId, {
          status: 'rented',
          currentContractId: contractId,
        });
      } catch (e) { console.warn('[magic-sign/submit] property status:', e.message); }
    }

    // (d) Listing sync
    if (fullContract.propertyId) {
      try {
        const listings = await fsList('listings', {
          filter: { field: 'propertyId', op: 'EQUAL', value: fullContract.propertyId },
          limit: 1,
        });
        if (listings[0]) await fsPatch('listings/' + listings[0].id, { status: 'rented' });
      } catch (e) { console.warn('[magic-sign/submit] listing sync:', e.message); }
    }

    // (e) Payment schedule — only if none exists yet
    if (fullContract.startDate && fullContract.endDate && fullContract.rent) {
      try {
        const existing = await fsList('payments', {
          filter: { field: 'contractId', op: 'EQUAL', value: contractId },
          limit: 1,
        });
        if (!existing.length) {
          const writes = [];
          const pStart = new Date(fullContract.startDate);
          const pEnd = new Date(fullContract.endDate);
          const payDay = parseInt(fullContract.paymentDay, 10) || 5;
          let cur = new Date(pStart.getFullYear(), pStart.getMonth(), payDay);
          if (cur < pStart) cur.setMonth(cur.getMonth() + 1);
          let safety = 0;
          while (cur <= pEnd && safety++ < 60) {
            const month = cur.toISOString().slice(0, 7);
            const dueDate = cur.toISOString().split('T')[0];
            writes.push({
              docPath: 'payments/pay_' + contractId + '_' + month,
              fields: {
                contractId,
                tenantId: fullContract.tenantId || '',
                propertyId: fullContract.propertyId || '',
                amount: fullContract.rent,
                month,
                dueDate,
                status: 'pending',
              },
              serverTimestampFields: ['createdAt'],
            });
            cur.setMonth(cur.getMonth() + 1);
          }
          if (writes.length) await commitWrites(writes);
        }
      } catch (e) { console.warn('[magic-sign/submit] payment schedule:', e.message); }
    }

    // (f) Post-signature: fiscal+procedural obligations, FES signing certificate,
    // server-issued tenant magic link, welcome emails. Idempotent (contract.finalizedAt).
    // `finalized` is returned to the portal client so it skips its own
    // (duplicate) welcome-email + magic-link flow when the server handled it.
    try {
      const { finalizeContract } = await import('../sign/_finalize.js');
      const fin = await finalizeContract(fullContract);
      finalized = !!(fin && fin.ok);
    } catch (e) { console.warn('[magic-sign/submit] finalize:', e.message); }
  }

  // ── Stage notifications (server-side, best-effort, never blocking) ──
  // Partial → confirm the signer + nudge the counterparty with their /sign
  // link. Full → a concise milestone email to the operator (the party
  // welcomes are sent by finalize). Fires even when signing happened on
  // /sign with no portal open.
  try {
    const _n = await import('../sign/_notify.js');
    const fullC = { ...fresh, ...upd, id: contractId };
    if (fullySigned) { await _n.notifyAdminContractSigned(fullC, propertyDoc); }
    else { await _n.notifyPartialSignature(fullC, role, propertyDoc); }
  } catch (e) { console.warn('[magic-sign/submit] stage notify:', e.message); }

  // ── 7. Audit ───────────────────────────────────────────
  await logActivity('magic_sign_submitted', 'contract', {
    contractId, role, fullySigned,
  }, 'magic-sign');

  // Realtime event so the Mac-side daemon wakes Homie immediately:
  // - if both parties signed → contract.signed (urgent: docs to send,
  //   tenant user to create, property to flip to "rented", listing
  //   sync, lead to close)
  // - if only one signed → contract.signed/low (informational; the
  //   missing signer may need a nudge)
  try {
    const { fsCreate } = await import('../homie/_lib.js');
    fsCreate('agentNotifications', {
      type: 'contract.signed',
      summary: fullySigned
        ? `Contratto firmato da TUTTI · ${contractId} (chiudere il flow)`
        : `Contratto firmato da ${role} · ${contractId} (manca l'altra parte)`,
      priority: fullySigned ? 'urgent' : 'low',
      ref: { collection: 'contracts', id: contractId },
      payload: { contractId, role, fullySigned },
      dedupKey: `contract-signed-${contractId}-${role}`,
      status: 'pending',
      actor: 'magic-sign',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[magic-sign/submit] notify failed:', e.message));
  } catch (e) { /* never block the response */ }

  // Deposit info for the tenant's success screen (Stripe checkout CTA).
  const depositAmt = Number(contract.deposit || 0);
  const deposit = (role === 'tenant' && depositAmt > 0 && !fresh.depositPaid && depositPayToken)
    ? { required: true, amountEur: depositAmt, payToken: depositPayToken }
    : null;

  return res.status(200).json({
    ok: true,
    role,
    contractId,
    signatureStatus: upd.signatureStatus,
    fullySigned,
    finalized,
    deposit,
  });
}
