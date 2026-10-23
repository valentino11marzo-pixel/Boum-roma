// tests/cities/ui.mjs — the generated city page (v1.4, "The Itinerary") in a
// real Chromium.
//
// What it proves:
//   - with JS OFF the page reads whole: the city in the title as text, the
//     fares board and the plates with the prices as text, every section
//     visible; the Check-in, the ticket, its share row, the printer and the
//     strip are not there (they are behaviour), the door is shut and says
//     where to write instead;
//   - 390px: the hero is editorial — the fares board and the gold door fit
//     the first screen; the reading order is title · lead · fares · door ·
//     facts · section 01 (Check-in · printer · door) · how · services; the
//     ticket is not on the screen before a plan exists; the first resolving
//     tap prints it ONCE (STANDBY, the price on its board, the refund rule,
//     the plane on leg 1) and lands its doors on the screen — after the
//     steps' view transition, never inside it; a tap that neither prints
//     the ticket nor changes its plan keeps the next question (then the
//     papers fold) on the screen below the nav, by touch as by keyboard,
//     whose focused answer never goes under the nav; a shortlist is pending
//     INSIDE the Check-in with no ticket; the second tap moves the plane to
//     leg 2 and writes the origin; "use it" hands the focus to the ticket; a chip
//     picked by hand survives later answers and the Check-in suggests,
//     never overwrites; the papers fold → "3/8" on the ticket and the
//     "prepares" line names ONLY what the chosen plan prepares;
//   - a plate's link prints the ticket on ITS plan and brings it into view,
//     the focus with it onto the ticket itself (round 2: one target in every
//     state — fresh, file open, payment confirming — the plan's name below
//     the nav on 375×667, 390×664 and 320×568); the first tap lands the till
//     at the foot of the screen (the strip steps back, never subtracted);
//   - the door: a submit with no ticket prints it inside the click and the
//     form does not move (manual scroll anchoring, < 4 px); a 200 with the
//     server's file number issues the boarding pass (OPEN, the file, the
//     passenger, the boarding window = #openWhen, the stamp, the live line,
//     focus on the open file); with a 700 ms server the stamp strikes only
//     on the screen, a phone lands the confirmation's first step under the
//     stub, no room is held under the door; a failure issues nothing; "not sure yet" is
//     the free first call with no till; the till opened from the stub
//     after the send is prefilled and carries the file (fileRef); three
//     Enters make one POST;
//   - the paid return: ?paid= alone stamps nothing and counts nothing — the
//     page asks GET /api/city-lead?paid=&city= (five times at most); only
//     paid:true issues PAID with the server's file, the boarding line, the
//     verified steps and ONE purchase — on the ticket the page landed on, on
//     the screen at 390/1024/1280/1440, the focus on the ticket, also with
//     gtag.js holding `load` 500 ms and a legacy #contact return (round 2);
//     the success tick only once verified; no pay button after PAID or while
//     confirming; a reload does not count twice;
//     ?paid=constructor does nothing;
//   - 1440: the hero in two columns (fares left, facts card right, aligned
//     with the title), section 01 in a 4/6 grid (Check-in and door left,
//     the printer right, aligned), the slot and its line before a plan, the
//     stub beside the body (container query), nothing sticky; 1024: one
//     column, no horizontal scroll, 44px chips;
//   - the review of 22/10, measured: issued at 1024/1280/1440 (OPEN and
//     PAID) the rotated stamp sits in the body column and covers neither the
//     WhatsApp door, the till, the file number nor the Boarding line (390
//     unchanged, in the stub); the status board's glyphs are styled like the
//     €500 board's; the route "IN TOWN ✈ MAD" fits from 320 to 1440; the
//     nav holds one line per link at 1024; the paired door fields share a
//     bottom edge; the FAQ's focus ring is drawn inside its clipping box;
//     the script-focused paid card never wears the browser's white ring;
//     Tab at 390 never lands a control under the strip; the refund rule is
//     RENDERED (not only written) under the fares, the door's chips, the
//     plates and on the ticket of the three desks that sell;
//   - the strip: after the hero's door scrolls off, never over the door or
//     the ticket, never with the dialog open, gone after a file is issued,
//     its WhatsApp icon with the desk marker and the plan; ONE height (≤ 72)
//     at 320/375/390 with the desk open or closed, and a full Tab walk leaves
//     nothing focused under it (--strip-h, round 2);
//   - Saturday 11:00: every [data-door-sub] says "no card · Monday from
//     09:00 CEST"; reduced motion: no animation on the printer, the stamp,
//     the plane, every final state visible; the exported image is a real
//     1080×1920 and passData() carries no file, no boarding, no name; the
//     consent plate waits over the unanswered Check-in, the ticket and (on
//     a short phone, 390×664 / 360×640) the hero's gold door, and its 45 s
//     cap holds; on a 1920px screen the plate beside the door comes (round 2:
//     it must meet in height AND width);
//   - the state guards (review 22/10): back from Stripe via the bfcache
//     the till is not left busy; while a payment is being confirmed no
//     plate re-plans the ticket or opens a second checkout, the strip stays
//     off, the address line stays and, after the fifth ask, "not confirmed
//     yet"; PAID stamps the plan paid; a ?paid= without a session changes
//     nothing; a chip moved in flight never renames the filed plan; the
//     issued file freezes the Check-in (inert, same height); no file from
//     the server prints "—"; WhatsApp keeps "I" and the city's capital;
//   - the till, the withdrawal form, the links that land, the month, the
//     menu, the sisters at 390 (Madrid and Barcelona sell; Paris and Berlin
//     open a file with no till), a touch screen; zero JS errors, and no
//     request leaves for a host we did not stub.
//
// The page is served from the repo root (it links /css and /assets). Every
// request outside localhost is aborted: /api/city-lead (POST and the paid
// GET) and /api/service-checkout are answered here.

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

console.log('\n\x1b[1m▸ citiesui\x1b[0m  the city page in a real browser: the fares, the questions, the ticket, the door, the till');

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
async function open({ js = true, width = 390, height = null, api = LEAD_OK, paid = { status: 200, body: { ok: true, pending: true } }, reducedMotion = 'no-preference', slug = 'amsterdam', query = '', checkout = null, consent = true, touch = false, clock = null, block = null, hold = 0 } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: height || (width < 600 ? 844 : 900) }, reducedMotion, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const st = { errors: [], posts: [], gets: [], checkouts: [], foreign: [] };
  page.on('pageerror', (e) => st.errors.push(e.message));
  // the consent plate stays closed unless a test is about it
  if (consent) await page.addInitScript(() => { try { localStorage.setItem('boom:consent', 'min:' + Date.now()); } catch (e) {} });
  // a fixed clock, for the desk's weekend: new Date() and Date.now() return it, everything else is the real Date
  if (clock) await page.addInitScript((iso) => {
    const RD = Date, T = new RD(iso).getTime();
    function D() { return arguments.length ? new RD(...arguments) : new RD(T); }
    D.now = () => T; D.UTC = RD.UTC; D.parse = RD.parse; D.prototype = RD.prototype;
    window.Date = D;
  }, clock);
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (block && block.test(u)) return r.abort();
    if (u.startsWith(base + '/api/city-lead')) {
      if (r.request().method() === 'GET') {
        st.gets.push(u);
        return r.fulfill({ status: paid.status, contentType: 'application/json', body: JSON.stringify(paid.body) });
      }
      st.posts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
      if (api.delay) await new Promise((res) => setTimeout(res, api.delay));
      return r.fulfill({ status: api.status, contentType: 'application/json', body: JSON.stringify(api.body) });
    }
    if (u.startsWith(base + '/api/service-checkout')) {
      st.checkouts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
      const res = checkout || { status: 200, body: { ok: true, url: `${base}/${slug}?paid=full-search&session_id=cs_test_ui0000001` } }; // the server's success URL: no #contact (review 22/10 — the fragment re-scroll at `load` undid the landing)
      return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
    }
    if (u.startsWith(base)) return r.continue();
    if (!/googletagmanager\.com/.test(u)) st.foreign.push(u);   // gtag is the one third party every BOOM page loads
    // in production the async gtag.js holds the `load` event: `hold` ms imitate it (review 22/10 — the
    // browser re-applies a #contact fragment scroll at `load`, after the page's own landing)
    else if (hold) await new Promise((res) => setTimeout(res, hold));
    return r.abort();
  });
  await page.goto(`${base}/${slug}${query}`, { waitUntil: 'load' });
  return { ctx, page, st };
}
const layer = (page) => page.evaluate(() => (window.dataLayer || []).map((a) => [].slice.call(a)).filter((a) => a[0] === 'event').map((a) => ({ name: a[1], p: a[2] || {} })));
const boardWord = (page, id) => page.$eval(id, (e) => [...e.querySelectorAll('.st b')].map((b) => b.textContent).join('').trim()).catch(() => '');
// the strip at the bottom sits over the edge of a 844px viewport: a target is
// centred before the tap, as a thumb would do, never clicked through the bar
const tap = async (page, sel) => {
  await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(200);
  await page.click(sel);
};
const ckOpt = (v) => `#checkin .ck-opt:has(input[value="${v}"])`;
const ckDoc = (v) => `#checkin .ck-doc:has(input[value="${v}"])`;
const T = (page) => page.evaluate(() => {
  const p = document.getElementById('pass'), w = document.getElementById('passWrap');
  const t = (id) => (document.getElementById(id) || {}).textContent || '';
  const shown = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  const r = p.getBoundingClientRect(), f = document.getElementById('ckFile').getBoundingClientRect(), sb = document.getElementById('ckStart');
  return {
    state: p.getAttribute('data-state'), display: getComputedStyle(p).display, wrapIn: w.classList.contains('in'), wrapShown: getComputedStyle(w).display !== 'none',
    title: t('ckTitle'), status: [...document.querySelectorAll('#ckStatus .st b')].map((b) => b.textContent).join('').trim(), statusSr: t('ckStatusSr'),
    plan: t('ckPlan'), cond: t('ckCond'), why: t('ckWhy'), note: t('ckNote'), noteShown: shown('ckNote'), condLong: t('ckCondLong'),
    price: [...document.querySelectorAll('#ckPrice .st b')].map((b) => b.textContent).join(''), priceSr: t('ckPriceSr'),
    refundShown: shown('ckRefund'), pendingShown: shown('ckPending'),
    leg: getComputedStyle(p).getPropertyValue('--leg').trim(), from: t('ckFrom'), codeline: t('ckCodeLine'),
    passenger: t('ckPassenger'), moveIn: t('ckMoveIn'), papers: t('ckPassPapers'), file: t('ckPassFile'), when: t('ckPassWhen'),
    stamp: document.getElementById('ckStamp').getAttribute('data-stamp'), struck: p.classList.contains('struck'),
    start: document.getElementById('ckStart') ? { shown: shown('ckStart'), pay: document.getElementById('ckStart').getAttribute('data-pay'), amt: t('ckStartAmt') } : null,
    fileDoor: { shown: shown('ckFile'), service: document.getElementById('ckFile').getAttribute('data-service') },
    pend: shown('ckPend'), pendText: t('ckPendText'), pendInCk: !!document.querySelector('#checkin #ckPend'),
    suggest: shown('ckSuggest'), suggestText: t('ckSuggestText'), papersBox: shown('ckPapersBox'), ready: t('ckReady'), live: t('ckLive'),
    chip: (document.querySelector('input[name="service"]:checked') || {}).value || '', plText: t('plText'), planFrom: document.getElementById('cityForm').getAttribute('data-plan-from'),
    fMoveIn: document.getElementById('fMoveIn').value, fCheckin: document.getElementById('fCheckin').value, fDossier: document.getElementById('fDossier').value,
    hash: location.hash, heroWa: document.getElementById('heroWa').getAttribute('href'), wa2: document.getElementById('ckWa2').getAttribute('href'), stripWa: (document.getElementById('stripWa') || { getAttribute: () => '' }).getAttribute('href'),
    stripSub: t('stripSub'), num: t('ckNum'), landing: document.getElementById('ckLanding').hidden ? null : t('ckLanding'),
    stepsShown: ['stage', 'where', 'when'].map((s) => { const e = document.querySelector(`#checkin .ck-step[data-step="${s}"]`); return !e.hidden && getComputedStyle(e).display !== 'none'; }),
    rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) }, fileBottom: Math.round(f.bottom), startBottom: sb && sb.offsetParent ? Math.round(sb.getBoundingClientRect().bottom) : 0, ih: innerHeight
  };
});
const board = (page) => page.evaluate(() => {
  const f = document.getElementById('flapCity');
  const cells = [...f.querySelectorAll('.fc2')];
  const r = f.getBoundingClientRect();
  const first = cells[0] && cells[0].getBoundingClientRect(), last = cells.length && cells[cells.length - 1].getBoundingClientRect();
  return {
    cells: cells.length,
    letters: cells.map((c) => c.querySelector('.st b').textContent).join(''),
    hostW: r.width, contentW: cells.length ? last.right - first.left : 0,
    minW: parseFloat(f.style.minWidth) * parseFloat(getComputedStyle(f).fontSize)
  };
});
const ymPlus = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
// the consent plate counts as shown only when it exists and is not held hidden
const plateUp = (page) => page.$eval('.boomcst', (e) => !e.classList.contains('zz') && getComputedStyle(e).visibility !== 'hidden').catch(() => false);
const WINDOW_RE = /^(By 19:00 CES?T today|Today from 09:00 CES?T|Tomorrow from 09:00 CES?T|(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) from 09:00 CES?T)$/;
// the door's sub follows the desk clock: "same-day reply" while the desk is open, the window (a time, never a price) when it is closed
const SUB_RE = (lead) => new RegExp(`^${lead} · (same-day reply|By 19:00 CES?T today|Today from 09:00 CES?T|Tomorrow from 09:00 CES?T|(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) from 09:00 CES?T)$`);
const MARKER = 'https://wa.me/393313251961?text=' + encodeURIComponent("Hi BOOM Amsterdam, I'm moving to Amsterdam.");
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); };
const top = (page, sel) => page.$eval(sel, (e) => Math.round(e.getBoundingClientRect().top + scrollY));
// the status board's glyphs styled like the price board's (review 22/10: a
// descendant `.phead b` gave them 11px mono in 14px cells, the lower flaps empty)
const glyphs = (page) => page.evaluate(() => {
  const cs = (q) => getComputedStyle(document.querySelector(q));
  const s = cs('#ckStatus .fc2 .st b'), p = cs('#ckPrice .fc2 .st b'), t = cs('#ckTitle');
  const cellH = document.querySelector('#ckStatus .fc2').getBoundingClientRect().height;
  return { size: s.fontSize, host: cs('#ckStatus').fontSize, likePrice: s.fontFamily === p.fontFamily && s.letterSpacing === p.letterSpacing && s.color === p.color,
    lhGap: Math.abs(parseFloat(s.lineHeight) - cellH), title: t.fontSize === '11px' && /monospace/.test(t.fontFamily) };
});
// the stamp's PAINTED box: the span's box turned by the ::after's matrix (it is
// rotated -9deg), against what it must never cover and the column it belongs to
const STAMP_CLEAR = ['#ckWa2', '#ckStart', '#ckPassFile', '#ckPassWhen'];
const stampBox = (page) => page.evaluate((sels) => {
  const el = document.getElementById('ckStamp'), r = el.getBoundingClientRect();
  const m = (getComputedStyle(el, '::after').transform.match(/matrix\(([^)]+)\)/) || [])[1];
  const [a, b, c, d] = m ? m.split(',').map(Number) : [1, 0, 0, 1];
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [x * r.width / 2, y * r.height / 2]).map(([x, y]) => [cx + a * x + c * y, cy + b * x + d * y]);
  const v = { left: Math.min(...pts.map((q) => q[0])), right: Math.max(...pts.map((q) => q[0])), top: Math.min(...pts.map((q) => q[1])), bottom: Math.max(...pts.map((q) => q[1])) };
  const within = (q) => { const o = document.querySelector(q).getBoundingClientRect(); return v.left >= o.left && v.right <= o.right && v.top >= o.top && v.bottom <= o.bottom; };
  const shown = sels.filter((q) => { const e = document.querySelector(q); return e && !e.hidden && e.offsetParent; });
  const hits = shown.filter((q) => { const o = document.querySelector(q).getBoundingClientRect(); return o.left < v.right && o.right > v.left && o.top < v.bottom && o.bottom > v.top; });
  return { w: Math.round(r.width), inBody: within('.pbody'), inStub: within('.stub'), shown, hits, pad: getComputedStyle(document.querySelector('.pbody')).paddingBottom };
}, STAMP_CLEAR);
// after a Tab the page may still be gliding (html{scroll-behavior:smooth}): wait until it stands
const settle = async (page) => { let y = -1; for (let i = 0; i < 20; i++) { const n = await page.evaluate(() => scrollY); if (n === y) return; y = n; await page.waitForTimeout(120); } };
// the verified PAID moment ON the screen: the status, the stamp and the server's
// file number inside the viewport below the nav (review 22/10: the paid return
// landed on the door, the ticket 600px above on a phone, under the nav at 1440)
const paidInView = (page) => page.evaluate(() => {
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
  const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), ok: b.top >= bar && b.bottom <= innerHeight }; };
  const a = document.activeElement.getBoundingClientRect();
  return { status: r('ckStatus'), stamp: r('ckStamp'), file: r('ckPassFile'), struck: document.getElementById('pass').classList.contains('struck'), focus: document.activeElement.id, focusOn: a.top >= bar - 1 && a.top < innerHeight };
});

