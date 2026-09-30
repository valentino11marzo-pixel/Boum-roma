// Fotogrammi e poster della scena, in un Chromium vero (WebGL2 su SwiftShader: lento ma fedele).
// Uso: node shoot.mjs [--T=0.85,2.48] [--solo=desktop|mobile|poster|misura] [--out=<cartella fotogrammi>]
//   · fotogrammi <layout>-<T>.png a 1440x828 (desktop) e 390x844 (mobile, dpr 1,5), con velature e pin
//     come nella pagina: servono a GUARDARE la scena, non vanno nel repo;
//   · poster egidi/img/metodo-1..5.webp a 1200x900, opachi, <= 90 KB: vanno nel repo;
//   · misura: info() della scena alla posa 2,48 e 4,85 (con e senza aggiornamento dell'ombra).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../../tests/_browser.mjs';

const QUI = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(QUI, '../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'egidi-3d-shots')));
const SOLO = arg('solo', 'tutto');
const TEMPI = arg('T', '0.30,0.85,1.30,1.63,1.70,1.86,2.10,2.30,2.48,2.69,2.91,3.40,3.85,4.30,4.85').split(',').map(Number);
const POSTER_T = [0.85, 1.635, 2.48, 3.85, 4.85];

const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPI[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/design/egidi-3d/harness.html`;

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }
const browser = await chromium.launch(launchOptions({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] }));
fs.mkdirSync(OUT, { recursive: true });

async function apri(layout, w, h, dpr, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  console', m.type(), m.text().slice(0, 240)); });
  page.on('pageerror', (e) => console.log('  pageerror', e.message));
  const t0 = Date.now();
  await page.goto(`${BASE}?layout=${layout}&w=${w}&h=${h}&dpr=${dpr}&conserva=1&shot=1${extra}`);
  await page.waitForFunction(() => window.__h, null, { timeout: 60000 });
  await page.evaluate(() => window.__h.pronto);
  console.log(`${layout} ${w}x${h}@${dpr}: pronta in ${Date.now() - t0} ms`);
  return { page, ctx };
}
const nomeT = (T) => T.toFixed(2);

if (SOLO === 'tutto' || SOLO === 'desktop' || SOLO === 'mobile') {
  for (const [layout, w, h, dpr] of [['desktop', 1440, 828, 1], ['mobile', 390, 844, 1.5]]) {
    if (SOLO !== 'tutto' && SOLO !== layout) continue;
    const { page, ctx } = await apri(layout, w, h, dpr);
    for (const T of TEMPI) {
      const t = Date.now();
      const info = await page.evaluate((T) => { window.__h.imposta(T); return window.__h.info(); }, T);
      await page.screenshot({ path: path.join(OUT, `${layout}-${nomeT(T)}.png`) });
      console.log(`  ${layout} T ${nomeT(T)} · ${Date.now() - t} ms · prog ${info.programs} calls ${info.calls} tris ${info.tris}`);
    }
    await ctx.close();
  }
}
if (SOLO === 'tutto' || SOLO === 'poster') {
  const { page, ctx } = await apri('poster', 1200, 900, 1);
  for (const [i, T] of POSTER_T.entries()) {
    const r = await page.evaluate(([T, n]) => window.__h.poster(T, n), [T, i + 1]);
    const buf = Buffer.from(r.url.split(',')[1], 'base64');
    const f = path.join(REPO, `egidi/img/metodo-${i + 1}.webp`);
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
    fs.writeFileSync(path.join(OUT, `poster-${i + 1}.webp`), buf);
    await page.evaluate((u) => { document.body.innerHTML = `<img src="${u}" style="position:fixed;left:0;top:0;width:1200px;height:900px">`; }, r.url);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `poster-${i + 1}.png`) });
    await page.goto(page.url()); await page.waitForFunction(() => window.__h); await page.evaluate(() => window.__h.pronto);
    console.log(`  poster ${i + 1} (T ${T}) · ${buf.length} B · q ${r.q}`);
  }
  await ctx.close();
}
if (SOLO === 'tutto' || SOLO === 'misura') {
  const { page, ctx } = await apri('desktop', 1440, 828, 1);
  for (const T of [2.48, 4.85]) {
    const r = await page.evaluate((T) => {
      const S = window.__h.scena(), R = S.renderer;
      window.__h.imposta(T - 0.2); window.__h.imposta(T); const conOmbra = window.__h.info();
      window.__h.imposta(T); const vista = window.__h.info();
      return { conOmbra, vista, geometrie: R.info.memory.geometries, texture: R.info.memory.textures };
    }, T);
    console.log(`  misura T ${T}: ${JSON.stringify(r)}`);
  }
  await ctx.close();
}
await browser.close(); server.close();
