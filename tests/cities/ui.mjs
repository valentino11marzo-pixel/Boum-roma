// tests/cities/ui.mjs — the generated city page (v2, brief v1.3, STUDIO §11)
// in a real Chromium.
//
// What it proves:
//   - with JS OFF the page reads whole: the city in the title as text, the
//     prices as text on the plates and in the chips, every section visible;
//     the Check-in, the pass, the skip link and the strip are not there (they
//     are behaviour), the service chips are open in the door;
//   - 390px: the Solari board spells the city in the space the hero reserved,
//     no horizontal scroll; the pass is NOT on the screen until the first tap
//     (a blank ticket on a phone is a question nobody asked), then it is the
//     live ticket: resolved from the first tap where the rules allow it
//     (haven't started → Full Search), pending with the two plans named when
//     the second tap decides (shortlist), the note and the papers only after
//     the third; the price spins once per plan on its own board;
//   - the papers: three ticked → "3 of 8", the missing five by name, the
//     meter at 38%; the pass grid follows (passenger, boarding, file, papers);
//   - the door is written by the pass: the chip checked, the plan line says
//     "from your check-in", the month prefilled from the answer, the two
//     hidden fields in words; the URL remembers the answers; Copy link
//     carries the papers (own link, via l), WhatsApp does not (via w);
//   - a link lands where it says: complete → the ticket; a friend's link →
//     the banner; partial → the next step; broken → the first step and a
//     clean address bar;
//   - the till is a native <dialog>: a plate's button opens it on ITS plan,
//     Escape closes it, it posts { city, kind } and follows Stripe's URL;
//     back on ?paid= the PAID state, one purchase per session id, the key in
//     sessionStorage (never localStorage); the pass's till button too;
//   - the door: errors in place, one JSON post, OPEN on the board with the
//     reply window computed against the desk clock, the offer to pay for the
//     plan they chose (the refund line only under Full Search), "not sure"
//     gets no offer, a failed send gives the button back;
//   - the desk clock line reads "it is HH:MM at the desk[, HH:MM for you]";
//   - the strip carries no price and names the plan once there is one;
//   - 1440px: the pass is on the page from load, blank, in the right
//     column above the door; desktop nav with the door as a text link, no
//     strip;
//   - reduced motion: the word set still, no pass animation, no stagger;
//   - the sisters at 390: Madrid sells, Barcelona/Paris/Berlin show list
//     prices with their own condition and no till; Berlin's Full Search says
//     "on signing" on the pass;
//   - the consent plate waits: not before the first move, not on a tap inside
//     the diagnostic, not while the dialog is open;
//   - the pass exports as a real 1080×1920 image (webp in Chromium);
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

console.log('\n\x1b[1m▸ citiesui\x1b[0m  the city page in a real browser: the diagnostic, the pass, the door, the till');

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