// where the focus is (the ticket itself, round 2) and whether the printed plan's name reads below the nav
const plateFocus = (page) => page.evaluate(() => {
  const e = document.activeElement, r = e.getBoundingClientRect(), p = document.getElementById('ckPlan').getBoundingClientRect(), bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
  return { id: e.id, top: Math.round(r.top), on: r.top >= bar - 1 && r.top < innerHeight, plan: document.getElementById('ckPlan').textContent, planTop: Math.round(p.top), planOk: p.top >= bar && p.bottom <= innerHeight };
});

// ── JS off: everything readable, nothing behavioural on the page ─────────
{
  const { ctx, page } = await open({ js: false });
  const hidden = await page.$$eval('.rv', (els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
  const total = await page.$$eval('.rv', (els) => els.length);
  check(total >= 4 && hidden === 0, `without JS all ${total} reveal blocks are visible`, `${hidden} hidden`);
  check(await page.$eval('#flapCity', (f) => getComputedStyle(f, '::before').content === '"AMSTERDAM"' && f.textContent === ''), 'without JS the title still shows AMSTERDAM (CSS draws data-word on the empty board)');
  check((await page.$eval('h1', (h) => h.textContent.replace(/\s+/g, ' ').trim())) === 'Your home in Amsterdam', 'the H1 text is "Your home in Amsterdam", once');
  // the door cannot submit without the script: no GET with the contact data in the address bar
  check(await page.$eval('#fGo', (b) => b.disabled) && await page.isVisible('#cityForm .ferr.on'), 'without JS the door button is disabled and the page says where to write instead');
  await page.fill('#fName', 'Anna'); await page.fill('#fEmail', 'anna@example.com'); await page.press('#fEmail', 'Enter');
  await page.waitForTimeout(150);
  check((await page.evaluate(() => location.search)) === '', 'Enter in a field submits nothing without JS (no ?name=…&email=… in the URL)');
  check(await page.$eval('#fGo', (b) => +getComputedStyle(b).opacity < 0.8), 'the shut door looks shut (disabled style), not a gold button that does nothing');
  const fares = await page.$$eval('.fares .fare', (els) => els.map((e) => [e.querySelector('.fp').textContent, e.querySelector('.fc').textContent, getComputedStyle(e).display !== 'none']));
  check(JSON.stringify(fares) === JSON.stringify([['€500', 'flat · incl. VAT', true], ['€199', 'flat · incl. VAT', true], ['€149', 'per viewing · incl. VAT', true]]),
    'without JS the fares board shows the three prices as text, each with its condition', JSON.stringify(fares));
  check(await page.isVisible('.glance .rule') && /refunded in full/.test(await page.textContent('.glance .rule')), 'the refund rule sits under the fares, visible without JS');
  const prices = await page.$$eval('[data-plan-price]', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(prices) === JSON.stringify(['€500', '€199', '€149']), 'without JS the three prices are text, on the plates');
  const chipTxt = await page.$$eval('.chip small', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(chipTxt) === JSON.stringify(['€500 · flat · incl. VAT', '€199 · flat · incl. VAT', '€149 · per viewing · incl. VAT', 'advise me']),
    'without JS the service chips show their price and their condition as text');
  check(await page.$eval('.planline .chips', (e) => getComputedStyle(e).display !== 'none') && await page.$eval('#planline', (e) => e.open), 'without JS the chips are open in the door');
  const wa = await page.getAttribute('.consent a[href^="https://wa.me/"]', 'href');
  check(wa === MARKER, 'the WhatsApp link is a real href to the real number, opening with the desk named', wa);
  const goTxt = await page.$$eval('.plates .go', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(goTxt) === JSON.stringify(['Start with a free call →', 'Start with a free call →', 'Start with a free call →']), 'without JS the plates\' primaries read the one label');
  const gone = await page.evaluate(() => ['#checkin', '#pass', '.pshare', '#passWrap', '#paybar', '.plan-head', '#heroPlan', '.hp-sep'].map((s) => getComputedStyle(document.querySelector(s)).display === 'none'));
  check(gone.every(Boolean), 'without JS the Check-in, the ticket, its share row, the printer, the head line, the hero\'s three-questions link with its dot and the strip are not there (they are behaviour)', JSON.stringify(gone));
  // ...while the #plan heading stays (spec step 6: the section shows its heading)
  const planH2 = await page.evaluate(() => { const h = document.querySelector('#plan h2'); return !!h && getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().height > 0; });
  check(planH2, 'without JS the #plan heading is still shown');
  check(await page.isVisible('.hero-go') && (await page.getAttribute('.hero-go', 'href')) === '#contact', 'without JS the hero\'s gold door is a plain link to the door');
  check((await page.textContent('#faq')).includes("Full Search (€500) if you haven't started."), 'without JS the derived FAQ answer is on the page as text');
  check(await page.$('dialog#ov') !== null && !(await page.$eval('dialog#ov', (d) => d.open)), 'the till is a native <dialog>, closed');
  await ctx.close();
}
// ── JS on, but the desk script never loads: the shut door says where to write ──
{
  const { ctx, page, st } = await open({ block: /\/assets\/boom-city\.js/ });
  await page.waitForTimeout(100);
  const fb = await page.$eval('#fJsFail', (p) => ({ vis: getComputedStyle(p).display !== 'none', t: p.textContent, links: [...p.querySelectorAll('a')].map((a) => a.getAttribute('href')) })).catch(() => null);
  check(await page.$eval('#fGo', (b) => b.disabled && +getComputedStyle(b).opacity < 0.8) && fb && fb.vis && /could not load/.test(fb.t)
    && /^https:\/\/wa\.me\/\d+\?text=/.test(fb.links[0] || '') && /^mailto:/.test(fb.links[1] || ''),
    'the desk script fails to load: the door looks shut and a line gives WhatsApp and email instead', JSON.stringify(fb));
  check(st.errors.length === 0, 'and the fallback itself throws nothing', st.errors.join(' | '));
  await ctx.close();
}
// ── the normal load: the door opens and no fallback line is printed ──
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);   // the .2s fade from the served shut state
  const door = await page.$eval('#fGo', (b) => [b.disabled, getComputedStyle(b).opacity]);
  check(door[0] === false && door[1] === '1' && (await page.$('#fJsFail')) === null, 'with the desk script the door is open and no fallback line appears', JSON.stringify(door));
  await ctx.close();
}

