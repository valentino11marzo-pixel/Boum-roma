// tests/cities/ui.mjs — the city desk (v1.5, «il biglietto») in a real
// Chromium. The page is served from the repo root; /api/city-lead (POST and
// the paid GET) and /api/service-checkout are answered here, and every
// request to a host we did not stub is aborted and counted.
//
// What it proves:
//   - the first phone screen is ONE pass: the city settles on its board, the
//     sentence with the must-state, three fare rows with their prices, the
//     gold door and who answers — all above the fold at 390×844;
//   - a tapped fare row does not move under the finger (manual scroll
//     anchoring, < 2 px), opens ITS ticket in place, closes the other, and on
//     a phone the ONE door moves into the open ticket (never two doors); at
//     1440 the door stays in the stub;
//   - the refund rule is RENDERED once beside the €500: under the closed
//     Full Search row, inside its open ticket (the outside copy steps back);
//   - the free door: the first tap reveals two fields and focuses the name,
//     errors say what to fix in place and clear as the visitor types, the
//     POST carries the plan the visitor was reading (nothing pre-selected
//     otherwise) and ONE contact split into email or phone, three Enters make
//     one POST, OPEN prints the SERVER's file number, a failure prints
//     nothing and gives the door back;
//   - pay only from a ticket: the till opens on THAT plan, unticked, "Pay and
//     book" until the tick, Enter on the tick never pays, its errors in
//     place, the POST says startNow only when ticked, a refused checkout
//     says so in the till, Escape gives the focus back;
//   - the paid return: ?paid= alone stamps nothing — "being confirmed" until
//     the server says paid:true, then PAID with the server's file, the plan,
//     the start date (the 14 days' end when the box was not ticked) and ONE
//     purchase, never twice on a reload; a forged ?paid= does nothing; no pay
//     button while confirming or after PAID;
//   - the desk clock: Saturday says "Monday from 09:00", Koningsdag
//     "Tomorrow", the Diada in Barcelona "Monday", a weekday "desk open until
//     19:00" — the zone name of the opening instant (CET in winter);
//   - no JS: the page reads whole, the door is shut and says where to write;
//   - 320px: no horizontal scroll, every target ≥ 44 px; reduced motion: the
//     board settles at once; the strip: the same door, after the pass's door
//     leaves the screen, no price, never with the till open;
//   - the waitlists (Paris, Berlin): "Open my file", no pay button, no till;
//     Madrid's till repeats "Optional, chosen in writing";
//   - zero JS errors, no request to a host we did not stub.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? ` — ${why}` : '')));

console.log('\n\x1b[1m▸ citiesui\x1b[0m  the city desk in a real browser: the pass, the fares, the door, the till, the paid return, the clock');

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

