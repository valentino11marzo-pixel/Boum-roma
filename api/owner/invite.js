// api/owner/invite.js — L'INVITO DEL PROPRIETARIO (solo admin)
//
// Porta il proprietario dentro il suo archivio (/proprietario) in due tempi:
//   op:'preview' → il PIANO, senza scrivere niente e senza creare account:
//                  quale email (e da dove viene), se esiste già un account di
//                  accesso, cosa succede a ogni immobile (collegato · già suo ·
//                  riunito da una vecchia scheda · BLOCCATO perché di un altro),
//                  i conflitti che fermano tutto, e un hash del piano.
//   op:'invite'  → esegue ESATTAMENTE quel piano: se nel frattempo è cambiato
//                  qualcosa l'hash non torna (409 plan_changed) e non si tocca
//                  niente. L'account nasce solo qui, le scritture sono UN commit
//                  atomico con le precondizioni, poi l'email (una volta sola).
//
// LE REGOLE DURE (tutte nei test, le delicate verificate per mutazione):
//   1. Un immobile di un ALTRO proprietario non si riassegna MAI: resta
//      `blocked`, il suo ownerId non cambia (vedi `propertyAction`).
//   2. Un account di accesso si usa solo con una PROVA che quella scheda
//      `users/<X>` sia davvero lui (authUid, invito o primo accesso già
//      registrati, lastLogin scritto dal suo stesso browser) — altrimenti il
//      segno di recupero lasciato da un invito a metà — altrimenti 409
//      `auth_without_profile`. Mai un uid scelto a mano dall'operatore.
//   3. Le vecchie schede (Innesto, CRM `landlords/`) con la stessa email
//      diventano ALIAS: gli immobili che portano quell'id passano al nuovo
//      uid con la storia `claim`, i dati mancanti riempiono i buchi di
//      `landlords/<uid>` — le schede vecchie non si toccano né si cancellano.
//      Gli alias vivono in UN posto: `users/<uid>.ownerAliases`.
//      Il claim chiede una prova FORTE dell'account (nato in questo invito,
//      segno di recupero, authUid/invito/primo accesso — campi che le regole
//      tolgono al titolare): col solo lastLogin l'immobile resta `blocked`
//      `claim_needs_proof` e nessun alias si scrive (revisione 23/09/2026).
//      L'uscita per il proprietario VERO (gli account landlord creati dal
//      portal portano solo lastLogin: nessuno scrive loro authUid) è una
//      scelta dell'admin, MAI automatica: `confirmAccount: true` in preview
//      e invite. Vale solo su un account provato dal solo lastLogin, entra
//      nell'hash del piano (preview e invite devono dire la stessa cosa),
//      il piano la elenca come conseguenza («l'admin conferma che l'account
//      X appartiene a <email>») e l'invito la SCRIVE nello stesso commit
//      atomico: users/<uid>.authUid = uid + accountConfirmedAt/By, più la
//      riga nel registro attività. Senza la spunta tutto resta com'era.
//   4. Nessun dato della casa nell'email (niente indirizzo, niente importi) e
//      l'email del proprietario MAI nella query del link: va nel frammento
//      (#e=…), che non arriva a nessun server né a nessun log.
//   5. Nei log la forma (codici, conteggi), mai il contenuto.
//
// Esporta anche la regola unica dei bottoni «Apri il suo archivio» nelle
// email già esistenti (benvenuto, rendiconto, verbale): il bottone compare
// solo a chi è stato invitato o ha già aperto l'archivio — una scheda con
// ruolo landlord NON basta (Innesto e magic-sign creano schede senza account:
// un bottone lì porterebbe a un login che non si può passare).

import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsList, fsCommit, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { shell, para, btn, fine } from '../preagreement/_notify.js';
import OWNER from '../../js/owner-archive-engine.js';

