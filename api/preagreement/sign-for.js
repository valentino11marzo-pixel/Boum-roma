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
//  · il proprietario: col suo MANDATO scritto (dato da lui, con un tap
//    dalla sua Scheda — profile/mandate.js, 23/09/2026) la controfirma
//    parte da qui «per mandato del …», SOLO alle stesse condizioni (409
//    landlord_mandate_terms_changed); senza mandato resta la delega a base
//    scritta DICHIARATA dall'operatore (landlordBasis), che viene stampata
//    — e la console offre «🏠 Chiedi il mandato al proprietario»;
//  · SOLO admin: firmare per altri è l'atto dell'operatore, non di un owner;
//  · i co-conduttori NON sono coperti dal mandato (è del principale):
//    firmano col proprio link, e il proprietario aspetta loro.
//
// Method: POST · Bearer admin
//   { op:'signature', png }      salva la firma dell'operatore (una volta)
//   { op:'status', id }          il piano: cosa succederebbe premendo ✍️
//   { op:'ask-landlord-mandate', id, propertyId?, createProperty? }
//                                arma la richiesta sulla Scheda del locatore
//                                (contratto creato se manca) → { url, message }
//   { op:'sign', id, landlordDelegate?, landlordBasis?, propertyId?,
//     createProperty?, force? }  firma (conduttore per mandato → locatore per
//                                mandato, o per delega dichiarata)
import crypto from 'node:crypto';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { convertPaToContract } from './convert.js';
import { ensureContractPdf } from '../sign/_contractpdf.js';
import { mandateCheck, landlordMandateCheck } from '../magic-sign/_shared.js';
import msSubmit, { MS_CONSENT_TEXT } from '../magic-sign/submit.js';
import { signatureState } from './send-sign.js';
import { schedaUrl } from '../profile/_scheda.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, btn, para, fine } from './_notify.js';
import MANDATO from '../../js/mandato-engine.js';