// ── 390px: the editorial hero, then the questions print the ticket ───────
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(2600);                           // 600ms + the spin
  const b = await board(page);
  check(b.cells === 9 && b.letters === 'AMSTERDAM', `the board spells AMSTERDAM, one cell per letter (${b.cells} cells: "${b.letters}")`);
  check(Math.abs(b.hostW - b.contentW) < 4 && Math.abs(b.minW - b.contentW) < 4,
    `the board lands in the space the hero reserved — ${CELL_EM}em/cell: reserved ${b.minW.toFixed(1)}px, cells ${b.contentW.toFixed(1)}px (no layout jump)`);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= 390, `390px: no horizontal scroll (scrollWidth ${scrollW})`);
  // the reading order, measured
  const order = await page.evaluate(() => ['h1', '.hero .lead', '.fares', '.hero-go', '#facts', '#plan', '#checkin', '#passWrap', '#contact', '#how', '#services'].map((q) => {
    const e = document.querySelector(q); if (!e) return -1;
    const was = e.style.display; if (getComputedStyle(e).display === 'none') e.style.display = 'block';
    const y = Math.round(e.getBoundingClientRect().top + scrollY); e.style.display = was; return y;
  }));
  check(order.every((y, i) => y >= 0 && (i === 0 || y >= order[i - 1])) && order[5] <= order[6], `390px reading order: h1 · lead · fares · hero door · facts · #plan (Check-in · printer · door) · how · services (${order.join(' ≤ ')})`);
  const fold = await page.evaluate(() => ({ fares: document.querySelector('.fares').getBoundingClientRect().bottom, go: document.querySelector('.hero-go').getBoundingClientRect().bottom, top: document.querySelector('.fares').getBoundingClientRect().top }));
  check(fold.top > 0 && fold.fares <= 844 && fold.go <= 844, `390×844: the fares board and the hero's gold door are whole above the fold at load (fares ${Math.round(fold.fares)}px, door ${Math.round(fold.go)}px)`);
  check(!(await page.$('header.hero #pass')) && !(await page.$('header.hero #checkin')) && !(await page.$('header.hero #contact')), 'the hero holds no ticket, no Check-in, no door: it is editorial');
  let s = await T(page);
  check(s.state === 'blank' && s.display === 'none' && !s.wrapShown && JSON.stringify(s.stepsShown) === '[true,false,false]' && s.num === 'Check-in · 1 of 3',
    'before a plan exists the ticket (and its printer) is not on a phone; the Check-in opens on the first step alone');
  const clock = await page.textContent('#deskClock');
  check(/^it is \d\d:\d\d at the desk(, \d\d:\d\d for you)?$/.test(clock), `the desk clock line is live ("${clock}")`);
  check(!(await page.$eval('#paybar', (e) => e.classList.contains('on'))) && !/€|\d{3}/.test(await page.textContent('#paybar .pinfo')) && SUB_RE('no card').test((await page.textContent('#stripSub')).trim()),
    'at the top the strip is off, and it carries no price (the sub is the desk\'s promise for now)');
  check(s.heroWa === MARKER && s.wa2 === MARKER, 'before a plan the WhatsApp links carry the desk marker alone');
  // the landing scroll waits for the steps' cross-fade (review 22/10: started
  // inside it, it dragged the questions' snapshot over the printed ticket)
  await page.evaluate(() => {
    window.__vtLog = [];
    const svt = document.startViewTransition && document.startViewTransition.bind(document);
    if (svt) document.startViewTransition = (cb) => { const t = svt(cb); window.__vtLog.push('start'); t.finished.then(() => window.__vtLog.push('finished'), () => window.__vtLog.push('finished')); return t; };
    const st = window.scrollTo.bind(window);
    window.scrollTo = (...a) => { window.__vtLog.push('scroll'); return st(...a); };
  });
  // tap 1: haven't started → the ticket prints, STANDBY, Full Search
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1600);
  s = await T(page);
  check(s.state === 'standby' && s.display !== 'none' && s.wrapIn && s.status === 'STANDBY' && s.statusSr === 'STANDBY' && s.title === 'BOOM · Your plan',
    `tap 1 (haven't started): the ticket prints once (.in on the printer), STANDBY on its one board, "BOOM · Your plan" ("${s.status}")`);
  check(s.plan === 'Full Search' && s.price === '€500' && s.priceSr === '€500' && s.cond === 'flat · incl. VAT' && s.refundShown && /Starting from zero/.test(s.why) && s.leg === '1' && s.from === 'YOU',
    `the ticket reads Full Search, €500 on its board, the condition, the refund rule, the why; the plane on leg 1, the origin still YOU (leg ${s.leg})`);
  const gl = await glyphs(page);
  check(gl.size === gl.host && gl.likePrice && gl.lhGap < 1 && gl.title,
    `the STANDBY board's glyphs are its cells' size (${gl.size} = ${gl.host}), styled like the €500 board's and as tall as the cell; the title alone is 11px mono`, JSON.stringify(gl));
  check(s.fileBottom <= s.ih && s.startBottom > 0 && s.startBottom <= s.ih, `after the tap that prints it the ticket's two doors are on the screen (free call ${s.fileBottom}, till ${s.startBottom} ≤ ${s.ih})`);
  const vtLog = await page.evaluate(() => window.__vtLog);
  check(vtLog[0] === 'start' && vtLog.indexOf('scroll') > vtLog.indexOf('finished') && vtLog.indexOf('finished') > 0,
    'the doors land AFTER the steps\' view transition finished, never inside it (no ghost of the questions over the ticket)', JSON.stringify(vtLog));
  check(s.file === '—' && s.when === '—' && s.passenger === '—' && s.stamp === '' && s.start && s.start.shown && s.start.pay === 'full-search' && s.start.amt === '€500' && s.fileDoor.service === 'full-search',
    'standby: no file number, no boarding, no passenger, no stamp; the stub\'s till says €500 on Full Search');
  check(s.chip === 'full-search' && s.plText === 'Full Search · €500 · flat · incl. VAT · from your check-in' && s.planFrom === 'checkin' && s.fCheckin === "Haven't started",
    'the door is written from the first tap: the chip checked, the plan line says from your check-in, the hidden field in words');
  check(s.hash === '#checkin=zero.-.-.-' && s.stripSub === 'Full Search · your plan' && s.codeline === 'AMS · TENANT SIDE · START', 'the URL remembers the answer; the strip names the plan, never the price; the answer codes ride the stub caption');
  check(s.heroWa === MARKER + encodeURIComponent(" My plan: Full Search · haven't started.") && s.wa2 === s.heroWa && s.stripWa === s.heroWa && !/%E2%82%AC|€/.test(s.heroWa),
    'the WhatsApp links: the desk marker first, then the plan and the answers — never a price', decodeURIComponent(s.heroWa));
  check(s.live === 'Full Search, €500, flat · incl. VAT', 'the plan is announced once in the small live region', s.live);
  // tap 2: still abroad → leg 2, the origin written
  await tap(page, ckOpt('abroad'));
  await page.waitForTimeout(1100);
  s = await T(page);
  // the plan did not change: the page keeps the third question in view (it
  // used to land the doors again and scroll it under the nav — review 22/10)
  const below = (sel) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(), bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra')); return { top: Math.round(r.top), bottom: Math.round(r.bottom), ok: r.top >= bar && r.bottom <= innerHeight }; }, sel);
  const q3 = await below('#checkin .ck-step[data-step="when"]');
  check(s.leg === '2' && s.from === 'ABROAD' && s.plan === 'Full Search' && q3.ok, `tap 2: the plane on leg 2, the origin ABROAD; the plan did not change, so the third question stays on the screen below the nav (${q3.top}–${q3.bottom})`);
  // tap 3: in 1–3 months → leg 3, the note, the papers fold in the Check-in
  await tap(page, ckOpt('months'));
  await page.waitForTimeout(1100);
  s = await T(page);
  const pfold = await below('#ckPapersBox');
  check(s.leg === '3' && s.noteShown && /dossier is ready before the listings/.test(s.note) && s.papersBox && pfold.ok && s.codeline === 'AMS · TENANT SIDE · START · ABROAD · T-3M',
    `tap 3: leg 3, the when note; the papers fold appears in the Check-in, on the screen below the nav (${pfold.top}–${pfold.bottom})`);
  check(s.fMoveIn === ymPlus(2) && s.moveIn === 'In 1–3 months' && s.papers === '—' && s.ready === '',
    `the month prefilled in the door (${ymPlus(2)}) while the ticket says the answer; papers untouched: "—" and no line`);
  const tl = await page.evaluate(() => [...document.querySelectorAll('#checkin .ck-step')].map((e) => e.classList.contains('done')));
  check(tl.every(Boolean), 'the three answered steps fold');
  // the papers, ticked inside the Check-in's fold
  await page.$eval('#ckPapersBox', (d) => { d.open = true; });
  for (const d of ['id', 'contract', 'payslips']) await tap(page, ckDoc(d));
  await page.waitForTimeout(500);
  s = await T(page);
  check(s.papers === '3/8' && /^3 of 8 in hand\. Missing: Employer statement \(werkgeversverklaring\), Previous landlord reference, A guarantor, if your income falls short, Three months of bank statements, Motivation letter, Dutch and English\. Full Search prepares: Motivation letter, Dutch and English\. The rest we go through on the free call\.$/.test(s.ready),
    `three papers → "3/8" on the ticket; the line names what Full Search prepares of what is missing (the letter) and the rest ("${s.ready.slice(0, 40)}…")`);
  check(/^3\/8 · missing: Employer statement/.test(s.fDossier) && s.hash === '#checkin=zero.abroad.months.b', 'the hidden field names the missing, the URL carries the mask (id+contract+payslips = b)');
  // a chip picked by hand survives later answers: the Check-in suggests, never overwrites
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="attended-viewing"])');
  await page.waitForTimeout(400);
  s = await T(page);
  check(s.chip === 'attended-viewing' && s.planFrom === 'chip' && s.plan === 'Attended Viewing' && s.price !== '' && s.suggest && s.suggestText === 'Your answers suggest Full Search',
    'a chip picked by hand: the ticket shows ITS plan, the Check-in says "Your answers suggest Full Search" with a button');
  check(/^3 of 8 in hand\. Missing: .*\. The rest we go through on the free call\.$/.test(s.ready) && !/prepares/.test(s.ready) && !s.refundShown,
    'on Attended Viewing the papers line names nothing as prepared (it prepares no paper) and the refund rule is not shown');
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('later'));
  await page.waitForTimeout(700);
  s = await T(page);
  check(s.chip === 'attended-viewing' && s.planFrom === 'chip' && s.plan === 'Attended Viewing' && s.suggest, 'a later answer leaves the hand-picked chip and the ticket on it; the suggestion stays');
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="application-pack"])');
  await page.waitForTimeout(400);
  s = await T(page);
  check(s.plan === 'Application Pack' && /Application Pack prepares: Motivation letter, Dutch and English\./.test(s.ready), 'on Application Pack the line says what it prepares: the letter');
  await tap(page, '#ckSuggestUse');
  await page.waitForTimeout(400);
  await settle(page);
  s = await T(page);
  check(s.chip === 'full-search' && s.planFrom === 'checkin' && s.plan === 'Full Search' && !s.suggest, '"use it" puts the suggested plan in the door and on the ticket; the suggestion leaves');
  // the focused button hid itself: focus moves on to the ticket itself, on the screen — never dropped on <body> (review 22/10)
  const useFocus = await page.evaluate(() => { const e = document.activeElement, r = e.getBoundingClientRect(), bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra')); return { id: e.id || e.tagName, on: r.top >= bar - 1 && r.top < innerHeight }; });
  check(useFocus.id === 'pass' && useFocus.on, '"use it" hands the focus to the ticket, its top on the screen below the nav', JSON.stringify(useFocus));
  // the share row and the image
  const share = 'https://www.boomrome.com/amsterdam#checkin=zero.abroad.later.';
  await page.evaluate(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
  await tap(page, '#ckCopy');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => window.__copied) === share + 'b.l' && (await page.textContent('#ckCopied')) === 'Link copied', 'Copy link copies my own link WITH the papers (via l) and says so');
  const ckwa = await page.getAttribute('#ckWa', 'href');
  check(ckwa.startsWith('https://wa.me/?text=') && decodeURIComponent(ckwa).includes(share + '-.w') && !decodeURIComponent(ckwa).includes('.b.'), 'the share-to-a-friend link carries the answers (via w), never the papers');
  const img = await page.evaluate(async () => {
    const r = await window.BOOM_CHECKIN.passBlob();
    const b = r && (r.blob || r);
    if (!b || typeof b.arrayBuffer !== 'function') return null;
    const u = new Uint8Array(await b.arrayBuffer());
    const bmp = await createImageBitmap(b);
    return { type: b.type, size: b.size, head: String.fromCharCode(...u.slice(0, 4)), w: bmp.width, h: bmp.height };
  });
  check(img && (img.type === 'image/webp' ? img.head === 'RIFF' : img.type === 'image/png') && img.w === 1080 && img.h === 1920 && img.size > 10000,
    `passBlob() is a real ${img && img.type} 1080×1920, ${img && Math.round(img.size / 1024)} KB`);
  const events = await layer(page);
  check(events.filter((e) => e.name === 'plan_print').length === 1 && events.find((e) => e.name === 'plan_print').p.source === 'checkin' && events.filter((e) => e.name === 'checkin_result').length >= 1,
    'one plan_print (source checkin) for the whole session: the ticket prints once');
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS error, no foreign request through the whole Check-in', st.errors.join(' | ') + st.foreign.join(' | '));
  await ctx.close();
}
// round 2: on a short phone "use it" lands the ticket's top, never the doors
// as a floor — the new plan's name stays readable below the nav (it went
// under at 36–63px), the focus on the ticket
{
  const { ctx, page, st } = await open({ width: 375, height: 667 });
  await page.waitForTimeout(300);
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="attended-viewing"])');
  await page.waitForTimeout(300);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1400); await settle(page);
  await tap(page, '#ckSuggestUse');
  await page.waitForTimeout(1200); await settle(page);
  const f = await plateFocus(page);
  check(f.id === 'pass' && f.on && f.plan === 'Full Search' && f.planOk && st.errors.length === 0,
    `375×667: "use it" puts Full Search on the ticket and its name stays below the nav (${f.planTop}), the focus on the ticket`, JSON.stringify(f));
  await ctx.close();
}
// round 2 (finding 5/39/27 regression): the strip steps back where the doors land, so its height is
// not taken off the screen — the first tap (the answer centred, as a thumb would have it) lands the
// till at the foot of the screen, not 66–139px higher (the strip comes up during the landing's wait
// and was subtracted), and at 320×568 the FARE label and the €500 board stay below the nav
for (const [width, height] of [[320, 568], [390, 664]]) {
  const { ctx, page, st } = await open({ width, height });
  await page.waitForTimeout(800);
  await page.$eval(ckOpt('zero'), (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(300);
  await page.click(ckOpt('zero'));
  await page.waitForTimeout(2600); await settle(page);
  const g = await page.evaluate(() => {
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
    const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), ok: b.top >= bar && b.bottom <= innerHeight }; };
    return { fare: r('#pass .stub .slabel'), price: r('#ckPrice'), till: r('#ckStart'), ih: innerHeight };
  });
  check(g.fare.ok && g.price.ok && g.till.ok && g.till.bottom >= g.ih - 19 && st.errors.length === 0,
    `${width}×${height}, the first tap: the till lands at the foot of the screen (${g.till.bottom} of ${g.ih}, never a strip's height higher), the FARE label (${g.fare.top}) and the €500 (${g.price.top}) below the nav`, JSON.stringify(g));
  await ctx.close();
}
// a shortlist is pending inside the Check-in, with no ticket
{
  const { ctx, page } = await open();
  await page.waitForTimeout(300);
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(800);
  let s = await T(page);
  check(s.pend && s.pendInCk && /^One more answer decides: Attended Viewing if .*abroad, Application Pack if .*Amsterdam\.$/.test(s.pendText) && s.state === 'blank' && s.display === 'none' && !s.wrapShown,
    'a shortlist is pending INSIDE the Check-in (the two plans named) and no ticket prints');
  check(s.chip === '' && s.hash === '#checkin=shortlist.-.-.-' && s.live === s.pendText, 'pending writes nothing into the door; the URL remembers; the live line says it once');
  await tap(page, ckOpt('here'));
  await page.waitForTimeout(1300);
  s = await T(page);
  check(s.state === 'standby' && s.plan === 'Application Pack' && s.leg === '2' && s.from === 'IN TOWN' && !s.pend && s.fileBottom <= s.ih,
    `the second tap resolves: Application Pack printed, the plane on leg 2 from IN TOWN, the door on the screen (bottom ${s.fileBottom})`);
  await ctx.close();
}
// a plate's link prints the ticket on ITS plan and brings it into view
{
  const { ctx, page } = await open();
  await page.waitForTimeout(300);
  await tap(page, '#plate-application-pack .go');
  await page.waitForTimeout(1400);
  const s = await T(page);
  const ev = await layer(page);
  check(s.state === 'standby' && s.plan === 'Application Pack' && s.chip === 'application-pack' && s.planFrom === 'plate' && s.rect.top >= 0 && s.rect.top < 200 && !/#contact/.test(s.hash),
    `the plate's link prints the ticket on Application Pack and scrolls up to it (ticket top ${s.rect.top}px)`);
  check(s.why === 'You search. We make you win.' && ev.some((e) => e.name === 'plan_print' && e.p.source === 'plate'), 'with no answers the ticket says the plan\'s own line; plan_print source plate');
  await ctx.close();
}
// the plate's link by KEYBOARD (and by tap on the short phones): the focus
// moves with the page onto the ticket itself, whose top lands under the nav
// with the printed plan's name readable (review 22/10: it stayed on the plate,
// 3,000px below, and the next Tab threw the page back down to its pay button;
// round 2: landing a door as a floor pushed the plan's name under the nav on
// the short phones — the ticket's top is the landing, the door is the next Tab)
for (const [slug, width, height, how] of [['amsterdam', 390, 844, 'key'], ['amsterdam', 390, 664, 'key'], ['paris', 390, 844, 'key'], ['amsterdam', 375, 667, 'key'], ['amsterdam', 375, 667, 'tap'], ['amsterdam', 390, 664, 'tap'], ['amsterdam', 320, 568, 'key'], ['amsterdam', 320, 568, 'tap']]) {
  const { ctx, page, st } = await open({ slug, width, height, touch: how === 'tap' });
  await page.waitForTimeout(300);
  await page.$eval('#plate-application-pack .go', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(200);
  if (how === 'tap') await page.tap('#plate-application-pack .go');
  else { await page.focus('#plate-application-pack .go'); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(1400); await settle(page);
  const f = await plateFocus(page);
  let next = { inPass: true, plate: false, id: '(tap)' };
  if (how === 'key') {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200); await settle(page);
    next = await page.evaluate(() => { const e = document.activeElement; return { id: e.id, inPass: !!e.closest('#pass'), plate: !!e.closest('.sib') }; });
  }
  check(f.id === 'pass' && f.on && f.plan === 'Application Pack' && f.planOk && next.inPass && !next.plate && st.errors.length === 0,
    `${slug} ${width}×${height}, ${how === 'tap' ? 'a tap' : 'Enter'} on a plate's link: its plan printed, the focus on the ticket (top ${f.top}), "Application Pack" readable below the nav (${f.planTop})${how === 'key' ? `; the next Tab stays in the ticket (#${next.id})` : ''}`, JSON.stringify([f, next, st.errors]));
  await ctx.close();
}
// ...and the SAME target once a file is open or a payment is being confirmed
// (round 2, finding 26: only the viewport moved there, the focus stayed on the plate)
for (const state of ['open', 'confirming']) {
  const { ctx, page, st } = await open(state === 'confirming' ? { query: '?paid=full-search&start=1&session_id=cs_test_platefoc1' } : {});
  await page.waitForTimeout(400);
  if (state === 'open') {
    await page.fill('#fName', 'Focus Person'); await page.fill('#fEmail', 'focus@example.com');
    await tap(page, '#fGo');
    await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.$eval('#plate-application-pack .go', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(200);
  await page.focus('#plate-application-pack .go');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400); await settle(page);
  const f = await plateFocus(page);
  check(f.id === 'pass' && f.on && (await T(page)).state === (state === 'open' ? 'open' : 'confirming') && st.errors.length === 0,
    `${state === 'open' ? 'a file open' : 'a payment being confirmed'}: Enter on a plate's link brings the page AND the focus to the ticket (top ${f.top})`, JSON.stringify(f));
  await ctx.close();
}
// answering as a reader does — tapping each chip where it is, scrolled just
// clear of the nav — only the tap that prints the ticket lands its doors; the
// next two keep the next question, then the papers fold, under the reader's
// eyes (review 22/10: each tap re-landed the doors and the third question and
// the papers went under the nav)
for (const [slug, a] of [['amsterdam', ['zero', 'abroad', 'months']], ['barcelona', ['zero', 'abroad', 'soon']]]) {
  const { ctx, page } = await open({ slug });
  await page.waitForTimeout(300);
  const geo = () => page.evaluate(() => {
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
    const r = (q) => { const e = document.querySelector(q); if (!e || e.hidden || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), ok: b.top >= bar && b.bottom <= innerHeight }; };
    return { when: r('#checkin .ck-step[data-step="when"]'), papers: r('#ckPapersBox'), start: r('#ckStart'), file: r('#ckFile') };
  });
  const g = [];
  for (const v of a) {
    await page.$eval(ckOpt(v), (el) => { const r = el.getBoundingClientRect(), bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra')); if (r.top < bar + 4 || r.bottom > innerHeight) window.scrollBy({ top: r.top - bar - 20, behavior: 'instant' }); });
    await page.waitForTimeout(150);
    await page.click(ckOpt(v));
    // the landing waits for the steps' cross-fade (.26 s) and two frames: give it time to start before "it stands"
    await page.waitForTimeout(1000); await settle(page);
    g.push(await geo());
  }
  check(g[0].start && g[0].start.bottom <= 844 && g[1].when && g[1].when.ok && g[2].papers && g[2].papers.ok,
    `${slug} 390px, chips tapped where they are: tap 1 lands the doors (till ${g[0].start && g[0].start.bottom}), tap 2 keeps the third question below the nav (${g[1].when && g[1].when.top}), tap 3 the papers fold (${g[2].papers && g[2].papers.top})`, JSON.stringify(g));
  await ctx.close();
}
// answering by KEYBOARD (Space on each answer) at 390×844 and 390×664: the
// focused answer is never scrolled under the nav or off the screen (WCAG
// 2.4.11 — the landing aligned the lowest door with the bottom, no limit)
for (const height of [844, 664]) {
  const { ctx, page } = await open({ height });
  await page.waitForTimeout(300);
  const walk = [];
  for (const [step, v] of [['stage', 'zero'], ['where', 'abroad'], ['when', 'months']]) {
    const q = `#checkin input[name="ck-${step}"][value="${v}"]`;
    await page.focus(q);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000); await settle(page);
    walk.push(await page.evaluate((q) => { const i = document.querySelector(q), r = i.closest('label').getBoundingClientRect(), bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
      return { fv: i.matches(':focus-visible') && document.activeElement === i, top: Math.round(r.top), bottom: Math.round(r.bottom), ok: r.top >= bar && r.bottom <= innerHeight }; }, q));
  }
  check(walk.every((w) => w.fv && w.ok), `390×${height}: each answer chosen with Space keeps its focus ring on the screen, below the nav (${walk.map((w) => w.top).join(' · ')})`, JSON.stringify(walk));
  await ctx.close();
}

// ── the door: the ticket prints inside the click, the boarding pass on the 200 ──
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(400);
  await tap(page, '.hero-go');
  await page.waitForTimeout(900);
  await page.fill('#fName', 'Anna K.');
  await page.fill('#fEmail', 'anna@example.com');
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="full-search"])');
  // Chromium anchors the scroll by itself; Safari does not: the browser's own
  // anchoring is switched off so the page's manual anchoring is what is measured
  await page.addStyleTag({ content: 'html,body,*{overflow-anchor:none!important}' });
  const anchor = await page.evaluate(() => {
    const c = document.getElementById('contact'), b = c.getBoundingClientRect().top, p0 = document.getElementById('pass').getAttribute('data-state');
    document.getElementById('fGo').click();
    return { moved: Math.abs(c.getBoundingClientRect().top - b), before: p0, after: document.getElementById('pass').getAttribute('data-state'), y: scrollY };
  });
  check(anchor.before === 'blank' && anchor.after === 'standby' && anchor.moved < 4, `a submit with no ticket prints it inside the click, and the door moves ${anchor.moved.toFixed ? anchor.moved.toFixed(1) : anchor.moved}px (manual scroll anchoring, < 4)`);
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const s = await T(page);
  const when = (await page.textContent('#openWhen')).trim();
  check(s.state === 'open' && s.title === 'BOOM · Boarding pass' && s.status === 'OPEN' && s.statusSr === 'OPEN' && s.file === FILE && s.passenger === 'Anna K.',
    `on the 200 the ticket is a boarding pass: OPEN, File "${s.file}" from the server, Passenger the typed name`);
  check(WINDOW_RE.test(when) && s.when === when, `Boarding equals the OPEN card's reply window, computed against the desk clock ("${when}")`);
  check(s.stamp === 'FILE OPEN · BOOM AMSTERDAM' && s.struck && s.live === `Your file is open. File ${FILE}.`, 'the stamp FILE OPEN · BOOM AMSTERDAM strikes, the live line announces the file');
  // 390 is the stacked ticket: the stamp stays where it was, in the stub beside the fare, and the body keeps its padding
  const sb390 = await stampBox(page);
  check(sb390.w > 100 && sb390.inStub && !sb390.inBody && sb390.hits.length === 0 && sb390.pad === '14px',
    '390px: the stamp sits in the stub beside the fare as before, covering nothing; the struck body reserves no room (14px)', JSON.stringify(sb390));
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'fDone' && !(await page.isVisible('#cityForm')), 'focus is on the open file; the form gave way');
  check(!s.fileDoor.shown && s.start && s.start.shown && s.start.pay === 'full-search', 'the stub keeps its till (the offer to pay for the plan chosen), the free-call door leaves');
  const ev = await layer(page);
  check(ev.filter((e) => e.name === 'pass_issued').length === 1 && ev.find((e) => e.name === 'pass_issued').p.state === 'open' && ev.some((e) => e.name === 'plan_print' && e.p.source === 'door'),
    'pass_issued {state: open} once; plan_print source door');
  // the till from the stub: prefilled, and it carries the file
  await tap(page, '#ckStart');
  await page.waitForTimeout(500);
  check(await page.$eval('dialog#ov', (d) => d.open) && (await page.inputValue('#sName')) === 'Anna K.' && (await page.inputValue('#sEmail')) === 'anna@example.com' && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'full-search',
    'the stub\'s till opens the dialog on the plan with the name and email from the door already in');
  await page.click('#sGo');
  await page.waitForTimeout(600);
  let co = {};
  try { co = JSON.parse(st.checkouts[0].body); } catch (e) {}
  check(co.fileRef === 'city_ui0000test1' && co.kind === 'full-search' && !('eur' in co), 'the order carries the file opened in this tab (fileRef), never a price', JSON.stringify(co));
  // the passData of an issued ticket carries no file, no boarding, no name
  const pd = await page.evaluate(() => window.BOOM_CHECKIN.passData());
  const pj = JSON.stringify(pd);
  check(!('file' in pd) && !('when' in pd) && !('boarding' in pd) && !('name' in pd) && !pj.includes(FILE) && !pj.includes('Anna') && !/Boarding|By 19|from 09:00/.test(pj) && pd.guest === 'A tenant',
    'passData() of an issued ticket carries no file number, no boarding, no name: the passenger is "A tenant"');
  check(st.posts.length === 1 && st.errors.length === 0 && st.foreign.length === 0, 'one POST, no JS error, no foreign request', st.errors.join(' | '));
  await ctx.close();
}
// a failed send issues nothing and gives the button back
{
  const { ctx, page, st } = await open({ api: { status: 500, body: { ok: false, error: 'internal' } } });
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForFunction(() => document.getElementById('fErr').classList.contains('on'), null, { timeout: 4000 }).catch(() => {});
  const s = await T(page);
  check(st.posts.length === 1 && (await page.textContent('#fErr')) === await page.getAttribute('#cityForm', 'data-err-net'), 'a failed send shows the page\'s own error text, in place (no alert)');
  check(s.state === 'standby' && s.file === '—' && s.stamp === '' && s.statusSr === 'STANDBY' && !(await page.isVisible('#fDone')) && await page.$eval('#fGo', (e) => e.style.pointerEvents === '' && e.style.opacity === '1'),
    'nothing is issued: the ticket stays STANDBY with no file and no stamp, the button comes back');
  await ctx.close();
}
// "not sure yet" is the free first call: no till
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  await tap(page, '.chip.unsure');
  check((await page.textContent('#plText')) === 'Not sure yet · advise me', 'the plan line says "not sure yet · advise me"');
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const s = await T(page);
  check(s.plan === 'Your first call' && s.priceSr === 'Free' && s.price === 'FREE' && s.why === 'Nothing is charged for the call.' && s.start && !s.start.shown && s.state === 'open',
    '"not sure yet": the ticket is "Your first call", fare Free, "Nothing is charged for the call.", no till');
  await ctx.close();
}
// the door sends ONCE per tap: Enter three times in the email field during a slow round trip
{
  const { ctx, page, st } = await open({ api: { status: 200, body: LEAD_OK.body, delay: 1200 } });
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await page.focus('#fEmail');
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#fDone.on', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const ev = await layer(page);
  check(st.posts.length === 1 && ev.filter((e) => e.name === 'sign_up').length === 1 && ev.filter((e) => e.name === 'generate_lead').length === 1 && ev.filter((e) => e.name === 'plan_print').length === 1,
    `three Enters, one POST, one lead, one print (${st.posts.length} POST)`);
  await ctx.close();
}
// the 200 as a reader sees it (review 22/10), with the server taking 700 ms:
// the stamp strikes when it is ON the screen below the nav (it struck ~640px
// above, mid-glide); on a phone the page lands the confirmation's first step
// with the stub above it (it landed the €500 till alone, the "free call" line
// below the fold); side by side (1440) the page does not move. The form→card
// swap itself shifts what lies below the door: accepted (round 2, finding 4
// declined) — it happens only on a converting session, right after the
// visitor's own send, and the round-1 "hold" that hid it left a 229–404px
// blank band on a desktop and jumped the page on a slow scroll
for (const [width, height] of [[390, 844], [390, 664], [1440, 900]]) {
  const { ctx, page, st } = await open({ width, height, api: { ...LEAD_OK, delay: 700 } });
  await page.waitForTimeout(400);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1500); await settle(page);
  await page.fill('#fName', 'Anna K.'); await page.fill('#fEmail', 'anna@example.com');
  await page.$eval('#fGo', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(300);
  const y0 = await page.evaluate(() => {
    window.__strike = null;
    const p = document.getElementById('pass'), bar = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
    new MutationObserver(() => {
      if (window.__strike || !p.classList.contains('struck')) return;
      const r = document.getElementById('ckStamp').getBoundingClientRect();
      window.__strike = { top: Math.round(r.top), bottom: Math.round(r.bottom), seen: +((Math.min(r.bottom, innerHeight) - Math.max(r.top, bar())) / r.height).toFixed(2) };
    }).observe(p, { attributes: true, attributeFilter: ['class'] });
    return { y: scrollY, passTop: p.getBoundingClientRect().top };
  });
  await page.click('#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(2200); await settle(page);
  const g = await page.evaluate(() => {
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--boom-barra'));
    const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), ok: b.top >= bar && b.bottom <= innerHeight }; };
    return { strike: window.__strike, drawn: +getComputedStyle(document.getElementById('ckStamp'), '::after').opacity, h3: r('#fDone h3'), li: r('#fDone .next li'), till: r('#ckStart'), pass: r('#pass'), bar, y: scrollY, ae: document.activeElement.id, hold: document.getElementById('contact').style.marginBottom };
  });
  // 390×664: the stamp lands under the nav (the till and the first step win the short screen) — it waits, and strikes when the reader scrolls to it
  check(height === 664 ? (g.strike === null ? g.drawn === 0 : g.strike.seen >= 0.59) : !!g.strike && g.strike.seen >= 0.59,
    `${width}×${height}: the stamp strikes only once it is on the screen below the nav (${g.strike ? g.strike.seen * 100 + '% seen at the strike' : 'not yet: off screen, and not drawn at rest meanwhile'})`, JSON.stringify([g.strike, g.drawn]));
  if (width < 1100) check(g.h3.ok && g.li.ok && g.till.ok && g.ae === 'fDone',
    `${width}×${height}: the page lands "Your file is open" (${g.h3.top}) and its first step (${g.li.top}–${g.li.bottom}) on the screen, the stub's till above (${g.till.top}); focus on the open file`, JSON.stringify(g));
  else check((y0.passTop >= 0 ? Math.abs(g.y - y0.y) <= 1 : g.pass.top >= g.bar) && g.h3.ok && g.ae === 'fDone',
    `${width}px: side by side the ticket comes into view only if its top was off screen (${Math.round(y0.passTop)} → ${g.pass.top}), the card on the screen`, JSON.stringify([y0, g]));
  // no room is held under the door any more (round 1's margin hold is gone): nothing blank waits to be given back
  check(g.hold === '' && st.errors.length === 0, `${width}×${height}: no margin held under the door, no JS error`, JSON.stringify([g.hold, st.errors]));
  await ctx.close();
}
// "Prefer to talk first?" (review 22/10): the till's way out is the page's one
// door, by name, and it keeps the plan the reader was paying for — the TILL's
// choice, not the plate that opened it
{
  const { ctx, page } = await open();
  await page.waitForTimeout(500);
  await tap(page, '[data-pay="full-search"]');
  await page.waitForTimeout(500);
  await page.click('.payrow:has(input[value="application-pack"])');
  const talk = (await page.textContent('#ovTalk')).trim();
  await page.click('#ovTalk');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    open: document.getElementById('ov').open,
    chip: (document.querySelector('#cityForm input[name="service"]:checked') || {}).value || '',
    from: document.getElementById('cityForm').getAttribute('data-plan-from'),
  }));
  check(/^Start with a free call/.test(talk) && !after.open && after.chip === 'application-pack' && after.from === 'plate',
    'the till\'s "Start with a free call, no card" closes the dialog and leaves the door on the plan chosen in the till (application-pack, from "plate")', JSON.stringify([talk, after]));
  await ctx.close();
}