const BASE = OWNER.BASE;                       // sempre www: l'apex reindirizza
const ID_RE = OWNER.ID_RE;
const LOGIN_URL = BASE + '/login?next=%2Fproprietario&primo=1';
const PORTAL_URL = BASE + '/proprietario';
const EMAIL_RE = /^[^\s@<>"(),;:]{1,64}@[^\s@<>"(),;:]{1,190}\.[a-z]{2,24}$/i;
const MAX_PROPS = 10;
const OWNER_ROLES = ['landlord', 'owner'];
// Campi che il riempimento dei buchi NON copia dalle vecchie schede: identità
// del documento, ruolo, date di sistema, gli alias (vivono su users/<uid>) e i
// timbri di accesso/invito, che parlano della VECCHIA scheda e non del nuovo
// account (copiarli fingerebbe un invito o un login mai avvenuti).
const MERGE_SKIP = new Set(['id', 'role', 'createdAt', 'updatedAt', 'ownerAliases',
  'ownerInvitedAt', 'ownerInvitedBy', 'ownerInviteSentAt', 'ownerPortalFirstAt',
  'lastLogin', 'authUid', 'createdBy', 'onboardingPending', 'onboardingType']);

const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
const lower = (s) => clip(s, 260).toLowerCase();
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)
  || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const validId = (s) => typeof s === 'string' && ID_RE.test(s) && s !== '.' && s !== '..';
const sameEmail = (a, b) => !!a && !!b && lower(a) === lower(b);
const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
const iso = () => new Date().toISOString();

// Il bottone e il link dell'archivio stanno in _entry.js (una copia sola,
// importata dalle email senza trascinare questo modulo); qui si riesportano.
export { ownerArchiveOpen, ownerArchiveUrl } from './_entry.js';

// ── Le regole pure del piano (esportate: i test le guidano da sole) ───────
// Cosa succede a un immobile. È QUI la riga che protegge l'immobile altrui:
// un ownerId che non è il nostro uid né un alias provato (stessa email) è di
// un altro proprietario, e non si riassegna mai.
export function propertyAction(currentOwnerId, uid, aliasSet) {
  const o = clip(currentOwnerId, 200);
  if (!o) return { action: 'bind', kind: 'none', reason: null };
  if (uid && o === uid) return { action: 'keep', kind: 'same', reason: null };
  if (aliasSet && aliasSet.has(o)) return { action: 'claim', kind: 'alias', reason: null };
  /* guard in invite.js */
  return { action: 'blocked', kind: 'other', reason: 'owned_by_other' };
}

// Una scheda users/<X> è davvero l'account di accesso X? Solo con una prova
// scritta da chi possiede quell'account o dal nostro invito: authUid uguale,
// invito o primo accesso all'archivio già timbrati, oppure lastLogin (lo
// scrive il browser dell'utente autenticato X sul SUO documento, al boot del
// portal). Il solo fatto che la scheda esista non prova niente: Innesto e
// magic-sign creano schede users/<autoId> senza alcun account.
export function provenAccount(u) {
  if (!u || !validId(u.id)) return false;
  return u.authUid === u.id || !!u.ownerInvitedAt || !!u.ownerPortalFirstAt || !!u.lastLogin;
}

// Riunire le vecchie schede di un ALTRO id (claim) consegna immobili,
// rendiconti e documenti di quella scheda: qui la prova deve essere FORTE,
// cioè scritta solo dal server o dall'admin. Revisione del 23/09/2026: una
// scheda con il solo lastLogin (e un'email che fino a quel giorno si poteva
// riscrivere da sé) diventava l'account di Anna e si prendeva i suoi
// immobili, il suo IBAN e i suoi documenti. Prova forte =
//   · l'account nasce in QUESTO invito (signUp con quell'email: uid ancora
//     nullo nel piano), oppure dal segno lasciato dal signUp di un invito
//     precedente (heartbeat/, solo server);
//   · la scheda porta authUid uguale, un invito già timbrato o il primo
//     accesso all'archivio registrato — campi che firestore.rules toglie alla
//     scrittura del titolare (solo admin e server).
// Il solo lastLogin continua a valere per collegare immobili SENZA
// proprietario (bind) e per riconoscere i propri (keep), mai per un claim:
// quello resta `blocked` con reason `claim_needs_proof`, detto nel piano.
export function strongAccountProof({ uid, viaMarker, usersDoc }) {
  if (!uid) return true;
  if (viaMarker) return true;
  const u = usersDoc || {};
  return u.authUid === uid || !!u.ownerInvitedAt || !!u.ownerPortalFirstAt;
}

