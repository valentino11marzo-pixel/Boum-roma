// api/profile/_scheda.js
// La Scheda — shared helpers for the universal client-anagrafica link.
//
// The token is DERIVED (never stored), same pattern as the viewings'
// manageToken (api/viewings/_lib.js): every contract ever created — signed
// ones included, whose sign tokens are long nulled — already has a valid
// scheda link, with no migration and nothing to keep in sync. Rotating
// HOMIE_SECRET revokes every link at once. The role lives INSIDE the
// derivation, so a tenant link can never be replayed as a landlord one,
// and the context string differs from every other derived token in the
// codebase: holding a scheda link never lets you sign.

import crypto from 'node:crypto';
// Il DIZIONARIO del contratto (js/contract-fields.js, UMD): "identità
// completa" e il checksum del CF vivono lì, una copia sola — la stessa che
// il portal e la Scheda usano per dire cosa manca.
import FIELDS from '../../js/contract-fields.js';

const SITE = 'https://www.boomrome.com';

// I CO-CONDUTTORI sono conduttori per l'AdE (una riga RLI ciascuno, CF
// obbligatorio): hanno il LORO link /scheda, derivato con l'indice dentro
// la derivazione (come cosignToken per la firma) — un link di co-conduttore
// scrive SOLO coTenants[idx], mai il conduttore principale.
export function schedaToken(contractId, role, coIndex) {
  const salt = process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
  const ctx = role === 'cotenant' ? `cotenant:${Number(coIndex) || 0}` : role;
  return crypto.createHash('sha256')
    .update(`scheda:${ctx}:${contractId}:${salt}`)
    .digest('hex').slice(0, 24);
}

/** One opaque blob for the URL: `<contractId>.<t|l|c<idx>>.<token>` */
export const schedaRef = (contractId, role, coIndex) =>
  `${contractId}.${role === 'landlord' ? 'l' : role === 'cotenant' ? 'c' + (Number(coIndex) || 0) : 't'}.${schedaToken(contractId, role, coIndex)}`;

/** @returns { contractId, role, coIndex? } when the token checks out, otherwise null */
export function parseSchedaRef(ref) {
  const parts = String(ref || '').trim().split('.');
  if (parts.length < 3) return null;
  const token = parts.pop();
  const roleChar = parts.pop();
  const contractId = parts.join('.');
  let role = null, coIndex;
  if (roleChar === 'l') role = 'landlord';
  else if (roleChar === 't') role = 'tenant';
  else if (/^c\d{1,2}$/.test(roleChar)) { role = 'cotenant'; coIndex = Number(roleChar.slice(1)); }
  if (!contractId || !role || !token) return null;
  const want = Buffer.from(schedaToken(contractId, role, coIndex));
  const got = Buffer.from(token);
  if (got.length !== want.length) return null;
  if (!crypto.timingSafeEqual(got, want)) return null;
  return role === 'cotenant' ? { contractId, role, coIndex } : { contractId, role };
}

export const schedaUrl = (contractId, role, coIndex) => `${SITE}/scheda?t=${schedaRef(contractId, role, coIndex)}`;

// A signed party's identity is frozen: the scheda goes read-only the moment
// that party's signature exists (mutating the anagrafica of a signed act is
// exactly what the Magic Sign audit forbids post-firma). A co-tenant is
// frozen by HIS OWN signature only.
export function schedaLocked(contract, role, coIndex) {
  if (!contract) return true;
  if (role === 'cotenant') {
    const co = (Array.isArray(contract.coTenants) ? contract.coTenants : [])[Number(coIndex) || 0];
    return !co || !!co.signature;
  }
  return role === 'tenant' ? !!contract.tenantSignature : !!contract.landlordSignature;
}

// Merge precedence for prefill: contract fields (what the paper will print)
// → users "sign" schema (cf/dob/…, written by magic-sign & convert)
// → users "wizard" schema (codiceFiscale/birthDate/…, written by older flows).
export function mergedIdentity(contract, user, role) {
  const c = contract || {}, u = user || {};
  const P = role === 'landlord' ? 'landlord' : 'tenant';
  const pick = (...vals) => { for (const v of vals) { if (v != null && String(v).trim() !== '') return String(v); } return ''; };
  return {
    name:        pick(c[P + 'Name'], u.name),
    cf:          pick(c[P + 'CF'], u.cf, u.codiceFiscale).toUpperCase(),
    dob:         pick(c[P + 'Dob'], u.dob, u.birthDate),
    pob:         pick(c[P + 'Pob'], u.pob, u.birthPlace),
    address:     pick(c[P + 'Address'], u.address),
    docType:     pick(c[P + 'DocType'], u.docType, u.idDocType),
    docNum:      pick(c[P + 'DocNum'], u.docNum, u.idDocNumber),
    docIssuer:   pick(c[P + 'DocIssuer'], u.docIssuer),
    docIssueDate:pick(c[P + 'DocIssueDate'], u.docIssueDate),
    nationality: pick(c[P + 'Nationality'], u.nationality),
    phone:       pick(c[P + 'Phone'], u.phone),
    email:       pick(u.email, c[P + 'Email']),
  };
}

// Completa = niente puntini sul modello IN VIGORE per quella parte: su
// Allegato C (studenti) il documento va anche con ente e data di rilascio,
// che il modello stampa («rilasciata da … il …»). opts: { role, template }.
export function identityComplete(d, opts) {
  return FIELDS.identityComplete(d, opts);
}

// Italian Codice Fiscale checksum (persone fisiche) — dal dizionario.
export const validCF = FIELDS.validCF;
