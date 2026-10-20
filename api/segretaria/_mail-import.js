// One atomic email import shared by scheduled intake and explicit mailbox import.
// No models, follow-up enrollment, identity changes, or outbound operations.
import { fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { normalizePhone } from '../homie/_lead.js';
import { resolveLeadConversation } from '../homie/_conversation.js';
export class MailImportError extends Error {
  constructor(code, status = 409) { super(code); this.status = status; }
}
const fail = (code, status = 500) => new MailImportError(code, status);

export const emailKey = value => String(value || '').trim().toLowerCase();
export const emailBinding = conv => JSON.stringify([conv.contactType || '', conv.contactId || '', conv.contactUid || '',
  conv.leadId || '', emailKey(conv.contactEmail), normalizePhone(conv.contactPhone) || '',
  conv.assignedLandlordId || '', !!conv.conversationBindingConflict]);

export async function scopedConversation(conv, { manualOnly = false } = {}) {
  const snapshot = await fsGetVersioned('conversations/' + conv.id);
  if (!snapshot) throw fail('conversation_not_found', 404);
  if (manualOnly && snapshot.data.segretaria === true) throw fail('conversation_automated', 409);
  if (manualOnly && (snapshot.data.conversationBindingConflict || snapshot.data.conversationBindingStatus === 'unavailable'))
    throw fail('conversation_identity_changed', 409);
  if (emailBinding(snapshot.data) !== emailBinding(conv)) throw fail('conversation_identity_changed', 409);
  const guards = [{ docPath: 'conversations/' + conv.id, fields: {}, precondition: { updateTime: snapshot.updateTime } }];
  const leadId = conv.leadId || (conv.contactType === 'lead' ? conv.contactId : null);
  if (leadId) {
    const binding = await resolveLeadConversation({ leadId });
    if (binding.status !== 'bound' || binding.cid !== conv.id || emailBinding(binding.conversation) !== emailBinding(conv))
      throw fail('conversation_identity_changed', 409);
    guards.push({ ...binding.bindingGuard, fields: {} });
  }
  return { snapshot, guards };
}

// The message and its header share the same identity/version check. A retry
// may preserve a newer reply, but may never adopt a newly assigned contact.
export async function importScopedMessage(conv, fields, storedId, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { snapshot, guards } = await scopedConversation(conv, options);
    const prior = await fsGetVersioned('messages/' + storedId);
    if (prior && (prior.data.conversationId !== conv.id || prior.data.emailMessageId !== fields.emailMessageId || prior.data.body !== fields.body))
      throw fail('email_message_identity_conflict', 409);
    if (prior?.data.mailboxSource && fields.mailboxSource && prior.data.mailboxSource.text !== fields.mailboxSource.text)
      throw fail('email_message_identity_conflict', 409);
    // A compatible message previously collected by the cron gains only the
    // explicit manual receipt. Its primary content/date and identity stay intact.
    const messageFields = !prior ? fields
      : options.manualOnly && !prior.data.mailboxSource ? { mailboxSource: fields.mailboxSource } : {};
    const headerTime = Date.parse(snapshot.data.lastMessageAt || '');
    if (!Number.isFinite(headerTime) || headerTime < fields.at.getTime()) guards[0].fields = {
      lastMessageAt: fields.at, lastDirection: 'in', needsReply: true,
      lastMessagePreview: fields.body.slice(0, 90), updatedAt: fields.at,
    };
    try {
      options.beforeCommit?.();
      await fsCommit([...guards, { docPath: 'messages/' + storedId, fields: messageFields,
        precondition: prior ? { updateTime: prior.updateTime } : { exists: false } }]);
      return prior?.data.mailboxSource?.mode === 'manual' ? 'manual' : prior ? 'duplicate' : 'imported';
    } catch (error) { if (!error.conflict) throw error; }
  }
  throw fail('conversation_changed');
}

export async function patchScopedConversation(conv, fields) {
  const { guards } = await scopedConversation(conv);
  guards[0].fields = fields;
  await fsCommit(guards);
}

// Handover deliberately marks both the primary lead conversation and its
// historical WhatsApp alias. Only that exact persisted binding is one person.
export async function canonicalEmailConversation(rows) {
  if (rows.some(row => row.conversationBindingConflict)) return null;
  const leadIds = rows.map(c => c.leadId || (c.contactType === 'lead' ? c.contactId : null));
  const leadId = leadIds[0];
  if (!leadId) return rows.length === 1 ? rows[0] : null;
  if (leadIds.some(id => id !== leadId)) return null;
  const phones = new Set(rows.map(c => c.contactPhone).filter(Boolean).map(normalizePhone));
  const emails = new Set(rows.map(c => c.contactEmail).filter(Boolean).map(e => String(e).trim().toLowerCase()));
  const uids = new Set(rows.map(c => c.contactUid).filter(Boolean));
  if (phones.size > 1 || emails.size > 1 || uids.size > 1) return null;
  const result = await resolveLeadConversation({ leadId });
  return result.status === 'bound' && rows.some(row => row.id === result.cid) ? result.conversation : null;
}
