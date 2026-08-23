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
// Si auto-skippa senza playwright, come le altre suite del repo.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
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

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
await page.route('**/*', (r) => {
  const u = r.request().url();
  if (u.includes('firestore.googleapis.com'))
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(FINTO) });
  if (u.startsWith('http://127.0.0.1:' + PORT + '/')) return r.continue();
  if (u.includes('firebasestorage'))
    return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  return r.abort();
});

console.log('VETRINA — l\'innesto: chi nasce dopo la build entra comunque');
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
    flap: g ? g.querySelector('.flap-prezzo').textContent.trim() : '',
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
await check('il prezzo si legge: €1,500', () => r.flap === '€1,500');
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

await check('zero errori di pagina', () => errs.length === 0
  || (console.log('    [pageerror] ' + errs.join(' | ')), false));

await browser.close();
server.close();
console.log(fail ? `\nVETRINA: ${fail} GUASTI su ${pass + fail}` : `\nVETRINA: TUTTO VERDE (${pass} check)`);
process.exit(fail ? 1 : 0);
