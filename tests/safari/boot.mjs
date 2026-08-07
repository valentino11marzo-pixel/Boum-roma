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
    empty: rows.length === 0,
    // portal.html legge anche snapshot.docs.map(...): senza questo campo lo
    // stub farebbe fallire il boot per conto suo e il test misurerebbe il
    // proprio difetto invece di quello della pagina.
    docs: rows.map((d, i) => ({ id: 'd' + i, data: () => d, exists: true })),
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
  // `spuriousNull`: Safari emette null e SOLO DOPO risolve la sessione
  // persistita. Senza periodo di grazia la pagina rimbalza al login.
  const onAuth = (cb) => {
    if (mode === 'spuriousNull') {
      setTimeout(() => cb(null), 10);
      setTimeout(() => cb({ uid: 'u1', email: 't@boom', getIdToken: () => Promise.resolve('tok') }), 900);
    } else {
      setTimeout(() => cb({ uid: 'u1', email: 't@boom', getIdToken: () => Promise.resolve('tok') }), 10);
    }
    return () => {};
  };
  // portal.html usa Firestore molto più a fondo delle altre console (batch,
  // FieldValue, Timestamp): senza questi il boot morirebbe per colpa dello
  // stub e il test proverebbe la cosa sbagliata.
  Object.assign(q, {
    collection: () => q,
    set: () => Promise.resolve(), update: () => Promise.resolve(),
    add: () => Promise.resolve({ id: 'x' }), delete: () => Promise.resolve(),
  });
  const firestoreFn = () => ({
    collection: () => q, doc: () => q,
    enablePersistence: () => Promise.resolve(),
    batch: () => ({ set() {}, update() {}, delete() {}, commit: () => Promise.resolve() }),
  });
  window.firebase = {
    initializeApp: () => {},
    auth: Object.assign(
      () => ({
        onAuthStateChanged: onAuth,
        setPersistence: () => Promise.resolve(),
        signOut: () => Promise.resolve(),
        currentUser: { uid: 'u1' },
      }),
      { Auth: { Persistence: { LOCAL: 'l', SESSION: 's' } } }
    ),
    firestore: Object.assign(firestoreFn, {
      FieldValue: {
        serverTimestamp: () => 'ts', increment: (n) => n,
        arrayUnion: (...a) => a, arrayRemove: (...a) => a, delete: () => null,
      },
      Timestamp: { now: () => ({ toDate: () => new Date() }), fromDate: (d) => ({ toDate: () => d }) },
    }),
    storage: () => ({ ref: () => ({ put: () => Promise.resolve(), child: () => ({}) }) }),
  };
}

const CASES = [
  { name: 'console pre-agreement: boot normale',        page: 'pre-agreement-admin', role: 'admin',  mode: 'ok',            wait: 1400, expect: 'app' },
  { name: '/casa: boot normale',                        page: 'tenant',              role: 'tenant', mode: 'ok',            wait: 1400, expect: 'app' },
  { name: 'manuale: boot normale',                      page: 'manuale',             role: 'admin',  mode: 'ok',            wait: 1400, expect: 'app' },
  { name: 'lettura profilo appesa → schermata recovery', page: 'pre-agreement-admin', role: 'admin',  mode: 'profileHang',   wait: 17000, expect: 'recovery' },
  { name: 'canale realtime muto → fallback get()',      page: 'pre-agreement-admin', role: 'admin',  mode: 'silentChannel', wait: 8000,  expect: 'app' },
  { name: 'null spurio da Safari → niente rimbalzo',    page: 'pre-agreement-admin', role: 'admin',  mode: 'spuriousNull',  wait: 3000,  expect: 'app' },
  { name: 'null spurio su /casa → niente rimbalzo',     page: 'tenant',              role: 'tenant', mode: 'spuriousNull',  wait: 3000,  expect: 'app' },

  // ── portal.html ────────────────────────────────────────────────────────────
  // La superficie più grande (portal-app.js, 2,3 MB) e l'unica con un boot
  // proprio invece di BoomPortal.requireAuth: restava fuori da questa suite,
  // che intanto dichiarava "nessuna superficie autenticata resta appesa".
  // È esattamente la pagina su cui l'operatore vedeva lo spinner infinito.
  { name: 'portal: boot normale',                       page: 'portal',              role: 'admin',  mode: 'ok',            wait: 6000,  expect: 'app' },
  // Il caso senza uscita: portal-app.js accende la sentinella alla riga 1 e
  // POI muore (su WebKit ne abbiamo di registrati: Notification assente,
  // IndexedDB che salta). Prima di questa suite la pagina restava sullo
  // spinner per sempre, perché quella sentinella spegneva la scialuppa della
  // shell e il watchdog interno — riga ~2300 — non veniva mai raggiunto.
  { name: 'portal: lo script muore dopo la riga 1 → via d\'uscita', page: 'portal',   role: 'admin',  mode: 'ok',            wait: 20000, expect: 'recovery', breakApp: true },
];

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
let pass = 0, fail = 0;

for (const c of CASES) {
  const ctx = await browser.newContext({
    // UA di Safari desktop: attiva i rami Safari-specifici (grazia di 3s sul
    // null spurio, persistence senza synchronizeTabs).
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
      + '(KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  });
  const page = await ctx.newPage();
  const crashes = [];
  page.on('pageerror', (e) => crashes.push(e.message));
  await page.addInitScript(stub, { mode: c.mode, role: c.role });
  // gli SDK Firebase da CDN non servono: lo stub è già a posto. REGEX, non
  // glob: l'host reale è www.gstatic.com e il glob non lo prendeva — le altre
  // pagine sopravvivevano lo stesso (lo stub è già iniettato), ma portal.html
  // ha un onerror che sostituisce il body con "Errore Caricamento Script", e
  // il test avrebbe misurato quello invece del boot.
  await page.route(/gstatic\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  if (c.breakApp) {
    await page.route(/\/js\/portal-app\.js/, (r) => r.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'window.__portalAppLoaded = true;\nthrow new Error("boom durante il boot");',
    }));
  }
  await page.goto(`http://127.0.0.1:${PORT}/${c.page}.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(c.wait);

  const url = page.url();
  const bounced = url.indexOf('/login') >= 0;
  const state = bounced ? 'login' : await page.evaluate(() => {
    if (document.getElementById('bp-recovery')) return 'recovery';
    // portal.html chiama il suo loader #loading e trasforma quel nodo nella
    // card di uscita (data-escape) invece di iniettare #bp-recovery.
    const portalLoader = document.getElementById('loading');
    if (portalLoader && !portalLoader.classList.contains('hidden')
        && getComputedStyle(portalLoader).display !== 'none') {
      return portalLoader.getAttribute('data-escape') === '1' ? 'recovery' : 'stuck';
    }
    const load = document.getElementById('load');
    const stillLoading = load && getComputedStyle(load).display !== 'none';
    return stillLoading ? 'stuck' : 'app';
  });
  // Nel caso breakApp l'eccezione è il PRESUPPOSTO del test, non un difetto:
  // ciò che si misura è che la pagina ne esca comunque.
  const unexpected = crashes.filter((m) => !(c.breakApp && /boom durante il boot/.test(m)));
  const ok = state === c.expect && unexpected.length === 0;
  console.log(`${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${c.name} — atteso ${c.expect}, ottenuto ${state}`
    + (unexpected.length ? ` [crash: ${unexpected[0]}]` : ''));
  ok ? pass++ : fail++;
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n────────────────────────────────────────────────');
console.log(`Safari resilience: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('Nessuna superficie autenticata può restare appesa su un loader.');