const FILE = 'BM 7K2QX';
const LEAD_OK = { status: 200, body: { ok: true, id: 'city_ui0000test1', file: FILE } };
const SID = 'cs_test_ui0000000001';
const allErrors = [], allForeign = [];
async function open({ js = true, width = 390, height = null, api = LEAD_OK, paid = { status: 200, body: { ok: true, pending: true } }, reducedMotion = 'no-preference', slug = 'amsterdam', query = '', checkout = null, consent = true, clock = null, touch = false } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: height || (width < 600 ? 844 : 900) }, reducedMotion, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const st = { errors: [], posts: [], gets: [], checkouts: [], foreign: [] };
  page.on('pageerror', (e) => { st.errors.push(e.message); allErrors.push(`${slug}${query}: ${e.message}`); });
  // the consent plate stays closed unless a test is about it
  if (consent) await page.addInitScript(() => { try { localStorage.setItem('boom:consent', 'min:' + Date.now()); } catch (e) {} });
  // a fixed clock: new Date() and Date.now() return it, everything else is the real Date
  if (clock) await page.addInitScript((iso) => {
    const RD = Date, T = new RD(iso).getTime();
    function D() { return arguments.length ? new RD(...arguments) : new RD(T); }
    D.now = () => T; D.UTC = RD.UTC; D.parse = RD.parse; D.prototype = RD.prototype;
    window.Date = D;
  }, clock);
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(base + '/api/city-lead')) {
      if (r.request().method() === 'GET') {
        st.gets.push(u);
        const b = typeof paid === 'function' ? paid(st.gets.length) : paid;
        return r.fulfill({ status: b.status, contentType: 'application/json', body: JSON.stringify(b.body) });
      }
      st.posts.push(JSON.parse(r.request().postData() || '{}'));
      if (api.delay) await new Promise((res) => setTimeout(res, api.delay));
      return r.fulfill({ status: api.status, contentType: 'application/json', body: JSON.stringify(api.body) });
    }
    if (u.startsWith(base + '/api/service-checkout')) {
      st.checkouts.push(JSON.parse(r.request().postData() || '{}'));
      const res = checkout || { status: 200, body: { ok: true, url: `${base}/${slug}?paid=full-search&start=0&session_id=${SID}` } };
      return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
    }
    if (u.startsWith(base)) return r.continue();
    if (!/googletagmanager\.com/.test(u)) { st.foreign.push(u); allForeign.push(u); }
    return r.abort();
  });
  await page.goto(`${base}/${slug}${query}`, { waitUntil: 'load' });
  return { ctx, page, st };
}
const events = (page) => page.evaluate(() => (window.dataLayer || []).map((a) => [].slice.call(a)).filter((a) => a[0] === 'event').map((a) => ({ name: a[1], p: a[2] || {} })));
const rect = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; });
const shown = (page, sel) => page.$eval(sel, (e) => !e.hidden && !!e.offsetParent && getComputedStyle(e).visibility !== 'hidden').catch(() => false);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim().replace(/\s+/g, ' ')).catch(() => null);
const boardWord = (page, sel) => page.$eval(sel, (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join('').trim()).catch(() => '');
const center = (page, sel) => page.$eval(sel, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
const tap = async (page, sel) => { await center(page, sel); await page.waitForTimeout(120); await page.click(sel); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const RULE = JSON.parse(fs.readFileSync(path.join(R, 'cities/_shared.json'), 'utf8')).refund.rule;

// ── 1 · the first phone screen is one pass ───────────────────────────────
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(1600);
  check(await boardWord(page, '#placeBoard') === 'AMSTERDAM', 'the city settles on its board (AMSTERDAM)');
  check(await page.$eval('#h1', (h) => h.innerText.replace(/\s+/g, ' ').includes('Your home in') && h.querySelector('.sr').textContent === 'Amsterdam'), 'the H1 reads "Your home in Amsterdam" (the board is decorative)');
  const fold = 844;
  const doorR = await rect(page, '#door'), lastRow = await rect(page, '#fare-attended-viewing > summary');
  check(lastRow.bottom <= fold && doorR.bottom <= fold, `at 390×844 the three fares (bottom ${Math.round(lastRow.bottom)}) and the gold door (bottom ${Math.round(doorR.bottom)}) are on the first screen`);
  const order = await page.evaluate(() => ['#h1', '.lead', '#fare-full-search', '#fare-application-pack', '#fare-attended-viewing', '#door', '.fields.desk'].map((s) => document.querySelector(s).getBoundingClientRect().top));
  check(order.every((v, i) => i === 0 || v > order[i - 1]), 'reading order at 390: title · sentence · three fares · door · who answers');
  check(JSON.stringify(await page.$$eval('.fields.desk dd', (d) => d.map((x) => x.textContent.trim()))) === JSON.stringify(['Valentino Egidi', 'Mon–Fri 09:00–19:00, Rome time']) && await shown(page, '.fields.desk'), 'who answers and when, said on the pass');
  check(await page.$$eval('#fares details[open]', (d) => d.length) === 0 && await shown(page, '#notSure') && !(await shown(page, '#planLn')), 'nothing pre-selected: no fare open, the "not sure" line over the door');
  check(await shown(page, '#fares > .refund.fs') && await text(page, '#fares > .refund.fs') === RULE, 'the refund rule is rendered under the closed Full Search row');
  check(await noHScroll(page), 'no horizontal scroll at 390');
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS error, no request to a foreign host', st.errors.concat(st.foreign).join(' | '));
  await ctx.close();
}

// ── 2 · a fare opens its ticket in place; the door moves into it ──────────
{
  const { ctx, page } = await open();
  // Safari has no native scroll anchoring: switched off here, so only the
  // page's own anchoring can keep the tapped row still
  await page.addStyleTag({ content: '*{overflow-anchor:none!important}' });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.waitForTimeout(200);
  const before = await rect(page, '#fare-application-pack > summary');
  await page.click('#fare-application-pack > summary');
  await page.waitForTimeout(250);
  const after = await rect(page, '#fare-application-pack > summary');
  check(Math.abs(after.top - before.top) < 2, `the tapped row does not move under the finger (${(after.top - before.top).toFixed(1)} px)`);
  check(await page.$eval('#fare-application-pack', (d) => d.open) && await shown(page, '#fare-application-pack .tk-tag'), 'the Application Pack ticket opens in place, saying what the fee buys');
  check(await page.$eval('#act', (a) => !!a.closest('#fare-application-pack [data-slot]')) && await page.$$eval('#act', (a) => a.length) === 1, 'on a phone the ONE door moves into the open ticket (one #act in the page)');
  check(await shown(page, '#planLn') && await text(page, '#planName') === 'Application Pack' && !(await shown(page, '#notSure')), 'the door says the plan being read');
  // the row BELOW the open ticket: tapping it closes the ticket above, and
  // without the page's anchoring the row would jump up by the ticket's height.
  // Measured with the open ticket's row at the top of the screen, so the page
  // has room to scroll back (at scrollY 0 nothing can hold it)
  await page.$eval('#fare-application-pack > summary', (e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(200);
  check(await page.evaluate(() => { const r = document.querySelector('#fare-attended-viewing > summary').getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight && scrollY > document.querySelector('#fare-application-pack .tk').offsetHeight; }), '(the row below is on the screen, with room to scroll back)');
  const avBefore = await rect(page, '#fare-attended-viewing > summary');
  await page.click('#fare-attended-viewing > summary');
  await page.waitForTimeout(250);
  const avAfter = await rect(page, '#fare-attended-viewing > summary');
  check(Math.abs(avAfter.top - avBefore.top) < 2, `a row below the open ticket stays under the finger while the ticket above closes (${(avAfter.top - avBefore.top).toFixed(1)} px)`);
  await page.click('#fare-attended-viewing > summary');
  await page.waitForTimeout(250);
  await page.click('#fare-application-pack > summary');
  await page.waitForTimeout(250);
  const fsBefore = await rect(page, '#fare-full-search > summary');
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(250);
  const fsAfter = await rect(page, '#fare-full-search > summary');
  check(Math.abs(fsAfter.top - fsBefore.top) < 2, `switching fares keeps the tapped row in place (${(fsAfter.top - fsBefore.top).toFixed(1)} px)`);
  check(!(await page.$eval('#fare-application-pack', (d) => d.open)) && await page.$eval('#act', (a) => !!a.closest('#fare-full-search [data-slot]')), 'one fare at a time: the other closes, the door follows');
  check(await shown(page, '#fare-full-search .tk .refund') && !(await shown(page, '#fares > .refund.fs')), 'Full Search open: the refund rule inside its ticket, the copy under the row steps back (said once)');
  check(await text(page, '#fare-full-search [data-pay] span') === 'Pay and start · €500', 'the ticket\'s quiet pay button reads till.label with its price');
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(250);
  check(await page.$eval('#act', (a) => !!a.closest('#stubSlot')) && await shown(page, '#notSure'), 'closing the ticket puts the door back in the stub, nothing chosen');
  await ctx.close();
}
{
  const { ctx, page } = await open({ width: 1440 });
  await page.waitForTimeout(300);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(250);
  const main = await rect(page, '.p-main'), stub = await rect(page, '.stub');
  check(stub.left >= main.right - 2, '1440: the stub sits beside the fares (a boarding pass, two columns)');
  check(await page.$eval('#act', (a) => !!a.closest('#stubSlot')), '1440: the door stays in the stub when a ticket opens');
  check(await noHScroll(page), '1440: no horizontal scroll');
  await ctx.close();
}

// ── 3 · the free door ─────────────────────────────────────────────────────
{
  const { ctx, page, st } = await open({ api: { ...LEAD_OK, delay: 400 } });
  await page.waitForTimeout(300);
  check(!(await page.$eval('#door', (b) => b.disabled)), 'the script opens the door it was served shut');
  check(!(await shown(page, '#fFields')), 'the fields are hidden until the first tap');
  await page.click('#fare-attended-viewing > summary');
  await page.waitForTimeout(200);
  await tap(page, '#door');
  await page.waitForTimeout(450);
  check(await shown(page, '#fFields') && await page.evaluate(() => document.activeElement && document.activeElement.id === 'fName'), 'the first tap reveals the two fields and puts the cursor on the name');
  check(st.posts.length === 0, 'the first tap sends nothing');
  await page.click('#door');
  await page.waitForTimeout(150);
  check(await text(page, '#fNameErr') !== '' && await page.$eval('#fName', (i) => i.getAttribute('aria-invalid') === 'true') && st.posts.length === 0, 'an empty send says what is missing, in place, and sends nothing');
  await page.fill('#fName', 'Anna Keller');
  check(await text(page, '#fNameErr') === '', 'the error clears as the visitor types');
  await page.fill('#fContact', 'anna@');
  await page.click('#door');
  await page.waitForTimeout(150);
  check(/email looks incomplete/i.test(await text(page, '#fContactErr')) && st.posts.length === 0, 'a broken email is caught with the email message');
  await page.fill('#fContact', 'anna@example.com');
  await page.focus('#fContact');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  // a submit that does not go through the (disabled) button: only the page's own guard stops it
  await page.evaluate(() => { const f = document.getElementById('fileForm'); f.requestSubmit(); f.requestSubmit(); });
  await page.waitForTimeout(900);
  check(st.posts.length === 1, `three Enters and two scripted submits make ONE POST (${st.posts.length})`);
  const b = st.posts[0] || {};
  check(b.city === 'amsterdam' && b.name === 'Anna Keller' && b.email === 'anna@example.com' && !b.phone && b.service === 'attended-viewing' && /^[a-z0-9]{10,}$/.test(b.requestId || '') && b.company === '',
    'the POST carries the desk, the name, ONE contact (email), the plan being read and one request id', JSON.stringify(b));
  check(await page.getAttribute('#pass', 'data-state') === 'open' && await text(page, '#oFile') === FILE && await text(page, '#oName') === 'Anna Keller', 'OPEN prints the SERVER\'s file number and the passenger');
  check(!(await shown(page, '#fileForm')) && (await page.$$eval('[data-pay]', (bs) => bs.every((x) => x.hidden))), 'after the file is open: the form gives way to the card, and no pay button asks for money right after a free door');
  await page.waitForTimeout(1300);
  check(await boardWord(page, '.slot .slot-b') === 'OPEN', 'the slot board flips to OPEN');
  check(await page.evaluate(() => { const r = document.getElementById('cOpen').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), 'the OPEN card lands on the screen');
  const ev = await events(page);
  check(ev.filter((e) => e.name === 'generate_lead').length === 1 && ev.some((e) => e.name === 'sign_up'), 'one generate_lead, one sign_up');
  await ctx.close();
}
{
  const { ctx, page, st } = await open({ api: { status: 500, body: { ok: false } } });
  await page.waitForTimeout(300);
  await tap(page, '#door');
  await page.fill('#fName', 'Luis');
  await page.fill('#fContact', '+31 6 1234 5678');
  await page.click('#door');
  await page.waitForTimeout(500);
  check(st.posts.length === 1 && st.posts[0].phone === '+31612345678' && !st.posts[0].email && st.posts[0].service === '', 'a number in the contact field travels as phone; no fare open = no plan ("to decide" on the server)', JSON.stringify(st.posts[0]));
  check(await page.getAttribute('#pass', 'data-state') === 'blank' && !(await shown(page, '#cOpen')) && !(await page.$eval('#door', (b) => b.disabled)) && (await text(page, '#fContactErr')) !== '',
    'a failed send issues nothing, gives the door back and says so on the contact field');
  await ctx.close();
}

// ── 4 · pay only from a ticket: the till ──────────────────────────────────
{
  const { ctx, page, st } = await open({ checkout: { status: 200, body: { ok: false, error: 'stripe_down' } } });
  await page.waitForTimeout(300);
  await tap(page, '#door');
  await page.fill('#fName', 'Anna Keller');
  await page.fill('#fContact', 'anna@example.com');
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  await tap(page, '#fare-full-search [data-pay]');
  await page.waitForTimeout(250);
  check(await page.$eval('#till', (d) => d.open) && await text(page, '#tTitle') === 'Full Search' && await text(page, '#tPrice') === '€500', 'the till opens on THAT plan, with its price');
  check(await shown(page, '#tRule') && await text(page, '#tRule') === RULE, 'the refund rule is in the till, beside the €500');
  check(!(await page.$eval('#tStart', (c) => c.checked)) && await text(page, '#tGoL') === 'Pay and book · €500' && /14 days end/.test(await text(page, '#tGoS')), 'unticked: "Pay and book · €500", starts when the 14 days end');
  check(await page.inputValue('#tName') === 'Anna Keller' && await page.inputValue('#tEmail') === 'anna@example.com', 'the till fills itself from what the visitor already typed');
  await page.focus('#tStart');
  await page.keyboard.press('Space');
  check(await page.$eval('#tStart', (c) => c.checked) && await text(page, '#tGoL') === 'Pay and start · €500' && !/14 days/.test(await text(page, '#tGoS')), 'ticked: "Pay and start · €500"');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(st.checkouts.length === 0, 'Enter on the tick never pays');
  await page.fill('#tEmail', 'nope');
  await page.click('#tGo');
  await page.waitForTimeout(200);
  check(st.checkouts.length === 0 && /valid email/i.test(await text(page, '#tEmailErr')), 'a bad email is caught in the till, nothing posted');
  await page.fill('#tEmail', 'anna@example.com');
  await page.click('#tGo');
  await page.waitForTimeout(500);
  const c = st.checkouts[0] || {};
  check(st.checkouts.length === 1 && c.city === 'amsterdam' && c.kind === 'full-search' && c.startNow === true && c.name === 'Anna Keller' && !('price' in c) && !('eur' in c), 'the POST names the desk and the plan (never a price) and startNow only because it was ticked', JSON.stringify(c));
  check(/hiccup/i.test(await text(page, '#tErr')) && !(await page.$eval('#tGo', (b) => b.disabled)), 'a refused checkout is said in the till and the button comes back');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(!(await page.$eval('#till', (d) => d.open)) && await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-pay')), 'Escape closes the till and gives the focus back to the pay button');
  // the second open: a fresh till, unticked again
  await page.click('#fare-full-search [data-pay]');
  await page.waitForTimeout(200);
  check(!(await page.$eval('#tStart', (c2) => c2.checked)) && await text(page, '#tErr') === '', 'the till reopens clean: unticked, no old error');
  await page.click('#tAlt');
  await page.waitForTimeout(400);
  check(!(await page.$eval('#till', (d) => d.open)) && await page.evaluate(() => document.activeElement && document.activeElement.id === 'fName'), '"Prefer to talk first?" closes the till and opens the free door');
  await ctx.close();
}
{
  const { ctx, page, st } = await open({ paid: (n) => (n < 2 ? { status: 200, body: { ok: true, pending: true } } : { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: false, workFromLabel: '4 November 2026' } }) });
  await page.waitForTimeout(300);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(150);
  await tap(page, '#fare-full-search [data-pay]');
  await page.fill('#tName', 'Anna Keller');
  await page.fill('#tEmail', 'anna@example.com');
  await page.click('#tGo');
  await page.waitForURL(/paid=full-search/, { timeout: 8000 });
  await page.waitForTimeout(400);
  check(st.checkouts.length === 1 && st.checkouts[0].startNow === false, 'unticked, the POST says startNow false');
  check(await page.getAttribute('#pass', 'data-state') === 'confirming' && await shown(page, '#cConfirm') && !(await shown(page, '#cPaid')), 'back from Stripe: "being confirmed", never PAID on the address bar\'s word');
  check(await page.$$eval('[data-pay]', (bs) => bs.every((b) => b.hidden)), 'while confirming, no pay button: never paid twice');
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 6000 }).catch(() => {});
  check(await page.getAttribute('#pass', 'data-state') === 'paid' && await text(page, '#pFile') === FILE && await text(page, '#pFare') === 'Full Search · €500', 'the server says paid: PAID with the server\'s file and the plan');
  check(await text(page, '#pStart') === '4 November 2026, when your 14 days end' && await shown(page, '#pWait') && !(await shown(page, '#pText')) && /14 days end/.test(await text(page, '#pNext')),
    'not ticked: the start date is the server\'s (the 14 days\' end), the wait note and the wait steps');
  const ev = await events(page);
  const purchases = ev.filter((e) => e.name === 'purchase');
  check(purchases.length === 1 && /^city_amsterdam_[0-9a-f]{8}$/.test(purchases[0].p.transaction_id) && purchases[0].p.value === 500 && !JSON.stringify(purchases[0].p).includes(SID), 'ONE purchase, with an opaque transaction id (never the session id)');
  check(await page.evaluate(() => location.search === '' && location.hash === ''), 'the address line is folded back to the page once verified');
  await page.goto(`${base}/amsterdam?paid=full-search&start=0&session_id=${SID}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 4000 }).catch(() => {});
  check((await events(page)).filter((e) => e.name === 'purchase').length === 0, 'a reload of the paid return counts nothing twice');
  await ctx.close();
}
{
  const { ctx, page, st } = await open({ query: '?paid=full-search&session_id=cs_test_aaaaaaaaaaaa', paid: { status: 200, body: { ok: true, paid: true, plan: 'application-pack', file: 'BM AAAAA', startNow: true } } });
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 4000 }).catch(() => {});
  check(await text(page, '#pFare') === 'Application Pack · €199' && await text(page, '#pStart') === 'The desk’s first open hour' && !(await shown(page, '#pWait')),
    'PAID prints the plan the SERVER confirmed (not the address bar\'s) and, ticked, starts in the desk\'s first open hour');
  check(st.gets.length === 1 && /paid=cs_test_aaaaaaaaaaaa&city=amsterdam$/.test(st.gets[0]), 'one GET, with the session and the desk');
  await ctx.close();
}
for (const q of ['?paid=constructor&session_id=cs_test_aaaaaaaaaaaa', '?paid=full-search', '?paid=full-search&session_id=../../x']) {
  const { ctx, page, st } = await open({ query: q, paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE } } });
  await page.waitForTimeout(500);
  check(await page.getAttribute('#pass', 'data-state') === 'blank' && st.gets.length === 0 && await page.evaluate(() => location.search === ''), `a forged return (${q}) changes nothing, asks nothing, and folds the address line`);
  await ctx.close();
}
{
  const { ctx, page, st } = await open({ query: `?paid=full-search&session_id=${SID}` });
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'unconfirmed', null, { timeout: 16000 }).catch(() => {});
  check(st.gets.length === 5 && await page.getAttribute('#pass', 'data-state') === 'unconfirmed' && /not confirmed yet/i.test(await text(page, '#cText')), 'five asks without a yes: "Not confirmed yet", never PAID', `${st.gets.length} asks`);
  check((await events(page)).filter((e) => e.name === 'purchase').length === 0, 'no purchase without the server\'s yes');
  await ctx.close();
}

// ── 5 · the desk clock ────────────────────────────────────────────────────
const CLOCKS = [
  ['amsterdam', '2026-10-31T09:00:00Z', 'no card · Monday from 09:00 CET', 'a Saturday: Monday, and the zone of the opening (CET after the clocks go back)'],
  ['amsterdam', '2026-04-27T08:00:00Z', 'no card · Tomorrow from 09:00 CEST', 'Koningsdag (27 April): the Amsterdam desk is closed, tomorrow'],
  ['amsterdam', '2026-10-27T08:00:00Z', 'no card · desk open until 19:00 CET', 'a Tuesday at 09:00: the desk is open'],
  ['barcelona', '2026-09-11T08:00:00Z', 'no card · Monday from 09:00 CEST', 'the Diada (Friday 11 September) in Barcelona: Monday'],
  ['madrid', '2026-09-11T08:00:00Z', 'no card · desk open until 19:00 CEST', 'the same Friday in Madrid: open (the Diada is Catalan)'],
  ['paris', '2026-12-24T19:00:00Z', 'free · Monday from 09:00 CET', 'Christmas Eve at 20:00 on a waitlist desk: Monday (Christmas, Santo Stefano, the weekend)']
];
for (const [slug, clock, want, what] of CLOCKS) {
  const { ctx, page } = await open({ slug, clock });
  await page.waitForTimeout(200);
  const subs = await page.$$eval('[data-window]', (n) => n.map((x) => x.textContent.trim()));
  check(subs.length === 2 && subs.every((s) => s === want), `${slug}: ${what} → "${want}"`, JSON.stringify(subs));
  await ctx.close();
}
{
  const { ctx, page } = await open({ clock: '2026-10-27T14:00:00Z' });
  await page.waitForTimeout(200);
  await tap(page, '#door');
  await page.fill('#fName', 'Anna'); await page.fill('#fContact', 'anna@example.com');
  await page.click('#door');
  await page.waitForTimeout(500);
  check(await text(page, '#oNext') === 'By 19:00 CET today', 'OPEN on an open desk: "By 19:00 CET today"');
  await ctx.close();
}

// ── 6 · without JS the page reads whole ──────────────────────────────────
{
  const { ctx, page } = await open({ js: false });
  check(!(await shown(page, '#door')) && await page.$eval('#door', (b) => b.disabled) && await shown(page, '#act noscript ~ *, #act .s-h') !== null, 'no JS: the door is hidden and shut');
  const body = await page.evaluate(() => document.body.innerText);
  check(/Write to the desk on WhatsApp or at/.test(body), 'no JS: a line says where to write');
  check(/€500/.test(body) && /€199/.test(body) && /€149/.test(body) && body.includes(RULE), 'no JS: the three prices and the refund rule read as text');
  check(/From the first call/.test(body) && /What we check/.test(body) && /Questions\./.test(body), 'no JS: every section reads');
  check(!(await shown(page, '#strip')) && (await page.$$eval('[data-pay]', (b) => b.every((x) => !x.offsetParent))), 'no JS: no strip, no pay button (behaviour, not content)');
  await ctx.close();
}

// ── 7 · 320px, targets, reduced motion, the strip ─────────────────────────
{
  const { ctx, page } = await open({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  check(await noHScroll(page), '320: no horizontal scroll');
  const small = await page.evaluate(() => [...document.querySelectorAll('#fares summary, #door, .pill, .folds summary')]
    .filter((e) => e.offsetParent).map((e) => ({ id: e.id || e.className || e.tagName, h: e.getBoundingClientRect().height })).filter((x) => x.h < 44));
  check(small.length === 0, '320: every fare row, the door, the WhatsApp pill and every fold is ≥ 44 px tall', JSON.stringify(small.slice(0, 4)));
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  check(await noHScroll(page) && (await rect(page, '#fare-full-search [data-pay]')).h >= 44, '320: an open ticket fits, its pay button ≥ 44 px');
  await ctx.close();
}
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  check(await boardWord(page, '#placeBoard') === 'AMSTERDAM', 'reduced motion: the board settles at once');
  await ctx.close();
}
{
  const { ctx, page } = await open();
  await page.waitForTimeout(300);
  check(!(await page.$eval('#strip', (s) => s.classList.contains('on'))), 'the strip is off while the pass\'s door is on the screen');
  await page.evaluate(() => document.getElementById('how').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  const on = await page.$eval('#strip', (s) => s.classList.contains('on') && s.getAttribute('aria-hidden') === 'false' && !s.hasAttribute('inert'));
  check(on && !/€/.test(await text(page, '#strip')), 'past the door, the strip comes: the same door, no price');
  await page.click('#stripGo');
  await page.waitForTimeout(700);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'fName') && await shown(page, '#fFields'), 'the strip\'s door takes the reader to the free door, the name focused');
  await ctx.close();
}

// ── 8 · the sisters ──────────────────────────────────────────────────────
for (const slug of ['paris', 'berlin']) {
  const { ctx, page, st } = await open({ slug });
  await page.waitForTimeout(300);
  check(await text(page, '#doorL') === 'Open my file' && await page.$$eval('[data-pay]', (b) => b.length) === 0 && !(await page.$('#till')), `${slug}: "Open my file", no pay button, no till`);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  check(!(await page.$('#fare-full-search .tk .refund')), `${slug}: no refund rule in the Full Search ticket (no money is taken)`);
  await tap(page, '#door');
  await page.fill('#fName', 'Jean'); await page.fill('#fContact', 'jean@example.fr');
  await page.click('#door');
  await page.waitForTimeout(500);
  check(st.posts.length === 1 && st.posts[0].city === slug && await page.getAttribute('#pass', 'data-state') === 'open', `${slug}: the file opens`);
  await ctx.close();
}
{
  const { ctx, page } = await open({ slug: 'madrid' });
  await page.waitForTimeout(300);
  await page.click('#fare-application-pack > summary');
  await page.waitForTimeout(150);
  await tap(page, '#fare-application-pack [data-pay]');
  await page.waitForTimeout(200);
  check(await shown(page, '.t-opt') && /^Optional, chosen in writing/.test(await text(page, '.t-opt')) && !(await shown(page, '#tRule')), 'madrid: the till repeats "Optional, chosen in writing"; no refund rule on the Application Pack');
  await ctx.close();
}

check(allErrors.length === 0, 'zero JS errors across every run', allErrors.slice(0, 3).join(' | '));
check(allForeign.length === 0, 'no request to a host we did not stub', allForeign.slice(0, 3).join(' | '));

await browser.close();
srv.close();
console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
