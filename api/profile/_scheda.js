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

const SITE = 'https://www.boomrome.com';

export function schedaToken(contractId, role) {
  const salt = process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
  return crypto.createHash('sha256')
    .update(`scheda:${role}:${contractId}:${salt}`)
    .digest('hex').slice(0, 24);
}

/** One opaque blob for the URL: `<contractId>.<t|l>.<token>` */
export const schedaRef = (contractId, role) =>
  `${contractId}.${role === 'landlord' ? 'l' : 't'}.${schedaToken(contractId, role)}`;

/** @returns { contractId, role } when the token checks out, otherwise null */
export function parseSchedaRef(ref) {
  const parts = String(ref || '').trim().split('.');
  if (parts.length < 3) return null;
  const token = parts.pop();
  const roleChar = parts.pop();
  const contractId = parts.join('.');
  const role = roleChar === 'l' ? 'landlord' : (roleChar === 't' ? 'tenant' : null);
  if (!contractId || !role || !token) return null;
  const want = Buffer.from(schedaToken(contractId, role));
  const got = Buffer.from(token);
  if (got.length !== want.length) return null;
  return crypto.timingSafeEqual(got, want) ? { contractId, role } : null;
}

export const schedaUrl = (contractId, role) => `${SITE}/scheda?t=${schedaRef(contractId, role)}`;

// A signed party's identity is frozen: the scheda goes read-only the moment
// that party's signature exists (mutating the anagrafica of a signed act is
// exactly what the Magic Sign audit forbids post-firma).
export function schedaLocked(contract, role) {
  if (!contract) return true;
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

export function identityComplete(d) {
  return !!(d && d.name && d.cf && d.dob && d.pob && d.address && d.docNum && d.nationality);
}

// Italian Codice Fiscale checksum (persone fisiche). Empty input → caller
// decides; structurally wrong or bad checksum → false.
export function validCF(cf) {
  const s = String(cf || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{16}$/.test(s)) return false;
  const odd = { 0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23 };
  const even = { 0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25 };
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += (i % 2 === 0) ? odd[s[i]] : even[s[i]];
  return String.fromCharCode(65 + (sum % 26)) === s[15];
}
