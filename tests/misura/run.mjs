// tests/misura/run.mjs — IL PORTALE MISURATO SUI FORMATI VERI.
//
// Nato dalla segnalazione del 4 settembre 2026: «con la webapp funziona, ma
// alcuni sizing vediamoli». Non si guarda: si MISURA, e su un portale VERO —
// Firebase è finto ai confini, ma la shell, il CSS, i layer M2/D1 e le pagine
// sono quelli di produzione.
//
// IL DIFETTO CHE HA APERTO IL CASO. La riga bottoni di testa pagina è una
// corsia orizzontale (M2, per non impilare bottoni a tutta larghezza) con la
// barra di scorrimento NASCOSTA. Su iPhone 15 (393px) la pagina Contratti
// mostrava 369px di corsia su 602px di contenuto, e l'ordine del markup
// metteva la primaria per ULTIMA: «+ Nuovo» cominciava a x=503 — 134px oltre
// il bordo dello schermo, dietro tre secondarie, senza alcun indizio che
// esistesse. L'azione più importante della pagina era invisibile. Idem
// «+ Registra» su Pagamenti.
//
// Le due regole che questa suite difende:
//  1. L'AZIONE PRIMARIA DI UNA PAGINA STA SEMPRE DENTRO LO SCHERMO. Su un
//     telefono è la cosa che l'operatore cerca per prima; se è fuori quadro,
//     per lui non c'è.
//  2. CIÒ CHE ESCE DAL BORDO DEVE ESSERE RAGGIUNGIBILE E DICHIARATO — dentro
//     una corsia che scorre davvero, e che si vede che continua.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8938;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const srv = createServer(async (rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/' || p === '/portal') p = '/portal.html';
  try {
    const b = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    rs.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(b);
  } catch { rs.writeHead(404).end('x'); }
});
await new Promise((r) => srv.listen(PORT, r));

// I confini finti: Firebase risponde, il profilo è un admin vero. Tutto il
// resto — portal.html, portal.css, i layer M2/D1, portal-app.js — è quello
// che gira in produzione.
const STUB = () => {
  const noop = () => {};
  const snap = { docs: [], empty: true, forEach: noop, size: 0 };
  const PROF = { role: 'admin', name: 'Valentino', email: 'valentino@boom-rome.com' };
  const q = { get: async () => snap, onSnapshot: (a) => { try { a(snap); } catch (e) {} return noop; },
              where() { return q; }, orderBy() { return q; }, limit() { return q; }, doc() { return d; } };
  const d = { get: async () => ({ exists: true, id: 'u1', data: () => PROF }),
              set: async () => {}, update: async () => {},
              onSnapshot: (a) => { try { a({ exists: true, id: 'u1', data: () => PROF }); } catch (e) {} return noop; },
              collection() { return q; } };
  const U = { uid: 'u1', email: 'valentino@boom-rome.com', getIdToken: async () => 't', displayName: 'Valentino' };
  window.firebase = {
    apps: [], initializeApp: () => ({}),
    auth: () => ({ currentUser: U, onAuthStateChanged: (cb) => { setTimeout(() => cb(U), 10); return noop; },
                   signOut: async () => {}, signInAnonymously: async () => ({ user: U }) }),
    firestore: Object.assign(() => ({ collection: () => q, doc: () => d, enablePersistence: async () => {},
      batch: () => ({ set: noop, update: noop, delete: noop, commit: async () => {} }) }),
      { FieldValue: { serverTimestamp: () => new Date(), increment: (n) => n, arrayUnion: (...a) => a, delete: () => null },
        Timestamp: { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
                     fromDate: (x) => ({ toDate: () => x, toMillis: () => +x }) } }),
    storage: () => ({ ref: () => ({ put: async () => ({ ref: { getDownloadURL: async () => 'x' } }),
                                    getDownloadURL: async () => 'x', child() { return this; } }) }),
  };
};

