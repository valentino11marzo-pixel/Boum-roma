// tests/cities/ui.mjs — the generated city page in a real Chromium.
//
// What it proves (BOOM_CITIES_BRIEF.md §3, §6, §7, §10):
//   - with JS OFF nothing stays invisible: the reveal animation hid stats,
//     plans and checks for good in the hand-built original;
//   - with JS ON the reveal still runs (the fix did not kill the animation);
//   - 390px: no horizontal scroll, the sticky CTA is there;
//   - the form: an invalid submit sends nothing; a valid one posts the
//     fields + access key and reveals the Stripe step; a failed one says so
//     and gives the button back; a pricing CTA preselects its plan;
//   - zero JS errors, and no request leaves for a host we did not stub.
//
// The page is served from the repo root (it links /assets/…). Every request
// outside localhost is aborted: Web3Forms is answered by the test.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? ` — ${why}` : '')));

console.log('\n\x1b[1m▸ citiesui\x1b[0m  the city page in a real browser: readable without JS, form end to end');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
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

async function open({ js = true, width = 390, web3 = { success: true } } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  const st = { errors: [], posts: [], foreign: [] };
  page.on('pageerror', (e) => st.errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('https://api.web3forms.com/')) {
      st.posts.push(r.request().postData() || '');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(web3) });
    }
    if (u.startsWith(base)) return r.continue();
    if (!/fonts\.(googleapis|gstatic)\.com/.test(u)) st.foreign.push(u);
    return r.abort();
  });
  await page.goto(`${base}/amsterdam`, { waitUntil: 'load' });
  return { ctx, page, st };
}

// ── JS off: everything readable, links still work ─────────────────────────
{
  const { ctx, page } = await open({ js: false });
  const hidden = await page.$$eval('.reveal', (els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
  const total = await page.$$eval('.reveal', (els) => els.length);
  check(total > 10 && hidden === 0, `without JS all ${total} reveal blocks are visible (the original hid them forever)`, `${hidden} hidden`);
  const wa = await page.getAttribute('#wa-top', 'href');
  check(/^https:\/\/wa\.me\/\w+\?text=/.test(wa || ''), 'without JS the WhatsApp button is a real link');
  const spots = await page.textContent('[data-spots-left]');
  check(spots === '10', 'without JS the spots counter still shows the configured number');
  await ctx.close();
}

// ── JS on, 390px: the reveal still animates, the layout holds ─────────────
{
  const { ctx, page, st } = await open();
  const lastCard = page.locator('.card.reveal').last();
  const before = await lastCard.evaluate((e) => getComputedStyle(e).opacity);
  await lastCard.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const els = document.querySelectorAll('.card.reveal');
    return els[els.length - 1].classList.contains('in');
  }, null, { timeout: 4000 }).catch(() => {});
  const after = await lastCard.evaluate((e) => e.classList.contains('in'));
  check(before === '0' && after, 'with JS a block starts hidden and is revealed when scrolled into view');
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= 390, `390px: no horizontal scroll (scrollWidth ${scrollW})`);
  check(await page.isVisible('.sticky'), '390px: the sticky bottom CTA is shown');
  check(!(await page.isVisible('.nav-cta')), '390px: the nav CTA hides (the sticky bar replaces it)');

  // Pricing CTA preselects its plan
  await page.click('.plan [data-plan="Application Pack"]');
  check(await page.inputValue('#plan') === 'Application Pack', 'a pricing CTA preselects its plan in the form');

  // Invalid submit: nothing leaves
  await page.click('#submit-btn');
  check(st.posts.length === 0, 'an incomplete form sends nothing');

  // Valid submit: posted, success shown, Stripe step revealed
  await page.fill('#name', 'Test Person');
  await page.fill('#email', 'test@example.com');
  await page.fill('#phone', '+31600000000');
  await page.fill('#movein', '2027-02');
  await page.selectOption('#budget', { index: 2 });
  await page.click('#submit-btn');
  await page.waitForSelector('#success.show', { timeout: 4000 }).catch(() => {});
  const body = st.posts[0] || '';
  check(st.posts.length === 1 && /name="access_key"/.test(body) && /name="city"\r\n\r\nAmsterdam/.test(body)
    && /name="service"\r\n\r\nApplication Pack/.test(body),
    'a valid submit posts once, with the access key, the city and the chosen service');
  check(await page.isVisible('#success') && !(await page.isVisible('#reserve-form')),
    'on success the form gives way to the deposit step');
  const stripe = await page.getAttribute('#stripe-btn', 'href');
  check(/^https:\/\/buy\.stripe\.com\//.test(stripe || ''), 'the deposit step links to Stripe');
  check(st.errors.length === 0, 'no JS errors', st.errors.join(' | '));
  check(st.foreign.length === 0, 'no request to a host the page should not call', st.foreign.join(' | '));
  await ctx.close();
}

// ── a failed submit says so and gives the button back ─────────────────────
{
  const { ctx, page } = await open({ web3: { success: false } });
  let dialog = '';
  page.on('dialog', async (d) => { dialog = d.message(); await d.dismiss(); });
  const label = await page.textContent('#submit-btn');
  await page.fill('#name', 'Test Person');
  await page.fill('#email', 'test@example.com');
  await page.fill('#phone', '+31600000000');
  await page.fill('#movein', '2027-02');
  await page.selectOption('#budget', { index: 1 });
  await page.click('#submit-btn');
  await page.waitForFunction(() => !document.getElementById('submit-btn').disabled, null, { timeout: 4000 }).catch(() => {});
  const expected = await page.getAttribute('#reserve-form', 'data-error');
  check(dialog && dialog === expected, 'a failed submit shows the page\'s own error text (from the city data)');
  check(await page.textContent('#submit-btn') === label && !(await page.isVisible('#success')),
    'the button gets its label back and the success step stays hidden');
  await ctx.close();
}

// ── 1440px: desktop nav, no sticky bar ─────────────────────────────────────
{
  const { ctx, page } = await open({ width: 1440 });
  check(await page.isVisible('.nav-cta') && !(await page.isVisible('.sticky')), '1440px: nav CTA shown, sticky bar hidden');
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