// ── the till: a plate's pay link opens the dialog on ITS plan, posts, follows, verifies ──
{
  const { ctx, page, st } = await open({ paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: true, workFromLabel: null } } });
  await page.waitForTimeout(500);
  await tap(page, '[data-pay="application-pack"]');
  await page.waitForTimeout(600);
  check(await page.$eval('dialog#ov', (d) => d.open) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack'
    && (await page.textContent('#sGoAmt')).trim() === '€199' && /Pay and book/.test((await page.textContent('#sGo')).replace(/\s+/g, ' ')) && !/start/i.test(await page.textContent('#sGo .tx b')),
    'the plate\'s pay link opens the dialog on Application Pack, €199 on the till button — which books (the tick is off)');
  check(await page.isVisible('#sStart') && !(await page.$eval('#sStart', (e) => e.checked)) && await page.isVisible('#ov .recesso'),
    'the till shows the 14-day withdrawal right and an UNTICKED "Start now" box');
  const beganAt = (await layer(page)).filter((e) => e.name === 'begin_checkout');
  check(beganAt.length === 1 && beganAt[0].p.value === 199 && beganAt[0].p.market === 'amsterdam', 'begin_checkout fires once, with the plan\'s value and the market');
  await page.click('.payrow:has(input[value="full-search"])');
  check((await page.textContent('#sGoAmt')).trim() === '€500', 'choosing another row changes the amount on the button');
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
  await page.waitForTimeout(200);
  await tap(page, '[data-pay="full-search"]');
  await page.waitForTimeout(400);
  check(await page.$eval('#sName', (e) => e.value) === 'Test Person', 'reopening the dialog keeps what was typed');
  await page.click('#sGo');
  await page.waitForURL(/paid=full-search/, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  let co = {};
  try { co = JSON.parse(st.checkouts[0].body); } catch (e) {}
  check(st.checkouts.length === 1 && co.city === 'amsterdam' && co.kind === 'full-search' && co.name === 'Test Person' && co.email === 'test@example.com' && co.company === '' && !('eur' in co) && !('price' in co) && co.startNow === false && !('fileRef' in co),
    'the sheet posts { city, kind, name, email, startNow:false } once — never a price, no fileRef without a file — and follows the URL', JSON.stringify(co));
  const s = await T(page);
  check(st.gets.length >= 1 && /\/api\/city-lead\?paid=cs_test_ui0000001&city=amsterdam$/.test(st.gets[0]) && s.state === 'paid' && s.status === 'PAID' && s.file === FILE && s.when === 'First open hour' && s.stamp === 'PAID · BOOM AMSTERDAM',
    `back from Stripe the page ASKS the server; paid:true → PAID, File ${FILE}, Boarding "First open hour", the stamp`, JSON.stringify([st.gets[0], s.state, s.file, s.when]));
  check(await page.isVisible('#fPaid') && !(await page.isVisible('#cityForm')) && /^Full Search · €500/.test((await page.textContent('#paidPlan')).trim()) && /Paid/.test(await page.textContent('#fPaid h3')) && await page.isVisible('#paidNext'),
    'the paid card shows the verified heading and its steps for the plan');
  const purchases = (await layer(page)).filter((e) => e.name === 'purchase');
  check(purchases.length === 1 && purchases[0].p.transaction_id === 'city_amsterdam_' + fnv('cs_test_ui0000001') && !/cs_/.test(JSON.stringify(purchases[0].p)) && purchases[0].p.value === 500,
    'ONE purchase event with the plan\'s value; its transaction id is an opaque hash, never Stripe\'s session id', JSON.stringify(purchases[0] && purchases[0].p));
  const keys = await page.evaluate(() => ({ s: Object.keys(sessionStorage), l: Object.keys(localStorage).filter((k) => /paid/.test(k)) }));
  check(keys.s.includes('boom:paid:cs_test_ui0000001') && keys.l.length === 0, 'the purchase key lives in sessionStorage for the tab, never in localStorage');
  check(!/paid=/.test(page.url()) && !/#/.test(page.url()), 'verified: the query is folded away, and no fragment is left (the URL can be shared without re-landing)', page.url());
  // the success tick draws only now, on the verified card (round 2: it drew while "being confirmed")
  check(await page.isVisible('#fPaid .tick') && await page.$eval('#fPaid', (c) => c.classList.contains('ok')), 'verified: the paid card\'s success tick is drawn');
  await page.goto(`${base}/amsterdam?paid=full-search&session_id=cs_test_ui0000001`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  check((await T(page)).state === 'paid' && (await layer(page)).filter((e) => e.name === 'purchase').length === 0, 'the same session again: PAID shows (the server says so), the sale is not counted twice');
  await ctx.close();
}
// ?paid= with the server still pending: confirming — no PAID, no stamp, no file, no purchase
{
  const { ctx, page, st } = await open({ query: '?paid=full-search&start=1&session_id=cs_test_pending01' });
  await page.waitForTimeout(2000);
  let s = await T(page);
  check(s.state === 'confirming' && s.status === 'STANDBY' && s.stamp === '' && s.file === '—' && s.plan === 'Full Search' && s.pendingShown && s.start && !s.start.shown && !s.fileDoor.shown,
    '?paid= with the server pending: the ticket prints CONFIRMING on the plan — STANDBY, the "being confirmed" line, no stamp, no file, no doors');
  check(await page.isVisible('#fPaid') && (await page.textContent('#fPaid h3')) === 'Payment being confirmed. Your confirmation comes by email.' && !(await page.isVisible('#paidNext')),
    'the paid card says the payment is being confirmed and hides its steps');
  // round 2 (P2): no success tick while the server has not said paid — it drew at once and stayed ~22 s
  check(!(await page.isVisible('#fPaid .tick')), 'confirming: no success tick on the paid card');
  // round 2: the Check-in freezes while the payment is confirmed too — the questions inert, the line in the tree
  const cz = await page.evaluate(() => { const l = document.getElementById('ckSent'); return { steps: document.getElementById('ckSteps').inert === true, papers: document.getElementById('ckPapersBox').inert === true, line: !l.hidden && l.offsetParent !== null && !l.closest('[inert]') ? l.textContent : null, all: document.getElementById('checkin').inert === true }; });
  check(cz.steps && cz.papers && !cz.all && cz.line === 'Payment being confirmed.', 'confirming: the Check-in\'s questions and papers are inert, its one line ("Payment being confirmed.") stays readable', JSON.stringify(cz));
  // the plates' pay buttons are gone while a payment is being confirmed
  check(await page.$$eval('.sib [data-pay]', (els) => els.length === 3 && els.every((b) => b.hidden && b.offsetParent === null)), 'confirming: the plates\' "Pay and start" buttons are hidden');
  check(!(await layer(page)).some((e) => e.name === 'purchase' || e.name === 'pass_issued'), 'no purchase event, nothing issued, while the server has not said paid');
  // review 22/10 (finding 40): the line with the desk's address stays while the
  // payment is being confirmed — it was hidden, and the card offered no way to write
  const cardWords = (pg) => pg.$eval('#fPaid', (card) => [...card.children].filter((el) => el.offsetParent !== null && el.tagName !== 'svg' && !el.classList.contains('tick'))
    .map((el) => el.innerText).join(' ').split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length);
  const mail0 = await page.$eval('#paidText', (p) => ({ shown: !p.hidden && p.offsetParent !== null, mail: (p.querySelector('a[href^="mailto:"]') || {}).href || '' }));
  const cw0 = await cardWords(page);
  check(mail0.shown && mail0.mail === 'mailto:hello@boom-rome.com' && cw0 <= 70,
    `confirming: the card keeps its line with the desk's address, a real mailto (${cw0} words on screen, ≤ 70)`, JSON.stringify(mail0));
  // review 22/10 (findings 18 + 43): no "Start with a free call" strip over a payment being confirmed
  await page.evaluate(() => document.querySelector('.faq').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  check(!(await page.$eval('#paybar', (e) => e.classList.contains('on'))), 'confirming, scrolled to the FAQ: the strip stays off (no free-call invitation to a payer)');
  // review 22/10 (finding 15): a plate's till never opens a second checkout while the payment is being confirmed
  // (hidden, so clicked by script: the handler itself refuses and brings the reader to the ticket)
  await page.$eval('.sib [data-pay="full-search"]', (b) => b.click());
  await page.waitForTimeout(900);
  const refused = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { open: document.getElementById('ov').open, focus: a && a.id, on: r.top >= 0 && r.top < innerHeight }; });
  check(!refused.open && st.checkouts.length === 0 && refused.focus === 'pass' && refused.on, 'confirming: a plate\'s "Pay and start" opens no till (no second checkout) and brings the reader to the ticket that says the payment is being confirmed', JSON.stringify(refused));
  await page.waitForTimeout(10000);
  s = await T(page);
  check(st.gets.length === 5 && s.state === 'confirming' && /paid=/.test(page.url()), `the page asks five times (0/1.5/3/6/12 s) and then stays confirming, the query kept for a later reload (${st.gets.length} asks)`);
  // finding 40: after the fifth unanswered ask the card and the stub say "not confirmed yet"; the address line stays
  const un = await page.getAttribute('#fPaid', 'data-unconfirmed');
  const cw1 = await cardWords(page);
  check(/^Not confirmed yet\./.test(un || '') && (await page.textContent('#fPaid h3')) === un && (await page.textContent('#ckPending')) === un && (await page.textContent('#ckSent')) === 'Not confirmed yet.' && await page.isVisible('#paidText') && !(await page.isVisible('#paidNext')) && !(await page.isVisible('#fPaid .tick')) && cw1 <= 70,
    `after the fifth unanswered ask: "${un}" on the card and the stub, "Not confirmed yet." on the frozen Check-in, no success tick, the address line still there (${cw1} words, ≤ 70)`);
  await ctx.close();
}
// review 22/10 (findings 14 + 38): what is tapped while the payment is being
// confirmed never re-plans the ticket — PAID stamps the plan PAID for
{
  const paid = { status: 200, body: { ok: true, pending: true } };
  const { ctx, page, st } = await open({ query: '?paid=full-search&start=1&session_id=cs_test_plate0001', paid });
  await page.waitForTimeout(1000);
  await tap(page, '.sib [data-service="application-pack"]');
  await page.waitForTimeout(700);
  let s = await T(page);
  check(s.state === 'confirming' && s.plan === 'Full Search' && s.priceSr === '€500' && s.chip === 'full-search',
    'confirming: a plate\'s link re-plans nothing — the ticket stays on the plan being paid (Full Search, €500)', JSON.stringify([s.state, s.plan, s.chip]));
  // whatever moved the chip while the page waited, the stamp strikes on the plan the server says was paid
  await page.evaluate(() => { document.querySelector('#cityForm input[name="service"][value="attended-viewing"]').checked = true; window.BOOM_CHECKIN.refresh(); });
  paid.body = { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: true };
  await page.waitForFunction(() => document.getElementById('pass').getAttribute('data-state') === 'paid', null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(300);
  s = await T(page);
  check(s.state === 'paid' && s.plan === 'Full Search' && s.priceSr === '€500' && s.chip === 'full-search' && decodeURIComponent(s.wa2).includes('My plan: Full Search'),
    'PAID: the ticket, the chip and the WhatsApp text name the plan the server confirmed, not a chip moved while waiting', JSON.stringify([s.plan, s.priceSr, s.chip]));
  // after PAID a plate's link still re-plans nothing (the hidden chip and the WhatsApp text stay the ticket's)
  await tap(page, '.sib [data-service="attended-viewing"]');
  await page.waitForTimeout(600);
  s = await T(page);
  check(s.chip === 'full-search' && decodeURIComponent(s.wa2).includes('My plan: Full Search') && s.plan === 'Full Search', 'after PAID a plate\'s link leaves the chip and the WhatsApp text on the paid plan');
  // finding 41: the paid ticket freezes the Check-in too (the questions inert, the line readable, back to the file's)
  const fz = await page.evaluate(() => { const l = document.getElementById('ckSent'); return { inert: document.getElementById('ckSteps').inert === true, sent: !l.hidden && !l.closest('[inert]'), text: l.textContent }; });
  check(fz.inert && fz.sent && fz.text === 'Your file is open. The desk takes it from here.' && st.errors.length === 0, 'PAID: the Check-in is frozen (its questions inert) with its one line, readable', JSON.stringify(fz));
  // round 2 (P1): after a verified PAID no pay control opens the till — the plates' buttons are gone, and the handler refuses
  const gone = await page.$$eval('.sib [data-pay]', (els) => els.every((b) => b.hidden && b.offsetParent === null));
  await page.$eval('.sib [data-pay="full-search"]', (b) => b.click());
  await page.waitForTimeout(800);
  const pp = await page.evaluate(() => ({ open: document.getElementById('ov').open, focus: document.activeElement.id }));
  check(gone && !pp.open && pp.focus === 'pass' && st.checkouts.length === 0, 'PAID: the plates\' "Pay and start" are hidden, and clicked anyway no till opens (dialog#ov closed) — the reader is brought to the ticket', JSON.stringify([gone, pp]));
  await ctx.close();
}
// review 22/10 (finding 17): a ?paid= without a well-formed Stripe session is not a payer coming back: the page stays as it is
for (const q of ['?paid=full-search', '?paid=full-search&session_id=garbage']) {
  const { ctx, page, st } = await open({ query: q });
  await page.waitForTimeout(700);
  const s = await T(page);
  check(await page.isVisible('#cityForm') && !(await page.isVisible('#fPaid')) && st.gets.length === 0 && s.state === 'blank' && !(await layer(page)).some((e) => e.name === 'purchase'),
    `${q}: the door stays, no "being confirmed" card, nothing asked, nothing printed`);
  await ctx.close();
}
// review 22/10 (finding 32): the file number is the server's — a 200 without one prints "—", never a number made here
{
  const { ctx, page } = await open({ api: { status: 200, body: { ok: true, id: 'city_ui0000nofile' } } });
  await page.waitForTimeout(400);
  await page.fill('#fName', 'No File');
  await page.fill('#fEmail', 'nofile@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  const s = await T(page);
  check(s.state === 'open' && s.file === '—' && s.live === 'Your file is open.', `a 200 {ok, id} with no file: OPEN, File "${s.file}", the live line names no number ("${s.live}")`);
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ query: '?paid=full-search&start=1&session_id=cs_test_nofile001', paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: null, startNow: true } } });
  await p2.waitForTimeout(1500);
  const s2 = await T(p2);
  check(s2.state === 'paid' && s2.file === '—' && s2.live === 'Payment confirmed.', `paid:true with no file: PAID, File "${s2.file}" ("${s2.live}")`);
  await c2.close();
}
// start=0: the server's own date on the boarding line and the waiting payer's steps
{
  const { ctx, page } = await open({ query: '?paid=full-search&start=0&session_id=cs_test_uiwait001', paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: false, workFromLabel: '4 November 2026' } } });
  await page.waitForTimeout(1500); await settle(page);
  const s = await T(page);
  check(s.state === 'paid' && s.when === 'From 4 November 2026', `startNow false: Boarding "${s.when}" (the webhook's computed date)`);
  const pv = await paidInView(page);
  check(pv.status.ok && pv.stamp.ok && pv.file.ok && pv.struck && pv.focus === 'pass' && pv.focusOn,
    `390px: back from Stripe the page lands on the ticket — PAID (${pv.status.top}), the struck stamp (${pv.stamp.top}) and the file number (${pv.file.top}) on the screen below the nav; the focus on the ticket itself, on the screen`, JSON.stringify(pv));
  const wait = (await page.textContent('#paidWait').catch(() => '')) || '';
  check(await page.isVisible('#paidWait') && /14 days end/.test(wait) && wait.includes('hello@boom-rome.com') && !(await page.isVisible('#paidText')),
    'the wait note takes the place of the generic note — the work begins when the 14 days end, and how to ask sooner', wait);
  const steps0 = (await page.textContent('#paidNext')).replace(/\s+/g, ' ');
  check(!/same working day/i.test(steps0) && /When the 14 days end/.test(steps0) && /start date/.test(steps0) && /Nothing by then\?/.test(steps0),
    'the three steps are the waiting payer\'s own (PAID_WAIT_NEXT) — never "same working day" — and the recourse stays', steps0);
  const seen = (pg) => pg.$eval('#fPaid', (card) => [...card.children].filter((el) => el.offsetParent !== null && el.tagName !== 'svg' && !el.classList.contains('tick'))
    .map((el) => el.innerText).join(' ').split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length);
  const w0 = await seen(page);
  check(w0 > 30 && w0 <= 70, 'the paid card a waiting payer reads is ≤ 70 words on screen', String(w0));
  await ctx.close();
  const { ctx: c1, page: p1 } = await open({ query: '?paid=full-search&start=1&session_id=cs_test_uinow0001', paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: true } } });
  await p1.waitForTimeout(1500);
  const steps1 = (await p1.textContent('#paidNext')).replace(/\s+/g, ' ');
  check(/Same working day/.test(steps1) && !(await p1.isVisible('#paidWait')) && await p1.isVisible('#paidText'), 'startNow true: the steps of a payer who asked to start, the generic note, no waiting line', steps1);
  const w1 = await seen(p1);
  check(w1 > 30 && w1 <= 70, 'the paid card is ≤ 70 words on screen', String(w1));
  await c1.close();
}
// round 2 (findings 1 + 9): the paid return lands on the TICKET as production
// loads it — gtag.js held 500 ms (it holds `load`), with the new success URL
// and with a legacy one still ending in #contact (the browser re-applies the
// fragment scroll at `load`, after the page's own landing: it took the page
// back to the door on 11 runs of 16): the stamp and the file number below the
// nav, the focus on the ticket itself, on the screen
for (const [width, height] of [[390, 844], [1024, 768], [1440, 900]]) {
  for (const frag of ['', '#contact']) {
    const { ctx, page, st } = await open({ width, height, touch: width < 600, hold: 500, query: `?paid=full-search&start=0&session_id=cs_test_uiland001${frag}`, paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: false, workFromLabel: '4 November 2026' } } });
    await page.waitForTimeout(2200); await settle(page);
    const pv = await paidInView(page);
    check(pv.stamp.ok && pv.file.ok && pv.struck && pv.focus === 'pass' && pv.focusOn && !/#/.test(page.url()) && st.errors.length === 0,
      `${width}×${height}, gtag.js holding load 500 ms, ${frag ? 'a legacy return with #contact' : 'the success URL'}: the struck stamp (${pv.stamp.top}) and the file (${pv.file.top}) on the screen below the nav, the focus on the ticket, no fragment left`, JSON.stringify([pv, page.url()]));
    await ctx.close();
  }
}
// a ?paid= naming no plan of ours, or an inherited key, does nothing
{
  const { ctx, page, st } = await open({ query: '?paid=constructor&session_id=cs_x' });
  await page.waitForTimeout(500);
  check(!(await page.isVisible('#fPaid')) && await page.isVisible('#cityForm') && !(await layer(page)).some((e) => e.name === 'purchase') && st.gets.length === 0 && (await T(page)).state === 'blank',
    '?paid=constructor shows nothing, asks nothing, counts nothing');
  const { ctx: c2, page: p2, st: s2 } = await open({ query: '?paid=concierge&session_id=cs_x' });
  check(!(await p2.isVisible('#fPaid')) && await p2.isVisible('#cityForm') && s2.gets.length === 0, 'a ?paid= naming a plan that is not ours is ignored');
  await c2.close();
  await ctx.close();
}
// the "Start now" tick travels to the server and the button follows it
{
  const { ctx, page, st } = await open({ checkout: { status: 200, body: { ok: true, url: `${base}/amsterdam?paid=attended-viewing&start=1&session_id=cs_test_uitick001` } } });
  await page.waitForTimeout(500);
  await tap(page, '[data-pay="attended-viewing"]');
  await page.waitForTimeout(500);
  await page.fill('#sName', 'Tick Person');
  await page.fill('#sEmail', 'tick@example.com');
  /* Enter on the checkbox toggles nothing and pays nothing */
  await page.focus('#sStart');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(st.checkouts.length === 0 && await page.$eval('dialog#ov', (d) => d.open), 'Enter on the "Start now" box posts nothing: the dialog stays open', String(st.checkouts.length));
  const sub0 = (await page.textContent('#sGo .tx small')).trim();
  await page.click('#ov label.startnow');
  check(await page.$eval('#sStart', (e) => e.checked), 'tapping the line ticks the box (the whole label is the target)');
  const b1 = (await page.textContent('#sGo .tx b')).trim(), sub1 = (await page.textContent('#sGo .tx small')).trim();
  check(b1 === 'Pay and start' && /first open hour/.test(sub1) && /14 days/.test(sub0), 'ticked, the button says "Pay and start" and when (the first desk hour); unticked it said the 14 days', JSON.stringify([sub0, b1, sub1]));
  await page.click('#ov label.startnow');
  const b2 = (await page.textContent('#sGo .tx b')).trim();
  await page.click('#ov label.startnow');
  check(b2 === 'Pay and book' && (await page.textContent('#sGo .tx b')).trim() === 'Pay and start', 'untick → "Pay and book" again; tick → "Pay and start": the button follows the box both ways');
  await page.click('#sGo');
  await page.waitForURL(/paid=attended-viewing/, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(700);
  let co = {};
  try { co = JSON.parse(st.checkouts[0].body); } catch (e) {}
  check(co.startNow === true, 'a ticked box posts startNow:true — the payer\'s own request, never inferred', JSON.stringify(co));
  await ctx.close();
}
// a failed checkout says so in the dialog and gives the button back
{
  const { ctx, page, st } = await open({ checkout: { status: 500, body: { ok: false, error: 'stripe_failed' } } });
  await page.waitForTimeout(400);
  await tap(page, '[data-pay="full-search"]');
  await page.waitForTimeout(400);
  await page.fill('#sName', 'Test Person');
  await page.fill('#sEmail', 'test@example.com');
  await page.click('#sGo');
  await page.waitForFunction(() => document.getElementById('sErr').classList.contains('on'), null, { timeout: 4000 }).catch(() => {});
  check(st.checkouts.length === 1 && (await page.textContent('#sErr')) === await page.getAttribute('#ov', 'data-err-net') && !(await page.$eval('#sGo', (e) => e.classList.contains('busy'))) && /amsterdam$/.test(page.url().split('#')[0]),
    'a failed checkout: the dialog says so in its own words, the button comes back, the page stays');
  await ctx.close();
}
// the model withdrawal form: blank unless the link names the desk and the service
{
  const { ctx, page, st } = await open({ slug: 'withdrawal' });
  const blank = await page.evaluate(() => [document.getElementById('wService').value, document.getElementById('wCity').value, decodeURIComponent(document.getElementById('wSend').href)]);
  check(blank[0] === '' && blank[1] === '' && /following service: …\./.test(blank[2]) && /subject=Withdrawal&/.test(blank[2]),
    'the form page with no link details: no service, no desk pre-chosen, the email says … instead of a guess', JSON.stringify(blank));
  await page.close();
  const pg = await ctx.newPage();
  await pg.goto(`${base}/withdrawal?desk=madrid&service=full-search`, { waitUntil: 'load' });
  const named = await pg.evaluate(() => [document.getElementById('wService').value, document.getElementById('wCity').value, decodeURIComponent(document.getElementById('wSend').href)]);
  check(named[0] === 'full-search' && named[1] === 'Madrid' && /following service: Full Search \(Madrid\)\./.test(named[2]),
    'the link from the paid email names the desk and the service: both chosen, the email says them by name', JSON.stringify(named));
  await pg.goto(`${base}/withdrawal?desk=Lisbon&service=nonsense`, { waitUntil: 'load' });
  const odd = await pg.evaluate(() => [document.getElementById('wService').value, document.getElementById('wCity').value]);
  check(odd[0] === '' && odd[1] === '', 'an unknown desk or service in the link chooses nothing', JSON.stringify(odd));
  check(st.errors.length === 0, 'the form page: no JS errors', st.errors.join(' | '));
  await ctx.close();
}
// the door's own errors
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(600);
  const picked = () => page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; });
  check(await picked() === '', 'no service is pre-checked when the page opens');
  check(await page.$eval('#fMoveIn', (s) => s.options[0].value === '' && s.options[0].textContent === 'Not sure yet' && [...s.options].slice(1).every((o) => /^\d{4}-\d{2}$/.test(o.value))),
    'the move-in field is a month select: "Not sure yet" first, then months as YYYY-MM');
  await tap(page, '.chip:has(input[value="application-pack"])');
  check(await picked() === 'application-pack' && (await page.textContent('#plText')) === 'Application Pack · €199 · flat · incl. VAT', 'tapping a chip chooses the service and the plan line says it (no "from your check-in": the chip was the hand)');
  check((await T(page)).state === 'blank', 'a chip never prints the ticket (it would insert ~600px above the reader)');
  await tap(page, '#fGo');
  check(st.posts.length === 0 && await page.$eval('#fErr', (e) => e.classList.contains('on')) && (await page.textContent('#fErr')) === await page.getAttribute('#cityForm', 'data-err-name') && (await T(page)).state === 'blank',
    'an empty form sends nothing, prints nothing and says, in place, that the name is missing');
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'not-an-email');
  await tap(page, '#fGo');
  check(st.posts.length === 0 && (await page.textContent('#fErr')) === await page.getAttribute('#cityForm', 'data-err-email'), 'a broken email is named, nothing is sent');
  await page.fill('#fEmail', 'test@example.com');
  await page.selectOption('#fMoveIn', { index: 3 });
  await page.selectOption('#fBudget', { index: 2 });
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  check(st.posts.length === 1 && st.posts[0].headers['content-type'] === 'application/json' && sent.city === 'amsterdam' && sent.name === 'Test Person'
    && sent.email === 'test@example.com' && sent.service === 'application-pack' && sent.budget === '€1,500 – €2,000' && /^\d{4}-\d{2}$/.test(sent.moveIn) && sent.company === '' && /^[a-z0-9]{8,40}$/.test(sent.requestId),
    'a valid submit posts JSON once, with the city, the chosen service, the band, the month, a request id and an empty honeypot', JSON.stringify(sent));
  const mo = await page.$eval('#fMoveIn', (s) => s.options[s.selectedIndex].textContent);
  check((await T(page)).moveIn === mo, `the month the reader picked is the ticket's Move-in ("${mo}")`);
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS errors, no request to a host the page should not call', st.errors.join(' | ') + st.foreign.join(' | '));
  await ctx.close();
}

