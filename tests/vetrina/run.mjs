// tests/vetrina/run.mjs — L'INNESTO DELLA VETRINA, IN UN BROWSER VERO.
//
// IL CASO DEL 22 AGOSTO 2026. Il wizard Telegram pubblica un bilocale a
// Prati alle 23:24; /listing/<id> è vivo (il detail legge Firestore), ma
// la discovery è una FOTOGRAFIA di build: la carta non c'è, il conto non
// lo conta, e l'annuncio è «pubblicato e invisibile» finché qualcuno non
// rifà la build e deploya. L'idrante aggiornava le carte ESISTENTI —
// questa suite pinna il gradino sopra: una carta che NON esiste si
// costruisce in pagina (l'innesto) e entra nel setaccio come le sorelle.
//
// Le regole dure, verificate qui:
//   · un annuncio nuovo con nome+prezzo+foto+stato noto APPARE ed è
//     CONTATO, coi data-attribute nella grammatica esatta del builder
//     (i filtri li leggono: zona, cerca, dote tradotte, cauzione)
//   · la data testo libero passa dal motore condiviso: «1 Sept 2027»
//     diventa «Free from 1 Sept 2027», MAI «Available now»
//   · la regola di ingresso non si allenta: senza foto di casa nostra
//     niente carta, uno stato ignoto (draft) resta fuori
//   · i filtri VERI mordono sulla carta innestata (zona via hash, cerca)
//   · il cuore salva, e l'aggiornamento delle carte di build (il lavoro
//     storico dell'idrante) continua a funzionare
//
//
// E LA VETRINA DICE IL VERO A CHI LA LEGGE SENZA GUARDARLA (P0-07, 15/10):
//   · «N available now» (meta, og, twitter, CollectionPage, eyebrow, piede
//     del tabellone) = le card «Available now» = gli InStock dell'ItemList.
//     Diceva 9 con 5 card che lo dicevano: contava status == 'available',
//     cioè anche le case libere fra un anno
//   · le prenotabili con data si dichiarano a parte (= «Free from» = PreOrder)
//   · la commissione del confronto porta l'IVA: 10% × 12 × 1,22
//   · la SearchAction che 60+ pagine dichiarano (/apartments?q=…) esiste:
//     la parola arriva nel campo, filtra il muro e resta nell'URL
//   · il prezzo di ogni carta è TESTO (= data-p) prima del Solari: senza JS
//     si legge, e un motore lo trova
//   · nell'ItemList la regione è il Lazio, il quartiere un luogo contenuto
// Ogni regola statica è rieseguita su un campione SBAGLIATO e deve cadere.
//
// La parte statica gira sempre; quella in browser si auto-skippa senza
// playwright, come le altre suite del repo.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

let pass = 0, fail = 0;
async function check(name, fn) {
  try {
    const v = await fn();
    if (v) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
  } catch (e) {
    fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}

// ══ LA PARTE STATICA — ciò che un crawler legge senza eseguire niente ══
const SRC = readFileSync(join(ROOT, 'apartments.html'), 'utf8');
const BUILDER = readFileSync(join(ROOT, 'design/pages-deco/costruisci-ad.py'), 'utf8');

const conta = (h, re) => (h.match(re) || []).length;
const carteOra = (h) => conta(h, /class="casa-stato si">Available now</g);
const carteDopo = (h) => conta(h, /class="casa-stato poi">Free from /g);
function blocchiLd(h) {
  const out = [];
  for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    try { out.push(JSON.parse(m[1])); } catch { /* il JSON rotto lo prende seo */ }
  }
  return out;
}
const itemList = (h) => blocchiLd(h).find((d) => d['@type'] === 'ItemList') || null;
const disp = (it, re) => (it ? it.itemListElement : [])
  .filter((v) => re.test((v.item && v.item.offers && v.item.offers.availability) || '')).length;
