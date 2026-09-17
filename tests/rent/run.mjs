// node tests/rent/run.mjs — Canoni separati dai ricavi BOOM, tutte le unità
// visibili, stato derivato dai fatti e blocco dei doppi addebiti. No rete.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const R = require('../../js/rent-engine.js');
const source = readFileSync(new URL('../../js/rent-engine.js', import.meta.url), 'utf8');
const TODAY = '2026-09-17';
let checks = 0;
const test = (label, run) => { run(); checks++; console.log('  ✓ ' + label); };
const payment = (overrides = {}) => ({ id: 'r1', propertyId: 'p1', tenantId: 't1', contractId: 'c1', month: '2026-09', dueDate: '2026-09-05', amount: 1200, status: 'pending', ...overrides });
const overview = (overrides = {}) => R.overview({
  now: TODAY,
  properties: [{ id: 'p1', name: 'Unità Roma', address: 'Via Roma 1' }, { id: 'p2', name: 'Unità senza rate' }],
  contracts: [{ id: 'c1', status: 'active', propertyId: 'p1', tenantId: 't1', tenantName: 'Anna' }],
  users: [{ id: 't1', name: 'Anna Rossi' }],
  payments: [payment()], ...overrides
});
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

test('import CommonJS e browser UMD offrono la stessa API', () => {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  assert.deepEqual(Object.keys(context.window.BOOM_RENT), Object.keys(R));
  assert.equal(context.window.BOOM_RENT.paymentState(payment(), TODAY), 'overdue');
});

test('numeri e stringhe decimali sono euro, senza concatenazioni', () => {
  assert.equal(R.amount('1200.50'), 1200.5);
  assert.equal(R.amount(0), 0);
  assert.equal(R.amount(' 12.50 '), 12.5);
  assert.equal(overview({ payments: [payment({ amount: '1200.50' }), payment({ id: 'r2', amount: '9.50' })] }).totals.due, 1210);
});
test('importi non numerici/ambigui restano sconosciuti, mai NaN o zero inventato', () => {
  for (const n of [null, undefined, '', ' ', false, true, [], {}, '€1200', '1.200,50', '1,200', '1.200', '1e3', 'Infinity', NaN, Infinity, -1]) assert.equal(R.amount(n), null, String(n));
  const view = overview({ payments: [payment({ amount: 'errore' }), payment({ id: 'r2', amount: '100.25' })] });
  assert.equal(view.payments.find(p => p.id === 'r1').amount, null);
  assert.equal(view.totals.unknownAmountCount, 1);
  assert.equal(view.totals.due, 100.25);
  assert.equal(view.payments.find(p => p.id === 'r1').canPay, false);
});
test('le somme si mantengono al centesimo', () => {
  assert.equal(overview({ payments: [payment({ amount: 0.1 }), payment({ id: 'r2', amount: 0.2 })] }).totals.due, 0.3);
});

