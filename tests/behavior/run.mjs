import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  // Canali (ottobre 2026): una riga per canale di primo contatto, per sessione.
  assert.ok(Array.isArray(data.channels));
  const google = data.channels.find(x => x.id === 'google');
  assert.equal(google.sessions, 3); assert.equal(google.engagedSessions, 3);
  assert.equal(google.attemptSessions, 1); assert.equal(google.conversionSessions, 0);
  assert.deepEqual(google.topLandings, [{ path: '/property-finding', sessions: 3 }]);
  const enoughEvidence = B.summarize(Array.from({ length: 8 }, (_, i) => row({
    pageViewId: 'ddddddddddddddd' + i, sessionId: 'vvvvvvvvvvvvvvv' + i
  })));
  assert.ok(enoughEvidence.recommendations.some(x => x.pagePath === '/property-finding'));
});

ok('copre con consenso e behavior tracker ogni file canonico della sitemap', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>https:\/\/www\.boomrome\.com([^<]*)<\/loc>/g)].map(x => x[1].split('?')[0]);
  // Il numero esatto lo decide la sitemap (tests/crawl); qui conta che OGNI
  // pagina dichiarata porti consenso e tracker, e che la lista non sia vuota.
  assert.ok(urls.length >= 40, 'sitemap urls: ' + urls.length);
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

ok('i canali riconoscono gli assistenti AI anche sulle righe vecchie e li mettono in testa', () => {
  const data = B.summarize([
    row({ pageViewId: 'eeeeeeeeeeeeeee1', sessionId: 'wwwwwwwwwwwwwww1', source: { channel: 'google', landing: '/' } }),
    row({ pageViewId: 'eeeeeeeeeeeeeee2', sessionId: 'wwwwwwwwwwwwwww2', source: { channel: 'google', landing: '/' } }),
    row({ pageViewId: 'eeeeeeeeeeeeeee3', sessionId: 'wwwwwwwwwwwwwww3', source: { channel: 'chatgpt.com', landing: '/faq' },
      interactions: [{ kind: 'lead', label: 'Send' }, { kind: 'conversion', label: 'Owner lead sent' }] }),
    row({ pageViewId: 'eeeeeeeeeeeeeee4', sessionId: 'wwwwwwwwwwwwwww4', source: { channel: 'google', referrerHost: 'gemini.google.com', landing: '/faq' } })
  ]);
  assert.deepEqual(data.channels.map(x => x.id), ['ai:chatgpt', 'ai:gemini', 'google']);
  const gpt = data.channels[0];
  assert.equal(gpt.engine, 'chatgpt'); assert.equal(gpt.attemptSessions, 1); assert.equal(gpt.conversionSessions, 1);
  assert.equal(data.channels[2].sessions, 2);
  const n = B.normalizeJourney(row({ source: { channel: 'ai_assistant', engine: 'perplexity', landing: '/faq' } }), new Date());
  assert.equal(n.source.engine, 'perplexity');
  assert.match(read('behavior.html'), /Canali \(incluse le AI\)/);
});

ok('un canale o una sessione che si chiama come Object.prototype non fa cadere il riepilogo', () => {
  // Il 503 su /behavior: utm_source=constructor (o __proto__, toString…) e
  // add() trovava il prototipo invece di una riga nuova; c.landings non
  // esisteva e summarize lanciava per TUTTA la finestra con quella riga.
  // Il sessionId passa ident() a 12+ caratteri: 'hasOwnProperty' cadeva già.
  const names = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'];
  const rows = names.map((c, i) => B.normalizeJourney(row({ pageViewId: 'ppppppppppppppp' + i, sessionId: 'kkkkkkkkkkkkkkk' + i,
    source: { channel: c, landing: '/owners' }, pagePath: '/owners' }), new Date()));
  for (const [i, sid] of ['hasOwnProperty', 'isPrototypeOf', '__defineGetter__', 'propertyIsEnumerable'].entries()) {
    const r = B.normalizeJourney(row({ pageViewId: 'qqqqqqqqqqqqqqq' + i, sessionId: sid }), new Date());
    assert.ok(r, sid + ' è un sessionId valido per ident()'); rows.push(r);
  }
  let data;
  assert.doesNotThrow(() => { data = B.summarize(rows); });
  for (const c of names) {
    const ch = data.channels.find(x => x.id === c);
    assert.ok(ch, 'canale ' + c);
    assert.equal(ch.sessions, 1); assert.deepEqual(ch.topLandings, [{ path: '/owners', sessions: 1 }]);
  }
  assert.equal(data.totals.sessions, 9);
  assert.equal(data.channels.find(x => x.id === 'google').sessions, 4);
  assert.equal(JSON.parse(JSON.stringify(data)).channels.length, 6);
});