// i numeri dichiarati, dove un motore li legge
function dichiarati(h) {
  const meta = (re) => ((h.match(re) || [])[1] || '');
  const coll = (blocchiLd(h).find((d) => d['@type'] === 'CollectionPage') || {}).description || '';
  const fonti = {
    'meta description': meta(/<meta name="description" content="([^"]*)"/),
    'og:description': meta(/<meta property="og:description" content="([^"]*)"/),
    'twitter:description': meta(/<meta name="twitter:description" content="([^"]*)"/),
    'CollectionPage': coll,
  };
  const ora = {}, dopo = {};
  for (const [k, t] of Object.entries(fonti)) {
    ora[k] = +((t.match(/(\d+) available now/) || [])[1] ?? NaN);
    dopo[k] = +((t.match(/(\d+) to reserve with a date/) || [])[1] ?? NaN);
  }
  ora['.hero-eyebrow'] = +((h.match(/class="hero-eyebrow"><b><\/b>(\d+) homes? available now/) || [])[1] ?? NaN);
  ora['.zone-piede'] = +((h.match(/class="zone-piede"><span><b>(\d+)<\/b> available now/) || [])[1] ?? NaN);
  return { ora, dopo, fonti };
}
function contiOnesti(h) {
  const n = carteOra(h), it = itemList(h), inStock = disp(it, /InStock/);
  const { ora } = dichiarati(h);
  return n > 0 && n === inStock && Object.values(ora).every((x) => x === n);
}
function prenotabiliOneste(h) {
  const n = carteDopo(h), it = itemList(h), pre = disp(it, /PreOrder/);
  const { dopo } = dichiarati(h);
  return n === pre && Object.values(dopo).every((x) => x === n);
}
// ogni `* 12 * .10` porta `* 1.22` nella stessa espressione
function feeConIva(h) {
  const tutti = [...h.matchAll(/\*\s*12\s*\*\s*0?\.10?\b/g)];
  return tutti.length > 0 && tutti.every((m) =>
    /\*\s*1\.22\b/.test(h.slice(m.index + m[0].length).split(/[;\n]/)[0]))
    && /var fee = Math\.round\(p \* 12 \* \.10 \* 1\.22\)/.test(h);
}
// il prezzo di ogni carta di build è TESTO uguale a data-p
function prezziTesto(h) {
  const spans = [...h.matchAll(/<span class="flap-prezzo flap-scale"\s+data-p="([^"]*)"\s+aria-label="([^"]*)">([^<]*)<\/span>/g)];
  return spans.length > 0 && spans.length === conta(h, /<a class="casa-p"/g)
    && spans.every((m) => m[1] && m[3] === m[1] && m[2] === m[1] + ' per month');
}
function regioniVere(h) {
  const it = itemList(h);
  if (!it || !it.itemListElement.length) return false;
  return it.itemListElement.every((v) => {
    const a = v.item.address || {};
    return a.addressRegion === 'Lazio' && a.addressLocality === 'Roma'
      && a.addressCountry === 'IT'
      && (!v.item.containedInPlace || /, Roma$/.test(v.item.containedInPlace.name));
  });
}
// il tabellone delle zone: «si» (verde, «from» libero) SOLO dove c'è una
// carta «Available now», il conto delle case per zona = le carte, e il
// «from» è il canone più basso dello STESSO insieme che «Homes» conta
// (tutta la zona): misurato sulle sole libere ora alzava il pavimento —
// «Trieste · From €2,000» con Levico a €1,200 nella stessa zona
function tabelloneOnesto(h) {
  const m = h.match(/var ZONE = (\[[^\n]*\]);/);
  if (!m) return false;
  const ZONE = JSON.parse(m[1]);
  const carte = [...h.matchAll(/<a class="casa-p"[\s\S]*?<\/a>/g)].map((x) => x[0]);
  const per = {};
  for (const c of carte) {
    const z = (c.match(/data-zona="([^"]*)"/) || [])[1];
    per[z] = per[z] || { n: 0, ora: 0, min: Infinity };
    per[z].n++;
    if (/class="casa-stato si">Available now</.test(c)) per[z].ora++;
    const p = +((c.match(/data-prezzo="(\d+)"/) || [])[1]);
    if (p) per[z].min = Math.min(per[z].min, p);
  }
  return ZONE.length > 0 && ZONE.every((z) => per[z.z]
    && per[z.z].n === z.n && (per[z.z].ora > 0) === z.si
    && Number.isFinite(per[z.z].min)
    && String(z.da).trim() === '€' + per[z.z].min.toLocaleString('en-US'));
}

