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
//   - v1.8 review LFR-1: on a desk that charges at signing (since the card
//     flip of 06/11 the scratch Paris and Berlin of §15) Enter
//     in the till's name, email, note or tick never orders — it walks to the
//     next field, then the button; a held Enter walks one step; one click on
//     the labelled button makes ONE order; the six keep Enter to checkout;
//     STAMP: the managed DUE/PAID fields never sit under the stamp;
//   - v1.6, the complete aviation desk: ≤ 150 words on the first phone
//     screen and nothing on it still moving after 1.6 s; the plane on the
//     route parked by the SERVER's state (--at 0 · .25 · .125 with the hold),
//     the code line empty of any file code until the server's answer; the
//     Departures row 01 flipping to a fact (REPLY TODAY / REPLY MON / START /
//     FROM 4 NOV / FILE OPEN) only when the board is seen, #depLive once; the
//     clocks in the desk's zone and the reader's own (never sent); the week
//     strip closing Koningsdag and the bank holiday without naming them; the
//     header twin and the Gate door (one label, one POST); the loops — one
//     at most with the desk open, none closed, none with reduced motion;
//   - the v1.6 review (§12, one guard per confirmed finding): a fresh
//     /<slug>#fares (the Stripe cancel_url) lands below the sticky header;
//     forced colors at ≥940 keep the pass's columns; the CONDITIONS chip never
//     covers the fact sheet's summary nor its '+'; the stub's door block rides
//     beside an open ticket and stops on the foot; the onda keeps ONE frame
//     chain through tab hide/show; the door under the header brings the twin;
//     row 01 follows the desk across closing time; Paris and Berlin never say
//     "desk open" (REPLYING / OFFLINE). `CITIES_UI_ONLY=review` runs §12 alone;
//   - v1.8 stage B3 (dark): a desk that charges at signing, a scratch Paris
//     and Berlin built here from Amsterdam with the registry patched in
//     try/finally and served at /paris and /berlin (§15): the order (the POST carries requestId, termsV,
//     startNow false → BOOKED, never PAID, ONE booking, no purchase), its
//     refusals (400 fields, 409 stale, a retry on the same requestId), the
//     managed ticket (?order=&t=: BOOKED with the online withdrawal, DUE
//     with the pay link, PAID, CLOSED; a wrong link asks once and says "not
//     confirmed yet"), #order-<plan>, a ?paid= that means nothing there —
//     and the six unchanged. The hub (§13): under 600px the map box takes
//     the tap and docks the nearest desk within 30px (option (b));
//     `CITIES_UI_ONLY=signing` runs §15 alone;
//   - zero JS errors, no request to a host we did not stub.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { BUDGET, HUB_BUDGET, HUB_MAP_PX, renderCity, fragments, loadClaims } from '../../build-cities.mjs';

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
// a scratch page served at its path for one section (v1.8: the signing Paris of §15, at /paris)
const PAGES = new Map();
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.extname(p)) p += '.html';                       // cleanUrls, as on Vercel
  if (PAGES.has(p)) { res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(PAGES.get(p)); }
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
async function open({ js = true, width = 390, height = null, api = LEAD_OK, paid = { status: 200, body: { ok: true, pending: true } }, reducedMotion = 'no-preference', slug = 'amsterdam', query = '', checkout = null, consent = true, clock = null, touch = false, tz = null, init = null, pwClock = null, forced = false } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: height || (width < 600 ? 844 : 900) }, reducedMotion, ...(touch ? { isMobile: true, hasTouch: true } : {}), ...(tz ? { timezoneId: tz } : {}), ...(forced ? { forcedColors: 'active' } : {}) });
  const page = await ctx.newPage();
  // a script that must run before the page's own (e.g. a counter wrapped around requestAnimationFrame)
  if (init) await page.addInitScript(init);
  // playwright's clock: Date AND the page's timers, moved on with page.clock.runFor (crossing closing time)
  if (pwClock) await page.clock.install({ time: new Date(pwClock) });
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
      const res = typeof checkout === 'function' ? checkout(st.checkouts.length) : checkout || { status: 200, body: { ok: true, url: `${base}/${slug}?paid=full-search&start=0&session_id=${SID}` } };
      if (res.delay) await new Promise((x) => setTimeout(x, res.delay));
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
const shown = (page, sel) => page.$eval(sel, (e) => { if (e.hidden || getComputedStyle(e).visibility === 'hidden' || getComputedStyle(e).display === 'none') return false; if (e instanceof SVGElement) { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } return !!e.offsetParent; }).catch(() => false);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim().replace(/\s+/g, ' ')).catch(() => null);
const boardWord = (page, sel) => page.$eval(sel, (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join('').trim()).catch(() => '');
const center = (page, sel) => page.$eval(sel, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
const tap = async (page, sel) => { await center(page, sel); await page.waitForTimeout(120); await page.click(sel); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const RULE = JSON.parse(fs.readFileSync(path.join(R, 'cities/_shared.json'), 'utf8')).refund.rule;
// v1.8 FLIP (05/11/2026): Paris and Berlin are live and charge at signing (their fare's ✓ line is the signing rule, never
// the refund rule) — no waitlist page is left on the site. The waitlist's browser pins keep their test on SYNTHETIC
// pages served from memory (PAGES): the frozen drafts of tests/cities/fixtures (draft-paris.json, draft-berlin.json, the
// two JSONs as they stood before the flip) rendered as waitlists — the registry patched back in try/finally, their
// reviewed sentences (fixtures/draft-claims.json) merged — at /draft-paris and /draft-berlin; and London and Milan in a
// family where Paris and Berlin are those drafts, at /london-drafts and /milan-drafts (the desks not open on the map).
// The card flip (06/11/2026, the founder's decision): Paris and Berlin take the card at the order like the six, so no
// live desk charges at signing — the coupon under the €500 is the refund rule everywhere. The signing shape keeps its
// browser pins on the scratch Paris and Berlin of §15 (the orders booked before 06/11 still read it).
const SIGN_RULE = JSON.parse(fs.readFileSync(path.join(R, 'cities/_shared.json'), 'utf8')).signing.rule;
const SIGNING = new Set();
{
  const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
  const { CITY_MARKETS: CM, CITY_PLANS } = await import('../../api/_market.js');
  const SL = ['amsterdam', 'barcelona', 'berlin', 'london', 'madrid', 'milan', 'paris', 'valencia'];
  const CITY = Object.fromEntries(SL.map((s) => [s, JSON.parse(read(`cities/${s}.json`))]));
  const DRAFT = { paris: JSON.parse(read('tests/cities/fixtures/draft-paris.json')), berlin: JSON.parse(read('tests/cities/fixtures/draft-berlin.json')) };
  const claims = loadClaims(R), fx = JSON.parse(read('tests/cities/fixtures/draft-claims.json'));
  const merged = { about: claims.about, allowed: [...claims.allowed, ...fx.allowed].sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)) };
  const fam = SL.map((x) => DRAFT[x] || CITY[x]);
  // the two registry entries as they stood before the flip (api/_market.js at 083d96b6)
  const WAIT = {
    paris: { label: 'Paris', flag: '🇫🇷', country: 'fr', url: 'https://www.boomrome.com/paris', mode: 'waitlist', partner: 'a licensed partner', plans: CITY_PLANS },
    berlin: { label: 'Berlin', flag: '🇩🇪', country: 'de', url: 'https://www.boomrome.com/berlin', mode: 'waitlist', partner: 'a licensed partner', plans: CITY_PLANS }
  };
  const save = { paris: CM.paris, berlin: CM.berlin };
  try {
    Object.assign(CM, WAIT);
    const page = (city) => renderCity({ template: read('cities/_template.html'), shared: JSON.parse(read('cities/_shared.json')), city, assetVersion: { css: 'ui', js: 'ui', onda: 'ui', map: 'ui' },
      frags: fragments(R), root: R, weigh: false, cities: fam.map((x) => (x.slug === city.slug ? city : x)), claims: merged }).html;
    PAGES.set('/draft-paris.html', page(DRAFT.paris)); PAGES.set('/draft-berlin.html', page(DRAFT.berlin));
    PAGES.set('/london-drafts.html', page(CITY.london)); PAGES.set('/milan-drafts.html', page(CITY.milan));
  } catch (e) { male(`the synthetic waitlist pages build (${String(e.message).slice(0, 300)})`); }
  finally { Object.assign(CM, save); }
  check(CM.paris === save.paris && CM.paris.chargeAt === undefined && CM.berlin.chargeAt === undefined && PAGES.size >= 4, 'the synthetic waitlist pages build from the frozen drafts, and the registry is restored (Paris and Berlin at the checkout since 06/11)');
}
// the v1.6 review's guards alone (§12), e.g. to watch one bite under a mutation
if (process.env.CITIES_UI_ONLY === 'review') { await reviewFixes(); await finish(); }
if (process.env.CITIES_UI_ONLY === 'hub') { await hubUI(); await finish(); }
if (process.env.CITIES_UI_ONLY === 'v17') { await v17Fixes(); await finish(); }
if (process.env.CITIES_UI_ONLY === 'signing') { await signingUI(); await finish(); }

// ── 1 · the first phone screen is one pass ───────────────────────────────
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(1600);
  check(await boardWord(page, '#placeBoard') === 'AMSTERDAM', 'the city settles on its board (AMSTERDAM)');
  check(await page.$eval('#h1', (h) => h.textContent === 'Your home in Amsterdam' && !h.querySelector('.board')), 'after the board settles the rendered H1 still reads exactly "Your home in Amsterdam" (the cells live outside it)');
  const fold = 844;
  const doorR = await rect(page, '#door'), lastRow = await rect(page, '#fare-attended-viewing > summary');
  check(lastRow.bottom <= fold && doorR.bottom <= fold, `at 390×844 the three fares (bottom ${Math.round(lastRow.bottom)}) and the gold door (bottom ${Math.round(doorR.bottom)}) are on the first screen`);
  // v1.7 (card-S): Full Search lies down alone; Application Pack and Attended Viewing are a pair side by side (AV to the right)
  const o = await page.evaluate(() => ['#h1', '.lead', '#fare-full-search', '#fare-application-pack', '#fare-attended-viewing', '#door', '.fields.desk'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.top, r.left]; }));
  check(o[0][0] < o[1][0] && o[1][0] < o[2][0] && o[2][0] < o[3][0] && Math.abs(o[3][0] - o[4][0]) <= 1 && o[4][1] > o[3][1] && o[4][0] < o[5][0] && o[5][0] < o[6][0],
    'reading order at 390: title · sentence · Full Search lying · the economy pair side by side (Attended Viewing to the right) · door · who answers', JSON.stringify(o));
  check(JSON.stringify(await page.$$eval('.fields.desk dd', (d) => d.map((x) => x.textContent.trim()))) === JSON.stringify(['Valentino Egidi', 'Mon–Fri 09:00–19:00, Rome time']) && await shown(page, '.fields.desk'), 'who answers and when, said on the pass');
  check(await page.$$eval('#fares details[open]', (d) => d.length) === 0 && await shown(page, '#notSure') && !(await shown(page, '#planLn')), 'nothing pre-selected: no fare open, the "not sure" line over the door');
  const cp = await page.evaluate(() => { const r = document.querySelector('#fares .refund.fs').getBoundingClientRect(), f = document.getElementById('fare-full-search').getBoundingClientRect(); return { rt: r.top, rb: r.bottom, rl: r.left, rr: r.right, fb: f.bottom, fl: f.left, fr: f.right }; });
  check(await shown(page, '#fares .refund.fs') && await text(page, '#fares .refund.fs') === RULE && cp.rt >= cp.fb - 2 && cp.rt <= cp.fb + 2 && cp.rl >= cp.fl - 1 && cp.rr <= cp.fr + 1,
    'the refund rule is a coupon torn under the closed Full Search ticket, within its width', JSON.stringify(cp));
  check(await noHScroll(page), 'no horizontal scroll at 390');
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS error, no request to a foreign host', st.errors.concat(st.foreign).join(' | '));
  await ctx.close();
}

for (const slug of ['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia', 'paris', 'berlin']) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { ctx, page } = await open({ slug, width: w, height: h });
    await page.waitForTimeout(400);
    if (w === 390) {
      const b = await page.evaluate(() => ['#door', '.fields.desk', '#fare-attended-viewing > summary'].map((q) => Math.round(document.querySelector(q).getBoundingClientRect().bottom)));
      check(b.every((x) => x <= 844), `${slug} 390×844: the three fares, the gold door and who answers are all above the fold (${b.join(', ')})`);
    } else {
      const t = await page.evaluate(() => ['#fare-full-search', '#fare-application-pack', '#fare-attended-viewing'].map((q) => document.querySelector(q).getBoundingClientRect().top));
      check(t[0] < t[1] && t[1] < t[2], `${slug} 1440: the three tickets lie down one under the other`, t.join(', '));
    }
    // the legally load-bearing first-screen text is RENDERED, not only written
    const legal = await page.evaluate(() => {
      const vis = (e) => !!e && !!e.offsetParent && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height > 0;
      return { cond: [...document.querySelectorAll('#fares .f-cond')].map(vis), lead: vis(document.querySelector('.lead b')), head: vis(document.getElementById('faresH')) && vis(document.querySelector('.fares-h span')),
        rule: document.querySelector('#fares .refund.fs') ? [vis(document.querySelector('#fares .refund.fs')), document.querySelector('#fares .refund.fs').textContent] : null };
    });
    // v1.8 FLIP: this pin moved — Paris and Berlin had no coupon (waitlists); the eight sell, and the coupon under the
    // closed €500 is the desk's own rule: the refund rule at the six, the signing rule at Paris and Berlin
    const want = SIGNING.has(slug) ? SIGN_RULE : RULE;
    check(legal.cond.length === 3 && legal.cond.every(Boolean) && legal.lead && legal.head && legal.rule && legal.rule[0] && legal.rule[1] === want,
      `${slug} ${w}: every fare's condition, the must-state in bold, the line over the fares and ${SIGNING.has(slug) ? 'the signing rule' : 'the refund rule'} under the closed €500 are on screen, not only in the HTML`, JSON.stringify(legal));
    await ctx.close();
  }
}
// v1.7 (card-S, the lead's hard pins): on EVERY desk, at 390×664, 375×812 and
// 390×844, each price and its condition are READABLE — the box inside the
// viewport side to side and its bottom above the strip when the strip is on;
// at 375×812 the door and who-answers are above the fold too (the founder's
// promise that v1.6 missed by 19–22 px on every desk).
for (const slug of ['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia', 'paris', 'berlin']) {
  for (const [w, h] of [[390, 664], [375, 812], [390, 844]]) {
    const { ctx, page } = await open({ slug, width: w, height: h });
    await page.waitForTimeout(700);
    const g = await page.evaluate(() => {
      const s = document.getElementById('strip'), lim = innerHeight - (s && s.classList.contains('on') ? s.offsetHeight : 0);
      const box = (e) => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) }; };
      const ok = (b) => b.t >= 0 && b.l >= 0 && b.r <= innerWidth && b.b <= lim;
      const bad = [];
      for (const d of document.querySelectorAll('details.fare')) for (const k of ['.f-price', '.f-cond']) { const b = box(d.querySelector(k)); if (!ok(b)) bad.push(`${d.id} ${k} ${JSON.stringify(b)}`); }
      return { lim, bad, door: box(document.getElementById('door')).b, who: box(document.querySelector('.fields.desk')).b, n: document.querySelectorAll('details.fare .f-price').length };
    });
    check(g.n === 3 && g.bad.length === 0, `${slug} ${w}×${h}: the three prices and their conditions are readable (inside the viewport, above the strip: lim ${g.lim})`, g.bad.join(' | '));
    if (h === 812) check(g.door <= 812 && g.who <= 812, `${slug} 375×812: the gold door (${g.door}) and who answers (${g.who}) are above the fold`);
    await ctx.close();
  }
}
{
  // ≤359: the pair's rule does not apply — all three tickets lie down, one under the other
  const { ctx, page } = await open({ slug: 'amsterdam', width: 320, height: 568 });
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => ['#fare-full-search', '#fare-application-pack', '#fare-attended-viewing', '#door'].map((q) => document.querySelector(q).getBoundingClientRect().top));
  check(t[0] < t[1] && t[1] < t[2] && t[2] < t[3] && await noHScroll(page), 'at 320 the three tickets lie down one under the other, then the door; no horizontal scroll', t.join(', '));
  await ctx.close();
}
for (const slug of ['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia']) {
  // L1: an iPhone's visible height in Safari (~664): the first screen always
  // has an action — the gold door, or the strip when the door is under the fold
  const { ctx, page } = await open({ slug, width: 390, height: 664 });
  await page.waitForTimeout(600);
  const a = await page.evaluate(() => {
    const d = document.getElementById('door').getBoundingClientRect(), s = document.getElementById('strip');
    return { doorIn: d.top >= 0 && d.bottom <= innerHeight, half: d.top + d.height / 2 <= innerHeight, strip: s.classList.contains('on') };
  });
  check(a.doorIn || a.strip, `${slug} 390×664 (Safari's visible height): the gold door or the strip is on the first screen`, JSON.stringify(a));
  await ctx.close();
}

// ── 1b · deep links (v1.7): /<slug>#fare-<plan>, #<plan>, #pay-<plan> ───────
// The ticket opens alone and lands whole, its pay button (the door on a
// waitlist desk) at the bottom edge and focused; the hash folds; #pay- then
// opens the till on that plan with Start-now unticked. Guards: an unknown
// plan does nothing and keeps its hash; a paid return and a pass that is not
// blank are left alone. A hashchange to #fare-… makes the BROWSER jump before
// the handler folds: the fold and the ticket are asserted, never scrollY.
const probeDeep = (page) => page.evaluate(() => {
  const open = [...document.querySelectorAll('details.fare')].filter((d) => d.open).map((d) => d.id);
  const d = open.length ? document.getElementById(open[0]) : null, pay = d && d.querySelector('[data-pay]'), door = document.getElementById('door');
  const on = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); const s = document.getElementById('strip'); const lim = innerHeight - (s && s.classList.contains('on') ? s.offsetHeight : 0); return b.top >= 0 && b.bottom <= lim; };
  const card = d && d.getBoundingClientRect();
  return { open, pay: on(pay), door: on(door), ticketTop: card ? Math.round(card.top) : null, cardIn: card ? card.left >= 0 && card.right <= innerWidth : null, hash: location.hash, till: !!(document.getElementById('till') || {}).open,
    tick: !!(document.getElementById('tStart') || {}).checked, tillPlan: (document.getElementById('tillForm') || { getAttribute: () => null }).getAttribute('data-plan'),
    focusPay: !!(document.activeElement && document.activeElement.hasAttribute('data-pay')), focusDoor: !!(document.activeElement && document.activeElement.id === 'door'),
    events: (window.dataLayer || []).map((a) => [].slice.call(a)).filter((a) => a[0] === 'event' && (a[1] === 'fare_open' || a[1] === 'pay_link')).map((a) => [a[1], a[2] && a[2].via, a[2] && a[2].plan]) };
});
for (const [slug, hash, w, h] of [['barcelona', '#fare-full-search', 390, 844], ['barcelona', '#full-search', 390, 664], ['london', '#fare-application-pack', 390, 844], ['madrid', '#fare-attended-viewing', 375, 812], ['london', '#fare-full-search', 1440, 900], ['paris', '#fare-full-search', 390, 844], ['berlin', '#fare-application-pack', 390, 844], ['amsterdam', '#fares', 390, 844], ['amsterdam', '#fare-nope', 390, 844], ['amsterdam', '#pay-constructor', 390, 844]]) {
  const { ctx, page, st } = await open({ slug, width: w, height: h, query: hash });
  await page.waitForTimeout(800);
  const r = await probeDeep(page);
  // v1.8 FLIP: the eight sell (Paris and Berlin were waitlists here: the door focused); a waitlist's deep link is the
  // synthetic draft's, below
  const m = /^#(?:fare-|pay-)?(full-search|application-pack|attended-viewing)$/.exec(hash), sells = !/^draft-/.test(slug);
  if (!m) check(r.open.length === 0 && r.hash === hash && !r.till, `${slug}${hash}: not a fare — nothing opens, no till, the hash stays`, JSON.stringify(r));
  else check(r.open.length === 1 && r.open[0] === 'fare-' + m[1] && r.cardIn && r.ticketTop >= 0 && (sells ? r.pay && r.focusPay : r.door && r.focusDoor) && r.hash === '' && !r.till && st.errors.length === 0 && r.events.some((e) => e[0] === 'fare_open' && e[1] === 'link' && e[2] === m[1]),
    `${slug}${hash} at ${w}×${h}: that ticket alone, whole on screen, ${sells ? 'the pay button' : 'the door'} above the strip and focused, the hash folded, no till, fare_open via link`, JSON.stringify(r));
  await ctx.close();
}
// v1.8 FLIP: Paris and Berlin sell — their #pay-<plan> opens the till on that plan, unticked, like the six's; the
// waitlist's #pay- (the door, no till) is pinned on the frozen draft Paris (/draft-paris)
for (const [slug, hash] of [['barcelona', '#pay-full-search'], ['london', '#pay-attended-viewing'], ['paris', '#pay-full-search'], ['berlin', '#pay-application-pack'], ['draft-paris', '#pay-full-search']]) {
  const { ctx, page, st } = await open({ slug, query: hash });
  await page.waitForTimeout(900);
  const r = await probeDeep(page);
  const sells = !/^draft-/.test(slug);
  if (sells) {
    check(r.till && !r.tick && r.hash === '' && r.tillPlan === hash.slice(5) && r.open[0] === 'fare-' + hash.slice(5) && st.errors.length === 0 && r.events.some((e) => e[0] === 'pay_link' && e[2] === hash.slice(5)),
      `${slug}${hash}: the till opens on ${hash.slice(5)}, Start-now unticked, the hash folded, pay_link tracked`, JSON.stringify(r));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    check(await page.evaluate(() => !document.getElementById('till').open && !!document.activeElement && document.activeElement.hasAttribute('data-pay')), `${slug}${hash}: Escape closes the till and the focus returns to the pay button that opened it`);
  } else check(!r.till && r.door && r.focusDoor && r.hash === '' && r.open[0] === 'fare-full-search', `${slug}${hash}: a waitlist desk has no till — the ticket opens and the door comes into view, focused`, JSON.stringify(r));
  await ctx.close();
}
{
  const { ctx, page } = await open({ slug: 'london' });
  await page.waitForTimeout(500);
  await page.evaluate(() => { location.hash = '#fare-application-pack'; });
  await page.waitForTimeout(600);
  const r = await probeDeep(page);
  check(r.open.length === 1 && r.open[0] === 'fare-application-pack' && r.pay && r.hash === '' && !r.till, 'a hashchange after load opens Application Pack alone and lands its pay button, the hash folded', JSON.stringify(r));
  await ctx.close();
}
{
  const { ctx, page } = await open({ slug: 'london', query: `?paid=full-search&start=0&session_id=${SID}#fare-attended-viewing` });
  await page.waitForTimeout(900);
  const r = await probeDeep(page);
  check(!r.open.includes('fare-attended-viewing') && r.hash === '' && await page.getAttribute('#pass', 'data-state') !== 'blank', 'a paid return ignores the fare fragment: the pass is not blank, no ticket is forced open', JSON.stringify(r));
  await ctx.close();
}
{
  const { ctx, page } = await open({ slug: 'london', query: '#full-search' });
  await page.waitForTimeout(600);
  await page.evaluate(() => { scrollTo(0, 0); dispatchEvent(new WheelEvent('wheel')); });
  await page.evaluate(() => { location.hash = '#fare-full-search'; });
  await page.waitForTimeout(500);
  const r = await probeDeep(page);
  check(r.open.length === 1 && r.open[0] === 'fare-full-search' && r.hash === '', 'a repeated fare link after the reader moved: the ticket stays open and the hash folds (where the page sits is the browser\'s fragment jump, not asserted)');
  await ctx.close();
}

