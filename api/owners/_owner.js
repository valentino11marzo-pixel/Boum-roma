// api/owners/_owner.js — CHI È il proprietario, e cosa è suo.
//
// Il problema che questo file risolve è di identità, non di interfaccia:
// `properties.ownerId` punta a volte a `users/<uid>` (l'account Firebase —
// quello che firestore.rules sa leggere) e a volte a `landlords/<id>`, la
// scheda CRM che l'operatore compila senza creare nessun account (portal
// line ~8678, rendiconto, send-link leggono ENTRAMBI). Le rules confrontano
// `ownerId == auth.uid`: per un immobile intestato a una scheda landlords il
// proprietario loggato non vedeva NIENTE, e riscrivere ownerId per farlo
// combaciare spezzerebbe ogni lettore di `landlords/<ownerId>` (IBAN, CF).
//
// Quindi l'identità si risolve QUI, server-side, una copia sola: le CHIAVI di
// un proprietario sono il suo uid + le schede landlords legate a lui. Il
// legame è scritto da noi (users.landlordId / landlords.userId, al momento
// dell'invito, confermati dalla scheda landlords che solo l'admin scrive).
//
// Tutto passa per le credenziali admin: le rules non c'entrano, e il
// perimetro lo decidono queste funzioni (testate in tests/owner/run.mjs).

import { fsGet, fsList } from '../homie/_lib.js';

const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
export const normEmail = (e) => clip(e, 200).toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// I ruoli che possono avere un'area proprietario. 'owner' è il nome storico
// dello stesso ruolo (le rules conoscono solo 'landlord').
export const OWNER_ROLES = new Set(['landlord', 'owner']);

// Le chiavi di un proprietario: il suo uid e le schede landlords che puntano
// a LUI (`landlords.userId == uid`). Solo legami che scrive il server o
// l'admin: `landlords` è admin-only nelle rules, mentre il profilo `users`
// il proprietario lo può aggiornare da sé (le rules vietano solo `role`) —
// quindi `profile.landlordId` vale solo se la scheda lo conferma, e l'email
// del profilo NON apre niente. Prima versione di questo file: adottava le
// schede con la stessa email del profilo; bastava riscriversi l'email per
// vedere gli immobili di un altro (trovato rileggendo, mai andato in
// produzione — la regola ora è pinnata nei test).
export async function ownerKeys(uid, profile = {}) {
  const keys = new Set();
  if (!uid) return keys;
  keys.add(String(uid));
  const [linked, declared] = await Promise.all([
    fsList('landlords', { filter: { field: 'userId', op: 'EQUAL', value: String(uid) }, limit: 10 }).catch(() => []),
    profile.landlordId ? fsGet('landlords/' + clip(profile.landlordId, 80)).catch(() => null) : null,
  ]);
  for (const l of linked || []) if (l && l.id) keys.add(String(l.id));
  if (declared && String(declared.userId || '') === String(uid)) keys.add(clip(profile.landlordId, 80));
  return keys;
}

// Gli immobili di un proprietario: ownerId ∈ chiavi. Una query per chiave
// (poche: un uid e una o due schede), deduplicati per id.
export async function ownerProperties(keys) {
  const seen = new Map();
  const rows = await Promise.all([...keys].map((k) =>
    fsList('properties', { filter: { field: 'ownerId', op: 'EQUAL', value: k }, limit: 100 }).catch(() => [])));
  for (const list of rows) for (const p of list || []) if (p && p.id && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

// L'immobile è di chi chiama? L'admin sì sempre; il proprietario se ownerId
// è una delle sue chiavi. Il percorso veloce (ownerId === uid) non costa letture.
export async function ownsProperty(auth, prop) {
  if (!auth || !prop) return false;
  if (auth.profile && auth.profile.role === 'admin') return true;
  if (!OWNER_ROLES.has(String((auth.profile || {}).role || ''))) return false;
  const oid = String(prop.ownerId || '');
  if (!oid) return false;
  if (oid === String(auth.uid)) return true;
  const keys = await ownerKeys(auth.uid, auth.profile || {});
  return keys.has(oid);
}

// L'email del proprietario di un immobile, ovunque sia scritta:
// users/<ownerId> → landlords/<ownerId> → il contratto (landlordEmail).
export async function ownerContact(prop, contract) {
  const oid = clip(prop && prop.ownerId, 80);
  const [u, l] = oid ? await Promise.all([
    fsGet('users/' + oid).catch(() => null),
    fsGet('landlords/' + oid).catch(() => null),
  ]) : [null, null];
  const email = normEmail((u && u.email) || (l && l.email) || (contract && contract.landlordEmail) || '');
  return {
    ownerId: oid || null,
    userId: u && OWNER_ROLES.has(String(u.role || '')) ? oid : (l && l.userId) || null,
    landlordId: l ? oid : ((u && u.landlordId) || null),
    email: EMAIL_RE.test(email) ? email : '',
    name: clip((u && u.name) || (l && (l.name || [l.firstName, l.lastName].filter(Boolean).join(' '))) || (contract && contract.landlordName) || '', 120),
    phone: clip((u && u.phone) || (l && l.phone) || (contract && contract.landlordPhone) || '', 40),
  };
}
