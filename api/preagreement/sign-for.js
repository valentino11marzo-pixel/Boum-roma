// api/preagreement/sign-for.js — ✍️ FIRMO IO: la firma in un tap dalla console
// (21/09/2026 — «poter firmare io per i clienti dopo che hanno accettato la
// pre-agreement, perché loro perdono l'interesse»).
//
// Il caso vero: il cliente accetta e firma la proposta, pensa sia tutto
// fatto, e l'email col link del contratto resta chiusa per settimane. Se
// sulla proposta ha dato il MANDATO a firmare (spunta a parte, o data dopo
// con api/preagreement/mandate.js), l'operatore può sottoscrivere il
// contratto in suo nome DA QUI, con la propria firma salvata una volta —
// senza aprire sign.html e disegnare col dito su ogni contratto. Poi, se il
// proprietario ha dato la delega (landlordDelegate), controfirma nello
// stesso tap: contratto firmato, certificato FES, fascicolo, pack, journey
// — tutto l'iter si sblocca come dopo due firme normali.
//
// LE REGOLE, che sono quelle di sempre — questo file NON le allenta:
//  · al posto del conduttore SOLO col mandato scritto sul contratto
//    (mandateCheck → 403 mandate_missing) e SOLO alle stesse condizioni
//    (409 mandate_terms_changed, con cosa è cambiato). Senza mandato la
//    console offre «🖊 Chiedi il mandato», mai una firma;
//  · la firma passa DALLO STESSO handler di magic-sign/submit, in-process
//    (il trucco di employees/_fiducia.js): stesse guardie, stesso terms
//    freeze, stesso finalize, stessa stampa sulla proposta. Nessuna seconda
//    strada per scrivere una firma;
//  · chi ha firmato resta scritto: tenantSignedByDelegate /
//    landlordSignedByDelegate → pagina firme, certificato, scheda ARPE;
//  · la delega del proprietario si arma da qui SOLO con una base scritta
//    dichiarata dall'operatore (landlordBasis), che viene stampata;
//  · SOLO admin: firmare per altri è l'atto dell'operatore, non di un owner;
//  · i co-conduttori NON sono coperti dal mandato (è del principale):
//    firmano col proprio link, e il proprietario aspetta loro.
//
// Method: POST · Bearer admin
//   { op:'signature', png }      salva la firma dell'operatore (una volta)
//   { op:'status', id }          il piano: cosa succederebbe premendo ✍️
//   { op:'sign', id, landlordDelegate?, landlordBasis?, propertyId?,
//     createProperty?, force? }  firma (conduttore per mandato → locatore per delega)
import crypto from 'node:crypto';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { convertPaToContract } from './convert.js';
import { ensureContractPdf } from '../sign/_contractpdf.js';
import { mandateCheck } from '../magic-sign/_shared.js';
import msSubmit, { MS_CONSENT_TEXT } from '../magic-sign/submit.js';
import { signatureState } from './send-sign.js';
import MANDATO from '../../js/mandato-engine.js';

const BASE = 'https://www.boomrome.com';
const SIG_MAX_LEN = 800_000;
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

// La firma dell'operatore: un PNG/JPEG disegnato UNA volta nella console
// (canvas → data URI), stessi limiti di magic-sign/submit.
export function validSignature(s) {
  return typeof s === 'string' && /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length > 200 && s.length < SIG_MAX_LEN;
}

// Il piano, puro: cosa può fare la console su QUESTO contratto (esportato e
// testato). Nessuna decisione qui viene presa al posto del server: alla
// firma vera magic-sign/submit ricontrolla tutto.
export function signPlan(contract, opSig) {
  const c = contract || {};
  const sig = signatureState(c);
  const chk = mandateCheck(c);
  const coT = (Array.isArray(c.coTenants) ? c.coTenants : []).filter(x => x && x.name);
  const coPending = coT.filter(x => !x.signature).map(x => x.name);
  const m = c.tenantMandate && c.tenantMandate.given === true ? c.tenantMandate : null;
  const dele = c.landlordDelegate && c.landlordDelegate.name ? c.landlordDelegate : null;
  return {
    signatureStatus: sig.status,
    tenantSigned: sig.tenantSigned,
    landlordSigned: sig.landlordSigned,
    mandate: m ? { at: m.at || null, ref: m.ref || null, docUrl: m.docUrl || null } : null,
    mandateOk: chk.ok,
    mandateReason: chk.reason || null,
    mandateDiff: chk.ok ? '' : MANDATO.describeDiff(chk.diff || []),
    landlordDelegate: dele ? { name: dele.name, basis: dele.basis || '', onBehalfOf: dele.onBehalfOf || '' } : null,
    coTenantsPending: coPending,
    operatorSignature: !!opSig,
    canSignTenant: !sig.tenantSigned && chk.ok && !!opSig,
    canSignLandlord: !sig.landlordSigned && !!dele && (sig.tenantSigned || chk.ok) && coPending.length === 0 && !!opSig,
  };
}

