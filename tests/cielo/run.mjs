// tests/cielo/run.mjs — LA STRISCIA DELL'OROLOGIO SU IPHONE (22/10/2026).
//
// «Su iPhone l'header rimane bloccato e il sito scorre sopra di lui»: in
// Safari 26 la striscia dietro l'orologio non viene da theme-color ma da
// un campione. WebKit (LocalFrameView::fixedContainerEdges) colpisce UN
// punto — il centro, 4px sotto il bordo — ignorando pointer-events, e
// risale dall'elemento colpito alla prima barra fissa o sticky larga
// almeno il 90% e alta piu' di 10px. Un pseudo-elemento colpito conta come
// il suo host (HitTestResult::setInnerNonSharedNode). Sulla home e su altre
// quindici pagine la grana del fondo (`body::before`, fissa, z-index 9999)
// stava SOPRA la testata: il punto colpiva <body>, nessuna barra, e Safari
// lasciava vedere la pagina che scorre dietro l'orologio.
//
// Chromium non ha questo campione, quindi il test lo rifà: stessa x, stessa
// y, pointer-events forzati ad auto (come l'hit test di WebKit), la stessa
// risalita. Poi la prova che il test morde: la home SENZA la regola deve
// colpire <body>.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { scrollBlock, markedFiles } from '../../scripts/scroll-sync.mjs';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let ko = 0, ok = 0;
const bene = (m) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const male = (m) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + m); };
const check = (c, m) => (c ? bene(m) : male(m));
console.log('\n\x1b[1m▸ cielo\x1b[0m  la striscia dell\'orologio su iPhone: la testata, non la grana, è ciò che Safari 26 campiona');

// ── 1 · statico: una sorgente, le copie uguali, la regola c'è ───────────
const css = fs.readFileSync(path.join(R, 'css/boom-scroll.css'), 'utf8');
check(/body::before,\s*body::after\s*\{\s*z-index:\s*1\s*!important;\s*\}/.test(css), 'css/boom-scroll.css abbassa la grana sotto ogni testata (body::before, body::after z-index 1)');
const block = scrollBlock(R);
const files = markedFiles(R);
const stale = files.filter((f) => { const s = fs.readFileSync(f, 'utf8'); const i = s.indexOf('<!-- BOOM_SCROLL:START -->'); const j = s.indexOf('<!-- BOOM_SCROLL:END -->'); return s.slice(i, j + '<!-- BOOM_SCROLL:END -->'.length) !== block; });
check(files.length >= 60 && stale.length === 0, `le ${files.length} copie inline del contratto sono uguali alla sorgente${stale.length ? ' — vecchie: ' + stale.map((f) => path.relative(R, f)).join(', ') : ''} (node scripts/scroll-sync.mjs)`);
const { createRequire } = await import('node:module');
const nb = createRequire(import.meta.url)(path.join(R, 'scripts/neighborhoods-build.js'));
check(nb.SCROLL_BLOCK === block, 'il generatore dei quartieri stampa lo stesso blocco (letto dalla sorgente, non una copia a mano)');

// ── 2 · in un browser: il punto di Safari colpisce la testata ───────────
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — il campione in browser non gira');
  console.log(`  ${ok} passed, ${ko} failed`); process.exit(ko ? 1 : 0);
}
const pages = files.map((f) => path.relative(R, f)).filter((f) => !f.startsWith('design/'));
const NO_RULE = '/__senza-regola/index.html';
const srv = http.createServer((rq, rs) => {
  let u = decodeURIComponent(rq.url.split('?')[0].split('#')[0]);
  let body = null, f;
  if (u === NO_RULE) {
    body = fs.readFileSync(path.join(R, 'index.html'), 'utf8').replace(/body::before, body::after \{ z-index: 1 !important; \}/, '');
    f = 'x.html';
  } else {
    f = path.join(R, u);
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.statusCode = 404; return rs.end(); }
  }
  rs.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'text/html');
  rs.end(body !== null ? body : fs.readFileSync(f));
}).listen(0);
const port = srv.address().port;
const br = await chromium.launch(launchOptions());
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());

const probe = async (url) => {
  const p = await ctx.newPage();
  try {
    await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load', timeout: 20000 });
    await p.waitForTimeout(400);
    await p.evaluate(() => window.scrollTo(0, 900));
    await p.waitForTimeout(500);
    return await p.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      // the page's own fixed bars at the top edge (none = nothing to colour)
      const bars = [...document.querySelectorAll('body *')].filter((e) => {
        const s = getComputedStyle(e); if (s.position !== 'fixed' && s.position !== 'sticky') return false;
        if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.1) return false;
        const r = e.getBoundingClientRect(); return r.top <= 4 && r.bottom > 4 && r.width >= W * 0.9 && r.height > 10 && r.height <= H * 0.35;
      });
      // every body pseudo is the grain: fixed, nearly invisible, inert
      const pseudo = ['::before', '::after'].map((w) => { const s = getComputedStyle(document.body, w); return s.content === 'none' || s.content === 'normal' ? null : { pos: s.position, op: +s.opacity, pe: s.pointerEvents }; }).filter(Boolean);
      // WebKit's hit test ignores pointer-events: emulate it, then undo
      const st = document.createElement('style'); st.textContent = '*,*::before,*::after{pointer-events:auto !important}';
      document.head.appendChild(st);
      let t = document.elementFromPoint(Math.round(W / 2), 4);
      st.remove();
      const hit = t ? (t === document.body ? 'body' : t === document.documentElement ? 'html' : t.tagName.toLowerCase() + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '')) : null;
      let bar = null;
      for (; t && t !== document.body && t !== document.documentElement; t = t.parentElement) {
        const s = getComputedStyle(t); if (s.position !== 'fixed' && s.position !== 'sticky') continue;
        const r = t.getBoundingClientRect(); if (r.width >= W * 0.9 && r.height > 10) { bar = t.tagName.toLowerCase(); break; }
      }
      return { bars: bars.length, hit, bar, pseudo };
    });
  } catch (e) { return { err: e.message.slice(0, 120) }; }
  finally { await p.close(); }
};

const fail = [], skip = [], badPseudo = [];
for (const f of pages) {
  const r = await probe(f);
  if (r.err) { fail.push(`${f} (${r.err})`); continue; }
  if (r.pseudo.some((x) => x.pos !== 'fixed' || x.op > 0.05 || x.pe !== 'none')) badPseudo.push(`${f} ${JSON.stringify(r.pseudo)}`);
  if (!r.bars) { skip.push(f); continue; }
  if (!r.bar) fail.push(`${f} (il punto colpisce ${r.hit})`);
}
check(fail.length === 0, `su ${pages.length - skip.length} pagine con una barra fissa, il punto di Safari (centro, 4px) risale alla testata, non a <body>${fail.length ? ':\n      ' + fail.join('\n      ') : ''}`);
check(badPseudo.length === 0, `ogni pseudo-elemento di body è la grana (fissa, opacità ≤ 0,05, inerte): la regola condivisa non può abbassare un livello vero${badPseudo.length ? ':\n      ' + badPseudo.join('\n      ') : ''}`);
console.log(`    (senza barra fissa in alto, quindi niente da colorare: ${skip.join(', ') || 'nessuna'})`);
const mut = await probe(NO_RULE.slice(1));
check(mut.hit === 'body' && mut.bar === null, `il test morde: la home SENZA la regola colpisce ${mut.hit} — il bug segnalato dal fondatore`);
await br.close(); srv.close();
console.log(ko ? `  \x1b[31m${ok} passed, ${ko} failed\x1b[0m` : `  \x1b[32mLa striscia dell'orologio è della testata\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
