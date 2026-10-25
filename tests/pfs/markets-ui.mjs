// tests/pfs/markets-ui.mjs — IL RADAR PER MERCATO nelle due pagine, in Chromium.
//
//   pfs-command: l'annuncio di Madrid porta la bandiera, «Proponi a…» elenca
//                SOLO i clienti della sua città, il 📨 Contatto non c'è fuori
//                Roma, e il modale cliente salva il mercato scelto;
//   client-portal: la cliente di Madrid legge "Madrid", mai "Rome" — col
//                payload costruito dalla funzione VERA del server
//                (api/portal/_shared.js mapClientForPortal).
//
// Firebase finto (dati per collection), rete esterna chiusa. Si auto-skippa
// senza playwright (BOOM_PLAYWRIGHT=/percorso/index.js).
//
// node tests/pfs/markets-ui.mjs

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8947;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'k';
const { mapClientForPortal } = await import('../../api/portal/_shared.js');

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 240) : '')); } };

function stub(DATA) {
  window.__writes = [];
  const snapOf = (name, rows) => ({
    forEach: (f) => rows.forEach(([id, d]) => f({ id, data: () => d, exists: true, ref: { id } })),
    size: rows.length, empty: rows.length === 0,
    docs: rows.map(([id, d]) => ({ id, data: () => d, exists: true, ref: { id } })),
    docChanges: () => rows.map(([id, d]) => ({ type: 'added', doc: { id, data: () => d } })),
  });
  const docRef = (name, id) => ({
    id,
    get: () => {
      if (name === 'users') return Promise.resolve({ exists: true, id, data: () => ({ role: 'admin', name: 'Test' }) });
      const row = (DATA[name] || []).find(([i]) => i === id);
      return Promise.resolve({ exists: !!row, id, data: () => (row ? row[1] : undefined) });
    },
    onSnapshot: (onData) => { const row = (DATA[name] || []).find(([i]) => i === id); setTimeout(() => onData({ exists: !!row, id, data: () => (row ? row[1] : {}) }), 20); return () => {}; },
    set: (d, o) => { window.__writes.push({ op: 'set', name, id, d }); return Promise.resolve(); },
    update: (d) => { window.__writes.push({ op: 'update', name, id, d }); return Promise.resolve(); },
    delete: () => Promise.resolve(),
    collection: (sub) => coll(name + '/' + id + '/' + sub),
  });
  const coll = (name) => {
    const q = {
      where: () => q, orderBy: () => q, limit: () => q, startAfter: () => q,
      doc: (id) => docRef(name, id || 'auto'),
      get: () => Promise.resolve(snapOf(name, DATA[name] || [])),
      onSnapshot: (onData) => { setTimeout(() => onData(snapOf(name, DATA[name] || [])), 20); return () => {}; },
      add: (d) => { window.__writes.push({ op: 'add', name, d }); return Promise.resolve({ id: 'new1' }); },
    };
    return q;
  };
  const firestoreFn = () => ({
    collection: (n) => coll(n), doc: (p) => { const [n, id] = String(p).split('/'); return docRef(n, id); },
    enablePersistence: () => Promise.resolve(),
    batch: () => ({ set() {}, update() {}, delete() {}, commit: () => Promise.resolve() }),
  });
  window.firebase = {
    initializeApp: () => {},
    auth: Object.assign(() => ({
      onAuthStateChanged: (cb) => { setTimeout(() => cb({ uid: 'u1', email: 't@boom', getIdToken: () => Promise.resolve('tok') }), 10); return () => {}; },
      setPersistence: () => Promise.resolve(), signOut: () => Promise.resolve(),
      currentUser: { uid: 'u1', getIdToken: () => Promise.resolve('tok') },
    }), { Auth: { Persistence: { LOCAL: 'l', SESSION: 's' } } }),
    firestore: Object.assign(firestoreFn, {
      FieldValue: { serverTimestamp: () => 'ts', increment: (n) => n, arrayUnion: (...a) => a, arrayRemove: (...a) => a, delete: () => null },
      Timestamp: { now: () => ({ toDate: () => new Date() }), fromDate: (d) => ({ toDate: () => d }) },
    }),
    storage: () => ({ ref: () => ({ put: () => Promise.resolve(), child: () => ({}) }) }),
  };
}