// magic-sign/submit IN-PROCESS (stesso trucco di employees/_fiducia.js):
// l'handler resta una funzione Vercel E una libreria. Tutte le guardie
// (mandato, termini, sequenza, already_signed, otp) e il finalize restano
// SUE. IP e UA sono quelli della richiesta dell'operatore: è lui che firma.
export async function signInProcess({ token, signature, identity, asDelegate, ip, ua, handler = msSubmit }) {
  const captured = { status: 0, body: null };
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': ip || '', 'user-agent': ua || 'boom-console', origin: BASE },
    body: {
      token, signature, identity: identity || {}, phone: {},
      asDelegate: asDelegate === true,
      consent: { text: MS_CONSENT_TEXT, hash: sha256(MS_CONSENT_TEXT) },
    },
    socket: {}, on() {},
  };
  const res = {
    status(c) { captured.status = c; return this; },
    json(b) { captured.body = b; return this; },
    setHeader() {}, end() { return this; },
  };
  await handler(req, res);
  return captured;
}

// L'identità ATTUALE del contratto, ripassata a submit tale e quale: submit
// riscrive i campi dal body (una firma dal telefono porta lo step Identity),
// quindi un body vuoto li cancellerebbe.
const tenantIdentity = (c) => ({
  cf: c.tenantCF || '', address: c.tenantAddress || '', dob: c.tenantDob || '', pob: c.tenantPob || '',
  docType: c.tenantDocType || '', docNum: c.tenantDocNum || '', docIssuer: c.tenantDocIssuer || '', docIssueDate: c.tenantDocIssueDate || '',
  nationality: c.tenantNationality || '',
});
const landlordIdentity = (c) => ({
  cf: c.landlordCF || '', address: c.landlordAddress || '', dob: c.landlordDob || '', pob: c.landlordPob || '',
  docType: c.landlordDocType || '', docNum: c.landlordDocNum || '', docIssuer: c.landlordDocIssuer || '', docIssueDate: c.landlordDocIssueDate || '',
  nationality: c.landlordNationality || '',
});

