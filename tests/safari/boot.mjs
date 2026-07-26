// tests/safari/boot.mjs
// Le superfici autenticate non devono MAI restare appese su un loader.
// Safari desktop sa bloccare IndexedDB / il canale WebChannel di Firestore:
// in quel caso una get() non si risolve e onSnapshot non chiama né onData né
// onError. Qui simuliamo esattamente quei tre scenari con Firebase finto e
// verifichiamo che la pagina arrivi comunque a uno stato utile.
//
//   node tests/safari/boot.mjs
//
// Richiede playwright-core + il Chromium preinstallato dell'ambiente.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8912;
const BROWSER = process.env.BOOM_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml' };

// playwright-core non è una dipendenza del progetto (niente build step qui):
// lo cerchiamo dove l'ambiente lo tiene. NODE_PATH non vale per gli ESM.
async function loadChromium() {
  const tries = [
    'playwright-core', 'playwright',
    ...(process.env.BOOM_PLAYWRIGHT ? [process.env.BOOM_PLAYWRIGHT] : []),
    '/opt/node22/lib/node_modules/playwright/index.js',
  ];
  for (const spec of tries) {
    try {
      const m = await import(spec);
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* next */ }
  }
  console.log('SKIP: playwright-core non disponibile — '
    + 'npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js');
  process.exit(0);
}
const chromium = await loadChromium();

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

// Firebase finto iniettato PRIMA degli script di pagina. `mode` decide come
// si comporta Firestore.
function stub({ mode, role }) {
  const snap = (rows) => ({
    forEach: (f) => rows.forEach((d, i) => f({ id: 'd' + i, data: () => d })),
    size: rows.length,
  });
  const never = () => new Promise(() => {});
  const profile = Object.assign(snap([]), { exists: true, data: () => ({ role, name: 'Test' }) });
  const q = {
    where: () => q, orderBy: () => q, limit: () => q, doc: () => q,
    get: () => (mode === 'profileHang' ? never() : Promise.resolve(profile)),
    onSnapshot: (onData) => {
      if (mode === 'silentChannel') return () => {};      // non chiama mai nulla
      setTimeout(() => onData(snap([])), 20);
      return () => {};
    },
  };
  window.firebase = {
    initializeApp: () => {},
    auth: Object.assign(
      () => ({
        onAuthStateChanged: (cb) => { setTimeout(() => cb({ uid: 'u1', email: 't@boom' }), 10); return () => {}; },
        setPersistence: () => Promise.resolve(),
        signOut: () => Promise.resolve(),
      }),
      { Auth: { Persistence: { LOCAL: 'l', SESSION: 's' } } }
    ),
    firestore: () => ({ collection: () => q, doc: () => q, enablePersistence: () => Promise.resolve() }),
    storage: () => ({ ref: () => ({ put: () => Promise.resolve() }) }),
  };
}

const CASES = [
  { name: 'console pre-agreement: boot normale',        page: 'pre-agreement-admin', role: 'admin',  mode: 'ok',            wait: 1400, expect: 'app' },
  { name: '/casa: boot normale',                        page: 'tenant',              role: 'tenant', mode: 'ok',            wait: 1400, expect: 'app' },
  { name: 'manuale: boot normale',                      page: 'manuale',             role: 'admin',  mode: 'ok',            wait: 1400, expect: 'app' },
  { name: 'lettura profilo appesa → schermata recovery', page: 'pre-agreement-admin', role: 'admin',  mode: 'profileHang',   wait: 17000, expect: 'recovery' },
  { name: 'canale realtime muto → fallback get()',      page: 'pre-agreement-admin', role: 'admin',  mode: 'silentChannel', wait: 8000,  expect: 'app' },
];

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
let pass = 0, fail = 0;

for (const c of CASES) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const crashes = [];
  page.on('pageerror', (e) => crashes.push(e.message));
  await page.addInitScript(stub, { mode: c.mode, role: c.role });
  // gli SDK Firebase da CDN non servono: lo stub è già a posto
  await page.route('**/gstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(`http://127.0.0.1:${PORT}/${c.page}.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(c.wait);

  const state = await page.evaluate(() => {
    if (document.getElementById('bp-recovery')) return 'recovery';
    const load = document.getElementById('load');
    const stillLoading = load && getComputedStyle(load).display !== 'none';
    return stillLoading ? 'stuck' : 'app';
  });
  const ok = state === c.expect && crashes.length === 0;
  console.log(`${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${c.name} — atteso ${c.expect}, ottenuto ${state}`
    + (crashes.length ? ` [crash: ${crashes[0]}]` : ''));
  ok ? pass++ : fail++;
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n────────────────────────────────────────────────');
console.log(`Safari resilience: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('Nessuna superficie autenticata può restare appesa su un loader.');
