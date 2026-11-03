// tests/cities/run.mjs — the city desks (v1.6, «the complete aviation
// desk»; v1.5 «il biglietto» underneath): built from data, on one boarding
// pass, then a terminal walk, and the build must REFUSE rather than print
// something wrong (BOOM_CITIES_BRIEF.md; CLAUDE.md «Il biglietto»).
//
// What breaks if this goes red:
//   - a committed page that is NOT what the data builds (someone edited the
//     generated HTML, or changed the data and forgot to rebuild);
//   - the first phone screen stops being ONE pass: the city on one board,
//     one sentence with the desk's must-state, the three fares (each opening
//     its own ticket), one gold door, who answers and when;
//   - a price without its condition, a €500 without the refund rule on a
//     desk that sells, a pay control that does not read till.label;
//   - a waitlist desk (Paris, Berlin) with a till, a Stripe word, a refund
//     rule, a bank transfer or a promised call anywhere — text, attributes,
//     JSON-LD, config, the seal and the SVG text;
//   - a Spanish selling desk whose prices do not open "Optional, chosen in
//     writing" (LAU art. 20) on the first screen and in the till, or whose
//     "Who pays the agent · LAU art. 20" check is not the first one;
//   - the till out of the order the law asks (CRD): the plan, the UNTICKED
//     start-now box, the withdrawal line with the model form, the pay button
//     that follows the tick;
//   - the quiz pages coming back (Check-in, meter, shared pass, #checkin=,
//     the v1.4 hero, the priced pay bar, U+2708) or their JSON keys;
//   - v1.6: the walk out of order (Departures, Pre-flight, Baggage, Gate,
//     Questions, Network, the fact sheet, the footer); a Departures status
//     that is a flight remark (BOARDING, ON TIME, NOW…) or a promise; a key
//     on a step, a check or a question nobody prints (a check "verdict");
//     the seal saying anything but the desk's must-state; a file code in the
//     served HTML; a second plane; an aviation word that promises a seat, a
//     queue, a countdown or a Wallet pass; a map dot outside the map;
//   - the page fattening past the founder's v1.6 caps (in writing, raised
//     once): words at load (prose and instruments apart), the node rule,
//     each section of the walk, the lead, the fares, each ticket, the
//     weight in KB (the onda canvas script counted);
//   - the FAQ schema or the Offers saying something the page doesn't show;
//   - v1.6 review: a network arc that passes over a desk it does not serve
//     (read from the drawn SVG; a desk no bow can serve is refused by the
//     build); a content-hashed asset (the onda included) not served immutable;
//     the stub's door block not ONE sticky block above the foot; a pass child
//     left to auto-placement (forced colors and print drop the foil band);
//   - the desk window promising "open" on a holiday (the calendar is ONE
//     file, read by the page and the webhook);
//   - the lead endpoint filing a city lead into the Rome machine, or the
//     Rome machine (Commerciale, Segretaria, /richiama, the reverse search,
//     the Lead Brain) speaking to someone moving to Amsterdam.
//
// No browser, no network: the real build functions on the real data, and
// the real /api/city-lead handler on a Firestore in memory. The page in a
// browser is tests/cities/ui.mjs; the calendar, tests/cities/calendar.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAll, renderCity, writeAll, fill, findPlaceholders, fragments, familyFor, BuildError, esc, eur, money, currencyOf, GENERATED_MARK, WEIGHT_KB, BUDGET,
  daysLabel, deskHoursText, feesRowOf, holidayKeyOf, visibleAtLoad, visibleText, sliceOf, words, waHref, WITHDRAWAL_PATH, TERMS_PATH,
  atLoadParts, longNodes, weightOf, mapXY, validGeo, sealText, sealPhrase, STATUS_RE, STATUS_BANNED_RE, AVIATION_BAN_RE,
  arcViolations, bowArcs, arcCtrl, ARC_CLEAR, ARC_DOT_R, ARC_ME_R
} from '../../build-cities.mjs';
import SCALO from '../../js/scalo-codes.js';
import CAL from '../../js/desk-calendar.js';

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
// a refusal: the mutated data must make the build throw, naming the fault
const refuses = (mut, re, t, base = 'amsterdam') => {
  const c = clone(CITY[base]);
  mut(c);
  const r = throws(() => render(c), re);
  check(r === true, t, r === true ? '' : r);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

console.log('\n\x1b[1m▸ cities\x1b[0m  the city desks (v1.6, the complete aviation desk): one pass and a terminal walk, built from data, refusing instead of lying');

const template = read('cities/_template.html');
const shared = JSON.parse(read('cities/_shared.json'));
const SLUGS = ['amsterdam', 'barcelona', 'berlin', 'london', 'madrid', 'milan', 'paris'];
const CITY = Object.fromEntries(SLUGS.map((s) => [s, JSON.parse(read(`cities/${s}.json`))]));
const ams = CITY.amsterdam;
const assetVersion = { css: 'testcss000', js: 'testjs0000', onda: 'testonda00' };
const frags = fragments(R);
// the refusals are measured without the weight gate (it has its own check);
// the family is the real one, so a mutation of one desk keeps its sisters
const render = (city, sh = shared, tpl = template, root = R, extra = {}) =>
  renderCity({ template: tpl, shared: sh, city, assetVersion, frags, root, weigh: false, cities: SLUGS.map((s) => (s === city.slug ? city : CITY[s])), ...extra });
// a template mutation: the build must refuse its own output
const tplRefuses = (from, to, re, t, base = 'amsterdam') => {
  check(template.includes(from), `(the template still carries the anchor of: ${t})`);
  const r = throws(() => render(CITY[base], shared, template.replace(from, to)), re);
  check(r === true, t, r === true ? '' : r);
};

// ── 1 · the committed pages are exactly what the data builds ─────────────
const pages = buildAll({ root: R });
check(pages.length === 7 && pages.map((p) => p.slug).join() === SLUGS.join(), `the seven desks are built from cities/*.json (${pages.map((p) => p.slug).join(', ')})`);
for (const p of pages) {
  const f = path.join(R, p.file);
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  check(cur === p.html, `${p.file} is up to date with its data`,
    cur === null ? 'missing — run npm run build:cities' : 'stale — run npm run build:cities (never edit the generated file)');
  check(p.weight && p.weight.totalKb <= WEIGHT_KB.total && p.weight.jsKb <= WEIGHT_KB.js && p.weight.cssKb <= WEIGHT_KB.css && p.weight.ondaKb <= WEIGHT_KB.onda,
    `${p.file}: ${p.weight.totalKb.toFixed(1)} KB gzipped first-party (≤ ${WEIGHT_KB.total}), the JS ${p.weight.jsKb.toFixed(1)} (≤ ${WEIGHT_KB.js}), the CSS ${p.weight.cssKb.toFixed(1)} (≤ ${WEIGHT_KB.css}), the onda ${p.weight.ondaKb.toFixed(1)} (≤ ${WEIGHT_KB.onda})`);
  check(p.words <= BUDGET.body && p.prose <= BUDGET.prose && p.instr <= BUDGET.instr && p.words === p.prose + p.instr,
    `${p.file}: ${p.words} words visible at load (≤ ${BUDGET.body}): ${p.prose} of prose (≤ ${BUDGET.prose}), ${p.instr} of instruments (≤ ${BUDGET.instr}) — v1.4 had 1,065 on Amsterdam`);
}
// v1.6 (03/11/2026): the founder raised the caps ONCE, in writing, to these
// numbers («this new style is just too much synthesised … iterate the
// aviation ticket style … also for a complete page»). They are pinned here:
// a cap is never raised again to fit a change — the change cuts copy or craft.
check(WEIGHT_KB.total <= 82 && WEIGHT_KB.js <= 14 && WEIGHT_KB.css <= 15 && WEIGHT_KB.onda <= 4
  && BUDGET.body <= 640 && BUDGET.prose <= 520 && BUDGET.instr <= 120 && BUDGET.node <= 24 && BUDGET.first <= 150
  && BUDGET.lead <= 30 && BUDGET.fares <= 70 && BUDGET.ticket <= 60
  && BUDGET.departures <= 100 && BUDGET.preflight <= 60 && BUDGET.baggage <= 70 && BUDGET.gate <= 40 && BUDGET.network <= 40
  && !('stub' in BUDGET),
  'the budgets are where the founder set them on 03/11 (≤ 82 KB gz: JS 14, CSS 15, onda 4; 640 words at load: prose 520, instruments 120; a node ≤ 24 words; first screen 150; lead 30, fares 70, ticket 60; Departures 100, Pre-flight 60, Baggage 70, Gate 40, Network 40): a cap is never raised to fit');
{
  const bs = read('build-cities.mjs');
  check(/FOUNDER DECISION, in writing/.test(bs) && bs.indexOf('FOUNDER DECISION, in writing') < bs.indexOf('export const WEIGHT_KB'), 'the raise is written above the caps in build-cities.mjs as the founder\'s decision, not a silent edit');
}
{
  // weightOf reads the onda canvas script: a fatter onda makes every page heavier
  const tmpW = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-w-'));
  fs.mkdirSync(path.join(tmpW, 'assets'), { recursive: true }); fs.mkdirSync(path.join(tmpW, 'js'), { recursive: true });
  for (const f of ['assets/boom-city.css', 'assets/boom-city.js', 'assets/boom-onda.js', 'js/boom-consent.js', 'js/boom-track.js']) fs.copyFileSync(path.join(R, f), path.join(tmpW, f));
  const w0 = weightOf(pages[0].html, tmpW);
  fs.appendFileSync(path.join(tmpW, 'assets/boom-onda.js'), '\n/*' + Array.from({ length: 4000 }, (_, i) => ((i * 2654435761) % 4294967296).toString(36)).join(' ') + '*/');
  const w1 = weightOf(pages[0].html, tmpW);
  check(w0.ondaKb > 0 && w1.ondaKb > w0.ondaKb && w1.totalKb - w0.totalKb > (w1.ondaKb - w0.ondaKb) * 0.99, `weightOf counts assets/boom-onda.js in the total and on its own (${w0.ondaKb.toFixed(1)} → ${w1.ondaKb.toFixed(1)} KB)`);
  fs.rmSync(tmpW, { recursive: true, force: true });
}
const PAGE = Object.fromEntries(pages.map((p) => [p.slug, p.html]));
const html = PAGE.amsterdam;

// ── 2 · the Amsterdam page, as built ──────────────────────────────────────
check(!/\{\{\{?\s*[\w.]+\s*\}\}\}?/.test(html), 'amsterdam: no unresolved {{token}} in the output');
check(html.includes(GENERATED_MARK), 'amsterdam: carries the GENERATED mark (the overwrite guard depends on it)');
for (const s of SLUGS) {
  const head = PAGE[s].slice(0, 4000);
  const live = CITY[s].live === true;
  check(live ? (!/noindex/.test(head) && /content="index, follow/.test(head)) : /<meta name="robots" content="noindex">/.test(head),
    `${s} is ${live ? 'LIVE: index, follow' : 'a draft: noindex'} in the first 4000 chars (tests/seo rule 8 reads exactly there)`);
}
check(['amsterdam', 'madrid', 'barcelona', 'london', 'milan'].every((s) => CITY[s].live && CITY[s].checkout === true && CITY[s].mode === 'search')
  && ['paris', 'berlin'].every((s) => !CITY[s].live && CITY[s].checkout === undefined && CITY[s].mode === 'waitlist'),
  'the live set is pinned: Amsterdam, Madrid, Barcelona, London, Milan sell; Paris and Berlin are noindex waitlists without a till');
const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
check(canon === `${shared.siteUrl}/amsterdam` && /^https:\/\/www\.boomrome\.com$/.test(shared.siteUrl), `canonical comes from siteUrl, on www: ${canon}`);

// the system: self-contained, one city CSS, one city JS, both with a content hash
check(/<link rel="stylesheet" href="\/assets\/boom-city\.css\?v=[0-9a-f]{10}">/.test(html) && /<script src="\/assets\/boom-city\.js\?v=[0-9a-f]{10}"><\/script>/.test(html),
  'the city CSS and JS are linked with a content hash (--check catches a forgotten rebuild)');
check(!/boom-2026\.css/.test(html) && (html.match(/<link rel="stylesheet"/g) || []).length === 1, 'one stylesheet: the ticket is self-contained (no boom-2026.css, no Google Fonts)');
const css = read('assets/boom-city.css'), js = read('assets/boom-city.js');
check(!/#D4AF37/i.test(html + css + js), 'the portal gold #D4AF37 never appears: the public site is #FFD700');
check(!/font-family:\s*[^;]*(Georgia|serif)/i.test(css) && /Helvetica Neue/.test(css), 'Helvetica Neue, no serif');
check(html.includes(frags.scrollBlock) && html.includes('<!-- BOOM_SCROLL:START -->'), 'the scroll contract is inlined from css/boom-scroll.css + js/boom-scroll.js (the iPhone status bar reads the header)');
check(html.includes(frags.solariEngine) && /BOOM_SOLARI:START/.test(html), 'the Solari engine is inlined byte for byte from its single source');
check(html.includes(frags.deskCalendar) && /BOOM_CALENDAR:START/.test(html) && /root\.BOOM_DESK_CAL\s*=/.test(frags.deskCalendar),
  'the desk calendar is inlined from js/desk-calendar.js — the file the webhook imports (one copy of the holidays)');
check(/<body data-consent-late>/.test(html) && /<script defer src="\/js\/boom-consent\.js"><\/script>/.test(html) && /<script defer src="\/js\/boom-track\.js"><\/script>/.test(html),
  'consent waits for the reader (data-consent-late); consent and tracking are the site\'s own scripts');
check(/gtag\('consent','default',\{ad_storage:'denied'[^}]*analytics_storage:'denied'/.test(html) && /session_id=/.test(html.match(/gtag\('set',\{page_location:[^;]+/)[0]),
  'GA starts denied and page_location drops the fragment and the session_id of a paid return');
check(!/stripe\.com|js\.stripe|web3forms|formspree|fbq\(|connect\.facebook/i.test(html), 'no third-party form, no Stripe script, no ad pixel: the forms post to our own API');

// the pass: the city on ONE board, served empty; the sentence; the fares; the door; the desk
const pass = sliceOf(html, '<article class="pass"', '</article>');
check((html.match(/<article class="pass" id="pass"/g) || []).length === 1 && /<article class="pass" id="pass" data-state="blank"/.test(html), 'one pass, blank at parse');
check(html.includes('<h1 id="h1"><span class="h1a">Your home in</span> <span class="sr">Amsterdam</span></h1>\n      <p class="board-row" aria-hidden="true"><span class="board" id="placeBoard" data-word="AMSTERDAM" style="--n:9"></span></p>')
  && (html.match(/class="board"/g) || []).length === 1, 'one board, decorative, served empty and OUTSIDE the H1: the heading reads "Your home in Amsterdam" before and after the cells mount');
check(/<p class="lead">We search, apply, attend the viewings and check the lease\. <b>We work exclusively for you; never paid by landlords\.<\/b><\/p>/.test(pass),
  'the one sentence, with Amsterdam\'s must-state in bold (brief §4: "never paid by landlords")');
const iFares = pass.indexOf('<!-- FARES -->'), iAct = pass.indexOf('<div id="act">'), iDesk = pass.indexOf('<dt>Answers</dt>');
check(iFares > -1 && pass.indexOf('<!-- /FARES -->') < iAct && iAct < iDesk, 'in the pass: the fares, then the door, then who answers');
check(pass.includes(`<dt>Answers</dt><dd>${ams.desk.person}</dd>`) && pass.includes('<dt>Desk</dt><dd>Mon–Fri <span class="nw">09:00–19:00</span>, Rome time</dd>'),
  `who answers and when, in the static HTML: "${ams.desk.person}" · "${deskHoursText(ams.desk)}" (true in every season: never "CET" alone)`);
check(deskHoursText(ams.desk) === 'Mon–Fri 09:00–19:00, Rome time' && daysLabel([1, 2, 3, 4, 5]) === 'Mon–Fri' && daysLabel([1, 3]) === 'Mon, Wed' && daysLabel([6]) === 'Sat',
  'deskHoursText names the days and the city of the clock');
// v1.6: the route replaces v1.5's code-big — on the phone the perforation
// itself (YOU → AMS on the punched track), on desktop the stub (FROM YOU, TO
// AMS); both decorative, both carrying the ONE plane parked at the reader's
// state, the three ticks one per Departures row
{
  const perf = sliceOf(pass, '<div class="perf" aria-hidden="true">', '</div>');
  const stubRoute = sliceOf(pass, '<div class="route route-s" aria-hidden="true">', '</div>');
  const line = (h) => /<b class="ra">YOU<\/b><span class="r-line"><i class="r-holes"><\/i><i class="r-tick t1"><\/i><i class="r-tick t2"><\/i><i class="r-tick t3"><\/i><i class="r-trail"><\/i><span class="r-run"><i class="r-hold"><\/i><svg class="r-plane"[^>]*><use href="#boomPlane"\/><\/svg><\/span><\/span><b class="rb">AMS<\/b>/.test(h);
  check(line(perf) && /<span class="route route-p">/.test(perf) && !/class="code-big"/.test(html), 'the phone perforation is the route: YOU, the punched track with three ticks and the parked plane, AMS — decorative (v1.5\'s code-big is gone)');
  check(line(stubRoute) && stubRoute.includes('<p class="r-lab"><span>From</span><span>To</span></p>') && pass.indexOf('class="route route-s"') < pass.indexOf('<div id="act">'),
    'the stub says where the ticket goes: FROM YOU, TO AMS, decorative, above the door (desktop)');
  check(!/ROM<\/b><span class="r-line"|<b class="ra">ROM/.test(html) && /<p class="code" id="codeLine">BOOM · AMS · TENANT SIDE · ISSUED ROM<\/p>/.test(pass),
    'Rome is never the passenger\'s origin: YOU is; ROM appears only as the issuer on the code line ("ISSUED ROM")');
  check(/<div class="stub-foot" aria-hidden="true"><i class="bars"><\/i><p class="code" id="codeLine">/.test(pass) && pass.indexOf('class="stub-gate" id="stubGate"') < pass.indexOf('class="stub-foot"'),
    'the stub foot: a barcode that encodes nothing and the code line, decorative, under the gate slot the clocks move into');
  // v1.6 review (visual F7): ONE sticky block — the route, the door and the gate — on a track that ends above the foot
  const iTr = pass.indexOf('<div class="stub-track"><div class="stub-st">'), iIn = pass.indexOf('<div class="stub-in">'), iGt = pass.indexOf('<div class="stub-gate" id="stubGate"></div>'),
    iShut = pass.indexOf('</div></div>', iGt), iFt = pass.indexOf('<div class="stub-foot"');
  const css = read('assets/boom-city.css'), desk940 = sliceOf(css, '@media (min-width:940px){\n  .pass{display:grid', '\n}\n');
  check(iTr > 0 && iTr < iIn && iIn < iGt && iGt < iShut && iShut < iFt && /\.stub-st\{position:sticky;top:\d+px\}/.test(desk940) && /\.stub-track\{flex:1 0 auto\}/.test(desk940),
    'the stub\'s door block (route, door, gate) rides in ONE sticky .stub-st on a .stub-track that ends above the foot (≥940)');
  // v1.6 review (visual F1): forced colors and print drop the foil band — the other children keep their own tracks
  check(/\.lamina\{grid-column:1\}\.p-main\{grid-column:2\}\.perf\{grid-column:3\}\.stub\{grid-column:4\}/.test(desk940),
    'the pass places every child on its own column (≥940): without the foil band nothing shifts into the 28/30px tracks');
}

// the fares: three rows, each its own <details name="fare"> with its ticket in place
const fares = sliceOf(html, '<!-- FARES -->', '<!-- /FARES -->');
const rows = [...fares.matchAll(/<details class="fare" name="fare" id="fare-([a-z-]+)" data-plan="\1"/g)].map((m) => m[1]);
check(rows.join() === 'full-search,application-pack,attended-viewing', `three fare rows in the server's order (${rows.join(', ')})`);
check(!/<details class="fare"[^>]*\sopen/.test(fares), 'no fare is open at load: nothing is pre-selected');
for (const p of ams.pricing.plans) {
  const row = sliceOf(fares, `id="fare-${p.id}"`, '</details>');
  check(row.includes(`<b class="f-name">${esc(p.label)}</b><span class="f-when">${esc(p.when)}</span>`) && row.includes(`data-plan-price="${p.id}">${eur(p.price)}</span><span class="f-cond">`),
    `${p.label}: the row says who it is for ("${p.when}") and its price ${eur(p.price)} with its condition`);
  check(p.includes.every((x) => row.includes(`<li>${esc(x)}</li>`)) && row.includes(`<p class="tk-tag">${esc(p.name)}</p>`), `${p.label}: its ticket says what the fee buys (${p.includes.length} lines)`);
  check(row.includes(`data-pay="${p.id}"><span>${esc(ams.till.label)} · ${eur(p.price)}</span>`), `${p.label}: the ticket's pay button reads till.label with ITS price`);
}
check(fares.includes(`<p class="fares-h"><b id="faresH">Flat fees</b><span>No percentage of your rent</span></p>`), 'the line over the fares: "Flat fees · No percentage of your rent"');
check((html.match(/data-pay="/g) || []).length === 3, 'pay controls live only inside the tickets (three, one per plan): no pay bar, no pay button outside a ticket');

// the door: one node, one label, the desk window under it, nothing pre-selected
check((html.match(/id="door"/g) || []).length === 1 && (html.match(/id="fileForm"/g) || []).length === 1 && (html.match(/id="act"/g) || []).length === 1, 'one door, one form, one act node (it moves into the open ticket on a phone; it is never two doors)');
check(html.includes(`<b id="doorL">Start with a free call</b><small data-window="no card · {w}">no card · ${deskHoursText(ams.desk)}</small>`),
  'the door reads "Start with a free call" (the founder, 22/10) with the desk window under it — "no card" on a desk that sells');
check(/<button class="door js" id="door" type="submit" disabled /.test(html) && /<noscript><p class="s-h">Write to the desk on <a class="lnk" href="https:\/\/wa\.me\//.test(html),
  'the door is served disabled (the script opens it) and a page without JS says where to write: no GET ever carries the contact data');
check(/<div id="fFields" class="reveal" hidden>/.test(html) && /<input id="fName" name="name" autocomplete="name"/.test(html) && /<input id="fContact" name="contact" autocomplete="email" inputmode="email"/.test(html),
  'two fields, revealed by the first tap: a name and ONE contact ("Email or WhatsApp number")');
check(/<input class="hp" id="fCompany" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">/.test(html), 'the honeypot is there, out of the tab order');
check(/<p class="err" id="fNetErr" role="alert"><\/p>\s*<button class="door js" id="door"/.test(html), 'a failed send has its own alert next to the door — never written on a valid contact field');
check(/window\.BOOM_TICKET/.test(sliceOf(html, "addEventListener('load', function ()", '</script>')), 'the "could not load its form" fallback reads the desk script\'s own flag, not the door\'s state (the door is shut for a moment while a real send flies)');
check(/<form id="fileForm"[^>]*data-analytics-manual/.test(html) && /<form class="tf" id="tillForm"[^>]*data-analytics-manual/.test(html), 'both forms are tracked by hand (boom-track never double-counts a lead)');
check(html.includes(`<p class="s-h" id="notSure">${esc(ams.stub.notSure)}</p>`), 'the "not sure" line over the door (the free door is the neutral decline)');
check(/<div id="cOpen" class="card reveal" tabindex="-1" hidden>/.test(html) && /<dd id="oFile"><\/dd>/.test(html) && !/BM [A-HJ-NP-Z2-9]{5}/.test(html),
  'OPEN is served hidden with an EMPTY file number: only the server\'s answer fills it');
check(/<div id="cConfirm" class="card reveal" tabindex="-1" hidden/.test(html) && /<div id="cPaid" class="card reveal" tabindex="-1" hidden>/.test(html) && /<dd id="pStart"><\/dd>/.test(html),
  'the confirming and PAID cards are served hidden: the address bar proves nothing');

// the strip: the door again, no price
const strip = sliceOf(html, '<div class="strip js" id="strip"', '</div>');
check(strip.includes('<button class="st-go" id="stripGo" type="button">Start with a free call</button>') && !/€/.test(strip) && /aria-hidden="true" inert/.test(strip),
  'the phone strip is the same door, no price, inert until the pass\'s door leaves the screen');

// one label everywhere; the v1.2–v1.4 labels and chrome are gone
const vis = visibleText(html);
check(!/Start my search|Get the pack|Book a viewing|Show my plan|Rather write first|Three questions|Open my file/.test(vis), 'one door label on a selling desk: none of the earlier labels');
check(!/id="checkin"|id="ckStatus"|id="passWrap"|#checkin=|class="paybar"|id="flapCity"|class="hero"|data-consent="compact"|class="rail"|class="glance"/.test(html), 'the quiz, its ticket, the share links, the v1.4 hero, the rail and the priced bar left the page');
// v1.6, a recorded founder decision: the plane is back as ONE SVG symbol, used
// on the route only — never a second or third plane, never the ✈ glyph
for (const s of SLUGS) {
  const h = PAGE[s];
  check((h.match(/<symbol id="boomPlane"/g) || []).length === 1 && (h.match(/<use href="#boomPlane"\/>/g) || []).length === 2 && !/\u2708/.test(h) && !/<svg class="map"[\s\S]*?boomPlane[\s\S]*?<\/svg>/.test(h),
    `${s}: ONE plane symbol, used twice (the phone perforation, the stub route) — no plane on the map, no ✈`);
}
check(!/✈/.test(html) && !/!(?=[\s<"]|$)/.test(vis.replace(/<!DOCTYPE/i, '')), 'no ✈ and no exclamation mark');
check(!/(?<![\d,.])500\+|\b24\/7\b|off-market|within the hour|whichever is lower|founding|spots? left|\d+ (places|spots)/i.test(vis), 'no "500+", "24/7", "off-market", "within the hour", no founding cohort, no scarcity');

// the WhatsApp links: every one opens with the desk marker
const was = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
check(was.length >= 3 && was.every((u) => u === waHref(shared.contact, 'Amsterdam')) && decodeURIComponent(was[0].split('text=')[1]) === "Hi BOOM Amsterdam, I'm moving to Amsterdam.",
  `every WhatsApp link (${was.length}) opens with the desk marker "Hi BOOM Amsterdam, …" — never a plan or a price`);

// the proof: the Rome rating once, labelled, linked to the public profile
check((html.match(/on Google/g) || []).length === 1 && html.includes(`<a class="lnk" href="${shared.rome.profileUrl}" target="_blank" rel="noopener">${shared.rome.rating} on Google in Rome, ${shared.rome.reviews} reviews</a>`),
  'the Rome rating appears once, says "in Rome" and links the public profile');
check(/^https:\/\/maps\.google\.com\/\?cid=\d+$/.test(shared.rome.profileUrl), 'the proof link is the public profile (?cid=), never the "write a review" box');

// the below (v1.6): the terminal walk — Departures, Pre-flight, Baggage,
// Gate, Questions, Network, the fact sheet on the back, the footer
const iHow = html.indexOf('id="how"'), iChk = html.indexOf('id="checks"'), iPap = html.indexOf('<section class="sec" id="papers"'), iDsk = html.indexOf('<section class="sec" id="desk"'),
  iFaq = html.indexOf('id="faq"'), iNet = html.indexOf('<section class="sec" id="network"'), iBrf = html.indexOf('id="enbref-wrap"'), iFoot = html.indexOf('class="foot"');
check(html.indexOf('</article>') < iHow && iHow < iChk && iChk < iPap && iPap < iDsk && iDsk < iFaq && iFaq < iNet && iNet < iBrf && iBrf < iFoot,
  'below the pass, in order: Departures (#how), Pre-flight (#checks), Baggage (#papers), Gate (#desk), Questions (#faq), Network, the fact sheet, the footer');
check(html.indexOf('<p class="proof">') > html.indexOf('</article>') && html.indexOf('<p class="proof">') < iHow && (html.match(/<p class="proof">/g) || []).length === 1, 'the proof line sits once, right under the pass');
for (const s of SLUGS) {
  const h = PAGE[s];
  const secs = [...h.matchAll(/<section class="sec[^"]*" id="([\w-]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  const walk = secs.filter((m) => m[1] !== 'enbref-wrap');
  const bad = walk.filter((m) => { const h2 = (m[2].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || ''; return (h2.match(/class="g"/g) || []).length !== 1 || !/^\s*<p class="eb" data-instr>[^<]+<\/p>/.test(m[2]); });
  check(walk.map((m) => m[1]).join() === 'how,checks,papers,desk,faq,network' && !bad.length,
    `${s}: every section of the walk opens with its eyebrow and an h2 with exactly ONE gold phrase (${walk.map((m) => m[1]).join(' → ')})`, bad.map((m) => m[1]).join());
}
check(['Departures', 'Pre-flight', 'Baggage', 'Gate', 'Before you ask', 'Network'].every((e, i) => sliceOf(html, ['id="how"', 'id="checks"', '<section class="sec" id="papers"', '<section class="sec" id="desk"', 'id="faq"', '<section class="sec" id="network"'][i], '</h2>').includes(`<p class="eb" data-instr>${e}</p>`))
  && !/>(Check-in|Customs)</.test(html), 'the eyebrows name the walk (Departures, Pre-flight, Baggage, Gate, Before you ask, Network) — never "Check-in" or "Customs"');

// DEPARTURES: the three steps as a board — N° and step from k, what happens
// from h and p, the status a validated fact; row 01 flips only on a server event
{
  const dep = sliceOf(html, '<section class="sec" id="how"', '</section>');
  check(dep.includes(`<h2 id="howH">${esc(ams.how.h2)} <span class="g">${esc(ams.how.h2g)}</span></h2>`) && /<p class="dep-h" aria-hidden="true"><b>AMS · DEPARTURES<\/b>/.test(dep), 'Departures: the h2 and its gold phrase, the board head "AMS · DEPARTURES" (decorative)');
  const rows = [...dep.matchAll(/<li class="dep-r rv" id="dep-(\d)"[^>]*>([\s\S]*?)<\/li>/g)];
  check(rows.length === 3 && ams.how.steps.every((st, i) => {
    const [, , name] = /^(\d) · (.+)$/.exec(st.k);
    const r = rows[i][2];
    return rows[i][1] === String(i + 1) && r.includes(`<span class="n" data-instr aria-hidden="true">0${i + 1}</span>`) && r.includes(`<span class="s" data-instr>${esc(name)}</span>`)
      && r.includes(`<b class="dh">${esc(st.h)}</b> <span class="dp">${esc(st.p)}</span>`)
      && r.includes(`<span class="st-b" data-word="${st.status}" aria-hidden="true">${st.status}</span><span class="sr" id="dep-${i + 1}-sr">Status: ${st.status.toLowerCase()}</span>`);
  }), 'three Departures rows: N°, the step name from k, what happens (h + p), the status on a board (decorative) with its screen-reader twin');
  check(/<span class="pill-st js" id="depPill" hidden>/.test(dep) && /<p class="dep-f js" hidden>/.test(dep) && /<p class="sr" id="depLive" aria-live="polite"><\/p>/.test(dep), 'the desk pill and the foot line are served hidden (behaviour, not content); #depLive waits empty for row 01\'s fact');
  check(!/class="st-b"[^>]*>[^<]*(BM |REPLY|START|FROM \d)/.test(html), 'no row is served flipped: REPLY / START / FROM only after the server answers');
}
// the statuses, desk by desk: a fact about the step, never a flight remark
for (const s of SLUGS) {
  const c = CITY[s], want = c.mode === 'waitlist' ? ['FREE', 'WITH PARTNER', 'AT OPENING'] : ['FREE', '1 WORK DAY', 'IN PERSON'];
  const got = [...PAGE[s].matchAll(/<span class="st-b" data-word="([^"]+)"/g)].map((m) => m[1]);
  check(JSON.stringify(c.how.steps.map((x) => x.status)) === JSON.stringify(want) && JSON.stringify(got) === JSON.stringify(want)
    && got.every((x) => STATUS_RE.test(x) && !STATUS_BANNED_RE.test(x)) && c.how.steps.every((x, i) => new RegExp(`^${i + 1} · .{2,24}$`).test(x.k)),
    `${s}: the Departures statuses are ${want.join(' · ')} (${c.mode === 'waitlist' ? 'a desk still opening: the partner, the opening' : 'a desk that sells'}), upper-case, ≤ 12 cells, no remark`);
}

// PRE-FLIGHT: what we check before you sign, as lanes — no verdict, no tick
check(ams.checks.items.every((k, i) => html.includes(`<details class="lane rv" id="check-${k.id}" style="--i:${i}"><summary><span class="ln" aria-hidden="true">0${i + 1}</span> <span class="at" data-instr>${esc(k.at)}</span> <span class="t">${esc(k.title)}</span></summary><p>${esc(k.text)}</p></details>`))
  && sliceOf(html, 'id="checks"', '</section>').includes('<p class="lanes-h" aria-hidden="true">AMS · PRE-FLIGHT · WHAT WE CHECK</p>'),
  `the checks are lanes, folded (N°, the legal kicker, the title; the sentence opens): ${ams.checks.items.map((k) => k.id).join(', ')}`);
check(!/verdict|✓|✔|☑|checked for you|class="tick"/i.test(sliceOf(html, 'id="checks"', '</section>')), 'Pre-flight carries no verdict and no tick: "a point we check", never "checked for you"');

// BAGGAGE: the eight papers as static tags — no fold, no input, no count
{
  const bag = sliceOf(html, '<section class="sec" id="papers"', '</section>');
  const tags = [...bag.matchAll(/<li class="tag rv" style="--i:(\d)"><span class="eye" aria-hidden="true"><\/span><span class="tn" aria-hidden="true">AMS 0(\d)<\/span> <span class="tt">([^<]+)<\/span><\/li>/g)];
  check(tags.length === 8 && tags.every((m, i) => m[1] === String(i) && m[2] === String(i + 1) && m[3] === esc(ams.papers.items[i])) && bag.includes(`<p class="tail rv">${esc(ams.papers.tail)}</p>`),
    'Baggage: the eight papers a Dutch landlord asks for, as eight tags, in the order of the data, then the tail line');
  check(bag.includes('<h2 id="papersH">The papers <span class="g">a Dutch landlord asks for.</span></h2>') && bag.includes('<p class="manifest" aria-hidden="true">AMS · BAGGAGE · 8 PAPERS</p>'),
    'the Baggage h2 is split from papers.summary ("The papers" + the gold phrase); the manifest is decorative');
  check(!/<details/.test(bag) && !/<input|role="checkbox"|<meter|<progress|of 8|\d\/8/i.test(bag) && !/<details id="papers"|class="papers"/.test(html),
    'the papers are static: no fold, no input, no checkbox, no meter, no "n of 8"');
}
for (const s of SLUGS) check(/^The papers an? .+ asks for$/.test(CITY[s].papers.summary) && PAGE[s].includes(`The papers <span class="g">${esc(CITY[s].papers.summary.replace(/^The papers /, ''))}.</span>`), `${s}: the Baggage heading is "${CITY[s].papers.summary}."`);

// GATE: who answers and when; the clocks, the week and the outlined door twin
// are served hidden (behaviour); the dot is the only thing that may pulse
{
  const g = sliceOf(html, '<section class="sec" id="desk"', '</section>');
  check(g.includes('<h2 id="deskH">Who answers, <span class="g">and when.</span></h2>') && g.includes('<span class="mono" aria-hidden="true">VE</span><p><b>Valentino Egidi</b> <span>tenant-side agent</span></p>')
    && g.includes('<p class="hrs rv" style="--i:1">Mon–Fri <span class="nw">09:00–19:00</span>, Rome time</p>'), 'Gate: "Who answers, and when.", the person (monogram VE, decorative) and the desk hours as text');
  check(/<div class="clocks quadro js" id="clocks" hidden>/.test(g) && /<ol class="week js" id="week" hidden aria-label="The desk this week"><\/ol>/.test(g) && /<button class="door2 js" id="deskGo" type="button" hidden>/.test(g),
    'the clocks, the week strip and #deskGo are served hidden and empty: the JS fills them from the desk calendar');
  check(!/Rome<\/p>\s*<p class="ck-v"|>Rome clock|ckRome/.test(g) && (g.match(/<div class="ck"/g) || []).length === 2, 'two clocks only — the desk and where you are: no Rome clock');
  check(/<p class="write rv"[^>]*>Write instead: <a class="lnk" href="https:\/\/wa\.me\//.test(g), 'the Gate keeps the written way in (WhatsApp, email)');
}
// one label, four doors: the door, its header twin, its gate twin, the strip
for (const s of SLUGS) {
  const h = PAGE[s], lab = esc(CITY[s].door.label);
  const four = [sliceOf(h, 'id="topGo"', '</button>').includes(`<b>${lab}</b>`), sliceOf(h, 'id="deskGo"', '</button>').includes(`<b>${lab}</b>`),
    h.includes(`<b id="doorL">${lab}</b>`), h.includes(`<button class="st-go" id="stripGo" type="button">${lab}</button>`)];
  check(four.every(Boolean) && (h.match(/id="topGo"/g) || []).length === 1 && (h.match(/id="deskGo"/g) || []).length === 1,
    `${s}: #topGo, #deskGo, #doorL and #stripGo all read "${CITY[s].door.label}" — one label, four nodes`, JSON.stringify(four));
  check((h.match(/data-window=/g) || []).length === 2, `${s}: exactly two [data-window] nodes (the door and the strip)`);
  const w = deskHoursText(CITY[s].desk), gates = [...h.matchAll(/data-gate="([^"]*)">([^<]*)</g)];
  check(gates.length >= 4 && gates.every((m) => m[1].includes('{w}') && m[2] === m[1].replace('{w}', w).replace(/&amp;/g, '&')),
    `${s}: every [data-gate] node serves the static desk hours ("${w}") until the JS fills the window`, gates.map((m) => m[2]).join(' | '));
  check(/<header class="top">/.test(h) && /<nav class="wayf" aria-label="On this page" data-instr>/.test(h) && ['fares', 'how', 'checks', 'papers', 'desk', 'faq'].every((x) => sliceOf(h, '<nav class="wayf"', '</nav>').includes(`href="#${x}"`) && h.includes(`id="${x}"`)),
    `${s}: the header's wayfinding lands on ids that exist (#fares #how #checks #papers #desk #faq)`);
  check(/<button class="top-go js" id="topGo" type="button" hidden>/.test(h) && /<p class="chip js" id="topChip" data-instr>/.test(h) && /<div class="twin">/.test(h),
    `${s}: the header twin: the chip served, #topGo served hidden in the same slot`);
}
check(!/id="contact"/.test(html) && /<article class="pass" id="pass"/.test(html) && /<div id="act">/.test(html) && /<div class="fares" id="fares"/.test(html) && /id="door"/.test(html) && /id="stripGo"/.test(html),
  'the ids the consent code and the server depend on stay (#pass, #act, #fares, #door, #stripGo) and no #contact comes back');

// THE SEAL and THE STAMPS: the desk's must-state on a ring, never a new claim;
// FILE OPEN / PAID only on the cards the server opens
{
  const SEAL = { amsterdam: 'NEVER PAID BY LANDLORDS', london: 'NEVER PAID BY LANDLORDS', milan: 'NEVER PAID BY LANDLORDS', madrid: 'WE DO NOT ACT FOR THE LANDLORD', barcelona: 'WE DO NOT ACT FOR THE LANDLORD', paris: 'OPENING WITH A LICENSED PARTNER', berlin: 'OPENING WITH A LICENSED PARTNER' };
  for (const s of SLUGS) {
    const h = PAGE[s], C = CITY[s].city.toUpperCase();
    const seal = sliceOf(h, '<svg class="seal"', '</svg>');
    check(sealPhrase(CITY[s]) === SEAL[s] && sealText(CITY[s]) === `BOOM ${C} · TENANT SIDE · ${SEAL[s]} · ` && seal.includes(`<textPath href="#sealArc" textLength="310" lengthAdjust="spacing">${sealText(CITY[s])}</textPath>`)
      && /<svg class="seal"[^>]*aria-hidden="true" focusable="false"/.test(h) && (SEAL[s] !== 'OPENING WITH A LICENSED PARTNER' || /^Opening with a licensed partner\./.test(CITY[s].hero.lead)),
      `${s}: the seal reads "BOOM ${C} · TENANT SIDE · ${SEAL[s]}", derived from the desk's own must-state, decorative`);
    const stamps = [...h.matchAll(/<span class="stamp" aria-hidden="true"><svg[\s\S]*?<textPath href="#stampArc"[^>]*>([^<]+)<\/textPath><\/text><text class="st-w"[^>]*>([^<]+)<\/text><\/svg><\/span>/g)].map((m) => [m[1], m[2]]);
    const sells = CITY[s].checkout === true;
    const want = [[`FILE OPEN · BOOM ${C} · TENANT SIDE · `, 'OPEN'], ...(sells ? [[`PAID · BOOM ${C} · TENANT SIDE · `, 'PAID']] : [])];
    check(JSON.stringify(stamps) === JSON.stringify(want) && sliceOf(h, 'id="cOpen"', '</div>').includes('class="stamp"') && (!sells || sliceOf(h, 'id="cPaid"', '<dl').includes('class="stamp"')),
      `${s}: the SVG stamps — FILE OPEN on the OPEN card${sells ? ', PAID on the paid card' : '; no PAID stamp (no money is taken)'}`, JSON.stringify(stamps));
  }
}

// NETWORK: the sisters and Rome, on a map (decorative) and as a list (the navigation)
{
  const netList = (h) => [...sliceOf(h, '<ul class="net">', '</ul>').matchAll(/<li><a href="\/([a-z]*)"><b data-instr>([A-Z]{3})<\/b> ([^<]+)<\/a><\/li>/g)].map((m) => [m[1], m[2], m[3]]);
  const ams2 = netList(PAGE.amsterdam), par = netList(PAGE.paris);
  check(ams2.map((x) => x[0]).join() === 'barcelona,london,madrid,milan,' && ams2.map((x) => x[1]).join() === 'BCN,LON,MAD,MIL,ROM' && ams2[4][2] === 'BOOM Rome',
    `a live desk links only the live sisters, then BOOM Rome (${ams2.map((x) => x[1]).join(', ')})`);
  check(par.map((x) => x[0]).join() === 'amsterdam,barcelona,berlin,london,madrid,milan,', 'a draft links every sister (the review sees the suite)');
  check(!/<a href="\/(amsterdam|barcelona|berlin|london|madrid|milan|paris)">/.test(sliceOf(html, '<footer class="foot">', '</footer>')), 'the network list replaces the family links of the footer (said once)');
  const fam = familyFor({ slug: 'x', live: true }, [{ slug: 'b', city: 'B', live: false, iata: 'BBB', geo: { lat: 50, lon: 5 } }, { slug: 'a', city: 'A', live: true, iata: 'AAA', geo: { lat: 48, lon: 2 } }], { family: [{ label: 'BOOM Rome', href: '/' }], rome: { geo: shared.rome.geo } });
  check(fam.map((f) => f.href).join() === '/a,/' && fam[0].label === 'A desk' && fam[0].iata === 'AAA' && fam[0].geo.lat === 48 && fam[1].iata === 'ROM' && fam[1].geo === shared.rome.geo,
    'familyFor: live sisters only, alphabetical, labelled "<City> desk" with their IATA and coordinates, then BOOM Rome (ROM, the hub)');
  check(sliceOf(html, '<section class="sec" id="network"', '</section>').includes('<p class="net-c">Every desk answers from Rome.</p>'), 'the caption: "Every desk answers from Rome."');
  for (const s of SLUGS) {
    const h = PAGE[s], map = sliceOf(h, '<svg class="map"', '</svg>');
    const fam2 = familyFor(CITY[s], SLUGS.map((x) => CITY[x]), shared);
    const xy = (g) => mapXY(g).map((v) => Math.round(v * 10) / 10);
    const [mx, my] = xy(CITY[s].geo), [rx, ry] = xy(shared.rome.geo);
    const dots = [...map.matchAll(/<circle class="(d(?: me)?|hub)" cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [m[1], +m[2], +m[3]]);
    const arcs = [...map.matchAll(/<path class="arc( me)?"[^>]*d="M([\d.]+) ([\d.]+)Q[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/g)];
    const inside = dots.every(([, x, y]) => x >= 20 && x <= 580 && y >= 20 && y <= 400);
    const me = dots.find((d) => d[0] === 'd me'), hub = dots.find((d) => d[0] === 'hub');
    const sisters = fam2.filter((f) => f.href !== '/');
    check(/viewBox="0 0 600 420" aria-hidden="true" focusable="false"/.test(map) && inside && me && me[1] === mx && me[2] === my && hub && hub[1] === rx && hub[2] === ry
      && sisters.every((f) => { const [x, y] = xy(f.geo); return dots.some((d) => d[0] === 'd' && d[1] === x && d[2] === y); })
      && arcs.length === sisters.length + 1 && arcs.every((a) => +a[2] === rx && +a[3] === ry) && arcs.filter((a) => a[1]).length === 1 && +arcs.find((a) => a[1])[4] === mx
      && SLUGS.every((x) => validGeo(CITY[x].geo)) && validGeo(shared.rome.geo),
      `${s}: the map's dots are the projected real coordinates, inside the 600×420 viewBox margins (this desk ${mx},${my}; ROM ${rx},${ry}); one arc from Rome per desk, this desk's in gold`);
  }
  // v1.6 review (visual F9): an arc never passes over a desk it does not serve. Read from
  // what is DRAWN (the path's control point, each dot with the mark it carries: 3px, this
  // desk's 10px ring), and the same arc on every page (the bows are chosen over every desk)
  const drawnCtrl = {};
  for (const s of SLUGS) {
    const map = sliceOf(PAGE[s], '<svg class="map"', '</svg>');
    const hub = (map.match(/<circle class="hub" cx="([\d.]+)" cy="([\d.]+)"/) || []).slice(1).map(Number);
    const at = (x, y) => `${x},${y}`;
    const dots = [...map.matchAll(/<circle class="(d|d-ring)" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => ({ key: at(m[2], m[3]), xy: [+m[2], +m[3]], r: +m[4] }));
    const arcs = [...map.matchAll(/<path class="arc(?: me)?"[^>]*d="M[\d.]+ [\d.]+Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/g)].map((m) => ({ key: at(m[3], m[4]), c: [+m[1], +m[2]], to: [+m[3], +m[4]] }));
    for (const a of arcs) (drawnCtrl[a.key] = drawnCtrl[a.key] || new Set()).add(a.c.join());
    const bad = arcViolations(hub, arcs, dots);
    check(hub.length === 2 && arcs.length >= 2 && dots.some((d) => d.r === ARC_ME_R) && bad.length === 0,
      `${s}: every arc drawn from Rome clears every other desk's dot by ≥ ${ARC_CLEAR}px (this desk's ${ARC_ME_R}px ring counted)`, bad.join('; '));
  }
  check(Object.values(drawnCtrl).every((set) => set.size === 1), 'the arc to a desk is the same on every page (one bow per desk, chosen over all of them)',
    JSON.stringify(Object.entries(drawnCtrl).filter(([, v]) => v.size > 1).map(([k, v]) => [k, [...v]])));
  // the check bites: v1.5's control point (the chord's midpoint raised by 0.18 × chord) took ROM → LON through Milan's dot
  const H = mapXY(shared.rome.geo), LON = mapXY(CITY.london.geo), MIL = mapXY(CITY.milan.geo), L = Math.hypot(LON[0] - H[0], LON[1] - H[1]);
  const old = arcViolations(H, [{ key: 'LON', to: LON, c: [(H[0] + LON[0]) / 2, (H[1] + LON[1]) / 2 - 0.18 * L] }], [{ key: 'MIL', xy: MIL, r: ARC_DOT_R }, { key: 'LON', xy: LON, r: ARC_DOT_R }]);
  check(old.length === 1 && /^ROM → LON passes -?\d+\.\dpx from MIL$/.test(old[0]), `(arcViolations catches v1.5's arc: "${old[0]}")`);
  const bows = bowArcs(H, SLUGS.map((x) => [CITY[x].iata, mapXY(CITY[x].geo)]));
  check(bows.size === SLUGS.length && [...bows.values()].every((f) => Math.abs(f) >= 0.12 && Math.abs(f) <= 0.36) && arcViolations(H, SLUGS.map((x) => ({ key: CITY[x].iata, to: mapXY(CITY[x].geo), c: arcCtrl(H, mapXY(CITY[x].geo), bows.get(CITY[x].iata)) })), SLUGS.map((x) => ({ key: CITY[x].iata, xy: mapXY(CITY[x].geo), r: ARC_ME_R }))).length === 0,
    'bowArcs bows every desk (|f| 0.12–0.36) so no arc comes near ANY desk\'s ring, whichever page draws it');
}
// a desk that no bow can serve is a build error, never an arc through a sister:
// one set on the hub's doorstep sits under the start of every other arc
refuses((c) => { c.geo = { lat: 42.15, lon: 12.62 }; check(validGeo(c.geo), '(the doorstep coordinates are a valid geo: only the arcs refuse them)'); },
  /network map: no bow takes the arc ROM → [A-Z]{3} clear of the other desks|draws an arc over a desk/, 'a desk placed where every arc from Rome would cross its dot is refused by the build (no arc through a sister)');

check(/<details class="sheet">\s*<summary>BOOM Amsterdam — fact sheet<\/summary>\s*<dl class="enbref" id="enbref">/.test(html) && /<section class="sec brief" id="enbref-wrap"[^>]*>\s*<span class="corner" aria-hidden="true">Conditions<\/span>/.test(html),
  'the fact sheet is folded for people and whole in the DOM for machines (GEO), on the back of the ticket (CONDITIONS, decorative)');
check(html.includes(`<a href="${WITHDRAWAL_PATH}?desk=Amsterdam">Withdrawal form</a>`) && html.includes(`<a href="/terms#city-desks">Terms</a>`) && html.includes('<a href="/privacy">Privacy</a>')
  && /<nav aria-label="Legal"><h3>Legal<\/h3> <a href="\/terms#city-desks">Terms<\/a> <a href="\/privacy">Privacy<\/a> <a href="\/withdrawal\?desk=Amsterdam">Withdrawal form<\/a><\/nav>/.test(html)
  && /<nav aria-label="Legal"><h3>Legal<\/h3> <a href="\/terms#city-desks">Terms<\/a> <a href="\/privacy">Privacy<\/a><\/nav>/.test(PAGE.paris),
  'the footer\'s Legal column links the Terms §12, the privacy notice and — where the desk sells — the withdrawal form with the desk');
check(html.includes(`<p class="stmt">${esc(ams.footer.statement)}</p>`) && html.includes(`P.IVA ${shared.entity.vat}`) && html.includes(`© ${shared.copyrightYear} BOOM`) && html.includes(`<p class="tm">${esc(shared.entity.trademark)}</p>`),
  'the tenant-side statement, the entity with its VAT number, the trademark, the year from data (never the clock)');
check(/<nav aria-label="This desk"><h3>This desk<\/h3> <a href="mailto:hello@boom-rome\.com">/.test(html) && sliceOf(html, '<nav aria-label="This desk">', '</nav>').includes('<p>Mon–Fri <span class="nw">09:00–19:00</span>, Rome time</p>'),
  'the footer\'s "This desk" column: email, phone, WhatsApp and the desk hours');

// no aviation word that promises what does not exist: a seat, a queue, a
// countdown, a Wallet pass (whole words: "London time" is not "on time")
for (const s of SLUGS) {
  const said = visibleText(PAGE[s].replace(/<!--[\s\S]*?-->/g, ' '));
  const hit = said.match(AVIATION_BAN_RE);
  check(!hit && !/\bON TIME\b/i.test(said.replace(/London time/g, '')) && !/Check-in|Customs/.test(said), `${s}: no seat, admit one, boarding, last or final call, on time, delayed, Wallet, countdown, Check-in or Customs on the page`, hit && hit[0]);
}
check(!AVIATION_BAN_RE.test('Mon–Fri 08:00–18:00, London time') && AVIATION_BAN_RE.test('Departing ON TIME') && AVIATION_BAN_RE.test('3 days left'), 'the aviation ban reads whole words: "London time" passes, "ON TIME" and "3 days left" do not');

// the served HTML never carries a file code: the server's answer fills it
for (const s of SLUGS) check(!/BM [A-HJ-NP-Z2-9]{5}/.test(PAGE[s]) && /<p class="code" id="codeLine">BOOM · [A-Z]{3} · TENANT SIDE · ISSUED ROM<\/p>/.test(PAGE[s]), `${s}: no file code in the served page; the code line reads the issuer only`);

// the config: what the JS reads, no secrets
{
  const cfg = JSON.parse(html.match(/window\.BOOM_CITY = (\{[\s\S]*?\});\n<\/script>/)[1]);
  check(cfg.SLUG === 'amsterdam' && cfg.CHECKOUT === true && cfg.LEAD_URL === '/api/city-lead' && cfg.CHECKOUT_ENDPOINT === '/api/service-checkout' && cfg.DOOR === 'Start with a free call',
    'the config names the desk, its two endpoints (our own API) and the one door');
  check(JSON.stringify(cfg.DESK) === JSON.stringify({ timeZone: ams.desk.timeZone, hours: ams.desk.hours, days: ams.desk.days }) && cfg.HOLIDAYS === 'nl',
    'the config carries the desk clock and its holiday calendar (nl), the key the webhook reads');
  check(Object.keys(cfg.PLANS).join() === 'full-search,application-pack,attended-viewing' && cfg.PLANS['full-search'].eur === 500 && cfg.PLANS['full-search'].rule === true && cfg.PLANS['application-pack'].rule === false,
    'PLANS: the three prices; the refund rule rides only on Full Search');
  check(cfg.TILL.label === 'Pay and start' && cfg.TILL.labelWait === 'Pay and book' && /\{date\}/.test(cfg.PAID.startsWait) && cfg.PAID.nextWait.length === 3 && /not confirmed yet/i.test(cfg.PAID.unconfirmed),
    'the till labels and the PAID strings the page fills from the server\'s answer');
  check(!/key|secret|token|sk_|pk_/i.test(Object.keys(cfg).join() + JSON.stringify(cfg.PLANS)), 'no key, no secret in the config');
  const evil = clone(ams); evil.city = 'Ams</script>';
  check(render(evil).html.includes('"CITY": "Ams\\u003c/script>"'), 'the config JSON cannot close its <script> tag');
}

// ── 3 · JSON-LD says what the page shows ──────────────────────────────────
const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const graph = (ld.find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || [];
const org = graph.find((n) => n['@id'] === `${shared.siteUrl}/#organization`) || {};
const wp = graph.find((n) => n['@type'] === 'WebPage') || {};
const svc = graph.find((n) => n['@type'] === 'Service') || {};
const faqLd = graph.find((n) => n['@type'] === 'FAQPage') || {};
check(ld.length === 2 && ld.some((b) => b['@type'] === 'BreadcrumbList' && b['@id'] === `${shared.siteUrl}/amsterdam#breadcrumb`), 'two JSON-LD blocks: the breadcrumb and the graph');
check(org['@type'] === 'RealEstateAgent' && org.name === 'BOOM Rome' && org.alternateName === 'BOOM' && org.legalName === shared.entity.legalName && JSON.stringify(org.sameAs) === JSON.stringify([shared.rome.profileUrl]),
  'the #organization node is the one the rest of the site declares (RealEstateAgent "BOOM Rome"), sameAs the public profile behind the rating');
check(JSON.stringify(org.areaServed) === JSON.stringify(['Rome', ...SLUGS.filter((s) => CITY[s].live).map((s) => CITY[s].city)]), `areaServed is derived: Rome and the live desks only (${org.areaServed})`);
check(wp.mainEntity['@id'] === `${shared.siteUrl}/amsterdam#service` && wp.description === ams.meta.description && wp.dateModified === ams.updated && wp.author.name === ams.desk.person,
  'the WebPage: main entity the Service, its description, the date it last changed (data) and its author');
check(JSON.stringify(wp.speakable.cssSelector) === JSON.stringify(['.pass .lead', '.foot .stmt', '.enbref']) && html.includes('<p class="lead">') && html.includes('class="stmt"') && html.includes('class="enbref"'),
  'speakable points at nodes that exist (the lead, the statement, the fact sheet)');
{
  const sm = read('sitemap.xml');
  for (const s of SLUGS.filter((x) => CITY[x].live)) {
    const m = sm.match(new RegExp(`<loc>https://www\\.boomrome\\.com/${s}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
    check(!!m && m[1] === CITY[s].updated, `the sitemap <lastmod> of /${s} is the page's "updated" (${CITY[s].updated})`);
  }
  check(!/boomrome\.com\/(paris|berlin)</.test(sm), 'the drafts are not in the sitemap');
}
check(Array.isArray(svc.offers) && svc.offers.length === 3 && svc.offers.every((o, i) => {
  const p = ams.pricing.plans[i];
  return o.name === p.label && o.price === String(p.price) && o.priceCurrency === 'EUR' && o.availability === 'https://schema.org/InStock'
    && o.priceSpecification.valueAddedTaxIncluded === true && o.url === `${shared.siteUrl}/amsterdam#fare-${p.id}` && html.includes(`id="fare-${p.id}"`);
}), 'three Offers = the three fares (price, InStock, VAT included, the url of the row that exists)');
check(svc.offers[0].description.includes(shared.refund.rule) && !svc.offers[1].description.includes('refunded'), 'the Full Search Offer carries the refund rule; the others do not');
check(svc.hoursAvailable.opens === '09:00' && svc.hoursAvailable.dayOfWeek.join() === 'Monday,Tuesday,Wednesday,Thursday,Friday', 'the Service states the desk hours and days');
check(faqLd.mainEntity.length === ams.faq.items.length && faqLd.mainEntity.every((q, i) => q.name === ams.faq.items[i].q && q.acceptedAnswer.text === ams.faq.items[i].a
  && html.includes(`<summary><span class="qn" aria-hidden="true">0${i + 1}</span> <span class="t">${esc(q.name)}</span></summary><p>${esc(q.acceptedAnswer.text)}</p>`)),
  `the FAQPage (${faqLd.mainEntity.length} questions) is the visible FAQ, word for word`);
check(/og-amsterdam\.png\?v=[0-9a-f]{10}/.test(html) && (html.match(/og-amsterdam\.png\?v=/g) || []).length >= 3, 'the social card is declared with its byte hash (og, twitter, primaryImageOfPage): an immutable PNG cannot stay stale in a cache');

// ── 4 · the token engine never prints a hole ──────────────────────────────
check(throws(() => fill('<p>{{nope.here}}</p>', {}, 'x'), /unresolved tokens: nope\.here/) === true, 'a missing field is a build error that names it, never an empty string');
check(throws(() => fill('<p>{{obj}}</p>', { obj: { a: 1 } }, 'x'), /unresolved tokens: obj/) === true, 'an object where text is expected is a build error, not "[object Object]"');
check(throws(() => fill('<p>{{ bad-token }}</p>', {}, 'x'), /malformed tokens/) === true, 'a malformed token cannot slip through as literal braces');
check(fill('<p>{{a}}|{{{a}}}</p>', { a: '<b>"x"</b>' }, 'x') === '<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;|<b>"x"</b></p>', '{{a}} escapes, {{{a}}} is raw');
check(fill('{{n}}·{{e}}', { n: 0, e: '' }, 'x') === '0·', 'zero and empty string are values, not holes');
{
  const evil = clone(ams);
  evil.hero.lead = '<img src=x onerror=alert(1)>';
  evil.how.steps[0].p = '</p><script>alert(1)</script>';
  evil.faq.items[0].a = '<script>alert(2)</script>';
  evil.pricing.plans[1].includes[0] = '<b onmouseover=alert(3)>x</b>';
  evil.papers.items[0] = '<i>x</i>';
  const out = render(evil).html;
  check(!out.includes('<img src=x') && !out.includes('<script>alert(') && !/<b onmouseover/.test(out) && !out.includes('<li><i>x</i>') && out.includes('&lt;img src=x onerror=alert(1)&gt;'),
    'plain fields are escaped in the template AND in every renderer (fares, steps, FAQ, papers)');
}
check(eur(1500) === '€1,500' && eur(199) === '€199' && eur(12500) === '€12,500', 'prices format deterministically (no toLocaleString)');

// ── 5 · the live guard ────────────────────────────────────────────────────
{
  const shNo = clone(shared); shNo.rome.profileUrl = '';
  check(throws(() => render(ams, shNo), /rome\.profileUrl is empty/) === true, 'live:true on a desk that sells without the profile link is refused: a rating that cannot be checked is a claim');
  const photo = clone(ams); photo.hero.lead = 'Your person: [PHOTO].';
  check(throws(() => render(photo), /\[PHOTO\]/) === true, 'live:true with bracketed copy is refused, naming it');
  const fakeWa = clone(ams); fakeWa.config = { WHATSAPP: '39XXXXXXXXXX' };
  check(throws(() => render(fakeWa), /config\.WHATSAPP = 39XXXXXXXXXX/) === true, 'live:true with a placeholder config value is refused');
  const noOg = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-og-'));
  fs.copyFileSync(path.join(R, 'sitemap.xml'), path.join(noOg, 'sitemap.xml'));
  check(throws(() => render(ams, shared, template, noOg), /og-amsterdam\.png is missing/) === true, 'live:true without its social card on disk is refused');
  check(throws(() => render(ams, shared, template, noOg), /withdrawal\.html is missing/) === true, 'live:true on a selling desk without the model withdrawal form on disk is refused (the till links it)');
  const draft = clone(CITY.paris);
  check(render(draft, shared, template, noOg).placeholders.includes('og-paris.png is missing (python3 design/pages-deco/genera-og-cities.py)'), 'a draft without the card builds, and lists the card as the thing to make');
  fs.rmSync(noOg, { recursive: true, force: true });
  const badUrl = clone(shared); badUrl.rome.profileUrl = 'http://maps.google.com/?cid=1';
  check(throws(() => render(ams, badUrl), /rome\.profileUrl must be https/) === true, 'a profile link that is not https is refused');
  const reviewBox = clone(shared); reviewBox.rome.profileUrl = 'https://g.page/r/CfcpUptbNnvZEBM/review';
  check(throws(() => render(ams, reviewBox), /"write a review" link/) === true, 'the "write a review" box is refused as the proof link');
  const stale = clone(ams); stale.updated = '2026-10-01';
  check(throws(() => render(stale), /must be the same date/) === true, 'a live desk whose "updated" differs from its sitemap <lastmod> is refused');
  const noDate = clone(ams); delete noDate.updated;
  check(throws(() => render(noDate), /a live desk declares "updated"/) === true, 'a live desk without "updated" is refused');
}
check(findPlaceholders('<p>[A] ok</p><script>var a=[1,2]</script><style>a[href]{}</style>', { slug: 'amsterdam' }, { root: R }).join() === '[A]', 'placeholders are read from visible text, never from scripts or styles');
check(findPlaceholders('<p>ok</p><input placeholder="[NAME]"><meta name="description" content="BOOM [CITY] works">', { slug: 'amsterdam' }, { root: R }).join('|') === '[NAME] (in an attribute)|[CITY] (in an attribute)',
  'placeholders in attribute values are found too');

// ── 6 · the data refusals (each proven by mutating the real data) ─────────
// the quiz and the v1.4 hero cannot come back through a stale JSON
for (const k of ['checkin', 'glance', 'plan', 'facts', 'factsDerived', 'nav', 'machine', 'paybar']) refuses((c) => { c[k] = {}; }, new RegExp(`"${k}" is a leftover`), `the leftover "${k}" is refused by name`);
refuses((c) => { c.hero.faresNote = 'x'; }, /hero\.faresNote is a leftover/, 'hero.faresNote (v1.4) is refused');
refuses((c) => { c.form.moveIn = { label: 'x' }; }, /form\.moveIn is a leftover/, 'form.moveIn (the month select) is refused: the free call asks a name and one contact');
refuses((c) => { c.form.email = { label: 'x' }; }, /form\.email is a leftover/, 'form.email (two fields) is refused: one contact field');
refuses((c) => { c.pricing.plans[0].prepares = ['letter']; }, /plan "full-search": prepares is a leftover/, 'plan.prepares (the papers meter) is refused');
refuses((c) => { c.door.sub = 'free · same day'; }, /door\.sub is a leftover/, 'door.sub is refused: the sub-line is the desk window, computed');
refuses((c) => { c.checkoutCopy.offer = 'x'; }, /checkoutCopy\.offer is a leftover/, 'checkoutCopy.offer (the post-file offer) is refused: the till opens from a ticket only');
{
  const sh = clone(shared); sh.moveInFrom = '2026-11';
  check(throws(() => render(ams, sh), /moveInFrom is a v1\.4 leftover/) === true, '_shared.json moveInFrom is refused (the month select left the page)');
  const sh2 = clone(shared); sh2.contact.waPlan = 'My plan: {plan}';
  check(throws(() => render(ams, sh2), /waPlan is a v1\.4 leftover/) === true, '_shared.json contact.waPlan is refused: no WhatsApp link carries a plan');
  const sh3 = clone(shared); sh3.contact.waText = 'Hi BOOM {city}, Full Search €500';
  check(throws(() => render(ams, sh3), /contact\.waText \(with \{city\}, no price\)/) === true, 'a WhatsApp prefill with a price is refused');
  const sh4 = clone(shared); sh4.refund.rule = 'Full Search can be refunded.';
  check(throws(() => render(ams, sh4), /refund\.rule is the one sentence of the policy/) === true, 'the refund rule must be the policy sentence, word for word');
}
// the must-states (brief §4), verbatim
refuses((c) => { c.hero.leadStrong = 'We work for you.'; }, /Amsterdam's must-state is verbatim|leadStrong is its must-state/, 'Amsterdam without "We work exclusively for you; never paid by landlords." is refused');
refuses((c) => { c.hero.leadStrong = 'Paid by you; never paid by landlords.'; }, /Amsterdam's must-state is verbatim/, 'Amsterdam\'s must-state is verbatim, not a paraphrase that keeps the words "never paid by landlords"');
refuses((c) => { c.hero.leadStrong = 'We act for you; we do not act for the landlord'; }, /on a Spanish desk the must-state is verbatim/, 'Madrid without "You hire us; we do not act for the landlord." is refused', 'madrid');
refuses((c) => { c.hero.lead = 'We search for you.'; }, /lead opens with "Opening with"/, 'a waitlist lead that does not open "Opening with" is refused', 'paris');
refuses((c) => { c.hero.lead = 'We search, apply, attend the viewings, negotiate the rent, check the lease, confirm the registration and stay with you from the first message to the keys.'; }, /words, over 30/, 'a lead over its 30 words is refused');
// Spain: LAU art. 20 on the first screen and in the till
refuses((c) => { c.hero.faresHead.b = 'Flat fees'; }, /hero\.faresHead\.b is "Optional, chosen in writing"/, 'a Spanish selling desk whose fares do not open "Optional, chosen in writing" is refused', 'madrid');
refuses((c) => { delete c.pricing.sub; }, /pricing\.sub opens "Optional, chosen in writing"/, 'a Spanish selling desk without the till line is refused', 'barcelona');
refuses((c) => { c.checks.items = c.checks.items.filter((k) => k.id !== 'fees'); }, /LAU art\. 20/, 'a Spanish desk without "Who pays the agent · LAU art. 20" is refused', 'barcelona');
refuses((c) => { c.faq.items = c.faq.items.filter((f) => !/landlord who pays/i.test(f.q)); }, /landlord-pays question/, 'a Spanish desk without the landlord-pays FAQ is refused', 'madrid');
refuses((c) => { c.pricing.sub = 'Optional, chosen in writing.'; }, /pricing\.sub is the Spanish till line/, 'pricing.sub on a non-Spanish desk is refused');
// waitlists: list prices say when they are charged
refuses((c) => { c.hero.faresHead.span = 'Flat fees, no percentage'; }, /says when \(or that nothing is\) charged/, 'a waitlist faresHead that does not say when it is charged is refused', 'paris');
refuses((c) => { c.pricing.plans[1].condition = 'flat · incl. VAT'; }, /a waitlist plan says when it is charged/, 'a waitlist plan without "at opening" is refused', 'paris');
refuses((c) => { c.pricing.plans[0].condition = 'at opening · incl. VAT'; c.pricing.plans[0].conditionLong = 'Charged when the desk opens, VAT included.'; }, /Full Search is due only once a lease is signed/, 'Berlin\'s Full Search without "sign" (WoVermRG §2–§3) is refused', 'berlin');
refuses((c) => { c.pricing.plans[0].condition = 'at opening · incl. VAT'; }, /never "at opening"/, 'a selling desk\'s plan "at opening" is refused');
// the plans
refuses((c) => { c.pricing.plans.reverse(); }, /in that order/, 'the plans out of the server\'s order are refused (CITY_PLANS sells by these ids)');
refuses((c) => { c.pricing.plans[2].condition = 'per viewing'; }, /must say VAT/, 'a condition without VAT is refused: the total price is the price');
refuses((c) => { c.pricing.plans[0].when = 'If you have not started searching for a home in the city yet'; }, /"when" line is \d+ words, over 9/, 'a "when" line too long for the fare row is refused');
refuses((c) => { c.pricing.plans[1].includes = ['Only one line']; }, /2–5 lines/, 'a ticket with fewer than two "what the fee buys" lines is refused');
refuses((c) => { c.pricing.plans[0].includes = c.pricing.plans[0].includes.filter((x) => !/more: €149 each/.test(x)); }, /\(more: €149 each\)/, 'Full Search on a selling desk must say one viewing is included and the rest priced');
refuses((c) => { c.pricing.plans[0].includes = c.pricing.plans[0].includes.filter((x) => !/Until you sign, or you say stop/.test(x)); }, /Until you sign, or you say stop/, 'Full Search must say how long it runs (the founder, 22/10)');
refuses((c) => { c.pricing.plans[0].featured = true; }, /plan\.featured is a key the page does not read/, 'plan.featured (the v1.4 pay bar sold it) is refused: the page reads no such key');
refuses((c) => { c.bref.ref = 'REF · AMSTERDAM'; }, /bref\.ref is a key the page does not read/, 'bref.ref is refused: a string nobody sees is a string everybody believes is live');
refuses((c) => { c.hero2 = { lead: 'x' }; }, /hero2 is a key the page does not read/, 'an unknown top-level key is refused (an allow-list, not a deny-list)');
refuses((c) => { c.checkoutCopy.paid.recourse = 'Nothing by then?'; }, /checkoutCopy\.paid\.recourse is a key the page does not read/, 'a dead PAID line is refused');
// the door, the clock, the call
refuses((c) => { c.door.label = 'Open my file'; }, /door\.label is "Start with a free call"/, 'a selling desk\'s door must read "Start with a free call"');
refuses((c) => { c.door.label = 'Start with a free call'; }, /door\.label is "Open my file"/, 'a waitlist door must read "Open my file" (it takes no call)', 'paris');
for (const [what, mut] of [['24 hours', (c) => { c.pricing.plans[1].offerDescription = 'Your dossier within 24 hours.'; }],
  ['24h', (c) => { c.how.steps[1].h = 'Dutch-format, in 24h'; }], ['24-hour', (c) => { c.meta.description = 'A 24-hour Dutch-format dossier for expats in Amsterdam, tenant side only, viewings attended and contract checked before you sign.'; }],
  ['within an hour', (c) => { c.pricing.plans[0].includes[1] = 'Applications within an hour of a listing'; }], ['<1h', (c) => { c.how.steps[2].p = 'Applications sent <1h after a listing appears.'; }]]) {
  refuses(mut, /no clock promise in the copy/, `a clock promise ("${what}") is refused on any desk: the desk is Mon–Fri 09–19`);
}
refuses((c) => { c.stub.notSure = 'Not sure? Book a call with us.'; }, /promises no call/, 'a waitlist "not sure" line that promises a call is refused', 'berlin');
refuses((c) => { c.faq.items[0].a += " We'll phone you to talk it through."; }, /promises no call/, 'a waitlist promising to phone you, in other words, is refused', 'paris');
refuses((c) => { c.stub.notSure = 'Until it opens nothing is charged. Ask for a callback.'; }, /promises no call/, 'a waitlist offering a callback is refused', 'paris');
refuses((c) => { c.desk.hours = { from: '19:00', to: '09:00' }; }, /from before to/, 'desk hours backwards are refused');
refuses((c) => { c.desk.timeZone = 'Europe/Atlantis'; }, /not a time zone Intl accepts/, 'a desk time zone Intl does not know is refused');
refuses((c) => { c.desk.person = '[NAME]'; }, /desk\.person is the named person/, 'the desk person must be a named person');
// the form
refuses((c) => { c.form.sentNext = c.form.sentNext.slice(0, 2); }, /form\.sentNext is three/, 'the OPEN card needs its three lines');
refuses((c) => { c.form.errors.net = ''; }, /form\.errors needs name, contact, email and net/, 'every form error is required');
// the till (CRD)
refuses((c) => { c.till.labelWait = 'Pay and start now'; }, /never "start"/, 'the button before the tick never says "start" (the work waits for the 14 days)');
refuses((c) => { c.till.label = 'Pay €500'; }, /till needs label/, 'a till label carrying a price is refused (the price comes from the plan)');
refuses((c) => { c.checkoutCopy.btnSubWait = 'Starts later'; }, /btnSubWait says the 14 days/, 'btnSubWait must say the 14 days');
refuses((c) => { c.checkoutCopy.btnSubNow = 'Starts today'; }, /never promises "today"/, 'btnSubNow never promises today');
refuses((c) => { c.checkoutCopy.fine = 'Secure card payment by Stripe.'; }, /must state the refund policy/, 'the fine print must state the refund policy');
refuses((c) => { c.checkoutCopy.startNow = 'Start now.'; }, /payer's own request to start/, 'the start-now line must be the payer\'s request, with the right that ends once fully performed');
refuses((c) => { c.checkoutCopy.withdrawal = 'You can withdraw within 14 days.'; }, /14-day withdrawal right/, 'the withdrawal line must name the email and link the model form');
refuses((c) => { c.checkoutCopy.paid.startsWait = 'When your 14 days end'; }, /paid\.startsWait carries \{date\}/, 'the PAID start date for a payer who waits is the server\'s date ({date})');
refuses((c) => { c.checkoutCopy.paid.startsWait = '{date}, when your 14 days end'; }, /never calls \{date\} the day the 14 days end/, 'the PAID card never calls the work\'s first day the end of the 14 days (the webhook\'s date is the first working day AFTER them: the right to withdraw would read days longer than it is)');
refuses((c) => { c.checkoutCopy.paid.nextWait[0][1] = 'the desk writes the same working day'; }, /nextWait never "same working day"/, 'the steps of a payer who waits never promise the same working day');
refuses((c) => { c.checkoutCopy.altLink = 'Open a file instead'; }, /must start with door\.label/, 'the way out of the till is the page\'s one door');
refuses((c) => { c.checkout = true; c.till = clone(ams.till); c.checkoutCopy = clone(ams.checkoutCopy); }, /a waitlist city cannot open a checkout/, 'a waitlist city with checkout:true is refused: shown is not charged', 'paris');
refuses((c) => { c.till = clone(ams.till); }, /till and checkoutCopy belong only to a desk with the checkout open/, 'a till on a desk without the checkout is refused', 'paris');
// the below
refuses((c) => { c.papers.items = c.papers.items.slice(0, 7); }, /the eight papers/, 'the papers list is the eight papers');
refuses((c) => { c.faq.items = c.faq.items.slice(0, 2); }, /three to six questions/, 'fewer than three questions is refused');
refuses((c) => { c.faq.items[0].q = "I'm moving from Rome with BOOM — can you help?"; }, /moving from Rome/, 'the "moving from Rome" FAQ (v1.3) stays off the page');
refuses((c) => { c.bref.rows = c.bref.rows.filter((r) => r.dt !== "What we don't do"); }, /What we don't do/, 'the fact sheet keeps "What we don\'t do" (a source that says its limits is a source that is quoted)');
refuses((c) => { c.word = 'AMSTERDAMNORTHHOLLAND'; }, /2–12 letters/, 'a board word over 12 letters is refused (the drum has no room)');
refuses((c) => { c.iata = 'Ams'; }, /"iata" \(three upper-case letters\)/, 'the stub destination is three upper-case letters');
// the word budgets bite on the OUTPUT (not only the data)
refuses((c) => { c.pricing.plans[0].includes[0] += ', and a very long extra clause about everything else we do for you on the Full Search, from the brief to the keys, the registration and the first week'; }, /ticket is \d+ words, over 60/, 'a ticket over its 60 words is refused');
refuses((c) => { for (const k of c.how.steps) k.p += ' ' + 'Every word here is read at load, so the page cannot quietly grow back past the budget the founder set for it.'.repeat(5); }, /visible words at load, over the 640 budget/, 'the page over its 640 words at load is refused: it cannot grow back');
// v1.6: the prose has its own cap under the total (the richness comes from
// instruments, not paragraphs), and no text node runs past 24 words
{
  const q24 = (i, head) => `${head} ${'about the rent the papers the flat and the street'.split(' ').concat('in this city for the people who move here from far away to work'.split(' ')).slice(0, 24 - head.split(' ').length).join(' ')}`;
  const six = (c) => {
    const base = c.faq.items;
    c.faq.items = [0, 1, 2, 3, 4, 5].map((i) => ({ q: q24(i, i === 0 ? "Isn't it the landlord who pays the agent here," : `Question ${'abcdef'[i]} asks`), a: (base[i] || base[base.length - 1]).a }));
    check(c.faq.items.every((f) => words(f.q) === 24), '(the six questions are 24 words each: none breaks the node rule)');
  };
  refuses(six, /words of prose at load, over the 520 budget/, 'six 24-word questions push the prose past its 520 words (under the 640 total): refused', 'barcelona');
  refuses((c) => { c.how.steps[0].p = 'Dates, budget, who is moving, the areas you like, the commute you can live with, and what your budget really buys today in this city, said plainly.'; check(words(c.how.steps[0].p) === 27, '(the step line is 27 words)'); },
    /a text node over 24 words at load/, 'a Departures line over 24 words is refused by the node rule (an instrument, not a paragraph)');
  const tooLong = clone(ams); tooLong.how.steps[1].p = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
  check(longNodes(atLoadParts(render(clone(ams)).html).html).length === 0 && /a text node over 24 words/.test(String(throws(() => render(tooLong), /x^/))), 'longNodes: the page as built has no node over 24 words; a 30-word step is caught');
}

// ── 6b · v1.6: the terminal walk refuses instead of lying ─────────────────
// the Departures statuses: a fact about the step, never a flight remark
refuses((c) => { c.how.steps[1].status = 'BOARDING'; }, /is a flight remark/, 'a status "BOARDING" is refused (a flight remark, not a fact about the step)');
refuses((c) => { c.how.steps[2].status = 'NOW OPEN'; }, /is a flight remark/, 'a status "NOW OPEN" is refused (NOW is a remark)');
refuses((c) => { c.how.steps[2].status = 'ONLY 2 LEFT'; }, /is a flight remark/, 'a status "ONLY 2 LEFT" is refused (scarcity is never a status)');
refuses((c) => { c.how.steps[1].status = 'ONE WORK DAYS'; }, /2–12 characters \(a 12-cell board\)/, 'a 13-character status is refused (the board has 12 cells)');
refuses((c) => { c.how.steps[0].status = 'free'; }, /upper-case letters, digits and spaces/, 'a lower-case status is refused');
refuses((c) => { c.how.steps[1].status = '24H'; }, /no clock promise in the copy/, 'a status "24H" is refused (a clock promise the desk cannot keep)');
refuses((c) => { c.how.steps[1].status = 'CALL'; }, /promises no call/, 'a status "CALL" on a desk still opening is refused (it takes no call)', 'paris');
refuses((c) => { c.how.steps[1].status = 'FILE CHECK'; }, /FREE on step 1 and the partner or the opening/, 'a desk still opening says the partner or the opening on steps 2 and 3, never a service it does not run yet', 'berlin');
refuses((c) => { c.how.steps[0].k = '2 · Brief'; }, /must read "1 · <step name>"/, 'a step whose number is not its row is refused (the board prints N° from k)');
refuses((c) => { delete c.how.steps[2].status; }, /how\.steps\[2\]\.status/, 'a step without its status is refused');
// the item allow-lists: a key nobody prints is refused — the rejected proposals' keys first
refuses((c) => { c.checks.items[0].verdict = 'OK'; }, /checks\.item\.verdict is a key the page does not read/, 'a check "verdict" is refused (no verdicts, no ticks: we check, we do not certify)');
refuses((c) => { c.how.steps[0].when = 'Today'; }, /how\.step\.when is a key the page does not read/, 'a step "when" is refused (no promised day on the board)');
refuses((c) => { c.faq.items[0].tag = 'new'; }, /faq\.item\.tag is a key the page does not read/, 'an unknown key on a question is refused');
for (const k of ['ops', 'flight', 'rules', 'routeMap']) refuses((c) => { c[k] = {}; }, new RegExp(`"${k}" is a leftover`), `the rejected proposals' key "${k}" is refused by name`);
// the map: real public coordinates, inside the map
refuses((c) => { delete c.geo; }, /"geo" \{lat, lon\} is required/, 'a desk without "geo" is refused (the Network map places it)');
refuses((c) => { c.geo = { lat: 70, lon: 5 }; }, /"geo" \{lat, lon\} is required/, 'a latitude of 70 is refused (outside western Europe and outside the map)');
refuses((c) => { c.geo = { lat: '52.37', lon: 4.9 }; }, /"geo" \{lat, lon\} is required/, 'a latitude written as text is refused');
{
  const sh = clone(shared); delete sh.rome.geo;
  check(throws(() => render(ams, sh), /rome\.geo \{lat, lon\} is required/) === true, '_shared.json without rome.geo is refused (the hub of the map)');
  const XY = SLUGS.map((s) => [s, ...mapXY(CITY[s].geo)]);
  check(XY.every(([, x, y]) => x >= 20 && x <= 580 && y >= 20 && y <= 400) && validGeo(shared.rome.geo) && !validGeo({ lat: 52, lon: 40 }) && !validGeo({ lat: 64, lon: -21 }),
    `every desk projects inside the 600×420 map (${XY.map(([s, x, y]) => `${s} ${Math.round(x)},${Math.round(y)}`).join(' · ')}); Moscow and Reykjavik would not`);
}
// the Baggage heading, the seal
refuses((c) => { c.papers.summary = 'Documents'; }, /papers\.summary must read "The papers a\/an … asks for"/, 'papers.summary "Documents" is refused (the Baggage heading is split from it)');
refuses((c) => { c.hero.lead = 'Opening with a call from a licensed partner. Until it opens we file your request.'; }, /promises no call/, 'a waitlist seal that would read "call" is refused (the seal derives from the lead; a desk still opening promises no call)', 'paris');
check(/CALL/.test(sealText({ ...clone(CITY.paris), hero: { ...CITY.paris.hero, lead: 'Opening with a call. Later.' } })), '(the seal derives the waitlist phrase from the lead\'s first sentence: a "call" there would reach the ring)');
refuses((c) => { c.hero.leadStrong = 'We work for you, only.'; }, /leadStrong is its must-state|issuer seal cannot derive its phrase/, 'a selling desk whose leadStrong carries no must-state has no seal to print: refused', 'london');
// Spain: the LAU art. 20 lane is the first one
refuses((c) => { c.checks.items.push(c.checks.items.shift()); }, /as the first lane/, 'a Spanish desk whose "Who pays the agent · LAU art. 20" is not the first Pre-flight lane is refused', 'madrid');

// ── 7b · v1.6: the output refusals (each proven by mutating the template) ─
tplRefuses('  <symbol id="boomPlane"', '  <symbol id="boomPlane" viewBox="0 0 24 24"><path d="M0 0"/></symbol>\n  <symbol id="boomPlane"', /one SVG plane symbol/, 'a second plane symbol is refused (ONE plane, on the route)');
tplRefuses('<h2 id="deskH">Who answers, <span class="g">and when.</span></h2>', '<h2 id="deskH">Who answers, and when.</h2>', /exactly one gold phrase/, 'a section h2 without its gold phrase is refused');
tplRefuses('<h2 id="deskH">Who answers, <span class="g">and when.</span></h2>', '<h2 id="deskH"><span class="g">Who answers,</span> <span class="g">and when.</span></h2>', /exactly one gold phrase/, 'a section h2 with two gold phrases is refused');
tplRefuses('<p class="eb" data-instr>Gate</p>', '', /opens with its eyebrow/, 'a section without its eyebrow is refused');
tplRefuses('<p class="proof">', '<p class="proof"><small data-window="{w}">x</small>', /exactly two \[data-window\] nodes/, 'a third [data-window] node is refused (the door and the strip only)');
tplRefuses('<a href="#papers">Papers</a>', '<a href="#bags">Papers</a>', /wayfinding links land on ids that exist/, 'a wayfinding link to an id that does not exist is refused');
tplRefuses('id="topGo" type="button" hidden><b>{{door.label}}</b>', 'id="topGo" type="button" hidden><b>Book a slot</b>', /#topGo reads door\.label/, 'a header twin with another label is refused (one label, four doors)');
tplRefuses('<p class="proof">', '<p class="proof">Boarding now · ', /no seat, "admit one", boarding/, 'an aviation promise ("Boarding now") is refused');
tplRefuses('<p class="proof">', '<p class="proof">Only 3 days left · ', /no seat, "admit one", boarding/, 'a countdown ("3 days left") is refused');
tplRefuses('<p class="proof">', '<p class="proof">Add it to your Wallet · ', /no seat, "admit one", boarding/, 'a Wallet promise is refused (there is no pass)');
tplRefuses('<p class="proof">', '<p class="proof">Your file BM 7K2QX · ', /no file code/, 'a file code in the served page is refused (only the server prints one)');
// the price, refund and call scans read SVG <text> too (visibleText takes it)
tplRefuses('<p class="proof">', '<p class="proof"><svg aria-hidden="true"><text x="0" y="9">Full Search from €129</text></svg>', /a price the plans do not charge is stated on the page: €129/, 'a price written in SVG <text> no plan charges is refused (decorative is not invisible)');
tplRefuses('<p class="proof">', '<p class="proof"><svg aria-hidden="true"><text x="0" y="9">Full Search €500</text></svg>', /stands without the refund rule/, 'a €500 in SVG <text> without the refund rule is refused');
tplRefuses('<p class="proof">', '<p class="proof"><svg aria-hidden="true"><text x="0" y="9">We call you back</text></svg>', /promises no call anywhere/, 'a call promised in SVG <text> on a desk still opening is refused', 'paris');

// ── 7 · the output refusals (each proven by mutating the template) ────────
tplRefuses('<!-- FARES -->\n{{{faresHtml}}}', '<!-- FARES -->\n<p>Full Search €500</p>\n{{{faresHtml}}}', /stands without the refund rule/, 'a €500 printed outside the fares, the till and the fees row without the refund rule is refused');
tplRefuses('<p class="proof">', '<p class="proof">Rated 4.9 on Google — ', /the Rome rating appears once/, 'a second, unlabelled rating is refused');
refuses((c) => { c.hero.lead = 'Rated ★4.9 · 47 reviews. We search, apply, attend the viewings.'; }, /the Rome rating appears once/, 'a star rating written any other way is refused (the desk has no reviews of its own)');
refuses((c) => { c.faq.items[1].a += ' Rated 4.9 by 47 clients.'; }, /the Rome rating appears once|a price the plans/, 'a rating hidden in a FAQ answer is refused');
// every price is a plan's price: a repriced plan cannot leave a stale figure
refuses((c) => { c.pricing.plans[2].price = 169; }, /more: €169 each|a price the plans do not charge/, 'repricing Attended Viewing without its mentions (the Full Search line, the FAQ) is refused: the stale €149 cannot stay');
refuses((c) => { c.meta.description = 'Apartment search from €129 for expats in Amsterdam, tenant side only: a Dutch-format dossier, applications, viewings attended, contract checked.'; }, /a price the plans do not charge is stated on the page: €129/, 'a price in a meta description that no plan charges is refused');
refuses((c) => { c.pricing.plans[2].offerDescription += ' From €99.'; }, /a price the plans do not charge is stated on the page: €99/, 'a price in an Offer description (JSON-LD) that no plan charges is refused');
// every €500 inside its own block with the rule
refuses((c) => { c.pricing.plans[1].includes[0] = 'Upgrade to Full Search (€500) at any time'; }, /stands without the refund rule in its own block/, 'a €500 inside another fare\'s ticket is refused (the old check never scanned the other rows)');
refuses((c) => { c.pricing.plans[2].when = 'Cheaper than €500 Full Search'; }, /stands without the refund rule|"when" line is/, 'a €500 on a closed fare row other than Full Search is refused');
refuses((c) => { const q = c.faq.items.find((f) => /scam/i.test(f.q)); q.a += ' Full Search costs €500.'; }, /stands without the refund rule in its own block/, 'a €500 in a FAQ answer without its own refund sentence is refused, whatever the neighbouring answer says');
refuses((c) => { c.service.description += ' Full Search €500.'; }, /in the JSON-LD stands without the refund rule/, 'a €500 in a JSON-LD string without the rule is refused');
tplRefuses('<a class="skip" href="#main">Skip to content</a>', '<a class="skip" href="#main">Skip to content</a><div id="checkin"></div>', /the quiz, its ticket/, 'the Check-in node cannot come back');
tplRefuses('<a class="skip" href="#main">Skip to content</a>', '<a class="skip" href="#main">Skip to content</a><span>✈</span>', /no ✈/, 'the airplane glyph cannot come back');
tplRefuses('<p class="proof">', '<p class="proof">Book now! ', /no exclamation mark/, 'an exclamation mark in the copy is refused');
tplRefuses('<p class="proof">', '<p class="proof">Trusted by 500+ expats · ', /no "500\+"/, '"500+" is refused');
tplRefuses('<a class="pill" id="topWa" href="{{contact.waHref}}"', '<a class="pill" id="topWa" href="https://wa.me/393313251961"', /desk marker/, 'a WhatsApp link without the desk marker is refused');
tplRefuses('<button class="st-go" id="stripGo" type="button">{{door.label}}</button>', '<button class="st-go" id="stripGo" type="button">Book a viewing</button>', /the door and the strip read door\.label/, 'a second label on the strip is refused');
tplRefuses('<p class="st-t">{{city}}', '<p class="st-t">{{city}} · from €149', /the strip carries no price/, 'a price on the strip is refused');
tplRefuses('<a class="skip" href="#main">Skip to content</a>', '<a class="skip" href="#main">Skip to content</a><a href="https://buy.stripe.com/x">Pay</a>', /no Stripe reference/, 'a Stripe link on a waitlist page is refused', 'paris');
tplRefuses('<p class="proof">', '<p class="proof" title="We call you back within a day">', /promises no call anywhere/, 'a waitlist page that promises a call even in an attribute is refused', 'paris');
tplRefuses('<p class="proof">', '<p class="proof">Pay by bank transfer · ', /no bank transfer/, 'a bank transfer on a waitlist page is refused', 'berlin');
{
  // the till, mutated in the renderer's output order: pre-ticked, reordered
  const c = clone(ams);
  const out = render(c).html;
  const tick = out.replace('<input type="checkbox" id="tStart">', '<input type="checkbox" id="tStart" checked>');
  check(tick !== out && /id="tStart" checked/.test(tick), '(the till carries the start-now box)');
  const till = sliceOf(out, '<dialog class="till"', '</dialog>');
  const at = (s) => till.indexOf(s);
  check(at('id="tTitle"') < at('id="tStart"') && at('id="tStart"') < at('class="wd"') && at('class="wd"') < at('id="tGo"') && at('id="tGo"') < at('class="fine"') && at('class="fine"') < at('id="tAlt"'),
    'the till, in the order the law asks: the plan and its price, the start-now request, the withdrawal line, the pay button, the fine print, the way back to the free door');
  check(/<input type="checkbox" id="tStart">/.test(till) && !/id="tStart"[^>]*checked/.test(till), 'the start-now box is never pre-ticked');
  check(till.includes(`href="${WITHDRAWAL_PATH}?desk=Amsterdam" target="_blank" rel="noopener">model withdrawal form</a>`) && till.includes(`href="${TERMS_PATH}"`), 'the withdrawal line links the model form with the desk; the fine print links the Terms §12');
  check(till.includes('<b id="tGoL">Pay and book</b><small id="tGoS">Starts when your 14 days end · Stripe</small>') && till.includes('data-label-now="Pay and start"'), 'the pay button reads "Pay and book" until the box is ticked');
  check(till.includes(`<p class="refund" id="tRule" hidden>${esc(shared.refund.rule)}</p>`), 'the till carries the refund rule (shown on Full Search)');
  const madTill = sliceOf(PAGE.madrid, '<dialog class="till"', '</dialog>');
  check(madTill.includes(`<p class="t-opt">${esc(CITY.madrid.pricing.sub)}</p>`) && madTill.indexOf('class="t-opt"') < madTill.indexOf('id="tGo"'), 'Madrid\'s till repeats "Optional, chosen in writing" before the pay button');
}
{
  // the refund rule beside every €500 on a selling desk: the ticket, the
  // closed row, the till, the fees row — and a missing one is refused
  const fsRow = sliceOf(html, '<details class="fare" name="fare" id="fare-full-search"', '<!-- /FARES -->');
  check(fsRow.includes(`<p class="refund">${esc(shared.refund.rule)}</p>`) && fsRow.includes(`<p class="refund fs">${esc(shared.refund.rule)}</p>`), 'the refund rule sits inside the Full Search ticket and under its closed row');
  check(sliceOf(html, '<dt>Fees</dt>', '</dd>').includes(shared.refund.rule), 'and on the fees row of the fact sheet');
  check(feesRowOf(ams, shared).startsWith('<b>Full Search €500</b> · <b>Application Pack €199</b> · <b>Attended Viewing €149</b> per viewing.') && feesRowOf(CITY.berlin, shared).includes('<b>Full Search €500</b> (List price. Due only once you sign a lease; nothing before.)'),
    'the fees row is DERIVED from the plans: one condition when they agree, each plan\'s own when they differ (Berlin)');
}

// ── 8 · the five desks, each its own truth ────────────────────────────────
{
  const { CITY_MARKETS, CITY_PLANS } = await import('../../api/_market.js');
  for (const s of SLUGS) {
    const c = CITY[s], h = PAGE[s], m = CITY_MARKETS[s];
    check(m && m.mode === c.mode && (m.checkout === true) === (c.checkout === true), `${s}: the server's registry says ${m.mode}${m.checkout ? ' with the till' : ''}, like the page`);
    check(c.pricing.plans.every((p) => CITY_PLANS[p.id] && CITY_PLANS[p.id].eur === Number(p.price) && CITY_PLANS[p.id].label === p.label),
      `${s}: the prices on the page are the prices the server charges (CITY_PLANS: ${c.pricing.plans.map((p) => p.label + ' ' + eur(p.price)).join(', ')})`);
    // a desk that sells counts the withdrawal on its own calendar: the page's
    // window must read THAT one; a desk still opening (fr, de: no calendar
    // yet) reads Italy's, where its desk sits — said, never guessed
    if (c.checkout === true) check(holidayKeyOf(s) === (m.holidays || m.country) && CAL.HOLIDAY_KEYS.includes(holidayKeyOf(s)), `${s}: the page's desk window reads the webhook's calendar (${holidayKeyOf(s)}), a calendar that exists`);
    else check(holidayKeyOf(s) === m.country && !CAL.HOLIDAY_KEYS.includes(m.country) && CAL.isHoliday(2026, 8, 15, m.country) && CAL.isHoliday(2026, 12, 25, m.country), `${s}: a desk still opening reads the Italian calendar of the desk (key ${m.country} has no calendar of its own yet)`);
    check(c.pricing.plans.every((p) => h.includes(`data-plan-price="${p.id}">${money(p.price, currencyOf(s))}</span>`)), `${s}: every desk shows its list prices, in its own currency`);
    check(!/two months at most|extra guarantees two months/i.test(JSON.stringify(c)), `${s}: no "extra guarantees two months at most" (it waits for counsel after the 12/11 vote on RDL 29/2026)`);
  }
  for (const s of ['paris', 'berlin']) {
    const h = PAGE[s];
    check(!/id="till"|data-pay=|id="cPaid"|id="cConfirm"/.test(h) && !/stripe/i.test(h) && h.includes('"CHECKOUT": false'), `${s}: no till, no pay button, no paid card, no Stripe word`);
    check(!/refunded in full|bank transfer/i.test(h), `${s}: no refund rule and no bank transfer: no money is taken there`);
    const said = (visibleText(h) + ' ' + [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(' '));
    check(!/\bcall(s|ed|ing)?\b/i.test(said), `${s}: no call promised anywhere (text and JSON-LD)`);
    check(h.includes('<b id="doorL">Open my file</b>') && h.includes('<small data-window="free · {w}">free · '), `${s}: the door reads "Open my file", free`);
    const svcLd = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => b['@graph'])['@graph'].find((n) => n['@type'] === 'Service');
    check(svcLd.offers.every((o) => o.availability === 'https://schema.org/PreOrder' && /opens|sign/i.test(o.description) && !/refunded/.test(o.description)), `${s}: its Offers are PreOrder and say when they are charged`);
  }
  check(CITY.berlin.hero.faresHead.span === 'Nothing charged today' && /data-plan-price="full-search">€500<\/span><span class="f-cond">flat ·<br> incl\. VAT · on signing<\/span>/.test(PAGE.berlin),
    'berlin: nothing is charged today, and Full Search says on its own row that it is due only once you sign (WoVermRG §2–§3)');
  check(/Catalan or Spanish/.test(CITY.barcelona.checkoutCopy.fine) && /fulls oficials/i.test(PAGE.barcelona), 'barcelona: documents in Catalan or Spanish on request, the official complaint forms named');
  for (const s of ['madrid', 'barcelona']) {
    const h = PAGE[s];
    check(h.includes('<b id="faresH">Optional, chosen in writing</b>') && h.includes('<b>You hire us; we do not act for the landlord.</b>'), `${s}: the prices open "Optional, chosen in writing"; the must-state in bold`);
    check(/<details class="lane rv" id="check-fees" style="--i:0"><summary><span class="ln" aria-hidden="true">01<\/span> <span class="at" data-instr>LAU art\. 20<\/span> <span class="t">[^<]+<\/span><\/summary>/.test(h) && CITY[s].checks.items[0].id === 'fees',
      `${s}: the check "Who pays the agent · LAU art. 20" is the FIRST Pre-flight lane`);
  }
  check(!/AICAT/.test(PAGE.barcelona.replace(/<!--[\s\S]*?-->/g, '')), 'barcelona: no AICAT registration is claimed anywhere (there is no number to print)');
  for (const s of ['paris', 'berlin']) {
    const extra = CITY[s].pricing.plans.flatMap((p) => ['negotiat', 'template', 'cover letter'].filter((w) => p.offerDescription.toLowerCase().includes(w) && !p.includes.join(' ').toLowerCase().includes(w)).map((w) => `${p.id}: ${w}`));
    check(!extra.length, `${s}: its Offers (JSON-LD) promise nothing its tickets do not show (no negotiation, templates or cover letter the page never names)`, extra.join(', '));
  }
}

// ── 9 · the build never overwrites a page it did not make ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-'));
  for (const d of ['cities', 'assets', 'css', 'js', 'design/pages-deco']) fs.mkdirSync(path.join(tmp, d), { recursive: true });
  for (const f of ['cities/_template.html', 'cities/_shared.json', 'cities/paris.json', 'assets/boom-city.css', 'assets/boom-city.js', 'assets/boom-onda.js',
    'css/boom-scroll.css', 'js/boom-scroll.js', 'js/boom-consent.js', 'js/boom-track.js', 'js/desk-calendar.js', 'design/pages-deco/solari-engine.html', 'og-paris.png']) fs.copyFileSync(path.join(R, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'paris.html'), '<!doctype html><title>hand-made</title>');
  check(throws(() => writeAll({ root: tmp }), /not generated by this script — refusing/) === true && fs.readFileSync(path.join(tmp, 'paris.html'), 'utf8').includes('hand-made'),
    'a root page without the GENERATED mark is never overwritten');
  fs.unlinkSync(path.join(tmp, 'paris.html'));
  const first = writeAll({ root: tmp });
  const again = writeAll({ root: tmp, check: true });
  check(first[0].stale === true && again[0].stale === false, 'write then --check: the build is deterministic');
  fs.appendFileSync(path.join(tmp, 'assets', 'boom-city.css'), '\n/* changed */\n');
  check(writeAll({ root: tmp, check: true })[0].stale === true, 'changing the shared CSS makes the page stale (hash in the URL)');
  fs.writeFileSync(path.join(tmp, 'js/desk-calendar.js'), 'var x = 1;');
  check(throws(() => writeAll({ root: tmp }), /is not the desk calendar/) === true, 'a file that is not the calendar cannot be inlined as the calendar');
  fs.copyFileSync(path.join(R, 'js/desk-calendar.js'), path.join(tmp, 'js/desk-calendar.js'));
  fs.writeFileSync(path.join(tmp, 'design/pages-deco/solari-engine.html'), '<style>.x{}</style><script>var y=1</script>');
  check(throws(() => writeAll({ root: tmp }), /is not the Solari engine fragment/) === true, 'a file that is not the engine cannot be inlined as the engine');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 10 · the source files never ship; the cards are real cards ───────────
{
  const ignore = read('.vercelignore').split('\n').map((l) => l.trim());
  check(['cities/', 'build-cities.mjs', 'BOOM_CITIES_BRIEF.md'].every((x) => ignore.includes(x)), '.vercelignore keeps the template, the build script and the internal brief off the site');
  for (const s of SLUGS) {
    const og = fs.readFileSync(path.join(R, `og-${s}.png`));
    const isPng = og.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    check(isPng && og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630 && og.length <= 120 * 1024, `og-${s}.png is a real 1200×630 PNG in the social-card budget (${Math.round(og.length / 1024)} KB ≤ 120)`);
  }
  const gen = read('design/pages-deco/genera-og-cities.py');
  check(!/\['nav'\]|\['glance'\]|\['machine'\]|h1Em/.test(gen), 'the card generator reads no key the JSON lost (it silently stopped running once: the cards kept promises the pages had dropped)');
  check(/'tenant side · flat fees · viewing attended · contract checked'/.test(gen) && /'tenant side · flat fees · your file open today'/.test(gen), 'the card\'s proof line follows the mode: a waitlist card never says "viewing attended"');
}

// ── 10b · the companions: Terms §12, the withdrawal form, privacy, caching ──
{
  const between = (h, a, b) => { const i = h.indexOf(a); const j = i < 0 ? -1 : h.indexOf(b, i + a.length); return i < 0 || j < 0 ? '' : h.slice(i, j); };
  const terms = read('terms.html');
  const sec = between(terms, '<h2 id="city-desks">', '</div>');
  check(sec && /Full Search €500, Application Pack €199, Attended Viewing €149 per viewing/.test(sec) && sec.includes(shared.refund.rule) && /14 days/.test(sec) && /\/withdrawal/.test(sec) && /not for a result/.test(sec) && /courts/.test(sec),
    'terms §12 states the desk fees (= CITY_PLANS), the refund rule word for word, the withdrawal (linked) and the consumer\'s own law and courts');
  const selling = SLUGS.filter((x) => CITY[x].live === true && CITY[x].checkout === true).map((x) => CITY[x].city).sort();
  const closed = SLUGS.filter((x) => !(CITY[x].live === true && CITY[x].checkout === true)).map((x) => CITY[x].city).sort();
  const head = (sec.match(/<h2 id="city-desks">([^<]*)</) || [])[1] || '';
  const named = (txt) => (txt.match(/([A-Z][a-z]+)(?=,| and | desks)/g) || []).filter((w) => SLUGS.some((x) => CITY[x].city === w)).sort();
  const notOpenT = (sec.match(/The ([^.]*?) desks are not open/) || [])[1] || '';
  const notOpenL = (read('llms.txt').match(/([A-Z][a-z]+(?:,? (?:and )?[A-Z][a-z]+)*) desks are not open/) || [])[1] || '';
  check(selling.every((n) => head.includes(n) && sec.includes(`BOOM ${n}`)) && JSON.stringify(named(notOpenT + ' desks')) === JSON.stringify(closed) && JSON.stringify(named(notOpenL + ' desks')) === JSON.stringify(closed),
    `terms §12 names every desk that sells (${selling.join(', ')}); the "not open" sentence, in the terms and in llms.txt, lists exactly ${closed.join(', ')}`);
  check(/Each service is optional: you choose it in writing/.test(sec) && /The first call is free/.test(sec) && /runs until you sign a lease or tell us to stop/.test(sec) && /Barcelona desk[^.]*Catalan or Spanish/.test(sec) && /fulls oficials/.test(sec),
    'terms §12: optional and chosen in writing, the free first call, Full Search until you sign or stop, Barcelona\'s Catalan documents and complaint forms');
  check(!/only if you ask us to at checkout/.test(sec) && /“Start now” tick at checkout, or later in writing/.test(sec) && !/bank transfer/i.test(sec), 'terms §12: early start by the tick OR later in writing; payment by card, no bank-transfer route');
  const wd = read('withdrawal.html');
  check(selling.every((n) => wd.includes(`<option value="${n}">${n}</option>`)), 'the model withdrawal form offers every desk that sells (/withdrawal)');
  const sm = read('sitemap.xml'), MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (const [f, u] of [['terms.html', '/terms'], ['privacy.html', '/privacy']]) {
    const m = read(f).match(/Last Updated:?\s*(?:<\/strong>)?\s*(\d{1,2}) (\w+) (\d{4})/);
    const iso = m ? `${m[3]}-${String(MON.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
    const lm = (sm.match(new RegExp(`<loc>https://www\\.boomrome\\.com${u}</loc>\\s*<lastmod>([\\d-]+)</lastmod>`)) || [])[1];
    check(iso && lm === iso, `${u}: the sitemap <lastmod> is the page's own "Last Updated" date`, `${iso} vs ${lm}`);
  }
  const pv = read('privacy.html');
  check(!/AWS|SendGrid/.test(pv) && /Firebase/.test(pv) && /Vercel/.test(pv) && /Telegram/.test(pv) && /Anthropic/.test(pv) && /EmailJS/.test(pv) && /City desks \(Amsterdam, Barcelona, London, Madrid, Milan\)/.test(pv),
    'the privacy policy names the real processors and what a city request is used for');
  const cityLine = (pv.match(/<li><strong>City desks[\s\S]*?<\/li>/) || [''])[0];
  check(cityLine && !/Check-in|list of papers/i.test(cityLine) && /name/i.test(cityLine) && /service you were looking at/.test(cityLine),
    'privacy describes what the v1.5 door sends (a name, one contact, the service being read) — never the retired Check-in', cityLine.replace(/<[^>]+>/g, '').slice(0, 200));
  const vj = JSON.parse(read('vercel.json'));
  // what Vercel would send for a path: every rule whose source matches applies,
  // and for one header the LAST match wins (the sources are regex-shaped here)
  const ccOf = (p) => (vj.headers || []).filter((h) => new RegExp(`^${h.source}$`).test(p))
    .reduce((v, h) => { const x = h.headers.find((k) => k.key.toLowerCase() === 'cache-control'); return x ? x.value : v; }, null);
  // every content-hashed URL a desk page asks for (?v=), the onda's config URL included —
  // read from the built pages, never from a list kept by hand (the v1.6 review: the onda
  // was hashed and never immutable, while a check found the rule by its old exact string)
  const hashed = [...new Set(SLUGS.flatMap((s) => [...PAGE[s].matchAll(/(?:https:\/\/www\.boomrome\.com)?(\/[A-Za-z0-9_./-]+)\?v=[0-9a-f]{6,}/g)].map((m) => m[1])))].sort();
  const mutable = hashed.filter((p) => !/immutable/.test(ccOf(p) || ''));
  check(['/assets/boom-city.css', '/assets/boom-city.js', '/assets/boom-onda.js'].every((p) => hashed.includes(p)) && mutable.length === 0,
    `every content-hashed asset a desk asks for is served immutable (${hashed.join(', ')})`, `not immutable: ${mutable.map((p) => `${p} → ${ccOf(p)}`).join('; ')}`);
  const unhashed = [...new Set(SLUGS.flatMap((s) => [...PAGE[s].matchAll(/(?:src|href)="(\/(?:js|css)\/[^"?#]+)"/g)].map((m) => m[1])))].concat(['/js/desk-calendar.js', '/css/boom-2026.css']);
  check(!(vj.headers || []).some((h) => /^\/(css|js)\//.test(h.source) && h.headers.some((x) => /immutable/.test(x.value))) && unhashed.every((p) => !/immutable/.test(ccOf(p) || '')),
    `the unhashed shared files (${unhashed.join(', ')}) are never immutable — the desk calendar\'s file included`);
}

// ── 11 · the visible-at-load reader is honest ─────────────────────────────
{
  const sample = '<body><p>one two</p><details><summary>three</summary><p>hidden words here</p></details><div hidden><p>gone</p><div>gone too</div></div><span class="sr">sr</span><dialog>d</dialog><p>four</p></body>';
  check(words(visibleAtLoad(sample)) === 4, 'visibleAtLoad: a closed <details> counts its summary, a hidden node takes its children, .sr and a dialog are out');
  check(words(visibleAtLoad('<body><details open><summary>a</summary><p>b c</p></details></body>')) === 3, 'an open <details> counts whole');
}

// ── 12 · the door on the server: a tenant in the right MARKET ─────────────
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
  // the file number is random ("BM 3RD5H"): one ending in digit + H read as
  // "5 h" and failed ~1 run in 100. The response-time rule reads the reply
  // WITHOUT the file number; the number itself is checked on the line above.
  const NO_PROMISE = /this week|budget|who's moving|when do you land|set up the search|come back today|Thanks for your message|\d+\s*(hours?|minutes?|h\b)/i;
  const senzaFile = (txt, file) => txt.split(file).join(' ');
  const replyNoFile = senzaFile(reply, l.city.file);
  check(reply.includes(`You asked for a free call about your move to Amsterdam (your file ${l.city.file}).`) && /By phone or WhatsApp — which day and time suit you\?/.test(reply)
    && !NO_PROMISE.test(replyNoFile),
    'a selling desk\'s ready reply offers the free call (phone or WhatsApp, the day and time theirs — never "this week"), names the file number, and carries no written questionnaire', reply);
  {
    // the flake, pinned: a file number ending in digit + H is not a response time,
    // and a real response time in the same reply is still caught
    const conCodice = reply.split(l.city.file).join('BM 3RD5H');
    check(NO_PROMISE.test(conCodice) && !NO_PROMISE.test(senzaFile(conCodice, 'BM 3RD5H'))
      && NO_PROMISE.test(senzaFile(conCodice + ' I reply within 5 hours.', 'BM 3RD5H')),
      'a file number like "BM 3RD5H" is not read as "5 h"; "within 5 hours" in the reply still is');
  }
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
  // the page posts the number AS TYPED (v1.5 review: stripping the non-digits
  // made "+31 (0)6 …" into +310612345678, a number that does not exist)
  const typed = await call({ city: 'amsterdam', name: 'Daan', phone: '+31 (0)6 1234 5678' });
  check(typed.code === 200 && typed.lead && typed.lead.phone === '+31612345678' && typed.lead.raw.phone === '+31 (0)6 1234 5678', 'a Dutch number typed "+31 (0)6 1234 5678" is stored +31612345678, the typed value kept on raw', typed.lead && typed.lead.phone);
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

// ── 12b · the Rome machine never speaks to a city client ───────────────────
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


// ── London (GBP) and Milan (02/11/2026): the currency the page prints is
// the one Stripe charges, the phones of the desk's country, the aliases ──
{
  const lon = PAGE.london, mil = PAGE.milan;
  check(money(500, 'GBP') === '£500' && money(1500, 'GBP') === '£1,500' && eur(500) === '€500' && currencyOf('london') === 'GBP' && currencyOf('milan') === 'EUR' && currencyOf('amsterdam') === 'EUR',
    'money(): £ for London, € everywhere else (currencyOf reads api/_market.js)');
  const offers = [...lon.matchAll(/"priceCurrency":\s*"([A-Z]{3})"/g)].map((m) => m[1]);
  const offersM = [...mil.matchAll(/"priceCurrency":\s*"([A-Z]{3})"/g)].map((m) => m[1]);
  check(offers.length >= 6 && offers.every((c) => c === 'GBP') && offersM.length >= 6 && offersM.every((c) => c === 'EUR'),
    `London's Offers and price specifications say GBP, Milan's EUR (${offers.join()} / ${offersM.join()})`);
  check(['£500', '£199', '£149'].every((x) => visibleText(lon).includes(x)) && !/€\s?\d/.test(visibleText(lon)) && !/£\s?\d/.test(visibleText(mil)),
    'London prints its three fares in £ and never a € price; Milan never a £ one');
  check(feesRowOf(CITY.london, shared).startsWith('<b>Full Search £500</b> · <b>Application Pack £199</b> · <b>Attended Viewing £149</b> per viewing.'),
    'the London fees row is derived in £');
  check(/"CURRENCY":\s*"GBP"/.test(lon) && /"SYMBOL":\s*"£"/.test(lon) && /"CURRENCY":\s*"EUR"/.test(mil), 'the page config carries the currency the JS formats and reports to analytics');
  check(/Mon–Fri 08:00–18:00, London time/.test(visibleText(lon)) && /Mon–Fri 09:00–19:00, Italian time/.test(visibleText(mil)),
    'London shows its desk hours in London time; Milan says Italian time (desk.zoneName), never "Rome time"');
  const L = JSON.parse(JSON.stringify(CITY.london));
  const tryL = (mut) => { const c = JSON.parse(JSON.stringify(L)); mut(c); try { render(c); return ''; } catch (e) { return String(e.message || e); } };
  check(/a price the plans do not charge/.test(tryL((c) => { c.faq.items[0].a += ' An agent may ask for €500.'; })), 'a € price on the London page is refused (stray currency)');
  check(/a price the plans do not charge/.test(tryL((c) => { c.meta.description = c.meta.description.slice(0, 120) + ' From £129.'; })), 'a £ price no plan charges is refused on London');
  check(/stands without the refund rule/.test(tryL((c) => { c.pricing.plans[1].includes[0] = 'Upgrade to Full Search (£500)'; })), 'a £500 without the refund rule in its block is refused');
  check(/currency/.test(tryL((c) => { delete c.currency; })) && /currency/.test(tryL((c) => { c.currency = 'EUR'; })), 'London must declare GBP, the currency api/_market.js charges');
  check(tryL(() => {}) === '' && /more: £149 each/.test(tryL((c) => { c.pricing.plans[0].includes[2] = 'One attended viewing (more: €149 each)'; })), 'London renders as committed, and its Full Search line must say "(more: £149 each)"');
  const { cityPhone, cityFromText } = await import('../../api/_market.js');
  check(cityPhone('07700 900123', 'london') === '+447700900123' && cityPhone('020 7946 0018', 'london') === '+442079460018' && cityPhone('+44 (0)20 7946 0018', 'london') === '+442079460018'
    && cityPhone('+44 07700 900123', 'london') === '+447700900123' && cityPhone('333 1234567', 'london') === null
    && ['010 1234567', '011 1234567', '080 1234567', '081 1234567', '087 1234567'].every((x) => cityPhone(x, 'london') === null) && cityPhone('01632 960123', 'london') === '+441632960123',
    'London phones: UK national shapes become +44 (trunk 0 dropped); an Italian mobile typed without +39 is not a UK number');
  check(cityPhone('333 1234567', 'milan') === '+393331234567' && cityPhone('02 1234 5678', 'milan') === '+390212345678' && cityPhone('+39 02 1234 5678', 'milan') === '+390212345678' && cityPhone('+39 (0)2 1234 5678', 'milan') === '+390212345678' && cityPhone('+44 (0)20 7946 0018', 'milan') === '+442079460018',
    'Milan phones: Italian mobiles and landlines, the trunk 0 KEPT on landlines (+39 02 …)');
  check(cityFromText("Hi BOOM London, I'm moving to London.") === 'london' && cityFromText('Hi BOOM Milan') === 'milan' && cityFromText('Ciao BOOM Milano, mi trasferisco') === 'milan'
    && cityFromText('BOOM Londra') === 'london' && cityFromText('BOOM Milanese') === null,
    'the desk markers read back London/Londra and Milan/Milano, whole words only');
  // every live desk is linked from the six pages that carry the "Company & Markets" column and from the two builders
  const FOOT = ['index.html', 'apartments.html', 'try.html', 'your-money.html', 'how-it-works.html', 'apartment-detail.html', 'design/pages-deco/pt.html', 'design/pages-deco/patch-lotto2.py'];
  const liveSlugs = SLUGS.filter((sl) => CITY[sl].live);
  const missing = FOOT.flatMap((f) => liveSlugs.filter((sl) => !read(f).includes(`href="/${sl}"`) && !read(f).includes(`href="/${sl}.html"`)).map((sl) => `${f}:/${sl}`));
  check(!missing.length, `every live desk is linked in the Company & Markets footers and their builders (${missing.join(', ') || 'all'})`);
}


console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
