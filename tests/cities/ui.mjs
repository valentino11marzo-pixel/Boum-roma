// tests/cities/ui.mjs — the generated city page in a real Chromium.
//
// What it proves (BOOM_CITIES_BRIEF.md §3, §6, §7, §10 + the brand):
//   - with JS OFF the page reads whole: the city in the title as text, the
//     prices as text, every section visible (no reveal left at opacity 0);
//   - with JS ON the Solari board spells the city, one cell per letter, and
//     lands in the space the hero reserved (no layout jump); the prices
//     become boards when scrolled into view; reduced motion = the word set
//     still, no spin;
//   - 390px: no horizontal scroll, the pay bar appears only past the hero,
//     the burger opens and closes the menu;
//   - the form: an invalid submit sends nothing and says why in place; a
//     plate's button preselects its service; a valid one posts JSON to
//     /api/city-lead with the city and opens the "file is open" state; a
//     failed one says so and gives the button back;
//   - zero JS errors, and no request leaves for a host we did not stub.
//
// The page is served from the repo root (it links /css and /assets). Every
// request outside localhost is aborted: /api/city-lead is answered here.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { CELL_EM } from '../../build-cities.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? ` — ${why}` : '')));

console.log('\n\x1b[1m▸ citiesui\x1b[0m  the city page in a real browser: the board, the door, the phone');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.extname(p)) p += '.html';                       // cleanUrls, as on Vercel
  const f = path.join(R, path.normalize(p));
  if (!f.startsWith(R) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch(launchOptions());

async function open({ js = true, width = 390, api = { status: 200, body: { ok: true, id: 'ams1' } }, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: 844 }, reducedMotion });
  const page = await ctx.newPage();
  const st = { errors: [], posts: [], foreign: [] };
  page.on('pageerror', (e) => st.errors.push(e.message));
  // the consent plate stays closed: it is boom-consent.js's own business
  await page.addInitScript(() => { try { localStorage.setItem('boom:consent', 'min:' + Date.now()); } catch (e) {} });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(base + '/api/city-lead')) {
      st.posts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
      return r.fulfill({ status: api.status, contentType: 'application/json', body: JSON.stringify(api.body) });
    }
    if (u.startsWith(base)) return r.continue();
    if (!/googletagmanager\.com/.test(u)) st.foreign.push(u);   // gtag is the one third party every BOOM page loads
    return r.abort();
  });
  await page.goto(`${base}/amsterdam`, { waitUntil: 'load' });
  return { ctx, page, st };
}
// Fixed chrome (the family strip at the top, the pay bar at the bottom) sits
// over the edges of a 844px viewport: a target is centred before the tap,
// as a thumb would do, never clicked through the bars.
const tap = async (page, sel) => {
  await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(250);
  await page.click(sel);
};
const board = (page) => page.evaluate(() => {
  const f = document.getElementById('flapCity');
  const cells = [...f.querySelectorAll('.fc2')];
  const r = f.getBoundingClientRect();
  const first = cells[0] && cells[0].getBoundingClientRect(), last = cells.length && cells[cells.length - 1].getBoundingClientRect();
  return {
    cells: cells.length,
    letters: cells.map((c) => c.querySelector('.st b').textContent).join(''),
    hostW: r.width, contentW: cells.length ? last.right - first.left : 0,
    minW: parseFloat(f.style.minWidth) * parseFloat(getComputedStyle(f).fontSize),
    h1Lines: Math.round(f.closest('h1').getBoundingClientRect().height / parseFloat(getComputedStyle(f.closest('h1')).lineHeight))
  };
});

