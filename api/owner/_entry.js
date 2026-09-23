// api/owner/_entry.js — la porta dell'Archivio dentro le email che esistono già.
//
// Due funzioni e niente altro, di proposito: le email di firma
// (api/sign/_notify.js), del rendiconto (api/owners/rendiconto.js) e del
// verbale (api/contracts/verbale.js) le importano, e non devono trascinarsi
// dietro il modulo dell'invito né il motore dell'archivio — un errore lì non
// può fermare l'email di una firma completa (22/09/2026).

export const PORTAL_URL = 'https://www.boomrome.com/proprietario';

// Il bottone «Apri il suo archivio» compare SOLO a chi può davvero entrare:
// un landlord invitato (ownerInvitedAt) o che è già entrato (ownerPortalFirstAt).
// Un doc users "ombra" (magic-sign ne crea) o un profilo senza login vedrebbe
// una porta che non si apre.
export function ownerArchiveOpen(user) {
  return !!(user && user.role === 'landlord' && (user.ownerInvitedAt || user.ownerPortalFirstAt));
}

// Il link all'archivio con il frammento (#c=… / #r=…): nessun segreto, www.
export function ownerArchiveUrl(hash) {
  return PORTAL_URL + (hash ? '#' + hash : '');
}