// ── links land where they say ────────────────────────────────────────────
{
  const { ctx, page } = await open({ query: '#checkin=zero.abroad.soon.-' });
  await page.waitForTimeout(1900);
  let s = await T(page);
  check(s.state === 'standby' && s.plan === 'Full Search' && s.codeline === 'AMS · TENANT SIDE · START · ABROAD · T-4W' && s.landing === null && s.leg === '3',
    'my own link lands straight on the printed ticket: Full Search for someone who has not started, no banner, the plane at the end');
  check(s.note === 'Four weeks is tight. We say so in the first call.' && s.ready === '' && s.papersBox,
    'haven\'t started + within four weeks: the refusal is on the ticket; the papers fold offered, untouched');
  check(s.start.pay === 'full-search' && s.start.amt === '€500' && s.fMoveIn === ymPlus(1), 'the till on the stub says €500; the month prefilled one month out');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ query: '#checkin=xx.yy' });
  await p2.waitForTimeout(600);
  s = await T(p2);
  check(s.state === 'blank' && JSON.stringify(s.stepsShown) === '[true,false,false]' && !/checkin/.test(await p2.evaluate(() => location.hash)),
    'a broken link opens the first step, nothing pre-ticked, and the address bar is clean');
  await c2.close();
  const { ctx: c2b, page: p2b } = await open({ query: '#checkin=zero.abroad.nowhere.-.w' });
  await p2b.waitForTimeout(800);
  s = await T(p2b);
  check(s.state === 'standby' && s.plan === 'Full Search' && s.landing === '2 of 3 answered, from the link you received.' && JSON.stringify(s.stepsShown) === '[true,true,true]',
    'a received link with one answer that does not exist keeps the two that do: the ticket printed, the third step open, the banner counting');
  await c2b.close();
  const { ctx: c3, page: p3 } = await open({ query: '#checkin=shortlist.here.later.ff.l' });
  await p3.waitForTimeout(1900);
  s = await T(p3);
  check(s.plan === 'Application Pack' && /^All eight in hand\. The rest we go through on the free call\.$/.test(s.ready) && await p3.$$eval('#checkin input[name="ck-doc"]', (els) => els.every((e) => e.checked)) && s.papers === '8/8',
    'docs mask ff on my own link (via l): all eight ticked, "8/8", nothing named as prepared (nothing is missing)');
  await c3.close();
  const { ctx: c4, page: p4 } = await open({ query: '#checkin=zero.abroad.soon.b.w' });
  await p4.waitForTimeout(1200);
  s = await T(p4);
  check(s.state === 'standby' && s.landing === "Your friend's answers. Change any of them, then your plan is yours." && s.papers === '—'
    && await p4.$$eval('#checkin input[name="ck-doc"]', (els) => els.every((e) => !e.checked)),
    'a friend\'s link (via w): the ticket with the banner, and the friend\'s papers NOT ticked — the mask is ignored on a received link');
  check((await layer(p4)).find((e) => e.name === 'deeplink_landing').p.via === 'w', 'the landing event names the via');
  await c4.close();
  const { ctx: c5, page: p5 } = await open({ query: '#checkin=shortlist.-.-.-.w' });
  await p5.waitForTimeout(800);
  s = await T(p5);
  check(s.pend && s.state === 'blank' && s.landing === '1 of 3 answered, from the link you received. One tap to your plan.' && JSON.stringify(s.stepsShown) === '[true,true,false]',
    'a received partial link lands on the next step, pending in the Check-in, and counts the taps to the plan');
  await c5.close();
  // an own reload is a resume, not "the link you received"
  const { ctx: c6, page: p6 } = await open();
  await tap(p6, ckOpt('shortlist'));
  await p6.waitForTimeout(500);
  await p6.reload({ waitUntil: 'load' });
  await p6.waitForTimeout(800);
  s = await T(p6);
  const ev6 = await layer(p6);
  check(s.pend && s.landing === null && s.hash === '#checkin=shortlist.-.-.-' && ev6.some((e) => e.name === 'checkin_resume') && !ev6.some((e) => e.name === 'deeplink_landing'),
    'my own answer, back after a reload: restored in silence (no banner, a resume event, not a deep link)');
  await c6.close();
}

