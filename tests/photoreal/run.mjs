// tests/photoreal/run.mjs
// "Explore the block" apriva un Cesium nudo che caricava per un tempo
// assurdo. La causa: la camera veniva puntata su Roma DENTRO il .then() del
// tileset — cioè dopo — quindi Google streammava le tessere della vista
// globale di default prima di arrivare all'isolato giusto.
//
// Qui si guida il modulo vero con un Cesium finto e si verifica l'ORDINE
// delle operazioni, oltre ai comandi e alla pulizia in chiusura.
//
//   node tests/photoreal/run.mjs

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8941;

const chromium = await loadChromium();

const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const b = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(b);
  } catch { res.writeHead(404).end('x'); }
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

// Cesium finto: registra ogni chiamata in ordine, così possiamo affermare
// cosa è successo PRIMA di cosa.
function fakeCesium() {
  const log = (window.__log = []);
  const ev = () => { const l = []; return { addEventListener: f => l.push(f), removeEventListener: () => {}, fire: (...a) => l.forEach(f => f(...a)) }; };
  const tileset = { maximumScreenSpaceError: null, initialTilesLoaded: ev(), loadProgress: ev() };
  window.__tileset = tileset;
  window.Cesium = {
    Viewer: function () {
      log.push('viewer:new');
      this.isDestroyed = () => false;
      this.destroy = () => log.push('viewer:destroy');
      this.targetFrameRate = 0;
      this.clock = { onTick: ev() };
      this.scene = {
        primitives: { add: () => log.push('tileset:added') },
        canvas: document.createElement('canvas'),
        screenSpaceCameraController: {},
        skyAtmosphere: {},
      };
      this.camera = {
        positionCartographic: { height: 320 },
        lookAt: () => log.push('camera:lookAt'),
        lookAtTransform: () => log.push('camera:freeTransform'),
        zoomIn: () => log.push('camera:zoomIn'),
        zoomOut: () => log.push('camera:zoomOut'),
      };
    },
    Cesium3DTileset: {
      fromUrl: (url, opts) => {
        log.push('tileset:fetch');
        window.__tilesetUrl = url;
        window.__tilesetOpts = opts;
        Object.assign(tileset, opts);
        return Promise.resolve(tileset);
      },
    },
    Cartesian3: { fromDegrees: (...a) => ({ a }) },
    HeadingPitchRange: function () {},
    Matrix4: { IDENTITY: {} },
    Color: { fromCssColorString: () => ({}) },
    Math: { toRadians: (d) => d * Math.PI / 180 },
    ScreenSpaceEventHandler: function () { this.setInputAction = () => {}; },
    ScreenSpaceEventType: { LEFT_DOWN: 1, WHEEL: 2, PINCH_START: 3 },
  };
}

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await ctx.newPage();
const crashes = [];
page.on('pageerror', e => crashes.push(e.message));
await page.addInitScript(fakeCesium);
await page.goto(`http://127.0.0.1:${PORT}/tests/photoreal/host.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.BoomPhotoreal);

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

await page.evaluate(() => window.BoomPhotoreal.open({
  lat: 41.8902, lng: 12.4922, name: 'Via Cavour 12', key: 'FAKEKEY',
}));
await page.waitForTimeout(300);

console.log('\n\x1b[1mL\'ordine delle operazioni (il bug)\x1b[0m');
const log = await page.evaluate(() => window.__log);
const iCam = log.indexOf('camera:lookAt'), iFetch = log.indexOf('tileset:fetch');
check('la camera è puntata PRIMA di chiedere il tileset', iCam >= 0 && iFetch >= 0 && iCam < iFetch,
  `ordine reale: ${log.join(' → ')}`);
check('il tileset viene aggiunto alla scena', log.includes('tileset:added'));

console.log('\n\x1b[1mCaricamento progressivo\x1b[0m');
const opts = await page.evaluate(() => window.__tilesetOpts);
check('parte con un dettaglio permissivo (immagine subito)', opts.maximumScreenSpaceError > 16,
  'maximumScreenSpaceError=' + opts.maximumScreenSpaceError);
check('salta i livelli intermedi', opts.skipLevelOfDetail === true);
check('ha una cache dichiarata', opts.cacheBytes > 0);
const url = await page.evaluate(() => window.__tilesetUrl);
check('la chiave viaggia codificata nell\'URL di Google', /tile\.googleapis\.com.*key=FAKEKEY/.test(url));

console.log('\n\x1b[1mQuando la prima vista è pronta\x1b[0m');
await page.evaluate(() => window.__tileset.initialTilesLoaded.fire());
await page.waitForTimeout(700);
check('il dettaglio si affina da solo', await page.evaluate(() => window.__tileset.maximumScreenSpaceError) === 16);
check('la schermata di caricamento sparisce', !(await page.$('#prwrap .prload')));

console.log('\n\x1b[1mI comandi che prima non c\'erano\x1b[0m');
for (const [a, label] of [['in', 'avvicina'], ['out', 'allontana'], ['orbit', 'orbita on/off'],
                          ['reset', 'ricentra sulla casa'], ['pano', 'Street View'], ['full', 'schermo intero'],
                          ['close', 'chiudi']]) {
  check(`c'è il comando "${label}"`, !!(await page.$(`#prwrap [data-a="${a}"]`)));
}
check('ogni comando ha un\'etichetta accessibile', await page.evaluate(() =>
  [...document.querySelectorAll('#prwrap .prctl [data-a]')].every(b => b.getAttribute('aria-label'))));

console.log('\n\x1b[1mLo zoom funziona davvero\x1b[0m');
// Col vecchio codice l'orbita riportava la camera indietro al tick dopo:
// il pulsante sembrava rotto. Ora lo zoom stacca prima l'orbita.
await page.click('#prwrap [data-a="in"]');
await page.waitForTimeout(120);
check('zoom + muove la camera', (await page.evaluate(() => window.__log)).includes('camera:zoomIn'));
check('…e ferma l\'orbita automatica', await page.evaluate(() =>
  document.querySelector('#prwrap [data-a="orbit"]').getAttribute('aria-pressed') === 'false'));

console.log('\n\x1b[1mChiusura pulita\x1b[0m');
await page.click('#prwrap [data-a="close"]');
await page.waitForTimeout(200);
check('il viewer viene distrutto', (await page.evaluate(() => window.__log)).includes('viewer:destroy'));
check('non resta nulla nel DOM', !(await page.$('#prwrap')));
check('nessun errore JavaScript in tutto il giro', crashes.length === 0, crashes[0]);

await browser.close();
srv.close();
console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mIl 3D punta sull\'isolato prima di scaricarlo, e si guida.\x1b[0m');
