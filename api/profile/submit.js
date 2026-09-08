// api/profile/submit.js
// Public — the client self-fills their anagrafica on /scheda. Writes run
// under admin creds (rules stay closed): contract party fields + users
// profile sync on BOTH schemas in circulation (sign: cf/dob/… AND wizard:
// codiceFiscale/birthDate/… — the Allegato generators and the RLI scheda
// read across the two) + landlords doc for the landlord role. Re-editable
// until that party signs; after the signature the identity is frozen (410),
// the same rule the Magic Sign audit imposes on the signed act.
//
// LA SCHEDA CHE SI ADATTA: oltre a `identity`, il body porta `answers` —
// le risposte alle sezioni extra che la pagina ha mostrato SOLO perché
// mancavano (esigenza transitoria, corso di studi, conviventi, fatti
// dell'immobile, tabelle millesimali, contatti). Chi decide cosa si scrive
// è il dizionario (js/contract-fields.js → applyAnswers): un token tenant
// non scrive MAI un fatto dell'immobile, un token landlord non tocca mai i
// campi del conduttore, un valore invalido non entra — e ogni scarto torna
// nella risposta (`rejected`), mai in silenzio. I fatti dell'immobile
// atterrano su properties/<id> (è quello che contract-pdf.js legge), i
// campi di parte e le mappe annidate (propertyExtra, studenti) sul
// contratto, i contatti anche sul profilo utente.
//
// Method:   POST
// Body:     { t, identity?:{ name, cf?, dob, pob, address, docType, docNum,
//             docIssuer?, docIssueDate?, nationality }, phone?,
//             answers?: { <key>: value } }
// Response: 200 { ok, complete, missing:[{key,label}], applied:[], rejected:[{key,why}] }
//           | 404 | 410 { error:'already_signed' }

import { fsGet, fsPatch, fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { setCors, rateOk, fsGetWithTime, commitWrites } from '../magic-sign/_shared.js';
import { parseSchedaRef, schedaLocked, identityComplete } from './_scheda.js';
import FIELDS from '../../js/contract-fields.js';
// Static imports (Vercel NFT non traccia i lazy import di pacchetti npm):
// la conferma al cliente viaggia sul design system condiviso.
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, timeline } from '../preagreement/_notify.js';

const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);