// ── 2 · a fare opens its ticket in place; the door moves into it ──────────
{
  const { ctx, page } = await open();
  // Safari has no native scroll anchoring: switched off here, so only the
  // page's own anchoring can keep the tapped row still
  await page.addStyleTag({ content: '*{overflow-anchor:none!important}' });
  await page.waitForTimeout(400);
  // 'instant': the page scrolls smoothly (scroll-behavior), and a smooth
  // scroll still running at the tap read as the ROW moving (-2 to -18 px,
  // the scroll's remaining distance) — measured, not the page's anchoring
  await page.evaluate(() => window.scrollTo({ top: 120, left: 0, behavior: 'instant' }));
  await page.waitForFunction(() => scrollY === 120, null, { timeout: 2000 }).catch(() => {});
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
for (const [w, h] of [[390, 844], [320, 568], [430, 932]]) {
  // the common sequence (review B3): Full Search open, a little scroll, tap
  // Attended Viewing at the bottom of the screen. With Safari's lack of
  // native anchoring the row must not move — and no frame may be painted
  // with it displaced (the correction runs in the tap, not in 'toggle')
  const { ctx, page } = await open({ width: w, height: h });
  await page.addStyleTag({ content: '*{overflow-anchor:none!important}' });
  await page.waitForTimeout(300);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  await page.$eval('#fare-attended-viewing > summary', (e) => e.scrollIntoView({ block: 'end', behavior: 'instant' }));
  await page.waitForTimeout(200);
  const trace = await page.evaluate(() => new Promise((done) => {
    const s = document.querySelector('#fare-attended-viewing > summary');
    const y0 = s.getBoundingClientRect().top, ys = [];
    let n = 0;
    (function frame() { ys.push(s.getBoundingClientRect().top - y0); if (++n < 12) requestAnimationFrame(frame); else done({ ys, open: s.parentNode.open }); })();
    s.click();
  }));
  const worst = Math.max(...trace.ys.map(Math.abs));
  check(trace.open && worst < 2, `${w}×${h}: Full Search open, a tap on Attended Viewing at the foot of the screen — the row never moves, in any frame (worst ${worst.toFixed(1)} px)`);
  // the door follows into the new ticket — or, when that move alone would pull
  // the row up past the top of the page, stays in the open ticket above (the
  // strip offers it while it is off the screen); either way it says the new plan
  const where = await page.$eval('#act', (a) => { const f = a.closest('details.fare'); return f && f.open ? f.id : null; });
  check(where && await text(page, '#planName') === 'Attended Viewing', `${w}×${h}: the door sits in an open ticket (${where}) and says the plan just opened`);
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
  check(st.posts.length === 1 && st.posts[0].phone === '+31 6 1234 5678' && !st.posts[0].email && st.posts[0].service === '', 'a number travels AS TYPED (the server reads it with the desk\'s country); no fare open = no plan ("to decide" on the server)', JSON.stringify(st.posts[0]));
  check(await page.getAttribute('#pass', 'data-state') === 'blank' && !(await shown(page, '#cOpen')) && !(await page.$eval('#door', (b) => b.disabled || b.getAttribute('aria-disabled') === 'true')) && /send failed/i.test(await text(page, '#fNetErr')),
    'a failed send issues nothing, gives the door back and says so in its own alert');
  check(await page.$eval('#fContact', (i) => i.getAttribute('aria-invalid') !== 'true') && await page.evaluate(() => document.activeElement && document.activeElement.id === 'door'),
    'the valid contact field is not marked invalid, and the focus is still on the door (a keyboard user keeps their place)');
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
  // v1.8 stage W: the withdrawal line, shown in the open till, links the online function first
  const wdA = await page.$eval('#till .wd', (p) => [...p.querySelectorAll('a')].map((a) => ({ t: a.textContent, h: a.getAttribute('href'), seen: a.getBoundingClientRect().height > 0 })));
  check(wdA.length === 3 && wdA[0].t === 'online' && wdA[0].h === '/withdrawal?desk=Amsterdam#online' && wdA[0].seen && wdA[2].h === '/withdrawal?desk=Amsterdam' && /^Withdrawal: 14 days from payment — online, by email to /.test(await text(page, '#till .wd')),
    'the open till\'s withdrawal line links the online withdrawal function first ("online" → /withdrawal?desk=Amsterdam#online), then the email, then the model form (stage W)', JSON.stringify(wdA));
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
  // B1: while the free door is filing, no till opens; when OPEN lands, no till is left open
  const { ctx, page, st } = await open({ api: { ...LEAD_OK, delay: 1500 } });
  await page.waitForTimeout(300);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(150);
  await tap(page, '#door');
  await page.fill('#fName', 'Anna Keller'); await page.fill('#fContact', 'anna@example.com');
  await page.click('#door');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'door') && await page.getAttribute('#door', 'aria-disabled') === 'true', 'while the door sends it keeps the focus (aria-disabled, never disabled)');
  await page.$eval('#fare-full-search [data-pay]', (b) => b.click());
  await page.waitForTimeout(200);
  check(!(await page.$eval('#till', (d) => d.open)), 'while the free door is filing, a pay button opens no till (the door promised no card)');
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'open', null, { timeout: 5000 }).catch(() => {});
  check(!(await page.$eval('#till', (d) => d.open)) && st.checkouts.length === 0 && st.posts.length === 1, 'OPEN lands with no till open and nothing sent to the checkout');
  await page.evaluate(() => window.BOOM_TICKET.openTill('full-search'));
  check(!(await page.$eval('#till', (d) => d.open)), 'after OPEN the till cannot be opened at all');
  await ctx.close();
}
{
  // B2: closing the till while its checkout flies stays on the page
  const { ctx, page, st } = await open({ checkout: { status: 200, body: { ok: true, url: '/withdrawal?stripe=1' }, delay: 1200 } });
  await page.waitForTimeout(300);
  await page.click('#fare-application-pack > summary');
  await page.waitForTimeout(150);
  await tap(page, '#fare-application-pack [data-pay]');
  await page.fill('#tName', 'Anna Keller'); await page.fill('#tEmail', 'anna@example.com');
  await page.click('#tGo');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2200);
  check(st.checkouts.length === 1 && /\/amsterdam$/.test(new URL(page.url()).pathname) && !(await page.$eval('#till', (d) => d.open)), 'Escape while the checkout flies: the page stays (no Stripe after the visitor said no)', page.url());
  await page.click('#fare-application-pack [data-pay]');
  await page.waitForTimeout(200);
  check(await page.$eval('#till', (d) => d.open) && await page.getAttribute('#tGo', 'aria-disabled') === null, 'the till reopens ready to pay again');
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
  check(await page.$eval('#cText', (e) => parseFloat(getComputedStyle(e).paddingRight) === 0), 'the confirming card has no stamp, so its sentence keeps the full width (no stamp padding)');
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 6000 }).catch(() => {});
  check(await page.getAttribute('#pass', 'data-state') === 'paid' && await text(page, '#pFile') === FILE && await text(page, '#pFare') === 'Full Search · €500', 'the server says paid: PAID with the server\'s file and the plan');
  check(await text(page, '#pStart') === 'From 4 November 2026, after your 14-day withdrawal period' && await shown(page, '#pWait') && !(await shown(page, '#pText')) && /14 days end/.test(await text(page, '#pNext')),
    'not ticked: the start date is the server\'s first working day AFTER the 14 days (never called their end), the wait note and the wait steps');
  const ev = await events(page);
  const purchases = ev.filter((e) => e.name === 'purchase');
  check(purchases.length === 1 && /^city_amsterdam_[0-9a-f]{8}$/.test(purchases[0].p.transaction_id) && purchases[0].p.value === 500 && !JSON.stringify(purchases[0].p).includes(SID), 'ONE purchase, with an opaque transaction id (never the session id)');
  check(await page.evaluate(() => location.search === '' && location.hash === ''), 'the address line is folded back to the page once verified');
  await page.goto(`${base}/amsterdam?paid=full-search&start=0&session_id=${SID}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 4000 }).catch(() => {});
  check((await events(page)).filter((e) => e.name === 'purchase').length === 0, 'a reload of the paid return counts nothing twice');
  await ctx.close();
}
// London (02/11/2026): the till, the paid card and analytics speak pounds
{
  const { ctx, page, st } = await open({ slug: 'london', paid: (n) => (n < 1 ? { status: 200, body: { ok: true, pending: true } } : { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: false, workFromLabel: '4 November 2026' } }) });
  await page.waitForTimeout(300);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  await tap(page, '#fare-full-search [data-pay]');
  await page.waitForTimeout(250);
  check(await text(page, '#tPrice') === '£500' && await text(page, '#tGoL') === 'Pay and book · £500', 'London till: £500, "Pay and book · £500"');
  await page.fill('#tName', 'Clara Hale');
  await page.fill('#tEmail', 'clara@example.com');
  await page.click('#tGo');
  await page.waitForURL(/paid=full-search/, { timeout: 8000 });
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 8000 }).catch(() => {});
  const p = (await events(page)).filter((e) => e.name === 'purchase');
  check(st.checkouts.length === 1 && st.checkouts[0].city === 'london' && await text(page, '#pFare') === 'Full Search · £500' && p.length === 1 && p[0].p.currency === 'GBP' && p[0].p.value === 500,
    'London paid: "Full Search · £500" on the card, ONE purchase reported in GBP', JSON.stringify(p.map((e) => e.p.currency)));
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
  // v1.8 FLIP: Paris sells now (its door "no card · …", like the six); the waitlist's "replies" is the frozen draft's
  ['paris', '2026-12-24T19:00:00Z', 'no card · Monday from 09:00 CET', 'Christmas Eve at 20:00 in Paris: Monday (Christmas, Santo Stefano, the weekend; the French calendar adds no day)'],
  ['draft-paris', '2026-12-24T19:00:00Z', 'free · replies Monday from 09:00 CET', 'Christmas Eve at 20:00 on a waitlist desk (the frozen draft): Monday (Christmas, Santo Stefano, the weekend) — and a desk still opening says "replies", never "desk"'],
  ['london', '2026-08-31T10:00:00Z', 'no card · Tomorrow from 08:00 BST', 'the summer bank holiday in London: tomorrow, in London time'],
  ['london', '2026-12-24T18:30:00Z', 'no card · Tuesday from 08:00 GMT', 'Christmas Eve after hours in London: Tuesday (Christmas, the weekend, the Boxing Day substitute)'],
  ['milan', '2026-12-07T08:00:00Z', 'no card · Wednesday from 09:00 CET', "Sant'Ambrogio (Monday 7 December) and the Immacolata: Wednesday"],
  ['valencia', '2026-03-19T08:00:00Z', 'no card · Tomorrow from 09:00 CET', 'Sant Josep (Thursday 19 March) in Valencia: tomorrow (Madrid is open)'],
  ['valencia', '2026-10-09T08:00:00Z', 'no card · Tuesday from 09:00 CEST', 'the Dia de la Comunitat (Friday 9 October) and the 12 October: Tuesday'],
  ['valencia', '2027-06-24T08:00:00Z', 'no card · desk open until 19:00 CEST', '24 June 2027 is a working day in Valencia (Sant Joan was 2026 only)']
];
for (const [slug, clock, want, what] of CLOCKS) {
  const { ctx, page } = await open({ slug, clock });
  await page.waitForTimeout(200);
  const subs = await page.$$eval('[data-window]', (n) => n.map((x) => x.textContent.trim()));
  const bare = want.replace(/^(no card|free) · /, '');
  check(subs.length === 2 && subs[0] === want && subs[1] === bare, `${slug}: ${what} → door "${want}", strip "${bare}"`, JSON.stringify(subs));
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
  check(/From the first call/.test(body) && /What we check/.test(body) && /The papers a Dutch landlord asks for\./.test(body) && /Who answers, and when\./.test(body) && /Questions about renting in Amsterdam\./.test(body) && /Other desks, one company\./.test(body), 'no JS: every section of the walk reads (Departures, Pre-flight, Baggage, Gate, Questions, Network)');
  const papers = JSON.parse(fs.readFileSync(path.join(R, 'cities/amsterdam.json'), 'utf8')).papers.items;
  check(papers.every((x) => body.includes(x)) && /\bFREE\b/.test(body) && /\b1 WORK DAY\b/.test(body) && /\bIN PERSON\b/.test(body) && body.includes('Valentino Egidi'), 'no JS: the eight papers and the Departures statuses (FREE, 1 WORK DAY, IN PERSON) read as text');
  check(!(await shown(page, '#strip')) && (await page.$$eval('[data-pay]', (b) => b.every((x) => !x.offsetParent))), 'no JS: no strip, no pay button (behaviour, not content)');
  const beh = await page.$$eval('#clocks, #week, #topGo, #deskGo, #depPill, .dep-f', (es) => es.filter((e) => !!e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map((e) => e.id || e.className));
  check(beh.length === 0, 'no JS: the clocks, the week, the header twin, the Gate door, the desk pill and the Departures foot are not shown (behaviour)', beh.join());
  check(await page.$eval('.pass', (p) => getComputedStyle(p).opacity === '1') && await page.$eval('#how', (p) => getComputedStyle(p).opacity !== '0'), 'no JS: nothing waits hidden for an entrance (the pass, the sections)');
  await ctx.close();
}

// ── 7 · 320px, targets, reduced motion, the strip ─────────────────────────
{
  const { ctx, page } = await open({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  check(await noHScroll(page), '320: no horizontal scroll');
  const small = await page.evaluate(() => [...document.querySelectorAll('#fares summary, #door, .pill, .folds summary, .lane > summary, .net a, #deskGo')]
    .filter((e) => e.offsetParent).map((e) => ({ id: e.id || e.className || e.tagName, h: e.getBoundingClientRect().height })).filter((x) => x.h < 44));
  check(small.length === 0, '320: every fare row, the door, the WhatsApp pill, every fold, every Pre-flight lane, every Network link and the Gate door are ≥ 44 px tall', JSON.stringify(small.slice(0, 4)));
  // v1.8 stage W (§4.5): the footer's statutory label is longer than "Withdrawal form": still one target, inside the page
  const wdF = await page.$eval('.foot nav[aria-label="Legal"] a[href$="#online"]', (a) => { const r = a.getBoundingClientRect(); return { t: a.textContent, href: a.getAttribute('href'), h: r.height, l: r.left, r: r.right, vw: document.documentElement.clientWidth }; });
  check(wdF.t === 'Withdraw from contract here' && wdF.href === '/withdrawal?desk=Amsterdam#online' && wdF.h >= 44 && wdF.l >= 0 && wdF.r <= wdF.vw,
    `320: the footer's "Withdraw from contract here" (→ /withdrawal?desk=Amsterdam#online) is a ${Math.round(wdF.h)} px target inside the page (stage W)`, JSON.stringify(wdF));
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

{
  // B5: 200 % zoom on a 390 phone = 195 CSS px: no price nor condition is cut
  const { ctx, page } = await open({ width: 195, height: 422, slug: 'berlin' });
  await page.waitForTimeout(1500);
  const cut = await page.evaluate(() => [...document.querySelectorAll('.f-cond, .f-price, #placeBoard, .f-name')]
    .filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim().slice(0, 30), r: Math.round(e.getBoundingClientRect().right), sw: e.scrollWidth, cw: e.clientWidth }))
    .filter((x) => x.r > innerWidth + 1 || x.sw > x.cw + 1));
  check(cut.length === 0, '195 px (200 % zoom): every condition, price and the board fit — nothing cut', JSON.stringify(cut.slice(0, 3)));
  await ctx.close();
  const a = await open({ width: 195, height: 422 });
  await a.page.click('#fare-full-search > summary');
  await a.page.waitForTimeout(150);
  await tap(a.page, '#fare-full-search [data-pay]');
  await a.page.waitForTimeout(250);
  const tp = await a.page.evaluate(() => { const b = document.getElementById('tPrice'), d = document.getElementById('till'); return { r: b.getBoundingClientRect().right, dr: d.getBoundingClientRect().right, t: b.textContent }; });
  check(tp.t === '€500' && tp.r <= tp.dr + 1, '195 px: the till reads €500 whole', JSON.stringify(tp));
  await a.ctx.close();
}
{
  // B7: forced colors keep the open/closed mark of every fare row
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, forcedColors: 'active' });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${base}/amsterdam`, { waitUntil: 'load' });
  const fc = await page.evaluate(() => { const t = document.querySelector('.f-tog'); return [getComputedStyle(t, '::before').backgroundColor, getComputedStyle(document.body).backgroundColor]; });
  check(fc[0] !== fc[1] && !/rgba\(0, 0, 0, 0\)/.test(fc[0]), 'forced colors: the +/− of a fare row is drawn in CanvasText, not erased into the Canvas', JSON.stringify(fc));
  await ctx.close();
}
{
  // B9: crossing 940 px with the cursor in the door keeps the field on screen
  const { ctx, page } = await open({ width: 820, height: 820 });
  await page.waitForTimeout(300);
  await page.click('#fare-application-pack > summary');
  await page.waitForTimeout(150);
  await tap(page, '#door');
  await page.waitForTimeout(400);
  await page.click('#fContact');
  await page.keyboard.type('anna@');
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(400);
  const f = await page.evaluate(() => { const e = document.activeElement, r = e.getBoundingClientRect(); return { id: e.id, top: r.top, bottom: r.bottom, ih: innerHeight }; });
  check(f.id === 'fContact' && f.top >= 0 && f.bottom <= f.ih, 'rotating a tablet past 940 px with the cursor in the door: the field follows the door and stays on screen', JSON.stringify(f));
  await ctx.close();
}
{
  // B10: the fields' focus glow and the consent links' ring are not clipped
  const { ctx, page } = await open();
  await page.waitForTimeout(300);
  await tap(page, '#door');
  await page.waitForTimeout(500);
  check(await page.$eval('#fFields', (e) => getComputedStyle(e).overflow === 'visible') && await page.$eval('#cOpen', (e) => getComputedStyle(e).overflow === 'visible'), 'the revealed fields and the state cards do not clip focus rings (no overflow:hidden)');
  await ctx.close();
}
// ── 8 · the sisters ──────────────────────────────────────────────────────
// v1.8 FLIP moved this section (Paris and Berlin from waitlists to desks charged at signing); the card flip (06/11)
// moved it again: the six's shape — the free call at the door, three pay buttons, a till, the Full Search ticket saying
// the refund rule. The waitlist's pins run on the frozen drafts (/draft-paris, /draft-berlin); the signing shape on the
// scratch pages of §15
for (const slug of ['paris', 'berlin']) {
  const { ctx, page, st } = await open({ slug });
  await page.waitForTimeout(300);
  check(await text(page, '#doorL') === 'Start with a free call' && await page.$$eval('[data-pay]', (b) => b.length) === 3 && !!(await page.$('#till')), `${slug}: "Start with a free call", three pay buttons, a till`);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  const tkRule = await text(page, '#fare-full-search .tk .refund');
  check(tkRule === RULE, `${slug}: the Full Search ticket says the refund rule ("${tkRule}"), never a signing trigger`);
  await tap(page, '#door');
  await page.fill('#fName', 'Jean'); await page.fill('#fContact', 'jean@example.fr');
  await page.click('#door');
  await page.waitForTimeout(500);
  check(st.posts.length === 1 && st.posts[0].city === slug && await page.getAttribute('#pass', 'data-state') === 'open', `${slug}: the free call's file opens`);
  await ctx.close();
}
// v1.8 review LFR-1 (Enter never orders on a desk that charges at signing): since the card flip (06/11) it runs in §15,
// on the scratch Paris and Berlin served there
{
  // the six are unchanged: Enter in the till's email field still goes to checkout (Stripe's own page concludes the contract)
  const { ctx, page, st } = await open({ slug: 'amsterdam', checkout: { status: 200, body: { ok: false, error: 'stripe_down' } } });
  await page.waitForTimeout(300);
  await page.click('#fare-full-search > summary');
  await page.waitForTimeout(200);
  await tap(page, '#fare-full-search [data-pay]');
  await page.waitForTimeout(250);
  await page.fill('#tName', 'Anna Keller'); await page.fill('#tEmail', 'anna@example.com');
  await page.focus('#tEmail'); await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(st.checkouts.length === 1 && st.checkouts[0].city === 'amsterdam' && !('requestId' in st.checkouts[0]), 'amsterdam (the six, Stripe concludes): Enter in the till\'s email still goes to checkout, unchanged');
  await ctx.close();
}
for (const slug of ['draft-paris', 'draft-berlin']) {
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
  check(st.posts.length === 1 && st.posts[0].city === slug.slice(6) && await page.getAttribute('#pass', 'data-state') === 'open', `${slug}: the file opens`);
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

// ── 8b · BOOM Desks (03/11/2026) → the Horizon (v1.7): the Network shows EVERY desk ──
// the desks not open as hollow dots with no arc and no link, the legend, Rome with
// its ring, the map on a phone too; "Every BOOM desk" → /desks, last
// v1.8 FLIP: the eight are live — London's map has no hollow dot and its list links Berlin and Paris; a desk not open
// (a hollow dot, a "· not open" line, never linked) keeps its pin on /london-drafts (Paris and Berlin the frozen drafts)
{
  const { ctx, page, st } = await open({ slug: 'london-drafts', width: 1440 });
  await center(page, '#network');
  await page.waitForTimeout(500);
  const offs = await page.$$eval('svg.hz circle.d.off', (cs) => cs.map((c) => ({ fill: getComputedStyle(c).fill, stroke: getComputedStyle(c).stroke })));
  check(offs.length === 2 && offs.every((o) => o.fill === 'none' && o.stroke !== 'none'), 'london-drafts 1440: two hollow dots on the map (computed fill: none) — the draft Berlin and Paris, not open', JSON.stringify(offs));
  check(await page.$$eval('ul.net li.off', (ls) => ls.map((l) => l.textContent.trim()).join('|')) === 'BER Berlin · not open|PAR Paris · not open' && await page.$$eval('ul.net li.off a, a[href="/paris"], a[href="/berlin"]', (a) => a.length) === 0,
    'london-drafts 1440: the draft Berlin and Paris are named "not open" in the list, never linked');
  check(st.errors.length === 0, 'london-drafts 1440: no JS error', st.errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page, st } = await open({ slug: 'london', width: 1440 });
  await center(page, '#network');
  await page.waitForTimeout(500);
  const offs = await page.$$eval('svg.hz circle.d.off', (cs) => cs.length);
  check(offs === 0 && await page.$$eval('ul.net li.off', (ls) => ls.length) === 0 && await page.$$eval('ul.net a[href="/paris"], ul.net a[href="/berlin"]', (a) => a.length) === 2,
    'london 1440: no hollow dot and no "not open" line since the flip — Berlin and Paris are linked in the list', JSON.stringify({ offs }));
  check(await page.$eval('svg.hz circle.hub-r', (c) => getComputedStyle(c).fill === 'none' && getComputedStyle(c).stroke !== 'none'), 'london 1440: Rome wears its ring');
  check(await shown(page, '.net-k') && await page.$eval('.net-k', (e) => getComputedStyle(e).display) === 'flex' && /live desk.*not open.*Rome, the hub/.test(await text(page, '.net-k')), 'london 1440: the legend is shown — live desk · not open · Rome, the hub');
  const mapR = await rect(page, 'svg.hz'), keyR = await rect(page, '.net-k'), ulR = await rect(page, 'ul.net');
  check(keyR.top >= mapR.bottom - 1 && keyR.left < mapR.left + 2 && ulR.left >= mapR.right - 1 && ulR.top < keyR.top, 'london 1440: the legend sits under the map, the list beside them (one grid)', JSON.stringify({ mapR, keyR, ulR }));
  // the script, loaded on view: the night drawn, the two script-only key entries revealed
  await page.waitForTimeout(600);
  const alive = await page.evaluate(() => ({ map: !!window.BOOM_MAP, img: !!document.querySelector('svg.hz .hz-nite image[href^="data:image/png"]'), term: !!document.querySelector('svg.hz .hz-nite path.hz-term'), keys: [...document.querySelectorAll('.net-k .k-x')].map((k) => k.hidden).join() }));
  check(alive.map && alive.img && alive.term && alive.keys === 'false,false', 'london 1440: once in view the script draws the night (an image under a terminator line) and reveals "open now · night, now" in the key', JSON.stringify(alive));
  check(st.errors.length === 0, 'london 1440: no JS error', st.errors.join(' | '));
  await ctx.close();
}
// v1.7: the map is shown on a phone too (v1.6 hid it under 640px), as wide as the column; its script arrives on view
{
  const { ctx, page } = await open({ slug: 'london', width: 390 });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => !!window.BOOM_MAP);
  await center(page, '#network');
  await page.waitForTimeout(700);
  const r = await rect(page, 'svg.hz');
  check(await shown(page, '.net-k') && await shown(page, 'svg.hz') && Math.abs(r.w - 358) <= 1 && r.h > 150 && await noHScroll(page), `london 390: the map AND the legend are shown on a phone (map ${Math.round(r.w)}×${Math.round(r.h)}, the column's width)`);
  check(!before && await page.evaluate(() => !!window.BOOM_MAP), 'london 390: the map\'s script is not loaded at the top of the page; it arrives when the map nears the screen');
  await ctx.close();
}
// the planes: once on first view, 260ms apart, each on its own arc; again on a Network line's focus; never two on one arc
{
  const { ctx, page, st } = await open({ slug: 'london', width: 1440, pwClock: '2027-03-01T09:00:00Z' });
  // the installed clock also ticks in real time: paused here, only runFor moves the planes (the script, its observer and the CSS transitions still run on real time)
  await page.clock.pauseAt(new Date('2027-03-01T09:00:10Z'));
  check(await page.$$eval('g.hz-pl', (x) => x.length) === 0 && await page.$eval('svg.hz .hz-nite', (g) => g.children.length) === 0, 'london 1440: before the map is in view, no plane and no night');
  await center(page, '#network');
  await page.waitForTimeout(600);
  const vis = () => page.$$eval('g.hz-pl', (gs) => gs.filter((g) => +g.getAttribute('opacity') > 0).length);
  const n0 = await page.$$eval('g.hz-pl', (x) => x.length);
  await page.clock.runFor(200);
  const v1 = await vis();
  await page.clock.runFor(520);
  const v2 = await vis();
  // the exact counts (1, then 3) hold on an idle machine; under a starved suite the observer fires late against the paused clock, so the pin is the progression: some but not all after 200ms, more after 720ms (the 260ms stagger itself is read from the source in run.mjs)
  // v1.8 FLIP: six planes and six glows moved to eight (Paris and Berlin are live sisters with their arc)
  check(n0 === 8 && v1 >= 1 && v1 < 8 && v2 > v1, `london 1440: on first view eight planes leave Rome one after the other (visible after 200ms: ${v1}, after 720ms: ${v2})`, JSON.stringify({ n0, v1, v2 }));
  const glow = await page.$$eval('svg.hz g.dk.on', (x) => x.length);
  check(glow === 8, `london 1440 (Monday 10:00 Rome): the eight live desks glow — open now (${glow})`);
  await page.clock.runFor(5000);
  const after = await page.evaluate(() => ({ planes: document.querySelectorAll('g.hz-pl').length, drawn: [...document.querySelectorAll('svg.hz .arc')].every((a) => a.style.strokeDashoffset === '0' || a.style.strokeDashoffset === '') }));
  check(after.planes === 0 && after.drawn, 'london 1440: every plane has landed and every arc is fully drawn', JSON.stringify(after));
  await page.focus('ul.net a[href="/barcelona"]');
  await page.clock.runFor(300);
  // the stroke's .2s transition runs on the real clock: wait for it (a starved suite can take longer than the transition)
  const hi = await page.waitForFunction(() => { const a = document.querySelector('svg.hz .arc[data-k="bcn"]'); return a && a.classList.contains('hi') && getComputedStyle(a).stroke === 'rgb(255, 215, 0)'; }, null, { timeout: 4000 }).then(() => true).catch(() => false);
  const f1 = await page.$$eval('g.hz-pl', (x) => x.length);
  await page.hover('ul.net a[href="/barcelona"]');
  await page.clock.runFor(300);
  const f2 = await page.$$eval('g.hz-pl', (x) => x.length);
  await page.clock.runFor(5000);
  const f3 = await page.$$eval('g.hz-pl', (x) => x.length);
  check(f1 === 1 && hi && f2 === 1 && f3 === 0, `london 1440: focusing the Barcelona line flies ONE plane along its arc, lit gold; hovering it meanwhile adds no second one (${f1} → ${f2} → ${f3})`);
  check(st.errors.length === 0, 'london 1440 planes: no JS error', st.errors.join(' | '));
  await ctx.close();
}
// reduced motion: no plane on view nor on focus, no arc drawn in; the night is still drawn (a fact of the hour, not motion)
{
  const { ctx, page } = await open({ slug: 'london', width: 1440, reducedMotion: 'reduce', pwClock: '2027-03-01T17:30:00Z' });
  await center(page, '#network');
  await page.waitForTimeout(500);
  await page.clock.runFor(1500);
  await page.focus('ul.net a[href="/barcelona"]');
  await page.clock.runFor(800);
  const g = await page.evaluate(() => ({ planes: document.querySelectorAll('g.hz-pl').length, dashed: [...document.querySelectorAll('svg.hz .arc')].some((a) => a.style.strokeDasharray), night: !!document.querySelector('svg.hz .hz-nite image'), term: /^M[\d.]+ [\d.]+L/.test((document.querySelector('svg.hz .hz-term') || { getAttribute: () => '' }).getAttribute('d') || ''), inf: document.getAnimations().filter((x) => x.effect && x.effect.getTiming().iterations === Infinity).length }));
  check(g.planes === 0 && !g.dashed && g.night && g.term && g.inf === 0, 'london 1440, reduced motion (a March dusk): no plane on view nor on focus, no arc drawn in, no loop — the night veil and the terminator still drawn', JSON.stringify(g));
  await ctx.close();
}
{
  const { ctx, page } = await open({ slug: 'milan', width: 320, height: 568 });
  await center(page, 'ul.net li.all a');
  await page.waitForTimeout(300);
  const all = await rect(page, 'ul.net li.all a');
  check(all.h >= 44 && await page.getAttribute('ul.net li.all a', 'href') === '/desks' && await text(page, 'ul.net li.all a') === 'ALL Every BOOM desk', `milan 320: "ALL · Every BOOM desk" is a ${Math.round(all.h)} px target linking /desks`);
  // v1.8 FLIP: Milan's list has no "not open" line since the flip (the rhythm is pinned on /milan-drafts, below)
  check(await page.$$eval('ul.net li', (ls) => ls[ls.length - 1].classList.contains('all')) && await page.$$eval('ul.net li.off', (ls) => ls.length) === 0 && await noHScroll(page), 'milan 320: the "all" line is last; no "not open" line; no horizontal scroll');
  check(/^Operated by Egidi Immobiliare S\.r\.l\., an Italian real estate agency, under the same Italian law as in Rome · /.test(await text(page, '.proof')), 'milan: the proof line says the home-country desk');
  await ctx.close();
}
{
  const { ctx, page } = await open({ slug: 'milan-drafts', width: 320, height: 568 });
  await center(page, 'ul.net li.all a');
  await page.waitForTimeout(300);
  check(await page.$$eval('ul.net li', (ls) => ls[ls.length - 1].classList.contains('all')) && (await rect(page, 'ul.net li.off')).h >= 44 && await noHScroll(page), 'milan-drafts 320: the "all" line is last; a "not open" line keeps the 48 px rhythm; no horizontal scroll');
  await ctx.close();
}