// Il tracker vero in una vm: niente browser, solo document.cookie e
// localStorage finti. Serve a misurare QUANDO il primo contatto scade.
function runTracker({ ls = {}, referrer = '', now = Date.now() } = {}) {
  const m = new Map(Object.entries(ls)), cookies = [];
  const store = (map) => ({ getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) });
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  const document = { documentElement: { lang: 'en', scrollHeight: 2000 }, title: 'T', referrer, hidden: false,
    get cookie() { return cookies.length ? cookies[cookies.length - 1].split(';')[0] : ''; }, set cookie(v) { cookies.push(v); },
    querySelectorAll: () => [], addEventListener: () => {}, hasFocus: () => true };
  const ctx = { document, location: { href: 'https://www.boomrome.com/faq', search: '', hostname: 'www.boomrome.com', protocol: 'https:', origin: 'https://www.boomrome.com' },
    localStorage: store(m), sessionStorage: store(new Map()), navigator: { doNotTrack: null }, URL, URLSearchParams, Date: FakeDate,
    setTimeout: () => 0, setInterval: () => 0, addEventListener: () => {}, innerWidth: 390, innerHeight: 844, scrollY: 0,
    crypto: { getRandomValues: a => a } };
  ctx.window = ctx;
  vm.runInNewContext(read('js/boom-track.js'), ctx);
  const set = cookies.filter(c => /^boom_attr=[^;]/.test(c));
  return { ls: m, cookie: set[set.length - 1] || null, maxAge: set.length ? +/Max-Age=(\d+)/.exec(set[set.length - 1])[1] : null };
}

ok('il primo contatto scade dopo 90 giorni e il cookie non riparte a ogni pagina', () => {
  const D = 864e5, now = Date.UTC(2026, 11, 1), consent = 'all:' + (now - 10 * D);
  // 300 giorni fa da ChatGPT, oggi da Google: vince Google, il vecchio se ne va
  const old = runTracker({ now, referrer: 'https://www.google.com/', ls: { 'boom:consent': consent,
    'boom:source': JSON.stringify({ channel: 'ai_assistant', engine: 'chatgpt', landing: '/faq', at: now - 300 * D }) } });
  assert.match(old.cookie, /^boom_attr=google%20%C2%B7%20%2Ffaq;/);
  assert.equal(JSON.parse(old.ls.get('boom:source')).channel, 'google');
  // 10 giorni fa: il cookie dura quanto RESTA, 80 giorni, non 90 pieni
  const young = runTracker({ now, ls: { 'boom:consent': consent,
    'boom:source': JSON.stringify({ channel: 'google', landing: '/', at: now - 10 * D }) } });
  assert.equal(young.maxAge, 80 * 86400);
  assert.equal(JSON.parse(young.ls.get('boom:source')).at, now - 10 * D, 'la lettura non riavvia l\'orologio');
  // scaduto e navigazione interna: niente cookie, niente contatti rimasti
  const gone = runTracker({ now, referrer: 'https://www.boomrome.com/x', ls: { 'boom:consent': consent,
    'boom:source': JSON.stringify({ channel: 'google', landing: '/', at: now - 91 * D }),
    'boom:last': JSON.stringify({ channel: 'google', landing: '/', at: now - 91 * D }) } });
  assert.equal(gone.cookie, null); assert.equal(gone.ls.has('boom:source'), false); assert.equal(gone.ls.has('boom:last'), false);
  // un contatto del tracker di prima (senza `at`): vale dal consenso, mai da oggi
  const legacy = runTracker({ now, ls: { 'boom:consent': 'all:' + (now - 30 * D),
    'boom:source': JSON.stringify({ channel: 'chatgpt.com', landing: '/blog' }) } });
  assert.match(legacy.cookie, /^boom_attr=ai%3Achatgpt%20%C2%B7%20%2Fblog;/);
  assert.equal(legacy.maxAge, 60 * 86400);
  assert.equal(JSON.parse(legacy.ls.get('boom:source')).at, now - 30 * D);
  // ...e uno senza `at` letto dopo i 90 giorni dal primo tracker (7/10/2026) è scaduto comunque
  const later = Date.UTC(2027, 2, 1);
  const stale = runTracker({ now: later, referrer: 'https://www.bing.com/', ls: { 'boom:consent': 'all:' + Date.UTC(2026, 8, 1),
    'boom:source': JSON.stringify({ channel: 'chatgpt.com', landing: '/blog' }) } });
  assert.match(stale.cookie, /^boom_attr=organic_search%20%C2%B7%20%2Ffaq;/);
});