async function open({ js = true, width = 390, api = { status: 200, body: { ok: true, id: 'ams1' } }, reducedMotion = 'no-preference', slug = 'amsterdam', query = '', checkout = null, consent = true, touch = false, clock = null } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const st = { errors: [], posts: [], checkouts: [], foreign: [] };
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
    if (u.startsWith(base + '/api/city-lead')) {
      st.posts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
      if (api.delay) await new Promise((res) => setTimeout(res, api.delay));
      return r.fulfill({ status: api.status, contentType: 'application/json', body: JSON.stringify(api.body) });
    }
    if (u.startsWith(base + '/api/service-checkout')) {
      st.checkouts.push({ headers: r.request().headers(), body: r.request().postData() || '' });
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
// the strip at the bottom sits over the edge of a 844px viewport: a target is
// centred before the tap, as a thumb would do, never clicked through the bar
const tap = async (page, sel) => {
  await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(200);
  await page.click(sel);
};
const ckOpt = (v) => `#checkin .ck-opt:has(input[value="${v}"])`;
const ckDoc = (v) => `#pass .ck-doc:has(input[value="${v}"])`;
const vis = (page, sel) => page.$eval(sel, (e) => !e.hidden && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none').catch(() => false);
const passState = (page) => page.evaluate(() => {
  const p = document.getElementById('pass');
  const t = (id) => (document.getElementById(id) || {}).textContent || '';
  return {
    state: p.getAttribute('data-state'), display: getComputedStyle(p).display, inClass: p.classList.contains('in'),
    code: t('ckCode'), plan: t('ckPlan'), cond: t('ckCond'), why: t('ckWhy'), note: t('ckNote'), pend: t('ckPendText'),
    price: [...document.querySelectorAll('#ckPrice .st b')].map((b) => b.textContent).join(''), priceCells: document.querySelectorAll('#ckPrice .fc2').length,
    board: [...document.querySelectorAll('#ckBoard .st b')].map((b) => b.textContent).join(''),
    blankShown: !document.getElementById('ckBlank').hidden, pendShown: !document.getElementById('ckPend').hidden,
    planShown: !document.getElementById('ckPlanBox').hidden, papersShown: !document.getElementById('ckPapers').hidden,
    noteShown: !document.getElementById('ckNote').hidden, refundShown: document.getElementById('ckRefund') ? !document.getElementById('ckRefund').hidden : null,
    ready: t('ckReady'), meter: document.getElementById('ckMeter').style.width, meterVar: document.getElementById('ckMeter').style.getPropertyValue('--meter'),
    start: document.getElementById('ckStart') ? document.getElementById('ckStart').getAttribute('data-pay') : null, startAmt: t('ckStartAmt'),
    file: document.getElementById('ckFile').getAttribute('data-service'),
    chip: (document.querySelector('input[name="service"]:checked') || {}).value || '', plText: t('plText'), planFrom: document.getElementById('cityForm').getAttribute('data-plan-from'),
    moveIn: document.getElementById('fMoveIn').value, fCheckin: document.getElementById('fCheckin').value, fDossier: document.getElementById('fDossier').value,
    hash: location.hash, wa: document.getElementById('ckWa').getAttribute('href'),
    passenger: t('ckPassenger'), passWhen: t('ckPassWhen'), passFile: t('ckPassFile'), passPapers: t('ckPassPapers'), from: t('ckFrom'),
    stripSub: t('stripSub'), num: t('ckNum'), landing: document.getElementById('ckLanding').hidden ? null : t('ckLanding'),
    stepsShown: ['stage', 'where', 'when'].map((s) => { const f = document.querySelector(`#checkin .ck-step[data-step="${s}"]`); return !f.hidden && getComputedStyle(f).display !== 'none'; }),
    rect: (() => { const r = p.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; })()
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
// (main's boom-consent creates it with .zz and reveals it with show())
const plateUp = (page) => page.$eval('.boomcst', (e) => !e.classList.contains('zz') && getComputedStyle(e).visibility !== 'hidden').catch(() => false);
const WINDOW_RE = /^(By 19:00 CES?T today|Today from 09:00 CES?T|Tomorrow from 09:00 CES?T|(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) from 09:00 CES?T)$/;
// the door's sub follows the desk clock: "same-day reply" while the desk is open, the window (a time, never a price) when it is closed
const SUB_RE = /^free · (same-day reply|By 19:00 CES?T today|Today from 09:00 CES?T|Tomorrow from 09:00 CES?T|(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) from 09:00 CES?T)$/;

// ── JS off: everything readable, nothing behavioural on the page ─────────
{
  const { ctx, page } = await open({ js: false });
  const hidden = await page.$$eval('.rv', (els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
  const total = await page.$$eval('.rv', (els) => els.length);
  check(total >= 4 && hidden === 0, `without JS all ${total} reveal blocks are visible`, `${hidden} hidden`);
  check((await page.textContent('#flapCity')).trim() === 'AMSTERDAM', 'without JS the title still says AMSTERDAM, as text');
  const prices = await page.$$eval('[data-plan-price]', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(prices) === JSON.stringify(['€500', '€199', '€149']), 'without JS the three prices are text, on the plates');
  const chipTxt = await page.$$eval('.chip small', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(chipTxt) === JSON.stringify(['€500 · flat · incl. VAT', '€199 · flat · incl. VAT', '€149 · per viewing · incl. VAT', 'advise me']),
    'without JS the service chips show their price and their condition as text');
  check(await page.$eval('.planline .chips', (e) => getComputedStyle(e).display !== 'none') && await page.$eval('#planline', (e) => e.open), 'without JS the chips are open in the door');
  const wa = await page.getAttribute('.consent a[href^="https://wa.me/"]', 'href');
  check(wa === 'https://wa.me/393313251961', 'the WhatsApp link is a real href to the real number');
  const goTxt = await page.$$eval('.plates .go', (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(goTxt) === JSON.stringify(['Open my file →', 'Open my file →', 'Open my file →']), 'without JS the plates\' primaries read the one label');
  const gone = await page.evaluate(() => ['#checkin', '#pass', '.skipck', '#paybar'].map((s) => getComputedStyle(document.querySelector(s)).display === 'none'));
  check(gone.every(Boolean), 'without JS the Check-in, the pass, the skip link and the strip are not there (they are behaviour)');
  check((await page.textContent('#faq')).includes("Full Search (€500) if you haven't started."), 'without JS the derived FAQ answer is on the page as text');
  check(await page.$('dialog#ov') !== null && !(await page.$eval('dialog#ov', (d) => d.open)), 'the till is a native <dialog>, closed');
  await ctx.close();
}

// ── 390px: the board, the pass hidden until it has something to say ──────
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(2600);                           // 600ms + the spin
  const b = await board(page);
  check(b.cells === 9 && b.letters === 'AMSTERDAM', `the board spells AMSTERDAM, one cell per letter (${b.cells} cells: "${b.letters}")`);
  check(Math.abs(b.hostW - b.contentW) < 4 && Math.abs(b.minW - b.contentW) < 4,
    `the board lands in the space the hero reserved — ${CELL_EM}em/cell: reserved ${b.minW.toFixed(1)}px, cells ${b.contentW.toFixed(1)}px (no layout jump)`);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= 390, `390px: no horizontal scroll (scrollWidth ${scrollW})`);
  let s = await passState(page);
  check(s.state === 'blank' && s.display === 'none' && JSON.stringify(s.stepsShown) === '[true,false,false]' && s.num === 'Check-in · 1 of 3',
    'on a phone the pass is not on the screen before the first tap; the Check-in opens on the first step alone');
  const clock = await page.textContent('#deskClock');
  check(/^it is \d\d:\d\d at the desk(, \d\d:\d\d for you)?$/.test(clock), `the desk clock line is live ("${clock}")`);
  check(!(await page.$eval('#paybar', (e) => e.classList.contains('on'))) && !/€|\d{3}/.test(await page.textContent('#paybar')) && SUB_RE.test((await page.textContent('#stripSub')).trim()), 'at the top the strip is off, and it carries no price (the sub is the desk\'s promise for now)');
  const order = await page.evaluate(() => ['h1', '.lead', '#checkin', '#pass', '.skipck', '#facts', '#contact'].map((q) => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1; }));
  check(order[0] < order[1] && order[1] < order[2] && order[2] < order[4] && order[4] < order[5] && order[5] < order[6], `390px reading order: title, lead, Check-in, skip link, facts, door (${order.join(' < ')})`);
  // tap 1: haven't started → resolved at once (the rule needs nothing more)
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(900);
  s = await passState(page);
  check(s.state === 'resolved' && s.display !== 'none' && s.inClass && s.planShown && !s.pendShown && !s.blankShown && !s.papersShown && !s.noteShown,
    'tap 1 (haven\'t started): the pass appears as the live ticket — resolved, no pending line, no papers yet');
  check(s.plan === 'Full Search' && s.code === 'START' && s.cond === 'flat · incl. VAT' && s.refundShown === true && /Starting from zero/.test(s.why),
    `the ticket reads Full Search, code START, the condition, the refund rule under it, the why ("${s.why.slice(0, 30)}…")`);
  await page.waitForTimeout(1500);
  s = await passState(page);
  check(s.price === '€500' && s.priceCells === 4 && s.board === 'AMSTERDAM', `the price spun onto its own board ("${s.price}"), the city on the pass board`);
  check(s.rect.bottom <= 844 + 2 && s.rect.top >= 0, `the pass landed on the screen the visitor is looking at (top ${s.rect.top}, bottom ${s.rect.bottom})`);
  check(s.chip === 'full-search' && s.plText === 'Full Search · €500 · flat · incl. VAT · from your check-in' && s.planFrom === 'checkin' && s.fCheckin === "Haven't started",
    'the door is written from the first tap: the chip checked, the plan line says from your check-in, the hidden field in words');
  check(s.hash === '#checkin=zero.-.-.-' && s.stripSub === 'Full Search · your plan', 'the URL remembers the answer; the strip names the plan, never the price');
  check(JSON.stringify(s.stepsShown) === '[true,true,false]' && s.num === 'Check-in · 2 of 3' && await page.$eval('#checkin .ck-step[data-step="stage"]', (e) => e.classList.contains('done')),
    'the answered step collapses, the second step comes, not the third');
  // change to a shortlist → pending: the second tap decides
  await tap(page, '#checkin .ck-step[data-step="stage"] .ck-change');
  await page.waitForTimeout(300);
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(700);
  s = await passState(page);
  check(s.state === 'pending' && s.pendShown && !s.planShown && /^One more answer decides: Attended Viewing if .*abroad, Application Pack if .*Amsterdam\.$/.test(s.pend) && s.code === 'SHORTLIST',
    `a shortlist is pending: the pass names the two plans the second tap decides between ("${s.pend.slice(0, 40)}…")`);
  check(s.chip === '' && s.plText === 'Which service? Three taps tell you ↑' && s.hash === '#checkin=shortlist.-.-.-', 'pending writes nothing into the door: no chip, no plan, the URL updated');
  await tap(page, ckOpt('abroad'));
  await page.waitForTimeout(700);
  s = await passState(page);
  check(s.state === 'resolved' && s.plan === 'Attended Viewing' && s.code === 'SHORTLIST · ABROAD' && s.cond === 'per viewing · incl. VAT' && s.refundShown === false && !s.noteShown && !s.papersShown,
    'tap 2 (still abroad): Attended Viewing, the refund line gone (it is Full Search\'s), still no note, no papers');
  await page.waitForTimeout(1500);
  s = await passState(page);
  check(s.price === '€149' && s.start === 'attended-viewing' && s.startAmt === '€149' && s.file === 'attended-viewing' && s.chip === 'attended-viewing',
    'the board respun to €149; the pass\'s two doors and the chip point at the plan');
  await tap(page, ckOpt('months'));
  await page.waitForTimeout(700);
  s = await passState(page);
  check(s.state === 'complete' && s.noteShown && s.papersShown && s.code === 'SHORTLIST · ABROAD · T-3M' && /dossier is ready before the listings/.test(s.note),
    'tap 3 (1–3 months): complete — the when note and the papers appear on the pass');
  check(s.ready === 'Tap the papers you hold above and we say what we would fix first.' && s.meter === '0%' && s.passPapers === '—' && s.fDossier === '',
    'with the papers untouched the file line invites, the meter is empty, nothing posted — never "0 of 8"');
  check(s.moveIn === ymPlus(2) && s.passWhen === 'In 1–3 months' && s.passFile === 'SHORTLIST · ABROAD · T-3M' && s.passenger === 'A tenant',
    `the move-in month is prefilled from the answer (${ymPlus(2)}); the pass grid carries boarding, file and "A tenant"`);
  check(s.fCheckin === 'I have a shortlist · Still abroad · In 1–3 months' && s.hash === '#checkin=shortlist.abroad.months.-', 'the hidden field says the three answers in words; the URL carries them');
  // the papers
  for (const d of ['id', 'contract', 'payslips']) await tap(page, ckDoc(d));
  await page.waitForTimeout(500);
  s = await passState(page);
  check(/^3 of 8 in hand\. Missing: Employer statement \(werkgeversverklaring\), Previous landlord reference, A guarantor, if your income falls short, Three months of bank statements, Motivation letter, Dutch and English\./.test(s.ready) && s.meter === '38%' && s.meterVar === '38%',
    `three papers ticked → "3 of 8", the missing five by name, the meter at 38% ("${s.ready.slice(0, 30)}…")`);
  check(s.passPapers === '3 of 8' && /^3\/8 · missing: Employer statement/.test(s.fDossier) && s.hash === '#checkin=shortlist.abroad.months.b',
    'the pass grid says 3 of 8, the hidden field names the missing, the URL carries the mask (id+contract+payslips = b)');
  const share = 'https://www.boomrome.com/amsterdam#checkin=shortlist.abroad.months.';
  check(s.wa.startsWith('https://wa.me/?text=') && decodeURIComponent(s.wa).includes(share + '-.w') && !decodeURIComponent(s.wa).includes('.b.') && decodeURIComponent(s.wa).includes('BOOM Amsterdam'),
    'the WhatsApp link carries the answers (via w) and never the papers: a friend\'s papers are not mine');
  await page.evaluate(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
  await tap(page, '#ckCopy');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => window.__copied) === share + 'b.l' && (await page.textContent('#ckCopied')) === 'Link copied', 'Copy link copies my own link WITH the papers (via l) and says so');
  const events = await layer(page);
  check(events.filter((e) => e.name === 'checkin_answer').length === 4 && events.filter((e) => e.name === 'checkin_result').length === 2
    && events.filter((e) => e.name === 'checkin_result').pop().p.plan === 'attended-viewing' && events.filter((e) => e.name === 'checkin_result')[0].p.resolved_at_tap === 1,
    'four checkin_answer events (one changed), two checkin_result (one per resolution), the first resolved at tap 1');
  // the pass follows the name and the origin
  await page.fill('#ckName', 'Anna K.');
  await page.fill('#ckOrigin', 'lon');
  check((await page.textContent('#ckPassenger')) === 'Anna K.' && (await page.textContent('#ckFrom')) === 'LON', 'the pass follows the name and the origin as they are typed (origin upper-cased)');
  const img = await page.evaluate(async () => {
    const r = await window.BOOM_CHECKIN.passBlob();
    const b = r && (r.blob || r);
    if (!b || typeof b.arrayBuffer !== 'function') return null;
    const u = new Uint8Array(await b.arrayBuffer());
    const bmp = await createImageBitmap(b);
    return { type: b.type, size: b.size, head: String.fromCharCode(...u.slice(0, 4)), w: bmp.width, h: bmp.height };
  });
  check(img && (img.type === 'image/webp' ? img.head === 'RIFF' : img.type === 'image/png') && img.w === 1080 && img.h === 1920 && img.size > 10000,
    `passBlob() is a real ${img && img.type} 1080×1920, ${img && Math.round(img.size / 1024)} KB — a story-sized image to post`);
  // the till from the pass
  await tap(page, '#ckStart');
  await page.waitForTimeout(500);
  check(await page.$eval('dialog#ov', (d) => d.open) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'attended-viewing' && (await page.textContent('#sGoAmt')).trim() === '€149',
    'the pass\'s till button opens the dialog on Attended Viewing, €149 on the button');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(!(await page.$eval('dialog#ov', (d) => d.open)), 'Escape closes the dialog (native)');
  // the lead posts what the Check-in learned
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  check(st.posts.length === 1 && sent.service === 'attended-viewing' && sent.moveIn === ymPlus(2) && sent.checkin === 'I have a shortlist · Still abroad · In 1–3 months' && /^3\/8 · missing:/.test(sent.dossier),
    'the lead carries the plan, the month, the three answers in words and the papers', JSON.stringify(sent));
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS error, no foreign request through the whole Check-in', st.errors.join(' | ') + st.foreign.join(' | '));
  await ctx.close();
}

// ── the strip, the reveal, the burger ────────────────────────────────────
{
  const { ctx, page } = await open();
  await page.waitForTimeout(500);
  const rvBefore = await page.$eval('#services', (e) => getComputedStyle(e).opacity);
  await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(1200);
  check(rvBefore === '0' && await page.$eval('#services', (e) => e.classList.contains('in')), 'a section starts hidden and is revealed when scrolled into view');
  check(await page.$eval('#paybar', (e) => e.classList.contains('on')) && (await page.textContent('#stripGo')).trim() === 'Open my file' && SUB_RE.test((await page.textContent('#stripSub')).trim()),
    'past the hero the strip comes up, with the one label and no price');
  check(await page.evaluate(() => document.getElementById('enbref').getBoundingClientRect().top > document.getElementById('faq').getBoundingClientRect().top),
    'the fact sheet sits below the FAQ: human content first, machine content after');
  await page.click('#navToggle');
  check(await page.$eval('#mobileMenu', (e) => e.classList.contains('active')) && await page.getAttribute('#navToggle', 'aria-expanded') === 'true', 'the burger opens the menu');
  check(await page.$eval('#mobileMenu', (e) => /BOOM desks/.test(e.textContent) && !!e.querySelector('a[href="/madrid"]') && !!e.querySelector('a[href="/"]')), 'the menu lists the desks (the suite left the fixed chrome) and BOOM Rome');
  await page.click('#mobileMenu a[href="#faq"]');
  await page.waitForTimeout(300);
  check(!(await page.$eval('#mobileMenu', (e) => e.classList.contains('active'))), 'a menu link closes it');
  await ctx.close();
}

// ── the till: a plate's button opens the dialog on ITS plan, posts, follows, lands PAID ──
{
  const { ctx, page, st } = await open();
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
  check(!(await page.$eval('#paybar', (e) => e.classList.contains('on'))), 'the strip steps back while the dialog is open');
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
  await page.waitForTimeout(900);
  let co = {};
  try { co = JSON.parse(st.checkouts[0].body); } catch (e) {}
  check(st.checkouts.length === 1 && co.city === 'amsterdam' && co.kind === 'full-search' && co.name === 'Test Person' && co.email === 'test@example.com' && co.company === '' && !('eur' in co) && !('price' in co) && co.startNow === false,
    'the sheet posts { city, kind, name, email, startNow:false } once — never a price — and follows the URL', JSON.stringify(co));
  check(await page.isVisible('#fPaid') && !(await page.isVisible('#cityForm')) && /^Full Search · €500/.test((await page.textContent('#paidPlan')).trim()),
    'back from Stripe the card shows the PAID state for the plan, the form gives way');
  await page.waitForTimeout(1200);
  check(await boardWord(page, '#flapPaid') === 'PAID', 'the small board spells PAID');
  const purchases = (await layer(page)).filter((e) => e.name === 'purchase');
  check(purchases.length === 1 && purchases[0].p.transaction_id === 'cs_test_ui_1' && purchases[0].p.value === 500, 'ONE purchase event, with Stripe\'s session id and the plan\'s value');
  const keys = await page.evaluate(() => ({ s: Object.keys(sessionStorage), l: Object.keys(localStorage).filter((k) => /paid/.test(k)) }));
  check(keys.s.includes('boom:paid:cs_test_ui_1') && keys.l.length === 0, 'the purchase key lives in sessionStorage for the tab, never in localStorage');
  check(!/paid=/.test(page.url()) && /#contact$/.test(page.url()), 'the query is folded away: the URL can be shared without re-landing on a paid state');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check(!(await page.isVisible('#fPaid')) && await page.isVisible('#cityForm'), 'a reload shows the door again, not a second paid landing');
  await ctx.close();
}
// the "Start now" tick travels to the server; the paid landing says when work begins
{
  const { ctx, page, st } = await open({ checkout: { status: 200, body: { ok: true, url: `${base}/amsterdam?paid=attended-viewing&start=1&session_id=cs_test_ui_tick#contact` } } });
  await page.waitForTimeout(500);
  await tap(page, '[data-pay="attended-viewing"]');
  await page.waitForTimeout(500);
  await page.fill('#sName', 'Tick Person');
  await page.fill('#sEmail', 'tick@example.com');
  /* Enter on the checkbox toggles nothing and pays nothing: a keyboard user
     reaching the tick must not land on Stripe by accident */
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
  check(await page.isVisible('#fPaid') && !(await page.isVisible('#paidWait')), 'start=1: the paid card says nothing about waiting');
  await ctx.close();
  const { ctx: c0, page: p0 } = await open({ query: '?paid=full-search&start=0&session_id=cs_test_ui_wait' });
  await p0.waitForTimeout(500);
  const wait = (await p0.textContent('#paidWait').catch(() => '')) || '';
  check(await p0.isVisible('#paidWait') && /14-day withdrawal period ends/.test(wait) && wait.includes('hello@boom-rome.com'),
    'start=0: the paid card says the work begins when the 14 days end, and how to ask sooner', wait);
  const steps0 = (await p0.textContent('#paidNext')).replace(/\s+/g, ' ');
  check(!/same working day/i.test(steps0) && /When the 14 days end/.test(steps0) && /the day we start/.test(steps0) && /Nothing by then\?/.test(steps0),
    'start=0: the three steps are the waiting payer\'s own — never "same working day" — and the recourse stays', steps0);
  await c0.close();
  const { ctx: c1, page: p1 } = await open({ query: '?paid=full-search&start=1&session_id=cs_test_ui_now' });
  await p1.waitForTimeout(500);
  const steps1 = (await p1.textContent('#paidNext')).replace(/\s+/g, ' ');
  check(/Same working day/.test(steps1) && !(await p1.isVisible('#paidWait')), 'start=1: the steps of a payer who asked to start, no waiting line', steps1);
  await c1.close();
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
// the door: chips, errors in place, the send, OPEN with the computed reply window, the offer
{
  const { ctx, page, st } = await open();
  await page.waitForTimeout(600);
  const picked = () => page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; });
  check(await picked() === '', 'no service is pre-checked when the page opens');
  check(await page.$eval('#fMoveIn', (s) => s.options[0].value === '' && s.options[0].textContent === 'Not sure yet' && [...s.options].slice(1).every((o) => /^\d{4}-\d{2}$/.test(o.value))),
    'the move-in field is a month select: "Not sure yet" first, then months as YYYY-MM');
  await tap(page, '.chip:has(input[value="application-pack"])');
  check(await picked() === 'application-pack' && (await page.textContent('#plText')) === 'Application Pack · €199 · flat · incl. VAT', 'tapping a chip chooses the service and the plan line says it (no "from your check-in": the chip was the hand)');
  await tap(page, '#fGo');
  check(st.posts.length === 0 && await page.$eval('#fErr', (e) => e.classList.contains('on')) && (await page.textContent('#fErr')) === await page.getAttribute('#cityForm', 'data-err-name'),
    'an empty form sends nothing and says, in place, that the name is missing');
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
    && sent.email === 'test@example.com' && sent.service === 'application-pack' && sent.budget === '€1,500 – €2,000' && /^\d{4}-\d{2}$/.test(sent.moveIn) && sent.company === '',
    'a valid submit posts JSON once, with the city, the chosen service, the band, the month and an empty honeypot', JSON.stringify(sent));
  check(await page.isVisible('#fDone') && !(await page.isVisible('#cityForm')), 'on success the form gives way to "your file is open"');
  const when = (await page.textContent('#openWhen')).trim();
  check(WINDOW_RE.test(when), `the reply window is computed against the desk clock, never a static promise ("${when}")`);
  await page.waitForTimeout(1300);
  check(await boardWord(page, '#flapDone') === 'OPEN', 'the small board spells OPEN');
  check(await page.isVisible('#payOffer') && (await page.textContent('#payOfferAmt')).trim() === '€199' && await page.$eval('#payOfferRefund', (e) => e.hidden),
    'on a desk that sells, the card then offers to pay for the plan they chose (€199) — the refund line hidden, it is Full Search\'s');
  await page.click('#payOfferBtn');
  await page.waitForTimeout(500);
  check(await page.$eval('dialog#ov', (d) => d.open) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack'
    && await page.$eval('#sName', (e) => e.value) === 'Test Person' && await page.$eval('#sEmail', (e) => e.value) === 'test@example.com',
    'the offer opens the dialog on that plan with the name and email already in — nothing to re-type');
  check(st.errors.length === 0 && st.foreign.length === 0, 'no JS errors, no request to a host the page should not call', st.errors.join(' | ') + st.foreign.join(' | '));
  await ctx.close();
}
// Full Search chosen by hand: the offer carries the refund rule
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  await tap(page, '.chip:has(input[value="full-search"])');
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  check(await page.isVisible('#payOffer') && (await page.textContent('#payOfferAmt')).trim() === '€500' && !(await page.$eval('#payOfferRefund', (e) => e.hidden)),
    'with Full Search chosen the offer shows €500 and the refund rule beside it');
  await ctx.close();
}
// "not sure yet" gets no offer to pay: they asked for advice
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  await tap(page, '.chip.unsure');
  check((await page.textContent('#plText')) === 'Not sure yet · advise me', 'the plan line says "not sure yet · advise me"');
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  check(await page.isVisible('#fDone') && !(await page.isVisible('#payOffer')), '"not sure yet" opens the file and gets no checkout offer');
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
// a failed submit says so and gives the button back
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

// ── links land where they say ────────────────────────────────────────────
{
  const { ctx, page } = await open({ query: '#checkin=zero.abroad.soon.-' });
  await page.waitForTimeout(1900);
  let s = await passState(page);
  check(s.state === 'complete' && s.plan === 'Full Search' && s.code === 'START · ABROAD · T-4W' && s.landing === null,
    'my own link lands straight on the complete ticket: Full Search for someone who has not started, no banner');
  check(s.note === 'Four weeks is tight. We say so in the first call.' && s.ready === 'Tap the papers you hold above and we say what we would fix first.' && s.meter === '0%',
    'haven\'t started + within four weeks: the refusal is on the ticket; the papers untouched, the line invites');
  check(s.start === 'full-search' && s.startAmt === '€500' && s.moveIn === ymPlus(1), 'the till button on the pass says €500; the month prefilled one month out');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ query: '#checkin=xx.yy' });
  await p2.waitForTimeout(600);
  s = await passState(p2);
  check(s.state === 'blank' && JSON.stringify(s.stepsShown) === '[true,false,false]' && !/checkin/.test(await p2.evaluate(() => location.hash)),
    'a broken link opens the first step, nothing pre-ticked, and the address bar is clean');
  await c2.close();
  const { ctx: c2b, page: p2b } = await open({ query: '#checkin=zero.abroad.nowhere.-.w' });
  await p2b.waitForTimeout(800);
  s = await passState(p2b);
  check(s.state === 'resolved' && s.plan === 'Full Search' && s.landing === '2 of 3 answered, from the link you received.' && JSON.stringify(s.stepsShown) === '[true,true,true]',
    'a received link with one answer that does not exist keeps the two that do: the ticket resolved, the third step open, the banner counting — and no "taps to your plan" when the plan already prints');
  await c2b.close();
  const { ctx: c3, page: p3 } = await open({ query: '#checkin=shortlist.here.later.ff.l' });
  await p3.waitForTimeout(1900);
  s = await passState(p3);
  check(s.plan === 'Application Pack' && s.meter === '100%' && /^All eight in hand\./.test(s.ready) && await p3.$$eval('#pass input[name="ck-doc"]', (els) => els.every((e) => e.checked)) && s.passPapers === '8 of 8',
    'docs mask ff on my own link (via l): all eight ticked, the meter full, the line says the file is ready');
  await c3.close();
  const { ctx: c4, page: p4 } = await open({ query: '#checkin=zero.abroad.soon.b.w' });
  await p4.waitForTimeout(1200);
  s = await passState(p4);
  check(s.state === 'complete' && s.landing === "Your friend's answers. Change any of them, then your plan is yours." && s.meter === '0%' && s.passPapers === '—'
    && await p4.$$eval('#pass input[name="ck-doc"]', (els) => els.every((e) => !e.checked)),
    'a friend\'s link (via w): the ticket with the banner, and the friend\'s papers NOT ticked — the mask is ignored on a received link');
  check((await layer(p4)).find((e) => e.name === 'deeplink_landing').p.via === 'w', 'the landing event names the via');
  await c4.close();
  const { ctx: c5, page: p5 } = await open({ query: '#checkin=shortlist.-.-.-.w' });
  await p5.waitForTimeout(800);
  s = await passState(p5);
  check(s.state === 'pending' && s.landing === '1 of 3 answered, from the link you received. One tap to your plan.' && JSON.stringify(s.stepsShown) === '[true,true,false]',
    'a received partial link lands on the next step with the known answer ticked and counts the taps to the plan (one: a shortlist resolves on the second tap)');
  await c5.close();
  // an own reload is a resume, not "the link you received"
  const { ctx: c6, page: p6 } = await open();
  await tap(p6, ckOpt('shortlist'));
  await p6.waitForTimeout(500);
  await p6.reload({ waitUntil: 'load' });
  await p6.waitForTimeout(800);
  s = await passState(p6);
  const ev6 = await layer(p6);
  check(s.state === 'pending' && s.landing === null && s.hash === '#checkin=shortlist.-.-.-' && ev6.some((e) => e.name === 'checkin_resume') && !ev6.some((e) => e.name === 'deeplink_landing'),
    'my own answer, back after a reload: restored in silence (no banner, a resume event, not a deep link)');
  await c6.close();
}

// ── the consent plate waits for the reader ───────────────────────────────
{
  const { ctx, page } = await open({ consent: false });
  await page.waitForTimeout(2200);
  check(!(await plateUp(page)) && await page.$eval('body', (b) => b.hasAttribute('data-consent-late')), 'with data-consent-late the plate is not on the first screen after two seconds of reading');
  await page.click(ckOpt('zero'));                    // in the first screen: no scroll to reach it
  await page.waitForTimeout(1800);                      // the page scrolls ITSELF to land the pass: not the reader's move
  check(!(await plateUp(page)), 'a tap inside the diagnostic is the reader at work (and the page\'s own scroll is not a move): the plate still waits');
  // the ticket's foot in the band the plate would take (a wheel keeps scrolling after
  // its event, so the move that arms is a key pressed outside the work area)
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); const r = document.getElementById('pass').getBoundingClientRect(); window.scrollBy({ top: r.bottom - (innerHeight - 50), behavior: 'instant' }); });
  await page.waitForTimeout(200);
  await page.keyboard.press('Shift');
  await page.waitForTimeout(1500);
  check(!(await plateUp(page)), 'a move outside the work area arms it, but the ticket reaches the band the plate would cover: the reader is at work, the plate still waits');
  await page.evaluate(() => { const r = document.getElementById('pass').getBoundingClientRect(); window.scrollBy({ top: r.bottom - (innerHeight - 160), behavior: 'instant' }); });
  await page.waitForTimeout(1600);
  check(await plateUp(page), 'the ticket whole above the plate\'s band: it covers nothing the reader is working on, the plate comes');
  await page.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(1600);
  check((await plateUp(page)), 'once the hero is left the plate comes');
  await ctx.close();
  // a small phone, nothing answered: the ceiling must not land the plate on the options
  const { ctx: c0, page: p0 } = await open({ consent: false, width: 375 });
  await p0.mouse.wheel(0, 100);
  await p0.waitForTimeout(1500);
  check(!(await plateUp(p0)), '375px, the unanswered Check-in on the screen: armed, the plate still waits');
  await p0.evaluate(() => document.getElementById('how').scrollIntoView({ behavior: 'instant' }));
  await p0.waitForTimeout(1600);
  check((await plateUp(p0)), 'scrolled past the Check-in, it comes');
  await c0.close();
  const { ctx: c2, page: p2 } = await open({ consent: false });
  await p2.evaluate(() => document.getElementById('services').scrollIntoView({ behavior: 'instant' }));
  await p2.waitForTimeout(400);
  const stripBefore = await p2.$eval('#paybar', (e) => e.classList.contains('on'));
  await p2.$eval('[data-pay="full-search"]', (el) => el.click());   // the till
  await p2.waitForTimeout(300);
  await p2.mouse.wheel(0, 40);
  await p2.waitForTimeout(1800);
  check(await p2.$eval('dialog#ov', (d) => d.open) && !(await plateUp(p2)), 'while the till dialog is open the plate holds back (two things asking at once)');
  const stripOpen = await p2.$eval('#paybar', (e) => e.classList.contains('on'));
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(1200);
  check((await plateUp(p2)), 'once the dialog closes the plate comes');
  check(stripBefore && !stripOpen && await p2.$eval('#paybar', (e) => e.classList.contains('on')), 'the strip, off while the till is open, comes back when it closes — without a scroll');
  await c2.close();
}