test('pagato richiede lo stato autorevole; link e ricevuta non bastano', () => {
  assert.equal(R.paymentState(payment({ stripeSessionId: 'cs_x', receiptUrl: 'https://stripe.test/receipt', payment: 'success', paidDate: TODAY }), TODAY), 'overdue');
  assert.equal(R.paymentState(payment({ status: 'paid', sddPiId: 'pi_x', sddStatus: 'processing' }), TODAY), 'paid');
  assert.equal(R.paymentState(payment({ status: undefined, paidVia: 'stripe' }), TODAY), 'unknown');
});
test('stato cancelled/canceled vince su un vecchio identificativo SEPA', () => {
  for (const status of ['cancelled', 'canceled', 'void', 'voided']) {
    const p = payment({ status, sddPiId: 'pi_x' });
    assert.equal(R.paymentState(p, TODAY), 'cancelled');
    assert.equal(R.paymentBlockReason(p), 'payment_cancelled');
    assert.equal(R.canPay(p, TODAY), false);
  }
});
test('SEPA in elaborazione esclude secondo checkout e sollecito ritardo', () => {
  for (const extra of [{ sddPiId: 'pi_x' }, { sddPiId: 'pi_x', sddStatus: 'processing' }, { sddStatus: 'processing' }, { sddStatus: 'succeeded' }]) {
    const p = payment(extra);
    assert.equal(R.paymentState(p, TODAY), 'processing');
    assert.equal(R.paymentBlockReason(p), 'sdd_processing');
    assert.equal(R.canPay(p, TODAY), false);
  }
});
test('SEPA fallito o annullato torna riscuotibile senza cancellare la traccia', () => {
  for (const sddStatus of ['failed', 'canceled', 'cancelled']) {
    const p = payment({ sddPiId: 'pi_x', sddStatus });
    assert.equal(R.paymentBlockReason(p), '');
    assert.equal(R.paymentState(p, TODAY), 'overdue');
    assert.equal(R.canPay(p, TODAY), true);
  }
});
test('carta in elaborazione/attesa conferma non è pagata né riscuotibile', () => {
  for (const extra of [{ status: 'processing' }, { stripeStatus: 'processing' }, { stripePaymentStatus: 'processing' }, { paymentIntentStatus: 'requires_capture' }, { cardStatus: 'succeeded' }]) {
    assert.equal(R.paymentState(payment(extra), TODAY), 'processing');
    assert.equal(R.canPay(payment(extra), TODAY), false);
  }
});
test('segnalazione inquilino non equivale ad incasso e sospende nuovo pagamento', () => {
  assert.equal(R.paymentState(payment({ tenantReported: true }), TODAY), 'reported');
  assert.equal(R.canPay(payment({ tenantReported: true }), TODAY), false);
  assert.equal(R.paymentState(payment({ tenantReported: true, status: 'paid' }), TODAY), 'paid');
  assert.equal(R.paymentState(payment({ tenantReported: true, sddPiId: 'pi_x' }), TODAY), 'processing');
});
test('pending e overdue si derivano dalla stessa scadenza, oggi non è scaduto', () => {
  assert.equal(R.paymentState(payment({ dueDate: TODAY }), TODAY), 'due');
  assert.equal(R.paymentState(payment({ dueDate: '2026-09-18' }), TODAY), 'due');
  assert.equal(R.paymentState(payment({ status: 'overdue', dueDate: '2026-09-18' }), TODAY), 'due');
  assert.equal(R.paymentState(payment({ dueDate: '' }), TODAY), 'due');
  assert.equal(R.paymentState(payment({ status: 'refunded' }), TODAY), 'unknown');
});
test('date inesistenti non inventano mora; Timestamp usa il giorno di Roma', () => {
  assert.equal(R.paymentState(payment({ dueDate: '2026-02-31' }), TODAY), 'due');
  assert.equal(R.paymentState(payment({ dueDate: '2026-09-16' }), new Date('2026-09-16T22:30:00Z')), 'overdue');
  const time = { seconds: Date.parse('2026-09-16T22:30:00Z') / 1000 };
  assert.equal(R.paymentState(payment({ dueDate: time }), TODAY), 'due');
});
test('canPay supporta saldo deposito, esclude importi zero o invalidi', () => {
  assert.equal(R.canPay(payment({ type: 'deposit-balance' }), TODAY), true);
  assert.equal(R.canPay(payment({ amount: 0 }), TODAY), false);
  assert.equal(R.canPay(payment({ amount: 'NaN' }), TODAY), false);
});
test('uno stato rata mancante/sconosciuto non autorizza mai un addebito', () => {
  for (const status of [undefined, '', 'boh', 'refunded', 'draft', 'sent']) {
    assert.equal(R.paymentBlockReason(payment({ status })), 'payment_not_payable');
    assert.equal(R.paymentState(payment({ status }), TODAY), 'unknown');
  }
  assert.equal(R.paymentBlockReason({ status: 'sent' }, 'inv'), '');
  assert.equal(R.paymentBlockReason({}, 'inv'), '');
  assert.equal(R.paymentBlockReason({ paidDate: TODAY }, 'inv'), 'payment_not_payable');
  assert.equal(R.paymentBlockReason({ status: 'draft' }, 'inv'), 'payment_not_payable');
});

