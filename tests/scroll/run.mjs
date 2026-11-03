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
//  · un link profondo aperto da FUORI (/services#landlords, una pagina
//    nuova) atterrava sotto la barra: js/boom-scroll.js misurava nella
//    <head>, quando <body> non c'e' ancora, trovava zero e scriveva
//    --boom-barra:0px — e il browser calcolava lo scorrimento al
//    frammento con 18px di margine invece di barra+18. La rimisura al
//    `load` arrivava dopo, e nessuno riscorreva. A 1440 la sezione finiva
//    a 2px sotto una barra di 113. scrollIntoView() dopo il caricamento
//    (la regola 2) non lo poteva vedere: la regola 4 apre la pagina come
//    la apre chi arriva da un link, da about:blank col frammento.
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
import { scrollBlock } from '../../scripts/scroll-sync.mjs';

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

// Le mutazioni (regola 5): la sorgente vera, con UN pezzo tolto. Se il
// test resta verde senza quel pezzo, il pezzo non serve o il test e' cieco.
const PRIMA_MISURA = "  if (document.readyState !== 'loading') misura();\n"
  + "  else addEventListener('DOMContentLoaded', function () { misura(); piano(); });";
const RIPORTA = '    riporta(prima);\n';
const BLOCCO = scrollBlock(R);
const muta = (html, via) => {
  for (const v of via) {
    if (!html.includes(v[0])) throw new Error('mutazione senza bersaglio: ' + v[0].slice(0, 60));
    html = html.replace(v[0], v[1]);
  }
  return html;
};
// La barra che cresce DOPO lo scorrimento al frammento e PRIMA del load
// (un'immagine lenta tiene il load): il caso che solo `riporta` sistema.
const CRESCE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px/1.4 sans-serif}#barra{position:fixed;top:0;left:0;right:0;height:40px;background:#111;color:#fff}
.riempi{height:2000px}#meta{height:1500px}#meta h2{margin:0}</style>
${BLOCCO}
</head><body><div id="barra">BOOM</div><div class="riempi"></div>
<section id="meta"><h2>Il titolo della sezione</h2></section><div class="riempi"></div>
<img src="/__lento.png" alt="">
<script>
// La barra cresce DOPO il salto al frammento e dopo l'ultima misura che lo
// script fa prima del load: nel fotogramma del salto il suo rAF (registrato
// per primo, nella head) misura 40, poi questo la porta a 100. Legato
// all'evento, non a un orologio: su una macchina lenta l'ordine non cambia.
addEventListener('scroll', function () {
  requestAnimationFrame(function () { document.getElementById('barra').style.height = '100px'; });
}, { once: true });
</script>
</body></html>`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// Le varianti si preparano adesso: se js/boom-scroll.js cambia e un pezzo
// da togliere non c'e' piu', lo si dice qui, non con un server che muore.
let finte = {};
try {
  finte = {
    // la pagina vera al suo indirizzo (i percorsi relativi restano giusti)
    '/services.html?muta=testa': muta(fs.readFileSync(path.join(R, 'services.html'), 'utf8'),
      [[PRIMA_MISURA, '  misura();'], [RIPORTA, '']]),
    '/__cresce.html': CRESCE,
    '/__cresce-senza-riporta.html': muta(CRESCE, [[RIPORTA, '']]),
  };
} catch (e) {
  male(`${e.message} — js/boom-scroll.js e' cambiato: aggiorna PRIMA_MISURA/RIPORTA in questo test`);
}
const srv = http.createServer((rq, rs) => {
  const u = rq.url.split('?')[0].split('#')[0];
  const muto = finte[rq.url.split('#')[0]];
  if (muto) { rs.setHeader('content-type', 'text/html'); return rs.end(muto); }
  if (u === '/__lento.png') {
    return setTimeout(() => { rs.setHeader('content-type', 'image/png'); rs.end(PNG); }, 2000);
  }
  if (finte[u]) { rs.setHeader('content-type', 'text/html'); return rs.end(finte[u]); }
  const f = path.join(R, u);
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
  const id = await pg.evaluate(SCEGLI);
  if (id && !scelto[f]) scelto[f] = id;
  await pg.close();
  const dove = `${f} @${w}`;
  if (d.sforo > 0) sfori.push(`${dove} → ${d.sforo}px di scorrimento laterale`);
  if (d.cls > CLS_MAX) salti.push(`${dove} → CLS ${d.cls}`);
  if (d.ancore.length) sotto.push(`${dove} → ${d.ancore.slice(0, 4).join(' ')} sotto la barra (${d.cop}px)`);
}

// ── 4 · il link profondo da fuori: una pagina NUOVA col frammento ──────
// Il candidato e' la prima sezione con id che obbliga a scorrere (sta
// oltre i tre quarti della prima schermata) — il caso vero di chi apre
// /pagina#sezione da un messaggio. Prima le <section id>, poi i bersagli
// dei link interni, poi un blocco qualunque con id. Lo sceglie il caricamento normale qui
// sopra, dove la pagina e' gia' aperta: nessun caricamento in piu'.
const SCEGLI = () => {
  const H = innerHeight, max = document.documentElement.scrollHeight - H;
  const viste = [];
  const prendi = (e) => {
    if (!e || !e.id || viste.includes(e)) return;
    if (!e.getClientRects().length || e.closest('[data-scroll-libero]')) return;
    if (getComputedStyle(e).position === 'fixed') return;
    viste.push(e);
  };
  document.querySelectorAll('section[id]').forEach(prendi);
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    let id = a.getAttribute('href').slice(1);
    try { id = decodeURIComponent(id); } catch (e) { continue; }
    prendi(document.getElementById(id));
  }
  const scegli = (lista) => {
    const giu = lista.filter((e) => e.getBoundingClientRect().top + scrollY >= H * 0.75);
    return giu.find((e) => e.getBoundingClientRect().top + scrollY <= max) || giu[0];
  };
  let t = scegli(viste);
  if (!t) {
    // Pagine senza <section id> (blog, moduli, bollettini): l'ultima
    // risorsa e' un blocco con id — un contenitore che qualcuno puo'
    // linkare. Mai un pezzo di testo in linea, mai cio' che sta in una
    // barra o in un pannello fisso.
    const INLINE = /^(A|B|BUTTON|CANVAS|EM|I|IMG|INPUT|LABEL|OPTION|SELECT|SMALL|SPAN|STRONG|SUP|SUB|TEXTAREA|VIDEO)$/;
    const blocchi = [];
    for (const e of document.body.querySelectorAll('[id]')) {
      if (!(e instanceof HTMLElement) || INLINE.test(e.tagName)) continue;
      if (!e.getClientRects().length || e.getBoundingClientRect().height < 20) continue;
      if (e.closest('[data-scroll-libero], nav, header, dialog')) continue;
      let fisso = false;
      for (let a = e; a && a !== document.body; a = a.parentElement) {
        const p = getComputedStyle(a).position;
        if (p === 'fixed' || p === 'sticky') { fisso = true; break; }
      }
      if (!fisso) blocchi.push(e);
    }
    t = scegli(blocchi);
  }
  return t ? t.id : null;
};
const profondi = [];   // [file, larghezza, altezza, mobile, id]
const scelto = {};     // file → id scelto al caricamento normale

