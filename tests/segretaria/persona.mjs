// The real dossier + real _lib, with only the Firestore network boundary fake.
import assert from 'node:assert/strict';

process.env.FIREBASE_API_KEY = 'test-persona';
process.env.FIREBASE_ADMIN_EMAIL = 'test@example.test';
process.env.FIREBASE_ADMIN_PASS = 'test-only';
const { toFsFields, fsValToJs } = await import('../../api/homie/_lib.js');
const { personaDossier, PERSONA_LIMITS } = await import('../../api/segretaria/_persona.js');
const DB = new Map();
let calls = [], failures = new Set(), passed = 0, failed = 0;
const phone = '+393331234567', email = 'persona@example.test';
const doc = (path, data) => ({ name: `projects/test/databases/(default)/documents/${path}`, fields: toFsFields(data) });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = async (url, options = {}) => {
  const u = String(url), method = options.method || 'GET';
  if (u.startsWith('https://identitytoolkit.googleapis.com/')) return response({ idToken: 'test-token' });
  assert.ok(u.startsWith('https://firestore.googleapis.com/'), 'No messages, models or other services may be called');
  if (u.endsWith(':runQuery')) {
    const q = JSON.parse(options.body).structuredQuery;
    const collection = q.from[0].collectionId, filter = q.where?.fieldFilter;
    assert.ok(filter, `Unscoped scan forbidden: ${collection}`);
    assert.ok(['EQUAL', 'IN'].includes(filter.op));
    assert.ok(!/name/i.test(filter.field.fieldPath), 'Names never resolve identity');
    assert.ok(q.limit <= PERSONA_LIMITS.history + 1, 'Reads have explicit bounded limits');
    calls.push({ collection, filter, limit: q.limit });
    if (failures.has(collection) || failures.has(`${collection}.${filter.field.fieldPath}`)) return response({ error: 'unavailable' }, 503);
    const value = fsValToJs(filter.value);
    const rows = [...DB].filter(([path]) => path.split('/').length === 2 && path.startsWith(collection + '/'))
      .filter(([, row]) => filter.op === 'IN' ? value.includes(row[filter.field.fieldPath]) : row[filter.field.fieldPath] === value)
      .slice(0, q.limit);
    return response(rows.map(([path, row]) => ({ document: doc(path, row) })));
  }
  assert.equal(method, 'GET', 'Dossier must never write Firestore');
  const path = decodeURIComponent(u.split('/documents/')[1] || '');
  calls.push({ path, method });
  if (failures.has(path)) return response({ error: 'unavailable' }, 503);
  return DB.has(path) ? response(doc(path, DB.get(path))) : response({ error: 'NOT_FOUND' }, 404);
};

async function test(name, run) {
  DB.clear(); calls = []; failures = new Set();
  try {
    await run();
    passed++;
    console.log(`ok — ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL — ${name}: ${error.message}`);
  }
}
const reason = (d, name) => d.evidence.some(e => e.reason === name);

await test('old lead never masks a tenant, owner or PFS role', async () => {
  DB.set('leads/old', { phone: '3331234567', status: 'archived', name: 'Name is not the key' });
  DB.set('users/tenant', { phone, role: 'tenant', email });
  DB.set('landlords/owner', { phone: '00393331234567', name: 'Other spelling' });
  DB.set('pfsClients/search', { contactPhone: phone, stage: 'research' });
  const before = JSON.stringify([...DB]);
  const d = await personaDossier({ phone });
  assert.deepEqual(d.roles, ['tenant', 'landlord', 'pfs', 'lead']);
  assert.equal(d.incomplete, false);
  assert.equal(JSON.stringify([...DB]), before);
  assert.ok(d.people.find(p => p.ref === 'leads/old'));
});

await test('matching names and unrelated phone numbers do not connect records', async () => {
  DB.set('leads/target', { phone, name: 'Same Name' });
  DB.set('users/unrelated', { phone: '+393339999999', role: 'tenant', name: 'Same Name' });
  const d = await personaDossier({ phone });
  assert.deepEqual(d.roles, ['lead']);
  assert.ok(!JSON.stringify(d).includes('users/unrelated'));
  assert.equal(d.ambiguous, false);
});

await test('phone and email pointing to different identities remain ambiguous', async () => {
  DB.set('leads/a', { phone, email: 'other@example.test' });
  DB.set('users/b', { phone: '+393339999999', email, role: 'owner' });
  const d = await personaDossier({ phone, email });
  assert.equal(d.ambiguous, true);
  assert.equal(d.identityAmbiguous, true);
  assert.ok(reason(d, 'contact_identifiers_disagree'));
  assert.ok(reason(d, 'phone_email_not_joined'));
  assert.deepEqual(d.roles, ['landlord', 'lead']);
});

await test('email-only and phone-only records cannot silently become one person', async () => {
  DB.set('leads/a', { phone });
  DB.set('users/b', { email, role: 'tenant' });
  const d = await personaDossier({ phone, email });
  assert.equal(d.ambiguous, true);
  assert.ok(reason(d, 'phone_email_not_joined'));
});

