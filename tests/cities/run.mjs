// tests/cities/run.mjs — the city pages are built from data, on the REAL
// BOOM system, and the build must refuse rather than print something wrong
// (BOOM_CITIES_BRIEF.md §2, §10, v1.3; STUDIO_CITIES_ESPERIENZA.md §11;
// brand rules STUDIO_EXECUTIVE_UIX.md).
//
// What breaks if this goes red:
//   - a committed page that is NOT what the data says (someone edited the
//     generated HTML, or changed the data and forgot to rebuild);
//   - the page drifting off the design system: the portal gold (#D4AF37)
//     instead of #FFD700, boom-2026.css missing, the Solari engine inlined
//     from anywhere but its single source, the scroll contract missing;
//   - the voice going back to a launch page: "founding", "spots left", a
//     refundable deposit, a Stripe link, a third-party form service;
//   - a missing field silently printed as an empty string;
//   - a city switched to live:true with [NAME] copy, a fake config value, no
//     social card on disk or no review link on a desk that sells;
//   - a desk without its list prices, or a waitlist desk with a till (shown
//     is not charged: no Stripe word, no dialog, CHECKOUT false, the server
//     refuses the POST);
//   - the FAQ schema or the Offers saying something the page doesn't show;
//   - the build overwriting a root page it did not generate;
//   - the lead endpoint filing a city lead into the Rome machine, or the
//     Commerciale drafting a Rome reply to someone moving to Amsterdam;
//   - the page fattening again: the hero (title + lead), the Check-in and
//     the pass, the facts, the door, a plate, the checks, the end states or
//     the body over its word budget; a page over its weight budget;
//   - v1.4 (22/10, "The Itinerary"): the hero not editorial (title, lead,
//     the fares board with the refund rule under the €500, the proof), the
//     Check-in, the ticket or the door back in the hero, section 01 out of
//     order, a node mover, a second status board, an airplane glyph, a papers
//     line claiming work without naming the plan, a plan preparing a paper
//     the desk does not list, a Spanish fares note without "Optional, chosen
//     in writing", PAID or a file number not from the server;
//   - v1.3 (16/10, the redesign): the pass
//     missing or doubled, a second action label anywhere (every door reads
//     door.label, every pay control till.label with its price), a price
//     travelling without the refund rule on a sell desk, the plates back on
//     boards, the v1.2 chrome back (family strip, rail, progress bar, glow,
//     route line, timeline, truth band, bottom band, priced pay bar), a plan
//     without its own condition strings, Berlin's Full Search not saying
//     "sign", the steps out of the stage → where → when order, a stage that
//     does not resolve by the second tap, the Rome rating unlabelled or
//     doubled, the month select missing or stale, the consent plate not
//     deferred on the page.
//
// No browser, no network: the real build functions on the real data, and
// the real /api/city-lead handler on a Firestore in memory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildAll, renderCity, writeAll, fill, findPlaceholders, fragments, familyFor, BuildError, esc, eur, GENERATED_MARK, CELL_EM, WEIGHT_KB,
  checkinAnswer, offerAudience, faqOf, DOSSIER_N, STEP_IDS, resolvesAt, pendingText, monthOptions, anchorAgeMonths, MONTHS, daysLabel
} from '../../build-cities.mjs';
import { cityFromText } from '../../api/_market.js';
import SCALO from '../../js/scalo-codes.js';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? ` — ${why}` : '')));
const throws = (fn, re) => {
  try { fn(); return 'did not throw'; } catch (e) {
    if (!(e instanceof BuildError)) return `threw ${e.name}: ${e.message}`;
    return re.test(e.message) ? true : `wrong message: ${e.message}`;
  }
};
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const clone = (o) => JSON.parse(JSON.stringify(o));
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

console.log('\n\x1b[1m▸ cities\x1b[0m  the city pages (v1.4): built from data on the BOOM system, refusing instead of lying');

const template = read('cities/_template.html');
const shared = JSON.parse(read('cities/_shared.json'));
const ams = JSON.parse(read('cities/amsterdam.json'));
const assetVersion = { css: 'testcss000', js: 'testjs0000' };
const frags = fragments(R);
// the refusals are measured without the weight gate (it has its own check)
const render = (city, sh = shared, tpl = template, root = R, extra = {}) => renderCity({ template: tpl, shared: sh, city, assetVersion, frags, root, weigh: false, ...extra });

// ── 1 · the committed pages are exactly what the data builds ─────────────
const pages = buildAll({ root: R });
check(pages.length === 5, `${pages.length} city pages built from cities/*.json`);
for (const p of pages) {
  const f = path.join(R, p.file);
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  check(cur === p.html, `${p.file} is up to date with its data`,
    cur === null ? 'missing — run npm run build:cities' : 'stale — run npm run build:cities (never edit the generated file)');
  check(p.weight && p.weight.totalKb <= WEIGHT_KB.total && p.weight.jsKb <= WEIGHT_KB.js,
    `${p.file}: ${p.weight.totalKb.toFixed(1)} KB gzipped first-party (≤ ${WEIGHT_KB.total}), the JS ${p.weight.jsKb.toFixed(1)} KB (≤ ${WEIGHT_KB.js})`);
}

// ── 2 · the Amsterdam page, as built: the BOOM system, the BOOM voice ────
const page = pages.find((p) => p.slug === 'amsterdam');
const html = page ? page.html : '';
check(page && !/\{\{\{?\s*[\w.]+\s*\}\}\}?/.test(html), 'amsterdam: no unresolved {{token}} in the output');
check(html.includes(GENERATED_MARK), 'amsterdam: carries the GENERATED mark (the overwrite guard depends on it)');
check(ams.live === true && !/noindex/.test(html.slice(0, 4000)) && /content="index, follow/.test(html.slice(0, 4000)),
  'amsterdam is LIVE (20/10): no noindex, index, follow in the head');
{
  const draft = pages.find((p) => p.slug === 'paris');
  check(draft && JSON.parse(read('cities/paris.json')).live === false && /<meta name="robots" content="noindex">/.test(draft.html.slice(0, 4000)),
    'a draft desk (paris, live:false) says noindex in the first 4000 chars (tests/seo rule 8 reads exactly there)');
}
const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
check(canon === `${shared.siteUrl}/amsterdam`, `canonical comes from siteUrl: ${canon}`);
check(/^https:\/\/www\.boomrome\.com$/.test(shared.siteUrl), 'siteUrl is the canonical host www.boomrome.com');

