// api/preagreement/send-sign.js
// The console's 🖊 Magic Sign button — ONE tap that does the whole thing:
// converts the accepted/paid pre-agreement into the contract if it isn't
// already (identity + ID files + terms carried over), then emails the tenant
// their Magic-Sign link. Nothing reaches the client until the admin presses
// this — the admin runs many deals in parallel and stays in command of WHEN
// each signature request goes out. Re-pressing = resend (idempotent convert).
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body:     { id }                            // preAgreements doc id
// Response: { ok, contractId, tenantSignUrl, landlordSignUrl, emailed }

import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { convertPaToContract } from './convert.js';
import { sendContractSignEmail } from './_notify.js';
import { ensureContractPdf } from '../sign/_contractpdf.js';

const BASE = 'https://www.boomrome.com';

// Lo stato della firma letto dal CONTRATTO (i fatti: le firme presenti),
// non dall'etichetta — un doc legacy firmato dal portal può portare
// signatureStatus stantio. Esportata: la console e i test la usano.
export function signatureState(c) {
  if (!c || typeof c !== 'object') return { status: 'none', tenantSigned: false, landlordSigned: false, tenantSignedAt: null, landlordSignedAt: null, fullySignedAt: null };
  const iso = (v) => (!v ? null : typeof v === 'string' ? v : (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : (v && v.seconds) ? new Date(v.seconds * 1000).toISOString() : String(v));
  const tenantSigned = !!c.tenantSignature;
  const landlordSigned = !!c.landlordSignature;
  const status = c.signatureStatus === 'complete' || (tenantSigned && landlordSigned) ? 'complete'
    : (tenantSigned || landlordSigned || c.signatureStatus === 'partial') ? 'partial' : 'none';
  return {
    status, tenantSigned, landlordSigned,
    tenantSignedAt: iso(c.tenantSignedAt), landlordSignedAt: iso(c.landlordSignedAt),
    fullySignedAt: iso(c.fullySignedAt),
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const paId = b && typeof b.id === 'string' ? b.id.trim().slice(0, 80) : '';
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });

  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });
  if (pa.status !== 'accepted' && pa.status !== 'paid') {
    return res.status(409).json({ ok: false, error: 'not_accepted_yet', status: pa.status });
  }

  // Ensure the contract exists (idempotent — returns existing links if so;
  // an already-converted contract keeps its own delegate setting). Owner
  // signs directly unless the caller explicitly asks for delega.
  const out = await convertPaToContract({
    pa, paId,
    propertyId: b.propertyId || pa.propertyId,
    delegate: b.delegate === true,
    actor: auth.email || auth.uid,
  });
  if (!out.ok) {
    const code = out.error === 'no_property' ? 400 : out.error === 'property_not_found' ? 404 : 500;
    return res.status(code).json({ ok: false, error: out.error });
  }

  const tenantSignUrl = out.tenantSignUrl || pa.tenantSignUrl || null;
  const landlordSignUrl = out.landlordSignUrl || pa.landlordSignUrl || null;
  if (!tenantSignUrl) return res.status(409).json({ ok: false, error: 'already_signed' });

  // ── Il contratto è GIÀ firmato? Allora niente link morto ─────────────
  // I token non si azzerano più alla firma (il link riaperto dice «hai già
  // firmato»), quindi il vecchio check qui sopra non scattava mai e 🖊
  // Reinvia Magic Sign rispediva all'inquilino un invito a firmare un
  // contratto che aveva già firmato (12/09/2026: Inês, Viale Angelico 9 —
  // «Your rental contract is ready to sign» su un contratto attivo da
  // settembre). Ora si legge il contratto: con la firma dell'inquilino
  // sopra non parte nessuna email, si risponde lo STATO, e la proposta
  // viene stampata con quello stato — è anche la sanatoria per i deal
  // firmati prima che submit.js imparasse a stamparla.
  let contract = null;
  if (out.contractId) {
    try { contract = await fsGet('contracts/' + out.contractId); }
    catch (e) { console.warn('[pa/send-sign] contract read:', e.message); }
  }
  const sig = signatureState(contract);
  if (sig.tenantSigned) {
    const stamp = {
      contractId: out.contractId,
      contractSignatureStatus: sig.status,
      tenantSignUrl, landlordSignUrl,
      delegated: !!out.delegate,
    };
    if (sig.tenantSignedAt) stamp.tenantSignedAt = sig.tenantSignedAt;
    if (sig.landlordSignedAt) stamp.landlordSignedAt = sig.landlordSignedAt;
    if (sig.status === 'complete') stamp.contractFullySignedAt = sig.fullySignedAt || sig.landlordSignedAt || sig.tenantSignedAt;
    // Atteso, non fire-and-forget: questa stampa È la sanatoria — dopo la
    // risposta la funzione può essere congelata e un patch in volo perso.
    try { await fsPatch('preAgreements/' + paId, stamp); }
    catch (e) { console.warn('[pa/send-sign] pa stamp:', e.message); }
    logActivity('preagreement_sign_already', 'contract',
      { paId, ref: pa.ref || '', contractId: out.contractId, signatureStatus: sig.status }, auth.email || 'admin')
      .catch(() => {});
    return res.status(200).json({
      ok: true, alreadySigned: true, signatureStatus: sig.status,
      contractId: out.contractId, tenantSignUrl, landlordSignUrl,
      tenantSignedAt: sig.tenantSignedAt || null, landlordSignedAt: sig.landlordSignedAt || null,
      delegate: out.delegate || null, emailed: false,
    });
  }

  // Cintura e bretelle, PRIMA che il link parta: un contratto PA rimasto
  // senza generatedPDF (convertito prima di questo fix, o generazione
  // fallita al convert) lo ottiene qui — il cliente non deve mai aprire
  // /sign senza "View full contract PDF". Idempotente e mai bloccante:
  // a PDF già presente non fa nulla, e un errore non ferma l'invito.
  if (out.contractId) {
    try { await ensureContractPdf(out.contractId); }
    catch (e) { console.error('[pa/send-sign] contract pdf:', e.message); }
  }

  let emailed = false;
  try {
    const r = await sendContractSignEmail({
      pa, tenantSignUrl, landlordSignUrl, delegate: out.delegate, notifyClient: true,
    });
    emailed = !!r.client;
  } catch (e) { console.error('[pa/send-sign] email failed:', e.message); }

  fsPatch('preAgreements/' + paId, {
    signSentAt: new Date().toISOString(),
    signSentBy: auth.email || auth.uid,
    tenantSignUrl, landlordSignUrl,
  }).catch(() => {});
  // L'invito va STAMPATO ANCHE SUL CONTRATTO: journeyEligible tace il
  // ciclo casa sui contratti invitati-non-firmati, e il watchdog re-inviti
  // del reminder-cron riparte da signInviteTenantAt — senza questo stamp
  // il rail PA restava invisibile a entrambi.
  if (out.contractId && emailed) {
    fsPatch('contracts/' + out.contractId, {
      signInviteTenantAt: new Date().toISOString(),
    }).catch(() => {});
  }
  logActivity('preagreement_sign_sent', 'contract',
    { paId, ref: pa.ref || '', contractId: out.contractId, emailed }, auth.email || 'admin')
    .catch(() => {});

  return res.status(200).json({ ok: true, contractId: out.contractId, tenantSignUrl, landlordSignUrl, emailed });
}