await test('one record joins both identifiers without inventing an ambiguity', async () => {
  DB.set('leads/a', { phone, email });
  const d = await personaDossier({ phone, email: 'PERSONA@example.test' });
  assert.equal(d.ambiguous, false);
  assert.equal(d.incomplete, false);
});

await test('explicit conversation reaches its person even without copied contact details', async () => {
  DB.set('conversations/c', { contactType: 'lead', contactId: 'old' });
  DB.set('leads/old', { phone });
  DB.set('users/protected', { phone, role: 'tenant' });
  const d = await personaDossier({ conversationId: 'c' });
  assert.ok(d.roles.includes('tenant'));
  assert.ok(d.people.some(p => p.ref === 'users/protected'));
});

await test('a conflicting explicit lead cannot replace the incoming identity', async () => {
  DB.set('leads/b', { phone: '+393339999999', email: 'different@example.test' });
  DB.set('users/a', { phone, role: 'tenant' });
  const d = await personaDossier({ phone, leadId: 'b' });
  assert.equal(d.ambiguous, true);
  assert.ok(reason(d, 'input_references_disagree'));
  assert.ok(d.roles.includes('tenant'));
});

await test('converted tenant foreign key keeps the protected role with stale contact details', async () => {
  DB.set('leads/old', { phone, convertedTenantId: 't', status: 'converted' });
  DB.set('users/t', { phone: '+393338888888', role: 'tenant' });
  const d = await personaDossier({ phone, leadId: 'old' });
  assert.ok(d.roles.includes('tenant'));
  assert.ok(reason(d, 'linked_identity_disagrees'));
  assert.equal(d.ambiguous, true);
});

await test('two contracts preserve both cases and real property provenance', async () => {
  DB.set('users/t', { phone, role: 'tenant' });
  DB.set('contracts/c1', { tenantId: 't', propertyId: 'p1', status: 'active' });
  DB.set('contracts/c2', { tenantId: 't', propertyId: 'p2', status: 'draft' });
  DB.set('properties/p1', { name: 'First home' });
  DB.set('properties/p2', { name: 'Second home' });
  const d = await personaDossier({ phone });
  assert.equal(d.ambiguous, true);
  assert.ok(reason(d, 'multiple_practices'));
  assert.equal(d.identityAmbiguous, false);
  assert.equal(d.identityIncomplete, false);
  assert.equal(d.practices.length, 2);
  assert.deepEqual(d.practices.find(p => p.ref === 'contracts/c1').propertyRefs, ['properties/p1']);
  assert.ok(!('selectedPractice' in d));
  assert.ok(d.properties.find(p => p.ref === 'properties/p2').via.includes('contracts/c2.propertyId'));
});

await test('a property identifier present in both collections is not guessed', async () => {
  DB.set('leads/l', { phone, propertyId: 'same' });
  DB.set('properties/same', { name: 'Managed home' });
  DB.set('listings/same', { name: 'Different listing' });
  const d = await personaDossier({ phone });
  assert.equal(d.ambiguous, true);
  assert.ok(reason(d, 'property_reference_not_unique'));
  assert.deepEqual(d.practices[0].propertyRefs.sort(), ['listings/same', 'properties/same']);
});

await test('landlord ownership leads to existing contracts without whole-catalog scans', async () => {
  DB.set('users/o', { phone, role: 'owner' });
  DB.set('properties/p', { ownerId: 'o', name: 'Owned home' });
  DB.set('contracts/c', { tenantId: 'someone-else', propertyId: 'p', status: 'active' });
  const d = await personaDossier({ phone });
  assert.deepEqual(d.roles, ['landlord']);
  assert.ok(d.practices.some(p => p.ref === 'contracts/c'));
  assert.ok(!d.people.some(p => p.ref === 'users/someone-else'));
});

await test('viewings use the live viewingRequests collection and remain a candidate', async () => {
  DB.set('viewingRequests/v', { clientPhone: phone, clientEmail: email, listingId: 'home', status: 'confirmed' });
  DB.set('listings/home', { name: 'A home' });
  const d = await personaDossier({ phone, email });
  assert.equal(d.practices[0].type, 'viewing');
  assert.deepEqual(d.practices[0].propertyRefs, ['listings/home']);
  assert.ok(!calls.some(c => c.collection === 'viewings'));
});

await test('a source failure is explicit and cannot erase a known protected role', async () => {
  DB.set('users/t', { phone, role: 'tenant' });
  failures.add('landlords');
  const d = await personaDossier({ phone });
  assert.ok(d.roles.includes('tenant'));
  assert.equal(d.incomplete, true);
  assert.equal(d.identityIncomplete, true);
  assert.ok(reason(d, 'source_unavailable'));
  assert.ok(d.summary.includes('Fonti incomplete'));
});

