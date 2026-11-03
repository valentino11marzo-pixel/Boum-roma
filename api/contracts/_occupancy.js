// api/contracts/_occupancy.js — quando un contratto è firmato da tutti,
// la casa è AFFITTATA: in UNA copia.
//
// Fino al 2/11/2026 queste tre scritture vivevano solo dentro
// api/magic-sign/submit: un contratto firmato fuori da Magic Sign e caricato
// (api/contracts/_external.js) lasciava l'immobile «libero», l'annuncio in
// vetrina senza la data di rilascio e il lead aperto. Stesse scritture,
// stesso ordine, per entrambe le strade. Ognuna è best-effort e dice il suo
// esito: chi chiama decide se un guasto blocca (il recupero del firmato
// esterno lo mostra, la firma Magic Sign no).
import { fsPatch, fsList } from '../homie/_lib.js';
import { commitWrites } from '../magic-sign/_shared.js';

// Il giorno in cui la casa torna libera: quello DOPO la scadenza.
export function freeFrom(endDate) {
  const end = String(endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(end)) return null;
  const free = new Date(end.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(free.getTime())) return null;
  free.setUTCDate(free.getUTCDate() + 1);
  return free.toISOString().slice(0, 10);
}

export async function applyOccupancy(contractId, contract) {
  const c = contract || {};
  const out = { lead: 'none', property: 'none', listing: 'none' };

  // (b) Lead closure
  if (c.linkedLeadId) {
    const leadCol = c.linkedLeadSource === 'pfs' ? 'pfsClients' : 'leads';
    try {
      await commitWrites([{
        docPath: `${leadCol}/${c.linkedLeadId}`,
        fields: { stage: 'closed', linkedContractId: contractId },
        serverTimestampFields: ['closedAt'],
      }]);
      out.lead = 'closed';
    } catch (e) { out.lead = 'failed'; console.warn('[occupancy] lead close:', e.message); }
  }

  // (c) Property status
  if (c.propertyId) {
    try {
      await fsPatch('properties/' + c.propertyId, { status: 'rented', currentContractId: contractId });
      out.property = 'rented';
    } catch (e) { out.property = 'failed'; console.warn('[occupancy] property status:', e.message); }
  }

  // (d) Listing sync
  // LA DATA PIÙ AFFIDABILE DEL SISTEMA: il contratto sa ESATTAMENTE quando
  // la casa torna libera (endDate). La casa affittata porta con sé il giorno
  // in cui si rilibera (availableFrom = endDate + 1), così la vetrina può
  // prenotarla in anticipo e i portali la ricevono.
  if (c.propertyId) {
    try {
      const listings = await fsList('listings', {
        filter: { field: 'propertyId', op: 'EQUAL', value: c.propertyId },
        limit: 1,
      });
      if (listings[0]) {
        const patch = { status: 'rented' };
        const iso = freeFrom(c.endDate);
        if (iso) {
          patch.availableFrom = iso;
          patch.availableDate = iso;
          patch.availableKind = 'date';
          patch.availableRaw = 'fine contratto ' + String(c.endDate).slice(0, 10);
          patch.availabilityUpdatedAt = new Date().toISOString();
          patch.availabilityUpdatedBy = 'contract:' + contractId;
        }
        await fsPatch('listings/' + listings[0].id, patch);
        out.listing = 'synced';
      }
    } catch (e) { out.listing = 'failed'; console.warn('[occupancy] listing sync:', e.message); }
  }

  out.ok = out.lead !== 'failed' && out.property !== 'failed' && out.listing !== 'failed';
  return out;
}