// ── 9 · v1.6 «the complete aviation desk» ────────────────────────────────
const SLUGS7 = ['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia', 'paris', 'berlin'];
const OPEN_T = '2026-11-03T10:00:00Z';    // a Tuesday: London 10:00 GMT, Amsterdam 11:00 CET — every desk open
const SAT_T = '2026-10-31T09:00:00Z';     // a Saturday: every desk closed, next open Monday
// the words a reader SEES on the first screen: text nodes inside the viewport,
// not aria-hidden, not screen-reader-only, not in a hidden or closed box
const firstScreenWords = (page) => page.evaluate(() => {
  const W = innerWidth, H = innerHeight;
  let n = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode, el = t.parentElement;
    // a closed <details> shows its summary only (Chromium keeps the rest laid out, content-visibility: hidden)
    if (!el || !t.textContent.trim() || el.closest('[aria-hidden="true"],script,style,noscript,.sr,[hidden],template,details:not([open]) > :not(summary)')) continue;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = document.createRange(); r.selectNodeContents(t);
    if (![...r.getClientRects()].some((q) => q.width > 0 && q.bottom > 0 && q.top < H && q.right > 0 && q.left < W)) continue;
    n += t.textContent.split(/\s+/).filter((w) => /[A-Za-z0-9€£]/.test(w)).length;
  }
  return n;
});
// the animations running on elements that touch the first viewport
const runningInView = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => {
  const t = a.effect && a.effect.target;
  if (!t || !t.getBoundingClientRect) return null;
  const r = t.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width + r.height > 0 ? `${t.id || t.className || t.tagName}${a.effect.pseudoElement || ''}:${a.animationName || a.transitionProperty || 'anim'}` : null;
}).filter(Boolean));
const infinite = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations === Infinity)
  .map((a) => `${(a.effect.target && (a.effect.target.id || a.effect.target.className)) || '?'}:${a.animationName || ''}`));
// a Departures status board: the cells' top halves only (the status's own
// span.st wrapper would make a document-wide ".st b" read every half)
const depWord = (page, n) => page.$eval(`#dep-${n} .st-b`, (e) => {
  const cells = e.querySelectorAll(':scope > .fc2 > .st > b');
  return (cells.length ? [...cells].map((b) => b.textContent || ' ').join('') : e.textContent).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}).catch(() => '');
const at = (page) => page.$eval('#pass', (p) => parseFloat(getComputedStyle(p).getPropertyValue('--at')));
const runShift = (page, sel) => page.$eval(sel, (run) => { const m = new DOMMatrix(getComputedStyle(run).transform); return { x: m.m41, w: run.getBoundingClientRect().width }; });
const fileOpen = async (page) => {
  await tap(page, '#door');
  await page.fill('#fName', 'Anna Keller'); await page.fill('#fContact', 'anna@example.com');
  await page.click('#door');
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'open', null, { timeout: 5000 }).catch(() => {});
};

// 1–2 · the first phone screen: ≤ 150 words, and nothing still moving after 1.6 s
for (const slug of SLUGS7) {
  const { ctx, page, st } = await open({ slug, clock: OPEN_T });
  await page.waitForTimeout(1600);
  const n = await firstScreenWords(page);
  check(n <= BUDGET.first && n >= 60, `${slug} 390×844: ${n} words on the first screen (≤ ${BUDGET.first}, BUDGET.first: the pass, not a page of copy)`);
  const moving = await runningInView(page);
  check(moving.length === 0, `${slug} 390: after 1.6 s nothing on the first screen is still animating (an open desk)`, moving.slice(0, 4).join(' | '));
  check(!(await shown(page, '.seal')) && await page.$eval('.seal', (e) => getComputedStyle(e).display === 'none') && !(await shown(page, '.lamina')), `${slug} 390: no seal, no foil band on a phone (the chip says the desk)`);
  // v1.7 (S4): the onda lives INSIDE the pass on a phone — the card's living security print, .6 open — not "no onda below 940"
  await page.waitForFunction(() => window.BOOM_ONDA && document.getElementById('onda').style.opacity !== '', null, { timeout: 8000 }).catch(() => {});
  const ondaIn = await page.evaluate(() => { const c = document.getElementById('onda'); return { parent: c.parentNode.id, op: getComputedStyle(c).opacity, disp: getComputedStyle(c).display, run: !!(window.BOOM_ONDA && window.BOOM_ONDA.running) }; });
  check(await page.$eval('#clocks', (c) => !!c.closest('#deskClocks')) && ondaIn.parent === 'pass' && ondaIn.op === '0.6' && ondaIn.disp === 'block',
    `${slug} 390: the onda lives inside the pass (#onda parent #pass, opacity .6 with the desk open); the clocks live in the Gate`, JSON.stringify(ondaIn));
  check(st.errors.length === 0, `${slug} 390: no JS error`, st.errors.join(' | '));
  await ctx.close();
}

// 3–4 · the plane and the code line follow the SERVER's state, never the page's
{
  const { ctx, page } = await open({ clock: OPEN_T });
  await page.waitForTimeout(400);
  const perf0 = (await rect(page, '.perf')).h;
  check(await at(page) === 0 && (await runShift(page, '.route-p .r-run')).x === 0, 'blank: the plane is parked at YOU (--at 0, no shift)');
  check(!/BM /.test(await text(page, '#codeLine')) && await text(page, '#codeLine') === 'BOOM · AMS · TENANT SIDE · ISSUED ROM', 'blank: the code line names the issuer only — no file code before the server\'s');
  await fileOpen(page);
  await page.waitForTimeout(1100);
  const sh = await runShift(page, '.route-p .r-run');
  check(await at(page) === 0.25 && Math.abs(sh.x - 0.25 * sh.w) <= 1, `OPEN: the plane moves to the first tick (--at .25, shifted ${sh.x.toFixed(1)} of ${sh.w.toFixed(0)} px) — by transform`);
  check((await rect(page, '.perf')).h === perf0 && perf0 === 24, `the perforation stays 24 px tall (${perf0}): the plane never moves the layout`);
  check(await text(page, '#codeLine') === `FILE ${FILE} · AMS · TENANT SIDE`, 'OPEN: the code line prints the server\'s file number');
  check(await page.$eval('#pass', (p) => p.classList.contains('struck')), 'OPEN strikes the pass (the foil flashes once)');
  await ctx.close();
}
{
  const PAID0 = { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: false, workFromLabel: '4 November 2026' } };
  const { ctx, page } = await open({ clock: OPEN_T, query: `?paid=full-search&start=0&session_id=${SID}`, paid: PAID0 });
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1100);
  check(await page.$eval('#pass', (p) => p.hasAttribute('data-hold')) && await at(page) === 0.125, 'PAID without "Start now": the plane holds before the first tick (--at .125, data-hold)');
  check(await text(page, '#codeLine') === `PAID · FILE ${FILE} · AMS`, 'PAID: the code line prints the server\'s file number');
  // the board prints the drum word (FROM 4 NOV); a screen reader hears words (v1.6 review B4)
  check(await text(page, '#dep-1-sr') === 'Status: from 4 November' && await text(page, '#depLive') === 'Step 1: from 4 November', 'PAID without "Start now": row 01 says "from 4 November" (the server\'s first working day) — in words, not the drum\'s "4 nov"', await text(page, '#dep-1-sr'));
  await ctx.close();
}

// 5 · Departures: row 01 flips to a fact only on a server event, and its flap
// waits until the board is on screen; #depLive says it once
{
  const { ctx, page } = await open({ clock: OPEN_T });
  await page.waitForTimeout(300);
  await center(page, '.dep');
  await page.waitForTimeout(1900);
  check(await depWord(page, 1) === 'FREE' && await depWord(page, 2) === '1 WORK DAY' && await depWord(page, 3) === 'IN PERSON',
    'the Departures statuses flip in when the board comes into view: FREE · 1 WORK DAY · IN PERSON');
  await page.evaluate(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); window.__live = 0; new MutationObserver(() => { window.__live++; }).observe(document.getElementById('depLive'), { childList: true, characterData: true, subtree: true }); });
  await page.waitForTimeout(300);
  await fileOpen(page);
  await page.waitForTimeout(600);
  check(/^Status: reply today$/i.test(await text(page, '#dep-1-sr')) && await text(page, '#depLive') === 'Step 1: reply today', 'OPEN on an open desk: row 01 is REPLY TODAY for screen readers at once, and #depLive says it');
  check(await page.evaluate(() => { const r = document.querySelector('.dep').getBoundingClientRect(); return r.top > innerHeight || r.bottom < 0; }) && await depWord(page, 1) === 'FREE', 'while the board is off the screen its flap still reads FREE (the fact waits to be seen)');
  await center(page, '.dep');
  await page.waitForTimeout(1600);
  check(await depWord(page, 1) === 'REPLY TODAY', 'scrolled into view, row 01 flips to REPLY TODAY');
  check(await page.evaluate(() => window.__live) === 1, `#depLive announced once (${await page.evaluate(() => window.__live)})`);
  await ctx.close();
}
// the board keeps the drum word; the screen-reader twin says it in words (v1.6 review B4)
for (const [slug, clock, flow, want, said, what] of [
  ['amsterdam', SAT_T, 'open', 'REPLY MON', 'reply Monday', 'OPEN on a Saturday: REPLY MON (the desk\'s next open day), heard as "reply Monday"'],
  ['amsterdam', OPEN_T, 'paid1', 'START TODAY', 'start today', 'PAID with "Start now" on an open desk: START TODAY'],
  ['london', SAT_T, 'paid1', 'START MON', 'start Monday', 'PAID with "Start now" on a Saturday: START MON, heard as "start Monday"'],
  // v1.8 FLIP: Paris and Berlin sell (CHECKOUT true): a file opened there is a free call to set, so row 01 is
  // REPLY <day> like the six; the waitlist's FILE OPEN keeps its pin on the frozen drafts (/draft-paris, /draft-berlin)
  ['paris', OPEN_T, 'open', 'REPLY TODAY', 'reply today', 'Paris (sells, the card at the order since 06/11): OPEN on an open desk is REPLY TODAY — the free call'],
  ['berlin', SAT_T, 'open', 'REPLY MON', 'reply Monday', 'Berlin on a Saturday: REPLY MON (the desk\'s next open day)'],
  ['draft-paris', OPEN_T, 'open', 'FILE OPEN', 'file open', 'the frozen draft Paris (a desk still opening): FILE OPEN — never a reply day'],
  ['draft-berlin', SAT_T, 'open', 'FILE OPEN', 'file open', 'the frozen draft Berlin on a Saturday: FILE OPEN']]) {
  const PAID1 = { status: 200, body: { ok: true, paid: true, plan: 'application-pack', file: FILE, startNow: true } };
  const { ctx, page } = await open({ slug, clock, ...(flow === 'paid1' ? { query: `?paid=application-pack&start=1&session_id=${SID}`, paid: PAID1 } : {}) });
  await page.waitForTimeout(300);
  if (flow === 'open') await fileOpen(page);
  else await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const sr = await text(page, '#dep-1-sr');
  await center(page, '.dep');
  await page.waitForTimeout(1900);
  check(sr === `Status: ${said}` && await depWord(page, 1) === want, `${slug}: ${what}`, `${sr} / ${await depWord(page, 1)}`);
  await ctx.close();
}

// 6 · the clocks: the desk's own time, the reader's own time (never sent);
// the week: the desk's real days, a holiday "closed", never named
for (const [tz, same] of [['America/New_York', false], ['Europe/London', true]]) {
  const { ctx, page, st } = await open({ slug: 'london', clock: OPEN_T, tz, width: 1440 });
  await page.waitForTimeout(800);
  const desk = await text(page, '#ckDeskSr'), you = await text(page, '#ckYou');
  // the clock is labelled by its zone ("London time"), never "At the desk" (every desk answers from Rome — v1.6 review money F5)
  check(desk === 'London time: 10:00 GMT' && (same ? you === 'Same time as you' : you === '05:00') && !/At the desk/.test(await page.$eval('#clocks', (c) => c.textContent)),
    `the clocks with the reader in ${tz}: "${desk}" and "${you}"${same ? ' (same zone: said, not repeated)' : ' (computed here)'}`);
  const yr = await page.$eval('#ckYou', (n) => ({ same: n.classList.contains('same'), h: n.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(n).lineHeight) || 0 }));
  check(yr.same === same && (!same || yr.h <= yr.lh * 1.5), `#ckYou${same ? '.same: "Same time as you" set small, on one line' : ' carries no .same'} (${Math.round(yr.h)} px, line ${Math.round(yr.lh)} px)`, JSON.stringify(yr));
  check(await shown(page, '#clocks') && await page.$eval('#clocks', (c) => !!c.closest('#stubGate')), '1440: the ONE clocks node sits in the stub\'s gate');
  check(st.posts.length === 0 && st.gets.length === 0, 'the reader\'s time is never sent anywhere');
  await ctx.close();
}
for (const [slug, clock, day, label] of [['amsterdam', '2026-04-25T10:00:00Z', 'Monday 27', 'Koningsdag'], ['london', '2026-08-29T10:00:00Z', 'Monday 31', 'the summer bank holiday']]) {
  const { ctx, page } = await open({ slug, clock });
  await page.waitForTimeout(400);
  const wk = await page.$$eval('#week li', (ls) => ls.map((l) => ({ c: l.className, a: l.getAttribute('aria-label'), t: l.textContent, cur: l.getAttribute('aria-current') })));
  const hol = wk.find((x) => x.a && x.a.startsWith(day + ','));
  const tue = wk[3];
  check(await shown(page, '#week') && wk.length === 7 && wk[0].cur === 'date' && wk.slice(1).every((x) => !x.cur), `${slug}: the week strip shows seven days from today, today marked (aria-current=date)`);
  check(hol && /closed/.test(hol.c) && hol.a === `${day}, desk closed` && /closed$/.test(hol.t) && tue && /open/.test(tue.c) && /desk open/.test(tue.a),
    `${slug}: ${label} (${day}) reads "closed" and the next day is open`, JSON.stringify(hol));
  check(!/Koning|King|bank|holiday|Pasqua|Easter/i.test(await page.$eval('#week', (w) => w.textContent + ' ' + [...w.children].map((l) => l.getAttribute('aria-label')).join(' '))), `${slug}: no holiday is named on the strip — only "closed"`);
  await ctx.close();
}