const errStatus = (e) => ({ mandate_missing: 403, mandate_terms_changed: 409, terms_changed: 409, awaiting_tenant: 409, already_signed: 410, invalid_or_used: 404, otp_required: 428, rate_limited: 429 })[e] || 500;

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // SOLO admin: firmare al posto di una parte è l'atto dell'operatore.
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  const b = (await readJson(req)) || {};
  const op = clip(b.op, 20) || 'sign';
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
  const ua = clip(req.headers['user-agent'], 200);
  const opName = clip((auth.profile || {}).name, 120) || clip(auth.email, 120) || 'Operatore BOOM';
  const sigDoc = 'operatorSignatures/' + auth.uid;
  const nowISO = new Date().toISOString();

  // ── La firma dell'operatore, salvata una volta ──────────────────────
  if (op === 'signature') {
    if (!validSignature(b.png)) return res.status(400).json({ ok: false, error: 'invalid_signature' });
    await fsPatch(sigDoc, { png: b.png, name: opName, email: auth.email || '', at: nowISO });
    await logActivity('operator_signature_saved', 'contract', { by: auth.email || auth.uid }, auth.email || 'admin');
    return res.status(200).json({ ok: true, saved: true, name: opName });
  }

  const paId = clip(b.id, 80);
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });
  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });
  if (pa.status !== 'accepted' && pa.status !== 'paid') {
    return res.status(409).json({ ok: false, error: 'not_accepted_yet', status: pa.status });
  }
  let opSig = null;
  try { opSig = await fsGet(sigDoc); } catch (_) { opSig = null; }
  if (opSig && !validSignature(opSig.png)) opSig = null;

  // Il contratto: quello dichiarato dalla proposta, o pa_<id> (id
  // deterministico — la proposta orfana del 13/09).
  let contractId = pa.contractId || null;
  let contract = null;
  try { contract = contractId ? await fsGet('contracts/' + contractId) : await fsGet('contracts/pa_' + paId); } catch (_) { contract = null; }
  if (contract && !contractId) contractId = 'pa_' + paId;

  if (op === 'status') {
    const plan = contract ? signPlan(contract, opSig) : {
      signatureStatus: 'none', tenantSigned: false, landlordSigned: false, needsContract: true,
      mandate: (pa.mandate && pa.mandate.given) ? { at: pa.mandate.at || null, ref: pa.ref || null } : null,
      mandateOk: !!(pa.mandate && pa.mandate.given), mandateReason: (pa.mandate && pa.mandate.given) ? null : 'mandate_missing',
      mandateDiff: '', landlordDelegate: null, coTenantsPending: [], operatorSignature: !!opSig,
      canSignTenant: !!(pa.mandate && pa.mandate.given) && !!opSig, canSignLandlord: false,
    };
    return res.status(200).json({ ok: true, contractId, hasContract: !!contract, operatorSignature: !!opSig, operatorName: opName, plan });
  }
  if (op !== 'sign') return res.status(400).json({ ok: false, error: 'bad_op' });

  // ── Le precondizioni PRIMA di qualunque scrittura ────────────────────
  if (!opSig) return res.status(409).json({ ok: false, error: 'operator_signature_missing' });
  const wantLandlordDelega = b.landlordDelegate === true;
  const landlordBasis = clip(b.landlordBasis, 200);
  if (wantLandlordDelega && !(contract && contract.landlordDelegate && contract.landlordDelegate.name) && landlordBasis.length < 8) {
    return res.status(400).json({ ok: false, error: 'landlord_basis_required' });
  }

  // Il contratto nasce qui se manca (idempotente, come 🖊 Magic Sign).
  if (!contract) {
    const out = await convertPaToContract({
      pa, paId, propertyId: b.propertyId || pa.propertyId,
      delegate: wantLandlordDelega, delegateName: opName,
      actor: auth.email || auth.uid, createProperty: b.createProperty === true, force: b.force === true,
    });
    if (!out.ok) {
      const code = out.error === 'no_property' ? 400 : out.error === 'property_not_found' ? 404 : out.error === 'overlap' ? 409 : 500;
      return res.status(code).json({ ok: false, error: out.error, ...(out.overlap ? { overlap: out.overlap } : {}), ...(out.canCreate != null ? { canCreate: out.canCreate } : {}) });
    }
    contractId = out.contractId;
    try { contract = await fsGet('contracts/' + contractId); } catch (_) { contract = null; }
    if (!contract) return res.status(500).json({ ok: false, error: 'contract_missing' });
    if (wantLandlordDelega && contract.landlordDelegate && landlordBasis) {
      // la base DICHIARATA dall'operatore vince sulla dicitura generica
      contract.landlordDelegate = { ...contract.landlordDelegate, basis: landlordBasis };
      await fsPatch('contracts/' + contractId, { landlordDelegate: contract.landlordDelegate });
    }
    try { await ensureContractPdf(contractId); } catch (e) { console.warn('[pa/sign-for] contract pdf:', e.message); }
  }

  const sig0 = signatureState(contract);
  if (sig0.status === 'complete') {
    return res.status(200).json({ ok: true, alreadySigned: true, signatureStatus: 'complete', contractId, signedPdfUrl: contract.signedPdfUrl || null, certificateUrl: contract.signingCertificateUrl || null, steps: [] });
  }
  const steps = [];

  // ── 1. IL CONDUTTORE, per mandato ────────────────────────────────────
  if (!sig0.tenantSigned) {
    const chk = mandateCheck(contract);
    if (!chk.ok) {
      return res.status(errStatus(chk.reason)).json({
        ok: false, error: chk.reason, contractId,
        changed: (chk.diff || []).map(d => d.key), changedText: MANDATO.describeDiff(chk.diff || []),
        landlordSignUrl: contract.landlordSignToken ? `${BASE}/sign?sign=${contract.landlordSignToken}` : null,
        tenantSignUrl: contract.tenantSignToken ? `${BASE}/sign?sign=${contract.tenantSignToken}` : null,
      });
    }
    if (!(contract.tenantDelegate && contract.tenantDelegate.name)) {
      const m = contract.tenantMandate || {};
      const dele = {
        name: opName,
        onBehalfOf: contract.tenantName || ((pa.tenant || {}).fullName) || 'il conduttore',
        basis: 'mandato scritto del conduttore' + (m.ref ? ' (proposta ' + m.ref + ')' : ''),
        at: nowISO, by: auth.uid, via: 'console',
      };
      await fsPatch('contracts/' + contractId, { tenantDelegate: dele });
      contract.tenantDelegate = dele;
    }
    const r = await signInProcess({ token: contract.tenantSignToken, signature: opSig.png, identity: tenantIdentity(contract), asDelegate: true, ip, ua });
    if (r.status !== 200) {
      const err = (r.body && r.body.error) || 'tenant_sign_failed';
      return res.status(r.status || 500).json({ ok: false, error: err, step: 'tenant', contractId, changed: (r.body && r.body.changed) || [] });
    }
    steps.push('tenant');
  }

  // ── 2. I CO-CONDUTTORI firmano col proprio link (il mandato è del principale) ──
  let fresh = null;
  try { fresh = await fsGet('contracts/' + contractId); } catch (_) { fresh = null; }
  if (!fresh) return res.status(500).json({ ok: false, error: 'reread_failed', steps });
  const coPending = (Array.isArray(fresh.coTenants) ? fresh.coTenants : []).filter(x => x && x.name && !x.signature).map(x => x.name);
  const landlordSignUrl = fresh.landlordSignToken ? `${BASE}/sign?sign=${fresh.landlordSignToken}` : null;
  if (coPending.length) {
    await logActivity('preagreement_sign_for', 'contract', { paId, contractId, steps, waitingCoTenants: coPending }, auth.email || 'admin');
    return res.status(200).json({ ok: true, partial: true, steps, waitingCoTenants: coPending, contractId, signatureStatus: fresh.signatureStatus || 'partial', landlordSignUrl });
  }

  // ── 3. IL LOCATORE, per delega (solo con una base scritta dichiarata) ──
  if (!fresh.landlordSignature) {
    let dele = (fresh.landlordDelegate && fresh.landlordDelegate.name) ? fresh.landlordDelegate : null;
    if (!dele && wantLandlordDelega) {
      dele = {
        name: opName,
        onBehalfOf: fresh.landlordName || ((pa.landlord || {}).name) || 'il proprietario',
        basis: landlordBasis, setAt: nowISO, setBy: auth.email || auth.uid, via: 'console',
      };
      await fsPatch('contracts/' + contractId, { landlordDelegate: dele });
    }
    if (!dele) {
      await logActivity('preagreement_sign_for', 'contract', { paId, contractId, steps, landlordPending: true }, auth.email || 'admin');
      return res.status(200).json({ ok: true, partial: true, steps, landlordPending: true, landlordSignUrl, contractId, signatureStatus: fresh.signatureStatus || 'partial' });
    }
    const r2 = await signInProcess({ token: fresh.landlordSignToken, signature: opSig.png, identity: landlordIdentity(fresh), asDelegate: false, ip, ua });
    if (r2.status !== 200) {
      const err = (r2.body && r2.body.error) || 'landlord_sign_failed';
      return res.status(r2.status || 500).json({ ok: false, error: err, step: 'landlord', steps, contractId, landlordSignUrl });
    }
    steps.push('landlord');
    try { fresh = await fsGet('contracts/' + contractId); } catch (_) {}
  }

  await logActivity('preagreement_sign_for', 'contract', { paId, ref: pa.ref || '', contractId, steps }, auth.email || 'admin');
  return res.status(200).json({
    ok: true, contractId, steps,
    signatureStatus: fresh.signatureStatus || 'partial',
    fullySigned: fresh.signatureStatus === 'complete' || !!(fresh.tenantSignature && fresh.landlordSignature),
    signedPdfUrl: fresh.signedPdfUrl || null,
    certificateUrl: fresh.signingCertificateUrl || null,
    finalized: !!fresh.finalizedAt,
    tenantSignedByDelegate: fresh.tenantSignedByDelegate || null,
    landlordSignedByDelegate: fresh.landlordSignedByDelegate || null,
  });
}