async function profondo(f, w, h, mobile, id, { tocca = false } = {}) {
  const pg = await br.newPage({ viewport: { width: w, height: h },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await pg.route('**/*', (r) => r.request().url().startsWith('http://localhost')
    ? r.continue() : r.abort());
  await pg.goto('about:blank');
  const url = `http://localhost:${PORTA}/${f}#${encodeURIComponent(id)}`;
  if (tocca) {
    // il lettore preme un tasto mentre la pagina carica: da li' guida lui
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(500);
    await pg.keyboard.press('Shift');
    await pg.waitForLoadState('load');
  } else await pg.goto(url, { waitUntil: 'load' });
  await pg.waitForTimeout(1000);
  // Molte pagine hanno html{scroll-behavior:smooth} e Chromium anima
  // anche lo scorrimento al frammento: si aspetta che sia fermo (al
  // massimo un secondo e mezzo in piu'), poi si misura.
  for (let i = 0, y = -1; i < 10; i++) {
    const ora = await pg.evaluate(() => scrollY);
    if (ora === y) break;
    y = ora; await pg.waitForTimeout(150);
  }
  const d = await pg.evaluate((id) => {
    let bar = 0;
    for (const e of (document.elementsFromPoint(Math.round(innerWidth / 2), 2) || [])) {
      const s = getComputedStyle(e);
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (r.top <= 2 && r.height < innerHeight * 0.35 && r.bottom > bar) bar = r.bottom;
    }
    const t = document.getElementById(id);
    if (!t || !t.getClientRects().length) return { assente: true };
    const box = t.getBoundingClientRect().top;
    let testo = box;
    const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.textContent.trim().length < 3) continue;
      const e = n.parentElement;
      if (!e || !e.getClientRects().length) continue;
      testo = e.getBoundingClientRect().top;
      break;
    }
    const atteso = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop || 0)
      + parseFloat(getComputedStyle(t).scrollMarginTop || 0);
    const max = document.documentElement.scrollHeight - innerHeight;
    return { bar: Math.round(bar), box: Math.round(box), testo: Math.round(testo),
      atteso: Math.round(atteso), sy: Math.round(scrollY),
      // il frammento puo' portare la sezione in cima solo se la pagina
      // ha abbastanza strada sotto: altrimenti si ferma in fondo, piu' giu'
      raggiunge: box + scrollY - atteso <= max + 1 };
  }, id);
  await pg.close();
  return d;
}