// 7 · every [data-gate] node says the same window line as [data-window]
for (const [slug, clock] of [['amsterdam', SAT_T], ['london', OPEN_T], ['paris', OPEN_T]]) {
  const { ctx, page } = await open({ slug, clock });
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => {
    const bare = document.querySelector('.strip [data-window]').textContent.trim();
    return { bare, bad: [...document.querySelectorAll('[data-gate]')].filter((n) => n.textContent.trim() !== n.getAttribute('data-gate').replace('{w}', bare)).map((n) => n.textContent), n: document.querySelectorAll('[data-gate]').length };
  });
  check(g.n >= 4 && g.bad.length === 0 && !/Rome time/.test(g.bare), `${slug}: the ${g.n} [data-gate] nodes say the door's window line ("${g.bare}")`, g.bad.join(' | '));
  await ctx.close();
}

// 8 · the header at 1440: the chip at the top, the door's gold twin once no
// door is on screen; the wayfinding follows the reader; at 390 nothing sticks
{
  const { ctx, page, st } = await open({ width: 1440, clock: OPEN_T });
  await page.waitForTimeout(500);
  check(!(await shown(page, '#topGo')) && await shown(page, '#topChip') && await page.$eval('header.top', (h) => getComputedStyle(h).position === 'sticky'), '1440 at the top: the header is sticky, the desk chip shows, the gold twin is not there yet');
  await page.evaluate(() => document.getElementById('checks').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(600);
  check(await shown(page, '#topGo') && !(await shown(page, '#topChip')) && await text(page, '#topGo b') === 'Start with a free call' && await page.$eval('header.top', (h) => h.getBoundingClientRect().top === 0),
    'past the doors: the header\'s gold twin takes the chip\'s slot, reading door.label, and the header stays at the top');
  const tg = await page.$$eval('#topGo, .wayf a', (es) => es.filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim().slice(0, 14), h: e.getBoundingClientRect().height })).filter((x) => x.h < 44));
  check(tg.length === 0, '1440: the twin and every wayfinding link are ≥ 44 px tall', JSON.stringify(tg));
  await page.evaluate(() => { const p = document.getElementById('papers'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - innerHeight * 0.2, left: 0, behavior: 'instant' }); });
  await page.waitForTimeout(400);
  check(await page.$$eval('.wayf a[aria-current="location"]', (a) => a.map((x) => x.getAttribute('href')).join()) === '#papers', 'the wayfinding marks the section in view (#papers, aria-current="location")');
  await page.click('#topGo');
  await page.waitForTimeout(700);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'fName'), 'the twin takes the reader to the free door, the name focused');
  await page.fill('#fName', 'Anna Keller'); await page.fill('#fContact', 'anna@example.com');
  await page.click('#door');
  await page.waitForTimeout(700);
  check(st.posts.length === 1 && await page.getAttribute('#pass', 'data-state') === 'open', 'one POST, the file opens');
  await page.evaluate(() => document.getElementById('checks').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  check(!(await shown(page, '#topGo')) && !(await shown(page, '#deskGo')), 'after OPEN no twin offers a second door (header or Gate)');
  await ctx.close();
}
{
  const { ctx, page } = await open({ clock: OPEN_T });
  await page.waitForTimeout(300);
  check(await page.$eval('header.top', (h) => !['sticky', 'fixed'].includes(getComputedStyle(h).position)), '390: the header is not sticky (the strip is the phone\'s twin)');
  await page.evaluate(() => scrollTo({ top: 1500, left: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);
  check(await page.$eval('header.top', (h) => h.getBoundingClientRect().bottom <= 0) && !(await shown(page, '#topGo')), '390: scrolled, the header has left the screen; no header twin on a phone');
  // 9 · the Gate's outlined door: on screen it switches the strip off; a tap opens the free door
  await center(page, '#deskGo');
  await page.waitForTimeout(500);
  check(await shown(page, '#deskGo') && await text(page, '#deskGo b') === 'Start with a free call' && !(await page.$eval('#strip', (s) => s.classList.contains('on'))), 'the Gate\'s outlined door reads door.label, and while it is on screen the strip stays off');
  await page.evaluate(() => document.getElementById('faq').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  check(await page.$eval('#strip', (s) => s.classList.contains('on')), '(with both doors off the screen the strip is back)');
  await center(page, '#deskGo');
  await page.waitForTimeout(300);
  await page.click('#deskGo');
  await page.waitForTimeout(700);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'fName') && await shown(page, '#fFields'), '#deskGo takes the reader to the free door, the name focused');
  const bag = await page.$eval('#papers', (p) => ({ inputs: p.querySelectorAll('input, [role="checkbox"], meter, progress, details').length, tags: p.querySelectorAll('li.tag').length, h: p.querySelector('h2').textContent }));
  check(bag.inputs === 0 && bag.tags === 8 && bag.h === 'The papers a Dutch landlord asks for.', 'Baggage: eight static tags, no input, no checkbox, no meter, no fold');
  await ctx.close();
}

// 9b · v1.7 (S4) the onda's facts: OPEN, PAID and a fare opened pulse the field ONCE from where they
// happen; a PAID that confirms before the engine loads is queued and fires when it does; nothing
// under reduced motion; crossing 940 moves the one canvas between the pass and the body
{
  // a setter trap on window.BOOM_ONDA wraps pulse() the moment the engine installs itself
  const trap = () => {
    window.__pulses = [];
    Object.defineProperty(window, 'BOOM_ONDA', { configurable: true, get() { return undefined; }, set(v) {
      const p = v.pulse; v.pulse = function (n, s, ms) { window.__pulses.push(s + ':' + (n && n.className || '?')); return p.apply(this, arguments); };
      Object.defineProperty(window, 'BOOM_ONDA', { value: v, writable: true, configurable: true });
    } });
  };
  const pulses = (page) => page.evaluate(() => window.__pulses || []);
  {
    const { ctx, page, st } = await open({ slug: 'london', clock: SAT_T, init: trap });
    await page.waitForFunction(() => window.BOOM_ONDA, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    check(await page.evaluate(() => ({ r: window.BOOM_ONDA.running, op: getComputedStyle(document.getElementById('onda')).opacity })).then((o) => !o.r && o.op === '0.36'), 'london 390, Saturday: the onda in the pass is one dim still frame (opacity .36, not running)');
    await tap(page, '#fare-full-search summary');
    await page.waitForTimeout(500);
    check((await pulses(page)).join() === 's:f-price', `a fare opened: ONE small pulse from its price (${(await pulses(page)).join()})`);
    check(await page.evaluate(() => window.BOOM_ONDA.running), 'a fact on a closed desk runs its wave');
    await fileOpen(page);
    await page.waitForTimeout(600);
    const after = await pulses(page);
    check(after.filter((x) => x.startsWith('l:')).length === 1 && /^l:stamp/.test(after[after.length - 1]), `OPEN: ONE strong pulse from the OPEN stamp (${after.join(' · ')})`);
    // the OPEN wave (2.4 s × life ≤ 1.4, after the stamp's 220 ms) and its row cascade, then the glow's decay
    await page.waitForFunction(() => !window.BOOM_ONDA.running, null, { timeout: 9000 }).catch(() => {});
    check(await page.evaluate(() => !window.BOOM_ONDA.running), 'and the closed desk rests again on its still frame once the wave is spent');
    check(st.errors.length === 0, 'the facts on a closed desk: no JS error', st.errors.join(' | '));
    await ctx.close();
  }
  {
    // the paid return confirms (GET ?paid → paid:true) BEFORE the engine arrives: the pulse waits for it
    const { ctx, page, st } = await open({ slug: 'london', clock: SAT_T, init: trap, query: `?paid=full-search&start=1&session_id=${SID}`, paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: true } } });
    await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 8000 }).catch(() => {});
    const early = await page.evaluate(() => !!window.BOOM_ONDA);
    await page.waitForFunction(() => window.BOOM_ONDA && (window.__pulses || []).length, null, { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(400);
    const pp = await pulses(page);
    check(pp.filter((x) => x.startsWith('p:')).length === 1 && /^p:stamp/.test(pp[0]) && await page.evaluate(() => window.BOOM_ONDA.running),
      `PAID: ONE doubled pulse from the PAID stamp${early ? '' : ', queued until the engine loaded'} (${pp.join(' · ')})`);
    check(st.errors.length === 0, 'the PAID pulse: no JS error', st.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, st } = await open({ slug: 'london', clock: OPEN_T, init: trap, reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.BOOM_ONDA, null, { timeout: 8000 }).catch(() => {});
    await tap(page, '#fare-full-search summary');
    await fileOpen(page);
    await page.waitForTimeout(700);
    check(await page.evaluate(() => !window.BOOM_ONDA.running) && (await pulses(page)).length === 2, 'reduced motion: a fare opened and OPEN never set the field in motion (one still frame)');
    check(st.errors.length === 0, 'reduced motion facts: no JS error', st.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, st } = await open({ slug: 'london', clock: OPEN_T });
    await page.waitForFunction(() => window.BOOM_ONDA && window.BOOM_ONDA.running, null, { timeout: 8000 }).catch(() => {});
    const parentOf = () => page.evaluate(() => document.getElementById('onda').parentNode.id || document.getElementById('onda').parentNode.tagName);
    const a = await parentOf();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(700);
    const b = await parentOf(), bw = await page.evaluate(() => document.getElementById('onda').width);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    const c = await parentOf(), cw = await page.evaluate(() => document.getElementById('onda').width);
    check(a === 'pass' && b === 'BODY' && c === 'pass' && bw >= 1440 && cw < 400 && await page.evaluate(() => window.BOOM_ONDA.running),
      `crossing 940 both ways moves the one canvas (pass → body ${bw}px wide → pass ${cw}px) and re-measures it; still running`, [a, b, c, bw, cw].join());
    check(st.errors.length === 0, 'crossing 940: no JS error', st.errors.join(' | '));
    await ctx.close();
  }
}

// 10 · the loops: only while the desk is open; never with reduced motion
{
  const { ctx, page, st } = await open({ width: 1440, clock: OPEN_T });
  await page.waitForTimeout(4000);
  const inf = await infinite(page);
  const onda = await page.evaluate(() => !!(window.BOOM_ONDA && window.BOOM_ONDA.running));
  check(inf.length <= 1 && onda === true && await page.evaluate(() => document.documentElement.getAttribute('data-desk')) === 'open',
    `1440, desk open: the onda runs and at most one CSS loop (the gate dot): ${inf.join(', ') || 'none'}`);
  check(await page.$eval('.seal', (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 80) && await shown(page, '.lamina'), '1440: the issuer seal and the foil band are drawn');
  check(st.errors.length === 0, '1440 open: no JS error', st.errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page } = await open({ width: 1440, clock: SAT_T });
  await page.waitForTimeout(4000);
  const inf = await infinite(page);
  check(inf.length === 0 && await page.evaluate(() => window.BOOM_ONDA ? window.BOOM_ONDA.running === false : null) === true && await page.evaluate(() => document.documentElement.getAttribute('data-desk')) === 'closed',
    `1440, desk closed (Saturday): nothing loops — no CSS loop, the onda stopped after one dim frame`, inf.join(', '));
  await ctx.close();
}
{
  const { ctx, page } = await open({ width: 1440, clock: OPEN_T, reducedMotion: 'reduce' });
  await page.waitForTimeout(3500);
  const run = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${(a.effect.target && (a.effect.target.id || a.effect.target.className)) || '?'}:${a.animationName || a.transitionProperty || ''}`));
  check(run.length === 0 && await page.evaluate(() => !window.BOOM_ONDA || window.BOOM_ONDA.running === false), 'reduced motion, desk open: no animation running after load, the onda never loops', run.slice(0, 4).join(', '));
  check(await boardWord(page, '#placeBoard') === 'AMSTERDAM', 'reduced motion: the board set at once');
  await ctx.close();
}

// the desktop pass: the stub full to the bottom, the clocks in its gate
// without growing it, the board inside the main column
for (const [w, h] of [[1440, 900], [1024, 800], [940, 800]]) {
  for (const slug of ['amsterdam', 'barcelona']) {
    const { ctx, page } = await open({ slug, width: w, height: h, clock: OPEN_T });
    await page.waitForTimeout(1700);
    const fit = await page.evaluate(() => { const b = document.getElementById('placeBoard').getBoundingClientRect(), m = document.querySelector('.p-main').getBoundingClientRect(); return { b: Math.round(b.right), m: Math.round(m.right), l: b.left >= m.left - 1 }; });
    check(fit.l && fit.b <= fit.m + 1, `${slug} ${w}: the city board (${slug.toUpperCase()}) fits inside the pass's main column (${fit.b} ≤ ${fit.m})`);
    if (w === 1440 && slug === 'amsterdam') {
      const foot = async () => page.evaluate(() => document.querySelector('.pass').getBoundingClientRect().bottom - document.querySelector('.stub-foot').getBoundingClientRect().bottom);
      const g0 = await foot();
      const withClocks = (await rect(page, '#pass')).h;
      await page.$eval('#clocks', (c) => { c.hidden = true; });
      const without = (await rect(page, '#pass')).h;
      await page.$eval('#clocks', (c) => { c.hidden = false; });
      check(g0 >= 0 && g0 <= 40, `1440: the stub foot (barcode, code line) sits at the bottom of the pass (${g0.toFixed(0)} px from its edge)`);
      check(Math.abs(withClocks - without) < 1, `1440: the clocks land in the stub's empty space — the pass is ${without.toFixed(0)} px with or without them`);
      await page.click('#fare-full-search > summary');
      await page.waitForTimeout(400);
      const g1 = await foot();
      check(g1 >= 0 && g1 <= 40, `1440, Full Search open: the stub foot follows the pass to its bottom (${g1.toFixed(0)} px)`);
    }
    await ctx.close();
  }
}

// 11 · the waitlists: one label, four doors, no pay control, no "call"
// v1.8 FLIP: the waitlist pins run on the frozen drafts; live Paris and Berlin read the selling desks' door and, since
// the card flip (06/11), the six's pay buttons
for (const slug of ['paris', 'berlin']) {
  const { ctx, page } = await open({ slug, width: 1440, clock: OPEN_T });
  await page.waitForTimeout(500);
  const labels = await page.$$eval('#topGo b, #deskGo b, #doorL, #stripGo', (es) => es.map((e) => e.textContent.trim()));
  const pays = await page.$$eval('[data-pay]', (b) => b.map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
  check(labels.length === 4 && labels.every((x) => x === 'Start with a free call') && pays.length === 3 && pays.every((x) => /^Pay and start · €(500|199|149)/.test(x)),
    `${slug} (card at the order): #topGo, #deskGo, the door and the strip read "Start with a free call"; the three tickets read "Pay and start"`, JSON.stringify([labels, pays]));
  await ctx.close();
}
for (const slug of ['draft-paris', 'draft-berlin']) {
  const { ctx, page } = await open({ slug, width: 1440, clock: OPEN_T });
  await page.waitForTimeout(500);
  const labels = await page.$$eval('#topGo b, #deskGo b, #doorL, #stripGo', (es) => es.map((e) => e.textContent.trim()));
  const body = await page.evaluate(() => document.body.innerText);
  check(labels.length === 4 && labels.every((x) => x === 'Open my file') && await page.$$eval('[data-pay]', (b) => b.length) === 0 && !/\bcall(s|ed|ing|back)?\b/i.test(body),
    `${slug}: #topGo, #deskGo, the door and the strip read "Open my file"; no pay control; no "call" in the rendered text`, JSON.stringify(labels));
  await ctx.close();
}

await hubUI();
await reviewFixes();
await v17Fixes();
await signingUI();
await finish();

// ── 12 · the v1.6 review (03/11/2026): one guard per confirmed finding ────
// Each was reproduced on the committed v1.6 before its fix (review.json); the
// guard measures the defect itself, so the fix cannot quietly come undone.
// `CITIES_UI_ONLY=review node tests/cities/ui.mjs` runs this section alone.
async function reviewFixes() {
  const R_OPEN = '2026-11-03T10:00:00Z', R_SAT = '2026-10-31T09:00:00Z';
  const LIVE5 = ['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia'];
  const dep1 = (page) => page.$eval('#dep-1 .st-b', (e) => {
    const cells = e.querySelectorAll(':scope > .fc2 > .st > b');
    return (cells.length ? [...cells].map((b) => b.textContent || ' ').join('') : e.textContent).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }).catch(() => '');
  const noSmooth = (page) => page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });

  // A1 (money F1 · visual F2 · platform PERF-1): a FRESH deep link — the Stripe
  // cancel_url is /<slug>#fares — lands below the sticky header (≥760), never under it.
  // The head-time scroll contract measured no header (no <body> yet) and wrote 0.
  for (const slug of LIVE5) {
    for (const w of [800, 1440]) {
      const { ctx, page } = await open({ slug, width: w, height: 800, query: '#fares' });
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => {
        const top = document.querySelector('header.top'), hb = top.getBoundingClientRect().bottom, f = document.querySelector('.fares-h').getBoundingClientRect();
        const at = document.elementFromPoint(f.left + 6, f.top + 4);
        return { pos: getComputedStyle(top).position, hb: Math.round(hb), top: Math.round(f.top), y: Math.round(scrollY), clear: !!at && !at.closest('header.top') };
      });
      check(m.pos === 'sticky' && m.y > 0 && m.top >= m.hb && m.clear, `${slug} ${w}: a fresh /${slug}#fares (the Stripe cancel_url) lands the fares' head below the sticky header (${m.top} ≥ ${m.hb})`, JSON.stringify(m));
      await ctx.close();
    }
  }
  {
    const { ctx, page } = await open({ slug: 'london', width: 1440, height: 800, query: '#papers' });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ hb: Math.round(document.querySelector('header.top').getBoundingClientRect().bottom), eb: Math.round(document.querySelector('#papers .eb').getBoundingClientRect().top) }));
    check(m.eb >= m.hb, `london 1440: a fresh /london#papers lands the Baggage eyebrow below the header (${m.eb} ≥ ${m.hb})`);
    await ctx.close();
  }

  // A2 (visual F1): forced colors drop the foil band; at ≥940 the pass must keep its
  // columns (it collapsed into the 28/30px tracks: a 42px-wide door spelled letter by letter)
  for (const [slug, w] of [['london', 1440], ['paris', 1440], ['barcelona', 940]]) {
    const { ctx, page } = await open({ slug, width: w, forced: true });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const wd = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width), d = document.getElementById('door').getBoundingClientRect();
      return { door: wd('#door'), doorH: Math.round(d.height), main: wd('.p-main'), stub: wd('.stub'), lamina: getComputedStyle(document.querySelector('.lamina')).display, onda: getComputedStyle(document.querySelector('.onda')).display };
    });
    check(m.door > 300 && m.doorH < 90 && m.main > 380 && m.stub >= 370 && m.lamina === 'none' && m.onda === 'none',
      `${slug} ${w}, forced colors: the pass keeps its columns — door ${m.door}×${m.doorH}, main ${m.main}, stub ${m.stub}; no foil band, no onda behind the text`, JSON.stringify(m));
    await ctx.close();
  }

  // A3 (visual F4): the CONDITIONS chip straddles the fact sheet's top edge; it never
  // covers the summary's words nor its '+', and a click on the '+' opens the sheet
  for (const slug of ['london', 'paris']) {
    for (const w of [320, 390, 1024, 1440]) {
      const { ctx, page } = await open({ slug, width: w, height: 800 });
      await noSmooth(page);
      await center(page, '#enbref-wrap');
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => {
        const chip = document.querySelector('.corner').getBoundingClientRect(), sum = document.querySelector('.sheet > summary'), sr = sum.getBoundingClientRect(), sh = document.querySelector('.sheet').getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(sum);
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const plus = { left: sr.right - 2 - 18, right: sr.right - 2, top: (sr.top + sr.bottom) / 2 - 11, bottom: (sr.top + sr.bottom) / 2 + 11 };
        return { straddles: chip.top < sh.top && chip.bottom > sh.top, overText: [...rg.getClientRects()].some((t) => hit(chip, t)), overPlus: hit(chip, plus),
          pe: getComputedStyle(document.querySelector('.corner')).pointerEvents, px: (plus.left + plus.right) / 2, py: (plus.top + plus.bottom) / 2, chip: [chip.left, chip.top, chip.right, chip.bottom].map(Math.round) };
      });
      await page.mouse.click(m.px, m.py);
      await page.waitForTimeout(200);
      const opened = await page.$eval('.sheet', (d) => d.open);
      check(m.straddles && !m.overText && !m.overPlus && m.pe === 'none' && opened,
        `${slug} ${w}: the CONDITIONS chip straddles the sheet's edge, covers neither the summary nor its '+', and a click on the '+' opens the sheet`, JSON.stringify({ ...m, opened }));
      await ctx.close();
    }
  }

  // A5 (visual F7): Full Search open at 1440 — the stub's door block rides down beside
  // the ticket under the header (no dead band, the door one glance away), and stops on
  // the foot: it never runs over the barcode, nor out of the pass
  for (const slug of ['london', 'barcelona']) {
    const { ctx, page } = await open({ slug, width: 1440, height: 900, clock: R_OPEN });
    await noSmooth(page);
    await page.waitForTimeout(500);
    await page.click('#fare-full-search > summary');
    await page.waitForTimeout(500);
    const seen = [];
    for (let y = 0; y <= 1600; y += 40) {
      await page.evaluate((v) => scrollTo({ top: v, left: 0, behavior: 'instant' }), y);
      seen.push(await page.evaluate(() => {
        const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { t: b.top, b: b.bottom }; };
        return { y: Math.round(scrollY), hb: document.querySelector('header.top').getBoundingClientRect().bottom, st: r('.stub-st'), door: r('#door'), foot: r('.stub-foot'), pass: r('#pass'), stub: r('.stub'),
          clocks: !!document.querySelector('.stub-st #clocks'), ih: innerHeight };
      }));
    }
    // riding = held under the header while the stub's own top has gone past that line
    const riding = seen.filter((s) => s.stub.t + 30 < s.st.t - 1 && s.foot.t > s.st.b + 1);
    const over = seen.filter((s) => s.st.b > s.foot.t + 0.5 || s.st.b > s.pass.b + 0.5);
    const lost = riding.filter((s) => !(s.st.t >= s.hb && s.door.t >= s.hb && s.door.b <= s.ih));
    check(riding.length >= 4 && riding.every((s) => Math.abs(s.st.t - riding[0].st.t) < 1) && !over.length && !lost.length && seen.every((s) => s.clocks),
      `${slug} 1440, Full Search open: the door block (route, door, clocks) rides under the header for ${riding.length * 40} px of scroll with the door on screen, then stops on the foot — never over it`,
      JSON.stringify(over.concat(lost).concat(riding.length < 4 ? seen.slice(0, 3) : []).slice(0, 3).map((s) => ({ y: s.y, st: [Math.round(s.st.t), Math.round(s.st.b)], foot: Math.round(s.foot.t), door: [Math.round(s.door.t), Math.round(s.door.b)] }))));
    await ctx.close();
  }

  // B1 (behaviour B1, MAJOR): the onda keeps ONE frame chain. A hidden tab parks the
  // pending frame; before the fix each hide/show added a loop (58 → 160 calls/s after 3)
  {
    const parkRaf = () => {
      const orig = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window), ids = new Map();
      let n = 0;
      window.__loops = 0; window.__frames = 0; window.__hid = false; window.__parked = [];
      // the page's frame rate, on the browser's own clock: ONE chain means one loop call per frame
      (function tick() { window.__frames++; orig(tick); })();
      window.requestAnimationFrame = (cb) => {
        const f = cb.name === 'loop' ? function loop(t) { window.__loops++; return cb(t); } : cb, id = ++n;
        ids.set(id, orig((t) => { ids.delete(id); if (window.__hid) { window.__parked.push({ id, f }); return; } f(t); }));
        return id;
      };
      window.cancelAnimationFrame = (id) => { if (ids.has(id)) { cancel(ids.get(id)); ids.delete(id); } window.__parked = window.__parked.filter((p) => p.id !== id); };
      window.__setHidden = (h) => {
        window.__hid = h;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
        if (!h) window.__parked.splice(0).forEach((x) => orig(x.f));     // a visible tab runs what it parked
      };
    };
    const { ctx, page, st } = await open({ slug: 'london', width: 1440, clock: R_OPEN, init: parkRaf });
    await page.waitForFunction(() => window.BOOM_ONDA && window.BOOM_ONDA.running, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const rate = async () => { await page.evaluate(() => { window.__loops = 0; window.__frames = 0; }); await page.waitForTimeout(1000); return page.evaluate(() => [window.__loops, window.__frames]); };
    const base0 = await rate();
    let last = [0, 0], hidden = 0;
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__setHidden(true));
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__loops = 0; });
      await page.waitForTimeout(400);
      hidden += await page.evaluate(() => window.__loops);
      await page.evaluate(() => window.__setHidden(false));
      await page.waitForTimeout(200);
      last = await rate();
    }
    // one chain = at most one loop call per frame (two chains = two per frame: 58 → 160 calls/s before the fix)
    check(base0[0] >= 10 && base0[0] <= base0[1] + 3 && last[0] >= 10 && last[0] <= last[1] + 3 && hidden === 0 && await page.evaluate(() => window.BOOM_ONDA.running),
      `1440, desk open: three tab hide/show cycles keep ONE onda frame chain — ${base0[0]} → ${last[0]} loop calls/s for ${base0[1]} → ${last[1]} frames/s, none while hidden (${hidden})`);
    check(st.errors.length === 0, 'the onda under hide/show: no JS error', st.errors.join(' | '));
    await ctx.close();
  }

  // B2 (behaviour B2): the door slid under the sticky header counts as gone — the
  // header's gold twin comes as soon as less than half the door shows below it. (At ≥940
  // the door rides in the stub's sticky block, so it goes under only where that track ends.)
  for (const [slug, w, h] of [['london', 1440, 900], ['london', 1024, 768], ['paris', 800, 900]]) {
    const { ctx, page } = await open({ slug, width: w, height: h, clock: R_OPEN });
    await noSmooth(page);
    await page.waitForTimeout(500);
    // the first scroll at which less than half the door shows below the header, found by walking down
    const yUnder = await page.evaluate(() => {
      const d = document.getElementById('door'), hdr = document.querySelector('header.top');
      for (let y = 0; y < 6000; y += 3) {
        scrollTo({ top: y, left: 0, behavior: 'instant' });
        const r = d.getBoundingClientRect(), hb = hdr.getBoundingClientRect().bottom;
        const below = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, hb)) / r.height;
        if (below > 0.05 && below < 0.45) return y;
      }
      return -1;
    });
    const at = async (y) => {
      await page.evaluate((v) => scrollTo({ top: v, left: 0, behavior: 'instant' }), y);
      await page.waitForTimeout(450);
      return page.evaluate(() => {
        const d = document.getElementById('door').getBoundingClientRect(), hb = document.querySelector('header.top').getBoundingClientRect().bottom, tg = document.getElementById('topGo');
        return { y: Math.round(scrollY), below: Math.round(100 * Math.max(0, Math.min(d.bottom, innerHeight) - Math.max(d.top, hb)) / d.height) / 100, twin: !tg.hidden && getComputedStyle(tg).visibility !== 'hidden' };
      });
    };
    const clear = await at(Math.max(0, yUnder - 140));
    const under = await at(yUnder);
    const back = await at(Math.max(0, yUnder - 140));
    check(yUnder > 0 && clear.below === 1 && !clear.twin && under.below < 0.5 && under.twin && back.below === 1 && !back.twin,
      `${slug} ${w}: the door under the sticky header (${Math.round(under.below * 100)}% showing below it) brings the gold twin; the door clear of it sends the twin away`, JSON.stringify({ clear, under, back }));
    await ctx.close();
  }

  // B4 (money F3): row 01 follows the desk clock — an OPEN file at 17:58 in London says
  // "reply today"; three minutes later the desk has closed and it says Thursday, like the pill
  {
    const { ctx, page, st } = await open({ slug: 'london', width: 1440, tz: 'Europe/London', pwClock: '2026-11-04T17:58:30Z' });
    await page.clock.runFor(500);
    await tap(page, '#door');
    await page.fill('#fName', 'Clara Hale'); await page.fill('#fContact', 'clara@example.com');
    await page.click('#door');
    await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'open', null, { timeout: 5000 }).catch(() => {});
    await page.clock.runFor(300);
    const a = { sr: await text(page, '#dep-1-sr'), pill: await text(page, '#depPillT') };
    await page.clock.runFor(3 * 60 * 1000);
    await page.waitForTimeout(200);
    await center(page, '.dep');
    // the board mounts from an IntersectionObserver, which fires on a RENDERING frame the fake clock
    // cannot advance: wait for the mount (its 500ms fill timer is then inside the next runFor), or the
    // read races a frame — green or blank by a few ms (S4: seen blank with the onda asleep at 18:01)
    await page.waitForFunction(() => document.querySelector('#dep-1 .st-b.live'), null, { timeout: 3000 }).catch(() => {});
    await page.clock.runFor(3000);
    await page.waitForTimeout(300);
    const z = { sr: await text(page, '#dep-1-sr'), live: await text(page, '#depLive'), pill: await text(page, '#depPillT'), next: await text(page, '#oNext'), word: await dep1(page) };
    check(a.sr === 'Status: reply today' && a.pill === 'DESK OPEN' && z.sr === 'Status: reply Thursday' && z.live === 'Step 1: reply Thursday' && z.word === 'REPLY THU' && z.pill === 'DESK CLOSED' && z.next === 'Tomorrow from 08:00 GMT',
      'london, an OPEN file across closing time (Wed 17:58 → 18:01 GMT): row 01 goes from "reply today" to REPLY THU, agreeing with the pill and the card', JSON.stringify({ a, z }));
    check(st.errors.length === 0, 'across closing time: no JS error', st.errors.join(' | '));
    await ctx.close();
  }

  // B6 (money F2): a desk still opening (Paris, Berlin) never says "desk open": the
  // instruments speak of replies (REPLYING / OFFLINE, "replies until 19:00 CET"); the
  // selling desks keep DESK OPEN. ("Charged only when the desk opens" is a true sentence.)
  const DESK_OPEN = /\bdesk open\b(?!s)/i;
  // v1.8 FLIP: the desks still opening are the frozen drafts now; live Paris and Berlin sell and read DESK OPEN (below)
  for (const slug of ['draft-paris', 'draft-berlin']) {
    for (const [clock, opened] of [[R_OPEN, true], [R_SAT, false]]) {
      for (const w of [1440, 390]) {
        const { ctx, page } = await open({ slug, width: w, clock });
        await page.waitForTimeout(400);
        const g = await page.evaluate(() => ({
          text: document.body.innerText,
          labels: [...document.querySelectorAll('[aria-label],[data-window],[data-gate]')].map((n) => `${n.getAttribute('aria-label') || ''} ${n.textContent}`).join(' | '),
          pill: document.getElementById('depPillT').textContent.trim(),
          gates: [...document.querySelectorAll('[data-gate]')].map((n) => n.textContent.trim()),
          week: [...document.querySelectorAll('#week li')].map((l) => l.getAttribute('aria-label'))
        }));
        const where = (g.text.match(/.{0,30}\bdesk open\b(?!s).{0,20}/i) || g.labels.match(/.{0,30}\bdesk open\b(?!s).{0,20}/i) || [''])[0];
        check(!DESK_OPEN.test(g.text) && !DESK_OPEN.test(g.labels) && g.pill === (opened ? 'REPLYING' : 'OFFLINE')
          && g.gates.length >= 4 && g.gates.every((x) => /\breplies\b/.test(x)) && g.week.length === 7 && g.week.every((x) => /, (replies 09:00–19:00|no replies)$/.test(x)),
          `${slug} ${w} ${opened ? 'Tuesday 11:00' : 'Saturday'}: no "desk open" anywhere after the JS — the pill reads ${g.pill}, the lines and the week speak of replies`, where || JSON.stringify({ pill: g.pill, gates: g.gates.slice(0, 2), week: g.week.slice(0, 2) }));
        await ctx.close();
      }
    }
  }
  for (const slug of ['london', 'paris', 'berlin']) {
    const { ctx, page } = await open({ slug, width: 1440, clock: R_OPEN });
    await page.waitForTimeout(400);
    check(await text(page, '#depPillT') === 'DESK OPEN' && DESK_OPEN.test(await page.evaluate(() => document.body.innerText)), `${slug} (a desk that sells${slug === 'london' ? '' : ', the card at the order since 06/11'}): the pill reads DESK OPEN`);
    await ctx.close();
  }
}

