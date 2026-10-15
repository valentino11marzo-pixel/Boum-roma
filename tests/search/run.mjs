// Pure engine, real module; only synthetic records and mutation checks.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const E = require('../../js/portal-search-engine.js');
const source = readFileSync(new URL('../../js/portal-search-engine.js', import.meta.url), 'utf8');
let passed = 0;
const check = (name, run) => { run(); passed++; console.log('PASS ' + name); };
const fixture = () => ({
  clients: [{ id: 'same', name: 'María Rossi', email: 'maria@example.invalid', phone: '+39 (333) 123-4567', service: 'PFS' }],
  users: [{ id: 'same', name: 'Mario Rossi', role: 'tenant' }, { id: 'tenant', name: 'Inquilino Verificato', role: 'tenant' },
    { id: 'owner', name: 'Locatore Certo', role: 'landlord' }, { id: 'admin', name: 'Amministratore Invisibile', role: 'admin' }],
  properties: [{ id: 'house', name: 'Casa Aurora', address: 'Via Esempio, Roma', ownerId: 'owner' }, { id: 'other', name: 'Casa Opposta' }],
  contracts: [{ id: 'contract', ref: 'BOOM-DEMO-77', propertyId: 'house', tenantId: 'tenant', status: 'active',
    coTenants: [{ name: 'Coinquilina Salvata', email: 'seconda@example.invalid' }] }],
  documents: [{ id: 'document', name: 'Verbale dimostrativo', contractId: 'contract', category: 'verbale' }],
  maintenance: [{ id: 'maint', title: 'Rubinetto da verificare', propertyId: 'house', userId: 'tenant' }],
  leads: [{ id: 'lead', leadName: 'Contatto Storico', leadPhone: '333 9988776', propertyId: 'same', clientId: 'same' }],
  tasks: [{ id: 'task', title: 'Richiamare il tecnico', linkedClientId: 'same', linkedPropertyId: 'house' }],
  deadlines: [{ id: 'deadline', title: 'Rinnovo dimostrativo', linkedContractId: 'contract', date: '2027-03-12' }],
  payments: [{ id: 'payment', month: '2027-03', amount: 1450, contractId: 'contract' }],
  listings: [{ id: 'same', name: 'Annuncio Separato', propertyId: 'house' }],
  pfsClients: [{ id: 'same', name: 'María Rossi', email: 'maria@example.invalid', service: 'PFS' }],
  pfsProperties: [{ id: 'pfs-house', address: 'Via Ricerca 10', landlordId: 'rubrica' }],
  landlords: [{ id: 'rubrica', name: 'Proprietario Rubrica', zones: 'Centro' }],
  preAgreements: [{ id: 'proposal', ref: 'BOOM-PA123', tenant: { fullName: 'Candidata Proposta', phone: '+39 333 555 1212' },
    tenants: [{ fullName: 'Seconda Firmataria' }], property: { address: 'Via Offerta 5' }, propertyId: 'house', contractId: 'contract', status: 'sent' }]
});
const ids = result => result.records.map(r => r.kind + '/' + r.id);
const includes = (api, q, state, kind, id) => api.search(q, state, { kind, limit: 100 }).records.some(r => r.id === id);
const relatedIds = rows => rows.map(r => r.kind + '/' + r.id);