await test('query limits and duplicate person records are both visible', async () => {
  for (let i = 0; i <= PERSONA_LIMITS.query; i++) DB.set(`users/u${i}`, { phone, role: 'tenant' });
  const d = await personaDossier({ phone });
  assert.equal(d.incomplete, true);
  assert.equal(d.ambiguous, true);
  assert.ok(reason(d, 'query_limit'));
  assert.ok(reason(d, 'multiple_person_records'));
  assert.equal(d.people.length, PERSONA_LIMITS.query);
});

await test('privacy projection excludes files and redacts identifiers inside quoted messages', async () => {
  DB.set('users/t', { phone, role: 'tenant', email, cf: 'RSSMRA80A01H501U', iban: 'IT60X0542811101000000123456', identity: { passport: 'AA123456' }, fileBase64: 'SECRET_DOCUMENT_BODY' });
  DB.set('conversations/c', { contactPhone: phone });
  DB.set('messages/m', { conversationId: 'c', direction: 'out', at: '2026-09-14T15:00:00Z',
    body: 'Ti richiamo domani. CF RSSMRA80A01H501U. IBAN IT60X0542811101000000123456 https://files.example.test/document?token=private',
    attachments: [{ fileBase64: 'SECRET_ATTACHMENT' }] });
  const d = await personaDossier({ phone, conversationId: 'c' });
  const serialized = JSON.stringify(d);
  for (const forbidden of ['RSSMRA80A01H501U', 'IT60X0542811101000000123456', 'AA123456', 'SECRET_DOCUMENT_BODY', 'SECRET_ATTACHMENT', 'token=private', email]) assert.ok(!serialized.includes(forbidden));
  assert.ok(d.commitments[0].text.includes('Ti richiamo domani'));
  assert.equal(d.commitments[0].ref, 'messages/m');
  assert.equal(d.commitments[0].kind, 'recorded_outgoing_message');
});

await test('latest outgoing words are sorted by source time, not result order', async () => {
  DB.set('conversations/c', { contactPhone: phone });
  DB.set('messages/new', { conversationId: 'c', direction: 'out', at: '2026-09-14T15:00:00Z', body: 'Domani confermo.' });
  DB.set('messages/in', { conversationId: 'c', direction: 'in', at: '2026-09-14T16:00:00Z', body: 'Grazie' });
  DB.set('messages/old', { conversationId: 'c', direction: 'out', at: '2026-09-10T15:00:00Z', body: 'Ci aggiorniamo.' });
  const d = await personaDossier({ phone, conversationId: 'c' });
  assert.deepEqual(d.commitments.map(m => m.ref), ['messages/new', 'messages/old']);
});

await test('identity document numbers in message text do not enter the prompt', async () => {
  DB.set('conversations/c', { contactPhone: phone });
  DB.set('messages/m', { conversationId: 'c', direction: 'out', at: '2026-09-14T15:00:00Z', body: 'Il passport AA123456 è allegato.' });
  const d = await personaDossier({ phone, conversationId: 'c' });
  assert.ok(!JSON.stringify(d).includes('AA123456'));
  assert.equal(d.commitments[0].text, '[dati identificativi omessi; consulta la fonte]');
});

await test('an unavailable listing does not erase identity but marks missing context', async () => {
  DB.set('leads/l', { phone, listingId: 'absent' });
  const d = await personaDossier({ phone });
  assert.equal(d.incomplete, true);
  assert.equal(d.identityIncomplete, false);
  assert.ok(reason(d, 'property_reference_not_found'));
});

await test('a capped history does not pretend an arbitrary prefix is the last promise', async () => {
  DB.set('conversations/c', { contactPhone: phone });
  for (let i = 0; i <= PERSONA_LIMITS.history; i++) DB.set(`messages/m${i}`, { conversationId: 'c', direction: 'out', at: '2026-09-14T15:00:00Z', body: 'Un messaggio.' });
  const d = await personaDossier({ phone, conversationId: 'c' });
  assert.equal(d.incomplete, true);
  assert.equal(d.historyIncomplete, true);
  assert.equal(d.identityIncomplete, false);
  assert.equal(d.identityAmbiguous, false);
  assert.deepEqual(d.commitments, []);
  assert.ok(reason(d, 'latest_commitments_not_verified'));
});

await test('missing references and missing identity are declared, never fabricated', async () => {
  const missing = await personaDossier({ leadId: 'absent' });
  assert.equal(missing.incomplete, true);
  assert.ok(reason(missing, 'reference_not_found'));
  const unknown = await personaDossier({});
  assert.deepEqual(unknown.roles, ['unknown']);
  assert.equal(unknown.incomplete, true);
  assert.deepEqual(unknown.people, []);
});

await test('invalid reference paths cannot select other documents', async () => {
  const d = await personaDossier({ leadId: '../settings', conversationId: 'x/y', phone: 'not-a-phone' });
  assert.equal(d.incomplete, true);
  assert.ok(reason(d, 'invalid_reference'));
  assert.equal(calls.length, 0);
});

console.log(`\nPersona: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
