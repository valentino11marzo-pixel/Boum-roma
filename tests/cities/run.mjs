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
//   - v1.3 (16/10, the redesign): the diagnostic no longer the hero, the pass
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

console.log('\n\x1b[1m▸ cities\x1b[0m  the city pages (v1.3): built from data on the BOOM system, refusing instead of lying');

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
  const draft = pages.find((p) => p.slug === 'barcelona');
  check(draft && JSON.parse(read('cities/barcelona.json')).live === false && /<meta name="robots" content="noindex">/.test(draft.html.slice(0, 4000)),
    'a draft desk (barcelona, live:false) says noindex in the first 4000 chars (tests/seo rule 8 reads exactly there)');
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
for (const sel of ['class="tech-bg"', 'class="filecard"', 'class="steps"', 'class="sibs plates"', 'class="flows"', 'class="enbref" id="enbref"', 'class="faq"', 'class="paybar"', 'class="checkin" id="checkin"', 'class="pass carta" id="pass"', 'class="facts" id="facts"', 'class="sheetfold"', 'class="skipck"']) {
  check(html.includes(sel), `the v1.3 grammar is on the page: ${sel}`);
}
check(!/class="fam"|class="rail"|class="scroll-progress"|class="mouse-glow"|class="machine"|class="tline"|class="truth"|class="band |class="refline"|class="serving"|footer-status-dot/.test(html),
  'the v1.2 chrome left: family strip, rail, progress bar, glow, route line, timeline, truth band, bottom band, status dot');
check(html.includes('<body data-consent-late>') && /data-consent-late/.test(read('js/boom-consent.js')) && /dialog\[open\]/.test(read('js/boom-consent.js')),
  'the body asks the consent plate to wait (first move + 600 ms, never over an open dialog) and boom-consent.js honours it');

// the Solari in the title, the prices as text
check(html.includes('<span id="flapCity" class="flap-city flap-scale" aria-hidden="true">AMSTERDAM</span><span class="sr">Amsterdam</span></h1>'),
  'the title carries the city as the board word, plain text in the markup (reads without JS); the board is decorative and the city is read as text (a Solari cell holds every glyph twice)');
