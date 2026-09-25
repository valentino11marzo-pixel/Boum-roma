// api/profile/mandate.js — IL MANDATO DEL PROPRIETARIO, con un tap dalla
// sua Scheda (23/09/2026 — «e poi il dettaglio del mandato proprietario»).
//
// Il caso: ✍️ Firmo io firma per il conduttore in forza del SUO mandato
// scritto, poi si ferma: la controfirma del proprietario si reggeva su una
// base scritta DICHIARATA dall'operatore nel tap (landlordBasis) — cioè
// sulla parola dell'operatore. Qui è il proprietario a conferire il
// mandato, da solo, dal link personale che ha già (la Scheda: dati +
// documento + mandato in una visita), e da quel momento l'operatore
// controfirma dalla console «per mandato del proprietario del …».
//
// LE REGOLE (lo specchio di api/preagreement/mandate.js):
//  · pubblico, il token derivato della Scheda È la credenziale — SOLO il
//    token del LOCATORE (un token del conduttore → 403: il ruolo sta nella
//    derivazione, non si può scambiare); rate limit;
//  · SOLO se la console l'ha chiesto (contract.askLandlordMandate === true)
//    — mai un mandato che nessuno ha offerto — e mai dedotto: mandate:true
//    esplicito;
//  · il testo è UNO (_consent.js LL_MANDATE_TEXT: la Scheda lo mostra come
//    il server lo manda), registrato con hash, data, IP, UA;
//  · la base sono le condizioni del CONTRATTO al momento del conferimento
//    (termsFromContract → mandateTermsHash): la firma per mandato le
//    ricontrolla (landlordMandateCheck → 409 se cambiate);
//  · il documento (PDF) nasce qui, best-effort: un PDF che non nasce non
//    ferma il conferimento (che è il dato), e la console lo sa;
//  · a locatore già firmato → 410 (il mandato non ha più oggetto);
//  · idempotente: un secondo tap risponde already, non riscrive.
import { fsGet, fsPatch, fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { setCors, rateOk, mandateTermsHash, commitWrites } from '../magic-sign/_shared.js';
import { parseSchedaRef } from './_scheda.js';
import { LL_MANDATE_TEXT, LL_MANDATE_HASH } from '../preagreement/_consent.js';
import { storageUpload } from '../agent/_lib.js';
import { buildLandlordMandatePdf } from './_mandatopdf.js';
import MANDATO from '../../js/mandato-engine.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 10)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const ref = parseSchedaRef(body && body.t);
  if (!ref) return res.status(404).json({ ok: false, error: 'invalid_link' });
  if (ref.role !== 'landlord') return res.status(403).json({ ok: false, error: 'wrong_role' });
  if (body.mandate !== true) return res.status(400).json({ ok: false, error: 'mandate_required' });
  const { contractId } = ref;

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });
  if (contract.landlordSignature) return res.status(410).json({ ok: false, error: 'already_signed' });
  if (contract.landlordMandate && contract.landlordMandate.given === true) {
    return res.status(200).json({ ok: true, already: true, at: contract.landlordMandate.at || null, docUrl: contract.landlordMandate.docUrl || null });
  }
  if (contract.askLandlordMandate !== true) return res.status(403).json({ ok: false, error: 'not_offered' });

  let property = {};
  if (contract.propertyId) { try { property = (await fsGet('properties/' + contract.propertyId)) || {}; } catch (_) { property = {}; } }

  const now = new Date().toISOString();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 160);
  const landlordName = contract.landlordName || property.ownerName || '';
  const terms = MANDATO.termsFromContract(contract);
  const mandate = {
    given: true, at: now, ip, ua,
    name: landlordName,
    text: LL_MANDATE_TEXT, hash: LL_MANDATE_HASH,
    ref: contract.preAgreementRef || contractId,
    paId: contract.preAgreementId || null,
    termsVersion: MANDATO.VERSION,
    termsHash: mandateTermsHash(terms),
    terms,
    termsSource: 'contract-at-mandate',
    via: 'scheda',
  };

  // Il documento del mandato — best-effort: il conferimento è il dato.
  try {
    const buf = await buildLandlordMandatePdf({ contract, contractId, property, mandate, landlordName, text: LL_MANDATE_TEXT });
    if (buf && buf.length) {
      const url = await storageUpload(`contracts/${contractId}/mandato-locatore.pdf`, buf, 'application/pdf');
      if (url) mandate.docUrl = url;
    }
  } catch (e) { console.warn('[profile/mandate] mandato pdf:', e.message); }

  await fsPatch('contracts/' + contractId, { landlordMandate: mandate, landlordMandateAt: now });

  // La proposta lo sa (la console legge la riga): SOLO se esiste — mai una
  // proposta fantasma (precondizione exists:true, come la stampa delle firme).
  const paId = contract.preAgreementId || null;
  if (paId) {
    try { await commitWrites([{ docPath: 'preAgreements/' + paId, fields: { landlordMandateAt: now }, precondition: { exists: true } }]); }
    catch (e) { console.warn('[profile/mandate] pa stamp:', e.message); }
  }

  // L'operatore lo sa entro un minuto (card Telegram via notify-pending):
  // da qui controfirma lui, dalla console (✍️ Controfirmo io).
  try {
    await fsCreate('agentNotifications', {
      type: 'contract.landlord_mandate_given',
      summary: `🏠 Mandato a firmare del PROPRIETARIO ricevuto · ${landlordName || contractId} · ${property.name || property.address || ''} — ora puoi controfirmare tu dalla console (✍️ Controfirmo io)`,
      priority: 'high',
      ref: { collection: 'contracts', id: contractId },
      payload: { contractId, paId, docUrl: mandate.docUrl || null },
      dedupKey: 'landlord-mandate-given-' + contractId,
      status: 'pending', actor: 'scheda',
      createdAt: now, attempts: 0,
    });
  } catch (e) { console.warn('[profile/mandate] notify:', e.message); }
  await logActivity('landlord_mandate_given', 'contract', { contractId, paId, ref: mandate.ref, docUrl: mandate.docUrl || null }, 'client');

  return res.status(200).json({ ok: true, at: now, docUrl: mandate.docUrl || null });
}
