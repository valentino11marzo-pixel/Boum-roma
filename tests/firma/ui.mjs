// tests/firma/ui.mjs — I CAMPI DELLO STUDENTE, APERTI IN UN BROWSER VERO.
//
// Il resto della suite `firma` asserisce sulla SORGENTE (i campi esistono,
// readStud li manda, convert li porta sul contratto) e `tests/money` prova
// il giro server fino al contratto. Resta una cosa che solo un browser può
// dire: che quei campi si VEDANO. Un campo presente nel file ma sepolto
// sotto un display che non si riapre raccoglie esattamente zero dati — ed è
// il modo più silenzioso di riavere l'Allegato C coi puntini.
//
// Si prova quello che fa l'operatore: sceglie «Student Housing», i campi
// compaiono, scrive, torna al transitorio, i campi si richiudono. E si prova
// dal TELEFONO (390px), dove la console si usa davvero.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8934;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const browser = await chromium.launch(launchOptions());
const errs = [];

async function run(width, label) {
  const page = await browser.newPage({ viewport: { width, height: 780 } });
  page.on('pageerror', (e) => errs.push(label + ': ' + e.message));
  // niente rete esterna: Firebase non serve al form, e un CDN lento
  // renderebbe la suite un dado. Le richieste locali passano.
  await page.route('**/*', (r) => (r.request().url().includes('localhost:' + PORT) ? r.continue() : r.abort()));
  await page.goto(`http://localhost:${PORT}/pre-agreement-admin.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(400);
  // la console si apre sui Deals e mostra il form solo dopo il login: qui non
  // c'è (né serve) un utente Firebase, quindi si accende la shell e si va sul
  // tab «Nuovo», che è il punto da provare.
  await page.evaluate(() => { document.getElementById('app').style.display = 'block'; showTab('new'); });
  await page.waitForTimeout(80);

  const disp = (sel) => page.$eval(sel, (e) => getComputedStyle(e).display);
  const shown = async (sel) => page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
  });

  ok(await disp('#studBox') === 'none', `${label}: sul caso normale i campi studente non ingombrano`);

  await page.selectOption('#fType', { label: 'Student Housing (Allegato C)' });
  ok(await shown('#studBox') && await shown('#fStudCourse') && await shown('#fStudUni'),
    `${label}: scegliendo «Student Housing» corso e università compaiono DAVVERO (visibili, non solo nel DOM)`);

  await page.fill('#fStudCourse', 'Laurea Magistrale in Economia');
  await page.fill('#fStudUni', 'LUISS Guido Carli');
  await page.selectOption('#fStudKind', { label: 'Laurea Magistrale' });
  await page.fill('#fStudYear', '2026/2027');
  ok(await page.$eval('#fStudCourse', (e) => e.value) === 'Laurea Magistrale in Economia'
     && await page.$eval('#fStudKind', (e) => e.value) === 'Laurea Magistrale',
    `${label}: si compilano (campi raggiungibili col pollice, tendina inclusa)`);

  await page.selectOption('#fType', { label: 'Transitional Lease' });
  ok(await disp('#studBox') === 'none', `${label}: tornando al transitorio si richiudono`);
  await page.selectOption('#fType', { label: 'Student Housing (Allegato C)' });
  ok(await shown('#studBox') && await page.$eval('#fStudUni', (e) => e.value) === 'LUISS Guido Carli',
    `${label}: e riaprendo il lavoro è ancora lì (un ripensamento non cancella quello che hai scritto)`);

  await page.close();
}

await run(1280, 'desktop');
await run(390, 'telefono');
// «firebase is not defined» è colpa NOSTRA, non della pagina: il CDN è
// bloccato apposta qui sopra. Si scarta quello e si pretende il resto — un
// errore vero nel form fermerebbe il codice che apre i campi.
const real = errs.filter((e) => !/firebase is not defined/.test(e));
ok(real.length === 0, 'nessun errore JS nel form' + (real.length ? ' — ' + real.join(' | ') : ''));

await browser.close();
server.close();
console.log(`\n${fail ? '✗' : '✓'} firma-ui: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