// ── 13 · THE HUB (/desks, BOOM Desks, 03/11/2026): every desk on one page ──
// the first phone screen, the desk clocks from the calendar (holidays
// included), no JS, 320 px, the map's pins and arcs, the rules as a table and
// as cards, reduced motion. `CITIES_UI_ONLY=hub node tests/cities/ui.mjs`
// runs this section alone.
async function hubUI() {
  const words = (page) => page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    let n = 0;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const t = tw.currentNode, el = t.parentElement;
      if (!el || !t.textContent.trim() || el.closest('[aria-hidden="true"],script,style,noscript,.sr,[hidden],template,details:not([open]) > :not(summary)')) continue;
      if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue;
      const r = document.createRange(); r.selectNodeContents(t);
      if (![...r.getClientRects()].some((q) => q.width > 0 && q.bottom > 0 && q.top < H && q.right > 0 && q.left < W)) continue;
      n += t.textContent.split(/\s+/).filter((w) => /[A-Za-z0-9€£]/.test(w)).length;
    }
    return n;
  });
  // v1.8 FLIP: eight live desks (Paris and Berlin sell, charged at signing) — the board, the clocks, the flaps, the pins
  const LIVE = ['ams', 'bcn', 'ber', 'lon', 'mad', 'mil', 'par', 'vlc'];
  const nowOf = (page) => page.$$eval('.db-r.live', (rs) => Object.fromEntries(rs.map((r) => [r.id.slice(3), r.querySelector('.db-nb').textContent.trim()])));
  const subOf = (page) => page.$$eval('.db-r.live', (rs) => Object.fromEntries(rs.map((r) => [r.id.slice(3), r.querySelector('.db-sub').textContent.trim()])));

  // 390×844: the first screen
  {
    const { ctx, page, st } = await open({ slug: 'desks', clock: '2027-03-01T09:00:00Z', init: () => { window.__beats = 0; addEventListener('boom:beat', () => { window.__beats++; }); } });
    await page.waitForTimeout(1800);
    const n = await words(page);
    check(n <= HUB_BUDGET.first && n >= 40, `desks 390×844: ${n} words on the first screen (≤ ${HUB_BUDGET.first}, HUB_BUDGET.first)`);
    const fold = 844;
    const on = await page.evaluate((ids) => ids.every((s) => { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); return r && r.bottom <= innerHeight && r.top >= 0; }), ['#h1', '.hub-lead', '.db-h', '#db-ams', '#db-bcn', '#db-lon']);
    check(on, `desks 390: the H1, the lead, the board head and the AMS, BCN and LON rows are on the first screen (${fold}px)`);
    check(await page.$eval('#hubBoard', (b) => b.classList.contains('live') && [...b.querySelectorAll(':scope > .fc2 > .st > b')].map((x) => x.textContent).join('') === 'EUROPE') && await text(page, '#h1') === 'A rental agent on your side, in Europe',
      'desks 390: EUROPE settles on its board and the H1 still reads "A rental agent on your side, in Europe"');
    check(await noHScroll(page) && st.errors.length === 0, 'desks 390: no horizontal scroll, no JS error', st.errors.join(' | '));
    await page.waitForTimeout(2600);
    // v1.7 (S4): the phone hub loads the onda too (page mode, after load when idle) and it beats from the EUROPE board
    await page.waitForFunction(() => window.BOOM_ONDA && window.BOOM_ONDA.running, null, { timeout: 8000 }).catch(() => {});
    const hubOnda = await page.evaluate(() => ({ run: !!(window.BOOM_ONDA && window.BOOM_ONDA.running), parent: document.getElementById('onda').parentNode.tagName, beats: window.__beats || 0, board: !!document.getElementById('hubBoard') }));
    check(await page.$$eval('.db-nf', (x) => x.length) === 0 && hubOnda.run && hubOnda.parent === 'BODY' && hubOnda.beats >= 1 && hubOnda.board,
      `desks 390: no DESK NOW flaps; the onda runs behind the page (a desk is open) and beats from EUROPE (${hubOnda.beats} beat)`, JSON.stringify(hubOnda));
    await ctx.close();
  }

  // the desk clocks, from the calendar the webhook reads (holidays included)
  for (const [t, want, label, extra] of [
    ['2027-03-01T09:00:00Z', { ams: 'OPEN', bcn: 'OPEN', ber: 'OPEN', lon: 'OPEN', mad: 'OPEN', mil: 'OPEN', par: 'OPEN', vlc: 'OPEN' }, 'Monday 1 March 2027, 10:00 Rome: every live desk OPEN, the pill shown', 'pill'],
    // v1.8 FLIP: Berlin's calendar is de-be — Monday 8 March 2027 is Internationaler Frauentag, a public holiday in Berlin
    ['2027-03-06T09:00:00Z', { ams: 'CLOSED', bcn: 'CLOSED', ber: 'CLOSED', lon: 'CLOSED', mad: 'CLOSED', mil: 'CLOSED', par: 'CLOSED', vlc: 'CLOSED' }, 'Saturday: every desk CLOSED, "Monday from 09:00 CET" (London 08:00 GMT; Berlin "Tuesday": 8 March is Frauentag in Berlin), the pill hidden', 'sat'],
    ['2027-04-27T08:00:00Z', { ams: 'CLOSED', bcn: 'OPEN', ber: 'OPEN', lon: 'OPEN', mad: 'OPEN', mil: 'OPEN', par: 'OPEN', vlc: 'OPEN' }, 'Koningsdag (Tuesday 27 April 2027, 10:00 Rome): Amsterdam CLOSED, the others OPEN', ''],
    ['2027-08-30T08:00:00Z', { ams: 'OPEN', bcn: 'OPEN', ber: 'OPEN', lon: 'CLOSED', mad: 'OPEN', mil: 'OPEN', par: 'OPEN', vlc: 'OPEN' }, 'the English summer bank holiday (Monday 30 August 2027, 10:00 Rome): London CLOSED', '']
  ]) {
    const { ctx, page, st } = await open({ slug: 'desks', width: 1440, pwClock: t });
    await page.clock.runFor(1500);
    const now = await nowOf(page), sub = await subOf(page), pill = await shown(page, '#hubPill');
    const clk = await page.$$eval('.db-tv[data-clk]', (cs) => cs.map((c) => c.textContent.trim()));
    let ok2 = JSON.stringify(now) === JSON.stringify(want) && clk.length === 8 && clk.every((c) => /^\d{2}:\d{2} (CET|CEST|GMT|BST)$/.test(c));
    if (extra === 'pill') ok2 = ok2 && pill && sub.ams === 'Desk open until 19:00 CET' && sub.lon === 'Desk open until 18:00 GMT' && sub.par === 'Desk open until 19:00 CET' && sub.ber === 'Desk open until 19:00 CET';
    if (extra === 'sat') ok2 = ok2 && !pill && sub.ams === 'Monday from 09:00 CET' && sub.mil === 'Monday from 09:00 CET' && sub.lon === 'Monday from 08:00 GMT' && sub.par === 'Monday from 09:00 CET' && sub.ber === 'Tuesday from 09:00 CET';
    check(ok2 && st.errors.length === 0, `desks: ${label}`, JSON.stringify({ now, sub, pill, clk, e: st.errors }));
    if (extra) {
      // DESK NOW as flaps (≥760): one 6-cell board per live desk (eight since the v1.8 flip), green ("on") only where the desk is open;
      // the onda (≥940) loops only while a desk is open — the Saturday field is one still frame
      await page.clock.runFor(3000);
      await page.waitForTimeout(400);
      await page.clock.runFor(2500);
      const fl = await page.$$eval('.db-r.live', (rs) => rs.map((r) => { const f = r.querySelector('.db-nf'); return f ? `${f.querySelectorAll('.fc2').length}${f.classList.contains('on') ? '+' : '-'}` : 'none'; }));
      const onda = await page.evaluate(() => !!(window.BOOM_ONDA && window.BOOM_ONDA.running));
      const wantFl = extra === 'pill' ? '6+,6+,6+,6+,6+,6+,6+,6+' : '6-,6-,6-,6-,6-,6-,6-,6-';
      check(fl.join() === wantFl && onda === (extra === 'pill') && await page.evaluate(() => !!window.BOOM_ONDA),
        `desks 1440: DESK NOW is a flap board per live desk (${fl.join(' ')}); the onda ${extra === 'pill' ? 'loops while desks are open' : 'is one still frame when every desk is closed'}`, JSON.stringify({ fl, onda }));
      const clk2 = await page.$$eval('.pc-t[data-clk]', (cs) => cs.map((c) => c.textContent.trim()));
      check(clk2.length === 8 && clk2.every((c) => /^\d{2}:\d{2} (CET|CEST|GMT|BST)$/.test(c)), `desks 1440: each pin card carries its desk's clock (${clk2.join(', ')})`);
    }
    await ctx.close();
  }

  // without JS: the board reads whole, the static hours, "—" where the clock would be
  {
    const { ctx, page } = await open({ slug: 'desks', width: 1440, js: false });
    const g = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('.db-r')].map((r) => r.id),
      sub: document.querySelector('#db-lon .db-sub').textContent.trim(),
      dash: getComputedStyle(document.querySelector('#db-lon .db-tv'), '::before').content,
      now: getComputedStyle(document.querySelector('#db-lon .db-nb'), '::before').content,
      over: [...document.querySelectorAll('.db-r')].some((r) => r.scrollWidth > r.clientWidth + 1),
      board: document.getElementById('hubBoard').textContent, word: getComputedStyle(document.getElementById('hubBoard'), '::before').content
    }));
    check(g.rows.length === 9 && g.sub === 'Mon–Fri 08:00–18:00, London time' && g.dash === '"—"' && g.now === '"—"' && !g.over && g.board === '' && g.word === '"EUROPE"' && await noHScroll(page),
      'desks without JS: nine rows, the static hours, "—" for the clock and the status, EUROPE drawn by CSS, nothing overflows', JSON.stringify(g));
    await ctx.close();
  }

  // 320 px: no horizontal scroll; the row links, the pins, the gates and the questions are ≥ 44 px
  {
    const { ctx, page } = await open({ slug: 'desks', width: 320, height: 568 });
    await page.waitForTimeout(600);
    const sz = await page.evaluate(() => {
      const h = (s) => [...document.querySelectorAll(s)].map((e) => Math.min(e.getBoundingClientRect().height, e.getBoundingClientRect().width));
      return { rows: h('.db-r.live, .db-r.hub'), pins: h('.pin'), gates: [...document.querySelectorAll('.hgates a')].map((e) => e.getBoundingClientRect().height), faq: [...document.querySelectorAll('#faq summary')].map((e) => e.getBoundingClientRect().height) };
    });
    const all = [...sz.rows, ...sz.pins, ...sz.gates, ...sz.faq];
    check(await noHScroll(page) && sz.rows.length === 9 && sz.pins.length === 8 && sz.gates.length === 8 && sz.faq.length === 6 && all.every((x) => x >= 44),
      `desks 320: no horizontal scroll; rows, pins, gates and questions ≥ 44 px (smallest ${Math.round(Math.min(...all))})`, JSON.stringify(sz));
    // v1.8 option (b), spec D12 — this pin moved in stage B3: it measured the closest two pins at 320 against the
    // 44px rule (44.6 px with the six; 24.2 px LON–PAR with eight live, which no 44px rule can hold). Under 600px a pin
    // is a link but not a target: the map box under it takes the tap (the nearest desk within 30px, below)
    await center(page, '#hmap');
    const pe = await page.evaluate(() => { const a = document.getElementById('pin-ams'), r = a.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { pe: getComputedStyle(a).pointerEvents, box: !!hit && !a.contains(hit) && !!hit.closest('.hmap-box'), tab: a.tabIndex, href: a.getAttribute('href') }; });
    check(pe.pe === 'none' && pe.box && pe.tab === 0 && pe.href === '/amsterdam', 'desks 320: the pins take no pointer (the map box under them takes the tap) and stay links in the tab order', JSON.stringify(pe));
    await ctx.close();
  }
  // from 600px with a mouse a pin is its own target again: the map is drawn at least HUB_MAP_PX wide (the build's
  // figure: 566 at 600, 559 at 940 — Chromium draws 582 there) and no two pins stand closer than 44 px
  for (const w of [600, 940]) {
    const { ctx, page } = await open({ slug: 'desks', width: w, height: 900 });
    await page.waitForTimeout(300);
    await center(page, '#hmap');
    await page.waitForTimeout(200);
    const g = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('a.pin')].map((a) => { const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      let m = 1e9; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) m = Math.min(m, Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]));
      const a = document.getElementById('pin-lon'), r = a.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inner: document.querySelector('.hmap-box').clientWidth, min: m, pe: getComputedStyle(a).pointerEvents, hit: !!hit && a.contains(hit) };
    });
    check(g.pe === 'auto' && g.hit && g.inner >= HUB_MAP_PX[w] && g.min >= 44,
      `desks ${w}: a pin is its own target (the map drawn ${g.inner}px, HUB_MAP_PX ${HUB_MAP_PX[w]}); the closest two pins are ${g.min.toFixed(1)}px apart (≥ 44)`, JSON.stringify(g));
    await ctx.close();
  }

  // a touch screen (or under 600px), v1.8 option (b): the map box takes the tap and docks the NEAREST desk within
  // 30 px under the map, flying its plane; a tap farther than 30 px from every pin docks nothing (and closes the
  // card); a second tap on the same desk, or a tap on its card, goes there; Escape closes the card
  {
    const { ctx, page, st } = await open({ slug: 'desks', width: 390, touch: true, pwClock: '2027-03-01T09:00:00Z' });
    await page.clock.runFor(500);
    await center(page, '#hmap');
    await page.waitForTimeout(500);
    await page.clock.runFor(6000);
    const P = await page.$$eval('a.pin', (as) => as.map((a) => { const r = a.getBoundingClientRect(); return { id: a.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
    let gap390 = 1e9, A = null, Bp = null;
    for (const a of P) for (const b of P) if (a.id < b.id) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < gap390) { gap390 = d; A = a; Bp = b; } }
    // v1.8 FLIP: the pin moved — stage B3 wrote it with six live desks (the closest pair ≥ 52 px at 390); with eight
    // live the closest pair is LON–PAR, 30.1 px at 390 (spec §8.4: under 44, which is why the map box takes the tap)
    check(Math.abs(gap390 - 30.1) <= 1 && [A.id, Bp.id].join() === 'pin-lon,pin-par' && await page.$$eval('g.hz-pl', (x) => x.length) === 0,
      `desks 390: the closest two pins are ${A.id.slice(4).toUpperCase()}–${Bp.id.slice(4).toUpperCase()}, ${gap390.toFixed(1)}px apart (LON–PAR 30.1 px with eight live, spec §8.4); the first view's planes have landed`);
    const selOf = () => page.evaluate(() => { const s = [...document.querySelectorAll('a.pin.sel')]; return s.map((x) => x.id + (x.querySelector('.pc.dock') ? '+dock' : '')).join(','); });
    const vlc = P.find((p) => p.id === 'pin-vlc');
    await page.touchscreen.tap(vlc.x, vlc.y);
    await page.clock.runFor(300);
    const docked = await page.evaluate(() => { const p = document.getElementById('pin-vlc'), pc = p.querySelector('.pc'), box = document.querySelector('.hmap-box').getBoundingClientRect(), r = pc.getBoundingClientRect(); return { sel: p.classList.contains('sel'), dock: pc.classList.contains('dock'), shown: r.width > 0 && getComputedStyle(pc).display !== 'none', under: r.top >= box.bottom && Math.abs(r.left - box.left) <= 1 && Math.abs(r.width - box.width) <= 1, clear: r.bottom <= document.querySelector('#hmap .m-legend').getBoundingClientRect().top, text: pc.textContent.replace(/\s+/g, ' ').trim(), planes: document.querySelectorAll('g.hz-pl').length, path: location.pathname }; });
    check(docked.sel && docked.dock && docked.shown && docked.under && docked.clear && /VLC Valencia · Live/.test(docked.text) && docked.planes === 1 && docked.path === '/desks', 'desks 390 (touch): a tap on the Valencia dot docks its card under the map (the key and the cards step down, nothing is covered), lights its pin and flies its plane; the page stays', JSON.stringify(docked));
    await page.keyboard.press('Escape');
    check(await page.evaluate(() => !document.getElementById('pin-vlc').classList.contains('sel') && !document.querySelector('#pin-vlc .pc').classList.contains('dock') && document.querySelector('.hmap-box').style.marginBottom === ''), 'desks 390 (touch): Escape closes the docked card and gives its room back');
    // between the closest pair, 40% of the way from the first: the nearest docks (with eight live: LON–PAR, 30.1 px)
    await page.touchscreen.tap(A.x + (Bp.x - A.x) * 0.4, A.y + (Bp.y - A.y) * 0.4);
    await page.clock.runFor(300);
    check(await selOf() === A.id + '+dock', `desks 390 (touch): a tap between ${A.id} and ${Bp.id}, ${(gap390 * 0.4).toFixed(1)}px from the first, docks the nearest (${A.id})`, await selOf());
    // 28 px off the Valencia dot, where no other pin is near: still Valencia's (within 30 px)
    const near = await page.evaluate(([v, ps]) => { const b = document.querySelector('.hmap-box').getBoundingClientRect(); for (let t = 0; t < 360; t += 15) { const x = v.x + 28 * Math.cos(t * Math.PI / 180), y = v.y + 28 * Math.sin(t * Math.PI / 180); if (x > b.left + 4 && x < b.right - 4 && y > b.top + 4 && y < b.bottom - 4 && ps.every((p) => p.id === v.id || Math.hypot(p.x - x, p.y - y) > 40)) return { x, y }; } return null; }, [vlc, P]);
    if (near) { await page.touchscreen.tap(near.x, near.y); await page.clock.runFor(300); }
    check(!!near && await selOf() === 'pin-vlc+dock', 'desks 390 (touch): a tap 28 px off the Valencia dot docks Valencia (the nearest desk within 30 px)', JSON.stringify(near));
    // farther than 30 px from every pin (31–34 px from the nearest): nothing docks, the open card closes
    const far = await page.evaluate((ps) => { const b = document.querySelector('.hmap-box').getBoundingClientRect(); for (let y = b.top + 8; y < b.bottom - 8; y += 3) for (let x = b.left + 8; x < b.right - 8; x += 3) { const m = Math.min(...ps.map((p) => Math.hypot(p.x - x, p.y - y))); if (m > 31 && m < 34) return { x, y, m }; } return null; }, P);
    if (far) { await page.touchscreen.tap(far.x, far.y); await page.clock.runFor(300); }
    check(!!far && await selOf() === '' && await page.evaluate(() => location.pathname === '/desks'), `desks 390 (touch): a tap ${far ? far.m.toFixed(1) : '?'} px from the nearest pin docks nothing and closes the card`, JSON.stringify(far));
    // the card itself goes to its desk
    await page.touchscreen.tap(vlc.x, vlc.y);
    await page.clock.runFor(300);
    const card = await page.$eval('#pin-vlc .pc.dock', (pc) => { const r = pc.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }).catch(() => null);
    await Promise.all([page.waitForURL(/\/valencia$/, { timeout: 5000 }).catch(() => {}), card ? page.touchscreen.tap(card.x, card.y) : Promise.resolve()]);
    check(!!card && /\/valencia$/.test(page.url()), 'desks 390 (touch): a tap on the docked card goes to the Valencia desk');
    check(st.errors.length === 0, 'desks 390 (touch): no JS error', st.errors.join(' | '));
    await ctx.close();
  }
  {
    // the second tap on the same desk (within 30 px of it) goes there
    const { ctx, page, st } = await open({ slug: 'desks', width: 390, touch: true, pwClock: '2027-03-01T09:00:00Z' });
    await page.clock.runFor(500);
    await center(page, '#hmap');
    await page.waitForTimeout(400);
    const lon = await page.$eval('#pin-lon', (a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(lon.x, lon.y);
    await page.clock.runFor(300);
    await Promise.all([page.waitForURL(/\/london$/, { timeout: 5000 }).catch(() => {}), page.touchscreen.tap(lon.x + 6, lon.y - 4)]);
    check(/\/london$/.test(page.url()) && st.errors.length === 0, 'desks 390 (touch): the second tap on the same desk goes to the London desk');
    await ctx.close();
  }
  {
    // the keyboard: the pins stay links, reached with Tab, ring and card shown; Enter docks, Enter again goes
    const { ctx, page } = await open({ slug: 'desks', width: 390 });
    await page.waitForTimeout(400);
    let id = '';
    for (let i = 0; i < 90 && !/^pin-/.test(id); i++) { await page.keyboard.press('Tab'); id = await page.evaluate(() => (document.activeElement && document.activeElement.id) || ''); }
    const f = await page.evaluate(() => { const a = document.activeElement; return { id: a.id, fv: a.matches(':focus-visible'), card: getComputedStyle(a.querySelector('.pc')).display }; });
    check(/^pin-/.test(f.id) && f.fv && f.card === 'block', `desks 390: a pin is reached with the keyboard (${f.id}), its ring and its card shown — the pins stay links`, JSON.stringify(f));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check(await page.evaluate((x) => { const p = document.getElementById(x); return p.classList.contains('sel') && p.querySelector('.pc').classList.contains('dock') && location.pathname === '/desks'; }, f.id), `desks 390: Enter on ${f.id} docks its card; the page stays`);
    const to = new RegExp('/' + (await page.getAttribute('#' + f.id, 'href')).slice(1) + '$');
    await Promise.all([page.waitForURL(to, { timeout: 5000 }).catch(() => {}), page.keyboard.press('Enter')]);
    check(to.test(page.url()), `desks 390: Enter again goes to the desk (${page.url().replace(base, '')})`);
    await ctx.close();
  }

  // 1440: a pin lights its arc and shows its card; pins sit on their dots; the rules are a table
  {
    const { ctx, page, st } = await open({ slug: 'desks', width: 1440, pwClock: '2027-03-01T09:00:00Z' });
    await page.clock.runFor(800);
    await center(page, '#hmap');
    await page.clock.runFor(2500);
    await page.clock.runFor(4000);   // the first view's eight planes have landed (v1.8 FLIP: eight live desks)
    const pl0 = await page.$$eval('g.hz-pl', (x) => x.length);
    const before = await page.$eval('#arc-lon', (a) => getComputedStyle(a).stroke);
    await page.hover('#pin-lon');
    await page.clock.runFor(500);
    await page.waitForTimeout(450);   // the stroke's .2s transition runs on the real clock
    const after = await page.$eval('#arc-lon', (a) => ({ stroke: getComputedStyle(a).stroke, w: getComputedStyle(a).strokeWidth }));
    const other = await page.$eval('#arc-ams', (a) => getComputedStyle(a).stroke);
    check(after.stroke === 'rgb(255, 215, 0)' && before !== after.stroke && other !== after.stroke && await shown(page, '#pin-lon .pc') && /London · Live/.test(await text(page, '#pin-lon .pc')),
      'desks 1440: hovering the London pin strokes ITS arc gold (computed) and shows its card', JSON.stringify({ before, after, other }));
    const pl1 = await page.$$eval('g.hz-pl', (x) => x.length);
    await page.clock.runFor(4000);
    const pl2 = await page.$$eval('g.hz-pl', (x) => x.length);
    check(pl0 === 0 && pl1 === 1 && pl2 === 0, `desks 1440: the hover sends ONE plane along London's arc, once (${pl0} → ${pl1} → ${pl2})`);
    const glow = await page.$$eval('svg.hz g.dk.on', (x) => x.length), keys = await page.$$eval('.m-legend .k-x', (x) => x.map((k) => k.hidden).join());
    check(glow === 8 && keys === 'false,false' && !!(await page.$('svg.hz .hz-nite image')), `desks 1440 (Monday 10:00 Rome): the eight live desks glow, the night is drawn, the key's last two entries are revealed (${glow}, ${keys})`);
    const land = await page.evaluate(() => { const r = document.querySelector('.hmap svg.hz rect.land'); return r ? r.getBoundingClientRect().width > 300 && getComputedStyle(r).clipPath !== 'none' : false; });
    check(land, 'desks 1440: the land is drawn, clipped to the coast');
    const gap = await page.evaluate(() => {
      const svg = document.querySelector('.hmap svg.hz');
      const m = svg.getScreenCTM();
      return [...document.querySelectorAll('.pin')].map((p) => {
        const r = p.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const ds = [...svg.querySelectorAll('circle.d:not(.off)')].map((c) => { const pt = new DOMPoint(+c.getAttribute('cx'), +c.getAttribute('cy')).matrixTransform(m); return Math.hypot(pt.x - cx, pt.y - cy); });
        return Math.min(...ds);
      });
    });
    check(gap.length === 8 && gap.every((x) => x <= 2), `desks 1440: every pin sits on its dot (≤ 2 px: ${gap.map((x) => x.toFixed(1)).join(', ')})`);
    check(await page.$eval('.rtab', (t) => getComputedStyle(t).display === 'table' && t.getBoundingClientRect().height > 100) && await page.$$eval('.rtab thead th', (t) => t.length) === 8,
      'desks 1440: the rules are a visible table, one column per live desk');
    check(await page.$$eval('[data-pay], dialog', (x) => x.length) === 0 && st.errors.length === 0, 'desks 1440: no pay control, no dialog, no JS error', st.errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ slug: 'desks', width: 390 });
    await center(page, '.rtab');
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => ({ table: getComputedStyle(document.querySelector('.rtab')).display, head: getComputedStyle(document.querySelector('.rtab thead')).display, k: getComputedStyle(document.querySelector('.rtab tbody td'), '::before').content }));
    check(g.table === 'block' && g.head === 'none' && g.k === '"AMS"', 'desks 390: the rules render as cards, each cell prefixed by its desk\'s code', JSON.stringify(g));
    await ctx.close();
  }
  // audit 06/11: the rules table needs about 912px for its eight columns; between 760 and 943 its last
  // columns (Paris, Valencia) were clipped by the page, unreachable. Cards up to 959px, every rule link 44px tall.
  for (const w of [700, 768, 820, 900, 959, 960, 1024]) {
    const { ctx, page } = await open({ slug: 'desks', width: w });
    await center(page, '.rtab');
    const g = await page.evaluate(() => {
      const t = document.querySelector('.rtab'), r = t.getBoundingClientRect(), p = t.parentElement.getBoundingClientRect();
      const rc = [...document.querySelectorAll('.rtab a.rc')].filter((a) => a.offsetParent).map((a) => a.getBoundingClientRect().height);
      return { disp: getComputedStyle(t).display, right: Math.round(r.right), pr: Math.round(p.right), sw: document.documentElement.scrollWidth, vw: innerWidth, minRc: rc.length ? Math.min(...rc) : 0, n: rc.length };
    });
    const cards = w <= 959;
    check(g.sw <= g.vw && g.right <= g.pr + 1 && g.disp === (cards ? 'block' : 'table') && g.n > 20 && (!cards || g.minRc >= 44),
      `desks ${w}: the rules ${cards ? 'are cards, every rule link at least 44px tall' : 'are a table'}, and no column is clipped`, JSON.stringify(g));
    await ctx.close();
  }
  // reduced motion: nothing loops after load
  {
    const { ctx, page } = await open({ slug: 'desks', width: 1440, reducedMotion: 'reduce', clock: '2027-03-01T09:00:00Z' });
    await page.waitForTimeout(800);
    const inf = await page.evaluate(() => document.getAnimations().filter((x) => x.playState === 'running' && x.effect && x.effect.getTiming().iterations === Infinity).map((x) => `${(x.effect.target && (x.effect.target.id || x.effect.target.className)) || '?'}:${x.animationName || ''}`));
    check(inf.length === 0 && await page.$eval('#hubBoard', (b) => b.classList.contains('live')), 'desks, reduced motion: EUROPE is shown at once and no infinite animation runs', inf.join(' | '));
    await center(page, '#hmap');
    await page.hover('#pin-ams');
    await page.waitForTimeout(300);
    const rmPlanes = await page.$$eval('g.hz-pl', (x) => x.length);
    await page.waitForTimeout(2200);
    check(rmPlanes === 0 && await page.$$eval('g.hz-pl', (x) => x.length) === 0 && await page.evaluate(() => !!window.BOOM_MAP && (!window.BOOM_ONDA || !window.BOOM_ONDA.running)), 'desks, reduced motion: the map script is there but no plane flies on hover, and the onda never loops');
    await ctx.close();
  }
}

// ── 14 · the v1.7 review (04/11/2026): one guard per confirmed finding ────
// `CITIES_UI_ONLY=v17 node tests/cities/ui.mjs` runs this section alone;
// CITIES_UI_SHOTS=<dir> saves the review's screenshots there.
async function v17Fixes() {
  const SHOTS = process.env.CITIES_UI_SHOTS || '';
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const shot = (page, name, opt = {}) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, name), ...opt }) : null);

  // R1 · LAU art. 20 is an order: "Optional, chosen in writing" sits above the first price, phone and desk
  for (const slug of ['madrid', 'barcelona', 'valencia']) {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const { ctx, page } = await open({ slug, width: w, height: h });
      await page.waitForTimeout(300);
      const a = await rect(page, '#faresH'), b = await rect(page, '#fare-full-search .f-price');
      check(a.bottom <= b.top && await text(page, '#faresH') === 'Optional, chosen in writing', `${slug} ${w}×${h}: "Optional, chosen in writing" is read above the €500 (LAU art. 20)`, JSON.stringify({ head: a.bottom, price: b.top }));
      await ctx.close();
    }
  }

  // R3 · forced colors: the economy tear is the standing dashed line wherever the economy tickets lie down
  {
    const tear = (page) => page.$eval('#fare-application-pack .f-r', (e) => { const s = getComputedStyle(e, '::before'); return { l: s.borderLeftStyle + ' ' + s.borderLeftWidth, t: s.borderTopStyle + ' ' + s.borderTopWidth }; });
    let x = await open({ width: 1440, forced: true });
    const lie = await tear(x.page);
    check(lie.l === 'dashed 1px', 'forced colors, 1440: the economy tear stands, a 1px dashed line on its left (not a 10px dash on top)', JSON.stringify(lie));
    await x.ctx.close();
    x = await open({ width: 390, forced: true });
    const pair = await tear(x.page);
    check(pair.t === 'dashed 1px' && /^none|0px/.test(pair.l.replace('none ', 'none')), 'forced colors, 390 pair closed: the economy tear lies across the stub (dashed top)', JSON.stringify(pair));
    await x.page.click('#fare-application-pack > summary');
    await x.page.waitForTimeout(250);
    const openPair = await tear(x.page);
    check(openPair.l === 'dashed 1px', 'forced colors, 390 with Application Pack open: the economy tickets lie down and the tear stands again (dashed left)', JSON.stringify(openPair));
    await x.ctx.close();
  }

  // R3b · forced colors at ≥940: First class (Full Search) is ONE closed frame on a waitlist desk and on a desk that sells
  // (v1.8 FLIP: the waitlist is the frozen draft Paris; live Paris, charged at signing, joins the desks that sell)
  for (const slug of ['draft-paris', 'paris', 'amsterdam']) {
    const x = await open({ slug, width: 1280, forced: true });
    const f = await x.page.$eval('.bp.eroe', (e) => { const s = getComputedStyle(e), fr = getComputedStyle(e.querySelector('.fare')); const r = e.getBoundingClientRect(), q = e.querySelector('.fare').getBoundingClientRect();
      return { b: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.borderTopStyle].join(' '), fb: fr.borderBottomWidth + ' ' + fr.borderLeftWidth, inside: q.bottom <= r.bottom + 0.5 && q.top >= r.top - 0.5 }; });
    check(f.b === '1px 1px 1px 1px solid' && f.fb === '0px 0px' && f.inside, `${slug}, forced colors at 1280: First class is one frame (the ticket's 1px border all round, no second border on the fare inside it)`, JSON.stringify(f));
    await x.ctx.close();
  }

  // R4 · the hub's heartbeat rises from the EUROPE board, inside the canvas, on a desktop
  {
    const { ctx, page, st } = await open({ slug: 'desks', width: 1440, height: 900, clock: '2027-03-01T10:00:00Z', init: () => {
      window.__beat = null;
      addEventListener('boom:beat', () => {
        if (window.__beat) return;
        const t0 = performance.now(), probe = () => {
          const cv = document.getElementById('onda'), b = document.getElementById('hubBoard');
          if (!cv || !b) return 0;
          const r = cv.getBoundingClientRect(), br = b.getBoundingClientRect(), D = cv.width / r.width;
          const cx = br.left + br.width / 2 - r.left, cy = br.top + br.height / 2 - r.top;
          const x0 = Math.max(0, Math.floor((cx - 250) * D)), y0 = Math.max(0, Math.floor((cy - 250) * D));
          const w = Math.min(cv.width - x0, Math.ceil(500 * D)), h = Math.min(cv.height - y0, Math.ceil(500 * D));
          if (w <= 0 || h <= 0) return -1;
          const px = cv.getContext('2d').getImageData(x0, y0, w, h).data;
          let n = 0;
          for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
            const dx = (x0 + x) / D - cx, dy = (y0 + y) / D - cy, k = 4 * (y * w + x);
            if (dx * dx + dy * dy <= 250 * 250 && px[k] > 180 && px[k + 1] > 130 && px[k + 2] < 90 && px[k + 3] >= 8) n++;
          }
          return n;
        };
        window.__beat = { samples: [] };
        [150, 350, 600].forEach((ms) => setTimeout(() => { window.__beat.samples.push({ ms: Math.round(performance.now() - t0), gold: probe() }); }, ms));
      });
    } });
    await page.waitForFunction(() => window.__beat && window.__beat.samples.length >= 1, null, { timeout: 15000 }).catch(() => {});
    await shot(page, 'desks-1440-beat.png');
    await page.waitForFunction(() => window.__beat && window.__beat.samples.length === 3, null, { timeout: 3000 }).catch(() => {});
    const beat = await page.evaluate(() => window.__beat);
    check(!!beat && beat.samples.some((x) => x.gold > 0), 'desks 1440: within 700 ms of a heartbeat the canvas has gold pixels within 250 px of the EUROPE board (the ring is born on screen)', JSON.stringify(beat));
    check(st.errors.length === 0, 'desks 1440 heartbeat: no JS error', st.errors.join(' | '));
    await ctx.close();
  }

  // the band a focused control must sit in to be SEEN: under the sticky header (scroll-padding-top), above the strip
  const band = (page, sel) => page.evaluate((q) => {
    const a = q ? document.querySelector(q) : document.activeElement, s = document.getElementById('strip');
    const r = a.getBoundingClientRect(), top = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const bottom = innerHeight - (s && s.classList.contains('on') ? s.offsetHeight : 0);
    return { t: Math.round(r.top), b: Math.round(r.bottom), top, bottom, in: r.top >= top - 1 && r.bottom <= bottom + 1 };
  }, sel || null);

  // R6 · the till opened from the pay button under the stub, the window shrunk below 940, Escape: the focus goes back to it,
  // and (second round, G2) the focused button is ON SCREEN — under the header, above the strip — at 390×844 and 390×664
  for (const h of [844, 664]) {
    const { ctx, page } = await open({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    check(await page.$eval('#fare-full-search', (d) => !d.open) && await page.$eval('.bp-pay [data-pay="full-search"]', () => true).catch(() => false), '1440: Full Search closed, its pay button rides under the stub');
    await tap(page, '.bp-pay [data-pay="full-search"]');
    await page.waitForTimeout(300);
    const opened = await page.$eval('#till', (d) => d.open);
    await page.setViewportSize({ width: 390, height: h });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const f = await page.evaluate(() => { const a = document.activeElement; return { pay: a && a.getAttribute('data-pay'), fs: document.getElementById('fare-full-search').open, till: document.getElementById('till').open, body: a === document.body }; });
    check(opened && f.pay === 'full-search' && f.fs === true && f.till === false, `till opened at 1440 from under the stub, window shrunk to 390×${h}, Escape: Full Search opens and the focus is back on its pay button (never <body>)`, JSON.stringify(f));
    const v = await band(page);
    check(v.in, `390×${h} after the resize and Escape: the focused pay button lies inside the visible band [${v.top}, ${v.bottom}] (WCAG 2.4.7 / 2.4.11)`, JSON.stringify(v));
    if (h === 844) await shot(page, 'till-resize-escape-390.png');
    await ctx.close();
  }

  // R7 · a link followed while the till is open does not re-target the tickets behind it; (second round, G3) the page behind
  // the modal does not move either, and after Escape the focused opener is on screen (G2's band) — at 1440 and 390
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page } = await open({ slug: 'barcelona', query: '#pay-full-search', width: w, height: h });
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => ({ till: document.getElementById('till').open, plan: document.getElementById('tillForm').getAttribute('data-plan'), fs: document.getElementById('fare-full-search').open, ap: document.getElementById('fare-application-pack').open, y: scrollY }));
    await page.evaluate(() => { location.hash = '#fare-application-pack'; });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ till: document.getElementById('till').open, plan: document.getElementById('tillForm').getAttribute('data-plan'), fs: document.getElementById('fare-full-search').open, ap: document.getElementById('fare-application-pack').open, inTill: document.getElementById('till').contains(document.activeElement), y: scrollY }));
    check(before.till && before.plan === 'full-search' && after.till && after.plan === 'full-search' && after.fs === before.fs && after.ap === before.ap && after.inTill,
      `barcelona#pay-full-search ${w}: then #fare-application-pack with the till open: the till stays on Full Search, the tickets behind do not move, the focus stays in the till`, JSON.stringify({ before, after }));
    check(Math.abs(after.y - before.y) <= 1, `barcelona ${w}: the hash change with the till open does not scroll the page behind the modal (scrollY ${before.y} → ${after.y})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const v = await band(page), pay = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-pay'));
    check(pay === 'full-search' && v.in, `barcelona ${w} after Escape: the focus is back on the Full Search pay button, inside the visible band [${v.top}, ${v.bottom}]`, JSON.stringify({ pay, v }));
    await ctx.close();
  }

  // G4 · the closed economy pair: the two tickets as tall as their row, both stubs on one line (every desk, 360 to 480 px),
  // in the page's own font AND in Arial/Helvetica metrics (Liberation Sans, the font CI renders with: at 360 'per viewing ·
  // incl. VAT' wrapped there and the stubs stood 11.7 px apart; at 430–480 Paris and Berlin had one condition on one line
  // and the other on two)
  for (const font of ['page', 'liberation']) {
    for (const slug of ['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia', 'paris', 'berlin']) {
      for (const [w, h] of [[390, 844], [360, 780], [375, 812], [430, 932], [480, 900]]) {
        const { ctx, page } = await open({ slug, width: w, height: h });
        if (font === 'liberation') await page.addStyleTag({ content: ":root{--sans:'Liberation Sans',Arial,sans-serif}" });
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => { const q = (x) => document.querySelector(x).getBoundingClientRect();
          const lines = (x) => { const c = document.querySelector(x + ' .f-cond'); return Math.round(c.getBoundingClientRect().height / parseFloat(getComputedStyle(c).lineHeight)); };
          return { ap: q('#fare-application-pack').bottom, av: q('#fare-attended-viewing').bottom, apR: q('#fare-application-pack .f-r').top, avR: q('#fare-attended-viewing .f-r').top, apT: q('#fare-application-pack').top, avT: q('#fare-attended-viewing').top, apLines: lines('#fare-application-pack'), avLines: lines('#fare-attended-viewing') }; });
        check(Math.abs(m.apT - m.avT) <= 1 && Math.abs(m.ap - m.av) <= 1 && Math.abs(m.apR - m.avR) <= 1 && m.apLines === m.avLines, `${slug} ${w}×${h} (${font} font): the closed economy pair, side by side, ends on one line, its two conditions take the same lines and its two stubs start on one line`, JSON.stringify(m));
        if (font === 'page' && w === 390 && ['london', 'valencia', 'paris', 'milan'].includes(slug)) await shot(page, `first-${slug}-390.png`);
        await ctx.close();
      }
    }
  }

  // G5 · an economy ticket lying down below 940 (a pair member open, or under 360): the price clears the pip by ≥ 4px
  for (const slug of ['london', 'valencia', 'paris']) {
    for (const w of [390, 320]) {
      const { ctx, page } = await open({ slug, width: w, height: 844 });
      await page.waitForTimeout(300);
      await tap(page, '#fare-application-pack > summary');
      await page.waitForTimeout(350);
      const gap = await page.evaluate(() => ['#fare-application-pack', '#fare-attended-viewing'].map((id) => {
        const d = document.querySelector(id), p = d.querySelector('.f-price'), rg = document.createRange(); rg.selectNodeContents(p);
        return Math.round((d.querySelector('.f-tog').getBoundingClientRect().left - rg.getBoundingClientRect().right) * 10) / 10; }));
      check(gap.every((g) => g >= 4), `${slug} ${w} with Application Pack open: the price clears the +/− pip (gaps ${gap.join(' / ')} px ≥ 4)`);
      if (slug === 'london' && w === 390) await shot(page, 'london-390-ap-open.png');
      await ctx.close();
    }
  }

  // R8 · the keyboard ring on a fare row is whole: gold on its four sides, above the stub
  {
    const ring = async (page, sel) => {
      await page.keyboard.press('Tab');
      await page.$eval(sel, (e) => { e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.focus(); });
      await page.waitForTimeout(150);
      const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), fv: e.matches(':focus-visible') }; });
      const png = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
      const sides = await page.evaluate(async ({ b64, w, h }) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
        const gold = (x, y) => { const k = 4 * (y * W + x); return d[k] > 190 && d[k + 1] > 160 && d[k + 2] < 90; };
        const band = (x, y, horiz) => [0, 1, 2, 3, 4].some((o) => horiz ? gold(x, Math.min(H - 1, Math.max(0, y + o))) : gold(Math.min(W - 1, Math.max(0, x + o)), y));
        const frac = (pts) => pts.filter(Boolean).length / Math.max(1, pts.length);
        const xs = [], ys = [];
        for (let x = 20; x < W - 20; x += 2) xs.push(x);
        for (let y = 20; y < H - 20; y += 2) ys.push(y);
        return { top: frac(xs.map((x) => band(x, 0, true))), bottom: frac(xs.map((x) => band(x, H - 5, true))), left: frac(ys.map((y) => band(0, y, false))), right: frac(ys.map((y) => band(W - 5, y, false))) };
      }, { b64: png.toString('base64'), w: r.w, h: r.h });
      return { fv: r.fv, sides };
    };
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      for (const id of ['fare-full-search', 'fare-application-pack']) {
        const { ctx, page } = await open({ width: w, height: h });
        await page.waitForTimeout(300);
        const res = await ring(page, `#${id} > summary`);
        const s = res.sides;
        await shot(page, `ring-${w}-${id}.png`);
        check(res.fv && s.top > 0.9 && s.bottom > 0.9 && s.left > 0.9 && s.right > 0.9, `${w}: the keyboard ring on #${id} is gold on all four sides (the stub no longer paints over it)`, JSON.stringify(res));
        await ctx.close();
      }
    }
    const { ctx, page } = await open({ width: 390, forced: true });
    await page.keyboard.press('Tab');
    await page.$eval('#fare-full-search > summary', (e) => e.focus());
    const fc = await page.$eval('#fare-full-search > summary', (e) => { const s = getComputedStyle(e, '::after'); return { c: s.content, b: s.borderTopStyle + ' ' + s.borderTopWidth, z: s.zIndex }; });
    check(fc.c !== 'none' && fc.b === 'solid 2px' && fc.z === '2', 'forced colors: the fare row\'s focus ring is the ::after above the stub (2px, z-index 2, Highlight)', JSON.stringify(fc));
    await ctx.close();
  }

  // R9 · the map's key says "night, now" only when a night is drawn
  for (const [clock, night] of [['2027-06-21T11:00:00Z', false], ['2027-03-01T17:30:00Z', true]]) {
    const { ctx, page } = await open({ width: 1440, height: 900, clock });
    await center(page, 'svg.hz');
    await page.waitForFunction(() => !!window.BOOM_MAP, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const k = await page.evaluate(() => [...document.querySelectorAll('.k-x')].map((x) => ({ night: !!x.querySelector('.k-n'), hidden: x.hidden })));
    const n = k.find((x) => x.night), o = k.find((x) => !x.night);
    check(!!n && !!o && n.hidden === !night && o.hidden === false, `${clock}: the "night, now" key is ${night ? 'shown (a night is drawn on the frame)' : 'hidden (the whole frame is in daylight)'}; "open now" always`, JSON.stringify(k));
    await ctx.close();
  }
}