const now = new Date().toISOString();
const DATA = {
  pfsClients: [
    ['cl_rome', { name: 'Giulia Roma', stage: 'searching', budget: 1500, zone: 'centro', portalEnabled: true, portalProperties: [], portalActivity: [] }],
    ['cl_mad', { name: 'Lucía Madrid', market: 'madrid', stage: 'searching', budget: 1500, zone: 'Chamberí', portalEnabled: true, portalProperties: [], portalActivity: [] }],
  ],
  pfsProperties: [
    ['pmad', { sourceUrl: 'https://www.idealista.com/inmueble/100000001/', source: 'idealista_es', market: 'madrid', price: 1400, title: 'Piso en Calle X, Chamberí, Madrid', zone: 'Madrid · Chamberí', advertiser: 'unknown', scrapedAt: now, lastSeenAt: now, matchSummary: { pushedTo: [{ clientId: 'cl_mad', name: 'Lucía Madrid', score: 82 }] } }],
    ['prome', { sourceUrl: 'https://www.idealista.it/immobile/31000011/', source: 'idealista', market: 'roma', price: 1300, title: 'Bilocale Monti', zone: 'Monti', advertiser: 'private', scrapedAt: now, lastSeenAt: now, matchSummary: { pushedTo: [{ clientId: 'cl_rome', name: 'Giulia Roma', score: 80 }] } }],
  ],
  // la salute: la fonte Inbox col conteggio per città (byMarket), e un «da
  // verificare» la cui città non si è potuta dedurre
  pfsRadarHealth: [
    ['inbox', { ok: true, lastRunAt: now, lastOkAt: now, consecutiveErrors: 0,
      stats: { emailsSeen: 3, alerts: 2, byMarket: { madrid: { alerts: 2, listings: 3, ingested: 3, pushed: 1 }, roma: { alerts: 1, listings: 1, ingested: 1, pushed: 1 } } },
      needsAttention: [{ sourceUrl: 'https://www.idealista.com/inmueble/100000005/', source: 'idealista_es', reason: 'market_unknown', subject: 'Nuevo piso en tu búsqueda', at: now }] }],
  ],
};

const browser = await chromium.launch(launchOptions());
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route((u) => !String(u).startsWith(`http://127.0.0.1:${PORT}/`), (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  return page;
}

// ── pfs-command ─────────────────────────────────────────────────────────────
{
  const page = await newPage();
  await page.addInitScript(stub, DATA);
  const apiPosts = [];
  await page.route(/\/api\//, (r) => { apiPosts.push({ url: r.request().url(), body: r.request().postData() }); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.goto(`http://127.0.0.1:${PORT}/pfs-command.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const card = (id) => document.querySelector('#feed-list .fcard[data-id="' + id + '"]');
    const opts = (id) => { const c = card(id); return c ? [...c.querySelectorAll('select[data-action="push-client"] option')].map((o) => o.value).filter(Boolean) : null; };
    const badges = (id) => { const c = card(id); return c ? [...c.querySelectorAll('.badge-row .pbadge')].map((b) => b.textContent) : null; };
    const contact = (id) => { const c = card(id); return c ? !!c.querySelector('[data-action="contact-owner"]') : null; };
    const copyOwner = (id) => { const c = card(id); return c ? !!c.querySelector('[data-action="copy-owner"]') : null; };
    return { madOpts: opts('pmad'), romeOpts: opts('prome'), madBadges: badges('pmad'), romeBadges: badges('prome'), madContact: contact('pmad'), romeContact: contact('prome'),
      madCopy: copyOwner('pmad'), romeCopy: copyOwner('prome'),

      hasMarketsLib: !!window.BOOM_RADAR_MARKETS,
      srcChips: !!document.querySelector('[data-hsource="inbox-madrid"]') && !!document.querySelector('[data-hsource="inbox-barcelona"]') };
  });
  ok(info.hasMarketsLib, 'pfs-command carica js/radar-markets.js');
  ok(info.madBadges && info.madBadges.some((b) => /🇪🇸 Madrid/.test(b)), 'l\'annuncio di Madrid porta la bandiera', info.madBadges);
  ok(info.romeBadges && !info.romeBadges.some((b) => /Madrid|Roma|città/.test(b)), 'l\'annuncio romano resta com\'era (nessun badge di città)', info.romeBadges);
  ok(JSON.stringify(info.madOpts) === JSON.stringify(['cl_mad']), '«Proponi a…» sull\'annuncio di Madrid: SOLO Lucía', info.madOpts);
  ok(JSON.stringify(info.romeOpts) === JSON.stringify(['cl_rome']), '«Proponi a…» sull\'annuncio romano: SOLO Giulia', info.romeOpts);
  ok(info.madContact === false && info.romeContact === true, '📨 Contatto: sì su Roma, no su Madrid', { mad: info.madContact, rome: info.romeContact });
  ok(info.srcChips, 'la salute mostra le fonti "Inbox Madrid" e "Inbox Barcellona"');
  ok(info.madCopy === false && info.romeCopy === true, '📋 Copia messaggio proprietario: sì su Roma, no su Madrid (testo italiano per un proprietario spagnolo)', { mad: info.madCopy, rome: info.romeCopy });
  // il triage: si scorre la coda e si guarda la barra di ogni annuncio
  await page.evaluate(() => document.getElementById('btn-triage').click());
  await page.waitForTimeout(200);
  const seenTriage = [];
  for (let i = 0; i < 3; i++) {
    const cur = await page.evaluate(() => ({ stage: (document.getElementById('tg-stage') || {}).innerText || '', foot: (document.getElementById('tg-foot') || {}).innerHTML || '' }));
    if (!cur.foot) break;
    seenTriage.push({ madrid: /Madrid/.test(cur.stage), owner: /data-taction="owner"/.test(cur.foot) });
    await page.evaluate(() => { const b = document.querySelector('#tg-foot [data-taction="skip"]'); if (b) b.click(); });
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => document.getElementById('tg-exit').click());
  const tMad = seenTriage.find((x) => x.madrid), tRome = seenTriage.find((x) => !x.madrid);
  ok(tMad && tRome && tMad.owner === false && tRome.owner === true, 'triage: «📋 Proprietario» solo su Roma', seenTriage);

  // il popover della fonte Inbox: una riga per città, mai "[object Object]"
  await page.evaluate(() => document.querySelector('[data-hsource="inbox"]').click());
  await page.waitForTimeout(150);
  const pop = await page.evaluate(() => (document.getElementById('health-pop-wrap') || {}).innerText || '');
  ok(!/object Object/.test(pop) && /Madrid[\s\S]*2 alert · 3 annunci · 1 push/.test(pop), 'salute Inbox: byMarket come righe per città, mai «[object Object]»', pop.slice(0, 400));

  // un «da verificare» senza città: il modale la fa scegliere, e la manda
  await page.evaluate(() => { const b = document.querySelector('#attention-list [data-action="ingest"]'); if (b) b.click(); });
  await page.waitForTimeout(150);
  const modal = await page.evaluate(() => ({ open: !document.getElementById('modal-overlay').hidden, market: (document.getElementById('mf-market') || {}).value, note: document.getElementById('mf-source-note').textContent, opts: [...document.querySelectorAll('#mf-market option')].map((o) => o.value) }));
  ok(modal.open && modal.market === '' && /città da dichiarare/.test(modal.note) && JSON.stringify(modal.opts) === JSON.stringify(['', 'roma', 'madrid', 'barcelona']),
    'modale Aggiungi annuncio: c\'è il Mercato, vuoto, e la nota dice di dichiarare la città', modal);
  await page.fill('#mf-price', '1100');
  await page.selectOption('#mf-market', 'barcelona');
  apiPosts.length = 0;
  await page.evaluate(() => document.getElementById('mf-push').click());
  await page.waitForTimeout(300);
  const sent = apiPosts.find((x) => /\/api\/admin\/match-test/.test(x.url));
  let sentBody = null; try { sentBody = JSON.parse(sent && sent.body); } catch { /* */ }
  ok(sentBody && sentBody.market === 'barcelona' && sentBody.sourceUrl === 'https://www.idealista.com/inmueble/100000005/', 'Ingerisci: il POST porta market «barcelona» scelto nel modale', sentBody);

  // Il click si fa sul bottone, non sulle coordinate: in pfs-command i due
  // overlay con lo stile in linea (display:flex) restano DISEGNATI anche col
  // `hidden` (difetto preesistente, segnalato, non toccato qui) e coprirebbero
  // la pagina per un click "da mouse".
  await page.evaluate(() => document.getElementById('btn-new-client').click());
  await page.fill('#cm-name', 'Nueva Clienta');
  await page.fill('#cm-budget', '1600');
  await page.selectOption('#cm-market', 'barcelona');
  await page.evaluate(() => document.getElementById('cm-save').click());
  await page.waitForTimeout(300);
  const w = await page.evaluate(() => window.__writes.filter((x) => x.name === 'pfsClients'));
  ok(w.length === 1 && w[0].op === 'add' && w[0].d.market === 'barcelona', 'il modale cliente salva il mercato scelto (barcelona)', w);
  ok(errors.length === 0, 'zero errori JS in pfs-command', errors.slice(0, 3));
  await page.context().close();
}