// Quanto è provato l'account scelto dal piano (null: nessun account scelto —
// lo crea l'invito, o c'è un conflitto). 'weak' = provato dal solo lastLogin,
// quindi confermabile dall'admin; 'mismatch' = la scheda dichiara un authUid
// DIVERSO dal suo id: un record che si contraddice non si conferma mai.
export function accountProof({ uid, viaMarker, usersDoc }) {
  if (!uid) return null;
  if (strongAccountProof({ uid, viaMarker, usersDoc })) return 'strong';
  const u = usersDoc || {};
  if (u.authUid != null && u.authUid !== '' && u.authUid !== uid) return 'mismatch';
  return 'weak';
}

// La conferma dell'admin entra nell'hash SOLO quando il piano la applica: un
// piano senza conferma dà lo stesso hash di sempre (un'anteprima aperta
// prima di questo rilascio resta valida), uno con la conferma un hash suo —
// così un invito non può confermare un account che il piano non ha mostrato
// confermato, né dimenticare una conferma che il piano ha mostrato.
export function planHash({ email, usersDocId, usersRole, props, accountConfirmed }) {
  const rows = (props || []).map((p) => [p.id, p.currentOwnerId || null, p.action]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canon = JSON.stringify({ email: email || null, usersDocId: usersDocId || null, usersRole: usersRole || null, props: rows,
    ...(accountConfirmed === true ? /* mp:confirm-hash */ { accountConfirmed: true } : {}) });
  return crypto.createHash('sha256').update(canon).digest('hex');
}

export function markerId(email) {
  return 'owner-invite-' + crypto.createHash('sha256').update(lower(email)).digest('hex').slice(0, 24);
}

// Riempie i buchi: copia un campo solo se sul bersaglio è vuoto. Le fonti
// arrivano già in ordine di fiducia; la prima che ha il dato vince.
export function gapFill(target, sources) {
  const out = {};
  const t = target || {};
  for (const src of sources || []) {
    for (const [k, v] of Object.entries(src || {})) {
      if (MERGE_SKIP.has(k) || empty(v)) continue;
      if (!empty(t[k]) || k in out) continue;
      out[k] = v;
    }
  }
  return out;
}

export function whatsappText(name) {
  const who = clip(name, 80) || 'proprietario';
  return `Gentile ${who}, il suo archivio BOOM è attivo: contratti, verbali e rendiconti dei suoi immobili in un posto solo. Primo accesso: apra ${LOGIN_URL}, tocchi “Ricevi il link per scegliere la password” e scelga la password dall'email che le arriva. Valentino, BOOM Roma`;
}

// ── Identity Toolkit (solo chiave pubblica: nessun segreto nuovo) ─────────
async function identity(method, body) {
  const key = process.env.FIREBASE_API_KEY;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// registered: true | false | undefined (la protezione anti-enumerazione di
// Firebase può tacere il campo: allora lo stato è «non so», mai un sì o un no).
async function accountRegistered(email) {
  try {
    const r = await identity('createAuthUri', { identifier: email, continueUri: BASE });
    if (!r.ok) return undefined;
    return typeof r.data.registered === 'boolean' ? r.data.registered : undefined;
  } catch { return undefined; }
}

// ── Letture ───────────────────────────────────────────────────────────────
const safeGet = (path) => fsGet(path).catch(() => null);

async function byEmail(collection, email) {
  const variants = [...new Set([clip(email, 260), lower(email)].filter(Boolean))];
  const out = new Map();
  for (const v of variants) {
    const rows = await fsList(collection, { filter: { field: 'email', op: 'EQUAL', value: v }, limit: 10 });
    for (const r of rows) if (r && validId(r.id)) out.set(r.id, r);
  }
  return out;
}

const newestFirst = (a, b) => String(b.startDate || b.createdAt || '').localeCompare(String(a.startDate || a.createdAt || ''));

// ── Il piano: stessa funzione per preview e invite ─────────────────────────
class PlanError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra || {}; }
}

