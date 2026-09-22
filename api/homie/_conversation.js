// A persisted lead binding is authoritative only with matching identity. This
// resolves references; it never moves messages, cases or historical ACLs.
import { fsGetVersioned, fsList, fsCommit } from './_lib.js';
import { normalizePhone, phoneVariants } from './_lead.js';

const valid = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value) && !['.', '..'].includes(value);
const guard = snapshot => snapshot ? { updateTime: snapshot.updateTime } : { exists: false };
const email = value => String(value || '').trim().toLowerCase();
export const leadConversationId = id => 'conv_lead_' + String(id).replace(/[^A-Za-z0-9_-]/g, '');
const bindingGuard = snapshot => {
  const key = ['conversationId', 'phone', 'email'].find(field => field in snapshot.data);
  if (!key) throw new Error('lead_identity_missing');
  return { docPath: 'leads/' + snapshot.data.id, fields: { [key]: snapshot.data[key] }, precondition: guard(snapshot) };
};
const outcome = (status, reason, cid = null, extra = {}) => ({ status, reason, cid, ...extra });

function identityProblem(lead, conv, cid, { allowBacklink = false } = {}) {
  const phone = normalizePhone(lead.phone), otherPhone = normalizePhone(conv.contactPhone);
  if (phone && otherPhone && phone !== otherPhone) return 'phone_conflict';
  if (email(lead.email) && email(conv.contactEmail) && email(lead.email) !== email(conv.contactEmail)) return 'email_conflict';
  if (conv.leadId && conv.leadId !== lead.id) return 'lead_conflict';
  if (conv.contactUid && conv.contactUid !== lead.convertedUserId) return 'user_binding_conflict';
  if (conv.assignedLandlordId && lead.ownerId && conv.assignedLandlordId !== lead.ownerId) return 'owner_conflict';
  if (conv.contactType === 'lead' && conv.contactId === lead.id) return null;
  if (['tenant', 'landlord'].includes(conv.contactType) && lead.convertedUserId
    && conv.contactId === lead.convertedUserId && conv.contactUid === lead.convertedUserId) return null;
  if (conv.contactType === 'whatsapp' && phone && phone === otherPhone
    && cid === 'conv_whatsapp_' + phone.replace(/^\+/, '') && conv.contactId === phone.replace(/^\+/, '')
    && (conv.leadId === lead.id || allowBacklink)) return null;
  return 'binding_not_verified';
}

async function sharedIdentity(lead) {
  // Two matching records already prove ambiguity. Different stored phone forms
  // are read independently; no first-match/limit-one choice establishes identity.
  const probes = phoneVariants(lead.phone).flatMap(value => ['leads', 'users', 'pfsClients', 'clients']
    .map(collection => ({ collection, field: 'phone', value })));
  if (!lead.phone && lead.email) probes.push({ collection: 'leads', field: 'email', value: lead.email });
  const pages = await Promise.all(probes.map(async probe => ({ ...probe,
    rows: await fsList(probe.collection, { filter: { field: probe.field, op: 'EQUAL', value: probe.value }, limit: 2 }) })));
  const conflict = pages.some(({ collection, rows }) => rows.some(row => collection === 'leads' ? row.id !== lead.id
    : collection === 'users' ? ['tenant', 'landlord'].includes(row.role) && row.id !== lead.convertedUserId : true));
  return conflict ? 'shared_contact_identity' : pages.some(page => page.rows.length >= 2) ? 'identity_scan_incomplete' : null;
}

async function established(cid, snapshot) {
  if (!snapshot) return false;
  const [messages, cases] = await Promise.all([
    fsList('messages', { filter: { field: 'conversationId', op: 'EQUAL', value: cid }, limit: 1 }),
    fsList('operatorTasks', { filter: { field: 'followUp.conversationId', op: 'EQUAL', value: cid }, limit: 1 }),
  ]);
  return messages.length > 0 || cases.length > 0;
}