test('il canone legacy senza tipo rimane canone; tipi espliciti diversi sono separati', () => {
  for (const type of [undefined, '', 'rent', 'canone', 'rent-installment', 'monthly-rent']) assert.equal(R.isRentPayment({ type }), true);
  for (const type of ['deposit-balance', 'deposit', 'service-fee', 'utilities', 'rent-insurance', 'unknown']) assert.equal(R.isRentPayment({ type }), false);
});
test('deposito e altri addebiti non gonfiano canoni incassati o da ricevere', () => {
  const v = overview({ payments: [payment({ status: 'paid', amount: 900 }), payment({ id: 'deposit', type: 'deposit-balance', status: 'paid', amount: 1800 }), payment({ id: 'other', type: 'utilities', amount: 50 })] });
  assert.equal(v.totals.paid, 900);
  assert.equal(v.totals.due, 0);
  assert.equal(v.totals.other, 1850);
  assert.equal(v.units.find(u => u.propertyId === 'p1').otherPayments.length, 2);
});
test('totali separano incassato, da ricevere, scaduto, elaborazione e segnalazione', () => {
  const v = overview({ payments: [
    payment({ id: 'paid', status: 'paid', amount: 100 }),
    payment({ id: 'due', dueDate: '2026-10-05', month: '2026-10', amount: 200 }),
    payment({ id: 'late', amount: 300 }),
    payment({ id: 'process', amount: 400, sddPiId: 'pi_x' }),
    payment({ id: 'report', amount: 500, tenantReported: true }),
    payment({ id: 'cancel', amount: 600, status: 'cancelled' }),
    payment({ id: 'unknown', amount: 700, status: 'other' })
  ] });
  assert.equal(v.totals.paid, 100);
  assert.equal(v.totals.pending, 500);
  assert.equal(v.totals.overdue, 300);
  assert.equal(v.totals.processing, 400);
  assert.equal(v.totals.reported, 500);
  assert.equal(v.totals.due, 1400);
  assert.equal(v.totals.unknownStateCount, 1);
  assert.equal(v.totals.pending + v.totals.processing + v.totals.reported, v.totals.due);
});

