// Persisted boundary for an Owner Command. Every later preparation or approval
// reuses this exact target instead of resolving the spoken name again.
import { normalizePhone } from '../homie/_lead.js';

const id = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value) && !['.', '..'].includes(value);
const ref = (value, collections) => typeof value === 'string'
  && new RegExp(`^(?:${collections})/[\\w.-]{1,180}$`).test(value);

export function cleanOwnerTarget(value, conversationId) {
  if (!value || !id(conversationId) || value.conversationId !== conversationId
      || !ref(value.personRef, 'users|landlords|clients|pfsClients|leads')
      || !ref(value.practiceRef, 'contracts|leads|pfsClients|viewingRequests')
      || !ref(value.propertyRef, 'properties|listings')
      || !['whatsapp', 'email'].includes(value.channel)
      || typeof value.address !== 'string' || !value.address.trim() || value.address.length > 320
      || typeof value.contactFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.contactFingerprint)) return null;
  return { conversationId, personRef: value.personRef, practiceRef: value.practiceRef,
    propertyRef: value.propertyRef, channel: value.channel, address: value.address.trim(),
    contactFingerprint: value.contactFingerprint };
}

export function storedOwnerTarget(followUp) {
  return followUp?.source === 'owner-command' ? cleanOwnerTarget(followUp.ownerCommand, followUp.conversationId) : null;
}

export const sameOwnerTarget = (left, right) => !!left && !!right && JSON.stringify(left) === JSON.stringify(right);

export function conversationTarget(conversation = {}) {
  const channel = conversation.channel === 'email' ? 'email' : conversation.contactPhone ? 'whatsapp' : 'email';
  return { conversationId: conversation.id || null, channel,
    address: channel === 'whatsapp' ? normalizePhone(conversation.contactPhone || '')
      : String(conversation.contactEmail || '').trim().toLowerCase() };
}

export function dossierOwnerTargetIssue(dossier = {}, target) {
  if (!target) return 'person';
  const uncertain = dossier.evidence?.some(item => ['incomplete', 'ambiguity'].includes(item.kind)
    && item.reason !== 'multiple_practices' && (item.scope === 'identity'
      || (item.scope === 'relations' && (!item.ref || [target.practiceRef, target.propertyRef].includes(item.ref)))));
  if (dossier.identityIncomplete || dossier.identityAmbiguous || uncertain
      || !dossier.people?.some(person => person.ref === target.personRef)) return 'person';
  const practice = dossier.practices?.find(item => item.ref === target.practiceRef);
  if (!practice) return 'practice';
  if (practice.propertyRefs?.length !== 1 || practice.propertyRefs[0] !== target.propertyRef
      || !dossier.properties?.some(property => property.ref === target.propertyRef)) return 'property';
  return null;
}

export const dossierHasOwnerTarget = (dossier, target) => dossierOwnerTargetIssue(dossier, target) === null;
