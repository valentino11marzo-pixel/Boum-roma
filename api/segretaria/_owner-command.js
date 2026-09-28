// Owner Command turns an authenticated instruction into a reviewable BOOM
// proposal. It resolves people from the existing sources of truth and never
// chooses the first name match, queues a send or treats caller ID as authority.
import crypto from 'node:crypto';
import { fsCommit, fsGet, fsGetVersioned, fsList } from '../homie/_lib.js';
import { normalizePhone, phoneVariants } from '../homie/_lead.js';
import { personaDossier } from './_persona.js';
import { contactFingerprint } from './_context.js';
import { captureFollowUp, updateFollowUp, checkTimestamp } from './_follow-up.js';
import { prepareCase } from './_prepare.js';
import { runBudget } from '../_budget.js';
import { dossierOwnerTargetIssue } from './_owner-target.js';

export const OWNER_COMMAND_LIMITS = Object.freeze({ query: 30, candidates: 12, fallback: 100 });
const COLLECTIONS = Object.freeze(['users', 'landlords', 'clients', 'pfsClients', 'leads']);
const COLLECTION_SET = new Set(COLLECTIONS);
const CONTACT_TYPE = Object.freeze({ landlords: ['landlord'], clients: ['client'], pfsClients: ['pfs'], leads: ['lead'] });
const NAME_FIELDS = Object.freeze(['name', 'fullName', 'displayName', 'firstName', 'lastName']);
const PHONE_FIELDS = Object.freeze(['phone', 'contactPhone', 'whatsapp']);
const EMAIL_FIELDS = Object.freeze(['email', 'contactEmail']);
const idPart = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value) && !['.', '..'].includes(value);
const unique = values => [...new Set(values.filter(Boolean))];
const fail = (code, status = 400) => { const error = new Error(code); error.code = code; error.status = status; throw error; };
const plain = (value, max) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : '';
const mail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  ? value.trim().toLowerCase() : '';
const phone = value => {
  const valueNormalized = normalizePhone(typeof value === 'string' ? value : '');
  return /^\+?[0-9]{7,15}$/.test(valueNormalized) ? valueNormalized : '';
};
const nameKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
const titleName = value => String(value || '').toLocaleLowerCase('it-IT').replace(/(^|[\s'’-])\p{L}/gu, c => c.toLocaleUpperCase('it-IT'));
const namesOf = row => unique([
  plain(row?.name, 120), plain(row?.fullName, 120), plain(row?.displayName, 120),
  plain([row?.firstName, row?.lastName].filter(Boolean).join(' '), 120),
]);
const displayName = row => namesOf(row)[0] || '';
const roleOf = (collection, row) => {
  if (collection === 'users') return row.role === 'owner' ? ['landlord']
    : ['tenant', 'landlord', 'pfs', 'client', 'lead', 'admin'].includes(row.role) ? [row.role] : ['unknown'];
  return [{ landlords: 'landlord', clients: 'client', pfsClients: 'pfs', leads: 'lead' }[collection] || 'unknown'];
};
const contactsOf = row => ({
  phones: unique(PHONE_FIELDS.map(field => phone(row?.[field]))),
  emails: unique(EMAIL_FIELDS.map(field => mail(row?.[field]))),
});
const refOf = (collection, id) => `${collection}/${id}`;

export function parsePersonRef(ref) {
  if (typeof ref !== 'string') return null;
  const parts = ref.split('/');
  return parts.length === 2 && COLLECTION_SET.has(parts[0]) && idPart(parts[1])
    ? { collection: parts[0], id: parts[1], ref } : null;
}

export function parsePeopleQuery(raw) {
  if (typeof raw === 'string') {
    const value = raw.trim();
    raw = value.includes('@') ? { email: value } : /\d{7}/.test(value.replace(/\D/g, '')) ? { phone: value } : { name: value };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid_query');
  const supplied = ['name', 'phone', 'email'].filter(key => typeof raw[key] === 'string' && raw[key].trim());
  if (supplied.length !== 1) fail('query_requires_one_identifier');
  const kind = supplied[0];
  if (kind === 'phone') {
    const value = phone(raw.phone);
    if (!value) fail('invalid_phone');
    return { kind, value, display: value };
  }
  if (kind === 'email') {
    const value = mail(raw.email);
    if (!value) fail('invalid_email');
    return { kind, value, display: value };
  }
  const value = plain(raw.name, 120), normalized = nameKey(value);
  if (!value || normalized.length < 2) fail('invalid_name');
  return { kind, value, normalized, display: value };
}

const recordMatches = (row, query) => {
  if (query.kind === 'phone') return contactsOf(row).phones.includes(query.value);
  if (query.kind === 'email') return contactsOf(row).emails.includes(query.value);
  return namesOf(row).some(candidate => {
    const words = nameKey(candidate).split(' ').filter(Boolean);
    return query.normalized.split(' ').every(part => words.includes(part));
  });
};

async function queryCollection(collection, query) {
  const rows = new Map();
  const limitations = new Set();
  const read = async (field, values) => {
    for (const value of unique(values)) {
      const found = await fsList(collection, { filter: { field, op: 'EQUAL', value }, limit: OWNER_COMMAND_LIMITS.query + 1 });
      if (found.length > OWNER_COMMAND_LIMITS.query) limitations.add('indexed_query_limit');
      for (const row of found.slice(0, OWNER_COMMAND_LIMITS.query)) if (idPart(row.id)) rows.set(row.id, row);
    }
  };
  if (query.kind === 'phone') await Promise.all(PHONE_FIELDS.map(field => read(field, phoneVariants(query.value))));
  else if (query.kind === 'email') await Promise.all(EMAIL_FIELDS.map(field => read(field, [query.value])));
  else {
    const variants = unique([query.value, titleName(query.value)]);
    await Promise.all(NAME_FIELDS.map(field => read(field, variants)));
  }
  // Always inspect one bounded legacy window. An indexed hit cannot prove
  // uniqueness while older rows may store a formatted phone, mixed-case email
  // or full name in another field. A capped window is explicitly incomplete.
  const fallback = await fsList(collection, { limit: OWNER_COMMAND_LIMITS.fallback + 1 });
  if (fallback.length > OWNER_COMMAND_LIMITS.fallback) limitations.add('legacy_scan_limit');
  for (const row of fallback.slice(0, OWNER_COMMAND_LIMITS.fallback)) {
    if (idPart(row.id) && recordMatches(row, query)) rows.set(row.id, row);
  }
  return { rows: [...rows.values()].filter(row => recordMatches(row, query)),
    incomplete: limitations.size > 0, limitations: [...limitations].sort() };
}

function conversationBound(collection, row, conversation) {
  if (!conversation || !idPart(conversation.id)) return false;
  if (collection === 'leads') return (conversation.contactType === 'lead' && conversation.contactId === row.id)
    || conversation.leadId === row.id;
  let types = CONTACT_TYPE[collection];
  if (collection === 'users') {
    const role = row.role === 'owner' ? 'landlord' : row.role;
    types = ['tenant', 'landlord', 'pfs', 'client'].includes(role) ? [role] : [];
  }
  return types.includes(conversation.contactType) && conversation.contactId === row.id;
}

async function personConversations(collection, row) {
  const found = new Map();
  let incomplete = false;
  const accept = candidate => { if (conversationBound(collection, row, candidate)) found.set(candidate.id, candidate); };
  if (idPart(row.conversationId)) {
    const direct = await fsGet('conversations/' + row.conversationId);
    if (direct) accept(direct);
  }
  const filters = [{ field: 'contactId', value: row.id }, ...(collection === 'leads' ? [{ field: 'leadId', value: row.id }] : [])];
  await Promise.all(filters.map(async filter => {
    const rows = await fsList('conversations', { filter: { ...filter, op: 'EQUAL' }, limit: OWNER_COMMAND_LIMITS.query + 1 });
    if (rows.length > OWNER_COMMAND_LIMITS.query) incomplete = true;
    rows.slice(0, OWNER_COMMAND_LIMITS.query).forEach(accept);
  }));
  return { rows: [...found.values()].sort((a, b) => a.id.localeCompare(b.id)), incomplete };
}

async function projectCandidate(collection, row) {
  const contacts = contactsOf(row), conversations = await personConversations(collection, row);
  const conversationId = conversations.rows.length === 1 ? conversations.rows[0].id : undefined;
  const dossier = await personaDossier({ phone: contacts.phones[0], email: contacts.emails[0],
    leadId: collection === 'leads' ? row.id : undefined, conversationId });
  const exact = dossier.people.find(person => person.ref === refOf(collection, row.id));
  return {
    personRef: refOf(collection, row.id), name: displayName(row), roles: unique([...(exact?.roles || []), ...roleOf(collection, row)]),
    contact: contacts,
    conversations: conversations.rows.map(conv => ({ ref: 'conversations/' + conv.id, channel: conv.channel || null,
      phone: phone(conv.contactPhone) || null, email: mail(conv.contactEmail) || null })),
    practices: dossier.practices, properties: dossier.properties,
    ambiguous: conversations.rows.length > 1 || dossier.ambiguous,
    incomplete: conversations.incomplete || dossier.incomplete,
    evidence: { person: refOf(collection, row.id),
      conversations: conversations.rows.map(conv => 'conversations/' + conv.id),
      practices: dossier.practices.map(practice => practice.ref), properties: dossier.properties.map(property => property.ref) },
  };
}

export async function resolvePeople(rawQuery) {
  const query = parsePeopleQuery(rawQuery);
  const results = await Promise.all(COLLECTIONS.map(collection => queryCollection(collection, query)));
  let incomplete = results.some(result => result.incomplete);
  const limitations = new Set(results.flatMap(result => result.limitations || []));
  const matches = results.flatMap((result, index) => result.rows.map(row => [COLLECTIONS[index], row]));
  const truncated = matches.length > OWNER_COMMAND_LIMITS.candidates;
  if (truncated) { incomplete = true; limitations.add('candidate_limit'); }
  const candidates = await Promise.all(matches.slice(0, OWNER_COMMAND_LIMITS.candidates).map(([collection, row]) => projectCandidate(collection, row)));
  candidates.sort((a, b) => a.name.localeCompare(b.name, 'it') || a.personRef.localeCompare(b.personRef));
  if (candidates.some(candidate => candidate.incomplete)) {
    incomplete = true; limitations.add('candidate_context_incomplete');
  }
  const candidateAmbiguous = candidates.some(candidate => candidate.ambiguous === true);
  const resolution = incomplete
    ? { status: 'incomplete', requiresExplicitSelection: candidates.length > 0,
      nextAction: candidates.length ? 'select_candidate_or_refine_query' : 'refine_query',
      reasons: [...limitations].sort() }
    : candidates.length === 0
      ? { status: 'not_found', requiresExplicitSelection: false, nextAction: 'refine_query', reasons: [] }
      : candidates.length !== 1 || candidateAmbiguous
        ? { status: 'ambiguous', requiresExplicitSelection: true, nextAction: 'select_candidate', reasons: [] }
        : { status: 'candidate_available', requiresExplicitSelection: true, nextAction: 'confirm_candidate', reasons: [] };
  return { query: { kind: query.kind, display: query.display }, count: candidates.length,
    ambiguous: incomplete || candidates.length !== 1 || candidateAmbiguous,
    incomplete, truncated, resolution, candidates };
}

async function exactTarget(input) {
  const parsed = parsePersonRef(input?.personRef);
  if (!parsed) fail('invalid_person_ref');
  const conversationId = idPart(input.conversationId) ? input.conversationId : fail('invalid_conversation');
  const practiceRef = plain(input.practiceRef, 220), propertyRef = plain(input.propertyRef, 220);
  if (!/^(?:contracts|leads|pfsClients|viewingRequests)\/[\w.-]{1,180}$/.test(practiceRef)) fail('invalid_practice_ref');
  if (!/^(?:properties|listings)\/[\w.-]{1,180}$/.test(propertyRef)) fail('invalid_property_ref');
  if (!['whatsapp', 'email'].includes(input.channel)) fail('invalid_channel');
  const [personSnapshot, conversationSnapshot, practiceSnapshot, propertySnapshot] = await Promise.all([
    fsGetVersioned(parsed.ref), fsGetVersioned('conversations/' + conversationId),
    fsGetVersioned(practiceRef), fsGetVersioned(propertyRef),
  ]);
  const row = personSnapshot?.data;
  if (!row || row.id !== parsed.id) fail('person_not_found', 404);
  const conversation = conversationSnapshot?.data;
  if (!conversation) fail('conversation_not_found', 404);
  if (!practiceSnapshot?.data) fail('practice_not_found', 404);
  if (!propertySnapshot?.data) fail('property_not_found', 404);
  if (!conversationBound(parsed.collection, row, conversation)) fail('conversation_not_verified', 409);
  const preparationChannel = conversation.channel === 'email' ? 'email' : conversation.contactPhone ? 'whatsapp' : 'email';
  if (input.channel !== preparationChannel) fail('channel_not_verified', 409);
  const contacts = contactsOf(row);
  let address;
  if (input.channel === 'whatsapp') {
    address = phone(input.address);
    if (!address || !contacts.phones.length || !phone(conversation.contactPhone)) fail('contact_missing', 409);
    if (!contacts.phones.includes(address) || phone(conversation.contactPhone) !== address) fail('contact_stale', 409);
  } else {
    address = mail(input.address);
    if (!address || !contacts.emails.length || !mail(conversation.contactEmail)) fail('contact_missing', 409);
    if (!contacts.emails.includes(address) || mail(conversation.contactEmail) !== address) fail('contact_stale', 409);
  }
  const dossier = await personaDossier({ phone: conversation.contactPhone, email: conversation.contactEmail,
    leadId: conversation.leadId || (conversation.contactType === 'lead' ? conversation.contactId : undefined), conversationId });
  const targetIssue = dossierOwnerTargetIssue(dossier, { personRef: parsed.ref, practiceRef, propertyRef });
  if (targetIssue) fail(targetIssue + '_not_verified', 409);
  return { parsed, row, conversation, conversationId, practiceRef, propertyRef, channel: input.channel, address, dossier,
    snapshots: { person: personSnapshot, conversation: conversationSnapshot, practice: practiceSnapshot, property: propertySnapshot } };
}

function ownerMessageId({ actor, commandId }) {
  // The idempotency key belongs to one authenticated command, not one chosen
  // target: changing Giuliano after a retry must conflict instead of drafting twice.
  return 'owner_' + crypto.createHash('sha256').update(JSON.stringify([actor, commandId])).digest('hex').slice(0, 40);
}

export async function prepareOwnerCommand(input, { actor, now = Date.now(), budget } = {}) {
  if (!idPart(actor)) fail('invalid_actor', 403);
  const time = budget || runBudget(60_000, 7_000);
  const commandId = plain(input?.commandId, 180), instruction = plain(input?.instruction, 1200);
  if (!commandId || !/^[\w.:+-]{1,180}$/.test(commandId)) fail('invalid_command_id');
  if (!instruction) fail('instruction_required');
  const target = await exactTarget(input);
  const request = { commandId, instruction, personRef: target.parsed.ref, conversationId: target.conversationId,
    practiceRef: target.practiceRef, propertyRef: target.propertyRef, channel: target.channel, address: target.address, requestedBy: actor };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const messageId = ownerMessageId({ actor, commandId });
  const ownerTarget = { conversationId: target.conversationId, personRef: target.parsed.ref,
    practiceRef: target.practiceRef, propertyRef: target.propertyRef, channel: target.channel, address: target.address,
    contactFingerprint: contactFingerprint(target.snapshots.conversation.data) };
  const message = { conversationId: target.conversationId, direction: 'note', channel: 'internal', by: actor,
    source: 'owner-command', body: instruction, at: new Date(now).toISOString(),
    ownerCommand: { commandId, requestHash, requestedBy: actor, personRef: target.parsed.ref,
      practiceRef: target.practiceRef, propertyRef: target.propertyRef, channel: target.channel, address: target.address } };
  let duplicate = false;
  if (!time.afford(35_000)) fail('preparation_time_budget', 503);
  try {
    await fsCommit([
      { docPath: 'messages/' + messageId, fields: message, precondition: { exists: false } },
      { docPath: target.parsed.ref, fields: {}, precondition: { updateTime: target.snapshots.person.updateTime } },
      { docPath: 'conversations/' + target.conversationId, fields: {}, precondition: { updateTime: target.snapshots.conversation.updateTime } },
      { docPath: target.practiceRef, fields: {}, precondition: { updateTime: target.snapshots.practice.updateTime } },
      { docPath: target.propertyRef, fields: {}, precondition: { updateTime: target.snapshots.property.updateTime } },
    ]);
  }
  catch (error) {
    const existing = await fsGet('messages/' + messageId);
    if (!existing) {
      if (error?.conflict) fail('sources_changed_reload', 409);
      throw error;
    }
    if (existing?.source !== 'owner-command' || existing.ownerCommand?.requestHash !== requestHash) fail('command_id_conflict', 409);
    duplicate = true;
  }
  let task = await captureFollowUp({ cid: target.conversationId, conv: target.conversation, messageId,
    text: instruction, now, origin: 'owner-command', ownerCommandTarget: ownerTarget });
  if (!task) fail('follow_up_unavailable', 503);
  const selected = task.followUp?.lastMessageId === messageId && task.followUp.practiceRef === target.practiceRef
    && task.followUp.propertyRef === target.propertyRef && task.followUp.confirmed === true;
  if (!selected) {
    const existingCheck = checkTimestamp(task.followUp?.checkAt);
    const checkAt = Number.isFinite(existingCheck) && existingCheck > now && existingCheck <= now + 365 * 86400000
      ? task.followUp.checkAt : new Date(now + 2 * 3600000).toISOString();
    const updated = await updateFollowUp({ id: task.id, actor, dossier: target.dossier, now,
      input: { op: 'confirm', lastMessageId: messageId, practiceRef: target.practiceRef,
        nextAction: 'Preparare il messaggio richiesto da Valentino e sottoporlo a conferma',
        waitingOn: 'valentino', waitingLabel: 'Valentino', checkAt } });
    if (updated.code !== 200) {
      task = await fsGet('operatorTasks/' + task.id);
      if (!(updated.code === 409 && task?.followUp?.lastMessageId === messageId
        && task.followUp.practiceRef === target.practiceRef && task.followUp.propertyRef === target.propertyRef
        && task.followUp.confirmed === true)) fail(updated.error || 'follow_up_update_failed', updated.code || 503);
    } else task = { ...task, followUp: updated.followUp };
  }
  const prepared = await prepareCase({ id: task.id, actor, now, strictPrepareOnly: true,
    expectedTarget: ownerTarget, budget: time });
  if (prepared.code !== 200) fail(prepared.error || 'preparation_failed', prepared.code || 503);
  if (!prepared.preparation?.draft) fail('draft_not_prepared', 422);
  return { messageId, caseId: task.id, duplicate, cached: prepared.cached === true,
    personRef: target.parsed.ref, conversationRef: 'conversations/' + target.conversationId,
    practiceRef: target.practiceRef, propertyRef: target.propertyRef, channel: target.channel,
    followUp: (await fsGet('operatorTasks/' + task.id))?.followUp || task.followUp, preparation: prepared.preparation };
}

export function ownerCommandError(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 503;
  return { status, error: typeof error?.code === 'string' ? error.code : 'owner_command_unavailable' };
}