// ── reduced motion: the word is there at once, nothing animates ─────────
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const b = await board(page);
  check(b.cells === 9 && b.letters === 'AMSTERDAM', 'with reduced motion the board is set still on AMSTERDAM, immediately');
  check(await page.$$eval('.rv .step, .rv .flow', (els) => els.every((e) => getComputedStyle(e).opacity === '1')), 'with reduced motion the children of a block do not wait for a stagger');
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(300);
  const s = await passState(page);
  check(s.state === 'resolved' && s.price === '€500' && await page.$eval('#pass', (e) => getComputedStyle(e).animationName === 'none'),
    'under reduced motion the pass arrives set — the price on the board at once, no entrance animation');
  await ctx.close();
}
// the motion, when it is allowed: the children of a block follow one beat apart
{
  const { ctx, page } = await open();
  await page.waitForTimeout(400);
  const before = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).opacity));
  await page.evaluate(() => document.getElementById('how').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(1600);
  const after = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).opacity));
  const delays = await page.$$eval('#how .step', (els) => els.map((e) => getComputedStyle(e).transitionDelay));
  check(before.every((o) => o === '0') && after.every((o) => o === '1') && new Set(delays).size === delays.length, `the steps start hidden and arrive one beat apart (delays ${delays.join(' ')})`);
  await ctx.close();
}