// Il tracker vero, col consenso, con gli ascoltatori catturati: si spedisce
// un submit e si guarda cosa arriva a GA4 (gtag) e a /behavior (beacon).
function submitThrough(src, form) {
  const docL = {}, winL = {}, gtag = [], beacons = [];
  const m = new Map([['boom:consent', 'all:' + (Date.now() - 864e5)]]);
  const store = (map) => ({ getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) });
  const document = { documentElement: { lang: 'en', scrollHeight: 2000 }, title: 'Casa', referrer: '', hidden: false, cookie: '',
    querySelectorAll: () => [], addEventListener: (t, f) => (docL[t] = docL[t] || []).push(f), hasFocus: () => true };
  const ctx = { document, location: { href: 'https://www.boomrome.com/listing/abc', search: '', hostname: 'www.boomrome.com', protocol: 'https:', origin: 'https://www.boomrome.com' },
    localStorage: store(m), sessionStorage: store(new Map()), URL, URLSearchParams, Date,
    navigator: { doNotTrack: null, sendBeacon: (u, b) => { beacons.push(JSON.parse(b.text)); return true; } },
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    gtag: (...a) => gtag.push(a), setTimeout: () => 0, setInterval: () => 0,
    addEventListener: (t, f) => (winL[t] = winL[t] || []).push(f), innerWidth: 390, innerHeight: 844, scrollY: 0,
    crypto: { getRandomValues: a => a } };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  for (const f of docL.submit || []) f({ target: form });
  for (const f of winL.pagehide || []) f();
  const leads = gtag.filter(a => a[0] === 'event' && a[1] === 'generate_lead');
  const sent = beacons.flatMap(b => b.interactions || []).filter(i => i.kind === 'lead');
  return { leads, sent };
}
function fakeForm(attrs) {
  return { tagName: 'FORM', id: attrs.id || '', getAttribute: k => (k in attrs ? attrs[k] : null),
    hasAttribute: k => k in attrs, closest: () => null };
}
function manualProblems(src) {
  const out = [];
  const plain = submitThrough(src, fakeForm({ id: 'contactForm' }));
  if (plain.leads.length !== 1) out.push('un modulo normale manda ' + plain.leads.length + ' generate_lead invece di 1');
  const manual = submitThrough(src, fakeForm({ id: 'modApplica', 'data-analytics-manual': '' }));
  if (manual.leads.length) out.push('il modulo data-analytics-manual manda generate_lead da boom-track: sarebbe il secondo lead');
  if (manual.sent.length !== 1 || manual.sent[0].label !== 'modApplica') out.push('il tentativo del modulo manuale non arriva a /behavior');
  return out;
}

ok('un modulo con data-analytics-manual non manda generate_lead da boom-track (lo manda la pagina, a conferma del server)', () => {
  const src = read('js/boom-track.js');
  assert.match(src, /if \(f\.hasAttribute\('data-analytics-manual'\)\) return;/);
  assert.deepEqual(manualProblems(src), []);
  // la regola morde: tolta la guardia, il secondo generate_lead torna
  const mutant = src.replace("if (f.hasAttribute('data-analytics-manual')) return;", '');
  assert.notEqual(mutant, src);
  assert.ok(manualProblems(mutant).some(x => /secondo lead/.test(x)), 'il mutante senza guardia non è preso');
});

ok('il tracker parte solo col consenso e non ascolta i campi digitati', () => {
  const src = read('js/boom-track.js');
  assert.match(src, /boom-consent-granted/); assert.match(src, /navigator\.doNotTrack/);
  assert.match(src, /boom-consent-denied/); assert.match(src, /!allowed \|\| !hasConsent\(\)/);
  assert.match(src, /typeof window\.boomTrack !== 'function'/);
  assert.match(src, /boom_attr=; Max-Age=0; Path=\//);
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
