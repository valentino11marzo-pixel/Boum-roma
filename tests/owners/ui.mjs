// tests/owners/ui.mjs — /owners in un browser vero, a 390 e a 1440 px.
//
// La firma della pagina è una pianta che si alza SOLO quando il lettore lo
// chiede. Qui si prova che è vero: al caricamento non si muove niente
// (getAnimations() vuoto), il gesto la alza una volta sola, le etichette
// restano bersagli veri (≥ 44 px, dentro il riquadro, mai sovrapposte), la
// pagina non scorre di lato, non salta (CLS), non chiede niente a nessun host
// esterno oltre al tag di misura sotto consenso, e il modulo dice la cosa
// giusta con 200, 400 e 429. Rete esterna abortita, /api in 404 salvo dove
// il test risponde lui.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (t, c, extra) => {
  if (c) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + t); }
  else { fail++; console.log('  \x1b[31m✗ ' + t + '\x1b[0m' + (extra !== undefined ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '')); }
};
const sez = (t) => console.log('\n\x1b[1m▸ ' + t + '\x1b[0m');
console.log('\n\x1b[1m▸ ownersui\x1b[0m  /owners in un browser vero: la pianta si alza solo col gesto');

const chromium = await loadChromium();
if (!chromium) { console.log('  SKIP: playwright non disponibile'); process.exit(0); }

const TIPI = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.txt': 'text/plain', '.zip': 'application/zip' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/api/')) { s.writeHead(404); return s.end('{}'); }
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
  s.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const br = await chromium.launch(launchOptions());

async function apri(w, h, { mobile = false, query = '', reduced = false, still = false, js = true, api = null } = {}) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference', javaScriptEnabled: js });
  const pg = await ctx.newPage();
  const esterne = [], immagini = [];
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) {
      if (/\.webp(\?|$)/.test(u)) immagini.push(u);
      if (api && u.includes('/api/partners/submit')) return api(r);
      return r.continue();
    }
    if (u.startsWith('data:')) return r.continue();
    esterne.push(u);
    return r.abort();
  });
  if (js) await pg.addInitScript(({ still }) => {
    window.__cls = 0; window.__aperti = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
    if (still) try { localStorage.setItem('boom:still', '1'); } catch (e) {}
    window.open = (u) => { window.__aperti.push(String(u)); return null; };
  }, { still });
  await pg.goto(`${BASE}/owners${query}`, { waitUntil: 'load' });
  if (js) await pg.waitForFunction(() => window.BOOM_OWNERS === true, null, { timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(400);
  return { ctx, pg, esterne, immagini };
}

const geom = (pg) => pg.evaluate(() => {
  const box = document.getElementById('riquadro').getBoundingClientRect();
  const et = [...document.querySelectorAll('#riquadro .et')].map((a) => {
    const r = a.getBoundingClientRect();
    return { s: a.dataset.stanza, x: r.left, y: r.top, w: r.width, h: r.height, vis: getComputedStyle(a).visibility !== 'hidden' && getComputedStyle(a).opacity !== '0' };
  });
  const dentro = et.every((e) => e.x >= box.left - 1 && e.y >= box.top - 1 && e.x + e.w <= box.right + 1 && e.y + e.h <= box.bottom + 1);
  const grandi = et.every((e) => e.w >= 43.9 && e.h >= 43.9);   // 44 px, meno l'arrotondamento subpixel
  let sovrap = [];
  for (let i = 0; i < et.length; i++) for (let j = i + 1; j < et.length; j++) {
    const a = et[i], b = et[j];
    if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) sovrap.push(a.s + '×' + b.s);
  }
  return { n: et.length, dentro, grandi, sovrap, et, sforo: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]]) {
  sez(`${w}px — al caricamento niente si muove`);
  {
    const { ctx, pg, esterne, immagini } = await apri(w, h, { mobile });
    const s = await pg.evaluate(() => ({ anim: document.getAnimations().length, ready: window.BOOM_OWNERS === true,
      alzata: document.getElementById('riquadro').classList.contains('alzata'),
      alzaInVista: (() => { const r = document.getElementById('alza').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && r.width > 0; })() }));
    ok('la pagina viva si è avviata (BOOM_OWNERS)', s.ready);
    ok('getAnimations() vuoto al load', s.anim === 0, s.anim);
    ok('la pianta NON si è alzata da sola', !s.alzata);
    if (mobile) ok('«↥ Alza la pianta» sta nel primo schermo a 390×844', s.alzaInVista);
    const g0 = await geom(pg);
    ok('sei etichette, ≥ 44 px, dentro il riquadro, senza sovrapposizioni (piatta)', g0.n === 6 && g0.grandi && g0.dentro && !g0.sovrap.length, g0);
    ok('nessuno scorrimento laterale', g0.sforo <= 0, g0.sforo);
    // il gesto
    await pg.click('#alza');
    await pg.waitForTimeout(1500);
    const s1 = await pg.evaluate(() => ({ alzata: document.getElementById('riquadro').classList.contains('alzata'), anim: document.getAnimations().length }));
    ok('il bottone alza la pianta', s1.alzata);
    ok('a salita finita non si muove più niente', s1.anim === 0, s1.anim);
    const g1 = await geom(pg);
    ok('alzata: etichette ≥ 44 px, dentro, senza sovrapposizioni', g1.n === 6 && g1.grandi && g1.dentro && !g1.sovrap.length, g1);
    ok('alzata: nessuno scorrimento laterale', g1.sforo <= 0, g1.sforo);
    // scorri tutta la pagina: quante immagini chiede il percorso?
    await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
    await pg.waitForTimeout(500);
    const imm = [...new Set(immagini)];
    if (mobile) ok(`≤ 6 immagini sul percorso mobile (${imm.length})`, imm.length <= 6, imm);
    ok('l\'inventario d\'uscita e il rendiconto a tre case NON si scaricano senza un tocco',
      !imm.some((u) => /uscita|tre-case/.test(u)), imm);
    const cls = await pg.evaluate(() => window.__cls);
    ok(`CLS ≤ 0,02 (${cls.toFixed(4)})`, cls <= 0.02);
    const est = esterne.filter((u) => !/googletagmanager\.com\/gtag\/js/.test(u));
    ok('nessuna richiesta a host esterni oltre al tag di misura', est.length === 0, est);
    await ctx.close();
  }
}