// create is explicit for the admin open action and trusted server producers.
// attachCid is used only after that producer persisted the primary WA message;
// it cannot overwrite a different binding or merge two established chats.
export async function resolveLeadConversation({ leadId, create = false, attachCid = null } = {}) {
  if (!valid(leadId) || (attachCid !== null && !valid(attachCid))) return outcome('conflict', 'invalid_lead_reference');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const leadSnapshot = await fsGetVersioned('leads/' + leadId), lead = leadSnapshot?.data;
      if (!lead) return outcome('conflict', 'lead_missing');
      const primaryId = leadConversationId(leadId), binding = lead.conversationId || null;
      if (binding && !valid(binding)) return outcome('conflict', 'invalid_conversation_reference');
      if (attachCid && binding && binding !== attachCid) return outcome('conflict', 'binding_already_exists');
      const linked = await fsList('conversations', { filter: { field: 'leadId', op: 'EQUAL', value: leadId }, limit: 3 });
      const aliases = linked.filter(row => row.id !== primaryId);
      if (aliases.length > 1 || linked.length >= 3) return outcome('conflict', 'multiple_bound_conversations');
      if (binding && aliases.some(row => row.id !== binding)) return outcome('conflict', 'binding_reference_conflict');
      let candidateId = binding || attachCid || aliases[0]?.id || primaryId;
      // A raw WA chat may predate a lead arriving through another door. Its
      // number alone does not permit a second chat or an implicit merge.
      const rawId = normalizePhone(lead.phone) ? 'conv_whatsapp_' + normalizePhone(lead.phone).replace(/^\+/, '') : null;
      const raw = rawId && rawId !== candidateId ? await fsGetVersioned('conversations/' + rawId) : null;
      if (raw && raw.data.leadId !== leadId) return outcome('conflict', 'unbound_whatsapp_conversation');
      let [candidate, primary] = await Promise.all([
        fsGetVersioned('conversations/' + candidateId),
        candidateId === primaryId ? Promise.resolve(null) : fsGetVersioned('conversations/' + primaryId),
      ]);
      const identity = await sharedIdentity(lead);
      if (identity) return outcome(identity === 'identity_scan_incomplete' ? 'unavailable' : 'conflict', identity);
      const allowBacklink = !!(binding === candidateId || attachCid === candidateId);
      if (candidate) {
        const problem = identityProblem(lead, candidate.data, candidateId, { allowBacklink });
        if (problem) return outcome('conflict', problem);
      } else if (candidateId !== primaryId) return outcome('unavailable', 'bound_conversation_missing');
      if (primary) {
        const problem = identityProblem(lead, primary.data, primaryId);
        if (problem) return outcome('conflict', problem);
        const [candidateActive, primaryActive] = await Promise.all([established(candidateId, candidate), established(primaryId, primary)]);
        if (candidateActive && primaryActive) return outcome('conflict', 'multiple_established_conversations', null,
          { ingestFallback: { cid: primaryId, conversation: primary.data, bindingGuard: bindingGuard(leadSnapshot) } });
        // A primary that already has history must not be abandoned because a
        // historical empty reference happens to point elsewhere.
        if (primaryActive) {
          if (!binding && !attachCid && !candidateActive) { candidateId = primaryId; candidate = primary; primary = null; }
          else return outcome('conflict', 'primary_conversation_has_history', null,
            { ingestFallback: { cid: primaryId, conversation: primary.data, bindingGuard: bindingGuard(leadSnapshot) } });
        }
      }
      const complete = candidate && binding === candidateId && candidate.data.leadId === leadId;
      if (complete) return outcome('bound', 'persisted_binding', candidateId, { conversation: candidate.data, leadId, bindingGuard: bindingGuard(leadSnapshot) });
      if (!create) return candidate && !binding && (candidateId === primaryId || candidate.data.leadId === leadId)
        ? outcome('bound', 'verified_binding', candidateId, { conversation: candidate.data, leadId, bindingGuard: bindingGuard(leadSnapshot) })
        : !candidate && candidateId === primaryId ? outcome('new', 'verified_absence', candidateId,
          { conversation: { id: candidateId, contactType: 'lead', contactId: leadId, contactUid: lead.convertedUserId || null,
            assignedLandlordId: lead.ownerId || null, contactPhone: normalizePhone(lead.phone) || '', contactEmail: lead.email || '' }, bindingGuard: bindingGuard(leadSnapshot) })
        : outcome('unavailable', candidate ? 'binding_incomplete' : 'conversation_missing');
      const fields = candidate ? { leadId } : {
        contactType: 'lead', contactId: leadId, leadId,
        contactName: lead.name || lead.phone || lead.email || 'Senza nome', contactPhone: normalizePhone(lead.phone) || '',
        contactEmail: lead.email || '', contactUid: lead.convertedUserId || null, assignedLandlordId: lead.ownerId || null,
        channel: lead.phone ? 'whatsapp' : 'email', status: 'open', createdAt: new Date(), tags: [], unread: 0,
      };
      const writes = [
        { docPath: 'leads/' + leadId, fields: { conversationId: candidateId }, precondition: guard(leadSnapshot) },
        { docPath: 'conversations/' + candidateId, fields, precondition: guard(candidate) },
      ];
      // Bind the observation of an existing alternate too. Its history cannot
      // change between selection and the commit unnoticed.
      if (candidateId !== primaryId) writes.push(primary
        ? { docPath: 'conversations/' + primaryId, fields: { leadId }, precondition: guard(primary) }
        : { docPath: 'conversations/' + primaryId, assertAbsent: true });
      if (rawId && rawId !== candidateId) writes.push(raw
        ? { docPath: 'conversations/' + rawId, fields: { leadId }, precondition: guard(raw) }
        : { docPath: 'conversations/' + rawId, assertAbsent: true });
      try {
        const committed = await fsCommit(writes);
        return outcome(candidate ? 'bound' : 'new', candidate ? 'binding_completed' : 'conversation_created', candidateId,
          { conversation: { ...candidate?.data, ...fields, id: candidateId }, leadId,
            bindingGuard: bindingGuard({ data: { ...lead, conversationId: candidateId }, updateTime: committed.writeResults[0].updateTime }) });
      } catch (error) { if (!error?.conflict) throw error; }
    }
    return outcome('unavailable', 'conversation_changed_concurrently');
  } catch { return outcome('unavailable', 'conversation_lookup_failed'); }
}

