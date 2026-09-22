// node tests/property-dossier/engine.mjs — real pure model, no network or writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const D = require('../../js/property-dossier-engine.js');
const R = require('../../js/rent-engine.js');
const source = readFileSync(new URL('../../js/property-dossier-engine.js', import.meta.url), 'utf8');
const NOW = '2026-09-20';
let checks = 0;
function test(label, run) { run(); checks++; console.log('  ✓ ' + label); }
function fixture(overrides = {}) {
  return {
    propertyId: 'p1', now: NOW,
    properties: [{ id: 'p1', name: 'Casa Uno', address: 'Via Roma 1', ownerId: 'owner' }, { id: 'p2', name: 'Casa Due', ownerId: 'owner' }],
    users: [{ id: 'owner', name: 'Proprietaria' }, { id: 'tenant', name: 'Inquilina' }, { id: 'tenant2', name: 'Seconda inquilina' }],
    contracts: [{ id: 'c1', propertyId: 'p1', tenantId: 'tenant', status: 'active', rent: 1000, deposit: 2000, startDate: '2026-01-01', endDate: '2026-12-31' }, { id: 'c2', propertyId: 'p2', tenantId: 'tenant', status: 'active', rent: 1500, startDate: '2026-01-01', endDate: '2026-12-31' }],
    payments: [], documents: [], maintenance: [], tasks: [], ...overrides
  };
}
function payment(overrides = {}) { return { id: 'r1', contractId: 'c1', propertyId: 'p1', tenantId: 'tenant', amount: 1000, status: 'pending', month: '2026-09', dueDate: '2026-09-05', ...overrides }; }
function ids(rows) { return Array.from(rows, r => r.id).sort(); }
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