// the system
const sys = html.indexOf('<link rel="stylesheet" href="/css/boom-2026.css">');
const cityCss = html.search(/<link rel="stylesheet" href="\/assets\/boom-city\.css\?v=[0-9a-f]{10}">/);
check(sys > -1 && cityCss > sys, 'the page is a BOOM 2026 page: css/boom-2026.css first, the city layer after it');
check(/<script src="\/assets\/boom-city\.js\?v=[0-9a-f]{10}"><\/script>/.test(html), 'the city JS is linked with a content hash (--check catches a forgotten rebuild)');
const css = read('assets/boom-city.css'), js = read('assets/boom-city.js');
check(!/#D4AF37/i.test(html) && !/#D4AF37/i.test(css) && !/#D4AF37/i.test(js), 'the portal gold #D4AF37 never appears: the public site is #FFD700 (STUDIO_EXECUTIVE_UIX)');
check(!/<link[^>]+fonts\.googleapis/.test(html) && !/font-family:\s*[^;]*(Georgia|serif)/i.test(css), 'no Google Fonts stylesheet, no serif: Helvetica Neue from the system, as every BOOM page');
const solari = read('design/pages-deco/solari-engine.html').trimEnd();
check(html.includes(solari) && html.includes('<!-- BOOM_SOLARI:START') && html.includes('window.BoomSolari'), 'the Solari engine is inlined from its single source, byte for byte');
check(html.includes('<!-- BOOM_SCROLL:START -->') && html.includes(read('css/boom-scroll.css')) && html.includes(read('js/boom-scroll.js')), 'the scroll contract is inlined between the markers every public page carries');
check(html.includes('<svg class="logo-mark" aria-hidden="true"><use href="#boomMark"/></svg>') && html.includes('<symbol id="boomMark"'), 'the real BOOM mark (the sound rings) — never a hand-drawn spiral');
check(html.includes('class="bl-desk">Amsterdam<br>tenant side</span>'), 'the lockup BOOM │ AMSTERDAM · TENANT SIDE, the one new brand element');
for (const sel of ['class="tech-bg"', 'class="filecard"', 'class="steps"', 'class="sibs plates"', 'class="flows"', 'class="enbref" id="enbref"', 'class="faq"', 'class="paybar"', 'class="checkin" id="checkin"', 'class="pass carta" id="pass"', 'class="facts" id="facts"', 'class="sheetfold"',
  'class="glance" id="glance"', '<section id="plan" class="rv plan">', 'class="uscita printer" id="passWrap"', 'class="fessura"', 'class="stub"', 'class="perf"', 'class="barcode"', '<details class="papers" id="ckPapersBox" hidden>']) {
  check(html.includes(sel), `the v1.4 grammar is on the page: ${sel}`);
}
check(!/class="skipck"|id="payOffer"|id="ckBoard"|id="ckName"|id="ckOrigin"|id="flapDone"|id="flapPaid"|class="perfo"|class="pgrid"|class="ppers"|class="cplane"/.test(html),
  'what v1.4 removed stays removed: the skip link, the after-file offer, the board on the ticket, the name and origin inputs, the door\'s mini boards, the dashed perforation, the old grid, the glyph plane');
check(!/class="fam"|class="rail"|class="scroll-progress"|class="mouse-glow"|class="machine"|class="tline"|class="truth"|class="band |class="refline"|class="serving"|footer-status-dot/.test(html),
  'the v1.2 chrome left: family strip, rail, progress bar, glow, route line, timeline, truth band, bottom band, status dot');
check(html.includes('<body data-consent-late>') && /data-consent-late/.test(read('js/boom-consent.js')) && /dialog\[open\]/.test(read('js/boom-consent.js')),
  'the body asks the consent plate to wait (first move + 600 ms, never over an open dialog) and boom-consent.js honours it');

// the Solari in the title, the prices as text
check(html.includes('<span id="flapCity" class="flap-city flap-scale" aria-hidden="true" data-word="AMSTERDAM"></span><span class="sr">Amsterdam</span></h1>')
  && /\.hero h1 \.flap-city:empty::before\{content:attr\(data-word\)\}/.test(read('assets/boom-city.css')) && /host\.getAttribute\('data-word'\)/.test(read('assets/boom-city.js')),
  'the title board is served EMPTY with the word in data-word (CSS draws it until the cells land, and without JS); the city is read as text once');
{
  const h1 = (html.match(/<h1 class="h-2">([\s\S]*?)<\/h1>/) || [])[1] || '';
  check(h1.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() === `${ams.hero.h1Before} Amsterdam`, `the raw H1 a crawler reads is "${ams.hero.h1Before} Amsterdam" — never "AMSTERDAMAmsterdam"`);
}
check(html.includes(`f.style.minWidth='${(9 * CELL_EM).toFixed(2)}em'`) && html.includes("f.style.minHeight='1.27em'"), `the hero reserves 9 cells × ${CELL_EM}em before the board lands (no layout jump)`);
check(!/flap-prezzo/.test(html) && (html.match(/class="flap-tk /g) || []).length === 1 && (html.match(/id="flapCity"/g) || []).length === 1 && (html.match(/class="flap-mini[ "]/g) || []).length === 1,
  'boards only where a fact changes: the city in the title, the price and the status on the ticket — the plates and the fares board carry their prices as text');
const plateP = [...html.matchAll(/<span class="num" data-plan-price="([^"]+)">([^<]+)<\/span><small>([^<]+)<\/small>/g)].map((m) => [m[1], m[2], decode(m[3])]);
check(JSON.stringify(plateP) === JSON.stringify(ams.pricing.plans.map((p) => [p.id, eur(p.price), p.condition])), 'every plate prints its price as text with the plan\'s OWN condition');

// the voice: an established desk, not a launch page
const visible = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
check(!/founding|cohort|spots? (left|remaining)|locked for life|refundable|€99|deposit of €|no worries|unlock|seamless|hassle-free/i.test(visible),
  'no founding spot, no cohort, no €99 deposit, no fluff words: the desk is open (BOOM_CITIES_BRIEF §5)');
check(!/web3forms|buy\.stripe\.com|fbq\(|connect\.facebook/i.test(html) && !/web3forms|buy\.stripe\.com|fbq|js\.stripe\.com/i.test(js),
  'no third-party form service, no Stripe payment link, no Stripe.js, no Meta pixel: the form and the till post to our own API');
check(!/[a-z.]!["\s]/i.test(JSON.stringify(ams)), 'no exclamation marks in the city copy (BOOM_CITIES_BRIEF §5)');
check(!/Start my search|Get the pack|Book a viewing|Ask for the pack|Ask for a viewing|Show my plan|Pay &amp; start|500\+ housed/.test(visible), 'the v1.2 labels and the "500+" claim left the page');

// the word budget (STUDIO §11.8, v1.4 §tests[0]). Measured on 22/10 after
// "The Itinerary": hero (title + lead) 21–24, the fares board 60–73, Check-in
// + ticket 154–188, facts 60–85 (four rows on a desk that sells, five on a
// waitlist desk), door 99–100 without the month options, states ≤ 58, plates
// ≤ 50, checks ≤ 170, the folded fact sheet 177–195, body 811–842. Each budget
// moves only with its reason: the fact sheet is folded, so it is measured on
// its own (≤ 210) like the folded FAQ answers, and the visible body ceiling
// DROPS from 950 to 850 — the page reads tighter, not looser. The Check-in,
// the ticket, the end states, the FAQ answers and the sheet are read only once
// asked for, so they stay out of the body; the month <select> is a list.
const wordsOf = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ')
  .split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length;
const slice = (h, a, b) => { const i = h.indexOf(a); const j = h.indexOf(b, i); return i < 0 || j < 0 ? '' : h.slice(i, j); };
const noSelect = (h) => h.replace(/<select[\s\S]*?<\/select>/g, '<select></select>');
const BUDGET = { hero: 30, glance: 75, checkin: 230, facts: 85, door: 110, state: 70, plate: 50, checks: 170, sheet: 210, body: 850 };
const cfgOf = (h) => { const at = h.indexOf('window.BOOM_CITY = '); return JSON.parse(h.slice(at + 'window.BOOM_CITY = '.length, h.indexOf('</script>', at)).trim().replace(/;$/, '')); };
const stateBlocks = (m) => [...m.matchAll(/<div class="sent(?: paid)?" id="f(?:Done|Paid)" tabindex="-1"[^>]*>[\s\S]*?\n        <\/div>/g)].map((x) => wordsOf(x[0]));
const bodyOf = (h) => {
  const m = slice(h, '<main id="main">', '</main>');
  const ckW = wordsOf(slice(h, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->')) + wordsOf(slice(h, '<!-- PASS -->', '<!-- /PASS -->'));
  const faqA = [...m.matchAll(/<div class="a">([\s\S]*?)<\/div>/g)].reduce((n, x) => n + wordsOf(x[1]), 0);
  const sheetW = wordsOf(slice(m, '<section id="enbref-wrap"', '</section>'));
  const selectW = wordsOf(m) - wordsOf(noSelect(m));
  return { m, ckW, faqA, sheetW, body: wordsOf(m) - faqA - stateBlocks(m).reduce((a, b) => a + b, 0) - ckW - selectW - sheetW };
};
for (const p of pages) {
  const { m, ckW, faqA, sheetW, body } = bodyOf(p.html);
  const hero = wordsOf(slice(p.html, '<header class="hero"', '<!-- GLANCE -->'));
  const glance = wordsOf(slice(p.html, '<!-- GLANCE -->', '<!-- /GLANCE -->'));
  const facts = wordsOf(slice(p.html, '<dl class="facts"', '</dl>'));
  const door = wordsOf(noSelect(slice(p.html, '<!-- THE DOOR -->', '<div class="sent" id="fDone"')));
  const states = stateBlocks(m);
  const plates = [...m.matchAll(/<article class="sib[\s\S]*?<\/article>/g)].map((x) => wordsOf(x[0]));
  const checksW = wordsOf(slice(m, '<div class="flows">', '</section>'));
  check(hero > 0 && hero <= BUDGET.hero, `${p.slug}: the hero's title and lead line, ${hero} words (≤ ${BUDGET.hero})`);
  check(glance > 0 && glance <= BUDGET.glance, `${p.slug}: the fares board — three fares, the note, the rule, the door, the two quiet routes — in ${glance} words (≤ ${BUDGET.glance})`);
  check(ckW > 0 && ckW <= BUDGET.checkin, `${p.slug}: the Check-in and the ticket in ${ckW} words (≤ ${BUDGET.checkin}), read one step at a time`);
  check(facts > 0 && facts <= BUDGET.facts, `${p.slug}: the facts in ${facts} words (≤ ${BUDGET.facts})`);
  check(door > 0 && door <= BUDGET.door, `${p.slug}: the door reads in ${door} words (≤ ${BUDGET.door}, the month list apart)`);
  check(states.length >= 1 && states.every((w) => w > 0 && w <= BUDGET.state), `${p.slug}: each end state of the door ≤ ${BUDGET.state} words (${states.join(' · ')})`);
  check(plates.length === 3 && plates.every((w) => w <= BUDGET.plate), `${p.slug}: every plate ≤ ${BUDGET.plate} words (${plates.join(' · ')})`);
  check(checksW > 0 && checksW <= BUDGET.checks, `${p.slug}: the six checks in ${checksW} words (≤ ${BUDGET.checks})`);
  check(sheetW > 0 && sheetW <= BUDGET.sheet, `${p.slug}: the folded fact sheet, measured on its own, ${sheetW} words (≤ ${BUDGET.sheet})`);
  check(faqA > 0 && body <= BUDGET.body, `${p.slug}: the visible page without the folded FAQ answers, the fact sheet, the end states, the Check-in and ticket and the month list is ${body} words (≤ ${BUDGET.body}, lowered from 950)`);
  // the paid card as the reader SEES it, not as it is shipped. v1.4: two
  // views. CONFIRMING (until the server answers paid:true): the data-pending
  // sentence as the heading, the plan line, the text — the steps hidden.
  // VERIFIED: the heading, the plan line, the text and the three steps, or for
  // a payer who did not tick "Start now" the wait note and nextWait. The
  // static block alone measured 60 while the screen showed 96 (review 20/10).
  const cfg = cfgOf(p.html);
  if (cfg.CHECKOUT === true) {
    const paidBlock = (m.match(/<div class="sent paid" id="fPaid"[\s\S]*?\n        <\/div>/) || [''])[0];
    const waitTxt = ((paidBlock.match(/data-wait="([^"]*)"/) || [])[1] || '');
    const pendTxt = ((paidBlock.match(/data-pending="([^"]*)"/) || [])[1] || '');
    // the heading after the fifth unanswered ask takes the pending one's place (review 22/10, finding 40)
    const unconfTxt = ((paidBlock.match(/data-unconfirmed="([^"]*)"/) || [])[1] || '');
    const textW = wordsOf((paidBlock.match(/<p id="paidText">([\s\S]*?)<\/p>/) || [])[1] || '');
    const stepW = (pairs) => pairs.reduce((n, [a, b]) => n + wordsOf(a + ' ' + b), 0);
    const nextShown = [...paidBlock.matchAll(/<li><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><\/li>/g)].slice(0, 3).map((x) => [x[1], x[2]]);
    const planW = Math.max(...Object.values(cfg.PLANS).map((pl) => wordsOf(`${pl.label} · €${pl.eur} · ${pl.condition}`)));
    const now1 = wordsOf(paidBlock) + planW;
    const wait0 = wordsOf(paidBlock) + planW - textW - stepW(nextShown) + stepW(cfg.PAID_WAIT_NEXT || []) + wordsOf(waitTxt);
    // CONFIRMING keeps #paidText on screen (the desk's address: the way to write
    // while the server has not answered — review 22/10, finding 40)
    const confirming = Math.max(wordsOf(pendTxt), wordsOf(unconfTxt)) + planW + textW;
    check(paidBlock && pendTxt && unconfTxt && textW > 0 && nextShown.length === 3 && now1 <= BUDGET.state && wait0 <= BUDGET.state && confirming <= BUDGET.state,
      `${p.slug}: the paid card as the reader sees it ≤ ${BUDGET.state} words — confirming ${confirming}, verified ticked ${now1}, verified waiting ${wait0}`);
  }
}
// the budget bites where it moved: the folded sheet counted in the body again
// would push it over the new ceiling (proof that 850 is a real constraint)
{
  const p = pages.find((x) => x.slug === 'barcelona');
  const b = bodyOf(p.html);
  check(b.body + b.sheetW > BUDGET.body, `the sheet left out of the body is what makes 850 hold (${b.body} + ${b.sheetW} > ${BUDGET.body}): the ceiling is tighter, not looser`);
}

// v1.4 — THE ITINERARY. (a) the hero is editorial: title < lead < GLANCE <
// facts, and none of section 01 inside it; (b) section 01 holds CHECK-IN <
// PASS < THE DOOR once each, before How it works; DOM order is the reading
// and the focus order at every width (no node mover).
const hero = slice(html, '<header class="hero"', '</header>');
const at = (s) => hero.indexOf(s);
check(at('<h1') > -1 && at('<h1') < at('class="lead') && at('class="lead') < at('<!-- GLANCE -->') && at('<!-- /GLANCE -->') < at('class="facts"') && hero.indexOf('class="hero-right"') < at('class="facts"')
  && !/id="checkin"|id="pass"|id="contact"|id="passWrap"/.test(hero),
  'the hero is editorial: title, lead, the fares board, then the proof card in the right column — no Check-in, no ticket, no door inside it');
{
  const plan = slice(html, '<section id="plan" class="rv plan">', '\n  </section>');
  const pa = (s) => plan.indexOf(s);
  check(plan && pa('<!-- CHECK-IN -->') > -1 && pa('<!-- CHECK-IN -->') < pa('<!-- PASS -->') && pa('<!-- PASS -->') < pa('<!-- THE DOOR -->') && pa('<!-- /THE DOOR -->') > pa('<!-- THE DOOR -->')
    && ['<!-- CHECK-IN -->', '<!-- PASS -->', '<!-- THE DOOR -->'].every((mk) => html.split(mk).length === 2) && html.indexOf('<section id="plan"') < html.indexOf('<section id="how"') && html.indexOf('</header>') < html.indexOf('<section id="plan"'),
    'section 01 (#plan), straight under the hero: Check-in → ticket → door, each once — answer, read the ticket, fill the form');
  check(plan.includes(`<span class="num">${esc(ams.plan.num)}</span>`) && plan.includes(`<h2>${esc(ams.plan.h2)} <span class="g">${esc(ams.plan.h2g)}</span></h2>`) && plan.includes(`<p class="sec-sub plan-head">${esc(ams.plan.head)}</p>`),
    'section 01 carries its number, its heading and the head line (hidden without JS: it promises questions the page cannot ask)');
  check(['how', 'pricing', 'checks', 'faq'].map((k) => ams[k].num.slice(0, 2)).join() === '02,03,04,05' && ams.plan.num.startsWith('01'), 'the sections renumber: 01 Your plan, 02 How it works, 03 Services & fees, 04 Before you sign, 05 Questions');
}
// (c) no node mover: the hero carries one script (the board reservation), and
// the city JS moves no node (the 17/10 mover and its media query are gone)
check((hero.match(/<script/g) || []).length === 1 && !/insertBefore|insertAdjacent|appendChild/.test(hero), 'no node mover in the hero: its one script reserves the city board\'s space');
check(!/function place\(|deskMq|insertBefore\(pass|insertAdjacentElement\('afterend', pass\)|mountBlank/.test(js), 'no node mover in the JS either: place(), deskMq and mountBlank are gone (DOM order is the reading order at every width)');
check((html.match(/<section class="checkin" id="checkin"/g) || []).length === 1 && (html.match(/<article class="pass carta" id="pass" data-state="blank"/g) || []).length === 1,
  'the Check-in once, the ticket once, blank at parse (the JS sets the state; js/boom-consent.js reads "blank")');
// the city layer: contrast, targets, the strip clearance, the notch, the cache
{
  const ccss = read('assets/boom-city.css');
  check(/\.sec-h \.num\{color:var\(--t3b\)\}/.test(ccss) && /\.footer-statement\{[^}]*color:var\(--t3b\)/.test(ccss), 'section labels and the tenant-side statement are readable text (--t3b, 6.5:1), not --t4 at 2.2:1');
  // round 2 (finding 28): the clearance and the focus padding read the strip's MEASURED height
  // (--strip-h, set by the JS; 66px + the safe area only as the fallback), and the strip cannot wrap
  check(/\.nav-toggle\{min-width:44px;min-height:44px/.test(ccss) && /footer\.footer\{padding-bottom:calc\(var\(--space-2xl\) \+ var\(--strip-h,calc\(66px \+ var\(--safe\)\)\)\)\}/.test(ccss)
    && /html\{scroll-padding-bottom:calc\(var\(--strip-h,calc\(66px \+ var\(--safe\)\)\) \+ 12px\)\}/.test(ccss) && /\.paybar \.pinfo b,\.paybar \.pinfo small\{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/.test(ccss)
    && /setProperty\('--strip-h'/.test(read('assets/boom-city.js')) && /env\(safe-area-inset-left\)/.test(ccss),
    'the menu button is a 44px target, the phone strip (one line each, never a wrap) never covers the footer\'s last row nor a focused control — from its measured height — and in landscape nothing sits under the notch');
  const vj = JSON.parse(read('vercel.json'));
  const rule = (vj.headers || []).find((h) => h.source === '/assets/boom-city\\.(css|js)');
  check(!!rule && rule.headers.some((x) => x.key === 'Cache-Control' && /immutable/.test(x.value)) && !(vj.headers || []).some((h) => /^\/(css|js)\//.test(h.source) && h.headers.some((x) => /immutable/.test(x.value))),
    'the hashed city assets are cached immutable; the unhashed shared /css and /js never are');
}
// the terms the desks link
{
  const terms = read('terms.html');
  const sec = slice(terms, '<h2 id="city-desks">', '</div>');
  check(html.includes('<li><a href="/terms#city-desks">Terms</a></li>') && slice(html, '<dialog class="sheet" id="ov"', '</dialog>').includes('<a href="/terms#city-desks" target="_blank" rel="noopener">Terms</a>'),
    'the footer and the till link the desk terms (terms#city-desks), not the Rome rental terms');
  check(sec && /Full Search €500, Application Pack €199, Attended Viewing €149 per viewing/.test(sec) && sec.includes(shared.refund.rule) && /14 days/.test(sec) && /\/withdrawal/.test(sec) && /not for a result/.test(sec) && /courts/.test(sec),
    'terms §12 states the desk fees (= CITY_PLANS), the refund rule word for word, the withdrawal (linked, not restated), and the consumer\'s own law and courts');
  check(/Sections 2 to 7 apply to rentals in Rome/.test(terms) && /This section applies to rentals in Rome/.test(terms), 'the Rome sections say they are Rome\'s');
  // which desks §12 opens and which it closes come from the desks themselves:
  // every live desk with the till is named, the "not open" sentence (terms and
  // llms.txt) lists exactly the others
  {
    const allDesks = fs.readdirSync(path.join(R, 'cities')).filter((f) => /^[a-z-]+\.json$/.test(f) && !f.startsWith('_')).map((f) => JSON.parse(read('cities/' + f)));
    const selling = allDesks.filter((c) => c.live === true && c.checkout === true).map((c) => c.city).sort();
    const closed = allDesks.filter((c) => !(c.live === true && c.checkout === true)).map((c) => c.city).sort();
    const head = (sec.match(/<h2 id="city-desks">([^<]*)</) || [])[1] || '';
    const named = (txt) => (txt.match(/([A-Z][a-z]+)(?=,| and | desks)/g) || []).filter((w) => allDesks.some((c) => c.city === w)).sort();
    const notOpenT = (sec.match(/The ([^.]*?) desks are not open/) || [])[1] || '';
    const notOpenL = (read('llms.txt').match(/([A-Z][a-z]+(?:,? (?:and )?[A-Z][a-z]+)*) desks are not open/) || [])[1] || '';
    check(selling.every((n) => head.includes(n) && sec.includes(`BOOM ${n}`)) && JSON.stringify(named(notOpenT + ' desks')) === JSON.stringify(closed) && JSON.stringify(named(notOpenL + ' desks')) === JSON.stringify(closed),
      `terms §12 names every desk that sells (${selling.join(', ')}) and the "not open" sentence, in the terms and in llms.txt, lists exactly ${closed.join(', ')}`, `${notOpenT} | ${notOpenL}`);
    check(/Each service is optional: you choose it in writing/.test(sec) && /The first call is free/.test(sec) && /runs until you sign a lease or tell us to stop/.test(sec) && /Barcelona desk[^.]*Catalan or Spanish/.test(sec) && /fulls oficials/.test(sec),
      'terms §12: the services optional and chosen in writing, the free first call, Full Search until you sign or stop, and Barcelona\'s Catalan documents and complaint forms');
  }
  {
    const wd = read('withdrawal.html');
    const live = ['amsterdam', 'madrid', 'barcelona'].map((sl) => JSON.parse(read(`cities/${sl}.json`))).filter((c) => c.live === true && c.checkout === true);
    check(live.every((c) => wd.includes(`<option value="${c.city}">${c.city}</option>`) && wd.includes(c.city)), 'the model withdrawal form offers every desk that sells (/withdrawal)');
  }
  // the terms say what the flow does: a payer who did not tick "Start now" can
  // still ask in writing (the paid card, the email and the operator's reply
  // invite it), and the only paid route the desks run is the card till
  check(sec && !/only if you ask us to at checkout/.test(sec) && /“Start now” tick at checkout, or later in writing/.test(sec) && !/bank transfer/i.test(sec),
    'terms §12: early start by the tick OR later in writing (never "only at checkout"); payment by card, no bank-transfer route nothing serves');
  const llms = read('llms.txt'), desksLine = llms.split('\n').find((l) => /Full Search €500/.test(l)) || '';
  check(!/ticks "Start now"\)/.test(desksLine) && /or later in writing/.test(desksLine) && !/bank transfer/.test(desksLine), 'llms.txt says the same as the terms (tick or later in writing, card)');
  check(!/bank transfer/i.test(JSON.stringify(ams.pricing) + JSON.stringify(ams.faq)), 'the desk page offers no bank-transfer route (nothing sends the withdrawal information to a transfer payer)');
  // a re-dated page is re-dated in the sitemap too
  const sm = read('sitemap.xml'), MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  for (const [f, u] of [['terms.html', '/terms'], ['privacy.html', '/privacy']]) {
    const m = read(f).match(/Last Updated:?\s*(?:<\/strong>)?\s*(\d{1,2}) (\w+) (\d{4})/);
    const iso = m ? `${m[3]}-${String(MON.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
    const lm = (sm.match(new RegExp(`<loc>https://www\\.boomrome\\.com${u}</loc>\\s*<lastmod>([\\d-]+)</lastmod>`)) || [])[1];
    check(iso && lm === iso, `${u}: the sitemap <lastmod> is the page's own "Last Updated" date`, `${iso} vs ${lm}`);
  }
}
// the privacy policy names the processors the lead passes through
{
  const pv = read('privacy.html');
  check(!/AWS|SendGrid/.test(pv) && /Firebase/.test(pv) && /Vercel/.test(pv) && /Telegram/.test(pv) && /Anthropic/.test(pv) && /EmailJS/.test(pv) && /City desks \(Amsterdam, Barcelona, Madrid\)/.test(pv),
    'the privacy policy names the real processors (no AWS or SendGrid it never used) and what a city request is used for');
  check(!/a person reviews before anything is sent/.test(pv) && /hands to our AI assistant, it can reply to you/.test(pv) && /do not finish it, we may write to you once/.test(pv) && !/Show relevant ads/.test(pv) && /except the records the law requires us to keep/.test(pv),
    'privacy says what the machine does: the AI assistant can reply on handed-over chats, an unfinished payment gets one message, no ad cookies, erasure keeps what the law requires');
  const dataFaq = ams.faq.items.find((f) => /data/.test(f.q)) || {};
  check(/ask once whether you have questions/.test(dataFaq.a || '') && /invoices and payment records stay/.test(dataFaq.a || '') && !/Ask us to delete it and we will\./.test(dataFaq.a || ''),
    'the desk FAQ on data matches the policy: one question after an unfinished payment, deletion except what the law keeps');
}

// the door
check(html.includes('<form id="cityForm" method="post" novalidate') && js.includes("postJson(C.LEAD_ENDPOINT || '/api/city-lead'") && /function postJson\(url, body, ms\)/.test(js) && /ctl\.abort\(\); \}, ms \|\| 20000\)/.test(js) && js.includes("postJson(C.CHECKOUT_ENDPOINT || '/api/service-checkout'") && html.includes('"LEAD_ENDPOINT": "/api/city-lead"'), 'the form posts to /api/city-lead (door and till through one POST that gives up after 20 s, so a hung request never locks the button)');
check(/<input id="fCompany" name="company"[^>]*tabindex="-1"[^>]*aria-hidden="true">/.test(html) && !/<label[^>]*>[^<]*ompany/.test(html), 'the honeypot is a hidden field named company, and no visible field shares the name');
const visibleFields = (html.match(/<(input|select) id="f(Name|Email|Phone|MoveIn|Budget)"/g) || []).length;
const chips = [...html.matchAll(/<label class="chip( unsure)?"><input type="radio" name="service" value="([^"]+)"><span><b>([^<]*)<\/b><small>([^<]*)<\/small><\/span><\/label>/g)];
check(visibleFields === 5 && chips.length === ams.pricing.plans.length + 1 && html.indexOf('class="fld chips"') < html.indexOf('<details class="more">'),
  `five visible fields (name, email, phone, month, budget) + the service chips, the rest behind "More details" (${visibleFields} fields, ${chips.length} chips)`);
check(!/fService/.test(html) && !/fService/.test(js) && /input\[name="service"\]:checked/.test(js), 'the service is never a dropdown: the chips are read without a tap, and the JS reads the checked chip');
check(!/<input type="radio" name="service"[^>]*checked/.test(html), 'no chip is pre-checked: the service is the client\'s choice, or "service to decide"');
check(html.includes('<details class="more">') && /id="fSituation"[\s\S]*id="fAreas"[\s\S]*id="fMsg"[\s\S]*<\/details>/.test(html.slice(html.indexOf('<details class="more">'))), 'situation, neighbourhoods and the message fold away');
check(html.includes(`<details class="planline" id="planline" open data-from="${esc(ams.form.service.from)}">`) && html.includes(`<b id="plText">${esc(ams.form.service.none)}</b>`),
  'the plan line: open at parse (no JS = chips in view), the "from your check-in" tag from the data');
const months = monthOptions(shared.moveInFrom);
check(months.length === 20 && html.includes('<select id="fMoveIn" name="moveIn">') && html.includes(`<option value="">${esc(ams.form.moveIn.unsure)}</option>`)
  && months.every((m) => html.includes(`<option value="${m.value}">${m.label}</option>`)) && /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/.test(months[0].label),
  `the move-in is a month select: "${ams.form.moveIn.unsure}", then twenty months from ${shared.moveInFrom} as YYYY-MM with English labels`);
check(anchorAgeMonths(shared.moveInFrom) <= 2, `the month anchor ${shared.moveInFrom} is not older than two months (the CLI would warn)`);
check(anchorAgeMonths('2026-10', new Date('2026-12-15T00:00:00Z')) === 2 && anchorAgeMonths('2026-10', new Date('2027-02-01T00:00:00Z')) === 4 && anchorAgeMonths('nope') === Infinity, 'anchorAgeMonths counts calendar months (UTC)');
check(JSON.stringify(monthOptions('2026-11', 3)) === JSON.stringify([{ value: '2026-11', label: 'November 2026' }, { value: '2026-12', label: 'December 2026' }, { value: '2027-01', label: 'January 2027' }]) && MONTHS.length === 12,
  'monthOptions rolls the year over, deterministic labels (no Intl)');
check(throws(() => monthOptions('2026-13'), /moveInFrom must be YYYY-MM/) === true, 'a bad anchor is refused');
const waAms = `https://wa.me/${shared.contact.whatsapp}?text=${encodeURIComponent(shared.contact.waText.split('{city}').join('Amsterdam'))}`;
check(html.includes(`href="${esc(waAms)}"`) && html.includes(`mailto:${shared.contact.email}`) && !/39X{4,}/.test(html), 'the WhatsApp and email of the consent line are the real BOOM contacts, never a placeholder');
check(!html.includes(`href="https://wa.me/${shared.contact.whatsapp}"`) && (html.match(new RegExp(`href="https://wa\\.me/${shared.contact.whatsapp}\\?text=`, 'g')) || []).length >= 4
  && /BOOM Amsterdam/.test(decodeURIComponent(waAms.split('?text=')[1])) && cityFromText(decodeURIComponent(waAms.split('?text=')[1])) === 'amsterdam',
  'every WhatsApp link opens with the desk named ("Hi BOOM Amsterdam, …"): the server reads the marker and the chat lands in the Amsterdam machine, consent or not');
check(/<input type="hidden" id="fCheckin" name="checkin" value="">/.test(html) && /<input type="hidden" id="fDossier" name="dossier" value="">/.test(html) && html.indexOf('id="fCheckin"') < html.indexOf('id="fCompany"'),
  'the door carries two hidden fields — the answers and the papers — before the honeypot');

// one label: every door reads door.label, every pay control till.label + the
// price. v1.4: "Start with a free call" where the desk sells, "Open my file"
// where it is still opening; the hero's door is one a.paybtn.hero-go.
const L = esc(ams.door.label);
const LK = '<span class="lk"><svg class="lk-plane" aria-hidden="true"><use href="#boomPlane"/></svg></span>';
check(html.includes(`<a href="#contact" class="nav-link nav-door">${L}</a>`) && html.includes(`<a href="#contact" class="mobile-menu-cta">${L}</a>`) && html.includes(`<li><a href="#contact">${L}</a></li>`)
  && /<button type="submit" class="paybtn" id="fGo" disabled data-door-sub data-wa="[^"]+" data-mail="[^"]+">/.test(html) && html.includes(`id="fGo" disabled data-door-sub data-wa="`) && html.includes(`${LK}<span class="tx"><b>${L}</b><small>${esc(ams.door.sub)}</small>`)
  && html.includes(`id="stripGo">${L}</a>`) && ams.pricing.plans.every((p) => html.includes(`data-service="${p.id}">${L} →</a>`)) && html.includes(`id="ckFile" data-service="" data-door-sub>${LK}<span class="tx"><b>${L}</b>`)
  && (html.match(/class="paybtn hero-go"/g) || []).length === 1 && html.includes(`<a class="paybtn hero-go" href="#contact" data-door-sub>${LK}<span class="tx"><b>${L}</b><small>${esc(ams.door.sub)}</small></span><span class="amt">→</span></a>`),
  `one label: the hero door (once), nav, menu, footer, door button, strip, the three plates and the ticket all read "${ams.door.label}"`);
check([ams, JSON.parse(read('cities/madrid.json')), JSON.parse(read('cities/barcelona.json'))].every((c) => c.door.label === 'Start with a free call' && c.door.sub === 'no card · same-day reply' && c.door.stripSub === c.door.sub)
  && ['paris', 'berlin'].map((s) => JSON.parse(read(`cities/${s}.json`))).every((c) => c.door.label === 'Open my file' && /^free · /.test(c.door.sub) && !/call/i.test(c.door.label + c.door.sub)),
  'the selling desks open with "Start with a free call · no card · same-day reply"; Paris and Berlin keep "Open my file" — no call promised where the desk is still opening (founder, 22/10)');
check(!/\u2708/.test(html) && html.includes('<symbol id="boomPlane" viewBox="0 0 24 24">') && /<button type="submit" class="paybtn" id="fGo"[^>]*><span class="lk"><svg class="lk-plane" aria-hidden="true"><use href="#boomPlane"\/><\/svg><\/span>/.test(html),
  'no ✈ (U+2708) anywhere on the page: #fGo\'s .lk is the SVG <use href="#boomPlane"> (Rome\'s path), like every plane on the page');
const T = esc(ams.till.label);
check(ams.pricing.plans.every((p) => html.includes(`<button type="button" class="go2" data-pay="${p.id}">${T} · ${eur(p.price)}</button>`)) && html.includes(`<button type="button" class="till" id="ckStart" data-pay="">${T} · <span id="ckStartAmt"></span></button>`)
  && !/payOfferBtn/.test(html) && html.includes(`id="sGo" data-label-now="${T}"`),
  `every pay control reads "${ams.till.label}" with its price: the plates' second link, the ticket stub (the offer after the file, v1.4), the dialog (when "Start now" is ticked)`);
// The dialog's last button follows the tick, unticked by default: it books and
// says the work waits for the 14 days; ticked it starts. Never "start" unticked.
check(html.includes(`id="sGo" data-label-now="${T}" data-label-wait="${esc(ams.till.labelWait)}" data-sub-now="${esc(ams.checkoutCopy.btnSubNow)}" data-sub-wait="${esc(ams.checkoutCopy.btnSubWait)}"><span class="lk">🔒</span><span class="tx"><b>${esc(ams.till.labelWait)}</b><small>${esc(ams.checkoutCopy.btnSubWait)}</small>`)
  && !/start/i.test(ams.till.labelWait) && /14 days/.test(ams.checkoutCopy.btnSubWait),
  `the dialog's button reads "${ams.till.labelWait}" until "Start now" is ticked — it never says start while the payer has chosen to wait`);
check(!/€|\d/.test(ams.door.label + ams.door.sub + ams.door.stripSub) && !/€|\d/.test(ams.till.label), 'the labels themselves carry no number: the price is printed beside them');
{
  const st = slice(html, '<div class="paybar" id="paybar"', '\n</div>');
  check(new RegExp(`<a class="wa-ic" id="stripWa" href="${esc(waAms).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg aria-hidden="true"><use href="#boomWa"/></svg></a>`).test(st) && !/€|\d/.test(st.replace(/<[^>]+>/g, ' ')),
    'the phone strip gains a WhatsApp icon (aria-label, no digits shown, the desk marker in its text) and still names no price');
}

// the facts: three authored, two derived, the Rome rating labelled Rome and once
const factsHtml = slice(html, '<dl class="facts"', '</dl>');
const rows = [...factsHtml.matchAll(/<dt>([^<]*)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => [decode(m[1]), m[2]]);
check(rows.length === 4 && ams.facts.map((f) => f.key).join() === 'paid,abroad' && rows.slice(0, 2).every((r, i) => r[0] === ams.facts[i].label && r[1] === esc(ams.facts[i].text)) && rows[2][0] === ams.factsDerived.answers && rows[3][0] === ams.factsDerived.company,
  'a desk that sells has four facts: paid by · from abroad (authored) · who answers · the company (derived) — "if we say no" moved under the €500 in the hero');
check(ams.facts[1].text === 'Yes. Never pay for a home nobody on your side has seen: we attend, film it live, write it down.', 'from abroad carries the scam rule (the fact a scam-primed visitor reads first)');
check(rows[2][1].startsWith(`${esc(ams.desk.person)}, ${esc(ams.factsDerived.answersLine)} · desk Mon–Fri ${ams.desk.hours.from} to ${ams.desk.hours.to} <span data-tz>${ams.desk.tzLabel}</span>`) && rows[2][1].includes('<span class="clock" id="deskClock" aria-live="off"></span>'),
  'who answers: the named person, the reply line, the desk DAYS and hours from the desk block (a line without the days read as open on a Saturday), the zone label the JS follows, the clock span');
check(daysLabel([1, 2, 3, 4, 5]) === 'Mon–Fri' && daysLabel([1, 3, 5]) === 'Mon, Wed, Fri' && daysLabel([6]) === 'Sat' && daysLabel([0, 1]) === 'Sun–Mon', 'daysLabel: a contiguous run as a range, otherwise the list');
{
  const noDays = clone(ams); noDays.factsDerived.deskLine = 'desk {from} to {to} {tz}';
  check(throws(() => render(noDays), /deskLine with \{days\}/) === true, 'a desk line without the days is refused');
}
const ratingTxt = `${shared.rome.rating} on Google in Rome, ${shared.rome.reviews} reviews`;
const ratingOut = shared.rome.profileUrl ? `<a href="${esc(shared.rome.profileUrl)}" target="_blank" rel="noopener">${ratingTxt}</a>` : ratingTxt;
check(/<div data-proof="rome"><dt>/.test(factsHtml) && rows[3][1].includes(`${esc(shared.entity.legalName)} · P.IVA ${shared.entity.vat} · ${ratingOut}`) && (html.match(/on Google/g) || []).length === 1,
  'the company: legal name, P.IVA, the Rome rating labelled "on Google in Rome" — once on the page, never as the desk\'s own');
// "if we say no" IS the rule: on a desk that sells it is now the line under
// the fares board, the refund rule verbatim (the fact left the proof card)
check(slice(html, '<!-- GLANCE -->', '<!-- /GLANCE -->').includes(`<p class="rule">${esc(shared.refund.rule)}</p>`) && !ams.facts.some((f) => f.key === 'nothing'),
  'on a desk that sells, the fares board carries the refund rule word for word under the €500 (the "if we say no" fact left the proof card)');
check(html.includes(`<p class="who"><b>${esc(ams.desk.person)}</b> · ${esc(ams.desk.role)} · desk Mon–Fri ${ams.desk.hours.from} to ${ams.desk.hours.to} <span data-tz>${ams.desk.tzLabel}</span> · <a href="${esc(waAms)}"`),
  'the person line under the three steps reads from the same desk block, days included');

// the refund rule beside every €500 on a sell desk
const rule = esc(shared.refund.rule);
const blocks = {
  glance: slice(html, '<!-- GLANCE -->', '<!-- /GLANCE -->'),
  door: slice(html, '<!-- THE DOOR -->', '<!-- /THE DOOR -->'),
  plates: slice(html, '<section id="services"', '</section>'),
  pass: slice(html, '<!-- PASS -->', '<!-- /PASS -->'),
  sheet: slice(html, '<dialog class="sheet" id="ov"', '</dialog>'),
  fees: slice(html, '<dt>Fees</dt>', '</dd>')
};
check(Object.values(blocks).every((b) => b && b.includes(rule)), 'the refund rule travels with the price in every block that shows €500: the fares board, the door (under the chips), the plates (fee note), the ticket, the dialog, the fees row');
check(html.includes(`<p class="pricenote refund">${rule}</p>`) && html.includes(`<p class="refund" id="ckRefund" hidden>${rule}</p>`) && !html.includes('payOfferRefund'),
  'the rule under the chips and on the ticket stub (shown only on Full Search); the after-file offer and its copy left (the stub is the offer)');
// (i) the fares board says each price the way the plate and the chip say it
{
  const gl = blocks.glance;
  const fares = [...gl.matchAll(/<a class="fare" href="#plate-([^"]+)" data-fare="([^"]+)"><span class="fl">([^<]*)<\/span><span class="fn">([^<]*)<\/span><span class="fp">([^<]*)<\/span><span class="fc">([^<]*)<\/span><\/a>/g)].map((m) => [m[1], m[2], decode(m[3]), decode(m[4]), m[5], decode(m[6])]);
  check(JSON.stringify(fares) === JSON.stringify(ams.pricing.plans.map((p) => [p.id, p.id, p.label, p.name, eur(p.price), p.condition])) && ams.pricing.plans.every((p) => html.includes(`id="plate-${p.id}"`)),
    'the fares board is DERIVED from the plans: label · name · price · the plan\'s own condition, each row a link to its plate (#plate-<id>)');
  check(gl.includes(`<p class="fnote">${esc(ams.hero.faresNote)}</p>`) && /<a href="#plan" id="heroPlan">/.test(gl) && gl.includes(`<a href="${esc(waAms)}" id="heroWa" target="_blank" rel="noopener">${esc(ams.glance.wa)}</a>`),
    'under the fares: the desk\'s note, then the quiet routes — the three questions (#plan) and WhatsApp with the desk marker');
}

// the footer and the entity
const e = shared.entity;
check(html.includes(`<strong>${esc(e.legalName)}</strong><br>${esc(e.address)}<br>Registered office: ${esc(e.registeredOffice)}<br>P.IVA ${esc(e.vat)} · REA ${esc(e.rea)}`) && html.includes(`<div class="footer-tm">${esc(e.trademark)}</div>`),
  'the footer prints the shared legal entity verbatim — the same block as executive.html');
check(html.includes(`<p class="footer-statement">${esc(ams.footer.statement)}</p>`), 'the tenant-side statement (aanhuurmakelaar) is in the footer');
check(html.includes(`<h4 class="footer-links-title">${esc(shared.desksLabel)}</h4>`) && html.includes('<li><a href="/madrid">Madrid</a></li>') && html.includes('<li><a href="/">BOOM Rome</a></li>')
  && html.includes(`<span class="mobile-menu-group">${esc(shared.desksLabel)}</span>`) && html.includes('<a href="/madrid" class="mobile-menu-link">Madrid</a>'),
  'the suite lives in a footer column and in the mobile menu (the fixed strip over every first screen is gone)');

// ── 3 · JSON-LD says what the page shows ──────────────────────────────────
const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
check(ld.length === 2, 'two JSON-LD blocks: the breadcrumb and the graph');
const graph = (ld.find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || [];
const crumbs = ld.find((b) => b['@type'] === 'BreadcrumbList') || {};
const org = graph.find((n) => n['@id'] === `${shared.siteUrl}/#organization`) || {};
const wp = graph.find((n) => n['@type'] === 'WebPage') || {};
const svc = graph.find((n) => n['@type'] === 'Service') || {};
const faqLd = graph.find((n) => n['@type'] === 'FAQPage') || {};
check(org['@id'] === `${shared.siteUrl}/#organization` && org.url === shared.siteUrl && org.legalName === e.legalName, 'Organization @id/url derive from siteUrl');
check(org['@type'] === 'RealEstateAgent' && org.name === 'BOOM Rome' && org.alternateName === 'BOOM' && JSON.stringify(org.sameAs) === JSON.stringify([shared.rome.profileUrl]) && !/tenant-side rental search and relocation desk/i.test(org.description || ''),
  'the #organization node is the one the rest of the site declares (RealEstateAgent "BOOM Rome"), describes the company, and points sameAs at the public profile behind the visible rating');
check(wp.mainEntity && wp.mainEntity['@id'] === `${shared.siteUrl}/amsterdam#service` && wp.description === ams.meta.description && wp.dateModified === ams.updated && wp.author && wp.author.name === ams.desk.person && wp.publisher['@id'] === org['@id'],
  'the WebPage names its main entity (the Service), its description, the date it last changed (data, never the clock) and its author');
{
  const sm = read('sitemap.xml').match(/<loc>https:\/\/www\.boomrome\.com\/amsterdam<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
  check(!!sm && sm[1] === ams.updated, `the sitemap <lastmod> of /amsterdam is the page's "updated" (${ams.updated})`);
  const stale = clone(ams); stale.updated = '2026-01-01';
  check(throws(() => render(stale), /sitemap <lastmod>/) === true, 'a live desk whose "updated" disagrees with its sitemap <lastmod> is refused');
}
check((crumbs.itemListElement || []).length === 2 && crumbs.itemListElement[1].item === `${shared.siteUrl}/amsterdam`, 'BreadcrumbList Home → Amsterdam');
const ids = graph.concat([crumbs]).map((n) => `${n['@type']}|${n['@id'] || n.url || ''}`);
check(new Set(ids).size === ids.length, 'no entity is declared twice');
const sels = (wp.speakable && wp.speakable.cssSelector) || [];
check(JSON.stringify(sels) === JSON.stringify(['.hero .lead', '.facts', '.enbref']) && sels.every((s) => html.includes(`class="${s.split(' ').pop().replace('.', '')}`)),
  `speakable: the lead, the five facts, the fact sheet — all real nodes (${sels.join(', ')})`);
const faqVisible = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)].map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
const faqItems = (faqLd.mainEntity || []).map((q) => ({ q: q.name, a: q.acceptedAnswer && q.acceptedAnswer.text }));
check(faqVisible.length === ams.faq.items.length && JSON.stringify(faqVisible) === JSON.stringify(faqItems), `FAQPage = the visible FAQ, question AND answer, word for word (${faqItems.length})`);
check(!ams.faq.items.some((q) => /moving from Rome/i.test(q.q)), 'the "moving from Rome with BOOM" item left the FAQ (brief v1.3)');
const plateIds = [...html.matchAll(/<article class="sib[^"]*" id="plate-([^"]+)">/g)].map((m) => m[1]);
const offers = (svc.offers || []).map((o) => [o.name, o.price]);
check(JSON.stringify(offers) === JSON.stringify(ams.pricing.plans.map((p) => [p.label, String(p.price)])) && JSON.stringify(plateIds) === JSON.stringify(ams.pricing.plans.map((p) => p.id)),
  `every Offer is a plate on the page at the price it prints: ${offers.map((o) => o.join(' €')).join(' · ')}`);
const chipPrices = chips.filter((m) => m[2] !== 'unsure').map((m) => [m[2], m[3], decode(m[4])]);
check(chipPrices.every(([id, label, small]) => ams.pricing.plans.some((pl) => pl.id === id && pl.label === label && small === `${eur(pl.price)} · ${pl.condition}`))
  && chips.some((m) => m[2] === 'unsure' && m[3] === esc(ams.form.service.unsure) && m[4] === esc(ams.form.service.unsureSub)),
  'the chips carry each plan\'s price AND its own condition (one price, one place) + "not sure yet · advise me"');
check(ams.pricing.plans.every((p) => html.includes(`<ul class="inc">${p.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)), 'what each fee buys is a ✓ list on its plate, straight from includes[]');
check(html.indexOf('id="enbref"') > html.indexOf('id="faq"') && html.includes('<details class="sheetfold">'), 'the fact sheet (machine content) sits AFTER the FAQ, folded for humans, whole in the DOM for the machines');
const feesOf = (c) => {
  const same = c.pricing.plans.length > 1 && c.pricing.plans.every((p) => p.conditionLong === c.pricing.plans[0].conditionLong);
  return c.pricing.plans.map((p) => `<b>${p.label} ${eur(p.price)}</b>${p.unit ? ' ' + esc(p.unit) : ''}${same ? '' : ` (${esc(p.conditionLong)})`}`).join(' · ') + (same ? '. ' + esc(c.pricing.plans[0].conditionLong) : '');
};
check(blocks.fees.includes(feesOf(ams)) && (blocks.fees.match(/VAT included/g) || []).length === 1, 'the fact sheet\'s fees row is DERIVED from the plans, the shared condition said ONCE ("VAT included" once, not four times)');
check(svc.areaServed && svc.areaServed.name === 'Amsterdam' && svc.audience && svc.audience.audienceType && svc.provider['@id'] === org['@id'], 'the Service says where, for whom and by whom');
check(/expats/i.test(svc.audience.audienceType) && /expats/i.test(ams.meta.title) && ams.meta.title.length <= 62, 'the audience and the title say "expats" — the word the query uses');
check(svc.hoursAvailable && JSON.stringify(svc.hoursAvailable.dayOfWeek) === JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) && svc.hoursAvailable.opens === ams.desk.hours.from && svc.hoursAvailable.closes === ams.desk.hours.to,
  'the desk hours the page prints are machine-readable on the Service (from the desk block)');
check((svc.offers || []).every((o) => !('audience' in o)) && (svc.offers || []).find((o) => o.name === 'Attended Viewing').priceSpecification.unitText === 'viewing'
  && faqLd['@id'] === `${shared.siteUrl}/amsterdam#faq` && faqLd.isPartOf['@id'] === wp['@id'],
  'no out-of-vocabulary audience on an Offer, the per-viewing price says its unit, the FAQPage belongs to the page');
check((svc.offers || []).every((o) => o.availability === 'https://schema.org/InStock' && o.priceSpecification && o.priceSpecification.valueAddedTaxIncluded === true
  && o.priceSpecification.price === o.price && o.url === `${shared.siteUrl}/amsterdam#plate-${ams.pricing.plans.find((p) => p.label === o.name).id}` && o.seller['@id'] === org['@id']),
  'every Offer of a search desk is InStock, VAT included in its priceSpecification, and points at its plate');
check(crumbs['@id'] === `${shared.siteUrl}/amsterdam#breadcrumb` && wp.breadcrumb && wp.breadcrumb['@id'] === crumbs['@id'], 'the WebPage references the BreadcrumbList by id');
{
  const liveCities = fs.readdirSync(path.join(R, 'cities')).filter((f) => /^[a-z-]+\.json$/.test(f) && !f.startsWith('_')).sort()
    .map((f) => JSON.parse(read('cities/' + f))).filter((c) => c.live === true).map((c) => c.city);
  check(JSON.stringify(org.areaServed) === JSON.stringify(['Rome', ...liveCities]) && liveCities.includes('Amsterdam') && liveCities.includes('Madrid') && liveCities.includes('Barcelona') && !liveCities.includes('Paris') && !liveCities.includes('Berlin'),
    `Organization.areaServed is derived: Rome and the LIVE desks only (${['Rome', ...liveCities].join(', ')})`);
}
{
  const liveAms = clone(ams); liveAms.live = true;
  const sh = clone(shared); sh.rome.profileUrl = 'https://maps.google.com/?cid=1';
  const g = JSON.parse(render(liveAms, sh).html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)[1].replace(/<\/?script[^>]*>/g, ''))['@graph'];
  check(JSON.stringify(g.find((n) => n['@id'] === `${shared.siteUrl}/#organization`).areaServed) === JSON.stringify(['Rome', 'Amsterdam']), 'once live, the desk\'s city joins areaServed by itself');
}

// ── 4 · the token engine never prints a hole ──────────────────────────────
check(throws(() => fill('<p>{{nope.here}}</p>', {}, 'x'), /unresolved tokens: nope\.here/) === true, 'a missing field is a build error that names it, never an empty string');
check(throws(() => fill('<p>{{obj}}</p>', { obj: { a: 1 } }, 'x'), /unresolved tokens: obj/) === true, 'an object where text is expected is a build error, not "[object Object]"');
check(throws(() => fill('<p>{{ bad-token }}</p>', {}, 'x'), /malformed tokens/) === true, 'a malformed token cannot slip through as literal braces');
check(fill('<p>{{a}}|{{{a}}}</p>', { a: '<b>"x"</b>' }, 'x') === '<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;|<b>"x"</b></p>', '{{a}} escapes, {{{a}}} is raw');
check(fill('{{n}}·{{e}}', { n: 0, e: '' }, 'x') === '0·', 'zero and empty string are values, not holes');
{
  const evil = clone(ams);
  evil.hero.lead = '<img src=x onerror=alert(1)>';
  evil.how.steps[0].s = '</p><script>alert(1)</script>';
  evil.faq.items[0].a = '<script>alert(2)</script>';
  evil.facts[0].text = '<b onmouseover=alert(3)>paid</b>';
  evil.checkin.steps[0].options[0].t = '<i>x</i>';
  const out = render(evil).html;
  check(!out.includes('<img src=x') && !out.includes('<script>alert(') && !/<b onmouseover/.test(out) && !out.includes('<b><i>x</i>') && out.includes('&lt;img src=x onerror=alert(1)&gt;') && out.includes('&lt;b onmouseover=alert(3)&gt;paid'),
    'plain fields are escaped in the template AND in the array renderers (facts and Check-in included)');
  evil.city = 'Ams</script>';
  const out2 = render(evil).html;
  check(!out2.includes('"CITY": "Ams</script>"') && out2.includes('"CITY": "Ams\\u003c/script>"'), 'config JSON cannot close its <script> tag');
}
check(eur(1500) === '€1,500' && eur(199) === '€199' && eur(12500) === '€12,500', 'prices format deterministically (no toLocaleString)');

// ── 5 · the live guard bites, and only when it should ─────────────────────
{
  const clean = clone(ams); clean.live = true;
  const shLive = clone(shared); shLive.rome.profileUrl = 'https://maps.google.com/?cid=1';
  let res = null, err = '';
  try { res = render(clean, shLive); } catch (x) { err = x.message; }
  check(res && res.placeholders.length === 0, 'with the profile link in place, today\'s Amsterdam data would pass the live guard', err);
  check(res && !/noindex/.test(res.html) && /content="index, follow/.test(res.html) && res.html.includes('<a href="https://maps.google.com/?cid=1" target="_blank" rel="noopener">4.9 on Google in Rome, 47 reviews</a>'),
    'a live page drops noindex, declares index, follow, and links the Rome rating to the profile');
  const shNo = clone(shared); shNo.rome.profileUrl = '';
  check(throws(() => render(clean, shNo), /rome\.profileUrl is empty/) === true, 'live:true on a desk that sells without the profile link is refused: a rating that cannot be checked is a claim');
  const photo = clone(clean); photo.hero.lead = 'Your person: [PHOTO OF LOCAL OPERATOR].';
  check(throws(() => render(photo, shLive), /\[PHOTO OF LOCAL OPERATOR\]/) === true, 'live:true with bracketed copy is refused, naming it');
  const fast = clone(ams); fast.pricing.plans[0].offerDescription = 'Dossier in 24 hours.';
  check(throws(() => render(fast), /24 hours/) === true, 'a clock promise ("24 hours") is refused on any desk, live or draft');
  const fakeWa = clone(clean); fakeWa.config = { WHATSAPP: '39XXXXXXXXXX' };
  check(throws(() => render(fakeWa, shLive), /config\.WHATSAPP = 39XXXXXXXXXX/) === true, 'live:true with a placeholder config value is refused');
  const noOg = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-og-'));
  check(throws(() => render(clean, shLive, template, noOg), /og-amsterdam\.png is missing/) === true, 'live:true without its social card on disk is refused');
  check(throws(() => render(clean, shLive, template, noOg), /withdrawal\.html is missing: the checkout links the model withdrawal form/) === true, 'live:true on a selling desk without the model withdrawal form on disk is refused (the till links it)');
  const draftNoOg = clone(ams); draftNoOg.live = false;
  check(render(draftNoOg, shared, template, noOg).placeholders.includes('og-amsterdam.png is missing (python3 design/pages-deco/genera-og-cities.py)'),
    'a draft without the card builds, and lists the card as the thing to make');
  fs.rmSync(noOg, { recursive: true, force: true });
  const badUrl = clone(shared); badUrl.rome.profileUrl = 'http://maps.google.com/?cid=1';
  check(throws(() => render(ams, badUrl), /rome\.profileUrl must be https/) === true, 'a profile link that is not https is refused');
  const reviewBox = clone(shared); reviewBox.rome.profileUrl = 'https://g.page/r/CfcpUptbNnvZEBM/review';
  check(throws(() => render(ams, reviewBox), /"write a review" link/) === true, 'the "write a review" box is refused as the proof link: the reader must land on the public profile and its reviews');
  const oldKey = clone(shared); oldKey.rome.reviewUrl = 'https://maps.google.com/?cid=1';
  check(throws(() => render(ams, oldKey), /reviewUrl was renamed rome\.profileUrl/) === true, 'the old key rome.reviewUrl is refused by name, never silently ignored');
}
check(findPlaceholders('<p>[A] ok</p><script>var a=[1,2]</script><style>a[href]{}</style>', { slug: 'amsterdam' }, { root: R }).join() === '[A]', 'placeholders are read from visible text, never from scripts or styles');
check(findPlaceholders('<p>ok</p><input placeholder="[NAME]"><meta name="description" content="BOOM [CITY] works">', { slug: 'amsterdam' }, { root: R }).join('|') === '[NAME] (in an attribute)|[CITY] (in an attribute)',
  'placeholders in attribute values (an input\'s placeholder, a meta description) are found too: they shipped unseen when only the text between tags was read');

// ── 6 · structural refusals ───────────────────────────────────────────────
const mad = JSON.parse(read('cities/madrid.json'));
const bcn = JSON.parse(read('cities/barcelona.json'));
const par = JSON.parse(read('cities/paris.json'));
const ber = JSON.parse(read('cities/berlin.json'));
{
  const wlHtml = render(par).html;
  check(wlHtml.includes('"CHECKOUT": false') && !wlHtml.includes('id="ov"') && wlHtml.includes('data-plan-price="full-search">€500</span>'), 'a waitlist city carries its list prices like every desk — and no till');
  const wlTill = clone(par); wlTill.checkout = true;
  check(throws(() => render(wlTill), /a waitlist city cannot open a checkout/) === true, 'a waitlist city with checkout:true is refused: shown is not charged');
  const noCopy = clone(ams); delete noCopy.checkoutCopy;
  check(throws(() => render(noCopy), /needs "checkoutCopy"/) === true, 'checkout:true without the sheet\'s copy is refused');
  const noTill = clone(ams); delete noTill.till;
  check(throws(() => render(noTill), /needs till\.label/) === true, 'checkout:true without till.label is refused (every pay control reads it)');
  const pricedTill = clone(ams); pricedTill.till.label = 'Pay €500';
  check(throws(() => render(pricedTill), /needs till\.label/) === true, 'a till label carrying a number is refused: the price is printed beside the label, from the plan');
  const pricedDoor = clone(ams); pricedDoor.door.sub = 'free · 1 reply';
  check(throws(() => render(pricedDoor), /never carry a price/) === true, 'the door label and its sub never carry a number');
  const tillOnWl = clone(par); tillOnWl.till = { label: 'Pay and start' };
  check(throws(() => render(tillOnWl), /till\.label belongs only to a desk with the checkout open/) === true, 'till.label on a waitlist desk is refused');
  const twoFeatured = clone(ams); twoFeatured.pricing.plans[1].featured = true;
  check(throws(() => render(twoFeatured), /at most one plan is featured/) === true, 'two featured plans are refused');
  const noRefund = clone(ams); noRefund.checkoutCopy.fine = 'Secure card payment by Stripe. Invoice from Egidi Immobiliare S.r.l.';
  check(throws(() => render(noRefund), /must state the refund policy/) === true, 'a till whose sheet drops the refund policy is refused (BOOM policy, 15/10)');
  const noTick = clone(ams); noTick.checkoutCopy.startNow = 'Start now.';
  check(throws(() => render(noTick), /checkoutCopy\.startNow is the payer's own request/) === true, 'a "Start now" line that does not say it is the payer\'s request inside the withdrawal period is refused');
  const noRecesso = clone(ams); noRecesso.checkoutCopy.withdrawal = 'You can cancel.';
  check(throws(() => render(noRecesso), /checkoutCopy\.withdrawal states the 14-day withdrawal right/) === true, 'a till without the 14-day withdrawal right and how to exercise it is refused');
  const noWait = clone(ams); delete noWait.checkoutCopy.paid.wait;
  check(throws(() => render(noWait), /checkoutCopy\.paid\.wait says when the work starts/) === true, 'a paid card that cannot tell a non-ticking payer when the work starts is refused');
  const sameDay = clone(ams); sameDay.checkoutCopy.note = 'Pay by card and we start the same working day.';
  check(throws(() => render(sameDay), /cannot promise the same working day/) === true, 'a till note promising the same working day regardless of the tick is refused');
  for (const [name, mut, re] of [
    ['a withdrawal line without the model form ({form})', (c) => { c.checkoutCopy.withdrawal = 'Withdrawal: 14 days from payment, by email to {email}.'; }, /links the model withdrawal form/],
    ['the btnSub leftover', (c) => { c.checkoutCopy.btnSub = 'Stripe checkout · one minute'; }, /btnSub is a leftover/],
    ['no till.labelWait', (c) => { delete c.till.labelWait; }, /needs till\.labelWait/],
    ['a labelWait that says start', (c) => { c.till.labelWait = 'Pay and start later'; }, /needs till\.labelWait/],
    ['a labelWait equal to the label', (c) => { c.till.labelWait = c.till.label; }, /needs till\.labelWait/],
    ['a btnSubWait without the 14 days', (c) => { c.checkoutCopy.btnSubWait = 'Stripe checkout'; }, /btnSubWait says the work starts when the 14 days end/],
    ['a btnSubNow promising today', (c) => { c.checkoutCopy.btnSubNow = 'Starts today · Stripe'; }, /btnSubNow cannot promise/],
    ['a nextWait promising the same working day', (c) => { c.checkoutCopy.paid.nextWait[1][0] = 'Same working day'; }, /paid\.nextWait/],
    ['a nextWait with two steps', (c) => { c.checkoutCopy.paid.nextWait.pop(); }, /paid\.nextWait/],
    // review 22/10 (finding 40): after the fifth unanswered ask the card says
    // "not confirmed yet" and to write — never silence, never a figure
    ['no paid.unconfirmed', (c) => { delete c.checkoutCopy.paid.unconfirmed; }, /checkoutCopy\.paid\.unconfirmed is required/],
    ['a paid.unconfirmed with a time in figures', (c) => { c.checkoutCopy.paid.unconfirmed = 'Not confirmed yet. Write to the desk within 2 hours.'; }, /checkoutCopy\.paid\.unconfirmed is required/],
    // review 22/10 (finding 41): the frozen Check-in's one line
    ['no checkin.sentLine', (c) => { delete c.checkin.sentLine; }, /checkin\.sentLine is required/]
  ]) {
    const c = clone(ams); mut(c);
    check(throws(() => render(c), re) === true, `refused: ${name}`);
  }
  const badRule = clone(shared); badRule.refund.rule = 'No refunds.';
  check(throws(() => render(ams, badRule), /refund\.rule is the one sentence of the policy/) === true, 'the shared refund rule must be the policy sentence');
  const offNoTill = clone(ams); offNoTill.checkout = false; delete offNoTill.till; offNoTill.door.sub = offNoTill.door.stripSub = 'free · same-day reply'; offNoTill.facts.push({ key: 'nothing', label: 'If we say no', text: 'Nothing is owed if we decline the search in the first call.' }); delete offNoTill.checkin.pass.status.paid; offNoTill.checkin.pass.boarding = {};
  check(!/id="ov"|data-pay=/.test(render(offNoTill).html) && render(offNoTill).html.includes('"CHECKOUT": false'), 'checkout:false on a search desk: prices, no dialog, no pay control, the plates lead to the door');
  const bad = clone(ams); bad.mode = 'deposit';
  check(throws(() => render(bad), /"mode" must be "search" or "waitlist"/) === true, 'an unknown mode is refused');
  const slug = clone(ams); slug.slug = '../index';
  check(throws(() => render(slug), /slug must be/) === true, 'a slug cannot escape the root');
  const live = clone(ams); delete live.live;
  check(throws(() => render(live), /"live" must be true or false/) === true, '"live" must be explicit');
  const dup = clone(ams); dup.pricing.plans[1].id = 'full-search';
  check(throws(() => render(dup), /must be unique/) === true, 'two plans cannot share an id');
  const nolabel = clone(ams); delete nolabel.pricing.plans[2].label;
  check(throws(() => render(nolabel), /needs label, se, name/) === true, 'a plan without its label is refused');
  const leftoverPer = clone(ams); leftoverPer.pricing.plans[0].per = 'flat';
  check(throws(() => render(leftoverPer), /cta and per are v1\.2 leftovers/) === true, 'a plan carrying the v1.2 "per"/"cta" is refused: condition + conditionLong are the two strings now');
  const noCond = clone(ams); delete noCond.pricing.plans[0].conditionLong;
  check(throws(() => render(noCond), /needs condition \(short\) and conditionLong/) === true, 'a plan without its long condition is refused');
  const noVat = clone(ams); noVat.pricing.plans[0].condition = 'flat';
  check(throws(() => render(noVat), /must say VAT/) === true, 'a short condition that does not say VAT is refused: the total price is the price');
  const sellOpening = clone(ams); sellOpening.pricing.plans[0].condition = 'flat · incl. VAT · at opening';
  check(throws(() => render(sellOpening), /never "at opening"/) === true, 'a sell desk\'s condition cannot say "at opening"');
  const wlNoWhen = clone(par); wlNoWhen.pricing.plans[0].condition = 'flat · incl. VAT';
  check(throws(() => render(wlNoWhen), /says when it is charged/) === true, 'a waitlist plan must say when it is charged, in both strings');
  const berNoSign = clone(ber); berNoSign.pricing.plans[0].condition = 'flat · incl. VAT · at opening'; berNoSign.pricing.plans[0].conditionLong = 'List price. Charged only when the desk opens.';
  check(throws(() => render(berNoSign), /berlin: Full Search is due only once a lease is signed/) === true, 'berlin: Full Search without "sign" in its conditions is refused (WoVermRG §2–§3)');
  const noinc = clone(ams); noinc.pricing.plans[0].includes = ['one'];
  check(throws(() => render(noinc), /needs includes: 2–5 lines/) === true, 'a plan with fewer than two ✓ lines is refused');
  const price = clone(ams); price.pricing.plans[0].price = 'call us';
  check(throws(() => render(price), /needs a positive price/) === true, 'a plan price must be a positive number');
  const nosteps = clone(ams); nosteps.how.steps = [];
  check(throws(() => render(nosteps), /how\.steps must be a non-empty array/) === true, 'an empty section is an error, not a blank block');
  const longWord = clone(ams); longWord.city = 'Castellammare di Stabia';
  check(throws(() => render(longWord), /board word "CASTELLAMMAREDISTABIA" must be 2–12 letters/) === true, 'a city name too long for the board is refused unless "word" overrides it');
  const accent = clone(ams); accent.city = 'Zürich';
  check(render(accent).html.includes('data-word="ZURICH"></span>'), 'the board word is letters only: the drum has no accents');
  const gold = clone(ams); gold.bref.rows[0].ddHtml = '<b style="color:#D4AF37">x</b>';
  check(throws(() => render(gold), /#D4AF37 is the portal gold/) === true, 'the portal gold is refused even inside trusted markup');
  const sh = clone(shared); sh.siteUrl = 'https://www.boomrome.com/';
  check(throws(() => render(ams, sh), /siteUrl must be/) === true, 'siteUrl with a trailing slash is refused');
  const sh2 = clone(shared); sh2.contact.whatsapp = '+39 331';
  check(throws(() => render(ams, sh2), /contact\.whatsapp \(digits only\)/) === true, 'the shared WhatsApp must be digits only');
  // v1.2 leftovers: a key nobody reads is a string everybody believes is live
  for (const [name, mut, re] of [
    ['machine', (c) => { c.machine = { route: 'ROM ✈ AMS' }; }, /"machine" is a v1\.2 leftover/],
    ['paybar', (c) => { c.paybar = { cta: 'Start' }; }, /"paybar" is a v1\.2 leftover/],
    ['hero.sub', (c) => { c.hero.sub = 'x'; }, /hero\.sub is a v1\.2 leftover/],
    ['nav.cta', (c) => { c.nav.cta = 'Start'; }, /nav\.cta, footer\.status and how\.tline are v1\.2 leftovers/],
    ['form.submit', (c) => { c.form.submit = 'Send'; }, /form\.submit, submitSub, ref, refRight and sentText are v1\.2 leftovers/],
    ['checkoutCopy.btn', (c) => { c.checkoutCopy.btn = 'Pay'; }, /checkoutCopy\.btn, paybarSub and offer\.cta are v1\.2 leftovers/],
    ['moveIn placeholder', (c) => { c.form.moveIn.placeholder = 'Feb 2027'; }, /the free-text placeholder left/],
    ['FAQ moving from Rome', (c) => { c.faq.items.push({ q: "I'm moving from Rome with BOOM. Same team?", a: 'Yes.' }); }, /moving from Rome/],
    ['long lead', (c) => { c.hero.lead = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone'; }, /hero\.lead is required and ≤ 20 words/],
    ['a third fact on a desk that sells', (c) => { c.facts.push({ key: 'nothing', label: 'If we say no', text: 'x' }); }, /facts are exactly the authored rows paid,abroad in order/],
    ['fact too long', (c) => { c.facts[0].text = Array(22).fill('word').join(' '); }, /facts are exactly the authored rows/],
    ['sell desk priceNote', (c) => { c.form.service.priceNote = 'List prices'; }, /a sell desk prints the refund rule under the chips/],
    ['bad tz', (c) => { c.desk.timeZone = 'Mars/Olympus'; }, /desk\.timeZone .* is not a time zone/],
    ['hours reversed', (c) => { c.desk.hours = { from: '19:00', to: '09:00' }; }, /desk\.hours needs from and to/],
    ['bad day', (c) => { c.desk.days = [1, 7]; }, /desk\.days is a list of weekdays/],
    ['person placeholder', (c) => { c.desk.person = '[NAME]'; }, /desk\.person is the named person/],
    ['tz label', (c) => { c.desk.tzLabel = 'Central European Time'; }, /desk\.tzLabel is the short zone name/],
    ['sentNext shape', (c) => { c.form.sentNext = [['Soon', 'x']]; }, /form\.sentNext is three \[label, line\] pairs/]
  ]) {
    const c = clone(ams); mut(c);
    check(throws(() => render(c), re) === true, `refused: ${name}`);
  }
  // v1.4 data refusals (spec tests[3]): the leftovers of v1.3 by name, the
  // new keys required, the Spanish opening and the waitlist note
  for (const [name, base, mut, re] of [
    ['door.skip (the skip link left with the Check-in)', ams, (c) => { c.door.skip = 'Rather write first? Open a file'; }, /door\.skip is a v1\.3 leftover/],
    ['checkoutCopy.offer (the stub is the offer)', ams, (c) => { c.checkoutCopy.offer = { lead: 'Want the work to start?', sub: 'Stripe' }; }, /checkoutCopy\.offer is a v1\.3 leftover/],
    ['no paid.pending (PAID waits for the server)', ams, (c) => { delete c.checkoutCopy.paid.pending; }, /checkoutCopy\.paid\.pending is required/],
    ['no plan section', ams, (c) => { delete c.plan; }, /plan needs num, h2, h2g and head/],
    ['a plan section without its head line', ams, (c) => { delete c.plan.head; }, /plan needs num, h2, h2g and head/],
    ['no glance', ams, (c) => { delete c.glance; }, /glance needs alt/],
    ['no fares note', ams, (c) => { delete c.hero.faresNote; }, /hero\.faresNote is required/],
    ['no nav.plan', ams, (c) => { delete c.nav.plan; }, /nav\.plan is required/],
    ['the sections numbered out of order', ams, (c) => { c.how.num = '01 — HOW IT WORKS'; }, /the section numbers follow the page/],
    ['a door sub without its lead ("no card" where the desk sells)', ams, (c) => { c.door.sub = 'free · same-day reply'; }, /door\.sub and door\.stripSub open with "no card · "/],
    ['a waitlist door promising a call', par, (c) => { c.door.label = 'Start with a free call'; }, /a waitlist desk's door, its OPEN card \(form\.sentNext\) and its facts promise no call/],
    // review 22/10, round 2: the waitlist's third fact still promised "the first call"
    ['a waitlist fact promising a call', par, (c) => { c.facts[2].text = 'If we decline the search in the first call, nothing is owed.'; }, /its facts promise no call/],
    ['Berlin too', ber, (c) => { c.facts[0].text = 'You alone, after a free call. Launching with a licensed partner.'; }, /its facts promise no call/],
    ['a waitlist ticket promising a call', par, (c) => { c.checkin.pass.firstCall.plan = 'Your first call'; }, /a waitlist desk promises no call/],
    ['a waitlist ticket with a PAID status', par, (c) => { c.checkin.pass.status.paid = 'PAID'; }, /no PAID/],
    ['a Spanish selling desk whose fares note does not open "Optional, chosen in writing"', bcn, (c) => { c.hero.faresNote = 'Flat fees, VAT included.'; }, /opens "Optional, chosen in writing" \(LAU art\. 20\)/],
    ['Madrid too', mad, (c) => { c.hero.faresNote = 'Flat fees. Optional, chosen in writing.'; }, /opens "Optional, chosen in writing"/],
    ['a waitlist fares note that does not say when it is charged', ber, (c) => { c.hero.faresNote = 'List prices, VAT included.'; }, /waitlist desk's hero\.faresNote says when/],
    ['the shared WhatsApp suffix without {answers}', null, null, null]
  ]) {
    if (!base) {
      const sh0 = clone(shared); sh0.contact.waPlan = 'My plan: {plan}.';
      check(throws(() => render(ams, sh0), /contact\.waPlan is the WhatsApp suffix/) === true, `refused: ${name}`);
      continue;
    }
    const c = clone(base); mut(c);
    check(throws(() => render(c), re) === true, `refused: ${name}`);
  }
  // the waitlist fares board: list prices, the note says "charged", no rule
  for (const c of [par, ber]) {
    const gl = slice((pages.find((x) => x.slug === c.slug) || {}).html || '', '<!-- GLANCE -->', '<!-- /GLANCE -->');
    check(gl && /charged/i.test(c.hero.faresNote) && gl.includes(esc(c.hero.faresNote)) && !gl.includes(esc(shared.refund.rule)) && !/data-pay|class="rule"/.test(gl) && /€500<\/span><span class="fc">[^<]*(opening|signing)/.test(gl),
      `${c.slug}: the fares board shows the list prices with each plan's "at opening"/"on signing", a note that says when it is charged — and no refund rule (no money is taken)`);
  }
  for (const c of [mad, bcn]) {
    check(c.hero.faresNote.startsWith('Optional, chosen in writing.') && slice((pages.find((x) => x.slug === c.slug) || {}).html || '', '<!-- GLANCE -->', '<!-- /GLANCE -->').includes(`<p class="fnote">${esc(c.hero.faresNote)}</p>`),
      `${c.slug}: the prices on the first screen open "Optional, chosen in writing." (LAU art. 20), as the price line under the plates does`);
  }
  // the post-build refusals (a)–(h), each proven on a template that breaks it
  {
    const tm = (from, to) => { if (!template.includes(from)) throw new Error('mutation anchor missing: ' + from.slice(0, 60)); return template.replace(from, to); };
    const ckBlock = '      <!-- CHECK-IN -->\n{{{checkinHtml}}}\n      <!-- /CHECK-IN -->\n', psBlock = '      <!-- PASS -->\n{{{passHtml}}}\n      <!-- /PASS -->\n';
    for (const [name, tpl, re] of [
      ['(a) the door back in the hero', tm('    <div class="hero-right">', '    <a id="contact" href="#"></a><div class="hero-right">'), /no Check-in, no ticket, no door/],
      ['(a) the fares board above the lead', tm('      <p class="lead h-3">{{hero.lead}}</p>\n', '').replace('      <!-- /GLANCE -->', '      <!-- /GLANCE -->\n      <p class="lead h-3">{{hero.lead}}</p>'), /title, the lead, the fares board and the facts, in that order/],
      ['(b) the ticket before the questions', tm(ckBlock + psBlock, psBlock + ckBlock), /Check-in, the ticket and the door, once each and in that order/],
      ['(c) the 17/10 node mover back in the hero', tm('    <div class="hero-right">', '    <div class="hero-right">\n      <script>(function(){var p=document.getElementById(\'pass\'),r=document.currentScript.parentNode;r.insertBefore(p,r.firstChild);})();</script>'), /no node mover/],
      ['(d) a second label on the nav', tm('<a href="#contact" class="nav-link nav-door">{{door.label}}</a>', '<a href="#contact" class="nav-link nav-door">Open my file</a>'), /the nav, the menu and the footer carry the door label/],
      ['(d) a second hero door', tm('      <!-- /GLANCE -->', '      <a class="paybtn hero-go" href="#contact">{{door.label}}</a>\n      <!-- /GLANCE -->'), /exactly one hero door/],
      ['(e) the door\'s OPEN mini board back', tm('{{{sentHtml}}}', '<span class="flap-mini" data-word="OPEN"></span>\n{{{sentHtml}}}'), /one status board, #ckStatus/],
      ['(f) a ✈ glyph', tm('<span class="amt">→</span></button>', '<span class="amt">✈</span></button>'), /no ✈ \(U\+2708\)/],
      ['(g) the share row visible without JS', tm('.checkin,#pass,.pshare,.paybar{display:none!important}', '.checkin,#pass,.paybar{display:none!important}'), /without JS the Check-in, the ticket, its share row/],
      ['(h) the skip link back', tm('      <!-- /GLANCE -->', '      <a class="skipck" href="#contact">x</a>\n      <!-- /GLANCE -->'), /skip link, the after-file pay offer/],
      ['(h) the skip link\'s words back', tm('      <!-- /GLANCE -->', '      <a href="#contact">Rather write first? Open a file</a>\n      <!-- /GLANCE -->'), /the v1\.3 skip link left the page/],
      ['the refund rule cut out of the GLANCE block', tm('      <!-- GLANCE -->\n{{{glanceHtml}}}\n      <!-- /GLANCE -->', '      <!-- GLANCE -->\n      <!-- /GLANCE -->\n{{{glanceHtml}}}'), /block "glance" not found|refund rule is missing from the glance block|fares board must show/]
    ]) check(throws(() => render(ams, shared, tpl), re) === true, `refused after the build: ${name}`);
  }
  // (i) and the glance rule, proven on the BUILD itself: a copy of
  // build-cities.mjs whose fares board drops the condition, or the refund rule
  // under the €500, must refuse the page (the guards bite on the renderer, not
  // only on the data)
  {
    const src = read('build-cities.mjs');
    const mutBuild = async (from, to) => {
      if (!src.includes(from)) return null;
      const f = path.join(os.tmpdir(), `boom-build-mut-${crypto.randomBytes(4).toString('hex')}.mjs`);
      fs.writeFileSync(f, src.replace(from, to));
      try { return await import(f); } finally { fs.unlinkSync(f); }
    };
    const run = (mod) => { try { mod.renderCity({ template, shared, city: clone(ams), assetVersion, frags, root: R, weigh: false }); return 'did not throw'; } catch (e2) { return e2.message; } };
    const noRule = await mutBuild("      sell ? `        <p class=\"rule\">${esc(shared.refund.rule)}</p>` : '',", "      '',");
    check(!!noRule && /refund rule is missing from the glance block/.test(run(noRule)), 'mutation: the refund rule deleted from R.glance — the build refuses the page (a €500 never travels alone, first screen included)');
    const noCond = await mutBuild('<span class="fc">${esc(p.condition)}</span>', '<span class="fc"></span>');
    check(!!noCond && /the fares board must show €500 with "flat · incl\. VAT"/.test(run(noCond)), 'mutation: the condition dropped from a fare row — the build refuses (each price said the way the plate and the chip say it)');
    const sellNote = await mutBuild("need(city.hero.faresNote.startsWith('Optional, chosen in writing')", "need(true || city.hero.faresNote.startsWith('Optional, chosen in writing')");
    const bad = clone(bcn); bad.hero.faresNote = 'Flat fees.';
    check(!!sellNote && (() => { try { sellNote.renderCity({ template, shared, city: bad, assetVersion, frags, root: R, weigh: false }); return true; } catch (e3) { return false; } })() && throws(() => render(bad), /Optional, chosen in writing/) === true,
      'mutation: the Spanish opening guard switched off lets "Flat fees." through — the real build refuses it');
  }
  const wlLead = clone(par); wlLead.hero.lead = 'Found by someone on your side.';
  check(throws(() => render(wlLead), /a waitlist desk's lead opens with "Opening with"/) === true, 'a waitlist desk whose lead does not open with "Opening with" is refused: the first line says what exists today');
  const wlNote = clone(par); wlNote.form.service.priceNote = 'List prices, charged only when the desk opens.';
  check(throws(() => render(wlNote), /Each plan says when it is charged/) === true, 'a waitlist price note that states one condition for every plan is refused (Berlin\'s Full Search differs)');
  // the weight gate
  const heavy = template.replace('</body>', `<p hidden>${crypto.randomBytes(120000).toString('hex')}</p></body>`);
  check(throws(() => render(ams, shared, heavy, R, { weigh: true }), new RegExp(`over the ${WEIGHT_KB.total} KB budget`)) === true, `a page over ${WEIGHT_KB.total} KB gzipped is refused by the build`);
}

// ── 7 · the build never overwrites a page it did not make ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-'));
  for (const d of ['cities', 'assets', 'css', 'js', 'design/pages-deco']) fs.mkdirSync(path.join(tmp, d), { recursive: true });
  for (const f of ['cities/_template.html', 'cities/_shared.json', 'cities/amsterdam.json', 'assets/boom-city.css', 'assets/boom-city.js',
    'css/boom-scroll.css', 'css/boom-2026.css', 'js/boom-scroll.js', 'js/boom-consent.js', 'js/boom-track.js', 'design/pages-deco/solari-engine.html', 'og-amsterdam.png', 'withdrawal.html']) fs.copyFileSync(path.join(R, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'amsterdam.html'), '<!doctype html><title>hand-made</title>');
  check(throws(() => writeAll({ root: tmp }), /not generated by this script — refusing/) === true && fs.readFileSync(path.join(tmp, 'amsterdam.html'), 'utf8').includes('hand-made'),
    'a root page without the GENERATED mark is never overwritten');
  fs.unlinkSync(path.join(tmp, 'amsterdam.html'));
  const first = writeAll({ root: tmp });
  const again = writeAll({ root: tmp, check: true });
  check(first[0].stale === true && again[0].stale === false, 'write then --check: the build is deterministic');
  fs.appendFileSync(path.join(tmp, 'assets', 'boom-city.css'), '\n/* changed */\n');
  check(writeAll({ root: tmp, check: true })[0].stale === true, 'changing the shared CSS makes the page stale (hash in the URL)');
  fs.writeFileSync(path.join(tmp, 'design/pages-deco/solari-engine.html'), '<style>.x{}</style><script>var y=1</script>');
  check(throws(() => writeAll({ root: tmp }), /is not the Solari engine fragment/) === true, 'a file that is not the engine cannot be inlined as the engine');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 8 · the source files never ship; the card is a real card ─────────────
{
  const ignore = read('.vercelignore').split('\n').map((l) => l.trim());
  check(['cities/', 'build-cities.mjs', 'BOOM_CITIES_BRIEF.md'].every((x) => ignore.includes(x)), '.vercelignore keeps the template, the build script and the internal brief off the site');
  const og = fs.readFileSync(path.join(R, 'og-amsterdam.png'));
  const isPng = og.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  check(isPng && og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630, 'og-amsterdam.png is a real 1200×630 PNG');
  check(og.length <= 120 * 1024, `og-amsterdam.png stays in the social-card budget (${Math.round(og.length / 1024)} KB ≤ 120)`);
  check((html.match(/og-amsterdam\.png/g) || []).length >= 3, 'the page declares it (og, twitter, primaryImageOfPage)');
}

// ── 9 · the door on the server: a tenant in the right MARKET ─────────────
let written = [];
const createdIds = new Set();
// the documents a GET can read (the paid leads the webhook writes), in
// Firestore's REST shape; anything else is a 404, as Firestore answers
const seeded = new Map();
const fsVal = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } } : { stringValue: String(v) };
const seed = (docPath, obj) => seeded.set(docPath, { name: `projects/p/databases/(default)/documents/${docPath}`, fields: fsVal(obj).mapValue.fields });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  if (u.includes('firestore.googleapis.com')) {
    const one = (opts.method || 'GET') === 'GET' && u.match(/\/documents\/(leads\/[^/?:]+)$/);
    if (one) {
      const d = seeded.get(one[1]);
      return d ? { ok: true, status: 200, json: async () => d, text: async () => '' } : { ok: false, status: 404, json: async () => ({}), text: async () => 'NOT_FOUND' };
    }
    if ((opts.method || 'GET') === 'POST') {
      // a create with a documentId that exists answers 409, as Firestore does
      const docId = (u.match(/[?&]documentId=([^&]+)/) || [])[1];
      if (docId && createdIds.has(docId)) return { ok: false, status: 409, text: async () => 'ALREADY_EXISTS', json: async () => ({}) };
      if (docId) createdIds.add(docId);
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/ams123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};
const { default: handler, bandCeiling, SERVICES, moveInLabel } = await import('../../api/city-lead.js');
const { isCityMarket, cityMarketOf, cityLabel, cityReplyText, cityMode, isReunion, isB2B, CITY_MARKETS } = await import('../../api/_market.js');
const plain = (v) => {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) { const o = {}; for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = plain(val); return o; }
  return v;
};
const docOf = (coll) => {
  const w = written.find((x) => x.url.includes(`/${coll}`));
  if (!w) return null;
  const o = {}; for (const [k, v] of Object.entries(w.body.fields || {})) o[k] = plain(v); return o;
};
let ipSeq = 0;
function call(body, ip, headers = {}) {
  written = [];
  let code = 0, payload = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
  return handler({ method: 'POST', headers: { 'x-forwarded-for': ip || `10.2.0.${++ipSeq}`, ...headers }, body, socket: {} }, res)
    .then(() => ({ code, payload, lead: docOf('leads'), notif: docOf('agentNotifications'), writes: [...written] }));
}
const ANNA = { city: 'amsterdam', name: 'Anna Keller', email: 'anna@example.com', phone: '+31 6 1234 5678', moveIn: '2027-02',
  budget: '€1,500 – €2,000', service: 'full-search', situation: 'Couple, relocating with employer', areas: 'De Pijp, Oud-West', message: 'Start date is 1 Feb.' };
{
  const r = await call({ ...ANNA, company: 'bot inc' });
  check(r.code === 200 && r.payload.ok === true && r.writes.length === 0, 'the honeypot answers 200 and writes nothing');
  const r2 = await call({ ...ANNA, city: 'rome' });
  check(r2.code === 400 && r2.payload.error === 'unknown_city' && r2.writes.length === 0, 'a city outside the closed list is a 400, never a lead filed somewhere invented');
  const r3 = await call({ ...ANNA, name: '' });
  check(r3.code === 400 && r3.payload.error === 'name_required' && r3.writes.length === 0, 'no name: refused, nothing written');
  const r4 = await call({ city: 'amsterdam', name: 'Anon' });
  check(r4.code === 400 && r4.payload.error === 'contact_required', 'no email and no phone: refused (we could not reply)');
}
{
  const r = await call(ANNA);
  const l = r.lead;
  check(r.code === 200 && !!l, 'a real applicant enters');
  check(l && l.source === 'web' && l.status === 'new' && l.leadType === 'tenant' && l.intent === 'city_search', 'schema leads: source web, status new, a TENANT — never B2B, never a special branch');
  check(l && l.market === 'amsterdam' && l.sourceRef === 'city-amsterdam' && isCityMarket(l) && cityMarketOf(l) === 'amsterdam', 'the market is Amsterdam — what api/_market.js reads to keep the Rome machine out');
  check(l && !isReunion(l) && !isB2B(l), 'and it is neither Réunion nor B2B');
  // v1.4 review (22/10): the door on a desk that sells reads "Start with a free
  // call", so the head says what the visitor asked for
  check(l && /^AMSTERDAM — tenant-side search · free call requested · Full Search · €1,500 – €2,000\/month · move-in February 2027 · Couple, relocating with employer · De Pijp, Oud-West\. Start date is 1 Feb\. · file BM [A-HJ-NP-Z2-9]{5}$/.test(l.message),
    'the summary opens with the city, the free call asked for and the service, then the numbers — the month select\'s "2027-02" read as "February 2027" — then their words, then the file number', l && l.message);
  check(l && r.payload.file && l.message.endsWith(` · file ${r.payload.file}`) && l.city.file === r.payload.file && r.payload.file === SCALO.fileCode(r.payload.id),
    'the file number the visitor is shown is the one on the lead, on the summary the operator reads, and fileCode(id) of the record');
  check(l && l.moveIn === 'February 2027' && l.raw.moveIn === '2027-02', 'the lead carries the month label; the raw value stays on raw{}');
  check(l && l.budgetBand === '€1,500 – €2,000' && l.budget === 2000, 'the budget band stays verbatim; the number is the band\'s ceiling');
  check(l && l.language === 'en' && l.zone === 'De Pijp, Oud-West' && l.city && l.city.serviceLabel === 'Full Search', 'English by default, areas as zone, the service by its label');
  check(r.notif && /^🇳🇱 AMSTERDAM · Anna Keller · Full Search · €1,500 – €2,000 · February 2027 · file BM [A-HJ-NP-Z2-9]{5}$/.test(r.notif.summary) && r.notif.priority === 'high', 'the operator is pinged with the flag, the name, the service, the band and the month', r.notif && r.notif.summary);
  const reply = cityReplyText(l);
  check(/^Hi Anna, Valentino here from BOOM/.test(reply) && reply.includes('move to Amsterdam') && reply.endsWith(CITY_MARKETS.amsterdam.url) && !reply.includes('/apartments') && !/Roma/.test(reply),
    'the pre-written WhatsApp reply is English, about Amsterdam, links /amsterdam — never the Rome catalogue');
  // v1.4 review (22/10): the OPEN card promises "Valentino writes to set your
  // free call" — the ready reply sets it, with the ticket's file number, and
  // asks nothing in writing that the call covers (no questionnaire, no "I'll
  // come back today", never a response time in figures)
  // review 22/10, round 2: never "this week" — the desk is Mon–Fri, and the
  // reply also goes out on a Friday evening or a weekend
  check(reply.includes(`You asked for a free call about your move to Amsterdam (your file ${l.city.file}).`) && /By phone or WhatsApp — which day and time suit you\?/.test(reply)
    && !/this week|budget|who's moving|when do you land|set up the search|come back today|Thanks for your message|\d+\s*(hours?|minutes?|h\b)/i.test(reply),
    'a selling desk\'s ready reply offers the free call (phone or WhatsApp, the day and time theirs — never "this week"), names the file number, and carries no written questionnaire', reply);
  const waReply = cityReplyText({ market: 'madrid', name: 'Luis', phone: '+34612345678', message: 'Hi BOOM Madrid, I\'m moving to Madrid.' });
  check(waReply.startsWith('Hi Luis, Valentino here from BOOM 👋 Thanks for your message about your move to Madrid. The first step is a free call.') && /which day and time suit you\?/.test(waReply) && !/this week|your file|budget|come back today/.test(waReply),
    'a desk lead that came from WhatsApp (no door, no file) is thanked for its message and offered the same free call', waReply);
  check(cityLabel(l) === '🇳🇱 Amsterdam', 'the Telegram card label');
  check(l && l.phone === '+31612345678' && l.raw.phone === '+31 6 1234 5678', 'the phone is stored as E.164 read with the desk\'s country (the WhatsApp reply arrives so, and now matches); the typed value stays on raw');
  check(l && l.attribution === null, 'no consent cookie, no attribution: the field is there and empty');
}
{
  // a national number on the Madrid desk, and the first consented touch
  const r = await call({ city: 'madrid', name: 'Lucía', phone: '612 345 678' }, null, { cookie: 'boom_attr=ai%3Achatgpt%20%C2%B7%20%2Fmadrid' });
  check(r.code === 200 && r.lead && r.lead.phone === '+34612345678', 'a Spanish national number on the Madrid desk becomes +34… — never the Rome machine\'s +39 guess, never +61 (Australia)', r.lead && r.lead.phone);
  check(r.lead && r.lead.attribution === 'ai:chatgpt · /madrid', 'the city door carries the first consented touch like every other lead door', r.lead && String(r.lead.attribution));
  // one page load, one lead: a send retried after a timeout files the same document
  const once = await call({ ...ANNA, requestId: 'k3x9retry0001' });
  const twice = await call({ ...ANNA, requestId: 'k3x9retry0001' });
  check(once.code === 200 && /leads\?documentId=city_k3x9retry0001/.test(once.writes[0].url) && twice.code === 200 && twice.payload.duplicate === true && twice.writes.length === 0,
    'the same requestId twice: one lead (leads/city_<id>), the retry answers ok and nobody is pinged twice');
  const bad = await call({ ...ANNA, requestId: '../../etc' });
  check(bad.code === 200 && /leads\?documentId=city_srv_[0-9a-f]{12}$/.test(bad.writes[0].url) && /^city_srv_[0-9a-f]{12}$/.test(bad.payload.id) && bad.payload.file === SCALO.fileCode(bad.payload.id),
    'a requestId that is not an id is ignored, never a path: the server mints city_srv_<12 hex> before writing, so the file number travels in the same write');
}
// v1.4 (spec tests[5]): ONE file number, computed by the SERVER. The POST
// answers { ok, id, file } with file = fileCode(id) (FNV-1a over the whole id,
// "BM " + 5 characters of an unambiguous alphabet), the 409 retry answers the
// same file, the summary ends with it. The GET ?paid=<session>&city=<slug>
// says PAID only for a paid lead of THAT city, and never a name, an email, a
// phone or an amount.
{
  const FILE_RE = /^BM [A-HJ-NP-Z2-9]{5}$/;
  const a1 = await call({ ...ANNA, requestId: 'filecode000001' }, '10.6.0.1');
  const a2 = await call({ ...ANNA, requestId: 'filecode000001' }, '10.6.0.2');
  check(a1.code === 200 && a1.payload.id === 'city_filecode000001' && FILE_RE.test(a1.payload.file || '') && a1.payload.file === SCALO.fileCode('city_filecode000001'),
    `a 200 carries the record id and its file number, fileCode(id) (${a1.payload.file})`);
  check(a2.code === 200 && a2.payload.duplicate === true && a2.payload.file === a1.payload.file && a2.writes.length === 0, 'the 409 retry of the same page load answers the SAME file number, writing nothing');
  check(a1.lead && a1.lead.message.endsWith(`· file ${a1.payload.file}`) && a1.notif && a1.notif.summary.endsWith(`· file ${a1.payload.file}`), 'the operator\'s summary and the Telegram card end with "· file BM XXXXX"');
  check(a1.payload.file !== a1.payload.id && !a1.payload.file.includes('filecode'), 'the file number is a nickname of the id, never the raw id');
  const hp = await call({ ...ANNA, requestId: 'filecode000002', company: 'x' }, '10.6.0.3');
  check(hp.code === 200 && hp.writes.length === 0 && !hp.payload.file, 'the honeypot still writes nothing (and mints no file number)');
  check(SCALO.fileCode('city_a') !== SCALO.fileCode('city_b') && SCALO.fileCode('') === null && FILE_RE.test(SCALO.fileCode('svc_cs_test_' + 'x'.repeat(30))), 'fileCode reads the whole id; an empty id has no file');
}
{
  const { serviceLeadId } = await import('../../api/_market.js');
  let hdr = {};
  const get = (q, ip) => {
    written = []; hdr = {};
    let code = 0, payload = null;
    const res = { setHeader(k, v) { hdr[String(k).toLowerCase()] = v; }, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
    const qs = new URLSearchParams(q).toString();
    return handler({ method: 'GET', query: q, url: '/api/city-lead?' + qs, headers: { 'x-forwarded-for': ip || '10.7.0.1' }, socket: {} }, res).then(() => ({ code, payload, hdr: { ...hdr }, raw: JSON.stringify(payload) }));
  };
  const SID = 'cs_test_a1B2c3D4e5F6g7H8', SID2 = 'cs_test_zzzzzzzzZZZZ0000';
  seed('leads/' + serviceLeadId(SID), { market: 'amsterdam', name: 'Anna Keller', email: 'anna@example.com', phone: '+31612345678', paidEur: 500,
    city: { paid: true, service: 'full-search', file: 'BM 7K2QX', startNow: false, workFromLabel: '4 November 2026', amount: 500 } });
  seed('leads/' + serviceLeadId(SID2), { market: 'madrid', name: 'Lucía', city: { paid: true, service: 'application-pack', file: 'BM AAAAA', startNow: true } });
  const bad1 = await get({ paid: 'not-a-session', city: 'amsterdam' });
  const bad2 = await get({ paid: SID, city: 'paris' });
  const bad3 = await get({ paid: SID, city: 'rome' });
  check(bad1.code === 400 && bad2.code === 400 && bad3.code === 400, 'GET ?paid=: a malformed session id, a waitlist city or a city outside the list is a 400');
  const unk = await get({ paid: 'cs_test_unknown00000000', city: 'amsterdam' });
  check(unk.code === 200 && unk.payload.ok === true && unk.payload.pending === true && !('paid' in unk.payload), 'an unknown session is pending (the webhook may not have landed yet)');
  const other = await get({ paid: SID2, city: 'amsterdam' });
  check(other.code === 200 && other.payload.pending === true && !/BM AAAAA|Lucía/.test(other.raw), 'a paid lead of ANOTHER city answers pending: nothing leaks across desks');
  const ok = await get({ paid: SID, city: 'amsterdam' });
  check(ok.code === 200 && ok.payload.paid === true && ok.payload.plan === 'full-search' && ok.payload.file === 'BM 7K2QX' && ok.payload.startNow === false && ok.payload.workFromLabel === '4 November 2026',
    'a matching paid lead answers paid with the plan, the file number, startNow and the webhook\'s start date', ok.raw);
  check(!/Anna|anna@|\+316|500/.test(ok.raw) && Object.keys(ok.payload).sort().join() === 'file,ok,paid,plan,startNow,workFromLabel', 'the answer carries no name, email, phone or amount — only what the ticket prints');
  check(/no-store/.test(ok.hdr['cache-control'] || '') && /no-store/.test(unk.hdr['cache-control'] || '') && /no-store/.test(bad1.hdr['cache-control'] || ''), 'every GET answer is Cache-Control: no-store');
  const notPaid = 'cs_test_notpaid000000000';
  seed('leads/' + serviceLeadId(notPaid), { market: 'amsterdam', city: { paid: false, service: 'full-search', file: 'BM BBBBB' } });
  check((await get({ paid: notPaid, city: 'amsterdam' })).payload.pending === true, 'a lead of the right city that is not paid is still pending');
  const put = await (async () => { let code = 0; await handler({ method: 'PUT', headers: {}, socket: {} }, { setHeader() {}, status(c) { code = c; return this; }, json() { return this; }, end() { return this; } }); return code; })();
  check(put === 405, 'any other method is 405');
}
{
  check(moveInLabel('2027-02') === 'February 2027' && moveInLabel('2026-12') === 'December 2026' && moveInLabel('as soon as possible') === 'as soon as possible' && moveInLabel('2027-13') === '2027-13' && moveInLabel(null) === null,
    'moveInLabel: YYYY-MM → "February 2027" from a fixed table; free text and a bad month stay verbatim');
  const r = await call({ city: 'Amsterdam', name: 'Jean', phone: '+33 6 12 34 56 78', service: 'concierge', budget: 'Under €1,500', moveIn: 'not sure, spring' });
  check(r.code === 200 && r.lead && /^AMSTERDAM — tenant-side search · free call requested · service to decide · Under €1,500\/month · move-in not sure, spring · file BM [A-HJ-NP-Z2-9]{5}$/.test(r.lead.message),
    'an unknown service is "service to decide"; free text in the month field stays as typed', r.lead && r.lead.message);
  check(bandCeiling('€3,500+') === 3500 && bandCeiling('€2.000 – €2.500') === 2500 && bandCeiling('whatever') === null, 'bandCeiling: 3,500+ → 3500, Italian dots → 2500, no digits → null');
  check(Object.keys(SERVICES).length === 4 && SERVICES.unsure === 'not sure yet', 'the service list is closed');
  let last = null;
  for (let i = 0; i < 7; i++) last = await call(ANNA, '10.9.9.9');
  check(last.code === 429 && last.writes.length === 0, 'the seventh send from one IP in ten minutes is 429 and writes nothing');
}
{
  const ckTxt = 'I have a shortlist · Still abroad · In 1–3 months';
  const dsTxt = '3/8 · missing: Employer statement (werkgeversverklaring), Previous landlord reference, A guarantor, if your income falls short, Three months of bank statements, Motivation letter, Dutch and English';
  const r = await call({ ...ANNA, checkin: ckTxt, dossier: dsTxt }, '10.4.0.1');
  check(r.code === 200 && r.lead.message.includes(` · check-in: ${ckTxt} · papers ${dsTxt}. Start date is 1 Feb.`), 'the Check-in answers and the papers are printed on the summary line', r.lead && r.lead.message);
  check(r.lead.city.checkin === ckTxt && r.lead.city.dossier === dsTxt && r.lead.raw.checkin === ckTxt && r.lead.raw.dossier === dsTxt, '…and kept on city{} and raw{}');
  const long = await call({ ...ANNA, checkin: 'x'.repeat(500), dossier: 'y'.repeat(500) }, '10.4.0.2');
  check(long.code === 200 && long.lead.city.checkin.length === 80 && long.lead.city.dossier.length === 200, 'both are clipped (80 / 200)');
  const none = await call(ANNA, '10.4.0.3');
  check(none.code === 200 && !/check-in|papers/.test(none.lead.message) && none.lead.city.checkin === null && none.lead.city.dossier === null, 'a client who never used the Check-in leaves no trace of it');
}
{
  const com = read('api/employees/commerciale.js');
  const guard = com.indexOf('if (isCityMarket(lead)) continue;');
  const draft = com.indexOf('proposeFirstReply(lead');
  check(guard > -1 && draft > -1 && guard < draft, 'the Commerciale stands down BEFORE drafting anything for a city lead');
  const notif = read('api/telegram/notify-pending.js');
  check(/isCityMarket\(l\)\s*\?\s*cityReplyText\(l\)/.test(notif) && /isCityMarket\(l\)\s*\?\s*cityLabel\(l\)/.test(notif), 'the Telegram card: the city label and the city reply, before the Rome text');
  check(!isCityMarket({ market: 'roma', intent: 'executive_relocation' }) && !isCityMarket({ market: 'reunion' }) && isCityMarket({ sourceRef: 'city-paris' }), 'Rome and La Réunion are not city markets; a sourceRef city-<slug> is');
}

// ── 9b · the Rome machine never speaks to a city client ───────────────────
// A city lead lands in `leads` next to Rome's: every tool that writes to a
// Rome tenant on its own or with one tap must step aside (the 21/10 audit).
{
  const { vetoFor } = await import('../../api/leads/_reverse.js');
  const { vetoRichiamo } = await import('../../api/leads/_richiamo.js');
  const { stage0 } = await import('../../api/leads/brain.js');
  const { cityPhone, cityFromText, notRomeTenant } = await import('../../api/_market.js');
  const { buildLead, deskPatch } = await import('../../api/homie/_lead.js');
  const now = Date.now();
  const amsLead = { id: 'a1', market: 'amsterdam', sourceRef: 'city-amsterdam', status: 'new', email: 'a@x.co', phone: '+31612345678', createdAt: new Date(now - 86400000).toISOString(), message: 'AMSTERDAM — tenant-side search · Full Search · €1,500 – €2,000/month.' };
  const paidRome = { id: 'p1', status: 'new', paid: true, email: 'p@x.co', createdAt: new Date(now - 86400000).toISOString(), message: 'Virtual Viewing bought one-tap (€89).' };
  const romeLead = { id: 'r1', status: 'new', email: 'r@x.co', createdAt: new Date(now - 86400000).toISOString(), message: 'cerco bilocale a Trastevere' };
  check(/Amsterdam, non a Roma/.test(vetoFor(amsLead, { id: 'l1' }, now) || '') && vetoFor(romeLead, { id: 'l1' }, now) === null,
    'the reverse search after a Rome publication never proposes a Rome home to an Amsterdam client (a Rome lead still passes)');
  check(/Amsterdam, non a Roma/.test(vetoRichiamo(amsLead, { now }) || '') && /cliente pagante/.test(vetoRichiamo(paidRome, { now }) || '') && vetoRichiamo(romeLead, { now }) === null,
    '/richiama never writes "still looking for a home in Rome?" to a city client or to a client who has already paid');
  check(/proprietario/.test(notRomeTenant({ leadType: 'landlord', source: 'web' }) || '') && /Réunion/.test(notRomeTenant({ market: 'reunion' }) || '') && notRomeTenant(romeLead) === null,
    'one copy of the veto: city desks, La Réunion, organisations and Rome landlords are not Rome tenants');
  const g = stage0(amsLead, new Map()), g2 = stage0({ ...amsLead, phone: '' }, new Map());
  check(g.final === true && g.grade === 'A' && g2.final === true && g2.grade === 'B' && !/dead/.test(g.grade + g2.grade),
    'the Lead Brain grades a city lead by rule (A with a phone, B without): never the Rome prompt, never "dead" by AI, never archived');
  check(stage0({ source: 'web', email: 'x@y.co', message: 'budget €1,500 a month' }, new Map()).reason.includes('budget'), 'a budget written with a thousands separator ("€1,500") counts as a budget');
  check(cityPhone('+31 6 12345678', 'amsterdam') === '+31612345678' && cityPhone('06 12345678', 'amsterdam') === '+31612345678' && cityPhone('612 345 678', 'madrid') === '+34612345678' && cityPhone('0034 612 345 678', 'madrid') === '+34612345678' && cityPhone('12', 'madrid') === null,
    'a city phone is read with the desk\'s country: +31 6…, 06…, 612 345 678 → E.164; nonsense → null');
  check(cityPhone('333 1234567', 'amsterdam') === null && cityPhone('3331234567', 'madrid') === null && cityPhone('393331234567', 'amsterdam') === null && cityPhone('3331234567', 'berlin') === null
    && cityPhone('020 123 4567', 'amsterdam') === '+31201234567' && cityPhone('91 123 45 67', 'madrid') === '+34911234567' && cityPhone('0151 12345678', 'berlin') === '+4915112345678',
    'an Italian mobile typed without +39 is not a desk number (null: the Rome guess reads it as before); a real local number still is');
  check(cityPhone('+31 (0)6 12345678', 'amsterdam') === '+31612345678' && cityPhone('+49 (0)151 23456789', 'berlin') === '+4915123456789' && cityPhone('0031 (0)20 1234567', 'amsterdam') === '+31201234567',
    'the "(0)" after a country code is dropped, as the number is dialled from abroad');
  check(cityFromText("Hi BOOM Amsterdam, I'm moving to Amsterdam.") === 'amsterdam' && cityFromText('hi boom madrid') === 'madrid' && cityFromText('Ciao BOOM, cerco casa a Roma') === null && cityFromText('I love BOOMAmsterdam') === null,
    'the desk marker of the prefilled WhatsApp line is read back (case-insensitive, whole words); a Rome message names no desk');
  check(buildLead({ text: "Hi BOOM Madrid, I'm moving to Madrid.", phone: '+34612345678' }).market === 'madrid' && buildLead({ text: 'ciao, cerco casa', phone: '+393331234567' }).market === undefined
    && JSON.stringify(deskPatch({ market: 'amsterdam' }, 'Hi BOOM Madrid')) === '{}',
    'a WhatsApp lead that names a desk enters its market; a Rome one does not; a market already set is never overwritten');
  const np = read('api/telegram/notify-pending.js');
  check(/if \(\(l\.phone \|\| l\.email\) && !isCityMarket\(l\) && !isReunion\(l\)\) buttons\.push\(\[\{ text: '🤖 Passa alla Segretaria'/.test(np)
    && /const ownCard = l => isB2B\(l\) \|\| isCityMarket\(l\) \|\| isReunion\(l\);/.test(np) && /cityPhone\(l\.phone, cityMarketOf\(l\)\)/.test(np),
    'the Telegram card of a city lead: no 🤖 Segretaria button, never buried in the C digest, WhatsApp to the number read with the desk\'s country');
  const core = read('api/segretaria/_core.js');
  const handIdx = core.indexOf('export async function handoverSegretaria'), openIdx = core.indexOf('export async function segretariaOpen'), turnIdx = core.indexOf('export async function segretariaTurn');
  const guard = (from) => { const body = core.slice(from, from + 900); return body.indexOf('outsideRome(lead)') > -1; };
  check(guard(handIdx) && guard(openIdx) && core.slice(turnIdx, turnIdx + 1200).indexOf('outsideRome(lead)') < core.slice(turnIdx, turnIdx + 1200).indexOf('captureFollowUp'),
    'the Segretaria refuses a city or Réunion lead at the hand-over, at the opening, and inside a turn before it does anything');
}

// ── 10 · the sisters: Madrid and Barcelona (search), Paris, Berlin (waitlist) ──
const pageOf = (slug) => (pages.find((p) => p.slug === slug) || {}).html || '';
const visibleOf = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
const ldOf = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
check(mad.mode === 'search' && bcn.mode === 'search' && bcn.checkout === true && par.mode === 'waitlist' && ber.mode === 'waitlist'
  && ams.live === true && mad.live === true && bcn.live === true && [par, ber].every((c) => c.live === false),
  'madrid and barcelona are search desks with the till (barcelona from 22/10), paris and berlin waitlist desks; amsterdam, madrid and barcelona live, the two waitlist desks drafts until their partners exist');
for (const [c, word, cells] of [[mad, 'MADRID', 6], [bcn, 'BARCELONA', 9], [par, 'PARIS', 5], [ber, 'BERLIN', 6]]) {
  const h = pageOf(c.slug);
  const v = visibleOf(h);
  const robotsOk = c.live === true
    ? !/noindex/.test(h.slice(0, 4000)) && /content="index, follow/.test(h.slice(0, 4000))
    : /<meta name="robots" content="noindex">/.test(h.slice(0, 4000));
  check(h.includes(GENERATED_MARK) && robotsOk && h.includes(`<link rel="canonical" href="${shared.siteUrl}/${c.slug}">`),
    `${c.slug}: a generated page — ${c.live === true ? 'live, index, follow' : 'draft, noindex'}, canonical from siteUrl`);
  check(h.includes(`<span id="flapCity" class="flap-city flap-scale" aria-hidden="true" data-word="${word}"></span><span class="sr">${c.city}</span></h1>`) && h.includes(`f.style.minWidth='${(cells * CELL_EM).toFixed(2)}em'`), `${c.slug}: the board spells ${word} and the hero reserves ${cells} cells`);
  check(h.includes(`class="bl-desk">${c.city}<br>tenant side</span>`) && h.includes(`<p class="footer-statement">${esc(c.footer.statement)}</p>`), `${c.slug}: the lockup and the tenant-side statement`);
  check(!/founding|cohort|spots? (left|remaining)|locked for life|refundable|€99|deposit of €|no worries|unlock|seamless|hassle-free|waitlist open|join the waitlist|coming soon/i.test(v), `${c.slug}: no founding spot, no counter, no "waitlist open" badge`);
  check(!/[a-z.]!["\s]/i.test(JSON.stringify(c)), `${c.slug}: no exclamation marks in the copy`);
  const og = fs.readFileSync(path.join(R, `og-${c.slug}.png`));
  check(og.subarray(0, 8).equals(PNG) && og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630 && og.length <= 120 * 1024 && (h.match(new RegExp(`og-${c.slug}\\.png`, 'g')) || []).length >= 3,
    `${c.slug}: og-${c.slug}.png is a real 1200×630 PNG in budget (${Math.round(og.length / 1024)} KB), declared by the page`);
  const faqV = [...h.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)].map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
  const faqS = ((ldOf(h).find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || []).find((n) => n['@type'] === 'FAQPage') || {};
  check(faqV.length === c.faq.items.length && JSON.stringify(faqV) === JSON.stringify((faqS.mainEntity || []).map((q) => ({ q: q.name, a: q.acceptedAnswer.text }))), `${c.slug}: FAQPage = the visible FAQ, word for word (${faqV.length})`);
  const fr = [...slice(h, '<dl class="facts"', '</dl>').matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => decode(m[1]));
  const nF = c.checkout === true ? 4 : 5;
  check(fr.length === nF && fr[nF - 2] === c.factsDerived.answers && fr[nF - 1] === c.factsDerived.company && /on Google in Rome/.test(h) && (h.match(/on Google/g) || []).length === 1,
    `${c.slug}: ${nF} facts (${c.checkout === true ? 'paid by, from abroad + two derived: the refund rule stands in the hero' : 'the three authored + two derived'}), the Rome rating once and labelled Rome`);
}
const GRID = ['€500', '€199', '€149'];
for (const c of [ams, mad, bcn, par, ber]) {
  const h = pageOf(c.slug);
  const asText = [...h.matchAll(/<span class="num" data-plan-price="[^"]+">([^<]+)<\/span>/g)].map((m) => m[1]);
  check(JSON.stringify(asText) === JSON.stringify(GRID), `${c.slug}: the three prices as text on the plates — the brief's grid`);
  const chipsP = [...h.matchAll(/<label class="chip"><input type="radio" name="service" value="([^"]+)"><span><b>[^<]*<\/b><small>([^<]+)<\/small>/g)].map((m) => decode(m[2]));
  check(JSON.stringify(chipsP) === JSON.stringify(c.pricing.plans.map((p) => `${eur(p.price)} · ${p.condition}`)), `${c.slug}: the chips carry the price with each plan's own condition`);
  const fees = slice(h, '<dt>Fees</dt>', '</dd>');
  check(fees.includes(feesOf(c)), `${c.slug}: the fact sheet's fees row is derived from the plans (each plan's condition where they differ, once where they agree)`);
  const reg = CITY_MARKETS[c.slug];
  check(!!reg && c.pricing.plans.every((p) => reg.plans && reg.plans[p.id] && reg.plans[p.id].eur === Number(p.price) && reg.plans[p.id].label === p.label), `${c.slug}: the page's prices are the server's (CITY_PLANS)`);
  check(!!reg && (reg.checkout === true) === (c.checkout === true) && reg.mode === c.mode, `${c.slug}: registry ⇄ page agree on the mode and on whether the till is open`);
  const cfgAt = h.indexOf('window.BOOM_CITY = ');
  const cfg = JSON.parse(h.slice(cfgAt + 'window.BOOM_CITY = '.length, h.indexOf('</script>', cfgAt)).trim().replace(/;$/, ''));
  check(cfg.DOOR === c.door.label && cfg.TILL === (c.checkout === true ? c.till.label : null) && cfg.REFUND === (c.checkout === true ? shared.refund.rule : null) && JSON.stringify(cfg.DESK) === JSON.stringify(c.desk)
    && c.pricing.plans.every((p) => cfg.PLANS[p.id].condition === p.condition && cfg.PLANS[p.id].conditionLong === p.conditionLong),
    `${c.slug}: the config carries the one label, the till label and the refund rule only where money is taken, the desk block, and each plan's two conditions`);
}
{
  // Barcelona, live with the till from 22/10 (the founder's decision): the
  // Catalan rules the page names, the service said to be optional and chosen
  // in writing (LAU art. 20 as rewritten by RDL 29/2026), Catalan documents on
  // request (Codi de consum art. 128-1), and no AICAT claim the desk cannot
  // back with a number.
  const h = pageOf('barcelona'); const v = visibleOf(h);
  const svcB = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
  check((svcB.offers || []).map((o) => o.price).join() === '500,199,149' && svcB.areaServed.name === 'Barcelona' && svcB.offers.every((o) => o.availability === 'https://schema.org/InStock'), 'barcelona: the Service carries its three Offers InStock, areaServed Barcelona');
  check(v.includes('You hire us; we do not act for the landlord.') && bcn.facts[0].text === 'You hire us; we do not act for the landlord.', 'barcelona: the brief\'s must-state sentence, verbatim, as the "paid by" fact');
  check(/índice de referencia/.test(v) && /INCASÒL/.test(v) && /Llei 11\/2025/.test(v) && /padrón/.test(v) && /LAU art\. 20/.test(v), 'barcelona: the rent cap, the INCASÒL deposit, Llei 11/2025 on temporary leases, the padrón and LAU art. 20 are on the page');
  check(/Catalan or Spanish/.test(slice(h, 'id="enbref"', '</dl>')) && /Catalan or Spanish/.test(bcn.pricing.note) && /fulls oficials de reclamació/.test(bcn.footer.statement || ''),
    'barcelona: Catalan or Spanish documents on the fact sheet and the price note; the official complaint forms in the footer statement (and Terms §12.6)');
  // the full source — meta description, og, JSON-LD and config included — not
  // only the visible text: a claim in the description is still a claim
  check(!/AICAT/.test(h) && !/registered (local )?partner|desk opens|at opening|Opening with/i.test(h), 'barcelona: no AICAT claim and no waitlist sentence anywhere in the page source (meta and JSON-LD included)');
  // the claim, not the phrasing: a rent-cap sentence that names the reference
  // index must say whom it binds (large owners, homes unlet for five years),
  // and no sentence may say a temporary lease does not protect you
  const sents = h.replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+/);
  const capBad = sents.filter((x) => /(capped|can't (top|exceed)|cannot exceed|rent cap)/i.test(x) && /(índice de referencia|reference index)/i.test(x) && !/(large owners|five years)/i.test(x));
  const tempBad = sents.filter((x) => /temporada|temporary lease/i.test(x) && /(not|n't) protect/i.test(x));
  check(!capBad.length && !tempBad.length, 'barcelona: no sentence ties the reference index to every rent, and none says a temporary lease does not protect you (the claims the 21/10 legal check found outdated)', (capBad[0] || tempBad[0] || '').slice(0, 120));
}
// every live desk is linked from the Company & Markets column of the six
// builder pages AND of their footer source (design/pages-deco/pt.html):
// a desk going live can't skip the template the builders read
{
  const liveDesks = fs.readdirSync(path.join(R, 'cities')).filter((f) => /^[a-z-]+\.json$/.test(f) && !f.startsWith('_')).map((f) => JSON.parse(read('cities/' + f))).filter((c) => c.live === true);
  const miss = [];
  for (const f of ['index.html', 'apartments.html', 'apartment-detail.html', 'your-money.html', 'how-it-works.html', 'try.html', 'design/pages-deco/pt.html', 'design/pages-deco/patch-lotto2.py']) {
    const t = read(f);
    for (const c of liveDesks) if (!new RegExp(`<a href="/${c.slug}(\\.html)?">BOOM ${c.city}</a>`).test(t)) miss.push(`${f} → ${c.slug}`);
  }
  check(liveDesks.length >= 3 && !miss.length, `the footers of the six builder pages and their source template link every live desk (${liveDesks.map((c) => c.slug).join(', ')})`, miss.join('; '));
  // the social-card generator: a waitlist card never claims the work the desk
  // does not do yet (the proof line follows the mode)
  const gen = read('design/pages-deco/genera-og-cities.py');
  const wl = (gen.match(/'(tenant side[^']*your file open today[^']*)'/) || [])[1] || '';
  check(!!wl && !/viewing attended|contract checked/.test(wl) && /mode[^\n]*==[^\n]*'search'|'waitlist'/.test(gen), 'the social-card generator gives waitlist desks their own proof line, without "viewing attended" or "contract checked"', wl);
}
// LAU art. 20 on BOTH Spanish desks, anchored where the claim must live —
// not "optional" and "in writing" anywhere (the form labels "(optional)" and
// "everything in writing" satisfied that and hid a removed claim)
for (const c of [mad, bcn]) {
  const h = pageOf(c.slug);
  const fee = c.checks.items.find((x) => x.id === 'fees');
  const faq = c.faq.items.find((x) => /landlord who pays the agent/.test(x.q));
  const faqLd = ((ldOf(h).flatMap((b) => b['@graph'] || [b]).find((b) => b['@type'] === 'FAQPage') || {}).mainEntity || []).find((q) => faq && q.name === faq.q);
  check(c.pricing.sub.startsWith('Optional, chosen in writing') && h.includes(esc(c.pricing.sub)), `${c.slug}: the price line opens with "Optional, chosen in writing"`);
  check(!!fee && fee.at === 'LAU art. 20' && /optional/i.test(fee.text) && /in writing/i.test(fee.text) && h.includes(esc(fee.text)), `${c.slug}: the "who pays the agent" check cites LAU art. 20 and says the service is optional and chosen in writing`);
  check(!!faq && /optional service you hire in writing/.test(faq.a) && !!faqLd && faqLd.acceptedAnswer.text === faq.a, `${c.slug}: the FAQ answers "the landlord pays the agent" with the optional service hired in writing, on the page and in the FAQPage`);
}
// v1.4 (spec step 6): "the first call" in the refund rule finally means
// something on the page. On a desk that sells the FAQ reads: the legal
// question, "What happens on the free call?", the scam question, "Which
// service is mine?", then the rest. The answer is true to how-it-works step 1
// and to the refund rule (word for word), and promises no duration.
for (const c of [ams, mad, bcn]) {
  const qs = c.faq.items.map((x) => x.q);
  const call = c.faq.items.find((x) => x.q === 'What happens on the free call?');
  const h = pageOf(c.slug);
  check(qs[1] === 'What happens on the free call?' && /scam/.test(qs[2]) && c.faq.items[3].checkin === true && /legal|landlord who pays/i.test(qs[0]),
    `${c.slug}: the FAQ order — the legal question, the free call, the scam question, which service is mine, then the rest`);
  check(!!call && call.a.includes(shared.refund.rule) && /Nothing is charged for the call\./.test(call.a) && !/\d/.test(call.a) && /^A free call/.test(c.how.steps[0].v) && h.includes(`<summary>${esc(call.q)}</summary>`),
    `${c.slug}: the free-call answer carries the refund rule word for word, says nothing is charged, promises no duration (no figure), and matches step 1 ("A free call")`);
}
for (const c of [par, ber]) check(!c.faq.items.some((x) => /free call/i.test(x.q)) && !/free call/i.test(JSON.stringify(c.door) + JSON.stringify(c.checkin.pass.firstCall)) && !/\bcall\b/i.test(JSON.stringify(c.form.sentNext)) && c.form.sentNext[1][1] === 'Our first reply says which papers matter.',
  `${c.slug}: no free-call question and no call promised where the desk is still opening — the OPEN card included ("Our first reply says which papers matter.")`);
// review 22/10: Full Search writes the letter (the founder's decision) — said
// where it is sold: a ✓ line, the Offer, the Stripe product text and llms.txt,
// by the noun of each desk's own paper; Application Pack the same on the
// waitlist desks, whose paper is "a one-page presentation" / "self-disclosure"
for (const [c, noun] of [[ams, 'Motivation letter'], [mad, 'Presentation letter'], [bcn, 'Presentation letter'], [par, 'One-page presentation'], [ber, 'Self-disclosure']]) {
  const fs0 = c.pricing.plans.find((p) => p.id === 'full-search');
  const h = pageOf(c.slug);
  check(fs0.prepares.includes('letter') && fs0.includes.some((x) => x.startsWith(noun + ', ')) && fs0.includes.length <= 5 && new RegExp(noun.split(' ').pop(), 'i').test(fs0.offerDescription)
    && h.includes(`<li>${esc(fs0.includes.find((x) => x.startsWith(noun)))}</li>`),
    `${c.slug}: Full Search names the paper it prepares ("${noun}") on its plate and in its Offer`);
}
check(/local-format dossier and cover letter within one working day/.test(CITY_MARKETS.amsterdam.plans['full-search'].desc) && /application file and cover letter within one working day/.test((read('llms.txt').split('\n').find((l) => /Full Search €500/.test(l)) || '')),
  'the Stripe product text of Full Search (CITY_PLANS) and llms.txt name the cover letter too');
{
  const noLetter = clone(mad); const f1 = noLetter.pricing.plans.find((p) => p.id === 'full-search'); f1.includes = f1.includes.map((x) => x.replace('Presentation letter, a', 'A'));
  check(throws(() => render(noLetter), /plan "full-search" prepares "Presentation letter in Spanish": its ✓ lines and its offerDescription must name it \("letter"\)/) === true,
    'refused: a plan that prepares the letter while its ✓ lines name no letter (the v1.4 Full Search plate)');
  const noOffer = clone(ams); const f2 = noOffer.pricing.plans.find((p) => p.id === 'full-search'); f2.offerDescription = f2.offerDescription.replace(' and motivation letter', '');
  check(throws(() => render(noOffer), /plan "full-search" prepares "Motivation letter, Dutch and English": its ✓ lines and its offerDescription must name it/) === true,
    'refused: a plan that prepares the letter while its Offer names no letter');
  const berAp = clone(ber); const f3 = berAp.pricing.plans.find((p) => p.id === 'application-pack'); f3.includes = f3.includes.map((x) => x.replace('Self-disclosure and cover note in German', 'Cover note in German'));
  check(throws(() => render(berAp), /plan "application-pack" prepares "Tenant self-disclosure \(Mieterselbstauskunft\)": .*\("self-disclosure"\)/) === true,
    'refused: a waitlist plan whose plate names a different paper from the one the ticket says it prepares (Berlin\'s self-disclosure)');
  const parCall = clone(par); parCall.form.sentNext[1][1] = 'We tell you on the call what papers matter.';
  check(throws(() => render(parCall), /its OPEN card \(form\.sentNext\) and its facts promise no call/) === true, 'refused: a waitlist OPEN card that promises a call');
  const oldAlt = clone(ams); oldAlt.checkoutCopy.altLink = 'Open a file, no payment';
  check(throws(() => render(oldAlt), /checkoutCopy\.altLink must start with door\.label \("Start with a free call"\)/) === true, 'refused: the till\'s way out under the v1.3 name ("Open a file, no payment")');
  const renamed = clone(bcn); renamed.checkoutCopy.altLink = 'Book a slot, no card';
  check(throws(() => render(renamed), /checkoutCopy\.altLink must start with door\.label/) === true, 'refused: the till\'s way out renamed to anything but the door');
  const oldNet = clone(mad); oldNet.checkoutCopy.errors.net = "Checkout hiccuped on our side — try again, or open a file and we'll send a payment link.";
  check(throws(() => render(oldNet), /nothing in the sheet says "open a file"/) === true, 'refused: the till\'s network error sending the payer to "open a file"');
}
for (const c of [ams, mad, bcn]) {
  const h = pageOf(c.slug);
  check(c.checkoutCopy.altLink.startsWith(c.door.label) && h.includes(`id="ovTalk">${esc(c.checkoutCopy.altLink)}</a>`) && /start with a free call instead\.$/.test(c.checkoutCopy.errors.net) && h.includes(`data-err-net="${esc(c.checkoutCopy.errors.net)}"`),
    `${c.slug}: the till's way out and its error name the page's one door ("${c.checkoutCopy.altLink}")`);
}
// "Prefer to talk first?" keeps the till's plan: the door carries it, from 'plate', as a plate link does —
// but never under an issued ticket (review 22/10, finding 14's twin: the hidden chip, the WhatsApp text and
// the strip drifted to another plan under a boarding pass)
check(/\$\('ovTalk'\)\.addEventListener\('click', function \(\) \{\s*var id = chosen\(\);\s*if \(planOf\(id\) && form && !\(T && T\.issued\(\)\)\) \{ form\.setAttribute\('data-plan-from', 'plate'\); setPlan\(id, 'plate'\); \}\s*close\(\);\s*\}\);/.test(js),
  'the till\'s "talk first" link writes its plan into the door (data-plan-from plate, setPlan) before closing — never once the ticket is issued');
// the founder's two decisions (22/10) on every desk that sells: the first call
// is free, Full Search runs until the tenant signs or stops it
for (const c of [ams, mad, bcn]) {
  const fs0 = c.pricing.plans.find((p) => p.id === 'full-search');
  const dk = c.faq.items.find((x) => /don't find anything/.test(x.q));
  check(/^A free call/.test(c.how.steps[0].v || '') && fs0.includes.includes('Until you sign, or you say stop') && /until you sign or stop it/.test(dk ? dk.a : '') && /until the tenant signs or stops the search/.test(fs0.offerDescription || ''),
    `${c.slug}: the free first call (step 1), Full Search "until you sign, or you say stop" on the plate, the FAQ and the Offer`);
}
{
  const h = pageOf('madrid'); const v = visibleOf(h);
  const svcM = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
  check((svcM.offers || []).map((o) => o.price).join() === '500,199,149' && svcM.areaServed.name === 'Madrid' && svcM.offers.every((o) => o.availability === 'https://schema.org/InStock'), 'madrid: the Service carries its three Offers InStock, areaServed Madrid');
  check(v.includes('You hire us; we do not act for the landlord.') && mad.facts[0].text === 'You hire us; we do not act for the landlord.', 'madrid: the brief\'s must-state sentence, verbatim, as the "paid by" fact');
  check(/LAU art\. 20/.test(v) && /fianza/.test(v) && /padrón/.test(v) && /no regional cap/i.test(v), 'madrid: the §4 facts are on the page');
}
for (const c of [ams, mad, bcn]) {
  const h = pageOf(c.slug);
  check(c.checkout === true && h.includes('"CHECKOUT": true') && h.includes('"CHECKOUT_ENDPOINT": "/api/service-checkout"') && h.includes(`"FEATURED": "${c.pricing.plans.find((p) => p.featured).id}"`), `${c.slug}: the config opens the till and names the featured plan`);
  const rows = [...h.matchAll(/<label class="payrow"><input type="radio" name="payplan" value="([^"]+)" data-eur="(\d+)" data-label="([^"]+)">/g)].map((m) => [m[1], m[2], m[3]]);
  check(/<dialog class="sheet" id="ov"/.test(h) && !/class="ov" id="ov" role="dialog"/.test(h) && JSON.stringify(rows) === JSON.stringify(c.pricing.plans.map((p) => [p.id, String(p.price), p.label])),
    `${c.slug}: the till is ONE native <dialog>, the three plans as rows at the plate prices`);
  check(!h.includes('id="payOffer"') && h.includes(`<div class="sent paid" id="fPaid" tabindex="-1" data-pending="${esc(c.checkoutCopy.paid.pending)}"`) && !/data-word="(OPEN|PAID)"/.test(h) && h.includes(`data-sending="${esc(c.form.sending)}"`)
    && c.checkoutCopy.paid.pending === 'Payment being confirmed. Your confirmation comes by email.' && c.checkoutCopy.offer === undefined,
    `${c.slug}: the door's end states — OPEN, and PAID with its "being confirmed" sentence until the server answers; no mini boards, no after-file offer (the ticket stub is the offer)`);
  check(h.includes(`<b id="openWhen" data-default="${esc(c.form.sentWhenDefault)}">${esc(c.form.sentWhenDefault)}</b>`), `${c.slug}: the reply window is a computed slot with "${c.form.sentWhenDefault}" as the no-JS default`);
  check(h.includes(`data-unconfirmed="${esc(c.checkoutCopy.paid.unconfirmed)}"`) && /^Not confirmed yet\./.test(c.checkoutCopy.paid.unconfirmed),
    `${c.slug}: the paid card carries its "not confirmed yet" heading for the fifth unanswered ask (review 22/10)`);
  check(h.includes(esc(c.checkoutCopy.fine)) && /refunded in full if we decline the search in the first call/.test(c.checkoutCopy.fine) && /Stripe/.test(c.checkoutCopy.fine) && /Egidi Immobiliare S\.r\.l\./.test(c.checkoutCopy.fine), `${c.slug}: the sheet's fine print says Stripe, the invoicing entity and the refund rule`);
  check(/<p class="alt">[^<]*<a href="#contact" id="ovTalk">/.test(h), `${c.slug}: the sheet keeps the free door one tap away`);
  // Direttiva 2011/83/UE (artt. 7(3), 16(a)): the 14-day withdrawal right is
  // said BEFORE the payment, and the work starts inside it only on the payer's
  // own express request — an unticked box, never pre-selected.
  const sStart = h.indexOf('<label class="startnow"><input type="checkbox" id="sStart"><span>');
  check(sStart > 0 && !/id="sStart"[^>]*checked/.test(h) && sStart < h.indexOf('id="sGo"') && /fully performed/.test(c.checkoutCopy.startNow) && h.includes(esc(c.checkoutCopy.startNow)),
    `${c.slug}: an UNTICKED "Start now" box before the pay button — the payer's own request to start inside the withdrawal period`);
  check(/<p class="recesso">[^<]*14 days[^<]*<a href="mailto:hello@boom-rome\.com">/.test(h) && h.indexOf('class="recesso"') < h.indexOf('id="sGo"'),
    `${c.slug}: how to withdraw (14 days, by email) is on the till before the pay button`);
  check(new RegExp(`<p class="recesso">[\\s\\S]*?<a href="\\/withdrawal\\?desk=${c.city}" target="_blank" rel="noopener">model withdrawal form<\\/a>[\\s\\S]*?<\\/p>`).test(h),
    `${c.slug}: the till links the model withdrawal form with its desk named (Directive 2011/83/EU art. 6(1)(h), Annex I(B))`);
  check(JSON.stringify(cfgOf(h).PAID_WAIT_NEXT) === JSON.stringify(c.checkoutCopy.paid.nextWait) && !c.checkoutCopy.paid.nextWait.flat().some((y) => /same working day|today/i.test(y))
    && h.includes('<ul class="next" id="paidNext">'),
    `${c.slug}: a payer who waits gets their own three steps (config PAID_WAIT_NEXT, swapped into #paidNext) — never "same working day"`);
  check(h.includes(`data-wait="${esc(c.checkoutCopy.paid.wait.replace('{email}', 'hello@boom-rome.com'))}"`) && /14 days/.test(c.checkoutCopy.paid.wait),
    `${c.slug}: the paid card knows what to say to a payer who did not tick: the work begins when the 14 days end`);
  check(!/same working day/i.test(c.checkoutCopy.note) || /withdraw/i.test(c.checkoutCopy.note), `${c.slug}: the till's note does not promise the same working day without the tick`);
  check(h.indexOf('id="ov"') > h.indexOf('</main>'), `${c.slug}: the dialog lives outside <main>`);
  const strip = slice(h, '<div class="paybar" id="paybar"', '<a class="go" href="#contact" id="stripGo">');
  check(strip && !/€|\d/.test(visibleOf(strip)) && h.includes(`<a class="go" href="#contact" id="stripGo">${esc(c.door.label)}</a>`), `${c.slug}: the phone's strip carries no price and reads the one label`);
}
for (const [c, mustState, facts, factsLabel] of [
  [par, 'Launching with a licensed partner.', [/carte professionnelle/, /loi Hoguet/, /encadrement des loyers/, /Visale/, /justificatif de domicile/], 'carte professionnelle, loi Hoguet, the encadrement des loyers, Visale and the justificatif de domicile'],
  [ber, 'Launching with a licensed partner.', [/§\s?34c GewO/, /Mietpreisbremse/, /Bestellerprinzip/, /Kaution/, /Anmeldung/, /SCHUFA/], '§34c GewO, the Mietpreisbremse, the Bestellerprinzip, Kaution, Anmeldung and SCHUFA'],
]) {
  const h = pageOf(c.slug);
  const v = visibleOf(h);
  check(c.checkout !== true && h.includes('"CHECKOUT": false') && !/id="ov"|data-pay=|id="fPaid"|payOffer|<dialog/.test(h), `${c.slug}: no till — CHECKOUT false, no dialog, no pay control, no paid state`);
  check(!/stripe/i.test(h) && !h.includes(shared.refund.rule), `${c.slug}: no Stripe anywhere, no refund rule (no money is taken)`);
  check(h.includes(`<p class="pricenote">${esc(c.form.service.priceNote)}</p>`) && c.form.service.priceNote === 'List prices, VAT included. Each plan says when it is charged.', `${c.slug}: under the chips, one line: list prices, each plan says when it is charged`);
  check(c.pricing.plans.every((p) => /at opening|on signing/.test(p.condition)) && /^Opening with/.test(c.hero.lead), `${c.slug}: every plan's condition says when it is charged; the lead opens with "Opening with"`);
  const svcW = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
  check((svcW.offers || []).length === 3 && svcW.offers.every((o) => o.availability === 'https://schema.org/PreOrder' && o.priceSpecification.valueAddedTaxIncluded === true), `${c.slug}: the three Offers are PreOrder with VAT declared`);
  check(v.includes(mustState) && c.facts[0].text.includes(mustState), `${c.slug}: the brief's must-state sentence, verbatim, inside the "paid by" fact`);
  // review 22/10, round 2: no call is promised on a waitlist desk, the facts included —
  // the third fact says what is charged until the desk opens (nothing), not "the first call"
  const wlFacts = visibleOf(slice(h, '<dl class="facts"', '</dl>'));
  check(wlFacts && !/\bcall\b/i.test(wlFacts) && c.facts[2].key === 'nothing' && /^Nothing is charged\./.test(c.facts[2].text) && wlFacts.includes(c.facts[2].text),
    `${c.slug}: the facts promise no call; the third says nothing is charged until the desk opens`, wlFacts);
  check(facts.every((re) => re.test(v)), `${c.slug}: ${factsLabel} are on the page`);
  check(h.includes('<p class="condlong" id="ckCondLong"></p>') && !/id="ckRefund"/.test(h) && !/id="ckStart"/.test(h) && h.includes('id="ckFile" data-service=""'), `${c.slug}: the pass prints the plan's long condition instead of a refund rule, and has one door`);
}
check(/sign/i.test(ber.pricing.plans[0].condition) && /once you sign a lease/.test(ber.pricing.plans[0].conditionLong) && /once you sign/.test(ber.facts[0].text) && /once you sign/.test(ber.facts[2].text),
  'berlin: Full Search is due only once you sign — the WoVermRG rule — on the plan\'s two conditions and on two of the three facts');
check(/ List prices\. Full Search due only once you sign a lease; the other plans charged only when the desk opens\.$/.test(checkinAnswer(ber)) && / List prices, charged only when the desk opens\.$/.test(checkinAnswer(par)) && !/List prices/.test(checkinAnswer(ams)) && !/List prices/.test(checkinAnswer(bcn)),
  'the derived FAQ answer carries each desk\'s truth: Berlin per plan, Paris at opening, Amsterdam and Barcelona nothing of the kind');
{
  const stripe = clone(par); stripe.bref.rows[0].ddHtml = '<a href="https://buy.stripe.com/x">pay</a>';
  check(throws(() => render(stripe), /no Stripe reference/) === true, 'a waitlist city with a Stripe link is refused');
  const noPriceW = clone(par); delete noPriceW.pricing.plans[0].price;
  check(throws(() => render(noPriceW), /needs a positive price/) === true, 'a waitlist plan without its list price is refused like any other');
  const flipped = clone(par); flipped.mode = 'search'; flipped.checkin.pass.boarding = {}; flipped.hero.lead = 'Found by someone on your side.'; flipped.pricing.plans.forEach((p) => { p.condition = 'flat · incl. VAT'; p.conditionLong = 'VAT included.'; }); delete flipped.form.service.priceNote;
  const fh = render(flipped).html;
  check(fh.includes('"CHECKOUT": false') && !/<dialog/.test(fh) && fh.includes('data-plan-price="full-search">€500</span>'), 'flipping Paris to "search" keeps its prices and opens no till by itself');
}
// the family: derived, and a live page never links a draft
{
  const A = { slug: 'amsterdam', city: 'Amsterdam', live: true }, P = { slug: 'paris', city: 'Paris', live: false }, M = { slug: 'madrid', city: 'Madrid', live: true };
  const all = [M, P, A];
  const hrefs = (c) => familyFor(c, all, shared).map((f) => f.href);
  check(JSON.stringify(hrefs(A)) === JSON.stringify(['/madrid', '/']), 'a LIVE page links only its live sisters (alphabetical), then BOOM Rome');
  check(JSON.stringify(hrefs(P)) === JSON.stringify(['/amsterdam', '/madrid', '/']), 'a DRAFT page links every sister: the review needs to see the suite');
  check(!hrefs(M).includes('/madrid') && !hrefs(A).includes('/amsterdam'), 'a page is never in its own list');
  const col = slice(pageOf('paris'), `<h4 class="footer-links-title">${esc(shared.desksLabel)}</h4>`, '</ul>');
  check(/\/amsterdam">Amsterdam[\s\S]*\/barcelona">Barcelona[\s\S]*\/berlin">Berlin[\s\S]*\/madrid">Madrid[\s\S]*href="\/">BOOM Rome/.test(col) && !/\/paris"/.test(col), 'paris (draft): the footer column reads Amsterdam · Barcelona · Berlin · Madrid · BOOM Rome');
  for (const [slug, others] of [['amsterdam', ['barcelona', 'madrid']], ['barcelona', ['amsterdam', 'madrid']], ['madrid', ['amsterdam', 'barcelona']]]) {
    const c2 = slice(pageOf(slug), `<h4 class="footer-links-title">${esc(shared.desksLabel)}</h4>`, '</ul>');
    check(others.every((o) => c2.includes(`/${o}"`)) && !/\/paris"|\/berlin"/.test(c2), `${slug} (live): the footer column links the other live desks (${others.join(', ')}) and no draft`);
  }
}
// the door, per desk: a waitlist lead is a FILE OPENED, said so everywhere the operator reads
{
  const m = await call({ ...ANNA, city: 'madrid', areas: 'Chamberí' }, '10.3.0.1');
  check(m.code === 200 && m.lead.market === 'madrid' && m.lead.intent === 'city_search' && /^MADRID — tenant-side search · free call requested · Full Search/.test(m.lead.message) && m.notif.summary.startsWith('🇪🇸 MADRID · Anna Keller'), 'madrid: a search lead', m.lead && m.lead.message);
  check(cityMode(m.lead) === 'search' && cityReplyText(m.lead).endsWith(CITY_MARKETS.madrid.url) && cityLabel(m.lead) === '🇪🇸 Madrid', 'madrid: the reply links /madrid');
  const b = await call({ ...ANNA, city: 'barcelona', areas: 'Gràcia' }, '10.3.0.2');
  check(b.code === 200 && b.lead.market === 'barcelona' && b.lead.intent === 'city_search' && /^BARCELONA — tenant-side search · free call requested · Full Search/.test(b.lead.message) && b.notif.summary.startsWith('🇪🇸 BARCELONA · Anna Keller'),
    'barcelona (live from 22/10): a search lead, said as a search on the summary and the card', b.lead && b.lead.message);
  check(cityMode(b.lead) === 'search' && cityReplyText(b.lead).endsWith(CITY_MARKETS.barcelona.url) && !/opening/.test(cityReplyText(b.lead)), 'barcelona: the reply links /barcelona and no longer says the desk is opening');
  const p = await call({ ...ANNA, city: 'paris', areas: 'Le Marais' }, '10.3.0.3');
  check(p.code === 200 && p.lead.intent === 'city_waitlist' && cityLabel(p.lead) === '🇫🇷 Paris' && cityReplyText(p.lead).includes('opening with a licensed partner'), 'paris: a waitlist lead with the French flag and the licensed partner');
  // the waitlist reply is unchanged by the free-call reply of the selling desks:
  // its door is "Open my file", so no call, and the summary asks for none.
  // Review 22/10, round 2: its OPEN card promises "Our first reply says which
  // papers matter" — this reply is that first reply, so it says it
  check(cityReplyText(p.lead) === `Hi Anna, Valentino here from BOOM 👋 Thanks for your message about your move to Paris.\nI have your dates, budget and situation. The Paris desk is opening with a licensed partner, so I can't start a search there yet. I'll come back today with where we stand, what we can already do for you and which papers to start gathering.\n${CITY_MARKETS.paris.url}`
    && /^PARIS — waitlist \(desk opening with a licensed partner\) · Full Search/.test(p.lead.message) && !/free call|\bcall\b/i.test(p.lead.message + cityReplyText(p.lead)),
    'paris: the waitlist reply says where the desk stands and that it will name the papers to start gathering — no call promised where the desk is still opening', cityReplyText(p.lead));
  // with the Check-in, the first reply names the missing papers itself (the
  // list as the page sent it), says when all are in hand, and never names a
  // list the door clipped at 200 characters (a paper cut in half is not a paper)
  {
    const ds = '5/8 · missing: Last tax notice (avis d\'imposition), A guarantor, or Visale, A one-page presentation';
    const pc = await call({ ...ANNA, city: 'paris', areas: 'Le Marais', dossier: ds }, '10.3.0.5');
    const rp = cityReplyText(pc.lead);
    check(pc.code === 200 && pc.lead.city.dossier === ds && rp.includes(`so I can't start a search there yet. From your check-in, the papers to start gathering: Last tax notice (avis d'imposition), A guarantor, or Visale, A one-page presentation. I'll come back today with where we stand and what we can already do for you.\n`) && !/\bcall\b/i.test(rp),
      'paris + Check-in: the first reply names the missing papers to start gathering, once', rp);
    const all = cityReplyText({ ...pc.lead, city: { ...pc.lead.city, dossier: '8/8' } });
    check(all.includes('so I can\'t start a search there yet. Your check-in says your papers are all in hand. I\'ll come back today with where we stand and what we can already do for you.') && !/start gathering/.test(all),
      'all eight in hand: the reply says so, and asks for no paper', all);
    const cut = '0/8 · missing: ' + 'Passport or EU ID, Employment contract or employer attestation, Last three payslips (bulletins de salaire), Last tax notice (avis d\'imposition), Proof of address (justificatif de domicile), Last three rent receipts'.slice(0, 200 - 15);
    const clipped = cityReplyText({ ...pc.lead, city: { ...pc.lead.city, dossier: cut } });
    check(cut.length === 200 && !/From your check-in/.test(clipped) && /what we can already do for you and which papers to start gathering\.\n/.test(clipped),
      'a papers list the door clipped (200 characters) is never named half: the reply says it will name the papers', clipped);
  }
  const g = await call({ ...ANNA, city: 'berlin', areas: 'Prenzlauer Berg' }, '10.3.0.4');
  check(g.code === 200 && g.lead.intent === 'city_waitlist' && cityLabel(g.lead) === '🇩🇪 Berlin' && cityReplyText(g.lead).includes('opening with a licensed partner'), 'berlin: a waitlist lead with the German flag and the licensed partner');
  for (const pg of pages) check(CITY_MARKETS[pg.slug] && CITY_MARKETS[pg.slug].mode === pg.mode, `${pg.slug}: the server registry agrees with the page on the desk's mode (${pg.mode})`);
  const paidLead = { market: 'amsterdam', paid: true, name: 'Anna Keller', city: { serviceLabel: 'Full Search' } };
  const rpaid = cityReplyText(paidLead);
  check(isCityMarket(paidLead) && /^Hi Anna, Valentino here from BOOM 👋 Payment received for Full Search in Amsterdam — thank you\./.test(rpaid) && rpaid.endsWith(CITY_MARKETS.amsterdam.url), 'a paid city order gets the "payment received" reply');
}

// ── 11 · THE CHECK-IN and THE TICKET (v1.4: section 01): the rules, the papers, the ticket ──
{
  const ck = slice(html, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->');
  const pass = slice(html, '<!-- PASS -->', '<!-- /PASS -->');
  check(JSON.stringify(STEP_IDS) === JSON.stringify(['stage', 'where', 'when']) && JSON.stringify(ams.checkin.steps.map((s) => s.id)) === JSON.stringify(STEP_IDS),
    'the three steps are stage → where → when: every path resolves by the second tap (STUDIO §3.2)');
  check(resolvesAt(ams.checkin, 'zero') === 1 && resolvesAt(ams.checkin, 'found') === 1 && resolvesAt(ams.checkin, 'shortlist') === 2, 'haven\'t started and found resolve on the first tap, a shortlist on the second');
  check(/^One more answer decides: Attended Viewing if .*abroad, Application Pack if .*Amsterdam\.$/.test(pendingText(ams, 'shortlist')), `the pending sentence is derived from the rules ("${pendingText(ams, 'shortlist')}")`);
  for (const [i, s] of ams.checkin.steps.entries()) {
    const fsHtml = (ck.match(new RegExp(`<fieldset class="ck-step" data-step="${s.id}"( hidden)?>[\\s\\S]*?</fieldset>`)) || [''])[0];
    const opts = [...fsHtml.matchAll(/<label class="ck-opt"><input type="radio" name="ck-(\w+)" value="([a-z]+)" data-code="([^"]+)"><span><b>([^<]*)<\/b><\/span><\/label>/g)].map((m) => [m[1], m[2], m[3], decode(m[4])]);
    check(fsHtml && JSON.stringify(opts) === JSON.stringify(s.options.map((o) => [s.id, o.id, o.code, o.t])) && !/<small>/.test(fsHtml) && / hidden>/.test(fsHtml.slice(0, 60)) === (i > 0) && fsHtml.includes(`<button type="button" class="ck-change" data-change="${s.id}" hidden>${esc(ams.checkin.result.change)}</button>`),
      `step "${s.id}": ${opts.length} radio chips, the airport code kept as data-code only (it prints on the ticket stub, not on the chip), ${i ? 'hidden until the step before is answered' : 'shown first'}, a "change" button`);
  }
  check(ck.includes(`<span class="ck-num" id="ckNum">${esc(ams.checkin.num.replace('{n}', '1'))}</span>`) && ck.includes('<p class="ck-landing" id="ckLanding" hidden></p>') && !/<h3/.test(ck), 'the Check-in carries its counter and the landing banner — no title of its own (section 01\'s heading introduces it)');
  // review 22/10 (finding 41): the line the Check-in shows once frozen with the file, on every desk
  check(pages.length === 5 && pages.every((p) => { const c = JSON.parse(read(`cities/${p.slug}.json`)); return typeof c.checkin.sentLine === 'string' && p.html.includes(`<p class="ck-sent" id="ckSent" hidden>${esc(c.checkin.sentLine)}</p>`); }),
    'every desk\'s Check-in carries its frozen line (#ckSent, hidden until a file is issued)');
  // the papers: an OPTIONAL fold of the Check-in (v1.4), the meter and the papers line with them
  const docs = [...ck.matchAll(/<label class="ck-doc"><input type="checkbox" name="ck-doc" value="([a-z]+)"><span>([^<]*)<\/span><\/label>/g)].map((m) => [m[1], decode(m[2])]);
  check(docs.length === DOSSIER_N && JSON.stringify(docs) === JSON.stringify(ams.checkin.dossier.items.map((i) => [i.id, i.t])) && ck.includes(`<details class="papers" id="ckPapersBox" hidden>\n    <summary>${esc(ams.checkin.dossier.fold)}</summary>`)
    && /<fieldset class="ck-papers" id="ckPapers">/.test(ck) && ck.includes('<i id="ckMeter"></i>') && !/ck-doc/.test(pass),
    `the ${DOSSIER_N} papers a Dutch landlord asks for live in the Check-in, folded ("${ams.checkin.dossier.fold}"), with the meter — never on the ticket, which shows only the count`);
  check(ck.includes(`<div class="ppend" id="ckPend" hidden><span class="peye">${esc(ams.checkin.pending.eyebrow)}</span><p id="ckPendText"></p></div>`) && ck.includes(`<p class="ck-suggest" id="ckSuggest" hidden><span id="ckSuggestText"></span> <button type="button" class="ck-use" id="ckSuggestUse">${esc(ams.checkin.result.use)}</button></p>`)
    && /\{plan\}/.test(ams.checkin.result.suggest),
    'the pending line ("two plans fit") and the suggestion ("Your answers suggest {plan} · use it", when a chip picked by hand differs from the rule) live in the Check-in');
  // the ticket's anatomy (passSpec)
  check(pass.includes('<div class="uscita printer" id="passWrap">\n  <div class="fessura" aria-hidden="true"></div>') && pass.includes(`<p class="pblank" id="ckBlank">${esc(ams.checkin.landing.blank)}</p>`) && pass.indexOf('id="ckBlank"') < pass.indexOf('<article class="pass carta"'),
    'the printer: the slot and its one-line caption, before the card — never a blank card');
  check(pass.includes(`<b id="ckTitle">${esc(ams.checkin.pass.titles.plan)}</b><span class="flap-mini" id="ckStatus" data-word="${ams.checkin.pass.status.standby}" aria-hidden="true"></span><span class="sr" id="ckStatusSr">${ams.checkin.pass.status.standby}</span>`)
    && ams.checkin.pass.titles.plan === 'BOOM · Your plan' && ams.checkin.pass.titles.issued === 'BOOM · Boarding pass' && JSON.stringify(ams.checkin.pass.status) === '{"standby":"STANDBY","open":"OPEN","paid":"PAID"}',
    'the header: "BOOM · Your plan" until something is issued, the one status board STANDBY (aria-hidden, the word as text beside it)');
  check(pass.includes(`<span class="pfrom" id="ckFrom">YOU</span><span class="pline" aria-hidden="true"><i class="ptrail"></i><svg class="pplane"><use href="#boomPlane"/></svg></span><span class="pto">${ams.iata}</span>`),
    'the route: YOU until the "where" answer, the SVG plane on the dashed line, the IATA code');
  check(['ckPlan', 'ckWhy', 'ckNote', 'ckPassenger', 'ckMoveIn', 'ckPassPapers', 'ckPassFile', 'ckPassWhen'].every((id) => pass.includes(`id="${id}"`)) && pass.includes(`<dd id="ckPassFile">—</dd>`) && pass.includes(`<dd id="ckPassenger">—</dd>`),
    'the body: plan, why, note; the fields passenger · move-in · papers · file · boarding, all "—" at parse (the file number only ever comes from the server)');
  check(/<span class="flap-tk flap-scale" id="ckPrice" aria-hidden="true"><\/span><span class="sr" id="ckPriceSr"><\/span><small id="ckCond"><\/small>/.test(pass) && pass.indexOf('<aside class="stub">') < pass.indexOf('id="ckPrice"') && pass.includes('<div class="perf" aria-hidden="true"></div>') && pass.indexOf('class="perf"') < pass.indexOf('<aside class="stub">'),
    'the perforation, then the stub: the fare on its one board (decorative) with the amount as text and the plan\'s condition beside it');
  check(pass.includes(`<p class="ppending" id="ckPending" hidden>${esc(ams.checkoutCopy.paid.pending)}</p>`) && pass.includes(`<p class="codeline" id="ckCodeLine" data-base="${ams.iata} · TENANT SIDE">`) && pass.includes('<div class="barcode" aria-hidden="true"></div>')
    && pass.includes(`<a class="wa2" id="ckWa2" href="${esc(waAms)}" target="_blank" rel="noopener">${esc(ams.checkin.pass.stub.wa)}</a>`) && pass.includes('<span class="stamp" id="ckStamp" data-stamp="" aria-hidden="true"></span>'),
    'the stub carries the confirming sentence (hidden), the barcode and its answer-code line, the door, the till, WhatsApp with the desk marker; the stamp lives in an attribute');
  check(slice(html, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->').includes('<span class="sr" id="ckLive" role="status" aria-live="polite"></span>') && ck.includes('<p class="ready" id="ckReady" role="status"></p>')
    && (ck.match(/<[^>]*(?:aria-live|role="status")[^>]*>/g) || []).length === 2 && (pass.match(/<[^>]*(?:aria-live|role="status")[^>]*>/g) || []).length === 2 && /id="ckCopied" aria-live="polite"/.test(pass) && /id="ckSaved" aria-live="polite"/.test(pass),
    'the live regions: #ckLive and #ckReady in the Check-in (a region inside the phone\'s display:none ticket misses its first announcement), exactly #ckCopied and #ckSaved under the ticket');
  // review 22/10 (finding 41): the Check-in turns inert with the file, and an inert subtree is out of the
  // accessibility tree — #ckLive sits just before the section, so "Your file is open. File BM …" is still announced
  check(html.indexOf('<span class="sr" id="ckLive"') > -1 && html.indexOf('<span class="sr" id="ckLive"') < html.indexOf('<section class="checkin" id="checkin"') && !slice(html, '<section class="checkin" id="checkin"', '</section>').includes('id="ckLive"'),
    '#ckLive sits outside the Check-in section that freezes (inert) once a file is issued');
  check(!/id="ckName"|id="ckOrigin"|ckBoard|ppers|pgrid/.test(pass) && ams.checkin.pass.name === undefined && ams.checkin.pass.from === undefined && ams.checkin.pass.guest === 'A tenant' && pass.includes(`<em>BOOM · ${esc(ams.checkin.pass.side.toUpperCase())}</em>`),
    'no name or origin inputs (the passenger is the name typed in the door, once a file is open; the export keeps "A tenant"), the foil reads BOOM · TENANT SIDE');
  check(pass.includes(`<div class="pshare"><button type="button" class="ck-save" id="ckSave">${esc(ams.checkin.pass.save)}</button><button type="button" class="ck-sharebtn" id="ckShare">${esc(ams.checkin.pass.shareBtn)}</button><button type="button" id="ckCopy">${esc(ams.checkin.share.copy)}</button>`)
    && pass.includes(`<a id="ckWa" href="#" target="_blank" rel="noopener">${esc(ams.checkin.share.whatsapp)}</a>`) && pass.indexOf('<div class="pshare">') > pass.indexOf('</article>'),
    'under the card (inside the PASS slice, outside the article): Save image · Share · Copy link, and WhatsApp to a friend');
  check(!/data-word="OPEN"|data-word="PAID"/.test(pass) && !/flap-prezzo|Gate|Seat/.test(pass), 'the ticket carries no v1.2 chrome (gate, seat) and no board that is not its own');
  // review 22/10: the hero's "Three questions" link (and its dot, its own
  // span) left with the Check-in — without JS it pointed at a section with no
  // questions. The #plan h2 stays (spec step 6: the section shows its heading).
  check(/<noscript><style>[^<]*\.checkin,#pass,\.pshare,\.paybar\{display:none!important\}\.plan-head,#passWrap,#heroPlan,\.hp-sep\{display:none!important\}/.test(html) && /\.planline \.chips\{display:block/.test(html.slice(html.indexOf('<noscript><style>')))
    && html.includes('<a href="#plan" id="heroPlan">' + esc(ams.glance.alt) + '</a><span class="hp-sep"> · </span><a href=') && !/#plan h2|\.plan-h2|#plan>h2/.test(html.slice(html.indexOf('<noscript><style>'), html.indexOf('</noscript>'))),
    'without JS the Check-in, the ticket, its share row, the printer, the head line, the hero\'s three-questions link with its dot and the strip are hidden, the #plan heading stays, and the chips are open: the door reads whole');
  // ISSUE, PREPARES, DOSSIER, PAID_PENDING, WA_TEXT, WA_PLAN, DOOR_SUB_LEAD, LEAD_URL: the ticket's config (spec step 9)
  {
    const c0 = cfgOf(html);
    check(JSON.stringify(c0.ISSUE) === JSON.stringify({ titles: ams.checkin.pass.titles, status: ams.checkin.pass.status, boarding: ams.checkin.pass.boarding, firstCall: ams.checkin.pass.firstCall, stub: ams.checkin.pass.stub })
      && JSON.stringify(c0.PREPARES) === JSON.stringify({ 'full-search': ['letter'], 'application-pack': ['letter'], 'attended-viewing': [] })
      && JSON.stringify(c0.DOSSIER) === JSON.stringify({ some: ams.checkin.dossier.some, ours: ams.checkin.dossier.ours, all: ams.checkin.dossier.all, rest: ams.checkin.dossier.rest })
      && c0.PAID_PENDING === ams.checkoutCopy.paid.pending && c0.WA_TEXT === "Hi BOOM Amsterdam, I'm moving to Amsterdam." && c0.WA_PLAN === shared.contact.waPlan && c0.DOOR_SUB_LEAD === 'no card' && c0.LEAD_URL === '/api/city-lead'
      && !Object.keys(c0).some((k) => /OFFER/.test(k)),
      'the config carries ISSUE, PREPARES, DOSSIER, PAID_PENDING, WA_TEXT, WA_PLAN, DOOR_SUB_LEAD and LEAD_URL — and no offer key');
    const cp = cfgOf(pageOf('paris'));
    check(cp.PAID_PENDING === null && cp.DOOR_SUB_LEAD === 'free' && JSON.stringify(cp.ISSUE.boarding) === '{"waitlist":"When the desk opens"}' && cp.ISSUE.titles.issued === 'BOOM · Your file' && !('paid' in cp.ISSUE.status),
      'a waitlist desk\'s config: no pending payment sentence, "free" before the window, Boarding "When the desk opens", the issued title "BOOM · Your file", no PAID');
  }
  // what each plan prepares (founder, 22/10): the letter for Full Search and the
  // Application Pack, nothing for Attended Viewing — on every desk; the papers
  // line names the plan that does the work ({plan}), never a plan-less «ours»
  for (const c of [ams, mad, bcn, par, ber]) {
    const pr = Object.fromEntries(c.pricing.plans.map((p) => [p.id, p.prepares]));
    const d = c.checkin.dossier;
    check(JSON.stringify(pr) === JSON.stringify({ 'full-search': ['letter'], 'application-pack': ['letter'], 'attended-viewing': [] }) && d.items.some((i) => i.id === 'letter')
      && /\{plan\}/.test(d.ours) && /\{ours\}/.test(d.ours) && /\{have\}/.test(d.some) && /\{missing\}/.test(d.some) && !/\bours\b|\bwe (format|apply|write)\b/i.test(d.all + ' ' + d.rest + ' ' + d.some),
      `${c.slug}: Full Search and the Application Pack prepare the letter, Attended Viewing nothing; "ours" names {plan}, and no other papers line claims work`);
    check(['fixable', 'resultAll', 'resultSome', 'skipped'].every((f) => d[f] === undefined) && d.fold === 'Check your papers (optional)' && d.rest === (c.checkout === true ? 'The rest we go through on the free call.' : 'The rest our first reply goes through.'),
      `${c.slug}: the v1.3 papers lines are gone (they told an Attended Viewing client "the letter and the format are ours"); the rest goes to ${c.checkout === true ? 'the free call' : 'the first reply'}`);
  }
  const cfgAt = html.indexOf('window.BOOM_CITY = ');
  const cfg = JSON.parse(html.slice(cfgAt + 'window.BOOM_CITY = '.length, html.indexOf('</script>', cfgAt)).trim().replace(/;$/, ''));
  check(cfg.IATA === 'AMS' && cfg.PAGE_URL === `${shared.siteUrl}/amsterdam` && JSON.stringify(cfg.CHECKIN) === JSON.stringify(ams.checkin) && JSON.stringify(Object.keys(cfg.PENDING)) === '["shortlist"]' && cfg.PENDING.shortlist === pendingText(ams, 'shortlist'),
    'the config carries the IATA code, the share URL, the Check-in data VERBATIM and the pending sentence for the one stage that waits');
  // the derived FAQ and the audiences
  const ans = checkinAnswer(ams);
  const q = ams.faq.items.find((x) => x.checkin).q;
  check(q === 'Which service is mine?' && faqVisible.some((f) => f.q === q && f.a === ans) && faqItems.some((f) => f.q === q && f.a === ans), `the FAQ "${q}" is DERIVED from the rules — visible and in the FAQPage`);
  check(/^Full Search \(€500\) if you haven't started\. Application Pack \(€199\) if you've found one and need to apply, or you have a shortlist and you're already in Amsterdam\. Attended Viewing \(€149 per viewing\) if you have a shortlist and you're still abroad\. Not sure: start with the free call, we advise\.$/.test(ans) && /Not sure: open a file, we advise\./.test(checkinAnswer(par)),
    `one sentence per plan, from the phrases of the options, then the free door in the desk's own words — the free call where it sells, a file where it opens ("${ans.slice(0, 50)}…")`);
  check(faqOf(ams).find((f) => f.q === q).a === ans && ams.faq.items.find((x) => x.checkin).a === undefined, 'the data carries only the question; faqOf resolves the answer');
  const aud = Object.fromEntries((svc.offers || []).map((o) => [o.name, o.itemOffered && o.itemOffered.audience && o.itemOffered.audience.audienceType]));
  check(aud['Full Search'] === "Tenants who haven't started" && aud['Attended Viewing'] === 'Tenants who have a shortlist and are still abroad' && aud['Application Pack'] === 'Tenants who have found one and need to apply, or who have a shortlist and are already in Amsterdam',
    'every Offer names its audience in the third person, derived from the same rules');
  check(ams.pricing.plans.every((p) => offerAudience(ams, p.id) === aud[p.label]) && offerAudience(ams, 'nope') === null, 'offerAudience is the function the schema uses');
  // the refusals
  for (const [name, mut, re] of [
    ['a stage × where without a plan', (c) => { c.checkin.rules = c.checkin.rules.filter((r) => !(r.when.stage === 'shortlist' && r.when.where === 'here')); }, /leave stage=shortlist × where=here without a plan/],
    ['a rule on a plan the page does not sell', (c) => { c.checkin.rules[0].plan = 'concierge'; }, /plan "concierge" is not one of the plans/],
    ['a rule on an answer that does not exist', (c) => { c.checkin.rules[0].when = { stage: 'dreaming' }; }, /unknown condition stage=dreaming/],
    ['a rule that depends on the date', (c) => { c.checkin.rules[0].when = { stage: 'zero', when: 'soon' }; }, /cannot depend on "when"/],
    ['the steps out of order', (c) => { c.checkin.steps = [c.checkin.steps[0], c.checkin.steps[2], c.checkin.steps[1]]; }, /must be exactly stage, where, when in that order/],
    ['seven documents', (c) => { c.checkin.dossier.items.pop(); }, new RegExp(`exactly ${DOSSIER_N} documents`)],
    // 22/10: the papers line promised the letter and the format to every plan
    // (also on Attended Viewing, which prepares neither): v1.4 keys, same guard
    ['a plan-less papers promise (the 20/10 live copy)', (c) => { c.checkin.dossier.some = '{have} of 8 in hand. Missing: {missing}. The letter and the format are ours; for the rest we tell you exactly what to ask.'; }, /dossier\.some must name the plan that does the work/],
    ['a plan-less «we format and apply»', (c) => { c.checkin.dossier.all = 'All eight in hand. We format them the local way and apply as listings appear.'; }, /dossier\.all must name the plan that does the work/],
    ['an «ours» line that does not name the chosen plan', (c) => { c.checkin.dossier.ours = 'We prepare: {ours}.'; }, /dossier\.ours must carry \{plan\}/],
    ['the v1.3 resultSome', (c) => { c.checkin.dossier.resultSome = '{have} of 8. The Application Pack writes the letter.'; }, /dossier\.resultSome is a v1\.3 leftover/],
    ['the v1.3 fixable list', (c) => { c.checkin.dossier.fixable = ['letter']; }, /dossier\.fixable is a v1\.3 leftover/],
    ['a plan that prepares a paper the desk does not list', (c) => { c.pricing.plans[2].prepares = ['visa']; }, /plan "attended-viewing": prepares must be a list of the dossier's own paper ids/],
    ['a plan without prepares', (c) => { delete c.pricing.plans[0].prepares; }, /plan "full-search": prepares must be a list/],
    ['a share text without {url}', (c) => { c.checkin.share.plan = 'BOOM {city}, check in.'; }, /must carry \{url\}/],
    ['a share text with a price', (c) => { c.checkin.share.plan = 'BOOM {city}, €500 flat: {url}'; }, /names a price/],
    ['a share text too long', (c) => { c.checkin.share.plan = 'x'.repeat(130) + ' {url}'; }, /over 120 characters/],
    ['a hand-written answer on the derived FAQ', (c) => { c.faq.items.find((x) => x.checkin).a = 'Full Search, always.'; }, /carries only the question/],
    ['no IATA code', (c) => { delete c.iata; }, /"iata" \(three upper-case letters\) is required/],
    ['a lower-case pass code', (c) => { c.checkin.steps[0].options[0].code = 'start'; }, /code \(2–10 upper-case chars, on the pass\)/],
    ['a missing when note', (c) => { delete c.checkin.notes.when.later; }, /one line for every "when" option/],
    ['the v1.2 where note', (c) => { c.checkin.notes.where = { abroad: 'x' }; }, /notes\.where is a v1\.2 leftover/],
    ['no refusal sentence', (c) => { delete c.checkin.refusal; }, /checkin\.refusal is required/],
    ['pending without {plans}', (c) => { c.checkin.pending.text = 'One more answer decides.'; }, /a text with \{plans\}/],
    ['the v1.2 "Show my plan" button', (c) => { c.checkin.dossier.go = 'Show my plan'; }, /dossier\.go is a v1\.2 leftover/],
    ['the v1.2 result ctas', (c) => { c.checkin.result.ctaSearch = 'Start · {price}'; }, /ctaSearch is a v1\.2 leftover/],
    ['the v1.2 gate on the pass', (c) => { c.checkin.pass.gateValue = 'Same day'; }, /gateValue is a v1\.2 leftover/],
    ['a pass without its seven fields', (c) => { delete c.checkin.pass.fields.movein; }, /its seven fields/],
    ['the v1.3 name input', (c) => { c.checkin.pass.name = { label: 'Passenger (optional)' }; }, /checkin\.pass\.name is a v1\.3 leftover/],
    ['the v1.3 origin input', (c) => { c.checkin.pass.from = { label: 'From (optional)' }; }, /checkin\.pass\.from is a v1\.3 leftover/],
    ['a status word longer than the board', (c) => { c.checkin.pass.status.standby = 'WAITING LIST'; }, /checkin\.pass\.status needs standby, open, paid/],
    ['no PAID status on a desk that sells', (c) => { delete c.checkin.pass.status.paid; }, /checkin\.pass\.status needs standby, open, paid/],
    ['a paid boarding without the computed date', (c) => { c.checkin.pass.boarding.paidWait = 'Later'; }, /paidWait \(with \{date\}/],
    ['a priced first call', (c) => { c.checkin.pass.firstCall.fare = '€0'; }, /firstCall needs plan, fare and line \(no price/],
    ['the ticket titles missing', (c) => { delete c.checkin.pass.titles; }, /checkin\.pass\.titles needs plan/],
    ['a suggestion that names no plan', (c) => { c.checkin.result.suggest = 'Your answers suggest another plan'; }, /suggest \(with \{plan\}/],
    ['the Check-in with a title', (c) => { c.checkin.h3 = 'Check in'; }, /checkin\.h3 is a v1\.2 leftover/],
    ['no Check-in at all', (c) => { delete c.checkin; }, /needs "checkin"/]
  ]) {
    const c = clone(ams); mut(c);
    check(throws(() => render(c), re) === true, `refused: ${name}`);
  }
  {
    const late = clone(ams);
    late.checkin.rules = late.checkin.rules.filter((r) => r.when.stage !== 'zero').concat([{ when: { stage: 'zero', where: 'abroad' }, plan: 'full-search', why: 'x' }]);
    check(throws(() => render(late), /leave stage=zero × where=here without a plan|does not resolve by the second tap/) === true, 'a stage whose rules cannot decide by the second tap is refused: the live ticket would be a guess');
  }
  // the sisters: every desk has it, each in its own words and its own law
  for (const c of [mad, bcn, par, ber]) {
    const h = pageOf(c.slug); const ps = slice(h, '<!-- PASS -->', '<!-- /PASS -->');
    const a = checkinAnswer(c);
    const vis = [...h.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)].map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
    const ckc = slice(h, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->');
    check(ps && (h.match(/<section class="checkin" id="checkin"/g) || []).length === 1 && (ckc.match(/<label class="ck-doc">/g) || []).length === DOSSIER_N && ps.includes(`<span class="pto">${c.iata}</span>`) && h.includes(`"IATA": "${c.iata}"`) && slice(h, '<header class="hero"', '</header>').indexOf('id="checkin"') < 0,
      `${c.slug}: the Check-in once, in section 01, with its ${DOSSIER_N} papers folded; the ticket bound for ${c.iata}`);
    check(vis.some((f) => f.q === c.faq.items.find((x) => x.checkin).q && f.a === a) && a.split(/\s+/).length <= 72, `${c.slug}: the derived FAQ answer is on the page (${a.split(/\s+/).length} words — Berlin's per-plan tail is the longest)`);
    const svcC = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
    check((svcC.offers || []).every((o) => !('audience' in o) && o.itemOffered && o.itemOffered['@type'] === 'Service' && o.itemOffered.audience && o.itemOffered.audience.audienceType === offerAudience(c, c.pricing.plans.find((p) => p.label === o.name).id)), `${c.slug}: every Offer's itemOffered Service carries the audience its rules derive`);
    check(c.checkin.steps.map((s) => s.id).join() === STEP_IDS.join() && c.checkin.steps[0].options.every((o) => resolvesAt(c.checkin, o.id) > 0), `${c.slug}: the same three steps, every stage resolving by the second tap`);
  }
  check(ber.checkin.dossier.items.some((i) => /SCHUFA/.test(i.t)) && par.checkin.dossier.items.some((i) => /Visale/.test(i.t)) && bcn.checkin.dossier.items.some((i) => /NIE/.test(i.t)) && ams.checkin.dossier.items.some((i) => /werkgeversverklaring/.test(i.t)),
    'the eight papers are the CITY\'s: SCHUFA in Berlin, Visale in Paris, NIE in Barcelona, werkgeversverklaring in Amsterdam');
  // the review of 17/10: the rule-order bypass of the live-ticket guard, the
  // strings nobody printed, the year from data
  {
    const shadow = clone(ams);
    shadow.checkin.rules = [{ when: { stage: 'found', where: 'abroad' }, plan: 'attended-viewing', why: 'x' }, ...shadow.checkin.rules];
    check(resolvesAt(shadow.checkin, 'found') === 2, 'a where-rule placed before a stage-only rule takes the stage to tap 2: the ticket may not print a plan on tap 1 and switch it on tap 2');
    const shadowHtml = render(shadow).html;
    check(/"PENDING": \{[^}]*"found"/.test(shadowHtml), 'and the page then carries the pending sentence for that stage instead of a plan that would change under the hand');
    for (const [name, mut, re] of [
      ['the share text for the papers (never sent)', (c) => { c.checkin.share.papers = 'The eight papers: {url}'; }, /share\.papers is a leftover/],
      ['a pass sub the pass never prints', (c) => { c.checkin.pass.sub = 'Your ticket'; }, /pass\.sub is a leftover/],
      ['a till sub no control prints', (c) => { c.till.sub = 'card · Stripe'; }, /till\.sub is a leftover/]
    ]) {
      const c = clone(ams); mut(c);
      check(throws(() => render(c), re) === true, `refused: ${name} — a string nobody sees and everybody believes is live`);
    }
    const wlShare = clone(par); wlShare.checkin.share.plan = 'BOOM {city}: a rental agent on the tenant\'s side, flat fees. My plan in three taps: {url}';
    check(throws(() => render(wlShare), /says the desk is opening/) === true, 'a waitlist desk\'s share text must say the desk is opening: a forwarded message is not a desk taking searches today');
    const noYear = clone(shared); delete noYear.copyrightYear;
    check(throws(() => render(ams, noYear), /copyrightYear \(four digits\) is required/) === true && html.includes(`<span>© ${shared.copyrightYear} BOOM</span>`) && !/new Date\(\)\.getUTCFullYear\(\)[^;]*year/.test(read('build-cities.mjs').split('year: String(')[1] || ''),
      'the footer year is data (copyrightYear), never the clock: --check stays green at the year rollover');
  }
  // the review of 17/10, on the page's own promises: the recourse line and the
  // paid copy follow the desk, Berlin says one thing about when it charges
  for (const c of [ams, mad, bcn, par, ber]) {
    check(c.form.sentNext[2][0] === 'Nothing by then?', `${c.slug}: the recourse line follows the computed window ("Nothing by then?"), never "tomorrow" on a Friday evening`);
    check(!/A \{city\} landlord/.test(JSON.stringify(c.checkin.share)) && !/asks for all eight/.test(c.checkin.dossier.sub), `${c.slug}: no "a Amsterdam landlord", no "all eight" over a conditional paper`);
  }
  for (const c of [ams, mad]) {
    const k = JSON.stringify(c.checkoutCopy) + JSON.stringify(c.till);
    check(!/within the hour|starts today|start today/.test(k) && c.checkoutCopy.paid.next[0][0] === 'First desk hour' && /^same working day$/i.test(c.checkoutCopy.paid.next[1][0]) && c.checkoutCopy.paid.recourse === 'Nothing by then? Write to {email}.',
      `${c.slug}: the paid copy promises the desk's first open hour and the same working day, never "within the hour" at Saturday 23:00`);
  }
  check(/other two at opening/.test(ber.facts[0].text) && /Full Search opens under that rule; Application Pack and Attended Viewing are charged at opening/.test(ber.faq.items.find((q) => /Who pays the agent/.test(q.q)).a) && ber.pricing.h2g === 'Charged at opening, or on signing.' && !/nothing in advance/.test(ber.pricing.note),
    'berlin says ONE thing about when it charges: Full Search on signing, the other two at opening — in the fact, the FAQ, the heading and the fee note (the open WoVermRG question stays in the go-live list)');
  // the layer: CSS depth and motion off under reduced motion; the JS contract
  const rm = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  // v1.4: every Rome motion runs once and carries information; under reduced
  // motion none of it runs (the printer's emission, the stamp strike, the plane
  // glide), every final state visible. The soft pass-in entrance is gone.
  check(/@keyframes emissione/.test(css) && /\.uscita/.test(rm) && /\.stamp/.test(rm) && /\.pplane/.test(rm) && !/pass-in/.test(css),
    'under prefers-reduced-motion the printer, the stamp and the plane hold still (the reduced-motion block names .uscita, .stamp, .pplane); the old pass-in entrance is gone');
  check(/::view-transition-group\(\*\),::view-transition-old\(\*\),::view-transition-new\(\*\)\{animation:none!important\}/.test(rm) && /dialog#ov\[open\]\{animation:none\}/.test(rm) && /html\{scroll-behavior:auto\}/.test(rm),
    'under reduced motion: no view transition, no dialog animation, no smooth scroll');
  check(/@property --meter\{syntax:'<percentage>'/.test(css) && /\.late\{content-visibility:auto;contain-intrinsic-size:auto 600px\}/.test(css) && !/\.hero-left,\.hero-right\{display:contents\}/.test(css) && !/position:sticky/.test(css) && !/\.hero-left>#pass/.test(css),
    'the CSS: a typed --meter, content-visibility on the late sections; v1.4 — no display:contents reorder and nothing sticky anywhere (the two hero columns simply stack in DOM order)');
  check(/^\s*\[hidden\]\{display:none!important\}/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'the first rule makes [hidden] win over every state rule (the defeat found in v1.2 cannot return)');
  // the review of 17/10 on the layer and the behaviour, pinned on the source
  check(/::view-transition\{pointer-events:none\}/.test(css) && /render\(\{ plain: true \}\)/.test(js) && /function swap\(fn, plain\)/.test(js),
    'the view-transition overlay lets taps through and a paper tick swaps plain: four quick ticks are four ticks, not two');
  check(/\.ck-change\{[^}]*min-height:44px/.test(css) && /\.pshare a,\.pshare button\{[^}]*min-height:44px/.test(css) && /\.ck-save,\.ck-sharebtn\{[^}]*min-height:44px/.test(css) && /\.plates \.sib \.go2\{[^}]*min-height:44px/.test(css) && /dialog#ov \.x\{min-width:44px;min-height:44px/.test(css),
    'every control the page offers is ≥ 44px: change, the share row, Save/Share, the plates\' second link, the dialog\'s close');
  check(/\.mobile-menu:not\(\.active\)\{visibility:hidden/.test(css) && /body\.menu-open \.boomcst\{visibility:hidden\}/.test(css) && /m\.inert = !open/.test(js) && /e\.key === 'Escape' && m\.classList\.contains\('active'\)/.test(js) && html.includes('<div class="mobile-menu" id="mobileMenu" aria-hidden="true">'),
    'the slid-away menu is out of the tab order and the tree (visibility + inert + aria-hidden), Escape closes it, the consent plate hides under it');
  check(/\.payrow:has\(input:checked\) b::before\{content:'✓ '/.test(css) && /@media\(forced-colors:active\)\{\.payrow:has\(input:checked\)\{outline:3px solid Highlight/.test(css) && /@media print\{/.test(css) && /\.pass\.busy \.ck-save,\.pass\.busy \.ck-sharebtn\{pointer-events:none/.test(css),
    'the chosen pay row carries a glyph and a forced-colours outline, the page prints black on white, the pass\'s busy state is real');
  check(/\.paybar,\.more summary::before,\.sheetfold>summary::after,\.faq summary::after[^}]*\{transition:none\}/.test(rm) && /\.sib:hover,\.g-it:hover\{transform:none\}/.test(rm), 'under reduced motion the strip, the +/x glyphs and the hover lifts hold still too');
  check(/form\.setAttribute\('data-plan-from', 'chip'\)/.test(js) && /\(!from \|\| from === 'checkin'\) && \(service\(\) !== s\.planId \|\| from !== 'checkin'\)/.test(js),
    'a chip the reader chose by hand is theirs: the Check-in writes the door only where nothing or itself wrote, and only when its plan changed');
  check(/var sending = false;/.test(js) && /if \(sending\) return;\n      err\.classList\.remove\('on'\)/.test(js) && /sending = false;\n          go\.style\.opacity = 1/.test(js) && !/offerBtn|payOffer/.test(js),
    'the door sends once per tap (Enter in a field included), the flag released only when the send fails; the after-file offer is gone (the ticket stub is the offer)');
  check(/var before = lastKind;/.test(js) && !/var before = state\(\)\.kind;/.test(js), 'the pass lands on the tap that resolves a pending stage: the kind BEFORE the tap is the one render remembered, not state() after the radio changed');
  check(!/bar\.setAttribute\('data-sub', \(\$\('stripSub'\)/.test(js) && /ov\.addEventListener\('close', function \(\) \{ setTimeout\(upd, 0\); \}\)/.test(js), 'the strip keeps the build\'s copy on a deep-link landing and comes back when the till closes');
  check(/mv\.setAttribute\('data-auto', want\)/.test(js) && /mvEl\.removeAttribute\('data-auto'\)/.test(js), 'the month the page prefills is marked as its own: it follows a changed answer, leaves with it, and a month the reader picked is never touched');
  // v1.4 (spec tests[2]) — PAID only after server proof, the file number only
  // from the server. The contract with the page's JS: the verify-success
  // callback is `function onVerified(v)`, reached only after `v.paid === true`
  // from GET /api/city-lead?paid=; it is the ONLY place that issues the paid
  // ticket and fires purchase. #ckPassFile is written only from the server's
  // answer (j.file after the POST, v.file after the verify). No fileCode, no
  // file alphabet in the browser; the FNV used for GA's opaque transaction id
  // stays, inside onVerified.
  {
    const body = (src, head) => {
      const i = src.indexOf(head); if (i < 0) return '';
      let d = 0, k = src.indexOf('{', i);
      for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); }
      return '';
    };
    const ov = body(js, 'function onVerified(v)');
    const calls = [...js.matchAll(/onVerified\(/g)].map((m) => m.index).filter((i) => !js.startsWith('function onVerified(v)', i - 9));
    check(ov && (js.match(/boomTrack\('purchase'/g) || []).length === 1 && ov.includes("boomTrack('purchase'") && (js.match(/issue\('paid'/g) || []).length === 1 && ov.includes("issue('paid'")
      && calls.length >= 1 && calls.every((i) => /\.paid === true/.test(js.slice(Math.max(0, i - 240), i))),
      'PAID and the purchase event live only in onVerified(v), called only after the server said paid === true — a ?paid= URL alone stamps nothing and counts nothing');
    check(!/fileCode|ABCDEFGHJKLMNPQRSTUVWXYZ23456789|BOOM_SCALO|scalo-codes/.test(js) && (js.match(/0x01000193/g) || []).length <= 1 && (!/0x01000193/.test(js) || ov.includes('0x01000193'))
      // every mention of #ckPassFile is a write of the server's answer or the dash, and nothing
      // else: a «server's file, or one we make up» fallback (o.file || 'BM ' + …) is refused too
      && (js.match(/ckPassFile/g) || []).length === (js.match(/setText\('ckPassFile', (?:DASH|'—'|[jvo]\.file(?: \|\| (?:DASH|'—'))?)\);/g) || []).length
      // the two call sites pinned EXACTLY (review 22/10: a prefix match let
      // `{ file: j.file || ('BM ' + …) }` through), and no write to a .file
      // property anywhere (`v.file = …` before issuing PAID)
      && /T\.issue\('open', \{ file: j\.file, name: name \}\);/.test(js) && /\n\s+T\.issue\('paid', v\);/.test(js) && !/\.file\s*=(?!=)/.test(js),
      'the file number is never computed in the browser: #ckPassFile is written from the POST answer (j.file) or the verify answer (v.file); the only FNV left hashes GA\'s transaction id inside onVerified');
    check(/C\.LEAD_URL \+ '\?paid=' \+ encodeURIComponent\(/.test(js) && /'&city=' \+ (encodeURIComponent\()?C\.SLUG/.test(js), 'the paid landing polls LEAD_URL?paid=<session>&city=<slug> instead of trusting the address bar');
  }
  check(/var received = !!\(h\.via && h\.via !== 'l'\);/.test(js) && /landingState = s0\.kind === 'complete' \? 'resume_complete' : 'resume';/.test(js) && /partial\.replace\('\{left\}', 'One tap'\) : partial\.split/.test(js),
    'an own reload is a resume, in silence; the banner is for a received link, and counts the taps to the PLAN');
  check(/if \(inp && inp\.checked\) \{ editing = null; sync\(\); \}/.test(js), 'after "change", picking the same answer again folds the step (an already-checked radio fires no change event)');
  check(/postMessage\(\{ id: id, W: 1080/.test(js) && /pendingReq\[m\.id\]/.test(js) && /if \(inflight\) return inflight;/.test(js) && !/w\.onmessage = function/.test(js),
    'the worker\'s replies are correlated by request id on one listener, and a second Save or Share joins the encode in flight');
  check(/done\.focus\(\{ preventScroll: true \}\)/.test(js) && html.includes('<div class="sent" id="fDone" tabindex="-1">') && html.includes('<div class="sent paid" id="fPaid" tabindex="-1"'), 'after the send focus lands on the open file, not on <body>; the paid card too');
  // round 2 (the second review of 22/10): the page's own moves, read on the source
  check(html.includes('<article class="pass carta" id="pass" data-state="blank"') && /<article class="pass carta" id="pass"[^>]* role="region" aria-labelledby="ckTitle" tabindex="-1">/.test(html)
    && /function focusPass\(\) \{ try \{ pass\.focus\(\{ preventScroll: true \}\); \} catch \(e\) \{\} \}/.test(js) && !/focusDoor/.test(js) && (js.match(/T\.toPass\(1\)/g) || []).length >= 2,
    'ONE focus target for the page\'s moves (a plate\'s link in every state, "use it", the paid return, a refused till): the ticket itself, a region named by its title, tabindex -1, focused without a scroll');
  check(!/marginBottom|unhold|scrollend/.test(js), 'no room held under the door after the send (round 1\'s hold left a blank band and jumped on a slow scroll): the swap\'s shift is accepted');
  check(/var want = kbCap\(topOf\(f\) \+ f\.offsetHeight - innerHeight \+ 16\);/.test(js) && !/innerHeight - stripH\(\) - 16\)\);\n\s+if \(want > scrollY/.test(js), 'the doors land at the foot of the screen: the strip steps back over them, its height is not subtracted');
  check(/if \(T && \(T\.confirming\(\) \|\| T\.issued\(\) === 'paid'\)\) return T\.toPass\(1\);/.test(js) && /function payOff\(\)/.test(js) && /if \(kind === 'paid'\) payOff\(\);/.test(js) && /payOff\(\);\n\s+freeze\(/.test(js),
    'paid, or being confirmed: no [data-pay] opens the till (the reader goes to the ticket) and every pay button is hidden');
  check(/\.sent\.paid:not\(\.ok\) \.tick\{display:none\}/.test(css) && (js.match(/card\.classList\.add\('ok'\)/g) || []).length === 1 && /function onVerified[\s\S]*card\.classList\.add\('ok'\)[\s\S]*var at = \[0, 1500/.test(js),
    'the paid card\'s success tick waits for the server: hidden until onVerified marks the card .ok');
  check(/\['ckSteps', 'ckSuggest', 'ckPapersBox'\]\.forEach\(function \(id\) \{ try \{ \$\(id\)\.inert = true; \} catch \(e\) \{\} \}\);/.test(js) && !/root\.inert = true/.test(js) && /if \(root\.contains\(document\.activeElement\)\) focusPass\(\);/.test(js) && /if \(issued \|\| confirming\) return;/.test(js),
    'the frozen Check-in: only its questions, suggestion and papers go inert (the line stays readable), a focus inside moves onto the ticket first, and it freezes while a payment is confirmed too');
  check(/history\.replaceState\(null, '', location\.pathname\); \}/.test(js) && !/location\.pathname \+ '#contact'/.test(js) && /addEventListener\('load', function \(\) \{ if \(!moved\) land\(\); \}\)/.test(js) && /\['wheel', 'touchstart', 'keydown'\]/.test(js),
    'the paid return folds to the clean path (no #contact), and a legacy #contact return drops the fragment and lands again at load unless the reader moved (wheel, touch, key — never the scroll event)');
  check(/Object\.prototype\.hasOwnProperty\.call\(PLANS, id\)/.test(js) && !/PLANS\[plan\]/.test(js), '?paid=constructor is not a plan: PLANS is read through hasOwnProperty everywhere');
  check(!/visitor_tz/.test(js) && html.includes("gtag('set',{page_location:location.origin+location.pathname+location.search.replace(/([?&])session_id=[^&]*&?/,'$1').replace(/[?&]$/,'')});gtag('config'"),
    'the visitor\'s time zone never leaves the device, and GA never receives the address-bar fragment (the papers mask lives there) nor the Stripe session_id of a paid return');
  {
    const pl = (search) => search.replace(/([?&])session_id=[^&]*&?/, '$1').replace(/[?&]$/, '');
    check(pl('?paid=full-search&start=1&session_id=cs_test_123') === '?paid=full-search&start=1' && pl('?session_id=cs_1&paid=x') === '?paid=x' && pl('?paid=x') === '?paid=x' && pl('') === '',
      'page_location drops session_id wherever it sits in the query, and leaves every other parameter');
  }
  check(/timeZoneName: 'short'/.test(js) && /function tzLabel\(\)/.test(js) && /querySelectorAll\('\[data-tz\]'\)/.test(js) && /desk\.open\(\) === false/.test(js) && /querySelectorAll\('\[data-door-sub\]'\)/.test(js) && /C\.DOOR_SUB_LEAD/.test(js) && /if \(typeof deskSub === 'function'\) deskSub\(\);/.test(js),
    'the zone label follows the clock (CEST seven months a year) and "same-day reply" is swapped for the window ("no card · Monday from 09:00 CEST") on every [data-door-sub] — the hero, the door, the ticket — re-checked every minute (a page left open across 19:00 changes its promise)');
  check(!/col\.style\.top/.test(js) && !/classList\.toggle\('tall'/.test(js) && !/\.hero-right\.tall/.test(css) && !/position:sticky/.test(slice(css, '@media(min-width:920px){', '}\n')),
    'no sticky column: the right column (pass + door) is never shorter than the left, so sticky had nowhere to move, and where it could it hid the foot of the door');
  check(/\{ threshold: 1 \}\)\.observe\(\$\('ckPlan'\)\)/.test(js), 'the plan-seen event watches the plan line, not a pass taller than the phone');
  const consent = read('js/boom-consent.js');
  check(/function atWork\(\)/.test(consent) && /WAIT_MAX = 45000/.test(consent) && /late && atWork\(\) && Date\.now\(\) - armedAt < WAIT_MAX/.test(consent), 'the consent plate waits while the reader is at work in the hero (the unanswered Check-in or the ticket on the screen), 45 s at most');
  // the second review round (18/10): what the first round left half done
  check(/function plateBox\(\)/.test(consent) && /lift\(\);\s*var r = el\.getBoundingClientRect\(\)/.test(consent) && /meets\(ck, box\)/.test(consent) && /meets\(pass, box\)/.test(consent),
    'the plate waits only for what it would COVER: its own box, measured where show() would put it, against the Check-in and the ticket');
  // v1.4 (review 22/10): the hero's gold door under the plate holds it too — on a 390×664 phone «Accept» sat where the door was
  check(/var hc = document\.querySelector\('\.hero-cta'\);\s*if \(hc && meets\(hc, box\)\) return true;/.test(consent),
    'the plate also waits while the hero\'s door (.hero-cta) is in its band, never «Accept» where «Start with a free call» was');
  check(/if \(modalOpen\(\)\) \{ armedAt = Date\.now\(\); setTimeout\(lateGo, 400\); return; \}/.test(consent),
    'time spent in the till does not spend the plate\'s 45 s: the wait restarts when the dialog closes');
  check(/key === 'contact' \? \(v\('fPhone'\) && !v\('fEmail'\) \? \$\('fPhone'\) : \$\('fEmail'\)\)/.test(js) && /if \(mv && !mv\.getAttribute\('data-user'\)\)/.test(js) && /to = setTimeout\(function \(\) \{ workerDead = true; worker = null; fin\(null\); \}, 4000\)/.test(js),
    'the contact error focuses the field that was filled, a month the reader picked is theirs, a worker that never answers is retired');
  check(/\.mobile-menu:not\(\.active\)\{transition:none\}|\.mobile-menu,\.mobile-menu:not\(\.active\)\{transition:none\}/.test(css) && /\*,\*::before,\*::after\{color:#000!important;text-shadow:none!important;box-shadow:none!important\}/.test(css),
    'under reduced motion the closing menu holds still too; the print sheet forces black on white, gold and shadows included');
  check(/window\.BOOM_CHECKIN = CK;/.test(js) && /checkin=\(\[a-z-\]\+\)\\\.\(\[a-z-\]\+\)\\\.\(\[a-z-\]\+\)\\\.\(\[0-9a-f\]\{1,2\}\|-\)\(\?:\\\.\(\[lwcdp\]\)\)\?/.test(js) && /checkin: v\('fCheckin'\), dossier: v\('fDossier'\)/.test(js),
    'the JS exposes the Check-in, reads #checkin=stage.where.when.docs[.via] back, and posts the two hidden fields with the lead');
  check(/sessionStorage\.getItem\(key\)/.test(js) && !/localStorage\.setItem\(['"]boom:paid/.test(js) && /drawPass\.toString\(\)/.test(js) && /OffscreenCanvas/.test(js) && /document\.startViewTransition/.test(js),
    'the paid key lives in sessionStorage; the pass is drawn by one pure function, in a worker where the browser has one; the swap rides a view transition');
  check(/ov\.showModal\(\)/.test(js) && /typeof ov\.close === 'function' && ov\.open/.test(js) && /C\.CHECKOUT === true \? \$\('ov'\) : null/.test(js), 'the till is a native dialog opened with showModal and mounted only when the build set CHECKOUT true');
  check(!/#D4AF37/i.test(css) && !/[a-z]!["\s]/i.test(JSON.stringify([ams, mad, bcn, par, ber].map((c) => c.checkin))), 'no portal gold, no exclamation mark in the Check-in copy of any desk');
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