export async function computePlan({ propertyIds, email: bodyEmail, name: bodyName, resend, confirmAccount }) {
  // 1. Gli immobili richiesti, con la loro versione (serve al commit).
  const reads = await Promise.all(propertyIds.map((id) => fsGetVersioned('properties/' + id).then((r) => ({ id, r }))));
  const missing = reads.filter((x) => !x.r).map((x) => x.id);
  if (missing.length) throw new PlanError(404, 'property_not_found', { ids: missing });
  const requested = reads.map((x) => ({ id: x.id, data: x.r.data || {}, updateTime: x.r.updateTime }));

  // 2. Le schede dei proprietari attuali (stesso id nei due namespace).
  const ownerIds = [...new Set(requested.map((p) => clip(p.data.ownerId, 200)).filter(validId))];
  const cache = { users: {}, landlords: {} };
  await Promise.all(ownerIds.flatMap((k) => [
    safeGet('users/' + k).then((d) => { cache.users[k] = d; }),
    safeGet('landlords/' + k).then((d) => { cache.landlords[k] = d; }),
  ]));

  // 3. La scala dell'email: il primo che risponde vince, e si dice chi era.
  let contracts = null;
  const loadContracts = async () => {
    if (contracts) return contracts;
    const lists = await Promise.all(requested.map((p) => fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: p.id }, limit: 50 }).catch(() => [])));
    contracts = lists.flat().sort(newestFirst);
    return contracts;
  };
  let email = '', emailSource = null;
  if (bodyEmail != null && clip(bodyEmail, 260)) {
    email = clip(bodyEmail, 260);
    if (!EMAIL_RE.test(email)) throw new PlanError(400, 'bad_email');
    emailSource = 'manual';
  } else {
    const pick = (v, src) => { if (!email && EMAIL_RE.test(clip(v, 260))) { email = clip(v, 260); emailSource = src; } };
    for (const k of ownerIds) pick(cache.users[k] && cache.users[k].email, 'users');
    for (const k of ownerIds) pick(cache.landlords[k] && cache.landlords[k].email, 'landlords');
    for (const p of requested) pick(p.data.ownerEmail, 'property.ownerEmail');
    if (!email) for (const c of await loadContracts()) pick(c.landlordEmail, 'contract.landlordEmail');
  }
  if (!email) throw new PlanError(409, 'no_email', { properties: requested.map((p) => ({ id: p.id, label: clip(p.data.address || p.data.name, 90) })) });

  // 4. Le schede con quella email (maiuscole comprese) e lo stato dell'account.
  const [usersMatch, landlordsMatch, registered] = await Promise.all([
    byEmail('users', email), byEmail('landlords', email), accountRegistered(email),
  ]);
  for (const k of ownerIds) {   // la scheda dell'attuale ownerId con la stessa email ma scritta diversa
    if (cache.users[k] && sameEmail(cache.users[k].email, email)) usersMatch.set(k, { ...cache.users[k], id: k });
    if (cache.landlords[k] && sameEmail(cache.landlords[k].email, email)) landlordsMatch.set(k, { ...cache.landlords[k], id: k });
  }

  let conflict = null;
  const users = [...usersMatch.values()];
  const wrongRole = users.find((u) => u.role && !OWNER_ROLES.includes(u.role));
  if (wrongRole) conflict = { error: 'role_conflict', role: clip(wrongRole.role, 20) };
  const candidates = users.filter((u) => OWNER_ROLES.includes(u.role));
  const proven = candidates.filter(provenAccount);

  // 5. Chi è l'account: prova → segno di recupero → (nuovo) → mai indovinato.
  let uid = null, state = registered === true ? 'exists' : registered === false ? 'absent' : 'unknown', viaMarker = false;
  if (!conflict && registered !== false) {
    if (proven.length > 1) conflict = { error: 'ambiguous_profiles', count: proven.length };
    else if (proven.length === 1) uid = proven[0].id;
    else {
      const mk = await safeGet('heartbeat/' + markerId(email));
      if (mk && validId(mk.uid)) { uid = mk.uid; viaMarker = true; }
      else if (registered === true) conflict = { error: 'auth_without_profile' };
    }
  }
  if (uid && registered === undefined) state = 'exists';

  // La scheda users/<uid> (se c'è): ruolo e invio già fatto.
  let usersDoc = null;
  if (uid) {
    usersDoc = usersMatch.get(uid) || await safeGet('users/' + uid);
    if (usersDoc && usersDoc.role && !OWNER_ROLES.includes(usersDoc.role) && !conflict) conflict = { error: 'role_conflict', role: clip(usersDoc.role, 20) };
  }

  // 6. Gli alias: ogni altra scheda con la stessa email (mai con un ruolo
  //    che non è da proprietario: quella è già un conflitto).
  const aliases = [];
  const seen = new Set();
  for (const u of users) if (u.id !== uid && !(u.role && !OWNER_ROLES.includes(u.role)) && !seen.has(u.id)) { seen.add(u.id); aliases.push({ key: u.id, from: 'users' }); }
  for (const l of landlordsMatch.values()) if (l.id !== uid && !seen.has(l.id)) { seen.add(l.id); aliases.push({ key: l.id, from: 'landlords' }); }
  const aliasSet = new Set(aliases.map((a) => a.key));
  // Il claim chiede la prova FORTE (vedi strongAccountProof): senza, gli alias
  // restano nel piano come informazione ma non si riuniscono e non si scrivono.
  // L'unica altra via è la conferma ESPLICITA dell'admin, e solo su un
  // account provato dal solo lastLogin (proof 'weak'): mai dedotta, mai su
  // un account nuovo, già forte o che si contraddice.
  const proof = accountProof({ uid, viaMarker, usersDoc });
  const accountConfirmed = /* mp:confirm-flag */ confirmAccount === true && proof === 'weak';
  const claimProof = strongAccountProof({ uid, viaMarker, usersDoc }) || accountConfirmed;
  const NEEDS_PROOF = { action: 'blocked', kind: 'alias', reason: 'claim_needs_proof' };

  // 7. Gli immobili: quelli richiesti + TUTTI quelli degli alias (claim).
  const props = requested.map((p) => {
    let act = propertyAction(p.data.ownerId, uid, aliasSet);
    if (act.action === 'claim' && !claimProof) act = NEEDS_PROOF;
    return {
      id: p.id, label: clip(p.data.address || p.data.name, 90), currentOwnerId: clip(p.data.ownerId, 200) || null,
      currentOwnerKind: act.kind, action: act.action, reason: act.reason,
      emailMismatch: !!(p.data.ownerEmail && !sameEmail(p.data.ownerEmail, email)),
      updateTime: p.updateTime, history: Array.isArray(p.data.ownerIdHistory) ? p.data.ownerIdHistory : [],
    };
  });
  const have = new Set(props.map((p) => p.id));
  for (const a of aliases) {
    const owned = await fsList('properties', { filter: { field: 'ownerId', op: 'EQUAL', value: a.key }, limit: 50 }).catch(() => []);
    for (const row of owned) {
      if (!row || !validId(row.id) || have.has(row.id)) continue;
      const v = await fsGetVersioned('properties/' + row.id).catch(() => null);
      if (!v || v.data.ownerId !== a.key) continue;
      have.add(row.id);
      props.push({
        id: row.id, label: clip(v.data.address || v.data.name, 90), currentOwnerId: a.key,
        currentOwnerKind: 'alias', action: claimProof ? 'claim' : NEEDS_PROOF.action, reason: claimProof ? null : NEEDS_PROOF.reason,
        emailMismatch: false, auto: true,
        updateTime: v.updateTime, history: Array.isArray(v.data.ownerIdHistory) ? v.data.ownerIdHistory : [],
      });
    }
  }

  // 8. Nome e telefono, con la stessa scala (mai inventati).
  const firstOf = (...vals) => { for (const v of vals) if (clip(v)) return clip(v, 120); return ''; };
  const K = ownerIds;
  let name = firstOf(bodyName, usersDoc && usersDoc.name, ...K.map((k) => cache.users[k] && cache.users[k].name),
    ...K.map((k) => cache.landlords[k] && cache.landlords[k].name), ...requested.map((p) => p.data.ownerName),
    ...[...landlordsMatch.values()].map((l) => l.name));
  let phone = firstOf(usersDoc && usersDoc.phone, ...K.map((k) => cache.users[k] && cache.users[k].phone),
    ...K.map((k) => cache.landlords[k] && cache.landlords[k].phone), ...requested.map((p) => p.data.ownerPhone),
    ...[...landlordsMatch.values()].map((l) => l.phone));
  if (!name || !phone) {
    for (const c of await loadContracts()) {
      if (!name && clip(c.landlordName)) name = clip(c.landlordName, 120);
      if (!phone && clip(c.landlordPhone)) phone = clip(c.landlordPhone, 40);
    }
  }

  const usersRole = usersDoc ? (usersDoc.role || null) : null;
  const consequences = [];
  // La conferma dell'admin è la PRIMA conseguenza: è l'unica che dipende da
  // una sua dichiarazione e non dai dati (la finestra la scrive coi nomi).
  if (accountConfirmed) consequences.push('account_confirmed');
  if (props.some((p) => p.action === 'bind')) consequences.push('rendiconto_starts');
  if (aliases.length) consequences.push(claimProof ? 'alias_merge' : 'claim_needs_proof');
  if (usersRole === 'owner') consequences.push('role_upgrade');

  const previewHash = planHash({ email, usersDocId: uid, usersRole, props, accountConfirmed });
  return {
    email, emailSource, name, phone: phone || null,
    account: { state, usersDocId: uid, usersRole, proof, confirmed: accountConfirmed },
    conflict, props, aliases, consequences,
    accountConfirmation: accountConfirmed ? { usersDocId: uid, email } : null,
    willSendEmail: !(usersDoc && usersDoc.ownerInviteSentAt) || resend === true,
    previewHash, usersDoc, registered, viaMarker, claimProof, accountConfirmed,
  };
}

