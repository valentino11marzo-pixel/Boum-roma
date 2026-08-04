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
import { findContractByToken, commitWrites, fsGetWithTime, tenantSideComplete, setCors, rateOk } from './_shared.js';

// ── TERMS FREEZE ──────────────────────────────────────────────────────────
// L'impronta dei termini ECONOMICI del contratto. La prima firma la congela
// sul documento (signedTermsHash + snapshot leggibile); ogni firma
// successiva la ricalcola sui valori CORRENTI e rifiuta con 409
// terms_changed se qualcuno ha toccato canone/date/deposito nel mezzo —
// nessuno controfirma mai condizioni diverse da quelle già firmate.
// Esportata e testata.
export function termsFingerprint(c) {
  return [
    'rent:' + Number(c.rent || 0),
    'deposit:' + Number(c.deposit || 0),
    'start:' + String(c.startDate || ''),
    'end:' + String(c.endDate || ''),
    'cadence:' + ([1, 2, 3, 6, 12].includes(Number(c.installmentMonths)) ? Number(c.installmentMonths) : 1),
    'type:' + String(c.type || ''),
    'cedolare:' + (((c.cedolareSecca || 'si') !== 'no' && c.cedolareSecca !== false) ? 'si' : 'no'),
  ].join('|');
}

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

