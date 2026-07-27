// Test unitari del sync Google Analytics. Run: node tests/analytics/test.mjs
// Copre le parti pure di api/analytics/_ga.js: tidyReport (risposta GA →
// righe piatte), assembleSnapshot (righe → doc webAnalytics) e b64url.
import { tidyReport, assembleSnapshot, snapshotSpecs, b64url, romeYesterday } from '../../api/analytics/_ga.js';

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { failed++; console.log('  \x1b[31m✗ ' + name + '\x1b[0m'); }
}

console.log('\n\x1b[1mGoogle Analytics sync\x1b[0m\n');

// ── tidyReport ───────────────────────────────────────────────────────
console.log('tidyReport');
const resp = {
  dimensionHeaders: [{ name: 'pagePath' }],
  metricHeaders: [{ name: 'screenPageViews', type: 'TYPE_INTEGER' }, { name: 'engagementRate', type: 'TYPE_FLOAT' }],
  rows: [
    { dimensionValues: [{ value: '/apartments' }], metricValues: [{ value: '142' }, { value: '0.6812' }] },
    { dimensionValues: [{ value: '/' }], metricValues: [{ value: '98' }, { value: '0.51' }] },
  ],
};
const rows = tidyReport(resp);
ok('2 righe', rows.length === 2);
ok('dimensione stringa', rows[0].pagePath === '/apartments');
ok('metrica numerica coercita', rows[0].screenPageViews === 142);
ok('float preservato', Math.abs(rows[0].engagementRate - 0.6812) < 1e-9);
ok('risposta vuota → []', tidyReport({}).length === 0 && tidyReport(null).length === 0);

// Multi-range: GA aggiunge la dimensione dateRange da solo
const multi = {
  dimensionHeaders: [{ name: 'dateRange' }],
  metricHeaders: [{ name: 'activeUsers' }],
  rows: [
    { dimensionValues: [{ value: 'ieri' }], metricValues: [{ value: '12' }] },
    { dimensionValues: [{ value: 'g7' }], metricValues: [{ value: '80' }] },
  ],
};
const mrows = tidyReport(multi);
ok('dateRange come dimensione', mrows.find(r => r.dateRange === 'g7')?.activeUsers === 80);

// ── assembleSnapshot ─────────────────────────────────────────────────
console.log('assembleSnapshot');
const snap = assembleSnapshot({
  totali: [
    { dateRange: 'ieri', activeUsers: 12, newUsers: 9, sessions: 15, screenPageViews: 40, engagementRate: 0.685, averageSessionDuration: 92.4 },
    { dateRange: 'g7', activeUsers: 80, newUsers: 60, sessions: 110, screenPageViews: 300, engagementRate: 0.61, averageSessionDuration: 75 },
    { dateRange: 'g28', activeUsers: 310, newUsers: 240, sessions: 420, screenPageViews: 1200, engagementRate: 0.6, averageSessionDuration: 70 },
  ],
  trend14: [{ date: '20260726', activeUsers: 12, sessions: 15, screenPageViews: 40 }],
  pagine: Array.from({ length: 20 }, (_, i) => ({ pagePath: '/p' + i, screenPageViews: 20 - i, activeUsers: 10 })),
  sorgenti: [{ sessionSource: 'google', sessionMedium: 'organic', sessions: 50, activeUsers: 40 }],
  paesi: [{ country: 'Italy', activeUsers: 30, sessions: 40 }],
  citta: [{ city: '(not set)', activeUsers: 9 }, { city: 'Rome', activeUsers: 22 }],
  dispositivi: [{ deviceCategory: 'mobile', activeUsers: 55 }],
  eventi: [{ eventName: 'page_view', eventCount: 300 }],
});
ok('ieri.utenti', snap.ieri.utenti === 12);
ok('g7.sessioni', snap.g7.sessioni === 110);
ok('g28.utenti', snap.g28.utenti === 310);
ok('engagement → percentuale a 1 decimale', snap.ieri.engagementPct === 68.5);
ok('durata arrotondata ai secondi', snap.ieri.durataMediaSec === 92);
ok('pagine cappate a 12', snap.pagine7g.length === 12);
ok('pagina mappata', snap.pagine7g[0].path === '/p0' && snap.pagine7g[0].viste === 20);
ok('sorgente/mezzo', snap.sorgenti7g[0].sorgente === 'google' && snap.sorgenti7g[0].mezzo === 'organic');
ok('(not set) filtrato dalle città', snap.citta7g.length === 1 && snap.citta7g[0].citta === 'Rome');
ok('trend14 mappato', snap.trend14[0].data === '20260726' && snap.trend14[0].utenti === 12);
ok('eventi mappati', snap.eventi7g[0].evento === 'page_view' && snap.eventi7g[0].conteggio === 300);

// Parti mancanti non fanno crashare (es. property appena creata, zero dati)
const empty = assembleSnapshot({});
ok('snapshot vuoto → zeri, non crash', empty.ieri.utenti === 0 && empty.pagine7g.length === 0);

// ── spec del snapshot ────────────────────────────────────────────────
console.log('snapshotSpecs');
const specs = snapshotSpecs();
ok('8 report', specs.length === 8);
ok('totali con 3 dateRanges in UNA chiamata', specs.find(s => s.key === 'totali').spec.dateRanges.length === 3);
ok('ogni spec ha metriche', specs.every(s => s.spec.metrics.length > 0));

// ── helpers ──────────────────────────────────────────────────────────
console.log('helpers');
ok('b64url senza padding né +/', /^[A-Za-z0-9_-]+$/.test(b64url('any?~carrier>>data')));
ok('romeYesterday formato ISO', /^\d{4}-\d{2}-\d{2}$/.test(romeYesterday()));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
