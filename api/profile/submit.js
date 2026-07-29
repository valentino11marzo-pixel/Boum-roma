// api/profile/submit.js
// Public — the client self-fills their anagrafica on /scheda. Writes run
// under admin creds (rules stay closed): contract party fields + users
// profile sync on BOTH schemas in circulation (sign: cf/dob/… AND wizard:
// codiceFiscale/birthDate/… — the Allegato generators and the RLI scheda
// read across the two) + landlords doc for the landlord role. Re-editable
// until that party signs; after the signature the identity is frozen (410),
// the same rule the Magic Sign audit imposes on the signed act.
//
// Method:   POST
// Body:     { t, identity:{ name, cf?, dob, pob, address, docType, docNum,
//             docIssuer?, docIssueDate?, nationality }, phone? }
// Response: 200 { ok, complete } | 404 | 410 { error:'already_signed' }

import { fsGet, fsPatch, fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { setCors, rateOk } from '../magic-sign/_shared.js';
import { parseSchedaRef, schedaLocked, identityComplete, validCF } from './_scheda.js';
// Static imports (Vercel NFT non traccia i lazy import di pacchetti npm):
// la conferma al cliente viaggia sul design system condiviso.
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, timeline } from '../preagreement/_notify.js';

const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 12)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const ref = parseSchedaRef(body && body.t);
  if (!ref) return res.status(404).json({ ok: false, error: 'invalid_link' });
  const { contractId, role } = ref;

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });
  if (schedaLocked(contract, role)) return res.status(410).json({ ok: false, error: 'already_signed' });

  const raw = (body && body.identity) || {};
  const id = {
    name:         clip(raw.name, 120),
    cf:           clip(raw.cf, 20).toUpperCase(),
    dob:          clip(raw.dob, 20),
    pob:          clip(raw.pob, 120),
    address:      clip(raw.address, 200),
    docType:      ['passport', 'id', 'permit', 'patente'].includes(raw.docType) ? raw.docType : 'passport',
    docNum:       clip(raw.docNum, 60),
    docIssuer:    clip(raw.docIssuer, 120),
    docIssueDate: clip(raw.docIssueDate, 20),
    nationality:  clip(raw.nationality, 80),
  };
  if (!id.name || id.name.length < 3) return res.status(400).json({ ok: false, error: 'name_required' });
  // CF is optional (a fresh expat may not have one yet) but never wrong:
  // an invalid checksum would poison the RLI registration downstream.
  if (id.cf && !validCF(id.cf)) return res.status(400).json({ ok: false, error: 'cf_invalid' });
  const phone = clip(body.phone, 30);

  const P = role === 'landlord' ? 'landlord' : 'tenant';
  const nowISO = new Date().toISOString();
  const upd = {};
  upd[P + 'Name'] = id.name;
  upd[P + 'CF'] = id.cf;
  upd[P + 'Dob'] = id.dob;
  upd[P + 'Pob'] = id.pob;
  upd[P + 'Address'] = id.address;
  upd[P + 'DocType'] = id.docType;
  upd[P + 'DocNum'] = id.docNum;
  upd[P + 'DocIssuer'] = id.docIssuer;
  upd[P + 'DocIssueDate'] = id.docIssueDate;
  upd[P + 'Nationality'] = id.nationality;
  if (phone) upd[P + 'Phone'] = phone;
  upd['scheda' + (P === 'tenant' ? 'Tenant' : 'Landlord') + 'At'] = nowISO;

  try { await fsPatch('contracts/' + contractId, upd); }
  catch (e) {
    console.error('[profile/submit] contract write:', e.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }

  // ── Profile sync (best-effort — the contract already holds the truth) ──
  let property = null;
  if (contract.propertyId) {
    try { property = await fsGet('properties/' + contract.propertyId); } catch (_) {}
  }
  const targetUid = role === 'tenant' ? (contract.tenantId || null) : ((property && property.ownerId) || null);
  if (targetUid) {
    try {
      await fsPatch('users/' + targetUid, {
        name: id.name,
        cf: id.cf, dob: id.dob, pob: id.pob, address: id.address,
        docType: id.docType, docNum: id.docNum,
        docIssuer: id.docIssuer, docIssueDate: id.docIssueDate,
        nationality: id.nationality,
        // wizard-schema mirror — the Allegato generators read these
        codiceFiscale: id.cf, birthDate: id.dob, birthPlace: id.pob,
        idDocType: id.docType, idDocNumber: id.docNum,
        ...(phone ? { phone } : {}),
        schedaUpdatedAt: nowISO,
      });
    } catch (e) { console.warn('[profile/submit] user sync:', e.message); }
  }
  if (role === 'landlord' && targetUid) {
    try {
      await fsPatch('landlords/' + targetUid, {
        name: id.name, codiceFiscale: id.cf, birthDate: id.dob, birthPlace: id.pob,
        address: id.address, idDocType: id.docType, idDocNumber: id.docNum,
      });
    } catch (e) { console.warn('[profile/submit] landlord sync:', e.message); }
  }

  const complete = identityComplete(id);
  await logActivity('scheda_submitted', 'contract', { contractId, role, complete }, 'scheda').catch(() => {});

  // ── Conferma al cliente (una volta sola, quando la scheda è completa) ──
  // Nel design system BOOM, nella lingua del lettore. Best-effort e con
  // timeout: un SMTP piantato non deve mai bloccare il submit.
  const confirmFlag = 'scheda' + (P === 'tenant' ? 'Tenant' : 'Landlord') + 'ConfirmedAt';
  if (complete && !contract[confirmFlag]) {
    try {
      let to = '';
      if (targetUid) { const u = await fsGet('users/' + targetUid).catch(() => null); to = (u && u.email) || ''; }
      if (!to && role === 'landlord') to = contract.landlordEmail || '';
      if (!to) to = contract[P + 'Email'] || '';
      if (to) {
        const escH = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
        const propLabel = escH((property && (property.name || property.address)) || 'your BOOM home');
        const first = escH(String(id.name).split(' ')[0]);
        const html = role === 'landlord'
          ? shell(
              para(`Gentile ${first},<br>grazie — la Sua scheda per <b>${propLabel}</b> è arrivata, completa. Non deve fare altro.`)
              + timeline([
                { title: 'Scheda ricevuta', note: 'Anagrafica registrata nei nostri sistemi' },
                { title: 'BOOM prepara il contratto', note: 'Con questi dati, senza ridigitare nulla' },
                { title: 'Firma digitale', note: 'Riceverà un link sicuro separato quando è il momento' },
              ])
              + fine('I Suoi dati sono usati solo per il contratto di locazione (GDPR). Per modifiche può riaprire lo stesso link finché il contratto non è firmato.'),
              'Scheda ricevuta — al resto pensiamo noi.')
          : shell(
              para(`Hi ${first},<br>thank you — your details for <b>${propLabel}</b> are in, complete. Nothing else to do for now.`)
              + timeline([
                { title: 'Details received', note: 'Your scheda is safely on file' },
                { title: 'BOOM prepares your contract', note: 'With these details — nothing to re-type' },
                { title: 'Digital signature', note: 'You’ll get a separate secure link when it’s time to sign' },
              ])
              + fine('Your data is used only for your rental contract (GDPR). Need a correction? Reopen the same link any time before signing.'),
              'Your details are in — we take it from here.');
        await Promise.race([
          sendEmail({ to, subject: role === 'landlord' ? `✓ Scheda ricevuta — ${propLabel}` : `✓ Your details are in — ${propLabel}`, html }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 15000)),
        ]);
        fsPatch('contracts/' + contractId, { [confirmFlag]: nowISO }).catch(() => {});
      }
    } catch (e) { console.warn('[profile/submit] confirmation email:', e.message); }
  }
  // Wake the operator's channels like magic-sign does — a completed scheda
  // usually means "regenerate the PDF and send the sign link".
  try {
    await fsCreate('agentNotifications', {
      type: 'scheda.completed',
      summary: `Scheda ${P === 'tenant' ? 'inquilino' : 'locatore'} compilata · ${id.name} · ${((property || {}).name) || contractId}${complete ? ' (completa)' : ' (parziale)'}`,
      priority: 'low',
      ref: { collection: 'contracts', id: contractId },
      payload: { contractId, role, complete },
      dedupKey: `scheda-${contractId}-${role}`,
      status: 'pending', actor: 'scheda',
      createdAt: nowISO, attempts: 0,
    });
  } catch (_) { /* never block the client on a notification */ }

  return res.status(200).json({ ok: true, complete });
}
