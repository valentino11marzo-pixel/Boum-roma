import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const B = require('../../js/behavior-engine.js');
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

let passed = 0;
function ok(name, fn) { fn(); passed += 1; console.log('  ✓ ' + name); }
function row(overrides = {}) {
  return Object.assign({
    schema: 1, consent: true, pageViewId: 'aaaaaaaaaaaaaaaa', sessionId: 'ssssssssssssssss',
    pagePath: '/property-finding', pageTitle: 'Property Finding', service: 'property_finding',
    source: { channel: 'google', landing: '/property-finding' }, activeSeconds: 18, scrollMax: 35,
    exitType: 'close_or_background', lastSection: 'proof', startedAt: '2026-10-07T10:00:00.000Z',
    sections: [{ id: 'proof', label: 'How it works', viewedMs: 15000, firstAt: 4 }],
    interactions: []
  }, overrides);
}

console.log('\nBehavior Intelligence');

ok('normalizza e limita il payload senza conservare PII o query', () => {
  const x = B.normalizeJourney(Object.assign(row(), {
    pagePath: '/property-finding?email=person@example.com#x', email: 'person@example.com', phone: '+39000', ip: '1.2.3.4',
    activeSeconds: 99999, scrollMax: 999, interactions: [{ kind: 'lead', label: 'Send', target: '/thanks?email=x', value: 'secret' }]
  }), new Date('2026-10-07T12:00:00.000Z'));
  assert.equal(x.pagePath, '/property-finding');
  assert.equal(x.activeSeconds, 1800); assert.equal(x.scrollMax, 100);
  assert.equal(x.interactions[0].target, '/thanks');
  assert.equal(x.email, undefined); assert.equal(x.phone, undefined); assert.equal(x.ip, undefined);
  assert.equal(x.interactions[0].value, undefined);
  assert.equal(x.expiresAt.toISOString(), '2027-01-05T12:00:00.000Z');
});

ok('rifiuta assenza di consenso e identificatori non validi', () => {
  assert.equal(B.normalizeJourney(row({ consent: false }), new Date()), null);
  assert.equal(B.normalizeJourney(row({ pageViewId: 'short' }), new Date()), null);
});

ok('ricostruisce pagine, sezioni, uscite e percorso senza doppio conteggio', () => {
  const data = B.summarize([
    row({ pageViewId: 'aaaaaaaaaaaaaaa1', exitType: 'navigate_internal', startedAt: '2026-10-07T10:00:00Z' }),
    row({ pageViewId: 'aaaaaaaaaaaaaaa2', pagePath: '/deal-assistance', service: 'deal_assistance', startedAt: '2026-10-07T10:02:00Z', interactions: [{ kind: 'checkout', label: 'Start', target: '/deal-assistance' }] }),
    row({ pageViewId: 'bbbbbbbbbbbbbbb1', sessionId: 'tttttttttttttttt', activeSeconds: 20 }),
    row({ pageViewId: 'ccccccccccccccc1', sessionId: 'uuuuuuuuuuuuuuuu', activeSeconds: 22 })
  ]);
  assert.equal(data.totals.pageViews, 4); assert.equal(data.totals.sessions, 3);
  assert.equal(data.totals.exitRate, 75); assert.equal(data.totals.conversions, 1);
  assert.ok(data.flows.some(x => x.path === '/property-finding → /deal-assistance' && x.sessions === 1));
  assert.ok(data.sections.some(x => x.sectionId === 'proof' && x.avgDwellSeconds === 15));
  const enoughEvidence = B.summarize(Array.from({ length: 8 }, (_, i) => row({
    pageViewId: 'ddddddddddddddd' + i, sessionId: 'vvvvvvvvvvvvvvv' + i
  })));
  assert.ok(enoughEvidence.recommendations.some(x => x.pagePath === '/property-finding'));
});

ok('copre con consenso e behavior tracker ogni file canonico della sitemap', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>https:\/\/www\.boomrome\.com([^<]*)<\/loc>/g)].map(x => x[1].split('?')[0]);
  assert.equal(urls.length, 68);
  for (const u of urls) {
    let file = u === '/' ? 'index.html' : u.startsWith('/listing/') ? 'apartment-detail.html'
      : u === '/apartments-in' ? 'apartments-in/index.html'
      : u.startsWith('/apartments-in/') ? u.slice(1) + '.html' : u.slice(1) + '.html';
    const html = read(file);
    assert.match(html, /\/js\/boom-consent\.js/, file + ' consent');
    assert.match(html, /\/js\/boom-track\.js/, file + ' tracker');
    assert.equal((html.match(/\/js\/boom-consent\.js/g) || []).length, 1, file + ' duplicate consent');
    assert.equal((html.match(/\/js\/boom-track\.js/g) || []).length, 1, file + ' duplicate tracker');
  }
});

ok('il tracker parte solo col consenso e non ascolta i campi digitati', () => {
  const src = read('js/boom-track.js');
  assert.match(src, /boom-consent-granted/); assert.match(src, /navigator\.doNotTrack/);
  assert.match(src, /boom-consent-denied/); assert.match(src, /!allowed \|\| !hasConsent\(\)/);
  assert.match(src, /typeof window\.boomTrack !== 'function'/);
  assert.doesNotMatch(src, /addEventListener\(['"](?:input|change|keydown|keyup)['"]/);
  assert.doesNotMatch(src, /FormData\(/);
});

ok('raccolta, dashboard, retention e Firestore restano sulle rotaie private', () => {
  const collect = read('api/analytics/collect.js'), summary = read('api/analytics/summary.js');
  const rules = read('firestore.rules'), vercel = JSON.parse(read('vercel.json')), dashboard = read('behavior.html');
  const portal = read('js/portal-app.js');
  assert.match(collect, /BEHAVIOR\.normalizeJourney/); assert.doesNotMatch(collect, /req\.headers\[['"]user-agent['"]\]/i);
  assert.match(summary, /requireRole\(req, res, \['admin'\]\)/);
  assert.match(rules, /match \/webJourneys\/\{x\}[^\n]+isAdmin/);
  assert.ok(vercel.rewrites.some(x => x.source === '/behavior' && x.destination === '/behavior.html'));
  assert.ok(vercel.crons.some(x => x.path === '/api/analytics/cleanup'));
  assert.match(dashboard, /role!=='admin'/); assert.match(dashboard, /noindex,nofollow,noarchive/);
  assert.match(dashboard, /onIdTokenChanged/); assert.match(dashboard, /getIdToken\(!!forceRefresh\)/);
  assert.match(dashboard, /r\.status===401&&!forceRefresh/); assert.match(dashboard, /requestSummary\(true\)/);
  assert.match(dashboard, /Sessione scaduta/); assert.doesNotMatch(dashboard, /Dati non disponibili: ['"]\+e\.message/);
  assert.match(portal, /window\.open\('\/behavior','_blank'\)/);
});

console.log('\n' + passed + ' behavior checks passed.');