// Una firma che fallisce non deve restare muta sul telefono del cliente:
// l'operatore la vede subito e può intervenire mentre la persona è ancora
// davanti allo schermo. Best-effort, mai bloccante, deduplicato per
// contratto+motivo (un cliente che riprova 5 volte non fa 5 allarmi).
async function alertSignFailure(contractId, role, reason, extra) {
  try {
    const { fsCreate } = await import('../homie/_lib.js');
    await fsCreate('agentNotifications', {
      type: 'contract.sign_failed',
      summary: `⛔ FIRMA FALLITA · ${contractId || 'token sconosciuto'} · ${role || '?'} · motivo: ${reason}${extra ? ' — ' + extra : ''}`,
      priority: 'urgent',
      ref: { collection: 'contracts', id: contractId || '' },
      payload: { contractId: contractId || '', role: role || '', reason: String(reason || '') },
      dedupKey: `sign-failed-${contractId || 'na'}-${reason}`,
      status: 'pending', actor: 'magic-sign',
      createdAt: new Date().toISOString(), attempts: 0,
    });
  } catch (e) { console.warn('[magic-sign/submit] alert:', e.message); }
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
  if (!isValidSignature(body.signature)) {
    alertSignFailure('', '', 'invalid_signature', 'lunghezza ' + String((body.signature || '').length));
    return res.status(400).json({ ok: false, error: 'invalid_signature' });
  }
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
  if (!hit) { alertSignFailure('', '', 'invalid_or_used', 'token non riconosciuto'); return res.status(404).json({ ok: false, error: 'invalid_or_used' }); }

  const { contract, role, coIndex } = hit;
  const contractId = contract.id;

  // Sequential signing guard (mirrors lookup — API can't bypass the order):
  // il locatore controfirma solo a LATO CONDUTTORI completo (principale +
  // tutti i co-conduttori). I co-conduttori firmano in parallelo tra loro.
  if (role === 'landlord' && !tenantSideComplete(contract) && contract.signingOrder !== 'any') {
    return res.status(409).json({ ok: false, error: 'awaiting_tenant' });
  }

  const already = role === 'tenant' ? !!contract.tenantSignature
    : role === 'cotenant' ? !!(((contract.coTenants || [])[coIndex] || {}).signature)
    : !!contract.landlordSignature;
  // signatureStatus lets a retrying signer (e.g. after a timed-out first
  // attempt that DID record the signature) render the right success state.
  if (already) return res.status(410).json({ ok: false, error: 'already_signed', role, signatureStatus: contract.signatureStatus || 'partial' });

  // ── 2. Build the signature update for the contract ──────
  const id = body.identity || {};
  // Il CF entra normalizzato (maiuscolo, senza spazi) — la validazione
  // checksum resta permissiva (expat con CF provvisori), ma il dato che
  // finisce su contratto/certificato/RLI è sempre in forma canonica.
  if (id.cf) id.cf = String(id.cf).toUpperCase().replace(/\s+/g, '').slice(0, 16);
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

  // OTP OBBLIGATORIO (flag `otpRequired` sul contratto): la firma esige il
  // telefono verificato via Firebase — il fattore in più che avvicina la
  // FES alla FEA. Default assente = off: nessun contratto esistente cambia.
  if (contract.otpRequired === true && !phoneVerified) {
    alertSignFailure(contract.id, role, 'otp_required', 'telefono non verificato');
    return res.status(428).json({ ok: false, error: 'otp_required' });
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
    upd.tenantDocIssuer = id.docIssuer || '';
    upd.tenantDocIssueDate = id.docIssueDate || '';
    upd.tenantNationality = id.nationality || '';
    upd.tenantSignature = body.signature;
    upd.tenantSignedAt = nowISO;
    upd.tenantSignedIP = reqIP || body.signerIP || '';
    upd.tenantSignedUA = reqUA || (body.signerUA || '').slice(0, 200);
    upd.tenantConsentText = consent.text;
    upd.tenantConsentHash = consent.hash;
    upd.tenantConsentAt = nowISO;
    // Il token NON si azzera più: chi riapre il proprio link deve vedere
    // "Hai già firmato ✓" (lookup 410), non "Link not valid". La firma
    // registrata blocca comunque ogni ri-uso (check already qui e in lookup).
    upd.tenantSignTokenUsedAt = nowISO;
    if (phoneVerified) {
      upd.tenantPhoneVerified = true;
      upd.tenantPhoneVerifiedAt = phone.verifiedAt || nowISO;
      upd.tenantPhone = phoneNumber;
    } else if (phone.number) {
      upd.tenantPhone = String(phone.number).slice(0, 30);
      upd.tenantPhoneVerified = false;
    }
  } else if (role === 'cotenant') {
    // La firma del co-conduttore vive DENTRO coTenants[idx]: l'array viene
    // riscritto dal dato FRESCO più avanti (dopo la rilettura), così la
    // precondizione updateTime protegge il read-modify-write anche da due
    // co-firmatari concorrenti.
  } else {
    upd.landlordCF = id.cf || '';
    upd.landlordAddress = id.address || '';
    upd.landlordDob = id.dob || '';
    upd.landlordPob = id.pob || '';
    upd.landlordDocType = id.docType || '';
    upd.landlordDocNum = id.docNum || '';
    upd.landlordDocIssuer = id.docIssuer || '';
    upd.landlordDocIssueDate = id.docIssueDate || '';
    upd.landlordNationality = id.nationality || '';
    upd.landlordSignature = body.signature;
    upd.landlordSignedAt = nowISO;
    upd.landlordSignedIP = reqIP || body.signerIP || '';
    upd.landlordSignedUA = reqUA || (body.signerUA || '').slice(0, 200);
    upd.landlordConsentText = consent.text;
    upd.landlordConsentHash = consent.hash;
    upd.landlordConsentAt = nowISO;
    upd.landlordSignTokenUsedAt = nowISO;
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
  // Il dovuto via Stripe è il SALDO: deposito pattuito meno quanto già
  // versato (es. alla firma della proposta) — mai il deposito pieno.
  // UN SOLO PADRONE per ogni incasso: se il saldo vive già come rata
  // depbal_ (rail pre-agreement: pagabile da /casa, promemoria T-7,
  // riconciliazione bancaria), il CTA Stripe alla firma NON lo chiede una
  // seconda volta.
  const depositBalance = Math.max(0, Number(contract.deposit || 0) - Number(contract.depositAlreadyPaidEur || 0));
  let depositPayToken = '';
  if (role === 'tenant' && depositBalance > 0 && !contract.depositPaid) {
    let depbalOwned = false;
    try { depbalOwned = !!(await fsGet('payments/depbal_' + contractId)); } catch (_) {}
    if (!depbalOwned) {
      depositPayToken = contract.depositPayToken || crypto.randomBytes(24).toString('hex');
      upd.depositPayToken = depositPayToken;
    }
  }

  // ── 3. Re-read FRESH (dati + updateTime per la precondizione) ──
  let fresh = null, freshTime = null;
  try {
    const pre = await fsGetWithTime('contracts/' + contractId);
    if (pre) { fresh = pre.data; freshTime = pre.updateTime; }
  } catch (e) { return res.status(500).json({ ok: false, error: 'reread_failed' }); }
  if (!fresh) return res.status(404).json({ ok: false, error: 'contract_vanished' });

  // Anti-doppione sul dato FRESCO (il check iniziale usava la query per
  // token, che può essere stantia di qualche secondo).
  const freshAlready = role === 'tenant' ? !!fresh.tenantSignature
    : role === 'cotenant' ? !!(((fresh.coTenants || [])[coIndex] || {}).signature)
    : !!fresh.landlordSignature;
  if (freshAlready) {
    return res.status(410).json({ ok: false, error: 'already_signed', role, signatureStatus: fresh.signatureStatus || 'partial' });
  }

  // TERMS FREEZE: verifica sui valori CORRENTI, congelamento alla prima firma.
  const currentTermsHash = sha256(termsFingerprint(fresh));
  if (fresh.signedTermsHash && fresh.signedTermsHash !== currentTermsHash) {
    try {
      const { fsCreate } = await import('../homie/_lib.js');
      fsCreate('agentNotifications', {
        type: 'contract.terms_changed',
        summary: `⚠ Termini modificati DOPO una firma · ${contractId} — controfirma BLOCCATA (serve nuova versione del contratto)`,
        priority: 'urgent',
        ref: { collection: 'contracts', id: contractId },
        payload: { contractId, role },
        dedupKey: `terms-changed-${contractId}`,
        status: 'pending', actor: 'magic-sign',
        createdAt: new Date().toISOString(), attempts: 0,
      }).catch(() => {});
    } catch (_) {}
    alertSignFailure(contractId, role, 'terms_changed', 'i termini sono cambiati dopo la prima firma — rimanda il link');
    return res.status(409).json({ ok: false, error: 'terms_changed' });
  }
  if (!fresh.signedTermsHash) {
    upd.signedTermsHash = currentTermsHash;
    upd.signedTermsAt = nowISO;
    upd.signedTerms = {
      rent: Number(fresh.rent || 0),
      deposit: Number(fresh.deposit || 0),
      startDate: String(fresh.startDate || ''),
      endDate: String(fresh.endDate || ''),
      installmentMonths: [1, 2, 3, 6, 12].includes(Number(fresh.installmentMonths)) ? Number(fresh.installmentMonths) : 1,
      type: String(fresh.type || ''),
      cedolareSecca: ((fresh.cedolareSecca || 'si') !== 'no' && fresh.cedolareSecca !== false) ? 'si' : 'no',
    };
  }

  // CO-FIRMA: riscrittura di coTenants[idx] dal dato fresco (identità
  // fill-only + firma + consenso). Fatta QUI, dopo la rilettura, così la
  // precondizione updateTime del write copre anche questo array.
  if (role === 'cotenant') {
    const list = (Array.isArray(fresh.coTenants) ? fresh.coTenants : []).map(x => ({ ...x }));
    if (!list[coIndex] || !list[coIndex].name) return res.status(404).json({ ok: false, error: 'invalid_or_used' });
    Object.assign(list[coIndex], {
      cf: id.cf || list[coIndex].cf || '',
      address: id.address || list[coIndex].address || '',
      dob: id.dob || list[coIndex].dob || '',
      birthPlace: id.pob || list[coIndex].birthPlace || '',
      idDoc: id.docNum || list[coIndex].idDoc || '',
      nationality: id.nationality || list[coIndex].nationality || '',
      signature: body.signature, signedAt: nowISO,
      signedIP: reqIP || body.signerIP || '',
      signedUA: reqUA || (body.signerUA || '').slice(0, 200),
      consentText: consent.text, consentHash: consent.hash, consentAt: nowISO,
      ...(phoneVerified ? { phone: phoneNumber, phoneVerified: true }
        : (phone.number ? { phone: String(phone.number).slice(0, 30) } : {})),
    });
    upd.coTenants = list;
  }

  // Firma completa = locatore + LATO CONDUTTORI al completo (questa firma
  // inclusa): principale e tutti i co-conduttori.
  const afterMine = { ...fresh, ...upd };
  let fullySigned = tenantSideComplete(afterMine) && !!afterMine.landlordSignature;
  upd.signatureStatus = fullySigned ? 'complete' : 'partial';
  if (fullySigned) {
    upd.status = 'active';
    upd.fullySignedAt = nowISO;
  }

  // ── 4. Write contract update (precondizione ottimistica) ──
  // Il patch è condizionato all'updateTime appena letto: se un altro submit
  // scrive nel mezzo (doppio tap, seconda scheda), Firestore risponde
  // FAILED_PRECONDITION — si rilegge e, se questo ruolo risulta già
  // firmato, si risponde 410 invece di sovrascrivere firma, IP e timestamp
  // del primo submit.
  try {
    if (freshTime) {
      try {
        await commitWrites([{ docPath: 'contracts/' + contractId, fields: upd, precondition: { updateTime: freshTime } }]);
      } catch (e) {
        if (/FAILED_PRECONDITION|precondition/i.test(String(e.message || ''))) {
          const again = await fsGet('contracts/' + contractId).catch(() => null);
          const nowSigned = again && (role === 'tenant' ? again.tenantSignature : again.landlordSignature);
          if (nowSigned) return res.status(410).json({ ok: false, error: 'already_signed', role, signatureStatus: (again && again.signatureStatus) || 'partial' });
          await fsPatch('contracts/' + contractId, upd);   // conflitto su ALTRI campi: riprova secca
        } else { throw e; }
      }
    } else {
      await fsPatch('contracts/' + contractId, upd);
    }
  } catch (e) {
    console.error('[magic-sign/submit] contract write:', e.message);
    alertSignFailure(contractId, role, 'contract_write_failed', String(e.message || '').slice(0, 160));
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
      if (after && tenantSideComplete(after) && after.landlordSignature && after.signatureStatus !== 'complete') {
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
          docIssuer: id.docIssuer || '',
          docIssueDate: id.docIssueDate || '',
          nationality: id.nationality || '',
          // Wizard-schema mirror: the Allegato B/C generators and parts of
          // the portal still read codiceFiscale/birthDate/… — without this,
          // identity collected at signing never reached a regenerated PDF.
          codiceFiscale: id.cf || '',
          birthDate: id.dob || '',
          birthPlace: id.pob || '',
          idDocType: id.docType || '',
          idDocNumber: id.docNum || '',
        };
        // First-time tenant signer: ensure base profile fields are seeded
        // so the post-signature account-activation flow has email/role/name.
        if (role === 'tenant') {
          const existing = await fsGet('users/' + targetUid);
          if (!existing) {
            patch.role = 'tenant';
            patch.name = body.signerName || '';
            // L'email del profilo (a cui parte il magic-link del portale)
            // preferisce quella GIÀ nota al sistema (deal/PA/invito) — il
            // campo digitato in pagina è solo il fallback.
            patch.email = contract.tenantEmail || body.signerEmail || '';
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

    // (e) Payment schedule — only if the MONTHLY schedule doesn't exist yet.
    // Deposit docs (dep_/depbal_, type 'deposit'/'deposit-balance') don't
    // count: the PA convert step writes depbal_<contractId> BEFORE signing,
    // and it must never suppress the rent installments.
    if (fullContract.startDate && fullContract.endDate && fullContract.rent) {
      try {
        const existing = (await fsList('payments', {
          filter: { field: 'contractId', op: 'EQUAL', value: contractId },
          limit: 10,
        })).filter(p => !String(p.type || '').startsWith('deposit'));
        if (!existing.length) {
          const writes = [];
          const pStart = new Date(fullContract.startDate);
          const pEnd = new Date(fullContract.endDate);
          const payDay = parseInt(fullContract.paymentDay, 10) || 5;
          // Cadence: 1 = monthly (default), 2/3/6/12 = bimonthly…annual.
          // The unit is a LEASE month (start day → day before the next
          // anniversary), not a calendar month, so a lease that begins on the
          // 10th is billed in full from day one and never loses its first
          // period. Each instalment is paid in advance and covers `step`
          // lease months — the last one is clamped and prorated to whatever
          // the lease actually has left.
          const step = [1, 2, 3, 6, 12].includes(Number(fullContract.installmentMonths))
            ? Number(fullContract.installmentMonths) : 1;
          const addMonths = (d, n) => {
            const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
            // month-end clamp: 31 Jan + 1 month = 28/29 Feb, never 3 March
            if (x.getDate() !== d.getDate()) x.setDate(0);
            return x;
          };
          // how many whole lease months the contract really spans
          let monthsTotal = 0;
          while (monthsTotal < 600 && addMonths(pStart, monthsTotal) <= pEnd) monthsTotal++;
          const perMonth = Math.round(
            ((Number(fullContract.installmentAmount) || fullContract.rent * step) / step) * 100
          ) / 100;

          for (let i = 0; i < monthsTotal; i += step) {
            const periodStart = addMonths(pStart, i);
            const covered = Math.min(step, monthsTotal - i);
            // due on the pay day of the period's month, never before the
            // period itself begins
            let due = new Date(periodStart.getFullYear(), periodStart.getMonth(), payDay);
            if (due < periodStart) due = periodStart;
            const month = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
            const lastCovered = addMonths(pStart, i + covered - 1);
            const coversTo = `${lastCovered.getFullYear()}-${String(lastCovered.getMonth() + 1).padStart(2, '0')}`;
            const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
            writes.push({
              docPath: 'payments/pay_' + contractId + '_' + month,
              fields: {
                contractId,
                tenantId: fullContract.tenantId || '',
                propertyId: fullContract.propertyId || '',
                amount: Math.round(perMonth * covered * 100) / 100,
                month,
                dueDate,
                status: 'pending',
                installmentMonths: covered,
                coversTo,
              },
              serverTimestampFields: ['createdAt'],
            });
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
    else { await _n.notifyPartialSignature(fullC, role, propertyDoc, role === 'cotenant' ? { coIndex } : {}); }
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
        : `Contratto firmato da ${role === 'cotenant' ? ('co-conduttore ' + ((((contract.coTenants || [])[coIndex]) || {}).name || (coIndex + 1))) : role} · ${contractId} (mancano altre firme)`,
      priority: fullySigned ? 'urgent' : 'low',
      ref: { collection: 'contracts', id: contractId },
      payload: { contractId, role, fullySigned },
      dedupKey: `contract-signed-${contractId}-${role}${role === 'cotenant' ? coIndex : ''}`,
      status: 'pending',
      actor: 'magic-sign',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[magic-sign/submit] notify failed:', e.message));
  } catch (e) { /* never block the response */ }

  // Deposit info for the tenant's success screen (Stripe checkout CTA).
  const deposit = (role === 'tenant' && depositBalance > 0 && !fresh.depositPaid && depositPayToken)
    ? { required: true, amountEur: depositBalance, payToken: depositPayToken }
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
