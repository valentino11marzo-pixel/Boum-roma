// tests/scarica/ui.mjs — IL DOWNLOAD PROVATO IN UN BROWSER VERO.
//
// I due difetti che su Safari uccidono uno scaricamento SENZA un errore —
// e che il sorgente da solo non sa smascherare:
//   1. <a download> non attaccato al documento → WebKit ignora il .click();
//   2. URL.revokeObjectURL() sincrono dopo il click → annulla il file in volo.
// Qui si estrae boomSave dal sorgente VERO, la si esegue in Chromium e si
// misurano i due invarianti al momento del click, più l'evento download
// reale del browser. Si auto-skippa senza playwright.

import { loadChromium, launchOptions } from '../_browser.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

// la funzione VERA, estratta dal monolite (mai riscritta nel test)
const m = app.match(/function boomSave\(src, name\) \{[\s\S]*?\n {4}\}/);
if (!m) { console.log('✗ FAIL boomSave non trovata nel sorgente'); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };
ok(true, 'boomSave estratta dal sorgente vero');

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
await page.setContent('<!doctype html><title>t</title><body></body>');

// spie: l'ancora era ATTACCATA al momento del click? quando si revoca?
await page.evaluate(() => {
  window.__spy = { attachedAtClick: null, clickAt: 0, revokeAt: 0 };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    window.__spy.attachedAtClick = document.body.contains(this);
    window.__spy.clickAt = performance.now();
    return realClick.apply(this, arguments);
  };
  const realRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = function (u) {
    window.__spy.revokeAt = performance.now();
    return realRevoke.call(URL, u);
  };
});
await page.evaluate('window.boomSave = ' + m[0]);

const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.evaluate(() => boomSave(new Blob(['ciao BOOM'], { type: 'text/plain' }), 'prova-scarica.txt'));
const download = await dl;

ok(!!download, 'il browser avvia un download VERO (evento download del browser)');
ok(download && download.suggestedFilename() === 'prova-scarica.txt', 'il file arriva col nome giusto, non con un id di Storage');

const spy = await page.evaluate(() => window.__spy);
ok(spy.attachedAtClick === true, "l'ancora è ATTACCATA al documento quando si clicca (su Safari, staccata = nessun download)");
ok(spy.revokeAt === 0, 'nessuna revoca sincrona: il file non viene annullato mentre parte');

// la revoca DEVE però arrivare (niente perdite di memoria): si aspetta la finestra
await page.waitForTimeout(200);
const still = await page.evaluate(() => window.__spy.revokeAt);
ok(still === 0, 'la revoca è rimandata di secondi, non di millisecondi');

// e il caso data: (documenti legacy in base64) arriva a destinazione
const bo = app.match(/function boomOpen\(url, name\) \{[\s\S]*?\n {4}\}/);
ok(!!bo, 'boomOpen estratta dal sorgente');
await page.evaluate(() => { window.toast = () => {}; });
await page.evaluate('window.boomOpen = ' + bo[0]);
const dl2 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.evaluate(() => boomOpen('data:text/plain;base64,' + btoa('legacy'), 'vecchio.txt'));
const d2 = await dl2;
ok(!!d2 && d2.suggestedFilename() === 'vecchio.txt', 'un documento legacy data: si scarica davvero (window.open lo bloccherebbe)');

await browser.close();
console.log(`\n${fail ? '✗' : '✓'} scarica ui: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