// Quattro pagine alla volta: ogni pagina e' isolata (il suo viewport, la
// sua storia), e un telefono vero carica in condizioni peggiori di queste.
async function aGruppi(lavori, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < lavori.length) { const k = i++; out[k] = await fn(lavori[k]); }
  }));
  return out;
}

for (const f of pagine) await guarda(f, 390, 844, true);
for (const f of VENDONO) if (pagine.includes(f)) await guarda(f, 1440, 900, false);

// Ogni pagina, telefono e desktop. Il candidato e' quello del telefono
// (la pagina piu' lunga): a 1440 lo stesso id deve atterrare uguale.
const senzaCandidato = pagine.filter((f) => !scelto[f]);
for (const f of pagine) if (scelto[f]) {
  profondi.push([f, 390, 844, true, scelto[f]], [f, 1440, 900, false, scelto[f]]);
}
const esiti = await aGruppi(profondi, 4, (l) => profondo(...l));
const sottoProfondo = [], vuoto = [], spento = [];
let conBarra = 0, senzaBarra = 0;
esiti.forEach((d, k) => {
  const [f, w, , , id] = profondi[k];
  const dove = `${f}#${id} @${w}`;
  if (d.assente) { spento.push(dove); return; }
  if (d.bar > 0) {
    conBarra++;
    // la regola: il primo testo della sezione sta sotto la barra, non dietro
    if (d.testo < d.bar - 2) sottoProfondo.push(`${dove} → testo a ${d.testo}px sotto una barra di ${d.bar}px (scrollY ${d.sy})`);
  } else {
    senzaBarra++;
    // senza barra la sezione arriva al margine di 18px, non al ripiego
    // di 76: nessun buco sopra il titolo
    if (d.raggiunge && d.box > d.atteso + 3) vuoto.push(`${dove} → ${d.box}px dal bordo invece di ${d.atteso}`);
  }
});