// ── client-portal ───────────────────────────────────────────────────────────
async function portalFor(client) {
  const page = await newPage();
  const payload = { ok: true, client: mapClientForPortal(client) };
  await page.route(/\/api\/portal\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
  await page.addInitScript(() => { try { localStorage.setItem('boom_pfs_lang', 'en'); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/client-portal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('#code', 'BMTEST1');
  await page.click('#authBtn');
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => document.body.innerText);
  await page.context().close();
  return { text, payload };
}
{
  const base = { portalEnabled: true, portalLang: 'en', stage: 'onboarded', name: 'Lucía', portalProperties: [], portalActivity: [] };
  const mad = await portalFor({ ...base, market: 'madrid' });
  ok(mad.payload.client.market === 'madrid' && mad.payload.client.city.en === 'Madrid', 'mapClientForPortal porta market e città', mad.payload.client.city);
  ok(/combing through Madrid/.test(mad.text), 'portale: "The BOOM engine is combing through Madrid"', mad.text.slice(0, 400));
  ok(!/combing through Rome|Mid-term Rome|The Rome market/.test(mad.text), 'portale di Madrid: nessun "Rome"', (mad.text.match(/.{0,40}Rome.{0,40}/g) || []).slice(0, 3));
  const rome = await portalFor({ ...base, name: 'Giulia' });
  ok(/combing through Rome/.test(rome.text), 'portale di Roma: "combing through Rome" com\'era', rome.text.slice(0, 300));
  ok(errors.length === 0, 'zero errori JS nel portale', errors.slice(0, 3));
}

await browser.close();
server.close();
console.log(`\n${fail ? '✗' : '✓'} markets ui: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