// ── 15 · v1.8 stage B3: a desk that charges at signing (dark) ────────────
// No desk uses the shape yet: Paris is built here as tests/cities/run.mjs §14
// builds it — Amsterdam (its sentences reviewed) made into a signing Paris
// with the spec's words (spec v1.8 §4.1, §5) — with the registry flipped
// inside try/finally (spec §3.1), and served at /paris for this section only.
// The order's answer and the managed ticket's GET are the server's (A1) shapes,
// stubbed. `CITIES_UI_ONLY=signing node tests/cities/ui.mjs` runs it alone.
async function signingUI() {
  console.log('\n\x1b[1m▸ v1.8 B3\x1b[0m  a desk that charges at signing: the order, BOOKED, the managed ticket (a scratch Paris, the registry patched in try/finally)');
  const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const { CITY_MARKETS: CM } = await import('../../api/_market.js');
  const { ORDER_TERMS } = await import('../../api/_cityterms.js');
  const SLUGS = fs.readdirSync(path.join(R, 'cities')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.slice(0, -5)).sort();
  const CITY = Object.fromEntries(SLUGS.map((s) => [s, JSON.parse(read(`cities/${s}.json`))]));
  const shared = JSON.parse(read('cities/_shared.json'));
  const SIGN_RULE = 'Nothing is charged before you sign a lease, and nothing if you never do.';
  const TRIG = {
    'full-search': 'Nothing is charged before you sign the lease we helped you get, and nothing if you never do.',
    'application-pack': 'Nothing is charged unless you sign for a home you applied to with our dossier.',
    'attended-viewing': 'Nothing is charged unless you sign for the home we viewed.'
  };
  const STALE = 'This page was just updated — reload it to order with the current terms.';
  // Amsterdam made into a signing desk (the spec's shared words, design/spec.paris.json): Paris (FR) or Berlin (DE),
  // as tests/cities/run.mjs section B1 builds them. Since the card flip (06/11) no live desk charges at signing; the
  // shape stays for the orders booked before that day (the managed ticket reads it)
  const signingCity = (target) => {
    const P = target === 'paris', c = clone(CITY.amsterdam);
    Object.assign(c, { slug: target, city: P ? 'Paris' : 'Berlin', iata: P ? 'PAR' : 'BER', country: P ? 'FR' : 'DE', geo: clone(CITY[target].geo), live: false, chargeAt: 'signing' });
    c.hero.leadStrong = 'Paid only by you, and only when you sign.';
    c.hero.faresHead = { b: 'Flat fees', span: P ? 'No percentage of your rent' : 'Always within the legal cap' };
    for (const p of c.pricing.plans) { p.conditionLong = 'VAT included, charged when you sign a lease. Invoice from Egidi Immobiliare S.r.l.'; p.trigger = TRIG[p.id]; }
    c.pricing.plans[0].includes = c.pricing.plans[0].includes.map((x) => (P && /^Until you sign/.test(x) ? 'Until you sign, or you say stop (six months at most)' : !P && /\(more:/.test(x) ? 'Attended viewings included' : x));
    c.faq.items[1].a = c.faq.items[1].a.replace(/ Full Search is refunded in full[^.]*\./, ' Nothing is charged before you sign a lease.');
    c.faq.items[3].a = 'Then you pay nothing: every fare is charged only when you sign the lease we helped you get. We tell you in the first call if your budget and timeline don\'t fit the market.';
    if (!P) {
      c.bref.rows.find((r) => r.fees).ddHtml = 'Nothing from landlords or platforms, always inside the German cap.';
      c.checks.items = c.checks.items.map((x) => (x.id === 'wws' ? { id: 'fees', title: 'Who pays the agent', at: 'Bestellerprinzip · WoVermRG', text: 'Whoever orders the agent pays: a landlord\'s agent cannot charge you. One you hire is paid only for a home offered to you alone, once you sign, at most two months\' net cold rent plus VAT.' } : x));
    }
    c.till = { label: 'Order, pay on signing' };
    const k = c.checkoutCopy;
    Object.assign(k, {
      btnSubNow: 'Starts in the desk’s first open hour · no card', btnSubWait: 'Starts when your 14 days end · no card', altLink: 'Start with a free call, no card',
      withdrawal: 'Withdrawal: 14 days from your order — {online}, by email to {email} or with the {form}. Nothing is charged before you sign, so withdrawing costs nothing. Without the tick, we start when the 14 days end.',
      fine: 'No card today. Invoice from Egidi Immobiliare S.r.l., VAT included, with a secure payment link when you sign. ' + SIGN_RULE,
      order: P ? 'Your order runs six months at most; your copy comes by email.' : 'Your order runs until you sign or stop it; your copy comes by email.'
    });
    k.errors.stale = STALE;
    delete k.paid;
    k.booked = {
      before: 'Booked — your file', em: 'is open.',
      text: `Nothing is charged until you sign. The ${c.city} desk writes by email, or on WhatsApp if you left a number. Questions? Write to`,
      next: [['First desk hour', 'your order by email, with what we need'], ['Same working day', 'your brief: dates, budget, who’s moving'], ['When you sign', 'the fee, once, with the invoice']],
      nextWait: [['First desk hour', 'your order by email, with your start date'], ['When the 14 days end', 'your brief: dates, budget, who’s moving'], ['When you sign', 'the fee, once, with the invoice']],
      wait: 'You did not tick “Start now”: we start when your 14 days end. Sooner? Write to {email}.',
      pending: 'Order being confirmed. Your copy comes by email.', unconfirmed: 'Not confirmed yet. If no email reaches you, write to the desk.',
      startsNow: 'The desk’s first open hour', startsWait: 'From {date}, after your 14-day withdrawal period',
      withdrawLink: 'Withdraw from contract here', paidText: 'Paid on {date}. Invoice from Egidi Immobiliare S.r.l.',
      dueText: 'Your lease is signed. The BOOM fee: {amount}, VAT included, invoice from Egidi Immobiliare S.r.l.', payLabel: 'Pay the fee securely',
      withdrawnText: 'Withdrawn on {date}. Nothing was charged.', closedText: 'Closed. Nothing was charged.'
    };
    return c;
  };
  const c = signingCity('paris'), cB = signingCity('berlin'), k = c.checkoutCopy;
  const save = CM.paris, saveB = CM.berlin;
  let html = '', htmlB = '';
  try {
    const { partner, ...m } = CM.paris;
    const { partner: pB, ...mB } = CM.berlin;
    CM.paris = { ...m, mode: 'search', checkout: true, chargeAt: 'signing', holidays: 'fr' };
    CM.berlin = { ...mB, mode: 'search', checkout: true, chargeAt: 'signing', holidays: 'de-be' };
    const both = SLUGS.map((s) => (s === 'paris' ? c : s === 'berlin' ? cB : CITY[s]));
    const build = (city) => renderCity({ template: read('cities/_template.html'), shared: { ...shared, signing: { rule: SIGN_RULE } }, city, assetVersion: { css: 'ui', js: 'ui', onda: 'ui', map: 'ui' },
      frags: fragments(R), root: R, weigh: false, cities: both, claims: loadClaims(R) }).html;
    html = build(c); htmlB = build(cB);
  } catch (e) { male(`the scratch signing Paris and Berlin build (${String(e.message).slice(0, 300)})`); return; }
  finally { CM.paris = save; CM.berlin = saveB; }
  // v1.8 FLIP held Paris at signing in the registry; the card flip (06/11) took chargeAt away and kept the order
  // register (the managed ticket of the orders booked before): the scratch build hands both entries back untouched
  check(CM.paris === save && CM.berlin === saveB && CM.paris.chargeAt === undefined && CM.berlin.chargeAt === undefined && !!CM.paris.order && CM.paris.order.prefix === 'PAR' && !!CM.berlin.order && CM.berlin.order.prefix === 'BER',
    'the registry is restored after the scratch build (Paris and Berlin at the checkout, their order registers kept for the orders booked before 06/11)');
  PAGES.set('/paris.html', html);
  PAGES.set('/berlin.html', htmlB);
  try {
    const OID = 'book_ui0000test1', TOK = '0123456789abcdef01234567', NUM = 'PAR-2026-0007';
    const BOOKED_OK = { status: 200, body: { ok: true, booked: true, id: OID, file: FILE, number: NUM, plan: 'full-search', startNow: false, workFromLabel: '18 November 2026' } };
    const evs = async (page, name) => (await events(page)).filter((e) => e.name === name);
    const fillTill = async (page) => { await page.fill('#tName', 'Anna Keller'); await page.fill('#tEmail', 'anna@example.com'); };
    const toTill = async (page, plan = 'full-search') => {
      await page.click(`#fare-${plan} > summary`);
      await page.waitForTimeout(200);
      await tap(page, `#fare-${plan} [data-pay]`);
      await page.waitForTimeout(250);
    };
    const stateOf = (page) => page.getAttribute('#pass', 'data-state');
    // the slot board settles on its word (a Solari flip of up to six letters)
    const slotIs = (page, word) => page.waitForFunction((w) => [...document.querySelectorAll('.slot .slot-b .st b')].map((b) => b.textContent).join('').trim() === w, word, { timeout: 4000 }).then(() => true, () => false);

    // the page carries the order's config; the till says the order, its trigger and how long it runs
    {
      const { ctx, page, st } = await open({ slug: 'paris' });
      await page.waitForTimeout(300);
      const cfg = await page.evaluate(() => window.BOOM_CITY);
      check(cfg.CHARGE_AT === 'signing' && cfg.ORDER_TERMS_V === ORDER_TERMS.paris.v && cfg.WITHDRAW_URL === '/withdrawal' && cfg.BOOKED && cfg.BOOKED.withdrawLink === 'Withdraw from contract here' && cfg.PAID === null && cfg.PLANS['attended-viewing'].trigger === TRIG['attended-viewing'],
        'the scratch Paris is a desk that charges at signing: CHARGE_AT, the order terms\' version, the online withdrawal, the BOOKED strings, no PAID strings, every fare\'s trigger');
      await toTill(page);
      check(await page.$eval('#till', (d) => d.open) && await text(page, '#tTitle') === 'Full Search' && await text(page, '#tPrice') === '€500' && await shown(page, '#tRule') && await text(page, '#tRule') === TRIG['full-search']
        && await shown(page, '#tOrder') && await text(page, '#tOrder') === k.order,
        'the till opens on Full Search with its own trigger on the ✓ line, then how long the order runs');
      check(await text(page, '#tGoL') === 'Order, pay on signing · €500' && await text(page, '#tGoS') === k.btnSubWait, 'unticked: "Order, pay on signing · €500", starts when the 14 days end, no card');
      await page.focus('#tStart');
      await page.keyboard.press('Space');
      check(await text(page, '#tGoL') === 'Order, pay on signing · €500' && await text(page, '#tGoS') === k.btnSubNow, 'ticked: the SAME label (the tick changes the sub-line, never the obligation, D6)');
      check(st.checkouts.length === 0 && (await evs(page, 'begin_checkout')).length === 1, 'opening the till posts nothing and counts one begin_checkout (D19)');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      await toTill(page, 'application-pack');
      check(await text(page, '#tRule') === TRIG['application-pack'] && await text(page, '#tGoL') === 'Order, pay on signing · €199', 'the Application Pack till says ITS trigger (the ✓ line follows the plan)');
      check(st.errors.length === 0, 'no JS error', st.errors.join(' | '));
      await ctx.close();
    }

    // the order: the POST carries the request id and the terms' version; the server's answer stamps BOOKED
    {
      const { ctx, page, st } = await open({ slug: 'paris', checkout: BOOKED_OK });
      await page.waitForTimeout(300);
      await toTill(page);
      await fillTill(page);
      await page.fill('#tNote', 'seloger.com/123 · move-in 1 February');
      await page.click('#tGo');
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      const b = st.checkouts[0] || {};
      check(st.checkouts.length === 1 && JSON.stringify(Object.keys(b)) === JSON.stringify(['city', 'kind', 'name', 'email', 'notes', 'startNow', 'company', 'requestId', 'termsV'])
        && b.city === 'paris' && b.kind === 'full-search' && b.startNow === false && b.notes === 'seloger.com/123 · move-in 1 February' && /^[a-z0-9]{8,40}$/.test(b.requestId) && b.termsV === ORDER_TERMS.paris.v,
        'the order POST is the six\'s till body plus the load\'s requestId and the terms\' version (startNow false, never a price)', JSON.stringify(b));
      check(await stateOf(page) === 'booked' && await page.getAttribute('#pass', 'data-hold') === '' && await slotIs(page, 'BOOKED') && await text(page, '#slotSr') === 'Booked'
        && await text(page, '#codeLine') === `BOOKED · FILE ${FILE} · PAR`,
        'BOOKED: its own state (the plane held before tick 1: Start now not ticked), the slot board, the code line with the SERVER\'s file');
      check(await shown(page, '#cBooked') && !(await shown(page, '#cPaid')) && !(await page.$eval('#till', (d) => d.open)) && await page.evaluate(() => document.activeElement && document.activeElement.id === 'cBooked'),
        'the till closes and the page lands on the BOOKED card (focused)');
      check(await text(page, '#cBooked .k') === 'Booked' && await text(page, '#cBooked h2') === 'Booked — your file is open.' && await text(page, '#bFile') === FILE && await text(page, '#bFare') === 'Full Search · €500 when you sign'
        && await text(page, '#bOrder') === NUM && await text(page, '#bStart') === 'From 18 November 2026, after your 14-day withdrawal period',
        'the card: File, "Full Search · €500 when you sign", the server\'s order number, the start the server gave (after the 14 days)');
      check(/When the 14 days end/.test(await text(page, '#bNext')) && await shown(page, '#bWait') && !(await shown(page, '#bText')) && !(await page.$('#bLine')),
        'not ticked: the wait\'s steps and the wait note in place of the generic line; no managed-ticket line');
      const card = await text(page, '#cBooked');
      check(!/\b(?:paid|payments?|refund\w*)\b/i.test(card) && !(await page.$('#cBooked a[href*="#online"]')), 'nothing on the fresh BOOKED card says paid, payment or refund, and it carries no withdraw link (D9, D11)', card);
      const stamp = await page.$eval('#cBooked .stamp', (s) => { const w = s.querySelector('.st-w'), r = w.getBBox(), i = s.querySelector('.st-i'), cx = +i.getAttribute('cx'), rr = +i.getAttribute('r');
        return { word: w.textContent, tl: w.getAttribute('textLength'), ring: s.querySelector('textPath').textContent, inside: r.x >= cx - rr && r.x + r.width <= cx + rr, w: r.width }; });
      check(stamp.word === 'BOOKED' && stamp.tl === '50' && /^BOOKED · BOOM PARIS/.test(stamp.ring) && stamp.inside, `the stamp says BOOKED, fitted inside the dashed inner ring (${stamp.w.toFixed(1)} units wide)`, JSON.stringify(stamp));
      check(await page.$$eval('[data-pay]', (bs) => bs.every((x) => x.hidden)) && !(await shown(page, '#fileForm')), 'after BOOKED no order button and no door remain (never a second order)');
      check((await evs(page, 'booking')).length === 1 && (await evs(page, 'booking'))[0].p.value === 500 && (await evs(page, 'booking'))[0].p.plan === 'full-search' && (await evs(page, 'booking'))[0].p.currency === 'EUR'
        && (await evs(page, 'booking_submit')).length === 1 && (await evs(page, 'purchase')).length === 0 && (await evs(page, 'add_payment_info')).length === 0,
        'analytics: booking_submit on the press, ONE booking (EUR 500, the plan), never a purchase nor add_payment_info (D19)');
      // a reload is the blank page (the email is the record); the same order answered again counts nothing twice
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(300);
      check(await stateOf(page) === 'blank' && await shown(page, '#door'), 'a reload returns to the blank page: the email is the record');
      await toTill(page);
      await fillTill(page);
      await page.click('#tGo');
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      check(await stateOf(page) === 'booked' && (await evs(page, 'booking')).length === 0 && st.checkouts.length === 2, 'the same order answered again after the reload is BOOKED again and counts no second booking (one per order id)');
      check(st.errors.length === 0, 'no JS error', st.errors.join(' | '));
      await ctx.close();
    }

    // ticked: the start is the desk's first open hour, the plane on tick 1
    {
      const { ctx, page, st } = await open({ slug: 'paris', checkout: { status: 200, body: { ...BOOKED_OK.body, id: 'book_ui0000test2', plan: 'attended-viewing', startNow: true, workFromLabel: null } } });
      await page.waitForTimeout(300);
      await toTill(page, 'application-pack');
      await fillTill(page);
      await page.click('#tStart');
      await page.click('#tGo');
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      check(st.checkouts[0] && st.checkouts[0].startNow === true && await page.getAttribute('#pass', 'data-hold') === null && await text(page, '#bStart') === 'The desk’s first open hour'
        && await text(page, '#bFare') === 'Attended Viewing · €149 when you sign' && await shown(page, '#bText') && !(await shown(page, '#bWait')),
        'ticked: startNow true; BOOKED prints the plan the SERVER booked (Attended Viewing, not the till\'s), the desk\'s first open hour and the generic line');
      await ctx.close();
    }

    // Escape while the order flies: the server booked it (its email is on the way), so the page says BOOKED anyway
    {
      const { ctx, page, st } = await open({ slug: 'paris', checkout: { ...BOOKED_OK, delay: 1200 } });
      await page.waitForTimeout(300);
      await toTill(page);
      await fillTill(page);
      await page.click('#tGo');
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      check(st.checkouts.length === 1 && await stateOf(page) === 'booked' && await shown(page, '#cBooked') && !(await page.$eval('#till', (d) => d.open)) && (await evs(page, 'booking')).length === 1,
        'Escape while the order flies: the order exists, so the page says BOOKED anyway (never a silent order), one booking');
      await ctx.close();
    }

    // the order buttons' lines (spec §4.6), measured on this scratch Paris in the font of the run (the suite runs in
    // the system font and in the CI's): the till's "Order, pay on signing · €500" takes two lines at most at 320 and
    // 360 and one from 390; a ticket's order button two lines at most at 320, one from 390
    {
      const lines = (page, sel) => page.$eval(sel, (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size; });
      const out = {};
      for (const w of [320, 360, 390, 430]) {
        const { ctx, page } = await open({ slug: 'paris', width: w });
        await page.waitForTimeout(300);
        await page.click('#fare-full-search > summary');
        await page.waitForTimeout(200);
        const ticket = await lines(page, '#fare-full-search [data-pay] > span');
        await tap(page, '#fare-full-search [data-pay]');
        await page.waitForTimeout(250);
        out[w] = { ticket, till: await lines(page, '#tGoL') };
        await ctx.close();
      }
      check(out[320].till <= 2 && out[360].till <= 2 && out[390].till === 1 && out[430].till === 1 && out[320].ticket <= 2 && out[360].ticket <= 2 && out[390].ticket === 1 && out[430].ticket === 1,
        `the order button keeps to two lines at most at 320 and 360 and to one from 390, in the till and in the ticket (${Object.entries(out).map(([w, x]) => `${w}: till ${x.till} · ticket ${x.ticket}`).join(' · ')})`, JSON.stringify(out));
    }

    // the refusals: a field (400), a stale page (409 terms_changed), the network — and the retry lands on one order
    {
      const { ctx, page, st } = await open({ slug: 'paris', checkout: (n) => (n === 1 ? { status: 400, body: { ok: false, error: 'email' } } : n === 2 ? { status: 409, body: { ok: false, error: 'terms_changed', termsV: 'par-2026-11-9' } } : n === 3 ? { status: 503, body: { ok: false, error: 'busy' } } : BOOKED_OK) });
      await page.waitForTimeout(300);
      await toTill(page);
      await fillTill(page);
      await page.click('#tGo');
      await page.waitForTimeout(400);
      check(await text(page, '#tEmailErr') === k.errors.email && await page.getAttribute('#tEmail', 'aria-invalid') === 'true' && await page.evaluate(() => document.activeElement && document.activeElement.id === 'tEmail') && await text(page, '#tErr') === '' && await stateOf(page) === 'blank',
        'a 400 "email" from the order is said on the email field (focused), the till stays open');
      await page.fill('#tEmail', 'anna@example.com');
      await page.click('#tGo');
      await page.waitForTimeout(400);
      check(await text(page, '#tErr') === STALE && await page.$eval('#till', (d) => d.open) && await page.getAttribute('#tGo', 'aria-disabled') === null && await stateOf(page) === 'blank',
        'a 409 terms_changed says the page was just updated (reload to order with the current terms); nothing is booked');
      await page.click('#tGo');
      await page.waitForTimeout(400);
      check(await text(page, '#tErr') === k.errors.net && await stateOf(page) === 'blank', 'a 503 says the order did not reach us — the button comes back');
      await page.click('#tGo');
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      const ids = [...new Set(st.checkouts.map((x) => x.requestId))];
      check(await stateOf(page) === 'booked' && st.checkouts.length === 4 && ids.length === 1 && (await evs(page, 'booking')).length === 1,
        'the retry carries the SAME requestId (the server answers the stored order): one BOOKED, one booking', JSON.stringify(ids));
      check(st.errors.length === 0, 'no JS error', st.errors.join(' | '));
      await ctx.close();
    }

    // the managed ticket: ?order=&t= → ONE GET, the address line folded, the server's state only
    const managed = (body, status = 200) => open({ slug: 'paris', query: `?order=${OID}&t=${TOK}`, paid: { status, body } });
    const base0 = { ok: true, plan: 'full-search', file: FILE, number: NUM, startNow: true, workFromLabel: null, withdrawalEndsOn: '2026-11-19', expiresOn: '2027-05-05' };
    {
      const { ctx, page, st } = await managed({ ...base0, state: 'booked' });
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const href = await page.$eval('#bLine a', (a) => a.getAttribute('href')).catch(() => null);
      check(st.gets.length === 1 && st.gets[0].endsWith(`/api/city-lead?order=${OID}&t=${TOK}&city=paris`) && await page.evaluate(() => location.search === '' && location.hash === ''),
        'the managed link asks the server once (order, token, desk) and folds the address line at once', st.gets.join(' '));
      check(await stateOf(page) === 'booked' && await slotIs(page, 'BOOKED') && await text(page, '#cBooked h2') === 'Booked — your file is open.' && await text(page, '#bOrder') === NUM
        && href === `/withdrawal?desk=Paris&ref=${NUM}#online` && await text(page, '#bLine a') === 'Withdraw from contract here',
        'BOOKED (managed): the card, the order number and the statutory withdraw link to the online function with the reference', String(href));
      check((await evs(page, 'booking')).length === 0 && (await evs(page, 'purchase')).length === 0, 'reading the ticket counts nothing (no booking, no purchase)');
      await ctx.close();
    }
    {
      const payUrl = 'https://www.boomrome.com/api/payments/link?k=inv&id=cityfee_book_ui0000test1&t=abc123';
      const { ctx, page } = await managed({ ...base0, state: 'due', amount: 476.19, payUrl });
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      check(await slotIs(page, 'DUE') && await text(page, '#cBooked .k') === 'Due' && await text(page, '#codeLine') === `DUE · FILE ${FILE} · PAR`
        && (await text(page, '#bLine')).startsWith('Your lease is signed. The BOOM fee: €476.19, VAT included, invoice from Egidi Immobiliare S.r.l.')
        && await page.$eval('#bLine a.pay', (a) => a.href) === payUrl && await text(page, '#bLine a.pay b') === 'Pay the fee securely' && await text(page, '#bFare') === 'Full Search · €476.19',
        'DUE: the slot says DUE, the fee with its cents, the secure pay button IS the server\'s payUrl');
      check(!(await shown(page, '#cBooked h2')) && !(await shown(page, '#bNext')) && !(await shown(page, '#bText')) && !(await shown(page, '#bStart')) && await page.$$eval('[data-pay]', (bs) => bs.every((x) => x.hidden)),
        'past BOOKED the heading, the start, the steps and the line step aside; no order button');
      await ctx.close();
    }
    {
      const { ctx, page } = await managed({ ...base0, state: 'due', amount: 500, payUrl: 'https://evil.example/api/payments/link?k=inv&id=x&t=y' });
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      check(!(await page.$('#bLine a')) && /€500, VAT included/.test(await text(page, '#bLine')), 'a pay address that is not our stable pay link is never offered');
      await ctx.close();
    }
    {
      const { ctx, page } = await managed({ ...base0, state: 'paid', amount: 500, paidOn: '2026-12-10' });
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const stp = await page.$eval('#cBooked .stamp', (s) => ({ word: s.querySelector('.st-w').textContent, tl: s.querySelector('.st-w').getAttribute('textLength'), ring: s.querySelector('textPath').textContent, hidden: s.hidden }));
      check(await slotIs(page, 'PAID') && stp.word === 'PAID' && stp.tl === null && /^PAID · BOOM PARIS/.test(stp.ring) && !stp.hidden
        && await text(page, '#bLine') === 'Paid on 10 December 2026. Invoice from Egidi Immobiliare S.r.l.' && await text(page, '#bFare') === 'Full Search · €500' && !(await page.$('#bLine a')),
        'PAID (managed, the only place a signing page says it): the stamp\'s word and ring swap to PAID, "Paid on 10 December 2026"', JSON.stringify(stp));
      await ctx.close();
    }
    // v1.8 review STAMP: DUE and PAID hide the heading, and the fields rose under the stamp — on PAID the ring sat on
    // "€500", the only place that page prints the amount. They keep the stamp's room, one per line: no glyph of File,
    // Fare or Order under the stamp's box, each value on ONE line, at 320, 390 and 1440 (in the font of the run), on the
    // scratch Paris and Berlin (since the card flip, 06/11, no live page charges at signing)
    for (const [slug, w] of [320, 390, 1440].flatMap((x) => [['paris', x], ['berlin', x]])) {
      for (const [st0, extra] of [['due', { amount: 476.19, payUrl: 'https://www.boomrome.com/api/payments/link?k=inv&id=cityfee_book_ui0000test1&t=abc123' }], ['paid', { amount: 500, paidOn: '2026-12-10' }]]) {
        const { ctx, page } = await open({ slug, query: `?order=${OID}&t=${TOK}`, paid: { status: 200, body: { ...base0, state: st0, ...extra } }, width: w });
        await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        await center(page, '#cBooked');
        await page.waitForTimeout(150);
        const m = await page.evaluate(() => {
          const s = document.querySelector('#cBooked .stamp'), sr = s.getBoundingClientRect(), out = { area: 0, lines: {}, shown: !s.hidden && sr.width > 0 };
          for (const id of ['bFile', 'bFare', 'bOrder']) {
            const el = document.getElementById(id), tn = el.firstChild, all = document.createRange();
            all.selectNodeContents(el);
            out.lines[id] = new Set([...all.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
            for (let i = 0; tn && i < tn.textContent.length; i++) {
              const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 1);
              for (const q of r.getClientRects()) out.area += Math.max(0, Math.min(q.right, sr.right) - Math.max(q.left, sr.left)) * Math.max(0, Math.min(q.bottom, sr.bottom) - Math.max(q.top, sr.top));
            }
          }
          out.area = Math.round(out.area);
          return out;
        });
        check(m.shown && m.area === 0 && Object.values(m.lines).every((n) => n === 1),
          `${slug} ${st0.toUpperCase()} (managed) at ${w}: no glyph of File, Fare or Order under the stamp (${m.area} px²), each on one line (${JSON.stringify(m.lines)})`);
        await ctx.close();
      }
    }
    for (const [st0, extra, line] of [['withdrawn', { withdrawnOn: '2026-11-12' }, 'Withdrawn on 12 November 2026. Nothing was charged.'], ['closed', { closedOn: '2026-12-01' }, 'Closed. Nothing was charged.']]) {
      const { ctx, page } = await managed({ ...base0, state: st0, ...extra });
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      check(await slotIs(page, 'CLOSED') && await text(page, '#cBooked .k') === 'Closed' && await text(page, '#bLine') === line && !(await shown(page, '#cBooked .stamp')) && !(await page.$('#bLine a')),
        `CLOSED (${st0}): "${line}", no stamp, no action`);
      await ctx.close();
    }
    {
      // a wrong token and an unknown order are the same 404: asked once, "not confirmed yet", never a state
      const { ctx, page, st } = await managed({ ok: false }, 404);
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'unconfirmed', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1800);
      check(await stateOf(page) === 'unconfirmed' && st.gets.length === 1 && await text(page, '#cText') === k.booked.unconfirmed && await text(page, '#slotSr') === 'Order not confirmed yet',
        'a 404 (wrong token, unknown order) asks once and says "Not confirmed yet" — never a state, never a retry', `${st.gets.length} asks`);
      await ctx.close();
    }
    {
      // the network or the server failing: twice more, then the state
      const { ctx, page, st } = await open({ slug: 'paris', query: `?order=${OID}&t=${TOK}`, paid: (n) => (n < 3 ? { status: 503, body: { ok: false, error: 'unavailable' } } : { status: 200, body: { ...base0, state: 'booked' } }) });
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 9000 }).catch(() => {});
      check(await stateOf(page) === 'booked' && st.gets.length === 3, 'a 503 is asked again (1.5 s, 3 s): the third answer prints the ticket', `${st.gets.length} asks`);
      await ctx.close();
    }
    for (const q of [`?order=${OID}&t=zz`, `?order=../../x&t=${TOK}`, `?t=${TOK}`]) {
      const { ctx, page, st } = await open({ slug: 'paris', query: q });
      await page.waitForTimeout(600);
      check(await stateOf(page) === 'blank' && st.gets.length === 0 && await page.evaluate(() => location.search === ''), `a malformed managed link (${q}) asks nothing, changes nothing and folds the address line`);
      await ctx.close();
    }

    // #order-<plan> opens the till on that plan (the operator's replies on a signing desk); ?paid= means nothing here
    {
      const { ctx, page, st } = await open({ slug: 'paris', query: '#order-full-search' });
      await page.waitForTimeout(600);
      check(await page.$eval('#till', (d) => d.open) && await text(page, '#tTitle') === 'Full Search' && !(await page.$eval('#tStart', (x) => x.checked)) && await page.evaluate(() => location.hash === '')
        && (await evs(page, 'order_link')).length === 1 && st.checkouts.length === 0,
        '#order-full-search opens the till on Full Search (Start now never pre-ticked), the hash folds, order_link counted');
      await ctx.close();
    }
    {
      const { ctx, page, st } = await open({ slug: 'paris', query: `?paid=full-search&session_id=${SID}`, paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE } } });
      await page.waitForTimeout(800);
      check(await stateOf(page) === 'blank' && st.gets.length === 0 && (await evs(page, 'purchase')).length === 0, 'a ?paid= on a signing page is ignored: no ask, no PAID, no purchase');
      await ctx.close();
    }