// Lista bianca dei fatti dell'immobile che un locatore può scrivere dalla
// Scheda: la stessa che il dizionario dichiara (write/also su 'property' +
// il blob catastale ricomposto) — derivata, non ricopiata, così un campo
// nuovo nel dizionario non resta fuori e un campo tolto non resta dentro.
const PROPERTY_KEYS = new Set(FIELDS.PROPERTY_WRITE_KEYS);

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
  const { contractId, role, coIndex } = ref;

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });
  if (role === 'cotenant' && !(Array.isArray(contract.coTenants) ? contract.coTenants : [])[coIndex]) return res.status(404).json({ ok: false, error: 'not_found' });
  if (schedaLocked(contract, role, coIndex)) return res.status(410).json({ ok: false, error: 'already_signed' });

  // ── CO-CONDUTTORE: scrive SOLO la sua riga coTenants[idx] ─────────────
  // Un firmatario a sé per l'AdE (una riga RLI, CF obbligatorio) — il suo
  // token non tocca il conduttore principale né gli altri co-conduttori.
  // L'array è UNO: si rilegge con updateTime e si scrive con la
  // precondizione (la stessa di magic-sign/submit), così una co-firma o una
  // seconda Scheda arrivate nel mezzo non vengono mai sovrascritte.
  if (role === 'cotenant') {
    const raw = (body && body.identity && typeof body.identity === 'object') ? body.identity : {};
    const cf = clip(raw.cf, 20).toUpperCase();
    if (cf && !FIELDS.validCF16(cf)) return res.status(400).json({ ok: false, error: 'cf_invalid' });
    const idc = {
      name: clip(raw.name, 120), cf, dob: clip(raw.dob, 20), pob: clip(raw.pob, 120), address: clip(raw.address, 200),
      docType: ['passport', 'id', 'permit', 'patente'].includes(raw.docType) ? raw.docType : '', docNum: clip(raw.docNum, 60),
      docIssuer: clip(raw.docIssuer, 120), docIssueDate: clip(raw.docIssueDate, 20), nationality: clip(raw.nationality, 80), phone: clip(body.phone, 30),
    };
    let list = null;
    for (let attempt = 0; attempt < 2 && !list; attempt++) {
      let fresh, freshTime = null;
      try { const got = await fsGetWithTime('contracts/' + contractId); fresh = got.data; freshTime = got.updateTime; }
      catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
      const cur = Array.isArray(fresh && fresh.coTenants) ? fresh.coTenants.slice() : [];
      if (!cur[coIndex]) return res.status(404).json({ ok: false, error: 'not_found' });
      if (cur[coIndex].signature) return res.status(410).json({ ok: false, error: 'already_signed' });
      cur[coIndex] = { ...FIELDS.applyCotenantIdentity(cur[coIndex], idc), schedaAt: new Date().toISOString() };
      try {
        await commitWrites([{ docPath: 'contracts/' + contractId, fields: { coTenants: cur }, precondition: freshTime ? { updateTime: freshTime } : undefined }]);
        list = cur;
      } catch (e) {
        if (attempt === 0 && /FAILED_PRECONDITION|precondition/i.test(String(e.message || ''))) continue;
        console.error('[profile/submit] cotenant write:', e.message);
        return res.status(500).json({ ok: false, error: 'write_failed' });
      }
    }
    if (!list) return res.status(409).json({ ok: false, error: 'conflict' });
    const miss = FIELDS.cotenantMissing(list[coIndex]);
    await logActivity('scheda_submitted', 'contract', { contractId, role: 'cotenant', coIndex, complete: miss.length === 0 }, 'scheda').catch(() => {});
    try {
      await fsCreate('agentNotifications', {
        type: 'scheda.completed',
        summary: `Scheda co-conduttore ${coIndex + 1} compilata · ${list[coIndex].name} · ${contractId}${miss.length ? ' (parziale)' : ' (completa)'}`,
        priority: 'low', ref: { collection: 'contracts', id: contractId },
        payload: { contractId, role: 'cotenant', coIndex, complete: miss.length === 0 },
        dedupKey: `scheda-${contractId}-c${coIndex}`, status: 'pending', actor: 'scheda',
        createdAt: new Date().toISOString(), attempts: 0,
      });
    } catch (_) {}
    return res.status(200).json({ ok: true, complete: miss.length === 0, missing: miss.map(m => ({ key: m.key, label: m.label.en })), applied: [], rejected: [] });
  }

  const P = role === 'landlord' ? 'landlord' : 'tenant';
  const template = FIELDS.templateOf(contract);
  const nowISO = new Date().toISOString();

  // L'immobile serve PRIMA di scrivere: il dizionario legge floor/catasto/…
  // da lì per decidere cosa manca, e il locatore ci scrive i suoi fatti.
  let property = null;
  if (contract.propertyId) {
    try { property = await fsGet('properties/' + contract.propertyId); } catch (_) {}
  }
  const targetUid = role === 'tenant' ? (contract.tenantId || null) : ((property && property.ownerId) || null);

  // ── Identità (retro-compatibile: la pagina la manda sempre; un client
  //    che porta SOLO answers non viene respinto) ──────────────────────
  const hasIdentity = body && body.identity && typeof body.identity === 'object';
  const raw = hasIdentity ? body.identity : {};
  const id = hasIdentity ? {
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
  } : null;
  if (id) {
    if (!id.name || id.name.length < 3) return res.status(400).json({ ok: false, error: 'name_required' });
    // CF is optional (a fresh expat may not have one yet) but never wrong:
    // an invalid checksum would poison the RLI registration downstream. Il
    // conduttore è una persona fisica (16 caratteri); solo il locatore può
    // essere una società (11 cifre).
    if (id.cf && !FIELDS.validCFFor(role, id.cf)) return res.status(400).json({ ok: false, error: 'cf_invalid' });
  }
  const phone = clip(body.phone, 30);

  const upd = {};
  if (id) {
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
  }
  if (phone) upd[P + 'Phone'] = phone;

  // ── Le risposte alle sezioni extra: il dizionario decide ─────────────
  // ctx porta SOLO il profilo di questa parte (l'altra non entra mai).
  let user = null;
  if (targetUid) { try { user = await fsGet('users/' + targetUid); } catch (_) {} }
  if (role === 'landlord' && targetUid) {
    try { const ll = await fsGet('landlords/' + targetUid); if (ll) user = { ...ll, ...(user || {}) }; } catch (_) {}
  }
  const ctx = { contract, property: property || {}, [P]: user || {} };
  const answers = (body && body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) ? body.answers : {};
  const applied = FIELDS.applyAnswers(role, answers, ctx);
  Object.assign(upd, applied.contract);
  upd['scheda' + (P === 'tenant' ? 'Tenant' : 'Landlord') + 'At'] = nowISO;

  try { await fsPatch('contracts/' + contractId, upd); }
  catch (e) {
    console.error('[profile/submit] contract write:', e.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }

  // ── I fatti dell'immobile (solo dal locatore, per costruzione: il
  //    dizionario ha già scartato tutto il resto) ───────────────────────
  const propPatch = {};
  Object.keys(applied.property).forEach(k => { if (PROPERTY_KEYS.has(k)) propPatch[k] = applied.property[k]; });
  if (Object.keys(propPatch).length && contract.propertyId) {
    try { await fsPatch('properties/' + contract.propertyId, { ...propPatch, schedaUpdatedAt: nowISO }); }
    catch (e) { console.warn('[profile/submit] property write:', e.message); applied.rejected.push({ key: 'property', why: 'write_failed' }); }
  }

  // ── Profile sync (best-effort — the contract already holds the truth) ──
  if (targetUid && (id || phone || Object.keys(applied.user).length)) {
    try {
      await fsPatch('users/' + targetUid, {
        ...(id ? {
          name: id.name,
          cf: id.cf, dob: id.dob, pob: id.pob, address: id.address,
          docType: id.docType, docNum: id.docNum,
          docIssuer: id.docIssuer, docIssueDate: id.docIssueDate,
          nationality: id.nationality,
          // wizard-schema mirror — the Allegato generators read these
          codiceFiscale: id.cf, birthDate: id.dob, birthPlace: id.pob,
          idDocType: id.docType, idDocNumber: id.docNum,
        } : {}),
        ...(phone ? { phone } : {}),
        ...applied.user,
        schedaUpdatedAt: nowISO,
      });
    } catch (e) { console.warn('[profile/submit] user sync:', e.message); }
  }
  if (role === 'landlord' && targetUid && (id || applied.user.iban)) {
    try {
      await fsPatch('landlords/' + targetUid, {
        ...(id ? {
          name: id.name, codiceFiscale: id.cf, birthDate: id.dob, birthPlace: id.pob,
          address: id.address, idDocType: id.docType, idDocNumber: id.docNum,
        } : {}),
        ...(applied.user.iban ? { iban: applied.user.iban } : {}),
      });
    } catch (e) { console.warn('[profile/submit] landlord sync:', e.message); }
  }

  // ── Completezza DOPO le scritture: la verità del dizionario, non l'etichetta ──
  const after = {
    contract: { ...contract, ...upd },
    property: { ...(property || {}), ...propPatch },
    [P]: { ...(user || {}), ...applied.user, ...(id ? { name: id.name, cf: id.cf, dob: id.dob, pob: id.pob, address: id.address, docType: id.docType, docNum: id.docNum, docIssuer: id.docIssuer, docIssueDate: id.docIssueDate, nationality: id.nationality } : {}), ...(phone ? { phone } : {}) },
  };
  // `complete` = per QUESTA parte il PDF non stamperebbe puntini (livello
  // 'contract'); `missing` = ciò che serve ancora anche per la
  // registrazione (documento caricato compreso), per lo schermo finale.
  const ask = FIELDS.askFor(role, after);
  const complete = FIELDS.completeness(after, { level: 'contract' }).byOwner[P].missing.length === 0;
  const missing = FIELDS.missingFor(role, after, { lang: ask.lang });
  await logActivity('scheda_submitted', 'contract', { contractId, role, complete, applied: applied.applied, rejected: applied.rejected.map(r => r.key) }, 'scheda').catch(() => {});

  // ── Conferma al cliente (una volta sola, quando la scheda è completa) ──
  // Nel design system BOOM, nella lingua del lettore. Best-effort e con
  // timeout: un SMTP piantato non deve mai bloccare il submit.
  const confirmFlag = 'scheda' + (P === 'tenant' ? 'Tenant' : 'Landlord') + 'ConfirmedAt';
  const identityOk = id ? identityComplete(id, { role, template }) : true;
  if (complete && identityOk && !contract[confirmFlag]) {
    try {
      let to = '';
      if (user && user.email) to = user.email;
      if (!to && applied.user.email) to = applied.user.email;
      if (!to && role === 'landlord') to = contract.landlordEmail || '';
      if (!to) to = contract[P + 'Email'] || '';
      if (to) {
        const escH = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
        const propLabel = escH((property && (property.name || property.address)) || 'your BOOM home');
        const first = escH(String((id && id.name) || contract[P + 'Name'] || (user && user.name) || '').split(' ')[0]);
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
  // Un dato SENSIBILE impostato da un link pubblico (l'IBAN dove paga
  // l'inquilino) si dice all'operatore ad ALTA priorità, col valore: fill-only
  // impedisce di cambiarne uno esistente, ma il primo va comunque visto.
  if (Array.isArray(applied.sensitive) && applied.sensitive.length) {
    try {
      await fsCreate('agentNotifications', {
        type: 'scheda.sensitive',
        summary: `⚠ ${P === 'tenant' ? 'Inquilino' : 'Locatore'} ha impostato dal link /scheda: ${applied.sensitive.map(x => FIELDS.labels([x.key], 'it')[0] + ' = ' + x.value).join(' · ')} · ${((property || {}).name) || contractId} — verifica prima che l'inquilino lo veda`,
        priority: 'high',
        ref: { collection: 'contracts', id: contractId },
        payload: { contractId, role, sensitive: applied.sensitive },
        dedupKey: `scheda-sensitive-${contractId}-${role}-${applied.sensitive.map(x => x.key).join('+')}`,
        status: 'pending', actor: 'scheda',
        createdAt: nowISO, attempts: 0,
      });
    } catch (_) {}
  }
  // Wake the operator's channels like magic-sign does — a completed scheda
  // usually means "regenerate the PDF and send the sign link".
  try {
    await fsCreate('agentNotifications', {
      type: 'scheda.completed',
      summary: `Scheda ${P === 'tenant' ? 'inquilino' : 'locatore'} compilata · ${(id && id.name) || contract[P + 'Name'] || ''} · ${((property || {}).name) || contractId}${complete ? ' (completa)' : ' (parziale: manca ' + missing.slice(0, 4).map(m => m.label).join(', ') + (missing.length > 4 ? '…' : '') + ')'}`,
      priority: 'low',
      ref: { collection: 'contracts', id: contractId },
      payload: { contractId, role, complete, missing: missing.map(m => m.key), applied: applied.applied },
      dedupKey: `scheda-${contractId}-${role}`,
      status: 'pending', actor: 'scheda',
      createdAt: nowISO, attempts: 0,
    });
  } catch (_) { /* never block the client on a notification */ }

  return res.status(200).json({ ok: true, complete, missing, applied: applied.applied, rejected: applied.rejected });
}
