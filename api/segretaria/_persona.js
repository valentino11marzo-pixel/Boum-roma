// One derived dossier, never a second memory. Only exact identifiers and
// existing foreign keys can connect a person to a case. Names are display only.
import { fsGet, fsList } from '../homie/_lib.js';
import { normalizePhone, phoneVariants } from '../homie/_lead.js';

export const PERSONA_LIMITS = Object.freeze({ query: 12, links: 12, records: 36, history: 40, commitments: 5 });
const PERSON_COLLECTIONS = new Set(['users', 'landlords', 'clients', 'pfsClients', 'leads']);
const PRACTICE_TYPES = { leads: 'lead', pfsClients: 'pfs', contracts: 'contract', viewingRequests: 'viewing' };
const ROLE_ORDER = ['tenant', 'landlord', 'pfs', 'client', 'lead', 'unknown'];
const idOf = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[/?#\\]/.test(value) ? value : null;
const mailOf = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : '';
const phoneOf = value => {
  const p = normalizePhone(typeof value === 'string' ? value : '');
  return /^\+?[0-9]{7,15}$/.test(p) ? p : '';
};
const unique = xs => [...new Set(xs.filter(Boolean))];
const iso = value => {
  if (!value) return null;
  const n = typeof value === 'object' && '_seconds' in value ? value._seconds * 1000 : Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};

// The prompt sees only this whitelist, never identity files, bank details or
// complete documents. Free-text snippets are untrusted source quotations.
export function brief(value, max = 160) {
  if (typeof value !== 'string') return '';
  value = value.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link omesso]');
  if (/\b(?:password|api[_ -]?key|access[_ -]?token|token|otp|segreto)\s*[:=]\s*\S+|\bBearer\s+[A-Za-z0-9._-]{8,}|\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}/i.test(value)) return '[credenziali omesse; consulta la fonte]';
  if (/\b(?:passaport[oa]|passport|ID\s+card|document\s+(?:number|no\.?|id)|carta\s+d['’]?identit[àa]|documento\s+(?:n[.°]?|numero))\s*[:=#-]?\s*[A-Z0-9 -]*[0-9]/i.test(value)) {
    return '[dati identificativi omessi; consulta la fonte]';
  }
  return value
    .replace(/\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi, '[CF omesso]')
    .replace(/\b[A-Z]{2}\s*\d{2}(?:[ -]*[A-Z0-9]){11,30}\b/gi, '[IBAN omesso]')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[email omessa]')
    .replace(/(?:\+|00)[0-9][0-9 ()-]{7,20}/g, '[telefono omesso]')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Read-only, serializable projection for policy, prompts and handoff cards.
 * `ambiguous` means no case may be selected automatically. Identity flags are
 * separate: a capped message history does not make the person's role unknown.
 * `commitments` quotes recorded outgoing messages; it does not infer promises.
 */
export async function personaDossier({ phone, email, leadId, conversationId } = {}) {
  const evidence = [], records = new Map(), reads = new Map(), queries = new Map();
  const roles = new Set(), propertyVia = new Map();
  let incomplete = false, ambiguous = false;
  let identityIncomplete = false, identityAmbiguous = false, historyIncomplete = false;
  const note = (kind, reason, extra = {}) => {
    const scope = extra.scope || (['history_unavailable', 'latest_commitments_not_verified', 'message_time_missing', 'conversation_limit'].includes(reason)
      ? 'history' : ['property_limit', 'property_reference_not_found', 'property_reference_not_unique', 'multiple_practices'].includes(reason) ? 'relations' : 'identity');
    if (kind === 'incomplete') incomplete = true;
    if (kind === 'ambiguity') ambiguous = true;
    if (kind === 'incomplete' && scope === 'identity') identityIncomplete = true;
    if (kind === 'incomplete' && scope === 'history') historyIncomplete = true;
    if (kind === 'ambiguity' && scope === 'identity') identityAmbiguous = true;
    const item = { kind, reason, scope, ...extra };
    if (!evidence.some(e => JSON.stringify(e) === JSON.stringify(item))) evidence.push(item);
  };
  function add(collection, row, via, role) {
    if (!row || !idOf(row.id)) return;
    const ref = `${collection}/${row.id}`;
    if (!records.has(ref)) {
      if ([...records.values()].filter(r => r.collection === collection).length >= PERSONA_LIMITS.records) {
        note('incomplete', 'record_limit', { collection });
        return;
      }
      records.set(ref, { ref, collection, row, via: new Set(), roles: new Set() });
    }
    const entry = records.get(ref);
    entry.via.add(via);
    if (role) { entry.roles.add(role); roles.add(role); }
    if (collection === 'users') {
      const role = row.role === 'owner' ? 'landlord' : row.role;
      if (ROLE_ORDER.includes(role)) { entry.roles.add(role); roles.add(role); }
    }
    const fixed = { leads: 'lead', landlords: 'landlord', pfsClients: 'pfs', clients: 'client' }[collection];
    if (fixed) { entry.roles.add(fixed); roles.add(fixed); }
    return entry;
  }
  async function get(collection, id, via, role, required = true) {
    if (!idOf(id)) {
      if (id) note('incomplete', 'invalid_reference', { collection });
      return null;
    }
    const ref = `${collection}/${id}`;
    if (!reads.has(ref)) reads.set(ref, fsGet(`${collection}/${encodeURIComponent(id)}`).catch(() => {
      note('incomplete', 'source_unavailable', { ref, scope: ['properties', 'listings'].includes(collection) ? 'relations' : 'identity' });
      return null;
    }));
    const row = await reads.get(ref);
    if (!row && required) note('incomplete', 'reference_not_found', { ref });
    if (row) add(collection, row, via, role);
    return row;
  }
  async function query(collection, field, values, via, role) {
    const all = unique(values);
    if (!all.length) return [];
    if (all.length > PERSONA_LIMITS.links) note('incomplete', 'identifier_limit', { collection, field });
    const vals = all.slice(0, PERSONA_LIMITS.links);
    const key = JSON.stringify([collection, field, vals]);
    if (!queries.has(key)) queries.set(key, fsList(collection, {
      filter: { field, op: vals.length === 1 ? 'EQUAL' : 'IN', value: vals.length === 1 ? vals[0] : vals },
      limit: PERSONA_LIMITS.query + 1,
    }).catch(() => {
      note('incomplete', 'source_unavailable', { collection, field });
      return [];
    }));
    const rows = await queries.get(key);
    if (rows.length > PERSONA_LIMITS.query) note('incomplete', 'query_limit', { collection, field });
    for (const row of rows.slice(0, PERSONA_LIMITS.query)) add(collection, row, via, role);
    return rows.slice(0, PERSONA_LIMITS.query);
  }
  const entries = collection => [...records.values()].filter(r => r.collection === collection);
  const ids = collection => entries(collection).map(e => e.row.id);
  const linked = (collection, field) => entries(collection).map(e => idOf(e.row[field])).filter(Boolean);

  // Explicit references supply context, not permission to ignore contradictory
  // contact details. Do not reuse resolveCaller's first-match/lead-first result:
  // a historical lead must never mask an existing tenant or landlord role.
  const seedConv = await get('conversations', conversationId, 'input.conversationId');
  const seedLead = await get('leads', leadId || seedConv?.leadId || (seedConv?.contactType === 'lead' ? seedConv.contactId : null), 'input.leadId');
  const seedCollection = { tenant: 'users', landlord: 'users', pfs: 'pfsClients', client: 'clients' }[seedConv?.contactType];
  const seedPerson = seedCollection ? await get(seedCollection, seedConv.contactId, 'input.conversationId.contactId', seedConv.contactType) : null;
  const seedPhones = unique([phone, seedConv?.contactPhone, seedLead?.phone, seedPerson?.phone || seedPerson?.contactPhone || seedPerson?.whatsapp].map(phoneOf));
  const seedEmails = unique([email, seedConv?.contactEmail, seedLead?.email, seedPerson?.email || seedPerson?.contactEmail].map(mailOf));
  if (phone && !phoneOf(phone)) note('incomplete', 'invalid_phone');
  if (email && !mailOf(email)) note('incomplete', 'invalid_email');
  if (seedPhones.length > 1 || seedEmails.length > 1) note('ambiguity', 'input_references_disagree');
  const phones = unique(seedPhones.flatMap(p => phoneVariants(p)).concat(phoneOf(phone) ? phoneVariants(phone) : []));
  const emails = unique(seedEmails.concat(typeof email === 'string' && mailOf(email) ? email.trim() : []));
  if (!phones.length && !emails.length && !seedLead && !seedConv) note('incomplete', 'identity_missing');

  // Each pair describes one party. Tenant phone + landlord email on the SAME
  // contract are not evidence that both parties are the same person.
  const sources = [
    ['users', 'phone', 'email'], ['landlords', 'phone', 'email'],
    ['clients', 'phone', 'email'], ['leads', 'phone', 'email'],
    ['pfsClients', 'phone', 'email'], ['pfsClients', 'contactPhone', 'contactEmail'],
    ['pfsClients', 'whatsapp', 'email'], ['conversations', 'contactPhone', 'contactEmail'],
    ['contracts', 'tenantPhone', 'tenantEmail', 'tenant'],
    ['contracts', 'landlordPhone', 'landlordEmail', 'landlord'],
    ['viewingRequests', 'clientPhone', 'clientEmail'], ['viewingRequests', 'phone', 'email'],
  ];
  const contactHits = [];
  await Promise.all(sources.map(async ([coll, pf, ef, role]) => {
    const byPhone = await query(coll, pf, phones, `phone:${pf}`, role);
    const byEmail = await query(coll, ef, emails, `email:${ef}`, role);
    for (const row of new Map([...byPhone, ...byEmail].map(r => [r.id, r])).values()) {
      const p = phoneOf(row[pf]), e = mailOf(row[ef]);
      const pm = !!p && seedPhones.includes(p), em = !!e && seedEmails.includes(e);
      contactHits.push({ p, e, pm, em, ref: `${coll}/${row.id}` });
      if ((pm && e && seedEmails.length && !em) || (em && p && seedPhones.length && !pm)) {
        note('ambiguity', 'contact_identifiers_disagree', { ref: `${coll}/${row.id}` });
      }
    }
  }));
  if (seedPhones.length && seedEmails.length && contactHits.some(h => h.pm) && contactHits.some(h => h.em)
      && !contactHits.some(h => h.pm && h.em)) note('ambiguity', 'phone_email_not_joined');
  // Follow only persisted foreign keys, one bounded hop. Never look up a name.
  const refs = [];
  for (const { row, ref } of entries('leads')) {
    for (const [field, collection, role] of [
      ['tenantId', 'users', 'tenant'], ['convertedTenantId', 'users', 'tenant'],
      ['userId', 'users'], ['landlordId', 'landlords', 'landlord'],
      ['clientId', 'clients', 'client'], ['pfsClientId', 'pfsClients', 'pfs'],
      ['contractId', 'contracts'], ['contractDraftId', 'contracts'], ['viewingId', 'viewingRequests'],
    ]) if (row[field]) refs.push([collection, row[field], `${ref}.${field}`, role]);
    if (row.conversationId) refs.push(['conversations', row.conversationId, `${ref}.conversationId`]);
  }
  for (const { row, ref } of entries('conversations')) {
    const coll = { lead: 'leads', tenant: 'users', landlord: 'users', pfs: 'pfsClients', client: 'clients' }[row.contactType];
    if (coll && row.contactId) refs.push([coll, row.contactId, `${ref}.contactId`, row.contactType]);
    if (row.leadId) refs.push(['leads', row.leadId, `${ref}.leadId`]);
  }
  if (refs.length > PERSONA_LIMITS.links) note('incomplete', 'relation_limit');
  await Promise.all(refs.slice(0, PERSONA_LIMITS.links).map(args => get(...args)));
  // Phone/email contradictions on linked records are still conflicts. Linked
  // protected roles remain visible even when the conflicting record is old.
  for (const entry of [...records.values()].filter(e => PERSON_COLLECTIONS.has(e.collection))) {
    const p = phoneOf(entry.row.phone || entry.row.contactPhone || entry.row.whatsapp);
    const e = mailOf(entry.row.email || entry.row.contactEmail);
    if ((p && seedPhones.length && !seedPhones.includes(p)) || (e && seedEmails.length && !seedEmails.includes(e))) {
      note('ambiguity', 'linked_identity_disagrees', { ref: entry.ref });
    }
  }
  await Promise.all([
    query('contracts', 'tenantId', ids('users'), 'relation:tenantId', 'tenant'),
    query('contracts', 'landlordId', [...ids('users'), ...ids('landlords')], 'relation:landlordId', 'landlord'),
    query('contracts', 'linkedLeadId', ids('leads'), 'relation:linkedLeadId'),
    query('contracts', 'leadId', ids('leads'), 'relation:leadId'),
    query('properties', 'ownerId', [...ids('users'), ...ids('landlords')], 'relation:ownerId', 'landlord'),
    query('viewingRequests', 'leadId', ids('leads'), 'relation:leadId'),
    query('viewingRequests', 'userId', ids('users'), 'relation:userId'),
    query('viewingRequests', 'clientId', [...ids('clients'), ...ids('pfsClients')], 'relation:clientId'),
    query('conversations', 'leadId', ids('leads'), 'relation:leadId'),
  ]);
  await query('contracts', 'propertyId', ids('properties'), 'relation:ownedProperty', 'landlord');

  function wantProperty(collection, id, via) {
    if (!idOf(id)) return;
    const ref = `${collection}/${id}`;
    if (!propertyVia.has(ref)) propertyVia.set(ref, new Set());
    propertyVia.get(ref).add(via);
  }
  for (const e of entries('properties')) wantProperty('properties', e.row.id, [...e.via].join(','));
  for (const e of [...records.values()].filter(e => PRACTICE_TYPES[e.collection])) {
    if (e.row.listingId) wantProperty('listings', e.row.listingId, `${e.ref}.listingId`);
    if (e.row.propertyId) {
      wantProperty('properties', e.row.propertyId, `${e.ref}.propertyId`);
      if (e.collection === 'leads') wantProperty('listings', e.row.propertyId, `${e.ref}.propertyId`);
    }
  }
  if (propertyVia.size > PERSONA_LIMITS.links) note('incomplete', 'property_limit');
  await Promise.all([...propertyVia].slice(0, PERSONA_LIMITS.links).map(async ([ref, via]) => {
    const [coll, id] = ref.split('/');
    await get(coll, id, [...via].join(','), null, false);
  }));
  const properties = [...propertyVia].filter(([ref]) => records.has(ref)).map(([ref, via]) => {
    const { row } = records.get(ref);
    return { ref, label: brief(row.name || row.address || row.title), via: [...via] };
  });
  for (const e of [...records.values()].filter(e => PRACTICE_TYPES[e.collection])) {
    for (const field of ['propertyId', 'listingId']) {
      if (!e.row[field]) continue;
      const matches = properties.filter(p => p.via.includes(`${e.ref}.${field}`));
      if (!matches.length) note('incomplete', 'property_reference_not_found', { ref: e.ref, field });
      if (matches.length > 1) note('ambiguity', 'property_reference_not_unique', { ref: e.ref, field });
    }
  }
  const practices = [...records.values()].filter(e => PRACTICE_TYPES[e.collection]).map(e => ({
    ref: e.ref, type: PRACTICE_TYPES[e.collection], status: brief(e.row.stage || e.row.status, 48),
    propertyRefs: properties.filter(p => p.via.some(v => v.startsWith(e.ref + '.'))).map(p => p.ref),
    via: [...e.via],
  }));
  if (practices.length > 1) note('ambiguity', 'multiple_practices');

  // Prefer the latest ordered source window. Without its index, retain the
  // complete-set fallback; a capped arbitrary prefix is never recent history.
  const commitments = [];
  const cids = unique([conversationId, ...ids('conversations'), ...linked('leads', 'conversationId')]).filter(idOf);
  if (cids.length > PERSONA_LIMITS.links) note('incomplete', 'conversation_limit');
  await Promise.all(cids.slice(0, PERSONA_LIMITS.links).map(async cid => {
    let rows;
    try {
      rows = await fsList('messages', { filter: { field: 'conversationId', op: 'EQUAL', value: cid },
        orderBy: { field: 'at', direction: 'DESCENDING' }, limit: PERSONA_LIMITS.history + 1 });
      if (rows.length > PERSONA_LIMITS.history) {
        note('incomplete', 'history_window_limited', { ref: `conversations/${cid}`, scope: 'history' });
        rows = rows.slice(0, PERSONA_LIMITS.history);
      }
    } catch {
      try {
        rows = await fsList('messages', { filter: { field: 'conversationId', op: 'EQUAL', value: cid }, limit: PERSONA_LIMITS.history + 1 });
        if (rows.length > PERSONA_LIMITS.history) {
          note('incomplete', 'latest_commitments_not_verified', { ref: `conversations/${cid}` });
          return;
        }
      } catch { note('incomplete', 'history_unavailable', { ref: `conversations/${cid}` }); return; }
    }
    for (const row of rows) {
      if (row.conversationId !== cid) { note('incomplete', 'history_scope_mismatch', { ref: `conversations/${cid}`, scope: 'history' }); continue; }
      if (row.direction !== 'out' || !idOf(row.id)) continue;
      const at = iso(row.at || row.createdAt || row.timestamp), text = brief(row.body, 220);
      if (!at) { note('incomplete', 'message_time_missing', { ref: `messages/${row.id}` }); continue; }
      if (text) commitments.push({ ref: `messages/${row.id}`, conversationRef: `conversations/${cid}`, at, text, kind: 'recorded_outgoing_message' });
    }
  }));
  const people = [...records.values()].filter(e => PERSON_COLLECTIONS.has(e.collection)).map(e => ({
    ref: e.ref, name: brief(e.row.name || [e.row.firstName, e.row.lastName].filter(Boolean).join(' '), 80),
    roles: ROLE_ORDER.filter(role => e.roles.has(role)), matchedBy: [...e.via],
  }));
  for (const coll of ['users', 'landlords']) {
    if (entries(coll).length > 1) note('ambiguity', 'multiple_person_records', { collection: coll });
  }
  for (const e of records.values()) evidence.push({ kind: 'record', ref: e.ref, matchedBy: [...e.via] });
  if (!roles.size) roles.add('unknown');
  const roleList = ROLE_ORDER.filter(role => roles.has(role));
  return {
    roles: roleList, people, properties, practices, ambiguous, incomplete,
    identityAmbiguous, identityIncomplete, historyIncomplete, evidence,
    commitments: commitments.sort((a, b) => b.at.localeCompare(a.at)).slice(0, PERSONA_LIMITS.commitments),
    summary: `Ruoli documentati: ${roleList.join(', ')}. Pratiche candidate: ${practices.length}; immobili collegati: ${properties.length}.`
      + (ambiguous ? ' Collegamento ambiguo: non scegliere automaticamente una pratica.' : '')
      + (incomplete ? ' Fonti incomplete: assenza di risultati non prova assenza di relazioni.' : '')
      + ' Gli ultimi messaggi BOOM sono citazioni, non nuove promesse.',
  };
}