// ── the review of 17/10: what a real tap sequence found ──────────────────
{
  // a chip the reader chose by hand survives a paper tick, a pending stage and a new plan
  const { ctx, page } = await open();
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(700);
  await tap(page, ckOpt('here'));
  await page.waitForTimeout(700);
  await tap(page, ckOpt('months'));
  await page.waitForTimeout(900);
  let s = await passState(page);
  check(s.state === 'complete' && s.chip === 'application-pack' && s.planFrom === 'checkin', 'shortlist · here · months: Application Pack written into the door by the Check-in');
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="full-search"])');
  await page.waitForTimeout(200);
  s = await passState(page);
  check(s.chip === 'full-search' && s.planFrom === 'chip' && s.plText === 'Full Search · €500 · flat · incl. VAT', 'the reader taps Full Search by hand: the chip is theirs, the plan line says so without "from your check-in"');
  await tap(page, ckDoc('id'));
  await page.waitForTimeout(400);
  s = await passState(page);
  check(s.chip === 'full-search' && s.planFrom === 'chip' && s.passPapers === '1 of 8', 'a paper tick re-renders the pass and leaves the hand-chosen chip alone (it used to flip back to Application Pack)');
  await tap(page, '#checkin .ck-step[data-step="where"] .ck-change');
  await page.waitForTimeout(300);
  await tap(page, ckOpt('abroad'));
  await page.waitForTimeout(700);
  s = await passState(page);
  check(s.state === 'complete' && s.plan === 'Attended Viewing' && s.chip === 'full-search' && s.planFrom === 'chip' && s.file === 'attended-viewing', 'a new plan on the ticket does not overwrite the hand-chosen chip either; the pass\'s own door still points at its plan');
  await page.fill('#fName', 'Test Person'); await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  const ev = await layer(page);
  check(ev.find((e) => e.name === 'door_prefill').p.plan === 'full-search' && ev.find((e) => e.name === 'door_prefill').p.from === 'chip', 'the lead goes out with the plan the reader chose, attributed to the chip');
  await ctx.close();
  // a pending stage (the second step unanswered) clears a chip the Check-in wrote, never one the reader chose
  const { ctx: cp, page: pp } = await open();
  await tap(pp, ckOpt('zero'));
  await pp.waitForTimeout(700);
  await pp.$eval('#planline', (d) => { d.open = true; });
  await tap(pp, '.chip:has(input[value="application-pack"])');
  await tap(pp, '#checkin .ck-step[data-step="stage"] .ck-change');
  await pp.waitForTimeout(300);
  await tap(pp, ckOpt('shortlist'));
  await pp.waitForTimeout(700);
  s = await passState(pp);
  check(s.state === 'pending' && s.chip === 'application-pack' && s.planFrom === 'chip', 'a pending stage clears a chip the Check-in wrote, never one the reader chose');
  await cp.close();
}
{
  // the door sends ONCE per tap: Enter three times in the email field during a slow round trip
  const { ctx, page, st } = await open({ api: { status: 200, body: { ok: true, id: 'slow1' }, delay: 1200 } });
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await page.$eval('#planline', (d) => { d.open = true; });
  await tap(page, '.chip:has(input[value="full-search"])');
  await page.focus('#fEmail');
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#fDone.on', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const ev = await layer(page);
  check(st.posts.length === 1 && ev.filter((e) => e.name === 'sign_up').length === 1 && ev.filter((e) => e.name === 'generate_lead').length === 1, `three Enters, one POST, one lead (${st.posts.length} POST, ${ev.filter((e) => e.name === 'sign_up').length} sign_up)`);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'fDone', 'after the send focus is on the open file, not on <body>');
  await tap(page, '#payOfferBtn');
  await page.waitForTimeout(400);
  const bc = (await layer(page)).filter((e) => e.name === 'begin_checkout');
  check(await page.$eval('dialog#ov', (d) => d.open) && bc.length === 1 && bc[0].p.source === 'after-lead' && (await page.inputValue('#sName')) === 'Test Person', 'one click on the offer opens the till once, prefilled (the button is bound once)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'payOfferBtn', 'Escape gives focus back to the offer button');
  await ctx.close();
}
{
  // the pass lands on the tap that resolves a pending stage
  const { ctx, page } = await open();
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(1200);
  await page.$eval(ckOpt('abroad'), (el) => el.click());   // where it sits after the landing, no scroll of ours
  await page.waitForTimeout(1200);
  const s = await passState(page);
  check(s.state === 'resolved' && s.rect.bottom <= 846 && s.rect.top >= 0, `the second tap grows the pass by the plan box and the page lands it (top ${s.rect.top}, bottom ${s.rect.bottom})`);
  // "change", then the same answer: the step folds
  await tap(page, '#checkin .ck-step[data-step="stage"] .ck-change');
  await page.waitForTimeout(200);
  const openBefore = await page.$$eval('#checkin .ck-step[data-step="stage"] .ck-opt', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
  await tap(page, ckOpt('shortlist'));
  await page.waitForTimeout(300);
  const folded = await page.$eval('#checkin .ck-step[data-step="stage"]', (e) => e.classList.contains('done'));
  check(openBefore === 3 && folded && (await passState(page)).state === 'resolved', 're-picking the same answer after "change" folds the step again (an already-checked radio fires no change event)');
  // the month the page prefilled follows the answer and leaves with it; a month the reader picked stays
  await tap(page, ckOpt('soon'));
  await page.waitForTimeout(500);
  check((await passState(page)).moveIn === ymPlus(1), `within four weeks → ${ymPlus(1)} prefilled`);
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('later'));
  await page.waitForTimeout(500);
  check((await passState(page)).moveIn === '', '"later, flexible": the page\'s own prefill leaves (it used to stay and contradict the answer on the lead)');
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('months'));
  await page.waitForTimeout(500);
  check((await passState(page)).moveIn === ymPlus(2), `"1–3 months" → ${ymPlus(2)}`);
  await page.selectOption('#fMoveIn', { index: 8 });
  const mine = await page.inputValue('#fMoveIn');
  await tap(page, '#checkin .ck-step[data-step="when"] .ck-change');
  await page.waitForTimeout(200);
  await tap(page, ckOpt('soon'));
  await page.waitForTimeout(500);
  check((await passState(page)).moveIn === mine && mine !== ymPlus(1), 'a month the reader picked is never touched by a changed answer');
  // four quick paper ticks are four ticks (the view-transition overlay no longer eats the next tap)
  for (const d of ['id', 'contract', 'payslips', 'bank']) { await page.$eval(ckDoc(d), (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.$eval(ckDoc(d) + ' input', (el) => el.click()); await page.waitForTimeout(120); }
  await page.waitForTimeout(500);
  check((await passState(page)).passPapers === '4 of 8', 'four ticks 120 ms apart → "4 of 8"');
  // the price and the plan are read as text; one small live region
  const a11y = await page.evaluate(() => ({ sr: document.getElementById('ckPriceSr').textContent, live: document.getElementById('ckLive').textContent, boardHidden: document.getElementById('ckPrice').getAttribute('aria-hidden'), boxLive: document.getElementById('ckPlanBox').getAttribute('aria-live'), h1: document.querySelector('.hero h1 .sr').textContent, flapHidden: document.getElementById('flapCity').getAttribute('aria-hidden'), note: document.getElementById('ckNote').textContent }));
  check(a11y.sr === '€149 per viewing' && a11y.live === 'Attended Viewing, €149. ' + a11y.note && a11y.note.length > 10 && a11y.boardHidden === 'true' && a11y.boxLive === null && a11y.h1 === 'Amsterdam' && a11y.flapHidden === 'true',
    'the amount is text beside a decorative board, the plan is announced once in a small live region and the third tap\'s note after it, the title board is decorative and the city is read as text');
  await ctx.close();
}
{
  // the phone's focus order meets the ticket where it appears; the menu is inert off-screen
  const { ctx, page } = await open();
  check(await page.evaluate(() => document.getElementById('checkin').nextElementSibling === document.getElementById('pass') && document.getElementById('pass').nextElementSibling.classList.contains('skipck')),
    '390px: the pass follows the Check-in in the DOM and the skip link follows the pass (reading order = focus order)');
  const menu = await page.evaluate(() => { const m = document.getElementById('mobileMenu'); return { inert: m.inert === true, vis: getComputedStyle(m).visibility, ah: m.getAttribute('aria-hidden') }; });
  check(menu.inert && menu.vis === 'hidden' && menu.ah === 'true', 'closed, the menu is inert, visibility hidden and aria-hidden');
  await page.focus('#navToggle');
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => !document.getElementById('mobileMenu').contains(document.activeElement) && !!document.activeElement.closest('#checkin')), 'Tab from the burger skips the ten off-screen links and lands in the Check-in');
  await page.click('#navToggle');
  await page.waitForTimeout(600);
  check(await page.evaluate(() => document.getElementById('mobileMenu').contains(document.activeElement) && document.body.classList.contains('menu-open') && document.getElementById('mobileMenu').inert === false), 'open, focus moves into the menu and the body says menu-open (the consent plate hides under it)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => !document.getElementById('mobileMenu').classList.contains('active') && document.activeElement.id === 'navToggle' && !document.body.classList.contains('menu-open')), 'Escape closes it and gives focus back to the burger');
  await tap(page, ckOpt('zero')); await page.waitForTimeout(700);
  await tap(page, ckOpt('abroad')); await page.waitForTimeout(700);
  await tap(page, ckOpt('months')); await page.waitForTimeout(900);
  await page.focus('#checkin input[name="ck-when"]:checked');
  await page.keyboard.press('Tab');
  const t1 = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Tab');
  const t2 = await page.evaluate(() => !!document.activeElement.closest('#pass'));
  check(t1 === 'ck-change' && t2, 'after the third answer: Tab → "change", Tab → INTO the pass (it used to jump over the ticket to the skip link and the facts)');
  await ctx.close();
}
{
  // a phone that widens into a desk before the first tap: the blank pass gets its board
  const { ctx, page } = await open();
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(900);
  const s = await passState(page);
  check(s.state === 'blank' && s.display !== 'none' && s.board === 'AMSTERDAM' && await page.evaluate(() => document.getElementById('pass').parentNode.classList.contains('hero-right')), 'widened to 1024 before any tap: the pass is in the right column with AMSTERDAM on its board');
  await ctx.close();
}
{
  // ?paid= with an inherited key is not a plan
  const { ctx, page } = await open({ query: '?paid=constructor&session_id=cs_x' });
  await page.waitForTimeout(400);
  check(!(await page.isVisible('#fPaid')) && await page.isVisible('#cityForm') && !(await layer(page)).some((e) => e.name === 'purchase'), '?paid=constructor shows no PAID card and counts no sale');
  await ctx.close();
}
{
  // the desk's weekend: the sub says the window, the zone label follows the clock, the days are printed
  const { ctx, page } = await open({ clock: '2026-10-17T09:00:00Z' });   // Saturday 11:00 in Rome (CEST)
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => ({ go: document.querySelector('#fGo small').textContent, pass: document.querySelector('#ckFile small').textContent, strip: document.getElementById('stripSub').textContent, dataSub: document.getElementById('paybar').getAttribute('data-sub'), tz: [...document.querySelectorAll('[data-tz]')].map((e) => e.textContent).join(','), facts: document.querySelector('.facts div:nth-child(4) dd').textContent }));
  check(d.go === 'free · Monday from 09:00 CEST' && d.pass === d.go && d.strip === d.go && d.dataSub === d.go, `Saturday: "same-day reply" becomes the window on the door, the pass and the strip ("${d.go}")`);
  check(d.tz === 'CEST,CEST' && /desk Mon–Fri 09:00 to 19:00 CEST/.test(d.facts), 'the zone label reads CEST in October, the facts print the desk days');
  await page.fill('#fName', 'Test Person'); await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  check((await page.textContent('#openWhen')) === 'Monday from 09:00 CEST' && /Nothing by then\?/.test(await page.textContent('#fDone')), 'the OPEN card says Monday, and the recourse line says "by then", not "tomorrow"');
  await ctx.close();
  const { ctx: c2, page: p2 } = await open({ clock: '2026-10-19T09:00:00Z' });   // Monday 11:00
  await p2.waitForTimeout(300);
  check((await p2.textContent('#fGo small')) === 'free · same-day reply' && (await p2.textContent('#stripSub')) === 'free · same-day reply', 'Monday at 11:00: the desk is open, the sub stays "same-day reply"');
  await c2.close();
}