test('tutti gli immobili gestiti esistono anche senza rate o contratto attivo', () => {
  const v = overview();
  assert.equal(v.units.length, 2);
  assert.equal(v.units.find(u => u.propertyId === 'p2').noInstallments, true);
  assert.equal(v.units.find(u => u.propertyId === 'p2').totals.due, 0);
});
test('contratti attivi senza immobile o rate restano visibili senza inventare importi', () => {
  const v = overview({ properties: [], contracts: [{ id: 'c1', status: 'active', tenantName: 'Anna', rent: 999 }, { id: 'c2', status: 'active', propertyId: 'missing', propertyName: 'Casa nota' }, { id: 'c3', status: 'expired' }], payments: [] });
  assert.equal(v.units.length, 2);
  assert.ok(v.units.find(u => u.id === 'contract:c1'));
  assert.equal(v.units.find(u => u.propertyId === 'missing').label, 'Casa nota');
  assert.equal(v.totals.due, 0);
  assert.equal(v.counts.noInstallments, 2);
});
test('collegamenti diretti funzionano anche senza contratto', () => {
  const v = overview({ contracts: [], payments: [payment({ contractId: '' })] });
  assert.equal(v.payments[0].propertyName, 'Unità Roma');
  assert.equal(v.payments[0].tenantName, 'Anna Rossi');
});
test('rata legacy senza ID diretti risale a immobile e inquilino del contratto', () => {
  const row = overview({ payments: [payment({ propertyId: '', tenantId: '' })] }).payments[0];
  assert.equal(row.propertyId, 'p1');
  assert.equal(row.tenantId, 't1');
  assert.equal(row.tenantName, 'Anna Rossi');
});
test('gli ID diretti prevalgono e non attribuiscono un nome dal contratto incompatibile', () => {
  const v = overview({ contracts: [{ id: 'c1', status: 'active', propertyId: 'p1', tenantId: 't1', propertyName: 'Vecchia casa', tenantName: 'Vecchio inquilino' }], payments: [payment({ propertyId: 'missing-p', tenantId: 'missing-t' })] });
  const row = v.payments[0];
  assert.equal(row.propertyId, 'missing-p');
  assert.equal(row.tenantId, 'missing-t');
  assert.ok(!row.propertyName.includes('Vecchia casa'));
  assert.ok(!row.tenantName.includes('Vecchio inquilino'));
  assert.equal(row.unlinked, true);
});
test('rate orfane, contratto mancante e pagamenti senza ID rimangono in elenco', () => {
  const v = overview({ payments: [payment({ id: 'orphan', contractId: 'lost', propertyId: '', tenantId: '' }), payment({ id: '', propertyId: 'p1' })] });
  assert.equal(v.payments.length, 2);
  assert.equal(v.units.find(u => u.id === 'unlinked').payments[0].id, 'orphan');
  assert.equal(v.payments.find(p => p.id.startsWith('missing-id:')).canPay, false);
});
test('il mese usa competenza esplicita e poi scadenza, senza usare paidDate', () => {
  const v = overview({ month: '2026-09', payments: [payment({ id: 'a', month: '2026-08', paidDate: '2026-09-05' }), payment({ id: 'b', month: '', dueDate: '2026-09-10' }), payment({ id: 'c', month: '2026-13', dueDate: '2026-09-11' })] });
  assert.deepEqual(v.payments.map(p => p.id), ['b', 'c']);
  assert.deepEqual(v.months, ['2026-09', '2026-08']);
});
test('rata senza mese/data resta visibile nel filtro mese ed è dichiarata', () => {
  const v = overview({ month: '2026-09', payments: [payment({ month: '', dueDate: '' })] });
  assert.equal(v.payments.length, 1);
  assert.equal(v.counts.unknownMonth, 1);
});
test('mese invalido equivale a tutti; filtro vuoti significa nessun canone nel periodo', () => {
  assert.equal(overview({ month: '2026-13' }).payments.length, 1);
  const v = overview({ month: '2026-10', status: 'empty' });
  assert.equal(v.units.length, 2);
  assert.equal(v.counts.noInstallments, 2);
  assert.equal(v.totals.due, 0);
});
test('ricerca per casa, indirizzo e inquilino non distingue accenti e maiuscole', () => {
  assert.equal(overview({ search: 'UNITA ROMA' }).units.length, 1);
  assert.equal(overview({ search: 'via roma' }).units.length, 1);
  assert.equal(overview({ search: 'ANNA' }).units.length, 1);
  assert.equal(overview({ search: 'inesistente' }).units.length, 0);
});
test('filtro pending include scaduto ma esclude SEPA e segnalato; totali seguono filtro', () => {
  const v = overview({ status: 'pending', payments: [payment({ id: 'late', amount: 100 }), payment({ id: 'future', dueDate: '2026-10-01', amount: 200 }), payment({ id: 'sdd', sddPiId: 'pi', amount: 300 }), payment({ id: 'reported', tenantReported: true, amount: 400 })] });
  assert.deepEqual(v.payments.map(p => p.id), ['late', 'future']);
  assert.equal(v.totals.due, 300);
  assert.equal(v.counts.pending, 2);
});
test('filtro outstanding comprende esattamente gli stati del totale da incassare', () => {
  const payments = [payment({ id: 'late', amount: 100 }), payment({ id: 'future', dueDate: '2026-10-01', amount: 200 }), payment({ id: 'sdd', sddPiId: 'pi', amount: 300 }), payment({ id: 'reported', tenantReported: true, amount: 400 }), payment({ id: 'paid', status: 'paid', amount: 500 })];
  const v = overview({ status: 'outstanding', payments });
  assert.equal(v.payments.length, 4);
  assert.equal(v.totals.due, overview({ payments }).totals.due);
  assert.equal(v.totals.due, 1000);
  assert.equal(v.totals.paid, 0);
});
test('input congelato non viene mutato, neppure da ordinamenti e filtri', () => {
  const data = freeze({ now: TODAY, month: '2026-09', status: 'all', properties: [{ id: 'p1', name: 'Casa' }], contracts: [{ id: 'c1', propertyId: 'p1', status: 'active' }], users: [], payments: [payment({ id: 'b' }), payment({ id: 'a' })] });
  const before = JSON.stringify(data);
  R.overview(data);
  R.businessInvoices(freeze([{ paymentId: 'p' }, { service: 'Gestione' }]));
  assert.equal(JSON.stringify(data), before);
});

test('ricevute canone/deposito collegate non sono ricavi aziendali', () => {
  assert.equal(R.isRentReceipt({ paymentId: 'r1' }), true);
  assert.equal(R.isRentReceipt({ documentType: 'rent-receipt' }), true);
  assert.equal(R.isRentReceipt({ kind: 'deposit-receipt' }), true);
  assert.equal(R.isRentReceipt({ service: 'Canone locazione 2026-09', description: 'Ricevuta canone di locazione · Roma · 2026-09' }), true);
});
test('una fattura di servizio BOOM che menziona affitti resta un ricavo', () => {
  for (const i of [{ service: 'Gestione canone locazione', amount: 120 }, { service: 'Canone locazione 2026-09', description: 'Commissione gestione', amount: 120 }, { service: 'Rent assistance', amount: 120 }, { paymentId: '', service: 'PFS' }]) assert.equal(R.isRentReceipt(i), false);
  const service = { id: 'fee', service: 'Gestione canone', amount: 120 };
  assert.deepEqual(R.businessInvoices([{ id: 'rent', paymentId: 'r1', amount: 1200 }, service, { id: 'dep', kind: 'deposit-receipt', amount: 2400 }]), [service]);
});

