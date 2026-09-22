// Fiscal engine unit tests. Run: node tests/fiscal/test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../../js/fiscal-engine.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { failed++; console.log('  \x1b[31m✗ ' + name + '\x1b[0m'); }
}
function find(arr, key) { return arr.find(o => o.key === key || o.key.startsWith(key)); }

console.log('\n\x1b[1mFiscal engine\x1b[0m\n');

// ── contractObligations ──────────────────────────────────────────────
console.log('contractObligations');
const cOrdinario = { id: 'c1', type: 'transitorio', rent: 1000, startDate: '2024-01-01', endDate: '2026-01-01', cedolare: false };
const obl1 = F.contractObligations(cOrdinario, { id: 'p1' }, 2025);

const rli = find(obl1, 'rli_');
ok('RLI emitted', !!rli);
ok('RLI due 30 days after start', rli.dueDate === '2024-01-31');
ok('RLI ordinario has registro amount (2% of 12000 + bollo)', rli.amount === 1000 * 12 * 0.02 + 16);

const reg = find(obl1, 'registro_annuale_');
ok('registro annuale emitted for multi-year non-cedolare', !!reg);
ok('registro annuale = 2% of annual rent', reg.amount === 240);

const istat = find(obl1, 'istat_');
ok('ISTAT reminder emitted (non-cedolare)', !!istat);
ok('ISTAT amount is null (needs published %)', istat.amount === null);

ok('contract expiry emitted', !!find(obl1, 'scadenza_'));
ok('notice window emitted', !!find(obl1, 'disdetta_'));
const disd = find(obl1, 'disdetta_');
ok('transitorio notice 3 months before end', disd.dueDate === '2025-10-01');

// Calendar dates must not change with the machine's zone or a DST boundary.
const previousTZ = process.env.TZ;
try {
  for (const zone of ['UTC', 'Europe/Rome', 'America/Los_Angeles']) {
    process.env.TZ = zone;
    const obligations = F.contractObligations(cOrdinario, { id: 'p1' }, 2025);
    ok(zone + ': notice and yearly anniversaries preserve their calendar day',
      find(obligations, 'disdetta_').dueDate === '2025-10-01'
      && find(obligations, 'registro_annuale_').dueDate === '2025-01-31'
      && find(obligations, 'istat_').dueDate === '2025-01-01');
    const monthEnd = F.contractObligations({ ...cOrdinario, endDate: '2025-05-31' }, { id: 'p1' }, 2025);
    ok(zone + ': end-of-month keeps the previous UTC overflow, without clamping',
      find(monthEnd, 'disdetta_').dueDate === '2025-03-03');
    const timestamp = F.contractObligations({ ...cOrdinario,
      startDate: new Date('2024-01-01T00:30:00+02:00'), endDate: '2026-01-01T00:30:00+02:00' }, { id: 'p1' }, 2025);
    ok(zone + ': Date and offset timestamps retain their existing ISO UTC day',
      find(timestamp, 'rli_').dueDate === '2024-01-30'
      && find(timestamp, 'scadenza_').dueDate === '2025-12-31'
      && find(timestamp, 'istat_').dueDate === '2025-12-31');
    for (const [startDate, expected] of [['2025-03-01', '2025-03-31'], ['2025-10-15', '2025-11-14'],
      ['2024-02-01', '2024-03-02'], ['2025-12-15', '2026-01-14']]) {
      const values = F.contractObligations({ ...cOrdinario, startDate, endDate: '2028-01-01' }, { id: 'p1' }, 2025);
      ok(zone + ': calendar +30 days from ' + startDate, find(values, 'rli_').dueDate === expected);
    }
  }
} finally {
  if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ;
}

// Cedolare contract: no registro, no ISTAT, RLI amount 0
const cCedolare = { id: 'c2', type: 'concordato', rent: 1000, startDate: '2024-01-01', endDate: '2028-01-01', cedolare: true };
const obl2 = F.contractObligations(cCedolare, { id: 'p1' }, 2025);
ok('cedolare RLI amount is 0 (esente)', find(obl2, 'rli_').amount === 0);
ok('cedolare → NO registro annuale', !find(obl2, 'registro_annuale_'));
ok('cedolare → NO ISTAT', !find(obl2, 'istat_'));

