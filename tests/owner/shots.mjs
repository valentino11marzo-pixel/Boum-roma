// tests/owner/shots.mjs — LE FOTO DELLA PAGINA DEL PROPRIETARIO.
// Non è una suite: è lo strumento per GUARDARE /proprietario con le
// proiezioni del motore VERO (le stesse di ui.mjs), stanza per stanza, al
// telefono e al desktop. Nessun controllo, nessuna rete: gli stessi stub.
//
//   node tests/owner/shots.mjs <cartella> [scenario…]
//
// Scenari: ok osservo nonso tu vuoto rooms renewal paper multi
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { projection, multiProjection, OWNER_UID } from './fixtures.mjs';

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }
const OUT = process.argv[2];
if (!OUT) { console.log('uso: node tests/owner/shots.mjs <cartella> [scenario…]'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const HTML = read('proprietario.html'), ENGINE = read('js/owner-archive-engine.js');
const ORIGIN = 'https://www.boomrome.com';

const multi = () => multiProjection();
const want = process.argv.slice(3);
const SC = { ok: () => projection('ok'), osservo: () => projection('osservo'), nonso: () => projection('nonso'), tu: () => projection('tu'),
  vuoto: () => projection('vuoto'), rooms: () => projection('rooms'), renewal: () => projection('renewal'), paper: () => projection('paper'), multi };
const browser = await chromium.launch(launchOptions());
for (const name of (want.length ? want : ['ok', 'tu', 'osservo', 'multi'])) {
  let proj; try { proj = SC[name](); } catch (e) { console.log(name + ': fixture non costruibile — ' + e.message); continue; }
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const mobile = w < 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      const js = (body) => route.fulfill({ status: 200, contentType: 'application/javascript', body });
      if (u.hostname.endsWith('gstatic.com')) return js('window.firebase={auth:function(){return{signOut:function(){return Promise.resolve()}}}};');
      if (u.pathname === '/js/firebase-config.js' || u.pathname === '/js/boom-err.js') return js('');
      if (u.pathname === '/js/boom-portal.js') return js(`window.BoomPortal={requireAuth:function(){return Promise.resolve({user:{uid:'${OWNER_UID}',getIdToken:function(){return Promise.resolve('t')}},profile:{role:'landlord'}})}};`);
      if (u.pathname === '/js/owner-archive-engine.js') return js(ENGINE);
      if (u.pathname === '/api/owner/archivio') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, archive: proj }) });
      if (u.pathname === '/proprietario') return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(ORIGIN + '/proprietario', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('load').hidden, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(250);
    const rooms = ['oggi', 'case', 'archivio'];
    for (const r of rooms) {
      await page.evaluate((x) => { location.hash = x; }, r);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `${name}-${w}-${r}.png`), fullPage: true });
    }
    if (name === 'multi') {
      await page.evaluate(() => { location.hash = 'p=p2'; });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `${name}-${w}-casa2.png`), fullPage: true });
    }
    const ov = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
    console.log(`${name}@${w}: ${errs.length ? 'ERRORI ' + errs.join(' | ') : 'ok'}${ov > 0 ? ' · scorre di lato di ' + ov + 'px' : ''}`);
    await ctx.close();
  }
}
await browser.close();