// ── the review of 17/10, still true: what a real tap sequence found ──────
{
  const { ctx, page } = await open();
  // a pending stage clears a chip the Check-in wrote, never one the reader chose
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(700);
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="application-pack"])');
  await tap(page, '#checkin .ck-step[data-step="stage"] .ck-change');
  await page.waitForTimeout(300);
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(700);
  let s = await T(page);
  check(s.pend && s.chip === 'application-pack' && s.planFrom === 'chip' && s.state === 'standby' && s.plan === 'Application Pack',
    'a pending stage never clears a chip the reader chose; the printed ticket stays on it');
  // "change", then the same answer: the step folds
  await tap(page, '#checkin .ck-step[data-step="stage"] .ck-change');
  await page.waitForTimeout(200);
  const openBefore = await page.$$eval('#checkin .ck-step[data-step="stage"] .ck-opt', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(300);
  check(openBefore === 3 && await page.$eval('#checkin .ck-step[data-step="stage"]', (e) => e.classList.contains('done')), 're-picking the same answer after "change" folds the step again');
  // the month the page prefilled follows the answer and leaves with it; a month the reader picked stays
  await tap(page, ckOpt('abroad'));
  await page.waitForTimeout(500);
  await tap(page, ckOpt('soon'));
  await page.waitForTimeout(500);
  check((await T(page)).fMoveIn === ymPlus(1), `within four weeks → ${ymPlus(1)} prefilled`);
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('later'));
  await page.waitForTimeout(500);
  check((await T(page)).fMoveIn === '', '"later, flexible": the page\'s own prefill leaves');
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('months'));
  await page.waitForTimeout(500);
  check((await T(page)).fMoveIn === ymPlus(2), `"1–3 months" → ${ymPlus(2)}`);
  await page.selectOption('#fMoveIn', { index: 8 });
  const mine = await page.inputValue('#fMoveIn');
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('soon'));
  await page.waitForTimeout(500);
  check((await T(page)).fMoveIn === mine && mine !== ymPlus(1), 'a month the reader picked is never touched by a changed answer');
  // four quick paper ticks are four ticks
  await page.$eval('#ckPapersBox', (d) => { d.open = true; });
  for (const d of ['id', 'contract', 'payslips', 'bank']) { await page.$eval(ckDoc(d), (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.$eval(ckDoc(d) + ' input', (el) => el.click()); await page.waitForTimeout(120); }
  await page.waitForTimeout(500);
  check((await T(page)).papers === '4/8', 'four ticks 120 ms apart → "4/8"');
  // the boards are decorative; the price, the status and the city are read as text
  const a11y = await page.evaluate(() => ({ sr: document.getElementById('ckPriceSr').textContent, boardHidden: document.getElementById('ckPrice').getAttribute('aria-hidden'), statusHidden: document.getElementById('ckStatus').getAttribute('aria-hidden'), statusSr: document.getElementById('ckStatusSr').textContent, h1: document.querySelector('.hero h1 .sr').textContent, flapHidden: document.getElementById('flapCity').getAttribute('aria-hidden'), lives: [...document.querySelectorAll('#passWrap [aria-live], #passWrap [role=status]')].map((e) => e.id) }));
  check(a11y.sr === '€199' && a11y.boardHidden === 'true' && a11y.statusHidden === 'true' && a11y.statusSr === 'STANDBY' && a11y.h1 === 'Amsterdam' && a11y.flapHidden === 'true' && JSON.stringify(a11y.lives) === '["ckCopied","ckSaved"]',
    'the boards are decorative with the text beside them; the printer carries exactly two live regions (Copied, Saved)', JSON.stringify(a11y));
  await ctx.close();
}
{
  // the phone's focus order: answer → the ticket → the door; the menu is inert off-screen
  const { ctx, page } = await open();
  const menu = await page.evaluate(() => { const m = document.getElementById('mobileMenu'); return { inert: m.inert === true, vis: getComputedStyle(m).visibility, ah: m.getAttribute('aria-hidden') }; });
  check(menu.inert && menu.vis === 'hidden' && menu.ah === 'true', 'closed, the menu is inert, visibility hidden and aria-hidden');
  await page.focus('#navToggle');
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => !document.getElementById('mobileMenu').contains(document.activeElement) && !!document.activeElement.closest('header.hero')), 'Tab from the burger skips the off-screen links and lands in the hero');
  await page.click('#navToggle');
  await page.waitForTimeout(600);
  check(await page.evaluate(() => document.getElementById('mobileMenu').contains(document.activeElement) && document.body.classList.contains('menu-open') && !!document.querySelector('#mobileMenu a[href="#plan"]')), 'open, focus moves into the menu, which links "Your plan"');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => !document.getElementById('mobileMenu').classList.contains('active') && document.activeElement.id === 'navToggle'), 'Escape closes it and gives focus back to the burger');
  await tap(page, ckOpt('zero')); await page.waitForTimeout(700);
  await tap(page, ckOpt('abroad')); await page.waitForTimeout(700);
  await tap(page, ckOpt('months')); await page.waitForTimeout(900);
  await page.focus('#checkin input[name="ck-when"]:checked');
  const seq = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => document.activeElement.closest('#passWrap') ? 'pass' : document.activeElement.closest('#contact') ? 'door' : document.activeElement.closest('#checkin') ? 'ck' : 'other')); }
  const fp = seq.indexOf('pass'), fd = seq.indexOf('door');
  check(fp > -1 && (fd === -1 || fp < fd), `after the third answer Tab reaches the ticket before the door (${seq.join(' → ')})`);
  await ctx.close();
}

// ── the strip: past the hero's door, never over the door or the ticket ──
{
  const { ctx, page } = await open();
  await page.waitForTimeout(500);
  const on = () => page.$eval('#paybar', (e) => e.classList.contains('on'));
  await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(600);
  check(await on() && (await page.textContent('#stripGo')).trim() === 'Start with a free call' && SUB_RE('no card').test((await page.textContent('#stripSub')).trim()) && !/€/.test(await page.textContent('#paybar .pinfo')),
    'past the hero the strip comes up, with the one label and no price');
  const ic = await page.$eval('#stripWa', (a) => ({ al: a.getAttribute('aria-label'), h: a.getBoundingClientRect().height, w: a.getBoundingClientRect().width, t: a.textContent.trim(), href: a.getAttribute('href') }));
  check(ic.al === 'WhatsApp' && ic.h >= 44 && ic.w >= 44 && ic.t === '' && ic.href === MARKER, 'the strip\'s WhatsApp icon: 44px, named, no digits, the desk marker', JSON.stringify(ic));
  await page.evaluate(() => document.getElementById('contact').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.waitForTimeout(600);
  check(!(await on()), 'over the door the strip steps back');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  check(!(await on()), 'while the hero\'s door is on screen the strip is off');
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1300);
  check(!(await on()), 'with the ticket on screen the strip is off');
  await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(600);
  const sw = await page.getAttribute('#stripWa', 'href');
  check(await on() && (await page.textContent('#stripSub')) === 'Full Search · your plan' && sw.startsWith(MARKER) && decodeURIComponent(sw).includes('My plan: Full Search'),
    'past it, the strip names the plan (never the price) and its WhatsApp icon carries the plan after the desk marker');
  await page.$eval('[data-pay="full-search"]', (el) => el.click());
  await page.waitForTimeout(300);
  check(!(await on()), 'the strip steps back while the dialog is open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  check(await on(), 'and comes back when it closes — without a scroll');
  await page.fill('#fName', 'Test Person'); await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(600);
  check(!(await on()), 'once a file is issued the strip is gone for good');
  await page.click('#navToggle');
  await page.waitForTimeout(300);
  await page.click('#mobileMenu a[href="#faq"]');
  await page.waitForTimeout(300);
  check(!(await page.$eval('#mobileMenu', (e) => e.classList.contains('active'))), 'a menu link closes the menu');
  await ctx.close();
}

// ── the consent plate waits for the reader ───────────────────────────────
{
  const { ctx, page } = await open({ consent: false });
  await page.waitForTimeout(2200);
  check(!(await plateUp(page)) && await page.$eval('body', (b) => b.hasAttribute('data-consent-late')), 'with data-consent-late the plate is not on the first screen after two seconds of reading');
  // the unanswered Check-in in the band the plate would cover: armed, it still waits
  await page.evaluate(() => { const r = document.getElementById('checkin').getBoundingClientRect(); window.scrollBy({ top: r.bottom - innerHeight + 10, behavior: 'instant' }); });
  await page.mouse.wheel(0, 2);
  await page.waitForTimeout(1800);
  check(!(await plateUp(page)), 'the unanswered Check-in on the screen, in the plate\'s band: armed, the plate still waits');
  await page.click(ckOpt('zero'));
  await page.waitForTimeout(1800);
  await page.evaluate(() => { const r = document.getElementById('pass').getBoundingClientRect(); window.scrollBy({ top: r.bottom - (innerHeight - 50), behavior: 'instant' }); });
  await page.waitForTimeout(1600);
  check(!(await plateUp(page)), 'the printed ticket in the plate\'s band: the reader is at work, the plate still waits');
  // the 45 s cap holds: time moves on, the plate comes even over the ticket
  await page.evaluate(() => { const real = Date.now.bind(Date), skew = 46000; Date.now = () => real() + skew; });
  await page.waitForTimeout(1800);
  check(await plateUp(page), 'after 45 s of waiting the plate comes anyway (the cap holds)');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ consent: false });
  await p2.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await p2.waitForTimeout(400);
  await p2.$eval('[data-pay="full-search"]', (el) => el.click());   // the till
  await p2.waitForTimeout(300);
  await p2.mouse.wheel(0, 40);
  await p2.waitForTimeout(1800);
  check(await p2.$eval('dialog#ov', (d) => d.open) && !(await plateUp(p2)), 'while the till dialog is open the plate holds back');
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(1500);
  check((await plateUp(p2)), 'once the dialog closes the plate comes');
  await c2.close();
}
// v1.4 put the gold door in the hero and the Check-in below it: on a short
// phone the plate landed ON the door, «Accept» where «Start with a free call»
// was (review 22/10). It waits while the hero's door is under it.
{
  const doorFree = (page) => page.evaluate(() => {
    const g = document.querySelector('.hero-go').getBoundingClientRect();
    return g.top >= 0 && g.bottom <= innerHeight && [0.25, 0.5, 0.75].every((f) => { const e = document.elementFromPoint(g.left + g.width / 2, g.top + g.height * f); return !!(e && e.closest('.hero-go')); });
  });
  const { ctx, page } = await open({ consent: false, width: 390, height: 664, touch: true });
  await page.waitForTimeout(9800);                           // the 8 s auto-arm, + 600 ms, + a re-check
  check(!(await plateUp(page)) && await doorFree(page), '390×664, nothing touched: armed, the plate waits while the hero\'s door is in its band — the door is the door, not «Accept»');
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(2600);
  check(await plateUp(page), 'scrolled past the hero\'s door, the plate comes');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ consent: false, width: 360, height: 640, touch: true });
  await p2.waitForTimeout(300);
  await p2.mouse.wheel(0, 1);                                // the reader's first move arms the wait
  await p2.waitForTimeout(2600);
  check(!(await plateUp(p2)) && await doorFree(p2), '360×640, armed: the plate holds while the hero\'s door is under it');
  await p2.evaluate(() => { const real = Date.now.bind(Date), skew = 46000; Date.now = () => real() + skew; });
  await p2.waitForTimeout(1800);
  check(await plateUp(p2), 'and its 45 s cap still holds over the hero\'s door');
  await c2.close();
}
// round 2 (finding 37 note): the plate meets what it would really cover — in
// height AND in width. On a 1920px screen the desktop plate (left, 16–364px)
// is level with the hero's door (438px →) but beside it: it comes; at 1280×720
// it would sit on the door: it holds
{
  const { ctx, page } = await open({ consent: false, width: 1920, height: 860 });
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 1);
  await page.waitForTimeout(2600);
  const g = await page.evaluate(() => { const c = document.querySelector('.hero-cta').getBoundingClientRect(), p = document.querySelector('.boomcst').getBoundingClientRect(); return { level: p.top < c.bottom && p.bottom > c.top, beside: p.right <= c.left }; });
  check(g.level && g.beside && await plateUp(page), '1920×860: the plate is level with the hero\'s door but beside it — it comes (no hold on a vertical overlap alone)', JSON.stringify(g));
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ consent: false, width: 1280, height: 720 });
  await p2.waitForTimeout(300);
  await p2.mouse.wheel(0, 1);
  await p2.waitForTimeout(2600);
  check(!(await plateUp(p2)), '1280×720: the plate would sit on the hero\'s door — it holds');
  await c2.close();
}

