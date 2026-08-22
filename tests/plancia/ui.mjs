// tests/plancia/ui.mjs — LA PLANCIA IN UN BROWSER VERO.
//
// Nata dalla scheda-trappola del 22/08 (modale outreach senza uscita in una
// scheda Safari congelata): la versione VIVA deve dimostrare in Chromium che
// (1) il boot è pulito, (2) nessun modale si apre da solo, (3) il modale
// outreach si chiude in TUTTI e tre i modi (✕, Esc, fondale), e (4) dentro
// ogni modale c'è l'uscita di sicurezza in HTML puro — un link nativo che
// naviga anche quando il JS della pagina è morto. Si auto-skippa senza
// playwright, come le altre suite browser.
import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8931;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

function stub({ role }) {
  const snap = (rows) => ({
    forEach: (f) => rows.forEach((d, i) => f({ id: 'd' + i, data: () => d })),
    size: rows.length, empty: rows.length === 0,
    docs: rows.map((d, i) => ({ id: 'd' + i, data: () => d, exists: true })),
  });
  const profile = Object.assign(snap([]), { exists: true, data: () => ({ role, name: 'Test' }) });
  const q = {
    where: () => q, orderBy: () => q, limit: () => q, doc: () => q,
    get: () => Promise.resolve(profile),
    onSnapshot: (onData) => { setTimeout(() => onData(Object.assign(snap([]), { exists: false, data: () => ({}) })), 20); return () => {}; },
    collection: () => q,
    set: () => Promise.resolve(), update: () => Promise.resolve(),
    add: () => Promise.resolve({ id: 'x' }), delete: () => Promise.resolve(),
  };
  const firestoreFn = () => ({
    collection: () => q, doc: () => q,
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

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(stub, { role: 'admin' });
await page.route(/gstatic\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await page.route(/\/api\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.goto(`http://127.0.0.1:${PORT}/pfs-command.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const appVisible = await page.evaluate(() => !document.getElementById('app').hidden);
ok(appVisible, 'boot completo: la app è visibile (gate auth superato)');
ok(errors.length === 0, 'zero errori JS al boot' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));

const ovHiddenAtBoot = await page.evaluate(() => document.getElementById('outreach-modal-overlay').hidden);
ok(ovHiddenAtBoot, 'il modale outreach NON si apre da solo al boot');

// si apre l'overlay direttamente (state è nel closure — giusto così) e si
// prova che i listener VERI della pagina lo chiudono nei tre modi
const openOv = () => page.evaluate(() => { document.getElementById('outreach-modal-overlay').hidden = false; });
const isHidden = () => page.evaluate(() => document.getElementById('outreach-modal-overlay').hidden);

await openOv();
await page.click('#om-close');
ok(await isHidden(), 'la ✕ lo chiude (listener vero della pagina)');

await openOv();
await page.keyboard.press('Escape');
ok(await isHidden(), 'Esc lo chiude');

await openOv();
await page.click('#outreach-modal-overlay', { position: { x: 8, y: 8 } });
ok(await isHidden(), 'il click sul fondale lo chiude');

// l'uscita di sicurezza in HTML puro, in TUTTI e tre i modali statici
const escLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a.modal-esc')).map((a) => a.getAttribute('href')));
ok(escLinks.length === 3 && escLinks.every((h) => h === '/pfs-command'),
  `l'uscita di sicurezza nativa è in ogni modale (${escLinks.length}/3, href giusto)`);

ok(errors.length === 0, 'zero errori JS dopo tutto il giro' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));

await browser.close();
server.close();
console.log(`\n${fail ? '✗' : '✓'} plancia ui: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