check(html.includes(`f.style.minWidth='${(9 * CELL_EM).toFixed(2)}em'`) && html.includes("f.style.minHeight='1.27em'"), `the hero reserves 9 cells × ${CELL_EM}em before the board lands (no layout jump)`);
check(!/flap-prezzo/.test(html) && (html.match(/class="flap-tk /g) || []).length === 1 && (html.match(/id="flapCity"/g) || []).length === 1,
  'boards only where a fact changes: the city in the title, the price on the pass, OPEN/PAID — the plates carry their price as text');
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

// the word budget (STUDIO §11.8). Measured on 16/10 after the redesign:
// hero (title + lead) 20–22, Check-in + pass 164–187, facts 73–80 (five
// rows, two of them derived), door 85–88 without the month options, states
// ≤ 69, plates 42–46, checks 153–169, body 906–934. The ceilings sit just
// above: the page cannot fatten again without this suite saying so. The
// pass, the end states and the FAQ answers are read only once true or
// opened, so they are measured on their own and left out of the body; the
// month <select> is a list, not prose, and is left out too.
const wordsOf = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ')
  .split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length;
const slice = (h, a, b) => { const i = h.indexOf(a); const j = h.indexOf(b, i); return i < 0 || j < 0 ? '' : h.slice(i, j); };
const noSelect = (h) => h.replace(/<select[\s\S]*?<\/select>/g, '<select></select>');
const BUDGET = { hero: 30, checkin: 230, facts: 85, door: 110, state: 70, plate: 50, checks: 170, body: 950 };
const cfgOf = (h) => { const at = h.indexOf('window.BOOM_CITY = '); return JSON.parse(h.slice(at + 'window.BOOM_CITY = '.length, h.indexOf('</script>', at)).trim().replace(/;$/, '')); };
const stateBlocks = (m) => [...m.matchAll(/<div class="sent(?: paid)?" id="f(?:Done|Paid)" tabindex="-1"(?: data-wait="[^"]*")?>[\s\S]*?\n        <\/div>/g)].map((x) => wordsOf(x[0]));
for (const p of pages) {
  const m = slice(p.html, '<main id="main">', '</main>');
  const hero = wordsOf(slice(p.html, '<header class="hero"', '<!-- CHECK-IN -->'));
  const ckW = wordsOf(slice(p.html, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->')) + wordsOf(slice(p.html, '<!-- PASS -->', '<!-- /PASS -->'));
  const facts = wordsOf(slice(p.html, '<dl class="facts"', '</dl>'));
  const door = wordsOf(noSelect(slice(p.html, '<!-- THE DOOR -->', '<div class="sent" id="fDone"')));
  const states = stateBlocks(m);
  const plates = [...m.matchAll(/<article class="sib[\s\S]*?<\/article>/g)].map((x) => wordsOf(x[0]));
  const checksW = wordsOf(slice(m, '<div class="flows">', '</section>'));
  const faqA = [...m.matchAll(/<div class="a">([\s\S]*?)<\/div>/g)].reduce((n, x) => n + wordsOf(x[1]), 0);
  const selectW = wordsOf(m) - wordsOf(noSelect(m));
  const body = wordsOf(m) - faqA - states.reduce((a, b) => a + b, 0) - ckW - selectW;
  check(hero > 0 && hero <= BUDGET.hero, `${p.slug}: the hero is the title and one lead line, ${hero} words (≤ ${BUDGET.hero})`);
  check(ckW > 0 && ckW <= BUDGET.checkin, `${p.slug}: the Check-in and the pass in ${ckW} words (≤ ${BUDGET.checkin}), read one step at a time`);
  check(facts > 0 && facts <= BUDGET.facts, `${p.slug}: the five facts in ${facts} words (≤ ${BUDGET.facts})`);
  check(door > 0 && door <= BUDGET.door, `${p.slug}: the door reads in ${door} words (≤ ${BUDGET.door}, the month list apart)`);
  check(states.length >= 1 && states.every((w) => w > 0 && w <= BUDGET.state), `${p.slug}: each end state of the door ≤ ${BUDGET.state} words (${states.join(' · ')})`);
  check(plates.length === 3 && plates.every((w) => w <= BUDGET.plate), `${p.slug}: every plate ≤ ${BUDGET.plate} words (${plates.join(' · ')})`);
  check(checksW > 0 && checksW <= BUDGET.checks, `${p.slug}: the six checks in ${checksW} words (≤ ${BUDGET.checks})`);
  check(faqA > 0 && body <= BUDGET.body, `${p.slug}: the page without the folded FAQ answers, the end states, the pass and the month list is ${body} words (≤ ${BUDGET.body})`);
  // the paid card as the reader SEES it, not as it is shipped: the JS fills
  // the plan line and, for a payer who did not tick "Start now", swaps the
  // generic note for the wait note and the three steps for nextWait. The
  // static block alone measured 60 while the screen showed 96 (review 20/10).
  const cfg = cfgOf(p.html);
  if (cfg.CHECKOUT === true) {
    const paidBlock = (m.match(/<div class="sent paid" id="fPaid"[\s\S]*?\n        <\/div>/) || [''])[0];
    const waitTxt = ((paidBlock.match(/data-wait="([^"]*)"/) || [])[1] || '');
    const textW = wordsOf((paidBlock.match(/<p id="paidText">([\s\S]*?)<\/p>/) || [])[1] || '');
    const stepW = (pairs) => pairs.reduce((n, [a, b]) => n + wordsOf(a + ' ' + b), 0);
    const nextShown = [...paidBlock.matchAll(/<li><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><\/li>/g)].slice(0, 3).map((x) => [x[1], x[2]]);
    const planW = Math.max(...Object.values(cfg.PLANS).map((pl) => wordsOf(`${pl.label} · €${pl.eur} · ${pl.condition}`)));
    const now1 = wordsOf(paidBlock) + planW;
    const wait0 = wordsOf(paidBlock) + planW - textW - stepW(nextShown) + stepW(cfg.PAID_WAIT_NEXT || []) + wordsOf(waitTxt);
    check(paidBlock && textW > 0 && nextShown.length === 3 && now1 <= BUDGET.state && wait0 <= BUDGET.state,
      `${p.slug}: the paid card as the reader sees it ≤ ${BUDGET.state} words — ticked ${now1}, waiting ${wait0}`);
  }
}

// the hero order: title, lead, the diagnostic, the pass, the skip link, the facts, the door
// — the DOM order IS the phone's reading and focus order (the review of 17/10
// found the pass after the facts in the tab order); the JS moves it to the
// right column at ≥920
const hero = slice(html, '<header class="hero"', '</header>');
const at = (s) => hero.indexOf(s);
check(at('<h1') > -1 && at('<h1') < at('class="lead') && at('class="lead') < at('<!-- CHECK-IN -->') && at('<!-- /CHECK-IN -->') < at('<!-- PASS -->') && at('<!-- /PASS -->') < at('class="skipck"') && at('class="skipck"') < at('class="facts"') && at('class="facts"') < at('<!-- THE DOOR -->'),
  'the hero is one DOM in reading order: title, lead, Check-in, pass, skip link, facts, door — the phone\'s order is the focus order, the CSS reorders nothing');
check(/var where = deskMq\.matches \? 'right' : 'left';/.test(js) && /right\.insertBefore\(pass, right\.firstChild\)/.test(js) && /ck\.insertAdjacentElement\('afterend', pass\)/.test(js) && /deskMq\.addEventListener\('change', place\)/.test(js) && /focused\.focus\(\{ preventScroll: true \}\)/.test(js) && /pass\.classList\.remove\('in'\);\s*if \(where === 'right'\)/.test(js),
  'the JS moves the pass to the top of the right column at ≥920 and back after the Check-in below (a node move keeps its state, its focused control, and does not replay the entrance), on the media query\'s change too');
check((html.match(/<section class="checkin" id="checkin"/g) || []).length === 1 && (html.match(/<article class="pass carta" id="pass" data-state="blank"/g) || []).length === 1,
  'the Check-in once, the pass once, blank at parse (the JS sets the state)');

// the door
check(html.includes('<form id="cityForm" novalidate') && js.includes("postJson(C.LEAD_ENDPOINT || '/api/city-lead'") && /function postJson\(url, body, ms\)/.test(js) && /ctl\.abort\(\); \}, ms \|\| 20000\)/.test(js) && js.includes("postJson(C.CHECKOUT_ENDPOINT || '/api/service-checkout'") && html.includes('"LEAD_ENDPOINT": "/api/city-lead"'), 'the form posts to /api/city-lead (door and till through one POST that gives up after 20 s, so a hung request never locks the button)');
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
check(html.includes(`href="https://wa.me/${shared.contact.whatsapp}"`) && html.includes(`mailto:${shared.contact.email}`) && !/39X{4,}/.test(html), 'the WhatsApp and email of the consent line are the real BOOM contacts, never a placeholder');
check(/<input type="hidden" id="fCheckin" name="checkin" value="">/.test(html) && /<input type="hidden" id="fDossier" name="dossier" value="">/.test(html) && html.indexOf('id="fCheckin"') < html.indexOf('id="fCompany"'),
  'the door carries two hidden fields — the answers and the papers — before the honeypot');

// one label: every door reads door.label, every pay control till.label + the price
const L = esc(ams.door.label);
check(html.includes(`<a href="#contact" class="nav-link nav-door">${L}</a>`) && html.includes(`<a href="#contact" class="mobile-menu-cta">${L}</a>`) && html.includes(`<li><a href="#contact">${L}</a></li>`)
  && html.includes(`<button type="submit" class="paybtn" id="fGo"><span class="lk">✈</span><span class="tx"><b>${L}</b>`) && html.includes(`id="stripGo">${L}</a>`)
  && ams.pricing.plans.every((p) => html.includes(`data-service="${p.id}">${L} →</a>`)) && html.includes(`id="ckFile" data-service=""><span class="lk">✈</span><span class="tx"><b>${L}</b>`),
  `one label: nav, menu, footer, door button, strip, the three plates and the pass all read "${ams.door.label}"`);
const T = esc(ams.till.label);
check(ams.pricing.plans.every((p) => html.includes(`<button type="button" class="go2" data-pay="${p.id}">${T} · ${eur(p.price)}</button>`)) && html.includes(`<button type="button" class="till" id="ckStart" data-pay="">${T} · <span id="ckStartAmt"></span></button>`)
  && html.includes(`id="payOfferBtn" data-pay=""><span class="lk">🔒</span><span class="tx"><b>${T}</b>`) && html.includes(`id="sGo" data-label-now="${T}"`),
  `every pay control reads "${ams.till.label}" with its price: the plates' second link, the pass, the offer, the dialog (when "Start now" is ticked)`);
// The dialog's last button follows the tick, unticked by default: it books and
// says the work waits for the 14 days; ticked it starts. Never "start" unticked.
check(html.includes(`id="sGo" data-label-now="${T}" data-label-wait="${esc(ams.till.labelWait)}" data-sub-now="${esc(ams.checkoutCopy.btnSubNow)}" data-sub-wait="${esc(ams.checkoutCopy.btnSubWait)}"><span class="lk">🔒</span><span class="tx"><b>${esc(ams.till.labelWait)}</b><small>${esc(ams.checkoutCopy.btnSubWait)}</small>`)
  && !/start/i.test(ams.till.labelWait) && /14 days/.test(ams.checkoutCopy.btnSubWait),
  `the dialog's button reads "${ams.till.labelWait}" until "Start now" is ticked — it never says start while the payer has chosen to wait`);
check(!/€|\d/.test(ams.door.label + ams.door.sub + ams.door.stripSub) && !/€|\d/.test(ams.till.label), 'the labels themselves carry no number: the price is printed beside them');

// the facts: three authored, two derived, the Rome rating labelled Rome and once
const factsHtml = slice(html, '<dl class="facts"', '</dl>');
const rows = [...factsHtml.matchAll(/<dt>([^<]*)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => [decode(m[1]), m[2]]);
check(rows.length === 5 && rows.slice(0, 3).every((r, i) => r[0] === ams.facts[i].label && r[1] === esc(ams.facts[i].text)) && rows[3][0] === ams.factsDerived.answers && rows[4][0] === ams.factsDerived.company,
  'five facts: paid by · from abroad · if we find nothing (authored) · who answers · the company (derived)');
check(rows[3][1].startsWith(`${esc(ams.desk.person)}, ${esc(ams.factsDerived.answersLine)} · desk Mon–Fri ${ams.desk.hours.from} to ${ams.desk.hours.to} <span data-tz>${ams.desk.tzLabel}</span>`) && rows[3][1].includes('<span class="clock" id="deskClock" aria-live="off"></span>'),
  'who answers: the named person, the reply line, the desk DAYS and hours from the desk block (a line without the days read as open on a Saturday), the zone label the JS follows, the clock span');
check(daysLabel([1, 2, 3, 4, 5]) === 'Mon–Fri' && daysLabel([1, 3, 5]) === 'Mon, Wed, Fri' && daysLabel([6]) === 'Sat' && daysLabel([0, 1]) === 'Sun–Mon', 'daysLabel: a contiguous run as a range, otherwise the list');
{
  const noDays = clone(ams); noDays.factsDerived.deskLine = 'desk {from} to {to} {tz}';
  check(throws(() => render(noDays), /deskLine with \{days\}/) === true, 'a desk line without the days is refused');
}
const ratingTxt = `${shared.rome.rating} on Google in Rome, ${shared.rome.reviews} reviews`;
const ratingOut = shared.rome.profileUrl ? `<a href="${esc(shared.rome.profileUrl)}" target="_blank" rel="noopener">${ratingTxt}</a>` : ratingTxt;
check(/<div data-proof="rome"><dt>/.test(factsHtml) && rows[4][1].includes(`${esc(shared.entity.legalName)} · P.IVA ${shared.entity.vat} · ${ratingOut}`) && (html.match(/on Google/g) || []).length === 1,
  'the company: legal name, P.IVA, the Rome rating labelled "on Google in Rome" — once on the page, never as the desk\'s own');
check(ams.facts[2].text === shared.refund.rule, 'on a sell desk the "if we find nothing" fact IS the refund rule, word for word');
check(html.includes(`<p class="who"><b>${esc(ams.desk.person)}</b> · ${esc(ams.desk.role)} · desk Mon–Fri ${ams.desk.hours.from} to ${ams.desk.hours.to} <span data-tz>${ams.desk.tzLabel}</span> · <a href="https://wa.me/${shared.contact.whatsapp}"`),
  'the person line under the three steps reads from the same desk block, days included');

// the refund rule beside every €500 on a sell desk
const rule = esc(shared.refund.rule);
const blocks = {
  door: slice(html, '<!-- THE DOOR -->', '<!-- /THE DOOR -->'),
  plates: slice(html, '<section id="services"', '</section>'),
  pass: slice(html, '<!-- PASS -->', '<!-- /PASS -->'),
  sheet: slice(html, '<dialog class="sheet" id="ov"', '</dialog>'),
  fees: slice(html, '<dt>Fees</dt>', '</dd>')
};
check(Object.values(blocks).every((b) => b && b.includes(rule)), 'the refund rule travels with the price in every block that shows €500: the door (under the chips), the plates (fee note), the pass, the dialog, the fees row');
check(html.includes(`<p class="pricenote refund">${rule}</p>`) && html.includes(`<p class="refund" id="ckRefund" hidden>${rule}</p>`) && html.includes(`<p class="refund" id="payOfferRefund">${rule}</p>`),
  'the rule under the chips, on the pass (shown only on Full Search), and in the offer (hidden by the JS under another plan)');

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
const org = graph.find((n) => n['@type'] === 'Organization') || {};
const wp = graph.find((n) => n['@type'] === 'WebPage') || {};
const svc = graph.find((n) => n['@type'] === 'Service') || {};
const faqLd = graph.find((n) => n['@type'] === 'FAQPage') || {};
check(org['@id'] === `${shared.siteUrl}/#organization` && org.url === shared.siteUrl && org.legalName === e.legalName, 'Organization @id/url derive from siteUrl');
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
const plateIds = [...html.matchAll(/<article class="sib[^"]*" id="plan-([^"]+)">/g)].map((m) => m[1]);
const offers = (svc.offers || []).map((o) => [o.name, o.price]);
check(JSON.stringify(offers) === JSON.stringify(ams.pricing.plans.map((p) => [p.label, String(p.price)])) && JSON.stringify(plateIds) === JSON.stringify(ams.pricing.plans.map((p) => p.id)),
  `every Offer is a plate on the page at the price it prints: ${offers.map((o) => o.join(' €')).join(' · ')}`);
const chipPrices = chips.filter((m) => m[2] !== 'unsure').map((m) => [m[2], m[3], decode(m[4])]);
check(chipPrices.every(([id, label, small]) => ams.pricing.plans.some((pl) => pl.id === id && pl.label === label && small === `${eur(pl.price)} · ${pl.condition}`))
  && chips.some((m) => m[2] === 'unsure' && m[3] === esc(ams.form.service.unsure) && m[4] === esc(ams.form.service.unsureSub)),
  'the chips carry each plan\'s price AND its own condition (one price, one place) + "not sure yet · advise me"');
check(ams.pricing.plans.every((p) => html.includes(`<ul class="inc">${p.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)), 'what each fee buys is a ✓ list on its plate, straight from includes[]');
check(html.indexOf('id="enbref"') > html.indexOf('id="faq"') && html.includes('<details class="sheetfold">'), 'the fact sheet (machine content) sits AFTER the FAQ, folded for humans, whole in the DOM for the machines');
const feesRow = ams.pricing.plans.map((p) => `<b>${p.label} ${eur(p.price)}</b>${p.unit ? ' ' + esc(p.unit) : ''} (${esc(p.conditionLong)})`).join(' · ');
check(blocks.fees.includes(feesRow), 'the fact sheet\'s fees row is DERIVED from the plans with each plan\'s long condition');
check(svc.areaServed && svc.areaServed.name === 'Amsterdam' && svc.audience && svc.audience.audienceType && svc.provider['@id'] === org['@id'], 'the Service says where, for whom and by whom');
check((svc.offers || []).every((o) => o.availability === 'https://schema.org/InStock' && o.priceSpecification && o.priceSpecification.valueAddedTaxIncluded === true
  && o.priceSpecification.price === o.price && o.url === `${shared.siteUrl}/amsterdam#plan-${ams.pricing.plans.find((p) => p.label === o.name).id}` && o.seller['@id'] === org['@id']),
  'every Offer of a search desk is InStock, VAT included in its priceSpecification, and points at its plate');
check(crumbs['@id'] === `${shared.siteUrl}/amsterdam#breadcrumb` && wp.breadcrumb && wp.breadcrumb['@id'] === crumbs['@id'], 'the WebPage references the BreadcrumbList by id');
{
  const liveCities = fs.readdirSync(path.join(R, 'cities')).filter((f) => /^[a-z-]+\.json$/.test(f) && !f.startsWith('_')).sort()
    .map((f) => JSON.parse(read('cities/' + f))).filter((c) => c.live === true).map((c) => c.city);
  check(JSON.stringify(org.areaServed) === JSON.stringify(['Rome', ...liveCities]) && liveCities.includes('Amsterdam') && liveCities.includes('Madrid') && !liveCities.includes('Barcelona'),
    `Organization.areaServed is derived: Rome and the LIVE desks only (${['Rome', ...liveCities].join(', ')})`);
}
{
  const liveAms = clone(ams); liveAms.live = true;
  const sh = clone(shared); sh.rome.profileUrl = 'https://maps.google.com/?cid=1';
  const g = JSON.parse(render(liveAms, sh).html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)[1].replace(/<\/?script[^>]*>/g, ''))['@graph'];
  check(JSON.stringify(g.find((n) => n['@type'] === 'Organization').areaServed) === JSON.stringify(['Rome', 'Amsterdam']), 'once live, the desk\'s city joins areaServed by itself');
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
  const wlHtml = render(bcn).html;
  check(wlHtml.includes('"CHECKOUT": false') && !wlHtml.includes('id="ov"') && wlHtml.includes('data-plan-price="full-search">€500</span>'), 'a waitlist city carries its list prices like every desk — and no till');
  const wlTill = clone(bcn); wlTill.checkout = true;
  check(throws(() => render(wlTill), /a waitlist city cannot open a checkout/) === true, 'a waitlist city with checkout:true is refused: shown is not charged');
  const noCopy = clone(ams); delete noCopy.checkoutCopy;
  check(throws(() => render(noCopy), /needs "checkoutCopy"/) === true, 'checkout:true without the sheet\'s copy is refused');
  const noTill = clone(ams); delete noTill.till;
  check(throws(() => render(noTill), /needs till\.label/) === true, 'checkout:true without till.label is refused (every pay control reads it)');
  const pricedTill = clone(ams); pricedTill.till.label = 'Pay €500';
  check(throws(() => render(pricedTill), /needs till\.label/) === true, 'a till label carrying a number is refused: the price is printed beside the label, from the plan');
  const pricedDoor = clone(ams); pricedDoor.door.sub = 'free · 1 reply';
  check(throws(() => render(pricedDoor), /never carry a price/) === true, 'the door label and its sub never carry a number');
  const tillOnWl = clone(bcn); tillOnWl.till = { label: 'Pay and start' };
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
    ['a nextWait with two steps', (c) => { c.checkoutCopy.paid.nextWait.pop(); }, /paid\.nextWait/]
  ]) {
    const c = clone(ams); mut(c);
    check(throws(() => render(c), re) === true, `refused: ${name}`);
  }
  const badRule = clone(shared); badRule.refund.rule = 'No refunds.';
  check(throws(() => render(ams, badRule), /refund\.rule is the one sentence of the policy/) === true, 'the shared refund rule must be the policy sentence');
  const offNoTill = clone(ams); offNoTill.checkout = false; delete offNoTill.till;
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
  const wlNoWhen = clone(bcn); wlNoWhen.pricing.plans[0].condition = 'flat · incl. VAT';
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
  check(render(accent).html.includes('>ZURICH</span>'), 'the board word is letters only: the drum has no accents');
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
    ['four facts', (c) => { c.facts.push({ key: 'extra', label: 'More', text: 'x' }); }, /facts are exactly three authored rows/],
    ['fact too long', (c) => { c.facts[0].text = Array(22).fill('word').join(' '); }, /facts are exactly three authored rows/],
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
  const wlLead = clone(bcn); wlLead.hero.lead = 'Found by someone on your side.';
  check(throws(() => render(wlLead), /a waitlist desk's lead opens with "Opening with"/) === true, 'a waitlist desk whose lead does not open with "Opening with" is refused: the first line says what exists today');
  const wlNote = clone(bcn); wlNote.form.service.priceNote = 'List prices, charged only when the desk opens.';
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
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
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
function call(body, ip) {
  written = [];
  let code = 0, payload = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
  return handler({ method: 'POST', headers: { 'x-forwarded-for': ip || `10.2.0.${++ipSeq}` }, body, socket: {} }, res)
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
  check(l && /^AMSTERDAM — tenant-side search · Full Search · €1,500 – €2,000\/month · move-in February 2027 · Couple, relocating with employer · De Pijp, Oud-West\. Start date is 1 Feb\.$/.test(l.message),
    'the summary opens with the city and the service, then the numbers — the month select\'s "2027-02" read as "February 2027" — then their words', l && l.message);
  check(l && l.moveIn === 'February 2027' && l.raw.moveIn === '2027-02', 'the lead carries the month label; the raw value stays on raw{}');
  check(l && l.budgetBand === '€1,500 – €2,000' && l.budget === 2000, 'the budget band stays verbatim; the number is the band\'s ceiling');
  check(l && l.language === 'en' && l.zone === 'De Pijp, Oud-West' && l.city && l.city.serviceLabel === 'Full Search', 'English by default, areas as zone, the service by its label');
  check(r.notif && /^🇳🇱 AMSTERDAM · Anna Keller · Full Search · €1,500 – €2,000 · February 2027$/.test(r.notif.summary) && r.notif.priority === 'high', 'the operator is pinged with the flag, the name, the service, the band and the month', r.notif && r.notif.summary);
  const reply = cityReplyText(l);
  check(/^Hi Anna, Valentino here from BOOM/.test(reply) && reply.includes('move to Amsterdam') && reply.endsWith(CITY_MARKETS.amsterdam.url) && !reply.includes('/apartments') && !/Roma/.test(reply),
    'the pre-written WhatsApp reply is English, about Amsterdam, links /amsterdam — never the Rome catalogue');
  check(cityLabel(l) === '🇳🇱 Amsterdam', 'the Telegram card label');
}
{
  check(moveInLabel('2027-02') === 'February 2027' && moveInLabel('2026-12') === 'December 2026' && moveInLabel('as soon as possible') === 'as soon as possible' && moveInLabel('2027-13') === '2027-13' && moveInLabel(null) === null,
    'moveInLabel: YYYY-MM → "February 2027" from a fixed table; free text and a bad month stay verbatim');
  const r = await call({ city: 'Amsterdam', name: 'Jean', phone: '+33 6 12 34 56 78', service: 'concierge', budget: 'Under €1,500', moveIn: 'not sure, spring' });
  check(r.code === 200 && r.lead && /^AMSTERDAM — tenant-side search · service to decide · Under €1,500\/month · move-in not sure, spring\.$/.test(r.lead.message),
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

// ── 10 · the sisters: Madrid (search) and Barcelona, Paris, Berlin (waitlist) ──
const pageOf = (slug) => (pages.find((p) => p.slug === slug) || {}).html || '';
const visibleOf = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
const ldOf = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
check(mad.mode === 'search' && bcn.mode === 'waitlist' && par.mode === 'waitlist' && ber.mode === 'waitlist'
  && ams.live === true && mad.live === true && [bcn, par, ber].every((c) => c.live === false),
  'madrid is a search desk, barcelona, paris and berlin waitlist desks; amsterdam and madrid live (20/10), the three waitlist desks drafts until their partners exist');
for (const [c, word, cells] of [[mad, 'MADRID', 6], [bcn, 'BARCELONA', 9], [par, 'PARIS', 5], [ber, 'BERLIN', 6]]) {
  const h = pageOf(c.slug);
  const v = visibleOf(h);
  const robotsOk = c.live === true
    ? !/noindex/.test(h.slice(0, 4000)) && /content="index, follow/.test(h.slice(0, 4000))
    : /<meta name="robots" content="noindex">/.test(h.slice(0, 4000));
  check(h.includes(GENERATED_MARK) && robotsOk && h.includes(`<link rel="canonical" href="${shared.siteUrl}/${c.slug}">`),
    `${c.slug}: a generated page — ${c.live === true ? 'live, index, follow' : 'draft, noindex'}, canonical from siteUrl`);
  check(h.includes(`<span id="flapCity" class="flap-city flap-scale" aria-hidden="true">${word}</span><span class="sr">${c.city}</span></h1>`) && h.includes(`f.style.minWidth='${(cells * CELL_EM).toFixed(2)}em'`), `${c.slug}: the board spells ${word} and the hero reserves ${cells} cells`);
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
  check(fr.length === 5 && fr[3] === c.factsDerived.answers && fr[4] === c.factsDerived.company && /on Google in Rome/.test(h) && (h.match(/on Google/g) || []).length === 1, `${c.slug}: five facts, the Rome rating once and labelled Rome`);
}
const GRID = ['€500', '€199', '€149'];
for (const c of [ams, mad, bcn, par, ber]) {
  const h = pageOf(c.slug);
  const asText = [...h.matchAll(/<span class="num" data-plan-price="[^"]+">([^<]+)<\/span>/g)].map((m) => m[1]);
  check(JSON.stringify(asText) === JSON.stringify(GRID), `${c.slug}: the three prices as text on the plates — the brief's grid`);
  const chipsP = [...h.matchAll(/<label class="chip"><input type="radio" name="service" value="([^"]+)"><span><b>[^<]*<\/b><small>([^<]+)<\/small>/g)].map((m) => decode(m[2]));
  check(JSON.stringify(chipsP) === JSON.stringify(c.pricing.plans.map((p) => `${eur(p.price)} · ${p.condition}`)), `${c.slug}: the chips carry the price with each plan's own condition`);
  const fees = slice(h, '<dt>Fees</dt>', '</dd>');
  check(fees.includes(c.pricing.plans.map((p) => `<b>${p.label} ${eur(p.price)}</b>${p.unit ? ' ' + esc(p.unit) : ''} (${esc(p.conditionLong)})`).join(' · ')), `${c.slug}: the fact sheet's fees row is derived from the plans, long conditions included`);
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
  const h = pageOf('madrid'); const v = visibleOf(h);
  const svcM = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
  check((svcM.offers || []).map((o) => o.price).join() === '500,199,149' && svcM.areaServed.name === 'Madrid' && svcM.offers.every((o) => o.availability === 'https://schema.org/InStock'), 'madrid: the Service carries its three Offers InStock, areaServed Madrid');
  check(v.includes('You hire us; we do not act for the landlord.') && mad.facts[0].text === 'You hire us; we do not act for the landlord.', 'madrid: the brief\'s must-state sentence, verbatim, as the "paid by" fact');
  check(/Ley 12\/2023/.test(v) && /fianza/.test(v) && /padrón/.test(v) && /no regional cap/i.test(v), 'madrid: the §4 facts are on the page');
}
for (const c of [ams, mad]) {
  const h = pageOf(c.slug);
  check(c.checkout === true && h.includes('"CHECKOUT": true') && h.includes('"CHECKOUT_ENDPOINT": "/api/service-checkout"') && h.includes(`"FEATURED": "${c.pricing.plans.find((p) => p.featured).id}"`), `${c.slug}: the config opens the till and names the featured plan`);
  const rows = [...h.matchAll(/<label class="payrow"><input type="radio" name="payplan" value="([^"]+)" data-eur="(\d+)" data-label="([^"]+)">/g)].map((m) => [m[1], m[2], m[3]]);
  check(/<dialog class="sheet" id="ov"/.test(h) && !/class="ov" id="ov" role="dialog"/.test(h) && JSON.stringify(rows) === JSON.stringify(c.pricing.plans.map((p) => [p.id, String(p.price), p.label])),
    `${c.slug}: the till is ONE native <dialog>, the three plans as rows at the plate prices`);
  check(h.includes('id="payOffer" hidden') && h.includes('id="fPaid"') && h.includes('data-word="PAID"') && h.includes('data-word="OPEN"') && h.includes(`data-sending="${esc(c.form.sending)}"`), `${c.slug}: the door's end states — OPEN with the offer to pay, PAID — and the in-flight button text`);
  check(h.includes(`<b id="openWhen" data-default="${esc(c.form.sentWhenDefault)}">${esc(c.form.sentWhenDefault)}</b>`), `${c.slug}: the reply window is a computed slot with "${c.form.sentWhenDefault}" as the no-JS default`);
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
  [bcn, 'Launching with a registered local partner.', [/AICAT/, /índice de referencia/, /fianza/, /padrón/], 'AICAT, the índice de referencia, fianza and padrón'],
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
  check(facts.every((re) => re.test(v)), `${c.slug}: ${factsLabel} are on the page`);
  check(h.includes('<p class="condlong" id="ckCondLong"></p>') && !/id="ckRefund"/.test(h) && !/id="ckStart"/.test(h) && h.includes('id="ckFile" data-service=""'), `${c.slug}: the pass prints the plan's long condition instead of a refund rule, and has one door`);
}
check(/sign/i.test(ber.pricing.plans[0].condition) && /once you sign a lease/.test(ber.pricing.plans[0].conditionLong) && /once you sign/.test(ber.facts[0].text) && /once you sign/.test(ber.facts[2].text),
  'berlin: Full Search is due only once you sign — the WoVermRG rule — on the plan\'s two conditions and on two of the three facts');
check(/ List prices\. Full Search due only once you sign a lease; the other plans charged only when the desk opens\.$/.test(checkinAnswer(ber)) && / List prices, charged only when the desk opens\.$/.test(checkinAnswer(bcn)) && !/List prices/.test(checkinAnswer(ams)),
  'the derived FAQ answer carries each desk\'s truth: Berlin per plan, Barcelona at opening, Amsterdam nothing of the kind');
{
  const stripe = clone(bcn); stripe.bref.rows[0].ddHtml = '<a href="https://buy.stripe.com/x">pay</a>';
  check(throws(() => render(stripe), /no Stripe reference/) === true, 'a waitlist city with a Stripe link is refused');
  const noPriceW = clone(bcn); delete noPriceW.pricing.plans[0].price;
  check(throws(() => render(noPriceW), /needs a positive price/) === true, 'a waitlist plan without its list price is refused like any other');
  const flipped = clone(bcn); flipped.mode = 'search'; flipped.hero.lead = 'Found by someone on your side.'; flipped.pricing.plans.forEach((p) => { p.condition = 'flat · incl. VAT'; p.conditionLong = 'VAT included.'; }); delete flipped.form.service.priceNote;
  const fh = render(flipped).html;
  check(fh.includes('"CHECKOUT": false') && !/<dialog/.test(fh) && fh.includes('data-plan-price="full-search">€500</span>'), 'flipping Barcelona to "search" keeps its prices and opens no till by itself');
}
// the family: derived, and a live page never links a draft
{
  const A = { slug: 'amsterdam', city: 'Amsterdam', live: true }, B = { slug: 'barcelona', city: 'Barcelona', live: false }, M = { slug: 'madrid', city: 'Madrid', live: true };
  const all = [M, B, A];
  const hrefs = (c) => familyFor(c, all, shared).map((f) => f.href);
  check(JSON.stringify(hrefs(A)) === JSON.stringify(['/madrid', '/']), 'a LIVE page links only its live sisters (alphabetical), then BOOM Rome');
  check(JSON.stringify(hrefs(B)) === JSON.stringify(['/amsterdam', '/madrid', '/']), 'a DRAFT page links every sister: the review needs to see the suite');
  check(!hrefs(M).includes('/madrid') && !hrefs(A).includes('/amsterdam'), 'a page is never in its own list');
  const col = slice(pageOf('barcelona'), `<h4 class="footer-links-title">${esc(shared.desksLabel)}</h4>`, '</ul>');
  check(/\/amsterdam">Amsterdam[\s\S]*\/berlin">Berlin[\s\S]*\/madrid">Madrid[\s\S]*\/paris">Paris[\s\S]*href="\/">BOOM Rome/.test(col) && !/\/barcelona"/.test(col), 'barcelona (draft): the footer column reads Amsterdam · Berlin · Madrid · Paris · BOOM Rome');
}
// the door, per desk: a waitlist lead is a FILE OPENED, said so everywhere the operator reads
{
  const m = await call({ ...ANNA, city: 'madrid', areas: 'Chamberí' }, '10.3.0.1');
  check(m.code === 200 && m.lead.market === 'madrid' && m.lead.intent === 'city_search' && /^MADRID — tenant-side search · Full Search/.test(m.lead.message) && m.notif.summary.startsWith('🇪🇸 MADRID · Anna Keller'), 'madrid: a search lead', m.lead && m.lead.message);
  check(cityMode(m.lead) === 'search' && cityReplyText(m.lead).endsWith(CITY_MARKETS.madrid.url) && cityLabel(m.lead) === '🇪🇸 Madrid', 'madrid: the reply links /madrid');
  const b = await call({ ...ANNA, city: 'barcelona', areas: 'Gràcia' }, '10.3.0.2');
  check(b.code === 200 && b.lead.intent === 'city_waitlist' && /^BARCELONA — waitlist \(desk opening with a registered partner\) · Full Search/.test(b.lead.message) && b.notif.summary.startsWith('🇪🇸 BARCELONA · waitlist · Anna Keller'),
    'barcelona: a waitlist lead, said as waitlist on the summary and the card', b.lead && b.lead.message);
  check(cityMode(b.lead) === 'waitlist' && cityReplyText(b.lead).includes('opening with a registered local partner') && !cityReplyText(b.lead).includes("how we'd run it"), 'barcelona: the reply says the desk is opening and promises no search');
  const p = await call({ ...ANNA, city: 'paris', areas: 'Le Marais' }, '10.3.0.3');
  check(p.code === 200 && p.lead.intent === 'city_waitlist' && cityLabel(p.lead) === '🇫🇷 Paris' && cityReplyText(p.lead).includes('opening with a licensed partner'), 'paris: a waitlist lead with the French flag and the licensed partner');
  const g = await call({ ...ANNA, city: 'berlin', areas: 'Prenzlauer Berg' }, '10.3.0.4');
  check(g.code === 200 && g.lead.intent === 'city_waitlist' && cityLabel(g.lead) === '🇩🇪 Berlin' && cityReplyText(g.lead).includes('opening with a licensed partner'), 'berlin: a waitlist lead with the German flag and the licensed partner');
  for (const pg of pages) check(CITY_MARKETS[pg.slug] && CITY_MARKETS[pg.slug].mode === pg.mode, `${pg.slug}: the server registry agrees with the page on the desk's mode (${pg.mode})`);
  const paidLead = { market: 'amsterdam', paid: true, name: 'Anna Keller', city: { serviceLabel: 'Full Search' } };
  const rpaid = cityReplyText(paidLead);
  check(isCityMarket(paidLead) && /^Hi Anna, Valentino here from BOOM 👋 Payment received for Full Search in Amsterdam — thank you\./.test(rpaid) && rpaid.endsWith(CITY_MARKETS.amsterdam.url), 'a paid city order gets the "payment received" reply');
}

// ── 11 · THE CHECK-IN as the hero (v1.3): the live ticket, the pass, the rules ──
{
  const ck = slice(html, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->');
  const pass = slice(html, '<!-- PASS -->', '<!-- /PASS -->');
  check(JSON.stringify(STEP_IDS) === JSON.stringify(['stage', 'where', 'when']) && JSON.stringify(ams.checkin.steps.map((s) => s.id)) === JSON.stringify(STEP_IDS),
    'the three steps are stage → where → when: every path resolves by the second tap (STUDIO §3.2)');
  check(resolvesAt(ams.checkin, 'zero') === 1 && resolvesAt(ams.checkin, 'found') === 1 && resolvesAt(ams.checkin, 'shortlist') === 2, 'haven\'t started and found resolve on the first tap, a shortlist on the second');
  check(/^One more answer decides: Attended Viewing if .*abroad, Application Pack if .*Amsterdam\.$/.test(pendingText(ams, 'shortlist')), `the pending sentence is derived from the rules ("${pendingText(ams, 'shortlist')}")`);
  for (const [i, s] of ams.checkin.steps.entries()) {
    const fsHtml = (ck.match(new RegExp(`<fieldset class="ck-step" data-step="${s.id}"( hidden)?>[\\s\\S]*?</fieldset>`)) || [''])[0];
    const opts = [...fsHtml.matchAll(/<label class="ck-opt"><input type="radio" name="ck-(\w+)" value="([a-z]+)" data-code="([^"]+)"><span><b>([^<]*)<\/b><small>([^<]*)<\/small><\/span><\/label>/g)].map((m) => [m[1], m[2], m[3], decode(m[4]), m[5]]);
    check(fsHtml && JSON.stringify(opts) === JSON.stringify(s.options.map((o) => [s.id, o.id, o.code, o.t, o.code])) && / hidden>/.test(fsHtml.slice(0, 60)) === (i > 0) && fsHtml.includes(`<button type="button" class="ck-change" data-change="${s.id}" hidden>${esc(ams.checkin.result.change)}</button>`),
      `step "${s.id}": ${opts.length} radio chips with their pass code, ${i ? 'hidden until the step before is answered' : 'shown first'}, a "change" button`);
  }
  check(ck.includes(`<span class="ck-num" id="ckNum">${esc(ams.checkin.num.replace('{n}', '1'))}</span>`) && ck.includes('<p class="ck-landing" id="ckLanding" hidden></p>') && !/<h3/.test(ck), 'the Check-in carries its counter and the landing banner — no title of its own (the H1 and the lead introduce it)');
  // the pass
  const docs = [...pass.matchAll(/<label class="ck-doc"><input type="checkbox" name="ck-doc" value="([a-z]+)"><span>([^<]*)<\/span><\/label>/g)].map((m) => [m[1], decode(m[2])]);
  check(docs.length === DOSSIER_N && JSON.stringify(docs) === JSON.stringify(ams.checkin.dossier.items.map((i) => [i.id, i.t])) && /<fieldset class="papers" id="ckPapers" hidden>/.test(pass), `the ${DOSSIER_N} papers a Dutch landlord asks for, on the pass, hidden until the third tap`);
  check(pass.includes(`<span class="pto">${ams.iata}</span>`) && pass.includes(`id="ckBoard" data-word="${ams.city}"`) && pass.includes(`<p class="pblank" id="ckBlank">${esc(ams.checkin.landing.blank)}</p>`)
    && pass.includes(`<div class="ppend" id="ckPend" hidden><span class="peye">${esc(ams.checkin.pending.eyebrow)}</span>`) && pass.includes('<div class="pplan" id="ckPlanBox" hidden>'),
    'the pass: the route lands on the IATA code, the city is a board word, the blank line, the pending box and the plan box (the JS shows one)');
  check(/<span class="flap-tk flap-scale" id="ckPrice" aria-hidden="true"><\/span><span class="sr" id="ckPriceSr"><\/span><small id="ckCond"><\/small>/.test(pass) && pass.includes('<p class="note" id="ckNote" hidden></p>'),
    'the price on its own board (decorative) with the amount as text and the plan\'s condition beside it; the note hidden until the third tap');
  check(slice(html, '<!-- CHECK-IN -->', '<!-- /CHECK-IN -->').includes('<span class="sr" id="ckLive" role="status" aria-live="polite"></span>') && !pass.includes('id="ckLive"') && !/aria-live/.test(slice(pass, 'id="ckPlanBox"', 'id="ckReady"')) && pass.includes('<p class="ready" id="ckReady" role="status"></p>') && (pass.match(/aria-live|role="status"/g) || []).length === 3,
    'one small live region for the plan, in the Check-in (a region inside the phone\'s display:none pass misses its first announcement), and a status on the papers line — never the whole plan box with its sixteen controls');
  check(pass.includes('id="ckName" maxlength="24"') && pass.includes('id="ckOrigin" maxlength="12"') && pass.includes(`<b id="ckPassenger">${esc(ams.checkin.pass.guest)}</b>`) && pass.includes(`<span class="pside">${esc(ams.checkin.pass.side)}</span>`) && pass.includes(`<span>${esc(ams.checkin.pass.foot)}</span>`),
    'passenger and origin capped, "A tenant" until a name is typed, the side and the foot on the lamina');
  check(pass.includes(`<div class="pshare"><span>${esc(ams.checkin.share.lead)}</span><a id="ckWa" href="#" target="_blank" rel="noopener">${esc(ams.checkin.share.whatsapp)}</a><button type="button" id="ckCopy">${esc(ams.checkin.share.copy)}</button>`)
    && pass.includes(`id="ckSave">${esc(ams.checkin.pass.save)}</button>`) && pass.includes(`id="ckShare">${esc(ams.checkin.pass.shareBtn)}</button>`), 'the share row, Save image and Share on the pass');
  check(!/data-word="OPEN"|data-word="PAID"/.test(pass) && !/flap-prezzo|barcode|Gate|Seat/.test(pass), 'the pass carries no v1.2 chrome (gate, seat, barcode) and no board that is not its own');
  check(/<noscript><style>[^<]*\.checkin,#pass,\.skipck,\.paybar\{display:none!important\}/.test(html) && /\.planline \.chips\{display:block/.test(html.slice(html.indexOf('<noscript><style>'))),
    'without JS the Check-in, the pass, the skip link and the strip are hidden, and the chips are open');
  const cfgAt = html.indexOf('window.BOOM_CITY = ');
  const cfg = JSON.parse(html.slice(cfgAt + 'window.BOOM_CITY = '.length, html.indexOf('</script>', cfgAt)).trim().replace(/;$/, ''));
  check(cfg.IATA === 'AMS' && cfg.PAGE_URL === `${shared.siteUrl}/amsterdam` && JSON.stringify(cfg.CHECKIN) === JSON.stringify(ams.checkin) && JSON.stringify(Object.keys(cfg.PENDING)) === '["shortlist"]' && cfg.PENDING.shortlist === pendingText(ams, 'shortlist'),
    'the config carries the IATA code, the share URL, the Check-in data VERBATIM and the pending sentence for the one stage that waits');
  // the derived FAQ and the audiences
  const ans = checkinAnswer(ams);
  const q = ams.faq.items.find((x) => x.checkin).q;
  check(q === 'Which service is mine?' && faqVisible.some((f) => f.q === q && f.a === ans) && faqItems.some((f) => f.q === q && f.a === ans), `the FAQ "${q}" is DERIVED from the rules — visible and in the FAQPage`);
  check(/^Full Search \(€500\) if you haven't started\. Application Pack \(€199\) if you've found one and need to apply, or you have a shortlist and you're already in Amsterdam\. Attended Viewing \(€149 per viewing\) if you have a shortlist and you're still abroad\. Not sure: open a file, we advise\.$/.test(ans),
    `one sentence per plan, from the phrases of the options, then the free door ("${ans.slice(0, 50)}…")`);
  check(faqOf(ams).find((f) => f.q === q).a === ans && ams.faq.items.find((x) => x.checkin).a === undefined, 'the data carries only the question; faqOf resolves the answer');
  const aud = Object.fromEntries((svc.offers || []).map((o) => [o.name, o.audience && o.audience.audienceType]));
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
    ['a fixable document not on the list', (c) => { c.checkin.dossier.fixable = ['visa']; }, /fixable must name documents from the list/],
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
    ['a pass without its six fields', (c) => { delete c.checkin.pass.fields.papers; }, /its six fields/],
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
    check(ps && (h.match(/<section class="checkin" id="checkin"/g) || []).length === 1 && (ps.match(/<label class="ck-doc">/g) || []).length === DOSSIER_N && ps.includes(`<span class="pto">${c.iata}</span>`) && h.includes(`"IATA": "${c.iata}"`),
      `${c.slug}: the Check-in once in the hero, ${DOSSIER_N} papers on the pass, bound for ${c.iata}`);
    check(vis.some((f) => f.q === c.faq.items.find((x) => x.checkin).q && f.a === a) && a.split(/\s+/).length <= 72, `${c.slug}: the derived FAQ answer is on the page (${a.split(/\s+/).length} words — Berlin's per-plan tail is the longest)`);
    const svcC = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
    check((svcC.offers || []).every((o) => o.audience && o.audience.audienceType === offerAudience(c, c.pricing.plans.find((p) => p.label === o.name).id)), `${c.slug}: every Offer carries the audience its rules derive`);
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
    const wlShare = clone(bcn); wlShare.checkin.share.plan = 'BOOM {city}: a rental agent on the tenant\'s side, flat fees. My plan in three taps: {url}';
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
  check(/\.pass\.in\{animation:none\}|\.pass\.in\{animation:none/.test(rm.replace(/\s/g, '')) || /,\.pass\.in\{animation:none\}/.test(rm), 'under prefers-reduced-motion the pass entrance is off');
  check(/::view-transition-group\(\*\),::view-transition-old\(\*\),::view-transition-new\(\*\)\{animation:none!important\}/.test(rm) && /dialog#ov\[open\]\{animation:none\}/.test(rm) && /html\{scroll-behavior:auto\}/.test(rm),
    'under reduced motion: no view transition, no dialog animation, no smooth scroll');
  check(/@property --meter\{syntax:'<percentage>'/.test(css) && /\.late\{content-visibility:auto;contain-intrinsic-size:auto 600px\}/.test(css) && /\.hero-left,\.hero-right\{display:contents\}/.test(css) && !/\.hero-right\{position:sticky/.test(css),
    'the CSS: a typed --meter, content-visibility on the late sections, one DOM reordered with display:contents on a phone, no sticky column on the desk');
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
  check(/var sending = false;/.test(js) && /if \(sending\) return;\n      err\.classList\.remove\('on'\)/.test(js) && /sending = false;\n          go\.style\.opacity = 1/.test(js) && /offerBtn\.addEventListener\('click'/.test(js) && !/btn\.addEventListener\('click', function \(\) \{ sheet\.open\(picked/.test(js),
    'the door sends once per tap (Enter in a field included), the flag released only when the send fails; the offer button is bound once');
  check(/var before = lastKind;/.test(js) && !/var before = state\(\)\.kind;/.test(js), 'the pass lands on the tap that resolves a pending stage: the kind BEFORE the tap is the one render remembered, not state() after the radio changed');
  check(!/bar\.setAttribute\('data-sub', \(\$\('stripSub'\)/.test(js) && /ov\.addEventListener\('close', function \(\) \{ setTimeout\(upd, 0\); \}\)/.test(js), 'the strip keeps the build\'s copy on a deep-link landing and comes back when the till closes');
  check(/mv\.setAttribute\('data-auto', want\)/.test(js) && /mvEl\.removeAttribute\('data-auto'\)/.test(js), 'the month the page prefills is marked as its own: it follows a changed answer, leaves with it, and a month the reader picked is never touched');
  check(/deskMq\.addEventListener\('change', mountBlank\)/.test(js), 'the pass board mounts when a phone widens into a desk before the first tap');
  check(/var received = !!\(h\.via && h\.via !== 'l'\);/.test(js) && /landingState = s0\.kind === 'complete' \? 'resume_complete' : 'resume';/.test(js) && /partial\.replace\('\{left\}', 'One tap'\) : partial\.split/.test(js),
    'an own reload is a resume, in silence; the banner is for a received link, and counts the taps to the PLAN');
  check(/if \(inp && inp\.checked\) \{ editing = null; sync\(\); \}/.test(js), 'after "change", picking the same answer again folds the step (an already-checked radio fires no change event)');
  check(/postMessage\(\{ id: id, W: 1080/.test(js) && /pendingReq\[m\.id\]/.test(js) && /if \(inflight\) return inflight;/.test(js) && !/w\.onmessage = function/.test(js),
    'the worker\'s replies are correlated by request id on one listener, and a second Save or Share joins the encode in flight');
  check(/done\.focus\(\{ preventScroll: true \}\)/.test(js) && html.includes('<div class="sent" id="fDone" tabindex="-1">') && html.includes('<div class="sent paid" id="fPaid" tabindex="-1"'), 'after the send focus lands on the open file, not on <body>; the paid card too');
  check(/Object\.prototype\.hasOwnProperty\.call\(PLANS, id\)/.test(js) && !/PLANS\[plan\]/.test(js), '?paid=constructor is not a plan: PLANS is read through hasOwnProperty everywhere');
  check(!/visitor_tz/.test(js) && html.includes("gtag('set',{page_location:location.origin+location.pathname+location.search});gtag('config'"),
    'the visitor\'s time zone never leaves the device, and GA never receives the address-bar fragment (the papers mask lives there)');
  check(/timeZoneName: 'short'/.test(js) && /function tzLabel\(\)/.test(js) && /querySelectorAll\('\[data-tz\]'\)/.test(js) && /desk\.open\(\) === false/.test(js) && /\['fGo', 'ckFile'\]\.map/.test(js) && /if \(st && \/\^free · \/\.test\(st\.textContent\)\) setText\('stripSub', sub \|\| open\.strip\);/.test(js) && /if \(typeof deskSub === 'function'\) deskSub\(\);/.test(js),
    'the zone label follows the clock (CEST seven months a year) and "same-day reply" is swapped for the window when the desk is closed, on the door, the pass and the strip, re-checked every minute (a page left open across 19:00 changes its promise), a plan named on the strip left alone');
  check(!/col\.style\.top/.test(js) && !/classList\.toggle\('tall'/.test(js) && !/\.hero-right\.tall/.test(css) && !/position:sticky/.test(slice(css, '@media(min-width:920px){', '}\n')),
    'no sticky column: the right column (pass + door) is never shorter than the left, so sticky had nowhere to move, and where it could it hid the foot of the door');
  check(/\{ threshold: 1 \}\)\.observe\(\$\('ckPlan'\)\)/.test(js), 'the plan-seen event watches the plan line, not a pass taller than the phone');
  const consent = read('js/boom-consent.js');
  check(/function atWork\(\)/.test(consent) && /WAIT_MAX = 45000/.test(consent) && /late && atWork\(\) && Date\.now\(\) - armedAt < WAIT_MAX/.test(consent), 'the consent plate waits while the reader is at work in the hero (the unanswered Check-in or the ticket on the screen), 45 s at most');
  // the second review round (18/10): what the first round left half done
  check(/function plateBox\(\)/.test(consent) && /lift\(\);\s*var r = el\.getBoundingClientRect\(\)/.test(consent) && /meets\(ck, box\)/.test(consent) && /meets\(pass, box\)/.test(consent),
    'the plate waits only for what it would COVER: its own box, measured where show() would put it, against the Check-in and the ticket');
  check(/if \(modalOpen\(\)\) \{ armedAt = Date\.now\(\); setTimeout\(lateGo, 400\); return; \}/.test(consent),
    'time spent in the till does not spend the plate\'s 45 s: the wait restarts when the dialog closes');
  check(/key === 'contact' \? \(v\('fPhone'\) && !v\('fEmail'\) \? \$\('fPhone'\) : \$\('fEmail'\)\)/.test(js) && /if \(mv && !mv\.getAttribute\('data-user'\)\)/.test(js) && /if \(s\.kind !== 'blank' && !entered && !opts\.landing\) \{ entered = true; pass\.classList\.add\('in'\); \}/.test(js) && /to = setTimeout\(function \(\) \{ workerDead = true; worker = null; fin\(null\); \}, 4000\)/.test(js),
    'the contact error focuses the field that was filled, a month the reader picked is theirs, the pass enters once (a move never replays it), a worker that never answers is retired');
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
