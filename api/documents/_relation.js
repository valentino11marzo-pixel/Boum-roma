// Relazioni dello Smistatore: solo dati registrati, nessun webhook o agente.
import { fsList } from '../homie/_lib.js';

// Lettura condivisa dalle due porte, senza memoria propria. Una scansione
// incompleta NON può trasformare due immobili in un default unico.
export async function loadDocumentRelations() {
  const collections = ['landlords', 'users', 'contracts', 'properties'];
  const rows = await Promise.all(collections.map(c => fsList(c, { limit: 1000 })));
  if (rows.some(r => r.length >= 1000)) throw new Error('relation_scan_incomplete');
  return Object.fromEntries(collections.map((c, i) => [c, rows[i]]));
}

export const documentEmail = value => String(value || '').trim().toLowerCase();

// Solo legami registrati: email, ids delle parti, property.ownerId. Mai il
// nome, il testo del messaggio o la prima casa trovata. Condivisa dalle due porte.
export function documentRelation(archive, { email, contactType, contactId } = {}) {
  const address = documentEmail(email);
  const ownerIds = new Set(), tenantIds = new Set(), propertyIds = new Set(), contractIds = new Set();
  let label = '', landlord = false, tenant = false;
  const matches = (p, kind) => (address && documentEmail(p.email) === address)
    || (contactType === kind && contactId && p.id === contactId);
  for (const p of [...archive.landlords.map(p => ({ ...p, role: 'landlord' })), ...archive.users]) {
    if (!['landlord', 'tenant'].includes(p.role) || !matches(p, p.role)) continue;
    if (p.role === 'landlord') { landlord = true; ownerIds.add(p.id); }
    else { tenant = true; tenantIds.add(p.id); }
    label ||= p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
  }
  for (const c of archive.contracts) {
    if (address && documentEmail(c.landlordEmail) === address) {
      landlord = true;
      if (c.landlordId) ownerIds.add(c.landlordId);
    }
    if (address && documentEmail(c.tenantEmail) === address) {
      tenant = true;
      if (c.tenantId) tenantIds.add(c.tenantId);
    }
  }
  for (const p of archive.properties) if (ownerIds.has(p.ownerId)) propertyIds.add(p.id);
  for (const c of archive.contracts) {
    if (ownerIds.has(c.landlordId) || tenantIds.has(c.tenantId)
      || (address && [c.landlordEmail, c.tenantEmail].some(e => documentEmail(e) === address))) {
      contractIds.add(c.id);
      if (c.propertyId) propertyIds.add(c.propertyId);
    }
  }
  if (!landlord && !tenant) return null;
  // L'interfaccia tratta una lista vuota come catalogo libero e tronca a 50:
  // qui quel caso deve restare da smistare, mai un permesso implicito.
  // Anche il catalogo dello Smistatore ha un tetto (200): oltre quel tetto
  // non sappiamo se vedrebbe tutti i candidati, quindi niente default.
  const bounded = propertyIds.size > 0 && propertyIds.size <= 50 && contractIds.size <= 50
    && archive.properties.length < 200;
  return { kind: bounded ? (landlord ? 'landlord' : 'tenant') : 'unknown',
    label: label || address || contactId, propertyIds: [...propertyIds], contractIds: [...contractIds] };
}