test('incassi agenzia: anno civile di Roma per istanti, Timestamp e date registrate', () => {
  const instant = '2025-12-31T23:30:00Z';
  const rows = freeze([
    payment({ status:'paid', amount:100, paidAt:instant, serviceFeeEur:2, stripeCostEur:1 }),
    payment({ status:'paid', amount:200, paidDate:{ seconds:Date.parse(instant)/1000 }, serviceFeeEur:2, stripeCostEur:1 }),
    payment({ status:'paid', amount:300, paidDate:{ toDate:()=>new Date(instant) }, serviceFeeEur:2, stripeCostEur:1 }),
    payment({ status:'paid', amount:400, paidDate:'2025-12-31', serviceFeeEur:2, stripeCostEur:1 }),
    payment({ status:'paid', amount:999, paidDate:'2026-02-31', serviceFeeEur:99, stripeCostEur:0 })
  ]);
  assert.equal(R.agencyCollections(rows,2026).ownerRent,600);
  assert.equal(R.agencyCollections(rows,2026).fees,6);
  assert.equal(R.agencyCollections(rows,2025).ownerRent,400);
  assert.equal(R.agencyCollections(rows,2026).knownMargin,3);
});
test('incassi agenzia: capitale, cauzione, compenso effettivo e costi restano distinti', () => {
  const rows = freeze([
    payment({ status:'paid', amount:'1000.50', paidDate:TODAY, paidVia:'stripe', serviceFeeEur:10, stripeCostEur:12 }),
    payment({ status:'paid', type:'deposit-balance', amount:2000, paidDate:TODAY, paidVia:'sepa', serviceFeeEur:3 }),
    payment({ status:'pending', amount:999, paidDate:TODAY, sddFeeEur:99, serviceFeeEur:99 }),
    payment({ status:'paid', type:'utilities', amount:50, paidDate:TODAY, paidVia:'stripe' })
  ]);
  const before = JSON.stringify(rows), b = R.agencyCollections(rows,2026);
  assert.equal(b.ownerRent,1000.5); assert.equal(b.deposits,2000); assert.equal(b.otherCharges,50);
  assert.equal(b.fees,13); assert.equal(b.cardFees,10); assert.equal(b.sepaFees,3);
  assert.equal(b.knownCosts,12); assert.equal(b.knownMargin,-2);
  assert.equal(b.unknownFeeCount,1); assert.equal(b.unknownCostCount,1);
  assert.equal(JSON.stringify(rows),before);
});

// Delicate invariants are exercised against purposeful mutations, not just
// source-text assertions: restoring the defects must fail the same behavior.
function mutant(from, to) {
  assert.ok(source.includes(from), 'mutation target exists');
  const context = { module: { exports: {} } };
  vm.runInNewContext(source.replace(from, to), context);
  return context.module.exports;
}
test('mutazione: senza guardia SEPA il test sul doppio addebito cade', () => {
  const m = mutant("if (blocked) return 'processing';", "if (false) return 'processing';");
  assert.throws(() => assert.equal(m.paymentState(payment({ sddPiId: 'pi' }), TODAY), 'processing'));
});
test('mutazione: trattare ogni addebito come canone rompe i totali', () => {
  const m = mutant("if (!row.isRent) {", 'if (false) {');
  assert.throws(() => assert.equal(m.overview({ now: TODAY, payments: [payment({ type: 'deposit-balance', status: 'paid' })] }).totals.paid, 0));
});
test('mutazione: reinserire ricevute nei ricavi aziendali viene intercettato', () => {
  const m = mutant('return !isRentReceipt(i);', 'return true;');
  assert.throws(() => assert.equal(m.businessInvoices([{ paymentId: 'p1', amount: 1200 }]).length, 0));
});
test('mutazione: perdere il contratto di ripiego lascia la rata orfana e cade', () => {
  const m = mutant('str(p.propertyId) || str(contract && contract.propertyId)', 'str(p.propertyId)');
  assert.throws(() => assert.equal(m.overview({ now: TODAY, properties: [{ id: 'p1' }], contracts: [{ id: 'c1', propertyId: 'p1' }], payments: [payment({ propertyId: '' })] }).payments[0].propertyId, 'p1'));
});

console.log(`\n${checks} verifiche canoni superate; nessuna rete o scrittura finanziaria.`);
