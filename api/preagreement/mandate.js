// api/preagreement/mandate.js — IL MANDATO DATO DOPO L'ACCETTAZIONE (21/09/2026).
//
// Il caso: il cliente ha accettato la proposta (magari senza la spunta del
// mandato, o su una proposta dove la console non l'aveva offerto), poi perde
// interesse e l'email del contratto resta chiusa. Rincorrerlo per una firma
// intera non funziona; chiedergli UN tap sì. La console preme «🖊 Chiedi il
// mandato» (askMandate:true + messaggio WhatsApp col link #mandate), la
// pagina della proposta mostra la card, il cliente spunta e conferma → da
// qui in poi l'operatore firma dalla console (api/preagreement/sign-for.js).
//
// LE REGOLE:
//  · pubblico, il token È la credenziale (come lookup/submit), rate limit;
//  · SOLO se la console l'ha chiesto (askMandate === true) — mai un mandato
//    che nessuno ha offerto, e mai dedotto: `mandate:true` esplicito;
//  · stesso testo e stesso hash della spunta all'accettazione (_consent.js);
//  · la base sono le condizioni APPROVATE: la foto presa all'accettazione
//    (approvedTerms) o, per una proposta accettata prima della v2, la
//    proposta stessa (chiusa: la console non la modifica più) — dichiarata;
//  · il contratto già nato eredita il mandato con la STESSA costruzione della
//    conversione (tenantMandateFor) — MAI sotto una firma del conduttore;
//  · idempotente: un secondo tap risponde already, non riscrive.
import { fsGet, fsPatch, fsList, fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { rateOk, mandateTermsHash } from '../magic-sign/_shared.js';
import { PA_MANDATE_TEXT, PA_MANDATE_HASH } from './_consent.js';
import { tenantMandateFor, coTenantMandateFor } from './convert.js';
import { storageUpload } from '../agent/_lib.js';
import { buildPaPdf } from './_pdf.js';
import MANDATO from '../../js/mandato-engine.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 10)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  const b = (await readJson(req)) || {};
  const token = typeof b.token === 'string' ? b.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });
  if (b.mandate !== true) return res.status(400).json({ ok: false, error: 'mandate_required' });

  let hit;
  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    hit = rows && rows[0];
  } catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
  const { id, ...pa } = hit;
  if (pa.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });
  if (pa.status !== 'accepted' && pa.status !== 'paid') return res.status(409).json({ ok: false, error: 'not_accepted_yet', status: pa.status });
  if (pa.askMandate !== true) return res.status(403).json({ ok: false, error: 'not_offered' });

  const now = new Date().toISOString();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 160);
  const mandate = { given: true, at: now, ip, ua, text: PA_MANDATE_TEXT, hash: PA_MANDATE_HASH, afterAcceptance: true };

  // ── IL CO-CONDUTTORE (23/09/2026) ─────────────────────────────────────
  // Stesso link della proposta, ma l'atto è della PERSONA: `coIndex` dice
  // chi, e il nome digitato deve essere il suo (sulla proposta il nome
  // digitato È la firma — qui vale lo stesso). Il mandato del principale
  // non copre mai gli altri.
  if (b.coIndex != null) {
    const ci = Number(b.coIndex);
    const list = Array.isArray(pa.tenants) ? pa.tenants.map(t => ({ ...t })) : [];
    if (!Number.isInteger(ci) || ci < 1 || ci >= list.length || !list[ci] || !list[ci].fullName) return res.status(400).json({ ok: false, error: 'bad_cotenant' });
    if (MANDATO.normText(b.name) !== MANDATO.normText(list[ci].fullName)) return res.status(400).json({ ok: false, error: 'name_mismatch' });
    if (list[ci].mandate && list[ci].mandate.given === true) return res.status(200).json({ ok: true, already: true, at: list[ci].mandate.at || null, coIndex: ci });
    list[ci].mandate = mandate;
    let approved = pa.approvedTerms;
    if (!(approved && approved.terms && approved.hash)) {
      const terms = MANDATO.termsFromProposal(pa);
      approved = { version: MANDATO.VERSION, at: now, terms, hash: mandateTermsHash(terms), source: 'proposal-at-mandate' };
    }
    await fsPatch('preAgreements/' + id, { tenants: list, approvedTerms: approved });
    const paNow = { ...pa, tenants: list, approvedTerms: approved };
    const cid = pa.contractId || ('pa_' + id);
    let contract = null;
    try { contract = await fsGet('contracts/' + cid); } catch (_) { contract = null; }
    let onContract = false, termsMatch = null;
    const coList = contract && Array.isArray(contract.coTenants) ? contract.coTenants.map(x => ({ ...x })) : [];
    const j = coList.findIndex(x => x && MANDATO.normText(x.name) === MANDATO.normText(list[ci].fullName));
    if (contract && j >= 0 && !coList[j].signature) {
      const cm = coTenantMandateFor(paNow, id, { ...contract, id: cid }, list[ci]);
      coList[j] = { ...coList[j], mandate: cm };
      await fsPatch('contracts/' + cid, { coTenants: coList });
      onContract = true; termsMatch = cm.termsMatch;
    }
    try {
      await fsCreate('agentNotifications', {
        type: 'contract.mandate_given',
        summary: `🖊 Mandato a firmare del co-conduttore ${list[ci].fullName} · ${pa.ref || id} — ✍️ Firmo io ora copre anche lui${termsMatch === false ? ' ⚠ condizioni del contratto diverse dalla proposta' : ''}`,
        priority: 'high',
        ref: { collection: 'preAgreements', id },
        payload: { paId: id, contractId: onContract ? cid : null, coIndex: ci, termsMatch },
        dedupKey: 'mandate-given-' + id + '-c' + ci,
        status: 'pending', actor: 'preagreement',
        createdAt: now, attempts: 0,
      });
    } catch (e) { console.warn('[preagreement/mandate] notify co:', e.message); }
    await logActivity('preagreement_mandate_given', 'contract', { paId: id, ref: pa.ref || '', coIndex: ci, onContract, termsMatch }, 'client');
    return res.status(200).json({ ok: true, at: now, coIndex: ci, onContract });
  }

  if (pa.mandate && pa.mandate.given === true) return res.status(200).json({ ok: true, already: true, at: pa.mandate.at || null });
  let approvedTerms = pa.approvedTerms;
  if (!(approvedTerms && approvedTerms.terms && approvedTerms.hash)) {
    const terms = MANDATO.termsFromProposal(pa);
    approvedTerms = { version: MANDATO.VERSION, at: now, terms, hash: mandateTermsHash(terms), source: 'proposal-at-mandate' };
  }
  const patch = { mandate, approvedTerms, mandateGivenAt: now };
  await fsPatch('preAgreements/' + id, patch);
  const paNow = { ...pa, ...patch };

  // Il contratto già nato eredita il mandato — solo se il conduttore non ha
  // ancora firmato (una firma viva non cambia natura a posteriori).
  const cid = pa.contractId || ('pa_' + id);
  let contract = null;
  try { contract = await fsGet('contracts/' + cid); } catch (_) { contract = null; }
  let onContract = false, termsMatch = null;
  if (contract && !contract.tenantSignature) {
    const tm = tenantMandateFor(paNow, id, { ...contract, id: cid });
    // il documento del mandato: la proposta accettata col testo firmato,
    // accanto al contratto (best-effort, come alla conversione)
    try {
      const buf = await buildPaPdf({ ...paNow, id, ref: pa.ref || id });
      if (buf) {
        const url = await storageUpload(`contracts/${cid}/mandato-conduttore.pdf`, buf, 'application/pdf');
        if (url) tm.docUrl = url;
      }
    } catch (e) { console.warn('[preagreement/mandate] mandato pdf:', e.message); }
    await fsPatch('contracts/' + cid, { tenantMandate: tm });
    onContract = true; termsMatch = tm.termsMatch;
  }

  // L'operatore lo sa entro un minuto (card Telegram via notify-pending):
  // da qui può firmare lui, dalla console.
  try {
    await fsCreate('agentNotifications', {
      type: 'contract.mandate_given',
      summary: `🖊 Mandato a firmare ricevuto · ${pa.ref || id} · ${((pa.tenant || {}).fullName) || ''} — ora puoi firmare tu dalla console (✍️ Firmo io)${termsMatch === false ? ' ⚠ condizioni del contratto diverse dalla proposta' : ''}`,
      priority: 'high',
      ref: { collection: 'preAgreements', id },
      payload: { paId: id, contractId: onContract ? cid : null, termsMatch },
      dedupKey: 'mandate-given-' + id,
      status: 'pending', actor: 'preagreement',
      createdAt: now, attempts: 0,
    });
  } catch (e) { console.warn('[preagreement/mandate] notify:', e.message); }
  await logActivity('preagreement_mandate_given', 'contract', { paId: id, ref: pa.ref || '', onContract, termsMatch }, 'client');

  return res.status(200).json({ ok: true, at: now, onContract });
}
