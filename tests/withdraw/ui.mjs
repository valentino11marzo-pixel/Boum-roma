// tests/withdraw/ui.mjs — the online withdrawal function, page half (city
// desks v1.8, stage W; spec §7). withdrawal.html served as it is, in Chromium,
// with /api/withdraw stubbed by page.route (the server half has its own suite,
// tests/withdraw/run.mjs, on the real handler).
//
// What must hold, from a phone at 390 px:
//   · step 1: "Withdraw from contract here" (#online, first on the page) opens
//     the statement — name, the email used, the reference, the desk, the
//     service — prefilled from ?desk=&service=&ref=, an unknown value
//     selecting nothing;
//   · the errors are said ON the field (aria-invalid, aria-describedby) and
//     the focus goes to the first field in error; the server's own 400 on a
//     field comes back to that field;
//   · step 2: the summary and "Confirm withdrawal"; one POST per statement
//     even under a double tap or a double Enter, the body the server reads
//     ({name, email, ref, desk, service, requestId, company, lang}), the same
//     requestId on a retry after a failure; then "Received. We emailed you a
//     copy with the date and time." with the focus on it;
//   · Italian labels ("Recedi dal contratto qui" / "Conferma recesso") with
//     ?desk=Roma — the Pacchetto's own link — or ?lang=it; ?lang=en wins;
//   · no horizontal scroll at 390 and 320 px in every step; no tracking, no
//     request beyond the page and /api/withdraw; the model forms and the
//     mailto helper still there; without JavaScript the page says what to do;
//   · mutations: the in-flight guard, the Italian trigger and the label put
//     back wrong, one at a time, are caught.
//
// Run: BOOM_PLAYWRIGHT=/path/to/playwright-core/index.js node tests/withdraw/ui.mjs
// (the source checks run without a browser; the rest prints SKIP without one).

import { loadChromium, launchOptions } from '../_browser.mjs';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, 'utf8');
let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || extra == null ? '' : ` — ${String(extra).slice(0, 300)}`}`);
  ok ? pass++ : fail++;
};
const section = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
const finish = () => {
  console.log(`\n\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exit(fail ? 1 : 0);
};

const WD = read('withdrawal.html');
const PK = read('pacchetto-concordato.html');
const EN = { open: 'Withdraw from contract here', confirm: 'Confirm withdrawal', done: 'Received. We emailed you a copy with the date and time.' };
const IT = { open: 'Recedi dal contratto qui', confirm: 'Conferma recesso', done: 'Ricevuto. Le abbiamo inviato per email una copia con data e ora.' };
const DESKS = ['Amsterdam', 'Barcelona', 'Berlin', 'London', 'Madrid', 'Milan', 'Paris', 'Valencia'];