sez('reduced-motion e «Ferma animazioni»: la pianta si alza senza muoversi');
for (const opt of [{ reduced: true }, { still: true }]) {
  const { ctx, pg } = await apri(390, 844, { mobile: true, ...opt });
  await pg.click('#alza');
  await pg.waitForTimeout(80);
  const s = await pg.evaluate(() => ({ alzata: document.getElementById('riquadro').classList.contains('alzata'), anim: document.getAnimations().length,
    still: document.documentElement.classList.contains('still') }));
  ok(`${opt.reduced ? 'reduced-motion' : 'still'}: .alzata subito, nessuna animazione in corso`, s.alzata && s.anim === 0, s);
  if (opt.still) ok('still letto prima del paint (html.still)', s.still);
  await ctx.close();
}

sez('il cartiglio: ?z= compila senza alzare; zona + metri alzano una volta');
{
  const { ctx, pg } = await apri(390, 844, { mobile: true, query: '?z=C13&mq=90' });
  const s = await pg.evaluate(() => ({ z: document.getElementById('zona').value, mq: document.getElementById('mq').value,
    alzata: document.getElementById('riquadro').classList.contains('alzata'), chip: !document.getElementById('fCasa').hidden,
    tg: document.getElementById('tgTxt').textContent, esito: document.getElementById('esito').textContent }));
  ok('?z=C13&mq=90 compila zona e metri', s.z === 'C13' && s.mq === '90', s);
  ok('…e NON alza la pianta', !s.alzata);
  ok('…e riempie targhetta, esito e riepilogo del modulo', /Monteverde Nuovo/i.test(s.tg) && /Monteverde Nuovo/i.test(s.esito) && s.chip, s);
  ok('cancello chiuso: nell\'esito nessun tetto in euro', !/€ al mese/.test(s.esito), s.esito);
  await ctx.close();
}
{
  const { ctx, pg } = await apri(390, 844, { mobile: true });
  await pg.selectOption('#zona', 'C40');
  await pg.fill('#mq', '70');
  await pg.locator('#mq').blur();
  await pg.waitForTimeout(1500);
  const s = await pg.evaluate(() => ({ alzata: document.getElementById('riquadro').classList.contains('alzata'), q: location.search }));
  ok('zona + metri validi alzano la pianta', s.alzata);
  ok('e l\'indirizzo si ricorda la casa (?z=C40&mq=70)', /z=C40/.test(s.q) && /mq=70/.test(s.q), s.q);
  await pg.selectOption('#zona', '__wa');
  await pg.waitForTimeout(200);
  const aperti = await pg.evaluate(() => ({ a: window.__aperti, v: document.getElementById('zona').value }));
  ok('«Non la trovo» apre WhatsApp e rimette il menu a posto', aperti.a.some((u) => /wa\.me\/393313251961/.test(u)) && aperti.v !== '__wa', aperti);
  await ctx.close();
}

