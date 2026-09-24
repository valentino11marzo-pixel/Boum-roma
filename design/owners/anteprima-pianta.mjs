// design/owners/anteprima-pianta.mjs — IL BANCO DI PROVA della pianta (pezzo A).
//
//   node design/owners/anteprima-pianta.mjs [--shots <cartella>] [--misure]
//
// Costruisce una pagina autonoma (in os.tmpdir()) con pianta.css e il markup
// di riquadro() dentro il DOM del contratto (.cornice > #riquadro + #alza,
// html.js), la apre in Chromium a 320/390/1440 px e MISURA:
//   · document.getAnimations() vuoto al caricamento;
//   · alla fine della fase 1 i 4 marcatori della piatta ruotata coincidono
//     con quelli dell'alzata proiettata alla build (±1 px);
//   · etichette >= 44x44, dentro il riquadro, senza sovrapposizioni, piatte
//     E alzate (e senza JS); il timbro «Alza» non ne copre nessuna;
//   · scrollWidth === clientWidth; nessuna richiesta di rete; CLS 0 al tocco;
//   · con prefers-reduced-motion e con html.still: .alzata subito, zero
//     animazioni; con html.flat la salita non parte;
//   · il sole NOAA contro valori noti per Roma (±1°) e le quattro didascalie;
//   · i byte: SVG (riquadro + ritagli + accesa + palazzo) <= 8 KB gzip,
//     js/owners-pianta.js <= 3 KB gzip; CSS e build d'accordo su s e ASPECT.
// Esegue TUTTI i controlli, li stampa, ed esce con codice 1 se uno fallisce.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as P from './pianta.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const ROOT = join(QUI, '..', '..');
const { loadChromium, launchOptions } = await import(pathToFileURL(join(ROOT, 'tests', '_browser.mjs')).href);
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : join(tmpdir(), 'owners-pianta');
const MISURE = argv.includes('--misure');
mkdirSync(SHOTS, { recursive: true });

let falliti = 0, passati = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { passati++; console.log('  ok  ' + msg + (extra ? '  ' + extra : '')); }
  else { falliti++; console.log('  NO  ' + msg + (extra ? '  ' + extra : '')); }
};

const CSS = readFileSync(join(QUI, 'pianta.css'), 'utf8');
const JSF = readFileSync(join(ROOT, 'js', 'owners-pianta.js'), 'utf8');
const J = JSON.parse(readFileSync(join(QUI, 'pianta.json'), 'utf8'));
const require = createRequire(import.meta.url);
const BP = require(join(ROOT, 'js', 'owners-pianta.js'));