// ── reduced motion: nothing animates, every final state visible ─────────
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const b = await board(page);
  check(b.cells === 9 && b.letters === 'AMSTERDAM', 'with reduced motion the board is set still on AMSTERDAM, immediately');
  check(await page.$$eval('.rv .step, .rv .flow', (els) => els.every((e) => getComputedStyle(e).opacity === '1')), 'with reduced motion the children of a block do not wait for a stagger');
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(250);
  await tap(page, ckOpt('abroad'));
  await page.waitForTimeout(150);
  let s = await T(page);
  const anim = () => page.evaluate(() => ['.uscita', '.stamp', '.pplane', '#ckStatus', '#ckPrice'].map((q) => document.querySelector(q).getAnimations({ subtree: true }).length));
  const a1 = await anim();
  check(s.state === 'standby' && s.price === '€500' && s.status === 'STANDBY' && s.leg === '2' && a1.every((n) => n === 0),
    `under reduced motion the ticket arrives set — no emission, no plane glide, the boards set at once (animations ${a1.join('/')})`);
  await page.fill('#fName', 'Test Person'); await page.fill('#fEmail', 'test@example.com');
  // sent from the keyboard, the pointer parked in the corner: the landing scroll must not slide the
  // stub's till under a resting pointer (a hover colour fade is not motion, and not what is measured)
  await page.mouse.move(0, 0);
  await page.focus('#fEmail'); await page.keyboard.press('Enter');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(100);
  s = await T(page);
  const a2 = await anim();
  const stampVis = await page.$eval('#ckStamp', (e) => { const cs = getComputedStyle(e, '::after'); return cs.display !== 'none' && +cs.opacity > 0.5 && cs.content.includes('FILE OPEN'); });
  check(s.state === 'open' && s.status === 'OPEN' && stampVis && a2.every((n) => n === 0), `issued under reduced motion: OPEN and the stamp visible at once, no strike, no flash (animations ${a2.join('/')})`);
  await ctx.close();
}
// the motion, when it is allowed: the emission runs once, the children of a block follow one beat apart
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  const before = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).opacity));
  await page.evaluate(() => document.getElementById('how').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(1600);
  const after = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).opacity));
  const delays = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).transitionDelay));
  check(before.every((o) => o === '0') && after.every((o) => o === '1') && new Set(delays).size === delays.length, `the steps start hidden and arrive one beat apart (delays ${delays.join(' ')})`);
  await page.evaluate(() => scrollTo(0, 0));
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(120);
  const em = await page.evaluate(() => document.getElementById('pass').getAnimations().map((a) => a.animationName));
  check(em.includes('emissione'), 'the first print runs the emission (the card leaves the slot)', JSON.stringify(em));
  await ctx.close();
}

// ── the desk's weekend: every promise says the window ────────────────────
{
  const { ctx, page } = await open({ clock: '2026-10-17T09:00:00Z' });   // Saturday 11:00 in Rome (CEST)
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => ({ subs: [...document.querySelectorAll('[data-door-sub]')].map((e) => e.querySelector('small').textContent), strip: document.getElementById('stripSub').textContent, dataSub: document.getElementById('paybar').getAttribute('data-sub'), tz: [...document.querySelectorAll('[data-tz]')].map((e) => e.textContent).join(','), facts: document.querySelector('.facts div:nth-child(3) dd').textContent }));
  check(d.subs.length === 3 && d.subs.every((x) => x === 'no card · Monday from 09:00 CEST') && d.strip === d.subs[0] && d.dataSub === d.subs[0],
    `Saturday 11:00: every [data-door-sub] (hero, door, ticket) and the strip say "no card · Monday from 09:00 CEST" (${d.subs.length} subs)`);
  check(d.tz.split(',').every((z) => z === 'CEST') && /desk Mon–Fri 09:00 to 19:00 CEST/.test(d.facts), 'the zone label reads CEST in October, the facts print the desk days', JSON.stringify(d));
  await page.fill('#fName', 'Test Person'); await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  check((await page.textContent('#openWhen')) === 'Monday from 09:00 CEST' && (await T(page)).when === 'Monday from 09:00 CEST' && /Nothing by then\?/.test(await page.textContent('#fDone')), 'the OPEN card and the ticket\'s Boarding say Monday, and the recourse line says "by then"');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ clock: '2026-10-19T09:00:00Z' });   // Monday 11:00
  await p2.waitForTimeout(300);
  check((await p2.textContent('#fGo small')) === 'no card · same-day reply' && (await p2.textContent('.hero-go small')) === 'no card · same-day reply' && (await p2.textContent('#stripSub')) === 'no card · same-day reply', 'Monday at 11:00: the desk is open, the sub stays "same-day reply"');
  await c2.close();
}

// ── 1440px: two editorial columns; section 01 as a 4/6 grid ─────────────
{
  const { ctx, page } = await open({ width: 1440 });
  await page.waitForTimeout(2600);
  const b = await board(page);
  check(b.cells === 9 && Math.abs(b.minW - b.contentW) < 4, `1440px: the same board, the same reservation (${b.contentW.toFixed(0)}px)`);
  const hero = await page.evaluate(() => {
    const g = (q) => document.querySelector(q).getBoundingClientRect();
    const h1 = g('.hero h1'), fares = g('.fares'), facts = g('#facts');
    return { faresLeft: fares.right <= facts.left, factsTop: facts.top - h1.top, passInHeader: !!document.querySelector('header.hero #pass'), sticky: [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).position === 'sticky') };
  });
  check(hero.faresLeft && Math.abs(hero.factsTop) < 80 && !hero.passInHeader && !hero.sticky, `the hero: the fares left, the facts card right with its top ${Math.round(hero.factsTop)}px from the title's, no ticket in the header, nothing sticky anywhere`);
  await page.evaluate(() => document.getElementById('plan').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(1200);
  let s = await T(page);
  const blank = await page.evaluate(() => ({ cap: getComputedStyle(document.getElementById('ckBlank')).display !== 'none' && !document.getElementById('ckBlank').hidden, slot: getComputedStyle(document.querySelector('.fessura')).display !== 'none' }));
  check(s.state === 'blank' && s.display === 'none' && blank.cap && blank.slot, 'before a plan the printer column shows the slot and "Your plan prints here as you answer." — never a blank card');
  const geo = () => page.evaluate(() => {
    const g = (q) => document.querySelector(q).getBoundingClientRect();
    const ck = g('#checkin'), door = g('#contact'), wrap = g('#passWrap');
    return { leftCol: ck.right <= wrap.left && door.right <= wrap.left, topGap: Math.round(wrap.top - ck.top), doorUnder: door.top >= ck.bottom - 1 };
  });
  const g0 = await geo();
  check(g0.leftCol && Math.abs(g0.topGap) <= 40 && g0.doorUnder, `#plan: the Check-in and the door in the left column, the printer right with its top ${g0.topGap}px from the Check-in's`);
  await tap(page, ckOpt('found'));
  await page.waitForTimeout(1600);
  s = await T(page);
  const side = await page.evaluate(() => { const b = document.querySelector('.pbody').getBoundingClientRect(), st = document.querySelector('.stub').getBoundingClientRect(); return { beside: st.left >= b.right - 1 && Math.abs(st.top - b.top) < 4, pos: getComputedStyle(document.getElementById('passWrap')).position }; });
  check(s.state === 'standby' && s.plan === 'Application Pack' && side.beside && side.pos !== 'sticky' && s.fileBottom <= s.ih, 'a tap prints the ticket with the stub BESIDE the body (container query), not sticky, its door on the screen');
  // swapping plans never moves the doors: the refund block keeps its height (Full Search ⇄ Attended Viewing)
  const doorAt = () => page.evaluate(() => Math.round(document.getElementById('ckFile').getBoundingClientRect().top - document.querySelector('.stub').getBoundingClientRect().top));
  await page.$eval('#planline', (d) => { d.open = true; });
  await page.$eval('.chip input[value="full-search"]', (e) => e.click());
  await page.waitForTimeout(300);
  const dFs = await doorAt(), rFs = (await T(page)).refundShown;
  await page.$eval('.chip input[value="attended-viewing"]', (e) => e.click());
  await page.waitForTimeout(300);
  const dAv = await doorAt(), rAv = (await T(page)).refundShown;
  check(rFs && !rAv && Math.abs(dFs - dAv) <= 1, `swapping Full Search ⇄ Attended Viewing hides the refund rule but never moves the stub's doors (${dFs}px → ${dAv}px)`);
  check(await page.isVisible('.nav-links .nav-door') && (await page.textContent('.nav-links .nav-door')).trim() === 'Start with a free call' && !(await page.isVisible('#navToggle')) && await page.isVisible('.nav-links a[href="#plan"]'),
    '1440px: desktop nav with "Your plan" and the door as a text link, no burger');
  check(await page.$eval('#paybar', (e) => getComputedStyle(e).display === 'none'), '1440px: no strip');
  // the door's paired fields share a bottom edge ("PHONE OR WHATSAPP (optional)" wraps in the 4fr column, Move-in does not)
  const row = await page.evaluate(() => ['fPhone', 'fMoveIn', 'fName', 'fEmail'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().bottom)));
  check(row[0] === row[1] && row[2] === row[3], `1440px: Phone and Move-in share a bottom edge (${row[0]} / ${row[1]}), as Name and Email do`);
  // the FAQ's <details> clips (overflow:hidden): a keyboard ring outside it was invisible
  // reached by the keyboard (this page was clicked before: a scripted focus alone is not :focus-visible)
  await page.focus('#faq details:first-of-type summary');
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await settle(page);
  const ring = await page.evaluate(() => {
    const s = document.activeElement, d = s.parentElement, cs = getComputedStyle(s), dr = d.getBoundingClientRect(), sr = s.getBoundingClientRect(), bw = parseFloat(getComputedStyle(d).borderTopWidth);
    const o = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
    return { fv: s.matches(':focus-visible'), style: cs.outlineStyle, offset: cs.outlineOffset, inside: sr.left - o >= dr.left + bw && sr.right + o <= dr.right - bw && sr.top - o >= dr.top + bw && sr.bottom + o <= dr.bottom - bw };
  });
  check(ring.fv && ring.style === 'solid' && ring.inside, `a FAQ question focused by keyboard draws its gold ring INSIDE the clipping details (offset ${ring.offset})`, JSON.stringify(ring));
  await ctx.close();
}
// 1024: one column, no horizontal scroll, 44px chips
{
  const { ctx, page } = await open({ width: 1024 });
  await page.waitForTimeout(600);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1400);
  const g = await page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    return { one: Math.abs(r('#passWrap').left - r('#checkin').left) < 2 && r('#passWrap').top > r('#checkin').bottom && r('#contact').top > r('#passWrap').bottom, sw: document.documentElement.scrollWidth,
      chips: [...document.querySelectorAll('#checkin .ck-opt span, .chip span')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)) };
  });
  check(g.one && g.sw <= 1024 && g.chips.length > 0 && g.chips.every((h) => h >= 44), `1024px: one column in DOM order (Check-in · ticket · door), no horizontal scroll (${g.sw}), chips ≥ 44px (${g.chips.join('/')})`);
  await ctx.close();
}

// ── the issued ticket on a desktop (review 22/10): the stamp at the foot of the
// body column, never on the stub's WhatsApp door, the till, the file number or
// the Boarding line; the status board's glyphs like the €500 board's; the paid
// card focused by script wears the gold ring, never the browser's white one ──
for (const width of [1024, 1280, 1440]) {
  const { ctx, page, st } = await open({ width });
  await page.waitForTimeout(400);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1400);
  await page.fill('#fName', 'Anna Keller'); await page.fill('#fEmail', 'anna@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);                           // the strike (.38 s) is over
  const o = await stampBox(page);
  check((await T(page)).state === 'open' && o.w > 100 && o.inBody && !o.inStub && o.hits.length === 0 && o.shown.length === 4,
    `${width}px OPEN: the stamp sits in the body column and covers none of ${o.shown.join(', ')}`, JSON.stringify(o));
  if (width === 1440) {
    const gl = await glyphs(page);
    check(gl.size === gl.host && gl.likePrice && gl.lhGap < 1 && gl.title, '1440px OPEN: the status board\'s glyphs are its cells\' size and the €500 board\'s style; the title alone is mono', JSON.stringify(gl));
  }
  check(st.errors.length === 0, `${width}px: no JS error through the issue`, st.errors.join(' | '));
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ width, height: width === 1024 ? 768 : 900, query: '?paid=full-search&start=1&session_id=cs_test_uistamp01', paid: { status: 200, body: { ok: true, paid: true, plan: 'full-search', file: FILE, startNow: true } } });
  await p2.waitForTimeout(2200); await settle(p2);
  const p = await stampBox(p2);
  check((await T(p2)).state === 'paid' && p.w > 100 && p.inBody && !p.inStub && p.hits.length === 0 && p.shown.includes('#ckWa2'),
    `${width}px PAID: the stamp sits in the body column and covers none of ${p.shown.join(', ')}`, JSON.stringify(p));
  const pv = await paidInView(p2);
  check(pv.status.ok && pv.stamp.ok && pv.file.ok && pv.struck && pv.focus === 'pass' && pv.focusOn,
    `${width}px: back from Stripe the page lands on the ticket — PAID (${pv.status.top}), the struck stamp (${pv.stamp.top}) and the file number (${pv.file.top}) on the screen below the nav; the focus on the ticket`, JSON.stringify(pv));
  const f = await p2.evaluate(() => { const e = document.activeElement, c = getComputedStyle(e); return { id: e.id, fv: e.matches(':focus-visible'), style: c.outlineStyle, color: c.outlineColor }; });
  check(f.id === 'pass' && f.style !== 'auto' && (f.style === 'none' || (f.style === 'solid' && f.color === 'rgb(255, 215, 0)')),
    `${width}px: the ticket, focused by script, shows the gold ring or none — never the browser's white one`, JSON.stringify(f));
  await c2.close();
}

// a strike that waits for the reader moves nothing when it comes: the room
// the issued body keeps for the stamp is the STATE's (OPEN/PAID), not the
// motion's — at 1024 the ticket is issued off screen, then scrolled to
{
  const { ctx, page, st } = await open({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(200);
  const off = await page.evaluate(() => { window.BOOM_CHECKIN.issue('open', { file: 'BM 7K2QX', name: 'Anna' }); const p = document.getElementById('pass'); return { h: p.offsetHeight, struck: p.classList.contains('struck') }; });
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => document.getElementById('pass').classList.contains('struck'));
  await page.$eval('#pass', (p) => p.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(700);
  const on = await page.evaluate(() => { const p = document.getElementById('pass'); return { h: p.offsetHeight, struck: p.classList.contains('struck') }; });
  check(!off.struck && !still && on.struck && on.h === off.h && st.errors.length === 0,
    `1024px: issued off screen the stamp waits (not struck), strikes once scrolled into view, and the ticket keeps its height (${off.h} → ${on.h})`, JSON.stringify([off, still, on, st.errors]));
  await ctx.close();
}

// ── the route fits its ticket at every width (review 22/10): sized from the ticket,
// not from 6vw — IN TOWN ✈ MAD ran under the stub at ≥1100 and past the card at 320 ──
for (const width of [320, 390, 640, 1100, 1440]) {
  const { ctx, page } = await open({ width, slug: 'madrid' });
  const route = () => page.evaluate(() => {
    const r = document.querySelector('.proute'), to = document.querySelector('.proute .pto').getBoundingClientRect(), ps = document.getElementById('pass').getBoundingClientRect();
    return { from: document.getElementById('ckFrom').textContent, sw: r.scrollWidth, cw: r.clientWidth, fits: r.scrollWidth <= r.clientWidth && to.right <= ps.right - 6 };
  });
  await page.waitForTimeout(400);
  await tap(page, ckOpt('zero')); await page.waitForTimeout(500);
  await tap(page, ckOpt('here')); await page.waitForTimeout(900);
  const here = await route();
  await tap(page, '#checkin .ck-step[data-step="where"] .ck-change'); await page.waitForTimeout(250);
  await tap(page, ckOpt('abroad')); await page.waitForTimeout(900);
  const abroad = await route();
  check(here.from === 'IN TOWN' && here.fits && abroad.from === 'ABROAD' && abroad.fits,
    `${width}px: "IN TOWN ✈ MAD" and "ABROAD ✈ MAD" fit the route and the card (scrollWidth ${here.sw}/${abroad.sw} ≤ ${here.cw})`, JSON.stringify([here, abroad]));
  await ctx.close();
}

// ── 1024 (iPad landscape) on the three selling desks: every nav link on one
// line, clear of the lockup ("Start with a free call" and "Your plan" wrapped) ──
for (const slug of ['amsterdam', 'madrid', 'barcelona']) {
  const { ctx, page } = await open({ width: 1024, slug });
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.nav-links .nav-link')];
    const lines = links.map((a) => { const rg = document.createRange(); rg.selectNodeContents(a); return new Set([...rg.getClientRects()].map((x) => Math.round(x.top))).size; });
    const desk = document.querySelector('.nav .bl-desk');
    return { n: links.length, lines, gap: Math.round(links[0].getBoundingClientRect().left - document.querySelector('.nav .logo').getBoundingClientRect().right), deskLines: Math.round(desk.getBoundingClientRect().height / parseFloat(getComputedStyle(desk).lineHeight)) };
  });
  check(n.n >= 5 && n.lines.every((l) => l === 1) && n.gap >= 16 && n.deskLines <= 2,
    `${slug} 1024px: ${n.n} nav links, each on one line, ${n.gap}px clear of the lockup (which keeps its two lines)`, JSON.stringify(n));
  await ctx.close();
}