// ── JS off: everything readable ───────────────────────────────────────────
{
  const { ctx, page } = await open({ js: false });
  const hidden = await page.$$eval('.rv', (els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
  const total = await page.$$eval('.rv', (els) => els.length);
  check(total >= 6 && hidden === 0, `without JS all ${total} reveal blocks are visible`, `${hidden} hidden`);
  check((await page.textContent('#flapCity')).trim() === 'AMSTERDAM', 'without JS the title still says AMSTERDAM, as text');
  const prices = await page.$$eval('.flap-prezzo', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(prices) === JSON.stringify(['€500', '€199', '€149']), 'without JS the three prices are text, in the plates');
  const chipTxt = await page.$$eval('.chip small', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(chipTxt) === JSON.stringify(['€500', '€199', '€149 · per viewing', 'advise me']), 'without JS the service chips show their prices as text');
  const wa = await page.getAttribute('.consent a[href^="https://wa.me/"]', 'href');
  check(wa === 'https://wa.me/393313251961', 'the WhatsApp link is a real href to the real number');
  await ctx.close();
}

// ── JS on, 390px: the board, the layout, the bar, the menu ────────────────
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(2600);                           // 600ms + the spin
  const b = await board(page);
  check(b.cells === 9 && b.letters === 'AMSTERDAM', `the board spells AMSTERDAM, one cell per letter (${b.cells} cells: "${b.letters}")`);
  check(Math.abs(b.hostW - b.contentW) < 4 && Math.abs(b.minW - b.contentW) < 4,
    `the board lands in the space the hero reserved — ${CELL_EM}em/cell: reserved ${b.minW.toFixed(1)}px, cells ${b.contentW.toFixed(1)}px (no layout jump)`);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= 390, `390px: no horizontal scroll (scrollWidth ${scrollW})`);
  check(await page.$eval('.serving', (e) => getComputedStyle(e).display === 'none'),
    '390px: the "searching daily on" line is not between the title and the door (it is the first ✓ of Full Search)');
  const chipH = await page.$$eval('.chip', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const chipCols = await page.$$eval('.chip', (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
  check(chipH.length === 4 && new Set(chipH).size === 1 && chipH[0] <= 60 && chipCols === 2, `390px: four service chips in a 2×2 grid, one line each (${chipH.join('/')}px)`);
  check(await page.evaluate(() => document.getElementById('enbref').getBoundingClientRect().top > document.getElementById('faq').getBoundingClientRect().top),
    'the fact sheet sits below the FAQ: human content first, machine content after');
  check(!(await page.$eval('#paybar', (e) => e.classList.contains('on'))), 'at the top the pay bar is off: the door itself is on screen');
  const rvBefore = await page.$eval('#services', (e) => getComputedStyle(e).opacity);
  await page.evaluate(() => document.getElementById('services').scrollIntoView());
  await page.waitForTimeout(1800);
  check(rvBefore === '0' && await page.$eval('#services', (e) => e.classList.contains('in')), 'a section starts hidden and is revealed when scrolled into view');
  check(await page.$eval('#paybar', (e) => e.classList.contains('on')), 'past the hero the pay bar comes up');
  const p1 = await page.$eval('#plan-full-search .flap-prezzo', (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join(''));
  check(p1 === '€500', `the first price spun onto its board when it came into view ("${p1}")`);
  // burger
  await page.click('#navToggle');
  check(await page.$eval('#mobileMenu', (e) => e.classList.contains('active')) && await page.getAttribute('#navToggle', 'aria-expanded') === 'true', 'the burger opens the menu');
  await page.click('#mobileMenu a[href="#faq"]');
  await page.waitForTimeout(300);
  check(!(await page.$eval('#mobileMenu', (e) => e.classList.contains('active'))), 'a menu link closes it');

  // the door: a plate preselects, an empty send says why, a full send posts once
  const picked = () => page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; });
  check(await picked() === '', 'no service is pre-checked when the page opens');
  await tap(page, '#plan-application-pack .go');
  await page.waitForTimeout(400);
  check(await picked() === 'application-pack', 'a plate\'s button checks its service chip in the door');
  await tap(page, '.chip.unsure');
  check(await picked() === 'unsure', 'tapping a chip changes the choice (the chip is the radio\'s label)');
  await tap(page, '#plan-application-pack .go');
  await page.waitForTimeout(400);
  await tap(page, '#fGo');
  const errName = await page.textContent('#fErr');
  check(st.posts.length === 0 && await page.$eval('#fErr', (e) => e.classList.contains('on')) && errName === await page.getAttribute('#cityForm', 'data-err-name'),
    'an empty form sends nothing and says, in place, that the name is missing');
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'not-an-email');
  await tap(page, '#fGo');
  check(st.posts.length === 0 && (await page.textContent('#fErr')) === await page.getAttribute('#cityForm', 'data-err-email'), 'a broken email is named, nothing is sent');
  await page.fill('#fEmail', 'test@example.com');
  await page.fill('#fMoveIn', 'February 2027');
  await page.selectOption('#fBudget', { index: 2 });
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  check(st.posts.length === 1 && st.posts[0].headers['content-type'] === 'application/json' && sent.city === 'amsterdam' && sent.name === 'Test Person'
    && sent.email === 'test@example.com' && sent.service === 'application-pack' && sent.budget === '€1,500 – €2,000' && sent.company === '',
    'a valid submit posts JSON once, with the city, the chosen service, the band and an empty honeypot', JSON.stringify(sent));
  check(await page.isVisible('#fDone') && !(await page.isVisible('#cityForm')), 'on success the form gives way to "your file is open"');
  check(st.errors.length === 0, 'no JS errors', st.errors.join(' | '));
  check(st.foreign.length === 0, 'no request to a host the page should not call', st.foreign.join(' | '));
  await ctx.close();
}

// ── a failed submit says so and gives the button back ─────────────────────
{
  const { ctx, page, st } = await open({ api: { status: 500, body: { ok: false, error: 'internal' } } });
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForFunction(() => document.getElementById('fErr').classList.contains('on'), null, { timeout: 4000 }).catch(() => {});
  check(st.posts.length === 1 && (await page.textContent('#fErr')) === await page.getAttribute('#cityForm', 'data-err-net'),
    'a failed send shows the page\'s own error text, in place (no alert)');
  check(await page.$eval('#fGo', (e) => e.style.pointerEvents === '' && e.style.opacity === '1') && !(await page.isVisible('#fDone')),
    'the button comes back and the "open" state stays hidden');
  await ctx.close();
}

// ── reduced motion: the word is there at once, no spin ────────────────────
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const b = await board(page);
  check(b.cells === 9 && b.letters === 'AMSTERDAM', 'with reduced motion the board is set still on AMSTERDAM, immediately');
  await ctx.close();
}

// ── 1440px: two columns, desktop nav, no bar ──────────────────────────────
{
  const { ctx, page } = await open({ width: 1440 });
  await page.waitForTimeout(2600);
  const b = await board(page);
  check(b.cells === 9 && Math.abs(b.minW - b.contentW) < 4, `1440px: the same board, the same reservation (${b.contentW.toFixed(0)}px)`);
  const geo = await page.evaluate(() => {
    const h1 = document.querySelector('.hero h1').getBoundingClientRect(), card = document.querySelector('.filecard').getBoundingClientRect();
    return { twoCols: card.left > h1.right, cardTop: card.top, h1Top: h1.top };
  });
  check(geo.twoCols && Math.abs(geo.cardTop - geo.h1Top) < 120, 'the door sits beside the title: the corridor and the door');
  check(await page.isVisible('.nav-links .nav-cta') && !(await page.isVisible('#navToggle')), '1440px: desktop nav with its CTA, no burger');
  check(await page.$eval('#paybar', (e) => getComputedStyle(e).display === 'none'), '1440px: no pay bar');
  check(await page.$eval('.serving', (e) => getComputedStyle(e).display !== 'none'), '1440px: the "searching daily on" line is back under the proofs');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