// v1.8 review LFR-1 (L221-14 al. 2, C. civ. 1127-2, §312j(3) BGB): on a desk that charges at signing the labelled
    // button IS the order. Enter in a field never places it — the browser's implicit submission used to click #tGo unseen,
    // below the tick, the withdrawal line and the button's words (one POST, a numbered mandate and its email from an Enter
    // in the email or the note). It walks name → email → note → the tick → the button; a held Enter walks one step and its
    // auto-repeat never presses the button; only the button orders. The six are unchanged (Stripe's page concludes there).
    for (const slug of ['paris', 'berlin']) {
      const BOOK = { status: 200, body: { ok: true, booked: true, id: 'book_ui0000enter1', file: FILE, number: (slug === 'paris' ? 'PAR' : 'BER') + '-2026-0001', plan: 'full-search', startNow: false, workFromLabel: '19 November 2026' } };
      const { ctx, page, st } = await open({ slug, query: '#order-full-search', checkout: BOOK });
      await page.waitForTimeout(600);
      const at = () => page.evaluate(() => document.activeElement && document.activeElement.id);
      await page.fill('#tName', 'Anne Dupont'); await page.fill('#tEmail', 'anne@example.fr'); await page.fill('#tNote', 'https://www.seloger.com/annonces/123');
      const walk = [];
      for (const id of ['tName', 'tEmail', 'tNote', 'tStart']) { await page.focus('#' + id); await page.keyboard.press('Enter'); await page.waitForTimeout(150); walk.push(await at()); }
      await page.waitForTimeout(500);
      const goSeen = await page.$eval('#tGo', (b) => { const r = b.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; });
      check(await page.$eval('#till', (d) => d.open) && st.checkouts.length === 0 && await page.getAttribute('#pass', 'data-state') === 'blank' && !(await page.$eval('#tStart', (c) => c.checked)) && walk.join() === 'tEmail,tNote,tStart,tGo' && goSeen,
        `${slug}: Enter in the name, the email, the note and on the tick orders nothing (0 POSTs) — it walks to the next field, then to the button, seen on the screen (${walk.join(' → ')})`);
      for (const from of ['tNote', 'tStart']) {
        await page.focus('#' + from);
        await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
        await page.waitForTimeout(400);
        check(st.checkouts.length === 0 && await at() === (from === 'tNote' ? 'tStart' : 'tGo'), `${slug}: a held Enter from ${from === 'tNote' ? 'the note' : 'the tick'} walks one step (${await at()}) and its auto-repeat never orders`);
      }
      await page.click('#tGo');
      await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'booked', null, { timeout: 5000 }).catch(() => {});
      check(st.checkouts.length === 1 && st.checkouts[0].city === slug && st.checkouts[0].kind === 'full-search' && st.checkouts[0].startNow === false && await page.getAttribute('#pass', 'data-state') === 'booked',
        `${slug}: a click on the button "Order, pay on signing · €500" makes ONE order (BOOKED)`);
      check(st.errors.length === 0, `${slug}: no JS error`, st.errors.join(' | '));
      await ctx.close();
    }

    // the six unchanged (SIGN false): no order config, the six's till body, ?order= and #order- mean nothing
    {
      const { ctx, page, st } = await open({ slug: 'amsterdam', query: `?order=${OID}&t=${TOK}#order-full-search`, checkout: { status: 200, body: { ok: false, error: 'stripe_down' } } });
      await page.waitForTimeout(700);
      const cfg = await page.evaluate(() => window.BOOM_CITY);
      check(!('CHARGE_AT' in cfg) && !('BOOKED' in cfg) && !('ORDER_TERMS_V' in cfg) && !(await page.$('#cBooked')), 'Amsterdam carries no order config and no BOOKED card');
      check(st.gets.length === 0 && await stateOf(page) === 'blank' && await page.evaluate(() => location.search.includes('order=') && location.hash === '#order-full-search') && !(await page.$eval('#till', (d) => d.open)),
        'on Amsterdam ?order=&t= asks nothing and #order-full-search opens nothing (the address line untouched)');
      await toTill(page);
      await fillTill(page);
      await page.click('#tGo');
      await page.waitForTimeout(400);
      const b = st.checkouts[0] || {};
      check(JSON.stringify(Object.keys(b)) === JSON.stringify(['city', 'kind', 'name', 'email', 'notes', 'startNow', 'company']) && (await evs(page, 'add_payment_info')).length === 1 && (await evs(page, 'booking_submit')).length === 0
        && await text(page, '#tRule') === RULE && await text(page, '#tErr') === await page.$eval('#till', (d) => d.getAttribute('data-err-net')),
        'Amsterdam\'s till body is the six\'s, unchanged (no requestId, no termsV), add_payment_info as before, the refund rule on its ✓ line', JSON.stringify(b));
      await ctx.close();
    }
  } finally { PAGES.delete('/paris.html'); PAGES.delete('/berlin.html'); }
}

async function finish() {
  check(allErrors.length === 0, 'zero JS errors across every run', allErrors.slice(0, 3).join(' | '));
  check(allForeign.length === 0, 'no request to a host we did not stub', allForeign.slice(0, 3).join(' | '));
  await browser.close();
  srv.close();
  console.log(`\n  ${ok} passed, ${ko} failed`);
  process.exit(ko ? 1 : 0);
}
