// tests/telefono/run.mjs — IL SITO SOTTO UN DITO.
//
// Il 4 settembre 2026 l'operatore ha chiesto un controllo «col telefono».
// Fatto in un Chromium vero a 390×844, puntatore grossolano, su ogni
// pagina della sitemap. Il rilievo piu' caro non si vede sul desktop:
// su iPhone un campo con carattere SOTTO I 16PX fa zoomare la pagina al
// primo tap, e la pagina non torna indietro da sola. Undici pagine, quasi
// tutti i moduli che devono convertire (università, aziende, ricerca,
// contatto, prenotazione, la scheda casa, Property Finding) si aprivano
// storti al primo tocco.
//
// La regola qui: a puntatore grossolano nessun campo di testo visibile
// sta sotto i 16px. Si misura il COMPUTED style in un browser, non il CSS
// scritto — la regola vive in `@media (pointer:coarse)` in cima a ogni
// foglio, e un `.field input{font-size:14px}` piu' specifico aggiunto
// domani la batterebbe in silenzio. Il browser lo vede, il grep no.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const check = (c, t) => c ? (ok++, console.log('  \x1b[32m✓\x1b[0m ' + t))
                          : (ko++, console.log('  \x1b[31m✗\x1b[0m ' + t));

console.log('\n\x1b[1m▸ telefono\x1b[0m  il sito sotto un dito: nessun campo che faccia zoomare iPhone');

const chromium = await loadChromium();
if (!chromium) { console.log('  SKIP: playwright non disponibile'); process.exit(0); }

const TIPI = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.xml': 'application/xml' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    s.writeHead(404); return s.end('no');
  }
  s.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const pagine = [...sm.matchAll(/<loc>https?:\/\/[^<\/]+\/?([^<]*)<\/loc>/g)]
  .map((m) => m[1].replace(/^\/+/, '')).map((u) => u === '' ? 'index' : u)
  .filter((u) => !u.includes('#')).filter((v, i, a) => a.indexOf(v) === i);

const br = await chromium.launch(launchOptions());
/* isMobile + hasTouch: e' cosi' che Chromium risponde `(pointer:coarse)`.
   Senza, la regola sotto test non si attiva e il test passerebbe A VUOTO. */
const ctx = await br.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true });
const piccoli = [];
let campiVisti = 0, pagineConCampi = 0;

for (const u of pagine) {
  const pg = await ctx.newPage();
  await pg.route('**/*', (r) => {
    const x = r.request().url();
    return (x.startsWith(base) || x.startsWith('data:')) ? r.continue() : r.abort();
  });
  let vive = true;
  try {
    const rs = await pg.goto(`${base}/${u === 'index' ? '' : u}`, { waitUntil: 'load', timeout: 20000 });
    if (!rs || rs.status() >= 400) vive = false;
  } catch { vive = false; }
  if (!vive) { await pg.close(); continue; }
  await pg.waitForTimeout(600);
  const r = await pg.evaluate(() => {
    const grosso = matchMedia('(pointer:coarse)').matches;
    const out = []; let n = 0;
    for (const e of document.querySelectorAll(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea')) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      n++;
      const fs = parseFloat(s.fontSize);
      if (fs < 16) out.push(`${e.name || e.id || e.tagName.toLowerCase()} ${fs}px`);
    }
    return { grosso, n, out };
  });
  await pg.close();
  if (!r.grosso) { console.log('  SKIP: il browser non dichiara pointer:coarse'); process.exit(0); }
  campiVisti += r.n; if (r.n) pagineConCampi++;
  if (r.out.length) piccoli.push(`${u} (${r.out.slice(0, 3).join(', ')})`);
}

check(pagineConCampi >= 8,
  `il metro passa su pagine con moduli veri (${pagineConCampi} pagine, ${campiVisti} campi)`);
check(piccoli.length === 0,
  'a puntatore grossolano nessun campo sotto i 16px (iPhone non zooma)'
  + (piccoli.length ? ' — ' + piccoli.join(' · ') : ''));

await br.close(); srv.close();
console.log(ko ? `  \x1b[31mIl sito punge sotto il dito\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mIl sito sta sotto il dito\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