// ------------------------------------------------------------ 1 · in Node
console.log('\n· la sorgente e la build');
const area = P.superficie();
ok(Math.abs(area - 70) <= 3, 'superficie calpestabile 70 m² ±3', `${area.toFixed(2)} m²`);
const [, , VW, VH] = P.VIEWBOX;
ok(Math.abs(VW / VH - P.ASPECT) < 1e-3, 'viewBox con l\'aspetto ASPECT', `${VW}×${VH} = ${(VW / VH).toFixed(4)}`);
ok(CSS.includes(`aspect-ratio:${VW}/${VH}`), 'pianta.css: aspect-ratio = viewBox della build');
ok(CSS.includes(`rotateX(${J.alzata.rotateX}deg) rotateZ(${J.alzata.rotateZ}deg) scale(${String(P.s).replace(/^0\./, '.')})`), 'pianta.css: la matrice M = quella della build', `s=${P.s}`);
ok(P.M.length === 6 && P.M.every(Number.isFinite), 'M ha 6 coefficienti finiti', JSON.stringify(P.M));
ok(P.ALZATA_ENTRA, 'con s dal JSON l\'alzata (+4%) sta nel riquadro della piatta: il riquadro non cresce');
ok(!/perspective|preserve-3d/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')), 'niente perspective, niente preserve-3d');
ok(!/will-change/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.riquadro\.alzando \.piatta\{[^}]*\}/, '')), 'will-change solo durante la salita');
const MARKUP = P.riquadro();
const EXTRA = P.STANZE.map(P.ritaglio).join('') + P.accesa() + P.palazzo();
const gzSvg = gzipSync(MARKUP + EXTRA).length, gzJs = gzipSync(JSF).length;
ok(gzSvg <= 8192, 'SVG inline (riquadro + 6 ritagli + accesa + palazzo) <= 8 KB gzip', `${gzSvg} B (${(MARKUP + EXTRA).length} B crudi)`);
ok(gzJs <= 3072, 'js/owners-pianta.js <= 3 KB gzip', `${gzJs} B`);
ok(P.riquadro() === MARKUP, 'build deterministica (due chiamate, stessi byte)');
ok(!/https?:\/\//.test(MARKUP.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '') + EXTRA), 'nessun URL esterno nel markup');
const ETI = [['porta', 'Porta', '#porta'], ['cassaforte', 'Armadio', '#cassaforte'], ['soggiorno', 'Soggiorno', '#soggiorno'], ['cucina', 'Cucina', '#cucina'], ['scrivania', 'Scrivania', '#scrivania'], ['cassetta', 'Cassetta', '#cassetta']];
const navM = MARKUP.match(/<nav class="stanze" aria-label="Le stanze">([\s\S]*?)<\/nav>/);
ok(!!navM, '<nav class="stanze" aria-label="Le stanze">');
const as = navM ? [...navM[1].matchAll(/<a class="et[^"]*" href="([^"]+)" data-stanza="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)] : [];
ok(as.length === 6 && ETI.every(([st, t, h], i) => as[i] && as[i][1] === h && as[i][2] === st && as[i][3].replace(/<[^>]+>/g, '').startsWith(t)), 'sei etichette nell\'ordine della camminata, href e testo del contratto');
ok(/serratura spenta/.test(as[0]?.[3] || '') && /cassaforte spenta/.test(as[1]?.[3] || '') && /⚑/.test(as[0]?.[3] || ''), 'le due luci spente dicono «⚑ … spenta» a parole');
ok(/<symbol id="pp" viewBox=/.test(MARKUP) && /class="piatta"/.test(MARKUP) && /<svg class="alzata"/.test(MARKUP) && /class="m1"/.test(MARKUP) && /class="m2"/.test(MARKUP) && /class="m3"/.test(MARKUP) && /<g class="sole"/.test(MARKUP), 'symbol #pp, piatta, alzata con m1 m2 m3 e <g class="sole">');
ok(/var\(--f-serratura,/.test(MARKUP) && /var\(--f-cassaforte,/.test(MARKUP), 'bandiere su var(--f-serratura) e var(--f-cassaforte)');
ok(P.STANZE.every((st) => MARKUP.includes(`var(--r-${st},`)), 'ogni stanza del contratto ha il suo poligono var(--r-…)');
let lancia = false; try { P.ritaglio('balcone'); } catch { lancia = true; }
ok(lancia, 'ritaglio() rifiuta una stanza che non esiste');
const mk = P.markers();
ok(mk.length === 4 && mk.every((m) => m.alzata.every((v) => v >= 0 && v <= 100)), 'markers(): 4 spigoli, proiettati dentro il riquadro');

// ------------------------------------------------------------ 2 · il sole
console.log('\n· il sole (NOAA) contro valori noti per Roma, 41,9028 N 12,4964 E');
// Riferimenti INDIPENDENTI: le posizioni date da SunCalc 1.9.0 (V. Agafonkin,
// algoritmo diverso da quello NOAA di js/owners-pianta.js) per gli stessi
// istanti; l'implementazione NOAA ci sta dentro 0,25°. In più la geometria
// del mezzogiorno all'equinozio: elevazione ≈ 90° − latitudine.
const RIF = [
  { t: '2026-06-21T11:00:00Z', az: 171.36, el: 71.37, nota: 'solstizio d\'estate, 13:00 a Roma' },
  { t: '2026-12-21T08:30:00Z', az: 142.77, el: 15.13, nota: 'solstizio d\'inverno, 09:30' },
  { t: '2026-09-23T15:42:00Z', az: 256.14, el: 14.84, nota: 'equinozio d\'autunno, 17:42' },
  { t: '2026-03-20T11:05:00Z', az: 175.17, el: 47.76, nota: 'equinozio di primavera, 12:05' }
];
for (const r of RIF) {
  const q = BP.posizioneSole(new Date(r.t), 41.9028, 12.4964);
  ok(Math.abs(q.azimuth - r.az) <= 1 && Math.abs(q.elevation - r.el) <= 1, `${r.nota}: az ${r.az}° el ${r.el}°`, `→ ${q.azimuth.toFixed(2)}° / ${q.elevation.toFixed(2)}°`);
}
// mezzogiorno solare all'equinozio: il massimo dell'elevazione ≈ 90 − lat
let emax = -99; for (let m = 9 * 60; m < 15 * 60; m++) emax = Math.max(emax, BP.posizioneSole(new Date(Date.UTC(2026, 2, 20, 0, m)), 41.9028, 12.4964).elevation);
ok(Math.abs(emax - (90 - 41.9028 - 0.1)) <= 1, 'culminazione all\'equinozio ≈ 90° − latitudine', `${emax.toFixed(2)}°`);
const DS = JSON.parse((MARKUP.match(/data-sole='([^']+)'/) || [])[1] || '{}');
const casi = [
  ['2026-09-23T15:42:00Z', 'entra', 'Roma, 17:42 · la luce entra come adesso'],
  ['2026-09-23T08:05:00Z', 'nonentra', "Roma, 10:05 · a quest'ora il sole non entra da questa finestra"],
  ['2026-09-23T19:10:00Z', 'tramontato', 'Roma, 21:10 · il sole è tramontato'],
  ['2026-09-23T03:40:00Z', 'nonsorto', 'Roma, 05:40 · il sole non è ancora sorto']
];
for (const [t, st, testo] of casi) {
  const L = BP.luceSole(new Date(t), DS);
  ok(L.stato === st && L.testo === testo && (st === 'entra' ? L.poligoni.length === 2 : L.poligoni.length === 0), `didascalia «${testo}»`, `${L.poligoni.length} poligoni`);
}

// ------------------------------------------------------------ 3 · il browser
const pagina = (cls, extraHead = '') => `<!doctype html><html lang="it" class="${cls}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco della pianta</title>${extraHead}
<style>html,body{margin:0;background:#060607;color:#e8e4d8;font:300 16px/1.5 'Helvetica Neue',Helvetica,Arial,sans-serif}
.casa{padding:16px}.colpianta{max-width:560px}@media (min-width:1100px){.colpianta{width:560px}}
.didas,.sole-didas{font-size:14px;color:#aaa698;margin:8px 0 0}.dopo{max-width:560px}.stanza{margin:24px 0}
${CSS}</style></head><body><main id="main"><div class="casa">
<aside class="colpianta" id="pianta" aria-label="La pianta della casa d'esempio"><div class="cornice"><div class="riquadro" id="riquadro">
<!-- OWNERS_PIANTA:START -->${MARKUP}<!-- OWNERS_PIANTA:END -->
<button id="alza" class="alza" type="button">↥ Alza la pianta</button></div></div>
<p class="didas" id="didas">In ogni stanza resta una carta. Due luci restano spente: te le spieghiamo per prime ↓</p>
<p class="sole-didas" id="soleDidas"></p></aside>
<div class="dopo">${P.STANZE.map((st) => `<section class="stanza" id="${st}"><h2>${st}</h2>${P.ritaglio(st)}</section>`).join('')}</div></div>
<section id="acceso">${P.accesa()}<details id="portafogli" open><summary>Più case</summary>${P.palazzo()}</details></section></main>
<script>${JSF}</script><script>window.__track=[];window.boomTrack=function(e,p){__track.push([e,p])};
document.getElementById('alza').addEventListener('click',function(){BOOM_PIANTA.alza('bottone')});
window.__cls=0;try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(!e.hadRecentInput)__cls+=e.value})}).observe({type:'layout-shift',buffered:true})}catch(e){}</script></body></html>`;
const FILE = join(tmpdir(), 'owners-pianta-banco.html');
const scrivi = (cls, extra) => { writeFileSync(FILE, pagina(cls, extra)); return pathToFileURL(FILE).href; };

const chromium = await loadChromium();
if (!chromium) { console.log('\nSKIP: playwright non trovato — i controlli nel browser non sono girati'); process.exit(falliti ? 1 : 0); }
const browser = await chromium.launch(launchOptions());

async function etichette(page) {
  return page.evaluate(() => {
    const R = document.getElementById('riquadro').getBoundingClientRect();
    const et = [...document.querySelectorAll('.et')].map((a) => { const r = a.getBoundingClientRect(); return { s: a.dataset.stanza, x: r.left, y: r.top, w: r.width, h: r.height }; });
    const b = document.getElementById('alza'), bs = getComputedStyle(b);
    const br = b.getBoundingClientRect();
    return { R: { x: R.left, y: R.top, w: R.width, h: R.height }, et, alza: bs.display !== 'none' && bs.visibility !== 'hidden' ? { s: 'alza', x: br.left, y: br.top, w: br.width, h: br.height } : null };
  });
}
function controllaEtichette(m, tag) {
  const E = m.et, R = m.R, t = 0.5;
  ok(E.every((e) => e.w >= 44 - 0.01 && e.h >= 44 - 0.01), `${tag}: sei bersagli >= 44×44`, E.map((e) => `${e.s} ${e.w.toFixed(0)}×${e.h.toFixed(0)}`).join(' · '));
  ok(E.every((e) => e.x >= R.x - t && e.y >= R.y - t && e.x + e.w <= R.x + R.w + t && e.y + e.h <= R.y + R.h + t), `${tag}: tutte dentro il riquadro`);
  const box = m.alza ? E.concat([m.alza]) : E;
  const sov = [];
  for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) {
    const a = box[i], b = box[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0.01 && oy > 0.01) sov.push(`${a.s}/${b.s} ${ox.toFixed(1)}×${oy.toFixed(1)}`);
  }
  ok(sov.length === 0, `${tag}: nessuna sovrapposizione${m.alza ? ' (timbro «Alza» compreso)' : ''}`, sov.join(' · '));
  if (m.piatta) {
    const cop = [];
    for (const z of P.riservate()) for (const e of E) {
      const x0 = (e.x - R.x) / R.w * 100, x1 = (e.x + e.w - R.x) / R.w * 100, y0 = (e.y - R.y) / R.h * 100, y1 = (e.y + e.h - R.y) / R.h * 100;
      if (x0 < z.x1 && x1 > z.x0 && y0 < z.y1 && y1 > z.y0) cop.push(`${e.s}/${z.nome}`);
    }
    ok(cop.length === 0, `${tag}: la scala grafica e il nord restano scoperti`, cop.join(' · '));
  }
  if (MISURE) for (const e of box) console.log(`       ${tag} ${e.s.padEnd(10)} x ${((e.x - R.x) / R.w * 100).toFixed(1)}..${((e.x + e.w - R.x) / R.w * 100).toFixed(1)}%  y ${((e.y - R.y) / R.h * 100).toFixed(1)}..${((e.y + e.h - R.y) / R.h * 100).toFixed(1)}%`);
}
// ogni etichetta resta vicina alla cosa che nomina (in % del riquadro)
{
  const pos = P.posizioni(), lontano = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const dp = pos.map((q) => lontano([q.x, q.y], q.ancora)), da = pos.map((q) => lontano([q.xa, q.ya], q.ancoraAlzata));
  ok(dp.every((v) => v <= 16) && da.every((v) => v <= 16), 'ogni etichetta entro il 16% del riquadro dalla sua stanza, piatta e alzata', pos.map((q, i) => `${q.stanza} ${dp[i].toFixed(0)}/${da[i].toFixed(0)}`).join(' · '));
}
const marcatori = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel + ' .mk rect')].map((r) => { const b = r.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }), sel);

const LARGH = [[320, 700, 288], [390, 844, 358], [1440, 900, 560]];
for (const [w, h, atteso] of LARGH) {
  console.log(`\n· ${w} px (riquadro atteso ${atteso} px)`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const esterne = [];
  page.on('request', (rq) => { if (!/^(file|data|about):/.test(rq.url())) esterne.push(rq.url()); });
  await page.clock.setFixedTime(new Date('2026-09-23T15:42:00Z'));
  await page.goto(scrivi('js'));
  await page.waitForTimeout(150);
  const larg = await page.evaluate(() => document.getElementById('riquadro').getBoundingClientRect().width);
  ok(Math.abs(larg - atteso) < 1, 'larghezza del riquadro', `${larg.toFixed(1)} px`);
  ok(await page.evaluate(() => document.getAnimations().length) === 0, 'getAnimations() vuoto al caricamento');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.piatta')).willChange) === 'auto', 'a riposo niente will-change');
  const piatto = await etichette(page);
  controllaEtichette({ ...piatto, piatta: true }, 'piatta');
  ok(await page.evaluate(() => { const r = document.getElementById('alza').getBoundingClientRect(); return r.bottom <= innerHeight && r.width >= 44 && r.height >= 44; }) || w === 320, 'timbro «Alza» >= 44 px e nel primo schermo (nel banco)');
  if (w !== 320) await page.locator('.cornice').screenshot({ path: join(SHOTS, `piatta-${w}.png`) });

  // il gesto vero (click): CLS con l'input escluso, come lo misura il browser
  await page.click('#alza');
  const tClick = Date.now();
  // fase 1: la trasformazione della piatta arriva alla fine
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('piatta') && a.transitionProperty === 'transform').map((a) => a.finished)));
  const mp = await marcatori(page, '.piatta'), ma = await marcatori(page, 'svg.alzata');
  const d = mp.map((p, i) => Math.hypot(p[0] - ma[i][0], p[1] - ma[i][1]));
  ok(mp.length === 4 && d.every((v) => v <= 1), 'passaggio di consegne: 4 marcatori entro ±1 px', d.map((v) => v.toFixed(2)).join(' · ') + ' px');
  ok(await page.evaluate(() => document.getElementById('riquadro').classList.contains('alzando')), 'durante la salita: .alzando');
  if (Date.now() - tClick < 850) {
    const [op, vis] = await page.evaluate(() => [+getComputedStyle(document.querySelector('.et')).opacity, getComputedStyle(document.querySelector('svg.alzata')).visibility]);
    ok(op < 0.05 && vis === 'visible', 'a metà salita le etichette sono spente e l\'alzata ha preso il posto della piatta', `opacità ${op.toFixed(2)} a ${Date.now() - tClick} ms`);
  }
  await page.waitForFunction(() => document.getElementById('riquadro').classList.contains('alzata') && !document.getElementById('riquadro').classList.contains('alzando'), null, { timeout: 3000 });
  await page.waitForTimeout(60);
  ok(await page.evaluate(() => document.getAnimations().length) === 0, 'a salita finita: nessuna animazione');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.piatta')).display === 'none'), 'a salita finita la piatta esce dal disegno (0 livelli promossi)');
  controllaEtichette(await etichette(page), 'alzata');
  ok(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth), 'scrollWidth === clientWidth a salita conclusa');
  ok(await page.evaluate(() => window.__cls) === 0, 'CLS della salita 0', String(await page.evaluate(() => window.__cls)));
  const [did, np, tr] = await page.evaluate(() => [document.getElementById('soleDidas').textContent, document.querySelectorAll('svg.alzata .sole polygon').length, JSON.stringify(window.__track)]);
  ok(did === 'Roma, 17:42 · la luce entra come adesso' && np === 2, 'il sole alle 17:42 del 23/09: due macchie e la didascalia', `${np} · «${did}»`);
  ok(tr === '[["owners_pianta_alzata",{"innesco":"bottone"}]]', 'boomTrack(owners_pianta_alzata, {innesco})', tr);
  ok(await page.evaluate(() => BOOM_PIANTA.alza('stanza')) === false, 'una volta sola per pagina');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('et')), 'il fuoco non resta sul timbro nascosto: passa alla prima stanza');
  if (w !== 320) await page.locator('.cornice').screenshot({ path: join(SHOTS, `alzata-${w}.png`) });
  await page.evaluate(() => BOOM_PIANTA.accendi('soggiorno'));
  ok(await page.evaluate(() => document.getElementById('riquadro').dataset.accesa === 'soggiorno' && getComputedStyle(document.getElementById('riquadro')).getPropertyValue('--r-soggiorno').trim() !== '' && getComputedStyle(document.getElementById('riquadro')).getPropertyValue('--r-cucina').trim() === ''), 'accendi(soggiorno): una stanza, come stato');
  if (w !== 320) await page.locator('.cornice').screenshot({ path: join(SHOTS, `alzata-soggiorno-${w}.png`) });
  await page.evaluate(() => BOOM_PIANTA.accendi(null));
  ok(await page.evaluate(() => !document.getElementById('riquadro').hasAttribute('data-accesa')), 'accendi(null) spegne');
  ok(esterne.length === 0, 'zero richieste di rete', esterne.join(' '));
  await ctx.close();

  // senza JS: la piatta già accesa, etichette alle coordinate piatte
  const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, javaScriptEnabled: false });
  const p2 = await ctx2.newPage();
  await p2.goto(scrivi(''));
  const noJs = await p2.evaluate(() => ({ col: getComputedStyle(document.getElementById('riquadro')).color, luce: getComputedStyle(document.getElementById('riquadro')).getPropertyValue('--r-casa').trim(), alza: getComputedStyle(document.getElementById('alza')).display, alz: getComputedStyle(document.querySelector('svg.alzata')).display }));
  ok(await p2.evaluate(() => document.getAnimations().length) === 0, 'senza JS: getAnimations() vuoto');
  ok(noJs.col === 'rgb(255, 215, 0)' && noJs.luce !== '' && noJs.alza === 'none' && noJs.alz === 'none', 'senza JS: piatta accesa in oro, niente timbro, niente alzata');
  controllaEtichette({ ...(await etichette(p2)), piatta: true }, 'senza JS');
  if (w !== 320) await p2.locator('.cornice').screenshot({ path: join(SHOTS, `accesa-${w}.png`) });
  if (w === 390) await p2.screenshot({ path: join(SHOTS, `pagina-${w}.png`), fullPage: true });
  await ctx2.close();
}

