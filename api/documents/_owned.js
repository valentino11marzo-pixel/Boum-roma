// api/documents/_owned.js — di CHI è un documento, in una copia sola.
//
// Una condivisione per il commercialista (documentShares → /share.html) porta
// una lista di id di `documents`, e la porta pubblica /api/share/lookup li
// risolve con le credenziali admin. Senza un controllo, la lista poteva
// nominare il documento di CHIUNQUE: gli id sono deterministici e si deducono
// dall'indirizzo di un palazzo (`rent-receipt-pay_c_plz_<via>_<n>_<mese>`,
// `contract-signed_<contratto>_tenant`), quindi un proprietario poteva farsi
// consegnare la ricevuta o il contratto firmato dell'inquilino di un altro
// palazzo, con l'URL di Storage firmato (13/10/2026).
//
// Un documento è di `ownerId` se:
//   · è suo (`userId === ownerId`), oppure
//   · è legato a un immobile di cui è proprietario (`properties/<propertyId>.ownerId === ownerId`).
// La lista si legge in blocco (una batchGet per gli immobili).

import { fsGetMany } from '../homie/_lib.js';

// Un id di documento ammissibile come segmento di path Firestore: niente '/',
// niente '.'/'..' (una lista che portasse 'x/../users/…' non esce dalla
// collection).
export function validDocId(id) {
  return typeof id === 'string' && /^[\w.-]{1,200}$/.test(id) && id !== '.' && id !== '..';
}

// docs: Map 'documents/<id>' → doc|null (come la dà fsGetMany), oppure array
// di documenti con `id`. → { owned: Set<id>, foreign: [id], missing: [id], propsById }
export async function ownership(ownerId, docs, { properties } = {}) {
  const list = docs instanceof Map
    ? [...docs.entries()].map(([path, d]) => ({ id: path.split('/')[1], d }))
    : (docs || []).map(d => ({ id: d && d.id, d }));
  const owner = typeof ownerId === 'string' ? ownerId : '';
  const propIds = [...new Set(list.map(x => x.d && x.d.propertyId).filter(validDocId))];
  const propsById = properties || new Map();
  const toRead = propIds.filter(p => !propsById.has('properties/' + p)).map(p => 'properties/' + p);
  if (toRead.length) {
    const got = await fsGetMany(toRead);
    for (const [k, v] of got) propsById.set(k, v);
  }
  const owned = new Set(), foreign = [], missing = [];
  for (const { id, d } of list) {
    if (!d) { missing.push(id); continue; }
    const prop = d.propertyId ? propsById.get('properties/' + d.propertyId) : null;
    const mine = !!owner && (d.userId === owner || !!(prop && prop.ownerId === owner));
    if (mine) owned.add(id); else foreign.push(id);
  }
  return { owned, foreign, missing, propsById };
}
