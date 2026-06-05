// TaxPack engine unit tests. Run: node tests/taxpack/test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../../js/taxpack-engine.js');

let passed = 0, failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { failed++; console.log('  \x1b[31m✗ ' + name + '\x1b[0m  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }

console.log('\n\x1b[1mTaxPack engine\x1b[0m\n');

// ── classifyContract ─────────────────────────────────────────────────
console.log('classifyContract');
ok('cedolare flag from boolean', T.classifyContract({ cedolare: true }).isCedolare);
ok('cedolare flag from regime text', T.classifyContract({ taxRegime: 'Cedolare secca 21%' }).isCedolare);
ok('concordato from 3+2', T.classifyContract({ regime: '3+2 concordato' }).isConcordato);
ok('studenti type', T.classifyContract({ type: 'studenti' }).isStudenti);
ok('short-let', T.classifyContract({ type: 'breve' }).isShortLet);
ok('foreign tenant from nationality', T.classifyContract({ tenantNationality: 'Spagnola' }).foreignTenant);
ok('italian tenant not foreign', !T.classifyContract({ tenantNationality: 'Italiana' }).foreignTenant);

// ── monthsActiveInYear ───────────────────────────────────────────────
console.log('\nmonthsActiveInYear');
eq('full year', T.monthsActiveInYear({ startDate: '2024-06-01', endDate: '2026-06-01' }, 2025), 12);
eq('mid-year start', T.monthsActiveInYear({ startDate: '2025-04-10', endDate: '2027-04-10' }, 2025), 9); // Apr..Dec
eq('ended mid-year', T.monthsActiveInYear({ startDate: '2024-01-01', endDate: '2025-03-31' }, 2025), 3); // Jan..Mar
eq('not active that year', T.monthsActiveInYear({ startDate: '2026-01-01', endDate: '2027-01-01' }, 2025), 0);

// ── computeTotals ────────────────────────────────────────────────────
console.log('\ncomputeTotals');
const payments2025 = [
  { month: '2025-01', amount: 1000, status: 'paid' },
  { month: '2025-02', amount: 1000, status: 'paid' },
  { month: '2025-03', amount: 1000, status: 'pending' },
  { month: '2024-12', amount: 1000, status: 'paid' }, // prior year, excluded
];
const totalsCedolare = T.computeTotals({
  contract: { cedolare: true, startDate: '2025-01-01', endDate: '2025-12-31' },
  payments: payments2025, fiscalYear: 2025
});
eq('canoni incassati (2 paid in-year)', totalsCedolare.canoniIncassati, 2000);
eq('canoni attesi (3 in-year)', totalsCedolare.canoniAttesi, 3000);
eq('outstanding', totalsCedolare.outstanding, 1000);
eq('cedolare 21% on 2000', totalsCedolare.cedolareImposta, 420);
eq('regime label', totalsCedolare.regime, 'cedolare_21');

const totalsConcordato = T.computeTotals({
  contract: { cedolare: true, concordato: true }, payments: payments2025, fiscalYear: 2025
});
eq('cedolare 10% concordato on 2000', totalsConcordato.cedolareImposta, 200);

const totalsOrdinario = T.computeTotals({
  contract: { cedolare: false }, payments: payments2025, fiscalYear: 2025
});
eq('ordinario imponibile 95% of 2000', totalsOrdinario.irpefImponibile, 1900);
eq('ordinario has no cedolare imposta', totalsOrdinario.cedolareImposta, 0);

// ── compareCedolare ──────────────────────────────────────────────────
console.log('\ncompareCedolare');
const cmp = T.compareCedolare(12000, 0.35, false); // 12k canoni, 35% marginal
eq('cedolare 21% of 12000', cmp.cedolare, 2520);
ok('high bracket → cedolare recommended', cmp.recommended === 'cedolare');
ok('saving positive in high bracket', cmp.saving > 0);
const cmpLow = T.compareCedolare(6000, 0.23, false);
ok('low canoni still computes a recommendation', ['cedolare', 'ordinario'].includes(cmpLow.recommended));

// ── computeIstatAdjustment ───────────────────────────────────────────
console.log('\ncomputeIstatAdjustment');
const istat1 = T.computeIstatAdjustment(1000, 0.02, 0.75); // 2% annual, 75% application
eq('75% of 2% on €1000 → €15 increase', istat1.increase, 15);
eq('new rent €1015', istat1.newRent, 1015);
const istat2 = T.computeIstatAdjustment(1200, 0.018, 1.0); // 1.8%, 100%
eq('100% of 1.8% on €1200 → €21.60', istat2.increase, 21.6);
eq('new rent €1221.60', istat2.newRent, 1221.6);
const istat3 = T.computeIstatAdjustment(800, 0.025); // default 75%
eq('default applicationPct 75%', istat3.applicationPct, 0.75);
eq('75% of 2.5% on €800 → €15', istat3.increase, 15);
ok('negative variance reduces rent', T.computeIstatAdjustment(1000, -0.005, 0.75).increase < 0);
eq('zero variance → zero change', T.computeIstatAdjustment(1000, 0, 0.75).increase, 0);

// ── buildChecklist ───────────────────────────────────────────────────
console.log('\nbuildChecklist');
const contract = { id: 'c1', cedolare: true, type: 'transitorio', startDate: '2025-01-01', endDate: '2025-12-31' };
const property = { id: 'p1', name: 'Trastevere Corso 45' };
const docs = [
  { id: 'd1', propertyId: 'p1', fiscalYear: 2025, name: 'Contratto firmato', type: 'contract' },
  { id: 'd2', propertyId: 'p1', fiscalYear: 2025, name: 'Registrazione RLI', category: 'registration' },
  { id: 'd3', propertyId: 'p1', fiscalYear: 2025, name: 'Opzione cedolare secca' },
  { id: 'd4', propertyId: 'p1', fiscalYear: 2025, name: 'APE energetico' },
  { id: 'd5', propertyId: 'p1', fiscalYear: 2025, name: 'Visura catastale' },
  { id: 'd6', propertyId: 'p1', fiscalYear: 2025, name: 'Carta identità inquilino' },
];
const chk = T.buildChecklist({
  contract, property, documents: docs,
  payments: Array.from({ length: 12 }, (_, i) => ({ month: '2025-' + String(i + 1).padStart(2, '0'), amount: 1000, status: 'paid' })),
  fiscalYear: 2025
});
ok('cedolare contract → cedolare_option required & present', chk.items.find(i => i.key === 'cedolare_option')?.present);
ok('cedolare contract → NO istat requirement', !chk.items.find(i => i.key === 'istat'));
ok('cedolare contract → NO imposta_registro requirement', !chk.items.find(i => i.key === 'imposta_registro'));
ok('receipts present (12/12 paid)', chk.items.find(i => i.key === 'receipts')?.present);
eq('receipts detail', chk.items.find(i => i.key === 'receipts')?.detail, '12/12 mesi');
ok('IMU still missing (not uploaded)', chk.missing.find(i => i.key === 'imu'));
ok('completeness between 0 and 100', chk.completeness >= 0 && chk.completeness <= 100);

// Foreign tenant → cessione fabbricato required
const chkForeign = T.buildChecklist({
  contract: { id: 'c2', tenantNationality: 'Francese', startDate: '2025-01-01', endDate: '2025-12-31' },
  property, documents: [], payments: [], fiscalYear: 2025
});
ok('foreign tenant → cessione_fabbricato required', chkForeign.items.find(i => i.key === 'cessione_fabbricato'));

// Short-let → CIN required, no RLI
const chkShort = T.buildChecklist({
  contract: { id: 'c3', type: 'breve', startDate: '2025-06-01', endDate: '2025-06-30' },
  property, documents: [], payments: [], fiscalYear: 2025
});
ok('short-let → CIN required', chkShort.items.find(i => i.key === 'cin'));
ok('short-let → NO rli required', !chkShort.items.find(i => i.key === 'rli'));

// ── buildManifest ────────────────────────────────────────────────────
console.log('\nbuildManifest');
const man = T.buildManifest({ contract, property, documents: docs, fiscalYear: 2025 });
ok('manifest root names year + property', man.root.startsWith('TaxPack_2025_'));
ok('manifest has folders', Object.keys(man.folders).length > 0);
ok('contract folder holds the contract doc id', (man.folders['01_Contratto'] || []).includes('d1'));

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(48));
console.log('\x1b[1mResult: ' + passed + ' passed, ' + failed + ' failed\x1b[0m');
if (failed) process.exit(1);
console.log('\x1b[32mTaxPack engine behaves as intended.\x1b[0m');
