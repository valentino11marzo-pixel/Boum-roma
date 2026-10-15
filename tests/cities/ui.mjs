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
//     valid one posts JSON to /api/city-lead with the city and opens the
//     "file is open" state — the board spells OPEN and, on a desk that
//     sells, the offer to pay for the chosen plan opens the sheet with the
//     name and email already in; a failed one says so and gives the button
//     back;
//   - the till (14/10, v1.1): on Amsterdam a plate's button opens the sheet
//     on ITS plan, the sheet posts { city, kind } to /api/service-checkout
//     and follows the URL it gets; landing back on ?paid=<plan> shows the
//     PAID state, spells PAID on the board and counts ONE purchase; on a
//     waitlist desk there is no sheet at all and the plate's button checks
//     the plan's chip in the door;
//   - reduced motion: the word set still, the plane on the route still;
//   - THE CHECK-IN (v1.2, 15/10): the steps appear one after the other,
//     three taps give the plan its rules say — on a ticket with the price on
//     its own board, the ✓ lines, the notes — the papers ticked give "n of 8"
//     and the missing ones by name with the meter at n/8; the chip in the
//     door is checked and the move-in prefilled; the lead POST carries the
//     answers; the ticket's till button opens the sheet on THAT plan on
//     Amsterdam and leads to the door on Barcelona; Copy link copies
//     #checkin=stage.when.where.docs and the WhatsApp link carries it; a
//     link with the answers lands straight on the result, a broken one on
//     the first step; the pass follows the name and origin, spells the city
//     on its board, and passBlob() is a real 1080×1920 PNG;
//   - the depth: the file card and the pass tilt only with a fine pointer
//     and motion allowed (nothing on a touch screen, nothing under reduced
//     motion), the plates' scroll-driven entrance exists and is off under
//     reduced motion; the rail shows at 1440 only and its dot follows the
//     section on screen; without JS the Check-in and the rail are not there;
//   - zero JS errors, and no request leaves for a host we did not stub.
//
// The page is served from the repo root (it links /css and /assets). Every
// request outside localhost is aborted: /api/city-lead and
// /api/service-checkout are answered here.

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

