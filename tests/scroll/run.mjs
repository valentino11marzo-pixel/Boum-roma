// tests/scroll/run.mjs
// LO SCORRIMENTO NON E' UN DETTAGLIO — quattro regole, in un browser vero.
//
// I reperti che l'hanno fatta nascere, tutti misurati, nessuno supposto:
//  · su 45 fra pagine e viewport un link interno portava il lettore SOTTO
//    la barra fissa: si atterrava a meta' frase, col titolo dietro la nav.
//    `scroll-margin`/`scroll-padding` erano usati sei volte in tutto il
//    sito, con numeri scritti a mano (86, 104, 150px) mentre la barra vera
//    va da 71 a 99px secondo pagina e larghezza.
//  · index.html saltava di 78px al caricamento (CLS 0,058, tutto a y=0):
//    la parola DAYS del titolo e' un tabellone a palette costruito dal JS,
//    largo 4,55em contro i 2,65em del testo.
//  · apartments.html saltava di 119px: il quadro delle zone nasceva alto
//    130px e si riempiva a ~460ms.
//  · owners.html scorreva di lato di 72px per una scritta decorativa.
//
// La riparazione non e' stata quarantacinque pezze: css/boom-scroll.css +
// js/boom-scroll.js sono UN contratto, inline su ogni pagina pubblica, e
// la misura della barra la fa il browser invece di un numero a mano.
//
// Su telefono si controlla TUTTO il sito; a 1440 le pagine che vendono.
// Non e' un campione a caso: e' dove i difetti costano.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
const PORTA = +(process.env.PORTA || 8211);
const CLS_MAX = 0.02;   // «buono» per Google e' 0,1: qui si sta dieci volte sotto

let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const elenco = (r, max = 10) => '\n      ' + r.slice(0, max).join('\n      ')
  + (r.length > max ? `\n      … e altre ${r.length - max}` : '');

const sitemap = fs.readFileSync(path.join(R, 'sitemap.xml'), 'utf8');
const pagine = [];
for (const u of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
  const rel = u.replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/$/, '');
  const f = rel === '' ? 'index.html' : (rel.endsWith('.html') ? rel : rel + '.html');
  if (fs.existsSync(path.join(R, f))) pagine.push(f);
}
const VENDONO = ['index.html', 'apartments.html', 'services.html', 'owners.html',
  'deal-assistance.html', 'virtual-viewing.html', 'contract-check-express.html',
  'deposit-recovery.html', 'remote-move-pack.html', 'concierge.html',
  'property-finding.html', 'executive.html', 'reunion.html', 'welcome-to-rome.html'];

console.log('\n\x1b[1m▸ scroll\x1b[0m  lo scorrimento in un browser vero: '
  + `${pagine.length} pagine a 390px, ${VENDONO.length} anche a 1440px`);

// ── 0 · il contratto c'e' su ogni pagina (statico, gratis) ──────────────
const senza = pagine.filter((f) => !fs.readFileSync(path.join(R, f), 'utf8')
  .includes('<!-- BOOM_SCROLL:START -->'));
senza.length
  ? male(`${senza.length} pagine senza il contratto di scorrimento:` + elenco(senza))
  : bene('il contratto di scorrimento e su ogni pagina pubblica');

const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — le tre regole in browser non girano');
  console.log(ko ? `  \x1b[31m${ko} guasti\x1b[0m` : '  \x1b[32mstatico verde\x1b[0m');
  process.exit(ko ? 1 : 0);
}

const srv = http.createServer((rq, rs) => {
  const f = path.join(R, rq.url.split('?')[0]);
  fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
    : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css'
      : f.endsWith('.js') ? 'text/javascript' : 'text/html'), rs.end(d)));
}).listen(PORTA);

const br = await chromium.launch(await launchOptions());
const sfori = [], salti = [], sotto = [];