// riduzione del movimento, ⏸, ?flat=1
console.log('\n· movimento ridotto, ⏸ e flat');
for (const [nome, opts, cls] of [['prefers-reduced-motion', { reducedMotion: 'reduce' }, 'js'], ['html.still', {}, 'js still']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-09-23T08:05:00Z'));
  await page.goto(scrivi(cls));
  await page.click('#alza');
  const st = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r({ c: document.getElementById('riquadro').className, n: document.getAnimations().length, v: getComputedStyle(document.querySelector('svg.alzata')).visibility, p: getComputedStyle(document.querySelector('.piatta')).display, d: document.getElementById('soleDidas').textContent, np: document.querySelectorAll('svg.alzata .sole polygon').length }))));
  ok(/\balzata\b/.test(st.c) && !/alzando/.test(st.c) && st.n === 0 && st.v === 'visible' && st.p === 'none', `${nome}: .alzata subito, zero animazioni`, JSON.stringify({ c: st.c, n: st.n }));
  ok(st.d === "Roma, 10:05 · a quest'ora il sole non entra da questa finestra" && st.np === 0, `${nome}: alle 10:05 niente macchie, la didascalia lo dice`);
  controllaEtichette(await etichette(page), nome);
  ok(await page.evaluate(() => window.__cls) === 0, `${nome}: CLS 0 anche con le etichette che saltano subito`);
  // senza un input recente (salita dal cartiglio al blur): lo spostamento
  // delle etichette è un transform, quindi non conta come layout shift
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const p2 = await c2.newPage();
  await p2.goto(scrivi(cls));
  await p2.waitForTimeout(700);
  await p2.evaluate(() => BOOM_PIANTA.alza('cartiglio'));
  await p2.waitForTimeout(300);
  ok(await p2.evaluate(() => window.__cls) === 0, `${nome}: CLS 0 con la salita partita senza input (cartiglio)`);
  await c2.close();
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(scrivi('js flat'));
  const r = await page.evaluate(() => [BOOM_PIANTA.alza('bottone'), document.getElementById('riquadro').className, getComputedStyle(document.getElementById('riquadro')).color]);
  ok(r[0] === false && r[1] === 'riquadro' && r[2] === 'rgb(255, 215, 0)', 'html.flat: piatta accesa, la salita non parte');
  ok(await page.evaluate(() => document.getAnimations().length) === 0, 'html.flat: getAnimations() vuoto');
  controllaEtichette({ ...(await etichette(page)), piatta: true }, 'html.flat');
  await ctx.close();
}
await browser.close();
console.log(`\n${passati} ok · ${falliti} falliti · schermate in ${SHOTS}`);
process.exit(falliti ? 1 : 0);