async function open({ js = true, width = 390, api = { status: 200, body: { ok: true, id: 'ams1' } }, reducedMotion = 'no-preference', slug = 'amsterdam', query = '', checkout = null } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: 844 }, reducedMotion });
  const page = await ctx.newPage();
  const st = { errors: [], posts: [], checkouts: [], foreign: [] };
  page.on('pageerror', (e) => st.errors.push(e.message));
  // the consent plate stays closed: it is boom-consent.js's own business
  await page.addInitScript(() => { try { localStorage.setItem('boom:consent', 'min:' + Date.now()); } catch (e) {} });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(base + '/api/city-lead')) {
      st.posts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
      return r.fulfill({ status: api.status, contentType: 'application/json', body: JSON.stringify(api.body) });
    }
    if (u.startsWith(base + '/api/service-checkout')) {
      st.checkouts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
      // "Stripe" answers with the page's own paid landing: the redirect is followed in the same tab
      const res = checkout || { status: 200, body: { ok: true, url: `${base}/${slug}?paid=full-search&session_id=cs_test_ui_1#contact` } };
      return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
    }
    if (u.startsWith(base)) return r.continue();
    if (!/googletagmanager\.com/.test(u)) st.foreign.push(u);   // gtag is the one third party every BOOM page loads
    return r.abort();
  });
  await page.goto(`${base}/${slug}${query}`, { waitUntil: 'load' });
  return { ctx, page, st };
}
const layer = (page) => page.evaluate(() => (window.dataLayer || []).map((a) => [].slice.call(a)).filter((a) => a[0] === 'event').map((a) => ({ name: a[1], p: a[2] || {} })));
const boardWord = (page, id) => page.$eval(id, (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join(''));
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
  const goTxt = await page.$$eval('.plates .go', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(goTxt) === JSON.stringify(['Start my search · €500', 'Get the pack · €199', 'Book a viewing · €149']) && !(await page.isVisible('#ov')),
    'without JS the plates\' buttons still read with their price, and the sheet stays closed');
  const route = await page.$eval('.machine .route', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check(route.replace(/\s+/g, '') === 'ROM✈AMS', `the route line reads ROM ✈ AMS as text ("${route}")`);
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
  await page.waitForTimeout(1200);
  check(rvBefore === '0' && await page.$eval('#services', (e) => e.classList.contains('in')), 'a section starts hidden and is revealed when scrolled into view');
  check(await page.$eval('#paybar', (e) => e.classList.contains('on')), 'past the hero the pay bar comes up');
  // the Check-in (v1.2) stands between the section head and the plates, so at
  // 390px the first plate is below the fold of the section: its board spins
  // when the READER reaches it, not when the section's title does
  const p0 = await page.$eval('#plan-full-search .flap-prezzo', (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join('').trim());
  await page.evaluate(() => document.getElementById('plan-full-search').scrollIntoView());
  await page.waitForTimeout(1800);
  const p1 = await page.$eval('#plan-full-search .flap-prezzo', (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join(''));
  check(p0 === '' && p1 === '€500', `the first price spun onto its board when it came into view, not before ("${p1}")`);
  // burger
  await page.click('#navToggle');
  check(await page.$eval('#mobileMenu', (e) => e.classList.contains('active')) && await page.getAttribute('#navToggle', 'aria-expanded') === 'true', 'the burger opens the menu');
  await page.click('#mobileMenu a[href="#faq"]');
  await page.waitForTimeout(300);
  check(!(await page.$eval('#mobileMenu', (e) => e.classList.contains('active'))), 'a menu link closes it');

  // the till: a plate's button opens the sheet on ITS plan, the sheet validates in place, posts { city, kind } and follows Stripe's URL
  await tap(page, '#plan-application-pack .go');
  await page.waitForTimeout(600);
  check(await page.$eval('#ov', (e) => e.classList.contains('on')) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack'
    && (await page.textContent('#sGoAmt')).trim() === '€199', 'the plate\'s button opens the sheet on Application Pack, €199 on the button');
  const beganAt = (await layer(page)).filter((e) => e.name === 'begin_checkout');
  check(beganAt.length === 1 && beganAt[0].p.value === 199 && beganAt[0].p.market === 'amsterdam', 'begin_checkout fires once, with the plan\'s value and the market');
  check(!(await page.$eval('#paybar', (e) => e.classList.contains('on'))), 'the pay bar steps back while the sheet is open');
  await page.click('.payrow:has(input[value="full-search"])');
  check((await page.textContent('#sGoAmt')).trim() === '€500' && await page.$eval('.payrow:has(input[value="full-search"])', (e) => e.classList.contains('on')), 'choosing another row in the sheet changes the amount on the button');
  await page.click('#sGo');
  check(st.checkouts.length === 0 && await page.$eval('#sErr', (e) => e.classList.contains('on')) && (await page.textContent('#sErr')) === await page.getAttribute('#ov', 'data-err-name'),
    'an empty sheet posts nothing and says, in place, that the name is missing');
  await page.fill('#sName', 'Test Person');
  await page.fill('#sEmail', 'test@example.com');
  await page.fill('#sPhone', '12');
  await page.click('#sGo');
  check(st.checkouts.length === 0 && (await page.textContent('#sErr')) === await page.getAttribute('#ov', 'data-err-phone'), 'a two-digit phone is named as incomplete, nothing posted');
  await page.fill('#sPhone', '');
  await page.keyboard.press('Escape');
  check(!(await page.$eval('#ov', (e) => e.classList.contains('on'))), 'Escape closes the sheet');
  await tap(page, '#plan-full-search .go');
  await page.waitForTimeout(400);
  check(await page.$eval('#sName', (e) => e.value) === 'Test Person', 'reopening the sheet keeps what was typed');
  await page.click('#sGo');
  await page.waitForURL(/paid=full-search/, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(900);
  let co = {};
  try { co = JSON.parse(st.checkouts[0].body); } catch (e) {}
  check(st.checkouts.length === 1 && co.city === 'amsterdam' && co.kind === 'full-search' && co.name === 'Test Person' && co.email === 'test@example.com' && co.company === '' && !('eur' in co) && !('price' in co),
    'the sheet posts { city, kind, name, email } once — never a price — and follows the URL', JSON.stringify(co));
  check(await page.isVisible('#fPaid') && !(await page.isVisible('#cityForm')) && (await page.textContent('#paidPlan')).trim() === 'Full Search · €500',
    'back from Stripe the card shows the PAID state for the plan, the form gives way');
  await page.waitForTimeout(1200);
  check(await boardWord(page, '#flapPaid') === 'PAID', 'the small board spells PAID');
  const purchases = (await layer(page)).filter((e) => e.name === 'purchase');
  check(purchases.length === 1 && purchases[0].p.transaction_id === 'cs_test_ui_1' && purchases[0].p.value === 500, 'ONE purchase event, with Stripe\'s session id and the plan\'s value');
  check(!/paid=/.test(page.url()) && /#contact$/.test(page.url()), 'the query is folded away: the URL can be shared without re-landing on a paid state');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check(!(await page.isVisible('#fPaid')) && await page.isVisible('#cityForm'), 'a reload shows the door again, not a second paid landing');
  await ctx.close();
}
// the same paid landing opened twice counts one sale
{
  const { ctx, page } = await open({ query: '?paid=full-search&session_id=cs_test_ui_2' });
  await page.waitForTimeout(400);
  check(await page.isVisible('#fPaid') && (await layer(page)).filter((e) => e.name === 'purchase').length === 1, 'landing on ?paid=… shows PAID and counts the sale');
  await page.goto(`${base}/amsterdam?paid=full-search&session_id=cs_test_ui_2`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  check(await page.isVisible('#fPaid') && (await layer(page)).filter((e) => e.name === 'purchase').length === 0, 'the same session id again: the state shows, the sale is not counted twice');
  const { ctx: c2, page: p2 } = await open({ query: '?paid=concierge&session_id=cs_x' });
  check(!(await p2.isVisible('#fPaid')) && await p2.isVisible('#cityForm'), 'a ?paid= naming a plan that is not ours is ignored');
  await c2.close();
  await ctx.close();
}
// the door: chips, errors in place, the send, OPEN on the board, the offer to pay
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(800);
  const picked = () => page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; });
  check(await picked() === '', 'no service is pre-checked when the page opens');
  await tap(page, '.chip:has(input[value="application-pack"])');
  check(await picked() === 'application-pack', 'tapping a chip chooses the service (the chip is the radio\'s label)');
  await tap(page, '.chip.unsure');
  check(await picked() === 'unsure', 'tapping another chip changes the choice');
  await tap(page, '.chip:has(input[value="application-pack"])');
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
  await page.waitForTimeout(1300);
  check(await boardWord(page, '#flapDone') === 'OPEN', 'the small board spells OPEN');
  check(await page.isVisible('#payOffer') && (await page.textContent('#payOfferAmt')).trim() === '€199', 'on a desk that sells, the card then offers to pay for the plan they chose (€199)');
  await page.click('#payOfferBtn');
  await page.waitForTimeout(500);
  check(await page.$eval('#ov', (e) => e.classList.contains('on')) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack'
    && await page.$eval('#sName', (e) => e.value) === 'Test Person' && await page.$eval('#sEmail', (e) => e.value) === 'test@example.com',
    'the offer opens the sheet on that plan with the name and email already in — nothing to re-type');
  check(st.errors.length === 0, 'no JS errors', st.errors.join(' | '));
  check(st.foreign.length === 0, 'no request to a host the page should not call', st.foreign.join(' | '));
  await ctx.close();
}
// "not sure yet" gets no offer to pay: they asked for advice
{
  const { ctx, page } = await open();
  await page.waitForTimeout(600);
  await tap(page, '.chip.unsure');
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  check(await page.isVisible('#fDone') && !(await page.isVisible('#payOffer')), '"not sure yet" opens the file and gets no checkout offer');
  await ctx.close();
}
// a failed checkout says so in the sheet and gives the button back
{
  const { ctx, page, st } = await open({ checkout: { status: 500, body: { ok: false, error: 'stripe_failed' } } });
  await page.waitForTimeout(600);
  await tap(page, '#plan-full-search .go');
  await page.waitForTimeout(400);
  await page.fill('#sName', 'Test Person');
  await page.fill('#sEmail', 'test@example.com');
  await page.click('#sGo');
  await page.waitForFunction(() => document.getElementById('sErr').classList.contains('on'), null, { timeout: 4000 }).catch(() => {});
  check(st.checkouts.length === 1 && (await page.textContent('#sErr')) === await page.getAttribute('#ov', 'data-err-net') && !(await page.$eval('#sGo', (e) => e.classList.contains('busy'))) && /amsterdam$/.test(page.url().split('#')[0]),
    'a failed checkout: the sheet says so in its own words, the button comes back, the page stays');
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
  check(await page.$eval('.machine .fly em', (e) => getComputedStyle(e).animationName === 'none'), 'with reduced motion the plane on the route stands still');
  check(await page.$$eval('.rv .step, .rv .flow', (els) => els.every((e) => getComputedStyle(e).opacity === '1')), 'with reduced motion the children of a block do not wait for a stagger');
  await ctx.close();
}
// the motion, when it is allowed: the plane moves, the children of a block follow it
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  check(await page.$eval('.machine .fly em', (e) => getComputedStyle(e).animationName === 'fly'), 'the plane crosses the route (animation fly)');
  const before = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).opacity));
  await page.evaluate(() => document.getElementById('how').scrollIntoView());
  await page.waitForTimeout(1600);
  const after = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).opacity));
  const delays = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).transitionDelay));
  check(before.every((o) => o === '0') && after.every((o) => o === '1') && new Set(delays).size === delays.length, `the steps start hidden and arrive one beat apart (delays ${delays.join(' ')})`);
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