function publicPreview(plan) {
  return {
    ok: true, op: 'preview',
    owner: { email: plan.email, emailSource: plan.emailSource, name: plan.name || null, phone: plan.phone },
    account: plan.account,
    conflict: plan.conflict,
    properties: plan.props.map((p) => ({
      id: p.id, label: p.label, currentOwnerId: p.currentOwnerId, currentOwnerKind: p.currentOwnerKind,
      action: p.action, reason: p.reason, emailMismatch: p.emailMismatch, ...(p.auto ? { auto: true } : {}),
    })),
    aliases: plan.aliases,
    consequences: plan.consequences,
    accountConfirmation: plan.accountConfirmation,
    willSendEmail: plan.willSendEmail,
    previewHash: plan.previewHash,
  };
}

// ── L'email d'invito (IT, «Lei», design system condiviso) ─────────────────
function inviteHtml({ name, email }) {
  const who = clip(name, 80) ? esc(clip(name, 80)) : 'Gentile proprietario';
  const link = LOGIN_URL + '#e=' + encodeURIComponent(email);   // l'email nel frammento, mai nella query
  return shell(
    para(`${clip(name, 80) ? 'Gentile ' + who : who},<br>il suo <b>archivio BOOM</b> è attivo: i contratti, i verbali di consegna e i rendiconti dei suoi immobili, in un posto solo e sempre aggiornati.`)
    + para('Per il primo accesso basta la sua email: le mandiamo un link per scegliere la password, e da lì in poi entra quando vuole.')
    + btn(link, 'Attiva il suo archivio')
    + fine('Accessi successivi: <b>www.boomrome.com/proprietario</b>', 'text-align:center')
    + fine('Se ha domande basta rispondere a questa email. Valentino, BOOM Roma', 'text-align:center'),
    'Contratti, verbali e rendiconti dei suoi immobili in un posto solo.');
}

