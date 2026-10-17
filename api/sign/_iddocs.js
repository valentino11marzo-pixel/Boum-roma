// api/sign/_iddocs.js — I DOCUMENTI D'IDENTITÀ DA DOVE STANNO (15/10/2026).
//
// Il pacchetto di registrazione (email a Valentino, pack ZIP, foglio, iter
// ASPI) leggeva i documenti SOLO da `contract.identityDocs`. Ma un documento
// caricato una volta sul profilo della parte — `users/<uid>.identityDocs`
// (lo specchio di /scheda, il caricamento dal portal) o `landlords/<id>` —
// non arrivava al contratto nuovo della stessa persona: il proprietario con
// tre case caricava la carta d'identità per la prima e per le altre due il
// pacchetto diceva «manca il documento del locatore».
//
// Qui la lista si COMPONE: prima quella del contratto (com'è, nell'ordine),
// poi i documenti del profilo che il contratto non ha già (stesso URL = lo
// stesso file), col ruolo della parte a cui appartiene il profilo. Niente
// si scrive: è una lettura, rifatta da chi ne ha bisogno.

import { fsGet } from '../homie/_lib.js';

const listOf = (x) => (x && Array.isArray(x.identityDocs) ? x.identityDocs : []);

// Pura. tenant / landlordU / landlordR / coUsers[i] sono i documenti profilo
// già letti (null se assenti).
export function mergeIdentityDocs(contract, { tenant, landlordU, landlordR, coUsers } = {}) {
  const c = contract || {};
  const out = [];
  const seen = new Set();
  const add = (d, extra) => {
    if (!d || !d.url) return;
    const k = String(d.url);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(extra ? { ...d, ...extra } : d);
  };
  listOf(c).forEach((d) => add(d));
  listOf(tenant).forEach((d) => add(d, { role: 'tenant', source: 'profile' }));
  listOf(landlordU).forEach((d) => add(d, { role: 'landlord', source: 'profile' }));
  listOf(landlordR).forEach((d) => add(d, { role: 'landlord', source: 'profile' }));
  (Array.isArray(coUsers) ? coUsers : []).forEach((u, i) =>
    listOf(u).forEach((d) => add(d, { role: 'tenant', tenantIndex: i + 1, source: 'profile' })));
  return out;
}

// I/O: legge i profili delle parti e restituisce una COPIA del contratto con
// la lista composta. Mai un'eccezione: un profilo illeggibile vale «assente».
export async function withProfileDocs(contract, property) {
  const c = contract || {};
  try {
    const get = (p) => fsGet(p).catch(() => null);
    const prop = property || (c.propertyId ? await get('properties/' + c.propertyId) : null) || {};
    const ownerId = prop.ownerId || c.landlordId || '';
    const cos = Array.isArray(c.coTenants) ? c.coTenants : [];
    const [tenant, landlordU, landlordR, ...coUsers] = await Promise.all([
      c.tenantId ? get('users/' + c.tenantId) : null,
      ownerId ? get('users/' + ownerId) : null,
      ownerId ? get('landlords/' + ownerId) : null,
      ...cos.map((x) => (x && x.userId ? get('users/' + x.userId) : null)),
    ]);
    return { ...c, identityDocs: mergeIdentityDocs(c, { tenant, landlordU, landlordR, coUsers }) };
  } catch (e) {
    console.warn('[iddocs]', e.message);
    return c;
  }
}