// ── the sisters at 390px: Madrid (search), Barcelona, Paris and Berlin (waitlist) ──
for (const [slug, word] of [['madrid', 'MADRID'], ['barcelona', 'BARCELONA'], ['paris', 'PARIS'], ['berlin', 'BERLIN']]) {
  const { ctx, page, st } = await open({ slug });
  await page.waitForTimeout(2600);
  const b = await board(page);
  check(b.cells === word.length && b.letters === word && Math.abs(b.minW - b.contentW) < 4, `${slug}: the board spells ${word} in the space the hero reserved (${b.contentW.toFixed(0)}px)`);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const chipH = await page.$$eval('.chip', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(scrollW <= 390 && chipH.length === 4 && new Set(chipH).size === 1, `${slug}: 390px, no horizontal scroll, four chips in one even grid (${chipH.join('/')}px)`);
  const chipTxt = await page.$$eval('.chip small', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(chipTxt) === JSON.stringify(['€500', '€199', '€149 · per viewing', 'advise me']), `${slug}: the chips carry the brief's prices`);
  if (['barcelona', 'paris', 'berlin'].includes(slug)) {
    check(await page.$('#ov') === null && await page.$('[data-pay]') === null && await page.isVisible('.pricenote'),
      `${slug}: no sheet, no pay button; under the chips the line says the prices are list prices, charged only when the desk opens`);
    await tap(page, '#plan-application-pack .go');
    await page.waitForTimeout(400);
    check(await page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; }) === 'application-pack',
      `${slug}: the plate's button leads to the door and checks its chip`);
  } else {
    await tap(page, '#plan-application-pack .go');
    await page.waitForTimeout(500);
    check(await page.$eval('#ov', (e) => e.classList.contains('on')) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack', `${slug}: the plate's button opens the sheet on its plan`);
    await page.keyboard.press('Escape');
    await tap(page, '.chip:has(input[value="application-pack"])');
  }
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  check(st.posts.length === 1 && sent.city === slug && sent.service === 'application-pack' && st.errors.length === 0,
    `${slug}: the form posts city "${slug}" once, with the plate's chip chosen, and no JS error`, JSON.stringify(sent) + ' ' + st.errors.join('|'));
  await ctx.close();
}

// ── THE CHECK-IN (v1.2) at 390px: three taps, the papers, the ticket, the pass ──
const ckOpt = (v) => `#checkin .ck-opt:has(input[value="${v}"])`;
const ckDoc = (v) => `#checkin .ck-doc:has(input[value="${v}"])`;
const vis = (page, sel) => page.$eval(sel, (e) => !e.hidden && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none');
{
  const { ctx, page, st } = await open();
  // the clipboard is captured, not read back: headless Chromium grants no clipboard permission
  await page.evaluate(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
  await page.waitForTimeout(600);
  check(await vis(page, '#checkin .ck-step[data-step="stage"]') && !(await vis(page, '#checkin .ck-step[data-step="when"]')) && !(await vis(page, '#checkin .ck-step[data-step="dossier"]')) && !(await vis(page, '#ckResult')),
    'the Check-in opens on the first step alone: no second step, no documents, no ticket yet');
  await tap(page, ckOpt('shortlist'));
  check(await vis(page, '#checkin .ck-step[data-step="when"]') && !(await vis(page, '#checkin .ck-step[data-step="where"]')), 'the first answer brings the second step, not the third');
  await tap(page, ckOpt('months'));
  await tap(page, ckOpt('abroad'));
  check(await vis(page, '#checkin .ck-step[data-step="dossier"]') && await vis(page, '#ckGo') && !(await vis(page, '#ckResult')), 'the third answer brings the documents and the button; the ticket waits for it');
  for (const d of ['id', 'contract', 'payslips']) await tap(page, ckDoc(d));
  await tap(page, '#ckGo');
  await page.waitForTimeout(1900);
  check(await vis(page, '#ckResult') && await page.$eval('#ckResult', (e) => e.classList.contains('on')) && !(await vis(page, '#ckSteps')), 'the ticket replaces the steps');
  const tk = await page.evaluate(() => ({
    plan: document.getElementById('ckPlan').textContent, code: document.getElementById('ckCode').textContent, per: document.getElementById('ckPer').textContent,
    why: document.getElementById('ckWhy').textContent, inc: [...document.querySelectorAll('#ckInc li')].map((l) => l.textContent),
    noteWhen: document.getElementById('ckNoteWhen').textContent, noteWhere: document.getElementById('ckNoteWhere').textContent,
    price: [...document.querySelectorAll('#ckPrice .st b')].map((b) => b.textContent).join(''), cells: document.querySelectorAll('#ckPrice .fc2').length,
    ready: document.getElementById('ckReady').textContent, meter: document.getElementById('ckMeter').style.width,
    start: document.getElementById('ckStart').getAttribute('data-pay'), startTx: document.getElementById('ckStartTx').textContent, file: document.getElementById('ckFile').getAttribute('data-service'),
    chip: (document.querySelector('input[name="service"]:checked') || {}).value, moveIn: document.getElementById('fMoveIn').value,
    fCheckin: document.getElementById('fCheckin').value, fDossier: document.getElementById('fDossier').value, wa: document.getElementById('ckWa').href,
    passPlan: document.getElementById('ckPassPlan').textContent, passWhen: document.getElementById('ckPassWhen').textContent, passFile: document.getElementById('ckPassFile').textContent,
    passenger: document.getElementById('ckPassenger').textContent, board: [...document.querySelectorAll('#ckBoard .st b')].map((b) => b.textContent).join(''),
  }));
  check(tk.plan === 'Attended Viewing' && tk.code === 'SHORTLIST · T-3M · ABROAD' && /per viewing/.test(tk.per) && /away|abroad/i.test(tk.why),
    `a shortlist from abroad → Attended Viewing, the file code on the ticket ("${tk.code}")`);
  check(tk.price === '€149' && tk.cells === 4, `the price spun onto its own board ("${tk.price}", ${tk.cells} cells)`);
  check(tk.inc.length >= 2 && tk.noteWhen.length > 10 && tk.noteWhere.length > 10, 'the ✓ lines of the plan and the two notes (when, where) are on the ticket');
  check(/^3 of 8 in hand\. Missing: Employer statement \(werkgeversverklaring\), Previous landlord reference, A guarantor, if your income falls short, Three months of bank statements, Motivation letter, Dutch and English\./.test(tk.ready) && tk.meter === '38%',
    `three papers ticked → "3 of 8", the missing five by name, the meter at 38% ("${tk.ready.slice(0, 40)}…")`);
  check(tk.start === 'attended-viewing' && tk.startTx === 'Start · €149' && tk.file === 'attended-viewing', 'the two doors of the ticket point at the plan: the till button says the price, the free file carries the service');
  check(tk.chip === 'attended-viewing' && tk.moveIn === 'In 1–3 months', 'the door is written: the plan\'s chip checked, the move-in prefilled from the answer');
  check(tk.fCheckin === 'I have a shortlist · In 1–3 months · Still abroad' && /^3\/8 · missing: Employer statement/.test(tk.fDossier), 'the two hidden fields carry the answers and the papers in words');
  const share = 'https://www.boomrome.com/amsterdam#checkin=shortlist.months.abroad.b';
  check(tk.wa.startsWith('https://wa.me/?text=') && decodeURIComponent(tk.wa).includes(share) && decodeURIComponent(tk.wa).includes('BOOM Amsterdam'), 'the WhatsApp link carries the share text with the link to these answers (docs as a hex mask: id+contract+payslips = b)');
  check(tk.passPlan === 'Attended Viewing' && tk.passWhen === 'In 1–3 months' && tk.passFile === tk.code && tk.passenger === 'A tenant' && tk.board === 'AMSTERDAM',
    'the pass carries the plan, the boarding window, the file code, "A tenant" until a name is typed, and spells AMSTERDAM on its board');
  const events = await layer(page);
  check(events.filter((e) => e.name === 'checkin_answer').length === 3 && events.filter((e) => e.name === 'checkin_result').length === 1
    && events.find((e) => e.name === 'checkin_result').p.plan === 'attended-viewing' && events.find((e) => e.name === 'checkin_result').p.docs === 3,
    'three checkin_answer events and ONE checkin_result with the plan and the papers count');
  await page.click('#ckCopy');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => window.__copied) === share && (await page.textContent('#ckCopied')) === 'Link copied', 'Copy link copies the page URL with #checkin=… and says so');
  await page.fill('#ckName', 'Anna K.');
  await page.fill('#ckOrigin', 'lon');
  check((await page.textContent('#ckPassenger')) === 'Anna K.' && (await page.textContent('#ckFrom')) === 'LON', 'the pass follows the name and the origin as they are typed (origin upper-cased)');
  const png = await page.evaluate(async () => {
    const b = await window.BOOM_CHECKIN.passBlob();
    const u = new Uint8Array(await b.arrayBuffer());
    const be = (i) => (u[i] << 24 | u[i + 1] << 16 | u[i + 2] << 8 | u[i + 3]) >>> 0;
    return { type: b.type, size: b.size, sig: Array.from(u.slice(0, 8)).join(','), w: be(16), h: be(20) };
  });
  check(png.type === 'image/png' && png.sig === '137,80,78,71,13,10,26,10' && png.w === 1080 && png.h === 1920 && png.size > 20000,
    `passBlob() is a real PNG, 1080×1920, ${Math.round(png.size / 1024)} KB — a story-sized image to post`);
  // the till from the ticket
  await tap(page, '#ckStart');
  await page.waitForTimeout(500);
  check(await page.$eval('#ov', (e) => e.classList.contains('on')) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'attended-viewing', 'the ticket\'s till button opens the sheet on Attended Viewing');
  await page.keyboard.press('Escape');
  // change the answers: the steps come back, the ticket goes
  await tap(page, '#ckChange');
  await page.waitForTimeout(300);
  check(await vis(page, '#ckSteps') && !(await vis(page, '#ckResult')) && await page.$eval(ckOpt('shortlist') + ' input', (e) => e.checked), '"Change my answers" brings the steps back with the answers still ticked');
  await tap(page, ckOpt('found'));
  await tap(page, ckOpt('soon'));
  await tap(page, '#ckGo');
  await page.waitForTimeout(1900);
  check((await page.textContent('#ckPlan')) === 'Application Pack' && [...(await page.$$eval('#ckPrice .st b', (bs) => bs.map((b) => b.textContent)))].join('') === '€199',
    'found one, moving within four weeks → Application Pack, the board respun to €199');
  // the lead posts what the Check-in learned
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  check(st.posts.length === 1 && sent.service === 'application-pack' && sent.moveIn === 'In 1–3 months' && sent.checkin === 'Found one, need to apply · Within 4 weeks · Still abroad' && /^3\/8 · missing:/.test(sent.dossier),
    'the lead carries the chosen plan, the move-in, the three answers in words and the papers', JSON.stringify(sent));
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS error, no foreign request through the whole Check-in', st.errors.join(' | ') + st.foreign.join(' | '));
  await ctx.close();
}
// a link with the answers lands on the ticket; a broken one on the first step
{
  const { ctx, page } = await open({ query: '#checkin=zero.soon.here.-' });
  await page.waitForTimeout(1900);
  check(await vis(page, '#ckResult') && !(await vis(page, '#ckSteps')) && (await page.textContent('#ckPlan')) === 'Full Search' && (await page.textContent('#ckCode')) === 'START · T-4W · IN TOWN',
    'a shared link lands straight on the ticket: Full Search for someone who has not started');
  check((await page.textContent('#ckReady')) === 'Tap the papers you hold above and we say what we would fix first.' && (await page.$eval('#ckMeter', (e) => e.style.width)) === '0%',
    'with the papers untouched ("-") the file line invites, the meter stays empty — never "0 of 8"');
  check((await page.$eval('#ckStart', (e) => e.getAttribute('data-pay'))) === 'full-search' && (await page.textContent('#ckStartTx')) === 'Start · €500', 'the till button on the ticket says €500');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ query: '#checkin=zero.soon.nowhere.-' });
  await p2.waitForTimeout(600);
  check(await vis(p2, '#checkin .ck-step[data-step="stage"]') && !(await vis(p2, '#ckResult')), 'a link with an answer that does not exist opens the first step, nothing pre-ticked');
  const { ctx: c3, page: p3 } = await open({ query: '#checkin=shortlist.later.here.ff' });
  await p3.waitForTimeout(1900);
  check((await p3.textContent('#ckPlan')) === 'Application Pack' && (await p3.textContent('#ckReady')).length > 10 && (await p3.$eval('#ckMeter', (e) => e.style.width)) === '100%'
    && await p3.$$eval('#checkin input[name="ck-doc"]', (els) => els.every((e) => e.checked)),
    'docs mask ff = all eight ticked: the meter is full and the line says the file is ready');
  await c2.close(); await c3.close();
}
// Barcelona (waitlist): the ticket's door is the free file, never a till
{
  const { ctx, page } = await open({ slug: 'barcelona' });
  await page.waitForTimeout(600);
  await tap(page, ckOpt('zero'));
  await tap(page, ckOpt('later'));
  await tap(page, ckOpt('here'));
  await tap(page, '#ckGo');
  await page.waitForTimeout(1900);
  const w = await page.evaluate(() => ({
    plan: document.getElementById('ckPlan').textContent, per: document.getElementById('ckPer').textContent, why: document.getElementById('ckWhy').textContent,
    tag: document.getElementById('ckStart').tagName, href: document.getElementById('ckStart').getAttribute('href'), svc: document.getElementById('ckStart').getAttribute('data-service'),
    pay: document.getElementById('ckStart').getAttribute('data-pay'), price: [...document.querySelectorAll('#ckPrice .st b')].map((b) => b.textContent).join(''),
    file: !!document.getElementById('ckFile'), board: [...document.querySelectorAll('#ckBoard .st b')].map((b) => b.textContent).join(''), to: document.querySelector('#checkin .cto').textContent,
  }));
  check(w.plan === 'Full Search' && w.price === '€500' && /at opening/.test(w.per) && /desk opens/.test(w.why),
    `barcelona: Full Search at its list price, "at opening" on the ticket, the why says the desk is opening ("${w.why.slice(0, 50)}…")`);
  check(w.tag === 'A' && w.href === '#contact' && w.svc === 'full-search' && w.pay === null && w.file === false && await page.$('#ov') === null,
    'barcelona: the ticket has ONE door — the free file — no till button, no sheet');
  check(w.board === 'BARCELONA' && w.to === 'BCN', 'barcelona: the pass spells BARCELONA, bound for BCN');
  await tap(page, '#ckStart');
  await page.waitForTimeout(400);
  check(await page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; }) === 'full-search', 'barcelona: the ticket\'s door leads to the form with Full Search checked');
  await ctx.close();
}
// without JS the Check-in and the rail are not there (they are behaviour)
{
  const { ctx, page } = await open({ js: false, width: 1440 });
  check(await page.$eval('#checkin', (e) => getComputedStyle(e).display === 'none') && await page.$eval('.rail', (e) => getComputedStyle(e).display === 'none'),
    'without JS the Check-in and the rail are hidden; the plates, the FAQ and its derived answer still read');
  check((await page.textContent('#faq')).includes('Full Search (€500) if you haven\'t started.'), 'without JS the derived FAQ answer is still on the page as text');
  await ctx.close();
}
// the depth: the tilt only with a fine pointer and motion allowed; the rail at 1440 only
{
  const { ctx, page } = await open({ width: 1440 });
  await page.waitForTimeout(800);
  check(await page.$eval('.filecard', (e) => e.classList.contains('tilt')), '1440 with a mouse: the file card tilts toward the pointer (class tilt)');
  const box = await page.$eval('.filecard', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.2);
  await page.waitForTimeout(150);
  const vars = await page.$eval('.filecard', (e) => ({ ry: e.style.getPropertyValue('--ry'), rx: e.style.getPropertyValue('--rx'), tf: getComputedStyle(e).transform }));
  check(/^2\.\d+deg$/.test(vars.ry) && /^1\.\d+deg$/.test(vars.rx) && vars.tf !== 'none', `moving the pointer to the top-right corner turns the card (--ry ${vars.ry}, --rx ${vars.rx})`);
  check(await page.$eval('.rail', (e) => getComputedStyle(e).display === 'flex') && await page.$eval('.rail a[data-rail="contact"]', (e) => e.classList.contains('on')),
    '1440: the rail shows, the first dot (the door) is on');
  // instant, not smooth: the page scrolls smoothly (boom-2026.css) and the
  // dot follows the section that is ON SCREEN, so the measure waits for arrival
  await page.evaluate(() => document.getElementById('faq').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(600);
  check(await page.$eval('.rail a[data-rail="faq"]', (e) => e.classList.contains('on')) && !(await page.$eval('.rail a[data-rail="contact"]', (e) => e.classList.contains('on'))), 'scrolled to the FAQ, its dot is the one on');
  await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(400);
  check(await page.$eval('#services .plates .sib', (e) => getComputedStyle(e).animationName === 'plate-in'), 'the plates arrive with a scroll-driven entrance (animation plate-in, behind @supports)');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ width: 1440, reducedMotion: 'reduce' });
  await p2.waitForTimeout(400);
  await p2.evaluate(() => document.getElementById('services').scrollIntoView());
  await p2.waitForTimeout(300);
  check(!(await p2.$eval('.filecard', (e) => e.classList.contains('tilt'))) && await p2.$eval('#services .plates .sib', (e) => getComputedStyle(e).animationName === 'none'),
    'under reduced motion: no tilt, no scroll-driven entrance');
  await tap(p2, ckOpt('zero')); await tap(p2, ckOpt('soon')); await tap(p2, ckOpt('here')); await tap(p2, '#ckGo');
  await p2.waitForTimeout(300);
  check((await p2.textContent('#ckPlan')) === 'Full Search' && [...(await p2.$$eval('#ckPrice .st b', (bs) => bs.map((b) => b.textContent)))].join('') === '€500'
    && await p2.$eval('#ckTkt', (e) => getComputedStyle(e).animationName === 'none') && await p2.$eval('#ckCarta', (e) => getComputedStyle(e).animationName === 'none' && !e.classList.contains('tilt')),
    'under reduced motion the Check-in still works at once — the ticket set, the price on the board, no flip, no float, no tilt on the pass');
  await c2.close();
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p3 = await touch.newPage();
  await p3.addInitScript(() => { try { localStorage.setItem('boom:consent', 'min:' + Date.now()); } catch (e) {} });
  await p3.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await p3.goto(`${base}/amsterdam`, { waitUntil: 'load' });
  await p3.waitForTimeout(500);
  check(!(await p3.$eval('.filecard', (e) => e.classList.contains('tilt'))) && await p3.$eval('.rail', (e) => getComputedStyle(e).display === 'none'),
    'on a touch screen at 390: no tilt (a thumb has no hover), no rail');
  await touch.close();
}

await browser.close();
srv.close();
console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
