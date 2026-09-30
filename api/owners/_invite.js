// api/owners/_invite.js — l'invito all'area proprietario: UNA email, nel
// design system condiviso, in italiano (il locatore legge italiano: la
// stessa scelta di /scheda e delle email di firma). Un tasto: «Attiva la tua
// area» (link monouso, scegli la password) oppure «Apri la tua area» se
// l'account è già attivo. Condiviso da api/owners/invite.js (operatore,
// backfill) e da api/sign/_finalize.js (automatico, alla firma completa).

import { fsGet, fsPatch, fsList, logActivity } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, includes, rule } from '../preagreement/_notify.js';
import { ensureOwnerAccount, ownerEntryUrl } from './_provision.js';
import { ownerContact } from './_owner.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function inviteHtml({ name, url, activation, propLabels = [] }) {
  const first = String(name || '').split(' ')[0] || 'Gentile proprietario';
  const where = propLabels.length === 1 ? `per <b>${esc(propLabels[0])}</b>` : propLabels.length ? `per i tuoi <b>${propLabels.length} immobili</b>` : '';
  return shell(
    para(`Gentile ${esc(first)},<br>da oggi tutto quello che hai con BOOM ${where} sta in un posto solo, sempre aggiornato — senza cercare fra le email.`)
    + includes([
      'Il <b>contratto firmato</b>, il certificato di firma e il verbale di consegna',
      'I <b>documenti del conduttore</b> (dopo la firma) e il fascicolo fiscale',
      'I <b>canoni</b>: cosa è arrivato, cosa è in arrivo, cosa è in ritardo',
      'Le <b>scadenze</b>: registrazione, fine contratto, rinnovo',
      'I <b>rendiconti mensili</b> e i documenti dell’immobile (APE, visura…)',
    ])
    + btn(url, activation ? 'Attiva la tua area proprietario' : 'Apri la tua area proprietario')
    + rule()
    + (activation
      ? fine('Il tasto ti fa scegliere la tua password: nessun codice da ricordare, nessuna app da scaricare. Il link è personale, vale una volta sola e per 14 giorni.', 'text-align:center')
      : fine('Accedi con la tua email e la tua password. Se non la ricordi, dalla pagina di accesso tocca «Password dimenticata».', 'text-align:center'))
    + fine('Un dubbio? Rispondi a questa email o scrivici su WhatsApp: risponde una persona.', 'text-align:center'),
    'La tua area proprietario BOOM: contratto, documenti, canoni e scadenze.'
  );
}

// Il timbro dell'invito sul profilo: quando, quante volte, e se l'email è
// partita davvero (la console lo mostra; il backfill non re-invita a vuoto).
export async function markInvited(uid, emailed, { via = 'owner-invite', propertyId = null, status = '' } = {}) {
  if (!uid) return;
  const prev = await fsGet('users/' + uid).catch(() => null);
  await fsPatch('users/' + uid, {
    ownerInvitedAt: new Date().toISOString(),
    ownerInviteCount: (Number((prev || {}).ownerInviteCount) || 0) + (emailed ? 1 : 0),
    ownerInviteError: emailed ? null : 'email_failed',
  }).catch((e) => console.warn('[owners/invite] mark', e.message));
  await logActivity('owner_area_invited', 'owner', { uid, propertyId, emailed, status, via }, via);
}

// Invita il proprietario di un immobile (o di una scheda landlords).
// Idempotente nei fatti: l'account non si duplica mai, il link si ruota.
// { dry } = calcola senza creare né spedire.
export async function inviteOwner({ propertyId, landlordId, userId, email, name, phone, send = true, dry = false, via = 'owner-invite' } = {}) {
  let contact = { email: '', name: '', phone: '', landlordId: landlordId || null };
  let propLabels = [];
  if (propertyId) {
    const prop = await fsGet('properties/' + propertyId).catch(() => null);
    if (!prop) return { ok: false, error: 'property_not_found' };
    const cs = await fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: propertyId }, limit: 10 }).catch(() => []);
    contact = await ownerContact(prop, cs.find((c) => c.landlordEmail) || cs[0]);
    propLabels = [prop.address || prop.name || propertyId];
  } else if (landlordId) {
    const l = await fsGet('landlords/' + landlordId).catch(() => null);
    if (!l) return { ok: false, error: 'landlord_not_found' };
    contact = { email: l.email || '', name: l.name || [l.firstName, l.lastName].filter(Boolean).join(' '), phone: l.phone || '', landlordId, userId: l.userId || null };
  } else if (userId) {
    const u = await fsGet('users/' + userId).catch(() => null);
    if (!u) return { ok: false, error: 'user_not_found' };
    contact = { email: u.email || '', name: u.name || '', phone: u.phone || '', landlordId: u.landlordId || null };
  }
  const to = String(email || contact.email || '').trim();
  const who = { email: to, name: name || contact.name, phone: phone || contact.phone, landlordId: contact.landlordId };
  if (dry) return { ok: true, dry: true, ...who };

  const acct = await ensureOwnerAccount({ ...who, via });
  if (!acct.ok) return { ...acct, email: to };
  const url = ownerEntryUrl(acct);
  let emailed = false;
  if (send) {
    try {
      await Promise.race([
        sendEmail({ to, subject: 'La tua area proprietario BOOM è pronta', html: inviteHtml({ name: who.name, url, activation: !!acct.activationUrl, propLabels }) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 12000)),
      ]);
      emailed = true;
    } catch (e) { console.warn('[owners/invite] email', e.message); }
    await markInvited(acct.uid, emailed, { via, propertyId, status: acct.status });
  }
  return { ok: true, status: acct.status, uid: acct.uid, email: to, emailed, activationUrl: acct.activationUrl || null, entryUrl: url };
}

// L'automazione della firma completa (api/sign/_finalize.js): l'account del
// proprietario si prepara SENZA spedire nulla — il link viaggia dentro il
// benvenuto al locatore, una email invece di due. Interruttore:
// settings/ownerArea.autoInvite (assente = acceso). Mai sull'account di un
// admin o di un inquilino (ensureOwnerAccount salta e lo dice).
export async function maybeOwnerArea(contract, property) {
  if (!contract || !contract.propertyId) return null;
  const cfg = await fsGet('settings/ownerArea').catch(() => null);
  if (cfg && cfg.autoInvite === false) return { skipped: 'disabled' };
  // L'email è quella che riceverà il benvenuto: stessa scala di gather()
  // in api/sign/_notify.js (users → landlords → contratto).
  const prop = property || await fsGet('properties/' + contract.propertyId).catch(() => null);
  const contact = prop ? await ownerContact(prop, contract) : null;
  if (!contact || !contact.email) return { skipped: 'no_email' };
  const r = await inviteOwner({ propertyId: contract.propertyId, send: false, via: 'finalize', email: contact.email });
  return r && r.ok ? { uid: r.uid, email: r.email, status: r.status, activationUrl: r.activationUrl || null } : { skipped: (r && (r.reason || r.error)) || 'unknown' };
}
