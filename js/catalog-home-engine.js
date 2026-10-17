/* Connections use saved IDs only. A listing and a managed property are
 * different records; equal names, addresses or IDs do not establish a link. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_CATALOG_HOME_ENGINE = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';
  const str = v => typeof v === 'string' ? v.trim() : '';
  function connections(listing, state = {}) {
    const properties = state.properties || [], users = state.users || [], landlords = state.landlords || [];
    const direct = str(listing.propertyId);
    const reverse = properties.filter(p => p.listingId === listing.id);
    const ids = new Set([direct, ...reverse.map(p => p.id)].filter(Boolean));
    if (ids.size > 1) return {state:'conflict', label:'Collegamenti da verificare', detail:'Questa scheda rimanda a immobili diversi. Verifica il collegamento prima di aprire la gestione.'};
    const id = [...ids][0], matches = properties.filter(p => p.id === id);
    if (!id) return {state:'missing', label:'Gestione da collegare', detail:'Il catalogo non ha ancora un collegamento esplicito al fascicolo della casa.'};
    if (matches.length !== 1 || (matches[0].listingId && matches[0].listingId !== listing.id))
      return {state:'conflict', label:'Collegamento da verificare', detail:'Il fascicolo collegato manca nei dati caricati oppure rimanda a un altro annuncio.'};
    const property = matches[0], ownerId = str(property.ownerId);
    const people = users.filter(u => u.id === ownerId), contacts = landlords.filter(u => u.id === ownerId);
    const owner = people.length + contacts.length === 1 ? [...people,...contacts][0] : null;
    const account = !!owner && people.length === 1 && ['owner','landlord'].includes(owner.role);
    return {state:'linked', property, owner:account || contacts.length === 1 && !people.length ? owner : null,
      ownerKind:account ? 'account' : owner && contacts.length === 1 && !people.length ? 'contact' : 'unknown',
      label:property.name || property.address || 'Fascicolo della casa',
      detail:'Contratti, canoni, documenti e attività della stessa casa.'};
  }
  return {connections};
}));