sez('una stanza toccata: la pianta si alza, poi si arriva alla stanza');
{
  const { ctx, pg } = await apri(390, 844, { mobile: true });
  await pg.click('#riquadro .et[data-stanza="cassetta"]');
  await pg.waitForTimeout(1800);
  const s = await pg.evaluate(() => ({ alzata: document.getElementById('riquadro').classList.contains('alzata'),
    top: document.getElementById('cassetta').getBoundingClientRect().top, cls: window.__cls, hash: location.hash }));
  ok('il tocco su «Cassetta» alza la pianta', s.alzata);
  ok('e porta alla stanza, sotto la barra', s.top >= 40 && s.top < 400 && s.hash === '#cassetta', s);
  ok(`nessun salto (CLS ${s.cls.toFixed(4)})`, s.cls <= 0.02);
  await ctx.close();
}

sez('1440px: la stanza accesa è quella che stai leggendo');
{
  const { ctx, pg } = await apri(1440, 900, {});
  for (const s of ['cassaforte', 'soggiorno', 'cassetta']) {
    await pg.evaluate((id) => document.getElementById('h-' + id).scrollIntoView({ block: 'center', behavior: 'instant' }), s);
    await pg.waitForTimeout(400);
    const acc = await pg.evaluate(() => document.getElementById('riquadro').dataset.accesa);
    ok(`leggendo #${s} si accende «${s}»`, acc === s, acc);
  }
  const sticky = await pg.evaluate(() => getComputedStyle(document.getElementById('pianta')).position);
  ok('la pianta resta ferma a sinistra (sticky)', sticky === 'sticky', sticky);
  await ctx.close();
}

sez('il modulo: 200, 400, 429');
for (const [codice, corpo, attesa] of [
  [200, { ok: true, id: 'x1' }, /Ricevuto, Anna/],
  [400, { error: 'contact_required' }, /cifre|numero/i],
  [429, { error: 'rate_limited' }, /Troppi invii/],
]) {
  const { ctx, pg } = await apri(390, 844, { mobile: true, api: (r) => r.fulfill({ status: codice, contentType: 'application/json', body: JSON.stringify(corpo) }) });
  await pg.fill('#fName', 'Anna Esempio');
  await pg.fill('#fPhone', '+39 333 123 4567');
  await pg.click('#fSend');
  await pg.waitForTimeout(700);
  const t = await pg.evaluate(() => document.getElementById('uscitaBox').innerText);
  ok(`risposta ${codice}: il modulo lo dice`, attesa.test(t), t.slice(0, 300));
  await ctx.close();
}

sez('senza JavaScript la pagina è intera');
{
  const { ctx, pg } = await apri(390, 844, { mobile: true, js: false });
  const s = await pg.evaluate(() => ({ alza: getComputedStyle(document.getElementById('alza')).display,
    et: document.querySelectorAll('#riquadro nav.stanze a.et').length,
    esito: document.getElementById('esito').textContent.trim().length, sforo: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok('niente bottone «Alza» (non farebbe niente)', s.alza === 'none', s.alza);
  ok('le stanze sono link veri e l\'esito d\'esempio è scritto', s.et === 6 && s.esito > 40, s);
  ok('nessuno scorrimento laterale', s.sforo <= 0, s.sforo);
  await ctx.close();
}

await br.close(); srv.close();
console.log(fail ? `\n  \x1b[31m${fail} guasti\x1b[0m — ${pass} passed, ${fail} failed` : `\n  \x1b[32m/owners si muove solo quando glielo chiedi\x1b[0m — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