console.log('VETRINA — la parte statica: ciò che legge chi non guarda');
const D = dichiarati(SRC);
await check(`(b) «N available now» = carte «Available now» (${carteOra(SRC)}) = InStock dell'ItemList (${disp(itemList(SRC), /InStock/)}) in meta, og, twitter, CollectionPage, eyebrow e piede`,
  () => contiOnesti(SRC) || (console.log('    ' + JSON.stringify(D.ora)), false));
await check(`(b) «N to reserve with a date» = carte «Free from» (${carteDopo(SRC)}) = PreOrder dell'ItemList`,
  () => prenotabiliOneste(SRC) || (console.log('    ' + JSON.stringify(D.dopo)), false));
await check('(b) le descrizioni restano 110–165 caratteri', () => Object.values(D.fonti)
  .every((t) => [...t].length >= 110 && [...t].length <= 165));
await check('(c) la commissione del confronto porta l\'IVA (× 1.22) e la nota la dice',
  () => feeConIva(SRC) && /agency fee \(10% of\s+a year's rent \+ 22% VAT\)/.test(SRC));
await check('(d) il prezzo di ogni carta è testo = data-p (e aria-label = data-p + « per month»)',
  () => prezziTesto(SRC));
await check('(d) anche l\'innesto scrive il prezzo come testo prima del Solari',
  () => /' per month">' \+ esc\(euro\(d\.p\)\) \+ '<\/span><small>\/mo<\/small>'/.test(SRC));
await check('(d) il Solari svuota il nodo prima delle celle (Board e il ripiego senza BoomSolari)',
  () => /function Board\(host, len, drum\) \{\s*host\.textContent = '';/.test(SRC)
    && /if \(!BS\) \{ host\.textContent = testo; return; \}/.test(SRC));
await check('(e) nessuna voce dell\'ItemList ha una regione diversa dal Lazio; il quartiere è containedInPlace',
  () => regioniVere(SRC) && itemList(SRC).itemListElement.some((v) => v.item.containedInPlace));
await check('il tabellone delle zone marca «si» solo le zone con una casa libera ORA, e «from» = il canone più basso della zona',
  () => tabelloneOnesto(SRC));
await check('SearchAction: ?q= letto dentro il setaccio e tenuto nell\'URL',
  () => /new URLSearchParams\(location\.search\)\.get\('q'\)/.test(SRC)
    && /u\.searchParams\.delete\('q'\)/.test(SRC));
await check('il builder conta dalla corsia (stato()[1]), non da status == \'available\'',
  () => /DISPONIBILI = sum\(1 for r in mostrate if stato\(r\)\[1\] == 'si'\)/.test(BUILDER)
    && /PRENOTABILI = sum\(1 for r in mostrate if stato\(r\)\[1\] == 'poi'\)/.test(BUILDER)
    && /disp = \[x for x in rr if stato\(x\)\[1\] == 'si'\]/.test(BUILDER)
    && /'da': euro\(min\(prezzo\(x\) for x in rr\)\)/.test(BUILDER)
    && !/r\['status'\] == 'available'\)/.test(BUILDER));
await check('il builder scrive il prezzo come testo e la descrizione con le prenotabili',
  () => /per month">\{euro\(p\)\}<\/span>/.test(BUILDER)
    && /to reserve with a date/.test(BUILDER));

// LA MUTAZIONE: ogni regola statica, rieseguita su un campione sbagliato
console.log('\nLA MUTAZIONE — sul campione sbagliato le regole devono cadere');
const muta = (da, a) => { if (!SRC.includes(da)) throw new Error('mutazione senza appiglio: ' + da.slice(0, 50)); return SRC.replace(da, a); };
await check('mutazione: «9 available now» nella meta description → (b) cade',
  () => !contiOnesti(muta('<meta name="description" content="Browse 19 verified apartments for rent in Rome — every home walked in person by BOOM. 5 available now',
    '<meta name="description" content="Browse 19 verified apartments for rent in Rome — every home walked in person by BOOM. 9 available now')));
await check('mutazione: l\'eyebrow torna a 9 → (b) cade',
  () => !contiOnesti(muta('<b></b>5 homes available now', '<b></b>9 homes available now')));
await check('mutazione: una carta «Free from» spacciata per «Available now» → (b) cade',
  () => !contiOnesti(muta('class="casa-stato poi">Free from', 'class="casa-stato si">Available now<i hidden>')));
await check('mutazione: la commissione senza IVA → (c) cade',
  () => !feeConIva(muta('Math.round(p * 12 * .10 * 1.22)', 'Math.round(p * 12 * .10)')));
await check('mutazione: un prezzo torna vuoto → (d) cade',
  () => !prezziTesto(SRC.replace(/(aria-label="(€[\d,]+) per month">)\2(<\/span>)/, '$1$3')));
await check('mutazione: il quartiere torna in addressRegion → (e) cade',
  () => !regioniVere(muta('"addressRegion":"Lazio"', '"addressRegion":"Centro"')));
await check('mutazione: Prati marcata «si» senza case libere ora → il tabellone cade',
  () => !tabelloneOnesto(muta('{"z": "Prati", "n": 2, "da": "€1,500", "si": false}',
    '{"z": "Prati", "n": 2, "da": "€1,500", "si": true}')));
await check('mutazione: Trieste «From €2,000» (il pavimento delle sole libere ora) → il tabellone cade',
  () => !tabelloneOnesto(muta('{"z": "Trieste", "n": 2, "da": "€1,200", "si": true}',
    '{"z": "Trieste", "n": 2, "da": "€2,000", "si": true}')));

const chromium = await loadChromium();
if (!chromium) {
  if (fail) {
    console.log(`\nVETRINA: ${fail} GUASTI su ${pass + fail} (statico; il browser non c'è)`);
    process.exit(1);
  }
  console.log(`SKIP: playwright non disponibile — statico verde (${pass} check); npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js`);
  process.exit(0);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join(ROOT, p === '/' ? '/apartments.html' : p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ── il catalogo finto: la forma ESATTA dei documenti del wizard ─────────
const html = readFileSync(join(ROOT, 'apartments.html'), 'utf8');
const idBuild = [...html.matchAll(/data-id="([^"]+)"/g)].map(m => m[1])[0];
if (!idBuild) { console.log('GUASTO: nessuna carta di build in apartments.html'); process.exit(1); }

const ANNO = new Date().getFullYear() + 1;      // la data resta futura per sempre
const S = (v) => ({ stringValue: String(v) });
const ARR = (xs) => ({ arrayValue: { values: xs } });
const FOTO = 'https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fenhanced%2Fnuova1%2Fcover.jpg?alt=media';
const doc = (id, fields) => ({
  name: 'projects/x/databases/(default)/documents/listings/' + id, fields });
const FINTO = { documents: [
  // la carta di build cambia stato: il lavoro storico dell'idrante
  doc(idBuild, { status: S('rented'), price: { integerValue: '1500' } }),
  // il bilocale del wizard, nato DOPO la build (i campi veri del caso:
  // prezzo stringa, data testo libero, createdAt con la coda anomala)
  doc('nuova1', {
    name: S('Bilocale Prati'), zone: S('Prati'), address: S('Via Quirino Visconti 60'),
    type: S('bilocale'), status: S('available'), price: S('1500'),
    availableDate: S('1 Sept ' + ANNO),
    createdAt: S(new Date().toISOString().replace('Z', '+00:00Z')),
    bedrooms: S('1'), bathrooms: S('1'), sqm: S('60'), floor: S('0'),
    furnished: S('yes'), videoUrl: S(''), depositMonths: S('1'),
    features: ARR([S('ac'), S('dishwasher'), S('washing_machine'),
      S('wifi'), S('doorman'), S('double_glazing')]),
    imagesVariants: ARR([{ mapValue: { fields: { w960: S(FOTO), src: S(FOTO) } } }]),
    images: ARR([S(FOTO)]),
  }),
  // senza una foto di casa nostra la carta NON nasce
  doc('senzafoto1', {
    name: S('Casa Fantasma'), zone: S('Prati'), status: S('available'),
    price: S('900'), images: ARR([S('https://i.imgur.com/x.jpg')]),
  }),
  // uno stato fuori grammatica resta fuori
  doc('bozza1', {
    name: S('Bozza'), zone: S('Prati'), status: S('draft'),
    price: S('900'), images: ARR([S(FOTO)]),
  }),
] };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
const instrada = (pg) => pg.route('**/*', (r) => {
  const u = r.request().url();
  if (u.includes('firestore.googleapis.com'))
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(FINTO) });
  if (u.startsWith('http://127.0.0.1:' + PORT + '/')) return r.continue();
  if (u.includes('firebasestorage'))
    return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  return r.abort();
});
await instrada(page);

console.log('\nVETRINA — l\'innesto: chi nasce dopo la build entra comunque');
await page.goto('http://127.0.0.1:' + PORT + '/apartments.html');
await page.waitForSelector('.casa-p[data-id="nuova1"]', { timeout: 12000 })
  .catch(() => {});
await page.waitForTimeout(600); // la consegna al setaccio riprova ogni 250ms

const r = await page.evaluate(() => {
  const g = document.querySelector('.casa-p[data-id="nuova1"]');
  const build = document.querySelectorAll('#muro > .casa-p').length;
  const vive = [...document.querySelectorAll('#muro > .casa-p')]
    .filter(c => !c.classList.contains('via'));
  return {
    ce: !!g, dentroMuro: !!(g && g.closest('#muro')),
    href: g ? g.getAttribute('href') : '',
    stato: g ? g.querySelector('.casa-stato').textContent.trim() : '',
    statoClasse: g ? g.querySelector('.casa-stato').className : '',
    chip: g ? (g.querySelector('.casa-chip') || {}).textContent : null,
    d: g ? Object.assign({}, g.dataset) : {},
    flapP: g ? g.querySelector('.flap-prezzo').dataset.p : '',
    flapAria: g ? g.querySelector('.flap-prezzo').getAttribute('aria-label') : '',
    /* IL SOLARI MONTATO: il difetto vero era la carta innestata col prezzo
       come testo piatto — il tabellone (celle figlie) è il design, e deve
       esserci come sulle carte di build */
    flapCelle: g ? g.querySelector('.flap-prezzo').children.length : 0,
    flapCelleBuild: (() => {
      const b = [...document.querySelectorAll('#muro .casa-p')]
        .find(c => c.dataset.id !== 'nuova1');
      return b ? b.querySelector('.flap-prezzo').children.length : 0;
    })(),
    prima: (document.querySelector('#muro > .casa-p') || {}).dataset || {},
    conto: +document.getElementById('conto').textContent,
    viveN: vive.length, totale: build,
    contata: !!(g && !g.classList.contains('via')),
    buildRented: (document.querySelector('.casa-p[data-id]') &&
      [...document.querySelectorAll('#muro .casa-p')]
        .some(c => c.querySelector('.casa-stato').textContent.trim() === 'Rented')),
    fantasma: !!document.querySelector('.casa-p[data-id="senzafoto1"]'),
    bozza: !!document.querySelector('.casa-p[data-id="bozza1"]'),
  };
});

await check('la carta innestata esiste, dentro il muro', () => r.ce && r.dentroMuro);
await check('href = /listing/<id>', () => r.href === '/listing/nuova1');
await check('«1 Sept ' + ANNO + '» diventa Free from, MAI Available now',
  () => new RegExp('^Free from 1 Sept? ' + ANNO + '$').test(r.stato)
    && /poi/.test(r.statoClasse));
await check('chip NEW (nata oggi, viva)', () => r.chip === 'NEW');
await check('dote tradotte nella grammatica dei filtri',
  () => r.d.dote === '|A/C|Dishwasher|Washer|Wi-Fi|Doorman|Double glazing|');
await check('data-attribute del builder: zona/prezzo/letti/mq/bagni',
  () => r.d.zona === 'Prati' && r.d.prezzo === '1500' && r.d.letti === '1'
    && r.d.mq === '60' && r.d.bagni === '1' && r.d.arredata === '1'
    && r.d.video === '0' && r.d.cauzione === '1'
    && r.d.dal === ANNO + '-09-01' && r.d.chiave === '/listing/nuova1');
await check('data-cerca porta nome, zona e indirizzo',
  () => r.d.cerca.includes('bilocale prati') && r.d.cerca.includes('visconti'));
await check('il prezzo dichiara €1,500 (data-p + aria-label)',
  () => r.flapP === '€1,500' && r.flapAria === '€1,500 per month');
await check('il Solari del prezzo è MONTATO anche sulla carta innestata (celle come sulla build)',
  () => r.flapCelle > 0 && r.flapCelle === r.flapCelleBuild);
await check('CONTATA: il conto = le carte vive, innesto compreso',
  () => r.contata && r.conto === r.viveN && r.conto > 0);
await check('ordinamento «nuove»: la nata oggi apre il muro',
  () => r.prima.id === 'nuova1');
await check('senza foto di casa nostra la carta non nasce', () => !r.fantasma);
await check('status draft resta fuori', () => !r.bozza);
await check('il lavoro storico dell\'idrante continua (build → Rented)',
  () => r.buildRented);

// ── i filtri VERI mordono sulla carta innestata ─────────────────────────
await page.evaluate(() => { location.hash = '#zona=Prati'; });
await page.waitForTimeout(300);
const fz = await page.evaluate(() => {
  const vive = [...document.querySelectorAll('#muro > .casa-p')]
    .filter(c => !c.classList.contains('via'));
  return { conto: +document.getElementById('conto').textContent,
    tutteZona: vive.every(c => c.dataset.zona.toLowerCase() === 'prati'),
    innestataViva: vive.some(c => c.dataset.id === 'nuova1'),
    viveN: vive.length };
});
await check('filtro zona via hash: l\'innestata risponde, il conto pure',
  () => fz.innestataViva && fz.tutteZona && fz.conto === fz.viveN);

await page.evaluate(() => {
  location.hash = ''; document.getElementById('pulisci').click();
  const q = document.getElementById('fq');
  q.value = 'visconti'; q.dispatchEvent(new Event('input'));
});
await page.waitForTimeout(400);
const fq = await page.evaluate(() => {
  const vive = [...document.querySelectorAll('#muro > .casa-p')]
    .filter(c => !c.classList.contains('via'));
  return { viveN: vive.length, sola: vive.length === 1 && vive[0].dataset.id === 'nuova1' };
});
await check('la ricerca libera trova l\'indirizzo innestato', () => fq.sola);

const cuore = await page.evaluate(() => {
  const g = document.querySelector('.casa-p[data-id="nuova1"] .home-cuore');
  g.click();
  try { return JSON.parse(localStorage.getItem('boomSalvate') || '[]'); }
  catch (e) { return []; }
});
await check('il cuore salva la casa innestata',
  () => cuore.includes('/listing/nuova1'));

// ── (a) LA SEARCHACTION: /apartments?q=… filtra davvero ───────────────
console.log('\nVETRINA — la SearchAction che le pagine dichiarano: ?q= filtra il muro');
const pq = await ctx.newPage();
pq.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
await instrada(pq);
await pq.goto('http://127.0.0.1:' + PORT + '/apartments.html?q=pigneto');
await pq.waitForFunction(() => document.getElementById('muro')
  && document.getElementById('muro').classList.contains('dentro'), null, { timeout: 12000 })
  .catch(() => {});
await pq.waitForTimeout(1600); // l'innesto (+900ms) passa anche lui dal setaccio
const sq = await pq.evaluate(() => {
  const vive = [...document.querySelectorAll('#muro .casa-p:not(.via)')];
  return { valore: document.getElementById('fq').value, n: vive.length,
    tutte: vive.every((c) => (c.dataset.cerca || '').includes('pigneto')),
    conto: +document.getElementById('conto').textContent,
    search: location.search };
});
await check('(a) ?q=pigneto arriva nel campo #fq', () => sq.valore === 'pigneto');
await check(`(a) ogni carta visibile parla di pigneto (${sq.n}), ed è almeno una`,
  () => sq.n > 0 && sq.tutte);
await check('(a) il conto dice le carte filtrate', () => sq.conto === sq.n);
await check('(a) il filtro dei filtri (hash) non cancella ?q= dall\'URL',
  () => sq.search === '?q=pigneto');
await pq.evaluate(() => {
  const q = document.getElementById('fq');
  q.value = 'Trastevere'; q.dispatchEvent(new Event('input'));
});
await pq.waitForTimeout(450);
await pq.evaluate(() => { location.hash = '#zona=Trastevere'; });
await pq.waitForTimeout(300);
const sq2 = await pq.evaluate(() => ({ search: location.search, hash: location.hash,
  vive: [...document.querySelectorAll('#muro .casa-p:not(.via)')]
    .every((c) => (c.dataset.cerca || '').includes('trastevere')) }));
await check('(a) la parola nuova resta nell\'URL (?q=Trastevere) accanto all\'hash dei filtri',
  () => sq2.search === '?q=Trastevere' && /zona=trastevere/i.test(sq2.hash) && sq2.vive);
await pq.evaluate(() => document.getElementById('pulisci').click());
await pq.waitForTimeout(300);
const sq3 = await pq.evaluate(() => ({ search: location.search,
  valore: document.getElementById('fq').value,
  vive: document.querySelectorAll('#muro .casa-p:not(.via)').length,
  tutte: document.querySelectorAll('#muro .casa-p').length }));
await check('(a) «pulisci» toglie ?q= dall\'URL e riapre il muro',
  () => sq3.search === '' && sq3.valore === '' && sq3.vive === sq3.tutte);
await pq.close();

// ── (d) SENZA JS il prezzo si legge ────────────────────────────────────
const ctxNoJs = await browser.newContext({ viewport: { width: 390, height: 844 },
  javaScriptEnabled: false, serviceWorkers: 'block' });
const pn = await ctxNoJs.newPage();
await pn.route('**/*', (r) => r.request().url().startsWith('http://127.0.0.1:' + PORT + '/')
  ? r.continue() : r.abort());
await pn.goto('http://127.0.0.1:' + PORT + '/apartments.html');
const nj = await pn.evaluate(() => [...document.querySelectorAll('#muro .flap-prezzo')]
  .map((e) => ({ p: e.dataset.p, t: e.textContent.trim(), w: e.getBoundingClientRect().width })));
await check(`(d) senza JS ogni prezzo (${nj.length}) è testo visibile = data-p`,
  () => nj.length > 0 && nj.every((x) => x.p && x.t === x.p && x.w > 0));
await ctxNoJs.close();

await check('zero errori di pagina', () => errs.length === 0
  || (console.log('    [pageerror] ' + errs.join(' | ')), false));

await browser.close();
server.close();
console.log(fail ? `\nVETRINA: ${fail} GUASTI su ${pass + fail}` : `\nVETRINA: TUTTO VERDE (${pass} check)`);
process.exit(fail ? 1 : 0);