// ── 5 · le mutazioni: senza il pezzo nuovo, il difetto torna ──────────
const mutabili = Object.keys(finte).length === 3;
const testa = mutabili && await profondo('services.html?muta=testa', 1440, 900, false, 'tenants');
const cresce = mutabili && await profondo('__cresce.html', 390, 844, true, 'meta');
const fermo = mutabili && await profondo('__cresce.html', 390, 844, true, 'meta', { tocca: true });
const senzaRiporta = mutabili && await profondo('__cresce-senza-riporta.html', 390, 844, true, 'meta');

await br.close(); srv.close();

sfori.length ? male(`${sfori.length} pagine scorrono di lato — il difetto che fa `
    + 'sembrare rotto un sito:' + elenco(sfori))
  : bene('nessuna pagina scorre lateralmente');
sotto.length ? male(`${sotto.length} pagine con ancore che atterrano sotto la barra:` + elenco(sotto))
  : bene('ogni ancora visibile atterra libera dalla barra fissa');
salti.length ? male(`${salti.length} pagine saltano al caricamento (CLS > ${CLS_MAX}):` + elenco(salti))
  : bene(`nessuna pagina salta al caricamento (CLS ≤ ${CLS_MAX})`);
sottoProfondo.length ? male(`${sottoProfondo.length} link profondi aperti da fuori atterrano sotto la barra:` + elenco(sottoProfondo))
  : bene(`ogni link profondo aperto da fuori atterra libero dalla barra (${conBarra} con barra, 390 e 1440)`);
vuoto.length ? male(`${vuoto.length} pagine senza barra lasciano un buco sopra la sezione:` + elenco(vuoto))
  : bene(`senza barra il link profondo arriva al margine, senza buco (${senzaBarra})`);
spento.length ? male(`${spento.length} sezioni scelte al telefono non esistono piu' a 1440:` + elenco(spento))
  : bene('la sezione scelta esiste su telefono e desktop');
if (mutabili) {
  testa.testo < testa.bar - 2
    ? bene(`con la misura nella head (il codice di prima) services#tenants torna sotto la barra: testo a ${testa.testo}px, barra ${testa.bar}px — la regola 4 morde`)
    : male(`con la misura nella head services#tenants atterra a ${testa.testo}px (barra ${testa.bar}px): la regola 4 non vede il difetto che deve fermare`);
  cresce.bar === 100 && cresce.testo >= cresce.bar - 2
    ? bene(`la barra cresciuta dopo il frammento (40→100px) viene recuperata al load: titolo a ${cresce.testo}px`)
    : male(`barra cresciuta dopo il frammento: titolo a ${cresce.testo}px sotto una barra di ${cresce.bar}px — al load nessuno lo ha riportato`);
  fermo.testo < fermo.bar - 2 && Math.abs(fermo.testo - 58) <= 3
    ? bene(`se il lettore ha premuto un tasto prima del load, il frammento resta dove il browser l'ha messo (${fermo.testo}px): la pagina non gli si muove sotto`)
    : male(`il lettore aveva toccato la tastiera e la pagina l'ha mosso lo stesso (titolo a ${fermo.testo}px, atteso 58)`);
  senzaRiporta.testo < senzaRiporta.bar - 2
    ? bene(`senza il recupero al load lo stesso caso resta sotto la barra (${senzaRiporta.testo}px su ${senzaRiporta.bar}): il recupero serve, non e' decorazione`)
    : male(`senza il recupero al load il caso della barra che cresce passa lo stesso (${senzaRiporta.testo}px): la prova non distingue`);
}
if (senzaCandidato.length) console.log(`    (${senzaCandidato.length} pagine senza una sezione da raggiungere scorrendo: `
  + senzaCandidato.join(', ') + ')');

console.log(ko ? `  \x1b[31mLo scorrimento non e ancora pulito\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLo scorrimento e pulito\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