// ── propertyObligations (IMU) ────────────────────────────────────────
console.log('\npropertyObligations (IMU)');
const imu = F.propertyObligations({ id: 'p1' }, 2025);
ok('IMU acconto emitted', !!find(imu, 'imu_acconto_'));
ok('IMU acconto due 16 June', find(imu, 'imu_acconto_').dueDate === '2025-06-16');
ok('IMU saldo due 16 Dec', find(imu, 'imu_saldo_').dueDate === '2025-12-16');
ok('IMU amount null without rendita', find(imu, 'imu_acconto_').amount === null);
const imuR = F.propertyObligations({ id: 'p2', rendita: 1000 }, 2025);
ok('IMU amount computed with rendita', find(imuR, 'imu_acconto_').amount > 0);
ok('IMU acconto = half of annual estimate', Math.abs(find(imuR, 'imu_acconto_').amount - find(imuR, 'imu_saldo_').amount) < 0.01);

// ── companyObligations (Egidi) ───────────────────────────────────────
console.log('\ncompanyObligations (Egidi)');
const co = F.companyObligations(2025, { 1: 10000, 2: 5000, 3: 0, 4: 8000 });
const q1 = find(co, 'iva_q1_');
ok('IVA Q1 emitted', !!q1);
ok('IVA Q1 = 22% of 10000 = 2200', q1.amount === 2200);
ok('IVA Q1 due 16 May', q1.dueDate === '2025-05-16');
ok('IVA Q4 due Feb next year', find(co, 'iva_q4_').dueDate === '2026-02-16');
ok('IVA Q3 zero revenue → low severity', find(co, 'iva_q3_').severity === 'low');
ok('LIPE emitted', !!find(co, 'lipe_q1_'));
ok('CCIAA diritto annuale emitted', !!find(co, 'cciaa_'));
ok('Redditi SC emitted', !!find(co, 'redditi_sc_'));

// ── rollup ───────────────────────────────────────────────────────────
console.log('\nrollup');
const today = new Date('2025-06-01');
const sample = [
  { key: 'a', dueDate: '2025-05-01', amount: 100 },   // overdue
  { key: 'b', dueDate: '2025-06-16', amount: 200 },   // dueSoon (15d)
  { key: 'c', dueDate: '2025-08-01', amount: null },  // thisQuarter
  { key: 'd', dueDate: '2025-12-01', amount: 500 },   // later
  { key: 'e', dueDate: null, amount: 50 },            // noDate
].map(o => ({ amount: null, ...o }));
const r = F.rollup(sample, today);
ok('overdue bucket has the past item', r.buckets.overdue.length === 1 && r.buckets.overdue[0].key === 'a');
ok('dueSoon bucket (<=30d)', r.buckets.dueSoon.length === 1 && r.buckets.dueSoon[0].key === 'b');
ok('thisQuarter bucket', r.buckets.thisQuarter.some(o => o.key === 'c'));
ok('later bucket', r.buckets.later.some(o => o.key === 'd'));
ok('noDate bucket', r.buckets.noDate.some(o => o.key === 'e'));
ok('totalDue sums known amounts', r.totalDue === 100 + 200 + 500 + 50);
ok('counts.overdue correct', r.counts.overdue === 1);

// ── landlordObligations integration ──────────────────────────────────
console.log('\nlandlordObligations (integration)');
const all = F.landlordObligations({
  properties: [{ id: 'p1' }, { id: 'p2' }],
  contracts: [cOrdinario, { ...cCedolare, propertyId: 'p2' }],
  fiscalYear: 2025,
});
ok('aggregates property + contract obligations', all.length > 6);
ok('every obligation has a key + category', all.every(o => o.key && o.category));
ok('parties are landlord (no company here)', all.every(o => o.party === 'landlord'));

console.log('\n' + '─'.repeat(48));
console.log('\x1b[1mResult: ' + passed + ' passed, ' + failed + ' failed\x1b[0m');
if (failed) process.exit(1);
console.log('\x1b[32mFiscal engine behaves as intended.\x1b[0m');