const BASE = 'https://www.boomrome.com';
const SIG_MAX_LEN = 800_000;
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const itDate = (iso) => { try { return new Date(iso).toLocaleDateString('it-IT'); } catch (_) { return String(iso || '').slice(0, 10); } };
// Il link della Scheda del locatore, con l'ancora della card del mandato.
export const landlordMandateUrl = (contractId) => schedaUrl(contractId, 'landlord') + '#mandato';
// Il messaggio (IT — il locatore è italiano) che la console manda su
// WhatsApp o copia: una copia sola, testata.
export function landlordMandateMessage({ name, propLabel, url }) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return 'Ciao' + (first ? ' ' + first : '') + '! Per risparmiarti la firma del contratto' + (propLabel ? ' di ' + propLabel : '') + ': apri la tua scheda BOOM e tocca «Do a BOOM il mandato a firmare» — firmiamo noi il contratto per te, esattamente alle condizioni concordate (conduttore, canone, durata, deposito), e ricevi via email il contratto firmato e il suo certificato. ' + url;
}

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
  // Il mandato del PROPRIETARIO (dalla sua Scheda): vale solo alle condizioni
  // su cui l'ha dato — il verdetto lo stesso che sign e submit ricalcolano.
  const lm = c.landlordMandate && c.landlordMandate.given === true ? c.landlordMandate : null;
  const lchk = lm ? landlordMandateCheck(c) : null;
  return {
    signatureStatus: sig.status,
    tenantSigned: sig.tenantSigned,
    landlordSigned: sig.landlordSigned,
    mandate: m ? { at: m.at || null, ref: m.ref || null, docUrl: m.docUrl || null } : null,
    mandateOk: chk.ok,
    mandateReason: chk.reason || null,
    mandateDiff: chk.ok ? '' : MANDATO.describeDiff(chk.diff || []),
    landlordDelegate: dele ? { name: dele.name, basis: dele.basis || '', onBehalfOf: dele.onBehalfOf || '', basisKind: dele.basisKind || (dele.mandateHash ? 'mandate' : 'declared') } : null,
    landlordMandate: lm ? { at: lm.at || null, ref: lm.ref || null, docUrl: lm.docUrl || null, name: lm.name || '' } : null,
    landlordMandateOk: lm ? lchk.ok : false,
    landlordMandateReason: lm ? (lchk.reason || null) : 'landlord_mandate_missing',
    landlordMandateDiff: lm && !lchk.ok ? MANDATO.describeDiff(lchk.diff || []) : '',
    askLandlordMandate: c.askLandlordMandate === true,
    coTenantsPending: coPending,
    operatorSignature: !!opSig,
    canSignTenant: !sig.tenantSigned && chk.ok && !!opSig,
    // il locatore si controfirma da qui col SUO mandato (verificato) oppure
    // con una delega armata; sempre dopo il lato conduttori completo
    canSignLandlord: !sig.landlordSigned && ((lm && lchk.ok) || (!!dele && !lm)) && (sig.tenantSigned || chk.ok) && coPending.length === 0 && !!opSig,
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

const errStatus = (e) => ({ mandate_missing: 403, mandate_terms_changed: 409, landlord_mandate_terms_changed: 409, terms_changed: 409, awaiting_tenant: 409, already_signed: 410, invalid_or_used: 404, otp_required: 428, rate_limited: 429 })[e] || 500;

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
      mandateDiff: '', landlordDelegate: null, landlordMandate: null, landlordMandateOk: false, landlordMandateReason: 'landlord_mandate_missing', landlordMandateDiff: '', askLandlordMandate: false,
      coTenantsPending: [], operatorSignature: !!opSig,
      canSignTenant: !!(pa.mandate && pa.mandate.given) && !!opSig, canSignLandlord: false,
    };
    return res.status(200).json({ ok: true, contractId, hasContract: !!contract, operatorSignature: !!opSig, operatorName: opName, plan, landlordMandateUrl: contract ? landlordMandateUrl(contractId) : null });
  }

  // ── 🏠 CHIEDI IL MANDATO AL PROPRIETARIO ─────────────────────────────
  // Arma la card sulla Scheda del locatore (askLandlordMandate — mai un
  // mandato che nessuno ha offerto) e restituisce il link e il messaggio
  // pronto; al locatore con un'email parte anche l'email (best-effort). Il
  // contratto nasce qui se manca (idempotente, come 🖊): la Scheda è del
  // contratto, e il mandato copre le condizioni di QUEL contratto.
  if (op === 'ask-landlord-mandate') {
    if (!contract) {
      const out = await convertPaToContract({
        pa, paId, propertyId: b.propertyId || pa.propertyId,
        actor: auth.email || auth.uid, createProperty: b.createProperty === true, force: b.force === true,
      });
      if (!out.ok) {
        const code = out.error === 'no_property' ? 400 : out.error === 'property_not_found' ? 404 : out.error === 'overlap' ? 409 : 500;
        return res.status(code).json({ ok: false, error: out.error, ...(out.overlap ? { overlap: out.overlap } : {}), ...(out.canCreate != null ? { canCreate: out.canCreate } : {}) });
      }
      contractId = out.contractId;
      try { contract = await fsGet('contracts/' + contractId); } catch (_) { contract = null; }
      if (!contract) return res.status(500).json({ ok: false, error: 'contract_missing' });
    }
    if (contract.landlordSignature) return res.status(410).json({ ok: false, error: 'already_signed', contractId });
    const already = !!(contract.landlordMandate && contract.landlordMandate.given === true);
    if (!already && contract.askLandlordMandate !== true) {
      await fsPatch('contracts/' + contractId, { askLandlordMandate: true, landlordMandateAskedAt: nowISO, landlordMandateAskedBy: auth.email || auth.uid });
    }
    let property = null;
    if (contract.propertyId) { try { property = await fsGet('properties/' + contract.propertyId); } catch (_) { property = null; } }
    const propLabel = (property && (property.name || property.address)) || ((pa.property || {}).address) || '';
    const name = contract.landlordName || ((pa.landlord || {}).name) || (property && property.ownerName) || '';
    const url = landlordMandateUrl(contractId);
    const message = landlordMandateMessage({ name, propLabel, url });
    const email = String(contract.landlordEmail || ((pa.landlord || {}).email) || '').trim();
    const phone = String(contract.landlordPhone || ((pa.landlord || {}).phone) || '').trim();
    let emailed = false;
    if (!already && email && EMAIL_RE.test(email)) {
      try {
        const html = shell(
          para('Gentile ' + esc(name || 'proprietario') + ',<br><br>per risparmiarle la firma del contratto' + (propLabel ? ' di <b>' + esc(propLabel) + '</b>' : '') + ' può conferire a BOOM il mandato a firmarlo per suo conto, esattamente alle condizioni concordate (conduttore, canone, durata, deposito, modello). Bastano due tap dalla sua scheda: legge le condizioni, spunta, conferma. Riceverà via email il contratto firmato e il suo certificato.')
          + btn(url, 'Apri la scheda e dai il mandato')
          + fine('Il link è personale. Il mandato è gratuito, vale solo per quelle condizioni ed è revocabile per iscritto fino alla firma. Se preferisce firmare di persona, ignori questa email: le manderemo il suo link di firma.'),
          'Il mandato a firmare — due tap dalla sua scheda.',
        );
        await sendEmail({ to: email, subject: ('Contratto ' + (propLabel ? propLabel + ' ' : '') + '— il mandato a firmare (due tap)').replace(/\s+/g, ' ').trim(), html, text: message });
        emailed = true;
        await fsPatch('contracts/' + contractId, { landlordMandateAskedTo: email });
      } catch (e) { console.warn('[pa/sign-for] ask landlord mandate email:', e.message); }
    }
    await logActivity('preagreement_ask_landlord_mandate', 'contract', { paId, contractId, emailed, already }, auth.email || 'admin');
    return res.status(200).json({ ok: true, contractId, url, message, phone: phone || null, email: email || null, emailed, already, at: already ? (contract.landlordMandate.at || null) : null });
  }
  if (op !== 'sign') return res.status(400).json({ ok: false, error: 'bad_op' });

  // ── Le precondizioni PRIMA di qualunque scrittura ────────────────────
  if (!opSig) return res.status(409).json({ ok: false, error: 'operator_signature_missing' });
  const wantLandlordDelega = b.landlordDelegate === true;
  const landlordBasis = clip(b.landlordBasis, 200);
  const hasLandlordMandate = !!(contract && contract.landlordMandate && contract.landlordMandate.given === true);
  if (wantLandlordDelega && !hasLandlordMandate && !(contract && contract.landlordDelegate && contract.landlordDelegate.name) && landlordBasis.length < 8) {
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

  // ── 3. IL LOCATORE: per MANDATO (dato da lui sulla Scheda) o per delega
  //      a base scritta dichiarata dall'operatore ──────────────────────────
  if (!fresh.landlordSignature) {
    let dele = (fresh.landlordDelegate && fresh.landlordDelegate.name) ? fresh.landlordDelegate : null;
    const lm = (fresh.landlordMandate && fresh.landlordMandate.given === true) ? fresh.landlordMandate : null;
    if (lm) {
      // Il mandato vale SOLO alle condizioni su cui il proprietario l'ha
      // dato: si verifica QUI, prima di armare la delega e di firmare
      // (submit lo ricontrolla comunque). Cambiate → 409, nessuna firma.
      const lchk = landlordMandateCheck(fresh);
      if (!lchk.ok) {
        await logActivity('preagreement_sign_for', 'contract', { paId, contractId, steps, landlordMandateTermsChanged: lchk.diff.map(d => d.key) }, auth.email || 'admin');
        return res.status(409).json({ ok: false, error: 'landlord_mandate_terms_changed', step: 'landlord', steps, contractId, changed: lchk.diff.map(d => d.key), changedText: MANDATO.describeDiff(lchk.diff || []), landlordSignUrl });
      }
      if (!dele || dele.basisKind !== 'mandate' || dele.mandateHash !== (lm.hash || '')) {
        dele = {
          name: opName,
          onBehalfOf: lm.name || fresh.landlordName || ((pa.landlord || {}).name) || 'il proprietario',
          basis: 'mandato scritto del proprietario' + (lm.at ? ' del ' + itDate(lm.at) : '') + (lm.ref ? ' (' + lm.ref + ')' : ''),
          basisKind: 'mandate', mandateRef: lm.ref || '', mandateAt: lm.at || '', mandateHash: lm.hash || '',
          setAt: nowISO, setBy: auth.email || auth.uid, via: 'console',
        };
        await fsPatch('contracts/' + contractId, { landlordDelegate: dele });
      }
    } else if (!dele && wantLandlordDelega) {
      dele = {
        name: opName,
        onBehalfOf: fresh.landlordName || ((pa.landlord || {}).name) || 'il proprietario',
        basis: landlordBasis, basisKind: 'declared', setAt: nowISO, setBy: auth.email || auth.uid, via: 'console',
      };
      await fsPatch('contracts/' + contractId, { landlordDelegate: dele });
    }
    if (!dele) {
      await logActivity('preagreement_sign_for', 'contract', { paId, contractId, steps, landlordPending: true }, auth.email || 'admin');
      return res.status(200).json({ ok: true, partial: true, steps, landlordPending: true, landlordSignUrl, landlordMandateUrl: landlordMandateUrl(contractId), askLandlordMandate: fresh.askLandlordMandate === true, contractId, signatureStatus: fresh.signatureStatus || 'partial' });
    }
    // asDelegate:true — è l'OPERATORE che firma: submit stampa
    // landlordSignedByDelegate (con mandateRef/At/Hash quando c'è il mandato)
    const r2 = await signInProcess({ token: fresh.landlordSignToken, signature: opSig.png, identity: landlordIdentity(fresh), asDelegate: true, ip, ua });
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