// ── 1440px: the pass is on the page from load, blank, in the right column ──
{
  const { ctx, page } = await open({ width: 1440 });
  await page.waitForTimeout(2600);
  const b = await board(page);
  check(b.cells === 9 && Math.abs(b.minW - b.contentW) < 4, `1440px: the same board, the same reservation (${b.contentW.toFixed(0)}px)`);
  let s = await passState(page);
  check(s.state === 'blank' && s.display !== 'none' && s.blankShown && s.board === 'AMSTERDAM' && s.code === '—',
    'at 1440 the pass is on the page from load, blank, the city on its board and "your plan prints here as you answer"');
  const geo = await page.evaluate(() => {
    const h1 = document.querySelector('.hero h1').getBoundingClientRect(), pass = document.getElementById('pass').getBoundingClientRect(), card = document.querySelector('.filecard').getBoundingClientRect();
    const right = document.querySelector('.hero-right');
    return { twoCols: pass.left > h1.right && card.left > h1.right, passAboveDoor: pass.bottom <= card.top + 1, passTop: pass.top, h1Top: h1.top, sticky: getComputedStyle(right).position, top: right.style.top, colH: right.getBoundingClientRect().height, leftH: document.querySelector('.hero-left').getBoundingClientRect().height, inRight: document.getElementById('pass').parentNode === right, afterCk: document.getElementById('checkin').nextElementSibling === document.getElementById('pass') };
  });
  check(geo.twoCols && geo.passAboveDoor && Math.abs(geo.passTop - geo.h1Top) < 80 && geo.inRight && !geo.afterCk, 'the pass sits beside the title with the door under it: two columns (the JS moved it into the right column)');
  check(geo.sticky !== 'sticky' && geo.top === '',
    `no sticky column on the desk (position ${geo.sticky}; right ${Math.round(geo.colH)}px, left ${Math.round(geo.leftH)}px)`);
  check(await page.isVisible('.nav-links .nav-door') && (await page.textContent('.nav-links .nav-door')).trim() === 'Open my file' && !(await page.isVisible('#navToggle')),
    '1440px: desktop nav with the door as a text link, no burger');
  check(await page.$eval('#paybar', (e) => getComputedStyle(e).display === 'none'), '1440px: no strip');
  await tap(page, ckOpt('found'));
  await page.waitForTimeout(600);
  s = await passState(page);
  check(s.state === 'resolved' && s.plan === 'Application Pack' && s.inClass && geo.passTop >= 0, 'a tap fills the ticket in place: no scroll, no jump at 1440');
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
  const chipTxt = await page.$$eval('.chip small', (els) => els.map((e) => e.textContent.trim()));
  const wl = ['barcelona', 'paris', 'berlin'].includes(slug);
  check(chipTxt[0].startsWith('€500') && chipTxt[1].startsWith('€199') && chipTxt[2].startsWith('€149') && chipTxt.every((t, i) => i === 3 || /VAT/.test(t)) && (wl ? chipTxt.slice(0, 3).every((t) => /at opening|on signing/.test(t)) : chipTxt.slice(0, 3).every((t) => !/opening|sign/.test(t))),
    `${slug}: the chips carry the brief's prices with each plan's own condition (${chipTxt.slice(0, 3).join(' | ')})`);
  await tap(page, ckOpt('zero'));
  await page.waitForTimeout(1900);
  const s = await passState(page);
  if (wl) {
    check(await page.$('dialog#ov') === null && await page.$('[data-pay]') === null && (await page.textContent('.pricenote')).trim() === 'List prices, VAT included. Each plan says when it is charged.',
      `${slug}: no dialog, no pay control; under the chips the line says each plan states when it is charged`);
    check(s.plan === 'Full Search' && s.price === '€500' && s.start === null && s.file === 'full-search' && s.refundShown === null
      && (slug === 'berlin' ? s.cond === 'flat · incl. VAT · on signing' && /once you sign a lease/.test(await page.textContent('#ckCondLong')) : s.cond === 'flat · incl. VAT · at opening' && /when the desk opens/.test(await page.textContent('#ckCondLong'))),
      `${slug}: the pass says Full Search €500 with ITS condition ("${s.cond}") and one door, the free file`);
    await tap(page, '#plan-application-pack .go');
    await page.waitForTimeout(400);
    check(await page.$eval('#cityForm', (f) => { const r = f.querySelector('input[name="service"]:checked'); return r ? r.value : ''; }) === 'application-pack',
      `${slug}: the plate's primary leads to the door and checks its chip`);
  } else {
    check(s.plan === 'Full Search' && s.price === '€500' && s.start === 'full-search' && s.refundShown === true, `${slug}: the pass says Full Search €500 with the till button and the refund rule`);
    await tap(page, '[data-pay="application-pack"]');
    await page.waitForTimeout(500);
    check(await page.$eval('dialog#ov', (d) => d.open) && await page.$eval('input[name="payplan"]:checked', (e) => e.value) === 'application-pack', `${slug}: the plate's pay link opens the dialog on its plan`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // the pass wrote Full Search into the door and folded the plan line: a
    // change by hand starts by unfolding it (the "change" tag on the summary)
    check(!(await page.$eval('#planline', (d) => d.open)) && !(await page.$eval('#plChange', (e) => e.hidden)), `${slug}: the plan line folded on the plan the pass wrote, with its "change" tag`);
    await tap(page, '#planline summary');
    await page.waitForTimeout(200);
    await tap(page, '.chip:has(input[value="application-pack"])');
    check((await page.textContent('#plText')) === 'Application Pack · €199 · flat · incl. VAT', `${slug}: a chip chosen by hand replaces the pass's plan and drops the "from your check-in" tag`);
  }
  await page.fill('#fName', 'Test Person');
  await page.fill('#fEmail', 'test@example.com');
  await tap(page, '#fGo');
  await page.waitForSelector('#fDone.on', { timeout: 4000 }).catch(() => {});
  let sent = {};
  try { sent = JSON.parse(st.posts[0].body); } catch (e) {}
  check(st.posts.length === 1 && sent.city === slug && sent.service === 'application-pack' && st.errors.length === 0,
    `${slug}: the form posts city "${slug}" once, with Application Pack chosen, and no JS error`, JSON.stringify(sent) + ' ' + st.errors.join('|'));
  await ctx.close();
}

// ── a touch screen: the same page, nothing hover-bound ───────────────────
{
  const { ctx, page, st } = await open({ touch: true });
  await page.waitForTimeout(600);
  await page.tap(ckOpt('zero'));
  await page.waitForTimeout(800);
  const s = await passState(page);
  check(s.state === 'resolved' && s.display !== 'none' && st.errors.length === 0, 'on a touch screen the first tap brings the live ticket, no error');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