// ── the refund rule beside every €500 is RENDERED, not only written (review
// 22/10: the build reads the HTML; a CSS rule could hide it and every suite
// stayed green) — on the three desks that sell, at 390 and 1440 ──
{
  const RULE = JSON.parse(fs.readFileSync(path.join(R, 'cities/_shared.json'), 'utf8')).refund.rule;
  const seen = (page, sels) => page.evaluate(({ sels, rule }) => sels.map((q) => {
    const e = document.querySelector(q); if (!e) return q + ': missing';
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.height > 0 && r.width > 0 && e.textContent.includes(rule) ? true : q + ': ' + [cs.display, cs.visibility, cs.opacity, Math.round(r.height)].join('/');
  }), { sels, rule: RULE });
  for (const slug of ['amsterdam', 'madrid', 'barcelona']) for (const width of [390, 1440]) {
    const { ctx, page } = await open({ width, slug });
    await page.waitForTimeout(300);
    const v = await seen(page, ['.glance .rule', '#contact .pricenote.refund', '#services .feenote']);
    check(v.every((x) => x === true), `${slug} ${width}px: the refund rule is on screen under the fares, under the door's €500 chip and in the plates' fee note`, JSON.stringify(v));
    if (width === 1440) {
      await tap(page, ckOpt('zero'));
      await page.waitForTimeout(1500);
      const t = await seen(page, ['#ckRefund']);
      check((await T(page)).plan === 'Full Search' && t[0] === true, `${slug} 1440px: on the ticket's Full Search the refund rule is on screen beside the €500`, JSON.stringify(t));
    }
    await ctx.close();
  }
}

// ── a keyboard on a phone (WCAG 2.4.11): Tab scrolls each control ABOVE the
// strip, never under it (the plates' doors landed behind it) ──
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  await page.$eval('#plate-full-search .go2', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(600);
  await page.focus('#plate-full-search .go2');
  const walk = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    await settle(page);
    walk.push(await page.evaluate(() => {
      const e = document.activeElement, r = e.getBoundingClientRect(), bar = document.getElementById('paybar');
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, at = cy > 0 && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
      return { el: e.textContent.trim().slice(0, 28), on: bar.classList.contains('on'), ok: !!at && !bar.contains(at) && (e === at || e.contains(at)) };
    }));
  }
  const bad = walk.filter((w) => w.on && !w.ok);
  check(walk.filter((w) => w.on).length >= 8 && bad.length === 0, `390px: twelve Tabs through the plates and the FAQ with the strip up — every focused control is on the screen, above the strip`, JSON.stringify(bad.length ? bad : walk.map((w) => w.el)));
  await ctx.close();
}

// ── round 2 (finding 28): the strip keeps ONE height at every width and desk
// clock (it grew to 93–191px when its line wrapped: the evening, 375, 320),
// and focus scrolls clear of its MEASURED height (--strip-h): a full Tab walk
// from the top leaves no focused control with any part under the strip ──
for (const [width, height] of [[320, 640], [375, 667], [390, 844]]) {
  for (const [desk, clock] of [['open', '2026-10-22T09:00:00Z'], ['closed', '2026-10-22T21:00:00Z']]) {   // Thursday 11:00 / 23:00 in Rome
    const { ctx, page, st } = await open({ width, height, clock });
    await page.waitForTimeout(300);
    // the walk starts on the fresh page (a scrollIntoView moves Chrome's focus starting point)
    const bad = [], seen = new Set();
    let steps = 0, first = null;
    for (; steps < 200; steps++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(40); await settle(page);
      const w = await page.evaluate(() => {
        const e = document.activeElement, bar = document.getElementById('paybar');
        if (!e || e === document.body) return { end: true };
        const r = e.getBoundingClientRect(), sr = bar.getBoundingClientRect();
        const key = (e.id || e.tagName) + ':' + Math.round(r.left) + ':' + Math.round(r.top + scrollY);
        return { key, el: (e.id ? '#' + e.id + ' ' : '') + (e.textContent || e.value || '').trim().slice(0, 30), on: bar.classList.contains('on'), inStrip: bar.contains(e), under: r.height > 0 && r.bottom > sr.top + 0.5, top: Math.round(r.top), bottom: Math.round(r.bottom), stripTop: Math.round(sr.top) };
      });
      if (w.end || w.key === first) break;
      if (!first) first = w.key;
      seen.add(w.key);
      if (w.on && !w.inStrip && w.under) bad.push(w);
    }
    await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
    await page.waitForTimeout(500);
    const sh = await page.evaluate(() => { const b = document.getElementById('paybar'); return { on: b.classList.contains('on'), h: b.offsetHeight, var: getComputedStyle(document.documentElement).getPropertyValue('--strip-h').trim(), sub: document.getElementById('stripSub').textContent }; });
    check(sh.on && sh.h <= 72 && sh.var === sh.h + 'px' && bad.length === 0 && seen.size >= 40 && st.errors.length === 0,
      `${width}×${height}, desk ${desk}: the strip is ${sh.h}px (≤ 72, --strip-h ${sh.var}, line "${sh.sub.slice(0, 32)}"), and ${seen.size} Tabs from the top leave nothing focused under it`, JSON.stringify([sh, bad.slice(0, 4), steps]));
    await ctx.close();
  }
}

// ── review 22/10: the state guards ──────────────────────────────────────
// (finding 16) a chip changed while the send is in flight: the pass names the plan FILED
{
  const { ctx, page, st } = await open({ api: { status: 200, body: LEAD_OK.body, delay: 2000 } });
  await page.waitForTimeout(400);
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="full-search"])');
  await page.fill('#fName', 'Flight Person');
  await page.fill('#fEmail', 'flight@example.com');
  await tap(page, '#fGo');
  await page.waitForTimeout(400);
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="attended-viewing"])');
  await page.waitForSelector('#fDone.on', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(700);
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  const s = await T(page);
  check(st.posts.length === 1 && sent.service === 'full-search' && s.state === 'open' && s.plan === 'Full Search' && s.priceSr === '€500' && s.chip === 'full-search' && s.start && s.start.pay === 'full-search' && decodeURIComponent(s.wa2).includes('My plan: Full Search'),
    'a chip switched while "Opening your file…" shows: the OPEN pass, its till and the WhatsApp text name the plan the server filed (Full Search), not the late chip', JSON.stringify([sent.service, s.plan, s.chip, s.start]));
  await ctx.close();
}
// (finding 41) the file is open: the Check-in freezes — inert, dimmed, one line — and a late answer writes nothing
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(400);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1300);
  await page.fill('#fName', 'Frozen Person');
  await page.fill('#fEmail', 'frozen@example.com');
  const h0 = await page.$eval('#checkin', (c) => c.offsetHeight);
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(900);
  const fz = await page.evaluate(() => {
    const c = document.getElementById('checkin'), sent = document.getElementById('ckSent');
    // round 2: only the questions, the suggestion and the papers are inert — the line stays in the accessibility tree
    return { inert: ['ckSteps', 'ckSuggest', 'ckPapersBox'].every((id) => document.getElementById(id).inert === true) && !c.inert && !sent.closest('[inert]'), frozen: c.classList.contains('frozen'), sent: !sent.hidden && sent.offsetParent !== null, text: sent.textContent, num: document.getElementById('ckNum').offsetParent !== null,
      change: [...c.querySelectorAll('.ck-change')].filter((e) => e.offsetParent && getComputedStyle(e).visibility === 'visible').length,
      op: +getComputedStyle(c.querySelector('.ck-steps')).opacity, h: c.offsetHeight,
      // the live region that announced the file stays out of the inert subtree (an inert node is out of the accessibility tree)
      live: !document.getElementById('ckLive').closest('[inert]') && document.getElementById('ckLive').textContent === 'Your file is open. File BM 7K2QX.' };
  });
  // the freeze changes no height under the reader (the line takes the counter's place)
  check(fz.inert && fz.frozen && fz.sent && !fz.num && fz.text === 'Your file is open. The desk takes it from here.' && fz.change === 0 && fz.op < 1 && Math.abs(fz.h - h0) <= 3 && fz.live,
    `OPEN: the Check-in freezes — its questions inert, dimmed, no "change" — and its head says "Your file is open. The desk takes it from here." in the counter's place, readable (height ${h0} → ${fz.h}px); the live line announcing the file stays outside the inert part`, JSON.stringify(fz));
  const before = await T(page);
  // a late answer forced past inert (a script, an old browser): nothing is rewritten
  await page.evaluate(() => { const r = document.querySelector('#checkin input[name="ck-where"][value="abroad"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  const after = await T(page);
  check(after.fCheckin === "Haven't started" && after.fCheckin === before.fCheckin && after.from === before.from && after.leg === before.leg && after.chip === before.chip && st.posts.length === 1,
    'a late answer after OPEN rewrites neither the door\'s hidden fields nor the ticket (one POST, still "Haven\'t started")', JSON.stringify([after.fCheckin, after.from, after.leg]));
  await ctx.close();
}
// round 2 (finding 41 regression): a focus inside the Check-in when the file is issued moves onto
// the ticket — it fell to <body> when the whole section went inert under it
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(400);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1300);
  await page.focus('#checkin input[name="ck-where"][value="abroad"]');
  const f = await page.evaluate(() => { window.BOOM_CHECKIN.issue('open', { file: 'BM 7K2QX', name: 'Anna' }); const a = document.activeElement; return { id: a.id || a.tagName, inCk: !!a.closest('#checkin') }; });
  check(f.id === 'pass' && !f.inCk && st.errors.length === 0, 'a keyboard focus inside the Check-in when the file is issued moves onto the ticket, never onto <body>', JSON.stringify(f));
  await ctx.close();
}
// (finding 13) back from Stripe through the back/forward cache: the till is not left busy
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  const held = [];
  // the payer is "on Stripe": the checkout POST is never answered here
  await page.route('**/api/service-checkout', (r) => { held.push(r); });
  await tap(page, '.sib [data-pay="full-search"]');
  await page.waitForTimeout(500);
  await page.fill('#sName', 'Back Person');
  await page.fill('#sEmail', 'back@example.com');
  await page.click('#sGo');
  await page.waitForTimeout(400);
  const busy0 = await page.$eval('#sGo', (b) => b.classList.contains('busy'));
  // Playwright turns the bfcache off: the restored page sees exactly this event
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => ({ open: document.getElementById('ov').open, busy: document.getElementById('sGo').classList.contains('busy'), overflow: document.body.style.overflow }));
  check(busy0 && held.length === 1 && !back.open && !back.busy && back.overflow === '', 'a persisted pageshow (back from Stripe): the sheet closes, its button is not busy, the page scrolls again', JSON.stringify([busy0, held.length, back]));
  await page.$eval('.sib [data-pay="application-pack"]', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('.sib [data-pay="application-pack"]', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.click('#sGo', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  let k2 = '';
  try { k2 = JSON.parse(held[1].request().postData()).kind; } catch (e) {}
  check(held.length === 2 && k2 === 'application-pack', `Pay posts again after the return (${held.length} checkout POSTs, the second for ${k2 || 'nothing'})`);
  for (const r of held) await r.abort().catch(() => {});
  await ctx.close();
}
// (finding 25) the WhatsApp text keeps "I" and the city's capital
{
  const { ctx, page } = await open({ slug: 'barcelona' });
  await page.waitForTimeout(400);
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(1200);
  await tap(page, ckOpt('here'));
  await page.waitForTimeout(1300);
  await tap(page, ckOpt('months'));
  await page.waitForTimeout(1200);
  const wa = decodeURIComponent(await page.getAttribute('#heroWa', 'href'));
  check(wa.endsWith("I'm moving to Barcelona. My plan: Application Pack · I have a shortlist · already in Barcelona · in 1–3 months."),
    'the WhatsApp text reads "I have a shortlist · already in Barcelona · in 1–3 months" (only an answer\'s first capital goes, never "I" or the city\'s)', wa);
  await ctx.close();
}

// ── the sisters at 390px ─────────────────────────────────────────────────
for (const [slug, word] of [['madrid', 'MADRID'], ['barcelona', 'BARCELONA'], ['paris', 'PARIS'], ['berlin', 'BERLIN']]) {
  const { ctx, page, st } = await open({ slug });
  await page.waitForTimeout(2600);
  const b = await board(page);
  check(b.cells === word.length && b.letters === word && Math.abs(b.minW - b.contentW) < 4, `${slug}: the board spells ${word} in the space the hero reserved (${b.contentW.toFixed(0)}px)`);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const chipH = await page.$$eval('.chip', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(scrollW <= 390 && chipH.length === 4, `${slug}: 390px, no horizontal scroll, four chips (${chipH.join('/')}px)`);
  const fold = await page.evaluate(() => ({ fares: document.querySelector('.fares').getBoundingClientRect().bottom, go: document.querySelector('.hero-go').getBoundingClientRect().bottom }));
  check(fold.fares <= 844 && fold.go <= 844, `${slug}: the fares and the hero door fit the first screen (${Math.round(fold.fares)} / ${Math.round(fold.go)}px)`);
  const wl = ['paris', 'berlin'].includes(slug);
  const chipTxt = await page.$$eval('.chip small', (els) => els.map((e) => e.textContent.trim()));
  check(chipTxt[0].startsWith('€500') && chipTxt[1].startsWith('€199') && chipTxt[2].startsWith('€149') && chipTxt.every((t, i) => i === 3 || /VAT/.test(t)) && (wl ? chipTxt.slice(0, 3).every((t) => /at opening|on signing/.test(t)) : chipTxt.slice(0, 3).every((t) => !/opening|sign/.test(t))),
    `${slug}: the chips carry the brief's prices with each plan's own condition (${chipTxt.slice(0, 3).join(' | ')})`);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1900);
  let s = await T(page);
  if (wl) {
    check(await page.$('dialog#ov') === null && await page.$('[data-pay]') === null && s.start === null && !(await page.$('#ckRefund')),
      `${slug}: no dialog, no pay control, no till and no refund rule on the ticket`);
    check(s.plan === 'Full Search' && s.price === '€500' && s.fileDoor.service === 'full-search'
      && (slug === 'berlin' ? s.cond === 'flat · incl. VAT · on signing' && /once you sign a lease/.test(s.condLong) : s.cond === 'flat · incl. VAT · at opening' && /when the desk opens/.test(s.condLong)),
      `${slug}: the ticket says Full Search €500 with ITS condition ("${s.cond}") and one door, the free file`);
    await tap(page, '#plate-application-pack .go');
    await page.waitForTimeout(900);
    s = await T(page);
    check(s.chip === 'application-pack' && s.plan === 'Application Pack' && s.suggest, `${slug}: the plate's link puts its plan in the door and on the ticket; the answers suggest Full Search`);
  } else {
    check(s.plan === 'Full Search' && s.price === '€500' && s.start && s.start.pay === 'full-search' && s.refundShown, `${slug}: the ticket says Full Search €500 with the till and the refund rule`);
    check(/^Optional, chosen in writing\./.test(await page.textContent('.glance .fnote')), `${slug}: the fares note opens "Optional, chosen in writing."`);
    await tap(page, '[data-pay="application-pack"]');
    await page.waitForTimeout(500);
    check(await page.$eval('dialog#ov', (d) => d.open) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack', `${slug}: the plate's pay link opens the dialog on its plan`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check(!(await page.$eval('#planline', (d) => d.open)) && !(await page.$eval('#plChange', (e) => e.hidden)), `${slug}: the plan line folded on the plan the questions wrote, with its "change" tag`);
    await tap(page, '#planline summary');
    await page.waitForTimeout(200);
    await tap(page, '.chip:has(input[value="application-pack"])');
    check((await page.textContent('#plText')) === 'Application Pack · €199 · flat · incl. VAT', `${slug}: a chip chosen by hand replaces the plan and drops the "from your check-in" tag`);
  }
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  s = await T(page);
  check(st.posts.length === 1 && sent.city === slug && sent.service === 'application-pack' && st.errors.length === 0,
    `${slug}: the form posts city "${slug}" once, with Application Pack chosen, and no JS error`, JSON.stringify(sent) + ' ' + st.errors.join('|'));
  if (wl) check(s.state === 'open' && s.title === 'BOOM · Your file' && s.status === 'OPEN' && s.when === 'When the desk opens' && s.file === FILE && s.start === null,
    `${slug}: issued as "BOOM · Your file", OPEN, Boarding "When the desk opens", no till`, JSON.stringify([s.title, s.when]));
  else check(s.state === 'open' && s.title === 'BOOM · Boarding pass' && s.stamp === `FILE OPEN · BOOM ${word}`, `${slug}: issued as a boarding pass with the stamp FILE OPEN · BOOM ${word}`);
  await ctx.close();
}

// ── a touch screen: the same page, nothing hover-bound ───────────────────
{
  const { ctx, page, st } = await open({ touch: true });
  await page.waitForTimeout(600);
  await page.$eval(ckOpt('zero'), (el) => el.scrollIntoView({ block: 'center' }));
  await page.tap(ckOpt('zero'));
  await page.waitForTimeout(1200);
  const s = await T(page);
  check(s.state === 'standby' && s.display !== 'none' && st.errors.length === 0, 'on a touch screen the first tap prints the ticket, no error');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
