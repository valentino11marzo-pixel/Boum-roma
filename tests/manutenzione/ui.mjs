// tests/manutenzione/ui.mjs — /guasto in un browser vero (Chromium, 390px).
// La pagina VERA (guasto.html) servita in locale; la porta /api/maintenance/
// guasto finta. Le regole: l'inquilino straniero la legge in INGLESE (salvo
// ?lang o un browser italiano), l'emergenza mette in ALTO WhatsApp di BOOM e
// il 112, la foto si sceglie anche dalla galleria (niente capture), una foto
// che non sale si DICE, e l'informativa privacy è a un tocco.
// Uso: BOOM_PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core/index.js node tests/manutenzione/ui.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ROOT = new URL('../../', import.meta.url);
let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✓ ' + name); };

const calls = [];
let photoOk = true;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/maintenance/guasto' && req.method === 'POST') {
    let body = ''; for await (const ch of req) body += ch;
    const b = JSON.parse(body); calls.push(b);
    res.setHeader('Content-Type', 'application/json');
    if (b.t === 'p1.busy') { res.statusCode = 429; res.end('{"ok":false,"error":"rate_limited"}'); return; }
    if (b.t !== 'p1.tok') { res.statusCode = 404; res.end('{"ok":false,"error":"invalid_link"}'); return; }
    if (b.op === 'lookup') { res.end(JSON.stringify({ ok: true, unit: { building: 'Piazza Esempio 42', interno: '7', label: 'Int. 7' } })); return; }
    if (b.op === 'report') { res.end(JSON.stringify({ ok: true, id: 'm1', photo: b.photo ? photoOk : null })); return; }
  }
  if (url.pathname === '/guasto') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(new URL('guasto.html', ROOT))); return; }
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const chromium = await loadChromium();
if (!chromium) { server.close(); console.log('SKIP: playwright non disponibile'); process.exit(0); }
const browser = await chromium.launch(launchOptions());
async function open(qs, locale) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/guasto?' + qs);
  await page.waitForSelector('#f, .where');
  return { page, ctx, errors };
}
// rapporto di contrasto WCAG fra due colori rgb()
function lum(rgb) { const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

try {
  await check('un browser in inglese (o turco) vede la pagina in INGLESE: titolo, lingua del documento, etichette', async () => {
    for (const loc of ['en-US', 'tr-TR']) {
      const { page, ctx, errors } = await open('t=p1.tok', loc);
      await page.waitForSelector('#f');
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en', loc);
      assert.equal(await page.title(), 'Report a problem · BOOM');
      assert.match(await page.textContent('h1'), /What’s wrong at home/);
      assert.equal(await page.getAttribute('.lang', 'aria-label'), 'Language');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });
  await check('un browser in italiano vede l\'italiano; ?lang=it e ?lang=en vincono sul browser', async () => {
    let o = await open('t=p1.tok', 'it-IT'); await o.page.waitForSelector('#f');
    assert.equal(await o.page.evaluate(() => document.documentElement.lang), 'it');
    assert.equal(await o.page.title(), 'Segnala un guasto · BOOM'); await o.ctx.close();
    o = await open('t=p1.tok&lang=it', 'en-US'); await o.page.waitForSelector('#f');
    assert.match(await o.page.textContent('h1'), /Cosa non va in casa/); await o.ctx.close();
    o = await open('t=p1.tok&lang=en', 'it-IT'); await o.page.waitForSelector('#f');
    assert.match(await o.page.textContent('h1'), /What’s wrong/); await o.ctx.close();
  });
  await check('il cambio lingua traduce anche titolo e aria-label; la scelta resta su questo telefono', async () => {
    const { page, ctx } = await open('t=p1.tok', 'en-US'); await page.waitForSelector('#f');
    await page.click('[data-lang="it"]');
    assert.equal(await page.title(), 'Segnala un guasto · BOOM');
    assert.equal(await page.getAttribute('.lang', 'aria-label'), 'Lingua');
    await page.reload(); await page.waitForSelector('#f');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'it');
    await ctx.close();
  });
  await check('la foto si sceglie anche dalla galleria: nessun attributo capture', async () => {
    const { page, ctx } = await open('t=p1.tok', 'en-US'); await page.waitForSelector('#f');
    assert.equal(await page.getAttribute('#ph', 'capture'), null);
    assert.equal(await page.getAttribute('#ph', 'accept'), 'image/*');
    await ctx.close();
  });
  await check('EMERGENZA: il riquadro SOS compare IN ALTO (sopra il modulo) con WhatsApp di BOOM e il 112; sparisce tornando a Normale', async () => {
    const { page, ctx } = await open('t=p1.tok', 'en-US'); await page.waitForSelector('#f');
    assert.equal(await page.$('#sosTop .sosbtn'), null);
    await page.click('input[name="priority"][value="urgent"] + span');
    const wa = await page.getAttribute('#sosTop a.wa', 'href');
    assert.ok(wa.startsWith('https://wa.me/393313251961?text='), wa);
    assert.match(decodeURIComponent(wa), /EMERGENCY — Piazza Esempio 42 · Int\. 7/);
    assert.equal(await page.getAttribute('#sosTop a.call', 'href'), 'tel:112');
    const sosY = await page.$eval('#sosTop', e => e.getBoundingClientRect().top), formY = await page.$eval('#f', e => e.getBoundingClientRect().top);
    assert.ok(sosY < formY, 'il riquadro sta sopra il modulo');
    assert.ok((await page.$eval('#sosTop', e => e.getBoundingClientRect().top)) < 844, 'visibile senza scorrere');
    // si legge dall'alto in basso: titolo, frase, tasti (una classe .top
    // della testata lo aveva messo in riga, stretto a 390px)
    const [h2B, pT, pB, rowT] = await page.$eval('#sosTop', e => [e.querySelector('h2').getBoundingClientRect().bottom, e.querySelector('p').getBoundingClientRect().top,
      e.querySelector('p').getBoundingClientRect().bottom, e.querySelector('.sosrow').getBoundingClientRect().top]);
    assert.ok(h2B <= pT + 1 && pB <= rowT + 1, 'il riquadro è impilato');
    await page.click('input[name="priority"][value="medium"] + span');
    assert.equal(await page.$('#sosTop .sosbtn'), null);
    await ctx.close();
  });
  await check('la foto che non sale (photo:false): la segnalazione è partita E la pagina dice di mandarla su WhatsApp', async () => {
    photoOk = false;
    const { page, ctx } = await open('t=p1.tok', 'en-US'); await page.waitForSelector('#f');
    await page.fill('#desc', 'The kitchen tap is dripping all the time');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
    await page.setInputFiles('#ph', { name: 'tap.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('.photo img');
    await page.click('#send');
    await page.waitForSelector('.done');
    assert.match(await page.textContent('.warn'), /photo didn’t arrive/);
    assert.ok((await page.getAttribute('.warn a', 'href')).startsWith('https://wa.me/393313251961'));
    assert.equal(calls.at(-1).photo.type, 'image/jpeg');
    await ctx.close();
    photoOk = true;
  });
  await check('foto arrivata = nessun avviso; un\'emergenza inviata ripete il riquadro SOS nella conferma', async () => {
    const { page, ctx } = await open('t=p1.tok', 'en-US'); await page.waitForSelector('#f');
    await page.click('input[name="priority"][value="urgent"] + span');
    await page.fill('#desc', 'Water is coming through the ceiling');
    await page.click('#send'); await page.waitForSelector('.done');
    assert.equal(await page.$('.warn'), null);
    assert.ok(await page.$('.sos.sostop a.wa'));
    await ctx.close();
  });
  await check('link non più valido (es. dopo un cambio di inquilino): lo dice e offre WhatsApp', async () => {
    const { page, ctx } = await open('t=p1.old', 'en-US');
    await page.waitForSelector('.where');
    assert.match(await page.textContent('.where'), /no longer active/);
    assert.ok((await page.getAttribute('main a.wa', 'href')).startsWith('https://wa.me/393313251961'));
    await ctx.close();
  });
  await check('troppe aperture dallo stesso indirizzo (429): dice «riprova fra qualche minuto», non «controlla la connessione»', async () => {
    const { page, ctx } = await open('t=p1.busy', 'en-US');
    await page.waitForSelector('#retry');
    const txt = await page.textContent('.where');
    assert.match(txt, /try again in a few minutes/); assert.doesNotMatch(txt, /connection/);
    await ctx.close();
  });
  await check('accessibilità: tasti lingua ≥44px, piede leggibile (contrasto ≥4,5:1), focus visibile sulla foto, link all\'informativa', async () => {
    const { page, ctx } = await open('t=p1.tok', 'en-US'); await page.waitForSelector('#f');
    for (const h of await page.$$eval('.lang button', bs => bs.map(b => b.getBoundingClientRect().height))) assert.ok(h >= 44, 'altezza ' + h);
    const fg = await page.$eval('.foot', e => getComputedStyle(e).color), bg = await page.$eval('body', e => getComputedStyle(e).backgroundColor);
    assert.ok(ratio(fg, bg) >= 4.5, 'contrasto ' + ratio(fg, bg).toFixed(2));
    assert.equal(await page.getAttribute('.foot a[href="/privacy-inquilini"]', 'href'), '/privacy-inquilini');
    await page.focus('#ph');
    assert.notEqual(await page.$eval('.photo label', e => getComputedStyle(e).outlineStyle), 'none');
    assert.ok(await page.$('fieldset legend'), 'i gruppi di scelta hanno un nome (fieldset/legend)');
    await ctx.close();
  });
} finally {
  await browser.close(); server.close();
}
console.log(`\n${count} check — /guasto in Chromium a 390px.`);