// The first substantive WA message already exists. Create its lead and reciprocal
// binding together, so two first messages cannot leave separate lead records.
export async function createWhatsAppLead({ leadId, cid, fields }) {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await fsGetVersioned('conversations/' + cid);
      if (!snapshot) return outcome('unavailable', 'conversation_missing');
      if (snapshot.data.leadId) return resolveLeadConversation({ leadId: snapshot.data.leadId, create: true, attachCid: cid });
      const lead = { ...fields, id: leadId };
      const problem = identityProblem(lead, snapshot.data, cid, { allowBacklink: true });
      const identity = problem || await sharedIdentity(lead);
      if (identity) return outcome(identity === 'identity_scan_incomplete' ? 'unavailable' : 'conflict', identity);
      try {
        await fsCommit([
          { docPath: 'leads/' + leadId, fields, precondition: { exists: false } },
          { docPath: 'conversations/' + cid, fields: { leadId }, precondition: guard(snapshot) },
          { docPath: 'conversations/' + leadConversationId(leadId), assertAbsent: true },
        ]);
        return outcome('new', 'lead_created', cid, { conversation: { ...snapshot.data, leadId }, leadId });
      } catch (error) { if (!error?.conflict) throw error; }
    }
    return outcome('unavailable', 'conversation_changed_concurrently');
  } catch { return outcome('unavailable', 'conversation_lookup_failed'); }
}
