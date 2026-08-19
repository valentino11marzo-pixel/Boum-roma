// LA VERIFICA DEL CABLAGGIO — niente si perde nel passaggio alle route
// vere. Tre famiglie di controlli:
//  1. PARITA: ogni pagina nuova possiede cio che la pagina live aveva
//     (canonical giusto, gtag, icone+manifest, robots, og/twitter,
//     i tipi JSON-LD della vecchia testa).
//  2. INJECTSEO: il template del detail soddisfa OGNI regex che
//     api/listing.js usa per riscrivere la testa per-annuncio — una
//     regex che non aggancia e un no-op muto, non un errore.
//  3. LA CASA NUOVA DAL BOT: un id sconosciuto alla build + __LISTING
//     iniettato → la pagina si costruisce dal documento (Playwright).
import fs from 'fs';
import path from 'path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

let falliti = 0;
function ok(nome, vero, dettagli) {
  console.log((vero ? 'OK  ' : 'FAIL') + ' ' + nome
    + (dettagli && !vero ? ' — ' + dettagli : ''));
  if (!vero) falliti++;
}
const leggi = (f) => fs.readFileSync(f, 'utf8');

// ── 1. PARITA ───────────────────────────────────────────────────────────
const PAGINE = [
  ['boom-portale-sito.html', 'https://www.boomrome.com/',
    ['RealEstateAgent', 'WebSite', 'LocalBusiness', 'FAQPage'], true],
  ['boom-discovery-sito.html', 'https://www.boomrome.com/apartments',
    ['RealEstateAgent', 'WebSite', 'CollectionPage', 'BreadcrumbList'], false],
  ['boom-casa-p-sito.html', 'https://www.boomrome.com/apartment-detail',
    ['RealEstateAgent', 'WebSite', 'BreadcrumbList'], false],
  ['boom-soldi-sito.html', 'https://www.boomrome.com/your-money',
    ['RealEstateAgent', 'WebSite', 'WebPage', 'BreadcrumbList'], false],
];
for (const [file, canonical, tipi, vuoleSW] of PAGINE) {
  const h = leggi(file);
  const n = file.replace('boom-', '').replace('-sito.html', '');
  ok(n + ' · canonical', h.includes('<link rel="canonical" href="' + canonical + '">'));
  ok(n + ' · gtag', h.includes('googletagmanager.com/gtag/js?id=G-EYCD59RDVJ'));
  ok(n + ' · icone+manifest', h.includes('rel="manifest"') && h.includes('apple-touch-icon'));
  ok(n + ' · robots', h.includes('name="robots" content="index, follow'));
  ok(n + ' · og completo', ['og:title', 'og:description', 'og:url', 'og:image',
    'og:image:secure_url', 'og:image:alt'].every(p => h.includes('property="' + p + '"')));
  ok(n + ' · twitter completo', ['twitter:card', 'twitter:title',
    'twitter:description', 'twitter:image'].every(p => h.includes('name="' + p + '"')));
  for (const t of tipi)
    ok(n + ' · JSON-LD ' + t, h.includes('"@type": "' + t + '"') || h.includes('"@type":"' + t + '"'));
  if (vuoleSW) ok(n + ' · service worker', h.includes("serviceWorker.register('/sw.js'"));
  ok(n + ' · un solo <title>', (h.match(/<title>/g) || []).length === 1);
  ok(n + ' · una sola description', (h.match(/<meta name="description"/g) || []).length === 1);
  ok(n + ' · un solo canonical', (h.match(/<link rel="canonical"/g) || []).length === 1);
}

// ── 2. INJECTSEO — le regex VERE di api/listing.js sul template ────────
const T = leggi('boom-casa-p-sito.html');
const nomi = ['description', 'twitter:title', 'twitter:description', 'twitter:image'];
const prop = ['og:title', 'og:description', 'og:url', 'og:image',
  'og:image:secure_url', 'og:image:alt'];
for (const p of nomi)
  ok('injectSeo · meta name ' + p,
    new RegExp('<meta name="' + p + '" content="[^"]*">').test(T));
for (const p of prop)
  ok('injectSeo · meta property ' + p,
    new RegExp('<meta property="' + p + '" content="[^"]*">').test(T));
ok('injectSeo · title', /<title>[\s\S]*?<\/title>/.test(T));
ok('injectSeo · canonical', /<link rel="canonical" href="[^"]*">/.test(T));
ok('injectSeo · marker </head>', T.includes('</head>'));
ok('injectSeo · marker <body>', T.includes('<body>'));
// il client deve leggere cio che il server inietta
ok('injectSeo · client legge __LISTING_ID', T.includes('window.__LISTING_ID'));
ok('injectSeo · client legge __LISTING', T.includes('window.__LISTING'));
ok('injectSeo · id anche dal pathname', T.includes('/listing\\/'));

// ── 3. LA CASA NUOVA DAL BOT (Playwright) ───────────────────────────────
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
// il documento che il server inietterebbe per un annuncio POST-build
const NUOVA = {
  name: 'Trilocale Nuovissimo', zone: 'Testaccio', price: 1750,
  images: ['https://i.imgur.com/aaaaaaa.jpeg', 'https://i.imgur.com/bbbbbbb.jpeg'],
  bedrooms: 2, bathrooms: 1, sqm: 72, address: 'Via Marmorata 10',
  status: 'available', availableDate: '2026-10-01', depositMonths: 2,
  description: 'Bright three-room flat near the market.',
  features: ['balcony', 'ac'],
};
await pg.addInitScript(({ d }) => {
  window.__LISTING = d; window.__LISTING_ID = 'IDNUOVO12345678901234';
}, { d: NUOVA });
// niente rete: l'idrante fallira in silenzio, come da progetto
await pg.route('**firestore.googleapis.com/**', r => r.abort());
const errs = [];
pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
await pg.goto('file://' + path.resolve('boom-casa-p-sito.html'));
await pg.waitForTimeout(2600);
const r = await pg.evaluate(() => ({
  nome: document.getElementById('nomeCasa').textContent,
  stato: document.getElementById('statoCasa').textContent.trim(),
  canone: document.getElementById('canoneCasa').dataset.p,
  dove: document.getElementById('doveCasa').textContent,
}));
ok('casa nuova · nome dal documento', r.nome === 'Trilocale Nuovissimo', JSON.stringify(r));
ok('casa nuova · prezzo', r.canone === '€1,750', r.canone);
ok('casa nuova · stato con data', /Free from 1 Oct/.test(r.stato), r.stato);
ok('casa nuova · zona+indirizzo', /Testaccio/.test(r.dove), r.dove);
ok('casa nuova · zero errori JS', errs.length === 0, errs.join(' | '));

// e il caso di sempre: id noto via hash (compat v2), nessun __LISTING
const pg2 = await br.newPage({ viewport: { width: 1280, height: 900 } });
await pg2.route('**firestore.googleapis.com/**', r => r.abort());
const errs2 = [];
pg2.on('pageerror', e => errs2.push(String(e).slice(0, 140)));
await pg2.goto('file://' + path.resolve('boom-casa-p-sito.html'));
await pg2.waitForTimeout(2200);
const r2 = await pg2.evaluate(() => ({
  nome: document.getElementById('nomeCasa').textContent,
  titolo: document.title }));
ok('template nudo · prima casa del catalogo', r2.nome.length > 3, r2.nome);
ok('template nudo · zero errori JS', errs2.length === 0, errs2.join(' | '));
await br.close();

console.log(falliti ? 'GUASTI: ' + falliti : 'TUTTO VERDE');
process.exit(falliti ? 1 : 0);