async function sendInvite({ name, email }) {
  await Promise.race([
    sendEmail({ to: email, subject: 'Il suo archivio BOOM è attivo', html: inviteHtml({ name, email }) }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 15000)),
  ]);
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); } catch { body = null; }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad_request' });
  const op = body.op;
  const ids = Array.isArray(body.propertyIds) ? [...new Set(body.propertyIds.map((x) => (typeof x === 'string' ? x.trim() : '')))] : [];
  if ((op !== 'preview' && op !== 'invite') || !ids.length || ids.length > MAX_PROPS || !ids.every(validId)
    || (body.email != null && typeof body.email !== 'string') || (body.name != null && typeof body.name !== 'string')
    || (body.confirmAccount != null && typeof body.confirmAccount !== 'boolean')) {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }
  if (op === 'invite' && !(typeof body.previewHash === 'string' && /^[0-9a-f]{64}$/.test(body.previewHash))) {
    return res.status(400).json({ ok: false, error: 'preview_required' });
  }

  let plan;
  try {
    // confirmAccount: SOLO il booleano true dell'admin (mai dedotto, mai «truthy»).
    plan = await computePlan({ propertyIds: ids, email: body.email, name: body.name, resend: body.resend === true,
      confirmAccount: body.confirmAccount === true });
  } catch (e) {
    if (e instanceof PlanError) return res.status(e.status).json({ ok: false, error: e.code, ...e.extra });
    console.error('[owner/invite] plan_failed', e && e.code ? e.code : 'read');
    return res.status(500).json({ ok: false, error: 'read_failed' });
  }

  if (op === 'preview') return res.status(200).json(publicPreview(plan));

  // ── invite ──
  if (body.previewHash !== plan.previewHash) return res.status(409).json({ ok: false, error: 'plan_changed', preview: publicPreview(plan) });
  if (plan.conflict) return res.status(409).json({ ok: false, ...plan.conflict });
  if (!plan.props.some((p) => p.action !== 'blocked')) {
    return res.status(409).json({ ok: false, error: 'nothing_to_bind', blocked: plan.props.map((p) => ({ id: p.id, reason: p.reason })) });
  }

  // 1. uid: quello provato (o del segno di recupero) oppure un account nuovo.
  let uid = plan.account.usersDocId, createdAuth = false;
  if (!uid) {
    let r;
    try { r = await identity('signUp', { email: plan.email, password: crypto.randomBytes(18).toString('base64url'), returnSecureToken: false }); }
    catch { return res.status(502).json({ ok: false, error: 'signup_failed' }); }
    const msg = String((r.data && r.data.error && r.data.error.message) || '');
    if (!r.ok && /^EMAIL_EXISTS/.test(msg)) return res.status(409).json({ ok: false, error: 'auth_without_profile' });
    if (!r.ok || !validId(r.data.localId)) {
      console.error('[owner/invite] signup_failed', r.status);
      return res.status(502).json({ ok: false, error: 'signup_failed' });
    }
    uid = r.data.localId; createdAuth = true;
    // Il segno di recupero PRIMA del commit: se il commit fallisce, il
    // prossimo invito ritrova questo account invece di cadere in
    // auth_without_profile senza uscita.
    try { await fsPatch('heartbeat/' + markerId(plan.email), { uid, at: iso() }); }
    catch { console.warn('[owner/invite] marker_write_failed'); }
  }

  // 2. Il commit atomico, con le precondizioni.
  const at = iso(), by = auth.uid;
  // Senza prova forte nessun alias si scrive (né ownerAliases né i buchi di
  // landlords/<uid> riempiti dalle vecchie schede): /api/owner/* legge lì.
  const aliasKeys = plan.claimProof ? plan.aliases.map((a) => a.key).filter((k) => k !== uid) : [];
  const writes = [];
  let usersV, landV;
  try {
    [usersV, landV] = await Promise.all([fsGetVersioned('users/' + uid), fsGetVersioned('landlords/' + uid)]);
  } catch { return res.status(500).json({ ok: false, error: 'read_failed', uid }); }
  let usersDocState = 'existing';
  // La conferma riguarda la scheda che il piano ha mostrato: se nel frattempo
  // è sparita, o dichiara un authUid diverso, il piano non è più quello.
  if (plan.accountConfirmed && (!usersV || (usersV.data && usersV.data.authUid != null && usersV.data.authUid !== '' && usersV.data.authUid !== uid))) {
    return res.status(409).json({ ok: false, error: 'plan_changed' });
  }
  const prevAliases = usersV && Array.isArray(usersV.data.ownerAliases) ? usersV.data.ownerAliases.map((a) => (a && typeof a === 'object' ? a.key : a)).filter(validId) : [];
  const allAliases = [...new Set([...prevAliases, ...aliasKeys])];
  if (!usersV) {
    usersDocState = 'created';
    writes.push({ docPath: 'users/' + uid, precondition: { exists: false }, fields: {
      role: 'landlord', name: plan.name || '', email: plan.email, createdAt: new Date(), createdBy: 'owner-invite',
      ownerInvitedAt: at, ownerInvitedBy: by, ...(allAliases.length ? { ownerAliases: allAliases } : {}),
    } });
  } else {
    const u = usersV.data || {};
    if (u.role && !OWNER_ROLES.includes(u.role)) return res.status(409).json({ ok: false, error: 'role_conflict', role: clip(u.role, 20) });
    const f = {};
    if (!u.ownerInvitedAt) { f.ownerInvitedAt = at; f.ownerInvitedBy = by; }
    if (u.role === 'owner') { f.role = 'landlord'; usersDocState = 'upgraded'; }
    if (!u.role) f.role = 'landlord';
    if (allAliases.length !== prevAliases.length) f.ownerAliases = allAliases;
    // La conferma dell'admin, NELLO STESSO commit degli immobili: authUid è
    // la prova forte che da qui in poi vale da sola (le regole la tolgono al
    // titolare), accountConfirmedAt/By dicono chi l'ha data e quando.
    if (plan.accountConfirmed) { f.authUid = uid; f.accountConfirmedAt = at; f.accountConfirmedBy = by; }
    if (Object.keys(f).length) writes.push({ docPath: 'users/' + uid, precondition: { updateTime: usersV.updateTime }, fields: f });
  }
  const bound = [], claimed = [], kept = [], blocked = [];
  for (const p of plan.props) {
    if (p.action === 'keep') { kept.push(p.id); continue; }
    if (p.action === 'blocked') { blocked.push({ id: p.id, reason: p.reason }); continue; }
    const reason = p.action === 'claim' ? 'claim' : 'invite';
    writes.push({ docPath: 'properties/' + p.id, precondition: { updateTime: p.updateTime }, fields: {
      ownerId: uid,
      ownerIdHistory: [...p.history, { from: p.currentOwnerId || null, to: uid, at, by, reason }],
    } });
    if (p.action === 'claim') claimed.push({ id: p.id, from: p.currentOwnerId }); else bound.push(p.id);
  }
  if (aliasKeys.length) {
    const sources = [];
    for (const k of aliasKeys) { const l = await safeGet('landlords/' + k); if (l) sources.push(l); }
    for (const k of aliasKeys) { const u = await safeGet('users/' + k); if (u) sources.push(u); }
    const fill = gapFill(landV ? landV.data : {}, sources);
    if (Object.keys(fill).length) {
      writes.push({ docPath: 'landlords/' + uid, precondition: landV ? { updateTime: landV.updateTime } : { exists: false }, fields: fill });
    }
  }
  if (writes.length) {
    try { await fsCommit(writes); }
    catch (e) {
      if (e && e.conflict) return res.status(409).json({ ok: false, error: 'plan_changed', ...(createdAuth ? { uid } : {}) });
      console.error('[owner/invite] commit_failed');
      return res.status(500).json({ ok: false, error: 'commit_failed', ...(createdAuth ? { uid } : {}) });
    }
  }

  // 3. L'email, una volta sola (o su richiesta esplicita).
  let emailSent = false, emailSkipped = null, emailError = null;
  const alreadySent = !!(usersV && usersV.data && usersV.data.ownerInviteSentAt);
  if (alreadySent && body.resend !== true) emailSkipped = 'already_sent';
  else {
    try {
      await sendInvite({ name: plan.name, email: plan.email });
      emailSent = true;
      try { await fsPatch('users/' + uid, { ownerInviteSentAt: iso() }); }
      catch { console.warn('[owner/invite] sent_stamp_failed'); }
    } catch (e) {
      emailError = e && e.message === 'email_timeout' ? 'email_timeout' : 'email_failed';
      console.warn('[owner/invite]', emailError);
    }
  }

  await logActivity('owner_invited', 'owner', { uid, properties: bound.length + claimed.length + kept.length, emailSent,
    ...(plan.accountConfirmed ? { accountConfirmed: true, accountConfirmedBy: by, accountConfirmedAt: at } : {}) }, auth.uid);

  return res.status(200).json({
    ok: true, op: 'invite', uid, createdAuth, usersDoc: usersDocState,
    bound, claimed, kept, blocked, accountConfirmed: !!plan.accountConfirmed,
    emailSent, emailSkipped, ...(emailError ? { emailError } : {}),
    loginUrl: LOGIN_URL, portalUrl: PORTAL_URL,
    whatsappText: whatsappText(plan.name),
  });
}