test('CommonJS and browser expose the same derived API', () => {
  const context = { window: { BOOM_RENT: R } };
  vm.runInNewContext(source, context);
  assert.deepEqual(Object.keys(context.window.BOOM_PROPERTY_DOSSIER_ENGINE), Object.keys(D));
  assert.equal(context.window.BOOM_PROPERTY_DOSSIER_ENGINE.build(fixture()).property.id, 'p1');
});
test('the dossier retains exact source objects and all historical/active leases', () => {
  const data = fixture();
  data.contracts.push({ id: 'past', propertyId: 'p1', tenantId: 'tenant2', status: 'terminated', startDate: '2025-01-01', endDate: '2025-12-31', rent: 900 });
  data.contracts.push({ id: 'parallel', propertyId: 'p1', tenantId: 'tenant2', status: 'active', rent: 500, startDate: '2026-01-01', endDate: '2026-12-31' });
  const view = D.build(data);
  assert.equal(view.property, data.properties[0]);
  assert.equal(view.owner, data.users[0]);
  assert.deepEqual(ids(view.contracts), ['c1', 'parallel', 'past']);
  assert.deepEqual(ids(view.activeContracts), ['c1', 'parallel']);
  assert.equal(view.contractRows[0].source, data.contracts[0]);
  assert.deepEqual(view.activeRent, { knownTotal: 1500, unknownCount: 0, count: 2 });
  assert.equal(view.counts.activeContracts, 2);
  assert.ok(view.issues.some(i => i.code === 'multiple_active_contracts'));
});
test('people are attached through each contract, including co-tenants without a user profile', () => {
  const data = fixture();
  data.contracts[0].coTenants = [{ userId: 'tenant2', name: 'Old display name' }, { name: 'Named only in contract', email: 'same@example.test' }];
  data.users.push({ id: 'unrelated', name: 'Named only in contract', email: 'same@example.test' });
  const view = D.build(data);
  assert.equal(view.tenants.length, 3);
  assert.equal(view.tenants[0].user, data.users[1]);
  assert.equal(view.tenants[1].user, data.users[2]);
  assert.equal(view.tenants[1].source, data.contracts[0].coTenants[0]);
  assert.equal(view.tenants[2].user, null);
  assert.equal(view.tenants[2].unlinked, true);
  assert.equal(view.tenants[2].contractId, 'c1');
});
test('one person owning or renting two homes does not import their unrelated documents/tasks', () => {
  const data = fixture({ documents: [{ id: 'personal', userId: 'owner', name: 'Casa Uno' }, { id: 'tenant-doc', userId: 'tenant', name: 'Via Roma 1' }, { id: 'other-house', propertyId: 'p2', userId: 'owner' }], tasks: [{ id: 'title-only', title: 'Casa Uno Via Roma 1', linkedClientId: 'tenant' }] });
  const view = D.build(data);
  assert.deepEqual(view.documents, []);
  assert.deepEqual(view.tasks, []);
});
test('documents follow direct property, exact lease, or exact payment references only', () => {
  const data = fixture({ payments: [payment(), payment({ id: 'r2', propertyId: '', contractId: 'c1' })], documents: [
    { id: 'direct', propertyId: 'p1' }, { id: 'contract', contractId: 'c1' }, { id: 'payment', paymentId: 'r1' }, { id: 'legacy-payment', paymentId: 'r2' },
    { id: 'foreign', propertyId: 'p2' }, { id: 'unresolved', contractId: 'missing' }, { id: 'unbound', userId: 'tenant' }
  ] });
  const view = D.build(data);
  assert.deepEqual(ids(view.documents), ['contract', 'direct', 'legacy-payment', 'payment']);
  assert.equal(view.documentRows.find(r => r.id === 'payment').source, data.documents[2]);
});
function assertDirectBoundary(engine) {
  const view = engine.build(fixture({
    payments: [payment({ id: 'foreign-payment', propertyId: 'p2', contractId: 'c1' }), payment({ id: 'direct-payment', propertyId: 'p1', contractId: 'c2' })],
    documents: [{ id: 'foreign-doc', propertyId: 'p2', contractId: 'c1' }, { id: 'direct-doc', propertyId: 'p1', contractId: 'c2' }, { id: 'payment-doc', paymentId: 'foreign-payment', contractId: 'c1' }],
    tasks: [{ id: 'foreign-task', propertyId: 'p2', contractId: 'c1' }, { id: 'direct-task', propertyId: 'p1', contractId: 'c2' }]
  }));
  assert.deepEqual(ids(view.documents), ['direct-doc']);
  assert.deepEqual(ids(view.tasks), ['direct-task']);
  assert.deepEqual(ids(view.payments), ['direct-payment']);
  assert.deepEqual(ids(view.contracts), ['c1']);
  assert.ok(view.issues.some(i => i.code === 'relationship_conflict' && i.id === 'direct-doc'));
  assert.ok(view.issues.some(i => i.code === 'relationship_conflict' && i.id === 'foreign-payment'));
}
test('direct property IDs override stale lease references consistently across the dossier', () => assertDirectBoundary(D));
test('a wrong or missing direct property never falls through to a known legacy lease', () => {
  const view = D.build(fixture({ documents: [{ id: 'd', propertyId: 'missing-property', contractId: 'c1' }], payments: [payment({ propertyId: 'missing-property' })], tasks: [{ id: 't', propertyId: 'missing-property', contractId: 'c1' }] }));
  assert.equal(view.documents.length, 0);
  assert.equal(view.payments.length, 0);
  assert.equal(view.tasks.length, 0);
  assert.ok(view.issues.some(i => i.resolvedPropertyId === 'missing-property'));
});
test('a direct link survives an unloaded related record and exposes the missing association', () => {
  const view = D.build(fixture({ documents: [{ id: 'd', propertyId: 'p1', contractId: 'missing', paymentId: 'missing-r' }] }));
  assert.equal(view.documents.length, 1);
  assert.ok(view.issues.some(i => i.code === 'contract_missing'));
  assert.ok(view.issues.some(i => i.code === 'payment_missing'));
});
test('maintenance requires its own exact property ID; task links can reference scoped maintenance', () => {
  const view = D.build(fixture({ maintenance: [{ id: 'm1', propertyId: 'p1', status: 'open' }, { id: 'm2', propertyId: 'p2', status: 'open' }, { id: 'm3', contractId: 'c1', status: 'open', userId: 'tenant' }], tasks: [{ id: 't1', maintenanceId: 'm1', status: 'pending' }, { id: 't2', maintenanceId: 'm2' }, { id: 't3', contractId: 'c1', status: 'open' }, { id: 't4', linkedPropertyId: 'p1', status: 'done' }, { id: 't5', linkedContractId: 'c1', status: 'pending' }] }));
  assert.deepEqual(ids(view.maintenance), ['m1']);
  assert.deepEqual(ids(view.tasks), ['t1', 't3', 't4', 't5']);
  assert.equal(view.counts.openTasks, 3);
});
test('rent rows and totals agree with the shared engine, including reported/cancelled/other charges', () => {
  const data = fixture({ payments: [payment({ id: 'paid', status: 'paid', amount: 100 }), payment({ id: 'claimed', tenantReported: true, amount: 200 }), payment({ id: 'cancelled', status: 'cancelled', amount: 300 }), payment({ id: 'processing', sddPiId: 'pi', amount: 400 }), payment({ id: 'deposit', type: 'deposit', status: 'paid', amount: 500 }), payment({ id: 'due', amount: 600 })] });
  const view = D.build(data), expected = R.overview(data).units.find(u => u.propertyId === 'p1');
  assert.deepEqual(view.rentUnit, expected);
  assert.deepEqual(view.totals, expected.totals);
  assert.equal(view.totals.paid, 100);
  assert.equal(view.totals.reported, 200);
  assert.equal(view.totals.processing, 400);
  assert.equal(view.totals.pending, 600);
  assert.equal(view.totals.due, 1200);
  assert.equal(view.totals.other, 500);
  assert.equal(view.payments.find(r => r.id === 'claimed').state, 'reported');
  assert.equal(view.payments.find(r => r.id === 'cancelled').canPay, false);
});
test('zero amounts remain zero, missing/invalid amounts remain unknown without invented debt', () => {
  const data = fixture({ payments: [payment({ id: 'zero', amount: 0 }), payment({ id: 'missing', amount: null }), payment({ id: 'invalid', amount: '1,000' })] });
  data.contracts[0].rent = 0;
  data.contracts[0].canone = { monthly: 999 };
  data.contracts[0].deposit = 0;
  let view = D.build(data);
  assert.equal(view.contractRows[0].rent, 0);
  assert.equal(view.contractRows[0].deposit, 0);
  assert.equal(view.totals.due, 0);
  assert.equal(view.totals.unknownAmountCount, 2);
  assert.equal(view.payments.find(r => r.id === 'zero').amount, 0);
  assert.equal(view.payments.find(r => r.id === 'missing').amount, null);
  data.contracts[0].rent = null;
  delete data.contracts[0].canone;
  view = D.build(data);
  assert.equal(view.contractRows[0].rent, null);
  assert.equal(view.activeRent.unknownCount, 1);
});
test('an empty unit has no fabricated installment, debt or completion state', () => {
  const view = D.build(fixture({ contracts: [] }));
  assert.equal(view.rentUnit.noInstallments, true);
  assert.equal(view.payments.length, 0);
  assert.equal(view.totals.due, 0);
  assert.equal(view.counts.activeContracts, 0);
});
test('unknown properties/owners never select an unrelated person or an unlinked record', () => {
  let view = D.build(fixture({ propertyId: 'missing' }));
  assert.equal(view.property, null);
  assert.equal(view.owner, null);
  assert.equal(view.rentUnit, null);
  assert.ok(view.issues.some(i => i.code === 'property_missing'));
  view = D.build(fixture({ properties: [{ id: 'p1', ownerName: 'Proprietaria' }] }));
  assert.equal(view.owner, null);
  assert.ok(view.issues.some(i => i.code === 'owner_missing'));
  view = D.build(fixture({ propertyId: '', contracts: [{ id: 'unknown', propertyId: '', status: 'active' }], documents: [{ id: 'unknown', propertyId: '' }] }));
  assert.equal(view.contracts.length, 0);
  assert.equal(view.documents.length, 0);
});
test('dates are validated, impossible dates do not invent overdue tasks or historical events', () => {
  const data = fixture({ documents: [{ id: 'd', propertyId: 'p1', createdAt: '2026-02-31' }], tasks: [{ id: 't', propertyId: 'p1', status: 'pending', dueDate: '2026-02-31', createdAt: '2026-09-01Tnonsense' }], payments: [payment({ dueDate: '2026-02-31' })] });
  data.contracts[0].endDate = '2026-02-31';
  const view = D.build(data);
  assert.equal(view.contractRows[0].endDate, '');
  assert.equal(view.contractRows[0].daysToEnd, null);
  assert.equal(view.taskRows[0].overdue, false);
  assert.equal(view.payments[0].state, 'due');
  assert.equal(view.timeline.some(e => ['document', 'task'].includes(e.kind)), false);
  assert.ok(view.issues.some(i => i.code === 'invalid_date'));
});
test('Rome civil dates and a reversed lease interval never invent a start event', () => {
  const data = fixture({ documents: [{ id: 'd', propertyId: 'p1', createdAt: { seconds: Date.parse('2026-09-19T22:30:00Z') / 1000 } }] });
  data.contracts[0].startDate = '2026-09-20';
  data.contracts[0].endDate = '2026-09-19';
  const view = D.build(data);
  assert.equal(view.documentRows[0].createdDate, NOW);
  assert.equal(view.contractRows[0].daysToEnd, null);
  assert.equal(view.timeline.some(e => e.event === 'start'), false);
  assert.ok(view.issues.some(i => i.code === 'contract_date_conflict'));
});
test('timeline separates creation from completion and requires recorded status/signature evidence', () => {
  const data = fixture({
    documents: [{ id: 'd', propertyId: 'p1', createdAt: '2026-09-04', name: 'APE' }],
    maintenance: [{ id: 'm-open', propertyId: 'p1', status: 'open', createdAt: '2026-09-02', resolvedAt: '2026-09-03' }, { id: 'm-done', propertyId: 'p1', status: 'resolved', createdAt: '2026-09-02', resolvedAt: '2026-09-03' }],
    tasks: [{ id: 't-open', propertyId: 'p1', status: 'pending', createdAt: '2026-09-05', completedAt: '2026-09-06' }, { id: 't-done', propertyId: 'p1', status: 'done', createdAt: '2026-09-05', completedAt: '2026-09-06' }],
    payments: [payment({ id: 'reported', tenantReported: true, paidDate: '2026-09-06' }), payment({ id: 'paid', status: 'paid', paidDate: '2026-09-07' })]
  });
  data.contracts[0].tenantSignedAt = '2026-09-01';
  data.contracts[0].landlordSignedAt = '2026-09-01';
  data.contracts[0].landlordSignature = 'recorded-signature';
  const view = D.build(data);
  assert.equal(view.timeline.some(e => e.event === 'tenant_signed'), false);
  assert.equal(view.timeline.some(e => e.event === 'owner_signed'), true);
  assert.equal(view.timeline.filter(e => e.kind === 'maintenance' && e.event === 'resolved').length, 1);
  assert.equal(view.timeline.filter(e => e.kind === 'task' && e.event === 'completed').length, 1);
  assert.equal(view.timeline.filter(e => e.kind === 'payment').length, 1);
  assert.equal(view.timeline.find(e => e.kind === 'payment').recordId, 'paid');
  assert.equal(view.timeline.find(e => e.recordId === 'd').label, 'Documento archiviato');
  assert.equal(view.timeline.find(e => e.recordId === 'm-done' && e.event === 'created').label, 'Manutenzione aperta');
  assert.equal(view.timeline.find(e => e.recordId === 'm-done' && e.event === 'resolved').label, 'Manutenzione risolta');
});
test('future and undated records remain in their sections but not in the completed-event timeline', () => {
  const view = D.build(fixture({ documents: [{ id: 'future', propertyId: 'p1', createdAt: '2026-12-01' }, { id: 'undated', propertyId: 'p1' }] }));
  assert.equal(view.documents.length, 2);
  assert.equal(view.timeline.some(e => e.kind === 'document'), false);
});
test('unknown maintenance/task statuses are explicit and are never silently counted as open or done', () => {
  const view = D.build(fixture({ maintenance: [{ id: 'm', propertyId: 'p1', status: 'mystery', priority: 'urgent' }], tasks: [{ id: 't', propertyId: 'p1', status: '', priority: 'urgent', dueDate: '2020-01-01' }] }));
  assert.equal(view.maintenanceRows[0].status, 'unknown');
  assert.equal(view.maintenanceRows[0].statusLabel, 'Da verificare');
  assert.equal(view.taskRows[0].status, 'unknown');
  assert.equal(view.counts.openMaintenance, 0);
  assert.equal(view.counts.openTasks, 0);
  assert.equal(view.counts.overdueTasks, 0);
});
test('the maintenance modal’s pending status is open, while a completed task needs the actual done marker', () => {
  const view = D.build(fixture({ maintenance: [{ id: 'm', propertyId: 'p1', status: 'pending', priority: 'urgent' }], tasks: [{ id: 't', propertyId: 'p1', status: 'completed', completedAt: '2026-09-01' }] }));
  assert.equal(view.maintenanceRows[0].statusLabel, 'In attesa');
  assert.equal(view.counts.openMaintenance, 1);
  assert.equal(view.counts.urgentMaintenance, 1);
  assert.equal(view.taskRows[0].status, 'unknown');
  assert.equal(view.timeline.some(e => e.event === 'completed'), false);
});
test('exported civil-day normalization rejects bad dates for display and no valid payment gets a missing-date warning', () => {
  assert.equal(D.day('2026-02-31'), '');
  assert.equal(D.day('2026-02-28'), '2026-02-28');
  const view = D.build(fixture({ payments: [payment()] }));
  assert.equal(view.payments[0].dueDate, '2026-09-05');
  assert.equal(view.issues.some(i => i.code === 'payment_date_missing'), false);
});
test('deeply frozen input remains untouched, including sorts and embedded co-tenants', () => {
  const data = fixture({ documents: [{ id: 'older', propertyId: 'p1', createdAt: '2026-09-01' }, { id: 'newer', contractId: 'c1', createdAt: '2026-09-19' }], payments: [payment()], maintenance: [{ id: 'm', propertyId: 'p1', status: 'open' }], tasks: [{ id: 't', propertyId: 'p1', status: 'pending' }] });
  data.contracts[0].coTenants = [{ userId: 'tenant2', name: 'Seconda inquilina' }];
  freeze(data);
  const before = JSON.stringify(data), view = D.build(data);
  assert.equal(JSON.stringify(data), before);
  assert.equal(view.documents[0], data.documents[1]);
  assert.equal(view.payments[0].payment, data.payments[0]);
  assert.equal(view.maintenanceRows[0].source, data.maintenance[0]);
  assert.equal(view.taskRows[0].source, data.tasks[0]);
});
function mutant(from, to) {
  assert.ok(source.includes(from), 'mutation target exists');
  const context = { module: { exports: {} }, require: () => R };
  vm.runInNewContext(source.replace(from, to), context);
  return context.module.exports;
}
test('mutation: stale contract-first document/task associations break the same property boundary', () => {
  assertDirectBoundary(mutant('[direct, legacyProperty, fromPayment, fromMaintenance, fromContract]', '[direct, legacyProperty, fromPayment, fromMaintenance, fromContract]'));
  const m = mutant('[direct, legacyProperty, fromPayment, fromMaintenance, fromContract]', '[fromContract, legacyProperty, fromPayment, fromMaintenance, direct]');
  assert.throws(() => assertDirectBoundary(m));
});
test('mutation: trusting a resolution timestamp without resolved status invents a false event', () => {
  const m = mutant("if (status === 'resolved') event('maintenance'", "if (true) event('maintenance'");
  const data = fixture({ maintenance: [{ id: 'm', propertyId: 'p1', status: 'open', resolvedAt: '2026-09-01' }] });
  assert.throws(() => assert.equal(m.build(data).timeline.some(e => e.event === 'resolved'), false));
});
console.log(`\n${checks} verifiche fascicolo immobile superate; nessuna rete o scrittura.`);
