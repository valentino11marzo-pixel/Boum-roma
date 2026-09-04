// tests/testata/run.mjs — LA TESTATA DEVE COPRIRE.
//
// LA LEZIONE DEL 1 SETTEMBRE 2026. L'operatore ha scritto: «scrolli e si
// vede l'header che non e' abbastanza messo bene da coprire la pagina».
// Aveva ragione, e il difetto era su META' del sito: la barra fissa era
// tradotta in vetro smerigliato — sfondo all'88-92% piu' `backdrop-filter:
// blur()` — e il testo della pagina si LEGGEVA attraverso mentre scorreva.
//
// Il perche' vale piu' della correzione, ed e' il motivo per cui questo test
// guarda i PIXEL e non il CSS: il blur funziona (misurato: toglierlo peggiora
// il contrasto da 20 a 26), ma sfocare testo quasi-nero su fondo quasi-nero
// non nasconde niente. Il vetro smerigliato nasconde sopra una FOTO. Sopra il
// nero, a coprire e' solo l'opacita'. Una regola scritta sul CSS
// («alpha === 1») avrebbe detto la stessa cosa in modo piu' fragile: non
// avrebbe visto un'ombra, un gradiente o un pseudo-elemento traslucido
// aggiunti domani sopra la barra. Qui si guarda cosa ARRIVA ALL'OCCHIO.
//
// La misura: la striscia della barra, LONTANA dal marchio e dall'hamburger
// (che sono contenuto legittimo e hanno il loro contrasto), mentre la pagina
// e' scorsa. Se lo scarto di luminosita' dentro quella striscia supera la
// soglia, dietro sta passando qualcosa che si vede.
//
// Serve `sharp` (gia' dipendenza di api/) e playwright: senza, SKIP.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const check = (c, t) => c ? (ok++, console.log('  \x1b[32m✓\x1b[0m ' + t))
                          : (ko++, console.log('  \x1b[31m✗\x1b[0m ' + t));

console.log('\n\x1b[1m▸ testata\x1b[0m  la barra fissa copre davvero la pagina che le scorre sotto');

const chromium = await loadChromium();
if (!chromium) { console.log('  SKIP: playwright non disponibile'); process.exit(0); }
let sharp;
try { sharp = createRequire(path.join(ROOT, 'api/'))('sharp'); }
catch { console.log('  SKIP: sharp non disponibile'); process.exit(0); }

const TIPI = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.xml': 'application/xml',
  '.txt': 'text/plain' };
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

/* le pagine si deducono dalla sitemap, mai da una lista a mano: una pagina
   nuova entra nel test il giorno che entra nel sito. */
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const pagine = [...sm.matchAll(/<loc>https?:\/\/[^<\/]+\/?([^<]*)<\/loc>/g)]
  .map((m) => m[1].replace(/^\/+/, '')).map((u) => u === '' ? 'index' : u)
  .filter((u) => !u.includes('#')).filter((v, i, a) => a.indexOf(v) === i);

/* La soglia. Una barra opaca misura 0-3 (il filo del bordo inferiore e
   l'antialiasing del testo della barra stessa entrano nella striscia). Le
   pagine rotte misuravano 11-23. 8 sta comodo in mezzo: non grida per un
   pixel di bordo, e non lascia passare un testo leggibile. */
const SOGLIA = 8;
const SEL = '.nav, nav.top';

const br = await chromium.launch(launchOptions());
const rotte = [];
let viste = 0;

for (const u of pagine) {
  const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route('**/*', (r) => {
    const x = r.request().url();
    return (x.startsWith(base) || x.startsWith('data:')) ? r.continue() : r.abort();
  });
  let vive = true;
  try {
    const rs = await pg.goto(`${base}/${u === 'index' ? '' : u}`,
      { waitUntil: 'load', timeout: 20000 });
    if (!rs || rs.status() >= 400) vive = false;
  } catch { vive = false; }
  if (!vive) { await pg.close(); continue; }
  await pg.waitForTimeout(700);

  let peggio = null;
  for (const y of [700, 1400, 2400, 3600]) {
    const info = await pg.evaluate(async ({ S, y }) => {
      const n = document.querySelector(S);
      if (!n) return { senza: true };
      if (document.body.scrollHeight - innerHeight < y - 100) return null;
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 850));   /* transizioni finite */
      const b = n.getBoundingClientRect();
      return { h: Math.round(b.height), fissa: getComputedStyle(n).position === 'fixed' };
    }, { S: SEL, y });
    if (!info) continue;
    if (info.senza) { peggio = { senza: true }; break; }
    if (!info.fissa || info.h < 20) continue;   /* barra non fissa: non copre nulla */
    const buf = await pg.screenshot(
      { clip: { x: 120, y: Math.max(2, info.h - 18), width: 200, height: 14 } });
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let mn = 255, mx = 0;
    for (let i = 0; i < data.length; i += 3) {
      const l = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      if (l < mn) mn = l; if (l > mx) mx = l;
    }
    const d = +(mx - mn).toFixed(1);
    if (!peggio || d > peggio.d) peggio = { d, y };
  }
  await pg.close();
  if (!peggio || peggio.senza) continue;
  viste++;
  if (peggio.d > SOGLIA) rotte.push(`${u} (Δ${peggio.d} a y=${peggio.y})`);
}

check(viste >= 20,
  `il metro passa su tutte le pagine con barra fissa della sitemap (${viste})`);
check(rotte.length === 0,
  'nessuna pagina si legge ATTRAVERSO la testata mentre scorre'
  + (rotte.length ? ' — ' + rotte.join(', ') : ''));

/* La seconda regola, sulla sorgente. Lo sfondo della barra non deve stare
   in `transition`: mentre sfuma per 350ms non copre, cioe' il difetto
   ricompare per un terzo di secondo ogni volta che parti a scorrere —
   proprio l'istante in cui l'occhio e' sulla testata. */
const conTransizione = [];
for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* si guarda il VALORE della transizione, non il blocco: la prima stesura
     prendeva tutta la regola e la normalissima dichiarazione
     `background:linear-gradient(...)` accanto faceva scattare l'allarme —
     una guardia che grida su codice sano si smette di ascoltarla. E si
     scorrono TUTTE le regole .nav del file, non solo la prima. */
  for (const m of t.matchAll(/\.nav\s*\{([^}]*)\}/g)) {
    for (const tr of m[1].matchAll(/transition\s*:\s*([^;}]*)/g)) {
      if (/\ball\b|\bbackground\b/.test(tr[1])) { conTransizione.push(f); break; }
    }
  }
}
check(conTransizione.length === 0,
  'lo sfondo della barra non e in transizione (una superficie che copre non sfuma)'
  + (conTransizione.length ? ' — ' + conTransizione.join(', ') : ''));

await br.close(); srv.close();
console.log(ko ? `  \x1b[31mLa testata non copre\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLa testata copre\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
