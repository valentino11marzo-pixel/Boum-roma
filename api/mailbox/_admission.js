// Explicit admission of a mailbox contact, never a CRM person or lead.
// A deterministic email thread serializes this door; unrelated legacy writers
// do not share that key, so the complete identity scan is repeated after commit.
import crypto from 'node:crypto';
import { fsGetVersioned, fsList, fsCommit } from '../homie/_lib.js';
import { MailImportError, emailKey, canonicalEmailConversation, importScopedMessage } from '../segretaria/_mail-import.js';

const PAGE = 200, MAX_PAGES = 10;
const fail = (code, status = 409, details = {}) => Object.assign(new MailImportError(code, status), { details });
export const emailConversationId = email => 'conv_email_' + crypto.createHash('sha256').update(emailKey(email)).digest('hex');

export async function matchingEmailConversations(email, run) {
  const matches = [];
  let afterId = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await run(() => fsList('conversations', { limit: PAGE, afterId }));
    matches.push(...rows.filter(row => emailKey(row.contactEmail) === email));
    if (rows.length < PAGE) return matches;
    const next = rows[rows.length - 1]?.id;
    if (!next || (afterId && next <= afterId)) break;
    afterId = next;
  }
  throw fail('email_identity_scan_incomplete');
}

function ownAdmission(conv, email) {
  return conv?.contactType === 'email' && conv.contactId === emailConversationId(email).slice(11)
    && emailKey(conv.contactEmail) === email && conv.mailboxAdmission?.email === email
    && !conv.leadId && !conv.contactUid && !conv.assignedLandlordId && !conv.contactPhone;
}

async function checkMatches(matches, cid, email, run) {
  if (!matches.length) return null;
  const canonical = await run(() => canonicalEmailConversation(matches));
  if (!canonical) throw fail('email_identity_ambiguous');
  if (canonical.id !== cid || !ownAdmission(canonical, email)) throw fail('email_conversation_exists', 409, {
    conversation: { id: canonical.id, label: String(canonical.contactName || email).slice(0, 150), email },
  });
  if (canonical.segretaria === true) throw fail('conversation_automated');
  if (canonical.conversationBindingConflict || canonical.conversationBindingStatus === 'unavailable')
    throw fail('conversation_identity_changed');
  return canonical;
}

export async function admitMailboxMessage({ email, name, actor, fields, messageId, run, beforeCommit }) {
  const cid = emailConversationId(email), path = 'conversations/' + cid;
  let created = false, outcome;
  for (let attempt = 0; attempt < 3; attempt++) {
    const matches = await matchingEmailConversations(email, run);
    const existing = await checkMatches(matches, cid, email, run);
    const snapshot = await run(() => fsGetVersioned(path));
    if (snapshot && !ownAdmission(snapshot.data, email)) throw fail('conversation_identity_changed');
    if (snapshot && !existing) continue; // A simultaneous admission won after our scan.
    const message = await run(() => fsGetVersioned('messages/' + messageId));
    if (message && message.data.conversationId !== cid) throw fail('email_message_identity_conflict');
    if (existing && snapshot) {
      outcome = await run(() => importScopedMessage(existing, { ...fields, conversationId: cid }, messageId,
        { manualOnly: true, beforeCommit }));
      break;
    }
    if (message) throw fail('email_message_identity_conflict');
    const now = new Date();
    const header = { contactType: 'email', contactId: cid.slice(11), contactName: name || email,
      contactEmail: email, contactPhone: '', contactUid: null, assignedLandlordId: null,
      channel: 'email', status: 'open', segretaria: false, unread: 0, tags: [], createdAt: now,
      lastMessageAt: fields.at, lastMessagePreview: fields.body.slice(0, 90), lastDirection: 'in', needsReply: true,
      updatedAt: now, mailboxAdmission: { email, actor, at: now.toISOString(), sourceMessageId: messageId } };
    try {
      await run(() => { beforeCommit?.(); return fsCommit([
        { docPath: path, fields: header, precondition: { exists: false } },
        { docPath: 'messages/' + messageId, fields: { ...fields, conversationId: cid }, precondition: { exists: false } },
      ]); });
      created = true; outcome = 'imported'; break;
    } catch (error) { if (!error.conflict) throw error; }
  }
  if (!outcome) throw fail('conversation_changed');
  const saved = { sourceSaved: true, conversationId: cid, messageId };
  try {
    const matches = await matchingEmailConversations(email, run);
    await checkMatches(matches, cid, email, run);
    const snapshot = await run(() => fsGetVersioned(path));
    if (!snapshot || !ownAdmission(snapshot.data, email) || snapshot.data.segretaria === true
      || snapshot.data.conversationBindingConflict || snapshot.data.conversationBindingStatus === 'unavailable')
      throw fail('conversation_identity_changed');
  } catch (error) {
    if (error instanceof MailImportError) {
      // Preserve primary evidence while preventing a conflicted new contact
      // from being taken in charge until the operator resolves its identity.
      const snapshot = await run(() => fsGetVersioned(path)).catch(() => null);
      if (snapshot && ownAdmission(snapshot.data, email)) {
        await run(() => fsCommit([{ docPath: path, fields: { conversationBindingConflict: 'email_admission_conflict' },
          precondition: { updateTime: snapshot.updateTime } }])).catch(() => {});
      }
      throw fail('email_admission_review_required', 409, saved);
    }
    throw fail('email_admission_verification_failed', 503, saved);
  }
  return { conversationId: cid, messageId, created, imported: outcome === 'imported', duplicate: outcome !== 'imported' };
}