const FORMATI = [['iPhone 13 mini', 375, 812], ['iPhone 15', 393, 852],
                 ['iPhone Pro Max', 430, 932], ['iPad mini', 744, 1133], ['MacBook Air', 1440, 900]];
const PAGINE = ['oggi', 'contracts', 'properties', 'payments', 'users', 'maintenance', 'documents'];

const browser = await chromium.launch(launchOptions());
for (const [nome, w, h] of FORMATI) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
                                       isMobile: w < 900, hasTouch: w < 900 });
  await page.addInitScript(STUB);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
  // gli SDK esterni rispondono vuoti: senza, il gestore d'errore di
  // portal.html sostituisce il body e non ci sarebbe niente da misurare
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('localhost:' + PORT)) return r.continue();
    if (/gstatic\.com\/firebasejs|cdnjs|jsdelivr/.test(u))
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' });
    return r.abort();
  });
  await page.goto(`http://localhost:${PORT}/portal.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1600);

  const boot = await page.evaluate(() => ({
    loader: !document.getElementById('loading')?.classList.contains('hidden'),
    app: !!document.getElementById('app')?.classList.contains('active'),
  }));
  ok(boot.app && !boot.loader, `${nome}: il portale entra nella shell (nessuna rotella appesa)`);
  ok(errs.length === 0, `${nome}: boot senza errori JS` + (errs.length ? ' — ' + [...new Set(errs)][0] : ''));
  if (!boot.app) { await page.close(); continue; }

  for (const sez of PAGINE) {
    await page.evaluate((s) => { location.hash = '#' + s; }, sez);
    await page.waitForTimeout(450);
    const m = await page.evaluate(() => {
      const W = window.innerWidth;
      const fuori = [];
      document.querySelectorAll('#main *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
        if (r.right <= W + 1) return;
        // raggiungibile? un antenato che scorre davvero di lato basta
        let p = el.parentElement, raggiungibile = false;
        while (p && p.id !== 'main') {
          const pc = getComputedStyle(p);
          if ((pc.overflowX === 'auto' || pc.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) { raggiungibile = true; break; }
          p = p.parentElement;
        }
        if (!raggiungibile) fuori.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) + ' →' + Math.round(r.right - W) + 'px');
      });
      // la PRIMARIA di testa pagina
      const lane = document.querySelector('#main .page-actions, #main .page-header > div:last-child');
      let primaria = null;
      if (lane) {
        const b = lane.querySelector('.btn:not(.btn-secondary)');
        if (b) {
          const r = b.getBoundingClientRect();
          primaria = { testo: (b.textContent || '').trim().slice(0, 18),
                       dentro: r.left >= -1 && r.right <= W + 1,
                       destra: Math.round(r.right - W) };
        }
      }
      const laneInfo = lane ? { piu: lane.scrollWidth > lane.clientWidth + 4,
                                dichiara: lane.classList.contains('pm-lane-more') } : null;
      return { sforo: document.documentElement.scrollWidth - W, fuori: [...new Set(fuori)].slice(0, 3), primaria, laneInfo };
    });

    ok(m.sforo <= 1, `${nome} #${sez}: la pagina non scorre di lato (${m.sforo}px)`);
    ok(m.fuori.length === 0,
      `${nome} #${sez}: niente fuori quadro e irraggiungibile` + (m.fuori.length ? ' — ' + m.fuori.join(' | ') : ''));
    if (m.primaria) {
      ok(m.primaria.dentro,
        `${nome} #${sez}: l'azione primaria «${m.primaria.testo}» è DENTRO lo schermo`
        + (m.primaria.dentro ? '' : ` (sborda di ${m.primaria.destra}px — su un telefono, per l'operatore non esiste)`));
    }
    if (m.laneInfo && m.laneInfo.piu && w < 920) {
      ok(m.laneInfo.dichiara,
        `${nome} #${sez}: la corsia che continua lo DICHIARA (senza barra visibile, ciò che è fuori non esiste)`);
    }
  }
  await page.close();
}
await browser.close();
srv.close();

console.log(`\n${fail ? '✗' : '✓'} misura: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