// ═══ 0 · the source, no browser ═════════════════════════════════════════════
section('0. The source: no tracking, the labels, #online first, the forms that stay, the Pacchetto link');
{
  const scripts = [...WD.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
  check('no tracking: no gtag/GA, no boom-track or boom-consent, no dataLayer, no external script (as before W)',
    !/gtag|googletagmanager|google-analytics|boom-track|boom-consent|dataLayer|fbq\(|clarity/i.test(WD) && scripts.every((a) => !/\bsrc=/i.test(a)),
    scripts.join(' | '));
  check('the statutory labels, English and Italian, are in the page', [EN.open, EN.confirm, IT.open, IT.confirm].every((s) => WD.includes(s)));
  const keys = [...new Set([...WD.matchAll(/data-t="([A-Za-z]+)"/g)].map((m) => m[1]))];
  const itBlock = (WD.match(/\bit: \{([\s\S]*?)\n {12}\}/) || [])[1] || '';
  const missing = keys.filter((k) => !new RegExp(`\\b${k}: ['"]`).test(itBlock));
  check(`every label of the function (${keys.length}) has its Italian string`, keys.length >= 20 && missing.length === 0, missing.join(', '));
  check('the honeypot posts as `company` but no input is named company/organization (autofill would fill it for a real person)',
    /company: \$\('oHp'\)\.value/.test(WD) && !/<input[^>]*(?:name|id)="[^"]*(?:company|organi[sz]ation)[^"]*"/i.test(WD.slice(WD.indexOf('id="online"'), WD.indexOf('</section>'))));
  const iOnline = WD.indexOf('id="online"'), iHow = WD.indexOf('<h2>How it works</h2>'), iAnnex = WD.indexOf('id="annex-en"');
  check('#online is the first section: before "How it works" and the model form', iOnline > 0 && iOnline < iHow && iHow < iAnnex, `${iOnline} ${iHow} ${iAnnex}`);
  const sec = WD.slice(iOnline, WD.indexOf('</section>', iOnline));
  check('the open button is inside #online, a real <button>', /<button type="button" class="btn js-only" id="oOpen"[^>]*>Withdraw from contract here<\/button>/.test(sec));
  check('the model forms stay (EN Annex I(B) and the Italian modulo), and the mailto helper below them',
    WD.includes('id="annex-en"') && WD.includes('id="annex-it"') && /id="wSend" href="mailto:hello@boom-rome\.com/.test(WD)
      && WD.indexOf('id="wf"') > iAnnex && WD.includes('I/We (*) hereby give notice that I/We (*) withdraw'));
  const opts = (id) => (WD.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`)) || [])[1] || '';
  for (const id of ['oDesk', 'wCity']) {
    const o = opts(id);
    check(`${id}: the eight desks (Paris and Berlin added) and Rome, posted as "Roma"`,
      DESKS.every((d) => o.includes(`<option value="${d}">${d}</option>`)) && o.includes('<option value="Roma">Rome</option>'), o.replace(/\s+/g, ' ').slice(0, 300));
  }
  check('the online desk list ends with "other" (the server\'s closed list)', /<option value="other"[^>]*>Other<\/option>\s*$/.test(opts('oDesk')));
  const rec = (PK.match(/<p class="recesso">[\s\S]*?<\/p>/) || [''])[0];
  check('the Pacchetto\'s withdrawal line links /withdrawal?desk=Roma&service=concordato-pack#online (new tab: the checkout stays)',
    rec.includes('<a href="/withdrawal?desk=Roma&amp;service=concordato-pack#online" target="_blank" rel="noopener">online</a>'), rec);
  check('…and still names the email and the 14 days (tests/conto reads them)', /Recesso: 14 giorni/.test(rec) && /con una email a <a href="mailto:hello@boom-rome\.com">/.test(rec));
}

const chromium = await loadChromium();
if (!chromium) {
  if (fail) finish();
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}

const browser = await chromium.launch(launchOptions());
const errs = [];
const RID = /^[a-z0-9-]{8,64}$/i;   // the server's own test (api/withdraw.js)

// One page, served from the repo (or a mutated copy), /api/withdraw answered
// from `answers` in order (the last one repeats), everything else refused and
// recorded: a withdrawal page asks nobody else for anything.
async function open(qs = '', { width = 390, height = 844, js = true, touch = false, answers = [], html = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: js, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const posts = [], foreign = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let n = 0;
  await page.route('**/*', async (r) => {
    const req = r.request(), u = req.url();
    if (u.startsWith('http://boom.test/api/withdraw')) {
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = req.postData(); }
      posts.push({ method: req.method(), type: req.headers()['content-type'] || '', body });
      const a = answers[Math.min(n++, answers.length - 1)] || { status: 200, body: { ok: true } };
      if (a.delay) await new Promise((res) => setTimeout(res, a.delay));
      if (a.abort) return r.abort('connectionreset');
      return r.fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body) });
    }
    const p = u.startsWith('http://boom.test/') ? new URL(u).pathname : null;
    if (p === '/withdrawal') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html || WD });
    if (p === '/favicon.ico') return r.fulfill({ status: 404, body: '' });
    foreign.push(u);
    return r.abort();
  });
  await page.goto('http://boom.test/withdrawal' + qs, { waitUntil: 'load' });
  return { ctx, page, posts, foreign };
}
const shown = (page, sel) => page.$eval(sel, (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).catch(() => false);
const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const val = (page, sel) => page.$eval(sel, (e) => e.value).catch(() => null);
const focused = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
const widths = (page) => page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`);
// the error is said ON its field: inside the same block, right below it (the
// hint, if any, comes after it), and the field points to it
const errOnField = (page, input, err) => page.evaluate(([i, e]) => {
  const a = document.getElementById(i), b = document.getElementById(e);
  if (!a || !b || !b.textContent.trim()) return false;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  return a.getAttribute('aria-invalid') === 'true' && (a.getAttribute('aria-describedby') || '').split(/\s+/).includes(e)
    && b.closest('.fld') === a.closest('.fld') && rb.top >= ra.bottom - 1 && rb.top - ra.bottom < 16 && Math.abs(rb.left - ra.left) < 24;
}, [input, err]);
const settle = (page, ms = 150) => page.waitForTimeout(ms);

// ═══ 1 · English, from a desk's link ═══════════════════════════════════════
section('1. From a desk\'s link at 390 px: the button, the form prefilled, the errors on the field, the summary, one POST');
{
  const { ctx, page, posts, foreign } = await open('?desk=Amsterdam&service=full-search&ref=BM%20X7K2Q#online',
    { answers: [{ status: 200, body: { ok: true }, delay: 600 }] });
  check('step 1 is a button: "Withdraw from contract here", visible; form, summary and receipt hidden',
    await txt(page, '#oOpen') === EN.open && await shown(page, '#oOpen') && !(await shown(page, '#oForm')) && !(await shown(page, '#oReview')) && !(await shown(page, '#oDone')));
  check('#online lands on the button: it is on the first screen', await page.$eval('#oOpen', (b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
  check('the page stays English (no lang="it" on the function)', await page.$eval('#online', (s) => s.getAttribute('lang')) === null);
  check('no horizontal scroll at load', await noSideScroll(page), await widths(page));
  await page.click('#oOpen');
  check('the button opens the form and makes way for it; the focus goes to the first field',
    await shown(page, '#oForm') && !(await shown(page, '#oOpen')) && await focused(page) === 'oName');
  check('prefilled from the link: desk Amsterdam, service Full Search, reference "BM X7K2Q"',
    await val(page, '#oDesk') === 'Amsterdam' && await val(page, '#oService') === 'full-search' && await val(page, '#oRef') === 'BM X7K2Q');
  check('the mailto helper below is prefilled the same way, as before', await val(page, '#wCity') === 'Amsterdam' && await val(page, '#wService') === 'full-search');
  check('no horizontal scroll with the form open', await noSideScroll(page), await widths(page));

  await page.click('#oNext');
  await settle(page);
  check('Continue with nothing typed: the name and the email are refused on their fields, nothing sent',
    await errOnField(page, 'oName', 'oNameErr') && await errOnField(page, 'oEmail', 'oEmailErr') && posts.length === 0
      && await txt(page, '#oNameErr') === 'Write your name.' && await txt(page, '#oEmailErr') === 'Write the email you used, in full.');
  check('…the focus is on the first field in error, and step 2 is not shown', await focused(page) === 'oName' && !(await shown(page, '#oReview')));
  check('…the polite live line says it too (for the case where the focus cannot move)', await page.waitForFunction(() => document.getElementById('oFormLive').textContent === 'Write your name.', null, { timeout: 1000 }).then(() => true).catch(() => false));
  check('no horizontal scroll with the errors shown', await noSideScroll(page), await widths(page));
  await page.fill('#oName', '  Anna Keller ');
  check('typing in a field clears its own error only', await txt(page, '#oNameErr') === '' && await page.$eval('#oName', (e) => !e.hasAttribute('aria-invalid')) && await txt(page, '#oEmailErr') !== '');
  await page.fill('#oEmail', 'anna@example');
  await page.click('#oNext');
  await settle(page);
  check('an email the server would refuse (no dot after @) is refused here, focus on it', await errOnField(page, 'oEmail', 'oEmailErr') && await focused(page) === 'oEmail' && posts.length === 0);
  await page.fill('#oEmail', 'anna@example.com');
  await page.press('#oEmail', 'Enter');
  await settle(page);
  check('Enter in a field = Continue: step 2, the form hidden, focus on its heading, still nothing sent',
    await shown(page, '#oReview') && !(await shown(page, '#oForm')) && await focused(page) === 'oReviewH' && posts.length === 0);
  check('the summary says what will be sent', await txt(page, '#oSumName') === 'Anna Keller' && await txt(page, '#oSumEmail') === 'anna@example.com'
    && await txt(page, '#oSumRef') === 'BM X7K2Q' && await txt(page, '#oSumDesk') === 'Amsterdam' && await txt(page, '#oSumService') === 'Full Search');
  check('…in the words of the model form', await txt(page, '#oStmt') === 'I hereby give notice that I withdraw from my contract for the provision of the following service: Full Search (Amsterdam).', await txt(page, '#oStmt'));
  check('step 2 carries "Confirm withdrawal"', await txt(page, '#oConfirm') === EN.confirm && await shown(page, '#oConfirm'));
  check('no horizontal scroll on the summary', await noSideScroll(page), await widths(page));
  await page.click('#oEdit');
  check('Edit goes back to the form, values intact, focus on the first field',
    await shown(page, '#oForm') && !(await shown(page, '#oReview')) && await focused(page) === 'oName' && await val(page, '#oEmail') === 'anna@example.com' && await val(page, '#oName') === '  Anna Keller ');
  await page.click('#oNext');
  await settle(page);

  await page.dblclick('#oConfirm');
  check('while the statement is in flight the button says so, keeps the focus and is not disabled',
    await page.$eval('#oConfirm', (b) => b.getAttribute('aria-disabled') === 'true' && !b.disabled) && await focused(page) === 'oConfirm' && await txt(page, '#oStatus') === 'Sending…');
  await page.waitForSelector('#oDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  await settle(page, 300);
  check('a double tap on "Confirm withdrawal" posts ONCE', posts.length === 1, posts.length);
  const b = (posts[0] || {}).body || {};
  check('one POST to /api/withdraw, JSON', posts.length === 1 && posts[0].method === 'POST' && /application\/json/.test(posts[0].type));
  check('the body is the statement the server reads: name, email, ref, desk, service, requestId, company, lang',
    JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['company', 'desk', 'email', 'lang', 'name', 'ref', 'requestId', 'service']), JSON.stringify(b));
  check('…with the values typed, trimmed (the name was typed with spaces around it)', b.name === 'Anna Keller' && b.email === 'anna@example.com' && b.ref === 'BM X7K2Q' && b.desk === 'Amsterdam' && b.service === 'full-search' && b.lang === 'en' && b.company === '', JSON.stringify(b));
  check('…and a requestId the server accepts (one per page load)', RID.test(b.requestId || ''), b.requestId);
  check('then: "Received. We emailed you a copy with the date and time." with the focus on it; step 2 gone',
    await txt(page, '#oDoneMsg') === EN.done && await shown(page, '#oDone') && !(await shown(page, '#oReview')) && !(await shown(page, '#oForm')) && await focused(page) === 'oDoneMsg');
  check('no horizontal scroll on the receipt', await noSideScroll(page), await widths(page));
  check('no request beyond the page and /api/withdraw (no tracking, no CDN)', foreign.length === 0, foreign.join(' '));
  await ctx.close();
}

// ═══ 2 · the desk, Other, no service ═══════════════════════════════════════
section('2. Without a link: the desk is asked on its field; "Other" and no service make a plain statement');
{
  const { ctx, page, posts } = await open('', { answers: [{ status: 200, body: { ok: true } }] });
  await page.click('#oOpen');
  check('nothing preselected: desk and service on "Choose", reference empty',
    await val(page, '#oDesk') === '' && await val(page, '#oService') === '' && await val(page, '#oRef') === '');
  await page.fill('#oName', 'Mark Doe');
  await page.fill('#oEmail', 'mark@example.org');
  await page.click('#oNext');
  await settle(page);
  check('the desk is refused on its field ("Choose the desk, or Other."), focus on it, nothing sent',
    await errOnField(page, 'oDesk', 'oDeskErr') && await txt(page, '#oDeskErr') === 'Choose the desk, or Other.' && await focused(page) === 'oDesk' && posts.length === 0);
  await page.selectOption('#oDesk', 'other');
  check('choosing a desk clears its error', await txt(page, '#oDeskErr') === '');
  await page.click('#oNext');
  await settle(page);
  check('"Other" desk, no service: "…withdraw from my contract with BOOM."; the summary says "—" for what was not given',
    await txt(page, '#oStmt') === 'I hereby give notice that I withdraw from my contract with BOOM.' && await txt(page, '#oSumDesk') === 'Other'
      && await txt(page, '#oSumService') === '—' && await txt(page, '#oSumRef') === '—', await txt(page, '#oStmt'));
  await page.focus('#oConfirm');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#oDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  await settle(page, 250);
  check('a double Enter on "Confirm withdrawal" posts once', posts.length === 1, posts.length);
  const b = (posts[0] || {}).body || {};
  check('…desk "other", service and ref empty strings', b.desk === 'other' && b.service === '' && b.ref === '', JSON.stringify(b));
  await ctx.close();
}

// ═══ 3 · failures ══════════════════════════════════════════════════════════
section('3. Failures: said where they happen; a retry is the same statement; the server\'s 400 comes back to its field');
{
  const { ctx, page, posts } = await open('?desk=Madrid#online', { answers: [{ status: 503, body: { ok: false, error: 'unavailable' } }, { status: 200, body: { ok: true } }] });
  await page.click('#oOpen');
  await page.fill('#oName', 'Lucía Pérez');
  await page.fill('#oEmail', 'lucia@example.es');
  await page.click('#oNext');
  await settle(page);
  await page.click('#oConfirm');
  await page.waitForFunction(() => document.getElementById('oSendErr').textContent !== '', null, { timeout: 5000 }).catch(() => {});
  check('a 503: the alert says it did not go through and gives the email; still on step 2, the button usable again',
    /did not go through/.test(await txt(page, '#oSendErr')) && /hello@boom-rome\.com/.test(await txt(page, '#oSendErr'))
      && await shown(page, '#oReview') && await page.$eval('#oConfirm', (b) => !b.hasAttribute('aria-disabled')) && !(await shown(page, '#oDone'))
      && await page.$eval('#oSendErr', (e) => e.getAttribute('role')) === 'alert');
  check('no horizontal scroll with the failure shown', await noSideScroll(page), await widths(page));
  await page.click('#oConfirm');
  await page.waitForSelector('#oDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  check('the retry goes through: two POSTs, the SAME requestId and the same statement (the server answers it as one)',
    posts.length === 2 && posts[0].body.requestId === posts[1].body.requestId && JSON.stringify(posts[0].body) === JSON.stringify(posts[1].body) && await shown(page, '#oDone'));
  check('…and the failure line is gone', await txt(page, '#oSendErr') === '');
  await ctx.close();
}
{
  const { ctx, page } = await open('?desk=London#online', { answers: [{ status: 429, body: { ok: false, error: 'rate_limited' } }] });
  await page.click('#oOpen');
  await page.fill('#oName', 'Sam Lee'); await page.fill('#oEmail', 'sam@example.co.uk');
  await page.click('#oNext'); await settle(page);
  await page.click('#oConfirm');
  await page.waitForFunction(() => document.getElementById('oSendErr').textContent !== '', null, { timeout: 5000 }).catch(() => {});
  check('a 429: "Too many tries…" with the email, nothing claimed received', /Too many tries/.test(await txt(page, '#oSendErr')) && /hello@boom-rome\.com/.test(await txt(page, '#oSendErr')) && !(await shown(page, '#oDone')));
  await ctx.close();
}
{
  const { ctx, page } = await open('?desk=Milan#online', { answers: [{ abort: true }] });
  await page.click('#oOpen');
  await page.fill('#oName', 'Giulia Bianchi'); await page.fill('#oEmail', 'giulia@example.it');
  await page.click('#oNext'); await settle(page);
  await page.click('#oConfirm');
  await page.waitForFunction(() => document.getElementById('oSendErr').textContent !== '', null, { timeout: 5000 }).catch(() => {});
  check('a dropped connection: the same "did not go through", never "Received"', /did not go through/.test(await txt(page, '#oSendErr')) && !(await shown(page, '#oDone')));
  await ctx.close();
}
{
  const { ctx, page, posts } = await open('?desk=Valencia#online', { answers: [{ status: 400, body: { ok: false, error: 'email_required' } }, { status: 200, body: { ok: true } }] });
  await page.click('#oOpen');
  await page.fill('#oName', 'Carmen Ruiz'); await page.fill('#oEmail', 'carmen@example.es');
  await page.click('#oNext'); await settle(page);
  await page.click('#oConfirm');
  await page.waitForSelector('#oForm:not([hidden])', { timeout: 5000 }).catch(() => {});
  await settle(page);
  check('the server\'s 400 email_required: back to step 1, said on the email field, focus on it',
    await shown(page, '#oForm') && !(await shown(page, '#oReview')) && await errOnField(page, 'oEmail', 'oEmailErr') && await focused(page) === 'oEmail');
  await page.fill('#oEmail', 'carmen.ruiz@example.es');
  await page.click('#oNext'); await settle(page);
  await page.click('#oConfirm');
  await page.waitForSelector('#oDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  check('corrected and confirmed: received, the second POST carries the new email', posts.length === 2 && posts[1].body.email === 'carmen.ruiz@example.es' && await shown(page, '#oDone'));
  await ctx.close();
}

// ═══ 4 · Italian ═══════════════════════════════════════════════════════════
section('4. Italian labels with the Pacchetto\'s link (?desk=Roma) or ?lang=it; ?lang=en wins');
{
  const href = ((PK.match(/<p class="recesso">[\s\S]*?href="(\/withdrawal[^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
  const qs = href.replace(/^\/withdrawal/, '');
  const { ctx, page, posts } = await open(qs, { answers: [{ status: 200, body: { ok: true }, delay: 400 }], touch: true });
  check(`the Pacchetto's link (${href}) opens on "Recedi dal contratto qui", the function marked lang="it"`,
    await txt(page, '#oOpen') === IT.open && await page.$eval('#online', (s) => s.getAttribute('lang')) === 'it' && await txt(page, '#oTitle') === 'Recesso online');
  check('…and lands on the button (#online), on the first screen', await page.$eval('#oOpen', (b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
  await page.tap('#oOpen');
  check('prefilled: desk Roma (shown "Roma"), service Pacchetto canone concordato; Italian field labels',
    await val(page, '#oDesk') === 'Roma' && await page.$eval('#oDesk', (s) => s.options[s.selectedIndex].text) === 'Roma'
      && await val(page, '#oService') === 'concordato-pack' && await txt(page, 'label[for="oName"] span') === 'Nome e cognome' && await txt(page, '#oNext') === 'Continua');
  await page.tap('#oNext');
  await settle(page);
  check('the errors in Italian, on the field', await txt(page, '#oNameErr') === 'Scriva nome e cognome.' && await errOnField(page, 'oName', 'oNameErr') && await focused(page) === 'oName');
  await page.fill('#oName', 'Mario Rossi');
  await page.fill('#oEmail', 'mario.rossi@example.it');
  await page.tap('#oNext');
  await settle(page);
  check('step 2: "Conferma recesso", the statement in the words of the modulo',
    await txt(page, '#oConfirm') === IT.confirm && await txt(page, '#oStmt') === 'Con la presente notifico il recesso dal mio contratto per il seguente servizio: Pacchetto canone concordato (Roma).'
      && await txt(page, '#oReviewH') === 'Controlli e confermi', await txt(page, '#oStmt'));
  await page.tap('#oConfirm');
  await page.tap('#oConfirm').catch(() => {});
  await page.waitForSelector('#oDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  await settle(page, 250);
  check('a double tap (touch) posts once', posts.length === 1, posts.length);
  const b = (posts[0] || {}).body || {};
  check('the body: desk "Roma", service concordato-pack, lang "it"', b.desk === 'Roma' && b.service === 'concordato-pack' && b.lang === 'it' && RID.test(b.requestId || ''), JSON.stringify(b));
  check('"Ricevuto. Le abbiamo inviato per email una copia con data e ora." with the focus on it', await txt(page, '#oDoneMsg') === IT.done && await focused(page) === 'oDoneMsg');
  check('no horizontal scroll in Italian either', await noSideScroll(page), await widths(page));
  await ctx.close();
}
for (const [qs, it, desk, what] of [
  ['?lang=it&desk=Amsterdam', true, 'Amsterdam', '?lang=it on a desk link: Italian labels, the desk kept'],
  ['?desk=Rome&service=concordato-pack', true, 'Roma', '?desk=Rome (the Pacchetto email\'s spelling): Italian, desk Roma'],
  ['?desk=Roma&lang=en', false, 'Roma', '?desk=Roma&lang=en: an explicit English wins'],
  ['?desk=Barcelona', false, 'Barcelona', '?desk=Barcelona: English'],
]) {
  const { ctx, page } = await open(qs);
  await page.click('#oOpen');
  check(what, await txt(page, '#oOpen') !== null && (await page.$eval('#online', (s) => s.getAttribute('lang') === 'it')) === it
    && (await txt(page, '#oNext')) === (it ? 'Continua' : 'Continue') && await val(page, '#oDesk') === desk && await val(page, '#wCity') === desk);
  await ctx.close();
}

// ═══ 5 · prefill: Paris, Berlin, the unknown, the long, the hostile ═══════
section('5. Prefill: Paris and Berlin, case and aliases, nothing guessed, the reference kept as text');
for (const [qs, want, what] of [
  ['?desk=Paris&ref=PAR-2026-0007#online', { desk: 'Paris', service: '', ref: 'PAR-2026-0007' }, 'Paris with its order number'],
  ['?desk=berlin&service=application-pack', { desk: 'Berlin', service: 'application-pack', ref: '' }, 'berlin, lower case'],
  ['?desk=Berlino&service=Attended%20Viewing', { desk: 'Berlin', service: 'attended-viewing', ref: '' }, 'the Italian name and a service by its text'],
  ['?desk=Atlantis&service=nope&ref=', { desk: '', service: '', ref: '' }, 'an unknown desk and service select nothing'],
  ['?desk=constructor', { desk: '', service: '', ref: '' }, 'a prototype name selects nothing'],
]) {
  const { ctx, page } = await open(qs);
  await page.click('#oOpen');
  const got = { desk: await val(page, '#oDesk'), service: await val(page, '#oService'), ref: await val(page, '#oRef') };
  check(`${what}: ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  await ctx.close();
}
{
  const long = 'X'.repeat(120);
  const { ctx, page } = await open(`?desk=Paris&ref=${long}`);
  await page.click('#oOpen');
  check('a reference longer than 80 characters is cut to 80 (the server\'s limit)', (await val(page, '#oRef')).length === 80);
  await ctx.close();
}
{
  const evil = '<img src=x onerror="window.__pwn=1">';
  const { ctx, page } = await open(`?desk=Paris&ref=${encodeURIComponent(evil)}`);
  await page.click('#oOpen');
  await page.fill('#oName', 'Eve Test'); await page.fill('#oEmail', 'eve@example.com');
  await page.click('#oNext'); await settle(page);
  check('a hostile reference is shown as text in the summary, never as markup',
    await txt(page, '#oSumRef') === evil && await page.$$eval('#oReview img', (x) => x.length) === 0 && await page.evaluate(() => !window.__pwn));
  await ctx.close();
}

// ═══ 6 · 320 px, without JavaScript, the helper ═══════════════════════════
section('6. 320 px, without JavaScript, the mailto helper');
{
  const { ctx, page } = await open('?desk=Valencia&service=attended-viewing&ref=BM%20Q2W3E#online', { width: 320, height: 640 });
  const steps = [];
  steps.push(['load', await noSideScroll(page)]);
  await page.click('#oOpen');
  await page.click('#oNext');
  steps.push(['errors', await noSideScroll(page)]);
  await page.fill('#oName', 'Maximiliana Fernández de la Vega');
  await page.fill('#oEmail', 'maximiliana.fernandez.delavega@example-long-domain.es');
  await page.click('#oNext'); await settle(page);
  steps.push(['summary', await noSideScroll(page)]);
  await page.click('#oConfirm');
  await page.waitForSelector('#oDone:not([hidden])', { timeout: 5000 }).catch(() => {});
  steps.push(['receipt', await noSideScroll(page)]);
  check('320 px: no horizontal scroll at any step, a long name and email included', steps.every((s) => s[1]), JSON.stringify(steps));
  await ctx.close();
}
{
  const { ctx, page } = await open('?desk=Valencia#online', { width: 320, height: 640 });
  const h = [await page.$eval('#oOpen', (b) => b.getBoundingClientRect().height)];
  await page.click('#oOpen');
  h.push(await page.$eval('#oNext', (b) => b.getBoundingClientRect().height));
  await page.fill('#oName', 'Ana Gil'); await page.fill('#oEmail', 'ana@example.es');
  await page.click('#oNext'); await settle(page);
  const h2 = await page.$$eval('#oConfirm, #oEdit', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  check('the targets are at least 44 px tall at 320 px (the open button, Continue, Confirm withdrawal, Edit)', [...h, ...h2].length === 4 && [...h, ...h2].every((x) => x >= 44), JSON.stringify([h, h2]));
  await ctx.close();
}
{
  const { ctx, page, foreign } = await open('?desk=Amsterdam#online', { js: false });
  check('without JavaScript: no dead button — it is hidden, and the page says to email or use the model form',
    !(await shown(page, '#oOpen')) && /needs JavaScript[\s\S]*hello@boom-rome\.com[\s\S]*model form/.test(await txt(page, '#online')) && !(await shown(page, '#oForm')));
  check('…the model forms are there', await shown(page, '#annex-en') && await shown(page, '#annex-it'));
  check('…and nothing else is requested', foreign.length === 0, foreign.join(' '));
  await ctx.close();
}
{
  const { ctx, page } = await open('?desk=Roma&service=concordato-pack');
  await page.fill('#wName', 'Mario Rossi');
  const href = await page.$eval('#wSend', (a) => a.getAttribute('href'));
  check('the mailto helper still writes the model form into the email (Rome desk from ?desk=Roma)',
    /^mailto:hello@boom-rome\.com\?subject=Withdrawal%20%E2%80%94%20Pacchetto%20canone%20concordato%20Rome&body=/.test(href) && href.includes(encodeURIComponent('Name: Mario Rossi')), href.slice(0, 160));
  await ctx.close();
}

// ═══ 7 · mutations ═════════════════════════════════════════════════════════
section('7. Mutations: the in-flight guard, the Italian trigger, the label — each put back wrong is caught');
async function confirmTwice(html) {
  const { ctx, page, posts } = await open('?desk=Amsterdam#online', { html, answers: [{ status: 200, body: { ok: true }, delay: 500 }] });
  await page.click('#oOpen');
  await page.fill('#oName', 'Anna Keller'); await page.fill('#oEmail', 'anna@example.com');
  await page.click('#oNext'); await settle(page);
  await page.dblclick('#oConfirm');
  await settle(page, 900);
  const n = posts.length;
  await ctx.close();
  return n;
}
{
  const guard = 'if (busy || sent || !frozen) return;';
  check('the guard exists once in the page', WD.split(guard).length === 2);
  const n = await confirmTwice(WD.replace(guard, 'if (!frozen) return;'));
  check('mutation: without the in-flight guard a double tap posts twice — the check above would catch it', n === 2, n);
}
{
  const trig = "lang === 'it' || (lang !== 'en' && /^rom[ae]$/i.test(clean(Q.get('desk'))))";
  check('the Italian trigger exists once in the page', WD.split(trig).length === 2);
  const { ctx, page } = await open('?desk=Roma#online', { html: WD.replace(trig, "lang === 'it'") });
  check('mutation: without desk=Roma in the trigger the Pacchetto lands on English — caught', await txt(page, '#oOpen') === EN.open);
  await ctx.close();
}
{
  const { ctx, page } = await open('?desk=Paris#online', { html: WD.replace('>Withdraw from contract here</button>', '>Cancel my order</button>') });
  check('mutation: a softer label ("Cancel my order") fails the statutory-label check', await txt(page, '#oOpen') !== EN.open);
  await ctx.close();
}

check('zero JavaScript errors across every page', errs.length === 0, errs.join(' | '));
await browser.close();
finish();