check('15 collections declared; browser and CommonJS expose the same pure API', () => {
  assert.equal(Object.keys(E.KINDS).length, 15);
  assert(Object.values(E.KINDS).every(k => k.label && k.plural && k.collection && k.icon));
  const browser = { self: {}, fetch() { throw Error('No IO'); }, Date: class { constructor() { throw Error('No clock'); } } };
  runInNewContext(source, browser);
  assert.equal(typeof browser.self.BOOM_PORTAL_SEARCH.search, 'function');
  assert.equal(browser.self.BOOM_PORTAL_SEARCH.search('Aurora', fixture()).total, E.search('Aurora', fixture()).total);
});
check('every category is searchable and recordFor yields only a typed descriptor', () => {
  const s = fixture();
  for (const [kind, meta] of Object.entries(E.KINDS)) {
    const row = s[meta.collection][0], r = E.recordFor(kind, row.id, s);
    assert.equal(r.id, row.id); assert.equal(r.kind, kind); assert.equal(r.collection, meta.collection);
    assert.deepEqual(Object.keys(r).sort(), ['collection', 'icon', 'id', 'kind', 'label', 'sub']);
    assert(includes(E, row.id, s, kind, row.id), kind);
  }
});
check('accents, case, spacing, reordered tokens and formatted telephone match', () => {
  const s = fixture();
  for (const q of ['MARIA', ' rossi   maria ', '3331234567', '+39 333 123 4567', 'Maria 3331234567']) assert(includes(E, q, s, 'client', 'same'), q);
  assert(includes(E, 'Roma Aurora', s, 'property', 'house'));
  assert(includes(E, '3339988776', s, 'lead', 'lead'));
  assert(includes(E, '3335551212', s, 'proposal', 'proposal'));
  assert(includes(E, 'Seconda Firmataria', s, 'proposal', 'proposal'));
});
check('ID, reference and code work; legacy names survive missing foreign records', () => {
  const s = fixture();
  s.contracts.push({ id: 'orphan', tenantId: 'gone', propertyId: 'gone', tenantName: 'Persona Archivio', propertyAddress: 'Via Conservata', code: 'LOC-44' });
  s.documents.push({ id: 'receipt', name: 'Ricevuta', refCode: 'RCP-900' });
  assert(includes(E, 'BOOM-DEMO-77', s, 'contract', 'contract'));
  for (const q of ['Persona Archivio', 'Via Conservata', 'LOC-44']) assert(includes(E, q, s, 'contract', 'orphan'));
  assert(includes(E, 'RCP-900', s, 'document', 'receipt'));
});
check('a document is found through its exact contract, house, tenant and co-tenant', () => {
  const s = fixture();
  for (const q of ['Casa Aurora', 'Inquilino Verificato', 'Coinquilina Salvata', 'Locatore Certo', 'BOOM-DEMO-77']) assert(includes(E, q, s, 'document', 'document'), q);
  assert(includes(E, 'Casa Aurora', s, 'payment', 'payment'));
  assert(includes(E, 'Casa Aurora', s, 'deadline', 'deadline'));
});
check('typed IDs stay distinct across CRM/users/PFS/listings; names and email never merge', () => {
  const s = fixture(), result = E.search('Maria Rossi', s, { limit: 100 });
  assert(result.records.some(r => r.kind === 'client' && r.id === 'same'));
  assert(result.records.some(r => r.kind === 'pfsClient' && r.id === 'same'));
  assert.equal(E.recordFor('person', 'same', s).label, 'Mario Rossi');
  assert.equal(E.recordFor('listing', 'same', s).label, 'Annuncio Separato');
  assert.equal(includes(E, 'Mario Rossi', s, 'task', 'task'), false);
  assert.equal(includes(E, 'Maria Rossi', s, 'task', 'task'), true);
  assert.deepEqual(E.relatedFor('pfsClient', 'same', s), []);
});
check('lead propertyId is an announcement; colliding property ID is never substituted', () => {
  const s = fixture(); s.properties.push({ id: 'same', name: 'Casa Estranea' });
  assert(includes(E, 'Annuncio Separato', s, 'lead', 'lead'));
  assert.equal(includes(E, 'Casa Estranea', s, 'lead', 'lead'), false);
  const linked = relatedIds(E.relatedFor('lead', 'lead', s));
  assert(linked.includes('listing/same')); assert(!linked.includes('property/same'));
});
check('duplicates within a collection are unresolved, including downstream joins', () => {
  const s = fixture(); s.properties.push({ id: 'house', name: 'Casa Duplicata' });
  assert.equal(E.recordFor('property', 'house', s), null);
  assert.equal(includes(E, 'Aurora', s, 'property', 'house'), false);
  assert.equal(includes(E, 'Aurora', s, 'document', 'document'), false);
  s.contracts.push({ id: 'contract', propertyId: 'other' });
  assert.equal(E.recordFor('contract', 'contract', s), null);
  assert.equal(includes(E, 'Inquilino Verificato', s, 'document', 'document'), false);
  assert(!relatedIds(E.relatedFor('document', 'document', s)).includes('contract/contract'));
});
check('contradictory house references import neither house but preserve a direct user', () => {
  const s = fixture(); s.documents[0].propertyId = 'other'; s.documents[0].userId = 'owner';
  assert.equal(includes(E, 'Aurora', s, 'document', 'document'), false);
  assert.equal(includes(E, 'Opposta', s, 'document', 'document'), false);
  assert(includes(E, 'Locatore Certo', s, 'document', 'document'));
  assert(includes(E, 'Verbale dimostrativo', s, 'document', 'document'));
});
check('ambiguous owner ID across users/rubrica is never joined or merged', () => {
  const s = fixture(); s.landlords.push({ id: 'owner', name: 'Proprietario Collisione' });
  assert.equal(includes(E, 'Locatore Certo', s, 'contract', 'contract'), false);
  assert.equal(includes(E, 'Proprietario Collisione', s, 'contract', 'contract'), false);
  assert(!relatedIds(E.relatedFor('property', 'house', s)).includes('person/owner'));
  assert(E.recordFor('person', 'owner', s)); assert(E.recordFor('landlord', 'owner', s));
});
check('relatedFor is reciprocal, direct, typed and does not invent PFS/person matches', () => {
  const s = fixture();
  const house = relatedIds(E.relatedFor('property', 'house', s));
  for (const expected of ['contract/contract', 'maintenance/maint', 'listing/same', 'task/task', 'proposal/proposal']) assert(house.includes(expected));
  assert(!house.includes('document/document')); // document has contractId only
  const contract = relatedIds(E.relatedFor('contract', 'contract', s));
  for (const expected of ['property/house', 'person/tenant', 'document/document', 'payment/payment', 'proposal/proposal']) assert(contract.includes(expected));
  assert(relatedIds(E.relatedFor('client', 'same', s)).includes('lead/lead'));
  assert(relatedIds(E.relatedFor('landlord', 'rubrica', s)).includes('pfsProperty/pfs-house'));
  assert.deepEqual(E.relatedFor('unknown', 'same', s), []);
});
check('exact ID/name outrank partial matches; order is stable across input permutations', () => {
  const s = { clients: [{ id: 'partial', name: 'Aurora Estesa' }, { id: 'exact-name', name: 'Aurora' }, { id: 'Aurora', name: 'ZZZ' }] };
  assert.deepEqual(ids(E.search('Aurora', s)), ['client/Aurora', 'client/exact-name', 'client/partial']);
  const before = E.search('Aurora', s); s.clients.reverse(); assert.deepEqual(E.search('Aurora', s), before);
  const a = fixture(), b = Object.fromEntries(Object.entries(a).map(([k, rows]) => [k, rows.slice().reverse()]));
  assert.deepEqual(E.search('Casa', a), E.search('Casa', b));
});
check('filter before pagination, truthful total/hasMore, bounded page size', () => {
  const s = { clients: Array.from({ length: 145 }, (_, i) => ({ id: String(i).padStart(3, '0'), name: 'Comune' })), properties: [{ id: 'house', name: 'Comune' }] };
  const first = E.search('Comune', s, { kind: 'client' }), second = E.search('Comune', s, { kind: 'client', offset: 12 });
  assert.equal(first.records.length, 12); assert.equal(first.total, 145); assert.equal(first.hasMore, true);
  assert.equal(new Set([...ids(first), ...ids(second)]).size, 24);
  assert.equal(E.search('Comune', s, { limit: 1000 }).records.length, 100);
  assert.deepEqual(ids(E.search('Comune', s, { kind: 'property', limit: 1 })), ['property/house']);
  assert.equal(E.search('Comune', s, { kind: 'client', offset: 144 }).hasMore, false);
  assert.equal(E.search('Comune', s, { offset: 200 }).records.length, 0);
  assert.equal(E.search('Comune', s, { limit: -1, offset: -4 }).records.length, 1);
});
check('admins, chat contents, OCR, notes and token fields never enter search', () => {
  const s = fixture();
  s.conversations = [{ id: 'private', contactName: 'SegretoConversazione' }]; s.messages = [{ id: 'msg', text: 'SegretoMessaggio' }];
  s.documents[0].ocrText = 'SegretoOCR'; s.documents[0].notes = 'SegretoNota'; s.preAgreements[0].token = 'SegretoToken';
  for (const q of ['Amministratore Invisibile', 'SegretoConversazione', 'SegretoMessaggio', 'SegretoOCR', 'SegretoNota', 'SegretoToken']) assert.equal(E.search(q, s).total, 0);
  assert.equal(E.recordFor('person', 'admin', s), null);
  assert.deepEqual(E.relatedFor('person', 'admin', s), []);
});
check('bad input and frozen state are safe; descriptors never carry source or actions', () => {
  const freeze = v => { Object.values(v).forEach(x => { if (x && typeof x === 'object') freeze(x); }); return Object.freeze(v); };
  const s = freeze(fixture());
  for (const q of ['', '   ', '---', null, {}, 99]) assert.deepEqual(E.search(q, s), { records: [], total: 0, hasMore: false });
  assert.equal(E.search('Casa', s, { kind: 'toString' }).total, 0);
  for (const id of [null, '', 'missing', 4]) assert.equal(E.recordFor('property', id, s), null);
  assert.equal(E.search('Casa', { properties: [null, { id: null }, { id: 'ok', name: {} }], clients: {} }).total, 0);
  const r = E.search('Aurora', s).records[0]; r.label = 'local';
  assert.notEqual(E.search('Aurora', s).records[0].label, 'local');
  assert(Object.isFrozen(E.KINDS)); assert(Object.isFrozen(E.KINDS.property));
});
check('mutation tests enforce typed sources, unique IDs and ambiguity guards', () => {
  const mutant = (from, to) => {
    assert(source.includes(from), 'mutation anchor'); const sandbox = { module: { exports: {} } };
    runInNewContext(source.replace(from, to), sandbox); return sandbox.module.exports;
  };
  const typed = api => assert.equal(api.recordFor('pfsClient', 'same', { clients: [{ id: 'same', name: 'CRM' }], pfsClients: [{ id: 'same', name: 'PFS' }] }).label, 'PFS');
  typed(E); assert.throws(() => typed(mutant("['pfsClient', 'pfsClients'", "['pfsClient', 'clients'")), assert.AssertionError);
  const duplicate = api => assert.equal(api.recordFor('property', 'house', { properties: [{ id: 'house' }, { id: 'house' }] }), null);
  duplicate(E); assert.throws(() => duplicate(mutant('map.has(row.id) ? null : row', 'row')), assert.AssertionError);
  const conflict = api => { const s = fixture(); s.documents[0].propertyId = 'other'; assert.equal(includes(api, 'Aurora', s, 'document', 'document'), false); };
  conflict(E); assert.throws(() => conflict(mutant("houses.size < 2 || !n.path.includes('property')", 'true')), assert.AssertionError);
  const owner = api => { const s = fixture(); s.landlords.push({ id: 'owner', name: 'Collisione' }); assert.equal(includes(api, 'Locatore Certo', s, 'contract', 'contract'), false); };
  owner(E); assert.throws(() => owner(mutant('owners.length !== 1', 'owners.length === 0')), assert.AssertionError);
  const lead = api => { const s = fixture(); s.properties.push({ id: 'same', name: 'Estranea' }); assert.equal(includes(api, 'Estranea', s, 'lead', 'lead'), false); };
  lead(E); assert.throws(() => lead(mutant("lead: [['propertyId', 'listing']", "lead: [['propertyId', 'property']")), assert.AssertionError);
});
console.log(`${passed} verifiche ricerca superate; nessun IO o dato reale.`);