async function guarda(f, w, h, mobile) {
  const pg = await br.newPage({ viewport: { width: w, height: h },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  // Si blocca TUTTO cio' che non e' locale: un test di layout non deve
  // dipendere dalla rete, e ogni richiesta esterna che va in timeout costa
  // secondi per pagina. Cosi' e' anche deterministico.
  await pg.route('**/*', (r) => r.request().url().startsWith('http://localhost')
    ? r.continue() : r.abort());
  await pg.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* niente osservatore: la regola si salta, non fallisce */ }
  });
  await pg.goto(`http://localhost:${PORTA}/${f}`, { waitUntil: 'load' });
  await pg.waitForTimeout(1000);

  const d = await pg.evaluate(() => {
    const W = document.documentElement.clientWidth;
    // la barra vera, letta dov'e': sotto il bordo alto della finestra
    const copertura = () => {
      let c = 0;
      for (const e of (document.elementsFromPoint(Math.round(innerWidth / 2), 2) || [])) {
        const s = getComputedStyle(e);
        if (s.position !== 'fixed' && s.position !== 'sticky') continue;
        if (s.visibility === 'hidden' || s.display === 'none') continue;
        const r = e.getBoundingClientRect();
        if (r.top <= 2 && r.height < innerHeight * 0.35 && r.bottom > c) c = r.bottom;
      }
      return c;
    };
    const cop = copertura();
    const male = [];
    const visto = new Set();
    for (const a of document.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute('href').slice(1);
      if (!id || visto.has(id)) continue;
      visto.add(id);
      const t = document.getElementById(id);
      // Una sezione NASCOSTA (il selettore di pubblico della Reunion ne
      // tiene due su tre) non e' un'ancora rotta: e' un'ancora spenta.
      if (!t || !t.getClientRects().length) continue;
      t.scrollIntoView({ block: 'start', behavior: 'instant' });
      // Si misura il PRIMO TESTO, non il bordo della scatola: su
      // /executive e /reunion il <main> comincia a y=0 ma ha 172px di
      // padding, e il titolo sta a 178 — cioe' libero. Guardare la
      // scatola avrebbe segnalato come rotto un caso sano, e una guardia
      // che grida al lupo si smette di ascoltarla.
      let top = t.getBoundingClientRect().top;
      const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (n.textContent.trim().length < 3) continue;
        const e = n.parentElement;
        if (!e || !e.getClientRects().length) continue;
        top = e.getBoundingClientRect().top;
        break;
      }
      if (top < copertura() - 2) male.push('#' + id);
    }
    scrollTo(0, 0);
    return { sforo: document.documentElement.scrollWidth - W,
             cls: +(window.__cls || 0).toFixed(4), ancore: male, cop: Math.round(cop) };
  });
  await pg.close();
  const dove = `${f} @${w}`;
  if (d.sforo > 0) sfori.push(`${dove} → ${d.sforo}px di scorrimento laterale`);
  if (d.cls > CLS_MAX) salti.push(`${dove} → CLS ${d.cls}`);
  if (d.ancore.length) sotto.push(`${dove} → ${d.ancore.slice(0, 4).join(' ')} sotto la barra (${d.cop}px)`);
}

for (const f of pagine) await guarda(f, 390, 844, true);
for (const f of VENDONO) if (pagine.includes(f)) await guarda(f, 1440, 900, false);

await br.close(); srv.close();

sfori.length ? male(`${sfori.length} pagine scorrono di lato — il difetto che fa `
    + 'sembrare rotto un sito:' + elenco(sfori))
  : bene('nessuna pagina scorre lateralmente');
sotto.length ? male(`${sotto.length} pagine con ancore che atterrano sotto la barra:` + elenco(sotto))
  : bene('ogni ancora visibile atterra libera dalla barra fissa');
salti.length ? male(`${salti.length} pagine saltano al caricamento (CLS > ${CLS_MAX}):` + elenco(salti))
  : bene(`nessuna pagina salta al caricamento (CLS ≤ ${CLS_MAX})`);

console.log(ko ? `  \x1b[31mLo scorrimento non e ancora pulito\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLo scorrimento e pulito\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
